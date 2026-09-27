import {RokuharaEmbed as EmbedBuilder} from './embed-theme.js';
import {SlashCommandBuilder,PermissionFlagsBits as P,MessageFlags,escapeMarkdown} from 'discord.js';
import {tx,enqueue,audit} from './db.js';
import {text} from './security.js';
export const warnCommand=()=>new SlashCommandBuilder().setName('warn').setDescription('Registrar uma advertência para um membro deste servidor').setDefaultMemberPermissions(null).addUserOption(o=>o.setName('membro').setDescription('Membro que receberá a advertência').setRequired(true)).addStringOption(o=>o.setName('motivo').setDescription('Motivo da advertência').setMinLength(1).setMaxLength(1000).setRequired(true)).toJSON();
export function createWarnings(pool,config,client){
 async function register(){for(const d of config.divisions){const g=await client.guilds.fetch(d.guild);await g.commands.create(warnCommand());}}
 async function interact(i){
  if(!i.isChatInputCommand?.()||i.commandName!=='warn')return false;
  await i.deferReply({flags:MessageFlags.Ephemeral,allowedMentions:{parse:[]}});
  const reply=content=>i.editReply({content,allowedMentions:{parse:[]}});
  const d=config.divisions.find(x=>x.guild===i.guildId);
  if(!d){await reply('Use /warn somente no servidor da primeira ou da segunda divisão.');return true;}
  const g=await client.guilds.fetch(d.guild);
  const actor=await g.members.fetch({user:i.user.id,force:true}).catch(e=>{if(e.code===10007)return null;throw e;});
  const nativeAdmin=actor&&(g.ownerId===i.user.id||actor.permissions.has(P.Administrator));
  const linked=actor&&!nativeAdmin?(await pool.query("SELECT id FROM staff WHERE discord_id=$1 AND discord_verified_at IS NOT NULL AND active=TRUE AND role IN ('admin','moderador')",[i.user.id])).rows[0]:null;
  if(!actor||(!nativeAdmin&&!linked)){await reply('Somente o dono, administradores ou moderadores com Discord confirmado no painel podem usar /warn.');return true;}
  const target=i.options.getUser('membro',true);
  if(target.bot||target.id===i.user.id){await reply('Escolha outro membro humano para advertir.');return true;}
  const member=await g.members.fetch({user:target.id,force:true}).catch(e=>{if(e.code===10007)return null;throw e;});
  if(!member){await reply('Esse membro não está neste servidor.');return true;}
  const reason=text(i.options.getString('motivo',true),'Motivo',1000);
  const result=await tx(pool,async c=>{
   if(!nativeAdmin&&!(await c.query("SELECT id FROM staff WHERE discord_id=$1 AND discord_verified_at IS NOT NULL AND active=TRUE AND role IN ('admin','moderador') FOR SHARE",[i.user.id])).rows.length)return {denied:true};
   const r=await c.query('INSERT INTO warnings(interaction_id,guild_id,division,discord_id,actor_id,reason) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(interaction_id) DO NOTHING RETURNING id',[i.id,d.guild,d.id,target.id,i.user.id,reason]);
   if(!r.rowCount)return {id:(await c.query('SELECT id FROM warnings WHERE interaction_id=$1',[i.id])).rows[0].id,duplicate:true};
   const id=r.rows[0].id,jobId=await enqueue(c,'warning-dm',{warningId:id});
   await c.query('UPDATE warnings SET notification_job_id=$1 WHERE id=$2',[jobId,id]);
   await audit(c,`discord:${i.user.id}`,'Advertência registrada',{warningId:id,division:d.id,discordId:target.id});return {id};
  });
  if(result.denied){await reply('Sua permissão foi alterada. Consulte a administração.');return true;}
  await reply(`Advertência #${result.id} ${result.duplicate?'já estava registrada':'registrada'}. A mensagem privada está na fila; acompanhe a entrega em Advertências no painel.`);return true;
 }
 async function execute(job,c){
  const w=(await c.query('SELECT * FROM warnings WHERE id=$1',[job.payload.warningId])).rows[0];if(!w)return;
  const d=config.divisions.find(x=>x.id===w.division&&x.guild===w.guild_id);if(!d)throw new Error('Divisão da advertência não configurada.');
  const safe=v=>escapeMarkdown(String(v)).replace(/@/g,'＠');
  const user=await client.users.fetch(w.discord_id);
  const sent=await user.send({embeds:[new EmbedBuilder(d.id).setContext('MODERAÇÃO • AVISO PRIVADO').setTone('warning').setTitle(`Advertência #${w.id} • ROKUHARA`).setDescription(safe(w.reason)).addFields(
   {name:'Servidor / divisão',value:safe(d.name),inline:true},
   {name:'Responsável (ID Discord)',value:w.actor_id,inline:true},
   {name:'Registro',value:`Advertência #${w.id}`,inline:true},
   {name:'Como proceder',value:'Leia o motivo acima e revise as regras do servidor. Para esclarecer a advertência, procure a administração da divisão e informe o número do registro.'}
  ).setFooter({text:'Motivo registrado pela equipe • Dúvidas: administração da divisão'}).setTimestamp(w.created_at)],allowedMentions:{parse:[]},nonce:String(job.id),enforceNonce:true});
  await c.query('UPDATE jobs SET message_id=$1 WHERE id=$2',[sent.id,job.id]);
 }
 return {register,interact,execute};
}
