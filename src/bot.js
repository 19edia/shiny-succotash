import {publishPanel} from './panels.js';
import {announcementMessage} from './announcements.js';
import {publishAlliance} from './alliance-notice.js';
import {RokuharaEmbed as EmbedBuilder} from './embed-theme.js';
import {createAllyMigration,allyJobs} from './ally-migration.js';
import {createWarnings} from './warnings.js';
import {createTribunals,tribunalJobs} from './tribunals.js';
import {createCommunity,communityJobs} from './community.js';
import {synchronizeRoles} from './role-policy.js';
import {registerCreate,createProvisionHandler} from './provision.js';
import {ALLIANCE_NOTICE,bothDivisions} from './identity.js';
import {validateDiscord} from './discord-checks.js';
import {StartupError} from './preflight.js';
import {Client,GatewayIntentBits,ActionRowBuilder,ButtonBuilder,ButtonStyle,ModalBuilder,TextInputBuilder,TextInputStyle,ChannelType,PermissionFlagsBits,MessageFlags,escapeMarkdown} from 'discord.js';
import {tx,enqueue,audit} from './db.js';
import {token,text} from './security.js';
const row=(...buttons)=>new ActionRowBuilder().addComponents(buttons);
const button=(id,label,style=ButtonStyle.Primary)=>new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style);
const modal=(id,title,fields)=>new ModalBuilder().setCustomId(id).setTitle(title).addComponents(fields.map(([key,label,max=100,paragraph=false])=>new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId(key).setLabel(label).setMaxLength(max).setStyle(paragraph?TextInputStyle.Paragraph:TextInputStyle.Short).setRequired(true))));
const safe=value=>escapeMarkdown(String(value)).replace(/@/g,'＠');
const ephemeral={flags:MessageFlags.Ephemeral,allowedMentions:{parse:[]}};
export function createBot(pool,config){
 const client=new Client({intents:[GatewayIntentBits.Guilds,GatewayIntentBits.GuildMembers],allowedMentions:{parse:[]}});
 const allies=createAllyMigration(pool,config,client);
 const warnings=createWarnings(pool,config,client);
 const tribunals=createTribunals(pool,config,client);
 const community=createCommunity(pool,config,client);
 const provision=createProvisionHandler(client,config.divisions);
 let timer;let busy=false;let activated=false;
 const cooldown=new Map();
 const byGuild=id=>config.divisions.find(d=>d.guild===id);
 const ready=()=>client.isReady();
 const requireReady=()=>{if(!ready())throw Object.assign(new Error('Bot ainda não está conectado.'),{status:503});};
 async function guild(id){return client.guilds.fetch(id);}
 async function channel(id,guildId){const c=await client.channels.fetch(id);if(!c||c.guildId!==guildId||!c.isTextBased()||!('send'in c))throw new Error('Canal inválido ou fora do servidor configurado.');return c;}
 function guard(i){const key=`${i.user.id}:${i.customId?.split(':')[0]}`;const now=Date.now();if((cooldown.get(key)||0)>now)return false;cooldown.set(key,now+3000);if(cooldown.size>10000)for(const[k,v]of cooldown)if(v<now)cooldown.delete(k);return true;}
 async function isAdmin(i,d){const member=await i.guild.members.fetch(i.user.id);return member.roles.cache.has(d.adminRole)||i.guild.ownerId===i.user.id;}
 async function sendStaffLinkCode(discordId,code,username){
  requireReady();
  const user=await client.users.fetch(discordId);if(user.bot)throw new Error('Use uma conta humana.');
  let present=false;for(const d of config.divisions){const g=await guild(d.guild);const m=await g.members.fetch({user:discordId,force:true}).catch(e=>{if(e.code===10007)return null;throw e;});if(m){present=true;break;}}
  if(!present)throw new Error('Entre em uma das divisões antes de vincular sua conta.');
  await user.send({embeds:[new EmbedBuilder().setContext('SEGURANÇA DA CONTA').setTone('info').setTitle('Confirme seu Discord no painel').setDescription('Use este código no painel em que iniciou a vinculação.').addFields({name:'Código de confirmação',value:`\`\`\`${code}\`\`\``},{name:'Login',value:safe(username),inline:true},{name:'Validade',value:'10 minutos',inline:true},{name:'Proteja sua conta',value:'Não compartilhe este código. Se você não solicitou a vinculação, ignore esta mensagem.'})],allowedMentions:{parse:[]}});
 }
 async function setup(){
  requireReady();
  for(const d of config.divisions){
   const g=await guild(d.guild);const roles=await g.roles.fetch();
   const memberRole=roles.get(d.memberRole),adminRole=roles.get(d.adminRole);const me=await g.members.fetchMe();
   if(!memberRole||!adminRole||d.memberRole===d.adminRole||memberRole.id===g.id||memberRole.managed||memberRole.permissions.has(PermissionFlagsBits.Administrator))throw new Error(`Revise os cargos da ${d.name}. O cargo de membro não pode ser administrativo.`);
   if(me.roles.highest.comparePositionTo(memberRole)<=0||!me.permissions.has(PermissionFlagsBits.ManageRoles))throw new Error(`O cargo do bot precisa estar acima do cargo de membro na ${d.name}, com Gerenciar cargos.`);
   const category=await g.channels.fetch(d.category);if(category?.type!==ChannelType.GuildCategory)throw new Error(`Categoria de tickets inválida na ${d.name}.`);
   // Ticket channels are created with explicit overwrites, never inherited public permissions.
   for(const [id,title,description,custom,label]of [
    [d.verification,'Verificação IFJ','**Sua identidade. Seu acesso à família.**\nConfirme seu cadastro para liberar os canais da sua divisão.\n\n**01 · Tenha seu IFJ**\nUse os 15 números da sua carteira. Ele precisa estar vinculado ao seu Discord.\n**02 · Confira os dados**\nRevise as informações e confirme que o cadastro é seu.\n**03 · Acesse a divisão**\nO bot atribui os cargos correspondentes ao seu cadastro.','verify','Verificar meu IFJ'],
    [d.tickets,'Atendimento','**Um espaço para resolver o que você precisa.**\nAbra um canal de atendimento com a equipe da divisão.\n\n**Antes de começar**\nDescreva o problema com contexto e, se necessário, anexe imagens.\n\n**Durante o atendimento**\nAguarde a resposta da equipe no canal criado. Evite abrir pedidos repetidos.','ticket','Abrir ticket'],
    [d.reports,'Denúncias','**Seu relato será analisado com cuidado.**\nInforme o IFJ ou ID Discord da pessoa e descreva o ocorrido com contexto e provas.\n\n**Análise reservada**\nA denúncia chega ao painel dos administradores. A conclusão será enviada no seu privado.\n\n**Tribunal, quando necessário**\nUm administrador poderá abrir um canal com você e a pessoa denunciada para ouvir os dois lados. Nesse canal, as identidades ficam visíveis entre os participantes.','report','Fazer denúncia']
   ]){
    const embed=new EmbedBuilder(d.id).setContext(({verify:'IDENTIDADE E ACESSO',ticket:'CENTRAL DE ATENDIMENTO',report:'RELATOS E ANÁLISE'})[custom]).setTitle(title).setDescription(description);
    if(custom==='verify')embed.addFields({name:'Quem acessa as duas divisões?',value:'Aliados, Líder, Sub líder e High member. Os demais acessam sua divisão. Aliados migrados são reconhecidos pelo ID Discord.'});
    embed.addFields({name:'Começar agora',value:`Clique em **${label}**. A primeira resposta aparece somente para você.`}).setFooter({text:`${d.name} • Central de serviços`});
    const c=await channel(id,d.guild);const content={embeds:[embed],components:[row(button(custom,label))],allowedMentions:{parse:[]}};
    await publishPanel(pool,client,c,id,custom,content);
   }
   await channel(d.wanted,d.guild);
   await community.publishGuide(d);
   await publishAlliance(pool,client,d,config.hydraInvite);
  }
 }
 async function closeTicket(id,actor){
  requireReady();
  await tx(pool,async c=>{const ticket=(await c.query('SELECT * FROM tickets WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!ticket)throw new Error('Ticket não encontrado.');if(ticket.status==='resolvido')return;
   await c.query("UPDATE tickets SET status='fechando',closed_by=$1 WHERE id=$2",[actor,id]);await enqueue(c,'close-ticket',{id});await audit(c,actor,'Ticket encerrado',{ticketId:id});
  });
 }
 async function openTicket(i,d){
  // A transaction-scoped lock prevents concurrent duplicate channel creation across processes.
  await tx(pool,async c=>{
   await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`ticket:${i.guildId}:${i.user.id}`]);
   let ticket=(await c.query("SELECT * FROM tickets WHERE guild_id=$1 AND user_id=$2 AND status<>'resolvido'",[i.guildId,i.user.id])).rows[0];
   if(ticket?.channel_id){const existing=await i.guild.channels.fetch(ticket.channel_id).catch(e=>{if(e.code===10003)return null;throw e;});if(existing){await i.editReply(`Seu ticket: <#${ticket.channel_id}>`);return;}await c.query("UPDATE tickets SET status='resolvido' WHERE id=$1",[ticket.id]);ticket=null;}
   const all=await i.guild.channels.fetch();
   // Recover a channel if a previous process stopped after Discord created it but before DB commit.
   let ch=all.find(x=>x?.topic===`IFJ ticket ${i.user.id}` && x.parentId===d.category);
   if(!ticket)ticket=(await c.query('INSERT INTO tickets(guild_id,user_id) VALUES($1,$2) RETURNING *',[i.guildId,i.user.id])).rows[0];
   if(!ch)ch=await i.guild.channels.create({name:`ticket-${ticket.id}`,type:ChannelType.GuildText,parent:d.category,topic:`IFJ ticket ${i.user.id}`,permissionOverwrites:[{id:i.guildId,deny:[PermissionFlagsBits.ViewChannel]},{id:i.user.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory,PermissionFlagsBits.AttachFiles]},{id:d.adminRole,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory]},{id:client.user.id,allow:[PermissionFlagsBits.ViewChannel,PermissionFlagsBits.SendMessages,PermissionFlagsBits.ReadMessageHistory,PermissionFlagsBits.ManageChannels]}]});
   await c.query('UPDATE tickets SET channel_id=$1 WHERE id=$2',[ch.id,ticket.id]);
   await ch.send({embeds:[new EmbedBuilder(d.id).setContext('ATENDIMENTO').setTitle(`Ticket #${ticket.id}`).setDescription('**Seu atendimento começou.**\nConte o que aconteceu e aguarde a equipe neste canal.').addFields({name:'Solicitante',value:`<@${i.user.id}>`,inline:true},{name:'Divisão',value:d.name,inline:true},{name:'O que enviar',value:'Explique sua dúvida e inclua imagens ou informações que ajudem a equipe. Evite compartilhar senhas e códigos de acesso.'},{name:'Encerramento',value:'Quando o caso estiver resolvido, um administrador poderá encerrar pelo botão abaixo. O canal será removido.'})],components:[row(button(`close:${ticket.id}`,'Fechar — resolvido',ButtonStyle.Danger))],allowedMentions:{parse:[]}});
   await i.editReply(`Seu ticket foi aberto: <#${ch.id}>`);
  });
 }
 async function interact(i){
  if(await allies.interact(i))return;
  if(await warnings.interact(i))return;
  if(await community.interact(i))return;
  if(await provision(i))return;
  if(!i.isButton()&&!i.isModalSubmit())return;
  const d=byGuild(i.guildId);if(!d)return i.reply({...ephemeral,content:'Servidor não configurado.'});
  if(!guard(i))return i.reply({...ephemeral,content:'Aguarde alguns segundos para tentar novamente.'});
  if(i.isButton()&&i.customId==='verify')return i.showModal(modal('verify-form','Verificação de membro',[['ifj','Seu IFJ de 15 números',15]]));
  if(i.isButton()&&i.customId==='report')return i.showModal(modal('report-form','Denunciar membro',[['subject','Nome no jogo, Discord, Roblox ou IFJ',100],['reason','O que aconteceu?',1800,true]]));
  await i.deferReply(ephemeral);
  if(i.isModalSubmit()&&i.customId==='verify-form'){
   const code=i.fields.getTextInputValue('ifj').trim();if(!/^\d{15}$/.test(code))return i.editReply('O IFJ deve conter exatamente 15 números.');
   const m=(await pool.query('SELECT * FROM members WHERE ifj=$1',[code])).rows[0];
   if(!m)return i.editReply('IFJ não encontrado.');
   if(!bothDivisions(m)&&m.division!==d.id)return i.editReply('Seu IFJ pertence à outra divisão. Acesse o servidor da sua divisão.');
   if(m.discord_id!==i.user.id)return i.editReply('Este IFJ não está vinculado ao seu Discord. Procure um administrador.');
   const t=token();const inserted=await pool.query(`INSERT INTO confirmations(token,member_id,discord_id,guild_id,expires_at,member_version) SELECT $1,id,$3,$4,$5,identity_version FROM members WHERE id=$2 AND identity_version=$6 AND discord_id=$3 `,[t,m.id,i.user.id,i.guildId,new Date(Date.now()+5*60000),m.identity_version]);if(!inserted.rowCount)return i.editReply('Cadastro atualizado. Inicie a verificação novamente.');
   return i.editReply({content:`Confirme seus dados:\nNome: **${safe(m.name)}**\nTipo: **${m.account_kind==='aliado'?'Aliado':'Membro'}**${m.account_kind==='aliado'?`\nGang aliada: **${safe(m.allied_gang)}**\n${ALLIANCE_NOTICE}`:`\nPatente: **${safe(m.member_rank)}**`}\nNome no jogo: **${safe(m.game_nick||'Não informado')}**\nUsuário Roblox: **${safe(m.roblox_username||'Não informado')}**\nAcesso: **${bothDivisions(m)?'1ª e 2ª divisões':safe(d.name)}**\nEssa confirmação expira em 5 minutos.`,components:[row(button(`confirm:${t}`,'Sou eu',ButtonStyle.Success),button(`cancel:${t}`,'Cancelar',ButtonStyle.Secondary))]});
  }
  if(i.isButton()&&/^(confirm|cancel):/.test(i.customId)){
   const [action,t]=i.customId.split(':');
   const message=await tx(pool,async c=>{
    const confirmation=(await c.query('SELECT * FROM confirmations WHERE token=$1 AND discord_id=$2 AND guild_id=$3 AND expires_at>now()',[t,i.user.id,i.guildId])).rows[0];
    if(!confirmation)return 'Confirmação expirada ou já utilizada. Inicie novamente.';
    const m=(await c.query('SELECT * FROM members WHERE id=$1 FOR UPDATE',[confirmation.member_id])).rows[0];
    const consumed=await c.query('DELETE FROM confirmations WHERE token=$1 AND discord_id=$2 AND guild_id=$3 AND expires_at>now() RETURNING token',[t,i.user.id,i.guildId]);if(!consumed.rowCount)return 'Confirmação expirada ou já utilizada. Inicie novamente.';
    if(action==='cancel')return 'Verificação cancelada.';
    if(!m||m.identity_version!==confirmation.member_version||(!bothDivisions(m)&&m.division!==d.id)||m.discord_id!==i.user.id)return 'IFJ inválido para este usuário ou divisão.';
    await c.query('UPDATE members SET verified=TRUE WHERE id=$1',[m.id]);await enqueue(c,'sync-role',{discordId:i.user.id});
    return 'Dados confirmados! O bot está liberando seu acesso. Se os canais não aparecerem, avise um administrador.';
   });return i.editReply({content:message,components:[]});
  }
  if(i.isModalSubmit()&&i.customId==='report-form'){
   const subject=text(i.fields.getTextInputValue('subject'),'Nome',100);const reason=text(i.fields.getTextInputValue('reason'),'Motivo',1800);
   const message=await tx(pool,async c=>{
    const found=await c.query('SELECT * FROM members WHERE lower(game_nick)=lower($1) OR lower(roblox_username)=lower($1) OR lower(discord_username)=lower($1) OR discord_id=$1 OR ifj=$1',[subject]);
    if(!found.rowCount)return 'IFJ não encontrado';
    if(found.rowCount>1)return 'Há mais de um membro com esse nome. Envie a denúncia usando o IFJ exato.';
    const locked=await c.query('SELECT * FROM members WHERE id=$1 FOR UPDATE',[found.rows[0].id]);if(!locked.rowCount)return 'IFJ não encontrado';const m=locked.rows[0];
    const report=(await c.query('INSERT INTO reports(member_id,subject,reporter_id,division,reason,subject_discord_id) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[m.id,m.game_nick||m.name,i.user.id,m.division,reason,m.discord_id])).rows[0];
    await c.query('UPDATE members SET suspect=TRUE WHERE id=$1',[m.id]);
    const target=config.divisions.find(x=>x.id===m.division);if(target.staffChannel)await enqueue(c,'report-notice',{division:m.division,reportId:report.id});
    return 'Obrigado, vamos analisar';
   });return i.editReply(message);
  }
  if(i.isButton()&&i.customId==='ticket')return openTicket(i,d);
  if(i.isButton()&&i.customId.startsWith('close:')){
   if(!await isAdmin(i,d))return i.editReply('Somente administradores podem encerrar o ticket.');
   const id=Number(i.customId.split(':')[1]);const t=(await pool.query('SELECT * FROM tickets WHERE id=$1 AND guild_id=$2 AND channel_id=$3',[id,i.guildId,i.channelId])).rows[0];
   if(!t)return i.editReply('Ticket não encontrado neste canal.');await closeTicket(id,i.user.id);return i.editReply('Ticket resolvido. O canal será removido e o registro ficará no painel.');
  }
  return i.editReply('Ação não reconhecida.');
 }
 client.on('interactionCreate',i=>(activated?interact(i):i.reply({...ephemeral,content:'Sistema em verificação de inicialização. Tente novamente em instantes.'})).catch(async e=>{console.error('Interação falhou:',e.code||e.name);const msg={content:'Não foi possível concluir. Tente novamente ou procure um administrador.',allowedMentions:{parse:[]}};try{if(i.deferred||i.replied)await i.editReply(msg);else await i.reply({...ephemeral,...msg});}catch{}}));
 client.on('guildMemberAdd',member=>community.joined(member).catch(e=>console.error('Boas-vindas: falha ao registrar entrada',e.code||e.name)));
 async function execute(job,c){
  if(tribunalJobs.has(job.kind))return tribunals.execute(job,c);
  if(allyJobs.has(job.kind))return allies.execute(job,c);
  if(job.kind==='warning-dm')return warnings.execute(job,c);
  if(communityJobs.has(job.kind))return community.execute(job,c);
  const p=job.payload;
  if(job.kind==='sync-role'){
   await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`role:${p.discordId}`]);
   const member=(await c.query('SELECT * FROM members WHERE discord_id=$1 FOR UPDATE',[p.discordId])).rows[0];
   for(const d of config.divisions){
    const g=await guild(d.guild);const user=await g.members.fetch({user:p.discordId,force:true}).catch(e=>{if(e.code===10007)return null;throw e;});if(!user)continue;
    await synchronizeRoles(g,d,user,member);
   }return;
  }
  if(job.kind==='announcement'||job.kind==='war'){
   const d=config.divisions.find(x=>x.id===p.division);const ch=await channel(d.wanted,d.guild);
   const sent=await ch.send({...announcementMessage(job,d),nonce:String(job.id),enforceNonce:true});
   await c.query('UPDATE jobs SET message_id=$1 WHERE id=$2',[sent.id,job.id]);return;
  }
  if(job.kind==='report-notice'){
   const d=config.divisions.find(x=>x.id===p.division);if(!d.staffChannel)return;
   const ch=await channel(d.staffChannel,d.guild);
   // Do not publish names or report details; full content is restricted to the admin dashboard.
   const sent=await ch.send({embeds:[new EmbedBuilder(d.id).setContext('ANÁLISE ADMINISTRATIVA').setTone('warning').setTitle(`Nova denúncia #${p.reportId}`).setDescription('**Aguardando análise de um administrador.**\nAbra a categoria **Denúncias** no painel para consultar o relato e os envolvidos.').addFields({name:'Próximos passos',value:'Revise as informações, abra um tribunal se precisar ouvir as duas pessoas e registre a conclusão no painel.'},{name:'Privacidade',value:'Identidades e provas ficam disponíveis somente na área administrativa e no tribunal, quando aberto.'})],allowedMentions:{parse:[]},nonce:String(job.id),enforceNonce:true});await c.query('UPDATE jobs SET message_id=$1 WHERE id=$2',[sent.id,job.id]);return;
  }
  if(job.kind==='close-ticket'){
   const t=(await c.query('SELECT * FROM tickets WHERE id=$1 FOR UPDATE',[p.id])).rows[0];if(!t||t.status==='resolvido')return;
   if(t.channel_id){const ch=await client.channels.fetch(t.channel_id).catch(e=>{if(e.code===10003)return null;throw e;});if(ch){if(ch.guildId!==t.guild_id)throw new Error('Servidor de ticket inválido.');await ch.delete('Ticket resolvido');}}
   await c.query("UPDATE tickets SET status='resolvido' WHERE id=$1",[t.id]);return;
  }
  throw new Error('Tipo de operação desconhecido.');
 }
 async function work(){
  if(busy||!ready())return;busy=true;
  try{
   for(let n=0;n<10;n++){
    let picked;
    try{const processed=await tx(pool,async c=>{
     const job=(await c.query("SELECT * FROM jobs WHERE status='pending' AND next_at<=now() ORDER BY id FOR UPDATE SKIP LOCKED LIMIT 1")).rows[0];if(!job)return false;picked=job;
     await execute(job,c);await c.query("UPDATE jobs SET status='sent',error=NULL WHERE id=$1",[job.id]);return true;
    });if(!processed)break;
    }catch(e){if(!picked)throw e;const attempts=picked.attempts+1;const tribunalFailure=String(e.code||'').startsWith('TRIBUNAL_');await pool.query('UPDATE jobs SET attempts=$1,status=$2,error=$3,next_at=$4 WHERE id=$5',[attempts,(attempts>=8||tribunalFailure||[50007,'IFJ_CHANGED'].includes(e.code))?'failed':'pending',tribunalFailure?e.message:e.code===50007?'Discord bloqueou a mensagem privada. Peça ao destinatário para permitir DMs e tente novamente.':e.code==='IFJ_CHANGED'?'Cadastro cancelado ou Discord alterado. Carteira não enviada.':`Discord/operação: ${e.code||e.name}. Verifique canais, cargos, permissões e conexão.`,new Date(Date.now()+Math.min(300000,2000*2**attempts)),picked.id]);}
   }
   await pool.query('DELETE FROM confirmations WHERE expires_at<now()');await pool.query('DELETE FROM sessions WHERE expires_at<now()');
  }catch(e){console.error('Fila do bot:',e.code||e.name);}finally{busy=false;}
 }
 function activate(){if(activated)return;activated=true;timer=setInterval(work,3000);timer.unref();work();}
 async function start(){
  if(!config.botEnabled)return;
  await new Promise((resolve,reject)=>{
   const finish=err=>{clearTimeout(timeout);client.off('clientReady',onReady);client.off('shardDisconnect',onDisconnect);if(err)reject(err);else resolve();};
   const onDisconnect=event=>{if(event.code===4014)finish(new StartupError('Ative Server Members Intent no Discord Developer Portal → Bot antes de iniciar.'));};
   const onReady=()=>finish();const timeout=setTimeout(()=>finish(new StartupError('Discord não ficou pronto em 35 segundos. Confira token e conexão.')),35000);
   client.on('shardDisconnect',onDisconnect);client.once('clientReady',onReady);client.login(config.token).catch(finish);
  });
 }
 client.on('error',e=>console.error('Conexão Discord:',e.code||e.name));
 return {ready,setup,sendStaffLinkCode,closeTicket,openTribunal:(reportId,staffId,division)=>{requireReady();return tribunals.request(reportId,staffId,division);},client,handleInteraction:interact,handleMemberJoin:community.joined,publishGuide:community.publishGuide,start,activate,validate:async log=>{await validateDiscord(client,config,log);await log.test('Discord: registrar comandos /criar e /deletar',()=>registerCreate(client,config.divisions));await log.test('Discord: registrar /warn nas duas divisões',warnings.register);if(config.oldAllyRole)await log.test('Discord: cargo de aliados antigo e /migrar-aliados',allies.validate);if(config.immigrationGuild)await log.test('Discord: registrar /imigração no servidor antigo',community.register);await log.test('Discord: publicar painéis decorados e guias das duas divisões',setup);},stop:async()=>{activated=false;clearInterval(timer);await client.destroy();},work};
}
