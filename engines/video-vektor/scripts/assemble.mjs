import path from 'node:path';
import {ROOT,command} from './lib/pipeline.mjs';

export async function assemble({timeline,inputVideo,output,runtime,signal,title='Cerita Kecil — Manusia & Kucing'}){
 if(!inputVideo)throw new Error('Gambar video utuh belum tersedia. Jalankan render terlebih dahulu.');
 const args=['-hide_banner','-loglevel','error','-y','-i',inputVideo];
 const fps=timeline.fps,duration=timeline.durationInFrames/fps;
 const publicDir=process.env.PIPELINE_PUBLIC_DIR??path.join(ROOT,'public');
 for(const s of timeline.scenes)args.push('-i',path.join(publicDir,`audio/scene-${s.index+1}.mp3`));
 args.push('-i',path.join(publicDir,'audio/score.wav'));
 const filters=timeline.scenes.map((s,i)=>`[${i+1}:a]atrim=start=${s.audioTrimStart/fps}:end=${s.audioTrimEnd/fps},asetpts=PTS-STARTPTS,aresample=48000,adelay=${Math.round((s.from+s.audioLead)/fps*48000)}S:all=1[voice${i}]`);
 filters.push(`[${timeline.scenes.length+1}:a]volume=0.34,afade=t=in:st=0:d=1,afade=t=out:st=${duration-35/fps}:d=${35/fps}[music]`);
 filters.push(`${timeline.scenes.map((_,i)=>`[voice${i}]`).join('')}[music]amix=inputs=${timeline.scenes.length+1}:normalize=0:duration=longest:dropout_transition=0,atrim=duration=${duration}[mixed]`);
 args.push('-filter_complex',filters.join(';'),'-map','0:v:0','-map','[mixed]','-c:v','copy','-c:a','aac','-b:a','192k','-ar','48000','-ac','2','-t',String(duration),'-movflags','+faststart','-metadata',`title=${title}`,'-metadata:s:a:0','language=ind',output);
 await command('ffmpeg',args,{signal,env:{TMPDIR:runtime}});
}
