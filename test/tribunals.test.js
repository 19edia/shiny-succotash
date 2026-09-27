import {test,before,beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {Collection,ChannelType,PermissionFlagsBits as P,PermissionsBitField} from 'discord.js';
import {createTribunals} from '../src/tribunals.js';

const ids={admin:'80000000000000001',reporter:'80000000000000002',accused:'80000000000000003',bot:'80000000000000004',changed:'80000000000000005'};
const config={divisions:[
 {id:1,name:'Primeira',guild:'10000000000000001',category:'10000000000000002',adminRole:'10000000000000003'},
 {id:2,name:'Segunda',guild:'20000000000000001',category:'20000000000000002',adminRole:'20000000000000003'}
]};
let db,pool,tribunals,client,staffId,network;
const plain=value=>value?.toJSON?.()??value;
const has=(permissions,flag)=>new PermissionsBitField(permissions??[]).has(flag);

function discordMock(){
 const state={channels:new Collection(),created:[],overwrites:[],sent:[],edited:[],deleted:[],members:[],missing:new Set(),bots:new Set(),dms:[]};
 const guilds=new Map();
 function channel(id,options){
  const messages=new Collection();
  const ch={id,guildId:options.guildId,type:ChannelType.GuildText,parentId:options.parent,...options,isTextBased:()=>true,
   permissionsFor:()=>({has:()=>true}),
   permissionOverwrites:{set:async overwrites=>{state.overwrites.push({id,overwrites});ch.permissionOverwrites.cache=new Collection(overwrites.map(x=>[x.id,x]));return ch;},cache:new Collection()},
   delete:async()=>state.deleted.push(id),
   edit:async options=>{Object.assign(ch,options);return ch;},
   setName:async name=>{ch.name=name;return ch;},
   setTopic:async topic=>{ch.topic=topic;return ch;},
   messages:{fetch:async argument=>{if(typeof argument==='object')return messages;const message=messages.get(argument);if(!message)throw Object.assign(new Error('Unknown message'),{code:10008});return message;}},
   send:async payload=>{
    const message={id:`message-${state.sent.length+1}`,author:{id:ids.bot},embeds:(payload.embeds??[]).map(plain),components:(payload.components??[]).map(plain),
     edit:async payload=>{state.edited.push({channelId:id,payload});message.embeds=(payload.embeds??[]).map(plain);message.components=(payload.components??[]).map(plain);return message;}};
    state.sent.push({channelId:id,payload});messages.set(message.id,message);return message;
   }
  };
  state.channels.set(id,ch);return ch;
 }
 for(const d of config.divisions){
  state.channels.set(d.category,{id:d.category,guildId:d.guild,type:ChannelType.GuildCategory});
  const g={id:d.guild,roles:{everyone:{id:d.guild}},members:{
   me:{id:ids.bot,permissions:{has:()=>true}},
   fetch:async input=>{const id=typeof input==='string'?input:input.user;state.members.push({guildId:d.guild,id});if(state.missing.has(id))throw Object.assign(new Error('Unknown member'),{code:10007});return {id,user:{id,bot:state.bots.has(id)},permissions:{has:()=>true}};}
  },channels:{
   fetch:async id=>id?(state.channels.get(id)??null):new Collection([...state.channels].filter(([,ch])=>ch.guildId===d.guild)),
   create:async options=>{state.created.push({guildId:d.guild,...options});return channel(`3000000000000000${state.created.length}`,{...options,guildId:d.guild});}
  }};
  guilds.set(d.guild,g);
 }
 const client={user:{id:ids.bot},isReady:()=>true,guilds:{fetch:async id=>guilds.get(id)},channels:{fetch:async id=>state.channels.get(id)??null},users:{fetch:async id=>({id,bot:state.bots.has(id),send:async payload=>{state.dms.push({id,payload});return {id:`dm-${state.dms.length}`};}})}};
 return {client,state,channel};
}

async function report(overrides={}){
 const values={subject:'Pessoa denunciada',reporter_id:ids.reporter,division:1,reason:'Relato para apuração, sem conclusão antecipada.',subject_discord_id:ids.accused,status:'pendente',...overrides};
 const keys=Object.keys(values);
 return (await pool.query(`INSERT INTO reports(${keys.join(',')}) VALUES(${keys.map((_,i)=>`$${i+1}`).join(',')}) RETURNING *`,Object.values(values))).rows[0];
}
const getTribunal=async reportId=>(await pool.query('SELECT * FROM tribunals WHERE report_id=$1',[reportId])).rows[0];
const getJob=async kind=>(await pool.query('SELECT * FROM jobs WHERE kind=$1 ORDER BY id DESC LIMIT 1',[kind])).rows[0];
async function open(reportId){await tribunals.request(reportId,staffId);await tribunals.execute(await getJob('tribunal-open'),pool);return getTribunal(reportId);}

before(async()=>{
 db=new PGlite();await db.exec(await readFile(new URL('../src/schema.sql',import.meta.url),'utf8'));
 pool={query:async(sql,args)=>{const result=await db.query(sql,args);return {...result,rowCount:result.affectedRows||result.rows.length};},connect:async()=>({...pool,release(){}})};
});
beforeEach(async()=>{
 await pool.query('TRUNCATE staff,members,reports,jobs,panels,audit RESTART IDENTITY CASCADE');
 staffId=(await pool.query("INSERT INTO staff(username,password_hash,role,discord_id,discord_verified_at) VALUES('admin','not-used','admin',$1,now()) RETURNING id",[ids.admin])).rows[0].id;
 const mock=discordMock();client=mock.client;network=mock.state;tribunals=createTribunals(pool,config,client);
});
after(async()=>{await db.close();});

test('only an active administrator with a verified Discord identity can request a tribunal',async()=>{
 const r=await report();
 for(const role of ['moderador','recrutador']){await pool.query('UPDATE staff SET role=$1 WHERE id=$2',[role,staffId]);await assert.rejects(tribunals.request(r.id,staffId));}
 await pool.query("UPDATE staff SET role='admin',active=false WHERE id=$1",[staffId]);await assert.rejects(tribunals.request(r.id,staffId));
 await pool.query('UPDATE staff SET active=true,discord_verified_at=NULL WHERE id=$1',[staffId]);await assert.rejects(tribunals.request(r.id,staffId));
 await pool.query('UPDATE staff SET discord_id=NULL,discord_verified_at=now() WHERE id=$1',[staffId]);await assert.rejects(tribunals.request(r.id,staffId));
 await assert.rejects(tribunals.request(r.id,999));
 assert.equal((await pool.query('SELECT * FROM tribunals')).rowCount,0);assert.equal((await pool.query('SELECT * FROM jobs')).rowCount,0);
});

test('request binds the original accused snapshot and remains idempotent for one report',async()=>{
 const member=(await pool.query("INSERT INTO members(ifj,name,discord_id,division) VALUES('123456789012345','Pessoa original',$1,1) RETURNING id",[ids.accused])).rows[0];
 const r=await report({member_id:member.id});
 await pool.query('UPDATE members SET discord_id=$1 WHERE id=$2',[ids.changed,member.id]);
 const created=await tribunals.request(r.id,staffId);await tribunals.request(r.id,staffId);
 const row=await getTribunal(r.id);assert.ok(created);assert.equal(row.accused_id,ids.accused);assert.equal(row.reporter_id,ids.reporter);assert.equal(row.admin_discord_id,ids.admin);assert.equal(row.created_by,staffId);assert.equal(row.division,1);assert.equal(row.guild_id,config.divisions[0].guild);assert.equal(row.status,'pending');assert.ok(row.channel_token);
 assert.equal((await pool.query('SELECT * FROM tribunals')).rowCount,1);const jobs=(await pool.query("SELECT * FROM jobs WHERE kind='tribunal-open'")).rows;assert.equal(jobs.length,1);assert.equal(jobs[0].payload.reportId,r.id);
});

test('deleting the IFJ does not erase the identity needed to open the original report',async()=>{
 const member=(await pool.query("INSERT INTO members(ifj,name,discord_id,division) VALUES('123456789012345','Pessoa removida',$1,1) RETURNING id",[ids.accused])).rows[0];
 const r=await report({member_id:member.id});await pool.query('DELETE FROM members WHERE id=$1',[member.id]);await tribunals.request(r.id,staffId);assert.equal((await getTribunal(r.id)).accused_id,ids.accused);
});

test('resolved or nonexistent reports do not create a tribunal or queue work',async()=>{
 const r=await report({status:'resolvida',resolution:'Apuração já finalizada.'});await assert.rejects(tribunals.request(r.id,staffId));await assert.rejects(tribunals.request(999,staffId));
 assert.equal((await pool.query('SELECT * FROM tribunals')).rowCount,0);assert.equal((await pool.query('SELECT * FROM jobs')).rowCount,0);
});

test('reports without an accused snapshot and reports against the reporter cannot create a tribunal',async()=>{
 for(const data of [{subject_discord_id:null},{subject_discord_id:ids.reporter}]){const r=await report(data);await assert.rejects(tribunals.request(r.id,staffId));}
 assert.equal((await pool.query('SELECT * FROM tribunals')).rowCount,0);assert.equal((await pool.query('SELECT * FROM jobs')).rowCount,0);
});

test('the selected configured division determines the tribunal server and invalid divisions are rejected',async()=>{
 const invalid=await report();await assert.rejects(tribunals.request(invalid.id,staffId,3));assert.equal((await pool.query('SELECT * FROM tribunals')).rowCount,0);
 const r=await report();await tribunals.request(r.id,staffId,2);const row=await getTribunal(r.id);assert.equal(row.division,2);assert.equal(row.guild_id,config.divisions[1].guild);
});

test('worker opens one private channel with both parties, the administrator and bot, without granting the team role access',async()=>{
 const r=await report();const row=await open(r.id);assert.equal(row.status,'open');assert.equal(network.created.length,1);
 const options=network.created[0];assert.equal(options.parent,config.divisions[0].category);assert.equal(options.type,ChannelType.GuildText);assert.ok(options.topic.includes(row.channel_token));
 const permissions=options.permissionOverwrites;assert.ok(permissions.some(p=>p.id===row.guild_id&&has(p.deny,P.ViewChannel)));assert.ok(!permissions.some(p=>p.id===config.divisions[0].adminRole));
 for(const id of [ids.admin,ids.reporter,ids.accused,ids.bot]){const permission=permissions.find(p=>p.id===id);assert.ok(permission,`missing overwrite for ${id}`);assert.ok(has(permission.allow,P.ViewChannel));assert.ok(has(permission.allow,P.SendMessages));}
 assert.ok(network.members.some(x=>x.id===ids.reporter));assert.ok(network.members.some(x=>x.id===ids.accused));assert.ok(network.members.some(x=>x.id===ids.admin));
 assert.equal(network.sent.length,1);assert.deepEqual(network.sent[0].payload.allowedMentions,{parse:[]});
 await tribunals.execute(await getJob('tribunal-open'),pool);assert.equal(network.created.length,1);assert.equal(network.sent.length,1);
});

test('missing or bot participants cannot create a tribunal channel',async()=>{
 for(const [type,id] of [['missing',ids.reporter],['missing',ids.accused],['missing',ids.admin],['bots',ids.reporter],['bots',ids.accused],['bots',ids.admin]]){
  const r=await report();await tribunals.request(r.id,staffId);network[type].add(id);await assert.rejects(tribunals.execute(await getJob('tribunal-open'),pool));network[type].delete(id);
 }
 assert.equal(network.created.length,0);assert.equal(network.sent.length,0);
});

test('an administrator who is one of the parties receives a single permission overwrite',async()=>{
 const r=await report({reporter_id:ids.admin});await open(r.id);const permissions=network.created[0].permissionOverwrites;assert.equal(permissions.filter(p=>p.id===ids.admin).length,1);
});

test('worker revalidates administrator access and identity before creating a channel',async()=>{
 const r=await report();await tribunals.request(r.id,staffId);const job=await getJob('tribunal-open');
 for(const values of [{active:false},{role:'moderador'},{discord_verified_at:null},{discord_id:ids.changed}]){
  const fields=Object.keys(values);await pool.query(`UPDATE staff SET ${fields.map((name,i)=>`${name}=$${i+1}`).join(',')} WHERE id=$${fields.length+1}`,[...Object.values(values),staffId]);await assert.rejects(tribunals.execute(job,pool));
  await pool.query("UPDATE staff SET active=true,role='admin',discord_id=$1,discord_verified_at=now() WHERE id=$2",[ids.admin,staffId]);
 }
 assert.equal(network.created.length,0);assert.equal((await getTribunal(r.id)).status,'pending');
});

test('resolving a report while opening is queued cancels channel creation',async()=>{
 const r=await report();await tribunals.request(r.id,staffId);await pool.query("UPDATE reports SET status='resolvida',resolution='Resolvida antes da abertura.' WHERE id=$1",[r.id]);
 await tribunals.execute(await getJob('tribunal-open'),pool);const row=await getTribunal(r.id);assert.equal(row.status,'closed');assert.ok(row.closed_at);assert.equal(network.created.length,0);assert.equal(network.sent.length,0);assert.equal((await pool.query("SELECT * FROM jobs WHERE kind='tribunal-invite'")).rowCount,0);
});

test('invitations go privately to the three participants with the correct tribunal link and ignore outsiders',async()=>{
 const r=await report();const row=await open(r.id);const jobs=(await pool.query("SELECT * FROM jobs WHERE kind='tribunal-invite' ORDER BY id")).rows;
 assert.equal(jobs.length,3);assert.deepEqual(new Set(jobs.map(job=>job.payload.discordId)),new Set([ids.admin,ids.reporter,ids.accused]));
 for(const job of jobs)await tribunals.execute(job,pool);
 assert.equal(network.dms.length,3);
 for(const {payload}of network.dms){assert.deepEqual(payload.allowedMentions,{parse:[]});assert.ok(JSON.stringify(payload).includes(`https://discord.com/channels/${row.guild_id}/${row.channel_id}`));assert.equal(payload.enforceNonce,true);assert.ok(payload.nonce);}
 await tribunals.execute({id:999,kind:'tribunal-invite',payload:{reportId:r.id,discordId:ids.changed}},pool);assert.equal(network.dms.length,3);
 await pool.query("UPDATE tribunals SET status='closed' WHERE report_id=$1",[r.id]);await tribunals.execute(jobs[0],pool);assert.equal(network.dms.length,3);
});

test('retry recovers a previously created channel and original intro when database persistence was rolled back',async()=>{
 const r=await report();const first=await open(r.id);const count=network.sent.length;
 await pool.query("UPDATE tribunals SET status='pending',channel_id=NULL,intro_message_id=NULL WHERE report_id=$1",[r.id]);await pool.query('DELETE FROM panels WHERE channel_id=$1',[first.channel_id]);
 await tribunals.execute(await getJob('tribunal-open'),pool);const recovered=await getTribunal(r.id);assert.equal(recovered.channel_id,first.channel_id);assert.equal(recovered.status,'open');assert.equal(network.created.length,1);assert.equal(network.sent.length,count);assert.ok(network.edited.length>=1);
});

test('closing archives the channel as read-only and edits the original intro with the recorded conclusion',async()=>{
 const r=await report();const opened=await open(r.id);await pool.query("UPDATE reports SET status='resolvida',resolution='Ouvidas ambas as partes; denúncia encerrada.' WHERE id=$1",[r.id]);await pool.query("UPDATE tribunals SET status='closing' WHERE report_id=$1",[r.id]);
 await tribunals.execute({kind:'tribunal-close',payload:{reportId:r.id}},pool);const closed=await getTribunal(r.id);assert.equal(closed.status,'closed');assert.ok(closed.closed_at);assert.equal(closed.channel_id,opened.channel_id);assert.equal(network.deleted.length,0);assert.equal(network.created.length,1);
 const permissions=network.overwrites.at(-1).overwrites;
 for(const id of [ids.reporter,ids.accused]){const permission=permissions.find(p=>p.id===id);assert.ok(has(permission.allow,P.ViewChannel));assert.ok(!has(permission.allow,P.SendMessages));for(const flag of [P.SendMessages,P.ManageMessages,P.ManageThreads,P.ManageWebhooks,P.SendMessagesInThreads])assert.ok(has(permission.deny,flag));}
 assert.ok(permissions.some(p=>p.id===closed.guild_id&&has(p.deny,P.ViewChannel)));assert.ok(!permissions.some(p=>p.id===config.divisions[0].adminRole));assert.equal(network.sent.length,1);assert.ok(network.edited.length>=1);assert.match(JSON.stringify(network.edited.at(-1).payload),/Ouvidas ambas as partes/);
 await tribunals.execute({kind:'tribunal-close',payload:{reportId:r.id}},pool);assert.equal(network.sent.length,1);assert.equal(network.deleted.length,0);
});

test('maximum markdown-heavy report and conclusion fit Discord embed limits when the tribunal closes',async()=>{
 const r=await report({reason:'*'.repeat(1800)});await open(r.id);await pool.query("UPDATE reports SET status='resolvida',resolution=$1 WHERE id=$2",['*'.repeat(2000),r.id]);await pool.query("UPDATE tribunals SET status='closing' WHERE report_id=$1",[r.id]);
 await tribunals.execute({kind:'tribunal-close',payload:{reportId:r.id}},pool);
 const payload=network.edited.at(-1).payload;let total=0;
 for(const value of payload.embeds){const embed=plain(value);assert.ok((embed.description?.length??0)<=4096);assert.ok((embed.fields?.length??0)<=25);total+=(embed.title?.length??0)+(embed.description?.length??0)+(embed.footer?.text.length??0)+(embed.author?.name.length??0);for(const field of embed.fields??[]){assert.ok(field.name.length<=256);assert.ok(field.value.length<=1024);total+=field.name.length+field.value.length;}}
 assert.ok(total<=6000,`Discord only accepts 6000 embed text characters; got ${total}`);assert.equal((await getTribunal(r.id)).status,'closed');
 const record=payload.files.find(file=>file.name.endsWith('.txt')).attachment.toString('utf8');assert.ok(record.includes(`RELATO\n${'*'.repeat(1800)}\n`));assert.ok(record.includes(`CONCLUSÃO\n${'*'.repeat(2000)}`));
});

test('schema migration backfills legacy accused identities once and never rewrites them on later boots',async()=>{
 const schema=await readFile(new URL('../src/schema.sql',import.meta.url),'utf8');
 await pool.query('ALTER TABLE reports DROP COLUMN subject_discord_id');
 const member=(await pool.query("INSERT INTO members(ifj,name,discord_id,division) VALUES('123456789012345','Pessoa original',$1,1) RETURNING id",[ids.accused])).rows[0];
 const legacy=(await pool.query("INSERT INTO reports(member_id,subject,reporter_id,division,reason) VALUES($1,'Denúncia legada',$2,1,'Relato antigo.') RETURNING id",[member.id,ids.reporter])).rows[0];
 await db.exec(schema);assert.equal((await pool.query('SELECT subject_discord_id FROM reports WHERE id=$1',[legacy.id])).rows[0].subject_discord_id,ids.accused);
 await pool.query('UPDATE members SET discord_id=$1 WHERE id=$2',[ids.changed,member.id]);const unknown=await report({member_id:member.id,subject_discord_id:null});
 await db.exec(schema);assert.equal((await pool.query('SELECT subject_discord_id FROM reports WHERE id=$1',[legacy.id])).rows[0].subject_discord_id,ids.accused);assert.equal((await pool.query('SELECT subject_discord_id FROM reports WHERE id=$1',[unknown.id])).rows[0].subject_discord_id,null);
});
