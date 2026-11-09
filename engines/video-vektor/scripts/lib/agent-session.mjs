import {spawn} from 'node:child_process';
import {readJson,writeJson,ROOT} from './pipeline.mjs';
import {signalProcessTree} from './process-tree.mjs';

export const AGENTS={codex:'Codex',claude:'Claude',cline:'Cline'};
export const DEFAULT_AGENT='claude';

export function resolveAgent(value){
 const agent=String(value||process.env.AGENT||DEFAULT_AGENT).trim().toLowerCase();
 if(!Object.hasOwn(AGENTS,agent))throw new Error(`Agen AI tidak dikenal: ${value}. Pilih ${Object.keys(AGENTS).join(' atau ')}.`);
 return agent;
}
export const agentLabel=agent=>AGENTS[agent]??agent;

const firstLine=(value,fallback)=>String(value??fallback).split('\n')[0].slice(0,240);
const fileName=value=>String(value).split('/').at(-1);

// Each parser turns one JSON line into neutral actions: {session}, {activity:[kind,message]}, {failure}.
export function parseCodexEvent(event){
 const actions=[];
 if(event.type==='thread.started'&&event.thread_id)actions.push({session:event.thread_id});
 const item=event.item;
 if(item?.type==='command_execution'&&event.type==='item.started')actions.push({activity:['command',firstLine(item.command,'Menjalankan langkah produksi.')]});
 if(item?.type==='file_change'&&event.type==='item.completed')for(const change of item.changes??[])actions.push({activity:['file',`Menulis ${fileName(change.path)}`]});
 if(item?.type==='agent_message'&&event.type==='item.completed')actions.push({activity:['message',String(item.text??'').slice(0,1200)]});
 if(event.type==='turn.failed'||event.type==='error')actions.push({failure:event.error?.message??event.message??'Sesi Codex terhenti.'});
 return actions;
}
export function parseClaudeEvent(event){
 const actions=[];
 if(event.type==='system'&&event.subtype==='init'&&event.session_id)actions.push({session:event.session_id});
 if(event.type==='assistant')for(const block of event.message?.content??[]){
  if(block.type==='text'&&block.text?.trim())actions.push({activity:['message',block.text.slice(0,1200)]});
  if(block.type!=='tool_use')continue;
  const input=block.input??{};
  if(block.name==='Bash')actions.push({activity:['command',firstLine(input.command,'Menjalankan langkah produksi.')]});
  else if(['Write','Edit','MultiEdit','NotebookEdit'].includes(block.name)&&(input.file_path||input.notebook_path))actions.push({activity:['file',`Menulis ${fileName(input.file_path??input.notebook_path)}`]});
 }
 if(event.type==='result'&&event.is_error)actions.push({failure:String(event.result||event.errors?.join?.('; ')||event.subtype||'Sesi Claude terhenti.').slice(0,1500)});
 return actions;
}

const FILE_TOOL=/write|edit|replace|create|patch|apply|editor/i;
export function parseClineEvent(event){
 const actions=[];
 if(event.type==='agent_event'){
  const inner=event.event??{};
  if(inner.type==='content_start'&&inner.contentType==='tool'){
   const input=inner.input&&typeof inner.input==='object'?inner.input:{};
   const command=input.command??(Array.isArray(input.commands)?input.commands.join('; '):undefined);
   const file=input.path??input.file_path??input.filePath??input.absolutePath;
   if(command)actions.push({activity:['command',firstLine(command,'Menjalankan langkah produksi.')]});
   else if(file&&FILE_TOOL.test(String(inner.toolName??'')))actions.push({activity:['file',`Menulis ${fileName(file)}`]});
  }
  if(inner.type==='error'&&inner.recoverable===false)actions.push({failure:String(inner.error?.message??inner.message??'Sesi Cline terhenti.').slice(0,1500)});
 }
 if(event.type==='run_result'){
  if(event.text?.trim())actions.push({activity:['message',String(event.text).slice(0,1200)]});
  if(event.finishReason&&!['completed','aborted'].includes(event.finishReason))actions.push({failure:String(event.text||`Cline berhenti: ${event.finishReason}`).slice(0,1500)});
 }
 if(event.type==='error'&&event.message)actions.push({failure:String(event.message).slice(0,1500)});
 return actions;
}

