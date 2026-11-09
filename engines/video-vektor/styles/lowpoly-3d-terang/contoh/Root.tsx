import React from 'react';
import {Composition} from 'remotion';
import {Film,VisualFilm} from './Film';
import timeline from './timeline.json';

// For previewing the example only. In a project the pipeline rewrites this file to register
// ProjectFilm and ProjectVisual at 1920x1080 with fps and duration from timeline.json.
export const Root:React.FC=()=> <>
 <Composition id="Contoh" component={Film} durationInFrames={timeline.durationInFrames} fps={timeline.fps} width={1920} height={1080}/>
 <Composition id="ContohVisual" component={VisualFilm} durationInFrames={timeline.durationInFrames} fps={timeline.fps} width={1920} height={1080}/>
</>;
