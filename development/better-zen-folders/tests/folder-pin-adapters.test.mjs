import test from 'node:test';
import assert from 'node:assert/strict';
import {runInNewContext} from 'node:vm';
import * as api from '../scripts/better-zen-folders.uc.mjs';

async function fixture() {
  const values=new Map(),folder={isZenFolder:true,parentFolder:null},errors=[];
  const tab={id:'id-one',localName:'tab',isConnected:true,pinned:true,closing:false,
    attrs:new Set(),hasAttribute(n){return this.attrs.has(n);},closest(){return this.folder;},folder,
    linkedBrowser:{},_zenPinnedInitialState:{entry:{url:'https://example.test/A',title:'A'}},
    state:{entries:[{url:'https://example.test/A'},{url:'https://example.test/B',title:'B'}],index:2,image:'icon'}};
  const host={document:{},closed:false,__SSi:'one',gBrowser:{
    removeTabs(tabs,options){host.closeOptions=options;for(const t of tabs)if(!host.refuse)t.isConnected=false;},
    async explicitUnloadTabs(tabs){for(const t of tabs)t.attrs.add('pending');return true;},
  },gZenStartup:{promiseInitialized:Promise.resolve()},gZenWorkspaces:{promiseInitialized:Promise.resolve(),allStoredTabs:[tab]},
    Services:{prefs:{getBoolPref:()=>false}},console:{error:e=>errors.push(e)},
    SessionStore:{getCustomTabValue:t=>values.get(t)??'',setCustomTabValue:(t,k,v)=>values.set(t,v),
      getTabState:t=>JSON.stringify(t.state)},
    gZenPinnedTabManager:{resetPinnedTab(t){t.state={...t.state,entries:[{...t._zenPinnedInitialState.entry}],index:1};}},
    gZenWindowSync:{setPinnedInitialState(t,entry,image){t._zenPinnedInitialState={entry,image};}},
  };
  tab.ownerGlobal=host;tab.ownerDocument=host.document;let flushed=0;
  const adapters=api.createBrowserFolderPinAdapters(host,{flushTab:async()=>{flushed++;}});
  assert.equal(adapters.isRestorationReady(),false);
  await adapters.ready;
  return {host,tab,folder,adapters,errors,flushed:()=>flushed};
}

test('browser scope follows physical folders, rejects live ancestors, and waits for native readiness',async()=>{
  const f=await fixture(),a=f.adapters,t=f.tab;
  assert.equal(a.isRestorationReady(),true);assert.equal(a.classify(t),'regular-folder');
  t.group={isZenFolder:false};assert.equal(a.classify(t),'regular-folder','split wrapper is not its physical folder');
  f.folder.parentFolder={isZenFolder:true,isLiveFolder:true};assert.equal(a.classify(t),'live');f.folder.parentFolder=null;
  t.attrs.add('zen-essential');assert.equal(a.classify(t),'essential');t.attrs.clear();
  t.folder=null;assert.equal(a.classify(t),'root');t.folder=f.folder;
  t.attrs.add('zen-empty-tab');assert.equal(a.classify(t),'unsupported');t.attrs.clear();
  t.ownerGlobal={};assert.equal(a.classify(t),'regular-folder','window wrappers are not document identity');
  t.ownerDocument={};assert.equal(a.classify(t),'unsupported');
});

test('activation waits for both restored session records and native pinned-folder reconstruction',async()=>{
 const f=await fixture();let session,pins;
 f.host.SessionStore.promiseAllWindowsRestored=new Promise(r=>session=r);
 f.host.gZenWorkspaces.promisePinnedInitialized=new Promise(r=>pins=r);
 const a=api.createBrowserFolderPinAdapters(f.host);await Promise.resolve();await Promise.resolve();
 assert.equal(a.isRestorationReady(),false);session();await Promise.resolve();assert.equal(a.isRestorationReady(),false);
 pins();assert.equal(await a.ready,true);
});

