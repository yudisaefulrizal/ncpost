import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {assemble} from '../assemble.mjs';
import {exportAudio} from '../export-audio.mjs';
import {probe} from '../lib/media.mjs';

const ffmpeg=args=>execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y',...args]);
const meanVolume=(file,start)=>{
 const {stderr}=spawnSync('ffmpeg',['-hide_banner','-ss',String(start),'-t','1','-i',file,'-af','volumedetect','-f','null','-'],{encoding:'utf8'});
 return Number(/mean_volume:\s*(-?[\d.]+) dB/.exec(stderr)?.[1]??-Infinity);
};

test('final film audio and narasi.wav keep the full length when the first scene starts after a lead-in',async t=>{
 const root=mkdtempSync(path.join(os.tmpdir(),'video-export-audio-test-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const publicDir=path.join(root,'public'),stage=path.join(root,'stage'),runtime=path.join(root,'runtime');
 for(const dir of [path.join(publicDir,'audio'),stage,runtime])mkdirSync(dir,{recursive:true});
 // Same shape as prepare_audio.py output: a 12-frame lead before the first narration.
 const timeline={fps:30,durationInFrames:240,scenes:[
  {index:0,from:0,durationInFrames:120,audioLead:12,audioTrimStart:2,audioTrimEnd:92},
  {index:1,from:120,durationInFrames:120,audioLead:0,audioTrimStart:2,audioTrimEnd:62},
 ]};
 for(const [i,seconds] of [[1,3.2],[2,2.2]])ffmpeg(['-f','lavfi','-i',`sine=frequency=${300+i*120}:sample_rate=24000:duration=${seconds}`,'-c:a','libmp3lame',path.join(publicDir,`audio/scene-${i}.mp3`)]);
 ffmpeg(['-f','lavfi','-i','sine=frequency=220:sample_rate=44100:duration=8.5','-ac','2',path.join(publicDir,'audio/score.wav')]);
 const picture=path.join(root,'visual.mp4'),video=path.join(stage,'video.mp4');
 ffmpeg(['-f','lavfi','-i','color=c=black:s=64x36:r=30:d=8','-c:v','libx264','-pix_fmt','yuv420p',picture]);
 const previous=process.env.PIPELINE_PUBLIC_DIR;process.env.PIPELINE_PUBLIC_DIR=publicDir;
 t.after(()=>{if(previous===undefined)delete process.env.PIPELINE_PUBLIC_DIR;else process.env.PIPELINE_PUBLIC_DIR=previous;});

 await assemble({timeline,inputVideo:picture,output:video,runtime,title:'Uji'});
 const audio=probe(video).streams.find(s=>s.codec_type==='audio');
 assert(Math.abs(Number(audio.duration)-8)<.1,`film audio is ${audio.duration}s, expected 8s`);
 assert(Math.abs(Number(audio.start_time))<.1,`film audio starts at ${audio.start_time}s`);

 await exportAudio({timeline,video,stage,runtime});
 for(const name of ['narasi.wav','audio-final.wav']){
  const file=path.join(stage,name),duration=Number(probe(file).format.duration);
  assert(Math.abs(duration-8)<.03,`${name} is ${duration}s, expected 8s`);
  // Narration must be audible after the lead-in, in both scenes, not only silence.
  for(const at of [1,5])assert(meanVolume(file,at)>-40,`${name} is silent at ${at}s`);
 }
});
