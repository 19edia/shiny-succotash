import {randomBytes} from 'node:crypto';
import {ChannelType,OverwriteType,PermissionFlagsBits as P,escapeMarkdown} from 'discord.js';
import {tx,enqueue,audit} from './db.js';
import {publishPanel} from './panels.js';
import {RokuharaEmbed} from './embed-theme.js';

export const tribunalJobs=new Set(['tribunal-open','tribunal-close','tribunal-invite']);
const fail=(message,status=400,code='TRIBUNAL_INVALID')=>Object.assign(new Error(message),{status,code});
const safe=value=>escapeMarkdown(String(value??'')).replace(/@/g,'＠');
const identity=value=>/^\d{17,20}$/.test(value??'');
const link=t=>`https://discord.com/channels/${t.guild_id}/${t.channel_id}`;
const topic=t=>`IFJ tribunal ${t.report_id} · ${t.channel_token}`;
const participants=t=>[...new Set([t.admin_discord_id,t.reporter_id,t.accused_id])];

function overwrites(t,botId,closed=false){
 const restricted=[P.ManageChannels,P.ManageRoles,P.ManageMessages,P.ManageThreads,P.ManageWebhooks,P.CreateInstantInvite,P.MentionEveryone,P.CreatePublicThreads,P.CreatePrivateThreads,P.SendMessagesInThreads];
 return [
  {id:t.guild_id,type:OverwriteType.Role,deny:[P.ViewChannel]},
  {id:botId,type:OverwriteType.Member,allow:[P.ViewChannel,P.SendMessages,P.ReadMessageHistory,P.ManageChannels,P.ManageRoles,P.EmbedLinks,P.AttachFiles]},
  ...participants(t).map(id=>({id,type:OverwriteType.Member,allow:[P.ViewChannel,P.ReadMessageHistory,...(closed?[]:[P.SendMessages,P.AttachFiles,P.EmbedLinks])],deny:[...restricted,...(closed?[P.SendMessages,P.AddReactions,P.AttachFiles]:[])]}))
 ];
}
function tribunalMessage(t,r,closed=false){
 const embed=new RokuharaEmbed(t.division).setContext('TRIBUNAL').setTone(closed?'success':'warning')
  .setTitle(`Tribunal · Denúncia #${r.id}`)
  .setDescription(closed?'**Análise encerrada**\nO resultado está registrado abaixo. Este canal foi preservado para consulta.':'**Espaço de escuta e análise**\nO administrador reunirá as versões e as provas antes de concluir o caso. Uma denúncia não significa culpa.')
  .addFields({name:'Administrador responsável',value:`<@${t.admin_discord_id}>`,inline:true},{name:'Denunciante',value:`<@${t.reporter_id}>`,inline:true},{name:'Pessoa denunciada',value:`<@${t.accused_id}>`,inline:true})
  .addTextFields('Relato da denúncia',safe(r.reason));
 if(closed)embed.addTextFields('Conclusão da administração',safe(r.resolution||'Análise encerrada no painel.'));
 else embed.addFields({name:'Como participar',value:'1. Cada pessoa apresenta sua versão com respeito.\n2. Anexe provas e contexto, evitando dados pessoais desnecessários.\n3. Aguarde a decisão do administrador.'});
 embed.setFooter({text:`ROKUHARA • Caso #${r.id} • ${closed?'Histórico preservado':'Acesso restrito aos envolvidos e à administração do Discord'}`});
 const data=embed.toJSON();
 const length=(data.title?.length||0)+(data.description?.length||0)+(data.author?.name.length||0)+(data.footer?.text.length||0)+(data.fields??[]).reduce((n,f)=>n+f.name.length+f.value.length,0);
 const files=[];
 if(length>5900){
  // Discord limits the combined textual content of embeds to 6,000 characters.
  // Preserve the complete record in an attachment instead of silently cutting it.
  embed.setFields(...data.fields.slice(0,3));
  embed.addTextFields('Relato · resumo',safe(r.reason.slice(0,400))+'…');
  if(closed)embed.addTextFields('Conclusão · resumo',safe((r.resolution||'').slice(0,800))+'…');
  embed.addFields({name:'Registro integral',value:'O relato e a conclusão completos estão no arquivo de texto anexado.'});
  files.push({attachment:Buffer.from(`TRIBUNAL · DENÚNCIA #${r.id}\n\nRELATO\n${r.reason}\n\nCONCLUSÃO\n${r.resolution||'Em análise'}`,'utf8'),name:`tribunal-${r.id}.txt`});
 }
 return {embeds:[embed],attachments:[],files,allowedMentions:{parse:[]}};
}