test('browser pin captures the current history entry without resetting or moving, and rollback is owned',async()=>{
  const f=await fixture(),t=f.tab,a=f.adapters,old=a.captureBaseline(t),state=structuredClone(t.state);
  const next=await a.setCurrentAsBaseline(t);
  assert.equal(f.flushed(),1);assert.equal(t._zenPinnedInitialState.entry.url,'https://example.test/B');
  assert.deepEqual(t.state,state);assert.equal(t.folder,f.folder);
  assert.equal(a.restoreBaseline(t,old,next),true);assert.equal(t._zenPinnedInitialState.entry.url,'https://example.test/A');
  const other=await a.setCurrentAsBaseline(t);t._zenPinnedInitialState=structuredClone(t._zenPinnedInitialState);
  assert.equal(a.restoreBaseline(t,old,other),false,'equal bytes from a later owner are not ours');
});

test('pending tabs use saved history; a failed or stale flush never replaces a baseline',async()=>{
  const f=await fixture();f.tab.attrs.add('pending');await f.adapters.setCurrentAsBaseline(f.tab);assert.equal(f.flushed(),0);
  for(const mutate of [()=>{throw Error('flush');},t=>{t.folder=null;},t=>{t.id='other';},t=>{t.state.entries=[];}]){
    const g=await fixture(),old=g.tab._zenPinnedInitialState;
    const a=api.createBrowserFolderPinAdapters(g.host,{flushTab:async()=>mutate(g.tab)});await a.ready;
    await assert.rejects(a.setCurrentAsBaseline(g.tab));assert.equal(g.tab._zenPinnedInitialState,old);
  }
});

test('browser Close respects refusal and native undo/prompts; Unload never invokes reset',async()=>{
  const f=await fixture();f.host.refuse=true;
  assert.equal(await f.adapters.closeTabs([f.tab]),false);assert.equal(f.tab.isConnected,true);
  assert.equal(f.host.closeOptions?.skipPermitUnload,undefined);assert.equal(f.host.closeOptions?.skipSessionStore,undefined);
  const before=structuredClone(f.tab.state);assert.equal(await f.adapters.unloadTabs([f.tab]),true);assert.deepEqual(f.tab.state,before);
  f.host.refuse=false;assert.equal(await f.adapters.closeTabs([f.tab]),true);
});

test('Reset uses captured native entry point and verifies it acted, rather than reporting a silent no-op',async()=>{
  const f=await fixture();f.host.gZenPinnedTabManager.resetPinnedTab=()=>{throw Error('later wrapper');};
  await f.adapters.resetToBaseline(f.tab);assert.equal(f.tab.state.entries[0].url,'https://example.test/A');
  const g=await fixture();g.host.gZenPinnedTabManager.resetPinnedTab=()=>{};
  const a=api.createBrowserFolderPinAdapters(g.host,{flushTab:async()=>{}});await a.ready;
  await assert.rejects(a.resetToBaseline(g.tab),/verify/);
});

test('partial native baseline writes are rolled back before an adapter rejects',async()=>{
  const f=await fixture(),old=structuredClone(f.tab._zenPinnedInitialState);
  f.host.gZenWindowSync.setPinnedInitialState=(t,entry,image)=>{t._zenPinnedInitialState={entry,image};throw Error('partial');};
  await assert.rejects(f.adapters.setCurrentAsBaseline(f.tab),/partial/);
  assert.deepEqual(f.tab._zenPinnedInitialState,old);
});

test('default flushing uses Zen\'s public flusher getter instead of assuming a resource path',async()=>{
  const f=await fixture();let calls=0;
  f.host.gBrowser.TabStateFlusher={flush:async browser=>{assert.equal(browser,f.tab.linkedBrowser);calls++;}};
  const a=api.createBrowserFolderPinAdapters(f.host);await a.ready;
  await a.setCurrentAsBaseline(f.tab);assert.equal(calls,1);
});

