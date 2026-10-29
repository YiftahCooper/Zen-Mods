import test from 'node:test';
import assert from 'node:assert/strict';
import * as api from '../scripts/better-zen-folders.uc.mjs';

function fixture(){
 const values=new Map(),tab={id:'one',scope:'root',pinned:false,folder:null,baseline:null,current:'B',sticky:true};
 const adapters={getId:t=>t.id,classify:t=>t.scope,getLocation:t=>t.folder,isNativePinned:t=>t.pinned,
  getTabValue:t=>values.get(t)??'',setTabValue:(t,k,v)=>values.set(t,v),
  getSavedBaseline:t=>structuredClone(t.baseline),setSavedBaseline:(t,v)=>{t.baseline=structuredClone(v);return t.baseline;},
  captureBaseline:t=>t.baseline,restoreBaseline:(t,old,owned)=>{if(t.baseline!==owned)return false;t.baseline=old;return true;},
  coordinator:{locks:new Map(),uncertain:new Set()},
  setRootPlacement:(t,pin)=>{t.pinned=pin;if(!pin)t.baseline=null;},clearDuplicateState:t=>{t.sticky=false;t.baseline=null;},
  isRestorationReady:()=>true,getStartupResetEnabled:()=>false,reportError:()=>{},isConnected:t=>!t.closed,
 };
 const store=new api.FolderPinIntentStore(adapters),policy={pin:async t=>{t.baseline={entry:{url:t.current}};store.write(t,true);return {ok:true};}};
 const lifecycle=new api.FolderPinLifecycle(adapters,store,policy);lifecycle.start();
 const enter=()=>{tab.scope='regular-folder';tab.folder='f';tab.pinned=true;};
 return {tab,adapters,store,policy,lifecycle,enter};
}

test('moves import root intent before structural pinning, preserve known false, and never apply new defaults',async()=>{
 for(const incoming of [false,true]){
  const f=fixture();f.tab.pinned=incoming;f.tab.baseline=incoming?{entry:{url:'A'}}:null;
  const token=f.lifecycle.begin(f.tab,'move');f.enter();
  assert.deepEqual(await f.lifecycle.settle(token,{pinNew:!incoming}),{ok:true});
  assert.equal(f.store.read(f.tab).explicit,incoming);if(incoming)assert.equal(f.tab.baseline.entry.url,'A');
 }
 const f=fixture();f.store.write(f.tab,false);f.tab.pinned=true;
 const token=f.lifecycle.begin(f.tab,'move');f.enter();await f.lifecycle.settle(token,{pinNew:true});
 assert.equal(f.store.read(f.tab).explicit,false);
});

test('only new creation uses the preference; repeated settlement never rebases a pin',async()=>{
 const f=fixture(),token=f.lifecycle.begin(f.tab,'new');f.enter();
 assert.deepEqual(await f.lifecycle.settle(token,{pinNew:true}),{ok:true});assert.equal(f.tab.baseline.entry.url,'B');
 f.tab.current='C';await f.lifecycle.settle(token,{pinNew:true});assert.equal(f.tab.baseline.entry.url,'B');
});

test('folder export preserves ordinary/explicit intent and the explicit saved URL despite native unpin',async()=>{
 for(const explicit of [false,true]){
  const f=fixture();f.enter();f.store.write(f.tab,explicit);f.tab.baseline={entry:{url:'A'}};
  const token=f.lifecycle.begin(f.tab,'move');f.tab.scope='root';f.tab.folder=null;f.tab.pinned=false;f.tab.baseline=null;
  assert.deepEqual(await f.lifecycle.settle(token),{ok:true});assert.equal(f.tab.pinned,explicit);
  assert.equal(f.store.read(f.tab).explicit,explicit);if(explicit)assert.equal(f.tab.baseline.entry.url,'A');
 }
});

