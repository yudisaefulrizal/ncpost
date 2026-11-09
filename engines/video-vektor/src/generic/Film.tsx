import React from 'react';
import {AbsoluteFill,Audio,Sequence,interpolate,staticFile,useCurrentFrame} from 'remotion';
import type {Asset,ProjectProps,Scene,Shot} from './types';
import {sample} from './motion';
import {SolidLayer} from './SolidLayer';
import '../../styles/vektor-kucing/contoh/style.css';

const VectorLayer:React.FC<{shot:Shot;assets:Asset[];progress:number;layer:'back'|'front'}>=({shot,assets,progress,layer})=>{
 const camera=sample(shot.camera,progress);
 return <svg width="1920" height="1080" viewBox="0 0 1920 1080" style={{position:'absolute',inset:0,pointerEvents:'none'}}>
  <g transform={`translate(960 540) scale(${camera.zoom}) translate(${-camera.x} ${-camera.y})`}>
   {shot.entities.filter(entity=>entity.kind==='vector'&&entity.layer===layer).map(entity=>{
    const pose=sample(entity.keyframes,progress,entity.easing),asset=assets.find(asset=>asset.id===entity.assetId)!;
    return <g key={entity.id} opacity={pose.opacity} transform={`translate(${pose.x} ${pose.y}) rotate(${pose.rotation}) scale(${pose.scale})`} dangerouslySetInnerHTML={{__html:asset.markup}}/>;
   })}
  </g>
 </svg>;
};

const NarrativeShot:React.FC<{shot:Shot;project:ProjectProps}>=({shot,project})=>{
 const frame=useCurrentFrame(),progress=frame/Math.max(1,shot.duration-1),camera=sample(shot.camera,progress);
 const solid=shot.entities.filter(entity=>entity.kind==='solid');
 const key=shot.keyText,text=key?project.timeline.scenes[key.sceneIndex]?.key_text:null;
 const textOpacity=key?Math.max(0,Math.min(1,(progress-key.from)*shot.duration/7,(key.to-progress)*shot.duration/7)):0;
 return <AbsoluteFill style={{background:shot.background,overflow:'hidden'}}>
  <VectorLayer shot={shot} assets={project.plan.assets} progress={progress} layer="back"/>
  {solid.length>0&&<SolidLayer entities={solid} assets={project.plan.assets} progress={progress} camera={camera}/>}
  <VectorLayer shot={shot} assets={project.plan.assets} progress={progress} layer="front"/>
  {key&&text&&textOpacity>0&&<div style={{position:'absolute',left:key.x,top:key.y,transform:'translate(-50%, -50%)',fontSize:key.size,fontWeight:900,color:key.color,opacity:textOpacity,textAlign:'center',maxWidth:1100,lineHeight:1.15}}>{text}</div>}
 </AbsoluteFill>;
};

const Captions:React.FC<{scene:Scene;fps:number}>=({scene,fps})=>{
 const time=(useCurrentFrame()-scene.audioLead)/fps;
 const caption=scene.captions.find(c=>time>=c.start&&time<c.end);
 return caption?<div style={{position:'absolute',left:145,right:145,bottom:35,textAlign:'center',fontSize:34,lineHeight:1.3,fontWeight:900,color:'#FFF6E5',textShadow:'0 2px 4px #17243D, 0 0 12px #17243DC0',WebkitTextStroke:'.6px #29334B',pointerEvents:'none'}}>{caption.words.map(w=>w.text).join(' ')}</div>:null;
};

export const NarrativeVisual:React.FC<ProjectProps>=project=>{
 const frame=useCurrentFrame(),timeline=project.timeline;
 return <AbsoluteFill style={{fontFamily:'Lato',background:'#202D4D'}}>
  <style>{`@font-face{font-family:Lato;src:url("${staticFile('fonts/Lato-Regular.ttf')}");font-weight:400}@font-face{font-family:Lato;src:url("${staticFile('fonts/Lato-Heavy.ttf')}");font-weight:900}`}</style>
  {project.plan.shots.map(shot=><Sequence key={shot.id} from={shot.from} durationInFrames={shot.duration} name={shot.action}><NarrativeShot shot={shot} project={project}/></Sequence>)}
  <AbsoluteFill style={{background:'linear-gradient(transparent 86%,#19273B40 100%)',pointerEvents:'none'}}/>
  {timeline.scenes.map(scene=><Sequence key={scene.index} from={scene.from} durationInFrames={scene.durationInFrames}><Captions scene={scene} fps={timeline.fps}/></Sequence>)}
  <AbsoluteFill style={{background:'#202D4D',opacity:interpolate(frame,[Math.max(0,timeline.durationInFrames-12),Math.max(1,timeline.durationInFrames-1)],[0,1],{extrapolateLeft:'clamp',extrapolateRight:'clamp'}),pointerEvents:'none'}}/>
 </AbsoluteFill>;
};

export const NarrativeFilm:React.FC<ProjectProps>=project=><AbsoluteFill>
 <NarrativeVisual {...project}/>
 {project.timeline.scenes.map(scene=><Sequence key={scene.index} from={scene.from+scene.audioLead} durationInFrames={scene.audioTrimEnd-scene.audioTrimStart}>
  <Audio src={staticFile(`audio/scene-${scene.index+1}.mp3`)} trimBefore={scene.audioTrimStart} durationInFrames={scene.audioTrimEnd-scene.audioTrimStart}/>
 </Sequence>)}
 <Audio src={staticFile('audio/score.wav')} volume={frame=>{
  const duration=project.timeline.durationInFrames;
  return .34*Math.max(0,Math.min(1,frame/Math.max(1,Math.min(30,duration/3)),(duration-frame)/Math.max(1,Math.min(35,duration/3))));
 }}/>
</AbsoluteFill>;
