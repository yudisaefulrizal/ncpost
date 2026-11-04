import path from 'node:path';
import {readJson,writeJson} from './pipeline.mjs';

export function updateProgress(p,patch){
 let previous={};try{previous=readJson(path.join(p.cache,'status.json'));}catch{}
 const status={...previous,...patch,updatedAt:new Date().toISOString()};
 writeJson(path.join(p.cache,'status.json'),status);return status;
}
export function progressReporter(p,title){
 updateProgress(p,{projectId:p.id,title,pid:process.pid,state:'running',step:1,message:'Menyiapkan folder proyek.',startedAt:new Date().toISOString(),render:null,animation:null,logs:[]});
 return (step,message,extra={})=>updateProgress(p,{...(step===undefined?{}:{step}),message,...extra});
}
