import {PermissionFlagsBits as P} from 'discord.js';
import {rankKey,bothDivisions} from './identity.js';
import {ROLE_ENV} from './config-rules.js';
export const rankRoleKey=member=>member?.account_kind==='aliado'?'ally':({lider:'leader','sub lider':'subleader',sublider:'subleader','high member':'high',moderador:'moderator',recrutador:'recruiter',aliado:'ally',veterano:'veteran',novato:'rookie'}[rankKey(member?.member_rank)]||null);
export const teamMember=member=>member?.account_kind!=='aliado'&&['leader','subleader','moderator'].includes(rankRoleKey(member));
export const managedRoles=d=>[d.memberRole,d.adminRole,...Object.keys(ROLE_ENV).map(k=>d.rankRoles?.[k])].filter(Boolean);
export function wantedRoles(member,d){if(!member?.verified||(!bothDivisions(member)&&member.division!==d.id))return new Set();return new Set([d.memberRole,d.rankRoles?.[rankRoleKey(member)],teamMember(member)?d.adminRole:null].filter(Boolean));}
const dangerous=[[P.Administrator,'Administrador'],[P.ManageGuild,'Gerenciar servidor'],[P.ManageRoles,'Gerenciar cargos'],[P.ManageChannels,'Gerenciar canais'],[P.ManageWebhooks,'Gerenciar webhooks'],[P.KickMembers,'Expulsar membros'],[P.BanMembers,'Banir membros'],[P.ModerateMembers,'Moderar membros / timeout'],[P.MentionEveryone,'Mencionar @everyone / @here']];
export function assertManagedRoles(g,d,roles,me){
 const entries=[['MEMBER_ROLE_ID',d.memberRole],['ADMIN_ROLE_ID',d.adminRole],...Object.entries(ROLE_ENV).map(([key,suffix])=>[suffix,d.rankRoles?.[key]])];
 const issues=[],seen=new Map();
 for(const [suffix,id]of entries){
  const key=`DIV_${d.id}_${suffix}`;
  if(!id){issues.push(`${key}: ID não configurado.`);continue;}
  if(seen.has(id)){issues.push(`${key}: repete o ID de ${seen.get(id)}. Use cargos distintos.`);continue;}seen.set(id,key);
  const role=roles.get(id);if(!role){issues.push(`${key}: cargo ${id} não encontrado neste servidor. Confira o ID no Render.`);continue;}
  const label=`${key} (cargo ${JSON.stringify(String(role.name||id))}, ID ${id})`;
  if(id===g.id){issues.push(`${label}: não use @everyone.`);continue;}
  if(role.managed)issues.push(`${label}: cargo gerenciado por bot/integração; selecione um cargo comum.`);
  if(me.roles.highest.comparePositionTo(role)<=0)issues.push(`${label}: precisa ficar abaixo do cargo mais alto do bot (${JSON.stringify(String(me.roles.highest.name||me.roles.highest.id||'bot'))}). Não use o próprio cargo do bot.`);
  const forbidden=dangerous.filter(([bit])=>role.permissions.has(bit)).map(([,name])=>name);
  if(forbidden.length)issues.push(`${label}: permissões incompatíveis com atribuição automática: ${forbidden.join(', ')}. Remova essas permissões deste cargo ou configure um cargo de patente/Equipe separado, sem gestão global.`);
 }
 if(issues.length)throw Error(issues.join(' | '));
}
export async function synchronizeRoles(g,d,user,member){
 const roles=await g.roles.fetch(),me=await g.members.fetchMe();assertManagedRoles(g,d,roles,me);
 const wanted=wantedRoles(member,d),all=managedRoles(d);
 // Remove obsolete access before granting anything. Never replace unrelated roles.
 for(const id of all)if(!wanted.has(id)&&(!user.roles.cache||user.roles.cache.has(id)))await user.roles.remove(id,'IFJ: acesso/patente revogados ou alterados');
 for(const id of wanted)if(!user.roles.cache||!user.roles.cache.has(id))await user.roles.add(id,'IFJ verificado: acesso e patente');
}