const providers={
 codex:{
  bin:()=>process.env.CODEX_BIN||'codex',
  args:sessionId=>{
   const args=['exec','--sandbox','workspace-write','-c','approval_policy="never"','-c','sandbox_workspace_write.network_access=true'];
   if(process.env.CODEX_MODEL)args.push('--model',process.env.CODEX_MODEL);
   if(sessionId)args.push('resume',sessionId);
   args.push('--json','--skip-git-repo-check','-');return args;
  },
  // Use the ChatGPT login saved by `codex login`, never an API key.
  env:{OPENAI_API_KEY:undefined,CODEX_API_KEY:undefined},
  parse:parseCodexEvent,
 },
 claude:{
  bin:()=>process.env.CLAUDE_BIN||'claude',
  args:sessionId=>{
   const args=['-p','--output-format','stream-json','--verbose','--allowedTools','Bash,Read,Edit,MultiEdit,Write,Glob,Grep'];
   if(process.env.CLAUDE_MODEL)args.push('--model',process.env.CLAUDE_MODEL);
   if(sessionId)args.push('--resume',sessionId);
   return args;
  },
  // Use the subscription login saved by `claude login`, never an API key.
  env:{ANTHROPIC_API_KEY:undefined,ANTHROPIC_AUTH_TOKEN:undefined},
  parse:parseClaudeEvent,
 },
 cline:{
  bin:()=>process.env.CLINE_BIN||'cline',
  // Headless Cline cannot resume a session (--id only works interactively), so each run starts fresh;
  // the script, code and audio saved in the project are still reused.
  resumable:false,
  args:()=>{
   const args=['--json','--auto-approve','true','--cwd',ROOT];
   if(process.env.CLINE_PROVIDER)args.push('--provider',process.env.CLINE_PROVIDER);
   if(process.env.CLINE_MODEL)args.push('--model',process.env.CLINE_MODEL);
   return args;
  },
  // Cline uses the provider configured with `cline auth`.
  env:{},
  parse:parseClineEvent,
 },
};

// Sessions are stored per agent; a Codex thread cannot be resumed by Claude and vice versa.
export function savedSession(saved,agent){return saved.sessions?.[agent]??(agent==='codex'?saved.threadId:undefined);}

export function runAgentSession({agent=DEFAULT_AGENT,p,prompt,signal,env,onActivity}){
 const provider=providers[agent],label=agentLabel(agent);
 if(!provider)return Promise.reject(new Error(`Agen AI tidak dikenal: ${agent}.`));
 let saved={};try{saved=readJson(p.session);}catch{}
 const args=provider.args(savedSession(saved,agent));
 return new Promise((resolve,reject)=>{
  const child=spawn(provider.bin(),args,{cwd:ROOT,env:{...process.env,...env,...provider.env},stdio:['pipe','pipe','pipe']});
  let buffer='',stderr='',failure=null;
  if(provider.resumable===false)onActivity('session',`Sesi ${label} dimulai (sesi baru setiap kali dijalankan).`);
  const accept=line=>{
   let event;try{event=JSON.parse(line);}catch{return;}
   for(const action of provider.parse(event)){
    if(action.session){
     let current={};try{current=readJson(p.session);}catch{}
     saved={...current,sessions:{...current.sessions,[agent]:action.session}};writeJson(p.session,saved);
     onActivity('session',`Sesi ${label} terhubung.`);
    }
    if(action.activity)onActivity(...action.activity);
    if(action.failure)failure=action.failure;
   }
  };
  child.stdout.on('data',chunk=>{buffer+=chunk;let end;while((end=buffer.indexOf('\n'))>=0){accept(buffer.slice(0,end));buffer=buffer.slice(end+1);}});
  child.stderr.on('data',chunk=>{stderr=(stderr+chunk.toString()).slice(-1500);});
  const stop=()=>signalProcessTree(child.pid);signal?.addEventListener('abort',stop,{once:true});
  child.stdin.on('error',()=>{});child.stdin.end(prompt);if(signal?.aborted)stop();
  child.once('error',error=>{
   signal?.removeEventListener('abort',stop);
   reject(error.code==='ENOENT'?new Error(`${label} CLI tidak ditemukan (${provider.bin()}). Pasang dan login terlebih dahulu.`):error);
  });
  child.once('close',(code,killed)=>{
   signal?.removeEventListener('abort',stop);if(buffer.trim())accept(buffer);
   if(signal?.aborted)reject(signal.reason??new Error('Pekerjaan dihentikan.'));
   else if(code!==0||failure)reject(new Error(failure??`${label} berhenti (${killed??code}). ${stderr.trim()}`));
   else resolve();
  });
 });
}
