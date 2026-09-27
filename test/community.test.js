import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
import {createApp} from '../src/app.js';
import {createBot} from '../src/bot.js';
import {passwordHash} from '../src/security.js';
import {validateEnvironment,ID_FIELDS} from '../src/config-rules.js';
import {safeFailure} from '../src/preflight.js';
import {createCommunity} from '../src/community.js';
import {PermissionFlagsBits} from 'discord.js';
let db,pool,bot,app,admin,csrf,mod,csrfM;
const old='90000000000000001',user='90000000000000002',rejected='90000000000000003';
const config={origin:'http://localhost:3000',production:false,secret:'x'.repeat(48),immigrationGuild:old,divisions:[{id:1,name:'Primeira',guild:'10000000000000001',welcome:'10000000000000002',guide:'10000000000000003',verification:'10000000000000004'},{id:2,name:'Segunda',guild:'20000000000000001',welcome:'20000000000000002',guide:'20000000000000003',verification:'20000000000000004'}]};
const sent=[],publicSent=[];let blocked=false,requestId,member,denunciation;
const data={name:'Pessoa da imigração',game_nick:'Antigo',roblox_username:'AntigoRoblox',division:2,member_rank:'Sub líder'};
function interaction(id=user,command=false,guild=old){return {guildId:guild,user:{id},commandName:'imigração',customId:'immigration-form',isChatInputCommand:()=>command,isButton:()=>false,isModalSubmit:()=>!command,fields:{getTextInputValue:k=>k==='game_nick'?'Antigo':'Nome informado'},reply:async function(x){this.result=x;},deferReply:async function(x){this.deferred=x;},editReply:async function(x){this.result=x;},showModal:async function(x){this.modal=x.toJSON();}};}
const post=(path,data,agent=admin,token=csrf)=>agent.post('/api'+path).set('Origin',config.origin).set('X-CSRF-Token',token).send(data);
before(async()=>{
 db=new PGlite();await db.exec(await readFile(new URL('../src/schema.sql',import.meta.url),'utf8'));
 pool={query:async(s,a)=>{const r=await db.query(s,a);return {...r,rowCount:r.affectedRows||r.rows.length};},connect:async()=>({...pool,release(){}})};
 for(const [name,role]of [['admin','admin'],['moderador','moderador']])await pool.query('INSERT INTO staff(username,password_hash,role) VALUES($1,$2,$3)',[name,await passwordHash('senha-local-de-teste'),role]);
 bot=createBot(pool,config);bot.client.user={id:'bot'};bot.client.isReady=()=>true;
 bot.client.users.fetch=async id=>({send:async payload=>{if(blocked)throw Object.assign(new Error('DM blocked'),{code:50007});sent.push({id,payload});return {id:String(sent.length)};}});
 bot.client.channels.fetch=async id=>({guildId:config.divisions.find(d=>[d.welcome,d.guide].includes(id))?.guild,isTextBased:()=>true,send:async payload=>{publicSent.push({id,payload});return {id:String(publicSent.length)};},messages:{fetch:async arg=>typeof arg==='object'?new Map():({id:arg,author:{id:'bot'},embeds:[{title:'Como verificar • ROKUHARA'}],edit:async payload=>{publicSent.push({id,payload,edit:true});}})}});
 app=createApp(pool,config,bot);
 const login=async name=>{const a=request.agent(app);await a.post('/api/auth/login').set('Origin',config.origin).send({username:name,password:'senha-local-de-teste'}).expect(200);return [a,(await a.get('/api/me')).body.csrf];};
 [admin,csrf]=await login('admin');[mod,csrfM]=await login('moderador');
});
after(async()=>{await bot.stop();await db.close();});
test('immigration button opens the two-field form; commands are admin-only in old server',async()=>{
 const i=interaction();i.customId='immigration-open';i.isButton=()=>true;i.isModalSubmit=()=>false;await bot.handleInteraction(i);assert.equal(i.modal.components.length,2);assert.equal(i.modal.custom_id,'immigration-form');
 const wrong=interaction(user,true,config.divisions[0].guild);await bot.handleInteraction(wrong);assert.match(wrong.result.content,/servidor antigo/);assert.equal(wrong.result.flags,64);
 const registrations=[];const community=createCommunity(pool,config,{guilds:{fetch:async id=>{assert.equal(id,old);return {commands:{create:async c=>registrations.push(c)}};}}});await community.register();assert.deepEqual(registrations.map(x=>x.name),['imigração','imigracao']);assert.ok(registrations.every(x=>x.default_member_permissions===String(PermissionFlagsBits.Administrator)));
});
test('submission binds real Discord ID and deduplicates pending requests',async()=>{
 const i=interaction();await bot.handleInteraction(i);assert.equal(i.deferred.flags,64);assert.match(i.result,/enviado/);
 const rows=(await pool.query('SELECT * FROM immigrations')).rows;assert.equal(rows.length,1);assert.equal(rows[0].discord_id,user);assert.equal(rows[0].discord_name,'Nome informado');requestId=rows[0].id;
 await bot.handleInteraction(i);assert.match(i.result,/já tem um pedido/);assert.equal((await pool.query('SELECT * FROM immigrations')).rowCount,1);
 await mod.get('/api/immigrations').expect(403);await post(`/immigrations/${requestId}/approve`,data,mod,csrfM).expect(403);
});
test('approval validates required fields, prevents changing requester and queues one decision atomically',async()=>{
 await post(`/immigrations/${requestId}/approve`,{...data,discord_id:rejected}).expect(400);
 await post(`/immigrations/${requestId}/approve`,{...data,division:3}).expect(400);
 assert.equal((await pool.query('SELECT * FROM members')).rowCount,0);
 const result=await post(`/immigrations/${requestId}/approve`,data).expect(200);member=result.body.member;
 assert.equal(member.discord_id,user);assert.equal(member.verified,false);assert.equal(member.member_rank,'Sub líder');assert.match(member.ifj,/^\d{15}$/);
 await post(`/immigrations/${requestId}/approve`,data).expect(409);await post(`/immigrations/${requestId}/reject`,{reason:'não'}).expect(409);
 assert.equal((await pool.query("SELECT * FROM jobs WHERE kind='sync-role'")).rowCount,0);
 const i=interaction();await bot.handleInteraction(i);assert.match(i.result,/já possui IFJ/);
});
test('approval worker privately sends valid PNG and IFJ to requester without public announcement or role grant',async()=>{
 await bot.work();assert.equal(sent.length,1);assert.equal(sent[0].id,user);assert.equal(publicSent.length,0);
 const msg=sent[0].payload;assert.match(msg.embeds[0].toJSON().description,new RegExp(member.ifj));assert.deepEqual(msg.allowedMentions,{parse:[]});assert.equal(msg.files[0].attachment.subarray(1,4).toString(),'PNG');
 assert.equal((await pool.query('SELECT verified FROM members WHERE id=$1',[member.id])).rows[0].verified,false);
 const r=(await admin.get('/api/immigrations')).body[0];assert.equal(r.notification_status,'sent');
});
test('rejection requires reason; blocked DM records failure and can be retried by admin',async()=>{
 await bot.handleInteraction(interaction(rejected));const r=(await pool.query('SELECT * FROM immigrations WHERE discord_id=$1',[rejected])).rows[0];
 await post(`/immigrations/${r.id}/reject`,{reason:''}).expect(400);await post(`/immigrations/${r.id}/reject`,{reason:'Dados não conferem.'}).expect(200);
 blocked=true;await bot.work();let status=(await admin.get('/api/immigrations')).body.find(x=>x.id===r.id);assert.equal(status.notification_status,'failed');assert.match(status.notification_error,/mensagem privada/);assert.equal(publicSent.length,0);
 await post(`/jobs/${status.notification_job_id}/retry`,{}).expect(200);blocked=false;await bot.work();assert.equal(sent.at(-1).id,rejected);assert.equal(sent.at(-1).payload.embeds[0].toJSON().description,'Dados não conferem.');assert.equal(sent.at(-1).payload.files,undefined);
 status=(await admin.get('/api/immigrations')).body.find(x=>x.id===r.id);assert.equal(status.notification_status,'sent');
});
test('report analysis is sent only to reporter and cannot be resolved twice',async()=>{
 denunciation=(await pool.query('INSERT INTO reports(member_id,subject,reporter_id,division,reason) VALUES($1,$2,$3,2,$4) RETURNING *',[member.id,'Antigo',rejected,'Denúncia de teste'])).rows[0];
 await post(`/reports/${denunciation.id}/resolve`,{resolution:'Após conversar com o membro, análise concluída.'}).expect(200);
 await post(`/reports/${denunciation.id}/resolve`,{resolution:'Outra'}).expect(409);await bot.work();assert.equal(sent.at(-1).id,rejected);assert.match(sent.at(-1).payload.embeds[0].toJSON().description,/análise concluída/);
 assert.equal((await admin.get('/api/reports')).body[0].notification_status,'sent');assert.equal(publicSent.length,0);
});
test('welcome deduplicates events, uses correct division, avatar followed by greeting and mentions only new member',async()=>{
 const d=config.divisions[1],joined={id:user,user:{bot:false},guild:{id:d.guild},joinedTimestamp:1750000000000,displayAvatarURL:()=> 'https://cdn.discordapp.com/embed/avatars/0.png'};
 bot.client.guilds.fetch=async()=>({members:{fetch:async()=>joined}});
 await bot.handleMemberJoin(joined);await bot.handleMemberJoin(joined);await bot.handleMemberJoin({...joined,guild:{id:old}});await bot.handleMemberJoin({...joined,user:{bot:true}});
 assert.equal((await pool.query("SELECT * FROM jobs WHERE kind='welcome'")).rowCount,1);await bot.work();const msg=publicSent.at(-1);assert.equal(msg.id,d.welcome);assert.equal(msg.payload.content,`<@${user}>`);assert.deepEqual(msg.payload.allowedMentions,{parse:[],users:[user]});assert.match(msg.payload.embeds[0].toJSON().image.url,/avatars/);assert.equal(msg.payload.embeds[1].toJSON().title,'❖ ┃ Bem-vindo à ROKUHARA');assert.match(msg.payload.embeds[1].toJSON().description,new RegExp(d.guide));
});
test('guide is posted then updated instead of duplicated, with verification steps and both-division ranks',async()=>{
 const d=config.divisions[0];await bot.publishGuide(d);await bot.publishGuide(d);assert.equal(publicSent.at(-1).edit,true);assert.equal((await pool.query('SELECT * FROM panels')).rowCount,1);
 const desc=publicSent.at(-1).payload.embeds[0].description;assert.match(desc,/High member/);assert.match(desc,new RegExp(d.verification));assert.match(desc,/Sou eu/);
});
test('deleted approved IFJ is never sent; new env errors and disabled member intent remain blocking',async()=>{
 const another='90000000000000009';await bot.handleInteraction(interaction(another));const r=(await pool.query('SELECT * FROM immigrations WHERE discord_id=$1',[another])).rows[0];
 const m=(await post(`/immigrations/${r.id}/approve`,{...data,roblox_username:'OutroUsuario'}).expect(200)).body.member;await pool.query('DELETE FROM members WHERE id=$1',[m.id]);const n=sent.length;await bot.work();assert.equal(sent.length,n);const j=(await pool.query("SELECT * FROM jobs WHERE error LIKE 'Cadastro cancelado%'")).rows[0];assert.equal(j.status,'failed');
 const env={BOT_ENABLED:'true',IMMIGRATION_GUILD_ID:config.divisions[0].guild,DIV_1_GUILD_ID:config.divisions[0].guild};let checks=validateEnvironment(env);assert.ok(checks.some(x=>x.key==='IMMIGRATION_GUILD_DISTINCT'&&!x.ok));for(const key of ['WELCOME_CHANNEL_ID','GUIDE_CHANNEL_ID']){assert.ok(ID_FIELDS.includes(key));assert.ok(checks.some(x=>x.key==='DIV_1_'+key&&!x.ok));}assert.match(safeFailure({code:4014}),/Server Members Intent/);
});

