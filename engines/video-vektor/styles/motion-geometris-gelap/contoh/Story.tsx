import React from 'react';
import {useCurrentFrame} from 'remotion';
import {Shot} from './edit';

// Draw each shot here, in the style described by ../style.md. This skeleton only fixes the format:
// a 1920x1080 SVG per shot, with `f` as the frame number inside the shot. Replace the empty scene.
const Adegan:React.FC<{f:number;d:number}>=()=><rect width="1920" height="1080" fill="#FFFFFF"/>;

const scenes:Record<Shot['id'],React.FC<{f:number;d:number}>>={adegan:Adegan};

export const StoryShot:React.FC<{shot:Shot}>=({shot})=>{
 const f=useCurrentFrame(),Scene=scenes[shot.id];
 return <svg viewBox="0 0 1920 1080" width="1920" height="1080" style={{position:'absolute',inset:0}}>
  <Scene f={f} d={shot.duration}/>
 </svg>;
};
