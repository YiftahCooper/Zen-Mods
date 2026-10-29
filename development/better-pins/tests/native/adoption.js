const done=arguments[arguments.length-1];
(async()=>{
 const wait=ms=>new Promise(r=>setTimeout(r,ms)),assert=(v,m)=>{if(!v)throw Error(m);};
 const principal=Services.scriptSecurityManager.getSystemPrincipal(),intentKey='better-zen-folders.url-pin.v1';
 const add=async name=>{const address='about:blank?adopt-'+name,tab=gBrowser.addTab(address,{triggeringPrincipal:principal});gBrowser.selectedTab=tab;for(let i=0;i<100;i++){await gBrowser.TabStateFlusher.flush(tab.linkedBrowser);const state=JSON.parse(SessionStore.getTabState(tab));if(tab.id&&state.entries?.[state.index-1]?.url===address)return tab;await wait(20);}throw Error('native page/identity not ready');};
 const nativeRoot=await add('native-root');gBrowser.pinTab(nativeRoot);await gZenWindowSync.setPinnedTabState(nativeRoot);const baseline=nativeRoot._zenPinnedInitialState?.entry?.url;assert(baseline,'native saved URL missing');
 const folderTab=await add('folder'),folder=gZenFolders.createFolder([folderTab],{label:'Existing native folder'});
 const knownPin=await add('known-pin');gBrowser.pinTab(knownPin);await gZenWindowSync.setPinnedTabState(knownPin);SessionStore.setCustomTabValue(knownPin,intentKey,JSON.stringify({schema:1,tabId:knownPin.id,explicit:true}));
 const knownOrdinary=await add('known-ordinary');gBrowser.pinTab(knownOrdinary);SessionStore.setCustomTabValue(knownOrdinary,intentKey,JSON.stringify({schema:1,tabId:knownOrdinary.id,explicit:false}));
 const invalid=await add('future-record'),raw='{"schema":77,"keep":"unknown-record"}';SessionStore.setCustomTabValue(invalid,intentKey,raw);
 nativeRoot.linkedBrowser.loadURI(Services.io.newURI('about:blank?adopt-root-current'),{triggeringPrincipal:principal});for(let i=0;i<100;i++){await gBrowser.TabStateFlusher.flush(nativeRoot.linkedBrowser);if(nativeRoot.linkedBrowser.currentURI.spec==='about:blank?adopt-root-current')break;await wait(20);}
 Services.io.getProtocolHandler('resource').QueryInterface(Ci.nsIResProtocolHandler).setSubstitution('bp-adoption',Services.io.newURI(Services.prefs.getStringPref('bp.test.source-root')));
 const api=ChromeUtils.importESModule('resource://bp-adoption/scripts/better-pins.uc.mjs');window.addUnloadListener??=(fn)=>window.addEventListener('unload',fn,{once:true});const boot=await api.bootstrap(window);assert(boot?.ok,'adoption boot');const c=window.__betterPinsController;
 const results=[];const test=async(name,fn)=>{try{await fn();results.push({name,pass:true});}catch(e){results.push({name,pass:false,error:String(e),stack:e.stack});}};
 await test('existing-native-root-adopts-saved-baseline-without-navigating',()=>{assert(c.store.read(nativeRoot).explicit,'root pin lost');assert(c.adapters.getSavedBaseline(nativeRoot).entry.url===baseline,'root baseline replaced');assert(nativeRoot.linkedBrowser.currentURI.spec==='about:blank?adopt-root-current','adoption navigated root');});
 await test('existing-ambiguous-native-folder-tab-adopts-ordinary-intent',()=>{assert(folderTab.closest('zen-folder')===folder&&folderTab.pinned,'native folder membership changed');assert(!c.store.read(folderTab).explicit,'structural pin became URL pin');});
 await test('existing-known-url-pin-is-preserved',()=>{assert(c.store.read(knownPin).explicit,'known pin lost');assert(c.adapters.getSavedBaseline(knownPin).entry.url===knownPin._zenPinnedInitialState.entry.url,'known baseline mismatch');});
 await test('existing-known-ordinary-choice-defeats-native-upper-placement',()=>{assert(knownOrdinary.pinned&&api.areaOf(knownOrdinary)==='upper'&&!c.store.read(knownOrdinary).explicit,'known ordinary choice reinterpreted');});
 await test('future-intent-record-is-preserved-and-its-tab-is-blocked',async()=>{assert(boot.unresolved===1,'unresolved tab not reported');assert(!(await c.policy.unpin(invalid)).ok,'unknown record editable');assert(SessionStore.getCustomTabValue(invalid,intentKey)===raw,'future bytes overwritten');});
 return {results};
})().then(done,e=>done({error:String(e),stack:e.stack}));
