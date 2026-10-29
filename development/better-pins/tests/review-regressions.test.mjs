import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Zones} from '../src/zones.mjs';
import {Presentation} from '../src/presentation.mjs';
import {ownMethod,restoreOwned} from '../src/state.mjs';
import {BetterPinsController} from '../src/controller.mjs';
import {FolderPinPolicy} from '../src/pin-engine.mjs';

function node(localName,id='') {
  return {localName,id,children:[],isConnected:true,tabs:[],
    hasAttribute(){return false;},classList:{contains(){return false;}},
    get parentElement(){return this.parentNode;},
    get nextSibling(){return this.parentNode?.children[this.parentNode.children.indexOf(this)+1]??null;},
    closest(selector){for(let n=this;n;n=n.parentNode)if(selector==='zen-workspace'&&n.localName===selector)return n;return null;},
    getAttribute(name){return name==='id'?this.id:null;},
    insertBefore(child,before){
      if(child.parentNode)child.parentNode.children.splice(child.parentNode.children.indexOf(child),1);
      const at=before?this.children.indexOf(before):this.children.length;
      assert.ok(at>=0,'fixture anchor must belong to container');
      this.children.splice(at,0,child);child.parentNode=this;
    }};
}

function synchronizedZones() {
  const windows=[],sync={};
  for(let i=0;i<3;i++) {
    const space=node('zen-workspace','space'),upper=node('div'),lower=node('div');
    space.pinnedTabsContainer=upper;space.tabsContainer=lower;
    space.insertBefore(upper,null);space.insertBefore(lower,null);
    for(const id of ['a','b'])upper.insertBefore(node('zen-folder',id),null);
    lower.insertBefore(node('zen-folder','c'),null);
    const host={gZenWindowSync:sync,document:{querySelectorAll:()=>[space]},
      Services:{wm:{getEnumerator:()=>windows}},SessionStore:{
        getCustomWindowValue:()=>host.raw,
        setCustomWindowValue:(_,__,raw)=>{host.raw=raw;},
      }};
    const c={host,active:true,supportedTree:()=>true,policy:{busy:new Set()},
      adapters:{getSavedBaseline:()=>null},reportError:e=>host.errors.push(e)};
    host.errors=[];c.zones=new Zones(c);c.zones.active=true;c.zones.state=c.zones.snapshot();
    host.raw=JSON.stringify(c.zones.state);host.__betterPinsController=c;
    host.space=space;windows.push(host);
  }
  return windows;
}

function receipts(windows) {
  return windows.map(win=>({raw:win.raw,state:JSON.stringify(win.__betterPinsController.zones.state),
    upper:win.space.pinnedTabsContainer.children.map(n=>n.id),
    lower:win.space.tabsContainer.children.map(n=>n.id)}));
}

test('zone move rolls back all durable window records and origin placement when a later peer write fails',async()=>{
  const windows=synchronizedZones(),before=receipts(windows),last=windows[2];
  let fail=true;
  last.SessionStore.setCustomWindowValue=(_,__,raw)=>{if(fail){fail=false;throw Error('peer storage refusal');}last.raw=raw;};
  const result=await windows[0].__betterPinsController.zones.move(windows[0].space.pinnedTabsContainer.children[0],'lower');
  assert.deepEqual(result,{ok:false,reason:'zone-save-failed'});
  assert.deepEqual(receipts(windows),before);
});

test('zone move restores peer order and placement after projection has already moved identities',async()=>{
  const windows=synchronizedZones(),before=receipts(windows),last=windows[2].__betterPinsController.zones;
  const project=last.project.bind(last);
  last.project=()=>{project();throw Error('projection failure after mutation');};
  const result=await windows[0].__betterPinsController.zones.move(windows[0].space.pinnedTabsContainer.children[0],'lower');
  assert.equal(result.ok,false);
  assert.deepEqual(receipts(windows),before);
});

