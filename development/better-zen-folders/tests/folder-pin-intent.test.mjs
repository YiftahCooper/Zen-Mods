import test from 'node:test';
import assert from 'node:assert/strict';
import * as api from '../scripts/better-zen-folders.uc.mjs';

function fixture() {
  const values = new Map();
  const adapters = {
    getId: tab => tab.id,
    getTabValue: (tab, key) => values.get(tab)?.[key] ?? '',
    setTabValue: (tab, key, value) => values.set(tab, {...values.get(tab), [key]:value}),
  };
  assert.equal(typeof api.FolderPinIntentStore, 'function');
  const store = new api.FolderPinIntentStore(adapters);
  return {values, adapters, store, raw:(tab,value)=>adapters.setTabValue(tab, 'better-zen-folders.url-pin.v1', value)};
}

test('a saved ordinary choice is distinct from missing data and survives a new store', () => {
  const f=fixture(), tab={id:'one'};
  assert.deepEqual(f.store.read(tab), {status:'missing'});
  assert.deepEqual(f.store.write(tab,false), {status:'known',tabId:'one',explicit:false});
  assert.deepEqual(new api.FolderPinIntentStore(f.adapters).read(tab), {status:'known',tabId:'one',explicit:false});
  assert.deepEqual(JSON.parse(f.values.get(tab)['better-zen-folders.url-pin.v1']), {schema:1,tabId:'one',explicit:false});
});

test('intent-change notification follows verified persistence and cannot undo it on a presentation failure',()=>{
 const f=fixture(),tab={id:'one'},notices=[];
 f.adapters.notifyIntentChanged=t=>{notices.push(f.store.read(t).explicit);throw Error('presentation unavailable');};
 f.adapters.reportError=()=>{};
 assert.deepEqual(f.store.write(tab,true),{status:'known',tabId:'one',explicit:true});
 assert.deepEqual(notices,[true]);
 f.adapters.setTabValue=()=>{throw Error('refused');};assert.throws(()=>f.store.write(tab,false));assert.deepEqual(notices,[true]);
});

test('same-URL tabs retain distinct choices; undo identity works but copied duplicate metadata does not', () => {
  const f=fixture(), first={id:'one',url:'same'}, second={id:'two',url:'same'};
  f.store.write(first,true); f.store.write(second,false);
  assert.equal(f.store.read(first).explicit,true);assert.equal(f.store.read(second).explicit,false);
  const undone={id:'one'}, duplicate={id:'three'};
  f.values.set(undone,f.values.get(first));f.values.set(duplicate,f.values.get(first));
  assert.equal(f.store.read(undone).explicit,true);
  assert.deepEqual(f.store.read(duplicate),{status:'invalid'});
  assert.equal(f.store.read(first).explicit,true);
});

test('changing folder placement or label cannot reinterpret persisted intent', () => {
  const f=fixture(), tab={id:'one',group:{},label:'before'};
  f.store.write(tab,false);tab.group=null;tab.label='after';
  assert.equal(f.store.read(tab).explicit,false);tab.group={};
  assert.equal(f.store.read(tab).explicit,false);
});

test('malformed records and invalid stable identity never masquerade as saved choices', () => {
  const f=fixture(),tab={id:'one'};
  for(const raw of ['bad','null','[]','true','{}','{"schema":2,"tabId":"one","explicit":true}',
    '{"schema":1,"tabId":"one","explicit":"false"}','{"schema":1,"tabId":"other","explicit":false}',
    '{"__proto__":{"schema":1,"tabId":"one","explicit":true}}']) {
    f.raw(tab,raw);assert.deepEqual(f.store.read(tab),{status:'invalid'},raw);
  }
  for(const id of ['',null,undefined,42]) {
    assert.deepEqual(f.store.read({id}),{status:'invalid'});
    assert.throws(()=>f.store.write({id},true),/identity/i);
  }
});

test('read failures propagate rather than inviting a destructive legacy default', () => {
  const f=fixture();f.adapters.getTabValue=()=>{throw Error('unavailable');};
  assert.throws(()=>f.store.read({id:'one'}),/unavailable/);
});

test('write refusal and ignored or corrupted writes cannot report successful persistence', () => {
  for(const failure of ['throw','ignore','corrupt']) {
    const f=fixture(), tab={id:'one'};f.store.write(tab,false);
    f.adapters.setTabValue=()=>{if(failure==='throw')throw Error('refused');if(failure==='corrupt')f.values.set(tab,{'better-zen-folders.url-pin.v1':'bad'});};
    assert.throws(()=>f.store.write(tab,true),/refused|verify/i);
    assert.notEqual(f.store.read(tab).explicit,true);
  }
});

