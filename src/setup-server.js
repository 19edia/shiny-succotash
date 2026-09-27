import {ROLE_ENV} from './config-rules.js';
// Dedicated installer: no panel, database or member verification is started here.
import {Client,GatewayIntentBits} from 'discord.js';
import {createServer} from 'node:http';
import {registerCreate,checkProvisionGuild,createProvisionHandler} from './provision.js';
import {reporter,StartupError,safeFailure} from './preflight.js';
export function setupConfig(env){
 if(!env.DISCORD_TOKEN||env.DISCORD_TOKEN.length<30||/\s/.test(env.DISCORD_TOKEN))throw new StartupError('Configure DISCORD_TOKEN real para o instalador.');
 const divisions=[1,2].map(id=>({id,name:env[`DIV_${id}_NAME`]||`${id}ª divisão`,guild:env[`DIV_${id}_GUILD_ID`],memberRole:env[`DIV_${id}_MEMBER_ROLE_ID`]||undefined,adminRole:env[`DIV_${id}_ADMIN_ROLE_ID`]||undefined,rankRoles:Object.fromEntries(Object.entries(ROLE_ENV).map(([key,suffix])=>[key,env[`DIV_${id}_${suffix}`]||undefined]))}));
 if(divisions.some(d=>!/^\d{17,20}$/.test(d.guild)||d.name.length>80)||divisions[0].guild===divisions[1].guild)throw new StartupError('Configure DIV_1_GUILD_ID e DIV_2_GUILD_ID de dois servidores diferentes.');
 const port=Number(env.PORT||3000);if(!Number.isInteger(port)||port<1||port>65535)throw new StartupError('PORT inválida.');return {divisions,port,token:env.DISCORD_TOKEN};
}
export async function runSetup(env=process.env){const log=reporter();let client,server;const deadline=setTimeout(()=>{log.line('BLOQUEADO','Tempo máximo do instalador excedido.');process.exit(1);},120000);
 try{
  const config=await log.test('Instalador: token, dois servidores e porta',()=>setupConfig(env));
  client=new Client({intents:[GatewayIntentBits.Guilds]});client.on('error',e=>console.error('Discord:',e.code||e.name));
  await log.test('Instalador: autenticação Discord',()=>new Promise((resolve,reject)=>{client.once('clientReady',resolve);client.login(config.token).catch(reject);}));
  for(const d of config.divisions)await log.test(`Instalador: servidor ${d.id} e permissões`,async()=>checkProvisionGuild(await client.guilds.fetch(d.guild)));
  await log.test('Instalador: registrar /criar e /deletar nos dois servidores',()=>registerCreate(client,config.divisions));
  const handler=createProvisionHandler(client,config.divisions);client.on('interactionCreate',i=>handler(i).catch(e=>console.error('Instalador:',e.code||e.name)));
  await log.test('Instalador: abrir página de estado',()=>new Promise((resolve,reject)=>{server=createServer((req,res)=>{if(req.url==='/ready'){res.writeHead(503,{'Content-Type':'application/json'});res.end(JSON.stringify({status:'setup'}));return;}res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8'});res.end('Modo de configuração ROKUHARA. Use /criar em cada servidor e depois mude o Start Command para npm start. Painel e banco não iniciados.');});server.once('error',reject);server.listen(config.port,resolve);}));
  clearTimeout(deadline);log.line('PRONTO','Somente instalador /criar iniciado. Banco e painel não fazem parte deste modo.');
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{server.close();await client.destroy();process.exit(0);});
 }catch(e){clearTimeout(deadline);server?.close();await client?.destroy();log.line('BLOQUEADO',safeFailure(e));throw e;}
}
