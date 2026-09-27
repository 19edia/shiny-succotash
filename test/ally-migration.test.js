import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import request from 'supertest';
import {PermissionFlagsBits as P} from 'discord.js';
import {createBot} from '../src/bot.js';
import {createApp} from '../src/app.js';
import {createAllyMigration} from '../src/ally-migration.js';
import {memberData} from '../src/identity.js';
import {renderCard,cardFields} from '../src/cards.js';
import {hash} from '../src/security.js';
import {ROLE_ENV,validateEnvironment} from '../src/config-rules.js';
const old='90000000000000001',adminId='90000000000000002',a='90000000000000003',b='90000000000000004';
const config={origin:'http://localhost:3000',production:false,secret:'x'.repeat(48),immigrationGuild:old,oldAllyRole:'1550966668707106856',divisions:[{id:1,guild:'10000000000000001',name:'Principal',invite:'https://discord.gg/YZG82Q3gZ',memberRole:'10000000000000002',adminRole:'10000000000000003',welcome:'10000000000000004',guide:'10000000000000005',verification:'10000000000000006'},{id:2,guild:'20000000000000001',name:'Segunda',invite:'https://discord.gg/M6EgDMbgG',memberRole:'20000000000000002',adminRole:'20000000000000003',welcome:'20000000000000004',guide:'20000000000000005',verification:'20000000000000006'}]};
for(const d of config.divisions){d.rankRoles=Object.fromEntries(Object.keys(ROLE_ENV).map((key,i)=>[key,String(BigInt(d.guild)+100n+BigInt(i))]));d.rankRoles.ally=d.id===1?'1551389189352853586':'1551393545183821854';}
let db,pool,bot,app,authorized=true,blocked=false,seq=0;const users=new Map(),adds=[],removes=[],dms=[],registrations=[],publicMessages=[];
function person(id,role=true,isBot=false){return {id,displayName:'Pessoa '+id.slice(-2),user:{id,username:'user'+id.slice(-2),bot:isBot},roles:{cache:new Set(role?[config.oldAllyRole]:[])}};}
function interaction(guild=old){return {id:String(++seq),guildId:guild,user:{id:adminId},commandName:'migrar-aliados',isChatInputCommand:()=>true,deferReply:async function(v){this.deferred=v;},editReply:async function(v){this.result=v;}};}
const api=(method,path,body)=>request(app)[method]('/api'+path).set('Cookie',`ifj_session=${'a'.repeat(64)}`).set('Origin',config.origin).set('X-CSRF-Token','csrf').send(body);
before(async()=>{
 db=new PGlite();await db.exec(await readFile(new URL('../src/schema.sql',import.meta.url),'utf8'));
 pool={query:async(s,v)=>{const r=await db.query(s,v);return {...r,rowCount:r.affectedRows||r.rows.length};},connect:async()=>({...pool,release(){}})};
 const staff=(await pool.query("INSERT INTO staff(username,password_hash,role) VALUES('admin','unused','admin') RETURNING id")).rows[0];await pool.query('INSERT INTO sessions(token_hash,staff_id,csrf,expires_at) VALUES($1,$2,$3,$4)',[hash('a'.repeat(64),config.secret),staff.id,'csrf',new Date(Date.now()+300000)]);
 users.set(a,person(a));users.set(b,person(b));users.set('90000000000000005',person('90000000000000005',false));users.set('90000000000000006',person('90000000000000006',true,true));
 await pool.query("INSERT INTO members(ifj,name,game_nick,roblox_username,discord_id,division,verified,member_rank) VALUES('123456789012345','Já cadastrado','Jogo','RobloxExistente',$1,1,true,'Líder')",[b]);
 bot=createBot(pool,config);bot.client.isReady=()=>true;
 bot.client.guilds.fetch=async id=>{
  if(id===old)return {id,ownerId:'owner',roles:{fetch:async()=>new Map([[config.oldAllyRole,{id:config.oldAllyRole}]])},commands:{create:async c=>registrations.push(c)},members:{fetch:async options=>{if(!options.user)return users;if(options.user===adminId)return {permissions:{has:p=>p===P.Administrator&&authorized}};if(!users.has(options.user))throw Object.assign(new Error(),{code:10007});return users.get(options.user);}}};
  const d=config.divisions.find(x=>x.guild===id);
  return {id,roles:{fetch:async()=>new Map([d.memberRole,d.adminRole,...Object.values(d.rankRoles)].map(id=>[id,{id,permissions:{has:()=>false}}]))},members:{fetchMe:async()=>({roles:{highest:{comparePositionTo:()=>1}}}),fetch:async({user})=>({id:user,joinedTimestamp:1750000000000,displayAvatarURL:()=> 'https://cdn.discordapp.com/embed/avatars/0.png',roles:{cache:new Set(),add:async role=>adds.push([id,user,role]),remove:async role=>removes.push([id,user,role])}})}};
 };
 bot.client.users.fetch=async id=>({send:async payload=>{if(blocked)throw Object.assign(new Error(),{code:50007});dms.push({id,payload});return {id:'dm'+dms.length};}});
 bot.client.channels.fetch=async id=>({guildId:config.divisions.find(d=>d.welcome===id)?.guild,send:async payload=>{publicMessages.push(payload);return {id:'welcome1'};}});
 app=createApp(pool,config,bot);
});
after(async()=>{await bot.stop();await db.close();});
test('source role checked; command only in old guild and only for real admins',async()=>{
 await createAllyMigration(pool,config,bot.client).validate();assert.equal(registrations[0].name,'migrar-aliados');assert.equal(registrations[0].default_member_permissions,String(P.Administrator));
 const wrong=interaction(config.divisions[0].guild);await bot.handleInteraction(wrong);assert.match(wrong.result,/servidor antigo/);
 authorized=false;const unauthorized=interaction();await bot.handleInteraction(unauthorized);assert.match(unauthorized.result,/Somente o dono/);assert.equal((await pool.query('SELECT * FROM jobs')).rowCount,0);authorized=true;
});
test('full role scan snapshots IDs/usernames and creates IFJ without fabricated game accounts',async()=>{
 const i=interaction();await bot.handleInteraction(i);assert.equal(i.deferred.flags,64);await bot.work();
 const rows=(await pool.query('SELECT * FROM ally_imports ORDER BY id')).rows;assert.equal(rows.length,2);assert.equal(rows[0].username,users.get(a).user.username);assert.equal(rows[0].source_role,config.oldAllyRole);
 const m=(await pool.query('SELECT * FROM members WHERE discord_id=$1',[a])).rows[0];assert.match(m.ifj,/^\d{15}$/);assert.equal(m.game_nick,null);assert.equal(m.roblox_username,null);assert.equal(m.auto_allied,true);assert.equal(m.verified,true);assert.equal(m.allied_gang,'Não informada');
 const existing=(await pool.query('SELECT * FROM members WHERE discord_id=$1',[b])).rows[0];assert.equal(existing.ifj,'123456789012345');assert.equal(existing.roblox_username,'RobloxExistente');assert.equal(existing.account_kind,'aliado');assert.equal(existing.member_rank,'Aliado');
 assert.equal(dms.length,2);const msg=dms[0].payload;assert.match(msg.embeds[0].toJSON().description,/Obrigado por fazer parte/);assert.equal(msg.embeds[0].toJSON().fields[0].value,'`'+m.ifj+'`');assert.deepEqual(msg.components[0].toJSON().components.map(x=>x.url),config.divisions.map(d=>d.invite));assert.deepEqual(msg.allowedMentions,{parse:[]});
 for(const d of config.divisions){assert.ok(adds.some(x=>x[0]===d.guild&&x[1]===a&&x[2]===d.rankRoles.ally));assert.ok(adds.some(x=>x[0]===d.guild&&x[1]===a&&x[2]===d.memberRole));assert.ok(!adds.some(x=>x[1]===a&&x[2]===d.adminRole));}
 const card=await renderCard(m,'Principal');assert.equal(card.subarray(1,4).toString(),'PNG');assert.ok(cardFields(m,'Principal').every(f=>f.value!==null));
});
test('repeated scan or retried job does not duplicate IFJs or welcome DMs',async()=>{
 await bot.handleInteraction(interaction());await bot.work();assert.equal((await pool.query('SELECT * FROM members')).rowCount,2);assert.equal((await pool.query('SELECT * FROM ally_imports')).rowCount,2);assert.equal(dms.length,2);
 const rows=(await api('get','/ally-imports').expect(200)).body;assert.equal(rows.length,2);assert.ok(rows.every(r=>r.notification_status==='sent'));
 await request(app).get('/api/ally-imports').expect(401);
});
test('saved ID is recognized on join in either division; unrelated accounts cannot bypass verification',async()=>{
 const start=adds.length;
 for(const d of config.divisions)await bot.handleMemberJoin({id:a,user:{bot:false},guild:{id:d.guild},joinedTimestamp:1750000000000});
 await bot.handleMemberJoin({id:'90000000000000009',user:{bot:false},guild:{id:config.divisions[0].guild},joinedTimestamp:1750000000000});await bot.work();
 assert.ok(adds.length>start);assert.ok(publicMessages.slice(0,2).every(m=>m.embeds[1].toJSON().description.includes('Aliado reconhecido')));assert.ok(publicMessages.at(-1).embeds[1].toJSON().description.includes('verifique seu IFJ'));
});
test('closed DM preserves identity and status; retry sends once without generating another IFJ',async()=>{
 const c='90000000000000010';users.set(c,person(c));blocked=true;await bot.handleInteraction(interaction());await bot.work();
 const r=(await api('get','/ally-imports').expect(200)).body.find(r=>r.discord_id===c);assert.equal(r.notification_status,'failed');const ifj=r.ifj;assert.equal(r.auto_allied,true);
 blocked=false;await api('post',`/jobs/${r.notification_job_id}/retry`,{}).expect(200);await bot.work();const after=(await api('get','/ally-imports').expect(200)).body.find(r=>r.discord_id===c);assert.equal(after.ifj,ifj);assert.equal(after.notification_status,'sent');
});
test('deleting imported IFJ prevents reimport and join bypass; editing cannot transfer bypass to another Discord',async()=>{
 const m=(await pool.query('SELECT * FROM members WHERE discord_id=$1',[a])).rows[0];await api('delete',`/members/${m.id}`,{reason:'Aliança encerrada'}).expect(200);await bot.work();
 await bot.handleInteraction(interaction());await bot.work();assert.equal((await pool.query('SELECT * FROM members WHERE discord_id=$1',[a])).rowCount,0);
 await bot.handleMemberJoin({id:a,user:{bot:false},guild:{id:config.divisions[0].guild},joinedTimestamp:1750000000001});assert.equal((await pool.query("SELECT * FROM jobs WHERE dedupe_key=$1",[`ally-join:${config.divisions[0].guild}:${a}:1750000000001`])).rowCount,0);
 const c=(await pool.query('SELECT * FROM members WHERE discord_id=$1',[b])).rows[0];const changed=(await api('patch',`/members/${c.id}`,{identity_version:c.identity_version,discord_id:'90000000000000011',auto_allied:true,verified:true}).expect(200)).body.member;assert.equal(changed.auto_allied,false);assert.equal(changed.verified,false);
});
test('manual registration cannot enable bypass; optional fields apply only to allies; invalid source/invites fail config',async()=>{
 const input={name:'Aliança manual',discord_id:'90000000000000012',division:1,account_kind:'aliado',allied_gang:'Gang exemplo',auto_allied:true,verified:true};const m=(await api('post','/members',input).expect(201)).body;assert.equal(m.auto_allied,false);assert.equal(m.verified,false);assert.equal(m.roblox_username,null);
 assert.throws(()=>memberData({...input,account_kind:'membro'}));assert.throws(()=>memberData({...input,roblox_username:'nome inválido'}));
 const checks=validateEnvironment({BOT_ENABLED:'true',OLD_ALLY_ROLE_ID:config.oldAllyRole,DIV_1_INVITE_URL:'https://evil.example/convite'});for(const key of ['ALLY_SOURCE_GUILD','DIV_1_INVITE_URL','DIV_2_INVITE_URL'])assert.ok(checks.some(c=>c.key===key&&!c.ok));
});
test('source role lost after snapshot is skipped; a revoked IFJ cannot be sent by a pending DM',async()=>{
 const id='90000000000000015',m=person(id);users.set(id,m);
 const migration=createAllyMigration(pool,config,bot.client);
 const {tx}=await import('../src/db.js');
 await tx(pool,c=>migration.execute({id:999,kind:'ally-scan',payload:{guildId:old,roleId:config.oldAllyRole,actorId:adminId}},c));
 m.roles.cache.clear();await bot.work();const r=(await pool.query('SELECT * FROM ally_imports WHERE discord_id=$1',[id])).rows[0];assert.equal(r.status,'skipped');assert.equal((await pool.query('SELECT * FROM members WHERE discord_id=$1',[id])).rowCount,0);
 const revoked=(await pool.query('SELECT * FROM ally_imports WHERE discord_id=$1',[a])).rows[0];const n=dms.length;await assert.rejects(tx(pool,c=>migration.execute({id:999,kind:'ally-welcome',payload:{importId:revoked.id}},c)),e=>e.code==='IFJ_CHANGED');assert.equal(dms.length,n);
});
