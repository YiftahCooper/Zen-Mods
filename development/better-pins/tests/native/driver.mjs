// Disposable feasibility harness only. Never imports or edits either mod/profile.
import net from 'node:net';
import {spawn} from 'node:child_process';
import {mkdirSync, mkdtempSync, writeFileSync, readFileSync} from 'node:fs';
import {resolve, join, sep} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
const root=fileURLToPath(new URL('../../.backup-scratch/native/',import.meta.url));
mkdirSync(root,{recursive:true});
const profile=process.env.BP_TEST_PROFILE || mkdtempSync(join(root,'profile-'));
if (!resolve(profile).startsWith(resolve(root)+'\\profile-')) throw Error('Refusing non-spike profile');
const port=await new Promise(r=>{const s=net.createServer();s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>r(p));});});
const prefs={
 'bp.test.source-root':pathToFileURL(resolve('.')+sep).href,
 'bp.test.bzf-root':pathToFileURL(resolve('.backup-scratch/companions/better-zen-folders')+sep).href,
 'marionette.port':port,'marionette.enabled':true,'remote.active-protocols':1,'browser.dom.window.dump.enabled':true,
 'browser.shell.checkDefaultBrowser':false,'browser.startup.page':3,
 'browser.startup.homepage':'about:blank','browser.aboutwelcome.enabled':false,
 'zen.welcome-screen.seen':true,'zen.workspaces.force-container-workspace':false,
 'browser.startup.homepage_override.mstone':'ignore','browser.sessionstore.resume_from_crash':true,
 'browser.sessionstore.interval':1000,'browser.sessionstore.warnOnQuit':false,
 'browser.warnOnQuit':false,'browser.tabs.warnOnClose':false,
 'app.update.auto':false,'app.update.enabled':false,
 'datareporting.policy.dataSubmissionEnabled':false,'toolkit.telemetry.enabled':false,
 'network.proxy.type':process.env.BP_TEST_INTERNET==='1'?0:1,'network.proxy.http':'127.0.0.1','network.proxy.http_port':9,
 'network.proxy.ssl':'127.0.0.1','network.proxy.ssl_port':9,'network.proxy.no_proxies_on':'localhost, 127.0.0.1',
 'browser.newtabpage.enabled':false,'browser.newtab.preload':false,
 'bzf.spike.project-regular':process.env.BZF_SPIKE_AREA!=='priority',
 'zen.window-sync.sync-only-pinned-tabs':process.env.BZF_SPIKE_SYNC!=='all',
 'bp.test.mode':process.env.BP_TEST_MODE || 'after','bp.test.combined':process.env.BP_TEST_COMBINED === '1','bzf.spike.rename-mode':process.env.BZF_RENAME_MODE || 'native',
 'bzf.proof.guard':process.env.BZF_PIN_GUARD === '1',
 'bzf.proof.base-url':process.env.BZF_PIN_BASE_URL || '',
 'bzf.proof.ordered-reset':process.env.BZF_PIN_ORDERED === '1',
 'bzf.proof.delay-ms':Number(process.env.BZF_PIN_DELAY || 0),
 'bzf.proof.background-delay-ms':Number(process.env.BZF_PIN_BG_DELAY || 0),
 'browser.sessionstore.restore_pinned_tabs_on_demand':process.env.BZF_PIN_LAZY === '1',
 'better-pins.consent-version':1,'zen.pinned-tab-manager.restore-pinned-tabs-to-pinned-url':false,'sine.allow-unsafe-js':true,'sine.auto-updates':false,'sine.engine.auto-update':false,
 'better-zen-folders.folder-url-pins-enabled':process.env.BZF_PIN_RUNTIME === '1',
 ...(process.env.BZF_PIN_RUNTIME === '1' ? {
   'better-zen-folders.folder-url-pins-consent-version':1,
   'zen.pinned-tab-manager.restore-pinned-tabs-to-pinned-url':false,
 } : {}),
};
writeFileSync(join(profile,'user.js'),Object.entries(prefs).map(([k,v])=>`user_pref(${JSON.stringify(k)}, ${JSON.stringify(v)});`).join('\n'));
const log=[];
const headed=process.env.BP_TEST_HEADED==='1';
const childEnv={...process.env,MOZ_NO_REMOTE:'1',MOZ_CRASHREPORTER_DISABLE:'1'};
if(headed)delete childEnv.MOZ_HEADLESS;else childEnv.MOZ_HEADLESS='1';
const proc=spawn(process.env.BP_ZEN_BINARY||'C:/Program Files/Zen Browser/zen.exe',[...(!headed?['-headless']:[]),'-no-remote','-profile',profile,'--marionette','--remote-allow-system-access'],{
 windowsHide:true,stdio:['ignore','pipe','pipe'],env:childEnv,
});
proc.stdout.on('data',d=>{log.push(d.toString());if(d.toString().includes('SPIKE:'))process.stdout.write(d);});proc.stderr.on('data',d=>log.push(d.toString()));
let socket,buffer=Buffer.alloc(0),next=0;const pending=new Map();
const delay=ms=>new Promise(r=>setTimeout(r,ms));
function receive(data){buffer=Buffer.concat([buffer,data]);while(true){const colon=buffer.indexOf(58);if(colon<0)return;const n=Number(buffer.subarray(0,colon).toString());if(buffer.length<colon+1+n)return;const msg=JSON.parse(buffer.subarray(colon+1,colon+1+n));buffer=buffer.subarray(colon+1+n);if(Array.isArray(msg)&&msg[0]===1){const p=pending.get(msg[1]);if(p){pending.delete(msg[1]);clearTimeout(p.timer);msg[2]?p.reject(Error(JSON.stringify(msg[2]))):p.resolve(msg[3]);}}}}
function command(name,parameters={}){return new Promise((resolve,reject)=>{const id=++next;const timer=setTimeout(()=>{pending.delete(id);reject(Error('Timeout '+name));},45000);pending.set(id,{resolve,reject,timer});const body=JSON.stringify([0,id,name,parameters]);socket.write(Buffer.byteLength(body)+':'+body);});}
const results={profile,pid:proc.pid,port,started:new Date().toISOString(),steps:[]};
const receiptId=`${proc.pid}-${Date.now()}`;
try{
 for(let i=0;i<100;i++){try{socket=await new Promise((resolve,reject)=>{const s=net.connect({host:'127.0.0.1',port},()=>resolve(s));s.once('error',reject);});break;}catch{if(proc.exitCode!==null)throw Error('Zen exited '+proc.exitCode);await delay(200);}}
 if(!socket)throw Error('Marionette did not start');socket.on('data',receive);
 const session=await command('WebDriver:NewSession',{acceptInsecureCerts:false,unhandledPromptBehavior:'dismiss and notify'});
 results.session=session;
 const actual=session.capabilities?.['moz:profile'];if(!actual||resolve(actual)!==resolve(profile))throw Error('Wrong profile '+actual);
 await command('Marionette:SetContext',{value:'chrome'});
 const execute=script=>command('WebDriver:ExecuteScript',{script,args:[],newSandbox:false,sandbox:'system',scriptTimeout:40000});
 const executeAsync=script=>command('WebDriver:ExecuteAsyncScript',{script,args:[],newSandbox:false,sandbox:'system',scriptTimeout:40000});
 for(let i=0;i<60;i++){const state=await execute('return {ready: !!(window.gZenFolders && window.gZenWorkspaces?.activeWorkspace), location:location.href, workspaces:window.gZenWorkspaces?.getWorkspaces?.()?.length};');results.ready=state;if(state.value?.ready||state.ready)break;await delay(200);}
 const file=process.argv[2];
 if(file){const code=readFileSync(resolve(file),'utf8');const result=await executeAsync(code);results.steps.push({file,result});const value=result.value??result;if(value.error||value.results?.some(t=>!t.pass))process.exitCode=1;}
 else results.steps.push(await execute('return {location:location.href, folders:!!window.gZenFolders, workspace:window.gZenWorkspaces?.activeWorkspace, tabs:window.gBrowser?.tabs?.length, keys:Object.keys(window.gZenWorkspaces||{})};'));
 if(process.env.BP_TEST_SCREENSHOT==='1'){
 const position=await execute('return window.__bpPointerPosition;');const p=position.value??position;
 if(p&&Number.isFinite(p.x)&&Number.isFinite(p.y)){await command('WebDriver:PerformActions',{actions:[{type:'pointer',id:'bp-mouse',parameters:{pointerType:'mouse'},actions:[{type:'pointerMove',duration:0,x:p.x,y:p.y},{type:'pointerDown',button:0},{type:'pointerMove',duration:250,x:p.x,y:p.y+45},{type:'pointerUp',button:0}]}]});
 const check=await execute('return {before:window.__bpPointerBefore,after:Services.prefs.getIntPref("better-pins.upper-percent",50)};');results.pointer=check.value??check;if(results.pointer.after<=results.pointer.before)process.exitCode=1;}
 const shot=await command('WebDriver:TakeScreenshot',{full:true});const png=shot.value??shot;writeFileSync(join(root,'screenshot-'+receiptId+'.png'),Buffer.from(png,'base64'));results.screenshot='screenshot-'+receiptId+'.png';} console.log(JSON.stringify(results,null,2));
 if(process.env.BP_TEST_DRAG==='1'){
  results.drags=[];
  for(const mode of ['expanded','collapsed-external','collapsed-selected-child']){
   const response=await executeAsync(`window.__bpPrepareDrag(${JSON.stringify(mode)}).then(arguments[arguments.length-1]);`),p=response.value??response;
   await command('WebDriver:PerformActions',{actions:[{type:'pointer',id:'folder-mouse',parameters:{pointerType:'mouse'},actions:[{type:'pointerMove',duration:0,x:p.sx,y:p.sy},{type:'pointerDown',button:0},{type:'pointerMove',duration:300,x:p.sx+12,y:p.sy+6},{type:'pointerMove',duration:500,x:p.dx,y:p.dy},{type:'pause',duration:150}]}]});
   const over=await execute('return window.__bpCheckDrag();');const screenshot=await command('WebDriver:TakeScreenshot',{full:true});writeFileSync(join(root,`drag-${mode}-${receiptId}.png`),Buffer.from(screenshot.value??screenshot,'base64'));
   await command('WebDriver:PerformActions',{actions:[{type:'pointer',id:'folder-mouse',parameters:{pointerType:'mouse'},actions:[{type:'pointerMove',duration:100,x:p.dx,y:p.dy},{type:'pointerUp',button:0}]}]});await command('WebDriver:ReleaseActions');await delay(300);
   const after=await execute('return window.__bpCheckDrag();');const r={mode,over:over.value??over,after:after.value??after};r.pass=r.over.markerVisible&&r.after.area==='lower'&&r.after.children===2;results.drags.push(r);if(!r.pass)process.exitCode=1;
  }
 }
 if(process.env.BP_TEST_SETTINGS==='1'){
  await command('Marionette:SetContext',{value:'content'});
  await command('WebDriver:Navigate',{url:'about:preferences#sineMods'});
  const check=await executeAsync(readFileSync(resolve('tests/native/settings.js'),'utf8'));results.settings=check.value??check;if(results.settings.error)process.exitCode=1;
  for(const [name,offset]of [['top',0],['bottom',10000]]){
   await execute(`if(window.__bpSettingsDialog)window.__bpSettingsDialog.querySelector('.sineItemPreferenceDialogContent').scrollTop=${offset};`);
   await delay(100);const shot=await command('WebDriver:TakeScreenshot',{full:false});writeFileSync(join(root,'settings-'+name+'-'+receiptId+'.png'),Buffer.from(shot.value??shot,'base64'));
  }
  await command('Marionette:SetContext',{value:'chrome'});
 }
}catch(error){results.error=String(error);if(socket)try{results.partial=await command('WebDriver:ExecuteScript',{script:'return window.__twoAreaSpikeProgress || null;',args:[],sandbox:'system',newSandbox:false});}catch{}console.error(JSON.stringify(results,null,2));process.exitCode=1;}
finally{
 if(process.env.BZF_SPIKE_EXIT==='abrupt'&&results.session?.capabilities?.['moz:processID']){
  results.abruptTermination=true;process.kill(results.session.capabilities['moz:processID']);socket?.destroy();
 }else if(socket){try{await command('Marionette:Quit',{flags:['eAttemptQuit']});}catch{}socket.destroy();}
 for(let i=0;i<40&&proc.exitCode===null;i++)await delay(100);
 if(proc.exitCode===null)proc.kill();
 results.exitCode=proc.exitCode;results.finished=new Date().toISOString();
 writeFileSync(join(root,`receipt-${receiptId}.json`),JSON.stringify(results,null,2),{flag:'wx'});
 writeFileSync(join(root,`zen-${receiptId}.log`),log.join(''),{flag:'wx'});
}
