const done=arguments[arguments.length-1];
(async()=>{
 const results=[],assert=(v,m)=>{if(!v)throw Error(m);};
 const test=async(name,fn)=>{try{results.push({name,pass:true,detail:await fn()});}catch(e){results.push({name,pass:false,error:String(e),stack:e.stack});}};
 Services.io.getProtocolHandler('resource').QueryInterface(Ci.nsIResProtocolHandler).setSubstitution('bp-activation',Services.io.newURI(Services.prefs.getStringPref('bp.test.source-root')));
 const api=ChromeUtils.importESModule('resource://bp-activation/scripts/better-pins.uc.mjs');window.addUnloadListener??=(fn)=>window.addEventListener('unload',fn,{once:true});
 const key='zen.pinned-tab-manager.restore-pinned-tabs-to-pinned-url',nativeCreate=gZenFolders.createFolder;
 const originalServices=window.Services,servicesDescriptor=Object.getOwnPropertyDescriptor(window,'Services');
 let confirmation=1,confirmations=0,alerts=0;
 const prompt=new Proxy({},{get:(_,name)=>name==='confirmEx'?()=>{confirmations++;return confirmation;}:name==='alert'?()=>{alerts++;}:Reflect.get(originalServices.prompt,name)});
 Object.defineProperty(window,'Services',{configurable:true,value:new Proxy({},{get:(_,name)=>name==='prompt'?prompt:Reflect.get(originalServices,name)})});
 try{
  await test('declining-first-run-leaves-startup-pref-and-native-hooks-alone',async()=>{
   Services.prefs.clearUserPref('better-pins.consent-version');Services.prefs.setBoolPref(key,true);
   const result=await api.bootstrap(window);assert(!result.ok&&result.reason==='declined','decline ignored');
   assert(Services.prefs.getBoolPref(key),'startup preference changed');assert(gZenFolders.createFolder===nativeCreate,'native method changed');assert(!window.__betterPinsController,'controller remained');assert(!document.querySelector('.better-pins-divider'),'divider remained');
  });
  await test('accepting-first-run-disables-startup-reset-once-and-activates',async()=>{
   confirmation=0;const result=await api.bootstrap(window);assert(result.ok,'accept failed');assert(!Services.prefs.getBoolPref(key),'startup reset not disabled');assert(Services.prefs.getIntPref('better-pins.consent-version')===1,'consent not retained');
   window.__betterPinsController.destroy();const count=confirmations;assert((await api.bootstrap(window)).ok,'second activation failed');assert(confirmations===count,'consent asked twice');window.__betterPinsController.destroy();
  });
  await test('corrupt-zone-record-refuses-activation-and-restores-native-entry-points',async()=>{
   const raw='{"schema":99,"spaces":{}}';SessionStore.setCustomWindowValue(window,api.AREA_KEY,raw);
   const result=await api.bootstrap(window);assert(!result.ok,'future area state accepted');assert(SessionStore.getCustomWindowValue(window,api.AREA_KEY)===raw,'future record changed');
   assert(gZenFolders.createFolder===nativeCreate,'native method retained');assert(!window.__betterPinsController,'failed controller remained');assert(!document.documentElement.hasAttribute('better-pins-active'),'active marker remained');assert(!document.querySelector('.better-pins-divider'),'divider leaked');
   SessionStore.deleteCustomWindowValue(window,api.AREA_KEY);
   assert((await api.bootstrap(window)).ok,'clean activation after failure refused');
  });
 }finally{
  if(servicesDescriptor)Object.defineProperty(window,'Services',servicesDescriptor);else delete window.Services;
 }
 return {results,confirmations,alerts};
})().then(done,e=>done({error:String(e),stack:e.stack}));
