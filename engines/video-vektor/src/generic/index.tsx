import React from 'react';
import {Composition,registerRoot} from 'remotion';
import {NarrativeFilm,NarrativeVisual} from './Film';
import type {ProjectProps} from './types';

const defaults:ProjectProps={title:'Belum ada proyek',projectId:'',width:1920,height:1080,timeline:{fps:30,durationInFrames:1,scenes:[]},plan:{assets:[],shots:[]}};
const Root:React.FC=()=> <>
 <Composition id="NarrativeFilm" component={NarrativeFilm} defaultProps={defaults} width={1920} height={1080} fps={30} durationInFrames={1} calculateMetadata={({props})=>({width:props.width,height:props.height,fps:props.timeline.fps,durationInFrames:props.timeline.durationInFrames})}/>
 <Composition id="NarrativeVisual" component={NarrativeVisual} defaultProps={defaults} width={1920} height={1080} fps={30} durationInFrames={1} calculateMetadata={({props})=>({width:props.width,height:props.height,fps:props.timeline.fps,durationInFrames:props.timeline.durationInFrames})}/>
</>;
registerRoot(Root);
