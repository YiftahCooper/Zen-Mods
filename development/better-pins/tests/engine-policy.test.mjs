// Attributed BZF regression snapshot; same source revision as pin-engine provenance.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as api from '../src/pin-engine.mjs';

function fixture() {
  const values=new Map(),errors=[];
  const state={startupReset:false,ready:true};
  const tab={id:'one',scope:'regular-folder',location:'folder',current:'B',history:['A','B'],baseline:{entry:{url:'A'}},sticky:true,collapsed:true};
  const storage={getId:t=>t.id,getTabValue:t=>values.get(t)??'',setTabValue:(t,key,raw)=>values.set(t,raw)};
  const store=new api.FolderPinIntentStore(storage);store.write(tab,false);
  const clone=v=>structuredClone(v);
  const adapters={
    getId:t=>t.id,classify:t=>t.scope,getLocation:t=>t.location,
    getStartupResetEnabled:()=>state.startupReset,isRestorationReady:()=>state.ready,
    captureBaseline:t=>clone(t.baseline),
    ownsBaseline:(t,expected)=>JSON.stringify(t.baseline)===JSON.stringify(expected),
    setCurrentAsBaseline:async t=>{t.baseline={entry:{url:t.current}};return clone(t.baseline);},
    promptBaselineUrl:()=> 'https://example.test/edited',
    setUrlAsBaseline:async (t,url)=>{t.baseline={entry:{url}};return clone(t.baseline);},
    restoreBaseline:(t,old,expected)=>{if(JSON.stringify(t.baseline)!==JSON.stringify(expected))return false;t.baseline=clone(old);return true;},
    resetToBaseline:async t=>{t.current=t.baseline.entry.url;t.history=[t.current];},
    closeTabs:async (tabs,event)=>{for(const t of tabs)t.closed=!event?.refuse;return !event?.refuse;},
    unloadTabs:async tabs=>{for(const t of tabs)t.pending=true;return true;},
    reportError:e=>errors.push(e),
  };
  assert.equal(typeof api.FolderPinPolicy,'function');
  const policy=new api.FolderPinPolicy(adapters,store);policy.start();
  return {tab,state,storage,store,adapters,policy,errors,values};
}

test('Pin captures B, Unpin preserves C/history/folder, and repinning captures C',async()=>{
  const f=fixture(),t=f.tab;
  assert.deepEqual(await f.policy.pin(t),{ok:true});assert.equal(t.baseline.entry.url,'B');
  t.current='C';t.history.push('C');
  assert.deepEqual(await f.policy.pin(t),{ok:true});assert.equal(t.baseline.entry.url,'B','repeat Pin cannot replace an intentional baseline');
  assert.deepEqual(await f.policy.unpin(t),{ok:true});assert.equal(t.current,'C');
  assert.deepEqual(t.history,['A','B','C']);assert.equal(t.location,'folder');assert.equal(t.sticky,true);
  assert.deepEqual(await f.policy.reset(t),{ok:false,reason:'not-url-pinned'});assert.equal(t.current,'C');
  await f.policy.pin(t);assert.equal(t.baseline.entry.url,'C');
  t.current='D';t.history.push('D');await f.policy.reset(t);assert.equal(t.current,'C');assert.deepEqual(t.history,['C']);
});

test('Update and Edit change only an explicit saved address, not current history or organisation',async()=>{
  const f=fixture(),t=f.tab;
  for(const action of ['update','edit']) assert.deepEqual(await f.policy[action](t),{ok:false,reason:'not-url-pinned'});
  f.store.write(t,true);
  assert.deepEqual(await f.policy.update(t),{ok:true});assert.equal(t.baseline.entry.url,'B');
  assert.deepEqual(await f.policy.edit(t),{ok:true});assert.equal(t.baseline.entry.url,'https://example.test/edited');
  assert.equal(t.current,'B');assert.deepEqual(t.history,['A','B']);assert.equal(t.sticky,true);assert.equal(t.location,'folder');
});