test('mirrored intent and baselines commit together; conflicting records block every command',async()=>{
  const f=await fixture(),other={...f.tab},window2={closed:false,__SSi:'two',gZenWindowSync:f.host.gZenWindowSync,gZenWorkspaces:{allStoredTabs:[other]}};
  f.host.Services.wm={getEnumerator:()=>[f.host,window2]};
  const store=new api.FolderPinIntentStore(f.adapters);store.write(f.tab,false);
  assert.equal(store.read(other).explicit,false);assert.equal(f.adapters.getCommandBlockReason(f.tab),null);
  f.host.gZenWindowSync.setPinnedInitialState=(t,entry,image)=>{t._zenPinnedInitialState=other._zenPinnedInitialState={entry,image};};
  const policy=new api.FolderPinPolicy(f.adapters,store);policy.start();
  assert.deepEqual(await policy.pin(f.tab),{ok:true});assert.equal(store.read(other).explicit,true);
  assert.equal(other._zenPinnedInitialState.entry.url,'https://example.test/B');
  f.host.SessionStore.setCustomTabValue(other,api.FOLDER_PIN_INTENT_KEY,'');
  assert.deepEqual(await policy.unpin(f.tab),{ok:false,reason:'conflicting-intent'});
});

test('shared-window transactions serialize by stable identity without locking unrelated private windows',async()=>{
  const f=await fixture(),store=new api.FolderPinIntentStore(f.adapters);store.write(f.tab,false);
  const second=api.createBrowserFolderPinAdapters(f.host);await second.ready;
  assert.equal(second.coordinator,f.adapters.coordinator);
  const p=new api.FolderPinPolicy(f.adapters,store),q=new api.FolderPinPolicy(second,store);p.start();q.start();
  let release;const capture=f.adapters.setCurrentAsBaseline;
  f.adapters.setCurrentAsBaseline=async t=>{const value=await capture(t);await new Promise(r=>release=r);return value;};
  const pending=p.pin(f.tab);await new Promise(r=>setImmediate(r));
  assert.deepEqual(await q.unpin(f.tab),{ok:false,reason:'busy'});release();assert.deepEqual(await pending,{ok:true});
  assert.deepEqual(await q.unpin(f.tab),{ok:true});
  const privateHost={...f.host,gZenWorkspaces:{...f.host.gZenWorkspaces,privateWindowOrDisabled:true}};
  const privateAdapters=api.createBrowserFolderPinAdapters(privateHost);await privateAdapters.ready;
  assert.notEqual(privateAdapters.coordinator,second.coordinator);
  assert.deepEqual(privateAdapters.getIntentTargets(f.tab),[f.tab]);
});

test('Edit saved URL validates input and leaves the current page and history unchanged',async()=>{
  const f=await fixture(),before=structuredClone(f.tab.state);
  f.host.Services.io={newURI:input=>({spec:new URL(input).href,scheme:new URL(input).protocol.slice(0,-1)})};
  await f.adapters.setUrlAsBaseline(f.tab,'https://example.test/edited');
  assert.equal(f.tab._zenPinnedInitialState.entry.url,'https://example.test/edited');
  assert.deepEqual(f.tab.state,before);assert.equal(f.flushed(),0);
  const saved=f.tab._zenPinnedInitialState;
  for(const input of ['',undefined,'javascript:alert(1)','data:text/html,test','chrome://browser/content/browser.xhtml']){
    await assert.rejects(f.adapters.setUrlAsBaseline(f.tab,input));assert.equal(f.tab._zenPinnedInitialState,saved);
  }
});

test('Edit prompt states that saving does not navigate and cancellation is side-effect free',async()=>{
  const f=await fixture(),before=f.tab._zenPinnedInitialState;
  f.host.Services.prompt={prompt(win,title,message,value){assert.equal(win,f.host);assert.match(message,/Reset to Pinned URL/);assert.equal(value.value,'https://example.test/A');return false;}};
  assert.equal(await f.adapters.promptBaselineUrl(f.tab),null);assert.equal(f.tab._zenPinnedInitialState,before);
  f.host.Services.prompt.prompt=(win,title,message,value)=>{value.value='https://example.test/new';return true;};
  assert.equal(await f.adapters.promptBaselineUrl(f.tab),'https://example.test/new');
});

