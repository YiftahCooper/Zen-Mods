import {cp,mkdir,mkdtemp,readFile,writeFile,readdir} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';

// Assemble a fresh project from checked-in inputs only. The installable runtime
// remains the single source of truth; outputs never enter source/fixture trees.
const home=fileURLToPath(new URL('../',import.meta.url));
const runtime=resolve(home,'../../better-zen-folders');
const scratch=join(home,'.backup-scratch');await mkdir(scratch,{recursive:true});
const project=await mkdtemp(join(scratch,'test-project-'));
for(const part of ['tests','fixtures'])await cp(join(home,part),join(project,part),{recursive:true});
await cp(join(home,'fixture-project'),project,{recursive:true});
for(const part of ['chrome.css','preferences.json','theme.json','scripts/better-zen-folders.uc.mjs']){
 await mkdir(dirname(join(project,part)),{recursive:true});await cp(join(runtime,part),join(project,part));
}
await mkdir(join(project,'scripts'),{recursive:true});
await cp(join(home,'tools/stage-test-profile.ps1'),join(project,'scripts/stage-test-profile.ps1'));
await cp(join(home,'reference-guide.md'),join(project,'README.md'));
await cp(join(home,'verification-history.md'),join(project,'VERIFICATION.md'));
await writeFile(join(project,'package.json'),JSON.stringify({type:'module'}));
console.log('Isolated test project:',project);
if(process.argv.includes('--prepare'))process.exit(0);
const env={...process.env,PYTHONDONTWRITEBYTECODE:'1'};
if(!env.BZF_PLAYWRIGHT_MODULE){
 try{env.BZF_PLAYWRIGHT_MODULE=createRequire(import.meta.url).resolve('playwright');}
 catch{console.log('Playwright not installed: rendering cases will explicitly skip.');}
}
let result;
if(process.argv.includes('--python')){
 const python=env.BZF_PYTHON || (process.platform==='win32'?'python':'python3');
 result=spawnSync(python,['-m','unittest','discover','-s','tests','-p','test*.py','-v'],{cwd:project,env,stdio:'inherit'});
}else{
 const tests=(await readdir(join(project,'tests'))).filter(n=>n.endsWith('.test.mjs')).sort().map(n=>join('tests',n));
 result=spawnSync(process.execPath,['--test',...tests],{cwd:project,env,stdio:'inherit'});
}
if(result.error)throw result.error;
if(result.signal)throw Error('Test process terminated by '+result.signal);
process.exitCode=result.status??1;
