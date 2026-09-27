export const ROLE_ENV={"leader": "LEADER_ROLE_ID", "subleader": "SUBLEADER_ROLE_ID", "high": "HIGH_MEMBER_ROLE_ID", "moderator": "MODERATOR_ROLE_ID", "recruiter": "RECRUITER_ROLE_ID", "ally": "ALLY_ROLE_ID", "veteran": "VETERAN_ROLE_ID", "rookie": "ROOKIE_ROLE_ID"};
// Shared by the server and the offline assistant. Never returns secret values in diagnostics.
export const ID_FIELDS=['GUILD_ID','MEMBER_ROLE_ID','ADMIN_ROLE_ID','VERIFICATION_CHANNEL_ID','WELCOME_CHANNEL_ID','GUIDE_CHANNEL_ID','WANTED_CHANNEL_ID','TICKETS_CHANNEL_ID','REPORTS_CHANNEL_ID','TICKET_CATEGORY_ID',...Object.values(ROLE_ENV)];
export const looksPlaceholder=value=>/PREENCHA|SUBSTITUA|YOUR.PASSWORD|TOKEN_DO_BOT|HOST_COPIADO|SENHA_CODIFICADA/i.test(value);
export function validateEnvironment(env){
 const checks=[];
 const add=(key,ok,message,skip=false)=>checks.push({key,ok,message:ok?'Formato válido.':message,skip});
 const get=k=>typeof env[k]==='string'?env[k]:'';
 const plain=(key,min=1)=>{const v=get(key);const ok=v.length>=min&&!/[\r\n\0]/.test(v)&&v===v.trim()&&!looksPlaceholder(v);add(key,ok,`Preencha um valor real, sem espaços nas pontas, com pelo menos ${min} caracteres.`);return ok;};
 add('NODE_ENV',['production','development','test'].includes(get('NODE_ENV')),'Use production, development ou test.');
 const version=get('NODE_VERSION');if(version)add('NODE_VERSION',/^(22|24|26)(\.\d+){0,2}$/.test(version),'Use a série 22, 24 ou 26; o runtime também será testado.');else add('NODE_VERSION',true,'',true);
 const mode=get('BOT_ENABLED')||'true';add('BOT_ENABLED',['true','false'].includes(mode),'Use somente true ou false.');
 const port=get('PORT')||'3000';add('PORT',/^\d+$/.test(port)&&Number(port)>0&&Number(port)<=65535,'Use uma porta de 1 a 65535; no Render deixe a plataforma fornecer.');
 let originOK=false;
 try{const u=new URL(get('APP_ORIGIN'));originOK=['http:','https:'].includes(u.protocol)&&!u.username&&!u.password&&!u.search&&!u.hash&&u.pathname==='/'&&u.hostname!=='configurar.invalid'&&!u.hostname.endsWith('.invalid')&&(!['production'].includes(get('NODE_ENV'))||u.protocol==='https:')&&!looksPlaceholder(u.hostname)&&[u.origin,u.origin+'/'].includes(get('APP_ORIGIN'));}catch{}
 add('APP_ORIGIN',originOK,'Informe a URL real do painel, sem caminho, consulta ou credenciais. Produção exige HTTPS.');
 let dbOK=false;
 try{const u=new URL(get('DATABASE_URL'));dbOK=['postgres:','postgresql:'].includes(u.protocol)&&Boolean(u.hostname&&u.username&&u.password&&u.pathname.length>1)&&!u.hash&&!looksPlaceholder(get('DATABASE_URL'))&&!/[\[\]\s]/.test(get('DATABASE_URL'))&&u.hostname!=='host'&&u.username!=='USER'&&u.password!=='PASSWORD'&&(!get('NODE_ENV').includes('production')||u.searchParams.get('sslmode')==='verify-full');}catch{}
 add('DATABASE_URL',dbOK,'Use uma URL PostgreSQL real, com usuário, senha codificada e banco. Em produção inclua sslmode=verify-full.');
 plain('SESSION_SECRET',32);
 const user=get('INITIAL_ADMIN_USERNAME'),pw=get('INITIAL_ADMIN_PASSWORD');
 if(user||pw){add('INITIAL_ADMIN_USERNAME',/^[a-z0-9_.-]{3,64}$/.test(user)&&!looksPlaceholder(user),'Use 3 a 64 letras minúsculas, números, ponto, hífen ou sublinhado.');plain('INITIAL_ADMIN_PASSWORD',12);add('INITIAL_ADMIN_PASSWORD_LIMIT',pw.length<=128,'A senha inicial pode ter até 128 caracteres.');}
 else add('INITIAL_ADMIN_*',true,'',true);
 if(mode==='true'){
  const token=get('DISCORD_TOKEN');add('DISCORD_TOKEN',token.length>=30&&!/\s/.test(token)&&!looksPlaceholder(token),'Informe o token real do bot (não Application ID). A validade será testada no Discord.');
 }else add('DISCORD_TOKEN',true,'',true);
 for(const n of [1,2]){
  const name=get(`DIV_${n}_NAME`);add(`DIV_${n}_NAME`,!/[\r\n\0]/.test(name)&&name.length<=80,'Use um nome de até 80 caracteres.');
  for(const suffix of [...ID_FIELDS,'STAFF_CHANNEL_ID']){
   const key=`DIV_${n}_${suffix}`,v=get(key);const required=mode==='true'&&suffix!=='STAFF_CHANNEL_ID';
   if(!v&&!required){add(key,true,'',true);continue;}
   add(key,/^\d{17,20}$/.test(v),'Copie um ID Discord numérico de 17 a 20 dígitos.');
  }
  if(mode==='true'){
   const keys=ID_FIELDS.map(s=>`DIV_${n}_${s}`);const values=keys.map(get).filter(Boolean);
   add(`DIV_${n}_IDS_DISTINTOS`,new Set(values).size===values.length,'Servidor, cargos, canais e categoria precisam de IDs diferentes.');
  }
 }
 if(mode==='true'){
  const a=ID_FIELDS.map(s=>get(`DIV_1_${s}`)).filter(Boolean),b=ID_FIELDS.map(s=>get(`DIV_2_${s}`)).filter(Boolean);
  add('DIVISOES_DISTINTAS',!a.some(id=>b.includes(id)),'Não reutilize IDs entre os dois servidores.');
 }
 const oldGuild=get('IMMIGRATION_GUILD_ID');
 if(oldGuild){add('IMMIGRATION_GUILD_ID',/^\d{17,20}$/.test(oldGuild),'Copie o ID do servidor antigo: 17 a 20 números.');add('IMMIGRATION_GUILD_DISTINCT',![get('DIV_1_GUILD_ID'),get('DIV_2_GUILD_ID')].includes(oldGuild),'O servidor antigo precisa ser diferente dos dois servidores das divisões.');}
 else add('IMMIGRATION_GUILD_ID',true,'',true);
 const oldAlly=get('OLD_ALLY_ROLE_ID');
 if(oldAlly){add('OLD_ALLY_ROLE_ID',/^\d{17,20}$/.test(oldAlly),'Informe o ID do cargo Aliados do servidor antigo.');if(mode==='true')add('ALLY_SOURCE_GUILD',Boolean(oldGuild),'Preencha IMMIGRATION_GUILD_ID para migrar aliados.');}
 else add('OLD_ALLY_ROLE_ID',true,'',true);
 for(const n of [1,2]){const key=`DIV_${n}_INVITE_URL`,v=get(key);if(v||oldAlly&&mode==='true')add(key,/^https:\/\/(discord\.gg\/[A-Za-z0-9-]+|discord\.com\/invite\/[A-Za-z0-9-]+)$/.test(v),'Informe um convite HTTPS válido do Discord.');else add(key,true,'',true);}
 const allianceChannels=[1,2].map(n=>get(`DIV_${n}_ALLIANCE_CHANNEL_ID`)).filter(Boolean);
 for(const n of [1,2]){const key=`DIV_${n}_ALLIANCE_CHANNEL_ID`,v=get(key);if(v)add(key,/^\d{17,20}$/.test(v),'Copie o ID do canal de alianças desta divisão.');else add(key,true,'',true);}
 if(allianceChannels.length){const otherIds=[1,2].flatMap(n=>[...ID_FIELDS,'STAFF_CHANNEL_ID'].map(k=>get(`DIV_${n}_${k}`))).filter(Boolean);add('ALLIANCE_CHANNELS_DISTINCT',new Set(allianceChannels).size===allianceChannels.length&&!allianceChannels.some(id=>otherIds.includes(id)),'Use canais de alianças diferentes entre si e dos outros IDs configurados.');}
 const hydra=get('HYDRA_INVITE_URL');if(hydra||allianceChannels.length)add('HYDRA_INVITE_URL',/^https:\/\/(discord\.gg\/[A-Za-z0-9-]+|discord\.com\/invite\/[A-Za-z0-9-]+)$/.test(hydra),'Informe o convite HTTPS da HYDRA NO KAI.');else add('HYDRA_INVITE_URL',true,'',true);
 return checks;
}