// Break caught: saving intent/baseline leaves native Reset UI stale, particularly
// on lazy mirrors whose browser URI still says about:blank after restart.
test('unpin, Edit and Use Current Page recompute native modified state on every mirror',async()=>{
 const f=await fixture(),other={...f.tab,attrs:new Set(),state:structuredClone(f.tab.state)};
 const styles=new Map();
 for(const t of [f.tab,other]){
  t.setAttribute=(n,v)=>t.attrs.add(n);t.removeAttribute=n=>t.attrs.delete(n);
  t.style={setProperty:(n,v)=>styles.set(t.id+n,v),removeProperty:n=>styles.delete(t.id+n)};
  t.linkedBrowser={currentURI:{spec:'about:blank'}};t.attrs.add('pending');
 }
 const manager=f.host.gZenPinnedTabManager;
 manager.resetPinChangedUrl=t=>{if(t.hasAttribute('zen-pinned-changed')){t.removeAttribute('zen-pinned-changed');t.removeAttribute('had-zen-pinned-changed');}};
 manager.pinHasChangedUrl=t=>t.setAttribute('zen-pinned-changed','true');
 const win={closed:false,__SSi:'two',document:f.host.document,SessionStore:f.host.SessionStore,
  gZenPinnedTabManager:manager,gZenWindowSync:f.host.gZenWindowSync,gZenWorkspaces:{allStoredTabs:[other]}};
 f.host.Services.wm={getEnumerator:()=>[f.host,win]};
 f.host.Services.io={newURI:input=>({spec:new URL(input).href,scheme:new URL(input).protocol.slice(0,-1)})};
 f.host.gZenWindowSync.setPinnedInitialState=(t,entry,image)=>{for(const x of [t,other])x._zenPinnedInitialState={entry,image};};
 const adapters=api.createBrowserFolderPinAdapters(f.host);await adapters.ready;
 const store=new api.FolderPinIntentStore(adapters),policy=new api.FolderPinPolicy(adapters,store);policy.start();
 store.write(f.tab,true);
 for(const t of [f.tab,other])assert.equal(t.hasAttribute('zen-pinned-changed'),true,'lazy saved B differs from pinned A');
 assert.deepEqual(await policy.update(f.tab),{ok:true});
 for(const t of [f.tab,other])assert.equal(t.hasAttribute('zen-pinned-changed'),false,'Use Current pins saved B immediately');
 f.host.Services.prompt={prompt(w,title,message,value){value.value='https://example.test/C';return true;}};
 assert.deepEqual(await policy.edit(f.tab),{ok:true});
 for(const t of [f.tab,other])assert.equal(t.hasAttribute('zen-pinned-changed'),true,'Edit changes reset destination immediately');
 assert.deepEqual(await policy.unpin(f.tab),{ok:true});
 for(const t of [f.tab,other]){
  assert.equal(t.hasAttribute('zen-pinned-changed'),false);assert.equal(t.hasAttribute('had-zen-pinned-changed'),false);
  assert.equal(t.pinned,true,'folder structural pin survives URL unpin');
 }
 assert.deepEqual(f.errors,[]);
});

test('activation reconciles known lazy folder pins even without a new intent write',async()=>{
 const f=await fixture();f.tab.attrs.add('pending');let changed=false;
 f.host.gZenPinnedTabManager.pinHasChangedUrl=()=>{changed=true;};
 const adapters=api.createBrowserFolderPinAdapters(f.host);await adapters.ready;
 const store=new api.FolderPinIntentStore(adapters);store.write(f.tab,true);changed=false;
 const activation=new api.FolderPinActivation({...adapters,listTabs:()=>[f.tab],hasConsent:()=>true,install:()=>()=>{}},store);
 assert.equal((await activation.start()).ok,true);assert.equal(changed,true,'restore saved B against baseline A without loading the lazy tab');
});

