import {EmbedBuilder} from 'discord.js';
const tones={info:0x38a9ff,success:0x69f06a,warning:0xe4b953,danger:0xeb6d5b,neutral:0x9aa8b5};
// One visual identity, with meaningful color and context instead of decorative blocks.
export class RokuharaEmbed extends EmbedBuilder {
 constructor(division=0){super();this.setAuthor({name:'ROKUHARA • CENTRAL IFJ'});this.setColor(division===2?0x38a9ff:0x69f06a);super.setFooter({text:division?`ROKUHARA • ${division}ª DIVISÃO • União, respeito e lealdade`:'ROKUHARA • União, respeito e lealdade'});this.setTimestamp();}
 setTitle(value){return super.setTitle(value&&value.length<=252?`❖ ┃ ${value}`:value);}
 setContext(value){return this.setAuthor({name:`ROKUHARA • ${value}`});}
 setTone(value){if(!Object.hasOwn(tones,value))throw new RangeError('Tom de embed desconhecido.');return this.setColor(tones[value]);}
 addTextFields(name,value,{inline=false}={}){
  // Escaping Discord markdown may double the validated input length. Keep all of it.
  let remaining=String(value),part=0;
  do{
   let end=Math.min(remaining.length,1024);
   if(end<remaining.length&&/[\uD800-\uDBFF]/.test(remaining[end-1]))end--;
   if(end<remaining.length){let slashes=0;for(let i=end-1;i>=0&&remaining[i]==='\\';i--)slashes++;if(slashes%2)end--;}
   this.addFields({name:part?`${name} · continuação ${part+1}`:name,value:remaining.slice(0,end)||'Não informado',inline});
   remaining=remaining.slice(end);part++;
  }while(remaining);
  return this;
 }
 setFooter(value){return super.setFooter(value?.text?{...value,text:value.text.includes('ROKUHARA')?value.text:`ROKUHARA • ${value.text}`}:value);}
}
