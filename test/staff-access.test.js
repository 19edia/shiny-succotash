import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import request from 'supertest';
import {createApp} from '../src/app.js';
import {createBot} from '../src/bot.js';
import {createWarnings} from '../src/warnings.js';
import {hash,passwordHash} from '../src/security.js';
let db,pool,app,offline=false,dmBlocked=false,sequence=0;
const config={origin:'http://localhost:3000',secret:'s'.repeat(48),production:false,divisions:[{id:1,guild:'10000000000000001',name:'Primeira'},{id:2,guild:'20000000000000001',name:'Segunda'}]};
const users={},sent=[];
const discord=i=>String(81000000000000000n+BigInt(i));
const body=i=>({name:'Pessoa '+i,game_nick:'Pessoa'+i,roblox_username:'Pessoa'+i,discord_id:String(91000000000000000n+BigInt(i)),division:1});
function call(name,method,path,payload){const r=request(app)[method]('/api'+path).set('Cookie',`ifj_session=${users[name].token}`);return method==='get'?r:r.set('Origin',config.origin).set('X-CSRF-Token','csrf').send(payload);}
const code=()=>sent.at(-1).code;
const start=(name,id)=>call(name,'post','/auth/discord/start',{discord_id:id});
const confirm=(name,value)=>call(name,'post','/auth/discord/confirm',{code:value});
before(async()=>{
 db=new PGlite();await db.exec(await readFile(new URL('../src/schema.sql',import.meta.url),'utf8'));
 pool={query:async(sql,args)=>{const r=await db.query(sql,args);return {...r,rowCount:r.affectedRows||r.rows.length};},connect:async()=>({...pool,release(){}})};
 const password=await passwordHash('senha-local-segura');
 for(const [name,role] of [['admin','admin'],['r1','recrutador'],['r2','recrutador'],['m1','moderador'],['m2','moderador']]){const u=(await pool.query('INSERT INTO staff(username,password_hash,role) VALUES($1,$2,$3) RETURNING id',['staff-'+name,password,role])).rows[0];users[name]={id:u.id,token:String(u.id).repeat(64)};await pool.query('INSERT INTO sessions(token_hash,staff_id,csrf,expires_at) VALUES($1,$2,$3,$4)',[hash(users[name].token,config.secret),u.id,'csrf',new Date(Date.now()+3600000)]);}
 app=createApp(pool,config,{ready:()=>!offline,sendStaffLinkCode:async(id,value,username)=>{if(dmBlocked)throw Error('blocked');sent.push({id,code:value,username});}});
});
after(async()=>{await db.close();});
test('login asks unlinked staff for Discord and API cannot bypass the requirement',async()=>{
 const agent=request.agent(app);await agent.post('/api/auth/login').set('Origin',config.origin).send({username:'staff-r1',password:'senha-local-segura'}).expect(200);
 assert.equal((await agent.get('/api/me').expect(200)).body.needs_discord,true);
 assert.equal((await call('r1','get','/me').expect(200)).body.needs_discord,true);
 await call('r1','get','/members').expect(403);await call('r1','post','/members',body(1)).expect(403);
 await call('admin','get','/members').expect(200);
});
test('Discord ID alone never grants access; private code confirms, is hashed, and cannot be replayed',async()=>{
 await start('r1','bad').expect(400);
 const response=await start('r1',discord(1)).expect(200);assert.equal(response.body.code,undefined);assert.equal(sent.at(-1).id,discord(1));
 const challenge=(await pool.query('SELECT * FROM staff_discord_challenges WHERE staff_id=$1',[users.r1.id])).rows[0];assert.notEqual(challenge.code_hash,code());assert.match(challenge.code_hash,/^[a-f0-9]{64}$/);
 await call('r1','get','/members').expect(403);
 await start('r1',discord(1)).expect(429);
 await confirm('r1','000000').expect(400);await confirm('r1',code()).expect(200);await confirm('r1',code()).expect(400);
 const me=(await call('r1','get','/me')).body;assert.equal(me.discord_id,discord(1));assert.equal(me.needs_discord,false);await call('r1','get','/members').expect(200);
});
test('binding rejects duplicate Discord identities, expired codes and five failed attempts',async()=>{
 await start('r2',discord(1)).expect(409);await start('r2',discord(2)).expect(200);
 const value=code();for(let n=0;n<5;n++)await confirm('r2','000000').expect(400);await confirm('r2',value).expect(400);
 await pool.query("UPDATE staff_discord_challenges SET created_at=now()-interval '2 minutes' WHERE staff_id=$1",[users.r2.id]);await start('r2',discord(2)).expect(200);
 await pool.query("UPDATE staff_discord_challenges SET expires_at=now()-interval '1 minute' WHERE staff_id=$1",[users.r2.id]);await confirm('r2',code()).expect(400);
 await pool.query("UPDATE staff_discord_challenges SET created_at=now()-interval '2 minutes' WHERE staff_id=$1",[users.r2.id]);await start('r2',discord(2)).expect(200);await confirm('r2',code()).expect(200);
});
test('failed DM or offline bot does not link an account and requests require CSRF',async()=>{
 offline=true;await start('m1',discord(3)).expect(503);offline=false;
 dmBlocked=true;await start('m1',discord(3)).expect(400);dmBlocked=false;
 assert.equal((await pool.query('SELECT * FROM staff_discord_challenges WHERE staff_id=$1',[users.m1.id])).rowCount,0);
 await request(app).post('/api/auth/discord/start').set('Cookie',`ifj_session=${users.m1.token}`).set('Origin',config.origin).send({discord_id:discord(3)}).expect(403);
 for(const [name,id] of [['m1',3],['m2',4]]){await start(name,discord(id)).expect(200);await confirm(name,code()).expect(200);}
});
test('both staff roles list, edit and delete only their own IFJs; admin retains all access',async()=>{
 const records=[];let n=0;
 for(const name of ['r1','r2','m1','m2','admin'])records.push({name,member:(await call(name,'post','/members',body(++n)).expect(201)).body});
 for(const {name,member} of records){
  const list=(await call(name,'get','/members').expect(200)).body;assert.equal(list.length,name==='admin'?5:1);
  if(name==='admin')continue;
  for(const other of records.filter(r=>r.name!==name)){
   await call(name,'patch',`/members/${other.member.id}`,{name:'Invasão',created_by:users[name].id,identity_version:1}).expect(404);
   await call(name,'delete',`/members/${other.member.id}`,{reason:'Invasão'}).expect(404);
   await call(name,'get',`/members/${other.member.id}/card.png`).expect(name.startsWith('r')?403:404);
  }
  const edited=(await call(name,'patch',`/members/${member.id}`,{name:'Nome atualizado',created_by:users.admin.id,identity_version:1}).expect(200)).body.member;
  assert.equal(edited.created_by,users[name].id);assert.equal(edited.ifj,member.ifj);
  await call(name,'patch',`/members/${member.id}`,{name:'Dados antigos',identity_version:1}).expect(409);
  if(name.startsWith('r'))await call(name,'patch',`/members/${member.id}`,{member_rank:'Líder',identity_version:2}).expect(403);
  else await call(name,'get',`/members/${member.id}/card.png`).expect(200);
 }
 for(const {name,member} of records){await call(name,'delete',`/members/${member.id}`,{reason:'Finalizado'}).expect(200);}
});
test('linked moderator can warn, recruiter cannot; warnings are scoped and revocation is immediate',async()=>{
 const fake={guilds:{fetch:async id=>({id,ownerId:'owner',members:{fetch:async({user})=>({id:user,permissions:{has:()=>false}})}})}};
 const warnings=createWarnings(pool,config,fake);
 const i=user=>({id:String(++sequence),guildId:config.divisions[0].guild,user:{id:user},isChatInputCommand:()=>true,commandName:'warn',options:{getUser:()=>({id:discord(99),bot:false}),getString:()=> 'Motivo de teste'},deferReply:async()=>{},editReply:async function(value){this.result=value;}});
 const recruiter=i(discord(1));await warnings.interact(recruiter);assert.match(recruiter.result.content,/Somente/);
 const moderator=i(discord(3));await warnings.interact(moderator);assert.match(moderator.result.content,/registrada/);
 assert.equal((await call('m1','get','/warnings').expect(200)).body.length,1);assert.equal((await call('m2','get','/warnings').expect(200)).body.length,0);await call('r1','get','/warnings').expect(403);
 await call('admin','patch',`/staff/${users.m1.id}`,{role:'recrutador',active:true}).expect(200);
 const demoted=i(discord(3));await warnings.interact(demoted);assert.match(demoted.result.content,/Somente/);
 await call('admin','patch',`/staff/${users.m2.id}`,{role:'moderador',active:false}).expect(200);
 const disabled=i(discord(4));await warnings.interact(disabled);assert.match(disabled.result.content,/Somente/);assert.equal((await pool.query('SELECT * FROM warnings')).rowCount,1);
});

