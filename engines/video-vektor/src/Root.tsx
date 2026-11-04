import React from 'react';
import {Composition} from 'remotion';
import {Film,VisualFilm} from './Film';
import timeline from './timeline.json';

export const Root:React.FC=()=> <>
 <Composition id="CeritaKucing" component={Film} durationInFrames={timeline.durationInFrames} fps={timeline.fps} width={1920} height={1080}/>
 <Composition id="CeritaKucingVisual" component={VisualFilm} durationInFrames={timeline.durationInFrames} fps={timeline.fps} width={1920} height={1080}/>
</>;
