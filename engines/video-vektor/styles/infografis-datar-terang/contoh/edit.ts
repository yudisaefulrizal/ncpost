import timeline from './timeline.json';

// Shots: where the picture changes. The pipeline replaces timeline.json with the project's narration
// timing; place cuts with `at(scene, seconds)` so they land on the words they illustrate. Shots follow
// the development of ideas, not one shot per sentence.
export const at=(scene:number,seconds:number)=>timeline.scenes[scene].from+timeline.scenes[scene].audioLead+Math.round(seconds*timeline.fps);
const cuts=[0,timeline.durationInFrames];
const ids=['adegan'] as const;
const actions=['Adegan pertama.'];
export const shots=ids.map((id,i)=>({id,from:cuts[i],duration:cuts[i+1]-cuts[i],action:actions[i]}));
export type Shot=(typeof shots)[number];
