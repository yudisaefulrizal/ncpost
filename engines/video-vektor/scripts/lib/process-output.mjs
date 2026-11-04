import {stripVTControlCharacters} from 'node:util';

// Keep the failure and one progress line readable even after a long render.
export function failureDetails(summary,output='',limit=8000){
 const clean=value=>{
  let progress='';
  const lines=stripVTControlCharacters(String(value??'')).split(/[\r\n]+/).filter(line=>{
   if(/^(?:Rendered|Encoded) \d+\/\d+(?:,.*)?$/.test(line.trim())){progress=line.trim();return false;}
   return true;
  });
  return [lines.join('\n').trim(),progress?`Progres terakhir: ${progress}`:''].filter(Boolean).join('\n');
 };
 const title=clean(summary),detail=clean(output);
 const message=(detail.includes(title)?detail:[title,detail].filter(Boolean).join('\n')).trim();
 if(message.length<=limit)return message;
 const head=Math.floor(limit/4),separator='\n…\n';
 return message.slice(0,head)+separator+message.slice(-(limit-head-separator.length));
}
