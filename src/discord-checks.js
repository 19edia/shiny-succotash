import {assertManagedRoles} from './role-policy.js';
import {ChannelType,PermissionFlagsBits as P} from 'discord.js';
import {StartupError} from './preflight.js';
const requireCondition=(ok,message)=>{if(!ok)throw new StartupError(message);};
export async function validateDiscord(client,config,log){
 requireCondition(client.isReady(),'Gateway Discord não está pronto.');
 for(const d of config.divisions){
  const prefix=`DIV_${d.id}`;
  const g=await log.test(`${prefix}_GUILD_ID: bot instalado no servidor`,()=>client.guilds.fetch(d.guild));
  const roles=await g.roles.fetch();const me=await g.members.fetchMe();
  await log.test(`${prefix}: cargos e hierarquia`,async()=>{
   try{assertManagedRoles(g,d,roles,me);}catch(e){throw new StartupError(`${prefix}: ${e.message}`);}
   const member=roles.get(d.memberRole),admin=roles.get(d.adminRole);
   requireCondition(member&&admin,`${prefix}: cargo de membro ou de administrador não existe.`);
   requireCondition(member.id!==g.id&&admin.id!==g.id&&member.id!==admin.id,`${prefix}: não use @everyone ou o mesmo cargo nas duas funções.`);
   requireCondition(!member.managed&&!member.permissions.has(P.Administrator),`${prefix}: cargo de membro não pode ser gerenciado nem ter Administrator.`);
   requireCondition(me.roles.highest.comparePositionTo(member)>0,`${prefix}: coloque o cargo do bot acima do cargo de membro.`);
   requireCondition(me.permissions.has([P.ManageRoles,P.ManageChannels]),`${prefix}: bot precisa de Gerenciar cargos e Gerenciar canais.`);
  });
  await log.test(`${prefix}_TICKET_CATEGORY_ID: categoria e permissões`,async()=>{
   const cat=await g.channels.fetch(d.category);
   requireCondition(cat?.type===ChannelType.GuildCategory&&cat.guildId===d.guild,`${prefix}: categoria de tickets inválida.`);
   requireCondition(cat.permissionsFor(me)?.has([P.ViewChannel,P.ManageChannels,P.ManageRoles]),`${prefix}: o bot não pode gerenciar a categoria de tickets.`);
  });
  for(const [suffix,id]of [['VERIFICATION_CHANNEL_ID',d.verification],['WELCOME_CHANNEL_ID',d.welcome],['GUIDE_CHANNEL_ID',d.guide],['WANTED_CHANNEL_ID',d.wanted],['TICKETS_CHANNEL_ID',d.tickets],['REPORTS_CHANNEL_ID',d.reports],...(d.allianceChannel?[['ALLIANCE_CHANNEL_ID',d.allianceChannel]]:[]),...(d.staffChannel?[['STAFF_CHANNEL_ID',d.staffChannel]]:[])]){
   await log.test(`${prefix}_${suffix}: canal e permissões`,async()=>{
    const ch=await g.channels.fetch(id);
    requireCondition(ch?.guildId===d.guild&&ch.type===ChannelType.GuildText,`${prefix}_${suffix}: escolha um canal de texto desse servidor.`);
    requireCondition(ch.permissionsFor(me)?.has([P.ViewChannel,P.SendMessages,P.EmbedLinks,P.ReadMessageHistory]),`${prefix}_${suffix}: faltam permissões de leitura, envio ou embeds para o bot.`);
    if(suffix==='WANTED_CHANNEL_ID')requireCondition(ch.permissionsFor(me)?.has(P.AttachFiles),`${prefix}_${suffix}: o bot precisa de Anexar arquivos para os prints.`);
    if(['VERIFICATION_CHANNEL_ID','WELCOME_CHANNEL_ID','GUIDE_CHANNEL_ID'].includes(suffix))requireCondition(ch.permissionsFor(g.roles.everyone)?.has(P.ViewChannel),`${prefix}: os canais de entrada precisam ser visíveis a @everyone.`);
    if(suffix==='STAFF_CHANNEL_ID')requireCondition(!ch.permissionsFor(g.roles.everyone)?.has(P.ViewChannel),`${prefix}: o canal opcional da equipe precisa ser privado para @everyone.`);
   });
  }
 }
}