test('duplicate waits for verified restoration, clears inherited state, while undo preserves it',async()=>{
 const f=fixture();f.enter();f.store.write(f.tab,true);f.tab.baseline={entry:{url:'A'}};
 const token=f.lifecycle.begin(f.tab,'duplicate');
 assert.deepEqual(await f.lifecycle.settle(token,{settled:false}),{ok:false,reason:'unsettled'});
 assert.equal(f.tab.sticky,true);assert.equal(f.store.read(f.tab).explicit,true);
 assert.deepEqual(await f.lifecycle.settle(token),{ok:true});assert.equal(f.store.read(f.tab).explicit,false);assert.equal(f.tab.sticky,false);assert.equal(f.tab.baseline,null);
 f.store.write(f.tab,true);f.tab.baseline={entry:{url:'A'}};const undo=f.lifecycle.begin(f.tab,'restore');await f.lifecycle.settle(undo,{pinNew:false});
 assert.equal(f.store.read(f.tab).explicit,true);assert.equal(f.tab.baseline.entry.url,'A');
});

test('stale transactions, invalid records and unverified origins cannot apply legacy defaults',async()=>{
 const f=fixture();f.enter();
 assert.deepEqual(await f.lifecycle.settle(f.lifecycle.begin(f.tab,'restore')),{ok:false,reason:'unknown-intent'});
 const token=f.lifecycle.begin(f.tab,'legacy');f.lifecycle.destroy();assert.deepEqual(await f.lifecycle.settle(token),{ok:false,reason:'cancelled'});
 f.lifecycle.start();assert.equal(f.store.read(f.tab).status,'missing');
 const bad=f.lifecycle.begin(f.tab,'move');f.tab.id='changed';assert.deepEqual(await f.lifecycle.settle(bad),{ok:false,reason:'cancelled'});
});

test('a delayed new-pin settlement is shared, not reported complete before persistence',async()=>{
 const f=fixture();f.enter();const token=f.lifecycle.begin(f.tab,'new');let finish;
 f.policy.pin=()=>new Promise(resolve=>finish=resolve);
 const first=f.lifecycle.settle(token,{pinNew:true}),second=f.lifecycle.settle(token,{pinNew:true});
 finish({ok:true});assert.deepEqual(await first,{ok:true});assert.deepEqual(await second,{ok:true});
});

test('a later known choice supersedes a missing-record token',async()=>{
 const f=fixture(),token=f.lifecycle.begin(f.tab,'move');f.enter();f.store.write(f.tab,true);f.tab.baseline={entry:{url:'chosen'}};
 assert.deepEqual(await f.lifecycle.settle(token),{ok:false,reason:'changed-intent'});
 assert.equal(f.store.read(f.tab).explicit,true);assert.equal(f.tab.baseline.entry.url,'chosen');
});

test('a move never overwrites a newer saved address with its old snapshot',async()=>{
 const f=fixture();f.enter();f.store.write(f.tab,true);f.tab.baseline={entry:{url:'A'}};
 const token=f.lifecycle.begin(f.tab,'move');f.tab.folder='other';f.tab.baseline={entry:{url:'newer'}};
 assert.deepEqual(await f.lifecycle.settle(token),{ok:false,reason:'changed-baseline'});
 assert.equal(f.tab.baseline.entry.url,'newer');
});

test('movement serializes with command owners and rolls back its own baseline if persistence fails',async()=>{
 const f=fixture();f.enter();f.store.write(f.tab,true);f.tab.baseline={entry:{url:'A'}};const token=f.lifecycle.begin(f.tab,'move');
 f.tab.scope='root';f.tab.folder=null;f.tab.baseline=null;f.tab.pinned=false;
 f.adapters.coordinator.locks.set(f.tab.id,{});
 assert.deepEqual(await f.lifecycle.settle(token),{ok:false,reason:'busy'});assert.equal(f.tab.baseline,null);
 f.adapters.coordinator.locks.clear();const write=f.adapters.setTabValue;
 f.adapters.setTabValue=()=>{throw Error('write refused');};
 assert.deepEqual(await f.lifecycle.settle(token),{ok:false,reason:'failed'});assert.equal(f.tab.baseline,null);assert.equal(f.tab.pinned,false);
 assert.equal(f.adapters.coordinator.locks.size,0);f.adapters.setTabValue=write;
});
