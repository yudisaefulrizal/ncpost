import {spawnSync} from 'node:child_process';

// Stop only this job and its descendants, including separate render process groups.
export function signalProcessTree(pid,signal='SIGTERM'){
 if(!Number.isInteger(pid)||pid<=0||pid===process.pid)return [];
 const rows=spawnSync('ps',['-eo','pid=,ppid=,pgid='],{encoding:'utf8'}).stdout??'';
 const processes=rows.trim().split('\n').map(line=>{const [id,parent,group]=line.trim().split(/\s+/).map(Number);return {id,parent,group};});
 const ids=new Set([pid]);let changed=true;
 while(changed){changed=false;for(const p of processes)if(ids.has(p.parent)&&!ids.has(p.id)){ids.add(p.id);changed=true;}}
 const ownGroup=processes.find(p=>p.id===process.pid)?.group;
 for(const group of new Set(processes.filter(p=>ids.has(p.id)&&ids.has(p.group)&&p.group!==ownGroup&&p.group>0).map(p=>p.group)))try{process.kill(-group,signal);}catch{}
 for(const id of [...ids].reverse())try{process.kill(id,signal);}catch{}
 return [...ids];
}

export async function waitForProcesses(pids){
 if(!pids.length)return;
 while(true){
  const result=spawnSync('ps',['-o','stat=','-p',pids.join(',')],{encoding:'utf8'});
  if(result.error)throw result.error;
  if(result.status!==0&&result.status!==1)throw new Error('Tidak dapat memastikan proses sudah berhenti.');
  if(!result.stdout.trim().split(/\s+/).some(state=>state&&!/^[ZX]/.test(state)))return;
  await new Promise(resolve=>setTimeout(resolve,100));
 }
}
