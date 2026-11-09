import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {ensureProject,projectPaths} from '../lib/project.mjs';
import {FINAL_FILES,acquireLock,cleanup,publish,runtimeDirectory} from '../lib/pipeline.mjs';

function fixture(t){
 const root=mkdtempSync(path.join(os.tmpdir(),'video-project-source-test-'));
 t.after(()=>rmSync(root,{recursive:true,force:true}));
 return projectPaths('video-pertama',root);
}
function put(file,text){mkdirSync(path.dirname(file),{recursive:true});writeFileSync(file,text);}

test('each project keeps independent source next to its outputs',t=>{
 const p=fixture(t),other=projectPaths('video-kedua',p.root);
 assert.equal(p.source,path.join(p.out,'source'));
 for(const project of [p,other]){
  const release=acquireLock(project);
  try{ensureProject(project);put(path.join(project.source,'Story.tsx'),project.id);}finally{release();}
 }
 assert.equal(readFileSync(path.join(p.source,'Story.tsx'),'utf8'),p.id);
 assert.equal(readFileSync(path.join(other.source,'Story.tsx'),'utf8'),other.id);
 assert(!existsSync(path.join(p.cache,'source')));
});

test('resuming an old project moves the complete source tree without changing edits',t=>{
 const p=fixture(t),legacy=path.join(p.cache,'source');
 const files={'index.ts':'registerRoot(Root);','components/Marble.tsx':'corrected marble code','timeline.json':'{"durationInFrames":300}','style.css':'svg { display: block; }'};
 for(const [file,text] of Object.entries(files))put(path.join(legacy,file),text);
 const release=acquireLock(p);
 try{ensureProject(p);ensureProject(p);}finally{release();}
 assert(!existsSync(legacy));
 for(const [file,text] of Object.entries(files))assert.equal(readFileSync(path.join(p.source,file),'utf8'),text);
});

test('existing output source takes precedence and neither copy is overwritten',t=>{
 const p=fixture(t),legacy=path.join(p.cache,'source');
 put(path.join(legacy,'Story.tsx'),'older cached version');
 put(path.join(p.source,'Story.tsx'),'edited output version');
 const release=acquireLock(p);
 try{ensureProject(p);}finally{release();}
 assert.equal(readFileSync(path.join(p.source,'Story.tsx'),'utf8'),'edited output version');
 assert.equal(readFileSync(path.join(legacy,'Story.tsx'),'utf8'),'older cached version');
});

test('publication and full checkpoint cleanup preserve permanent source',t=>{
 const p=fixture(t),release=acquireLock(p);
 try{
  ensureProject(p);put(path.join(p.source,'Story.tsx'),'authored scene');
  const stage=runtimeDirectory(p);
  for(const name of [...FINAL_FILES,'build-manifest.json'])put(path.join(stage,name),'final artifact');
  put(path.join(p.checkpoints,'old/visual.mp4'),'temporary render');
  publish(stage,p);cleanup({p,purge:true,completed:true});
  assert.equal(readFileSync(path.join(p.source,'Story.tsx'),'utf8'),'authored scene');
  for(const name of FINAL_FILES)assert.equal(readFileSync(path.join(p.out,name),'utf8'),'final artifact');
  assert(!existsSync(path.join(p.checkpoints,'old')));
 }finally{release();}
});