test('relink keeps the old identity until confirmation, then replaces it',async()=>{
 await start('r2',discord(22)).expect(200);
 assert.equal((await call('r2','get','/me')).body.discord_id,discord(2));
 await confirm('r2',code()).expect(200);
 assert.equal((await call('r2','get','/me')).body.discord_id,discord(22));
 assert.equal((await pool.query('SELECT id FROM staff WHERE discord_id=$1',[discord(2)])).rowCount,0);
});
test('real link sender only sends codes to humans in a configured division',async()=>{
 const bot=createBot(pool,config);bot.client.isReady=()=>true;let isBot=false,present=false;const dms=[];
 bot.client.users.fetch=async()=>({bot:isBot,send:async payload=>dms.push(payload)});
 bot.client.guilds.fetch=async()=>({members:{fetch:async()=>{if(!present)throw Object.assign(Error('unknown member'),{code:10007});return {id:discord(5)};}}});
 try{
  await assert.rejects(bot.sendStaffLinkCode(discord(5),'123456','staff'),/Entre em uma/);assert.equal(dms.length,0);
  isBot=true;await assert.rejects(bot.sendStaffLinkCode(discord(5),'123456','staff'),/humana/);assert.equal(dms.length,0);
  isBot=false;present=true;await bot.sendStaffLinkCode(discord(5),'123456','staff');const embed=dms[0].embeds[0].toJSON();assert.match(embed.fields.find(f=>f.name==='Código de confirmação')?.value||'',/123456/);assert.deepEqual(dms[0].allowedMentions,{parse:[]});
 }finally{await bot.stop();}
});
