import {copyFileSync,existsSync,mkdirSync,readdirSync,renameSync} from 'node:fs';
import path from 'node:path';
import {assemble} from './assemble.mjs';
import {exportAudio} from './export-audio.mjs';
import {ROOT,FINAL_FILES,acquireLock,checksum,cleanup,command,inputFingerprints,paths,publish,pythonFor,readJson,removeGenerated,runtimeDirectory,tempEnvironment,writeJson} from './lib/pipeline.mjs';
import {renderPicture,verifyPicture,verifyOutput} from './lib/media.mjs';

const p=paths(),args=new Set(process.argv.slice(2));
const release=acquireLock(p),controller=new AbortController();
const stop=()=>controller.abort();
process.on('SIGINT',stop);process.on('SIGTERM',stop);
let runtime,checkpoint,partial,stage,published=false;
const nodeScript=(file,extra=[])=>command(process.execPath,[file,...extra],{signal:controller.signal,env:tempEnvironment(runtime,stage)});

try{
 runtime=runtimeDirectory(p);stage=path.join(runtime,'stage');mkdirSync(stage);
 console.log('[1/6] Prepare audio, score and source checks.');
 const audioPython=existsSync(path.join(ROOT,'.venv/bin/python'))?path.join(ROOT,'.venv/bin/python'):'python3';
 await command(audioPython,['scripts/prepare_audio.py'],{signal:controller.signal,env:tempEnvironment(runtime,stage)});
 await command(pythonFor('numpy'),['scripts/score.py'],{signal:controller.signal,env:tempEnvironment(runtime,stage)});
 await nodeScript('node_modules/typescript/bin/tsc',['--noEmit']);
 await nodeScript('scripts/check.mjs');
 const timeline=readJson(path.join(ROOT,'src/timeline.json'));
 const {visual,audio,build}=inputFingerprints(timeline);
 checkpoint=path.join(p.checkpoints,visual);const picture=path.join(checkpoint,'visual.mp4');mkdirSync(checkpoint,{recursive:true});
 writeJson(path.join(checkpoint,'manifest.json'),{visual,build,frames:timeline.durationInFrames});
 // Only a complete picture with matching visual inputs can be reused.
 for(const entry of readdirSync(p.checkpoints))if(entry!==visual)removeGenerated(path.join(p.checkpoints,entry),p);
 let receipt;
 try{receipt=readJson(p.receipt);}catch{}
 const current=path.join(p.out,'video.mp4');
 const reusable=!args.has('--force')&&receipt?.visual===visual&&existsSync(current)&&checksum(current)===receipt.files?.['video.mp4'];
 const complete=reusable&&receipt.build===build&&FINAL_FILES.every(name=>existsSync(path.join(p.out,name))&&checksum(path.join(p.out,name))===receipt.files[name]);
 if(complete){
  verifyOutput(current,timeline);cleanup({p,completed:true});
  console.log('Final output unchanged and verified. Temporary files cleaned; no render needed.');
 }else{
  let inputVideo;
  if(reusable){inputVideo=current;console.log(receipt.audio===audio?'[2/6] Reusing verified media; refreshing review artifacts.':'[2/6] Reusing verified picture; refreshing audio and review artifacts.');}
  else{
   if(!args.has('--force')&&existsSync(picture))verifyPicture(picture,timeline);
   else{
    if(args.has('--assemble-only'))throw new Error('Complete picture unavailable; run npm run render first.');
    partial=path.join(checkpoint,'visual.partial.mp4');
    console.log('[2/6] Render the complete picture in one Remotion process.');
    await renderPicture({entry:'src/index.ts',composition:'CeritaKucingVisual',output:partial,timeline,signal:controller.signal,env:tempEnvironment(runtime,stage)});
    controller.signal.throwIfAborted();renameSync(partial,picture);
   }
   inputVideo=picture;
  }
  console.log('[3/6] Stage a candidate; keep the previous final untouched.');
  if(inputVideo===current&&receipt?.audio===audio)copyFileSync(inputVideo,path.join(stage,'video.mp4'));
  else await assemble({timeline,inputVideo,output:path.join(stage,'video.mp4'),runtime,signal:controller.signal});
  console.log('[4/6] Verify media and review motion.');
  verifyOutput(path.join(stage,'video.mp4'),timeline);
  await exportAudio({timeline,video:path.join(stage,'video.mp4'),stage,runtime,signal:controller.signal});
  copyFileSync(path.join(ROOT,'naskah.json'),path.join(stage,'naskah.json'));
  renameSync(path.join(stage,'kucing.id.srt'),path.join(stage,'subtitle.srt'));
  await command(process.execPath,['node_modules/tsx/dist/cli.mjs','scripts/review.ts'],{signal:controller.signal,env:{...tempEnvironment(runtime,stage),VIDEO_INPUT:path.join(stage,'video.mp4')}});
  const files=Object.fromEntries(FINAL_FILES.map(name=>[name,checksum(path.join(stage,name))]));
  writeJson(path.join(stage,'build-manifest.json'),{version:3,visual,audio,build,verifiedAt:new Date().toISOString(),files});
  console.log('[5/6] Publish validated artifacts.');publish(stage,p);published=true;
  console.log('[6/6] Clean temporary files and completed checkpoints.');
  const result=cleanup({p,completed:true});console.log(`Done. Cleaned ${(result.bytes/1024/1024).toFixed(1)} MB of temporary files.`);
 }
}catch(error){
 process.exitCode=1;
 if(checkpoint){mkdirSync(checkpoint,{recursive:true});writeJson(path.join(checkpoint,'failure.json'),{message:error.message,at:new Date().toISOString()});}
 console.error(`Pipeline stopped: ${error.message}\n${published?'Validated final saved; run npm run clean to retry cleanup.':'Previous final output preserved. Run npm run render to resume.'}`);
}finally{
 try{if(partial&&existsSync(partial))removeGenerated(partial,p);if(runtime)removeGenerated(runtime,p);}finally{release();process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);}
}
