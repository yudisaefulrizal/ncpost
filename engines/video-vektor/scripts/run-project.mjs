import path from 'node:path';
import {appendFileSync,cpSync,existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {ROOT,FINAL_FILES,acquireLock,cleanup,command,readJson,writeJson,runtimeDirectory,removeGenerated} from './lib/pipeline.mjs';
import {projectPaths,projectSlug,projectEnvironment,ensureProject} from './lib/project.mjs';
import {runAgentSession,resolveAgent,agentLabel} from './lib/agent-session.mjs';
import {DEFAULT_STYLE,loadStyle,resolveStyle} from './lib/styles.mjs';
import {progressReporter,updateProgress} from './lib/progress.mjs';

const read=file=>{try{return readJson(file);}catch{return null;}};
const quote=value=>`'${String(value).replaceAll("'","'\\''")}'`;
export async function runProject({title,id,regenerate=false,replan=false,force=false,assembleOnly=false,timeoutSeconds=0,agent,style}){
 agent=resolveAgent(agent);const label=agentLabel(agent);
 const p=projectPaths(id??projectSlug(title));Object.assign(process.env,projectEnvironment(p));
 const release=acquireLock(p),controller=new AbortController();let runtime,timer,report,stopState=null;
 const stop=(state,message)=>{if(controller.signal.aborted)return;stopState=state;controller.abort(new Error(message));};
 const interrupted=()=>stop('stopped','Pekerjaan dihentikan.');process.on('SIGINT',interrupted);process.on('SIGTERM',interrupted);
 try{
  ensureProject(p);const previous=read(p.metadata);title=title??previous?.title??p.id.replaceAll('-',' ');
  if(previous?.title&&previous.title.toLowerCase()!==title.toLowerCase())throw new Error('Folder ini sudah digunakan judul lain. Pilih ID proyek lain.');
  // A project keeps the style its code was written in; older projects were all written in the cat style.
  const hasSource=existsSync(path.join(p.source,'index.ts'));
  const look=loadStyle(hasSource?(previous?.style??DEFAULT_STYLE):resolveStyle(style));
  report=progressReporter(p,title);report(1,'Folder proyek siap.',{agent,style:look.id,styleName:look.name});
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
  writeJson(p.session,{...session,runtime,stage,force,regenerate,replan,agent,pid:process.pid});
  writeJson(p.metadata,{...previous,title,id:p.id,style:look.id});
  // Start from the chosen style's example code, isolated per project.
  if(!hasSource){
   cpSync(look.example,p.source,{recursive:true});
   writeJson(path.join(p.cache,'source-origin.json'),{style:look.id,reference:look.exampleRelative,mode:'authored-remotion'});
  }
  const helper=`${quote(process.execPath)} ${quote(path.join(ROOT,'scripts/session-step.mjs'))} --project ${p.id}`;
  const prompt=`Kerjakan produksi video untuk judul ${JSON.stringify(title)} dalam sesi ini sampai hasil final tersedia.
Gaya visual proyek ini: ${look.id} (styles/${look.id}). Tulis kode adegan Remotion + Three.js secara langsung, dengan penyutradaraan khusus cerita, mengikuti mekanisme contoh gaya tersebut. Contoh kodenya ada di ${look.exampleRelative}; salinannya untuk proyek ini ada di ${p.source}. Panduan gaya:\n${look.guide}\n
Aturan animasi: setiap pemanggilan interpolate harus lewat helper (mis. ease/lin) yang menjaga rentang tetap naik, yaitu [a,Math.max(b,a+1)]; jangan pernah memberi akhir rentang berupa selisih seperti (x)-2 tanpa penjaga itu, karena jarak antar waktu bisa menyusut setelah dikonversi ke frame. Jangan membuat pipeline baru, kontrak JSON animasi, DSL gerakan, atau sesi agen AI lain. Jangan memasang dependensi, menjalankan pengujian, preview, storyboard, render sampel, atau git commit. Pakai alat untuk membaca/menulis kode dan langkah produksi di bawah. Jangan mengubah sumber di src/, styles/, skill/, studio/, atau scripts/.
1. Naskah: baca skill/pembuat-naskah.md dan terapkan pada judul. Simpan hasil array JSON langsung ke ${p.script}. File skill harus tetap utuh. ${regenerate?'Buat ulang naskah sesuai permintaan.':'Jika naskah sudah ada, gunakan kembali.'}
2. Jalankan ${helper} --stage audio. Langkah ini menyiapkan narasi, timing kata, transkrip audio SRT, font, dan timeline.json lokal. Transkrip dan timing adalah data internal untuk menyelaraskan animasi dengan audio; pembuatannya tetap dipertahankan. Baca ${p.timeline} untuk menyelaraskan cerita.
3. Buat atau perbaiki kode animasi di ${p.source}. Tulis ilustrasi dan gerakan langsung dengan React/SVG/Three.js dan fungsi animasi Remotion, konsisten dengan panduan dan contoh gaya ${look.id}. Sesuaikan isi ilustrasi dengan judul; jangan menyisakan isi cerita contoh pada tema lain. Tidak ada batas buatan jumlah objek atau shot.
Kebijakan penyutradaraan untuk video baru: audio menjelaskan konteks, alasan, dan hubungan sebab-akibat; animasi memperlihatkan objek, proses, perubahan, dan perbandingan. Susun kesinambungan adegan berdasarkan perkembangan gagasan, bukan kewajiban mengganti adegan atau menampilkan teks pada setiap kalimat. Jangan menampilkan transkrip narasi sebagai subtitle, caption, teks berjalan, atau sorotan kata per kata; jangan menambahkan fitur pilihan subtitle. Tampilkan teks visual secara selektif hanya ketika membantu pemahaman: angka, rumus, istilah penting, label objek, atau kesimpulan singkat. Integrasikan teks dengan objek dan aksi yang dibahas, munculkan pada waktu yang relevan, beri waktu baca yang cukup, lalu hilangkan ketika tidak diperlukan. Hindari penyalinan kalimat narasi, penumpukan teks, dan penggantian ilustrasi dengan paragraf. Setiap elemen naskah hanya berisi audio_text dan motion_description. motion_description adalah bahan penyutradaraan yang merinci material visual, atribut, hubungan, tahapan, perubahan keadaan, dan transisi; teks, angka, atau label yang perlu tampil sudah tercantum di dalamnya, dan instruksi jeda di dalamnya bukan teks untuk ditampilkan. motion_description tidak mewajibkan pergantian adegan pada setiap kalimat. Naskah proyek lama yang masih memiliki key_text tetap dipakai apa adanya; perlakukan key_text sebagai bahan penyutradaraan, bukan teks wajib tampil. Pertahankan isi naskah serta data transkrip dan timing. Kebijakan baru ini tidak meminta perubahan pada proyek yang sudah ada; saat melanjutkan proyek lama, pertahankan kebijakan tampilannya kecuali pengguna meminta perubahan.
Film.tsx menyediakan VisualFilm dan Film; Root.tsx harus mendaftarkan ProjectVisual dan ProjectFilm pada 1920x1080 dengan fps/durasi dari timeline.json. node_modules dan remotion.config.ts memakai milik root proyek. ${replan?'Perbarui penyutradaraan dan kode animasinya.':'Jika kode proyek sudah dibuat untuk judul ini, lanjutkan dari kode tersebut dan sesuaikan bila naskah atau timing berubah.'}
4. Setelah kode siap, akhiri respons dengan ringkasan singkat. Proses utama aplikasi akan menjalankan render produksi dan menyimpan video serta audio final. Jangan menjalankan helper --stage render atau --stage finish dari alat sesi ini; render panjang harus dijalankan proses utama, bukan alat model.
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
   report(2,`Satu sesi ${label} sedang menyiapkan naskah dan kode video.`);
   await runAgentSession({agent,p,prompt,signal:controller.signal,env:projectEnvironment(p),onActivity:activity});
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
