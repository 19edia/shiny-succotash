// Stable keys preserve the identity of resources across /criar updates.
export const rankRoles=[['member','✅','Membro verificado'],['admin','🛡️','Equipe'],['leader','👑','Líder'],['subleader','⚜️','Sub líder'],['high','💎','High member'],['moderator','🔰','Moderador'],['recruiter','📋','Recrutador'],['ally','🤝','Aliado'],['veteran','⭐','Veterano'],['rookie','🌱','Novato']];
export const categories=[
 ['entry','PORTAL','🚪','public','ENTRADA'],['info','INFORMAÇÕES','📜','members'],['internal','CONVIVÊNCIA','💬','members','DIVISÃO'],['operations','OPERAÇÕES','⚔️','members'],['training','TREINAMENTOS','🎯','members'],['voice','CENTRAL DE CALLS','🎙️','members'],['staff','COMANDO','🛡️','staff','EQUIPE'],['tickets-category','ATENDIMENTOS','🎫','staff','ATENDIMENTOS']
];
// key, name, emoji, category, scope. Read-only channels still permit bot/staff messages.
export const textChannels=[
 ['verification','verificacao','✅','entry','public'],['tickets','abrir-ticket','🎫','entry','public'],['welcome','boas-vindas','👋','entry','public'],['rules','regras','📖','entry','public'],['guide','como-verificar','🪪','entry','public'],
 ['news','avisos','📢','info','readonly'],['hierarchy','hierarquia','👑','info','readonly'],['alliances','aliancas','🤝','info','readonly'],
 ['general','conversa-geral','💬','internal','members'],['introductions','apresentacoes','👤','internal','members'],['media','midia','📸','internal','members'],['clips','clipes','🎬','internal','members'],['suggestions','sugestoes','💡','internal','members'],
 ['wanted','cacados','🎯','operations','readonly'],['reports','denuncias','🚨','operations','readonly'],['missions','missoes','📌','operations','readonly'],['operations-chat','planejamento','🗺️','operations','members'],
 ['training-schedule','agenda','📅','training','readonly'],['training-chat','treinos','🥋','training','members'],['training-results','resultados','🏆','training','readonly'],
 ['staff-text','equipe-ifj','🛡️','staff','staff'],['recruitment','recrutamento','📋','staff','staff'],['analysis','analise-denuncias','🔎','staff','staff'],['staff-records','registros','🗃️','staff','staff']
];
export const voiceChannels=[['voice1','Call 1','🔊','voice','members'],['voice2','Call 2','🔊','voice','members'],['voice-training','Treinamento','🥋','voice','members'],['voice-operations','Operações','⚔️','voice','members'],['voice-staff','Reunião da equipe','🛡️','staff','staff'],['voice-interview','Entrevistas','📋','staff','staff']];
