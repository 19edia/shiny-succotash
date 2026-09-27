import {createCanvas,GlobalFonts} from '@napi-rs/canvas';
import {fileURLToPath} from 'node:url';
import {ALLIANCE_CARD_NOTICE,bothDivisions} from './identity.js';
let fontsReady=false;
function loadFonts(){if(fontsReady)return;for(const [file,name]of [['DejaVuSans.ttf','IFJRegular'],['DejaVuSans-Bold.ttf','IFJBold']])if(!GlobalFonts.registerFromPath(fileURLToPath(new URL(`../assets/fonts/${file}`,import.meta.url)),name))throw new Error('Fonte da carteira não encontrada.');fontsReady=true;}
// All strings are drawn as text. No HTML, remote images or external fonts are loaded.
function splitLines(ctx,value,maxWidth){
 const lines=[];let line='';
 for(const word of String(value??'Não informado').replace(/\s+/g,' ').trim().split(' ')){
  if(ctx.measureText(line?line+' '+word:word).width<=maxWidth){line=line?line+' '+word:word;continue;}
  if(line){lines.push(line);line='';}
  for(const char of word){if(line&&ctx.measureText(line+char).width>maxWidth){lines.push(line);line='';}line+=char;}
 }
 if(line)lines.push(line);return lines;
}
function fitText(ctx,value,x,y,width,height,{size=34,min=16,bold=false,color='#edf8f0'}={}){
 let lines=[];
 for(;size>=min;size--){ctx.font=`${size}px ${bold?'IFJBold':'IFJRegular'}`;lines=splitLines(ctx,value,width);if(lines.length*size*1.3<=height&&lines.every(line=>ctx.measureText(line).width<=width))break;}
 if(size<min)throw new Error('Texto excede o espaço da carteira.');
 ctx.fillStyle=color;lines.forEach((line,i)=>ctx.fillText(line,x,y+i*size*1.3));
}
export function cardFields(member,divisionName){return [{label:'NOME',value:member.name},{label:member.account_kind==='aliado'?'GANGUE ALIADA':'PATENTE',value:member.account_kind==='aliado'?member.allied_gang:member.member_rank},{label:'DIVISÃO AUTORIZADA',value:bothDivisions(member)?'1ª e 2ª divisões':divisionName},{label:'NOME NO JOGO',value:member.game_nick||'Não informado'},{label:'USUÁRIO ROBLOX',value:member.roblox_username||'Não informado'},{label:'DISCORD ID',value:member.discord_id},{label:'IFJ',value:member.ifj}];}
export async function renderCard(member,divisionName,{issuedAt=new Date()}={}){
 loadFonts();const canvas=createCanvas(1600,1100),c=canvas.getContext('2d');
 const ally=member.account_kind==='aliado',leader=!ally&&bothDivisions(member);
 const theme=ally?{accent:'#c5b5ff',bright:'#f0e9ff',deep:'#302544',panel:'#201b2e'}:leader?{accent:'#dec18a',bright:'#fff1cb',deep:'#343125',panel:'#23251e'}:{accent:'#91dcc2',bright:'#d8fff0',deep:'#183d34',panel:'#152c27'};
 const muted='#9facaa',ink='#f2f6f0';c.textBaseline='top';
 const text=(value,x,y,size=20,color=muted,bold=false)=>{c.font=`${size}px ${bold?'IFJBold':'IFJRegular'}`;c.fillStyle=color;c.fillText(String(value),x,y);};
 const line=(x,y,x2,y2,color='#30423b',width=1)=>{c.strokeStyle=color;c.lineWidth=width;c.beginPath();c.moveTo(x,y);c.lineTo(x2,y2);c.stroke();};
 const rounded=(x,y,w,h,r,fill,stroke)=>{c.beginPath();c.roundRect(x,y,w,h,r);if(fill){c.fillStyle=fill;c.fill();}if(stroke){c.strokeStyle=stroke;c.lineWidth=1;c.stroke();}};
 const circle=(x,y,r,color,width=1)=>{c.beginPath();c.arc(x,y,r,0,Math.PI*2);c.strokeStyle=color;c.lineWidth=width;c.stroke();};
 const date=value=>new Date(value).toLocaleDateString('pt-BR',{timeZone:'UTC'});
 c.fillStyle='#080f0d';c.fillRect(0,0,1600,1100);
 const base=c.createLinearGradient(24,24,1540,1100);base.addColorStop(0,'#1c2c25');base.addColorStop(.45,'#101d18');base.addColorStop(1,'#0a1411');
 rounded(24,24,1552,1052,36,base);
 c.save();c.beginPath();c.roundRect(24,24,1552,1052,36);c.clip();
 // Engraved geometry is code-native: every issued card stays sharp and reproducible.
 const rail=c.createLinearGradient(24,24,490,1052);rail.addColorStop(0,theme.deep);rail.addColorStop(.55,'#11231d');rail.addColorStop(1,'#0c1a15');
 c.fillStyle=rail;c.fillRect(24,24,436,1052);
 const glow=c.createRadialGradient(241,355,30,241,355,320);glow.addColorStop(0,theme.accent+'17');glow.addColorStop(1,theme.accent+'00');c.fillStyle=glow;c.fillRect(24,24,436,850);
 c.save();c.beginPath();c.rect(24,24,436,1052);c.clip();c.strokeStyle=theme.accent;c.lineWidth=.8;c.globalAlpha=.09;
 for(let j=0;j<19;j++){
  c.beginPath();for(let i=0;i<=480;i++){const a=i*Math.PI/240,r=206+j*6+Math.sin(a*6+j*.11)*15,x=242+Math.cos(a)*r,y=354+Math.sin(a)*r;if(i===0)c.moveTo(x,y);else c.lineTo(x,y);}c.closePath();c.stroke();
 }
 c.restore();
 const edge=c.createLinearGradient(460,24,460,1076);edge.addColorStop(0,theme.accent+'05');edge.addColorStop(.2,theme.accent+'70');edge.addColorStop(.8,theme.accent+'55');edge.addColorStop(1,theme.accent+'05');line(460,24,460,1076,edge);
 c.save();c.globalAlpha=.055;for(let i=0;i<8;i++)line(990+i*61,24,1576,430+i*75,theme.accent);c.restore();c.restore();
 rounded(24,24,1552,1052,36,null,theme.accent+'50');rounded(34,34,1532,1032,29,null,theme.accent+'0d');
 // Family wordmark and a ceremonial crest, tinted for the credential type.
 text('R O K U H A R A',72,76,25,theme.bright,true);text('UNIÃO  ·  RESPEITO  ·  LEALDADE',74,118,12,theme.accent);line(74,159,410,159,theme.accent+'35');
 c.save();c.translate(242,363);
 for(let i=0;i<60;i++){const a=i*Math.PI/30,r=i%5===0?170:164;line(Math.cos(a)*158,Math.sin(a)*158,Math.cos(a)*r,Math.sin(a)*r,theme.accent+(i%5===0?'aa':'50'),i%5===0?2:1);}
 circle(0,0,150,theme.accent+'80');circle(0,0,143,theme.accent+'20');
 for(const side of [-1,1]){
  c.save();c.scale(side,1);c.strokeStyle=theme.accent+'bb';c.lineWidth=1.5;c.beginPath();c.moveTo(18,118);c.bezierCurveTo(97,108,135,31,114,-41);c.stroke();
  for(let i=0;i<8;i++){const a=.25+i*.165,x=118*Math.sin(a),y=118*Math.cos(a);c.save();c.translate(x,y);c.rotate(-a+.12);c.beginPath();c.ellipse(8,-9,5,15,-.65,0,Math.PI*2);c.fillStyle=theme.accent+(i%2?'7a':'ad');c.fill();c.restore();}c.restore();
 }
 const shield=scale=>{c.beginPath();c.moveTo(0,-112*scale);c.lineTo(78*scale,-77*scale);c.lineTo(67*scale,38*scale);c.bezierCurveTo(56*scale,64*scale,25*scale,87*scale,0,103*scale);c.bezierCurveTo(-25*scale,87*scale,-56*scale,64*scale,-67*scale,38*scale);c.lineTo(-78*scale,-77*scale);c.closePath();};
 const metal=c.createLinearGradient(-80,-100,80,100);metal.addColorStop(0,theme.bright);metal.addColorStop(.45,theme.accent);metal.addColorStop(.7,theme.bright);metal.addColorStop(1,theme.accent);
 shield(1);c.fillStyle='#11231d';c.fill();c.strokeStyle=metal;c.lineWidth=3;c.stroke();shield(.88);c.strokeStyle=theme.accent+'80';c.lineWidth=1;c.stroke();
 c.textAlign='center';text('R',0,-63,111,metal,true);line(-28,67,28,67,theme.accent,2);
 c.beginPath();c.moveTo(0,-135);c.lineTo(6,-124);c.lineTo(0,-113);c.lineTo(-6,-124);c.closePath();c.fillStyle=theme.bright;c.fill();c.restore();
 c.textAlign='center';text('C R E D E N C I A L',242,565,13,theme.accent,true);text(ally?'ALIANÇA':leader?'LIDERANÇA':'MEMBRO',242,597,34,theme.bright,true);c.textAlign='left';
 line(74,673,410,673,theme.accent+'35');
 if(ally){
  text('PATENTE NO JOGO',74,699,12,muted);fitText(c,member.member_rank,74,727,336,110,{size:28,min:16,bold:true,color:ink});
  text('EMISSÃO / UTC',74,855,11,muted);text('CADASTRO',254,855,11,muted);text(date(issuedAt),74,880,18,ink,true);text(date(member.created_at),254,880,18,ink,true);
 }else{
  text('EMISSÃO  /  UTC',74,711,12,muted);text(date(issuedAt),74,740,27,ink,true);text('DATA DE CADASTRO',74,801,12,muted);text(date(member.created_at),74,830,23,ink,true);
 }
 line(74,914,410,914,theme.accent+'35');fitText(c,`REGISTRO ${member.id}`,74,942,336,36,{size:17,min:12,bold:true,color:theme.accent});text(`VERSÃO ${member.identity_version??1}`,74,977,13,muted);text('ROLEPLAY  /  USO NO JOGO',74,1027,11,muted);
 // Reading order: holder, game identity, then the full, exact identifiers.
 text('REGISTRO DE IDENTIDADE',516,79,15,theme.accent,true);
 const status=member.suspect?'EM ANÁLISE':member.verified?'VERIFICADO':'AGUARDANDO VERIFICAÇÃO';
 const statusColor=member.suspect?'#f5ba8e':member.verified?theme.accent:'#bfccd6';c.font='14px IFJBold';
 const statusWidth=Math.ceil(c.measureText(status).width)+52,statusX=1518-statusWidth;
 rounded(statusX,64,statusWidth,42,21,statusColor+'13',statusColor+'50');c.beginPath();c.arc(statusX+20,85,4,0,Math.PI*2);c.fillStyle=statusColor;c.fill();text(status,statusX+34,76,14,statusColor,true);
 c.textAlign='right';text('SITUAÇÃO NA EMISSÃO',1518,119,10,muted);c.textAlign='left';text('NOME DO TITULAR',516,168,12,muted);
 fitText(c,member.name,511,201,1007,163,{size:64,min:18,bold:true,color:ink});line(516,386,1518,386,theme.accent+'35');
 function field(label,value,x,y,width,size=32){rounded(x,y,width,174,16,'#17261f',theme.accent+'20');line(x+24,y+23,x+24,y+39,theme.accent,3);text(label,x+39,y+24,12,muted);fitText(c,value,x+24,y+62,width-48,108,{size,min:16,bold:true,color:ink});}
 const fields=cardFields(member,divisionName);
 field(fields[1].label,fields[1].value,516,416,489,34);field(bothDivisions(member)?'DIVISÕES AUTORIZADAS':'DIVISÃO AUTORIZADA',fields[2].value,1029,416,489,30);
 field('NOME NO JOGO',member.game_nick||'Não informado',516,614,489,32);field('USUÁRIO ROBLOX',member.roblox_username||'Não informado',1029,614,489,29);
 const footer=c.createLinearGradient(516,818,1518,1000);footer.addColorStop(0,theme.panel);footer.addColorStop(1,'#12251c');rounded(516,818,1002,176,16,footer,theme.accent+'60');
 text('IFJ  /  NÚMERO DE IDENTIFICAÇÃO',544,850,12,theme.accent,true);fitText(c,member.ifj,540,897,522,75,{size:47,min:22,bold:true,color:theme.bright});line(1090,850,1090,962,theme.accent+'30');
 text('DISCORD ID',1118,850,12,theme.accent,true);fitText(c,member.discord_id,1116,906,372,54,{size:25,min:18,bold:true,color:ink});
 fitText(c,ally?ALLIANCE_CARD_NOTICE:'Consulte o bot para confirmar a situação atual deste registro.',516,1025,1002,31,{size:14,min:12,color:muted});
 return canvas.encode('png');
}
