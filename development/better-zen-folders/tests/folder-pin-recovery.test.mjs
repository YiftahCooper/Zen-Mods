import test from 'node:test';
import assert from 'node:assert/strict';
import {buildRestoreRecord,validateRestoreRecord} from '../scripts/better-zen-folders.uc.mjs';
import {makeNestedTabFixture,makeLazyDeletedGroupRestoreFixture,makeExistingNestedRestoreFixture} from './fakes.mjs';

const pin={explicit:true,baseline:{entry:{url:'https://example.test/saved',title:'Saved'},image:null}};
test('recovery records carry explicit pin baseline separately from placement and retain old-record compatibility',()=>{
  const f=makeNestedTabFixture(),old=buildRestoreRecord(f.tab,f.adapters);assert.ok(validateRestoreRecord(old));
  f.adapters.getUrlPinRecovery=()=>structuredClone(pin);
  const record=buildRestoreRecord(f.tab,f.adapters);assert.deepEqual(record.urlPin,pin);assert.ok(Object.isFrozen(record.urlPin));
  for(const invalid of [{explicit:'yes',baseline:null},{explicit:true,baseline:null},{explicit:false,baseline:pin.baseline},
    {explicit:true,baseline:{entry:{url:''}}},{...pin,extra:true}]){
    assert.equal(validateRestoreRecord({...record,urlPin:invalid}),null);
  }
  assert.ok(validateRestoreRecord({...record,urlPin:{explicit:false,baseline:null}}));
});

test('a positively identified duplicate cannot replay its source undo record',async()=>{
 const f=makeExistingNestedRestoreFixture();f.adapters.isDuplicateTab=()=>true;
 assert.equal(await f.manager.restoreTab(f.event),false);assert.equal(f.restored.group,undefined);
});

test('whole-folder undo applies per-tab intent even when folder identities are remapped',async()=>{
  const f=makeLazyDeletedGroupRestoreFixture({tabCount:2,occupiedIds:['folder-project']});
  f.mutateRestoreRecord(0,r=>{r.urlPin=structuredClone(pin);});
  f.mutateRestoreRecord(1,r=>{r.urlPin={explicit:false,baseline:null};});
  const applied=[];f.adapters.applyUrlPinRecovery=(tab,record)=>{applied.push([tab,record]);return ()=>{};};
  f.adapters.getUrlPinRecovery=tab=>applied.find(([t])=>t===tab)?.[1];
  assert.equal(await f.restoreNativeGroup(),true);
  assert.equal(applied.length,2);assert.deepEqual(applied.map(([,r])=>r.explicit),[true,false]);
  assert.notEqual(f.tabs[0].group.id,'folder-project');
  assert.deepEqual(JSON.parse(f.restoreValue(f.tabs[0])).urlPin,pin);
});

test('a later restore failure rolls back successful pin restoration; absent adapters fail safely',async()=>{
  for(const installed of [true,false]){
    const f=makeLazyDeletedGroupRestoreFixture({tabCount:2});
    for(let i=0;i<2;i++)f.mutateRestoreRecord(i,r=>{r.urlPin=structuredClone(pin);});
    const applied=new Set();let calls=0;
    if(installed)f.adapters.applyUrlPinRecovery=(tab)=>{if(++calls===2)throw Error('pin recovery refused');applied.add(tab);return ()=>applied.delete(tab);};
    assert.equal(await f.restoreNativeGroup(),false);assert.equal(applied.size,0);
    assert.ok(f.errors.length);
  }
});
