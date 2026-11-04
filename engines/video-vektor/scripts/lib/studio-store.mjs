import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {existsSync,lstatSync,readdirSync,rmSync,statSync} from 'node:fs';
import path from 'node:path';
import {ROOT,FINAL_FILES,acquireLock,paths,readJson,writeJson} from './pipeline.mjs';
import {projectSlug} from './project.mjs';
import {signalProcessTree,waitForProcesses} from './process-tree.mjs';
import {failureDetails} from './process-output.mjs';

export const STEPS=['Folder proyek','Naskah','Narasi','Kode animasi','Render video','Gabungkan audio','Simpan & bersihkan'];
const isActive=job=>['running','stopping'].includes(job.state);
const pending=job=>['queued','scheduled'].includes(job.state);
const read=(file,fallback=null)=>{try{return readJson(file);}catch{return fallback;}};
export const isAlive=pid=>{if(!Number.isInteger(pid)||pid<=0)return false;try{process.kill(pid,0);return true;}catch(error){return error.code!=='ESRCH';}};
export class StudioError extends Error{constructor(message,status=400){super(message);this.status=status;}}

export class StudioStore{
 constructor({root=ROOT,now=Date.now,launch}={}){
  this.root=root;this.now=now;this.base=path.join(root,'.cache/video-pipeline');
  this.file=path.join(this.base,'studio/jobs.json');
  this.jobs=read(this.file,[]);if(!Array.isArray(this.jobs))throw new Error('Data antrean studio tidak valid.');
  this.launch=launch??(job=>spawn(process.execPath,[path.join(ROOT,'scripts/video.mjs'),'--title',job.title,'--id',job.projectId,'--timeout',String(job.timeoutSeconds??0)],{cwd:root,env:{...process.env,PIPELINE_JOB_ID:job.id},stdio:['ignore','pipe','pipe'],detached:false}));
  this.closing=false;this.child=null;this.deleting=new Set();
 }
 save(){writeJson(this.file,this.jobs);}
 progress(projectId){return read(path.join(this.base,'projects',projectId,'status.json'));}
 locked(){const lock=read(path.join(this.base,'pipeline.lock'));return lock&&isAlive(lock.pid)?lock:null;}
 validateTitle(value){
  if(typeof value!=='string')throw new StudioError('Masukkan judul video.');
  const title=value.trim().replace(/\s+/g,' ');
  if(title.length<5||title.length>200)throw new StudioError('Judul harus berisi 5–200 karakter.');
  let projectId;try{projectId=projectSlug(title);}catch(error){throw new StudioError(error.message);}
  if(this.deleting.has(projectId))throw new StudioError('Proyek sedang dihapus. Tunggu hingga selesai.',409);
  const metadata=read(path.join(this.base,'projects',projectId,'project.json'));
  if(metadata?.title&&metadata.title.toLowerCase()!==title.toLowerCase())throw new StudioError('Judul ini menghasilkan nama folder yang sudah digunakan. Pilih judul yang lebih spesifik.',409);
  return {title,projectId};
 }
 schedule(value){
  if(value===null||value===undefined||value==='')return null;
  if(typeof value!=='string'||!Number.isFinite(Date.parse(value)))throw new StudioError('Tanggal dan waktu jadwal tidak valid.');
  const time=Date.parse(value);if(time<=this.now())throw new StudioError('Pilih jadwal setelah waktu sekarang.');
  return new Date(time).toISOString();
 }
 timeout(value){const seconds=Number(value??0);if(!Number.isFinite(seconds)||seconds<0)throw new StudioError('Timeout harus angka positif atau 0 untuk tanpa batas.');return seconds;}
 controlFile(projectId){return path.join(this.base,'projects',projectId,'control.json');}
 create({title,scheduledAt,timeoutSeconds=0}={}){
  const source=this.validateTitle(title),when=this.schedule(scheduledAt);
  if(this.jobs.some(job=>job.projectId===source.projectId&&(pending(job)||isActive(job))))throw new StudioError('Proyek ini sudah ada dalam antrean atau sedang diproses.',409);
  const job={id:randomUUID(),...source,timeoutSeconds:this.timeout(timeoutSeconds),scheduledAt:when,state:when?'scheduled':'queued',createdAt:new Date(this.now()).toISOString(),startedAt:null,finishedAt:null,pid:null,error:null};
  this.jobs.push(job);this.save();return job;
 }
 get(id){const job=this.jobs.find(job=>job.id===id);if(!job)throw new StudioError('Pekerjaan tidak ditemukan.',404);return job;}
 update(id,body){
  if(id.startsWith('external-')){
   const external=this.external();if(external?.id!==id||!external.projectId)throw new StudioError('Proses aktif tidak ditemukan.',404);
   const file=this.controlFile(external.projectId),control=read(file);if(!control)throw new StudioError('Proses ini belum mendukung pengaturan timeout.');
   if(!Object.hasOwn(body,'timeoutSeconds'))throw new StudioError('Berikan timeout.');
   writeJson(file,{...control,timeoutSeconds:this.timeout(body.timeoutSeconds)});return external;
  }
  const job=this.get(id),hasSchedule=Object.hasOwn(body,'scheduledAt'),hasTimeout=Object.hasOwn(body,'timeoutSeconds');
  if(!hasSchedule&&!hasTimeout)throw new StudioError('Berikan jadwal atau timeout.');
  if(hasSchedule&&!pending(job))throw new StudioError('Jadwal hanya dapat diubah sebelum proses berjalan.',409);
  const when=hasSchedule?this.schedule(body.scheduledAt):job.scheduledAt;
  const seconds=hasTimeout?this.timeout(body.timeoutSeconds):job.timeoutSeconds??0;
  if(hasSchedule){job.scheduledAt=when;job.state=when?'scheduled':'queued';}
  if(hasTimeout){job.timeoutSeconds=seconds;if(isActive(job)){const file=this.controlFile(job.projectId),control=read(file);if(control?.jobId===job.id)writeJson(file,{...control,timeoutSeconds:seconds});}}
  this.save();return job;
 }
 stop(id,{force=false}={}){
  const job=id.startsWith('external-')?this.external():this.get(id);
  if(!job||job.id!==id||!isActive(job))throw new StudioError('Tidak ada pekerjaan aktif untuk dihentikan.',409);
  const pid=job.external?this.locked()?.pid:job.pid;
  if(job.projectId){const file=this.controlFile(job.projectId),control=read(file);if(control)writeJson(file,{...control,stopRequested:true});}
  if(!job.external){job.stopRequested=true;job.state='stopping';this.save();}
  signalProcessTree(pid,force?'SIGKILL':'SIGTERM');return job;
 }

