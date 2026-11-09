import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
const source=JSON.parse(readFileSync('naskah.json','utf8'));
const timeline=JSON.parse(readFileSync('styles/vektor-kucing/contoh/timeline.json','utf8'));
assert.equal(source.length,timeline.scenes.length,'Every paragraph must have a scene');
let frame=0;
for(const [i,scene] of timeline.scenes.entries()){
 assert.equal(scene.from,frame,'No gap or overlap on the timeline');
 assert.equal(scene.audio_text,source[i].audio_text,'Narration must preserve the script');
 assert.equal(scene.key_text,source[i].key_text,'Key text must preserve the script');
 assert(scene.audioLead/30+scene.audioDuration<scene.durationInFrames/30,'Speech must finish before the cut');
 assert(existsSync(`public/audio/scene-${i+1}.mp3`),'Narration asset must exist');
 const words=scene.captions.flatMap(c=>c.words);
 const normalize=s=>s.toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
 assert.equal(normalize(words.map(w=>w.text).join(' ')),normalize(source[i].audio_text),'Captions must cover all spoken words');
 for(const c of scene.captions){assert(c.end>c.start);assert(c.end<=scene.audioDuration+.01);}
 frame+=scene.durationInFrames;
}
assert.equal(frame,timeline.durationInFrames);
for(let i=1;i<timeline.scenes.length;i++){
 const prev=timeline.scenes[i-1], next=timeline.scenes[i];
 const last=prev.captions.at(-1).words.at(-1);
 const first=next.captions[0].words[0];
 const gap=(next.from+next.audioLead)/30+first.start-((prev.from+prev.audioLead)/30+last.end);
 assert(gap>=0&&gap<.4,`Artificial pause between paragraphs ${i} and ${i+1}: ${gap.toFixed(2)}s`);
}
assert(existsSync('public/audio/score.wav'));
console.log(`Verified ${source.length} scenes, complete narration/captions, ${frame} frames (${(frame/30).toFixed(2)} seconds).`);