export function createTribunals(pool,config,client){
 async function request(reportId,staffId,division){
  if(!Number.isSafeInteger(Number(reportId))||Number(reportId)<1)throw fail('Denúncia inválida.');
  return tx(pool,async c=>{
   const r=(await c.query('SELECT * FROM reports WHERE id=$1 FOR UPDATE',[reportId])).rows[0];
   if(!r)throw fail('Denúncia não encontrada.',404);
   const admin=(await c.query('SELECT * FROM staff WHERE id=$1 FOR SHARE',[staffId])).rows[0];
   if(!admin?.active||admin.role!=='admin')throw fail('Somente administradores podem abrir um tribunal.',403,'TRIBUNAL_ADMIN_REQUIRED');
   if(!identity(admin.discord_id)||!admin.discord_verified_at)throw fail('Vincule e confirme seu Discord em Meu Discord antes de abrir um tribunal.',409,'TRIBUNAL_DISCORD_REQUIRED');
   if(r.status!=='pendente')throw fail('Essa denúncia já foi resolvida.',409);
   const existing=(await c.query('SELECT * FROM tribunals WHERE report_id=$1',[r.id])).rows[0];
   if(existing)return {...existing,reused:true};
   if(!identity(r.subject_discord_id))throw fail('Esta denúncia não tem o Discord original da pessoa denunciada. Não é possível abrir o tribunal.');
   if(!identity(r.reporter_id)||r.reporter_id===r.subject_discord_id)throw fail('O denunciante e a pessoa denunciada precisam ser contas diferentes.');
   const d=config.divisions.find(d=>d.id===Number(division??r.division));
   if(!d)throw fail('Escolha uma divisão configurada.');
   const t=(await c.query('INSERT INTO tribunals(report_id,guild_id,division,reporter_id,accused_id,admin_discord_id,created_by,channel_token) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',[r.id,d.guild,d.id,r.reporter_id,r.subject_discord_id,admin.discord_id,admin.id,randomBytes(24).toString('hex')])).rows[0];
   const jobId=await enqueue(c,'tribunal-open',{reportId:r.id});
   await c.query('UPDATE tribunals SET create_job_id=$1 WHERE report_id=$2',[jobId,r.id]);
   await audit(c,staffId,'Tribunal solicitado',{reportId:r.id,division:d.id});
   return {...t,create_job_id:jobId,reused:false};
  });
 }
 async function fetchChannel(g,t){
  let ch=t.channel_id?await g.channels.fetch(t.channel_id).catch(e=>{if(e.code===10003)return null;throw e;}):null;
  // Recover after Discord succeeded but the surrounding DB transaction rolled back.
  if(!ch){const all=await g.channels.fetch();ch=all.find(ch=>ch?.topic===topic(t));}
  if(ch&&(ch.guildId!==t.guild_id||ch.type!==ChannelType.GuildText||ch.topic!==topic(t)))throw fail('O canal do tribunal não corresponde ao registro. Revise o canal antes de tentar novamente.',409,'TRIBUNAL_CHANNEL_MISMATCH');
  return ch;
 }
 async function execute(job,c){
  const r=(await c.query('SELECT * FROM reports WHERE id=$1 FOR UPDATE',[job.payload.reportId])).rows[0];
  if(!r)return;
  const t=(await c.query('SELECT * FROM tribunals WHERE report_id=$1 FOR UPDATE',[r.id])).rows[0];
  if(!t)return;
  if(job.kind==='tribunal-invite'){
   if(t.status!=='open'||!t.channel_id||!participants(t).includes(job.payload.discordId))return;
   const user=await client.users.fetch(job.payload.discordId);
   const sent=await user.send({embeds:[new RokuharaEmbed(t.division).setContext('TRIBUNAL').setTone('info').setTitle(`Convite para o tribunal #${r.id}`).setDescription('A administração abriu uma conversa para ouvir as pessoas envolvidas na denúncia. Apresente sua versão com respeito e leve as provas que tiver.').addFields({name:'Acessar a conversa',value:`[Abrir tribunal no Discord](${link(t)})`},{name:'Quem participa',value:'O administrador responsável, o denunciante e a pessoa denunciada. As identidades ficam visíveis entre os envolvidos. Não há punição automática.'})],allowedMentions:{parse:[]},nonce:String(job.id),enforceNonce:true});
   await c.query('UPDATE jobs SET message_id=$1 WHERE id=$2',[sent.id,job.id]);return;
  }
  const d=config.divisions.find(d=>d.id===t.division&&d.guild===t.guild_id);
  if(!d)throw fail('A divisão do tribunal não está mais configurada.',409,'TRIBUNAL_DIVISION_MISSING');
  if(job.kind==='tribunal-open'&&t.status==='open')return;
  if(t.status==='closed')return;
  const g=await client.guilds.fetch(t.guild_id);
  let ch=await fetchChannel(g,t);
  if(job.kind==='tribunal-close'||r.status!=='pendente'||t.status==='closing'){
   if(ch){
    await ch.permissionOverwrites.set(overwrites(t,client.user.id,true),'Tribunal encerrado: preservar histórico');
    const intro=await publishPanel(c,client,ch,ch.id,'tribunal',tribunalMessage(t,r,true));
    await c.query('UPDATE tribunals SET channel_id=$1,intro_message_id=$2 WHERE report_id=$3',[ch.id,intro.id,r.id]);
   }
   await c.query("UPDATE tribunals SET status='closed',closed_at=COALESCE(closed_at,now()) WHERE report_id=$1",[r.id]);return;
  }
  if(job.kind!=='tribunal-open')throw new Error('Operação de tribunal desconhecida.');
  const admin=(await c.query('SELECT * FROM staff WHERE id=$1 FOR SHARE',[t.created_by])).rows[0];
  if(!admin?.active||admin.role!=='admin'||!admin.discord_verified_at||admin.discord_id!==t.admin_discord_id)throw fail('O administrador responsável perdeu o acesso ou alterou o Discord. Restaure o vínculo original antes de tentar novamente.',403,'TRIBUNAL_ADMIN_CHANGED');
  for(const [id,label]of [[t.admin_discord_id,'administrador'],[t.reporter_id,'denunciante'],[t.accused_id,'pessoa denunciada']]){
   const member=await g.members.fetch({user:id,force:true}).catch(e=>{if(e.code===10007)return null;throw e;});
   if(!member||member.user?.bot)throw fail(`O ${label} precisa estar na divisão escolhida com uma conta humana antes de abrir o tribunal.`,409,'TRIBUNAL_PARTICIPANT_MISSING');
  }
  if(!ch){
   const category=await g.channels.fetch(d.category);
   if(category?.type!==ChannelType.GuildCategory||category.guildId!==t.guild_id)throw fail('A categoria de atendimento está inválida.',409,'TRIBUNAL_CATEGORY_INVALID');
   ch=await g.channels.create({name:`tribunal-${r.id}`,type:ChannelType.GuildText,parent:d.category,topic:topic(t),permissionOverwrites:overwrites(t,client.user.id),reason:`Tribunal da denúncia #${r.id}`});
  }
  // Never inherit category permissions or grant access to the general staff role.
  await ch.permissionOverwrites.set(overwrites(t,client.user.id),'Acesso restrito ao tribunal');
  const intro=await publishPanel(c,client,ch,ch.id,'tribunal',tribunalMessage(t,r));
  await c.query("UPDATE tribunals SET channel_id=$1,intro_message_id=$2,status='open' WHERE report_id=$3",[ch.id,intro.id,r.id]);
  for(const discordId of participants(t))await c.query("INSERT INTO jobs(kind,payload,dedupe_key) VALUES('tribunal-invite',$1,$2) ON CONFLICT(dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING",[JSON.stringify({reportId:r.id,discordId}),`tribunal-invite:${r.id}:${discordId}`]);
  await audit(c,t.created_by,'Tribunal aberto',{reportId:r.id,channelId:ch.id});
 }
 return {request,execute};
}