 cancel(id){const job=this.get(id);if(!pending(job))throw new StudioError('Pekerjaan yang sudah berjalan tidak dapat dibatalkan dari antrean.',409);job.state='cancelled';job.finishedAt=new Date(this.now()).toISOString();this.save();return job;}
 async remove(id){
  const job=id.startsWith('external-')?this.external():this.get(id);
  if(!job||job.id!==id||!job.projectId)throw new StudioError('Proyek tidak ditemukan.',404);
  await this.removeProject(job.projectId);return job;
 }
 async removeProject(projectId){
  if(typeof projectId!=='string'||!/^[a-z0-9][a-z0-9-]{0,71}$/.test(projectId))throw new StudioError('ID proyek tidak valid.');
  if(this.deleting.size)throw new StudioError('Tunggu sampai penghapusan proyek sebelumnya selesai.',409);
  const p=paths(this.root,projectId);
  const check=target=>{
   const relative=path.relative(this.root,target);
   if(!relative||relative.startsWith('..')||path.isAbsolute(relative))throw new StudioError('Lokasi proyek tidak valid.');
   let current=this.root;
   for(const part of relative.split(path.sep)){current=path.join(current,part);if(existsSync(current)&&lstatSync(current).isSymbolicLink())throw new StudioError('Folder proyek tidak boleh berupa symlink.');}
  };
  check(p.cache);check(p.out);check(p.runtime);
  if(!this.jobs.some(job=>job.projectId===projectId)&&!existsSync(p.cache)&&!existsSync(p.out))throw new StudioError('Proyek tidak ditemukan.',404);
  this.deleting.add(projectId);let release=()=>{};
  try{
   const session=read(path.join(p.cache,'session.json')),lock=read(p.lock),external=this.external();
   const pids=new Set(this.jobs.filter(job=>job.projectId===projectId&&isActive(job)&&job.pid!==process.pid&&(job.pid===this.child?.pid||job.pid===lock?.pid)&&isAlive(job.pid)).map(job=>job.pid));
   if(external?.projectId===projectId)pids.add(external.pid??lock.pid);
   if(lock?.projectId===projectId&&lock.pid!==process.pid&&isAlive(lock.pid))pids.add(lock.pid);
   if(this.locked()&&!external?.projectId&&!lock?.projectId&&projectId==='kucing-tidak-berguna')throw new StudioError('Hentikan pipeline dari terminal sebelum menghapus proyek ini.',409);
   const targets=[p.out,p.cache];
   if(projectId==='kucing-tidak-berguna')for(const name of ['build-manifest.json','reports','checkpoints','runtime','audio-work'])targets.push(path.join(this.base,name));
   if(projectId==='kucing-tidak-berguna')targets.push(path.join(this.root,'public/audio'),path.join(this.root,'public/timeline.json'));
   targets.forEach(check);
   const stopped=[...new Set([...pids].flatMap(pid=>signalProcessTree(pid,'SIGKILL')))];
   await waitForProcesses(stopped);
   if(lock&&pids.has(lock.pid)&&read(p.lock)?.token===lock.token)rmSync(p.lock,{force:true});
   const current=this.locked();
   if(!current)release=acquireLock(p);
   else if(current.projectId===projectId||this.external()?.projectId===projectId)throw new StudioError('Proyek kembali berjalan. Hapus kembali setelah proses terhenti.',409);
   if(existsSync(p.runtime))for(const name of readdirSync(p.runtime)){
    if(!/^r-[A-Za-z0-9]{6}$/.test(name))continue;
    const dir=path.join(p.runtime,name);if(lstatSync(dir).isSymbolicLink())continue;
    const owner=read(path.join(dir,'.pipeline-owner.json'));
    if(owner?.root===this.root&&(owner.projectId===projectId||!owner.projectId&&session?.runtime===dir))targets.push(dir);
   }
   targets.forEach(check);
   for(const target of targets)rmSync(target,{recursive:true,force:true});
   const last=path.join(this.base,'last-project.json');if(read(last)?.id===projectId)rmSync(last,{force:true});
   this.jobs=this.jobs.filter(job=>job.projectId!==projectId);this.save();
   return {projectId};
  }finally{try{release();}finally{this.deleting.delete(projectId);}}
 }
 retry(id){
  const job=this.get(id);if(!['failed','interrupted','stopped','timed_out'].includes(job.state))throw new StudioError('Pekerjaan ini tidak memerlukan pengulangan.',409);
  if(this.deleting.has(job.projectId))throw new StudioError('Proyek sedang dihapus.',409);
  if(this.jobs.some(other=>other.id!==id&&other.projectId===job.projectId&&(pending(other)||isActive(other))))throw new StudioError('Proyek ini sudah ada dalam antrean.',409);
  Object.assign(job,{state:'queued',scheduledAt:null,startedAt:null,finishedAt:null,pid:null,error:null,stopRequested:false});this.save();return job;
 }
 results(){
  const dir=path.join(this.root,'hasil');if(!existsSync(dir))return [];
  return readdirSync(dir,{withFileTypes:true}).filter(e=>e.isDirectory()&&/^[a-z0-9][a-z0-9-]{0,71}$/.test(e.name)).flatMap(e=>{
   const folder=path.join(dir,e.name),video=path.join(folder,'video.mp4');
   if(!existsSync(video)||lstatSync(video).isSymbolicLink())return [];
   const cache=path.join(this.base,'projects',e.name),meta=read(path.join(cache,'project.json'));
   const receipt=read(path.join(cache,'build-manifest.json'))??(e.name==='kucing-tidak-berguna'?read(path.join(this.base,'build-manifest.json')):null);
   const timeline=read(path.join(cache,'timeline.json'));
   const title=meta?.title??receipt?.title??e.name.replace(/-/g,' ');
   const files=FINAL_FILES.filter(name=>existsSync(path.join(folder,name))&&!lstatSync(path.join(folder,name)).isSymbolicLink());
   const poster=existsSync(path.join(cache,'reports/poster.png'))||e.name==='kucing-tidak-berguna'&&existsSync(path.join(this.base,'reports/poster.png'));
   return [{id:e.name,title,updatedAt:new Date(statSync(video).mtimeMs).toISOString(),duration:timeline?timeline.durationInFrames/timeline.fps:null,size:statSync(video).size,files,poster}];
  }).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
 }
 external(){
  const lock=this.locked();if(!lock||lock.pid===process.pid)return null;
  const dir=path.join(this.base,'projects');
  if(existsSync(dir))for(const e of readdirSync(dir,{withFileTypes:true})){
   if(!e.isDirectory()||!/^[a-z0-9][a-z0-9-]{0,71}$/.test(e.name))continue;
   const status=this.progress(e.name);if(status?.pid===lock.pid)return {id:`external-${lock.pid}`,title:status.title,projectId:e.name,state:read(this.controlFile(e.name))?.stopRequested||['stopped','timed_out'].includes(status.state)?'stopping':'running',external:true,pid:lock.pid,timeoutSeconds:read(this.controlFile(e.name))?.timeoutSeconds??0,startedAt:read(this.controlFile(e.name))?.startedAt??status.startedAt,progress:status};
  }
  return {id:`external-${lock.pid}`,title:lock.projectId?.replace(/-/g,' ')??'Pipeline dari terminal',projectId:lock.projectId??null,pid:lock.pid,state:'running',external:true,progress:null};
 }
 snapshot(){
  const running=this.jobs.find(isActive);
  let active=null;
  if(running){const status=this.progress(running.projectId);active={...running,progress:status?.pid===running.pid?status:null};}
  else active=this.external();
  const latest=this.jobs.filter(job=>job.state==='completed').at(-1);
  return {steps:STEPS,active,lastCompleted:latest??null,jobs:this.jobs,results:this.results(),timezone:'Asia/Jakarta'};
 }
 start(){this.tick();this.timer=setInterval(()=>this.tick(),1000);}
 tick(){
  if(this.closing||this.deleting.size)return;
  const running=this.jobs.find(isActive);
  if(running){
   if(!this.child&&!isAlive(running.pid)){
    const status=this.progress(running.projectId);
    this.finish(running,status?.pid===running.pid&&status.state==='completed'?0:1,'Proses sebelumnya terhenti. Lanjutkan untuk memakai naskah dan kode yang sudah tersimpan.');
   }
   return;
  }
  if(this.child||this.locked())return;
  const next=this.jobs.filter(job=>pending(job)&&(!job.scheduledAt||Date.parse(job.scheduledAt)<=this.now())).sort((a,b)=>(Date.parse(a.scheduledAt??a.createdAt)-Date.parse(b.scheduledAt??b.createdAt)))[0];
  if(!next)return;
  Object.assign(next,{state:'running',startedAt:new Date(this.now()).toISOString(),finishedAt:null,error:null,stopRequested:false});
  writeJson(this.controlFile(next.projectId),{jobId:next.id,startedAt:next.startedAt,timeoutSeconds:next.timeoutSeconds??0,stopRequested:false});this.save();
  let tail='',stderr='';
  try{
   const child=this.launch(next);this.child=child;next.pid=child.pid;this.save();
   const capture=data=>{tail=(tail+data.toString()).slice(-8000);};child.stdout?.on('data',capture);child.stderr?.on('data',data=>{stderr=(stderr+data.toString()).slice(-8000);capture(data);});
   let settled=false;
   const done=(code,message)=>{if(settled)return;settled=true;this.child=null;this.finish(next,code,[message,tail.includes(stderr)?tail:`${stderr}\n${tail}`].filter(Boolean).join('\n'));};
   child.once('error',error=>done(1,error.message));child.once('close',(code,signal)=>done(code??1,signal?`Proses terhenti (${signal}). Naskah dan kode dapat dilanjutkan.`:undefined));
  }catch(error){this.child=null;this.finish(next,1,error.message);}
 }
 finish(job,code,message){
  if(!this.jobs.includes(job))return;
  const status=this.progress(job.projectId);
  const owned=status?.pid===job.pid;
  job.state=job.stopRequested?'stopped':owned&&['stopped','timed_out'].includes(status.state)?status.state:code===0?'completed':this.closing?'interrupted':'failed';
  job.finishedAt=new Date(this.now()).toISOString();
  const summary=owned?String(status.message??'').trim():'',detail=String(message??'').trim();
  const error=failureDetails(summary,detail);
  job.error=job.state==='completed'?null:job.state==='stopped'?'Dihentikan oleh pengguna.':job.state==='timed_out'?summary:error||'Proses terhenti. Naskah, audio, dan kode tetap tersedia.';
  this.save();
 }
 async close(){
  this.closing=true;clearInterval(this.timer);
  const running=this.jobs.find(isActive);
  if(running){const child=this.child;const done=child?new Promise(resolve=>child.once('close',resolve)):null;this.stop(running.id);if(done)await done;}
 }
}