test('Edit cancellation and stale prompt results never write a baseline',async()=>{
  for(const change of [null,f=>f.policy.destroy(),f=>f.tab.location='other',f=>f.store.write(f.tab,false)]){
    const f=fixture();f.store.write(f.tab,true);let release;
    f.adapters.promptBaselineUrl=()=>new Promise(r=>release=r);
    const pending=f.policy.edit(f.tab);change?.(f);release(change?'https://example.test/new':null);
    assert.deepEqual(await pending,{ok:false,reason:'cancelled'});assert.equal(f.tab.baseline.entry.url,'A');
  }
});

test('failed Update/Edit persistence rolls back even though the previous intent was explicit',async()=>{
  for(const action of ['update','edit']){
    const f=fixture();f.store.write(f.tab,true);f.store.write=()=>{throw Error('storage');};
    assert.deepEqual(await f.policy[action](f.tab),{ok:false,reason:'failed'});
    assert.equal(f.tab.baseline.entry.url,'A');assert.equal(f.store.read(f.tab).explicit,true);
  }
});

test('pure unload retains both kinds of tab state, while Close removes rather than resetting',async()=>{
  const f=fixture(),a=f.tab,b={...a,id:'two',history:['X','Y'],current:'Y',baseline:{entry:{url:'X'}}};f.store.write(b,true);
  assert.deepEqual(await f.policy.unload([a,b]),{ok:true});
  assert.deepEqual(a.history,['A','B']);assert.equal(b.current,'Y');assert.equal(b.baseline.entry.url,'X');
  assert.equal(a.collapsed,true);assert.equal(a.sticky,true);
  assert.deepEqual(await f.policy.close([a,b],{refuse:true}),{ok:false,reason:'refused'});assert.equal(a.closed,false);
  assert.deepEqual(await f.policy.close([a,b]),{ok:true});assert.equal(a.closed,true);assert.equal(b.closed,true);assert.equal(b.current,'Y');
});

test('disabled, incompatible, not-ready, unsupported and unknown states cause no mutations',async()=>{
  const cases=[['startup',f=>f.state.startupReset=true,'startup-reset-enabled'],['ready',f=>f.state.ready=false,'restoring'],
    ['unknown',f=>f.values.delete(f.tab),'unknown-intent'],['invalid',f=>f.values.set(f.tab,'bad'),'unknown-intent'],
    ...['root','essential','live','unsupported'].map(scope=>[scope,f=>f.tab.scope=scope,'unsupported']),
    ['disabled',f=>f.policy.destroy(),'inactive']];
  for(const [name,change,reason] of cases){const f=fixture();change(f);const before=structuredClone(f.tab);
    for(const action of ['pin','unpin','reset'])assert.deepEqual(await f.policy[action](f.tab),{ok:false,reason},name);
    for(const action of ['close','unload'])assert.deepEqual(await f.policy[action]([f.tab]),{ok:false,reason},name);
    assert.deepEqual(f.tab,before,name);
  }
});

test('mixed unsupported batches are rejected before touching any tab; duplicate targets act once',async()=>{
  const f=fixture(),root={...f.tab,id:'root',scope:'root'};
  assert.deepEqual(await f.policy.close([f.tab,root]),{ok:false,reason:'unsupported'});assert.equal(f.tab.closed,undefined);
  let count=0;f.adapters.unloadTabs=async tabs=>{count=tabs.length;return true;};
  assert.deepEqual(await f.policy.unload([f.tab,f.tab]),{ok:true});assert.equal(count,1);
});

test('a failed intent write rolls back the proposed baseline and never acknowledges a pin',async()=>{
  const f=fixture();f.storage.setTabValue=()=>{throw Error('refused write');};
  assert.deepEqual(await f.policy.pin(f.tab),{ok:false,reason:'failed'});
  assert.equal(f.tab.baseline.entry.url,'A');assert.equal(f.store.read(f.tab).explicit,false);assert.equal(f.errors.length,1);
});

