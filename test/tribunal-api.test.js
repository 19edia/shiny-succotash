import {test,before,beforeEach,afterEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import request from 'supertest';
import {Collection,ChannelType} from 'discord.js';
import {createApp} from '../src/app.js';
import {createBot} from '../src/bot.js';
import {hash} from '../src/security.js';

const ids={admin:'80000000000000001',moderador:'80000000000000002',recrutador:'80000000000000003',reporter:'80000000000000004',accused:'80000000000000005',changed:'80000000000000006',bot:'80000000000000007'};
const config={origin:'http://localhost:3000',production:false,botEnabled:true,secret:'t'.repeat(48),divisions:[
 {id:1,name:'Primeira',guild:'10000000000000001',category:'10000000000000002'},
 {id:2,name:'Segunda',guild:'20000000000000001',category:'20000000000000002'}
]};
let db,pool,bot,app,offline,users,network;
const plain=value=>value?.toJSON?.()??value;
const call=(role,method,path,body)=>{const action=request(app)[method](`/api${path}`).set('Cookie',`ifj_session=${users[role].token}`);return method==='get'?action:action.set('Origin',config.origin).set('X-CSRF-Token','csrf').send(body);};
const submit=(reportId,body={})=>call('admin','post',`/reports/${reportId}/tribunal`,body);
async function addReport(){return (await pool.query('INSERT INTO reports(subject,reporter_id,subject_discord_id,division,reason) VALUES($1,$2,$3,1,$4) RETURNING *',['Pessoa denunciada',ids.reporter,ids.accused,'Relato para análise.'])).rows[0];}
const row=async reportId=>(await pool.query('SELECT * FROM tribunals WHERE report_id=$1',[reportId])).rows[0];

function mockDiscord(){
 network={channels:new Collection(),created:[],sent:[],edited:[],dms:[],missing:new Set(),overwrites:[]};
 for(const d of config.divisions)network.channels.set(d.category,{id:d.category,guildId:d.guild,type:ChannelType.GuildCategory});
 bot.client.user={id:ids.bot};bot.client.isReady=()=>!offline;
 bot.client.guilds.fetch=async guildId=>({id:guildId,members:{fetch:async({user})=>{if(network.missing.has(user))throw Object.assign(new Error('Missing member'),{code:10007});return {id:user,user:{id:user,bot:false}};}},channels:{
  fetch:async id=>id?(network.channels.get(id)??null):new Collection([...network.channels].filter(([,channel])=>channel.guildId===guildId)),
  create:async options=>{
   const id=`3000000000000000${network.created.length+1}`,messages=new Collection();
   const channel={...options,id,guildId,isTextBased:()=>true,permissionOverwrites:{set:async overwrites=>network.overwrites.push({id,overwrites})},messages:{fetch:async value=>{if(typeof value==='object')return messages;const message=messages.get(value);if(!message)throw Object.assign(new Error('Missing message'),{code:10008});return message;}},
    send:async payload=>{const message={id:`message-${network.sent.length+1}`,author:{id:ids.bot},embeds:payload.embeds.map(plain),components:[],edit:async payload=>{network.edited.push({id,payload});message.embeds=payload.embeds.map(plain);return message;}};messages.set(message.id,message);network.sent.push({id,payload});return message;}};
   network.created.push(channel);network.channels.set(id,channel);return channel;
  }
 }});
 bot.client.channels.fetch=async id=>network.channels.get(id);
 bot.client.users.fetch=async id=>({id,send:async payload=>{network.dms.push({id,payload});return {id:`dm-${network.dms.length}`};}});
}

before(async()=>{
 db=new PGlite();await db.exec(await readFile(new URL('../src/schema.sql',import.meta.url),'utf8'));
 pool={query:async(sql,args)=>{const result=await db.query(sql,args);return {...result,rowCount:result.affectedRows||result.rows.length};},connect:async()=>({...pool,release(){}})};
});
beforeEach(async()=>{
 await pool.query('TRUNCATE staff,members,reports,jobs,panels,audit RESTART IDENTITY CASCADE');offline=false;users={};
 for(const [index,role]of ['admin','moderador','recrutador'].entries()){
  const staff=(await pool.query('INSERT INTO staff(username,password_hash,role,discord_id,discord_verified_at) VALUES($1,$2,$1,$3,now()) RETURNING id',[role,'not-used',ids[role]])).rows[0];
  users[role]={id:staff.id,token:String(index+1).repeat(64)};await pool.query('INSERT INTO sessions(token_hash,staff_id,csrf,expires_at) VALUES($1,$2,$3,$4)',[hash(users[role].token,config.secret),staff.id,'csrf',new Date(Date.now()+3600000)]);
 }
 bot=createBot(pool,config);mockDiscord();app=createApp(pool,config,bot);
});
afterEach(async()=>{await bot.stop();});
after(async()=>{await db.close();});

test('tribunal and report endpoints enforce administrator role, authentication, Origin and CSRF',async()=>{
 const r=await addReport(),path=`/api/reports/${r.id}/tribunal`;
 await request(app).get('/api/reports').expect(401);await request(app).post(path).set('Origin',config.origin).send({}).expect(401);
 for(const role of ['moderador','recrutador']){await call(role,'get','/reports').expect(403);await call(role,'post',`/reports/${r.id}/tribunal`,{}).expect(403);await call(role,'post',`/reports/${r.id}/resolve`,{resolution:'Sem autorização.'}).expect(403);}
 await request(app).post(path).set('Cookie',`ifj_session=${users.admin.token}`).set('Origin',config.origin).send({}).expect(403);
 await request(app).post(path).set('Cookie',`ifj_session=${users.admin.token}`).set('X-CSRF-Token','csrf').set('Origin','https://different.example').send({}).expect(403);
 assert.equal((await pool.query('SELECT * FROM tribunals')).rowCount,0);assert.equal((await pool.query('SELECT * FROM jobs')).rowCount,0);
});

test('administrator must confirm Discord identity and bot must be connected before opening',async()=>{
 const r=await addReport();await pool.query('UPDATE staff SET discord_verified_at=NULL WHERE id=$1',[users.admin.id]);const unverified=await submit(r.id).expect(409);assert.match(unverified.body.error,/Discord/);
 await pool.query('UPDATE staff SET discord_verified_at=now() WHERE id=$1',[users.admin.id]);offline=true;await submit(r.id).expect(503);
 assert.equal((await pool.query('SELECT * FROM tribunals')).rowCount,0);assert.equal((await pool.query('SELECT * FROM jobs')).rowCount,0);
});

test('opening returns 202, repeating returns 200 and both reference one tribunal and job',async()=>{
 const r=await addReport();const first=await submit(r.id,{division:2}).expect(202);const repeated=await submit(r.id,{division:2}).expect(200);
 assert.equal(first.body.tribunal.reused,false);assert.equal(repeated.body.tribunal.reused,true);assert.equal(first.body.tribunal.create_job_id,repeated.body.tribunal.create_job_id);assert.equal(first.body.tribunal.guild_id,config.divisions[1].guild);assert.equal(first.body.tribunal.accused_id,ids.accused);
 const jobs=(await pool.query("SELECT * FROM jobs WHERE kind='tribunal-open'")).rows;assert.equal(jobs.length,1);assert.equal(jobs[0].payload.reportId,r.id);
 const list=(await call('admin','get','/reports').expect(200)).body;assert.equal(list[0].subject_discord_id,ids.accused);assert.equal(list[0].tribunal_status,'pending');assert.equal(list[0].tribunal_job_id,jobs[0].id);assert.equal(list[0].tribunal_job_status,'pending');assert.equal(list[0].tribunal_division,2);
});

test('a report submitted in Discord keeps the original accused identity after the IFJ changes',async()=>{
 const member=(await pool.query("INSERT INTO members(ifj,name,game_nick,discord_id,division) VALUES('123456789012345','Pessoa original','Nick original',$1,1) RETURNING *",[ids.accused])).rows[0];
 const interaction={customId:'report-form',guildId:config.divisions[0].guild,user:{id:ids.reporter},isChatInputCommand:()=>false,isButton:()=>false,isModalSubmit:()=>true,fields:{getTextInputValue:key=>key==='subject'?member.ifj:'Relato original.'},reply:async function(payload){this.result=payload;},deferReply:async function(payload){this.deferred=payload;},editReply:async function(payload){this.result=payload;}};
 await bot.handleInteraction(interaction);assert.match(interaction.result,/vamos analisar/);assert.equal(interaction.deferred.flags,64);
 await pool.query('UPDATE members SET discord_id=$1 WHERE id=$2',[ids.changed,member.id]);const before=(await call('admin','get','/reports').expect(200)).body[0];assert.equal(before.subject_discord_id,ids.accused);assert.equal(before.discord_id,ids.changed);assert.equal(before.reporter_id,ids.reporter);
 await pool.query('DELETE FROM members WHERE id=$1',[member.id]);const deleted=(await call('admin','get','/reports').expect(200)).body[0];assert.equal(deleted.member_id,null);assert.equal(deleted.subject_discord_id,ids.accused);
 const response=await submit(before.id).expect(202);assert.equal(response.body.tribunal.accused_id,ids.accused);
});

test('API exposes actionable creation failures and retry opens the same case after the missing participant joins',async()=>{
 const r=await addReport();await submit(r.id).expect(202);network.missing.add(ids.accused);await bot.work();const failed=(await call('admin','get','/reports').expect(200)).body[0];assert.equal(failed.tribunal_status,'pending');assert.equal(failed.tribunal_job_status,'failed');assert.match(failed.tribunal_error,/pessoa denunciada/);assert.equal(network.created.length,0);
 network.missing.clear();await call('admin','post',`/jobs/${failed.tribunal_job_id}/retry`,{}).expect(200);await bot.work();const opened=(await call('admin','get','/reports').expect(200)).body[0];assert.equal(opened.tribunal_status,'open');assert.equal(opened.tribunal_job_status,'sent');assert.equal(network.created.length,1);assert.equal(network.dms.length,3);assert.equal(opened.tribunal_channel_id,network.created[0].id);
});

test('resolving an open tribunal queues one closure and updates metadata to the close operation',async()=>{
 const r=await addReport();await submit(r.id).expect(202);await bot.work();assert.equal((await row(r.id)).status,'open');
 await call('admin','post',`/reports/${r.id}/resolve`,{resolution:'Ouvidas ambas as partes, encerramos o caso.'}).expect(200);await call('admin','post',`/reports/${r.id}/resolve`,{resolution:'Segunda resolução.'}).expect(409);await submit(r.id).expect(409);
 const queued=await row(r.id);assert.equal(queued.status,'closing');assert.ok(queued.close_job_id);const jobs=(await pool.query("SELECT kind,count(*)::int AS count FROM jobs GROUP BY kind")).rows;assert.equal(jobs.find(job=>job.kind==='tribunal-close').count,1);assert.equal(jobs.find(job=>job.kind==='report-resolution').count,1);
 const list=(await call('admin','get','/reports').expect(200)).body;assert.equal(list[0].status,'resolvida');assert.equal(list[0].tribunal_status,'closing');assert.equal(list[0].tribunal_job_id,queued.close_job_id);
 await bot.work();const closed=(await call('admin','get','/reports').expect(200)).body[0];assert.equal(closed.tribunal_status,'closed');assert.equal(closed.tribunal_job_status,'sent');assert.equal(closed.notification_status,'sent');assert.equal(network.created.length,1);assert.equal(network.sent.length,1);assert.ok(network.edited.length>=1);assert.equal(network.dms.at(-1).id,ids.reporter);
});

test('resolving before the opening job runs creates no channel or invitations',async()=>{
 const r=await addReport();await submit(r.id).expect(202);await call('admin','post',`/reports/${r.id}/resolve`,{resolution:'Já foi resolvido em atendimento.'}).expect(200);assert.equal((await row(r.id)).status,'closing');
 await bot.work();assert.equal((await row(r.id)).status,'closed');assert.equal(network.created.length,0);assert.equal(network.sent.length,0);assert.equal(network.dms.length,1);assert.equal(network.dms[0].id,ids.reporter);assert.equal((await pool.query("SELECT * FROM jobs WHERE kind='tribunal-invite'")).rowCount,0);assert.equal((await pool.query("SELECT * FROM jobs WHERE status<>'sent'")).rowCount,0);
});
