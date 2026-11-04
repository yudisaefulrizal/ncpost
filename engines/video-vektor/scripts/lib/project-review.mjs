import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import path from 'node:path';
import {verifyOutput} from './media.mjs';
import {command} from './pipeline.mjs';

export function validateTimeline(script,timeline){
 assert.equal(script.length,timeline.scenes.length);
 const normalize=text=>text.toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
 let from=0;
 for(const [i,scene] of timeline.scenes.entries()){
  assert.equal(scene.from,from);assert.equal(scene.audio_text,script[i].audio_text);
  assert.equal(normalize(scene.captions.flatMap(c=>c.words).map(w=>w.text).join(' ')),normalize(scene.audio_text),'Caption tidak mencakup seluruh narasi.');
  assert(scene.audioTrimEnd>scene.audioTrimStart);assert(scene.audioLead+scene.audioTrimEnd-scene.audioTrimStart<=scene.durationInFrames);
  from+=scene.durationInFrames;
 }
 assert.equal(from,timeline.durationInFrames);
}
export async function reviewProject({video,props,stage,runtime,signal}){
 const {timeline,plan}=props;verifyOutput(video,timeline);
 const run=(args,capture=false)=>command('ffmpeg',args,{signal,capture,env:runtime?{TMPDIR:runtime}:{}});
 async function contact(frames,columns,name){
  const selected=[...new Set(frames)].sort((a,b)=>a-b);
  await run(['-hide_banner','-loglevel','error','-y','-i',video,'-vf',`select='${selected.map(n=>`eq(n,${n})`).join('+')}',scale=480:270,tile=${columns}x${Math.ceil(selected.length/columns)}`,'-frames:v','1','-update','1',path.join(stage,name)]);
 }
 await contact(plan.shots.map(s=>s.from+Math.floor(s.duration/2)),4,'storyboard.jpg');
 await contact(plan.shots.slice(0,5).flatMap(s=>[s.from+Math.floor(s.duration*.12),s.from+Math.floor(s.duration*.8)]),2,'motion-review.jpg');
 const poster=plan.shots[0].from+Math.floor(plan.shots[0].duration/2);
 await run(['-hide_banner','-loglevel','error','-y','-i',video,'-vf',`select='eq(n,${poster})'`,'-frames:v','1','-update','1',path.join(stage,'poster.png')]);
 const analysis=await run(['-hide_banner','-xerror','-i',video,'-vf','freezedetect=n=-65dB:d=1.5','-an','-f','null','-'],true);
 const freezes=analysis.match(/freeze_start: [\d.]+/g)??[];
 writeFileSync(path.join(stage,'quality-report.json'),JSON.stringify({title:props.title,shots:plan.shots.length,frames:timeline.durationInFrames,decodePassed:true,freezesLongerThan1_5Seconds:freezes},null,2));
 writeFileSync(path.join(stage,'shot-list.json'),JSON.stringify(plan.shots.map(s=>({id:s.id,from:s.from,duration:s.duration,action:s.action})),null,2));
 if(freezes.length){
  const error=new Error('Ada bagian diam lebih dari 1,5 detik; hasil final sebelumnya dipertahankan.');
  error.code='MOTION_FREEZE';error.feedback={freezes,request:'Buat ulang rencana visual; pastikan gerak objek dan kamera tetap berkembang pada rentang ini, bukan hanya zoom atau fade.'};throw error;
 }
}
