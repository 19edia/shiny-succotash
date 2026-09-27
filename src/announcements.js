import {createCanvas,loadImage} from '@napi-rs/canvas';
import {escapeMarkdown} from 'discord.js';
import {RokuharaEmbed} from './embed-theme.js';
const safe=v=>escapeMarkdown(String(v)).replace(/@/g,'＠');
const invalid=()=>Object.assign(new Error('Print inválido. Use PNG ou JPEG de até 2 MB e no máximo 4096 × 4096 pixels.'),{status:400});
export async function normalizePrint(value){
 if(value===undefined||value===null||value==='')return null;
 if(typeof value!=='string'||value.length>2800000||!/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(value))throw invalid();
 const bytes=Buffer.from(value.split(',')[1],'base64');if(bytes.length>2*1024*1024)throw invalid();
 // Parse dimensions before decoding, to reject oversized raster allocations.
 let w,h;
 if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))&&bytes.length>=24){w=bytes.readUInt32BE(16);h=bytes.readUInt32BE(20);}
 else if(bytes[0]===255&&bytes[1]===216){let n=2;while(n+4<=bytes.length){if(bytes[n++]!==255)break;const marker=bytes[n++];if(marker===218||marker===217)break;const length=bytes.readUInt16BE(n);if(length<2||n+length>bytes.length)break;if([192,193,194].includes(marker)&&length>=7){h=bytes.readUInt16BE(n+3);w=bytes.readUInt16BE(n+5);break;}n+=length;}}
 if(!w||!h||w>4096||h>4096)throw invalid();
 try{const img=await loadImage(bytes),scale=Math.min(1,1200/w,1200/h),canvas=createCanvas(Math.max(1,Math.round(w*scale)),Math.max(1,Math.round(h*scale))),c=canvas.getContext('2d');c.fillStyle='#101418';c.fillRect(0,0,canvas.width,canvas.height);c.drawImage(img,0,0,canvas.width,canvas.height);return (await canvas.encode('jpeg',85)).toString('base64');}catch{throw invalid();}
}
export function announcementMessage(job,d){
 const p=job.payload,war=job.kind==='war';
 const embed=new RokuharaEmbed(d.id).setContext(war?'COMUNICADOS • GUERRA RP':'COMUNICADOS • REGISTRO RP').setTone(war?'warning':'danger').setTitle(war?'ROKUHARA • DECLARAÇÃO DE GUERRA':p.title);
 if(war)embed.setDescription('⚔️ **A ROKUHARA declara guerra à gang '+safe(p.gang)+'!**\nMantenham a união e a disciplina. Lutem lado a lado e honrem nossa aliança. **No campo de batalha do jogo: morte aos inimigos!**\n\n*União no combate. Respeito às regras do jogo.*').addFields({name:'Gang rival',value:safe(p.gang),inline:true},{name:'Divisão',value:safe(d.name),inline:true});
 else embed.setDescription(safe(p.description)).addFields(...(p.name?[{name:'Pessoa procurada',value:safe(p.name),inline:true}]:[]),{name:'Nick no jogo',value:safe(p.nick),inline:true});
 embed.addTextFields('Motivo registrado',safe(p.reason)).addFields({name:'Orientação da equipe',value:war?'Acompanhe as instruções da administração para as ações dentro do jogo.':'Use os dados deste comunicado para identificar o registro no jogo. Procure a administração para esclarecer informações.'});
 embed.setFooter({text:`${d.name} • Roleplay • Registro ${job.id}`});
 const files=[];
 // Escape expansion can exceed Discord's 6000-character combined embed budget.
 // Deliver the original description in an explicit attachment rather than cut it.
 const data=embed.data,total=[data.title,data.description,data.author?.name,data.footer?.text,...(data.fields??[]).flatMap(f=>[f.name,f.value])].reduce((sum,value)=>sum+(value?.length??0),0);
 if(total>5900){
  files.push({attachment:Buffer.from([p.title,`Pessoa: ${p.name||'Não informada'}`,`Nick: ${p.nick}`,`Descrição: ${p.description}`,`Motivo: ${p.reason}`].join('\n\n'),'utf8'),name:`comunicado-${job.id}.txt`});
  embed.setDescription(`**Descrição completa no anexo \`comunicado-${job.id}.txt\`.**\nO texto integral foi preservado para leitura junto ao registro abaixo.`);
 }
 if(!war&&p.image){files.push({attachment:Buffer.from(p.image,'base64'),name:'procurado.jpg'});embed.setImage('attachment://procurado.jpg');}
 return {embeds:[embed],files,allowedMentions:{parse:[]}};
}
