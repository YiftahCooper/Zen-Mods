const done=arguments[arguments.length-1];
(async()=>{
 const wait=ms=>new Promise(r=>setTimeout(r,ms)),results=[];
 const assert=(x,m)=>{if(!x)throw Error(m);};
 const test=async(name,fn)=>{try{results.push({name,pass:true,detail:await fn()});}catch(e){results.push({name,pass:false,error:String(e),stack:e.stack});}};
 const root=Services.prefs.getStringPref('bp.test.source-root');
 const originalCreate=gZenFolders.createFolder;
 Services.io.getProtocolHandler('resource').QueryInterface(Ci.nsIResProtocolHandler).setSubstitution('better-pins-test',Services.io.newURI(root));
 const api=ChromeUtils.importESModule('resource://better-pins-test/scripts/better-pins.uc.mjs');
 window.addUnloadListener??=(fn)=>window.addEventListener('unload',fn,{once:true});
 if(!window.__betterPinsController?.result?.ok)await api.bootstrap(window);
 const c=window.__betterPinsController;assert(c?.result?.ok,'bootstrap failed');
 const link=document.createElementNS('http://www.w3.org/1999/xhtml','link');link.rel='stylesheet';link.href=root+'chrome.css';document.documentElement.appendChild(link);
 const flush=async()=>{await c.origins.flush();await wait(120);};
 let lower,upper,folder;const pref=(k,v)=>Services.prefs[typeof v==='boolean'?'setBoolPref':'setStringPref']('better-pins.'+k,v);
 await test('folder-creation-preserves-source-order-in-either-zone',async()=>{
  for(const zone of ['upper','lower']){
   const a=await c.newTab(zone),b=await c.newTab(zone),d=await c.newTab(zone),space=c.zones.space(a);
   const f=gZenFolders.createFolder([b],{insertBefore:b,label:zone+' middle'});await flush();
   const roots=c.zones.roots(zone==='upper'?space.pinnedTabsContainer:space.tabsContainer);
   assert(roots.indexOf(a)<roots.indexOf(f)&&roots.indexOf(f)<roots.indexOf(d),'folder moved to end '+zone);
  }
 });
 await test('new-tabs-default-ordinary-and-independent-zone-defaults',async()=>{
  upper=await c.newTab('upper');lower=await c.newTab('lower');assert(!c.store.read(upper).explicit&&!c.store.read(lower).explicit,'default pin');
  pref('pin-new-lower-tabs',true);const p=await c.newTab('lower'),u=await c.newTab('upper');assert(c.store.read(p).explicit&&!c.store.read(u).explicit,'defaults coupled');pref('pin-new-lower-tabs',false);
 });
 await test('native-new-folder-inherits-lower-zone-and-retains-pin-choice',async()=>{
  await c.policy.pin(lower);folder=gZenFolders.createFolder([lower],{label:'Lower research'});await flush();
  assert(api.areaOf(folder)==='lower','new folder jumped upper');assert(c.store.read(lower).explicit,'lost original pin');assert(gZenWorkspaces.allStoredTabs.includes(lower),'native collector lost tab');
 });
 await test('new-tabs-beginning-and-end-independent-of-button-position',async()=>{
  pref('new-upper-position','top');const a=await c.newTab('upper'),space=c.zones.space(a);assert(c.zones.roots(space.pinnedTabsContainer)[0]===a,'upper beginning');
  pref('new-upper-position','bottom');const b=await c.newTab('upper');assert(c.zones.roots(space.pinnedTabsContainer).at(-1)===b,'upper end');
  pref('new-lower-position','top');const d=await c.newTab('lower');assert(c.zones.roots(space.tabsContainer)[0]===d,'lower beginning');pref('new-lower-position','bottom');
 });
 await test('upper-button-position-toggle-and-activation',async()=>{
  const space=c.zones.space(upper),button=c.controls.buttons.get(space);pref('upper-button-position','top');await wait(50);assert(button.nextSibling===space.pinnedTabsContainer,'top position');
  pref('upper-button-position','bottom');await wait(50);assert(button.nextSibling===c.zones.dividers.get(space),'bottom position');
  const count=gZenWorkspaces.allStoredTabs.length;button.click();await flush();assert(gZenWorkspaces.allStoredTabs.length===count+1&&api.areaOf(gBrowser.selectedTab)==='upper','upper click');
  pref('show-upper-new-tab',false);assert(button.hidden,'hide setting');pref('show-upper-new-tab',true);
 });
 await test('native-lower-new-tab-button-routes-to-lower',async()=>{
  const button=document.getElementById('vertical-tabs-newtab-button')??document.getElementById('tabs-newtab-button');assert(button,'native button missing');
  const count=gZenWorkspaces.allStoredTabs.length;button.click();await flush();assert(gZenWorkspaces.allStoredTabs.length===count+1,'button created duplicate or none');assert(api.areaOf(gBrowser.selectedTab)==='lower','wrong native button zone');
 });
 await test('banner-collapse-setting-live-and-reversible',async()=>{
  const pins=c.zones.space(upper).collapsiblePins;pins.collapsed=false;pref('banner-collapse',false);pins.toggle();assert(!pins.collapsed,'collapse not prevented');pref('banner-collapse',true);pins.toggle();assert(pins.collapsed,'collapse not restored');pins.toggle();
 });
 await test('zones-submenu-has-only-other-destination-and-all-icons-toggle',async()=>{
  TabContextMenu.contextTab=upper;c.presentation.showMenu();let items=c.presentation.commands;
  assert(items.some(n=>n.localName==='menu'&&n.getAttribute('label')==='Zones'),'submenu absent');assert(items.filter(n=>n.getAttribute('label').startsWith('Switch')).length===1,'multiple switches');
  assert(items.some(n=>n.getAttribute('label')==='Switch to Lower Zone'),'wrong destination');assert(items.every(n=>n.hasAttribute('image')),'icon missing');c.presentation.restoreMenu();
  pref('menu-icons',false);c.presentation.showMenu();assert(c.presentation.commands.every(n=>!n.hasAttribute('image')),'icons remain');c.presentation.restoreMenu();pref('menu-icons',true);
 });
 await test('clear-hidden-and-tabs-show-close-not-minus',async()=>{
  gBrowser.selectedTab=upper;await flush();assert(getComputedStyle(upper.querySelector('.tab-reset-button')).display==='none','minus visible');assert(getComputedStyle(upper.querySelector('.tab-close-button')).display!=='none','close hidden');
  assert([...document.querySelectorAll('.zen-workspace-close-unpinned-tabs-button')].every(n=>getComputedStyle(n).display==='none'),'Clear visible');
 });
 await test('folder-drop-marker-switches-panes-for-three-visible-tree-states',async()=>{
  const space=c.zones.space(folder);for(const mode of ['expanded','collapsed-external','collapsed-selected-child']){
   folder.collapsed=mode!=='expanded';gBrowser.selectedTab=mode==='collapsed-selected-child'?lower:upper;await flush();
   for(const zone of [space.pinnedTabsContainer,space.tabsContainer]){
    const r=zone.getBoundingClientRect();c.presentation.drag={item:folder,space};
    const event={target:folder,clientX:r.left+20,clientY:r.bottom-5,dataTransfer:{types:['application/x-moz-tabbrowser-tab'],mozItemCount:1,mozGetDataAt:()=>folder},preventDefault(){},stopImmediatePropagation(){}};
    c.presentation.onDragOver(event);const marker=c.presentation.dropMarker;assert(marker&&!marker.hidden,'no line '+mode);const m=marker.getBoundingClientRect();assert(m.top>=r.top&&m.top<=r.bottom,'line in wrong pane '+mode);
    const before=api.insertionTarget(c.zones.roots(zone),folder,event.clientY);
    c.presentation.onDrop(event);await flush();const order=c.zones.roots(zone);assert(folder.parentNode===zone,'drop did not match indicator pane');assert(before?order[order.indexOf(folder)+1]===before:order.at(-1)===folder,'drop did not match indicator order');
   }
  }c.presentation.hideDropMarker();c.presentation.drag=null;
 });
 await test('disable-and-reenable-restore-exact-folder-method-and-native-button-command',async()=>{
  c.destroy();assert(gZenFolders.createFolder===originalCreate,'creation wrapper leaked');
  assert([...document.querySelectorAll('#tabs-newtab-button,#vertical-tabs-newtab-button')].every(b=>b.getAttribute('command')==='cmd_newNavigatorTab'),'native command not restored');
  assert((await api.bootstrap(window)).ok,'re-enable');window.__betterPinsController.destroy();assert(gZenFolders.createFolder===originalCreate,'second teardown leaked');
 });
 return {results};
})().then(done,e=>done({error:String(e),stack:e.stack}));