test('admin publishes public notice with button and fixed ten-day deadline; repeat updates original',async()=>{
 const messages=[];let allowed=false,edits=0;
 const fake={user:{id:'bot'},
  guilds:{fetch:async()=>({ownerId:'owner',members:{fetch:async()=>({permissions:{has:()=>allowed}})}})},
  channels:{fetch:async()=>({guildId:old,isTextBased:()=>true,
   send:async payload=>{messages.push(payload);return {id:'notice-message'};},
   messages:{fetch:async arg=>typeof arg==='object'?new Map():({id:'notice-message',author:{id:'bot'},embeds:[{title:'ROKUHARA • Vamos imigrar!'}],edit:async payload=>{edits++;messages.push(payload);}})}
  })}
 };
 const community=createCommunity(pool,config,fake),i=interaction(user,true);i.channelId='90000000000000005';i.id='90000000000000006';
 await community.interact(i);assert.match(i.result,/Somente o dono/);assert.equal(messages.length,0);
 allowed=true;const before=Date.now();await community.interact(i);assert.equal(i.deferred.flags,64);assert.equal(messages.length,1);assert.equal(messages[0].flags,undefined);assert.deepEqual(messages[0].allowedMentions,{parse:[]});assert.equal(messages[0].components[0].toJSON().components[0].custom_id,'immigration-open');assert.match(messages[0].embeds[0].description,/excluído em 10 dias/);
 const n=(await pool.query('SELECT * FROM immigration_notices')).rows[0];assert.ok(Math.abs(new Date(n.deadline).getTime()-before-10*86400000)<5000);
 i.channelId='90000000000000007';await community.interact(i);assert.equal(edits,1);const updated=(await pool.query('SELECT * FROM immigration_notices')).rows[0];assert.equal(String(updated.deadline),String(n.deadline));assert.equal(updated.channel_id,n.channel_id);assert.equal(updated.message_id,'notice-message');assert.match(i.result,/exclusão do servidor é manual/);
});
