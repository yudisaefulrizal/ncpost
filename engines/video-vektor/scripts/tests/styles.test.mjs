import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,mkdtempSync,mkdirSync,rmSync,writeFileSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {DEFAULT_STYLE,REQUIRED_EXAMPLE_FILES,listStyles,loadStyle,parseStyle,resolveStyle} from '../lib/styles.mjs';
import {ROOT} from '../lib/pipeline.mjs';
import {StudioStore} from '../lib/studio-store.mjs';

function styleRoot(t){
 const root=mkdtempSync(path.join(os.tmpdir(),'video-styles-test-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const add=(id,text,files=['index.ts','Film.tsx'])=>{
  mkdirSync(path.join(root,'styles',id,'contoh'),{recursive:true});
  if(text!==null)writeFileSync(path.join(root,'styles',id,'style.md'),text);
  for(const name of files)writeFileSync(path.join(root,'styles',id,'contoh',name),'');
 };
 return {root,add};
}

test('style.md frontmatter gives the description and agent guide',()=>{
 assert.deepEqual(parseStyle('---\ndeskripsi: Garis putih: papan hijau\n---\n- poin satu\n'),{meta:{deskripsi:'Garis putih: papan hijau'},guide:'- poin satu'});
 assert.deepEqual(parseStyle('Tanpa frontmatter.'),{meta:{},guide:'Tanpa frontmatter.'});
});
test('only complete style folders are listed and selectable',t=>{
 const {root,add}=styleRoot(t);
 add('kapur','---\ndeskripsi: Papan tulis\n---\nPanduan.');
 add('tanpa-contoh','---\ndeskripsi: Rusak\n---\n',['index.ts']);
 add('tanpa-panduan',null);
 add('Huruf-Besar','---\ndeskripsi: X\n---\n');
 // the folder name is the displayed name
 assert.deepEqual(listStyles(root),[{id:'kapur',name:'kapur',description:'Papan tulis'}]);
 assert.equal(loadStyle('kapur',root).guide,'Panduan.');
 assert.equal(loadStyle('kapur',root).exampleRelative,path.join('styles','kapur','contoh'));
 assert.throws(()=>loadStyle('tanpa-contoh',root),/Film\.tsx/);
 assert.throws(()=>loadStyle('tanpa-panduan',root),/tidak ditemukan/);
 assert.throws(()=>loadStyle('../kapur',root),/tidak valid/);
 assert.equal(resolveStyle('KAPUR',root),'kapur');
});
test('the repository ships the cat style as the complete default',()=>{
 assert.equal(resolveStyle(),DEFAULT_STYLE);
 const style=loadStyle(DEFAULT_STYLE);
 assert.equal(style.name,DEFAULT_STYLE);assert.ok(style.guide.length>50);
 assert.ok(listStyles().some(s=>s.id===DEFAULT_STYLE));
});
test('studio jobs store and launch the chosen style',t=>{
 const root=mkdtempSync(path.join(os.tmpdir(),'video-style-store-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const launched=[];
 const store=new StudioStore({root,launch:job=>{launched.push(job);throw new Error('stop');}});
 assert.equal(store.create({title:'Cerita tentang batu'}).style,DEFAULT_STYLE);
 assert.throws(()=>store.create({title:'Cerita tentang angin',style:'tidak-ada'}),/tidak ditemukan/);
 const snapshot=store.snapshot();
 assert.equal(snapshot.defaultStyle,DEFAULT_STYLE);assert.ok(snapshot.styles.some(s=>s.id===DEFAULT_STYLE));
});
test('the neutral skeleton carries the required format but is never offered as a style',()=>{
 for(const name of ['style.md',...REQUIRED_EXAMPLE_FILES.map(file=>`contoh/${file}`),'contoh/Root.tsx','contoh/timeline.json'])assert.ok(existsSync(path.join(ROOT,'styles/_kerangka',name)),name);
 assert.ok(!listStyles().some(s=>s.id.startsWith('_')));
 assert.throws(()=>loadStyle('_kerangka'),/tidak valid/);
});
