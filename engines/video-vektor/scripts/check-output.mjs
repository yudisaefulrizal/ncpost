import path from 'node:path';
import {ROOT,CAT_SOURCE,paths,readJson} from './lib/pipeline.mjs';
import {verifyOutput} from './lib/media.mjs';
import {projectEnvironment,projectPaths} from './lib/project.mjs';

const selected=process.argv.indexOf('--project');
if(selected>=0)Object.assign(process.env,projectEnvironment(projectPaths(process.argv[selected+1])));

const file=process.env.VIDEO_INPUT??path.join(paths().out,'video.mp4');
const timeline=process.env.PIPELINE_WORK_DIR?path.join(process.env.PIPELINE_WORK_DIR,'timeline.json'):path.join(ROOT,CAT_SOURCE,'timeline.json');
const result=verifyOutput(file,readJson(timeline));
console.log(`Export verified: ${result.width}x${result.height}, ${result.frames} frames, ${result.duration.toFixed(2)}s, H.264 + AAC stereo.`);
