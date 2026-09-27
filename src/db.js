import pg from 'pg';
import {readFile} from 'node:fs/promises';
import {passwordHash} from './security.js';
import {StartupError} from './preflight.js';
export function database(url){return new pg.Pool({connectionString:url,max:10,connectionTimeoutMillis:10000,query_timeout:15000,statement_timeout:12000});}
export async function tx(pool,fn){const c=await pool.connect();try{await c.query('BEGIN');const result=await fn(c);await c.query('COMMIT');return result;}catch(e){await c.query('ROLLBACK');throw e;}finally{c.release();}}
export async function audit(c,actor,action,detail={}){await c.query('INSERT INTO audit(actor,action,detail) VALUES($1,$2,$3)',[String(actor),action,JSON.stringify(detail)]);}
export async function enqueue(c,kind,payload){return (await c.query('INSERT INTO jobs(kind,payload) VALUES($1,$2) RETURNING id',[kind,JSON.stringify(payload)])).rows[0].id;}
export async function initialize(pool,env=process.env){
 await tx(pool,async c=>{
 await c.query(await readFile(new URL('./schema.sql',import.meta.url),'utf8'));
 if((await c.query('SELECT id FROM staff LIMIT 1')).rowCount===0){
  if(!env.INITIAL_ADMIN_USERNAME || (env.INITIAL_ADMIN_PASSWORD||'').length<12)throw new StartupError('Configure o primeiro administrador e uma senha com pelo menos 12 caracteres.');
  await c.query("INSERT INTO staff(username,password_hash,role) VALUES($1,$2,'admin') ON CONFLICT(username) DO NOTHING",[env.INITIAL_ADMIN_USERNAME.toLowerCase(),await passwordHash(env.INITIAL_ADMIN_PASSWORD)]);
 }
 if(env.BOT_ENABLED!=='false')await c.query("INSERT INTO jobs(kind,payload) SELECT 'sync-role',jsonb_build_object('discordId',m.discord_id) FROM members m WHERE NOT EXISTS (SELECT 1 FROM jobs j WHERE j.kind='sync-role' AND j.status='pending' AND j.payload->>'discordId'=m.discord_id)");
 });
}
