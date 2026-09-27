import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const app=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const markup=readFileSync(new URL('../public/panel.html',import.meta.url),'utf8');
// Exercise the browser event handlers with a small DOM fixture; no network or database.
function fixture(overrides={}){
 const elements=new Map();
 class Element{
  constructor(id=''){this.id=id;this.dataset={};this.attributes={};this.value='';this.textContent='';this.hidden=false;this.disabled=false;this.children=[];this.dynamicIds=[];}
  set innerHTML(html){
   for(const id of this.dynamicIds)elements.delete(id);
   this.dynamicIds=[];this.html=html;
   for(const match of html.matchAll(/<[^>]+\bid="([^"]+)"[^>]*>/g)){
    const element=new Element(match[1]);element.hidden=/\shidden(?:\s|>)/.test(match[0]);element.value=/\bvalue="([^"]*)"/.exec(match[0])?.[1]||'';elements.set(element.id,element);this.dynamicIds.push(element.id);
   }
   this.children=[...html.matchAll(/<button\s[^>]*data-tab="([^"]+)"[^>]*>/g)].map(match=>{const button=new Element();button.dataset.tab=match[1];button.setAttribute('aria-current',/aria-current="([^"]*)"/.exec(match[0])?.[1]);return button;});
  }
  get innerHTML(){return this.html||'';}
  setAttribute(key,value){this.attributes[key]=String(value);}
  getAttribute(key){return this.attributes[key]??null;}
  removeAttribute(key){delete this.attributes[key];}
  querySelectorAll(selector){return selector==='button'?this.children:[];}
  querySelector(selector){if(selector==='button')return this.submitButton??=new Element();return null;}
  addEventListener(){}
  focus(){this.focused=true;}
 }
 for(const match of markup.matchAll(/\bid="([^"]+)"/g))elements.set(match[1],new Element(match[1]));
 const identity={id:7,username:'Equipe',role:'moderador',discord_verified:true,discord_id:'123456789012345678',needs_discord:false,divisions:[],...overrides};
 const context=vm.createContext({document:{getElementById:id=>elements.get(id)||null,addEventListener(){},body:{classList:{remove(){},toggle(){return false;}}}},seed:identity,location:{},URL,console});
 vm.runInContext(app.slice(0,app.lastIndexOf('(async()=>')),context);
 vm.runInContext('me=seed; loadMembers=async()=>{$("view").innerHTML="<p>MEMBERS</p>";}; loadWarnings=async()=>{$("view").innerHTML="<p>WARNINGS</p>";};',context);
 context.api=async()=>{throw Error('Unexpected request');};
 return {context,get:id=>elements.get(id)||null,identity,select(key){context.nav();elements.get('nav').children.find(button=>button.dataset.tab===key).onclick();},state:()=>vm.runInContext('({current,linkingDiscord,me})',context)};
}
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const submit=form=>form.onsubmit({preventDefault(){},target:form});

test('verified Discord opens a confirmed overview; changing it is optional and cancelable',async()=>{
 const f=fixture();await f.context.load();f.get('discord-account').onclick();
 assert.match(f.get('view').innerHTML,/Discord confirmado/);
 assert.match(f.get('view').innerHTML,new RegExp(f.identity.discord_id));
 assert.equal(f.get('discord-start-form'),null);
 assert.equal(f.get('discord-account').getAttribute('aria-current'),'page');
 assert.ok(f.get('nav').children.every(button=>button.getAttribute('aria-current')==='false'));
 f.get('discord-change').onclick();assert.ok(f.get('discord-start-form'));
 f.get('discord-back').onclick();assert.equal(f.get('discord-start-form'),null);assert.match(f.get('view').innerHTML,/Discord confirmado/);
 f.get('discord-back').onclick();assert.match(f.get('view').innerHTML,/MEMBERS/);
 assert.equal(f.state().linkingDiscord,false);
});

test('category navigation exits Meu Discord and loads the selected category',async()=>{
 const f=fixture();await f.context.load();f.get('discord-account').onclick();f.select('warnings');
 assert.equal(f.state().current,'warnings');assert.equal(f.state().linkingDiscord,false);
 assert.match(f.get('view').innerHTML,/WARNINGS/);assert.equal(f.get('discord-account').getAttribute('aria-current'),'false');
});

test('unverified staff remain gated when selecting another category',async()=>{
 const f=fixture({discord_verified:false,needs_discord:true,discord_id:null});await f.context.load();
 assert.ok(f.get('discord-start-form'));assert.equal(f.get('discord-back'),null);f.select('warnings');
 assert.ok(f.get('discord-start-form'));assert.match(f.get('view').innerHTML,/Confirme sua conta para continuar/);assert.doesNotMatch(f.get('view').innerHTML,/WARNINGS/);
});

test('delayed code delivery cannot write to a category opened after the request',async()=>{
 for(const failed of [false,true]){
  const f=fixture();const response=deferred();f.context.api=()=>response.promise;
  await f.context.load();f.get('discord-account').onclick();f.get('discord-change').onclick();
  const pending=submit(f.get('discord-start-form'));f.select('warnings');
  if(failed)response.reject(Error('Delivery failed'));else response.resolve({message:'Código enviado'});
  await pending;assert.match(f.get('view').innerHTML,/WARNINGS/);assert.equal(f.get('discord-feedback'),null);assert.equal(f.get('notice').textContent,'');
 }
});

test('delayed confirmation updates account state without reopening or overwriting the category',async()=>{
 const f=fixture();const response=deferred();const updated={...f.identity,discord_id:'987654321098765432'};
 f.context.api=async url=>url==='/me'?updated:response.promise;
 await f.context.load();f.get('discord-account').onclick();f.get('discord-change').onclick();f.get('discord-code').value='123456';
 const pending=submit(f.get('discord-confirm-form'));f.select('warnings');response.resolve({});await pending;
 assert.match(f.get('view').innerHTML,/WARNINGS/);assert.equal(f.state().current,'warnings');assert.equal(f.state().linkingDiscord,false);assert.equal(f.get('notice').textContent,'');assert.equal(f.state().me.discord_id,updated.discord_id);
});

test('required confirmation unlocks the panel and recruiter copy does not grant warn',async()=>{
 const f=fixture({role:'recrutador',discord_verified:false,needs_discord:true,discord_id:null});
 f.context.api=async url=>url==='/me'?{...f.identity,discord_verified:true,needs_discord:false,discord_id:'123456789012345678'}:{};
 await f.context.load();f.get('discord-code').value='123456';await submit(f.get('discord-confirm-form'));
 assert.match(f.get('view').innerHTML,/MEMBERS/);assert.equal(f.state().me.needs_discord,false);
 f.get('discord-account').onclick();assert.match(f.get('view').innerHTML,/Sua patente não tem acesso ao \/warn/);assert.equal(f.get('discord-start-form'),null);
});
