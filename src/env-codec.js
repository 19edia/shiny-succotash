// A deliberately small, lossless .env subset accepted by Node's --env-file.
export function quoteEnv(value){
 const v=String(value??'');
 if(/[\r\n\0]/.test(v))throw new Error('Use um valor em uma única linha.');
 if(!v.includes("'"))return "'"+v+"'";
 if(!v.includes('"')&&!/\\[nr]/.test(v))return '"'+v+'"';
 if(!v.includes('#')&&!/^["'`]/.test(v)&&v===v.trim())return v;
 throw new Error('Esta combinação de aspas e # não pode ser salva sem alteração. Use um valor sem aspas ou gere uma nova senha.');
}
export function serializeEnv(values,{complete=false}={}){
 const header=complete?'# IFJ — configuração preenchida. A validade real será testada ao iniciar.':'# IFJ — RASCUNHO. Conclua o assistente antes de usar.';
 return header+'\n# Contém segredos: não enviar ao GitHub.\n'+Object.entries(values).map(([k,v])=>{if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(k))throw new Error('Nome de variável inválido.');return `${k}=${quoteEnv(v)}`;}).join('\n')+'\n';
}
export function parseEnvFile(content){
 const result={};
 for(const [index,raw]of content.replace(/^\uFEFF/,'').split(/\r?\n/).entries()){
  let line=raw.trim();if(!line||line.startsWith('#'))continue;
  const match=/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);if(!match)throw new Error(`Linha ${index+1}: use NOME=valor.`);
  const [,key,rest]=match;if(Object.hasOwn(result,key))throw new Error(`Variável duplicada na linha ${index+1}.`);
  let value;
  if(rest.startsWith("'")||rest.startsWith('"')){
   const quote=rest[0],end=rest.indexOf(quote,1);if(end<0||!/^\s*(?:#.*)?$/.test(rest.slice(end+1)))throw new Error(`Linha ${index+1}: revise as aspas; valores multilinha não são suportados.`);
   value=rest.slice(1,end);if(quote==='"')value=value.replace(/\\n/g,'\n').replace(/\\r/g,'\r');
  }else value=rest.split('#')[0].trim();
  quoteEnv(value);result[key]=value;
 }
 return result;
}
