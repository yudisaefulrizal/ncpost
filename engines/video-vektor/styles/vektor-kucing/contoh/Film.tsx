import React from 'react';
import {AbsoluteFill,Audio,interpolate,Sequence,staticFile,useCurrentFrame} from 'remotion';
import timeline from './timeline.json';
import {shots} from './edit';
import {StoryShot} from './Story';
import './style.css';

export const VisualFilm:React.FC=()=>{
 const f=useCurrentFrame();
 return <AbsoluteFill style={{fontFamily:'Lato',backgroundColor:'#202D4D'}}>
  <style>{`@font-face {font-family: Lato; src: url("${staticFile('fonts/Lato-Regular.ttf')}"); font-weight: 400;} @font-face {font-family: Lato; src: url("${staticFile('fonts/Lato-Heavy.ttf')}"); font-weight: 900;}`}</style>
  {shots.map(shot=><Sequence key={shot.id} from={shot.from} durationInFrames={shot.duration} name={shot.action}><StoryShot shot={shot}/></Sequence>)}
  <AbsoluteFill style={{background:'linear-gradient(transparent 86%, #19273B40 100%)',pointerEvents:'none'}}/>
  <AbsoluteFill style={{background:'#202D4D',opacity:interpolate(f,[timeline.durationInFrames-12,timeline.durationInFrames-1],[0,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp'}),pointerEvents:'none'}}/>
 </AbsoluteFill>;
};

export const Film:React.FC=()=> <AbsoluteFill>
 <VisualFilm/>
 {timeline.scenes.map(scene=><Sequence key={scene.index} from={scene.from+scene.audioLead} durationInFrames={scene.audioTrimEnd-scene.audioTrimStart} name={`Suara ${scene.index+1}`}>
  <Audio src={staticFile(`audio/scene-${scene.index+1}.mp3`)} trimBefore={scene.audioTrimStart} durationInFrames={scene.audioTrimEnd-scene.audioTrimStart}/>
 </Sequence>)}
 <Audio src={staticFile('audio/score.wav')} volume={frame=>interpolate(frame,[0,30,timeline.durationInFrames-35,timeline.durationInFrames],[0,.34,.34,0],{extrapolateLeft:'clamp',extrapolateRight:'clamp'})}/>
</AbsoluteFill>;
