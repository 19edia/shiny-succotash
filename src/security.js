import {randomBytes, randomInt, scrypt as rawScrypt, timingSafeEqual, createHmac, createHash} from 'node:crypto';
import {promisify} from 'node:util';
const scrypt=promisify(rawScrypt);
export const token=()=>randomBytes(32).toString('hex');
export const hash=(value,secret)=>createHmac('sha256',secret).update(value).digest('hex');
export const digestIFJ=value=>createHash('sha256').update(value).digest('hex');
export const generateIFJ=()=>Array.from({length:15},()=>randomInt(10)).join('');
export async function passwordHash(value){const salt=randomBytes(16).toString('hex');const key=await scrypt(value,salt,64);return `${salt}:${key.toString('hex')}`;}
export async function passwordMatches(value,stored){const [salt,key]=stored.split(':');const candidate=await scrypt(value,salt,64);const expected=Buffer.from(key,'hex');return candidate.length===expected.length && timingSafeEqual(candidate,expected);}
export const allowed=(role,operation)=>({createIFJ:['admin','moderador','recrutador'],deleteIFJ:['admin','moderador','recrutador'],editIFJ:['admin','moderador','recrutador'],issueCard:['admin','moderador'],warn:['admin','moderador'],admin:['admin']}[operation]||[]).includes(role);
export function text(value,label,max=100,min=1){if(typeof value!=='string'||value.trim().length<min||value.trim().length>max) throw Object.assign(new Error(`${label}: use entre ${min} e ${max} caracteres.`),{status:400});return value.trim();}
export function division(value){if(![1,2].includes(Number(value)))throw Object.assign(new Error('Divisão inválida.'),{status:400});return Number(value);}
export function snowflake(value){if(typeof value!=='string'||!/^\d{17,20}$/.test(value))throw Object.assign(new Error('ID Discord inválido. Copie o ID do usuário, não o apelido.'),{status:400});return value;}
