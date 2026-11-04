import {execFileSync,spawnSync} from 'node:child_process';
import {writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {shots} from '../src/edit';
import timeline from '../src/timeline.json';
import {verifyOutput} from './lib/media.mjs';
import {paths} from './lib/pipeline.mjs';

const input=process.env.VIDEO_INPUT??path.join(paths().out,'video.mp4');
verifyOutput(input,timeline);
const outputDir=process.env.VIDEO_OUTPUT_DIR??paths().reports;
mkdirSync(outputDir,{recursive:true});
const output=(name:string)=>path.join(outputDir,name);
function contact(frames:number[],grid:string,output:string){
 const select=frames.map(n=>`eq(n,${n})`).join('+');
 execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',input,'-vf',`select='${select}',scale=480:270,tile=${grid}`,'-frames:v','1','-update','1',output],{stdio:'inherit'});
}
contact(shots.map(s=>s.from+Math.floor(s.duration*.5)),'4x5',output('storyboard.jpg'));
const motion:number[]=[];
for(const [id,positions] of [['glass',[.12,.8]],['chase',[.12,.4]],['leap',[.05,.5]],['work',[.12,.8]],['ending',[.12,.8]]] as const){
 const shot=shots.find(s=>s.id===id)!;
 motion.push(...positions.map(p=>shot.from+Math.floor(shot.duration*p)));
}
contact(motion,'2x5',output('motion-review.jpg'));
execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',input,'-vf',"select='eq(n,157)'",'-frames:v','1','-update','1',output('poster.png')],{stdio:'inherit'});
execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-xerror','-i',input,'-f','null','-'],{stdio:'inherit'});
const analysis=spawnSync('ffmpeg',['-hide_banner','-xerror','-i',input,'-vf','freezedetect=n=-65dB:d=1.5','-an','-f','null','-'],{encoding:'utf8'});
assert.equal(analysis.status,0,'Motion scan must decode the entire film');
const freezes=analysis.stderr.match(/freeze_start: [\d.]+/g)??[];
const gaps=timeline.scenes.slice(1).map((next,i)=>{
 const prev=timeline.scenes[i];
 return (next.from+next.audioLead-prev.from-prev.audioLead)/30+next.captions[0].words[0].start-prev.captions.at(-1)!.words.at(-1)!.end;
});
writeFileSync(output('quality-report.json'),JSON.stringify({shots:shots.length,frames:timeline.durationInFrames,spokenGapsSeconds:gaps,freezesLongerThan1_5Seconds:freezes,decodePassed:true},null,2));
assert.equal(freezes.length,0,'Review any frozen passage longer than 1.5 seconds');
writeFileSync(output('shot-list.json'),JSON.stringify(shots,null,2));
console.log(`Reviewed ${shots.length} shots across ${timeline.durationInFrames} frames; decode passed. Contact sheets exported.`);
