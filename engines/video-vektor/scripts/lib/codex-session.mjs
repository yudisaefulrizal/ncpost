import {spawn} from 'node:child_process';
import {readJson,writeJson,ROOT} from './pipeline.mjs';
import {signalProcessTree} from './process-tree.mjs';

export function runCodexSession({p,prompt,signal,env,onActivity}){
 let saved={};try{saved=readJson(p.session);}catch{}
 const args=['exec','--sandbox','workspace-write','-c','approval_policy="never"','-c','sandbox_workspace_write.network_access=true'];
 if(process.env.CODEX_MODEL)args.push('--model',process.env.CODEX_MODEL);
 if(saved.threadId)args.push('resume',saved.threadId);
 args.push('--json','--skip-git-repo-check','-');
 return new Promise((resolve,reject)=>{
  const child=spawn(process.env.CODEX_BIN||'codex',args,{cwd:ROOT,env:{...process.env,...env,OPENAI_API_KEY:undefined,CODEX_API_KEY:undefined},stdio:['pipe','pipe','pipe']});
  let buffer='',stderr='',failure=null;
  const accept=line=>{
   let event;try{event=JSON.parse(line);}catch{return;}
   if(event.type==='thread.started'&&event.thread_id){saved={...saved,threadId:event.thread_id};writeJson(p.session,saved);onActivity('session','Sesi Codex terhubung.');}
   const item=event.item;
   if(item?.type==='command_execution'&&event.type==='item.started')onActivity('command',String(item.command??'Menjalankan langkah produksi.').split('\n')[0].slice(0,240));
   if(item?.type==='file_change'&&event.type==='item.completed')for(const change of item.changes??[])onActivity('file',`Menulis ${String(change.path).split('/').at(-1)}`);
   if(item?.type==='agent_message'&&event.type==='item.completed')onActivity('message',String(item.text??'').slice(0,1200));
   if(event.type==='turn.failed'||event.type==='error')failure=event.error?.message??event.message??'Sesi Codex terhenti.';
  };
  child.stdout.on('data',chunk=>{buffer+=chunk;let end;while((end=buffer.indexOf('\n'))>=0){accept(buffer.slice(0,end));buffer=buffer.slice(end+1);}});
  child.stderr.on('data',chunk=>{stderr=(stderr+chunk.toString()).slice(-1500);});
  const stop=()=>signalProcessTree(child.pid);signal?.addEventListener('abort',stop,{once:true});
  child.stdin.on('error',()=>{});child.stdin.end(prompt);if(signal?.aborted)stop();
  child.once('error',error=>{signal?.removeEventListener('abort',stop);reject(error);});
  child.once('close',(code,killed)=>{
   signal?.removeEventListener('abort',stop);if(buffer.trim())accept(buffer);
   if(signal?.aborted)reject(signal.reason??new Error('Pekerjaan dihentikan.'));
   else if(code!==0||failure)reject(new Error(failure??`Codex berhenti (${killed??code}). ${stderr.trim()}`));
   else resolve();
  });
 });
}
