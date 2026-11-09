import path from 'node:path';
import {copyFileSync,cpSync,existsSync,mkdirSync,renameSync,rmSync,writeFileSync} from 'node:fs';
import {ROOT,FINAL_FILES,checksum,command,fingerprint,publish,pythonFor,readJson,writeJson,tempEnvironment} from './lib/pipeline.mjs';
import {ensureProject,projectPaths,projectEnvironment,loadEnvironment} from './lib/project.mjs';
import {renderPicture,verifyPicture,verifyOutput} from './lib/media.mjs';
import {assemble} from './assemble.mjs';
import {exportAudio} from './export-audio.mjs';
import {lintSource} from './lib/lint-source.mjs';
import {updateProgress} from './lib/progress.mjs';
import {agentLabel,DEFAULT_AGENT} from './lib/agent-session.mjs';

loadEnvironment();
const args=process.argv.slice(2),value=flag=>args[args.indexOf(flag)+1];
if(!args.includes('--project')||!args.includes('--stage'))throw new Error('Berikan --project dan --stage audio/render/finish.');
const p=projectPaths(value('--project')),stageName=value('--stage'),session=readJson(p.session),meta=readJson(p.metadata);
const lock=readJson(p.lock);if(lock.pid!==session.pid)throw new Error('Sesi produksi tidak lagi aktif.');
ensureProject(p);
const runtime=session.runtime,stage=session.stage;
if(!runtime?.startsWith(p.runtime+path.sep)||!stage?.startsWith(runtime+path.sep))throw new Error('Folder kerja sesi tidak valid.');
Object.assign(process.env,projectEnvironment(p),{PIPELINE_AUTHORED_SOURCE:'1'});
const env={...projectEnvironment(p),...tempEnvironment(runtime,stage),PIPELINE_AUTHORED_SOURCE:'1'},controller=new AbortController();
const stop=()=>controller.abort();process.on('SIGTERM',stop);process.on('SIGINT',stop);
const signal=controller.signal,report=(step,message,extra={})=>{console.log(message);updateProgress(p,{step,message,...extra});};
const timeline=()=>readJson(p.timeline);
let partial;
function picture(){
 const visual=fingerprint([path.relative(ROOT,p.source),'remotion.config.ts','package-lock.json',path.relative(ROOT,path.join(p.publicDir,'fonts'))]);
 const cache=path.join(p.checkpoints,visual);
 mkdirSync(cache,{recursive:true});return {visual,file:path.join(cache,'visual.mp4')};
}
function existingVideo(visual){
 try{const receipt=readJson(p.receipt),file=path.join(p.out,'video.mp4');if(!session.force&&receipt.sourceMode==='authored-remotion'&&receipt.visual===visual&&checksum(file)===receipt.files['video.mp4'])return file;}catch{}
 return null;
}
try{
 if(stageName==='audio'){
  report(3,'Menyiapkan narasi, timing kata, dan musik.');
  const script=readJson(p.script);if(!Array.isArray(script)||!script.length||script.some(s=>typeof s?.audio_text!=='string'||!s.audio_text.trim()||typeof s.motion_description!=='string'))throw new Error('Naskah harus berupa array dengan audio_text dan motion_description pada setiap elemen.');
  cpSync(path.join(ROOT,'public/fonts'),path.join(p.publicDir,'fonts'),{recursive:true});
  const python=existsSync(path.join(ROOT,'.venv/bin/python'))?path.join(ROOT,'.venv/bin/python'):'python3';
  await command(python,[path.join(ROOT,'scripts/prepare_audio.py')],{env,signal});
  await command(pythonFor('numpy'),[path.join(ROOT,'scripts/score.py')],{env,signal});
  copyFileSync(p.timeline,path.join(p.source,'timeline.json'));
  copyFileSync(path.join(stage,'kucing.id.srt'),path.join(p.cache,'subtitle.srt'));
  writeFileSync(path.join(p.source,'Root.tsx'),`import React from 'react';\nimport {Composition} from 'remotion';\nimport {Film,VisualFilm} from './Film';\nimport timeline from './timeline.json';\nexport const Root:React.FC=()=> <>\n<Composition id="ProjectFilm" component={Film} durationInFrames={timeline.durationInFrames} fps={timeline.fps} width={1920} height={1080}/>\n<Composition id="ProjectVisual" component={VisualFilm} durationInFrames={timeline.durationInFrames} fps={timeline.fps} width={1920} height={1080}/>\n</>;\n`);
  report(4,`${agentLabel(session.agent??DEFAULT_AGENT)} menyusun kode adegan Remotion + Three.js dalam sesi yang sama.`);
 }else if(stageName==='render'){
  const t=timeline(),{visual,file}=picture();
  if(existingVideo(visual)){report(5,'Gambar final yang sama masih tersedia.',{render:{completed:t.durationInFrames,total:t.durationInFrames}});}
  else if(!session.force&&existsSync(file)){verifyPicture(file,t);report(5,'Gambar video utuh sudah tersedia.',{render:{completed:t.durationInFrames,total:t.durationInFrames}});}
  else{
   const problems=lintSource(p.source);
   if(problems.length)throw new Error(`Pemeriksaan kode gagal sebelum render:\n${problems.join('\n')}`);
   partial=path.join(path.dirname(file),'visual.partial.mp4');
   report(5,'Merender seluruh video dalam satu proses Remotion.',{render:{completed:0,total:t.durationInFrames}});
   await renderPicture({entry:path.join(p.source,'index.ts'),composition:'ProjectVisual',output:partial,timeline:t,publicDir:p.publicDir,env,signal,onProgress:completed=>updateProgress(p,{render:{completed,total:t.durationInFrames}})});
   signal.throwIfAborted();renameSync(partial,file);
   report(5,'Render video utuh selesai.',{render:{completed:t.durationInFrames,total:t.durationInFrames}});
  }
 }else if(stageName==='finish'){
  const t=timeline(),{visual,file}=picture(),video=path.join(stage,'video.mp4'),inputVideo=existingVideo(visual)??file;
  if(!existsSync(inputVideo))throw new Error('Gambar video utuh belum tersedia. Jalankan render terlebih dahulu.');
  verifyPicture(inputVideo,t);
  report(6,'Menggabungkan gambar dan audio.');
  await assemble({timeline:t,inputVideo,output:video,runtime,signal,title:meta.title});
  verifyOutput(video,t);await exportAudio({timeline:t,video,stage,runtime,signal});
  copyFileSync(p.script,path.join(stage,'naskah.json'));
  const subtitle=path.join(stage,'kucing.id.srt');if(existsSync(subtitle))renameSync(subtitle,path.join(stage,'subtitle.srt'));else copyFileSync(path.join(p.cache,'subtitle.srt'),path.join(stage,'subtitle.srt'));
  signal.throwIfAborted();report(7,'Menyimpan hasil final dan membersihkan file sementara.');
  writeJson(path.join(stage,'build-manifest.json'),{version:5,sourceMode:'authored-remotion',title:meta.title,projectId:p.id,visual,files:Object.fromEntries(FINAL_FILES.map(name=>[name,checksum(path.join(stage,name))]))});
  publish(stage,p);report(7,'Video, naskah, dan audio final siap.',{state:'completed'});
 }else throw new Error('Tahap tidak dikenal. Gunakan audio, render, atau finish.');
}catch(error){
 const message=`Tahap ${stageName} gagal: ${error.message}`;
 writeJson(path.join(p.cache,'failure.json'),{stage:stageName,parentPid:session.pid,pid:process.pid,at:new Date().toISOString(),message,stack:error.stack});
 console.error(error.stack??message);process.exitCode=1;
}
finally{if(partial)rmSync(partial,{force:true});process.removeListener('SIGTERM',stop);process.removeListener('SIGINT',stop);}
