const done=arguments[arguments.length-1];
(async()=>{
 const wait=ms=>new Promise(r=>setTimeout(r,ms));
 const assert=(x,msg)=>{if(!x)throw Error(msg);};
 const results=[];
 const test=async(name,fn)=>{try{const detail=await fn();results.push({name,pass:true,detail});}catch(e){results.push({name,pass:false,error:String(e),stack:e.stack});}};
 const root=Services.prefs.getStringPref('bp.test.source-root');
 const handler=Services.io.getProtocolHandler('resource').QueryInterface(Ci.nsIResProtocolHandler);handler.setSubstitution('better-pins-test',Services.io.newURI(root));
 const api=ChromeUtils.importESModule('resource://better-pins-test/scripts/better-pins.uc.mjs');
 const link=document.createElementNS('http://www.w3.org/1999/xhtml','link');link.rel='stylesheet';link.href=root+'chrome.css';document.documentElement.appendChild(link);
 window.addUnloadListener??=(fn)=>window.addEventListener('unload',fn,{once:true});
 const boot=await api.bootstrap(window);assert(boot?.ok,'bootstrap '+JSON.stringify(boot));
 const c=window.__betterPinsController;
 const state=t=>JSON.parse(SessionStore.getTabState(t));
 const url=t=>state(t).entries?.[state(t).index-1]?.url;
 const add=async name=>{const t=gBrowser.addTab('about:blank?bp='+name,{triggeringPrincipal:Services.scriptSecurityManager.getSystemPrincipal()});await c.origins.flush();await wait(80);return t;};
 let a,b,folder,child;
 await test('new-lower-root-is-ordinary',async()=>{a=await add('a');assert(c.store.read(a).explicit===false,'new lower pin');return {url:url(a)};});
 await test('new-upper-root-default-is-ordinary-and-can-be-pinned',async()=>{b=await c.newTab('upper');assert(!c.store.read(b).explicit,'new upper pinned');assert(api.areaOf(b)==='upper','upper tab elsewhere');b.linkedBrowser.loadURI(Services.io.newURI('about:blank?upper-page'),{triggeringPrincipal:Services.scriptSecurityManager.getSystemPrincipal()});await wait(150);assert((await c.policy.pin(b)).ok,'explicit upper pin failed');});
 await test('lower-root-pin-navigate-reset-unpin-keeps-placement',async()=>{
   assert((await c.policy.pin(a)).ok,'pin failed');const saved=url(a);
   a.linkedBrowser.loadURI(Services.io.newURI('about:blank?bp=navigated'),{triggeringPrincipal:Services.scriptSecurityManager.getSystemPrincipal()});await wait(200);await gBrowser.TabStateFlusher.flush(a.linkedBrowser);
   assert(url(a)!==saved,'navigate did not complete');assert((await c.policy.reset(a)).ok,'reset failed');await wait(200);await gBrowser.TabStateFlusher.flush(a.linkedBrowser);assert(url(a)===saved,'wrong reset URL');
   const parent=a.parentNode;assert((await c.policy.unpin(a)).ok,'unpin failed');assert(a.parentNode===parent&&url(a)===saved,'unpin moved/navigated');
 });
 await test('nested-folder-lower-preserves-collector-order-and-intent',async()=>{
   const x=await add('x'),y=await add('y');folder=gZenFolders.createFolder([x],{label:'Better Pins Parent',id:'bp-parent'});child=gZenFolders.createFolder([y],{label:'Better Pins Child',id:'bp-child'});folder.groupContainer.appendChild(child);folder.collapsed=false;child.collapsed=false;
   await c.origins.flush();const before=[...folder.tabs];assert((await c.zones.move(folder,'lower')).ok,'move failed');
   assert(api.areaOf(y)==='lower'&&child.group===folder,'broken nesting');assert(before.every((t,i)=>folder.tabs[i]===t&&gZenWorkspaces.allStoredTabs.includes(t)),'collector/order lost');
   assert(c.store.read(x).explicit===false,'move invented URL pin');assert((await c.policy.pin(y)).ok,'lower folder URL pin failed');
   return {count:before.length};
 });
 await test('folder-unload-keeps-current-url-and-expanded-state',async()=>{
   gBrowser.selectedTab=a;await wait(100);const tab=folder.tabs[0],saved=url(tab),collapsed=folder.collapsed;
   await folder.unloadAllTabs();await wait(100);assert(tab.hasAttribute('pending'),'not unloaded');assert(url(tab)===saved&&folder.collapsed===collapsed,'unload changed state');
 });
 await test('divider-keyboard-and-independent-scroll',async()=>{
   for(let i=0;i<18;i++){await c.newTab('upper');await add('lower'+i);}
   await wait(250);c.zones.layout();await wait(150);
   const space=c.zones.space(a),u=space.pinnedTabsContainer,l=space.tabsContainer,divider=c.zones.dividers.get(space);
   const before=Services.prefs.getIntPref('better-pins.upper-percent',50);divider.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));await wait(150);
   assert(Services.prefs.getIntPref('better-pins.upper-percent',50)>before,'keyboard no resize');u.scrollTop=0;l.scrollTop=0;u.scrollTop=100;await wait(50);
   assert(u.scrollTop>0&&l.scrollTop===0,'upper not independent '+JSON.stringify({uh:u.clientHeight,us:u.scrollHeight,lh:l.clientHeight,ls:l.scrollHeight}));const old=u.scrollTop;l.scrollTop=100;await wait(50);assert(l.scrollTop>0&&u.scrollTop===old,'lower not independent');
   return {upper:u.clientHeight,lower:l.clientHeight};
 });
 await test('duplicate-becomes-ordinary',async()=>{const tab=gBrowser.duplicateTab(b);await wait(350);await c.origins.flush();assert(c.store.read(tab).explicit===false,'duplicate inherited pin');return {id:tab.id};});
 await test('native-clear-does-not-delete-candidate-tabs',async()=>{const before=gZenWorkspaces.allStoredTabs.length;gZenWorkspaces.closeAllUnpinnedTabs();assert(gZenWorkspaces.allStoredTabs.length===before,'clear removed tabs');});
 await test('native-close-removes-upper-entry-without-reset',async()=>{await gZenPinnedTabManager.onCloseTabShortcut(null,b);await wait(200);assert(b.closing||!b.isConnected,'close retained entry');});
 await test('clean-disable-returns-affected-folder-and-restores-hooks',async()=>{const reset=gZenPinnedTabManager.resetPinnedTab;c.destroy();assert(api.areaOf(folder)==='upper','folder not returned');assert(gZenPinnedTabManager.resetPinnedTab!==reset,'hooks retained');assert(!document.querySelector('.better-pins-divider'),'divider leaked');});
 return {boot,results};
})().then(done,error=>done({error:String(error),stack:error.stack}));
