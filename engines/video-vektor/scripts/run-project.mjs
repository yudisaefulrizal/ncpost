import path from 'node:path';
import {appendFileSync,cpSync,existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {ROOT,FINAL_FILES,acquireLock,cleanup,command,readJson,writeJson,runtimeDirectory,removeGenerated} from './lib/pipeline.mjs';
import {projectPaths,projectSlug,projectEnvironment,ensureProject} from './lib/project.mjs';
import {runCodexSession} from './lib/codex-session.mjs';
import {progressReporter,updateProgress} from './lib/progress.mjs';

const read=file=>{try{return readJson(file);}catch{return null;}};
const quote=value=>`'${String(value).replaceAll("'","'\\''")}'`;
export async function runProject({title,id,regenerate=false,replan=false,force=false,assembleOnly=false,timeoutSeconds=0}){
 const p=projectPaths(id??projectSlug(title));Object.assign(process.env,projectEnvironment(p));
 const release=acquireLock(p),controller=new AbortController();let runtime,timer,report,stopState=null;
 const stop=(state,message)=>{if(controller.signal.aborted)return;stopState=state;controller.abort(new Error(message));};
 const interrupted=()=>stop('stopped','Pekerjaan dihentikan.');process.on('SIGINT',interrupted);process.on('SIGTERM',interrupted);
 try{
  ensureProject(p);const previous=read(p.metadata);title=title??previous?.title??p.id.replaceAll('-',' ');
  if(previous?.title&&previous.title.toLowerCase()!==title.toLowerCase())throw new Error('Folder ini sudah digunakan judul lain. Pilih ID proyek lain.');
  report=progressReporter(p,title);report(1,'Folder proyek siap.');
  const jobId=process.env.PIPELINE_JOB_ID??null,control=read(p.control),fromQueue=jobId&&control?.jobId===jobId;
  const startedAt=fromQueue?control.startedAt:new Date().toISOString();
  if(!fromQueue)writeJson(p.control,{jobId,pid:process.pid,startedAt,timeoutSeconds,stopRequested:false});
  const checkControl=()=>{
   const current=read(p.control);if(!current)return;
   if(current.stopRequested)stop('stopped','Dihentikan oleh pengguna.');
   if(current.timeoutSeconds>0&&Date.now()-Date.parse(current.startedAt)>=current.timeoutSeconds*1000)stop('timed_out','Batas waktu yang Anda atur sudah tercapai.');
  };
  timer=setInterval(checkControl,1000);checkControl();controller.signal.throwIfAborted();
  runtime=runtimeDirectory(p);const stage=path.join(runtime,'stage');mkdirSync(stage);
  const session=read(p.session)??{};
  writeJson(p.session,{...session,runtime,stage,force,regenerate,replan,pid:process.pid});
  writeJson(p.metadata,{...previous,title,id:p.id});
  // Use the approved cat film as a code reference, isolated per project.
  if(!existsSync(path.join(p.source,'index.ts'))){
   cpSync(path.join(ROOT,'src'),p.source,{recursive:true,filter:file=>!file.split(path.sep).includes('generic')});
   writeJson(path.join(p.cache,'source-origin.json'),{reference:'src/Film.tsx + src/Story.tsx',mode:'authored-remotion'});
  }
  const helper=`${quote(process.execPath)} ${quote(path.join(ROOT,'scripts/session-step.mjs'))} --project ${p.id}`;
  const prompt=`Kerjakan produksi video untuk judul ${JSON.stringify(title)} dalam sesi ini sampai hasil final tersedia.
Gunakan mekanisme video kucing yang sudah berhasil: tulis kode adegan Remotion + Three.js secara langsung, dengan penyutradaraan khusus cerita. Acuan kode ada di src/Story.tsx, src/edit.ts, src/Film.tsx, src/components. Salinannya untuk proyek ini ada di ${p.source}.
Jangan membuat pipeline baru, kontrak JSON animasi, DSL gerakan, atau sesi Codex lain. Jangan memasang dependensi, menjalankan pengujian, preview, storyboard, render sampel, atau git commit. Pakai alat untuk membaca/menulis kode dan langkah produksi di bawah. Jangan mengubah sumber di src/, skill/, studio/, atau scripts/.
1. Naskah: baca skill/pembuat-naskah.md dan terapkan pada judul. Simpan hasil array JSON langsung ke ${p.script}. File skill harus tetap utuh. ${regenerate?'Buat ulang naskah sesuai permintaan.':'Jika naskah sudah ada, gunakan kembali.'}
2. Jalankan ${helper} --stage audio. Langkah ini menyiapkan narasi, timing, subtitle, font, dan timeline.json lokal. Baca ${p.timeline} untuk menyelaraskan cerita.
3. Buat atau perbaiki kode animasi di ${p.source}. Tulis ilustrasi dan gerakan langsung dengan React/SVG/Three.js dan fungsi animasi Remotion. Pertahankan gaya film layar penuh yang mengalir seperti video kucing: aksi sebab-akibat, perpindahan kamera, karakter/objek yang bergerak, sambungan antaradegan; hindari halaman web, kartu slide, jeda kosong, atau poster yang sekadar di-zoom. Sesuaikan ilustrasi dengan judul, jangan menyisakan cerita kucing pada tema lain. Tidak ada batas buatan jumlah objek atau shot.
Aturan teks dalam adegan (di luar subtitle): teks hanya boleh muncul jika informasi memang tidak dapat disampaikan dengan jelas melalui ilustrasi atau animasi, misalnya rumus, angka, dan langkah perhitungan yang perlu dibaca. Jika informasi dapat diilustrasikan, buat ilustrasinya tanpa menambahkan judul, label, slogan, atau teks penjelas. Tidak adanya ilustrasi karena belum dibuat bukan alasan untuk menggantinya dengan teks. key_text pada naskah tidak wajib ditampilkan dan tetap tunduk pada aturan ini. Terapkan aturan ini juga pada teks yang sudah ada saat memperbaiki atau melanjutkan kode proyek. Aturan ini tidak mengubah subtitle narasi.
Film.tsx menyediakan VisualFilm dan Film; Root.tsx harus mendaftarkan ProjectVisual dan ProjectFilm pada 1920x1080 dengan fps/durasi dari timeline.json. node_modules dan remotion.config.ts memakai milik root proyek. ${replan?'Perbarui penyutradaraan dan kode animasinya.':'Jika kode proyek sudah dibuat untuk judul ini, lanjutkan dari kode tersebut dan sesuaikan bila naskah atau timing berubah.'}
4. Setelah kode siap, akhiri respons dengan ringkasan singkat. Proses utama aplikasi akan menjalankan render produksi dan menyimpan video serta audio final. Jangan menjalankan helper --stage render atau --stage finish dari alat sesi Codex; render panjang harus dijalankan proses utama, bukan alat model.
Stop dan timeout dikendalikan pengguna melalui aplikasi. Jika langkah dihentikan, jangan menjalankan ulang atau mengganti timeout/control.json. Dilarang mengedit session.json/control.json/status.json untuk menyatakan langkah selesai; helper yang memperbarui status. Tulis hasil kerja ke berkas proyek, jawaban akhir cukup ringkasan singkat.`;
  const activity=(kind,message)=>{
   const current=read(path.join(p.cache,'status.json'))??{};
   updateProgress(p,{logs:[...(current.logs??[]),{at:new Date().toISOString(),kind,message}].slice(-30)});
  };
  const productionLog=path.join(p.cache,'production.log');
  writeFileSync(productionLog,`Produksi ${p.id} dimulai ${startedAt}\n`);
  const productionStep=async stage=>{
   appendFileSync(productionLog,`\nTahap ${stage}\n`);
   try{await command(process.execPath,[path.join(ROOT,'scripts/session-step.mjs'),'--project',p.id,'--stage',stage],{env:projectEnvironment(p),signal:controller.signal,log:{write:chunk=>appendFileSync(productionLog,chunk)}});}
   catch(error){
    const failure=read(path.join(p.cache,'failure.json'));
    const detail=failure?.parentPid===process.pid&&failure.stage===stage?failure.message:error.message;
    const message=`Tahap ${stage} gagal. Log lengkap: ${productionLog}\n${detail}`;
    appendFileSync(productionLog,`\n${message}\n`);throw new Error(message,{cause:error});
   }
  };
  if(!assembleOnly){
   report(2,'Satu sesi Codex sedang menyiapkan naskah dan kode video.');
   await runCodexSession({p,prompt,signal:controller.signal,env:projectEnvironment(p),onActivity:activity});
   controller.signal.throwIfAborted();
   await productionStep('render');
  }
  controller.signal.throwIfAborted();
  await productionStep('finish');
  controller.signal.throwIfAborted();
  const state=read(path.join(p.cache,'status.json'));
  if(state?.state!=='completed'||!FINAL_FILES.every(name=>existsSync(path.join(p.out,name))))throw new Error('Produksi berakhir sebelum hasil final tersimpan. Kode proyek dipertahankan untuk dilanjutkan.');
  cleanup({p,completed:true});
  writeJson(path.join(ROOT,'.cache/video-pipeline/last-project.json'),{id:p.id,title});
 }catch(error){report?.(undefined,error.message,{state:stopState??'failed'});throw error;}
 finally{
  clearInterval(timer);process.removeListener('SIGINT',interrupted);process.removeListener('SIGTERM',interrupted);
  try{if(runtime)removeGenerated(runtime,p);}finally{release();}
 }
}
