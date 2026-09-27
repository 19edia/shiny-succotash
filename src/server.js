import {database,initialize} from './db.js';
import {createApp} from './app.js';
import {createBot} from './bot.js';
import {boot,reporter} from './preflight.js';
const log=reporter();
let running;
// Global deadline: includes service/network stalls. Exiting closes sockets; no listener is opened early.
const deadline=setTimeout(()=>{log.line('BLOQUEADO','Tempo máximo de inicialização (120s) excedido. Servidor NÃO iniciado.');process.exit(1);},120000);
try{
 running=await boot({makePool:database,initialize,makeBot:createBot,makeApp:createApp,log,
  listen:(app,port)=>new Promise((resolve,reject)=>{const server=app.listen(port);server.once('error',reject);server.once('listening',()=>resolve(server));})});
 clearTimeout(deadline);
}catch{clearTimeout(deadline);process.exit(1);}
for(const signal of ['SIGTERM','SIGINT'])process.once(signal,async()=>{running.server.close();await running.bot.stop();await running.pool.end();process.exit(0);});
