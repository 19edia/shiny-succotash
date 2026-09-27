import {generateIFJ,digestIFJ} from './security.js';
import {audit} from './db.js';
// Caller supplies validated data and a transaction, so IFJ reservation is atomic.
export async function createMemberRecord(c,b,actor){
 let code;
 for(let tries=0;tries<10;tries++){code=generateIFJ();const r=await c.query('INSERT INTO used_ifjs(digest) VALUES($1) ON CONFLICT DO NOTHING RETURNING digest',[digestIFJ(code)]);if(r.rowCount)break;code=null;}
 if(!code)throw Object.assign(new Error('Não foi possível gerar um código. Tente novamente.'),{status:503});
 const m=(await c.query('INSERT INTO members(ifj,name,game_nick,roblox_username,discord_id,division,created_by,account_kind,allied_gang,member_rank) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *',[code,b.name,b.game_nick,b.roblox_username,b.discord_id,b.division,actor,b.account_kind,b.allied_gang,b.member_rank])).rows[0];
 await audit(c,actor,'IFJ criado',{memberId:m.id,division:m.division});return m;
}
