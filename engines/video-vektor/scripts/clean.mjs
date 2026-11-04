import {acquireLock,cleanup,paths} from './lib/pipeline.mjs';
import {projectEnvironment,projectPaths} from './lib/project.mjs';
const selected=process.argv.indexOf('--project');
if(selected>=0)Object.assign(process.env,projectEnvironment(projectPaths(process.argv[selected+1])));
const p=paths(),release=acquireLock(p);
try{
 const result=cleanup({p,purge:process.argv.includes('--checkpoints'),dryRun:process.argv.includes('--dry-run')});
 for(const file of result.targets)console.log(`${result.dryRun?'Would remove':'Removed'}: ${file}`);
 console.log(`${result.dryRun?'Can clean':'Cleaned'} ${(result.bytes/1024/1024).toFixed(1)} MB. Latest final output and source assets preserved.`);
 if(!process.argv.includes('--checkpoints'))console.log('Complete picture cache retained. Use --checkpoints to explicitly discard it.');
}finally{release();}
