import {test} from 'node:test';
import assert from 'node:assert/strict';
import {matchesPanel,publishPanel,findPanel,panelPayload} from '../src/panels.js';
const content={embeds:[{title:'❖ ┃ Verificação IFJ',description:'Versão atual',footer:{text:'ROKUHARA'}}],components:[{type:1,components:[{type:2,custom_id:'verify',label:'Verificar',style:1}]}]};
function fixture(initial=[],saved){
 const messages=new Map(initial.map(m=>[m.id,m]));let sent=0,edited=0,queries=0,failSave=false,fetchError;
 const channel={messages:{fetch:async arg=>{if(fetchError)throw fetchError;if(typeof arg==='string'){const m=messages.get(arg);if(!m)throw Object.assign(new Error('deleted'),{code:10008});return m;}return new Map([...messages].reverse());}},send:async payload=>{sent++;const m=message(String(1000+sent),payload);messages.set(m.id,m);return m;}};
 function message(id,payload=content,author='bot'){return {id,author:{id:author},...payload,edit:async p=>{edited++;Object.assign(messages.get(id),p);}};}
 for(const [id,m] of messages)messages.set(id,{...m,edit:async p=>{edited++;Object.assign(messages.get(id),p);}});
 const pool={query:async(sql,args)=>{queries++;if(sql.startsWith('SELECT'))return {rows:saved?[{message_id:saved}]:[]};if(failSave)throw Error('database unavailable');saved=args[1];return {rows:[]};}};
 return {channel,pool,client:{user:{id:'bot'}},messages,message,get sent(){return sent},get edited(){return edited},get saved(){return saved},set failSave(v){failSave=v},set fetchError(v){fetchError=v}};
}
const legacy=(id,author='bot')=>({id,author:{id:author},...content});
const publish=f=>publishPanel(f.pool,f.client,f.channel,'channel','verify',content);
test('recovers legacy own panel without database ID, updates it and persists ID',async()=>{const f=fixture([legacy('10')]);await publish(f);assert.equal(f.sent,0);assert.equal(f.edited,1);assert.equal(f.saved,'10');assert.match(f.messages.get('10').embeds[0].footer.text,/IFJ:verify/);});
test('stale ID recovers existing panel; unrelated authors, webhooks and embed types are ignored',async()=>{const unrelated=legacy('other');unrelated.embeds=[{title:'Outro assunto'}];unrelated.components=[];const hook={...legacy('hook'),webhookId:'webhook'};const f=fixture([legacy('own'),legacy('human','person'),legacy('otherbot','bot2'),unrelated,hook],'deleted');await publish(f);assert.equal(f.saved,'own');assert.equal(f.sent,0);assert.equal(f.edited,1);});
test('a saved unrelated message is never overwritten',async()=>{const f=fixture([legacy('human','person')],'human');await publish(f);assert.equal(f.edited,0);assert.equal(f.sent,1);});
test('concurrent publication creates one panel and edits it on the second request',async()=>{const f=fixture();await Promise.all([publish(f),publish(f)]);assert.equal(f.sent,1);assert.equal(f.edited,1);});
test('failed database save recovers the sent message on retry',async()=>{const f=fixture();f.failSave=true;await assert.rejects(publish(f),/database/);f.failSave=false;await publish(f);assert.equal(f.sent,1);assert.equal(f.edited,1);});
test('permission or network failures never fall through to a duplicate send',async()=>{const f=fixture();f.fetchError=Object.assign(Error('missing history permission'),{code:50013});await assert.rejects(publish(f),/permission/);assert.equal(f.sent,0);});
test('history search paginates beyond 100 messages',async()=>{let calls=0;const channel={messages:{fetch:async options=>{calls++;if(!options.before)return new Map(Array.from({length:100},(_,i)=>[String(200-i),{id:String(200-i),author:{id:'person'}}]));assert.equal(options.before,'101');return new Map([['100',legacy('100')]]);}}};assert.equal((await findPanel(channel,'bot','verify')).id,'100');assert.equal(calls,2);});
test('markers distinguish panel types and legacy titles support migrations',()=>{const m={id:'1',author:{id:'bot'},embeds:[{title:'❖ ┃ ROKUHARA × RYUKETSU'}]};assert.equal(matchesPanel(m,'bot','alliance'),true);assert.equal(matchesPanel(m,'bot','guide'),false);assert.equal(matchesPanel({...legacy('2'),embeds:[{footer:{text:'ROKUHARA · IFJ:report'}}]},'bot','verify'),false);assert.deepEqual(panelPayload({embeds:[]},'guide').allowedMentions,{parse:[]});});
test('deleted panel is recreated; deleted during edit is recreated once',async()=>{const f=fixture([],'deleted');await publish(f);assert.equal(f.sent,1);const m=f.messages.get(f.saved);m.edit=async()=>{f.messages.delete(m.id);throw Object.assign(Error('deleted'),{code:10008});};await publish(f);assert.equal(f.sent,2);});