test('verified intent and baseline changes notify native preview observers after persistence',async()=>{
 const f=await fixture(),seen=[];
 const store=new api.FolderPinIntentStore(f.adapters),policy=new api.FolderPinPolicy(f.adapters,store);policy.start();
 f.host.gBrowser._tabAttrModified=(tab,changed)=>seen.push({tab,changed,explicit:store.read(tab).explicit,url:tab._zenPinnedInitialState.entry.url});
 store.write(f.tab,true);assert.equal(seen.at(-1).explicit,true);
 await policy.update(f.tab);assert.equal(seen.at(-1).url,'https://example.test/B');
 await policy.unpin(f.tab);assert.equal(seen.at(-1).explicit,false);
 assert.equal(seen.length,3);assert.deepEqual(seen[0].changed,['better-zen-folders-url-pin']);
});

test('modified state uses each synchronized window history and its own native manager',async()=>{
 const local=await fixture(),remote=await fixture();remote.host.__SSi='two';
 remote.host.gZenWindowSync=local.host.gZenWindowSync;
 local.host.Services.wm={getEnumerator:()=>[local.host,remote.host]};
 for(const f of [local,remote]){
  f.host.document.defaultView=f.host;f.tab.attrs.add('pending');
  f.tab.setAttribute=(n,v)=>f.tab.attrs.add(n);f.tab.removeAttribute=n=>f.tab.attrs.delete(n);
  f.tab.style={removeProperty(){}};
  f.host.gZenPinnedTabManager.pinHasChangedUrl=function(t){this.changedTab=t;t.attrs.add('zen-pinned-changed');};
 }
 remote.tab.state.index=1;
 const a=api.createBrowserFolderPinAdapters(local.host);await a.ready;
 const store=new api.FolderPinIntentStore(a);store.write(local.tab,true);
 assert.equal(local.tab.hasAttribute('zen-pinned-changed'),true);
 assert.equal(remote.tab.hasAttribute('zen-pinned-changed'),false,'remote saved A matches baseline A');
 local.tab._zenPinnedInitialState=remote.tab._zenPinnedInitialState={entry:{url:'https://example.test/B'}};
 store.write(local.tab,true);
 assert.equal(local.tab.hasAttribute('zen-pinned-changed'),false);
 assert.equal(remote.tab.hasAttribute('zen-pinned-changed'),true,'remote saved A differs from baseline B');
 assert.equal(remote.host.gZenPinnedTabManager.changedTab,remote.tab);
});

test('recovery restores intent and saved URL to a remapped tab without changing history, and can roll back',async()=>{
  const f=await fixture(),store=new api.FolderPinIntentStore(f.adapters);
  const recovery=new api.FolderPinRecovery(f.adapters,store);store.write(f.tab,false);
  const before=structuredClone(f.tab.state),saved={explicit:true,baseline:{entry:{url:'https://example.test/older',title:'Older'},image:null}};
  const undo=recovery.apply(f.tab,saved);
  assert.deepEqual(recovery.capture(f.tab),saved);assert.equal(store.read(f.tab).tabId,f.tab.id);assert.deepEqual(f.tab.state,before);
  undo();assert.equal(store.read(f.tab).explicit,false);assert.equal(f.tab._zenPinnedInitialState.entry.url,'https://example.test/A');
  assert.deepEqual(recovery.capture(f.tab),{explicit:false,baseline:null});
});

test('recovery failures restore the previous intent and baseline; rollback refuses a later owner',async()=>{
  const f=await fixture(),store=new api.FolderPinIntentStore(f.adapters),recovery=new api.FolderPinRecovery(f.adapters,store);
  store.write(f.tab,false);const saved={explicit:true,baseline:{entry:{url:'https://example.test/older'},image:null}};
  const write=store.write;store.write=()=>{throw Error('intent refused');};
  assert.throws(()=>recovery.apply(f.tab,saved),/intent refused/);assert.equal(f.tab._zenPinnedInitialState.entry.url,'https://example.test/A');
  store.write=write;const undo=recovery.apply(f.tab,saved);
  f.tab._zenPinnedInitialState={entry:{url:'https://example.test/later'}};
  assert.throws(undo,/owner/);assert.equal(store.read(f.tab).explicit,true);assert.equal(f.tab._zenPinnedInitialState.entry.url,'https://example.test/later');
});

