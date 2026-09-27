import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {renderCard,cardFields} from '../src/cards.js';
test('migration preserves old identities and is repeatable',async()=>{
 const schema=await readFile(new URL('../src/schema.sql',import.meta.url),'utf8');const db=new PGlite();
 try{await db.exec(schema.slice(0,schema.indexOf('ALTER TABLE members ADD COLUMN')));
 await db.query("INSERT INTO members(ifj,name,game_nick,roblox_username,discord_id,division) VALUES('000123456789012','Nome antigo','Nick','Roblox','12345678901234567',1)");
 await db.exec(schema);await db.exec(schema);const m=(await db.query('SELECT * FROM members')).rows[0];assert.equal(m.ifj,'000123456789012');assert.equal(m.name,'Nome antigo');assert.equal(m.account_kind,'membro');assert.equal(m.member_rank,'Membro');assert.equal(m.identity_version,1);
 }finally{await db.close();}
});
test('card names come first, IFJ last; maximum-length text renders for both types',async()=>{
 const m={id:1,name:'W'.repeat(100),game_nick:'W'.repeat(64),roblox_username:'W'.repeat(20),discord_id:'12345678901234567890',ifj:'000123456789012',member_rank:'W'.repeat(80),allied_gang:'W'.repeat(100),created_at:new Date()};
 for(const kind of ['membro','aliado']){m.account_kind=kind;const fields=cardFields(m,'Primeira divisão');assert.equal(fields[0].value,m.name);assert.equal(fields.at(-1).value,m.ifj);const png=await renderCard(m,'W'.repeat(80));assert.equal(png.subarray(1,4).toString(),'PNG');}
});
test('dual-division ranks accept accents/case/spacing but not unrelated titles',async()=>{
 const {bothDivisions}=await import('../src/identity.js');
 for(const member_rank of ['Líder','lider','LIDER','Sub líder','sub-lider','sublíder','  HIGH   MEMBER  '])assert.equal(bothDivisions({account_kind:'membro',member_rank}),true,member_rank);
 for(const member_rank of ['Membro','Vice líder','Ex-líder','High membership','admin','moderador','recrutador',''])assert.equal(bothDivisions({account_kind:'membro',member_rank}),false,member_rank);
 assert.equal(bothDivisions({account_kind:'aliado',member_rank:'Embaixador'}),true);
 const fields=cardFields({account_kind:'membro',member_rank:'Líder'},'Primeira');assert.equal(fields[2].value,'1ª e 2ª divisões');
});
