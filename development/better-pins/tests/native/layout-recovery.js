const done=arguments[arguments.length-1];
(async()=>{
 const results=[],wait=ms=>new Promise(r=>setTimeout(r,ms));
 const assert=(v,m)=>{if(!v)throw Error(m);};
 const test=async(name,fn)=>{try{results.push({name,pass:true,detail:await fn()});}catch(e){results.push({name,pass:false,error:String(e),stack:e.stack});}};
 Services.io.getProtocolHandler('resource').QueryInterface(Ci.nsIResProtocolHandler).setSubstitution('bp-recovery',Services.io.newURI(Services.prefs.getStringPref('bp.test.source-root')));
 const api=ChromeUtils.importESModule('resource://bp-recovery/scripts/better-pins.uc.mjs');window.addUnloadListener??=(fn)=>window.addEventListener('unload',fn,{once:true});assert((await api.bootstrap(window))?.ok,'bootstrap');
 let c=window.__betterPinsController;
 const link=document.createElementNS('http://www.w3.org/1999/xhtml','link');link.rel='stylesheet';link.href=Services.prefs.getStringPref('bp.test.source-root')+'chrome.css';document.documentElement.appendChild(link);
 const a=await c.newTab('lower'),b=await c.newTab('lower'),folder=gZenFolders.createFolder([a,b],{label:'Recovery folder'});await c.origins.flush();await c.zones.move(folder,'lower');
 await test('zone-layout-in-ltr-and-rtl-with-upper-button-at-either-end',async()=>{
  for(const dir of ['ltr','rtl'])for(const position of ['top','bottom']){
   document.documentElement.setAttribute('dir',dir);Services.prefs.setStringPref('better-pins.upper-button-position',position);await wait(60);c.zones.layout();
   const space=c.zones.space(folder),u=space.pinnedTabsContainer.getBoundingClientRect(),l=space.tabsContainer.getBoundingClientRect(),button=c.controls.buttons.get(space).getBoundingClientRect(),d=c.zones.dividers.get(space).getBoundingClientRect();
   assert(u.height>=48&&l.height>=48,'zone too small');assert(u.bottom<=d.top+2&&d.bottom<=l.top+2,'zone overlap');assert(position==='top'?button.bottom<=u.top+2:button.bottom<=d.top+2&&button.top>=u.bottom-2,'button placement/overlap');
  }
  document.documentElement.setAttribute('dir','ltr');
 });
 await test('normal-disable-native-actions-and-reenable-preserve-surviving-folder',async()=>{
  const id=folder.id,first=a.id;c.zones.save();c.destroy();assert(api.areaOf(folder)==='upper','native fallback not upper');
  gBrowser.removeTab(b,{animate:false});await wait(100);const newcomer=gBrowser.addTab('about:blank',{triggeringPrincipal:Services.scriptSecurityManager.getSystemPrincipal()});
  assert((await api.bootstrap(window))?.ok,'reenable');c=window.__betterPinsController;
  assert(folder.isConnected&&folder.id===id&&a.id===first&&api.areaOf(folder)==='lower','survivor identity/zone lost');
  assert(!b.isConnected||b.closing,'closed child resurrected');assert(gZenWorkspaces.allStoredTabs.includes(newcomer),'native newcomer lost');
 });
 await test('actual-native-menus-have-one-unload-and-restore-native-visibility',async()=>{
  TabContextMenu.contextTab=a;c.presentation.showMenu();assert(document.getElementById('context_unloadTab').hidden,'native duplicate visible');assert(c.presentation.commands.filter(n=>n.getAttribute('label')==='Unload Tab').length===1,'custom unload missing');c.presentation.restoreMenu();
  c.presentation.folderContext=folder;c.presentation.showMenu(true);assert(document.getElementById('context_zenFolderUnloadAll').hidden,'folder native duplicate visible');assert(c.presentation.commands.filter(n=>n.getAttribute('label')==='Unload Folder Tabs').length===1,'custom folder unload missing');c.presentation.restoreMenu();
 });
 await test('empty-native-folder-moves-between-zones-without-inventing-url-intent',async()=>{
  const empty=gZenFolders.createFolder([],{label:'Empty recovery folder',id:'bp-empty-recovery'});await c.origins.flush();assert(empty?.isConnected,'native empty folder missing');
  assert((await c.zones.move(empty,'lower')).ok,'empty move refused');assert(api.areaOf(empty)==='lower','empty folder wrong zone');
  assert(empty.tabs.filter(t=>!t.hasAttribute('zen-empty-tab')).length===0,'invented regular tab');
  c.zones.save();Services.prefs.setStringPref('bp.test.empty-expected',empty.id);Services.prefs.savePrefFile(null);await SessionStore.getCurrentState();
 });
 return {results,workspaceMethods:Object.getOwnPropertyNames(Object.getPrototypeOf(gZenWorkspaces)).filter(n=>/workspace|tab/i.test(n))};
})().then(done,e=>done({error:String(e),stack:e.stack}));
