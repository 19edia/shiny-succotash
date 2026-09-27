import {publishPanel,findPanel,panelPayload} from './panels.js';
import {RokuharaEmbed as EmbedBuilder} from './embed-theme.js';
import {PermissionFlagsBits,ButtonBuilder,ButtonStyle,ActionRowBuilder,TextInputBuilder,TextInputStyle,ModalBuilder,SlashCommandBuilder,AttachmentBuilder,MessageFlags,escapeMarkdown} from 'discord.js';
import {tx} from './db.js';
import {text} from './security.js';
import {renderCard} from './cards.js';
import {bothDivisions} from './identity.js';
const safe=value=>escapeMarkdown(String(value)).replace(/@/g,'＠');
const commands=['imigração','imigracao'];
const privateReply={flags:MessageFlags.Ephemeral,allowedMentions:{parse:[]}};
export const communityJobs=new Set(['welcome','report-resolution','immigration-decision']);
export function guideMessage(d){return {embeds:[new EmbedBuilder(d.id).setContext('GUIA DE ACESSO').setTitle('Como verificar • ROKUHARA').setDescription([
 '**Seu cadastro abre as portas da família.**',
 `Tenha seu IFJ em mãos e vá a <#${d.verification}>. Clique em **Verificar meu IFJ**, confira seus dados e confirme em **Sou eu**.`,
 '**Quem pode acessar cada divisão?**\nAliados, Líder, Sub líder e High member podem verificar nas duas divisões. Os demais acessam a divisão cadastrada.'
 ].join('\n\n')).addFields(
 {name:'01 · Pegue seu IFJ',value:'Solicite o cadastro à equipe. Você receberá uma identificação de **15 números**, vinculada ao seu ID Discord.',inline:true},
 {name:'02 · Confira os dados',value:'Revise nome, conta Roblox e divisão. Se algo estiver errado, cancele e peça a correção à equipe.',inline:true},
 {name:'03 · Confirme sua identidade',value:'Use **Sou eu**. O bot libera os cargos e o acesso autorizados pelo seu cadastro.'},
 {name:'Veio do servidor antigo?',value:'Clique em **Solicitar imigração** no aviso da administração. Após aprovação, o IFJ e a carteira PNG chegam no privado. Depois, faça a verificação.'},
 {name:'Já é um aliado migrado?',value:'Entre com a mesma conta Discord cadastrada. O bot reconhece seu ID e libera o acesso automaticamente.'}
 ).setFooter({text:`${d.name} • Nunca publique seu IFJ em canais abertos`})],allowedMentions:{parse:[]}};}
