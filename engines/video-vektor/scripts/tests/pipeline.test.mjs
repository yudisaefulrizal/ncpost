import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,renameSync,rmSync,symlinkSync,utimesSync,writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {FINAL_FILES,acquireLock,cleanup,command,inputFingerprints,paths,publish,removeGenerated,runtimeDirectory,tempEnvironment,writeJson} from '../lib/pipeline.mjs';
import {failureDetails} from '../lib/process-output.mjs';

function fixture(t){
 const root=mkdtempSync(path.join(os.tmpdir(),'video-pipeline-test-'));
 t.after(()=>rmSync(root,{recursive:true,force:true}));
 const p=paths(root);mkdirSync(p.out,{recursive:true});mkdirSync(p.checkpoints,{recursive:true});return p;
}
function destination(p,name){return name==='build-manifest.json'?p.receipt:path.join(p.out,name);}
function put(file,text='keep'){mkdirSync(path.dirname(file),{recursive:true});writeFileSync(file,text);}

test('normal cleanup preserves finals, original assets, backups and resumable frames',t=>{
 const p=fixture(t);
 for(const name of FINAL_FILES)put(path.join(p.out,name));
 const source=path.join(p.root,'public/audio/scene-1.mp3'),backup=path.join(p.out,'v1/cerita-kucing.mp4'),part=path.join(p.checkpoints,'current/segments/0000-0199.mp4');
 for(const f of [source,backup,part])put(f);
 put(path.join(p.out,'boards/shot.png'));put(path.join(p.out,'archived-segments-123/part.mp4'));put(path.join(p.out,'v1/segments/part.mp4'));
 const runtime=runtimeDirectory(p);put(path.join(runtime,'render.tmp'));
 const unrelated=path.join(p.runtime,'r-ABC123/notes.txt');put(unrelated);
 cleanup({p});
 for(const name of FINAL_FILES)assert(existsSync(path.join(p.out,name)));
 for(const f of [source,backup,part])assert(existsSync(f));
 assert(!existsSync(runtime));assert(!existsSync(path.join(p.out,'boards')));assert(!existsSync(path.join(p.out,'v1/segments')));
 assert(existsSync(unrelated),'Unmarked temporary folders must not be deleted');
});

test('dry run does not remove anything; explicit purge only drops generated checkpoints',t=>{
 const p=fixture(t),part=path.join(p.checkpoints,'current/segments/a.mp4');put(part);put(path.join(p.out,'video.mp4'));
 const preview=cleanup({p,purge:true,dryRun:true});assert(preview.targets.length>0);assert(existsSync(part));
 cleanup({p,purge:true});assert(!existsSync(part));assert(existsSync(path.join(p.out,'video.mp4')));
});

test('cleanup refuses source paths, final outputs, outside paths and symlink traversal',t=>{
 const p=fixture(t),outside=mkdtempSync(path.join(os.tmpdir(),'video-pipeline-outside-'));
 t.after(()=>rmSync(outside,{recursive:true,force:true}));put(path.join(outside,'sentinel'));
 for(const file of [p.root,path.join(p.root,'src'),path.join(p.out,'video.mp4'),outside])assert.throws(()=>removeGenerated(file,p));
 const link=path.join(p.checkpoints,'linked');symlinkSync(outside,link,'dir');
 assert.throws(()=>removeGenerated(path.join(link,'sentinel'),p),/symlink/);
 cleanup({p,purge:true});assert(existsSync(path.join(outside,'sentinel')));
});

test('active lock blocks render/cleanup; a stale lock is recovered',t=>{
 const p=fixture(t),release=acquireLock(p);
 assert.throws(()=>acquireLock(p),/masih aktif/);release();
 writeJson(p.lock,{pid:99999999,token:'stale'});
 const next=acquireLock(p);assert(existsSync(p.lock));next();assert(!existsSync(p.lock));
});

