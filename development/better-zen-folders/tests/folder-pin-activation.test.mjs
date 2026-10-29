import test from 'node:test';
import assert from 'node:assert/strict';
import * as api from '../scripts/better-zen-folders.uc.mjs';
function fixture(){
 const tabs=[{id:'old',scope:'regular-folder'},{id:'known',scope:'regular-folder'},{id:'root',scope:'root'},{id:'live',scope:'live'}],values=new Map(),events=[];
 const a={ready:Promise.resolve(true),isRestorationReady:()=>true,getStartupResetEnabled:()=>false,
  classify:t=>t.scope,getId:t=>t.id,getTabValue:t=>values.get(t)??'',setTabValue:(t,k,v)=>values.set(t,v),
  listTabs:()=>tabs,hasConsent:()=>false,requestConsent:async()=>{events.push('consent');return true;},
  acceptConsent:()=>events.push('accepted'),disableFeature:()=>events.push('disabled'),setStartupResetOff:()=>events.push('reset-off'),
  install:()=>{events.push('install');return ()=>events.push('cleanup');},reportError:e=>events.push(e.message),
 };
 const store=new api.FolderPinIntentStore(a);store.write(tabs[1],true);
 const activation=new api.FolderPinActivation(a,store);
 return {tabs,values,events,a,store,activation};
}
test('first activation explains legacy conversion before writes and leaves root/provider/known choices alone',async()=>{
 const f=fixture();f.a.requestConsent=async()=>{assert.equal(f.store.read(f.tabs[0]).status,'missing');f.events.push('consent');return true;};
 assert.deepEqual(await f.activation.start(),{ok:true,migrated:1,unresolved:0});
 assert.deepEqual(f.events,['consent','accepted','install']);assert.equal(f.store.read(f.tabs[0]).explicit,false);
 assert.equal(f.store.read(f.tabs[1]).explicit,true);assert.equal(f.store.read(f.tabs[2]).status,'missing');assert.equal(f.store.read(f.tabs[3]).status,'missing');
 f.activation.destroy();assert.equal(f.events.at(-1),'cleanup');
});
test('startup preference changes only after explicit consent; refusal never migrates or installs',async()=>{
 const f=fixture();let reset=true;f.a.getStartupResetEnabled=()=>reset;
 f.a.requestConsent=async()=>false;
 assert.deepEqual(await f.activation.start(),{ok:false,reason:'declined'});assert.deepEqual(f.events,['disabled']);assert.equal(f.store.read(f.tabs[0]).status,'missing');
 const g=fixture();g.a.getStartupResetEnabled=()=>reset;g.a.setStartupResetOff=()=>{reset=false;g.events.push('reset-off');};
 assert.equal((await g.activation.start()).ok,true);assert.deepEqual(g.events,['consent','reset-off','accepted','install']);
});
test('teardown while consent is pending prevents late preference or session changes',async()=>{
 const f=fixture();let answer;f.a.requestConsent=()=>new Promise(resolve=>answer=resolve);
 const pending=f.activation.start();await Promise.resolve();f.activation.destroy();answer(true);
 assert.deepEqual(await pending,{ok:false,reason:'cancelled'});assert.deepEqual(f.events,[]);assert.equal(f.store.read(f.tabs[0]).status,'missing');
});
test('partial migration is reported and retry only touches missing records, not invalid or established intent',async()=>{
 const f=fixture();f.a.hasConsent=()=>true;f.values.set(f.tabs[0],'invalid');
 assert.deepEqual(await f.activation.start(),{ok:true,migrated:0,unresolved:1});assert.equal(f.values.get(f.tabs[0]),'invalid');
 f.activation.destroy();f.values.delete(f.tabs[0]);assert.deepEqual(await f.activation.start(),{ok:true,migrated:1,unresolved:0});
 assert.equal(f.store.read(f.tabs[1]).explicit,true);
});

test('legacy conversion cannot begin if native protection fails to install',async()=>{
 const f=fixture();f.a.install=()=>{throw Error('unsupported hooks');};
 assert.deepEqual(await f.activation.start(),{ok:false,reason:'failed'});
 assert.equal(f.store.read(f.tabs[0]).status,'missing');
});

test('a rejected old consent request cannot tear down a newer activation',async()=>{
 const f=fixture();let reject;f.a.requestConsent=()=>new Promise((resolve,r)=>reject=r);
 const old=f.activation.start();await Promise.resolve();f.activation.destroy();f.a.hasConsent=()=>true;
 assert.equal((await f.activation.start()).ok,true);reject(Error('old dialog'));
 await old;assert.equal(f.events.includes('cleanup'),false);
 f.activation.destroy();assert.equal(f.events.at(-1),'cleanup');
});

test('legacy migration preserves a known mirrored choice and refuses conflicts or invalid mirrors',async()=>{
 for(const other of ['known','conflict','invalid']){
  const f=fixture(),local=f.tabs[0],mirror={...local};f.a.getIntentTargets=t=>t===local?[local,mirror]:[t];
  f.values.set(mirror,other==='invalid'?'bad':JSON.stringify({schema:1,tabId:local.id,explicit:true}));
  if(other==='conflict')f.values.set(local,JSON.stringify({schema:1,tabId:local.id,explicit:false}));
  const before=[f.values.get(local),f.values.get(mirror)],result=await f.activation.start();
  if(other==='known'){assert.equal(f.store.read(local).explicit,true);assert.equal(f.store.read(mirror).explicit,true);assert.equal(result.unresolved,0);}
  else{assert.equal(result.unresolved,1);assert.deepEqual([f.values.get(local),f.values.get(mirror)],before);}
 }
});

test('reactivation reconciles known root choices with native Pin and Unpin performed while disabled',async()=>{
 for(const native of [false,true]){
  const f=fixture(),root=f.tabs[2];f.store.write(root,!native);f.a.isNativePinned=()=>native;
  await f.activation.start();assert.equal(f.store.read(root).explicit,native);
 }
 const f=fixture(),root=f.tabs[2],transitional={...root,scope:'regular-folder'};
 f.store.write(root,false);f.a.isNativePinned=()=>true;f.a.getIntentTargets=t=>t===root?[root,transitional]:[t];
 const result=await f.activation.start();assert.equal(f.store.read(root).explicit,false);assert.ok(result.unresolved);
});

test('runtime exposes unsupported window mode before entering activation or opening consent',async()=>{
 const notices=[];const doc={documentElement:{appendChild:n=>notices.push(n)},createElementNS:()=>({setAttribute(){},appendChild(){},addEventListener(){},remove(){}})};
 const host={document:doc,gZenWorkspaces:{privateWindowOrDisabled:true},Services:{prefs:{}}};
 const runtime=new api.FolderPinRuntime(host,{get:()=>true});runtime.active=true;
 await runtime.enable();assert.equal(runtime.result.reason,'unsupported-window-mode');
 assert.equal(notices.length,1);assert.match(notices[0].textContent,/not available/i);assert.equal(runtime.activation,null);
});
