import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {PermissionFlagsBits as P} from 'discord.js';
import request from 'supertest';
import {createBot} from '../src/bot.js';
import {createApp} from '../src/app.js';
import {createWarnings,warnCommand} from '../src/warnings.js';
import {hash} from '../src/security.js';
let db,pool,bot,app,adminAllowed=true,missing=false,blocked=false,sequence=0;
const actor='80000000000000001',target='80000000000000002',owner='80000000000000003',outsider='80000000000000004';
const config={secret:'q'.repeat(48),origin:'http://localhost:3000',production:false,divisions:[{id:1,guild:'10000000000000001',name:'Primeira'},{id:2,guild:'20000000000000001',name:'Segunda'}]};
const deliveries=[];
function interaction(guild=config.divisions[0].guild,user=actor,selected={id:target,bot:false},reason='Desrespeito às regras.') {return {id:String(++sequence),guildId:guild,user:{id:user},commandName:'warn',isChatInputCommand:()=>true,options:{getUser:()=>selected,getString:()=>reason},deferReply:async function(x){this.deferred=x;},editReply:async function(x){this.result=x;}};}
before(async()=>{
 db=new PGlite();await db.exec(await readFile(new URL('../src/schema.sql',import.meta.url),'utf8'));
 pool={query:async(s,a)=>{const r=await db.query(s,a);return {...r,rowCount:r.affectedRows||r.rows.length};},connect:async()=>({...pool,release(){}})};
 bot=createBot(pool,config);bot.client.isReady=()=>true;
 bot.client.guilds.fetch=async guild=>({id:guild,ownerId:owner,members:{fetch:async({user,force})=>{assert.equal(force,true);if(user===target&&missing)throw Object.assign(new Error(),{code:10007});return {id:user,roles:{cache:new Map([['equipe',true]])},permissions:{has:p=>p===P.Administrator&&user===actor&&adminAllowed}};}}});
 bot.client.users.fetch=async id=>({send:async message=>{if(blocked)throw Object.assign(new Error(),{code:50007});deliveries.push({id,message});return {id:'msg-'+deliveries.length};}});
 app=createApp(pool,config,bot);
 for(const [role,token]of [['admin','a'.repeat(64)],['moderador','b'.repeat(64)],['recrutador','c'.repeat(64)]]){
  const s=(await pool.query('INSERT INTO staff(username,password_hash,role) VALUES($1,$2,$1) RETURNING id',[role,'not-used'])).rows[0];
  await pool.query('INSERT INTO sessions(token_hash,staff_id,csrf,expires_at) VALUES($1,$2,$3,$4)',[hash(token,config.secret),s.id,'csrf',new Date(Date.now()+60000)]);
 }
});
after(async()=>{await bot.stop();await db.close();});
test('warn schema is discoverable with authorization enforced by bot and registers in both configured guilds only',async()=>{
 const c=warnCommand();assert.equal(c.default_member_permissions,null);assert.deepEqual(c.options.map(o=>[o.name,o.required]),[['membro',true],['motivo',true]]);
 const seen=[];await createWarnings(pool,config,{guilds:{fetch:async id=>({commands:{create:async cmd=>seen.push([id,cmd.name])}})}}).register();assert.deepEqual(seen,config.divisions.map(d=>[d.guild,'warn']));
});
test('DM, old server, ordinary members and team-only members are rejected without writes',async()=>{
 for(const guild of [null,'90000000000000000']){const i=interaction(guild);await bot.handleInteraction(i);assert.match(i.result.content,/somente no servidor/);}
 for(const user of [outsider,actor]){adminAllowed=false;const i=interaction(config.divisions[0].guild,user);await bot.handleInteraction(i);assert.match(i.result.content,/Somente o dono/);assert.equal(i.deferred.flags,64);}adminAllowed=true;
 assert.equal((await pool.query('SELECT * FROM warnings')).rowCount,0);assert.equal((await pool.query('SELECT * FROM jobs')).rowCount,0);
});
test('current-server admin and owner can warn; repeated interaction never duplicates warning or DM job',async()=>{
 for(const [index,user]of [[0,actor],[1,owner]]){const i=interaction(config.divisions[index].guild,user);await bot.handleInteraction(i);await bot.handleInteraction(i);assert.match(i.result.content,/já estava registrada/);}
 const rows=(await pool.query('SELECT * FROM warnings ORDER BY id')).rows;assert.equal(rows.length,2);assert.equal(rows[0].actor_id,actor);assert.equal(rows[1].actor_id,owner);assert.equal(rows[1].division,2);assert.equal((await pool.query('SELECT * FROM jobs')).rowCount,2);
});
test('target must be another human in this server; empty or oversized reason cannot write',async()=>{
 const count=(await pool.query('SELECT * FROM warnings')).rowCount;
 for(const selected of [{id:actor,bot:false},{id:target,bot:true}]){const i=interaction(undefined,actor,selected);await bot.handleInteraction(i);assert.match(i.result.content,/outro membro humano/);}
 missing=true;const i=interaction();await bot.handleInteraction(i);assert.match(i.result.content,/não está neste servidor/);missing=false;
 for(const reason of ['   ','x'.repeat(1001)])await assert.rejects(bot.handleInteraction(interaction(undefined,actor,undefined,reason)));
 assert.equal((await pool.query('SELECT * FROM warnings')).rowCount,count);
});
test('queued warning is private, retains reason, author and division, without changing IFJs or roles',async()=>{
 await bot.work();assert.equal(deliveries.length,2);assert.ok(deliveries.every(d=>d.id===target));const msg=deliveries[1].message;assert.deepEqual(msg.allowedMentions,{parse:[]});const e=msg.embeds[0].toJSON();assert.equal(e.description,'Desrespeito às regras.');assert.equal(e.fields[0].value,'Segunda');assert.equal(e.fields[1].value,owner);assert.equal((await pool.query('SELECT * FROM members')).rowCount,0);assert.equal((await pool.query("SELECT * FROM jobs WHERE kind='sync-role'")).rowCount,0);
});
test('DM block preserves warning; panel is admin-only and retry sends the original notice',async()=>{
 await bot.handleInteraction(interaction());blocked=true;await bot.work();
 await request(app).get('/api/warnings').expect(401);
 for(const key of ['b','c'])await request(app).get('/api/warnings').set('Cookie',`ifj_session=${key.repeat(64)}`).expect(403);
 const rows=(await request(app).get('/api/warnings').set('Cookie',`ifj_session=${'a'.repeat(64)}`).expect(200)).body;assert.equal(rows.length,3);assert.equal(rows[0].notification_status,'failed');assert.match(rows[0].notification_error,/mensagem privada/);
 await request(app).post(`/api/jobs/${rows[0].notification_job_id}/retry`).set('Origin',config.origin).set('X-CSRF-Token','csrf').set('Cookie',`ifj_session=${'a'.repeat(64)}`).send({}).expect(200);
 blocked=false;await bot.work();assert.equal(deliveries.length,3);assert.equal((await pool.query('SELECT * FROM warnings')).rowCount,3);
});