test('publication checks the entire staged output before touching the current final',t=>{
 const p=fixture(t),stage=runtimeDirectory(p);put(path.join(p.out,'video.mp4'),'approved');
 put(path.join(stage,'video.mp4'),'candidate');
 assert.throws(()=>publish(stage,p),/Missing validated artifact/);
 assert.equal(readFileSync(path.join(p.out,'video.mp4'),'utf8'),'approved');
});

test('an interrupted lock write is recovered without stealing a newly created lock',t=>{
 const p=fixture(t);put(p.lock,'');
 assert.throws(()=>acquireLock(p),/sedang dibuat/);
 const old=new Date(Date.now()-60000);utimesSync(p.lock,old,old);
 const release=acquireLock(p);release();assert(!existsSync(p.lock));
});

test('a failed publication rolls every previously installed artifact back',t=>{
 const p=fixture(t),stage=runtimeDirectory(p),names=[...FINAL_FILES,'build-manifest.json'];
 for(const name of names){put(destination(p,name),'approved');put(path.join(stage,name),'candidate');}
 let moves=0;
 assert.throws(()=>publish(stage,p,{move:(a,b)=>{if(++moves===4)throw new Error('simulated disk error');renameSync(a,b);}}),/disk error/);
 for(const name of names)assert.equal(readFileSync(destination(p,name),'utf8'),'approved');
});

test('a successful publication updates all artifacts and cleanup preserves the result',t=>{
 const p=fixture(t),stage=runtimeDirectory(p),names=[...FINAL_FILES,'build-manifest.json'];
 for(const name of names){put(destination(p,name),'approved');put(path.join(stage,name),'candidate');}
 for(const name of ['v1/cerita-kucing.mp4','v1/source.tar.gz','cerita-kucing-v2.mp4','poster-v2.png','storyboard-v2.jpg'])put(path.join(p.out,name),'old version');
 publish(stage,p);cleanup({p,completed:true});
 for(const name of names)assert.equal(readFileSync(destination(p,name),'utf8'),'candidate');
 assert(!existsSync(stage));
 for(const name of ['v1','cerita-kucing-v2.mp4','poster-v2.png','storyboard-v2.jpg'])assert(!existsSync(path.join(p.out,name)),'Old versions must be removed after successful publication');
});

test('old versions are retained until the complete latest output is available',t=>{
 const p=fixture(t);put(path.join(p.out,'v1/cerita-kucing.mp4'),'old version');put(path.join(p.out,'video.mp4'),'latest');
 assert.throws(()=>cleanup({p,completed:true}),/latest output exists/);
 assert(existsSync(path.join(p.out,'v1/cerita-kucing.mp4')));
});

test('child processes use the owned temporary directory and can be interrupted',async t=>{
 const p=fixture(t),runtime=runtimeDirectory(p),output=path.join(runtime,'where.txt');
 await command(process.execPath,['-e',`require('fs').writeFileSync(process.argv[1],require('os').tmpdir())`,output],{cwd:p.root,env:tempEnvironment(runtime)});
 assert.equal(readFileSync(output,'utf8'),runtime);
 const controller=new AbortController();const pending=command(process.execPath,['-e','setInterval(()=>{},1000)'],{cwd:p.root,signal:controller.signal});
 setTimeout(()=>controller.abort(),75);await assert.rejects(pending,/Data proyek tetap tersimpan/);
});

test('child processes accept literal stdin and report captured failures',async()=>{
 const input='judul dengan `kutip`, $HOME, baris\nbaru dan Unicode: uap';
 const result=await command(process.execPath,['-e',"process.stdin.pipe(process.stdout)"],{input,capture:true});
 assert.equal(result,input);
 await assert.rejects(command(process.execPath,['-e',"console.error('login diperlukan');process.exit(7)"],{capture:true}),/login diperlukan/);
});