export function createCommunity(pool,config,client){
 async function publishGuide(d){
  const ch=await client.channels.fetch(d.guide);
  if(!ch||ch.guildId!==d.guild||!ch.isTextBased()||!ch.send)throw new Error('Canal como-verificar inválido.');
  await publishPanel(pool,client,ch,d.guide,'guide',guideMessage(d));
 }
 async function register(){
  if(!config.immigrationGuild)return;
  const g=await client.guilds.fetch(config.immigrationGuild);
  for(const name of commands)await g.commands.create(new SlashCommandBuilder().setName(name).setDescription('Publicar aviso de imigração com prazo de 10 dias e botão').setDefaultMemberPermissions(PermissionFlagsBits.Administrator).toJSON());
 }
 async function interact(i){
  const command=i.isChatInputCommand?.()&&commands.includes(i.commandName);
  const submit=i.isModalSubmit?.()&&i.customId==='immigration-form';
  const click=i.isButton?.()&&i.customId==='immigration-open';
  if(!command&&!submit&&!click)return false;
  if(!config.immigrationGuild||i.guildId!==config.immigrationGuild){await i.reply({...privateReply,content:'Use esse comando no servidor antigo da ROKUHARA.'});return true;}
  if(command){
   await i.deferReply(privateReply);
   const g=await client.guilds.fetch(i.guildId);
   const actor=await g.members.fetch({user:i.user.id,force:true}).catch(e=>{if(e.code===10007)return null;throw e;});
   if(!actor||(g.ownerId!==i.user.id&&!actor.permissions.has(PermissionFlagsBits.Administrator))){await i.editReply('Somente o dono ou um administrador do servidor antigo pode publicar o aviso. Clique em Solicitar imigração no aviso para preencher seu pedido.');return true;}
   const notice=await tx(pool,async c=>{
    await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`immigration-notice:${i.guildId}`]);
    const n=(await c.query("INSERT INTO immigration_notices(guild_id,channel_id,deadline) VALUES($1,$2,now()+interval '10 days') ON CONFLICT(guild_id) DO UPDATE SET guild_id=EXCLUDED.guild_id RETURNING *",[i.guildId,i.channelId])).rows[0];
    const ch=await client.channels.fetch(n.channel_id);
    if(!ch||ch.guildId!==i.guildId||!ch.isTextBased()||!ch.send)throw new Error('Canal do aviso indisponível.');
    const timestamp=Math.floor(new Date(n.deadline).getTime()/1000);
    const content={embeds:[new EmbedBuilder().setContext('MUDANÇA DE SERVIDOR').setTone('warning').setTitle('ROKUHARA • Vamos imigrar!').setDescription('**A família continua nos novos servidores.**\nEste servidor será excluído em 10 dias a partir da publicação deste aviso. Faça seu pedido pelo botão **Solicitar imigração** abaixo.').addFields(
     {name:'Prazo anunciado',value:`<t:${timestamp}:F>\n<t:${timestamp}:R>`},
     {name:'01 · Envie seu pedido',value:'Informe seu nome no jogo e seu nome no Discord. A administração completa o cadastro e analisa os dados.',inline:true},
     {name:'02 · Receba a resposta',value:'Se aprovado, você recebe IFJ e carteira PNG no privado. Se recusado, recebe o motivo.',inline:true},
     {name:'03 · Entre na nova divisão',value:'Após a aprovação, entre no servidor autorizado e verifique seu IFJ para liberar o acesso.'},
     {name:'Antes de solicitar',value:'Permita mensagens privadas de membros deste servidor para receber a decisão e seus documentos.'}
    ).setFooter({text:'Prazo original preservado • Exclusão manual pelo dono do servidor'})],components:[new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('immigration-open').setLabel('Solicitar imigração').setStyle(ButtonStyle.Success))],allowedMentions:{parse:[]}};
    const payload=panelPayload(content,'immigration');
    let message=await findPanel(ch,client.user?.id,'immigration',n.message_id);
    if(message)await message.edit(payload);else message=await ch.send({...payload,nonce:i.id,enforceNonce:true});
    await c.query('UPDATE immigration_notices SET message_id=$1 WHERE guild_id=$2',[message.id,i.guildId]);
    return {channelId:n.channel_id,messageId:message.id};
   });
   await i.editReply(`Aviso publicado/atualizado: https://discord.com/channels/${i.guildId}/${notice.channelId}/${notice.messageId}. A data original foi preservada. Os membros entram pelo botão. A exclusão do servidor é manual.`);return true;
  }
  if(click){
   const form=new ModalBuilder().setCustomId('immigration-form').setTitle('Imigração • ROKUHARA').addComponents([
    ['game_nick','Seu nome no jogo',64],['discord_name','Seu nome no Discord',100]
   ].map(([key,label,max])=>new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId(key).setLabel(label).setMaxLength(max).setRequired(true).setStyle(TextInputStyle.Short))));
   await i.showModal(form);return true;
  }
  await i.deferReply(privateReply);
  const game=text(i.fields.getTextInputValue('game_nick'),'Nome no jogo',64),name=text(i.fields.getTextInputValue('discord_name'),'Nome no Discord',100);
  const result=await tx(pool,async c=>{
   await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`immigration:${i.user.id}`]);
   if((await c.query('SELECT id FROM members WHERE discord_id=$1',[i.user.id])).rowCount)return 'Você já possui IFJ. Procure a equipe para consultar ou corrigir seu cadastro.';
   if((await c.query("SELECT id FROM immigrations WHERE discord_id=$1 AND status='pendente'",[i.user.id])).rowCount)return 'Você já tem um pedido em análise. Aguarde a decisão do administrador.';
   const r=(await c.query('INSERT INTO immigrations(discord_id,guild_id,game_nick,discord_name) VALUES($1,$2,$3,$4) RETURNING id',[i.user.id,i.guildId,game,name])).rows[0];
   return `Pedido #${r.id} enviado! O administrador completará seus dados. Você receberá a decisão no privado. Permita mensagens privadas de membros deste servidor para receber o IFJ e a carteira.`;
  });await i.editReply(result);return true;
 }
 async function joined(member){
  const d=config.divisions.find(x=>x.guild===member.guild.id);if(!d||member.user.bot)return;
  const joinedAt=member.joinedTimestamp;if(!joinedAt)throw new Error('Entrada sem data de ingresso.');
  const imported=(await pool.query("SELECT id FROM members WHERE discord_id=$1 AND auto_allied=TRUE AND verified=TRUE AND account_kind='aliado'",[member.id])).rowCount;
  if(imported)await pool.query("INSERT INTO jobs(kind,payload,dedupe_key) VALUES('sync-role',$1,$2) ON CONFLICT DO NOTHING",[JSON.stringify({discordId:member.id}),`ally-join:${d.guild}:${member.id}:${joinedAt}`]);
  await pool.query("INSERT INTO jobs(kind,payload,dedupe_key) VALUES('welcome',$1,$2) ON CONFLICT DO NOTHING",[JSON.stringify({guildId:d.guild,discordId:member.id,joinedAt}),`welcome:${d.guild}:${member.id}:${joinedAt}`]);
 }
 async function execute(job,c){
  const options={allowedMentions:{parse:[]},nonce:String(job.id),enforceNonce:true};let sent;
  if(job.kind==='welcome'){
   const d=config.divisions.find(x=>x.guild===job.payload.guildId);if(!d)return;
   const g=await client.guilds.fetch(d.guild);
   const member=await g.members.fetch({user:job.payload.discordId,force:true}).catch(e=>{if(e.code===10007)return null;throw e;});
   if(!member||member.joinedTimestamp!==job.payload.joinedAt)return;
   const imported=(await c.query("SELECT id FROM members WHERE discord_id=$1 AND auto_allied=TRUE AND verified=TRUE AND account_kind='aliado'",[member.id])).rowCount;
   const ch=await client.channels.fetch(d.welcome);if(ch?.guildId!==d.guild)throw new Error('Canal de boas-vindas inválido.');
   const welcome=new EmbedBuilder(d.id).setContext('RECEPÇÃO').setTitle('Bem-vindo à ROKUHARA').setDescription(imported?'🤝 **Aliado reconhecido!**\nSua conta já está vinculada à aliança ROKUHARA. Seu acesso e o cargo Aliados serão liberados automaticamente.\n\nObrigado por continuar essa parceria conosco!':`**Sua jornada começa aqui.**\nLeia o guia em <#${d.guide}> e verifique seu IFJ em <#${d.verification}> para liberar seu acesso.`).addFields(
    {name:'Sua comunidade',value:safe(d.name),inline:true},
    {name:'Acesso',value:imported?'Reconhecimento automático':'Aguardando verificação IFJ',inline:true},
    {name:imported?'Pode entrar e se apresentar':'Ainda não tem IFJ?',value:imported?'Conheça os canais, leia as regras e procure a equipe se precisar de ajuda.':'Procure a equipe para solicitar seu cadastro. Depois, volte ao canal de verificação.'}
   ).setFooter({text:`${d.name} • União, respeito e lealdade`});
   sent=await ch.send({...options,content:`<@${member.id}>`,allowedMentions:{parse:[],users:[member.id]},embeds:[new EmbedBuilder(d.id).setImage(member.displayAvatarURL({extension:'png',size:256})).setAuthor(null).setFooter(null).setTimestamp(null),welcome]});
  }else if(job.kind==='report-resolution'){
   const r=(await c.query("SELECT * FROM reports WHERE id=$1 AND status='resolvida'",[job.payload.reportId])).rows[0];if(!r)return;
   const user=await client.users.fetch(r.reporter_id);
   sent=await user.send({...options,embeds:[new EmbedBuilder().setContext('DENÚNCIAS • RETORNO PRIVADO').setTone('success').setTitle(`Resultado da denúncia #${r.id}`).setDescription(safe(r.resolution)).addFields(
    {name:'Situação',value:'Análise concluída',inline:true},
    {name:'Protocolo',value:`#${r.id}`,inline:true},
    {name:'Precisa esclarecer algo?',value:'Procure a administração e informe o protocolo acima para conversar sobre a decisão.'}
   ).setFooter({text:'Resposta da administração • Atendimento reservado'})]});
  }else if(job.kind==='immigration-decision'){
   const r=(await c.query('SELECT * FROM immigrations WHERE id=$1',[job.payload.requestId])).rows[0];if(!r||r.status==='pendente')return;
   let message;
   if(r.status==='aprovada'){
    const m=(await c.query('SELECT * FROM members WHERE id=$1 FOR UPDATE',[r.member_id])).rows[0];
    if(!m||m.discord_id!==r.discord_id)throw Object.assign(new Error('Cadastro cancelado ou Discord alterado; carteira não enviada.'),{code:'IFJ_CHANGED'});
    const division=config.divisions.find(d=>d.id===m.division);
    const card=await renderCard(m,division.name);
    message={embeds:[new EmbedBuilder(division.id).setContext('IMIGRAÇÃO • CADASTRO APROVADO').setTone('success').setTitle('Imigração aprovada • ROKUHARA').setDescription(`**Seu cadastro foi aprovado. Bem-vindo à nova etapa!**\nSeu IFJ: **${m.ifj}**\nA carteira PNG está anexada a esta mensagem.`).addFields(
     {name:'Nome cadastrado',value:safe(m.name),inline:true},
     {name:'Patente',value:safe(m.member_rank),inline:true},
     {name:'Divisões autorizadas',value:bothDivisions(m)?'1ª e 2ª divisões':safe(division.name)},
     {name:'Próximo passo · Verifique seu IFJ',value:'Entre no servidor autorizado, informe seu IFJ e confirme seus dados para receber os cargos. A aprovação não substitui a verificação. Se precisar do convite, peça à equipe.'}
    ).setFooter({text:'Documento pessoal • Guarde o IFJ e a carteira em particular'})],files:[new AttachmentBuilder(card,{name:`ROKUHARA-${m.ifj}-v${m.identity_version}.png`})]};
   }else message={embeds:[new EmbedBuilder().setContext('IMIGRAÇÃO • DECISÃO DA EQUIPE').setTone('danger').setTitle('Imigração recusada • ROKUHARA').setDescription(safe(r.reason)).addFields(
    {name:'Pedido',value:`#${r.id}`,inline:true},
    {name:'Situação',value:'Não aprovado',inline:true},
    {name:'Como continuar',value:'Leia o motivo acima e procure a administração se precisar corrigir informações ou esclarecer o resultado.'}
   ).setFooter({text:'Retorno privado • Administração ROKUHARA'})]};
   const user=await client.users.fetch(r.discord_id);sent=await user.send({...options,...message});
  }
  if(sent)await c.query('UPDATE jobs SET message_id=$1 WHERE id=$2',[sent.id,job.id]);
 }
 return {register,interact,joined,execute,publishGuide};
}
