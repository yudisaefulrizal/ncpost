import {existsSync,readFileSync,readdirSync} from 'node:fs';
import path from 'node:path';
import {ROOT} from './pipeline.mjs';

export const DEFAULT_STYLE='vektor-kucing';
// Files the production pipeline relies on in every style example (session-step writes Root.tsx itself).
export const REQUIRED_EXAMPLE_FILES=['index.ts','Film.tsx'];
const ID=/^[a-z0-9][a-z0-9-]{0,47}$/;

export function parseStyle(text){
 const match=/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text);
 const meta={};
 if(match)for(const line of match[1].split(/\r?\n/)){const at=line.indexOf(':');if(at>0)meta[line.slice(0,at).trim()]=line.slice(at+1).trim();}
 return {meta,guide:(match?match[2]:text).trim()};
}

export function loadStyle(id,root=ROOT){
 if(!ID.test(String(id)))throw new Error(`Nama gaya tidak valid: ${id}.`);
 const dir=path.join(root,'styles',id),file=path.join(dir,'style.md'),example=path.join(dir,'contoh');
 if(!existsSync(file))throw new Error(`Gaya visual tidak ditemukan: ${id}. Tambahkan styles/${id}/style.md.`);
 const missing=REQUIRED_EXAMPLE_FILES.filter(name=>!existsSync(path.join(example,name)));
 if(missing.length)throw new Error(`Gaya ${id} belum punya contoh lengkap: styles/${id}/contoh/${missing.join(', ')} tidak ada.`);
 const {meta,guide}=parseStyle(readFileSync(file,'utf8'));
 // The folder name is the style's name in the UI, the CLI and the prompt.
 return {id,name:id,description:meta.deskripsi||'',guide,dir,example,exampleRelative:path.relative(root,example)};
}

export function listStyles(root=ROOT){
 const dir=path.join(root,'styles');if(!existsSync(dir))return [];
 return readdirSync(dir,{withFileTypes:true}).filter(e=>e.isDirectory()&&ID.test(e.name)).sort((a,b)=>a.name.localeCompare(b.name)).flatMap(e=>{
  try{const {id,name,description}=loadStyle(e.name,root);return [{id,name,description}];}catch{return [];}
 });
}

export function resolveStyle(value,root=ROOT){
 return loadStyle(String(value||process.env.STYLE||DEFAULT_STYLE).trim().toLowerCase(),root).id;
}
