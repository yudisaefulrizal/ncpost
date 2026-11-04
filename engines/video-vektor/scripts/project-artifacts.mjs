import path from 'node:path';
import {existsSync,mkdirSync,readdirSync,renameSync} from 'node:fs';
import {acquireLock,command,readJson,removeGenerated,runtimeDirectory,tempEnvironment} from './lib/pipeline.mjs';
import {projectEnvironment,projectPaths} from './lib/project.mjs';
import {verifyOutput} from './lib/media.mjs';
import {reviewProject} from './lib/project-review.mjs';

const mode=process.argv[2],id=process.argv[process.argv.indexOf('--project')+1];
const p=projectPaths(id);Object.assign(process.env,projectEnvironment(p));
const release=acquireLock(p),controller=new AbortController(),stop=()=>controller.abort();
let runtime;
process.on('SIGINT',stop);process.on('SIGTERM',stop);
try{
 const authored=existsSync(path.join(p.source,'index.ts'));
 if(!authored&&!existsSync(p.props))throw new Error('Proyek belum mempunyai rencana animasi. Jalankan npm run video atau npm run render -- --project terlebih dahulu.');
 const props=authored?{timeline:readJson(p.timeline)}:readJson(p.props);runtime=runtimeDirectory(p);const stage=path.join(runtime,'stage');mkdirSync(stage);mkdirSync(p.reports,{recursive:true});
 const env={...projectEnvironment(p),...tempEnvironment(runtime,stage)},signal=controller.signal;
 if(mode==='review'||mode==='storyboard'){
  if(authored)throw new Error('Proyek kode langsung: gunakan npm run verify -- --project <id> atau buka video final untuk pemeriksaan visual.');
  await reviewProject({video:path.join(p.out,'video.mp4'),props,stage,runtime,signal});
 }
 else if(mode==='still'||mode==='preview'){
  const output=path.join(stage,mode==='still'?'poster.png':'preview.mp4');
  const entry=authored?path.join(p.source,'index.ts'):'src/generic/index.tsx';
  const args=mode==='still'?['still',entry,authored?'ProjectVisual':'NarrativeVisual',output,`--frame=${Math.min(157,props.timeline.durationInFrames-1)}`]:['render',entry,authored?'ProjectFilm':'NarrativeFilm',output,'--scale=.5'];
  await command(process.execPath,['node_modules/@remotion/cli/remotion-cli.js',...args,...(authored?[]:[`--props=${p.props}`]),`--public-dir=${p.publicDir}`,'--log=error'],{env,signal});
  if(mode==='preview')verifyOutput(output,props.timeline,{width:960,height:540});
 }else throw new Error('Tahap audio/musik proyek baru dikelola oleh pipeline lengkap. Gunakan npm run render -- --project <id>.');
 for(const name of readdirSync(stage))renameSync(path.join(stage,name),path.join(p.reports,name));
 console.log(`${mode}: ${p.reports}`);
}catch(error){console.error(error.message);process.exitCode=1;}
finally{try{if(runtime)removeGenerated(runtime,p);}finally{release();process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);}}