test('a failed recovery snapshot cannot strand the shared identity lock',async()=>{
  const f=await fixture(),store=new api.FolderPinIntentStore(f.adapters),recovery=new api.FolderPinRecovery(f.adapters,store);
  const saved={explicit:false,baseline:null};f.adapters.captureBaseline=()=>{throw Error('read failed');};
  assert.throws(()=>recovery.apply(f.tab,saved),/read failed/);assert.equal(f.adapters.coordinator.locks.size,0);
});

test('TabClose can capture recovery evidence after Zen marks the tab closing, without enabling commands',async()=>{
 const f=await fixture(),store=new api.FolderPinIntentStore(f.adapters),recovery=new api.FolderPinRecovery(f.adapters,store);
 store.write(f.tab,true);f.tab.closing=true;
 assert.equal(f.adapters.classify(f.tab),'unsupported');
 assert.equal(recovery.capture(f.tab)?.explicit,true);
});

test('adoption can explicitly recover into a native root, but normal undo cannot',async()=>{
 const f=await fixture(),store=new api.FolderPinIntentStore(f.adapters),recovery=new api.FolderPinRecovery(f.adapters,store);
 f.tab.folder=null;const saved={explicit:true,baseline:{entry:{url:'https://example.test/original'}}};
 assert.throws(()=>recovery.apply(f.tab,saved),/unsupported/);
 recovery.apply(f.tab,saved,{allowRoot:true});assert.equal(store.read(f.tab).explicit,true);assert.equal(f.tab._zenPinnedInitialState.entry.url,saved.baseline.entry.url);
});

test('creation readiness rechecks a progress event received during an outstanding flush',async()=>{
 const f=await fixture();let progress,resolveFlush,flushes=0;
 f.host.MutationObserver=class{observe(){}disconnect(){}};f.host.addEventListener=()=>{};f.host.removeEventListener=()=>{};
 f.host.gBrowser.addTabsProgressListener=p=>{progress=p;};f.host.gBrowser.removeTabsProgressListener=()=>{};
 f.host.gBrowser.TabStateFlusher={flush:()=>{flushes++;return new Promise(r=>resolveFlush=r);}};
 f.tab.state={entries:[],index:0};const controller=new AbortController();
 const pending=f.adapters.waitForCreation(f.tab,controller.signal,true);
 progress.onLocationChange(f.tab.linkedBrowser,{isTopLevel:true});resolveFlush();
 await new Promise(r=>setImmediate(r));
 assert.equal(flushes,2);f.tab.state={entries:[{url:'https://example.test/new'}],index:1};resolveFlush();
 assert.equal(await pending,true);
});

test('window adoption binds copied intent to the destination identity and exports ordinary tabs unpinned',async()=>{
 for(const explicit of [false,true]){
  const source=await fixture(),target=await fixture();
  const sourceStore=new api.FolderPinIntentStore(source.adapters);sourceStore.write(source.tab,explicit);
  source.adapters.getSavedBaseline=()=>runInNewContext('({entry:{url:"https://example.test/A",title:"A"}})');
  source.host.document.defaultView=source.host;
  source.host.__betterZenFoldersFolderPins={adapters:source.adapters,store:sourceStore,origins:{active:true}};
  target.host.document.querySelectorAll=()=>[];target.host.addEventListener=()=>{};target.host.removeEventListener=()=>{};
  target.host.gBrowser.unpinTab=t=>{t.pinned=false;delete t._zenPinnedInitialState;};target.host.gBrowser.pinTab=t=>{t.pinned=true;};
  target.host.gBrowser.adoptTab=t=>{target.tab.id='destination-id';target.tab.folder=null;source.tab.isConnected=false;
   target.host.SessionStore.setCustomTabValue(target.tab,api.FOLDER_PIN_INTENT_KEY,source.host.SessionStore.getCustomTabValue(t,api.FOLDER_PIN_INTENT_KEY));return target.tab;};
  const store=new api.FolderPinIntentStore(target.adapters),policy=new api.FolderPinPolicy(target.adapters,store);policy.start();
  const life=new api.FolderPinLifecycle(target.adapters,store,policy);life.start();const hooks=new api.FolderPinOriginHooks(target.host,life,target.adapters);hooks.start();
  assert.equal(target.host.gBrowser.adoptTab(source.tab),target.tab);await hooks.flush();
  assert.equal(store.read(target.tab).explicit,explicit);assert.equal(store.read(target.tab).tabId,'destination-id');
  assert.equal(target.tab.pinned,explicit);if(explicit)assert.equal(target.tab._zenPinnedInitialState.entry.url,'https://example.test/A');
  assert.deepEqual(target.errors,[]);hooks.destroy();
 }
});

