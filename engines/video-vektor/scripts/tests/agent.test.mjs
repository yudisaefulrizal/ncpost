import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {parseClaudeEvent,parseClineEvent,parseCodexEvent,resolveAgent,savedSession} from '../lib/agent-session.mjs';
import {StudioStore} from '../lib/studio-store.mjs';

test('Codex events map to session, activity and failure',()=>{
 assert.deepEqual(parseCodexEvent({type:'thread.started',thread_id:'t1'}),[{session:'t1'}]);
 assert.deepEqual(parseCodexEvent({type:'item.started',item:{type:'command_execution',command:'ls\n-la'}}),[{activity:['command','ls']}]);
 assert.deepEqual(parseCodexEvent({type:'item.completed',item:{type:'file_change',changes:[{path:'a/b/Story.tsx'}]}}),[{activity:['file','Menulis Story.tsx']}]);
 assert.deepEqual(parseCodexEvent({type:'turn.failed',error:{message:'kuota habis'}}),[{failure:'kuota habis'}]);
});
test('Claude stream-json events map to session, activity and failure',()=>{
 assert.deepEqual(parseClaudeEvent({type:'system',subtype:'init',session_id:'s1'}),[{session:'s1'}]);
 assert.deepEqual(parseClaudeEvent({type:'assistant',message:{content:[
  {type:'text',text:'Menulis naskah.'},
  {type:'tool_use',name:'Bash',input:{command:'node step.mjs --stage audio\nmore'}},
  {type:'tool_use',name:'Write',input:{file_path:'/x/hasil/a/naskah.json'}},
  {type:'tool_use',name:'Read',input:{file_path:'/x/skill.md'}},
 ]}}),[{activity:['message','Menulis naskah.']},{activity:['command','node step.mjs --stage audio']},{activity:['file','Menulis naskah.json']}]);
 assert.deepEqual(parseClaudeEvent({type:'result',subtype:'success',is_error:false,result:'Selesai'}),[]);
 assert.deepEqual(parseClaudeEvent({type:'result',subtype:'error_during_execution',is_error:true}),[{failure:'error_during_execution'}]);
});
test('Cline JSON events map to activity and failure',()=>{
 assert.deepEqual(parseClineEvent({type:'agent_event',event:{type:'content_start',contentType:'tool',toolName:'run_commands',input:{commands:['node a.mjs','ls']}}}),[{activity:['command','node a.mjs; ls']}]);
 assert.deepEqual(parseClineEvent({type:'agent_event',event:{type:'content_start',contentType:'tool',toolName:'editor',input:{path:'/x/Story.tsx'}}}),[{activity:['file','Menulis Story.tsx']}]);
 assert.deepEqual(parseClineEvent({type:'agent_event',event:{type:'content_start',contentType:'tool',toolName:'read_files',input:{path:'/x/a.ts'}}}),[]);
 assert.deepEqual(parseClineEvent({type:'run_result',finishReason:'completed',text:'Selesai'}),[{activity:['message','Selesai']}]);
 assert.deepEqual(parseClineEvent({type:'run_result',finishReason:'aborted',text:''}),[]);
 assert.deepEqual(parseClineEvent({type:'run_result',finishReason:'error',text:'Model gagal'}),[{activity:['message','Model gagal']},{failure:'Model gagal'}]);
 assert.deepEqual(parseClineEvent({type:'agent_event',event:{type:'error',recoverable:false,error:{message:'auth'}}}),[{failure:'auth'}]);
});
test('agent choice is validated and sessions are kept per agent',()=>{
 assert.equal(resolveAgent('Claude'),'claude');assert.equal(resolveAgent('cline'),'cline');
 assert.throws(()=>resolveAgent('gemini'),/tidak dikenal/);
 assert.equal(savedSession({threadId:'old'},'codex'),'old');
 assert.equal(savedSession({threadId:'old'},'claude'),undefined);
 assert.equal(savedSession({threadId:'old',sessions:{codex:'new',claude:'c'}},'codex'),'new');
});
test('studio jobs store and launch the chosen agent',t=>{
 const root=mkdtempSync(path.join(os.tmpdir(),'video-agent-test-'));t.after(()=>rmSync(root,{recursive:true,force:true}));
 const store=new StudioStore({root,launch:()=>{throw new Error('not launched');}});
 assert.equal(store.create({title:'Cerita tentang hujan',agent:'claude'}).agent,'claude');
 assert.throws(()=>store.create({title:'Cerita tentang angin',agent:'gemini'}),/tidak dikenal/);
 const snapshot=store.snapshot();assert.equal(snapshot.agents.claude,'Claude');assert.ok(snapshot.defaultAgent);
});
