import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join,resolve} from 'node:path';
const out=resolve('.backup-scratch/final-'+Date.now());mkdirSync(out,{recursive:true});
const identity=JSON.parse(readFileSync('artifacts/package-identity.json','utf8'));
const hash=f=>createHash('sha256').update(readFileSync(f)).digest('hex');
const check=()=>Object.entries(identity.files).every(([f,v])=>hash(f)===v);
if(!check())throw Error('Build identity stale');
const results=[];let preservedFrom=null;
if(process.argv[2]){
 const prior=resolve(process.argv[2]);if(!prior.startsWith(resolve('.backup-scratch')+'\\final-'))throw Error('Invalid evidence resume path');
 const data=JSON.parse(readFileSync(join(prior,'result.json'),'utf8'));
 if(JSON.stringify(data.identity)!==JSON.stringify(identity))throw Error('Cannot reuse evidence for changed package');
 preservedFrom=prior;
 results.push(...data.results.filter(r=>['standalone','folders-after','clean-restart','folders-before','windows-all','windows-pinned'].includes(r.name)&&r.exitCode===0&&r.unchanged).map(r=>({...r,preservedFrom:prior})));
}
function run(name,script,env={}){
 const retained=results.find(r=>r.name===name);if(retained)return retained;
 const start=new Date().toISOString();console.log('Starting '+name);
 const args=script==='run-sine.mjs'?['tests/native/run-sine.mjs']:['tests/native/driver.mjs','tests/native/'+script];
 const r=spawnSync(process.execPath,args,{encoding:'utf8',windowsHide:true,timeout:100000,env:{...process.env,BP_TEST_PROFILE:'',BP_TEST_MODE:'after',BZF_SPIKE_SYNC:'pinned',BZF_SPIKE_EXIT:'',...env}});
 writeFileSync(join(out,name+'.stdout.txt'),r.stdout??'');writeFileSync(join(out,name+'.stderr.txt'),r.stderr??'');
 const receipts=readdirSync('.backup-scratch/native').filter(n=>/^receipt-.*\.json$/.test(n)).map(n=>({file:n,value:JSON.parse(readFileSync(join('.backup-scratch/native',n),'utf8'))})).filter(r=>r.value.started>=start).sort((a,b)=>a.value.started.localeCompare(b.value.started));
 const result={name,exitCode:r.status,error:r.error?String(r.error):null,receipts:receipts.map(r=>'../native/'+r.file),profile:receipts.at(-1)?.value.profile,unchanged:check()};results.push(result);
 console.log(name+': '+(r.status===0&&result.unchanged?'PASS':'FAIL'));
 writeFileSync(join(out,'result.json'),JSON.stringify({identity,preservedFrom,results,passed:results.every(r=>r.exitCode===0&&r.unchanged)},null,2));
 if(r.status!==0||!result.unchanged)throw Error(name+' failed; retained '+out);
 return result;
}
run('standalone','candidate.js');
const after=run('folders-after','lifecycle.js');run('clean-restart','restart.js',{BP_TEST_PROFILE:after.profile});
run('folders-before','lifecycle.js',{BP_TEST_MODE:'before'});
run('windows-all','windows.js',{BZF_SPIKE_SYNC:'all'});run('windows-pinned','windows.js');
const abrupt=run('saved-abrupt','lifecycle.js',{BZF_SPIKE_EXIT:'abrupt'});run('saved-abrupt-restart','restart.js',{BP_TEST_PROFILE:abrupt.profile});
run('normal-sine-pointer','run-sine.mjs');
console.log('Final matrix retained: '+out);
