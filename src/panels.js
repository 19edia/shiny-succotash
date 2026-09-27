// Only permanent bot panels are reconciled. Event announcements remain separate records.
const pending=new Map();
const data=value=>value?.toJSON?.()??value;
const normalized=value=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const definitions={
 verify:{button:'verify',titles:['Verificação IFJ']},
 ticket:{button:'ticket',titles:['Atendimento']},
 report:{button:'report',titles:['Denúncias']},
 guide:{titles:['Como verificar • ROKUHARA']},
 alliance:{titles:['ROKUHARA × HYDRA NO KAI','ROKUHARA × RYUKETSU']},
 immigration:{button:'immigration-open',titles:['ROKUHARA • Vamos imigrar!']},
 tribunal:{titles:[]}
};
export function panelPayload(content,kind){
 const embeds=content.embeds.map(value=>{const embed=data(value);return {...embed,footer:{...embed.footer,text:`${embed.footer?.text??'ROKUHARA • CENTRAL IFJ'} · IFJ:${kind}`}};});
 return {...content,content:content.content??'',embeds,components:content.components??[],allowedMentions:{parse:[]}};
}
export function matchesPanel(message,botId,kind){
 if(!botId||message.author?.id!==botId||message.webhookId)return false;
 const definition=definitions[kind];if(!definition)throw new Error('Tipo de painel desconhecido.');
 const embeds=(message.embeds??[]).map(data);
 const markers=embeds.map(e=>e.footer?.text?.match(/(?:^|\s)IFJ:([a-z-]+)(?:\s|$)/)?.[1]).filter(Boolean);
 if(markers.length)return markers.includes(kind);
 if(definition.button&&(message.components??[]).some(row=>(data(row).components??[]).some(b=>data(b).custom_id===definition.button)))return true;
 return embeds.some(e=>definition.titles.some(title=>normalized(e.title)===normalized(title)));
}
export async function findPanel(channel,botId,kind,savedId){
 if(!botId)throw new Error('Bot não autenticado para identificar os painéis.');
 if(savedId){
  try{const message=await channel.messages.fetch(savedId);if(matchesPanel(message,botId,kind))return message;}
  catch(error){if(error.code!==10008)throw error;}
 }
 let before;
 // Read every page, including messages older than Discord's 100-message page limit.
 for(;;){
  const batch=await channel.messages.fetch({limit:100,...(before?{before}:{})});
  const messages=[...batch.values()];
  const match=messages.find(message=>matchesPanel(message,botId,kind));if(match)return match;
  if(messages.length<100)return null;
  const next=messages.at(-1).id;if(next===before)throw new Error('Não foi possível avançar no histórico do canal.');before=next;
 }
}
export async function publishPanel(pool,client,channel,channelId,kind,content){
 const key=`${client.user?.id}:${channelId}`;
 const previous=pending.get(key)??Promise.resolve();
 const task=previous.catch(()=>{}).then(async()=>{
  const saved=(await pool.query('SELECT message_id FROM panels WHERE channel_id=$1',[channelId])).rows[0];
  const payload=panelPayload(content,kind);
  let message=await findPanel(channel,client.user?.id,kind,saved?.message_id);
  if(message){
   try{await message.edit(payload);}catch(error){if(error.code!==10008)throw error;message=null;}
  }
  if(!message)message=await channel.send(payload);
  // Save recovered IDs too; if persistence fails, the next run finds the message in history.
  await pool.query('INSERT INTO panels(channel_id,message_id) VALUES($1,$2) ON CONFLICT(channel_id) DO UPDATE SET message_id=$2',[channelId,message.id]);
  return message;
 });
 pending.set(key,task);
 try{return await task;}finally{if(pending.get(key)===task)pending.delete(key);}
}
