import {existsSync,mkdirSync,readdirSync,renameSync} from 'node:fs';
import path from 'node:path';
import {ROOT,CAT_SOURCE,acquireLock,command,paths,pythonFor,readJson,removeGenerated,runtimeDirectory,tempEnvironment} from './lib/pipeline.mjs';
import {verifyOutput} from './lib/media.mjs';

if(process.argv.includes('--project')){
 await import('./project-artifacts.mjs');
}else{
const p=paths(),mode=process.argv[2];
if(!['storyboard','review','still','preview','audio','score'].includes(mode))throw new Error('Unknown artifact command');
const release=acquireLock(p),controller=new AbortController(),stop=()=>controller.abort();
let runtime;
process.on('SIGINT',stop);process.on('SIGTERM',stop);
try{
 runtime=runtimeDirectory(p);const stage=path.join(runtime,'stage');
 mkdirSync(stage);mkdirSync(p.reports,{recursive:true});
 const env=tempEnvironment(runtime,stage);
 if(mode==='audio'||mode==='score'){
  const program=mode==='score'?pythonFor('numpy'):(existsSync(path.join(ROOT,'.venv/bin/python'))?path.join(ROOT,'.venv/bin/python'):'python3');
  await command(program,[mode==='audio'?'scripts/prepare_audio.py':'scripts/score.py'],{env:{...env,PIPELINE_STAGE:path.join(ROOT,'public/audio')},signal:controller.signal});
 }else if(mode==='storyboard'||mode==='review')await command(process.execPath,['node_modules/tsx/dist/cli.mjs',`scripts/${mode}.ts`],{env,signal:controller.signal});
 else{
  const output=path.join(stage,mode==='still'?'poster.png':'cerita-kucing-preview.mp4');
  const args=mode==='still'?['still',path.join(CAT_SOURCE,'index.ts'),'CeritaKucingVisual',output,'--frame=157']:['render',path.join(CAT_SOURCE,'index.ts'),'CeritaKucing',output,'--scale=0.5'];
  await command(process.execPath,['node_modules/@remotion/cli/remotion-cli.js',...args,'--log=error'],{env,signal:controller.signal});
  if(mode==='preview')verifyOutput(output,readJson(path.join(ROOT,CAT_SOURCE,'timeline.json')),{width:960,height:540});
 }
 for(const name of readdirSync(stage))renameSync(path.join(stage,name),path.join(p.reports,name));
 console.log(`${mode} completed. Temporary files removed.`);
}catch(error){console.error(error.message);process.exitCode=1;}
finally{try{if(runtime)removeGenerated(runtime,p);}finally{release();process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);}}
}
