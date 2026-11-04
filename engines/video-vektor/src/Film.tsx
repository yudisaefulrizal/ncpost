import React from 'react';
import {AbsoluteFill,Audio,interpolate,Sequence,staticFile,useCurrentFrame} from 'remotion';
import timeline from './timeline.json';
import {shots} from './edit';
import {StoryShot} from './Story';
import './style.css';

const Captions:React.FC<{scene:(typeof timeline.scenes)[number]}>=({scene})=>{
 const seconds=(useCurrentFrame()-scene.audioLead)/timeline.fps;
 const caption=scene.captions.find(c=>seconds>=c.start&&seconds<c.end);
 if(!caption)return null;
 return <div style={{position:'absolute',left:145,right:145,bottom:35,display:'flex',justifyContent:'center',pointerEvents:'none'}}>
  <div style={{fontSize:34,lineHeight:1.3,fontWeight:900,color:'#FFF6E5',textAlign:'center',textShadow:'0 2px 4px #17243D, 0 0 12px #17243DC0',WebkitTextStroke:'0.6px #29334B'}}>{caption.words.map(w=>w.text).join(' ')}</div>
 </div>;
};

export const VisualFilm:React.FC=()=>{
 const f=useCurrentFrame();
 return <AbsoluteFill style={{fontFamily:'Lato',backgroundColor:'#202D4D'}}>
  <style>{`@font-face {font-family: Lato; src: url("${staticFile('fonts/Lato-Regular.ttf')}"); font-weight: 400;} @font-face {font-family: Lato; src: url("${staticFile('fonts/Lato-Heavy.ttf')}"); font-weight: 900;}`}</style>
  {shots.map(shot=><Sequence key={shot.id} from={shot.from} durationInFrames={shot.duration} name={shot.action}><StoryShot shot={shot}/></Sequence>)}
  <AbsoluteFill style={{background:'linear-gradient(transparent 86%, #19273B40 100%)',pointerEvents:'none'}}/>
  {timeline.scenes.map(scene=><Sequence key={scene.index} from={scene.from} durationInFrames={scene.durationInFrames} name={`Narasi ${scene.index+1}`}>
   <Captions scene={scene}/>
  </Sequence>)}
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
