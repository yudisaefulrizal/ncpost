import {bundle} from '@remotion/bundler';
import {openBrowser,selectComposition,renderStill} from '@remotion/renderer';
import {shots} from '../src/edit';
import {mkdirSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {paths} from './lib/pipeline.mjs';

async function main(){
const outputDir=process.env.PIPELINE_STAGE??paths().reports;
const boards=path.join(process.env.TMPDIR??'out','boards');
mkdirSync(boards,{recursive:true});
const serveUrl=await bundle({entryPoint:path.resolve('src/index.ts')});
const browser=await openBrowser('chrome',{browserExecutable:'/usr/bin/google-chrome',chromiumOptions:{gl:'swangle'}});
try{
 const composition=await selectComposition({serveUrl,id:'CeritaKucing',puppeteerInstance:browser});
 const capture=async(frame:number,output:string)=>renderStill({composition,serveUrl,output,frame,puppeteerInstance:browser,imageFormat:'png',chromiumOptions:{gl:'swangle'},scale:.5});
 for(const [i,shot] of shots.entries()){
  await capture(shot.from+Math.floor(shot.duration*.5),path.join(boards,`shot-${String(i+1).padStart(2,'0')}.png`));
  console.log(`Shot ${i+1}: ${shot.id}`);
 }
 let i=1;
 for(const id of ['glass','chase','leap','work','ending']){
  const shot=shots.find(s=>s.id===id)!;
  for(const p of [.12,.8])await capture(shot.from+Math.floor(shot.duration*p),path.join(boards,`motion-${String(i++).padStart(2,'0')}.png`));
 }
 writeFileSync(path.join(outputDir,'shot-list.json'),JSON.stringify(shots,null,2));
}finally{await browser.close({silent:true});}
execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-framerate','1','-i',path.join(boards,'shot-%02d.png'),'-vf','scale=480:270,tile=4x5','-frames:v','1','-update','1',path.join(outputDir,'storyboard.jpg')]);
execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-framerate','1','-i',path.join(boards,'motion-%02d.png'),'-vf','scale=480:270,tile=2x5','-frames:v','1','-update','1',path.join(outputDir,'motion-review.jpg')]);
}
main().catch(e=>{console.error(e);process.exit(1);});
