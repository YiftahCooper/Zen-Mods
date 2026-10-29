// Run only through the disposable native driver; never against an existing profile.
const done=arguments[arguments.length-1];
(async()=>{
 const results=[],wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
 const assert=(value,message)=>{if(!value)throw Error(message);};
 const equal=(actual,expected,message)=>assert(JSON.stringify(actual)===JSON.stringify(expected),message+' '+JSON.stringify({actual,expected}));
 const until=async(predicate,message)=>{for(let i=0;i<100;i++){if(await predicate())return;await wait(30);}throw Error('Timed out: '+message+'; selected='+JSON.stringify({id:gBrowser.selectedTab?.id,uri:gBrowser.selectedTab?.linkedBrowser.currentURI.spec,state:gBrowser.selectedTab?SessionStore.getTabState(gBrowser.selectedTab):null}));};
 const test=async(name,operation)=>{
  window.__twoAreaSpikeProgress={name,results};
  try{results.push({name,pass:true,detail:await operation()});}
  catch(error){results.push({name,pass:false,error:String(error),stack:error.stack});}
 };
 const root=Services.prefs.getStringPref('bp.test.source-root');
 Services.io.getProtocolHandler('resource').QueryInterface(Ci.nsIResProtocolHandler).setSubstitution('bp-extended',Services.io.newURI(root));
 const api=ChromeUtils.importESModule('resource://bp-extended/scripts/better-pins.uc.mjs');
 window.addUnloadListener??=(listener)=>window.addEventListener('unload',listener,{once:true});
 if(!window.__betterPinsController?.result?.ok)assert((await api.bootstrap(window))?.ok,'Better Pins bootstrap failed');
 const c=window.__betterPinsController,principal=Services.scriptSecurityManager.getSystemPrincipal();
 const INTENT_KEY='better-zen-folders.url-pin.v1',BASELINE_KEY='better-pins.baseline.v1';
 const STARTUP_KEY='zen.pinned-tab-manager.restore-pinned-tabs-to-pinned-url';
 const DEFAULT_KEYS=['pin-new-upper-tabs','pin-new-lower-tabs','pin-new-upper-folder-tabs','pin-new-lower-folder-tabs'].map(key=>'better-pins.'+key);
 const prefReceipt=key=>({key,user:Services.prefs.prefHasUserValue(key),value:Services.prefs.getBoolPref(key,false)});
 const restorePref=receipt=>receipt.user?Services.prefs.setBoolPref(receipt.key,receipt.value):Services.prefs.clearUserPref(receipt.key);
 const previousDefaults=DEFAULT_KEYS.map(prefReceipt);
 const state=tab=>JSON.parse(SessionStore.getTabState(tab));
 const current=tab=>{const saved=state(tab);return saved.entries?.[saved.index-1]?.url;};
 const history=tab=>{const saved=state(tab);return {urls:saved.entries?.map(entry=>entry.url)??[],index:saved.index};};
 const savedUrl=tab=>c.adapters.getSavedBaseline(tab)?.entry?.url;
 const page=name=>'data:text/html,'+encodeURIComponent('<!doctype html><title>BP Extended '+name+'</title><p>Disposable synthetic '+name+'</p>');
 const loaded=async(tab,url)=>{
  await until(()=>tab.linkedBrowser.currentURI.spec===url,'browser URL '+url);
  await until(async()=>{await gBrowser.TabStateFlusher.flush(tab.linkedBrowser);return current(tab)===url;},'SessionStore current URL');
 };
 const navigate=async(tab,url)=>{
  gBrowser.selectedTab=tab;
  tab.linkedBrowser.loadURI(Services.io.newURI(url),{triggeringPrincipal:principal});
  await loaded(tab,url);
 };
 const add=async name=>{
  const url=page(name),tab=gBrowser.addTab(url,{triggeringPrincipal:principal});
  gBrowser.selectedTab=tab;await loaded(tab,url);await c.origins.flush();return tab;
 };
 const make=async(name,zone,folderTab=false)=>{
  const tab=await add(name+'-A');let folder=null;
  if(folderTab){folder=gZenFolders.createFolder([tab],{label:'BP Extended '+name,id:'bp-extended-'+name});await c.origins.flush();}
  const moved=await c.zones.move(folder??tab,zone);assert(moved.ok,'fixture zone move '+JSON.stringify(moved));
  assert(api.areaOf(tab)===zone,'fixture has wrong zone');
  assert(c.store.read(tab).status==='known'&&!c.store.read(tab).explicit,'fixture must start with saved ordinary intent');
  return {tab,folder};
 };
 const placement=tab=>({parent:tab.parentNode,folder:tab.closest('zen-folder'),pinned:tab.pinned,area:api.areaOf(tab)});
 const assertPlacement=(tab,before)=>{
  assert(tab.parentNode===before.parent&&tab.closest('zen-folder')===before.folder,'action changed parent or folder membership');
  assert(tab.pinned===before.pinned&&api.areaOf(tab)===before.area,'action changed native membership or zone');
 };
 const assertBaseline=(tab,url)=>{
  assert(savedUrl(tab)===url,'wrong native saved URL');
  const saved=JSON.parse(SessionStore.getCustomTabValue(tab,BASELINE_KEY));
  assert(saved.schema===1&&saved.baseline?.entry?.url===url,'independent saved URL differs from native baseline');
 };
 // Replace only the prompt boundary. URI fixup, native baseline capture,
 // persistence, policy cancellation and subsequent navigation remain real.
 const editWithPrompt=async(tab,accepted,url)=>{
  const originalServices=window.Services,descriptor=Object.getOwnPropertyDescriptor(window,'Services');let calls=0;
  const wrapper=(host,title,label,value)=>{
   calls++;assert(host===window&&title==='Edit Pinned URL','unexpected prompt received the test response');
   if(accepted)value.value=url;return accepted;
  };
  // XPConnect prompt methods are nonconfigurable. Empty proxy targets avoid
  // violating their property invariants while forwarding every other service.
  const prompt=new Proxy({},{get:(_,name)=>name==='prompt'?wrapper:Reflect.get(originalServices.prompt,name)});
  const services=new Proxy({},{get:(_,name)=>name==='prompt'?prompt:Reflect.get(originalServices,name)});
  Object.defineProperty(window,'Services',{value:services,configurable:true});
  try{
   assert(c.host.Services.prompt.prompt===wrapper,'prompt override is not visible to the browser adapter');
   const result=await c.policy.edit(tab);assert(calls===1,'Edit did not use exactly one prompt');return result;
  }finally{
   assert(window.Services===services,'another writer replaced Services during the probe');
   if(descriptor)Object.defineProperty(window,'Services',descriptor);else delete window.Services;
  }
 };
 let guard;
 const unload=async(tab,expectedExplicit,before)=>{
  const beforeHistory=history(tab),beforeUrl=current(tab),baseline=SessionStore.getCustomTabValue(tab,BASELINE_KEY);
  gBrowser.selectedTab=guard;await until(()=>!tab.selected,'target deselection before unload');
  const result=await c.policy.unload([tab]);assert(result.ok,'unload failed '+JSON.stringify(result));
  assert(tab.hasAttribute('pending'),'unload did not leave a pending tab');
  equal(history(tab),beforeHistory,'unload changed navigation history');assert(current(tab)===beforeUrl,'unload changed current URL');
  assert(c.store.read(tab).explicit===expectedExplicit,'unload changed URL-pin intent');
  assert(SessionStore.getCustomTabValue(tab,BASELINE_KEY)===baseline,'unload changed durable baseline');
  assertPlacement(tab,before);
 };
 try{
  for(const key of DEFAULT_KEYS)Services.prefs.setBoolPref(key,false);
  guard=await add('unload-guard');
  for(const zone of ['upper','lower'])for(const folderTab of [false,true]){
   const name=zone+'-'+(folderTab?'folder-tab':'root');
   await test(name+'-pin-update-edit-reset-unpin-unload',async()=>{
    const {tab}=await make(name,zone,folderTab),before=placement(tab),steps=[];
    const A=page(name+'-A'),B=page(name+'-B'),C=page(name+'-C'),D=page(name+'-D');
    const edited=Services.io.newURI('about:blank?bp-extended-edit='+name).spec;
    assert((await c.policy.pin(tab)).ok,'Pin failed');assert(c.store.read(tab).explicit,'Pin did not persist intent');assertBaseline(tab,A);steps.push('pin');
    await navigate(tab,B);assertBaseline(tab,A);assertPlacement(tab,before);steps.push('navigate-without-rebase');
    const beforeUpdate=history(tab);
    assert((await c.policy.update(tab)).ok,'Update failed');assertBaseline(tab,B);equal(history(tab),beforeUpdate,'Update changed history');steps.push('update');
    const intent=SessionStore.getCustomTabValue(tab,INTENT_KEY),baseline=SessionStore.getCustomTabValue(tab,BASELINE_KEY);
    const cancelled=await editWithPrompt(tab,false);
    assert(!cancelled.ok&&cancelled.reason==='cancelled','cancelled Edit was not refused');
    assert(SessionStore.getCustomTabValue(tab,INTENT_KEY)===intent&&SessionStore.getCustomTabValue(tab,BASELINE_KEY)===baseline,'cancelled Edit changed saved state');
    assertBaseline(tab,B);equal(history(tab),beforeUpdate,'cancelled Edit changed history');steps.push('edit-cancel');
    assert((await editWithPrompt(tab,true,edited)).ok,'accepted Edit failed');assertBaseline(tab,edited);
    assert(current(tab)===B,'Edit navigated before Reset');equal(history(tab),beforeUpdate,'accepted Edit changed history');steps.push('edit-accept');
    await navigate(tab,C);assert((await c.policy.reset(tab)).ok,'Reset failed');await loaded(tab,edited);
    assertBaseline(tab,edited);assert(c.store.read(tab).explicit,'Reset removed intent');
    for(const url of [A,B,C])assert(history(tab).urls.includes(url),'Reset discarded an earlier history entry');
    assertPlacement(tab,before);steps.push('reset');
    await navigate(tab,D);await unload(tab,true,before);steps.push('unload-pinned');
    gBrowser.selectedTab=tab;await until(()=>!tab.hasAttribute('pending'),'pinned tab restoration after unload');await loaded(tab,D);
    const beforeUnpin=history(tab);
    assert((await c.policy.unpin(tab)).ok,'Unpin failed');assert(!c.store.read(tab).explicit,'Unpin did not persist intent');
    assert(current(tab)===D,'Unpin navigated');equal(history(tab),beforeUnpin,'Unpin changed history');assertBaseline(tab,edited);assertPlacement(tab,before);
    const refused=await c.policy.reset(tab);assert(!refused.ok&&refused.reason==='not-url-pinned','Reset remained available after Unpin');assert(current(tab)===D,'refused Reset navigated');steps.push('unpin');
    await unload(tab,false,before);steps.push('unload-ordinary');
    return {id:tab.id,zone,folderTab,steps};
   });
  }
  await test('external-startup-reset-enablement-refuses-actions-without-changing-state',async()=>{
   const {tab}=await make('startup-gate','lower');assert((await c.policy.pin(tab)).ok,'fixture Pin failed');
   const before=placement(tab),savedHistory=history(tab),intent=SessionStore.getCustomTabValue(tab,INTENT_KEY),baseline=SessionStore.getCustomTabValue(tab,BASELINE_KEY);
   const previous=prefReceipt(STARTUP_KEY);
   try{
    Services.prefs.setBoolPref(STARTUP_KEY,true);
    for(const action of ['pin','update','edit','reset','unpin','unload','close']){
     const result=await c.policy[action](['unload','close'].includes(action)?[tab]:tab);
     assert(!result.ok&&result.reason==='startup-reset-enabled',action+' ignored the startup-reset gate '+JSON.stringify(result));
     assert(tab.isConnected&&!tab.closing,'refused action closed the tab');
     assert(SessionStore.getCustomTabValue(tab,INTENT_KEY)===intent&&SessionStore.getCustomTabValue(tab,BASELINE_KEY)===baseline,'refused '+action+' changed saved bytes');
     equal(history(tab),savedHistory,'refused '+action+' changed history');assertPlacement(tab,before);
    }
   }finally{restorePref(previous);}
   assert(c.policy.blocked(tab)===null,'restoring startup setting did not release the command gate');
   return {id:tab.id,actions:7};
  });
  await test('invalid-intent-refuses-actions-and-preserves-exact-corrupt-bytes',async()=>{
   const {tab}=await make('invalid-intent','lower');assert((await c.policy.pin(tab)).ok,'fixture Pin failed');
   const targets=c.adapters.getIntentTargets(tab),previous=targets.map(target=>({tab:target,raw:SessionStore.getCustomTabValue(target,INTENT_KEY)}));
   const raw=JSON.stringify({schema:99,tabId:tab.id,explicit:true,preserve:'future-record-bytes'});
   const before=placement(tab),savedHistory=history(tab),baseline=SessionStore.getCustomTabValue(tab,BASELINE_KEY);
   try{
    for(const target of targets)SessionStore.setCustomTabValue(target,INTENT_KEY,raw);
    assert(c.store.read(tab).status==='invalid','fixture was not classified as invalid');
    for(const action of ['pin','update','edit','reset','unpin','unload','close']){
     const result=await c.policy[action](['unload','close'].includes(action)?[tab]:tab);
     assert(!result.ok,action+' accepted invalid metadata');assert(tab.isConnected&&!tab.closing,'refused action closed the tab');
     for(const target of targets)assert(SessionStore.getCustomTabValue(target,INTENT_KEY)===raw,'refused '+action+' rewrote corrupt bytes');
     assert(SessionStore.getCustomTabValue(tab,BASELINE_KEY)===baseline,'refused '+action+' changed the saved baseline');
     equal(history(tab),savedHistory,'refused '+action+' changed history');assertPlacement(tab,before);
    }
   }finally{
    for(const entry of previous)SessionStore.setCustomTabValue(entry.tab,INTENT_KEY,entry.raw??'');
    c.presentation.refresh();
   }
   return {id:tab.id,actions:7,raw};
  });
  await test('native-essentials-conversion-releases-styling-and-retains-native-reset',async()=>{
   const {tab}=await make('essential','upper');await navigate(tab,'about:blank?bp-essential-native-baseline');assert((await c.policy.pin(tab)).ok,'fixture Pin failed');
   await until(()=>tab.hasAttribute('better-pins-tab'),'initial supported-tab styling');
   assert(gZenPinnedTabManager.canEssentialBeAdded(tab),'native Essentials eligibility rejected the fixture');
   try{
    assert(gZenPinnedTabManager.addToEssentials(tab)===true,'native Essentials conversion failed');
    await c.origins.flush();await until(()=>tab.hasAttribute('zen-essential')&&!tab.hasAttribute('better-pins-tab'),'Essentials styling reconciliation');
    assert(c.adapters.classify(tab)==='essential'&&!c.supported(tab),'converted tab remained supported');
    assert(!c.presentation.buttons.has(tab),'converted tab retained a Better Pins URL button');
    await gZenWindowSync.setPinnedTabState(tab);
    const nativeBaseline=tab._zenPinnedInitialState?.entry?.url;assert(nativeBaseline,'native Essentials baseline was not captured');
    await navigate(tab,page('essential-navigated'));
    const refused=await c.policy.reset(tab);assert(!refused.ok&&refused.reason==='unsupported','Better Pins still owns Essential Reset');
    assert(current(tab)!==nativeBaseline,'refused Better Pins Reset navigated');
    gZenPinnedTabManager.resetPinnedTab(tab);await loaded(tab,nativeBaseline);
    equal(history(tab).urls,[nativeBaseline],'Essential Reset did not retain native single-entry history semantics');
    assert(tab.hasAttribute('zen-essential')&&!tab.hasAttribute('better-pins-tab'),'native reset restored Better Pins styling');
    return {id:tab.id,nativeBaseline,nativeHistoryEntries:history(tab).urls.length};
   }finally{
    if(tab.isConnected&&tab.hasAttribute('zen-essential')){gZenPinnedTabManager.removeEssentials(tab);await c.origins.flush();}
   }
  });
 }finally{for(const receipt of previousDefaults)restorePref(receipt);}
 return {results,gaps:['Consent decline/accept needs a separately isolated first-run fixture; this suite keeps the active controller.']};
})().then(done,error=>done({error:String(error),stack:error.stack}));
