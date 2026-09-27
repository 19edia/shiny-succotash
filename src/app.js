import {staffDiscordRoutes} from './staff-discord.js';
import {createMemberRecord} from './member-store.js';
import {memberData,identityChanged,bothDivisions} from './identity.js';

import express from 'express';
import {normalizePrint} from './announcements.js';
import helmet from 'helmet';
import {rateLimit} from 'express-rate-limit';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {token,hash,passwordHash,passwordMatches,allowed,text,division,snowflake} from './security.js';
import {tx,audit,enqueue} from './db.js';
const publicDir=fileURLToPath(new URL('../public/',import.meta.url));
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
export function createApp(pool,config,bot){
 const app=express();app.disable('x-powered-by');if(config.production)app.set('trust proxy',1);
 app.use(helmet({contentSecurityPolicy:{directives:{'script-src':["'self'"],'style-src':["'self'"],'img-src':["'self'",'data:','blob:'],'connect-src':["'self'"],'form-action':["'self'"],'upgrade-insecure-requests':config.production?[]:null}}}));
 app.use('/api/announcements',express.json({limit:'3mb'}));
 app.use(express.json({limit:'24kb'}));
 app.use('/api',(_req,res,next)=>{res.set('Cache-Control','no-store');next();});
 app.use('/api',rateLimit({windowMs:60000,limit:180,standardHeaders:'draft-8',legacyHeaders:false,message:{error:'Muitas solicitações. Aguarde um minuto.'}}));
 app.use('/api',async(req,res,next)=>{
  if(!['GET','HEAD','OPTIONS'].includes(req.method)&&req.get('origin')!==config.origin)return res.status(403).json({error:'Origem não autorizada.'});
  const cookie=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('ifj_session='))?.slice(12);
  if(cookie && /^[a-f0-9]{64}$/.test(cookie)){
   const result=await pool.query('SELECT s.*,u.username,u.role,u.active,u.discord_id,u.discord_verified_at FROM sessions s JOIN staff u ON u.id=s.staff_id WHERE token_hash=$1 AND expires_at>now()',[hash(cookie,config.secret)]);
   if(result.rows[0]?.active)req.auth=result.rows[0];
  }
  next();
 });
 const auth=(req,res,next)=>req.auth?next():res.status(401).json({error:'Entre na sua conta.'});
 const permit=operation=>(req,res,next)=>allowed(req.auth.role,operation)?next():res.status(403).json({error:'Sua patente não permite esta ação.'});
 const csrf=(req,res,next)=>req.get('x-csrf-token')===req.auth.csrf?next():res.status(403).json({error:'Sessão inválida. Recarregue a página.'});
 const cookieOptions={httpOnly:true,secure:config.production,sameSite:'strict',path:'/',maxAge:8*3600000};
 let dummyHash;
 app.post('/api/auth/login',rateLimit({windowMs:15*60000,limit:10,standardHeaders:'draft-8',legacyHeaders:false,message:{error:'Muitas tentativas. Aguarde 15 minutos.'}}),async(req,res)=>{
  const username=text(req.body.username,'Usuário',64,3).toLowerCase();const password=text(req.body.password,'Senha',128);
  const user=(await pool.query('SELECT * FROM staff WHERE username=$1',[username])).rows[0];
  dummyHash ||= await passwordHash(token());
  const valid=await passwordMatches(password,user?.password_hash||dummyHash);
  if(!user?.active||!valid)throw fail('Usuário ou senha inválidos.',401);
  const value=token();await pool.query('INSERT INTO sessions(token_hash,staff_id,csrf,expires_at) VALUES($1,$2,$3,$4)',[hash(value,config.secret),user.id,token(),new Date(Date.now()+8*3600000)]);
  res.cookie('ifj_session',value,cookieOptions).json({authenticated:true});
 });
 app.get('/api/me',auth,(req,res)=>res.json({id:req.auth.staff_id,username:req.auth.username,role:req.auth.role,csrf:req.auth.csrf,discord_id:req.auth.discord_id,discord_verified:!!req.auth.discord_verified_at,needs_discord:req.auth.role!=='admin'&&!req.auth.discord_verified_at,divisions:config.divisions.map(d=>({id:d.id,name:d.name}))}));
 app.use('/api',auth);
 app.use('/api',(req,res,next)=>['GET','HEAD','OPTIONS'].includes(req.method)?next():csrf(req,res,next));
 app.post('/api/auth/logout',async(req,res)=>{await pool.query('DELETE FROM sessions WHERE token_hash=$1',[req.auth.token_hash]);res.clearCookie('ifj_session',{path:'/'}).json({ok:true});});
 app.post('/api/auth/password',async(req,res)=>{
  const current=text(req.body.current,'Senha atual',128);const next=text(req.body.password,'Nova senha',128,12);
  const user=(await pool.query('SELECT password_hash FROM staff WHERE id=$1',[req.auth.staff_id])).rows[0];
  if(!await passwordMatches(current,user.password_hash))throw fail('Senha atual incorreta.',403);
  await tx(pool,async c=>{await c.query('UPDATE staff SET password_hash=$1 WHERE id=$2',[await passwordHash(next),req.auth.staff_id]);await c.query('DELETE FROM sessions WHERE staff_id=$1',[req.auth.staff_id]);});
  res.clearCookie('ifj_session',{path:'/'}).json({ok:true});
 });
 staffDiscordRoutes(app,pool,config,bot);
 app.use('/api',(req,res,next)=>req.auth.role!=='admin'&&!req.auth.discord_verified_at?res.status(403).json({error:'Vincule e confirme seu Discord para acessar o painel.',code:'DISCORD_LINK_REQUIRED'}):next());
 const owns=(req,m)=>req.auth.role==='admin'||m.created_by===req.auth.staff_id;
 app.get('/api/members',permit('createIFJ'),async(req,res)=>{
  const values=[];let where='';
  if(req.auth.role!=='admin'){values.push(req.auth.staff_id);where=' WHERE created_by=$1';}
  res.json((await pool.query('SELECT * FROM members'+where+' ORDER BY created_at DESC LIMIT 1000',values)).rows.map(m=>({...m,access_both:bothDivisions(m)})));
 });
 app.post('/api/members',permit('createIFJ'),async(req,res)=>{
  if(req.auth.role==='recrutador'&&req.body.member_rank!==undefined)throw fail('Somente administradores e moderadores configuram a patente do membro.',403);
  const b=memberData(req.body);
  const member=await tx(pool,c=>createMemberRecord(c,b,req.auth.staff_id));res.status(201).json(member);
 });
 app.patch('/api/members/:id',permit('editIFJ'),async(req,res)=>{
  const result=await tx(pool,async c=>{
   const old=(await c.query('SELECT * FROM members WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];if(!old||!owns(req,old))throw fail('IFJ não encontrado.',404);
   if(req.auth.role==='recrutador'&&req.body.member_rank!==undefined)throw fail('Somente administradores e moderadores configuram a patente do membro.',403);
   if(!Number.isInteger(req.body.identity_version)||req.body.identity_version!==old.identity_version)throw fail('O cadastro foi atualizado. Recarregue os dados antes de editar.',409);
   const input={...old,...req.body};if(req.auth.role==='recrutador'&&input.account_kind!==old.account_kind)input.member_rank=input.account_kind==='aliado'?'Aliado':'Membro';
   const b=memberData(input);const reset=identityChanged(old,b)||bothDivisions(old)!==bothDivisions(b);
   const m=(await c.query('UPDATE members SET name=$1,game_nick=$2,roblox_username=$3,discord_username=CASE WHEN discord_id<>$4 THEN NULL ELSE discord_username END,discord_id=$4,division=$5,account_kind=$6,allied_gang=$7,member_rank=$8,verified=$9,auto_allied=CASE WHEN $11 THEN FALSE ELSE auto_allied END,identity_version=identity_version+1,updated_at=now() WHERE id=$10 RETURNING *',[b.name,b.game_nick,b.roblox_username,b.discord_id,b.division,b.account_kind,b.allied_gang,b.member_rank,reset?false:old.verified,old.id,reset])).rows[0];
   await c.query('DELETE FROM confirmations WHERE member_id=$1',[old.id]);
   if(reset||old.member_rank!==b.member_rank)for(const discordId of new Set([old.discord_id,b.discord_id]))await enqueue(c,'sync-role',{discordId});
   await audit(c,req.auth.staff_id,'Cadastro IFJ atualizado',{memberId:old.id,version:m.identity_version,verificationReset:reset});
   return {member:m,message:reset?'Cadastro atualizado. Verificação reiniciada; retirada dos cargos na fila. O membro deve verificar novamente.':'Patente atualizada. Gere uma nova carteira PNG.'};
  });res.json(result);
 });
 app.get('/api/members/:id/card.png',permit('issueCard'),rateLimit({windowMs:60000,limit:20,message:{error:'Aguarde um minuto para gerar mais carteiras.'}}),async(req,res)=>{
  const m=(await pool.query('SELECT * FROM members WHERE id=$1',[req.params.id])).rows[0];if(!m||!owns(req,m))throw fail('IFJ não encontrado.',404);
  const buffer=await (await import('./cards.js')).renderCard(m,config.divisions.find(d=>d.id===m.division)?.name||`${m.division}ª divisão`);
  res.set('Content-Type','image/png').set('Content-Disposition',`attachment; filename="ROKUHARA-${m.account_kind}-${m.ifj}-v${m.identity_version}.png"`).send(buffer);
 });
 app.delete('/api/members/:id',permit('deleteIFJ'),async(req,res)=>{
  const reason=text(req.body.reason,'Motivo',1000);const announce=req.body.announce===true;
  if(announce&&!allowed(req.auth.role,'admin'))throw fail('Somente administradores podem anunciar cancelamentos.',403);
  await tx(pool,async c=>{
   const member=(await c.query('SELECT * FROM members WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];if(!member||!owns(req,member))throw fail('IFJ não encontrado.',404);
   await c.query('DELETE FROM members WHERE id=$1',[member.id]);
   await enqueue(c,'sync-role',{discordId:member.discord_id});
   if(announce)await enqueue(c,'announcement',{division:member.division,title:'IFJ CANCELADO',nick:member.game_nick||member.name,reason,description:'Identificação cancelada pela administração.'});
   await audit(c,req.auth.staff_id,'IFJ excluído',{memberId:member.id,nick:member.game_nick||member.name,reason});
  });res.json({ok:true,message:'IFJ excluído. Remoção de acesso colocada na fila do bot.'});
 });
 app.get('/api/staff',permit('admin'),async(req,res)=>res.json((await pool.query('SELECT id,username,role,active,discord_id,discord_verified_at,created_at FROM staff ORDER BY id')).rows));
 app.post('/api/staff',permit('admin'),async(req,res)=>{
  const username=text(req.body.username,'Usuário',64,3).toLowerCase();if(!/^[a-z0-9_.-]+$/.test(username))throw fail('Usuário: use letras, números, ponto, hífen ou sublinhado.');
  if(!['admin','moderador','recrutador'].includes(req.body.role))throw fail('Patente inválida.');
  const p=await passwordHash(text(req.body.password,'Senha',128,12));
  const user=await tx(pool,async c=>{const r=await c.query('INSERT INTO staff(username,password_hash,role) VALUES($1,$2,$3) RETURNING id,username,role,active',[username,p,req.body.role]);await audit(c,req.auth.staff_id,'Login criado',{staffId:r.rows[0].id,role:req.body.role});return r.rows[0];});res.status(201).json(user);
 });
 app.patch('/api/staff/:id',permit('admin'),async(req,res)=>{
  const id=Number(req.params.id);if(id===req.auth.staff_id)throw fail('Use Minha conta para alterar sua senha. Sua própria patente não pode ser alterada aqui.');
  const role=req.body.role;if(!['admin','moderador','recrutador'].includes(role)||typeof req.body.active!=='boolean')throw fail('Informe patente e situação válidas.');
  await tx(pool,async c=>{
   await c.query('LOCK TABLE staff IN SHARE ROW EXCLUSIVE MODE');
   const actor=(await c.query('SELECT role,active FROM staff WHERE id=$1',[req.auth.staff_id])).rows[0];
   if(!actor?.active||actor.role!=='admin')throw fail('Sua permissão foi alterada. Entre novamente.',403);
   const target=(await c.query('SELECT role,active FROM staff WHERE id=$1',[id])).rows[0];
   if(!target)throw fail('Login não encontrado.',404);
   if(target.role==='admin'&&target.active&&(role!=='admin'||!req.body.active)){
    const total=(await c.query("SELECT count(*) AS total FROM staff WHERE role='admin' AND active=TRUE")).rows[0];
    if(Number(total.total)<=1)throw fail('Mantenha pelo menos um administrador ativo.');
   }
   const u=await c.query('UPDATE staff SET role=$1,active=$2 WHERE id=$3 RETURNING id',[role,req.body.active,id]);if(!u.rowCount)throw fail('Login não encontrado.',404);
   if(req.body.password)await c.query('UPDATE staff SET password_hash=$1 WHERE id=$2',[await passwordHash(text(req.body.password,'Senha',128,12)),id]);
   await c.query('DELETE FROM sessions WHERE staff_id=$1',[id]);await audit(c,req.auth.staff_id,'Login atualizado',{staffId:id,role,active:req.body.active});
  });res.json({ok:true});
 });
 app.post('/api/announcements',permit('admin'),async(req,res)=>{
  const payload={title:'VIVO OU MORTO',name:text(req.body.name,'Nome da pessoa procurada',100),nick:text(req.body.nick,'Nick no jogo',64),reason:text(req.body.reason,'Motivo',1000),description:text(req.body.description,'Descrição',2000),image:await normalizePrint(req.body.image)};
  const ids=await tx(pool,async c=>{const ids=[];for(const d of config.divisions)ids.push(await enqueue(c,'announcement',{...payload,division:d.id}));await audit(c,req.auth.staff_id,'Caçado anunciado',{jobIds:ids,name:payload.name});return ids;});
  res.status(202).json({ok:true,id:ids[0],ids,message:'Anúncio na fila das duas divisões.'});
 });
 app.post('/api/wars',permit('admin'),async(req,res)=>{
  const gang=text(req.body.gang,'Gang rival',100),reason=text(req.body.reason,'Motivo da guerra',1000);
  const ids=await tx(pool,async c=>{const ids=[];for(const d of config.divisions)ids.push(await enqueue(c,'war',{division:d.id,gang,reason}));await audit(c,req.auth.staff_id,'Guerra declarada',{gang,jobIds:ids});return ids;});
  res.status(202).json({ok:true,ids});
 });
 app.get('/api/reports',permit('admin'),async(req,res)=>res.json((await pool.query(`SELECT r.*,m.ifj,m.game_nick,m.roblox_username,m.discord_id,j.status AS notification_status,j.error AS notification_error,
  t.status AS tribunal_status,t.guild_id AS tribunal_guild_id,t.channel_id AS tribunal_channel_id,t.division AS tribunal_division,
  tj.id AS tribunal_job_id,tj.status AS tribunal_job_status,tj.error AS tribunal_error
  FROM reports r LEFT JOIN members m ON m.id=r.member_id LEFT JOIN jobs j ON j.id=r.notification_job_id
  LEFT JOIN tribunals t ON t.report_id=r.id LEFT JOIN jobs tj ON tj.id=COALESCE(t.close_job_id,t.create_job_id)
  ORDER BY r.created_at DESC,r.id DESC LIMIT 1000`)).rows));
 app.post('/api/reports/:id/tribunal',permit('admin'),async(req,res)=>{
  const tribunal=await bot.openTribunal(Number(req.params.id),req.auth.staff_id,req.body.division);
  res.status(tribunal.reused?200:202).json({ok:true,tribunal,message:tribunal.reused?'Esta denúncia já tem um tribunal.':'Tribunal na fila de criação. Os envolvidos receberão o link no privado.'});
 });
 app.post('/api/reports/:id/resolve',permit('admin'),async(req,res)=>{
  await tx(pool,async c=>{
   const report=(await c.query('SELECT * FROM reports WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];if(!report)throw fail('Denúncia não encontrada.',404);if(report.status!=='pendente')throw fail('Essa denúncia já foi resolvida.',409);
   if(report.member_id)await c.query('SELECT id FROM members WHERE id=$1 FOR UPDATE',[report.member_id]);
   await c.query("UPDATE reports SET status='resolvida',resolution=$1,reviewed_by=$2 WHERE id=$3",[text(req.body.resolution,'Resultado da análise',2000),req.auth.staff_id,report.id]);
   if(report.member_id)await c.query("UPDATE members SET suspect=EXISTS(SELECT 1 FROM reports WHERE member_id=$1 AND status='pendente') WHERE id=$1",[report.member_id]);
   const jobId=await enqueue(c,'report-resolution',{reportId:report.id});await c.query('UPDATE reports SET notification_job_id=$1 WHERE id=$2',[jobId,report.id]);
   const tribunal=(await c.query('SELECT * FROM tribunals WHERE report_id=$1 FOR UPDATE',[report.id])).rows[0];
   if(tribunal&&tribunal.status!=='closed'){
    const closeId=await enqueue(c,'tribunal-close',{reportId:report.id});
    await c.query("UPDATE tribunals SET status='closing',close_job_id=$1 WHERE report_id=$2",[closeId,report.id]);
   }
   await audit(c,req.auth.staff_id,'Denúncia analisada',{reportId:report.id});
  });res.json({ok:true});
 });
 app.get('/api/immigrations',permit('admin'),async(req,res)=>res.json((await pool.query('SELECT i.*,m.ifj,j.status AS notification_status,j.error AS notification_error FROM immigrations i LEFT JOIN members m ON m.id=i.member_id LEFT JOIN jobs j ON j.id=i.notification_job_id ORDER BY i.created_at DESC,i.id DESC LIMIT 1000')).rows));
 for(const decision of ['approve','reject'])app.post(`/api/immigrations/:id/${decision}`,permit('admin'),async(req,res)=>{
  const result=await tx(pool,async c=>{
   const r=(await c.query('SELECT * FROM immigrations WHERE id=$1 FOR UPDATE',[req.params.id])).rows[0];
   if(!r)throw fail('Pedido não encontrado.',404);if(r.status!=='pendente')throw fail('Esse pedido já foi analisado.',409);
   let member=null,reason=null;
   if(decision==='approve'){
    if(req.body.discord_id!==undefined&&req.body.discord_id!==r.discord_id)throw fail('O Discord do solicitante não pode ser trocado.');
    const data=memberData({...req.body,discord_id:r.discord_id});
    member=await createMemberRecord(c,data,req.auth.staff_id);
   }else reason=text(req.body.reason,'Motivo da recusa',1800);
   const jobId=await enqueue(c,'immigration-decision',{requestId:r.id});
   await c.query('UPDATE immigrations SET status=$1,reason=$2,reviewed_by=$3,member_id=$4,notification_job_id=$5,decided_at=now() WHERE id=$6',[decision==='approve'?'aprovada':'recusada',reason,req.auth.staff_id,member?.id||null,jobId,r.id]);
   await audit(c,req.auth.staff_id,decision==='approve'?'Imigração aprovada':'Imigração recusada',{requestId:r.id,memberId:member?.id||null});
   return {ok:true,member,message:'Decisão registrada. Mensagem privada na fila de envio.'};
  });res.json(result);
 });
 app.get('/api/tickets',permit('admin'),async(req,res)=>res.json((await pool.query('SELECT * FROM tickets ORDER BY created_at DESC LIMIT 500')).rows));
 app.post('/api/tickets/:id/close',permit('admin'),async(req,res)=>{await bot.closeTicket(Number(req.params.id),`painel:${req.auth.staff_id}`);res.json({ok:true});});
 app.get('/api/ally-imports',permit('admin'),async(req,res)=>res.json((await pool.query('SELECT a.*,m.ifj,m.auto_allied,m.verified,j.status AS notification_status,j.error AS notification_error FROM ally_imports a LEFT JOIN members m ON m.id=a.member_id LEFT JOIN jobs j ON j.id=a.notification_job_id ORDER BY a.id DESC LIMIT 1000')).rows));
 app.get('/api/warnings',permit('warn'),async(req,res)=>{
  const values=[],where=req.auth.role==='admin'?'':(values.push(req.auth.discord_id),' WHERE w.actor_id=$1');
  res.json((await pool.query('SELECT w.*,j.status AS notification_status,j.error AS notification_error FROM warnings w LEFT JOIN jobs j ON j.id=w.notification_job_id'+where+' ORDER BY w.created_at DESC,w.id DESC LIMIT 1000',values)).rows);
 });
 app.get('/api/operations',permit('admin'),async(req,res)=>res.json({ready:bot.ready(),jobs:(await pool.query("SELECT id,kind,payload - 'image' AS payload,status,attempts,error,created_at,next_at,message_id FROM jobs ORDER BY id DESC LIMIT 100")).rows,audit:(await pool.query('SELECT * FROM audit ORDER BY id DESC LIMIT 100')).rows}));
 app.post('/api/jobs/:id/retry',permit('admin'),async(req,res)=>{await pool.query("UPDATE jobs SET status='pending',attempts=0,next_at=now(),error=NULL WHERE id=$1 AND status='failed'",[req.params.id]);res.json({ok:true});});
 app.post('/api/bot/setup',permit('admin'),async(req,res)=>{if(!bot.ready())throw fail('Bot desconectado. Verifique as variáveis e os logs no Render.',503);await bot.setup();await audit(pool,req.auth.staff_id,'Painéis Discord publicados');res.json({ok:true});});
 app.use('/api',(_req,res)=>res.status(404).json({error:'Rota não encontrada.'}));
 app.get('/ready',async(_req,res)=>{res.set('Cache-Control','no-store');try{if(!config.botEnabled||!bot.ready())return res.status(503).json({status:'unavailable'});await pool.query('SELECT 1');res.json({status:'ready'});}catch{res.status(503).json({status:'unavailable'});}});
 app.get('/health',async(_req,res)=>{try{await pool.query('SELECT 1');res.json({ok:true});}catch{res.status(503).json({ok:false});}});
 app.get('/painel',(_req,res)=>res.sendFile(path.join(publicDir,'panel.html')));
 app.use(express.static(publicDir,{index:'index.html'}));
 app.use((err,_req,res,_next)=>{const status=err.status||(['23505','23503','22P02'].includes(err.code)?400:500);if(status===500)console.error('Erro da API:',err.code||err.name);res.status(status).json({error:err.code==='23505'?'Já existe cadastro com esse usuário Roblox, Discord ou login.':status===500?'Erro interno. Consulte os logs e tente novamente.':err.message});});
 return app;
}
