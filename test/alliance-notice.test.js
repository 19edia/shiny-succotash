import {test} from 'node:test';
import assert from 'node:assert/strict';
import {allianceMessage,publishAlliance} from '../src/alliance-notice.js';
import {validateEnvironment} from '../src/config-rules.js';
const invite='https://discord.gg/a9tUzVxdQ';
test('HYDRA notice includes invite and decorated closing, uses division colors and disables mentions',()=>{
 for(const id of [1,2]){const m=allianceMessage({id},invite),e=m.embeds[0].toJSON();assert.match(e.title,/HYDRA NO KAI/);assert.ok(e.description.includes(invite));assert.doesNotMatch(e.description,/Entre se quiser/);assert.ok(e.description.endsWith('*⚔️ Duas forças, uma aliança. 🤝*'));assert.equal(e.color,id===1?0x69f06a:0x38a9ff);assert.deepEqual(m.allowedMentions,{parse:[]});}
});
test('publishes in correct channels, updates same messages, recovers deletion and rejects wrong guild',async()=>{
 const ids=['1551393214714482748','1551393565471674441'],stored=new Map(),sent=[],edited=[];let wrong=false,deleted=false;
 const pool={query:async(s,a)=>{if(s.startsWith('SELECT'))return {rows:stored.has(a[0])?[{message_id:stored.get(a[0])}]:[]};stored.set(a[0],a[1]);return {rows:[]};}};
 const client={user:{id:'bot'},channels:{fetch:async id=>({guildId:wrong?'wrong':String(ids.indexOf(id)+1),isTextBased:()=>true,send:async m=>{sent.push([id,m]);return {id:'message-'+sent.length};},messages:{fetch:async arg=>{if(typeof arg==='object')return new Map();if(deleted)throw Object.assign(new Error(),{code:10008});return {id:'message-'+(ids.indexOf(id)+1),author:{id:'bot'},embeds:[{title:'ROKUHARA × HYDRA NO KAI'}],edit:async m=>edited.push([id,m])};}}})}};
 for(let n=1;n<=2;n++){const d={id:n,guild:String(n),allianceChannel:ids[n-1]};await publishAlliance(pool,client,d,invite);await publishAlliance(pool,client,d,invite);}
 assert.equal(sent.length,2);assert.equal(edited.length,2);assert.deepEqual(sent.map(x=>x[0]),ids);
 deleted=true;await publishAlliance(pool,client,{id:1,guild:'1',allianceChannel:ids[0]},invite);assert.equal(sent.length,3);
 wrong=true;await assert.rejects(publishAlliance(pool,client,{id:1,guild:'1',allianceChannel:ids[0]},invite),/canal inválido/);
});
test('invalid or overlapping alliance channels and missing invite fail config',()=>{
 const c=validateEnvironment({BOT_ENABLED:'false',DIV_1_ALLIANCE_CHANNEL_ID:'1551393214714482748',DIV_2_ALLIANCE_CHANNEL_ID:'1551393214714482748'});assert.ok(c.some(x=>x.key==='ALLIANCE_CHANNELS_DISTINCT'&&!x.ok));assert.ok(c.some(x=>x.key==='HYDRA_INVITE_URL'&&!x.ok));
});
