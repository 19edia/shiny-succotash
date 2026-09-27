import {randomInt,timingSafeEqual} from 'node:crypto';
import {tx,audit} from './db.js';
import {hash,snowflake} from './security.js';
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
export function staffDiscordRoutes(app,pool,config,bot){
 app.post('/api/auth/discord/start',async(req,res)=>{
  const discordId=snowflake(req.body.discord_id);
  if(!bot.ready()||!bot.sendStaffLinkCode)throw fail('Bot desconectado. Peça à administração para conectar o bot e tente novamente.',503);
  await tx(pool,async c=>{
   const user=(await c.query('SELECT id,username,active FROM staff WHERE id=$1 FOR UPDATE',[req.auth.staff_id])).rows[0];
   if(!user?.active)throw fail('Conta desativada.',403);
   const prior=(await c.query('SELECT created_at FROM staff_discord_challenges WHERE staff_id=$1',[user.id])).rows[0];
   if(prior&&Date.now()-new Date(prior.created_at).getTime()<60000)throw fail('Aguarde um minuto antes de solicitar outro código.',429);
   if((await c.query('SELECT id FROM staff WHERE discord_id=$1 AND id<>$2',[discordId,user.id])).rows.length)throw fail('Esse Discord já está vinculado a outro login.',409);
   const code=String(randomInt(100000,1000000));
   await c.query('INSERT INTO staff_discord_challenges(staff_id,discord_id,code_hash,expires_at) VALUES($1,$2,$3,$4) ON CONFLICT(staff_id) DO UPDATE SET discord_id=$2,code_hash=$3,expires_at=$4,attempts=0,created_at=now()',[user.id,discordId,hash(`${user.id}:${discordId}:${code}`,config.secret),new Date(Date.now()+10*60000)]);
   try{await bot.sendStaffLinkCode(discordId,code,user.username);}catch{throw fail('Não foi possível enviar o código. Confira o ID, participe de uma divisão e permita mensagens privadas do bot.',400);}
  });res.json({ok:true,message:`Código enviado no privado do Discord ${discordId}. Ele vale por 10 minutos.`});
 });
 app.post('/api/auth/discord/confirm',async(req,res)=>{
  if(typeof req.body.code!=='string'||!/^\d{6}$/.test(req.body.code))throw fail('Informe o código de seis números enviado no privado.');
  const result=await tx(pool,async c=>{
   const user=(await c.query('SELECT id,active FROM staff WHERE id=$1 FOR UPDATE',[req.auth.staff_id])).rows[0];
   if(!user?.active)return {error:'Conta desativada.',status:403};
   const challenge=(await c.query('SELECT * FROM staff_discord_challenges WHERE staff_id=$1 FOR UPDATE',[user.id])).rows[0];
   if(!challenge||new Date(challenge.expires_at).getTime()<=Date.now()||challenge.attempts>=5)return {error:'Código expirado ou bloqueado. Solicite outro código.',status:400};
   const expected=hash(`${user.id}:${challenge.discord_id}:${req.body.code}`,config.secret);
   if(!timingSafeEqual(Buffer.from(expected),Buffer.from(challenge.code_hash))){await c.query('UPDATE staff_discord_challenges SET attempts=attempts+1 WHERE staff_id=$1',[user.id]);return {error:'Código incorreto. Confira a mensagem privada do bot.',status:400};}
   if((await c.query('SELECT id FROM staff WHERE discord_id=$1 AND id<>$2',[challenge.discord_id,user.id])).rows.length)return {error:'Esse Discord já está vinculado a outro login.',status:409};
   await c.query('UPDATE staff SET discord_id=$1,discord_verified_at=now() WHERE id=$2',[challenge.discord_id,user.id]);
   await c.query('DELETE FROM staff_discord_challenges WHERE staff_id=$1',[user.id]);
   await audit(c,user.id,'Discord da equipe confirmado',{discordId:challenge.discord_id});
   return {ok:true};
  });if(result.error)return res.status(result.status).json({error:result.error});res.json(result);
 });
}
