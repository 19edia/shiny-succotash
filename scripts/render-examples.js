import {writeFile} from 'node:fs/promises';
import {renderCard} from '../src/cards.js';
const base={id:42,name:'Lukas Rokuhara',game_nick:'Lukas',roblox_username:'LukasRokuhara',discord_id:'123456789012345678',ifj:'000123456789012',identity_version:1,created_at:'2026-09-22T12:00:00Z',verified:true,suspect:false,account_kind:'membro',member_rank:'Membro'};
for(const [name,changes] of [['membro',{}],['lider',{member_rank:'Líder'}],['aliado',{account_kind:'aliado',member_rank:'Aliado',allied_gang:'Hydra'}]]){
 await writeFile(new URL(`../../EXEMPLOS/carteira-${name}.png`,import.meta.url),await renderCard({...base,...changes},'1ª divisão',{issuedAt:new Date('2026-09-25T12:00:00Z')}));
}
