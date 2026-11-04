import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {ROOT,command} from './pipeline.mjs';

export function probe(file){return JSON.parse(execFileSync('ffprobe',['-v','error','-show_format','-show_streams','-of','json',file],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));}
export function verifyOutput(file,timeline,{width=1920,height=1080}={}){
 const info=probe(file),video=info.streams.find(s=>s.codec_type==='video'),audio=info.streams.find(s=>s.codec_type==='audio');
 assert(video&&audio,'The film must contain video and audio');
 assert.equal(video.codec_name,'h264');assert.equal(video.width,width);assert.equal(video.height,height);
 assert.equal(video.r_frame_rate,`${timeline.fps}/1`);assert.equal(Number(video.nb_frames),timeline.durationInFrames);
 assert(['yuv420p','yuvj420p'].includes(video.pix_fmt));assert.equal(audio.codec_name,'aac');assert.equal(audio.channels,2);
 assert(Math.abs(Number(info.format.duration)-timeline.durationInFrames/timeline.fps)<.15);
 return {frames:Number(video.nb_frames),duration:Number(info.format.duration),width:video.width,height:video.height};
}
export function verifyPicture(file,timeline){
 const info=probe(file),video=info.streams.find(s=>s.codec_type==='video');
 assert(video);assert.equal(video.codec_name,'h264');assert.equal(video.width,1920);assert.equal(video.height,1080);assert.equal(video.r_frame_rate,`${timeline.fps}/1`);
 assert.equal(Number(video.nb_frames),timeline.durationInFrames);
}
export async function renderPicture({entry,composition,output,timeline,publicDir,env,signal,onProgress}){
 let buffer='',lastUpdate=0;
 const log=onProgress?{write(chunk){
  const lines=(buffer+chunk.toString()).split(/[\r\n]/);buffer=lines.pop();
  for(const line of lines){
   const match=/Rendered (\d+)\/(\d+)/.exec(line);
   if(match&&Date.now()-lastUpdate>=1000){lastUpdate=Date.now();onProgress(Number(match[1]));}
  }
 }}:undefined;
 await command(process.execPath,[path.join(ROOT,'node_modules/@remotion/cli/remotion-cli.js'),'render',entry,composition,output,...(publicDir?[`--public-dir=${publicDir}`]:[]),`--gl=${process.env.REMOTION_GL??'swangle'}`,'--muted',`--log=${onProgress?'info':'error'}`],{env,signal,log});
 verifyPicture(output,timeline);onProgress?.(timeline.durationInFrames);
}
