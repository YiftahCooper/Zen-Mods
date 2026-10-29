import test from 'node:test';
import assert from 'node:assert/strict';
import {buildRestoreRecord,validateRestoreRecord,createBrowserRestoreAdapters,StickyStateStore,STICKY_TAB_KEY} from '../scripts/better-zen-folders.uc.mjs';
import {makeNestedTabFixture,makeExistingNestedRestoreFixture,makeLazyDeletedGroupRestoreFixture} from './fakes.mjs';

test('individual-tab recovery records save Sticky separately from the native identity',()=>{
 const f=makeNestedTabFixture();f.adapters.getTabSticky=()=>true;
 const record=buildRestoreRecord(f.tab,f.adapters);assert.equal(record.sticky,true);
 assert.ok(validateRestoreRecord(record));assert.equal(validateRestoreRecord({...record,sticky:'true'}),null);
});

test('individual Undo rebinds Sticky to the restored tab after its identity changes',async()=>{
 const f=makeExistingNestedRestoreFixture(),record=JSON.parse(f.values.get(f.restored));record.sticky=true;
 f.values.set(f.restored,JSON.stringify(record));
 const applied=[];f.adapters.applyStickyRecovery=(tab,sticky)=>{applied.push([tab,sticky]);return()=>applied.pop();};
 assert.equal(await f.manager.restoreTab(f.event),true);assert.deepEqual(applied,[[f.restored,true]]);
});

test('whole-folder restore failure rolls back earlier tab Sticky changes',async()=>{
 const f=makeLazyDeletedGroupRestoreFixture({tabCount:2});for(let i=0;i<2;i++)f.mutateRestoreRecord(i,r=>{r.sticky=true;});
 const applied=new Set();let count=0;
 f.adapters.applyStickyRecovery=tab=>{if(++count===2)throw Error('second write refused');applied.add(tab);return()=>applied.delete(tab);};
 assert.equal(await f.restoreNativeGroup(),false);assert.equal(count,2);assert.equal(applied.size,0);assert.ok(f.errors.length);
});

test('the browser restore adapter refreshes stale native artwork even when collapse state is unchanged',()=>{
 const folder={collapsed:true,icon:'open'},calls=[];
 const adapters=createBrowserRestoreAdapters({gZenFolders:{updateFolderIcon:f=>{calls.push(f);f.icon=f.collapsed?'close':'open';}}});
 assert.equal(typeof adapters.setFolderCollapsed,'function');
 adapters.setFolderCollapsed(folder,true);assert.equal(folder.icon,'close');assert.deepEqual(calls,[folder]);
});

for(const sticky of [true,false])test(`production Sticky recovery preserves the previous raw value and refuses a later writer (${sticky})`,()=>{
 const tab={id:'new-native-id'},values=new Map([[tab,'{"id":"old-native-id","sticky":true}']]);let scheduled=0;
 const host={SessionStore:{getCustomTabValue:(t,key)=>{assert.equal(key,STICKY_TAB_KEY);return values.get(t)??'';},setCustomTabValue:(t,key,v)=>{assert.equal(key,STICKY_TAB_KEY);values.set(t,v);}}};
 const store=new StickyStateStore({getId:t=>t.id,isFolder:()=>false,getWindowValue:()=>'',getTabValue:t=>values.get(t)??'',setTabValue:(t,v)=>values.set(t,v)});
 const visibility={store,isSticky:t=>store.has(t),schedule:()=>scheduled++};
 const adapters=createBrowserRestoreAdapters(host,null,null,null,null,visibility),before=values.get(tab);
 const rollback=adapters.applyStickyRecovery(tab,sticky);assert.equal(adapters.getTabSticky(tab),sticky);
 if(sticky)assert.match(values.get(tab),/new-native-id/);else assert.equal(values.get(tab),'');
 rollback();assert.equal(values.get(tab),before);assert.equal(scheduled,2);
 const lateRollback=adapters.applyStickyRecovery(tab,sticky);values.set(tab,'later writer');
 assert.throws(lateRollback,/no longer owns/);assert.equal(values.get(tab),'later writer');
});
