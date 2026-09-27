import {ROLE_ENV} from './config-rules.js';
import {deleteCommand,deletionHandler} from './delete-structure.js';
import {rankRoles,categories,textChannels,voiceChannels} from './server-layout.js';
import {SlashCommandBuilder,PermissionFlagsBits as P,ChannelType as T,MessageFlags,AttachmentBuilder} from 'discord.js';
export class ProvisionError extends Error {}
const ensure=(ok,message)=>{if(!ok)throw new ProvisionError(message);};
export function createCommand(divisions){return new SlashCommandBuilder().setName('criar').setDescription('Criar a estrutura ROKUHARA do servidor da divisão').setDefaultMemberPermissions(P.Administrator).addStringOption(o=>o.setName('servidor').setDescription('Servidor em que os canais serão criados').setRequired(true).addChoices(...divisions.map(d=>({name:`${d.id} · ${d.name}`.slice(0,100),value:d.guild})))).addIntegerOption(o=>o.setName('divisao').setDescription('Divisão correspondente ao servidor').setRequired(true).addChoices({name:'Primeira divisão',value:1},{name:'Segunda divisão',value:2})).toJSON();}
export async function registerCreate(client,divisions){for(const d of divisions){const g=await client.guilds.fetch(d.guild);await g.commands.create(createCommand(divisions));await g.commands.create(deleteCommand());}}
export async function checkProvisionGuild(g){const me=await g.members.fetchMe();ensure(me.permissions.has([P.ManageChannels,P.ManageRoles,P.ViewChannel,P.SendMessages,P.EmbedLinks,P.ReadMessageHistory,P.Connect,P.Speak]),'O bot precisa de Gerenciar canais, Gerenciar cargos, Ver canais, Enviar mensagens, Incorporar links, Ler histórico, Conectar e Falar.');return me;}
export async function provisionGuild(g,d){
 const me=await checkProvisionGuild(g),roles=await g.roles.fetch(),channels=await g.channels.fetch(),tag=`IFJ-D${d.id}`;
 const unique=(items,predicate)=>{const found=[...items.values()].filter(x=>x&&predicate(x));ensure(found.length<=1,'Há nomes IFJ duplicados. Renomeie as cópias antes de repetir /criar.');return found[0];};
 const roleMap=new Map(),inventory=[],notes=[];const color=d.id===1?0x69f06a:0x38a9ff;
 async function role(key,emoji,suffix){const configured=key==='member'?d.memberRole:key==='admin'?d.adminRole:d.rankRoles?.[key];const name=`${tag} • ${emoji} ┃ ${suffix}`;
  let r=configured?roles.get(configured):unique(roles,x=>[name,`${tag} • ${suffix}`].includes(x.name));
  if(configured)ensure(r,`Cargo configurado de ${suffix} não existe.`);
  if(!r){r=await g.roles.create({name,color,hoist:['leader','subleader','high','admin'].includes(key),mentionable:false,permissions:[],reason:'Estrutura /criar ROKUHARA'});roles.set(r.id,r);}
  else if(r.editable&&!r.managed)await r.edit({name,color,reason:'Decoração /criar ROKUHARA'});
  else notes.push(`Cargo ${r.name}: aparência preservada; coloque o bot acima dele para permitir decorar.`);
  roleMap.set(key,r);inventory.push(`CARGO | ${r.name} | ${r.id}`);return r;
 }
 const member=await role(...rankRoles[0]),admin=await role(...rankRoles[1]);
 ensure(member.id!==g.id&&admin.id!==g.id&&member.id!==admin.id&&!member.managed&&!member.permissions.has(P.Administrator),'Cargos de acesso inválidos.');
 ensure(me.roles.highest.comparePositionTo(member)>0,'Coloque o cargo do bot acima do cargo de membro verificado.');
 for(const spec of rankRoles.slice(2))await role(...spec);
 const botAllow=[P.ViewChannel,P.SendMessages,P.EmbedLinks,P.ReadMessageHistory,P.ManageChannels,P.ManageRoles,P.Connect,P.Speak];
 function overwrites(scope){return [{id:g.id,...(scope==='public'?{allow:[P.ViewChannel,P.ReadMessageHistory],deny:[P.SendMessages]}:{deny:[P.ViewChannel]})},{id:me.id,allow:botAllow},{id:admin.id,allow:[P.ViewChannel,P.SendMessages,P.ReadMessageHistory,P.Connect,P.Speak]},...(['members','readonly'].includes(scope)?[{id:member.id,allow:[P.ViewChannel,P.ReadMessageHistory,P.Connect,P.Speak,...(scope==='members'?[P.SendMessages]:[])],...(scope==='readonly'?{deny:[P.SendMessages]}:{})}]:[])];}
 async function channel(key,name,type,scope,parent,legacy){const marker=`${tag}:${key}`;let ch=unique(channels,x=>type===T.GuildText?x.topic===marker:[name,legacy].includes(x.name)&&x.type===type);
  const data={name,type,permissionOverwrites:overwrites(scope),...(parent?{parent:parent.id}:{}),...(type===T.GuildText?{topic:marker}:{})};
  if(ch){ensure(ch.type===type,'Um canal IFJ tem tipo incompatível.');const {type:unused,...edit}=data;await ch.edit({...edit,reason:'Atualizar estrutura /criar ROKUHARA'});}else{ch=await g.channels.create({...data,reason:'Estrutura /criar ROKUHARA'});channels.set(ch.id,ch);}inventory.push(`${type===T.GuildCategory?'CATEGORIA':type===T.GuildVoice?'CALL':'TEXTO'} | ${ch.name} | ${ch.id}`);return ch;
 }
 const categoryMap=new Map(),channelMap=new Map();const badge=d.id===1?'🟢':'🔵';
 for(const [key,title,emoji,scope,old]of categories)categoryMap.set(key,await channel(key,`${tag} • ${badge} ${emoji} ━ ${title}`,T.GuildCategory,scope,undefined,old?`${tag} • ${old}`:undefined));
 for(const [key,title,emoji,parent,scope]of textChannels)channelMap.set(key,await channel(key,`${emoji}┃${title}`,T.GuildText,scope,categoryMap.get(parent)));
 for(const [key,title,emoji,parent,scope]of voiceChannels)channelMap.set(key,await channel(key,`${tag} • ${emoji} ┃ ${title}`,T.GuildVoice,scope,categoryMap.get(parent),['voice1','voice2'].includes(key)?`${tag} • ${title}`:undefined));
 const values={GUILD_ID:g.id,MEMBER_ROLE_ID:member.id,ADMIN_ROLE_ID:admin.id,VERIFICATION_CHANNEL_ID:channelMap.get('verification').id,WELCOME_CHANNEL_ID:channelMap.get('welcome').id,GUIDE_CHANNEL_ID:channelMap.get('guide').id,WANTED_CHANNEL_ID:channelMap.get('wanted').id,TICKETS_CHANNEL_ID:channelMap.get('tickets').id,REPORTS_CHANNEL_ID:channelMap.get('reports').id,TICKET_CATEGORY_ID:categoryMap.get('tickets-category').id,STAFF_CHANNEL_ID:channelMap.get('staff-text').id,...Object.fromEntries(Object.entries(ROLE_ENV).map(([key,suffix])=>[suffix,roleMap.get(key).id]))};
 return {env:Object.entries(values).map(([key,value])=>`DIV_${d.id}_${key}=${value}`).join('\n')+'\n',inventory:`ROKUHARA · Divisão ${d.id} · servidor ${g.id}\n8 categorias • 24 textos • 6 calls • 10 cargos\n\n${inventory.join('\n')}\n\n${notes.join('\n')}\n\nA patente cadastrada no IFJ determina o cargo após verificação. Líder, Sub líder e Moderador também recebem Equipe. O bot remove cargos gerenciados que não correspondem ao cadastro; não atribua esses cargos manualmente. Equipe não deve ter Administrator nem permissões de gestão globais. Os canais de avisos, regras, agenda e registros são espaços para a equipe preencher; não há publicação automática nesses canais extras.\n`};

}
export function createProvisionHandler(client,divisions){const locks=new Set();const remove=deletionHandler(client,divisions,locks);return async i=>{
 if(await remove(i))return true;
 if(!i.isChatInputCommand?.()||i.commandName!=='criar')return false;
 await i.deferReply({flags:MessageFlags.Ephemeral});const guildId=i.options.getString('servidor',true),id=i.options.getInteger('divisao',true);let locked=false;
 try{
  const d=divisions.find(x=>x.id===id);ensure(d&&d.guild===guildId,'Servidor e divisão não correspondem às variáveis DIV_1_GUILD_ID e DIV_2_GUILD_ID.');
  ensure(i.guildId===guildId,'Execute /criar dentro do servidor escolhido.');
  const g=await client.guilds.fetch(guildId),actor=await g.members.fetch(i.user.id);
  ensure(g.ownerId===i.user.id||actor.permissions.has(P.Administrator),'Somente o dono ou um administrador do Discord pode executar /criar.');
  ensure(!locks.has(guildId),'Este servidor já está sendo configurado. Aguarde.');locks.add(guildId);locked=true;
  const result=await provisionGuild(g,d);
  await i.editReply({content:'Estrutura pronta e decorada! Importe apenas o arquivo .env no Render → Environment. Execute /criar também no outro servidor. Depois use npm start e publique os botões em Bot e histórico. Após verificar, Líder, Sub líder e Moderador recebem Equipe automaticamente. Importe também os novos IDs de patentes.',files:[new AttachmentBuilder(Buffer.from(result.env),{name:`divisao-${id}.env`}),new AttachmentBuilder(Buffer.from(result.inventory),{name:`ids-completos-divisao-${id}.txt`})],allowedMentions:{parse:[]}});
 }catch(e){console.error('/criar:',e.code||e.name);await i.editReply({content:e instanceof ProvisionError?e.message:'Falha ao criar a estrutura. Confira permissões e hierarquia do bot. Pode haver criação parcial; repita /criar para continuar sem apagar os canais.',allowedMentions:{parse:[]}});}finally{if(locked)locks.delete(guildId);}return true;
};}
