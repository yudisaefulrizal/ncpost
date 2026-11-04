import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {mkdtempSync,rmSync,mkdirSync,writeFileSync,symlinkSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {once} from 'node:events';
import WebSocket from 'ws';
import {StudioStore} from '../lib/studio-store.mjs';
import {createStudioServer} from '../studio-server.mjs';
import {progressReporter} from '../lib/progress.mjs';
import {writeJson} from '../lib/pipeline.mjs';

function fixture(t){
 const root=mkdtempSync(path.join(os.tmpdir(),'video-studio-test-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 let now=Date.parse('2026-11-03T03:00:00Z');const children=[];
 const launch=()=>{const child=new EventEmitter();child.pid=process.pid;child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.kill=()=>queueMicrotask(()=>child.emit('close',1,'SIGTERM'));children.push(child);return child;};
 const store=new StudioStore({root,launch,now:()=>now});return {root,store,launch,children,setNow:value=>now=value};
}
test('schedules survive restart, run when due, and serialize production',t=>{
 const f=fixture(t),scheduledAt='2026-11-03T04:00:00Z';
 const a=f.store.create({title:'Cerita mesin uap',scheduledAt}),b=f.store.create({title:'Cerita tentang sungai',scheduledAt});
 assert.throws(()=>f.store.create({title:a.title}),/sudah ada/);
 const restored=new StudioStore({root:f.root,launch:f.launch,now:()=>Date.parse(scheduledAt)});
 assert.equal(restored.jobs.length,2);f.store.tick();assert.equal(f.children.length,0);
 restored.tick();assert.equal(f.children.length,1);assert.equal(restored.get(a.id).state,'running');restored.tick();assert.equal(f.children.length,1);
 f.children[0].emit('close',0);assert.equal(restored.get(a.id).state,'completed');restored.tick();assert.equal(f.children.length,2);assert.equal(restored.get(b.id).state,'running');
 f.children[1].emit('close',0);
});
test('schedule edits, cancellation, validation and retry preserve project identity',t=>{
 const f=fixture(t);
 assert.throws(()=>f.store.create({title:'abc'}),/5–200/);
 assert.throws(()=>f.store.create({title:'Judul video baru',scheduledAt:'not-a-date'}),/tidak valid/);
 assert.throws(()=>f.store.create({title:'Judul video baru',scheduledAt:'2020-01-01'}),/setelah/);
 const job=f.store.create({title:'Judul video baru',scheduledAt:'2026-12-01T02:00:00Z'});
 f.store.update(job.id,{scheduledAt:null});assert.equal(job.state,'queued');f.store.tick();
 assert.throws(()=>f.store.cancel(job.id),/sudah berjalan/);
 f.children[0].stderr.emit('data',Buffer.from('TTS tidak tersedia'));f.children[0].emit('close',1);
 assert.equal(job.state,'failed');assert.match(job.error,/TTS tidak tersedia/);
 f.store.retry(job.id);assert.equal(job.projectId,'judul-video-baru');assert.equal(job.state,'queued');
 f.store.cancel(job.id);assert.equal(job.state,'cancelled');
});
test('external pipeline lock prevents overlapping work and stale jobs can resume',t=>{
 const f=fixture(t),job=f.store.create({title:'Cerita lingkungan hidup'}),lock=path.join(f.root,'.cache/video-pipeline/pipeline.lock');
 writeJson(lock,{pid:process.pid});f.store.tick();assert.equal(f.children.length,0);rmSync(lock);f.store.tick();assert.equal(f.children.length,1);
 f.children[0].emit('close',1);job.state='running';job.pid=99999999;f.store.save();
 const recovered=new StudioStore({root:f.root,launch:f.launch});recovered.tick();assert.equal(recovered.get(job.id).state,'failed');recovered.retry(job.id);assert.equal(recovered.get(job.id).state,'queued');
});
test('pipeline status reports real frames and preserves the current step on failure',t=>{
 const f=fixture(t),cache=path.join(f.root,'.cache/video-pipeline/projects/mesin-uap');
 const report=progressReporter({id:'mesin-uap',cache},'Mesin uap');report(5,'Render',{render:{completed:200,total:1000}});
 assert.deepEqual(f.store.progress('mesin-uap').render,{completed:200,total:1000});
 report(undefined,'Render terhenti',{state:'failed'});assert.equal(f.store.progress('mesin-uap').step,5);assert.equal(f.store.progress('mesin-uap').state,'failed');
});
test('job details retain renderer output alongside an owned generic status after restart',t=>{
 const f=fixture(t),job=f.store.create({title:'Sejarah beras Indonesia'});f.store.tick();
 const cache=path.join(f.root,'.cache/video-pipeline/projects',job.projectId);
 const report=progressReporter({id:job.projectId,cache},job.title);
 report(5,'node failed (1). Data proyek tetap tersimpan.',{state:'failed'});
 f.children[0].stderr.emit('data',Buffer.from('Renderer gagal pada frame 1230: WebGL context lost\n'));
 f.children[0].emit('close',1);
 assert.equal(job.state,'failed');assert.match(job.error,/node failed/);assert.match(job.error,/WebGL context lost/);
 const restored=new StudioStore({root:f.root,launch:f.launch});assert.match(restored.get(job.id).error,/WebGL context lost/);
});
test('unexpected process signals retain captured diagnostics in job details',t=>{
 const f=fixture(t),job=f.store.create({title:'Render terputus mendadak'});f.store.tick();
 f.children[0].stderr.emit('data',Buffer.from('Chrome gagal mengambil frame\n'));
 f.children[0].emit('close',null,'SIGTERM');
 assert.equal(job.state,'failed');assert.match(job.error,/SIGTERM/);assert.match(job.error,/Chrome gagal mengambil frame/);
});
test('render progress cannot displace the failure status in persisted job details',t=>{
 const f=fixture(t),job=f.store.create({title:'Render dengan banyak progres'});f.store.tick();
 const cache=path.join(f.root,'.cache/video-pipeline/projects',job.projectId);
 const report=progressReporter({id:job.projectId,cache},job.title);
 report(5,'node failed (1). Data proyek tetap tersimpan.',{state:'failed'});
 f.children[0].stderr.emit('data',Buffer.from('Browser menerima SIGTERM\n'));
 for(let i=1500;i<=1749;i++)f.children[0].stdout.emit('data',Buffer.from(`Rendered ${i}/2448, time remaining: 1m 41s\n`));
 f.children[0].emit('close',1);
 assert.match(job.error,/node failed \(1\)/);assert.match(job.error,/Browser menerima SIGTERM/);assert.match(job.error,/Rendered 1749\/2448/);assert(job.error.length<250);
});
test('HTTP API persists schedules, rejects foreign origins, and serves seekable final files only',async t=>{
 const f=fixture(t),app=createStudioServer({root:f.root,store:f.store,startScheduler:false});
 app.server.listen(0,'127.0.0.1');await once(app.server,'listening');t.after(()=>app.close());
 const base=`http://127.0.0.1:${app.server.address().port}`;
 const request=(route,method='GET',data,headers={})=>fetch(base+route,{method,headers:{...(data===undefined?{}:{'Content-Type':'application/json'}),...headers},body:data===undefined?undefined:JSON.stringify(data)});
 let response=await request('/api/jobs','POST',{title:'Video terjadwal API',scheduledAt:'2099-01-01T02:00:00Z'});assert.equal(response.status,201);const {job}=await response.json();
 response=await request(`/api/jobs/${job.id}`,'PATCH',{scheduledAt:'2099-01-02T02:00:00Z'});assert.equal(response.status,200);
 response=await request('/api/jobs','POST',{title:'Video tidak diizinkan'},{Origin:'https://example.com'});assert.equal(response.status,403);
 response=await request('/api/jobs','POST',{title:'abc'});assert.equal(response.status,400);
 response=await request(`/api/jobs/${job.id}`,'DELETE',{});assert.equal(response.status,200);assert.equal(f.store.get(job.id).state,'cancelled');
 const folder=path.join(f.root,'hasil','contoh-video');mkdirSync(folder,{recursive:true});writeFileSync(path.join(folder,'video.mp4'),'0123456789');
 response=await request('/media/contoh-video/video.mp4','GET',undefined,{Range:'bytes=2-5'});assert.equal(response.status,206);assert.equal(await response.text(),'2345');assert.equal(response.headers.get('content-range'),'bytes 2-5/10');
 response=await request('/media/contoh-video/video.mp4','HEAD');assert.equal(response.headers.get('content-length'),'10');
 response=await request('/media/contoh-video/video.mp4','GET',undefined,{Range:'bytes=99-100'});assert.equal(response.status,416);
 response=await request('/media/contoh-video/secret.txt');assert.equal(response.status,404);
 symlinkSync(path.join(f.root,'package.json'),path.join(folder,'naskah.json'));response=await request('/media/contoh-video/naskah.json');assert.equal(response.status,404);
 const socket=new WebSocket(base.replace('http:','ws:')+'/api/socket');
 const [message]=await once(socket,'message');assert.equal(JSON.parse(message.toString()).type,'state');socket.close();await once(socket,'close');
});
