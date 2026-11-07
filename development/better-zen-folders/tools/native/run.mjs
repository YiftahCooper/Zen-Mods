import {readFile,mkdir,mkdtemp,cp,writeFile,readdir} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import http from 'node:http';
import {spawn} from 'node:child_process';

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
// Synthetic loopback pages only. /churn retitles itself, /type reports typed
// length in its title once, /feed.xml is a small RSS feed for a live folder.
const page=(req)=>{
 const url=new URL(req.url,'http://'+req.headers.host),q=k=>Math.max(0,Math.min(10000,Number(url.searchParams.get(k))||0));
 if(url.pathname==='/churn')return ['text/html','<!doctype html><title>churn-0</title><p>Title churn</p><script>let i=0;const n='+q('n')+',ms='+q('ms')+';setTimeout(function t(){i++;document.title=i<n?"churn-"+i:"churn-done";if(i<n)setTimeout(t,ms);},'+q('delay')+');</script>'];
 if(url.pathname==='/type')return ['text/html','<!doctype html><title>type-ready</title><textarea id="t" autofocus></textarea><script>const t=document.getElementById("t"),n='+q('n')+';t.focus();t.addEventListener("input",()=>{if(t.value.length>=n)document.title="typed-"+t.value.length;});</script>'];
 if(url.pathname==='/feed.xml'){const base='http://'+req.headers.host,date=new Date(Date.now()-60000).toUTCString(),items=[1,2,3].map(i=>'<item><title>Feed item '+i+'</title><link>'+base+'/item-'+i+'</link><guid>bzf-item-'+i+'</guid><pubDate>'+date+'</pubDate></item>').join('');
  return ['application/rss+xml','<?xml version="1.0"?><rss version="2.0"><channel><title>Synthetic feed</title><link>'+base+'/</link><description>Loopback</description>'+items+'</channel></rss>'];}
 return ['text/html','<!doctype html><title>Synthetic page</title><p>Loopback test '+req.url+'</p>'];
};
const server=http.createServer((req,res)=>{const [type,body]=page(req);res.writeHead(200,{'Content-Type':type});res.end(body);});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
process.env.BZF_PIN_BASE_URL='http://127.0.0.1:'+server.address().port;
registry['bzf-synthetic-homepage']={id:'bzf-synthetic-homepage',name:'Synthetic homepage proof',homepage:process.env.BZF_PIN_BASE_URL+'/homepage',enabled:false,origin:'local','no-updates':true};
await writeFile(join(mods,'mods.json'),JSON.stringify(registry));
process.env.BZF_NATIVE_ROOT=scratch;process.env.BZF_SPIKE_PROFILE=profile;
process.env.BZF_PIN_RUNTIME=process.env.BZF_TEST_PINS||'1';
// Several probe names run in order against the same owned profile, one Zen
// instance at a time (for example a restart: phase 1 quits, phase 2 resumes).
const names=process.argv.length>2?process.argv.slice(2):['folder-plus.js'];
const known=['folder-plus.js','folder-plus-baseline.js','settings-homepage.js','perf-observers.js','checklist.js','restart-move.js','restart-verify.js'];
for(const name of names)if(!known.includes(name))throw Error('Unknown native probe '+name);
let failed=false;
try{
 for(const name of names){
  const previous=new Set(await readdir(scratch));
  const code=await new Promise((done,fail)=>{const child=spawn(process.execPath,[fileURLToPath(new URL('base-driver.mjs',import.meta.url)),fileURLToPath(new URL(name,import.meta.url))],{stdio:['ignore','ignore','inherit'],env:process.env});child.on('error',fail);child.on('exit',done);});
  const receipts=(await readdir(scratch)).filter(n=>n.startsWith('receipt-')&&!previous.has(n));
  const matches=[];
  for(const n of receipts){const r=JSON.parse(await readFile(join(scratch,n),'utf8'));if(resolve(r.profile)===resolve(profile))matches.push(r);}
  if(matches.length!==1)throw Error('Expected one receipt for owned profile ('+name+', driver exit '+code+')');
  const r=matches[0],value=r.steps[0]?.result?.value;
  console.log(JSON.stringify({probe:name,browser:r.session?.capabilities?.browserVersion,candidate:theme.version,exitCode:r.exitCode,value:value??null,error:r.error??value?.error??null}));
  if(r.error||value?.error||!r.steps.length){failed=true;break;}
 }
}finally{await new Promise(r=>server.close(r));}
if(failed)process.exitCode=1;
