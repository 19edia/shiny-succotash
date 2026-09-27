import {publishPanel} from './panels.js';
import {RokuharaEmbed} from './embed-theme.js';
export function allianceMessage(d,invite){
 return {embeds:[new RokuharaEmbed(d.id).setContext('ALIANÇAS').setTitle('ROKUHARA × HYDRA NO KAI').setDescription([
 '🤝 **Parceria confirmada entre nossas comunidades.**',
 'A **HYDRA NO KAI** é uma gang aliada da **ROKUHARA**. Cada membro representa essa parceria com respeito, união e cooperação.',
 `**Conheça a comunidade aliada**\n[Entrar no servidor da HYDRA NO KAI](${invite})`,
 '*⚔️ Duas forças, uma aliança. 🤝*'
 ].join('\n\n')).addFields(
 {name:'01 · Receba nossos aliados',value:'Acolha os membros da HYDRA NO KAI e respeite a parceria dentro e fora do jogo.',inline:true},
 {name:'02 · Respeite cada comunidade',value:'Ao visitar o servidor aliado, siga as regras e as orientações da equipe local.',inline:true},
 {name:'Precisa resolver um problema?',value:'Procure a administração e apresente o contexto. A equipe acompanha o caso e busca uma solução pelo diálogo.'}
 ).setFooter({text:`${d.id}ª divisão • Compromisso: respeito, cooperação e diálogo`})],allowedMentions:{parse:[]}};
}
export async function publishAlliance(pool,client,d,invite){
 if(!d.allianceChannel)return;
 const ch=await client.channels.fetch(d.allianceChannel);
 if(!ch||ch.guildId!==d.guild||!ch.isTextBased()||!ch.send)throw new Error(`DIV_${d.id}_ALLIANCE_CHANNEL_ID: canal inválido.`);
 const content=allianceMessage(d,invite);
 await publishPanel(pool,client,ch,d.allianceChannel,'alliance',content);
}
