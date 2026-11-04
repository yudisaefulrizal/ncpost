import path from 'node:path';
import assert from 'node:assert/strict';
import {ROOT,command} from './lib/pipeline.mjs';
import {probe} from './lib/media.mjs';

export async function exportAudio({timeline,video,stage,runtime,signal}){
 const fps=timeline.fps,duration=timeline.durationInFrames/fps;
 const publicDir=process.env.PIPELINE_PUBLIC_DIR??path.join(ROOT,'public');
 const common=['-hide_banner','-loglevel','error','-y'];
 const wave=['-c:a','pcm_s16le','-ar','48000','-ac','2','-t',String(duration)];
 const run=args=>command('ffmpeg',[...common,...args],{env:{TMPDIR:runtime},signal});
 // The final audio is decoded directly from the approved video.
 await run(['-i',video,'-map','0:a:0',...wave,path.join(stage,'audio-final.wav')]);
 const music=`volume=0.34,afade=t=in:st=0:d=1,afade=t=out:st=${duration-35/fps}:d=${35/fps}`;
 await run(['-i',path.join(publicDir,'audio/score.wav'),'-af',music,...wave,path.join(stage,'musik.wav')]);
 const inputs=[],filters=[];
 for(const [i,s] of timeline.scenes.entries()){
  inputs.push('-i',path.join(publicDir,`audio/scene-${s.index+1}.mp3`));
  filters.push(`[${i}:a]atrim=start=${s.audioTrimStart/fps}:end=${s.audioTrimEnd/fps},asetpts=PTS-STARTPTS,aresample=48000,adelay=${Math.round((s.from+s.audioLead)/fps*48000)}S:all=1[v${i}]`);
 }
 filters.push(`${timeline.scenes.map((_,i)=>`[v${i}]`).join('')}amix=inputs=${timeline.scenes.length}:normalize=0:duration=longest,apad,atrim=duration=${duration}[voice]`);
 await run([...inputs,'-filter_complex',filters.join(';'),'-map','[voice]',...wave,path.join(stage,'narasi.wav')]);
 for(const name of ['narasi.wav','musik.wav','audio-final.wav']){
  const info=probe(path.join(stage,name)),audio=info.streams.find(s=>s.codec_type==='audio');
  assert.equal(audio?.codec_name,'pcm_s16le');assert.equal(audio.channels,2);assert.equal(Number(audio.sample_rate),48000);
  assert(Math.abs(Number(info.format.duration)-duration)<.03,`Incorrect duration: ${name}`);
 }
}
