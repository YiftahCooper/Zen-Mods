import {readFile,mkdir,mkdtemp,cp,writeFile,readdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import http from 'node:http';

const home=fileURLToPath(new URL('../../',import.meta.url));
if(!process.env.BZF_SINE_BOOTSTRAP)throw Error('Set BZF_SINE_BOOTSTRAP to chrome/ in a clean, disposable Sine bootstrap installation. Never supply an everyday profile.');
const scratch=join(home,'.backup-scratch/native');await mkdir(scratch,{recursive:true});
const profile=await mkdtemp(join(scratch,'profile-'));
const bootstrap=resolve(process.env.BZF_SINE_BOOTSTRAP);
await mkdir(join(profile,'chrome'),{recursive:true});
for(const part of ['JS','utils'])await cp(join(bootstrap,part),join(profile,'chrome',part),{recursive:true});
const candidate=resolve(process.env.BZF_CANDIDATE||join(home,'../../better-zen-folders'));
const theme=JSON.parse(await readFile(join(candidate,'theme.json'),'utf8'));
const mods=join(profile,'chrome/sine-mods');await mkdir(mods,{recursive:true});
await cp(candidate,join(mods,theme.id),{recursive:true});
const registry={[theme.id]:{...theme,enabled:true,origin:'local','no-updates':true}};
if(process.env.BZF_WITH_ICONS==='1'){
 const source=resolve(home,'../../zen-icons'),icons=JSON.parse(await readFile(join(source,'theme.json'),'utf8'));
 await cp(source,join(mods,icons.id),{recursive:true});registry[icons.id]={...icons,enabled:true,origin:'local','no-updates':true};
}
const server=http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><title>Synthetic page</title><p>Loopback test '+req.url+'</p>');});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
process.env.BZF_PIN_BASE_URL='http://127.0.0.1:'+server.address().port;
registry['bzf-synthetic-homepage']={id:'bzf-synthetic-homepage',name:'Synthetic homepage proof',homepage:process.env.BZF_PIN_BASE_URL+'/homepage',enabled:false,origin:'local','no-updates':true};
await writeFile(join(mods,'mods.json'),JSON.stringify(registry));
process.env.BZF_NATIVE_ROOT=scratch;process.env.BZF_SPIKE_PROFILE=profile;
process.env.BZF_PIN_RUNTIME=process.env.BZF_TEST_PINS||'1';
const name=process.argv[2]||'folder-plus.js';
if(!['folder-plus.js','folder-plus-baseline.js','settings-homepage.js'].includes(name))throw Error('Unknown native probe');
process.argv[2]=fileURLToPath(new URL(name,import.meta.url));
try{
 const previous=new Set(await readdir(scratch));await import('./base-driver.mjs');
 const receipts=(await readdir(scratch)).filter(n=>n.startsWith('receipt-')&&!previous.has(n));
 const matches=[];
 for(const n of receipts){const r=JSON.parse(await readFile(join(scratch,n),'utf8'));if(resolve(r.profile)===resolve(profile))matches.push(r);}
 if(matches.length!==1)throw Error('Expected one receipt for owned profile');
 const r=matches[0],value=r.steps[0]?.result?.value;
 if(r.error||value?.error)throw Error(JSON.stringify(r.error||value));
 console.log(JSON.stringify({browser:r.session?.capabilities?.browserVersion,value}));
}finally{await new Promise(r=>server.close(r));}
