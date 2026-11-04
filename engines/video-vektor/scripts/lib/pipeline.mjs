import {createHash,randomUUID} from 'node:crypto';
import {spawn,spawnSync} from 'node:child_process';
import {closeSync,existsSync,lstatSync,mkdirSync,mkdtempSync,openSync,readFileSync,readdirSync,renameSync,rmSync,statSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import {signalProcessTree} from './process-tree.mjs';
import {failureDetails} from './process-output.mjs';
import {fileURLToPath} from 'node:url';

export const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
export const PROJECT_ID='kucing-tidak-berguna';
export const FINAL_FILES=['video.mp4','narasi.wav','musik.wav','audio-final.wav','naskah.json','subtitle.srt'];
export const REVIEW_FILES=['storyboard.jpg','motion-review.jpg','poster.png','quality-report.json','shot-list.json'];
const OLD_VERSION_OUTPUTS=['v1','cerita-kucing-v2.mp4','poster-v2.png','storyboard-v2.jpg'];
export function paths(root=ROOT,projectId=process.env.PIPELINE_PROJECT_ID??PROJECT_ID){
 if(!/^[a-z0-9][a-z0-9-]{0,71}$/.test(projectId))throw new Error('Invalid project ID');
 const globalCache=path.join(root,'.cache/video-pipeline');
 const cache=arguments.length>1||process.env.PIPELINE_PROJECT_ID?path.join(globalCache,'projects',projectId):globalCache;
 // Chrome appends a Unix-domain socket name. A short project-owned path is
 // necessary on Linux, where the complete socket path is limited to 108 bytes.
 return {root,out:path.join(root,'hasil',projectId),reports:path.join(cache,'reports'),cache,checkpoints:path.join(cache,'checkpoints'),runtime:path.join(root,'.vtmp'),lock:path.join(globalCache,'pipeline.lock'),receipt:path.join(cache,'build-manifest.json')};
}
export const readJson=file=>JSON.parse(readFileSync(file,'utf8'));
export function writeJson(file,value){
 mkdirSync(path.dirname(file),{recursive:true});
 const temp=`${file}.${randomUUID()}.tmp`;
 try{writeFileSync(temp,JSON.stringify(value,null,2)+'\n');renameSync(temp,file);}finally{rmSync(temp,{force:true});}
}
export const checksum=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
export function pythonFor(module){
 for(const candidate of [path.join(ROOT,'.venv/bin/python'),'python3'])if(spawnSync(candidate,['-c',`import ${module}`],{stdio:'ignore'}).status===0)return candidate;
 throw new Error(`Python module ${module} missing. Install requirements.txt.`);
}
export function fingerprint(files,root=ROOT){
 const hash=createHash('sha256');
 function visit(file){
  if(lstatSync(file).isSymbolicLink())throw new Error(`Symlink is not a pipeline input: ${file}`);
  if(statSync(file).isDirectory())for(const name of readdirSync(file).sort())visit(path.join(file,name));
  else hash.update(path.relative(root,file)).update(readFileSync(file));
 }
 for(const file of files)visit(path.join(root,file));
 return hash.digest('hex');
}
export function legacyFingerprint(root=ROOT){
 const hash=createHash('sha256');
 function visit(dir){for(const e of readdirSync(path.join(root,dir),{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const file=`${dir}/${e.name}`;if(e.isDirectory())visit(file);else hash.update(file).update(readFileSync(path.join(root,file)));}}
 visit('src');hash.update(readFileSync(path.join(root,'remotion.config.ts')));return hash.digest('hex');
}
export function inputFingerprints(timeline,root=ROOT){
 const visualInputs=['src','remotion.config.ts','package-lock.json','public/fonts'];
 return {
  visual:fingerprint(visualInputs,root),
  audio:fingerprint([...timeline.scenes.map(s=>`public/audio/scene-${s.index+1}.mp3`),'public/audio/score.wav','scripts/assemble.mjs'],root),
  build:fingerprint([...visualInputs,'public/audio','scripts/assemble.mjs','scripts/export-audio.mjs','scripts/review.ts','scripts/check-output.mjs','scripts/lib/media.mjs'],root),
 };
}
// Deletion is limited to this project's generated files, never global /tmp.
export function removeGenerated(target,p=paths()){
 const absolute=path.resolve(target);
 const relative=path.relative(p.root,absolute);
 if(!relative||relative.startsWith('..')||path.isAbsolute(relative))throw new Error(`Refusing to delete outside the project: ${target}`);
 const outRelative=path.relative(p.out,absolute).split(path.sep),first=outRelative[0];
 const legacyNames=new Set(['boards','segments','render-exit-code','render.log','segment-2.log','angle-check.mp4','angle-check-2.mp4','earth-angle.png','earth-review.png']);
 const legacy=legacyNames.has(first)||OLD_VERSION_OUTPUTS.includes(first)||/^archived-segments-\d+$/.test(first)||/^scene-[1-6]\.png$/.test(first);
 const allowed=absolute===p.lock||absolute.startsWith(p.cache+path.sep)||absolute.startsWith(p.runtime+path.sep)||(absolute.startsWith(p.out+path.sep)&&legacy);
 if(!allowed)throw new Error(`Refusing to delete a source asset: ${target}`);
 let current=p.root;
 for(const part of relative.split(path.sep).slice(0,-1)){
  current=path.join(current,part);
  if(existsSync(current)&&lstatSync(current).isSymbolicLink())throw new Error(`Refusing to follow symlink: ${current}`);
 }
 if(existsSync(absolute)||(()=>{try{return lstatSync(absolute).isSymbolicLink();}catch{return false;}})())rmSync(absolute,{recursive:true,force:true});
}
export function acquireLock(p=paths()){
 let parent=p.root;
 for(const component of path.relative(p.root,p.cache).split(path.sep)){
  parent=path.join(parent,component);
  if(existsSync(parent)&&lstatSync(parent).isSymbolicLink())throw new Error(`Refusing a symlinked work directory: ${parent}`);
 }
 mkdirSync(p.cache,{recursive:true});
 const token=randomUUID();
 for(let attempt=0;attempt<2;attempt++){
  try{
   const fd=openSync(p.lock,'wx');writeFileSync(fd,JSON.stringify({pid:process.pid,token,projectId:path.basename(p.out)}));closeSync(fd);
   return ()=>{if(existsSync(p.lock)&&readJson(p.lock).token===token)rmSync(p.lock);};
  }catch(error){
   if(error.code!=='EEXIST')throw error;
   let existing;
   try{
    existing=readJson(p.lock);
    if(!Number.isInteger(existing.pid)||existing.pid<=0)throw new Error('Invalid lock PID');
   }catch{
    if(Date.now()-statSync(p.lock).mtimeMs<10000)throw new Error('Lock sedang dibuat. Coba lagi sebentar.');
    removeGenerated(p.lock,p);continue;
   }
   let alive=true;
   try{process.kill(existing.pid,0);}catch(e){if(e.code==='ESRCH')alive=false;}
   if(alive)throw new Error(`Pipeline lain masih aktif (PID ${existing.pid}). Tunggu sampai selesai.`);
   removeGenerated(p.lock,p);
  }
 }
 throw new Error('Unable to acquire pipeline lock');
}
export function runtimeDirectory(p=paths()){
 if(existsSync(p.runtime)&&lstatSync(p.runtime).isSymbolicLink())throw new Error('Refusing a symlinked temporary directory');
 mkdirSync(p.runtime,{recursive:true});
 const runtime=mkdtempSync(path.join(p.runtime,'r-'));
 writeJson(path.join(runtime,'.pipeline-owner.json'),{root:p.root,projectId:path.basename(p.out),pid:process.pid});return runtime;
}
export function command(program,args,{cwd=ROOT,env={},signal,log,capture=false,input}={}){
 return new Promise((resolve,reject)=>{
  const child=spawn(program,args,{cwd,env:{...process.env,...env},stdio:[input===undefined?'ignore':'pipe','pipe','pipe'],detached:false});
  if(input!==undefined){child.stdin.on('error',()=>{});child.stdin.end(input);}
  const captured=[];let tail='',stderr='';
  const forward=(data,stream)=>{tail=(tail+data.toString()).slice(-8000);if(capture)captured.push(data);else stream.write(data);if(log)log.write(data);};
  child.stdout.on('data',data=>forward(data,process.stdout));
  child.stderr.on('data',data=>{stderr=(stderr+data.toString()).slice(-8000);forward(data,process.stderr);});
  const stop=()=>signalProcessTree(child.pid);
  signal?.addEventListener('abort',stop,{once:true});
  if(signal?.aborted)stop();
  child.on('error',error=>{signal?.removeEventListener('abort',stop);reject(error);});
  child.on('close',(code,killed)=>{
   signal?.removeEventListener('abort',stop);
   if(code===0&&!signal?.aborted)resolve(capture?Buffer.concat(captured).toString('utf8'):undefined);
   else reject(new Error(failureDetails(`${path.basename(program)} failed (${killed??code}). Data proyek tetap tersimpan.`,tail.includes(stderr)?tail:`${stderr}\n${tail}`)));
  });
 });
}
export function tempEnvironment(runtime,stage=runtime){
 return {TMPDIR:runtime,TMP:runtime,TEMP:runtime,PIPELINE_STAGE:stage,VIDEO_OUTPUT_DIR:stage};
}
export function legacyTemps(p=paths()){
 if(!existsSync(p.out))return [];
 const exact=new Set(['boards','render-exit-code','render.log','segment-2.log','angle-check.mp4','angle-check-2.mp4','earth-angle.png','earth-review.png']);
 const targets=readdirSync(p.out).filter(n=>exact.has(n)||/^archived-segments-\d+$/.test(n)||/^scene-[1-6]\.png$/.test(n)).map(n=>path.join(p.out,n));
 if(existsSync(path.join(p.out,'v1/segments')))targets.push(path.join(p.out,'v1/segments'));
 return targets;
}
export function cleanup({p=paths(),purge=false,completed=false,dryRun=false}={}){
 const targets=[...legacyTemps(p)];
 if(existsSync(p.runtime))for(const name of readdirSync(p.runtime)){
  if(!/^r-[A-Za-z0-9]{6}$/.test(name))continue;
  const dir=path.join(p.runtime,name),marker=path.join(dir,'.pipeline-owner.json');
  if(lstatSync(dir).isSymbolicLink())continue;
  try{if(readJson(marker).root===p.root)targets.push(dir);}catch{}
 }
 for(const name of ['runtime','audio-work']){
  const oldRuntime=path.join(p.cache,name);
  if(existsSync(oldRuntime))targets.push(oldRuntime);
 }
 if(purge||completed){
  if(existsSync(p.checkpoints))targets.push(...readdirSync(p.checkpoints).map(n=>path.join(p.checkpoints,n)));
  if(existsSync(path.join(p.out,'segments')))targets.push(path.join(p.out,'segments'));
 }
 if(completed){
  for(const name of FINAL_FILES)if(!existsSync(path.join(p.out,name)))throw new Error(`Cannot delete old versions before latest output exists: ${name}`);
  // Nested temporary files in v1 are covered by removing the whole old version.
  for(let i=targets.length-1;i>=0;i--)if(targets[i].startsWith(path.join(p.out,'v1')+path.sep))targets.splice(i,1);
  for(const name of OLD_VERSION_OUTPUTS)if(existsSync(path.join(p.out,name)))targets.push(path.join(p.out,name));
 }
 let bytes=0;
 function size(file){if(lstatSync(file).isSymbolicLink())return 0;if(statSync(file).isDirectory())return readdirSync(file).reduce((n,f)=>n+size(path.join(file,f)),0);return statSync(file).size;}
 for(const target of targets){bytes+=size(target);if(!dryRun)removeGenerated(target,p);}
 return {targets,bytes,dryRun};
}
export function publish(stage,p=paths(),{move=renameSync}={}){
 // All verification happens before this function. Roll back if a rename fails.
 const backup=path.join(stage,'previous');mkdirSync(backup,{recursive:true});mkdirSync(p.out,{recursive:true});
 const required=[...FINAL_FILES,'build-manifest.json'];
 for(const name of required)if(!existsSync(path.join(stage,name)))throw new Error(`Missing validated artifact: ${name}`);
 const files=[...required,...REVIEW_FILES.filter(name=>existsSync(path.join(stage,name)))];
 const destination=name=>name==='build-manifest.json'?p.receipt:REVIEW_FILES.includes(name)?path.join(p.reports,name):path.join(p.out,name);
 const installed=[],saved=[];
 try{
  for(const name of files){
   const dest=destination(name);mkdirSync(path.dirname(dest),{recursive:true});
   if(existsSync(dest)){move(dest,path.join(backup,name));saved.push(name);}
   move(path.join(stage,name),dest);installed.push(name);
  }
 }catch(error){
  for(const name of installed.reverse())rmSync(destination(name),{force:true});
  for(const name of saved.reverse())renameSync(path.join(backup,name),destination(name));
  throw error;
 }
}
