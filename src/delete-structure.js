import {randomUUID} from 'node:crypto';
import {SlashCommandBuilder,PermissionFlagsBits as P,ChannelType as T,MessageFlags,ActionRowBuilder,ButtonBuilder,ButtonStyle} from 'discord.js';
export const deleteCommand=()=>new SlashCommandBuilder().setName('deletar').setDescription('Apagar TODOS os canais e categorias deste servidor, após confirmação').setDefaultMemberPermissions(P.Administrator).toJSON();
class DeleteError extends Error {}
const requireOK=(ok,message)=>{if(!ok)throw new DeleteError(message);};
export function deletionHandler(client,divisions,locks,{now=Date.now,log=console.log}={}){
 const pending=new Map();
 async function adminGuild(i){requireOK(divisions.some(d=>d.guild===i.guildId),'Este servidor não está configurado como divisão.');const g=await client.guilds.fetch(i.guildId);const actor=await g.members.fetch(i.user.id);requireOK(g.ownerId===i.user.id||actor.permissions.has(P.Administrator),'Somente o dono ou um administrador do Discord pode usar /deletar.');return g;}
 return async i=>{
  const command=i.isChatInputCommand?.()&&i.commandName==='deletar';const button=i.isButton?.()&&/^ifj-delete:(confirm|cancel):/.test(i.customId||'');if(!command&&!button)return false;
  await i.deferReply({flags:MessageFlags.Ephemeral});let acquired=false;
  try{
   const g=await adminGuild(i);requireOK(!locks.has(g.id),'Já existe uma operação /criar ou /deletar neste servidor. Aguarde.');
   if(command){
    for(const [key,value]of pending)if(value.expires<=now()||value.guildId===g.id&&value.userId===i.user.id)pending.delete(key);
    const channels=[...(await g.channels.fetch()).values()].filter(Boolean);
    requireOK(channels.length>0,'Não há canais ou categorias para apagar.');requireOK(channels.every(c=>c.deletable),'O bot não pode apagar todos os canais. Revise Gerenciar canais, permissões específicas e hierarquia. Nada foi apagado.');
    const token=randomUUID(),expires=now()+60000;pending.set(token,{guildId:g.id,userId:i.user.id,ids:channels.map(c=>c.id),expires});
    const cats=channels.filter(c=>c.type===T.GuildCategory).length;
    const controls=new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`ifj-delete:confirm:${token}`).setLabel('APAGAR TUDO DESTE SERVIDOR').setStyle(ButtonStyle.Danger),new ButtonBuilder().setCustomId(`ifj-delete:cancel:${token}`).setLabel('Cancelar').setStyle(ButtonStyle.Secondary));
    await i.editReply({content:`ATENÇÃO: apagar ${channels.length-cats} canais e ${cats} categorias do servidor ${g.name||g.id} (ID ${g.id})? Inclui canais antigos, calls, fóruns, mensagens e tópicos associados — não apenas os criados pelo bot. É irreversível. Cargos, membros e IFJs serão mantidos. Confirmação válida por 60 segundos, somente para você.\nDepois, crie manualmente um canal temporário para executar /criar. Use npm run configurar no Render durante esta reconstrução; npm start exige IDs válidos.`,components:[controls],allowedMentions:{parse:[]}});return true;
   }
   const [,action,token]=i.customId.split(':');const state=pending.get(token);
   requireOK(state&&state.guildId===g.id&&state.userId===i.user.id&&state.expires>now(),'Confirmação expirada, já utilizada ou pertencente a outra pessoa/servidor. Use /deletar novamente.');
   pending.delete(token);
   if(action==='cancel'){await i.editReply({content:'Exclusão cancelada. Nenhum canal foi apagado.',components:[]});return true;}
   locks.add(g.id);acquired=true;
   // Only IDs reviewed in the confirmation are eligible. Newly created channels are untouched.
   const current=await g.channels.fetch(),targets=state.ids.map(id=>current.get(id)).filter(Boolean);
   requireOK(targets.every(c=>c.deletable),'As permissões mudaram. Nada foi apagado. Corrija e use /deletar novamente.');
   const score=c=>c.id===i.channelId?2:c.type===T.GuildCategory?1:0;targets.sort((a,b)=>score(a)-score(b));
   await i.editReply({content:`Apagando ${targets.length} canais/categorias confirmados. Resultado final nos logs do Render; esta conversa será apagada se o canal estiver na lista.`,components:[]});
   let deleted=0;const failures=[];
   for(const ch of targets){try{await ch.delete(`ROKUHARA /deletar confirmado por ${i.user.id}`);deleted++;}catch(e){if(e.code!==10003)failures.push({id:ch.id,code:String(e.code||e.name)});}}
   const result=`[DELETAR] servidor=${g.id} admin=${i.user.id} apagados=${deleted} falhas=${failures.length}`;log(result);if(failures.length)log(JSON.stringify(failures));
   try{await i.editReply({content:`Exclusão concluída: ${deleted} apagados; ${failures.length} falhas. Confira os logs. Crie um canal temporário, execute /criar, importe os novos IDs e publique os botões.`,components:[]});}catch{ /* The originating channel may have just been deleted. */ }
  }catch(e){log(`[DELETAR][ERRO] ${e instanceof DeleteError?e.message:String(e.code||e.name)}`);await i.editReply({content:e instanceof DeleteError?e.message:'Não foi possível concluir. Confira os logs e as permissões. Em falha parcial, use /deletar novamente para revisar o que restou.',components:[],allowedMentions:{parse:[]}}).catch(()=>{});}finally{if(acquired)locks.delete(i.guildId);}
  return true;
 };
}
