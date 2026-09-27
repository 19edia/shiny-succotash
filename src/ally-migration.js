import {SlashCommandBuilder,PermissionFlagsBits as P,MessageFlags,ActionRowBuilder,ButtonBuilder,ButtonStyle} from 'discord.js';
import {RokuharaEmbed} from './embed-theme.js';
import {tx,enqueue,audit} from './db.js';
import {createMemberRecord} from './member-store.js';
export const allyJobs=new Set(['ally-scan','ally-import','ally-welcome']);
export function createAllyMigration(pool,config,client){
 const enabled=()=>Boolean(config.immigrationGuild&&config.oldAllyRole);
 async function validate(){
  if(!enabled())return;
  const g=await client.guilds.fetch(config.immigrationGuild),roles=await g.roles.fetch();
  if(!roles.has(config.oldAllyRole)||config.oldAllyRole===g.id)throw Object.assign(new Error('OLD_ALLY_ROLE_ID: cargo de aliados não encontrado ou @everyone no servidor antigo.'),{code:'ALLY_CONFIG'});
  await g.commands.create(new SlashCommandBuilder().setName('migrar-aliados').setDescription('Importar aliados do servidor antigo e enviar IFJ + convites').setDefaultMemberPermissions(P.Administrator).toJSON());
 }
 async function interact(i){
  if(!i.isChatInputCommand?.()||i.commandName!=='migrar-aliados')return false;
  await i.deferReply({flags:MessageFlags.Ephemeral,allowedMentions:{parse:[]}});
  if(!enabled()||i.guildId!==config.immigrationGuild){await i.editReply('Use no servidor antigo com IMMIGRATION_GUILD_ID, OLD_ALLY_ROLE_ID e os convites configurados.');return true;}
  const g=await client.guilds.fetch(i.guildId),actor=await g.members.fetch({user:i.user.id,force:true});
  if(g.ownerId!==i.user.id&&!actor.permissions.has(P.Administrator)){await i.editReply('Somente o dono ou um Administrador do Discord no servidor antigo pode migrar aliados.');return true;}
  await tx(pool,async c=>{
   await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`ally-scan:${g.id}`]);
   if((await c.query("SELECT id FROM jobs WHERE kind='ally-scan' AND status='pending' AND payload->>'guildId'=$1",[g.id])).rowCount)return;
   await c.query("INSERT INTO jobs(kind,payload,dedupe_key) VALUES('ally-scan',$1,$2) ON CONFLICT DO NOTHING",[JSON.stringify({guildId:g.id,roleId:config.oldAllyRole,actorId:i.user.id}),`ally-scan:${i.id}`]);
  });
  await i.editReply({embeds:[new RokuharaEmbed().setContext('ALIANÇAS • MIGRAÇÃO').setTone('info').setTitle('Migração de aliados iniciada').setDescription('**Solicitação recebida. O processamento acontece em segundo plano.**\nAcompanhe os cadastros e a entrega das mensagens em **Aliados migrados** no painel.').addFields(
   {name:'01 · Identificar',value:'O bot verifica quem possui o cargo de aliados no servidor antigo e salva seus IDs e usuários.',inline:true},
   {name:'02 · Convidar',value:'Cada aliado recebe seu IFJ, um agradecimento e os convites das duas divisões no privado.',inline:true},
   {name:'03 · Receber',value:'Ao entrar com a mesma conta Discord, o aliado cadastrado recebe o cargo Aliados e o acesso automaticamente.'},
   {name:'Acompanhamento',value:'Confira eventuais falhas de entrega no painel. Repetir a migração não duplica cadastros.'}
  ).setFooter({text:'Administração • Acompanhe o resultado em Aliados migrados'})]});return true;
 }
 async function execute(job,c){
  const p=job.payload;
  if(job.kind==='ally-scan'){
   if(!enabled()||p.guildId!==config.immigrationGuild||p.roleId!==config.oldAllyRole)throw Object.assign(new Error('Configuração de origem alterada.'),{code:'ALLY_CONFIG'});
   const g=await client.guilds.fetch(p.guildId);const roles=await g.roles.fetch();if(!roles.has(p.roleId))throw Object.assign(new Error('Cargo de origem ausente.'),{code:'ALLY_CONFIG'});
   // Fetch ALL members through the gateway: role.members alone contains only cached members.
   const members=await g.members.fetch({withPresences:false,time:60000});let found=0;
   for(const m of members.values()){
    if(m.user.bot||!m.roles.cache.has(p.roleId))continue;found++;
    const r=(await c.query("INSERT INTO ally_imports(source_guild,source_role,discord_id,username,display_name,actor_id) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(source_guild,discord_id) DO UPDATE SET username=EXCLUDED.username,display_name=EXCLUDED.display_name RETURNING *",[g.id,p.roleId,m.id,m.user.username,m.displayName||m.user.username,p.actorId])).rows[0];
    if(r.status==='pending')await c.query("INSERT INTO jobs(kind,payload,dedupe_key) VALUES('ally-import',$1,$2) ON CONFLICT DO NOTHING",[JSON.stringify({importId:r.id}),`ally-import:${r.id}`]);
   }
   await audit(c,`discord:${p.actorId}`,'Aliados encontrados no servidor antigo',{guildId:g.id,roleId:p.roleId,total:found});return;
  }
  const r=(await c.query('SELECT * FROM ally_imports WHERE id=$1 FOR UPDATE',[p.importId])).rows[0];if(!r)return;
  if(job.kind==='ally-import'){
   if(r.status!=='pending')return;
   if(!enabled()||r.source_guild!==config.immigrationGuild||r.source_role!==config.oldAllyRole)throw Object.assign(new Error('Origem alterada.'),{code:'ALLY_CONFIG'});
   const g=await client.guilds.fetch(r.source_guild),current=await g.members.fetch({user:r.discord_id,force:true}).catch(e=>{if(e.code===10007)return null;throw e;});
   if(!current||current.user.bot||!current.roles.cache.has(r.source_role)){await c.query("UPDATE ally_imports SET status='skipped' WHERE id=$1",[r.id]);return;}
   await c.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`ally-member:${r.discord_id}`]);
   let m=(await c.query('SELECT * FROM members WHERE discord_id=$1 FOR UPDATE',[r.discord_id])).rows[0];
   if(!m)m=await createMemberRecord(c,{name:r.display_name.slice(0,100),game_nick:null,roblox_username:null,discord_id:r.discord_id,division:1,account_kind:'aliado',allied_gang:'Não informada',member_rank:'Aliado'},null);
   // The source role is the authorization, never a matching name or supplied IFJ.
   await c.query("UPDATE members SET account_kind='aliado',allied_gang=COALESCE(allied_gang,'Não informada'),member_rank='Aliado',verified=TRUE,auto_allied=TRUE,discord_username=$1,identity_version=identity_version+1,updated_at=now() WHERE id=$2",[r.username,m.id]);
   await c.query('DELETE FROM confirmations WHERE member_id=$1',[m.id]);
   await enqueue(c,'sync-role',{discordId:r.discord_id});
   const notification=await enqueue(c,'ally-welcome',{importId:r.id});
   await c.query("UPDATE ally_imports SET status='imported',member_id=$1,notification_job_id=$2 WHERE id=$3",[m.id,notification,r.id]);
   await audit(c,`discord:${r.actor_id}`,'Aliado migrado com acesso automático',{importId:r.id,memberId:m.id,discordId:r.discord_id});return;
  }
  if(job.kind==='ally-welcome'){
   const m=(await c.query('SELECT * FROM members WHERE id=$1 FOR UPDATE',[r.member_id])).rows[0];
   if(!m||m.discord_id!==r.discord_id||!m.auto_allied||!m.verified||m.account_kind!=='aliado')throw Object.assign(new Error('Cadastro revogado.'),{code:'IFJ_CHANGED'});
   const embed=new RokuharaEmbed().setContext('ALIANÇAS • CONVITE PESSOAL').setTitle('Nossa aliança continua • Você está convidado').setDescription('🤝 **Obrigado por fazer parte da aliança da ROKUHARA!**\nSua parceria faz parte da nossa história. Estamos organizando nossos novos servidores e queremos você com a gente.\n\n**Entre se quiser!** Sua identificação já está pronta e você é bem-vindo nas duas divisões.').addFields(
    {name:'Seu IFJ',value:`\`${m.ifj}\``,inline:true},
    {name:'Discord vinculado',value:`\`${m.discord_id}\``,inline:true},
    {name:'Entrada automática · Mesma conta Discord',value:'Entre pelos botões abaixo usando esta conta. O bot reconhece seu ID e libera o cargo Aliados e o acesso, sem formulário de verificação. Não é preciso informar nome no jogo ou Roblox.'},
    {name:'1ª divisão · Principal',value:config.divisions[0].invite,inline:true},
    {name:'2ª divisão',value:config.divisions[1].invite,inline:true}
   ).setFooter({text:'Convite pessoal • Guarde seu IFJ em particular'});
   const user=await client.users.fetch(r.discord_id);const sent=await user.send({embeds:[embed],components:[new ActionRowBuilder().addComponents(...config.divisions.map(d=>new ButtonBuilder().setLabel(d.id===1?'1ª divisão · Principal':'2ª divisão').setStyle(ButtonStyle.Link).setURL(d.invite)))],allowedMentions:{parse:[]},nonce:String(job.id),enforceNonce:true});
   await c.query('UPDATE jobs SET message_id=$1 WHERE id=$2',[sent.id,job.id]);
  }
 }
 return {validate,interact,execute};
}
