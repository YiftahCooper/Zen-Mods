const done=arguments[arguments.length-1];
// Capture this mod's console errors/warnings and script errors during the run.
const bzfConsole=[];const bzfMatch=(t,f)=>/better.zen.folders/i.test(String(t)+' '+String(f??''));
const bzfScript={observe(m){try{if(m instanceof Ci.nsIScriptError&&bzfMatch(m.errorMessage,m.sourceName))bzfConsole.push('script: '+String(m.errorMessage).slice(0,300));}catch{}}};
const bzfApi=e=>{try{if(['error','warn','exception','assert'].includes(e.level)){const t=(e.arguments??[]).map(a=>{try{return String(a?.message??a);}catch{return '?';}}).join(' ');if(bzfMatch(t,e.filename))bzfConsole.push(e.level+': '+t.slice(0,300));}}catch{}};
Services.console.registerListener(bzfScript);
const bzfStorage=Cc['@mozilla.org/consoleAPI-storage;1'].getService(Ci.nsIConsoleAPIStorage);bzfStorage.addLogEventListener(bzfApi,Services.scriptSecurityManager.getSystemPrincipal());
const bzfStopConsole=()=>{Services.console.unregisterListener(bzfScript);bzfStorage.removeLogEventListener(bzfApi);return bzfConsole;};
// 0.3.27 performance probe: counts Better Zen Folders reconciles caused by tab
// title churn, page loads and typing in a disposable profile with ~300 tabs.
// Observers are counted through a chrome-context MutationObserver wrapper that
// is installed only while stock Sine reloads the mod, then removed again.
(async()=>{
 const w=Services.wm.getMostRecentWindow('navigator:browser'),pause=ms=>new Promise(r=>w.setTimeout(r,ms)),now=()=>w.performance.now();
 const wait=async(fn,label,tries=500,ms=20)=>{for(let i=0;i<tries;i++){if(fn())return;await pause(ms);}throw Error('Timeout '+label);};
 const assert=(ok,why)=>{if(!ok)throw Error(why);};
 const ID='5b0aa51f-cea7-4de5-8344-3e86e77fb88d';
 await wait(()=>w.__betterZenFoldersController?.started,'BZF');
 const utils=ChromeUtils.importESModule('chrome://userscripts/content/core/utils.sys.mjs').default;
 const sine=ChromeUtils.importESModule('chrome://userscripts/content/core/manager.sys.mjs').default;
 const version=(await utils.getMods())[ID]?.version;
 const base=Services.prefs.getStringPref('bzf.proof.base-url');
 // Background pages must not be timer-throttled while they retitle themselves.
 for(const [k,v] of [['dom.min_background_timeout_value',4],['dom.min_background_timeout_value_without_budget_throttling',4]])Services.prefs.setIntPref(k,v);
 Services.prefs.setBoolPref('dom.timeout.enable_budget_timer_throttling',false);
 const gB=w.gBrowser,started=now();
 // ~300 tabs: 12 folders x 8 lazy tabs (every third nested) plus 200 lazy loose tabs.
 const lazy=i=>gB.addTrustedTab(base+'/lazy-'+i,{createLazyBrowser:true,inBackground:true,lazyTabTitle:'Lazy '+i});
 const folders=[];let n=0;
 for(let f=0;f<12;f++){
  const tabs=[];for(let i=0;i<8;i++)tabs.push(lazy(n++));
  const folder=await w.gZenFolders.createFolder(tabs,{renameFolder:false,label:'Perf '+f,insertBefore:tabs[0]});
  if(f%3===2){folders[f-1].groupContainer.appendChild(folder);gB.tabContainer._invalidateCachedTabs();}
  folders.push(folder);
 }
 for(let i=0;i<200;i++)lazy(n++);
 await pause(1500);
 const setup={tabs:gB.tabs.length,folders:w.document.querySelectorAll('zen-folder').length,ms:Math.round(now()-started)};
 // Install counting MutationObserver only for the reload.
 const Orig=w.MutationObserver,observers=[];
 function Counting(callback){
  const stats={calls:0,records:0,ms:0,observes:0,disconnects:0};
  const real=new Orig((records)=>{stats.calls++;stats.records+=records.length;const t=now();try{callback(records,proxy);}finally{stats.ms+=now()-t;}});
  const proxy={observe(t,o){stats.observes++;return real.observe(t,o);},disconnect(){stats.disconnects++;return real.disconnect();},takeRecords(){return real.takeRecords();}};
  observers.push({proxy,stats});return proxy;
 }
 const old=w.__betterZenFoldersController;
 w.MutationObserver=Counting;
 try{
  await sine.rebuildMods();await sine.loadMods(null,[ID]);
  await wait(()=>w.__betterZenFoldersController!==old&&w.__betterZenFoldersController?.started,'reload');
 }finally{w.MutationObserver=Orig;}
 assert(!old.started,'old controller still active after reload');
 const c=w.__betterZenFoldersController,managers=[...c.adapters.managers];
 const find=name=>managers.find(m=>m.constructor?.name===name);
 const pins=find('FolderPinRuntime');
 const named={
  sticky:find('StickyFolderVisibilityManager'),colour:find('FolderColorManager'),icon:find('FolderIconIntegrityManager'),
  button:find('FolderButtonManager'),unload:find('FolderUnloadManager'),empty:find('EmptyRegularFolderManager'),
  restore:find('FolderRestoreManager')?.metadataSynchronizer,pinPresentation:pins?.presentation,pinRoots:pins?.roots,
 };
 const stats=label=>{const o=named[label]?.observer;return o?observers.find(x=>x.proxy===o)?.stats:null;};
 // Deferred/real work counters on the live instances.
 const work={};
 const wrap=(label,obj,method)=>{
  if(!obj||typeof obj[method]!=='function')return;
  const orig=obj[method],s=work[label]={calls:0,ms:0};
  obj[method]=function(...a){s.calls++;const t=now();try{return orig.apply(this,a);}finally{s.ms+=now()-t;}};
 };
 wrap('sticky.refresh',named.sticky,'refresh');
 wrap('pinPresentation.refresh',named.pinPresentation,'refresh');
 wrap('pinRoots.refresh',named.pinRoots,'refresh');
 wrap('colour.reconcileAll',named.colour,'reconcileAll');
 wrap('icon.reconcileAll',named.icon,'reconcileAll');
 wrap('button.reconcileAll',named.button,'reconcileAll');
 wrap('unload.reconcile',named.unload,'reconcile');
 wrap('restore.synchronize',named.restore,'synchronize');
 wrap('restore.synchronizeTabs',named.restore,'synchronizeTabs');
 wrap('restore.synchronizeTab',named.restore,'synchronizeTab');
 // SessionStore writes by the restore adapters (setCustomTabValue / clear).
 const ra=find('FolderRestoreManager')?.adapters,ssw={set:0,clear:0,samples:[]};
 if(ra){const real=ra.sessionStore;ra.sessionStore=new Proxy(real,{get(t,k){const v=t[k];if(k==='setCustomTabValue')return(...a)=>{ssw.set++;if(ssw.samples.length<2)try{ssw.samples.push({before:t.getCustomTabValue(a[0],a[1]),after:a[2]});}catch{}return v.apply(t,a);};return typeof v==='function'?v.bind(t):v;}});
  const clear=ra.clearRestoreValue;if(clear)ra.clearRestoreValue=(...a)=>{ssw.clear++;return clear(...a);};}
 // 0.3.26 hands two observers a bound reconcile directly; there an observer
 // callback is one reconcile. 0.3.27 routes them through instance methods.
 const directUnload=!named.unload?.onMutations,directIcon=!named.icon?.boundMutations;
 const snapshot=()=>{
  const obs={};for(const k of Object.keys(named)){const s=stats(k);obs[k]=s?{calls:s.calls,records:s.records,ms:+s.ms.toFixed(1)}:null;}
  const wk={};for(const [k,v] of Object.entries(work))wk[k]={calls:v.calls,ms:+v.ms.toFixed(1)};
  return {observers:obs,work:wk,sessionStore:{set:ssw.set,clear:ssw.clear}};
 };
 const diff=(a,b)=>{
  const out={observerCalls:{},observerMs:{},work:{},workMs:{},sessionStoreWrites:b.sessionStore.set-a.sessionStore.set,sessionStoreClears:b.sessionStore.clear-a.sessionStore.clear};
  for(const k of Object.keys(b.observers))if(b.observers[k]){out.observerCalls[k]=b.observers[k].calls-a.observers[k].calls;out.observerMs[k]=+(b.observers[k].ms-a.observers[k].ms).toFixed(1);}
  for(const k of Object.keys(b.work)){out.work[k]=b.work[k].calls-a.work[k].calls;out.workMs[k]=+(b.work[k].ms-a.work[k].ms).toFixed(1);}
  out.reconciles={
   sticky:out.work['sticky.refresh'],pinPresentation:out.work['pinPresentation.refresh'],pinRoots:out.work['pinRoots.refresh'],
   colour:out.work['colour.reconcileAll'],button:out.work['button.reconcileAll'],
   icon:directIcon?out.observerCalls.icon:out.work['icon.reconcileAll'],
   unload:directUnload?out.observerCalls.unload:out.work['unload.reconcile'],
   restoreFull:out.work['restore.synchronize'],
  };
  out.restoreTabLocalPasses=out.work['restore.synchronizeTabs']??0;
  out.totalBzfMs=+Object.values(out.observerMs).concat(Object.values(out.workMs)).reduce((x,y)=>x+y,0).toFixed(1);
  return out;
 };
 const allZero=r=>Object.values(r.reconciles).every(v=>!v);
 const results={version,browser:Services.appinfo.version,zen:Services.appinfo.version,setup,directUnload,directIcon,
  observersFound:Object.fromEntries(Object.keys(named).map(k=>[k,!!stats(k)]))};
 await pause(1500);
 // 1. Chrome-driven title churn: Gecko's own _setTabLabel path on every tab,
 //    one MutationObserver batch per title change.
 assert(typeof gB._setTabLabel==='function','gBrowser._setTabLabel missing');
 let a=snapshot(),t0=now();
 const all=[...gB.tabs];let changed=0;
 for(const tab of all){if(gB._setTabLabel(tab,'Churn '+changed))changed++;await pause(0);}
 await pause(600);
 const sample=all.find(t=>t.group);
 results.chromeTitleChurn={...diff(a,snapshot()),titleChanges:changed,wallMs:Math.round(now()-t0),
  textReplacedInLabel:sample?.querySelector('.tab-label')?.textContent===sample?.label};
 results.chromeTitleChurn.sessionStoreWriteSamples=ssw.samples.splice(0);
 results.chromeTitleChurn.pass=allZero(results.chromeTitleChurn)&&changed>250&&Object.values(results.chromeTitleChurn.observerCalls).some(v=>v>0);
 // 2. Real content title churn: 8 loopback pages retitle themselves 40 times
 //    (DOMTitleChanged -> setTabTitle). Four are inside a folder.
 const churn=[];for(let i=0;i<8;i++)churn.push(gB.addTrustedTab(base+'/churn?n=40&ms=25&delay=2500&i='+i,{inBackground:true}));
 const churnFolder=await w.gZenFolders.createFolder(churn.slice(0,4),{renameFolder:false,label:'Churn folder',insertBefore:churn[0]});
 await wait(()=>churn.every(t=>t.label==='churn-0'&&!t.linkedBrowser.webProgress?.isLoadingDocument),'churn pages loaded',400,20);
 await pause(300);
 a=snapshot();t0=now();
 await wait(()=>churn.every(t=>t.label==='churn-done'),'content churn '+churn.map(t=>t.label),1500,20);await pause(600);
 results.contentTitleChurn={...diff(a,snapshot()),titleChanges:churn.length*40,wallMs:Math.round(now()-t0)};
 results.contentTitleChurn.pass=allZero(results.contentTitleChurn);
 // 3. Page reloads of the same pages (busy/progress/label/image attributes).
 a=snapshot();t0=now();
 for(const t of churn)gB.reloadTab(t);
 await wait(()=>churn.every(t=>t.label==='churn-done'),'reload churn',1500,20);await pause(600);
 results.pageReloads={...diff(a,snapshot()),wallMs:Math.round(now()-t0)};
 results.pageReloads.pass=allZero(results.pageReloads);
 // 4. Typing 40 characters into a web page textarea through the real widget
 //    key path (nsITextInputProcessor), with the page focused.
 const typeTab=gB.addTrustedTab(base+'/type?n=40');gB.selectedTab=typeTab;
 await wait(()=>typeTab.label==='type-ready'&&!typeTab.linkedBrowser.webProgress?.isLoadingDocument,'type page',400,20);
 w.focus();typeTab.linkedBrowser.focus();await pause(500);
 let chromeKeypress=0;const kp=e=>{if(e.target===typeTab.linkedBrowser||e.originalTarget===typeTab.linkedBrowser)chromeKeypress++;};
 w.addEventListener('keypress',kp,{capture:true,mozSystemGroup:true});
 const tip=Cc['@mozilla.org/text-input-processor;1'].createInstance(Ci.nsITextInputProcessor);
 assert(tip.beginInputTransactionForTests(w),'TIP transaction refused');
 a=snapshot();t0=now();
 const text='abcdefghijklmnopqrstuvwxyzabcdefghijklmn';
 for(const ch of text){const ev=new w.KeyboardEvent('',{key:ch,code:'Key'+ch.toUpperCase(),keyCode:ch.toUpperCase().charCodeAt(0)});tip.keydown(ev);tip.keyup(ev);await pause(20);}
 await wait(()=>typeTab.label==='typed-40','typed text reached page',300,20);await pause(400);
 w.removeEventListener('keypress',kp,{capture:true,mozSystemGroup:true});
 results.typing={...diff(a,snapshot()),keys:text.length,chromeKeypress,pageReceived:typeTab.label,wallMs:Math.round(now()-t0)};
 results.typing.pass=results.typing.reconciles.sticky===0&&typeTab.label==='typed-40'&&chromeKeypress>=text.length;
 // 5. Structural control: a new folder must still reach every reconciler.
 // A plain observer records which native writes arrive meanwhile.
 const seen={};const diag=new Orig(rs=>{for(const x of rs){const k=x.type+':'+(x.attributeName??'')+':'+(x.target?.localName??'')+(x.type==='childList'?':'+[...x.addedNodes,...x.removedNodes].map(n=>n.nodeType===1?n.localName+'.'+(n.className?.baseVal??n.className??''):'#'+n.nodeType).join(','):'');seen[k]=(seen[k]??0)+1;}});
 diag.observe(gB.tabContainer,{subtree:true,childList:true,attributes:true,attributeFilter:['label','image','muted','zen-show-sublabel']});
 a=snapshot();
 const s1=gB.addTrustedTab(base+'/structural-1',{inBackground:true}),s2=gB.addTrustedTab(base+'/structural-2',{inBackground:true});
 const sf=await w.gZenFolders.createFolder([s1,s2],{renameFolder:false,label:'Structural control',insertBefore:s1});
 await pause(800);
 results.structuralControl=diff(a,snapshot());diag.disconnect();
 results.structuralControl.nativeRecords=Object.fromEntries(Object.entries(seen).sort((x,y)=>y[1]-x[1]).slice(0,12));
 const r=results.structuralControl.reconciles;
 results.structuralControl.pass=['sticky','colour','icon','button','unload','restoreFull','pinPresentation'].every(k=>r[k]>0)
  &&!!sf.querySelector(':scope > .tab-group-label-container .better-zen-folders-new-tab-button');
 results.pass=['chromeTitleChurn','contentTitleChurn','pageReloads','typing','structuralControl'].every(k=>results[k].pass);
 w.console.error('Better Zen Folders probe console control');await pause(50);
 {const all=bzfStopConsole();results.consoleCaptureControl=all.some(x=>x.includes('probe console control'));results.consoleErrors=all.filter(x=>!x.includes('probe console control'));}
 return results;
})().then(done,error=>done({error:String(error),stack:error.stack}));
