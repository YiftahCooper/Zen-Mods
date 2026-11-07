const done=arguments[arguments.length-1];
// Capture this mod's console errors/warnings and script errors during the run.
const bzfConsole=[];const bzfMatch=(t,f)=>/better.zen.folders/i.test(String(t)+' '+String(f??''));
const bzfScript={observe(m){try{if(m instanceof Ci.nsIScriptError&&bzfMatch(m.errorMessage,m.sourceName))bzfConsole.push('script: '+String(m.errorMessage).slice(0,300));}catch{}}};
const bzfApi=e=>{try{if(['error','warn','exception','assert'].includes(e.level)){const t=(e.arguments??[]).map(a=>{try{return String(a?.message??a);}catch{return '?';}}).join(' ');if(bzfMatch(t,e.filename))bzfConsole.push(e.level+': '+t.slice(0,300));}}catch{}};
Services.console.registerListener(bzfScript);
const bzfStorage=Cc['@mozilla.org/consoleAPI-storage;1'].getService(Ci.nsIConsoleAPIStorage);bzfStorage.addLogEventListener(bzfApi,Services.scriptSecurityManager.getSystemPrincipal());
const bzfStopConsole=()=>{Services.console.unregisterListener(bzfScript);bzfStorage.removeLogEventListener(bzfApi);return bzfConsole;};
// 0.3.27 native checklist (CURRENT-STATUS.md items 3-7) in a disposable
// profile. Every section records its own evidence and never aborts the rest.
(async()=>{
 const w=Services.wm.getMostRecentWindow('navigator:browser'),pause=ms=>new Promise(r=>w.setTimeout(r,ms));
 const wait=async(fn,label,tries=300,ms=20)=>{for(let i=0;i<tries;i++){try{if(fn())return;}catch{}await pause(ms);}throw Error('Timeout '+label);};
 const frames=n=>new Promise(r=>{let k=0;const f=()=>{if(++k>=n)r();else w.requestAnimationFrame(f);};w.requestAnimationFrame(f);});
 const settle=async()=>{await pause(120);await frames(3);await pause(60);};
 const ID='5b0aa51f-cea7-4de5-8344-3e86e77fb88d',RK='betterZenFolders.restore.v1';
 await wait(()=>w.__betterZenFoldersController?.started,'BZF');
 const utils=ChromeUtils.importESModule('chrome://userscripts/content/core/utils.sys.mjs').default;
 const sine=ChromeUtils.importESModule('chrome://userscripts/content/core/manager.sys.mjs').default;
 const mods=await utils.getMods(),version=mods[ID]?.version,withIcons=Object.values(mods).some(m=>/zen icons/i.test(m.name??'')&&m.enabled);
 const base=Services.prefs.getStringPref('bzf.proof.base-url'),gB=w.gBrowser,SS=w.SessionStore;
 const pinsOn=Services.prefs.getBoolPref('better-zen-folders.folder-url-pins-enabled',false);
 const results={version,browser:Services.appinfo.version,withIcons,pinsOn,sections:{}};
 const section=async(name,fn)=>{const out={pass:false,checks:{}};results.sections[name]=out;
  const check=(k,ok,detail)=>{out.checks[k]={ok:!!ok,...(detail===undefined?{}:{detail})};return !!ok;};
  try{await fn(check,out);out.pass=Object.values(out.checks).length>0&&Object.values(out.checks).every(c=>c.ok);}catch(e){out.error=String(e);out.stack=e.stack;}};
 const ctl=()=>w.__betterZenFoldersController,mgr=name=>ctl()?.adapters.managers.find(m=>m.constructor?.name===name);
 const rec=t=>{try{return JSON.parse(SS.getCustomTabValue(t,RK)||'null');}catch{return null;}};
 const row=f=>f?.querySelector(':scope > .tab-group-label-container');
 const deco=f=>{const r=row(f);return {plus:!!r?.querySelector('.better-zen-folders-new-tab-button'),hideUnload:r?.getAttribute('better-zen-folders-hide-unload')==='true',
  colour:f.getAttribute('data-better-zen-folders-color'),icon:!!r?.querySelector(':scope > .tab-group-folder-icon > svg'),underline:!!r?.querySelector('.better-zen-folders-sticky-underline')};};
 const decoOk=(d,colour)=>d.plus&&d.hideUnload&&d.icon&&d.underline&&(colour===undefined||d.colour===colour);
 const loaded=async(url,opts={})=>{const t=gB.addTrustedTab(base+url,{inBackground:true,...opts});await wait(()=>t.linkedBrowser.currentURI.spec===base+url&&!t.linkedBrowser.webProgress?.isLoadingDocument,'load '+url,500);return t;};
 const folder=async(tabs,label)=>w.gZenFolders.createFolder(tabs,{renameFolder:false,label,insertBefore:tabs[0]});
 const move=(tab,group)=>{if(typeof gB.moveTabToExistingGroup==='function')gB.moveTabToExistingGroup(tab,group);else group.groupContainer.appendChild(tab);gB.tabContainer._invalidateCachedTabs?.();};
 const colours=mgr('FolderColorManager');

 // Item 4: folder +, unload-button hiding, colours and native icon repair.
 let F1,F2,f1Tabs,f2Tabs;
 await section('folderDecorations',async check=>{
  f1Tabs=[await loaded('/f1-a'),await loaded('/f1-b'),await loaded('/f1-c')];
  f2Tabs=[await loaded('/f2-a'),await loaded('/f2-b'),await loaded('/f2-c')];
  F1=await folder(f1Tabs,'Folder one');F2=await folder(f2Tabs,'Folder two');await settle();
  check('new folder decorated',decoOk(deco(F1))&&decoOk(deco(F2)),{F1:deco(F1),F2:deco(F2)});
  check('colour set',colours.setColor(F1,'#d03a3a'),null);await settle();
  check('colour projected',deco(F1).colour==='#d03a3a'&&F1.style.getPropertyValue('--better-zen-folders-custom-color').trim()==='#d03a3a',deco(F1));
  F2.groupContainer.appendChild(F1);gB.tabContainer._invalidateCachedTabs?.();F2.collapsed=false;await settle();
  check('moved (nested) folder keeps decorations and colour',decoOk(deco(F1),'#d03a3a')&&decoOk(deco(F2)),{F1:deco(F1),F2:deco(F2)});
  F2.label='Folder two renamed';await settle();
  check('renamed folder keeps decorations',F2.label==='Folder two renamed'&&decoOk(deco(F2))&&decoOk(deco(F1),'#d03a3a'),{label:F2.label,F2:deco(F2)});
  const svg=row(F2).querySelector(':scope > .tab-group-folder-icon > svg');svg.remove();await settle();
  check('removed native icon repaired',deco(F2).icon,deco(F2));
  Services.prefs.setBoolPref('better-zen-folders.show-folder-unload-button',true);await settle();
  check('unload button shown when enabled',!deco(F1).hideUnload&&!deco(F2).hideUnload);
  Services.prefs.setBoolPref('better-zen-folders.show-folder-unload-button',false);await settle();
  check('unload button hidden again',deco(F1).hideUnload&&deco(F2).hideUnload);
  // A third folder created after all of the above (new rows after churn).
  const t=[await loaded('/f3-a')];const F3=await folder(t,'Folder three');await settle();
  check('later new folder decorated',decoOk(deco(F3)),deco(F3));
 });

 // Item 3: Sticky underline centring (LTR/RTL, collapse/expand, selection).
 await section('underlineCentring',async (check,out)=>{
  Services.prefs.setStringPref('better-zen-folders.sticky-marker','underline');
  // A custom (inner) folder icon as well as the default artwork.
  try{w.gZenFolders.setFolderUserIcon?.(F2,'chrome://browser/skin/zen-icons/selectable/logo-github.svg');}catch{}
  // With Zen Icons, hide F2's folder shape: an outline-free (enlarged) icon.
  if(withIcons){Services.prefs.setStringPref('zen.icons.folder-shapes',JSON.stringify({[F2.id]:false}));
   try{await wait(()=>F2.hasAttribute('zen-icons-enlarge-inner-icon'),'outline-free icon',200);}catch{}}
  await settle();
  const measure=()=>[...w.document.querySelectorAll('zen-folder')].map(f=>{
   const r=row(f),mark=r?.querySelector('.better-zen-folders-sticky-underline');if(!mark)return {id:f.id,missing:true};
   const icon=mark.parentElement,art=icon.querySelector(f.hasAttribute('zen-icons-enlarge-inner-icon')?'svg .icon':'svg .front')??icon.querySelector('svg');
   const m=mark.getBoundingClientRect(),a=art?.getBoundingClientRect(),s=icon.getBoundingClientRect();
   if(!(m.width>0&&a?.width>0&&s.width>0))return {id:f.id,hidden:true};
   return {id:f.id,label:f.label,delta:+Math.abs((m.x+m.width/2)-(a.x+a.width/2)).toFixed(2),dir:w.getComputedStyle(icon).direction,
    variable:mark.style.getPropertyValue('--bzf-sticky-icon-centre'),art:art.getAttribute('class')??art.localName,enlarged:f.hasAttribute('zen-icons-enlarge-inner-icon'),slot:+s.width.toFixed(1)};
  });
  const ok=list=>{const v=list.filter(x=>x.delta!==undefined);return v.length>0&&v.every(x=>x.delta<=1);};
  let m=measure();check('LTR initial',ok(m),m);
  // Informational: is a stale centre after an icon-shape switch transient?
  if(withIcons){await pause(1500);out.info={afterIconSwitchPlus1500ms:measure()};}
  if(withIcons)check('outline-free folder present and measured',m.some(x=>x.enlarged&&x.delta!==undefined),m.map(x=>({id:x.id,enlarged:x.enlarged})));
  F1.collapsed=true;await settle();F1.collapsed=false;await settle();m=measure();check('LTR after collapse/expand',ok(m),m);
  gB.selectedTab=f2Tabs[1];await settle();gB.selectedTab=f1Tabs[0];await settle();m=measure();check('LTR after selection changes',ok(m),m);
  const box=w.document.getElementById('navigator-toolbox')??gB.tabContainer;box.style.direction='rtl';
  F2.collapsed=true;await settle();F2.collapsed=false;await settle();m=measure();
  check('RTL after collapse/expand',ok(m)&&m.some(x=>x.dir==='rtl'),m);
  gB.selectedTab=f2Tabs[2];await settle();m=measure();check('RTL after selection change',ok(m)&&m.some(x=>x.dir==='rtl'),m);
  box.style.removeProperty('direction');F2.collapsed=true;await settle();F2.collapsed=false;await settle();
  m=measure();check('LTR again',ok(m),m);
 });

 // Item 5: restore metadata after folder rename, tab close + Undo Close Tab.
 await section('restoreMetadata',async check=>{
  await pause(300);
  const t=f2Tabs[0];let r=rec(t);
  check('folder rename reaches stored record',r?.folders?.some(f=>f.name==='Folder two renamed'),r?.folders?.map(f=>f.name));
  F1.label='Folder one renamed';await pause(300);r=rec(f1Tabs[1]);
  check('nested folder rename reaches stored record',r?.folders?.at(-1)?.name==='Folder one renamed',r?.folders?.map(f=>f.name));
  // Regular folder tab: close the middle tab and Undo Close Tab.
  const mid=f2Tabs[1],url=mid.linkedBrowser.currentURI.spec,before=rec(mid),prev=mid.previousElementSibling?.id,next=mid.nextElementSibling?.id;
  gB.removeTab(mid,{animate:false});await wait(()=>!mid.isConnected,'close');await pause(300);
  const restored=SS.undoCloseTab(w,0);
  await wait(()=>restored?.group===F2&&restored.linkedBrowser.currentURI.spec===url,'undo close regular',400);await pause(400);
  check('undo close restores folder and slot',restored.group===F2&&restored.previousElementSibling?.id===prev&&restored.nextElementSibling?.id===next,
   {group:restored.group?.label,prev:restored.previousElementSibling?.id===prev,next:restored.nextElementSibling?.id===next,pinned:restored.pinned,stored:!!before});
  f2Tabs[1]=restored;
  // Live folder: synthetic RSS feed on loopback, rename an item tab, close, undo.
  const {ZenLiveFoldersManager:LM}=ChromeUtils.importESModule('resource:///modules/zen/ZenLiveFoldersManager.sys.mjs');
  const Rss=LM.registry.get('rss'),prompt=Rss.promptForFeedUrl;
  Rss.promptForFeedUrl=async()=>base+'/feed.xml';
  let id;try{id=await LM.createFolder('rss');}finally{Rss.promptForFeedUrl=prompt;}
  const live=w.document.getElementById(id);
  check('live folder created',live?.isLiveFolder===true,{id});
  live.collapsed=false;
  await wait(()=>[...live.tabs].filter(x=>x.hasAttribute('zen-live-folder-item-id')).length>=3,'live items',600,25);await pause(500);
  const items=[...live.tabs].filter(x=>x.hasAttribute('zen-live-folder-item-id'));
  const lt=items[1],itemId=lt.getAttribute('zen-live-folder-item-id');
  r=rec(lt);check('live tab has a stored record',r?.folders?.at(-1)?.type==='live',{presentation:r?.presentation,liveTab:r?.liveTab});
  lt.zenStaticLabel='Renamed live item';gB._setTabLabel(lt,'Renamed live item',{_zenChangeLabelFlag:true});
  await pause(300);r=rec(lt);
  check('renamed live tab re-serialised (tab-local path)',r?.presentation?.label==='Renamed live item',r?.presentation);
  const lprev=lt.previousElementSibling?.id??null,lnext=lt.nextElementSibling?.id??null,lindex=[...live.tabs].indexOf(lt);
  gB.removeTab(lt,{animate:false});await wait(()=>!lt.isConnected,'close live');await pause(300);
  const lr=SS.undoCloseTab(w,0);
  let landed=true;try{await wait(()=>lr?.group===live&&lr.label==='Renamed live item','undo close live',400);}catch{landed=false;}
  await pause(400);
  check('undo close restores live tab folder, slot and presentation',landed&&lr.group===live&&[...live.tabs].indexOf(lr)===lindex&&lr.label==='Renamed live item'&&lr.getAttribute('zen-live-folder-item-id')===itemId,
   {group:lr?.group?.id===live.id,label:lr?.label,index:[...live.tabs].indexOf(lr),expectedIndex:lindex,itemId:lr?.getAttribute('zen-live-folder-item-id')===itemId,prev:lr?.previousElementSibling?.id===lprev,next:lr?.nextElementSibling?.id===lnext});
 });

 // Item 6: folder URL-pin badges and root pin badges.
 await section('urlPinBadges',async (check,out)=>{
  if(!pinsOn){check('feature enabled for this run',false,'BZF_TEST_PINS=0');return;}
  const pins=w.__betterZenFoldersFolderPins;await wait(()=>pins?.origins?.active,'URL pins');
  Services.prefs.setStringPref('better-zen-folders.url-unpin-grace-seconds','0');
  const badge=t=>!!t.querySelector('.tab-content > .better-zen-folders-url-pin, .tab-content .better-zen-folders-url-pin');
  const t=f2Tabs[2];
  await pins.presentation.run(()=>pins.policy.pin(t));await settle();
  check('badge appears on pin',badge(t)&&pins.store.read(t).explicit===true,{explicit:pins.store.read(t).explicit});
  pins.presentation.unpin(t);await pause(200);await settle();
  check('badge disappears on unpin',!badge(t)&&pins.store.read(t).explicit===false,{explicit:pins.store.read(t).explicit});
  await pins.presentation.run(()=>pins.policy.pin(t));await settle();
  move(t,F1);await settle();
  check('badge follows move to another folder',t.group===F1&&badge(t),{group:t.group?.label});
  const url=t.linkedBrowser.currentURI.spec;gB.removeTab(t,{animate:false});await wait(()=>!t.isConnected,'close pinned');await pause(300);
  const rt=SS.undoCloseTab(w,0);await wait(()=>rt?.group===F1&&rt.linkedBrowser.currentURI.spec===url,'undo pinned',400);await pause(400);await settle();
  check('badge returns on restore',badge(rt)&&pins.store.read(rt).explicit===true,{explicit:pins.store.read(rt).explicit,group:rt.group?.label});
  // Restore-record freshness for URL-pin changes made without a menu command:
  // pin through the policy API, then unpin by a real click on the badge.
  out.info={};const t2=f1Tabs[2];await pins.presentation.run(()=>pins.policy.pin(t2));await pause(500);
  out.info.recordAfterApiPin=rec(t2)?.urlPin??null;out.info.storeAfterApiPin=pins.store.read(t2).explicit;
  const btn=t2.querySelector('.better-zen-folders-url-pin');
  if(btn){for(const type of ['pointerdown','mousedown','pointerup','mouseup','click'])btn.dispatchEvent(new w.MouseEvent(type,{bubbles:true,cancelable:true,button:0,view:w}));}
  await pause(500);out.info.badgeAfterClick=badge(t2);out.info.storeAfterClick=pins.store.read(t2).explicit;out.info.recordAfterBadgeClickUnpin=rec(t2)?.urlPin??null;
  // Root pins: a pinned tab outside folders gets the root badge only when enabled.
  Services.prefs.setBoolPref('better-zen-folders.show-root-pin-badge',true);
  const root=await loaded('/root-pin');gB.pinTab(root);await settle();
  check('root pin badge appears',root.pinned&&!root.group&&badge(root));
  gB.unpinTab(root);await settle();check('root pin badge disappears on unpin',!root.pinned&&!badge(root));
  gB.pinTab(root);await settle();move(root,F2);await settle();
  check('root badge leaves when moved into a folder',root.group===F2&&!root.querySelector('.better-zen-folders-url-pin[title="Unpin Tab"]'),{group:root.group?.label,badge:badge(root),explicit:pins.store.read(root).explicit});
  Services.prefs.setBoolPref('better-zen-folders.show-root-pin-badge',false);await settle();
 });

 // Item 7: disable / re-enable through Sine (supportsUnload).
 await section('disableReenable',async check=>{
  const els=Cc['@mozilla.org/eventlistenerservice;1'].getService(Ci.nsIEventListenerService);
  const targets={window:w,tabs:gB.tabContainer,document:w.document,tabMenu:w.document.getElementById('tabContextMenu'),folderMenu:w.document.getElementById('zenFolderActions')};
  const listeners=()=>Object.fromEntries(Object.entries(targets).filter(([,t])=>t).map(([k,t])=>[k,els.getListenerInfoFor(t).length]));
  const leftovers=()=>{const out=[];for(const el of w.document.querySelectorAll('*')){
   const cls=el.getAttribute('class')??'';if(/(?:^|\s)better-zen-folders-/.test(cls))out.push('class:'+el.localName+'.'+cls);
   for(const a of el.getAttributeNames())if(/^(data-)?(better-zen-folders|bzf)/.test(a))out.push('attr:'+el.localName+(el.id?'#'+el.id:'')+'@'+a);
   const st=el.getAttribute('style');if(st&&/--(better-zen-folders|bzf)-/.test(st))out.push('style:'+el.localName+(el.id?'#'+el.id:''));}
   return out;};
  const toggle=async()=>{await sine.toggleTheme(await utils.getMods(),ID);};
  const enabledBefore=listeners(),c0=ctl();
  const enabledScan=leftovers();check('scanner sees decorations while enabled (control)',enabledScan.length>0,enabledScan.length);
  await toggle();await wait(()=>!c0.started,'disable');await pause(800);
  const d1=listeners(),l1=leftovers();
  check('disable stops controller',!c0.started);
  check('no leftover attributes, decorations or custom properties after disable',l1.length===0,l1.slice(0,40));
  // Re-enable with counted observers so their disconnection can be proved.
  const Orig=w.MutationObserver,obs=[];
  w.MutationObserver=function(cb){const s={observes:0,disconnects:0};const real=new Orig(r=>cb(r,proxy));const proxy={observe(t,o){s.observes++;return real.observe(t,o);},disconnect(){s.disconnects++;return real.disconnect();},takeRecords(){return real.takeRecords();}};obs.push(s);return proxy;};
  try{await toggle();await wait(()=>ctl()!==c0&&ctl()?.started,'re-enable',400);}finally{w.MutationObserver=Orig;}
  await pause(800);
  const e1=listeners(),c1=ctl();
  const back=[...w.document.querySelectorAll('zen-folder')].filter(f=>!f.isLiveFolder).map(deco);
  check('re-enable restores folder decorations',back.length>0&&back.every(d=>decoOk(d)),back);
  check('re-enable restores colour',F1.getAttribute('data-better-zen-folders-color')==='#d03a3a');
  check('listener counts match first enabled state',JSON.stringify(e1)===JSON.stringify(enabledBefore),{enabledBefore,e1});
  const observing=obs.filter(s=>s.observes>0).length;
  await toggle();await wait(()=>!c1.started,'disable 2');await pause(800);
  const d2=listeners(),l2=leftovers();
  check('second disable: no leftovers',l2.length===0,l2.slice(0,40));
  check('no listener accumulation across disable cycles',Object.keys(d1).every(k=>d2[k]<=d1[k]),{d1,d2});
  check('every observer created on enable is disconnected',observing>0&&obs.every(s=>s.observes===0||s.disconnects>=1),{created:obs.length,observing,undisconnected:obs.filter(s=>s.observes>0&&s.disconnects===0).length});
  await toggle();await wait(()=>ctl()!==c1&&ctl()?.started,'final enable',400);await pause(500);
  check('final enable decorates again',[...w.document.querySelectorAll('zen-folder')].filter(f=>!f.isLiveFolder).every(f=>decoOk(deco(f))));
 });
 const sections=Object.values(results.sections);
 results.summary={sections:sections.length,passed:sections.filter(s=>s.pass).length,
  checks:sections.reduce((n,s)=>n+Object.keys(s.checks).length,0),checksPassed:sections.reduce((n,s)=>n+Object.values(s.checks).filter(c=>c.ok).length,0)};
 w.console.error('Better Zen Folders probe console control');await pause(50);
 {const all=bzfStopConsole();results.consoleCaptureControl=all.some(x=>x.includes('probe console control'));results.consoleErrors=all.filter(x=>!x.includes('probe console control'));}
 return results;
})().then(done,error=>done({error:String(error),stack:error.stack}));
