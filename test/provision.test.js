import {test} from 'node:test';import assert from 'node:assert/strict';
import {Collection,PermissionFlagsBits as P,ChannelType as T} from 'discord.js';
import {provisionGuild,createProvisionHandler,registerCreate} from '../src/provision.js';
import {setupConfig} from '../src/setup-server.js';
const divisions=[{id:1,name:'Primeira',guild:'11111111111111111'},{id:2,name:'Segunda',guild:'22222222222222222'}];
function fake(){let seq=0,creates=0,failAt=0;const roles=new Collection(),channels=new Collection();const me={id:'99999999999999999',permissions:{has:()=>true},roles:{highest:{comparePositionTo:()=>1}}};
 const g={id:divisions[0].guild,ownerId:'88888888888888888',members:{fetchMe:async()=>me,fetch:async()=>({permissions:{has:()=>false}})},roles:{fetch:async()=>roles,create:async data=>{const r={...data,id:String(70000000000000000n+BigInt(++seq)),editable:true,permissions:{has:()=>false},edit:async function(data){Object.assign(this,data)}};roles.set(r.id,r);return r;}},channels:{fetch:async()=>channels,create:async data=>{creates++;if(creates===failAt)throw Error('mock failure');const c={...data,id:String(60000000000000000n+BigInt(++seq)),edit:async function(data){Object.assign(this,data)}};channels.set(c.id,c);return c;}}};return {g,roles,channels,me,setFailure:n=>failAt=n};}
test('provision creates private internal text/voice, public entry, and reuses its resources',async()=>{
 const f=fake();const a=await provisionGuild(f.g,divisions[0]);assert.match(a.env,/DIV_1_GUILD_ID=11111111111111111/);assert.equal(f.roles.size,10);assert.equal(f.channels.size,38);
 for(const ch of f.channels.values()){
  const everyone=ch.permissionOverwrites.find(x=>x.id===f.g.id);
  const publicEntry=ch.name.includes('PORTAL')||['verification','tickets','welcome','rules','guide'].some(key=>ch.topic===`IFJ-D1:${key}`);
  assert.ok(publicEntry?everyone.allow.includes(P.ViewChannel):everyone.deny.includes(P.ViewChannel));
 }
 assert.equal([...f.channels.values()].filter(c=>c.type===T.GuildVoice).length,6);
 assert.deepEqual(await provisionGuild(f.g,divisions[0]),a);assert.equal(f.channels.size,38);assert.equal(f.roles.size,10);
});
test('provision resumes a partial operation without duplicating roles or channels',async()=>{
 const f=fake();f.setFailure(5);await assert.rejects(provisionGuild(f.g,divisions[0]));assert.equal(f.channels.size,4);f.setFailure(0);await provisionGuild(f.g,divisions[0]);assert.equal(f.channels.size,38);assert.equal(f.roles.size,10);
});
test('/criar rejects non-admin, mismatched division and cross-server invocation before creating',async()=>{
 const f=fake(),handler=createProvisionHandler({guilds:{fetch:async()=>f.g}},divisions);
 const make=(id=1,guild=divisions[0].guild)=>({isChatInputCommand:()=>true,commandName:'criar',guildId:guild,user:{id:'33333333333333333'},options:{getString:()=>divisions[0].guild,getInteger:()=>id},deferReply:async()=>{},editReply:async function(r){this.result=r;}});
 const no=make();await handler(no);assert.match(no.result.content,/Somente/);
 const wrong=make(2);await handler(wrong);assert.match(wrong.result.content,/não correspondem/);
 const cross=make(1,divisions[1].guild);await handler(cross);assert.match(cross.result.content,/dentro/);assert.equal(f.channels.size,0);
 const yes=make();yes.user.id=f.g.ownerId;await handler(yes);assert.match(yes.result.content,/Estrutura pronta/);assert.equal(yes.result.files[0].name,'divisao-1.env');
});
test('installer validates distinct guilds and registration preserves unrelated commands',async()=>{
 assert.throws(()=>setupConfig({}),/DISCORD_TOKEN/);assert.throws(()=>setupConfig({DISCORD_TOKEN:'x'.repeat(40),DIV_1_GUILD_ID:divisions[0].guild,DIV_2_GUILD_ID:divisions[0].guild}),/diferentes/);
 const config=setupConfig({DISCORD_TOKEN:'x'.repeat(40),DIV_1_GUILD_ID:divisions[0].guild,DIV_2_GUILD_ID:divisions[1].guild});assert.equal(config.divisions.length,2);
 const registered=[];await registerCreate({guilds:{fetch:async id=>({commands:{create:async data=>registered.push({id,data})}})}},divisions);assert.equal(registered.length,4);assert.equal(registered[0].data.name,'criar');assert.equal(registered[0].data.default_member_permissions,String(P.Administrator));
});
test('missing bot permissions blocks provisioning before creating resources',async()=>{const f=fake();f.me.permissions.has=()=>false;await assert.rejects(provisionGuild(f.g,divisions[0]),/Gerenciar canais/);assert.equal(f.roles.size,0);assert.equal(f.channels.size,0);});
test('legacy structure keeps role, category, voice and panel IDs while being decorated',async()=>{
 const f=fake();const role=await f.g.roles.create({name:'IFJ-D1 • Membro verificado'});const admin=await f.g.roles.create({name:'IFJ-D1 • Equipe'});
 const cat=await f.g.channels.create({name:'IFJ-D1 • ENTRADA',type:T.GuildCategory});
 const call=await f.g.channels.create({name:'IFJ-D1 • Call 1',type:T.GuildVoice});
 const verify=await f.g.channels.create({name:'verificacao',type:T.GuildText,topic:'IFJ-D1:verification'});
 const r=await provisionGuild(f.g,divisions[0]);assert.ok(r.env.includes(`MEMBER_ROLE_ID=${role.id}`));assert.ok(r.env.includes(`ADMIN_ROLE_ID=${admin.id}`));assert.ok(r.env.includes(`VERIFICATION_CHANNEL_ID=${verify.id}`));assert.match(f.channels.get(cat.id).name,/PORTAL/);assert.match(f.channels.get(call.id).name,/🔊/);assert.equal(f.channels.size,38);assert.equal(f.roles.size,10);assert.match(r.inventory,/Líder/);
 const wanted=[...f.channels.values()].find(c=>c.topic==='IFJ-D1:wanted');assert.ok(wanted.permissionOverwrites.find(x=>x.id===role.id).deny.includes(P.SendMessages));
 const leader=[...f.roles.values()].find(r=>r.name.endsWith('Líder'));assert.equal(leader.permissions.has(P.Administrator),false);assert.ok(!wanted.permissionOverwrites.some(x=>x.id===leader.id));
});
test('second division uses blue role colors and has a complete ID inventory',async()=>{const f=fake();f.g.id=divisions[1].guild;const r=await provisionGuild(f.g,divisions[1]);assert.equal(f.roles.size,10);assert.ok([...f.roles.values()].every(role=>role.color===0x38a9ff));assert.ok([...f.channels.values()].filter(c=>c.type===T.GuildCategory).every(c=>c.name.includes('🔵')));assert.equal(r.env.trim().split('\n').length,19);assert.equal(r.inventory.split('\n').filter(l=>/^(CARGO|CATEGORIA|TEXTO|CALL) \|/.test(l)).length,48);});
