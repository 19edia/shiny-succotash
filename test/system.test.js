import {ROLE_ENV} from '../src/config-rules.js';
import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {Collection} from 'discord.js';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {createApp} from '../src/app.js';
import {createBot} from '../src/bot.js';
import {passwordHash,passwordMatches,generateIFJ} from '../src/security.js';
let db,pool,app,admin,recruiter,moderator,csrfA,csrfR,csrfM,bot;
const origin='http://localhost:3000';
const config={origin,production:false,secret:'a'.repeat(48),botEnabled:false,divisions:[{id:1,name:'Primeira',guild:'11111111111111111',memberRole:'11111111111111112',adminRole:'11111111111111113'},{id:2,name:'Segunda',guild:'22222222222222222',memberRole:'22222222222222223',adminRole:'22222222222222224'}]};
for(const d of config.divisions)d.rankRoles=Object.fromEntries(Object.keys(ROLE_ENV).map((key,i)=>[key,String(BigInt(d.guild)+100n+BigInt(i))]));
// Existing access tests track only the access role; the role-policy suite checks all managed roles.
function accessGuild(guildId,added,removed,includeRole=false){const d=config.divisions.find(x=>x.guild===guildId);return {id:guildId,roles:{fetch:async()=>new Map([d.memberRole,d.adminRole,...Object.values(d.rankRoles)].map(id=>[id,{id,permissions:{has:()=>false}}]))},members:{fetchMe:async()=>({roles:{highest:{comparePositionTo:()=>1}}}),fetch:async value=>{const userId=typeof value==='string'?value:value.user;return {roles:{add:async role=>{if(role===d.memberRole)added.push(includeRole?[guildId,userId,role]:[guildId,userId]);},remove:async role=>{if(role===d.memberRole)removed.push(includeRole?[guildId,userId,role]:[guildId,userId]);}}};}}};}
const body={name:'Pessoa Teste',game_nick:'Soldado',roblox_username:'SoldadoTeste',discord_id:'33333333333333333',division:1};
const send=(agent,method,url,csrf,data)=>agent[method](url).set('Origin',origin).set('X-CSRF-Token',csrf).send(data);
async function login(name){const a=request.agent(app);await a.post('/api/auth/login').set('Origin',origin).send({username:name,password:'senha-teste-segura'}).expect(200);return [a,(await a.get('/api/me').expect(200)).body.csrf];}
function interaction(custom,fields={},user=body.discord_id,guild=config.divisions[0].guild,isModal=false){return {customId:custom,guildId:guild,user:{id:user},guild:{id:guild},isButton:()=>!isModal,isModalSubmit:()=>isModal,fields:{getTextInputValue:k=>fields[k]},deferReply:async function(v){this.deferred=v;},editReply:async function(v){this.result=v;},reply:async function(v){this.result=v;},showModal:async function(v){this.result=v;}};}
before(async()=>{
 db=new PGlite();await db.exec(await readFile(new URL('../src/schema.sql',import.meta.url),'utf8'));
 pool={query:async(sql,args)=>{if(!args&&sql.startsWith('CREATE TABLE')){await db.exec(sql);return {rows:[],rowCount:0};}const r=await db.query(sql,args);return {...r,rowCount:r.affectedRows||r.rows.length};},connect:async()=>({...pool,release(){}})};
 for(const [name,role]of [['admin','admin'],['recruta','recrutador'],['moderador','moderador']])await pool.query('INSERT INTO staff(username,password_hash,role) VALUES($1,$2,$3)',[name,await passwordHash('senha-teste-segura'),role]);
 await pool.query("UPDATE staff SET discord_id=('70000000000000000'::bigint+id)::text,discord_verified_at=now()");
 bot=createBot(pool,config);bot.client.users.fetch=async()=>({send:async()=>({id:'mock-dm'})});app=createApp(pool,config,bot);
 [admin,csrfA]=await login('admin');[recruiter,csrfR]=await login('recruta');[moderator,csrfM]=await login('moderador');
});
after(async()=>{await bot.stop();await db.close();});
test('password hashing and 15-digit strings including leading zero',async()=>{const h=await passwordHash('Senha boa 1234');assert.equal(await passwordMatches('Senha boa 1234',h),true);assert.equal(await passwordMatches('errada',h),false);assert.match(generateIFJ(),/^\d{15}$/);});
test('unauthenticated, wrong origin and CSRF are rejected',async()=>{await request(app).get('/api/members').expect(401);await admin.post('/api/members').send(body).expect(403);await admin.post('/api/members').set('Origin',origin).send(body).expect(403);});
test('recruiter creates own IFJ but cannot create staff or announce',async()=>{
 const r=await send(recruiter,'post','/api/members',csrfR,body).expect(201);assert.match(r.body.ifj,/^\d{15}$/);
 assert.equal((await recruiter.get('/api/members').expect(200)).body[0].id,r.body.id);
 await send(recruiter,'post','/api/staff',csrfR,{username:'hack',password:'123456789012',role:'admin'}).expect(403);
 await send(recruiter,'post','/api/announcements',csrfR,{division:1,nick:'x',reason:'x',description:'x'}).expect(403);
 await recruiter.get('/api/reports').expect(403);
});
test('duplicate Discord, invalid division and SQL-injection-like input cannot bypass checks',async()=>{
 await send(admin,'post','/api/members',csrfA,body).expect(400);
 await send(admin,'post','/api/members',csrfA,{...body,division:3}).expect(400);
 await send(admin,'post','/api/members',csrfA,{...body,discord_id:"'; DROP TABLE members;--"}).expect(400);
 assert.equal((await pool.query('SELECT * FROM members')).rowCount,1);
});
test('verification refuses wrong division and stolen IFJ, then confirms and queues correct access',async()=>{
 const m=(await pool.query('SELECT * FROM members')).rows[0];
 const wrong=interaction('verify-form',{ifj:m.ifj},'44444444444444444',config.divisions[1].guild,true);await bot.handleInteraction(wrong);assert.match(wrong.result,/outra divisão/);assert.equal(wrong.deferred.flags,64);
 const stolen=interaction('verify-form',{ifj:m.ifj},'55555555555555555',config.divisions[0].guild,true);await bot.handleInteraction(stolen);assert.match(stolen.result,/não está vinculado/);
 const valid=interaction('verify-form',{ifj:m.ifj},body.discord_id,config.divisions[0].guild,true);await bot.handleInteraction(valid);assert.match(valid.result.content,/SoldadoTeste/);
 const t=(await pool.query('SELECT token FROM confirmations')).rows[0].token;
 const confirm=interaction(`confirm:${t}`);await bot.handleInteraction(confirm);assert.match(confirm.result.content,/Dados confirmados/);
 assert.equal((await pool.query('SELECT verified FROM members')).rows[0].verified,true);
 assert.equal((await pool.query("SELECT * FROM jobs WHERE kind='sync-role'")).rowCount,1);
 const reused=interaction(`confirm:${t}`,{},'66666666666666666');await bot.handleInteraction(reused);assert.match(reused.result.content,/expirada/);
});
test('reports are private, mark suspect, admin can resolve',async()=>{
 const i=interaction('report-form',{subject:'Soldado',reason:'Motivo de teste'},'77777777777777777',config.divisions[0].guild,true);await bot.handleInteraction(i);assert.equal(i.result,'Obrigado, vamos analisar');assert.equal(i.deferred.flags,64);
 assert.equal((await pool.query('SELECT suspect FROM members')).rows[0].suspect,true);
 const r=(await admin.get('/api/reports').expect(200)).body[0];
 await send(admin,'post',`/api/reports/${r.id}/resolve`,csrfA,{resolution:'Conversei com o membro; denúncia improcedente.'}).expect(200);
 assert.equal((await pool.query('SELECT suspect FROM members')).rows[0].suspect,false);
 const no=interaction('report-form',{subject:'inexistente',reason:'teste'},'88888888888888888',config.divisions[0].guild,true);await bot.handleInteraction(no);assert.equal(no.result,'IFJ não encontrado');
});
test('moderator cannot delete another creator; creator deletion invalidates outstanding confirmation',async()=>{
 const m=(await pool.query('SELECT * FROM members')).rows[0];
 await pool.query('INSERT INTO confirmations(token,member_id,discord_id,guild_id,expires_at) VALUES($1,$2,$3,$4,$5)',['test-pending',m.id,m.discord_id,config.divisions[0].guild,new Date(Date.now()+60000)]);
 await send(moderator,'delete',`/api/members/${m.id}`,csrfM,{reason:'Cancelado',announce:true}).expect(403);
 await send(moderator,'delete',`/api/members/${m.id}`,csrfM,{reason:'Cancelado',announce:false}).expect(404);
 await send(recruiter,'delete',`/api/members/${m.id}`,csrfR,{reason:'Cancelado',announce:false}).expect(200);
 assert.equal((await pool.query('SELECT * FROM members')).rowCount,0);assert.equal((await pool.query('SELECT * FROM confirmations')).rowCount,0);
 assert.equal((await pool.query("SELECT * FROM jobs WHERE kind='sync-role'")).rowCount,2);
 assert.equal((await pool.query('SELECT * FROM used_ifjs')).rowCount,1);
});
test('admin creates users, publishes announcements and disables sessions',async()=>{
 const u=(await send(admin,'post','/api/staff',csrfA,{username:'novo',password:'senha-teste-segura',role:'moderador'}).expect(201)).body;
 const [a]=await login('novo');assert.equal((await a.get('/api/me')).body.needs_discord,true);await a.get('/api/members').expect(403);
 await send(admin,'patch',`/api/staff/${u.id}`,csrfA,{role:'recrutador',active:false}).expect(200);await a.get('/api/members').expect(401);
 await send(admin,'post','/api/announcements',csrfA,{name:'Pessoa procurada',nick:'Alvo RP',reason:'Regra do jogo',description:'Somente roleplay'}).expect(202);
 assert.equal((await pool.query("SELECT * FROM jobs WHERE kind='announcement'")).rowCount,2);
});
test('worker applies roles only in matching division and removes both after revocation',async()=>{
 const added=[],removed=[];
 bot.client.isReady=()=>true;
 bot.client.guilds.fetch=async guildId=>accessGuild(guildId,added,removed,true);
 await send(admin,'post','/api/members',csrfA,{...body,roblox_username:'OutroRoblox'}).expect(201);
 await pool.query('UPDATE members SET verified=TRUE WHERE discord_id=$1',[body.discord_id]);
 // Only exercise the role jobs here, preserving the announcement test separately.
 await pool.query("UPDATE jobs SET status='sent' WHERE kind='announcement'");
 await bot.work();
 assert.ok(added.some(v=>v[0]===config.divisions[0].guild));assert.ok(removed.some(v=>v[0]===config.divisions[1].guild));
 assert.ok(!added.some(v=>v[0]===config.divisions[1].guild));
 const m=(await pool.query('SELECT * FROM members')).rows[0];await send(admin,'delete',`/api/members/${m.id}`,csrfA,{reason:'fim',announce:false}).expect(200);
 removed.length=0;await bot.work();assert.equal(removed.length,2);
});
test('ticket is private, duplicate opening reuses it, outsider cannot close, admin closes',async()=>{
 bot.client.user={id:'90909090909090909'};
 const channels=new Collection();let creates=0;let options;
 const fakeGuild={id:config.divisions[0].guild,ownerId:'99999999999999999',channels:{fetch:async id=>id?channels.get(id):channels,create:async opts=>{options=opts;creates++;const ch={id:'12121212121212121',guildId:config.divisions[0].guild,parentId:undefined,topic:opts.topic,send:async()=>{},delete:async()=>{channels.delete(ch.id);}};channels.set(ch.id,ch);return ch;}},members:{fetch:async()=>({roles:{cache:new Set()}})}};
 const i=interaction('ticket',{},'10101010101010101');i.guild=fakeGuild;await bot.handleInteraction(i);assert.match(i.result,/foi aberto/);assert.equal(creates,1);
 assert.ok(options.permissionOverwrites.some(x=>x.id===config.divisions[0].guild&&x.deny.length));assert.ok(options.permissionOverwrites.some(x=>x.id===config.divisions[0].adminRole&&x.allow.length));
 const t=(await pool.query('SELECT * FROM tickets')).rows[0];
 // Use a different button suffix to bypass the intentional short test-user cooldown while using same ticket path.
 await new Promise(resolve=>setTimeout(resolve,3100));
 const again=interaction('ticket',{},'10101010101010101');again.guild=fakeGuild;await bot.handleInteraction(again);assert.equal(creates,1);assert.match(again.result,/Seu ticket:/);
 const outsider=interaction(`close:${t.id}`,{},'20202020202020202');outsider.guild=fakeGuild;outsider.channelId=t.channel_id;await bot.handleInteraction(outsider);assert.match(outsider.result,/Somente administradores/);
 const owner=interaction(`close:${t.id}`,{},fakeGuild.ownerId);owner.guild=fakeGuild;owner.channelId=t.channel_id;await bot.handleInteraction(owner);assert.match(owner.result,/resolvido/);
 bot.client.channels.fetch=async id=>channels.get(id);await bot.work();assert.equal(channels.size,0);assert.equal((await pool.query('SELECT status FROM tickets')).rows[0].status,'resolvido');
});
test('all three roles create allies; recruiters cannot configure ranks or issue PNG',async()=>{
 for(const [agent,csrf,n]of [[admin,csrfA,1],[moderator,csrfM,2],[recruiter,csrfR,3]]){
  const r=await send(agent,'post','/api/members',csrf,{...body,discord_id:`8181818181818181${n}`,roblox_username:`AliadoTeste${n}`,account_kind:'aliado',allied_gang:'Gang Aliada'}).expect(201);
  assert.equal(r.body.account_kind,'aliado');assert.equal(r.body.member_rank,'Aliado');
  if(n===3){await agent.get(`/api/members/${r.body.id}/card.png`).expect(403);await send(agent,'patch',`/api/members/${r.body.id}`,csrf,{member_rank:'Chefe',identity_version:1}).expect(403);}
 }
 await send(recruiter,'post','/api/members',csrfR,{...body,discord_id:'81818181818181814',member_rank:'Chefe'}).expect(403);
 await send(admin,'post','/api/members',csrfA,{...body,discord_id:'81818181818181814',account_kind:'aliado'}).expect(400);
 await send(admin,'post','/api/members',csrfA,{...body,discord_id:'81818181818181814',account_kind:'admin'}).expect(400);
});
test('moderator edits division, preserves IFJ, invalidates confirmations and revokes verification',async()=>{
 const m=(await send(moderator,'post','/api/members',csrfM,{...body,discord_id:'82828282828282828',roblox_username:'TrocaDivisao',member_rank:'Capitão'}).expect(201)).body;
 await pool.query('UPDATE members SET verified=TRUE WHERE id=$1',[m.id]);
 await pool.query('INSERT INTO confirmations(token,member_id,discord_id,guild_id,expires_at) VALUES($1,$2,$3,$4,$5)',['old-version',m.id,m.discord_id,config.divisions[0].guild,new Date(Date.now()+60000)]);
 const r=await send(moderator,'patch',`/api/members/${m.id}`,csrfM,{division:2,name:'Novo Nome',identity_version:1}).expect(200);
 assert.equal(r.body.member.ifj,m.ifj);assert.equal(r.body.member.verified,false);assert.equal(r.body.member.identity_version,2);
 assert.equal((await pool.query('SELECT * FROM confirmations WHERE member_id=$1',[m.id])).rowCount,0);
 assert.ok((await pool.query("SELECT * FROM jobs WHERE kind='sync-role' AND payload->>'discordId'=$1",[m.discord_id])).rowCount);
 await send(admin,'patch',`/api/members/${m.id}`,csrfA,{name:'Outro',identity_version:1}).expect(409);
 const wrong=interaction('verify-form',{ifj:m.ifj},m.discord_id,config.divisions[0].guild,true);await bot.handleInteraction(wrong);assert.match(wrong.result,/outra divisão/);
 const stale=interaction('confirm:old-version',{},m.discord_id);await bot.handleInteraction(stale);assert.match(stale.result.content,/expirada/);
 await pool.query('UPDATE members SET verified=TRUE WHERE id=$1',[m.id]);
 const rank=await send(moderator,'patch',`/api/members/${m.id}`,csrfM,{member_rank:'Comandante',identity_version:2}).expect(200);assert.equal(rank.body.member.verified,true);
 for(const agent of [admin,moderator]){const png=await agent.get(`/api/members/${m.id}/card.png`).expect(200).expect('Content-Type',/image\/png/);assert.equal(png.body.subarray(1,4).toString(),'PNG');assert.equal(png.body.readUInt32BE(16),1600);assert.equal(png.body.readUInt32BE(20),1100);}
 await request(app).get(`/api/members/${m.id}/card.png`).expect(401);
});
test('allied verification displays identity and refuses a different Discord ID',async()=>{
 const m=(await pool.query("SELECT * FROM members WHERE discord_id='81818181818181811'")).rows[0];
 const valid=interaction('verify-form',{ifj:m.ifj},m.discord_id,config.divisions[0].guild,true);await bot.handleInteraction(valid);assert.match(valid.result.content,/Pessoa Teste/);assert.match(valid.result.content,/Gang Aliada/);assert.match(valid.result.content,/ALIADO AUTORIZADO E LICENCIADO POR ROKUHARA/);
 const t=(await pool.query('SELECT token FROM confirmations WHERE member_id=$1',[m.id])).rows[0].token;
 const confirm=interaction(`confirm:${t}`,{},m.discord_id);await bot.handleInteraction(confirm);assert.match(confirm.result.content,/Dados confirmados/);
 const wrong=interaction('verify-form',{ifj:m.ifj},'83838383838383838',config.divisions[1].guild,true);await bot.handleInteraction(wrong);assert.match(wrong.result,/não está vinculado/);
 await moderator.get(`/api/members/${m.id}/card.png`).expect(404);const png=await admin.get(`/api/members/${m.id}/card.png`).expect(200);assert.equal(png.body.subarray(1,4).toString(),'PNG');
});
test('allies verify from either guild, synchronize both roles, and revocation removes both',async()=>{
 const m=(await pool.query("SELECT * FROM members WHERE discord_id='81818181818181812'")).rows[0];
 const added=[],removed=[];
 for(const d of config.divisions){
  const fresh=createBot(pool,config);
  try{
   const valid=interaction('verify-form',{ifj:m.ifj},m.discord_id,d.guild,true);await fresh.handleInteraction(valid);assert.match(valid.result.content,/1ª e 2ª divisões/);
   const t=(await pool.query('SELECT token FROM confirmations WHERE member_id=$1 AND guild_id=$2',[m.id,d.guild])).rows[0].token;
   const stolen=interaction(`confirm:${t}`,{},'84848484848484848',d.guild);await fresh.handleInteraction(stolen);assert.match(stolen.result.content,/expirada/);
   const confirmed=interaction(`confirm:${t}`,{},m.discord_id,d.guild);await fresh.handleInteraction(confirmed);assert.match(confirmed.result.content,/Dados confirmados/);
   fresh.client.isReady=()=>true;fresh.client.guilds.fetch=async guildId=>accessGuild(guildId,added,removed);
   await fresh.work();
  }finally{await fresh.stop();}
 }
 for(const d of config.divisions)assert.ok(added.some(([g,u])=>g===d.guild&&u===m.discord_id));
 const fresh=createBot(pool,config);fresh.client.isReady=()=>true;fresh.client.guilds.fetch=async guildId=>accessGuild(guildId,added,removed);
 try{
  // Converting an ally to a member resets verification and withdraws both roles.
  await send(moderator,'patch',`/api/members/${m.id}`,csrfM,{account_kind:'membro',identity_version:1}).expect(200);
  added.length=0;removed.length=0;await fresh.work();assert.equal(added.length,0);assert.equal(removed.filter(([,u])=>u===m.discord_id).length,2);
  await pool.query('UPDATE members SET verified=TRUE WHERE id=$1',[m.id]);
  await pool.query("INSERT INTO jobs(kind,payload) VALUES('sync-role',$1)",[JSON.stringify({discordId:m.discord_id})]);
  added.length=0;await fresh.work();assert.deepEqual(added,[[config.divisions[0].guild,m.discord_id]]);
  await send(admin,'delete',`/api/members/${m.id}`,csrfA,{reason:'Encerrado'}).expect(200);removed.length=0;await fresh.work();assert.equal(removed.filter(([,u])=>u===m.discord_id).length,2);
 }finally{await fresh.stop();}
});
test('Líder, Sub líder and High member verify in the second division; demotion removes both roles',async()=>{
 for(const [idx,rank]of ['Líder','Sub líder','High member'].entries()){
  const m=(await send(moderator,'post','/api/members',csrfM,{...body,discord_id:`9191919191919191${idx}`,roblox_username:`PatenteTeste${idx}`,member_rank:rank,division:1}).expect(201)).body;
  const fresh=createBot(pool,config);const added=[],removed=[];
  fresh.client.isReady=()=>true;fresh.client.guilds.fetch=async guildId=>accessGuild(guildId,added,removed);
  try{
   const guild=config.divisions[1].guild;
   const stolen=interaction('verify-form',{ifj:m.ifj},`9292929292929292${idx}`,guild,true);await fresh.handleInteraction(stolen);assert.match(stolen.result,/não está vinculado/);
   const valid=interaction('verify-form',{ifj:m.ifj},m.discord_id,guild,true);await fresh.handleInteraction(valid);assert.match(valid.result.content,/1ª e 2ª divisões/);
   const t=(await pool.query('SELECT token FROM confirmations WHERE member_id=$1',[m.id])).rows[0].token;
   const confirm=interaction(`confirm:${t}`,{},m.discord_id,guild);await fresh.handleInteraction(confirm);assert.match(confirm.result.content,/Dados confirmados/);
   await fresh.work();for(const d of config.divisions)assert.ok(added.some(([g,u])=>g===d.guild&&u===m.discord_id));
   const listed=(await moderator.get('/api/members').expect(200)).body.find(x=>x.id===m.id);assert.equal(listed.access_both,true);
   const r=await send(moderator,'patch',`/api/members/${m.id}`,csrfM,{member_rank:'Membro',identity_version:1}).expect(200);assert.equal(r.body.member.verified,false);
   added.length=0;removed.length=0;await fresh.work();assert.equal(added.length,0);assert.equal(removed.filter(([,u])=>u===m.discord_id).length,2);
   const again=createBot(pool,config);try{const wrong=interaction('verify-form',{ifj:m.ifj},m.discord_id,guild,true);await again.handleInteraction(wrong);assert.match(wrong.result,/outra divisão/);}finally{await again.stop();}
   const promoted=await send(admin,'patch',`/api/members/${m.id}`,csrfA,{member_rank:rank,identity_version:2}).expect(200);assert.equal(promoted.body.member.verified,false);
  }finally{await fresh.stop();}
 }
});
test('rank-only edits keep verification and enqueue synchronization of rank and team',async()=>{
 const m=(await send(moderator,'post','/api/members',csrfM,{...body,discord_id:'94949494949494949',roblox_username:'RoleSyncTest',member_rank:'Moderador'}).expect(201)).body;
 await pool.query('UPDATE members SET verified=TRUE WHERE id=$1',[m.id]);
 const r=await send(moderator,'patch',`/api/members/${m.id}`,csrfM,{member_rank:'Recrutador',identity_version:1}).expect(200);assert.equal(r.body.member.verified,true);
 const jobs=await pool.query("SELECT * FROM jobs WHERE kind='sync-role' AND status='pending' AND payload->>'discordId'=$1",[m.discord_id]);assert.equal(jobs.rowCount,1);
});
test('startup reconciliation queues existing IFJs without verifying them or duplicating pending jobs',async()=>{
 const m=(await send(admin,'post','/api/members',csrfA,{...body,discord_id:'95959595959595959',roblox_username:'StartupRoleTest',member_rank:'Líder'}).expect(201)).body;
 const {initialize}=await import('../src/db.js');await initialize(pool,{BOT_ENABLED:'true'});await initialize(pool,{BOT_ENABLED:'true'});
 assert.equal((await pool.query("SELECT * FROM jobs WHERE kind='sync-role' AND status='pending' AND payload->>'discordId'=$1",[m.discord_id])).rowCount,1);assert.equal((await pool.query('SELECT verified FROM members WHERE id=$1',[m.id])).rows[0].verified,false);
});
test('readiness monitoring fails for disconnected bot, unavailable database or panel-only mode',async()=>{
 let ready=false,dbOK=true;const healthPool={query:async()=>{if(!dbOK)throw Error('secret must not leak');return {rows:[]}}};
 const healthApp=createApp(healthPool,{...config,botEnabled:true},{ready:()=>ready});await request(healthApp).get('/ready').expect(503);ready=true;const ok=await request(healthApp).get('/ready').expect(200);assert.equal(ok.body.status,'ready');dbOK=false;const no=await request(healthApp).get('/ready').expect(503);assert.equal(no.body.status,'unavailable');dbOK=true;await request(createApp(healthPool,{...config,botEnabled:false},{ready:()=>true})).get('/ready').expect(503);
});
test('wanted targets are external, upload is validated, two independent deliveries and admin-only wars',async()=>{
 const {createCanvas}=await import('@napi-rs/canvas');const image='data:image/png;base64,'+createCanvas(20,20).toBuffer('image/png').toString('base64');
 const data={name:'Pessoa externa',nick:'AlvoRP',reason:'Conflito no jogo',description:'Roupa azul',image};
 await send(moderator,'post','/api/wars',csrfM,{gang:'Rival',reason:'RP'}).expect(403);
 await send(recruiter,'post','/api/wars',csrfR,{gang:'Rival',reason:'RP'}).expect(403);
 await send(admin,'post','/api/announcements',csrfA,{...data,image:'data:image/svg+xml;base64,PHN2Zz4='}).expect(400);
 const r=await send(admin,'post','/api/announcements',csrfA,data).expect(202);assert.equal(r.body.ids.length,2);
 const jobs=(await pool.query('SELECT * FROM jobs WHERE id=ANY($1)',[r.body.ids])).rows;assert.deepEqual(jobs.map(j=>j.payload.division),[1,2]);assert.ok(jobs.every(j=>j.payload.image&&j.payload.name==='Pessoa externa'));
 const {announcementMessage}=await import('../src/announcements.js');for(const j of jobs){const msg=announcementMessage(j,config.divisions[j.payload.division-1]);assert.equal(msg.files.length,1);assert.equal(msg.embeds[0].toJSON().image.url,'attachment://procurado.jpg');}
 const w=await send(admin,'post','/api/wars',csrfA,{gang:'Rival @everyone',reason:'Disputa no jogo'}).expect(202);assert.equal(w.body.ids.length,2);
 const job=(await pool.query('SELECT * FROM jobs WHERE id=$1',[w.body.ids[0]])).rows[0],msg=announcementMessage(job,config.divisions[0]);assert.match(msg.embeds[0].toJSON().description,/morte aos inimigos/);assert.doesNotMatch(msg.embeds[0].toJSON().description,/@everyone/);assert.deepEqual(msg.allowedMentions,{parse:[]});
 const history=await admin.get('/api/operations').expect(200);assert.ok(history.body.jobs.every(j=>!j.payload.image));
});
