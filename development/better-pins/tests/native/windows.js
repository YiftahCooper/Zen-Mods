const done=arguments[arguments.length-1];
(async()=>{
 const wait=ms=>new Promise(r=>setTimeout(r,ms)),results=[];
 const assert=(x,m)=>{if(!x)throw Error(m);};
 const until=async p=>{for(let i=0;i<160;i++){if(p())return;await wait(25);}throw Error('condition timeout');};
 const test=async(name,fn)=>{window.__twoAreaSpikeProgress={name,results};try{results.push({name,pass:true,detail:await fn()});}catch(e){results.push({name,pass:false,error:String(e),stack:e.stack});}};
 Services.io.getProtocolHandler('resource').QueryInterface(Ci.nsIResProtocolHandler).setSubstitution('bp-windows',Services.io.newURI(Services.prefs.getStringPref('bp.test.source-root')));
 const api=ChromeUtils.importESModule('resource://bp-windows/scripts/better-pins.uc.mjs');window.addUnloadListener??=(fn)=>window.addEventListener('unload',fn,{once:true});
 assert((await api.bootstrap(window))?.ok,'first boot');const c=window.__betterPinsController;
 const t=await c.newTab('upper'),a=gBrowser.addTab('about:blank?window-folder',{triggeringPrincipal:Services.scriptSecurityManager.getSystemPrincipal()});await c.origins.flush();
 const folder=gZenFolders.createFolder([a],{label:'Window folder',id:'bp-window-folder'});await c.origins.flush();await c.zones.move(folder,'lower');
 const win=OpenBrowserWindow();
 try{
   await until(()=>win.gZenFolders&&win.gZenWorkspaces?.activeWorkspace);await win.gZenWorkspaces.promisePinnedInitialized;
   win.addUnloadListener??=(fn)=>win.addEventListener('unload',fn,{once:true});assert((await api.bootstrap(win))?.ok,'second boot');await wait(250);
   const peer=win.__betterPinsController,pf=win.document.getElementById(folder.id),pt=win.gZenWorkspaces.allStoredTabs.find(x=>x.id===t.id),pa=win.gZenWorkspaces.allStoredTabs.find(x=>x.id===a.id);
   await test('new-window-projects-lower-folder-and-native-collector-members',async()=>{assert(pf&&pa,'folder peer missing');assert(api.areaOf(pf)==='lower','peer upstairs');assert(pa.pinned&&win.gZenWorkspaces.allStoredTabs.includes(pa),'peer structural membership wrong');});
   await test('pin-unpin-mirrors-without-moving-lower-folder',async()=>{assert((await c.policy.pin(a)).ok,'pin');assert(peer.store.read(pa).explicit,'peer missing choice');assert(peer.adapters.getSavedBaseline(pa).entry.url===c.adapters.getSavedBaseline(a).entry.url,'different baseline');await peer.policy.unpin(pa);assert(!c.store.read(a).explicit&&api.areaOf(a)==='lower'&&api.areaOf(pa)==='lower','unpin changed area or failed sync');});
   await test('root-zone-move-keeps-peer-native-membership-consistent',async()=>{assert(pt,'root peer missing');await c.policy.unpin(t);assert((await c.zones.move(t,'lower')).ok,'move');await wait(300);const current=win.gZenWorkspaces.allStoredTabs.find(x=>x.id===t.id);const pinnedOnly=Services.prefs.getBoolPref('zen.window-sync.sync-only-pinned-tabs',true);if(!pinnedOnly){assert(current&&api.areaOf(current)==='lower'&&!current.pinned,'all-tabs peer native/visual membership disagrees');}return {pinnedOnly,sourcePinned:t.pinned,peerExists:!!current,peerPinned:current?.pinned,peerArea:current?api.areaOf(current):null};});
   await test('new-window-delete-does-not-resurrect-on-projection',async()=>{gBrowser.removeTab(a,{animate:false});await wait(300);c.zones.project();peer.zones.project();assert(!gZenWorkspaces.allStoredTabs.some(x=>x.id===a.id),'source resurrected');assert(!win.gZenWorkspaces.allStoredTabs.some(x=>x.id===a.id),'peer resurrected');});
   peer.destroy();
 }finally{win.close();await wait(100);}
 return {results};
})().then(done,e=>done({error:String(e),stack:e.stack}));