test('moves, native preference changes and teardown cancel a pin in progress without changing intent',async()=>{
  for(const change of [f=>f.tab.location='other',f=>f.state.startupReset=true,f=>f.policy.destroy()]){
    const f=fixture();let release;const original=f.adapters.setCurrentAsBaseline;
    f.adapters.setCurrentAsBaseline=async t=>{const result=await original(t);await new Promise(r=>release=r);return result;};
    const pending=f.policy.pin(f.tab);await new Promise(r=>setImmediate(r));
    assert.deepEqual(await f.policy.unpin(f.tab),{ok:false,reason:'busy'});
    change(f);release();assert.deepEqual(await pending,{ok:false,reason:'cancelled'});
    assert.equal(f.tab.baseline.entry.url,'A');assert.equal(f.store.read(f.tab).explicit,false);
  }
});

test('a newer owner baseline is never overwritten during cancellation rollback',async()=>{
  const f=fixture();let release;const original=f.adapters.setCurrentAsBaseline;
  f.adapters.setCurrentAsBaseline=async t=>{const result=await original(t);await new Promise(r=>release=r);return result;};
  const pending=f.policy.pin(f.tab);await new Promise(r=>setImmediate(r));
  f.tab.baseline={entry:{url:'external'}};f.policy.destroy();release();
  assert.deepEqual(await pending,{ok:false,reason:'rollback-failed'});assert.equal(f.tab.baseline.entry.url,'external');assert.equal(f.store.read(f.tab).explicit,false);
});

test('native operation errors and empty targets do not report success',async()=>{
  const f=fixture();f.store.write(f.tab,true);f.adapters.resetToBaseline=()=>{throw Error('native failure');};
  assert.deepEqual(await f.policy.reset(f.tab),{ok:false,reason:'failed'});assert.equal(f.errors.length,1);
  assert.deepEqual(await f.policy.close([]),{ok:false,reason:'no-tabs'});
});

test('uncertain persistence or rollback errors block later destructive commands',async()=>{
  const f=fixture();f.store.write(f.tab,true);
  f.store.write=()=>{throw new AggregateError([Error('write'),Error('rollback')],'uncertain');};
  assert.deepEqual(await f.policy.unpin(f.tab),{ok:false,reason:'failed'});
  assert.deepEqual(await f.policy.reset(f.tab),{ok:false,reason:'uncertain-state'});
  const g=fixture();
  g.store.write=()=>{throw Error('write');};
  g.adapters.restoreBaseline=()=>{throw Error('rollback');};
  assert.deepEqual(await g.policy.pin(g.tab),{ok:false,reason:'rollback-failed'});
  assert.deepEqual(await g.policy.close([g.tab]),{ok:false,reason:'uncertain-state'});
});

test('a concurrent intent change cancels capture without undoing the newer choice',async()=>{
  const f=fixture();let release;const original=f.adapters.setCurrentAsBaseline;
  f.adapters.setCurrentAsBaseline=async t=>{const result=await original(t);await new Promise(r=>release=r);return result;};
  const pending=f.policy.pin(f.tab);await new Promise(r=>setImmediate(r));
  f.store.write(f.tab,true);release();
  assert.deepEqual(await pending,{ok:false,reason:'rollback-failed'});
  assert.equal(f.store.read(f.tab).explicit,true);assert.equal(f.tab.baseline.entry.url,'B');
});

test('a baseline changed after capture cannot be acknowledged as our new explicit pin',async()=>{
  const f=fixture();let release;const original=f.adapters.setCurrentAsBaseline;
  f.adapters.setCurrentAsBaseline=async t=>{const result=await original(t);await new Promise(r=>release=r);return result;};
  const pending=f.policy.pin(f.tab);await new Promise(r=>setImmediate(r));
  f.tab.baseline={entry:{url:'external'}};release();
  assert.deepEqual(await pending,{ok:false,reason:'rollback-failed'});
  assert.equal(f.store.read(f.tab).explicit,false);assert.equal(f.tab.baseline.entry.url,'external');
});

test('native coordination block applies to every command before any mutation',async()=>{
  const f=fixture();f.adapters.getCommandBlockReason=()=> 'mirrored-identity';
  for(const action of ['pin','unpin','reset'])assert.deepEqual(await f.policy[action](f.tab),{ok:false,reason:'mirrored-identity'});
  for(const action of ['close','unload'])assert.deepEqual(await f.policy[action]([f.tab]),{ok:false,reason:'mirrored-identity'});
});