test('identity changes during a write do not produce an acknowledgement for the wrong tab', () => {
  const f=fixture(),tab={id:'one'},write=f.adapters.setTabValue;
  f.adapters.setTabValue=(...args)=>{write(...args);tab.id='different';};
  assert.throws(()=>f.store.write(tab,true),/verify|identity/i);
  assert.deepEqual(f.store.read(tab),{status:'invalid'});
});

test('only boolean writes are accepted, and private/session stores do not leak into another store', () => {
  const f=fixture(), tab={id:'one'};
  for(const value of ['true',1,null,undefined])assert.throws(()=>f.store.write(tab,value),/boolean/i);
  f.store.write(tab,true);assert.deepEqual(fixture().store.read(tab),{status:'missing'});
});

test('creation defaults never override moves, restores, known choices or transient parentlessness', () => {
  assert.equal(typeof api.resolveFolderPinIntent,'function');
  const missing={status:'missing'}, ordinary={status:'known',tabId:'one',explicit:false}, pinned={...ordinary,explicit:true};
  const cases=[
    [missing,{origin:'new'},false], [missing,{origin:'new',pinNew:true},true],
    [ordinary,{origin:'new',pinNew:true},false], [pinned,{origin:'move',pinNew:false},true],
    [ordinary,{origin:'move',pinNew:true},false], [missing,{origin:'move',incomingExplicit:true,pinNew:false},true],
    [missing,{origin:'move',incomingExplicit:false,pinNew:true},false],
    [missing,{origin:'move',pinNew:true},null], [missing,{origin:'restore',pinNew:true},null],
    [pinned,{origin:'restore'},true], [missing,{origin:'legacy'},false],
    [pinned,{origin:'duplicate'},false], [missing,{origin:'duplicate',pinNew:true},false],
    [pinned,{origin:'move',settled:false},null], [missing,{origin:'new',settled:false},null],
    [{status:'invalid'},{origin:'legacy'},null], [{status:'invalid'},{origin:'duplicate'},false],
    [missing,{origin:'unknown',pinNew:true},null],
  ];
  for(const [record,context,want] of cases)assert.equal(api.resolveFolderPinIntent(record,context),want,JSON.stringify({record,context}));
});

test('a verification-read failure restores the old record rather than leaving an unacknowledged pin', () => {
  const f=fixture(),tab={id:'one'};f.store.write(tab,false);
  const read=f.adapters.getTabValue,write=f.adapters.setTabValue;let fail=false;
  f.adapters.setTabValue=(...args)=>{write(...args);fail=true;};
  f.adapters.getTabValue=(...args)=>{if(fail){fail=false;throw Error('transient read failure');}return read(...args);};
  assert.throws(()=>f.store.write(tab,true),/read failure|rollback/);
  assert.equal(JSON.parse(f.values.get(tab)['better-zen-folders.url-pin.v1']).explicit,false);
});

test('mirrored writes verify every record and roll back a partial failure to each distinct previous value',()=>{
  const f=fixture(),a={id:'same'},b={id:'same'};
  f.store.write(a,false);f.adapters.getIntentTargets=()=>[a,b];
  f.store.write(a,true);assert.equal(f.store.read(b).explicit,true);
  f.raw(b,'');const write=f.adapters.setTabValue;let fail=true;
  f.adapters.setTabValue=(t,k,v)=>{write(t,k,v);if(t===b&&fail){fail=false;throw Error('second window');}};
  assert.throws(()=>f.store.write(a,false),/second window/);
  assert.equal(f.store.read(a).explicit,true);assert.equal(f.store.read(b).status,'missing');
});

test('mirrored transaction rejects changed identity or membership and never overwrites a newer record',()=>{
  const f=fixture(),a={id:'same'},b={id:'same'},c={id:'same'};
  f.store.write(a,false);f.store.write(b,false);let targets=[a,b];f.adapters.getIntentTargets=()=>targets;
  const write=f.adapters.setTabValue;
  f.adapters.setTabValue=(t,k,v)=>{write(t,k,v);if(t===b)targets=[a,b,c];};
  assert.throws(()=>f.store.write(a,true),/changed/);assert.equal(f.store.read(a).explicit,false);assert.equal(f.store.read(b).explicit,false);
  targets=[a,b];f.adapters.setTabValue=(t,k,v)=>{write(t,k,v);if(t===b){write(a,k,'foreign');throw Error('conflict');}};
  assert.throws(()=>f.store.write(a,true),AggregateError);assert.equal(f.adapters.getTabValue(a,'better-zen-folders.url-pin.v1'),'foreign');
});
