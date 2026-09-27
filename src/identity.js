import {text,division,snowflake} from './security.js';
export const ALLIANCE_NOTICE='ALIADO AUTORIZADO E LICENCIADO POR ROKUHARA';
export const ALLIANCE_CARD_NOTICE=ALLIANCE_NOTICE;
const invalid=message=>Object.assign(new Error(message),{status:400});
function clean(value,label,max,min=1){const v=text(value,label,max,min);if(/[\u0000-\u001f\u007f]/.test(v))throw invalid(`${label}: não use quebras de linha ou caracteres de controle.`);return v;}
export function memberData(input){
 const kind=input.account_kind??'membro';if(!['membro','aliado'].includes(kind))throw invalid('Tipo de IFJ inválido.');
 const result={name:clean(input.name,'Nome',100),game_nick:kind==='aliado'&&(input.game_nick==null||input.game_nick==='')?null:clean(input.game_nick,'Nick no jogo',64),roblox_username:kind==='aliado'&&(input.roblox_username==null||input.roblox_username==='')?null:clean(input.roblox_username,'Usuário Roblox',20,3),discord_id:snowflake(input.discord_id),division:division(input.division),account_kind:kind,allied_gang:kind==='aliado'?clean(input.allied_gang,'Gangue aliada',100):null,member_rank:clean(input.member_rank??(kind==='aliado'?'Aliado':'Membro'),'Patente do membro',80)};
 if(result.roblox_username!==null&&!/^[A-Za-z0-9_]{3,20}$/.test(result.roblox_username))throw invalid('Use o nome de usuário Roblox, não o nome de exibição.');
 return result;
}
export const identityChanged=(a,b)=>['name','game_nick','roblox_username','discord_id','division','account_kind','allied_gang'].some(k=>a[k]!==b[k]);

// Exact normalized names only: no substring matching or permission from login roles.
export const rankKey=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim().replace(/[-\s]+/g,' ');
export const bothDivisions=member=>member?.account_kind==='aliado'||['lider','sub lider','sublider','high member'].includes(rankKey(member?.member_rank));
