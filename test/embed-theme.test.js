import {test} from 'node:test';
import assert from 'node:assert/strict';
import {RokuharaEmbed} from '../src/embed-theme.js';
import {guideMessage} from '../src/community.js';
import {allianceMessage} from '../src/alliance-notice.js';
import {announcementMessage} from '../src/announcements.js';
import {panelPayload} from '../src/panels.js';
import {EmbedBuilder,escapeMarkdown} from 'discord.js';
test('public embeds serialize within Discord limits and keep explicit safe mentions',()=>{
 const d={id:2,name:'2ª divisão',verification:'123456789012345678'};
 const messages=[guideMessage(d),allianceMessage(d,'https://discord.gg/example'),announcementMessage({id:1,kind:'war',payload:{gang:'W'.repeat(100),reason:'W'.repeat(1000)}},d),announcementMessage({id:2,kind:'wanted',payload:{title:'VIVO OU MORTO',name:'W'.repeat(100),nick:'W'.repeat(64),reason:'W'.repeat(1000),description:'W'.repeat(2000)}},d)];
 for(const message of messages){assert.deepEqual(message.allowedMentions,{parse:[]});for(const embed of message.embeds){const e=embed.toJSON();assert.ok(e.title.length<=256);assert.ok((e.description?.length??0)<=4096);for(const field of e.fields??[])assert.ok(field.value.length<=1024);assert.doesNotThrow(()=>new EmbedBuilder(panelPayload({embeds:[embed]},'guide').embeds[0]).toJSON());}}
 assert.equal(new RokuharaEmbed().setTitle('W'.repeat(256)).toJSON().title.length,256);
});

test('theme exposes readable context and semantic tones while preserving maximum length titles',()=>{
 const title='T'.repeat(256),e=new RokuharaEmbed(2).setContext('MODERAÇÃO').setTone('warning').setTitle(title).toJSON();
 assert.equal(e.author.name,'ROKUHARA • MODERAÇÃO');assert.equal(e.color,0xe4b953);assert.equal(e.title,title);
 assert.throws(()=>new RokuharaEmbed().setTone('constructor'),/Tom de embed/);
});

test('long text fields preserve escaped content, emoji and mention neutralization across continuations',()=>{
 const raw=String.fromCharCode(92).repeat(511)+'a😀'+String.fromCharCode(92)+'@everyone'+'*'.repeat(512),value=escapeMarkdown(raw).replace(/@/g,'＠');
 const e=new RokuharaEmbed().addTextFields('Motivo',value).toJSON();
 assert.equal(e.fields.map(f=>f.value).join(''),value);assert.ok(e.fields.length>1);assert.match(e.fields[1].name,/continuação/);
 for(const f of e.fields){assert.ok(f.value.length<=1024);assert.doesNotMatch(f.value,/[\uD800-\uDBFF]$/);assert.doesNotMatch(f.value,/^\uDE00/);}
});

test('announcements preserve full long reasons and attach full descriptions when escaped text exceeds the message budget',()=>{
 const d={id:1,name:'Primeira'},reason=String.fromCharCode(92).repeat(1000),description=String.fromCharCode(92).repeat(2000);
 const m=announcementMessage({id:42,kind:'announcement',payload:{title:'VIVO OU MORTO',name:'Pessoa',nick:'Nick',reason,description}},d),e=m.embeds[0].toJSON();
 assert.equal(e.fields.filter(f=>f.name.startsWith('Motivo registrado')).map(f=>f.value).join(''),escapeMarkdown(reason));
 assert.match(e.description,/Descrição completa no anexo/);const attachment=m.files.find(f=>f.name==='comunicado-42.txt');assert.ok(attachment);
 assert.ok(attachment.attachment.toString('utf8').includes(description));assert.ok(attachment.attachment.toString('utf8').includes(reason));
 const total=[e.title,e.description,e.author?.name,e.footer?.text,...e.fields.flatMap(f=>[f.name,f.value])].reduce((sum,value)=>sum+(value?.length??0),0);assert.ok(total<=6000);
 assert.deepEqual(m.allowedMentions,{parse:[]});
});

test('public guides and alliances retain panel identity and present concrete next steps',()=>{
 const d={id:1,name:'Primeira',verification:'123456789012345678'},guide=guideMessage(d).embeds[0].toJSON(),alliance=allianceMessage(d,'https://discord.gg/example').embeds[0].toJSON();
 assert.equal(guide.title,'❖ ┃ Como verificar • ROKUHARA');assert.equal(alliance.title,'❖ ┃ ROKUHARA × HYDRA NO KAI');
 assert.ok(guide.fields.some(f=>/15 números/.test(f.value)));assert.ok(guide.fields.some(f=>/Sou eu/.test(f.value)));
 assert.ok(alliance.fields.some(f=>/administração/.test(f.value)));assert.equal(guide.author.name,'ROKUHARA • GUIA DE ACESSO');
});
