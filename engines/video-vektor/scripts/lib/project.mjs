import path from 'node:path';
import {existsSync,mkdirSync} from 'node:fs';
import {loadEnvFile} from 'node:process';
import {ROOT,paths} from './pipeline.mjs';

export function loadEnvironment(){
 const file=path.join(ROOT,'.env');
 if(existsSync(file))loadEnvFile(file);
}
export function projectSlug(title){
 const slug=title.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,72).replace(/-$/,'');
 if(!slug)throw new Error('Judul harus memiliki huruf atau angka untuk nama folder proyek.');
 return slug;
}
export function projectPaths(id){
 if(!/^[a-z0-9][a-z0-9-]{0,71}$/.test(id))throw new Error('ID proyek tidak valid.');
 const base=paths(ROOT,id);
 return {...base,id,script:path.join(base.out,'naskah.json'),metadata:path.join(base.cache,'project.json'),publicDir:path.join(base.cache,'public'),audioDir:path.join(base.cache,'public/audio'),timeline:path.join(base.cache,'timeline.json'),plan:path.join(base.cache,'animation-plan.json'),props:path.join(base.cache,'render-props.json'),source:path.join(base.cache,'source'),session:path.join(base.cache,'session.json'),control:path.join(base.cache,'control.json')};
}
export function projectEnvironment(p){
 return {PIPELINE_PROJECT_ID:p.id,PIPELINE_PROJECT_DIR:p.out,PIPELINE_WORK_DIR:p.cache,PIPELINE_PUBLIC_DIR:p.publicDir};
}
export function ensureProject(p){
 for(const dir of [p.out,p.cache,p.publicDir,p.audioDir,p.reports])mkdirSync(dir,{recursive:true});
}
export function selectedProject(){
 const id=process.env.PIPELINE_PROJECT_ID;
 if(!id)throw new Error('Pilih proyek dengan --project <id> atau berikan judul.');
 return projectPaths(id);
}