test('zone save detects a peer that silently ignores the write and restores earlier windows',async()=>{
  const windows=synchronizedZones(),before=receipts(windows);
  windows[2].SessionStore.setCustomWindowValue=()=>{};
  const result=await windows[0].__betterPinsController.zones.move(windows[0].space.pinnedTabsContainer.children[0],'lower');
  assert.equal(result.ok,false);
  assert.deepEqual(receipts(windows),before);
});

for(const order of ['better-pins-first','bzf-first'])test(`late BZF unload wrapper becomes inert after both owners stop (${order})`,()=>{
  let native=0,pure=0,bzfCalls=0;
  const folder={tabs:[],unloadAllTabs(){native++;}},managers=[];
  const host={gBrowser:{explicitUnloadTabs(){pure++;}},gZenWorkspaces:{allStoredTabs:[]},
    document:{querySelectorAll:()=>[folder]},__betterZenFoldersController:{adapters:{managers}}};
  const p=new Presentation({host,supportedTree:()=>true,zones:{layout(){}}});p.active=true;p.refresh();
  folder.unloadAllTabs();assert.equal(pure,1);
  const manager={constructor:{name:'FolderUnloadManager'},started:true};managers.push(manager);
  const later=ownMethod(folder,'unloadAllTabs',(_,original)=>manager.started?bzfCalls++:original());
  p.refresh();folder.unloadAllTabs();assert.equal(bzfCalls,1);
  const stopBzf=()=>{manager.started=false;restoreOwned(later);};
  if(order==='better-pins-first'){p.destroy();stopBzf();}
  else{stopBzf();p.refresh();folder.unloadAllTabs();assert.equal(pure,2);p.destroy();}
  const priorPure=pure;folder.unloadAllTabs();
  assert.equal(native,1,'native method must receive the call after both owners stop');
  assert.equal(pure,priorPure,'inactive Better Pins wrapper must not retain behavior');
});

test('baseline commit reuses verified persistence receipts without a vulnerable post-commit read',async()=>{
  const tab={id:'one',baseline:{entry:{url:'https://example.org/A'}}};
  let raw=JSON.stringify({schema:1,baseline:tab.baseline}),newBaselineReads=0,intentWrites=0;
  const host={SessionStore:{
    getCustomTabValue(){
      if(raw.includes('/B')&&++newBaselineReads===2)throw Error('post-persist read failure');
      return raw;
    },
    setCustomTabValue:(_,__,value)=>{raw=value;},
  }};
  const controller=new BetterPinsController(host);
  const adapters=controller.adapters={
    getIntentTargets:()=>[tab],getId:t=>t.id,classify:()=> 'regular-folder',getLocation:()=>null,
    getStartupResetEnabled:()=>false,isRestorationReady:()=>true,
    captureBaseline:()=>[{tab,owner:tab.baseline,value:structuredClone(tab.baseline)}],
    getSavedBaseline:()=>tab.baseline,
    ownsBaseline:(_,next)=>tab.baseline===next[0].owner,
    restoreBaseline:(_,previous,next)=>{
      if(tab.baseline!==next[0].owner)return false;
      tab.baseline=previous[0].value;return true;
    },
    async writeBaseline(){
      tab.baseline={entry:{url:'https://example.org/B'}};
      return [{tab,owner:tab.baseline,value:structuredClone(tab.baseline)}];
    },
    setCurrentAsBaseline:t=>adapters.writeBaseline(t),clearDuplicateState(){},reportError(){},
  };
  controller.configureAdapters();
  const policy=new FolderPinPolicy(adapters,{read:()=>({status:'known',explicit:true}),write(){intentWrites++;}});
  policy.start();
  assert.deepEqual(await policy.update(tab),{ok:true});
  assert.equal(intentWrites,1);
  assert.equal(newBaselineReads,1,'the successful verification is already the durable receipt');
  assert.equal(tab.baseline.entry.url,'https://example.org/B');
  assert.equal(JSON.parse(raw).baseline.entry.url,tab.baseline.entry.url,'durable and native baselines must agree');
});