test('streamed child failures retain bounded diagnostics through parent processes',async()=>{
 const pipeline=new URL('../lib/pipeline.mjs',import.meta.url).href;
 const child="process.stdout.write('x'.repeat(12000));console.error('Renderer gagal pada frame 1230: WebGL context lost');process.exit(1)";
 // Isolate streamed output so the test runner's own stdout stays intact.
 const script=String.raw`import assert from 'node:assert/strict';import {command} from ${JSON.stringify(pipeline)};
  const output=[];
  await assert.rejects(command(process.execPath,['-e',${JSON.stringify(child)}],{log:{write:chunk=>output.push(chunk)}}),error=>{
   assert.match(error.message,/failed \(1\)/);
   assert.match(error.message,/Renderer gagal pada frame 1230: WebGL context lost/);
   assert(error.message.length<8200);
   return true;
  });
  assert.match(Buffer.concat(output).toString(),/Renderer gagal/);`;
 const output=await command(process.execPath,['--input-type=module','-e',script],{capture:true});
 assert.match(output,/Renderer gagal pada frame 1230: WebGL context lost/);
 const parent=`import {command} from ${JSON.stringify(pipeline)};try{await command(process.execPath,['-e',${JSON.stringify("console.error('Renderer gagal: browser terputus');process.exit(1)")}]);}catch(error){console.error(error.message);process.exitCode=1;}`;
 await assert.rejects(command(process.execPath,['--input-type=module','-e',parent],{capture:true}),/Renderer gagal: browser terputus/);
});

test('stderr diagnostics survive a later flood of render progress',async()=>{
 const script="console.error('Browser terputus: GPU process exited');setTimeout(()=>{process.stdout.write(Array.from({length:500},(_,i)=>'Rendered '+i+'/2448, time remaining: 1m 41s').join('\\n')+'\\n');process.exitCode=1;},30)";
 await assert.rejects(command(process.execPath,['-e',script],{capture:true}),error=>{
  assert.match(error.message,/node failed \(1\)/);
  assert.match(error.message,/Browser terputus: GPU process exited/);
  assert.match(error.message,/Progres terakhir: Rendered 499\/2448/);
  assert(error.message.length<500);
  return true;
 });
});

test('failure summaries preserve the exit reason and final progress within the display limit',()=>{
 const summary='node failed (1). Data proyek tetap tersimpan.';
 const progress=Array.from({length:200},(_,i)=>`Rendered ${i}/2448, time remaining: 1m 41s`).join('\n');
 const message=failureDetails(summary,progress);
 assert(message.startsWith(summary));assert.match(message,/Progres terakhir: Rendered 199\/2448/);assert(message.length<200);
 const long=failureDetails(summary,'Error awal\n'+'x'.repeat(12000)+'\nError akhir');
 assert(long.startsWith(summary));assert(long.endsWith('Error akhir'));assert.equal(long.length,8000);
});

test('review changes reuse complete media, audio changes reuse picture, visual changes invalidate picture',t=>{
 const p=fixture(t),timeline={scenes:[{index:0}]};
 for(const name of ['src/Film.tsx','remotion.config.ts','package-lock.json','public/fonts/font.ttf','public/audio/scene-1.mp3','public/audio/score.wav','scripts/assemble.mjs','scripts/export-audio.mjs','scripts/review.ts','scripts/check-output.mjs','scripts/lib/media.mjs'])put(path.join(p.root,name));
 const first=inputFingerprints(timeline,p.root);
 put(path.join(p.root,'scripts/review.ts'),'new review');
 const review=inputFingerprints(timeline,p.root);
 assert.equal(review.visual,first.visual);assert.equal(review.audio,first.audio);assert.notEqual(review.build,first.build);
 put(path.join(p.root,'public/audio/scene-1.mp3'),'new narration');
 const audio=inputFingerprints(timeline,p.root);
 assert.equal(audio.visual,review.visual);assert.notEqual(audio.audio,review.audio);
 put(path.join(p.root,'src/Film.tsx'),'new picture');
 assert.notEqual(inputFingerprints(timeline,p.root).visual,audio.visual);
});
