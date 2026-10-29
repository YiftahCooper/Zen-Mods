// Attributed BZF regression snapshot; same source revision as pin-engine provenance.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as api from '../src/pin-engine.mjs';

function fixture() {
  const calls=[],listeners=new Map(),cmd={id:'cmd_close'};
  const tab={scope:'regular-folder'},root={scope:'root'};
  const manager={
    resetPinnedTab(...args){calls.push(['native-reset',...args]);return 'native';},
    onCloseTabShortcut(...args){calls.push(['native-close',...args]);return 'native';},
    _onTabResetPinButton(...args){calls.push(['native-button',...args]);return 'native';},
    editPinnedUrl(...args){calls.push(['native-edit',...args]);return 'native';},
    replacePinnedUrlWithCurrent(...args){calls.push(['native-update',...args]);return 'native';},
  };
  const host={gZenPinnedTabManager:manager,TabContextMenu:{contextTab:tab},gBrowser:{selectedTab:tab},
    document:{getElementById:()=>cmd,addEventListener:(n,f,o)=>listeners.set(n,{f,o}),removeEventListener:(n,f)=>{if(listeners.get(n)?.f===f)listeners.delete(n);}}};
  const adapters={classify:t=>t?.scope,getStartupResetEnabled:()=>false,isRestorationReady:()=>true,reportError:e=>calls.push(['error',e])};
  const policy={active:true,reset:async t=>{calls.push(['reset',t]);return {ok:true};},
    edit:async t=>{calls.push(['edit',t]);return {ok:true};},update:async t=>{calls.push(['update',t]);return {ok:true};},
    close:async ts=>{calls.push(['close',ts]);return {ok:true};},unload:async ts=>{calls.push(['unload',ts]);return {ok:true};}};
  const results=[];const hooks=new api.FolderPinNativeHooks(host,policy,adapters,r=>results.push(r));hooks.start();
  const event=()=>({target:cmd,stopped:0,prevented:0,stopImmediatePropagation(){this.stopped++;},stopPropagation(){this.stopped++;},preventDefault(){this.prevented++;},getModifierState:()=>false});
  return {host,manager,tab,root,adapters,policy,hooks,calls,listeners,cmd,event,results};
}

test('folder Reset and implicit-context Reset use policy while root calls stay native',async()=>{
  const f=fixture();await f.manager.resetPinnedTab();assert.deepEqual(f.calls,[['reset',f.tab]]);
  assert.equal(f.manager.resetPinnedTab(f.root),'native');assert.equal(f.calls.at(-1)[0],'native-reset');
});

test('native Edit and Use Current Page commands respect folder policy and preserve root routing',async()=>{
  const f=fixture();await f.manager.editPinnedUrl();await f.manager.replacePinnedUrlWithCurrent(f.tab);
  assert.deepEqual(f.calls,[['edit',f.tab],['update',f.tab]]);
  assert.equal(f.manager.editPinnedUrl(f.root),'native');assert.equal(f.calls.at(-1)[0],'native-edit');
  f.host.TabContextMenu.contextTab=f.root;assert.equal(f.manager.replacePinnedUrlWithCurrent(),'native');
  assert.equal(f.calls.at(-1)[0],'native-update');
});

test('folder close bypasses native reset policy and split expansion; optional unload remains pure',async()=>{
  const f=fixture(),sibling={scope:'regular-folder'};f.tab.group={tabs:[f.tab,sibling],hasAttribute:()=>true};
  let e=f.event();await f.manager.onCloseTabShortcut(e,f.tab,{behavior:'reset-unload-switch'});
  assert.deepEqual(f.calls,[['close',[f.tab]]]);assert.ok(e.prevented&&e.stopped);
  e=f.event();await f.manager.onCloseTabShortcut(e,[f.tab,sibling],{alwaysUnload:true});
  assert.deepEqual(f.calls.at(-1),['unload',[f.tab,sibling]]);
  f.manager.onCloseTabShortcut(f.event(),f.root);assert.equal(f.calls.at(-1)[0],'native-close');
});

test('document capture intercepts the previously bound native cmd_close listener',async()=>{
  const f=fixture(),e=f.event();assert.equal(f.listeners.get('command').o,true);
  f.listeners.get('command').f(e);await Promise.resolve();
  assert.deepEqual(f.calls,[['close',[f.tab]]]);assert.ok(e.prevented&&e.stopped);
  f.host.gBrowser.selectedTab=f.root;f.listeners.get('command').f(f.event());assert.equal(f.calls.length,1);
});

