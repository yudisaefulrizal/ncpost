import {loadEnvironment} from './lib/project.mjs';
import path from 'node:path';
import {existsSync} from 'node:fs';
import {ROOT,readJson} from './lib/pipeline.mjs';

loadEnvironment();
const args=process.argv.slice(2),values={},positional=[];
const flags=new Set(['--force','--regenerate','--replan','--assemble-only']);
for(let i=0;i<args.length;i++){
 const item=args[i];
 if(flags.has(item))values[item.slice(2)]=true;
 else if(['--title','--project','--id','--timeout'].includes(item)){
  if(!args[i+1]||args[i+1].startsWith('--'))throw new Error(`Nilai ${item} belum diberikan.`);
  values[item.slice(2)]=args[++i];
 }else if(item.startsWith('--'))throw new Error(`Argumen tidak dikenal: ${item}`);
 else positional.push(item);
}
const title=values.title??(positional.length?positional.join(' '):undefined);
const last=path.join(ROOT,'.cache/video-pipeline/last-project.json');
if(!title&&!values.project&&['render','assemble'].includes(process.env.npm_lifecycle_event)&&existsSync(last))values.project=readJson(last).id;
if(!title&&!values.project&&['render','assemble'].includes(process.env.npm_lifecycle_event)){
 // Existing approved project remains available through the original render command.
 await import('./render.mjs');
}else if(title||values.project){
 try{
  const {runProject}=await import('./run-project.mjs');
  const timeoutSeconds=Number(values.timeout??0);if(!Number.isFinite(timeoutSeconds)||timeoutSeconds<0)throw new Error('--timeout harus berupa detik, 0 untuk tanpa batas.');
  await runProject({title,timeoutSeconds,id:values.project??values.id,regenerate:!!values.regenerate,replan:!!values.replan,force:!!values.force,assembleOnly:!!values['assemble-only']});
 }catch(error){console.error(error.message);process.exitCode=1;}
}else{
 console.error('Gunakan: npm run video -- "Judul video" atau npm run render -- --project <id>.');process.exitCode=1;
}
