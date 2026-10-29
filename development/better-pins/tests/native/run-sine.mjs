import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,cpSync,readdirSync,existsSync} from 'node:fs';
import {join,resolve,relative} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=resolve('.backup-scratch/native');mkdirSync(root,{recursive:true});
const source=resolve('artifacts/review-runtime');
const runtimeIdentity=JSON.parse(readFileSync(join(source,'identity.json'),'utf8'));
const profile=mkdtempSync(join(root,'profile-')),chrome=join(profile,'chrome');mkdirSync(chrome);
const hashes={},hash=f=>createHash('sha256').update(readFileSync(f)).digest('hex');
function files(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(join(dir,e.name)):[join(dir,e.name)]);}
for(const [file,digest]of Object.entries(runtimeIdentity.files)){if(hash(join(source,file))!==digest)throw Error('Review runtime mismatch: '+file);}
for(const part of ['JS','utils']){cpSync(join(source,part),join(chrome,part),{recursive:true});for(const file of files(join(chrome,part)))hashes[relative(chrome,file)]=hash(file);}
const theme=JSON.parse(readFileSync('theme.json','utf8')),dir=join(chrome,'sine-mods','better-pins');mkdirSync(join(dir,'scripts'),{recursive:true});
for(const file of ['theme.json','preferences.json','chrome.css','scripts/better-pins.uc.mjs']){cpSync(file,join(dir,file));if(hash(file)!==hash(join(dir,file)))throw Error('Candidate copy mismatch');}
const registry={};let companions=null;
if(process.env.BP_TEST_COMBINED==='1'){
 const iconsDir=resolve(chrome,'sine-mods','zen-icons-local');
 if(existsSync(iconsDir)||!iconsDir.startsWith(resolve(profile)+'\\'))throw Error('Unsafe fixture Icons destination');
 cpSync(resolve('.backup-scratch/companions/zen-icons-local'),iconsDir,{recursive:true});
 const bzfDir=join(chrome,'sine-mods','better-zen-folders'),bzfSource=resolve('.backup-scratch/companions/better-zen-folders');mkdirSync(join(bzfDir,'scripts'),{recursive:true});
 for(const f of ['theme.json','preferences.json','chrome.css','scripts/better-zen-folders.uc.mjs'])cpSync(join(bzfSource,f),join(bzfDir,f));
 registry['zen-icons-local']={...JSON.parse(readFileSync(join(iconsDir,'theme.json'),'utf8')),origin:'local',enabled:true,'no-updates':true};
 registry['better-zen-folders']={...JSON.parse(readFileSync(join(bzfDir,'theme.json'),'utf8')),id:'better-zen-folders',origin:'local',enabled:true,'no-updates':true};
 companions={bzf:hash(join(bzfDir,'scripts/better-zen-folders.uc.mjs')),icons:hash(join(iconsDir,'runtime.sys.mjs'))};
}
registry['better-pins']={...theme,id:'better-pins',origin:'local',enabled:true,'no-updates':true};
if(process.env.BP_TEST_NEWTAB==='1'){
 const source=resolve('.backup-scratch/companions/even-better-new-tab'),dest=join(chrome,'sine-mods','even-better-new-tab');mkdirSync(dest,{recursive:true});
 const inventory={};for(const file of ['theme.json','preferences.json','userChrome.css','newtab-layout.uc.mjs']){cpSync(join(source,file),join(dest,file));inventory[file]=hash(join(dest,file));}
 registry['even-better-new-tab']={...JSON.parse(readFileSync(join(dest,'theme.json'),'utf8')),id:'even-better-new-tab',origin:'local',enabled:true,'no-updates':true};
 companions={...companions,newTab:inventory};
}
writeFileSync(join(chrome,'sine-mods','mods.json'),JSON.stringify(registry));
const run=spawnSync(process.execPath,['tests/native/driver.mjs','tests/native/sine.js'],{env:{...process.env,BP_TEST_PROFILE:profile,BP_TEST_SCREENSHOT:'1'},windowsHide:true,encoding:'utf8',timeout:90000});
const intact=Object.entries(hashes).every(([f,digest])=>hash(join(chrome,f))===digest);
const result={profile,companions,engineIntact:intact,engineHashes:hashes,package:JSON.parse(readFileSync('artifacts/package-identity.json','utf8')),exitCode:run.status,stdout:run.stdout,stderr:run.stderr};
writeFileSync(join(root,'sine-'+Date.now()+'.json'),JSON.stringify(result,null,2));console.log(run.stdout);console.error(run.stderr);process.exitCode=run.status||(!intact?1:0);