test('private reset-button entry does not bypass per-tab policy or duplicate through a modifier',async()=>{
  const f=fixture(),e=f.event();await f.manager._onTabResetPinButton(e,f.tab);assert.deepEqual(f.calls,[['reset',f.tab]]);
  const modified=f.event();modified.getModifierState=()=>true;
  const result=await f.manager._onTabResetPinButton(modified,f.tab);
  assert.deepEqual(result,{ok:false,reason:'unsupported-modified-reset'});assert.equal(f.calls.length,1);
  assert.ok(modified.prevented&&modified.stopped);
});

test('mixed close partitions folder targets from native roots without native expansion over folder tabs',async()=>{
  const f=fixture();const r=await f.manager.onCloseTabShortcut(f.event(),[f.tab,f.root]);
  assert.deepEqual(r,{ok:true,reason:'native-targets-dispatched'});
  assert.deepEqual(f.calls[0],['close',[f.tab]]);assert.equal(f.calls[1][0],'native-close');assert.deepEqual(f.calls[1][2],[f.root]);
  assert.deepEqual(f.results,[r]);
});

test('mixed routing refuses protected targets before any action and stops after folder refusal',async()=>{
 const f=fixture();const r=await f.manager.onCloseTabShortcut(f.event(),[f.tab,{scope:'essential'}]);
 assert.deepEqual(r,{ok:false,reason:'unsupported-mixed-targets'});assert.equal(f.calls.length,0);
 f.policy.close=async()=>({ok:false,reason:'refused'});
 assert.deepEqual(await f.manager.onCloseTabShortcut(f.event(),[f.tab,f.root]),{ok:false,reason:'refused'});assert.equal(f.calls.length,0);
});

test('mixed continuation cannot act on native roots after teardown during a folder close',async()=>{
 const f=fixture();f.policy.close=async()=>{f.hooks.destroy();return {ok:true};};
 assert.deepEqual(await f.manager.onCloseTabShortcut(f.event(),[f.tab,f.root]),{ok:false,reason:'cancelled'});
 assert.equal(f.calls.length,0);
});

test('abort removes only owned hooks; a later wrapper can retain an inert earlier wrapper',async()=>{
  const f=fixture(),ours=f.manager.resetPinnedTab;
  f.manager.resetPinnedTab=function(...args){return Reflect.apply(ours,this,args);};
  const later=f.manager.resetPinnedTab;f.hooks.destroy();
  assert.equal(f.manager.resetPinnedTab,later);assert.equal(f.listeners.size,0);
  assert.equal(f.manager.resetPinnedTab(f.tab),'native');assert.equal(f.calls.at(-1)[0],'native-reset');
  f.hooks.start();const controller=new AbortController();f.hooks.destroy();f.hooks.start(controller.signal);controller.abort();
  assert.equal(f.listeners.size,0);
});

test('no hook is installed before the compatibility/readiness gate or when installation fails',()=>{
  for(const block of [f=>f.policy.active=false,f=>f.adapters.getStartupResetEnabled=()=>true,f=>f.adapters.isRestorationReady=()=>false]){
    const f=fixture();f.hooks.destroy();const original=f.manager.resetPinnedTab;block(f);f.hooks.start();assert.equal(f.manager.resetPinnedTab,original);assert.equal(f.listeners.size,0);
  }
  const f=fixture();f.hooks.destroy();const original=f.manager.resetPinnedTab;
  Object.defineProperty(f.manager,'onCloseTabShortcut',{value:f.manager.onCloseTabShortcut,writable:false,configurable:false});
  f.hooks.start();assert.equal(f.manager.resetPinnedTab,original);assert.equal(f.listeners.size,0);
});

test('completion from a previous activation cannot notify a new activation',async()=>{
  const f=fixture();let release;f.policy.close=()=>new Promise(r=>release=r);
  const pending=f.manager.onCloseTabShortcut(f.event(),f.tab);
  const oldReset=f.manager.resetPinnedTab;
  f.hooks.destroy();f.hooks.start();release({ok:true});await pending;
  assert.deepEqual(f.results,[]);
  assert.equal(oldReset(f.tab),'native','an old hook never reactivates with a later lifecycle');
});

test('native dispatch reentry cannot attribute the old result to the new activation',async()=>{
  for(const route of ['method','command']){
    const f=fixture();f.policy.close=()=>{f.hooks.destroy();f.hooks.start();return Promise.resolve({ok:true,origin:'old'});};
    if(route==='method')await f.manager.onCloseTabShortcut(f.event(),f.tab);
    else{f.listeners.get('command').f(f.event());await Promise.resolve();await Promise.resolve();}
    assert.deepEqual(f.results,[],route);
  }
});