test('folder export waits for an in-flight pin failure then reconciles ordinary root placement',async()=>{
 const f=await fixture();let release;
 f.host.gBrowser.TabStateFlusher={flush:()=>new Promise(r=>release=r)};
 const a=api.createBrowserFolderPinAdapters(f.host);await a.ready;
 const store=new api.FolderPinIntentStore(a);store.write(f.tab,false);
 const policy=new api.FolderPinPolicy(a,store);policy.start();const lifecycle=new api.FolderPinLifecycle(a,store,policy);lifecycle.start();
 f.host.document.querySelectorAll=()=>[];f.host.addEventListener=()=>{};f.host.removeEventListener=()=>{};
 f.host.gBrowser.ungroupTab=t=>{t.folder=null;};f.host.gBrowser.unpinTab=t=>{t.pinned=false;delete t._zenPinnedInitialState;};
 const hooks=new api.FolderPinOriginHooks(f.host,lifecycle,a);hooks.start();
 const pin=policy.pin(f.tab);f.host.gBrowser.ungroupTab(f.tab);release();
 assert.equal((await pin).ok,false);await hooks.flush();
 assert.equal(f.tab.folder,null);assert.equal(f.tab.pinned,false);assert.equal(store.read(f.tab).explicit,false);assert.equal(a.coordinator.locks.size,0);
});

test('unsupported native window modes fail readiness without waiting on an unresolvable pinned promise',async()=>{
 const f=await fixture();f.host.gZenWorkspaces.privateWindowOrDisabled=true;
 f.host.gZenWorkspaces.promisePinnedInitialized=new Promise(()=>{});
 const a=api.createBrowserFolderPinAdapters(f.host);
 assert.equal(await Promise.race([a.ready,new Promise(r=>setTimeout(()=>r('pending'),20))]),false);
});

test('reactivation validates synchronized root mirrors against their own documents without broadening command routing',async()=>{
 for(const native of [true,false])for(const mode of ['matching','folder','mismatch']){
  const f=await fixture(),g=await fixture();f.tab.folder=null;g.tab.folder=mode==='folder'?g.folder:null;
  f.tab.pinned=native;g.tab.pinned=mode==='mismatch'?!native:native;
  g.host.__SSi='two';g.host.gZenWindowSync=f.host.gZenWindowSync;
  f.host.Services.wm={getEnumerator:()=>[f.host,g.host]};
  f.host.SessionStore=g.host.SessionStore;
  const a=api.createBrowserFolderPinAdapters(f.host);await a.ready;
  const store=new api.FolderPinIntentStore(a);store.write(f.tab,!native);
  assert.equal(a.classify(g.tab),'unsupported','commands stay local');
  const activation=new api.FolderPinActivation({...a,listTabs:()=>[f.tab],hasConsent:()=>true,install:()=>()=>{}},store);
  const result=await activation.start();
  assert.equal(result.unresolved,mode==='matching'?0:1);
  assert.equal(store.read(f.tab).explicit,mode==='matching'?native:!native);
  assert.equal(store.read(g.tab).explicit,mode==='matching'?native:!native);
 }
});
