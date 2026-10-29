import test from 'node:test';
import assert from 'node:assert/strict';
import * as api from '../scripts/better-zen-folders.uc.mjs';
function fixture(windowValue='') {
  const values=new Map();let saved=windowValue;
  const adapters={getTabValue:t=>values.get(t)??'',setTabValue:(t,v)=>values.set(t,v),
    getWindowValue:()=>saved,setWindowValue:v=>{saved=v;},getId:t=>t.id,isFolder:t=>!!t.folder};
  assert.equal(typeof api.StickyStateStore,'function');
  return {values,adapters,store:new api.StickyStateStore(adapters),snapshot:()=>saved};
}
test('tab Sticky value survives reload/undo with native identity but not duplication',()=>{
  const f=fixture(),tab={id:'native-id'};
  f.store.set(tab,true);
  assert.equal(f.store.has(tab),true);
  const restored={id:'native-id'},duplicate={id:'different-native-id'};
  f.values.set(restored,f.values.get(tab));f.values.set(duplicate,f.values.get(tab));
  assert.equal(new api.StickyStateStore(f.adapters).has(restored),true);
  assert.equal(f.store.has(duplicate),false);
  assert.equal(f.store.has(tab),true);
});
test('moving outside a folder does not erase the durable tab setting',()=>{
  const f=fixture(),tab={id:'tab',group:{}};f.store.set(tab,true);
  tab.group=null;assert.equal(f.store.has(tab),true);
  tab.group={};assert.equal(f.store.has(tab),true);
});
test('folder Sticky ledger survives restart, names and explicit disable',()=>{
  const f=fixture(),folder={id:'folder',folder:true};f.store.set(folder,true);
  folder.name='renamed';assert.equal(f.store.has(folder),true);
  const reopened=fixture(f.snapshot());assert.equal(reopened.store.has(folder),true);
  reopened.store.set(folder,false);assert.equal(reopened.store.has(folder),false);
  assert.equal(f.store.has(folder),true,'private/window stores are independent');
});
test('malformed persisted input cannot inject properties or accidentally enable Sticky',()=>{
  for(const input of ['bad','[]','null','{"__proto__":true}','{"folders":{"x":"true"}}']) {
    const f=fixture(input);assert.equal(f.store.has({id:'x',folder:true}),false);
  }
  const f=fixture(),tab={id:'tab'};
  for(const v of ['true','{"id":"tab","sticky":"true"}','{"id":"other","sticky":true}']) {
    f.values.set(tab,v);assert.equal(f.store.has(tab),false);
  }
});
test('persistence failure does not claim success or change folder state',()=>{
  const f=fixture(),folder={id:'folder',folder:true};
  f.adapters.setWindowValue=()=>{throw Error('write refused');};
  assert.throws(()=>f.store.set(folder,true),/refused/);
  assert.equal(f.store.has(folder),false);
});

test('branch exposure clears only when that branch closes or containing parent cycles',()=>{
  assert.equal(typeof api.StickyBranchExposure,'function');
  const state=new api.StickyBranchExposure(n=>n.parent);
  const root={},middle={parent:root},child={parent:middle},other={};
  state.expose(child);state.expose(other);
  assert.equal(state.has(child),true);assert.equal(state.has(middle),false);
  state.onCollapseChanged(root,false);
  assert.equal(state.has(child),true,'expanding parent alone does not erase exposure');
  state.onCollapseChanged(root,true);
  assert.equal(state.has(child),false);assert.equal(state.has(other),true);
  state.expose(child);state.onCollapseChanged(child,true);
  assert.equal(state.has(child),false);
});
