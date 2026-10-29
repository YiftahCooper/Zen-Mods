const done=arguments[arguments.length-1];
(async()=>{
 const wait=ms=>new Promise(r=>setTimeout(r,ms)),assert=(v,m)=>{if(!v)throw Error(m);};
 const mode=Services.prefs.getStringPref('bp.test.mode','prepare');
 const root=Services.prefs.getStringPref('bp.test.source-root');
 const savedState=t=>JSON.parse(SessionStore.getTabState(t)),url=t=>{const s=savedState(t);return s.entries?.[s.index-1]?.url;};
 const load=async(t,address)=>{gBrowser.selectedTab=t;t.linkedBrowser.loadURI(Services.io.newURI(address),{triggeringPrincipal:Services.scriptSecurityManager.getSystemPrincipal()});for(let i=0;i<100;i++){await gBrowser.TabStateFlusher.flush(t.linkedBrowser);if(url(t)===address)return;await wait(25);}throw Error('load timeout');};
 let api,c,expected;
 if(mode!=='absent'){
  const directory=mode==='downgrade'?'artifacts/review-0.1.0-candidate.2/':'';
  Services.io.getProtocolHandler('resource').QueryInterface(Ci.nsIResProtocolHandler).setSubstitution('bp-compat',Services.io.newURI(root+directory));
  api=ChromeUtils.importESModule('resource://bp-compat/scripts/better-pins.uc.mjs');window.addUnloadListener??=(fn)=>window.addEventListener('unload',fn,{once:true});assert((await api.bootstrap(window))?.ok,'bootstrap '+mode);c=window.__betterPinsController;
 }
 if(mode==='prepare'){
  const t=await c.newTab('lower');await load(t,'about:blank?bp-recovery-baseline');assert((await c.policy.pin(t)).ok,'pin root');await load(t,'about:blank?bp-recovery-current');
  const a=await c.newTab('lower'),b=await c.newTab('lower');const folder=gZenFolders.createFolder([a,b],{label:'Missing-code recovery',id:'bp-missing-folder'});await c.origins.flush();await c.zones.move(folder,'lower');
  expected={root:t.id,folder:folder.id,child:a.id,removed:b.id,baseline:'about:blank?bp-recovery-baseline',current:url(t),intent:SessionStore.getCustomTabValue(t,'better-zen-folders.url-pin.v1'),area:SessionStore.getCustomWindowValue(window,'better-pins.areas.v1')};
 }else{
  expected=JSON.parse(Services.prefs.getStringPref('bp.test.compatibility'));
  const t=gZenWorkspaces.allStoredTabs.find(t=>t.id===expected.root),folder=document.getElementById(expected.folder);
  assert(t&&folder,'surviving identities missing '+mode);assert(url(t)===expected.current,'current page changed '+mode);
  assert(SessionStore.getCustomTabValue(t,'better-zen-folders.url-pin.v1')===expected.intent,'saved choice changed '+mode);
  if(mode==='absent'){
   assert(!window.__betterPinsController,'mod activated in absent-code stage');
   assert(SessionStore.getCustomWindowValue(window,'better-pins.areas.v1')===expected.area,'absent code changed zone record');
   const removed=gZenWorkspaces.allStoredTabs.find(t=>t.id===expected.removed);assert(removed,'child missing before native Close');gBrowser.removeTab(removed,{animate:false});
   const newcomer=gBrowser.addTab('about:blank?created-without-mod',{triggeringPrincipal:Services.scriptSecurityManager.getSystemPrincipal()});await load(newcomer,'about:blank?created-without-mod');
   for(let i=0;i<100&&!newcomer.id;i++)await wait(25);assert(newcomer.id,'native newcomer identity was not assigned');expected.newcomer=newcomer.id;
  }else{
   assert(c.store.read(t).explicit&&c.adapters.getSavedBaseline(t)?.entry?.url===expected.baseline,'pin recovery failed '+mode);
   assert(api.areaOf(t)==='lower'&&api.areaOf(folder)==='lower','zone recovery failed '+mode);
   assert(!gZenWorkspaces.allStoredTabs.some(t=>t.id===expected.removed),'closed child resurrected '+mode);
   assert(gZenWorkspaces.allStoredTabs.some(t=>t.id===expected.newcomer),'native newcomer lost '+mode);
   const result=await c.policy.reset(t);assert(result.ok,'recovered Reset refused');for(let i=0;i<100&&t.linkedBrowser.currentURI.spec!==expected.baseline;i++)await wait(25);await gBrowser.TabStateFlusher.flush(t.linkedBrowser);assert(url(t)===expected.baseline,'recovered baseline did not navigate');await load(t,expected.current);
  }
 }
 Services.prefs.setStringPref('bp.test.compatibility',JSON.stringify(expected));Services.prefs.savePrefFile(null);
 for(const t of gZenWorkspaces.allStoredTabs)await gBrowser.TabStateFlusher.flush(t.linkedBrowser);
 const {SessionSaver}=ChromeUtils.importESModule('moz-src:///browser/components/sessionstore/SessionSaver.sys.mjs');await SessionSaver.run();
 return {results:[{name:'bounded-missing-code-and-candidate-2-roundtrip-'+mode,pass:true}],expected};
})().then(done,e=>done({error:String(e),stack:e.stack}));
