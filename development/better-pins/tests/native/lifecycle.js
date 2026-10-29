const done=arguments[arguments.length-1];
(async()=>{
 const wait=ms=>new Promise(r=>setTimeout(r,ms)),results=[];
 const assert=(x,msg)=>{if(!x)throw Error(msg);};
 const test=async(name,fn)=>{window.__twoAreaSpikeProgress={name,results};try{results.push({name,pass:true,detail:await fn()});}catch(e){results.push({name,pass:false,error:String(e),stack:e.stack});}};
 const until=async fn=>{for(let i=0;i<100;i++){if(fn())return;await wait(30);}throw Error('condition timeout');};
 const principal=Services.scriptSecurityManager.getSystemPrincipal();
 const handler=Services.io.getProtocolHandler('resource').QueryInterface(Ci.nsIResProtocolHandler);
 const root=Services.prefs.getStringPref('bp.test.source-root');
 handler.setSubstitution('bp-life',Services.io.newURI(root));
 handler.setSubstitution('bp-bzf',Services.io.newURI(Services.prefs.getStringPref('bp.test.bzf-root')));
 const api=ChromeUtils.importESModule('resource://bp-life/scripts/better-pins.uc.mjs');
 const bzf=ChromeUtils.importESModule('resource://bp-bzf/scripts/better-zen-folders.uc.mjs');
 window.addUnloadListener??=(fn)=>window.addEventListener('unload',fn,{once:true});
 Services.prefs.setBoolPref('better-zen-folders.folder-url-pins-enabled',true);Services.prefs.setIntPref('better-zen-folders.folder-url-pins-consent-version',1);
 const mode=Services.prefs.getStringPref('bp.test.mode','after');
 if(mode==='before'){bzf.bootstrapBrowserWindow(window);await until(()=>window.__betterZenFoldersFolderPins?.result?.ok);}
 const boot=await api.bootstrap(window);assert(boot?.ok,'BP boot');const c=window.__betterPinsController;
 if(mode==='after'){bzf.bootstrapBrowserWindow(window);await wait(150);}
 const state=t=>JSON.parse(SessionStore.getTabState(t));
 const url=t=>{const s=state(t);return s.entries?.[s.index-1]?.url;};
 const page=n=>'data:text/html,'+encodeURIComponent('<title>BP '+n+'</title><p>Synthetic '+n+'</p>');
 const add=async n=>{const t=gBrowser.addTab(page(n),{triggeringPrincipal:principal});gBrowser.selectedTab=t;await until(()=>t.linkedBrowser.currentURI.spec===page(n));await gBrowser.TabStateFlusher.flush(t.linkedBrowser);await c.origins.flush();return t;};
 let a,folder,nested;
 await test('one-url-owner-with-bzf-'+mode,async()=>{
  const runtime=window.__betterZenFoldersController.adapters.managers.find(m=>m.constructor.name==='FolderPinRuntime');
  assert(!runtime.policy?.active&&!runtime.origins?.active,'BZF competing handlers');assert(c.policy.active&&c.origins.active,'BP not active');
 });
 await test('folder-tab-native-menu-has-pin-and-reset',async()=>{
  a=await add('menu');folder=gZenFolders.createFolder([a],{label:'BP Life Folder',id:'bp-life-folder'});await c.origins.flush();
  TabContextMenu.contextTab=a;c.presentation.menu.dispatchEvent(new Event('popupshowing'));
  const commands=c.presentation.commands,labels=commands.map(n=>n.getAttribute('label'));
  assert(labels.includes('Pin URL')&&labels.includes('Reset to Pinned URL'),'missing menu commands '+labels);
  commands.find(n=>n.getAttribute('label')==='Pin URL').dispatchEvent(new Event('command'));
  await until(()=>c.store.read(a).explicit);c.presentation.restoreMenu();return labels;
 });
 await test('folder-row-menu-moves-whole-folder-lower',async()=>{
  await c.zones.move(folder,'upper');
  c.presentation.folderContext=folder;c.presentation.folderMenu.dispatchEvent(new Event('popupshowing'));
  const labels=c.presentation.commands.map(n=>n.getAttribute('label'));
  assert(labels.includes('Switch to Lower Zone')&&labels.includes('Unload Folder Tabs'),'missing folder actions '+labels);
  c.presentation.commands.find(n=>n.getAttribute('label')==='Switch to Lower Zone').dispatchEvent(new Event('command'));
  await until(()=>api.areaOf(folder)==='lower');assert(c.store.read(a).explicit,'move lost URL pin');c.presentation.restoreMenu();
 });
 await test('new-upper-folder-default-setting-applies-once',async()=>{
  await c.zones.move(folder,'upper');Services.prefs.setBoolPref('better-pins.pin-new-upper-folder-tabs',true);
  // Same explicit handoff used by BZF's NewTabInFolderTransaction adapter.
  const tab=gBrowser.addTab(page('new-folder'),{triggeringPrincipal:principal});
  c.origins.placeCreatedTab(tab,'new',()=>folder.addTabs([tab]));
  await until(()=>tab.linkedBrowser.currentURI.spec===page('new-folder'));await gBrowser.TabStateFlusher.flush(tab.linkedBrowser);await c.origins.flush();
  assert(c.store.read(tab).explicit,'configured new folder default missed');
  await c.policy.unpin(tab);await c.zones.move(folder,'lower');await c.zones.move(folder,'upper');assert(!c.store.read(tab).explicit,'movement reapplied default');
  Services.prefs.setBoolPref('better-pins.pin-new-upper-folder-tabs',false);
 });
 await test('folder-url-choice-and-zone-survive-native-undo',async()=>{
  await c.zones.move(folder,'lower');const before=url(a);gBrowser.removeTab(a,{animate:false});await until(()=>!a.isConnected);await wait(150);
  a=SessionStore.undoCloseTab(window,0);await until(()=>a.isConnected&&url(a)===before);await wait(300);
  assert(a.closest('zen-folder')?.id===folder.id,'membership lost');assert(c.store.read(a).explicit,'intent lost');assert(api.areaOf(a)==='lower','zone lost on undo');
 });
 await test('same-space-drop-handler-moves-root',async()=>{
  const t=await add('drag');const space=c.zones.space(t);const dt={dropEffect:'none',types:['application/x-moz-tabbrowser-tab'],mozItemCount:1,mozGetDataAt:()=>t};
  c.presentation.onDragStart({target:t});let consumed=false;
  c.presentation.onDrop({target:space.pinnedTabsContainer,clientY:space.pinnedTabsContainer.getBoundingClientRect().top,dataTransfer:dt,preventDefault(){consumed=true;},stopImmediatePropagation(){}});
  await until(()=>api.areaOf(t)==='upper');assert(consumed&&!c.store.read(t).explicit,'drop changed intent or was ignored');return {nativePinned:t.pinned};
 });
 await test('save-state-for-restart',async()=>{
  const rootTab=await add('baseline-A');assert((await c.policy.pin(rootTab)).ok,'pin failed');const baseline=url(rootTab);rootTab.linkedBrowser.loadURI(Services.io.newURI(page('current-B')),{triggeringPrincipal:principal});await until(()=>rootTab.linkedBrowser.currentURI.spec===page('current-B'));await gBrowser.TabStateFlusher.flush(rootTab.linkedBrowser);
  await c.zones.move(folder,'lower');c.zones.save();
  Services.prefs.setStringPref('bp.test.expected',JSON.stringify({root:rootTab.id,baseline,current:url(rootTab),folder:folder.id}));
  Services.prefs.savePrefFile(null); // Persist the test oracle before forced termination.
  const {SessionSaver}=ChromeUtils.importESModule('moz-src:///browser/components/sessionstore/SessionSaver.sys.mjs');await SessionSaver.run();
  return {root:rootTab.id,folder:folder.id,current:url(rootTab),baseline};
 });
 return {mode,results};
})().then(done,e=>done({error:String(e),stack:e.stack}));
