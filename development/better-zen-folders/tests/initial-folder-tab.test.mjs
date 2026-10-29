import test from 'node:test';
import assert from 'node:assert/strict';
import {RelatedFolderTabsManager,NewTabInFolderTransaction,createBrowserNewTabTransactionAdapters,FolderPopulationRegistry} from '../scripts/better-zen-folders.uc.mjs';
import {FakeEventTarget,makeRegularFolder} from './fakes.mjs';
import {createNativeNewTabManager} from './fixtures/zen-1.22.2b-new-tab.mjs';

// Native session and timer methods are retained verbatim. Browser insertion
// below models the observed pinned/tabGroup gate and records TabOpen before
// selection and before delayed ZenURLBarClosed confirmation can run.
function fixture(t,position='bottom'){
 const events=new FakeEventTarget(),container=new FakeEventTarget(),attrs=new Map(),timers=new Map(),observers=new Set(),errors=[];let serial=0,nextTimer=0;
 const host={closed:false,console:{error:(...args)=>errors.push(args)},addEventListener:(...a)=>events.addEventListener(...a),removeEventListener:(...a)=>events.removeEventListener(...a),dispatchEvent:e=>{events.emit(e.type,e);return true;},
  setTimeout:(f,ms=0)=>{const n=++nextTimer;timers.set(n,{f,ms});return n;},clearTimeout:n=>timers.delete(n),
  MutationObserver:class{constructor(f){this.f=f;}observe(){observers.add(this);}disconnect(){observers.delete(this);}},
  gZenWorkspaces:{activeWorkspace:'space',fixTabInsertLocation(tab){if(tab.pinned)move(tab,null);}},
 };
 const roots=[],move=(tab,folder,target=null)=>{const previous=tab.group?.allItems??roots;const index=previous.indexOf(tab);if(index>=0)previous.splice(index,1);tab.group=folder;const items=folder?.allItems??roots;items.splice(target?items.indexOf(target):items.length,0,tab);};
 const folder=makeRegularFolder({ownerGlobal:host,collapsed:false,getAttribute:n=>n==='zen-workspace-id'?'space':null});
 folder.groupContainer={insertBefore:(tab,target)=>move(tab,folder,target)};folder.addTabs=tabs=>tabs.forEach(tab=>move(tab,folder));
 const tab=group=>{const item={id:'tab-'+(++serial),localName:'tab',isConnected:true,documentGlobal:host,ownerGlobal:host,pinned:!!group,group:null,isEmpty:false,linkedBrowser:{currentURI:{spec:'https://existing.test/'}},hasAttribute:()=>false,closest:()=>item.group};roots.push(item);if(group)move(item,group);return item;};
 const nativeOptions=[],opened=[],orderAtOpen=[];
 host.gBrowser={tabContainer:container,selectedTab:tab(null),isTab:t=>t?.localName==='tab',getTabForBrowser:b=>[...roots,...folder.allItems].find(t=>t.linkedBrowser===b),
  addTab(url,options={}){nativeOptions.push(options);const item=tab(null);item.pinned=!!options.pinned;item.linkedBrowser.currentURI.spec=url;if(options.tabGroup&&item.pinned)move(item,options.tabGroup);host.gZenWorkspaces.fixTabInsertLocation(item);container.emit('TabOpen',{target:item});return item;},
  pinTab:t=>{t.pinned=true;},removeTab:()=>{throw Error('unexpected removal');}};
 host.gURLBar={focused:false,_untrimmedValue:'',view:{close(){}},search(){},handleRevert(){},setURI(){},updateTextOverflow(){},getBrowserState:()=>({}),hasAttribute:n=>attrs.has(n),setAttribute(n,v){attrs.set(n,v);queueMicrotask(()=>observers.forEach(o=>o.f()));},removeAttribute(n){attrs.delete(n);queueMicrotask(()=>observers.forEach(o=>o.f()));}};
 host.gZenUIManager=createNativeNewTabManager({window:host,document:{documentElement:{hasAttribute:()=>false},getElementById:()=>({doCommand:()=>{host.gURLBar.focused=true;}})},gBrowser:host.gBrowser,gURLBar:host.gURLBar,gZenVerticalTabsManager:{_canReplaceNewTab:true},setTimeout:host.setTimeout,clearTimeout:host.clearTimeout,CustomEvent,console:host.console});
 host.openTrustedLinkIn=function(url,where,options){if(where==='current')return;const result=host.gBrowser.addTab(url,options);if(!options.inBackground)host.gBrowser.selectedTab=result;host.gURLBar._zenHandleUrlbarClose?.(true,true);return result;};
 const related=new RelatedFolderTabsManager(host);related.start();host.__betterZenFoldersController={adapters:{managers:[related]}};
 const tx=new NewTabInFolderTransaction(createBrowserNewTabTransactionAdapters(host,container,new FolderPopulationRegistry(),{get:()=>position}));
 t.after(()=>{tx.destroy();related.destroy();});
 container.addEventListener('TabOpen',e=>{opened.push({tab:e.target,group:e.target.group});orderAtOpen.push([...folder.allItems]);});
 const a=tab(folder),b=tab(folder);
 const flush=async()=>{for(let i=0;i<40;i++){await Promise.resolve();const next=[...timers].find(([,v])=>v.ms===0);if(!next){await Promise.resolve();return;}timers.delete(next[0]);next[1].f();}throw Error('timer loop');};
 return {host,folder,a,b,related,tx,opened,nativeOptions,roots,tab,flush,errors,
  choose:(url='https://chosen.test/',params={})=>host.openTrustedLinkIn(url,'tab',{initiatedByURLBar:true,...params})};
}

for(const position of ['top','bottom'])test(`folder plus creates in its folder at TabOpen and applies ${position} before confirmation`,async t=>{
 const f=fixture(t,position),pending=f.tx.activate(f.folder),result=f.choose();
 assert.equal(f.opened[0].group,f.folder,'TabOpen must never expose the new row in the regular area');
 assert.deepEqual(f.folder.allItems,position==='top'?[result,f.a,f.b]:[f.a,f.b,result]);
 assert.equal(f.nativeOptions[0].pinned,true);assert.equal(f.nativeOptions[0].tabGroup,f.folder);
 await f.flush();assert.equal(await pending,true);
 assert.deepEqual(f.folder.allItems,position==='top'?[result,f.a,f.b]:[f.a,f.b,result]);
});

test('opening a background tab while the folder dialogue is waiting does not grant it the destination',async t=>{
 const f=fixture(t),pending=f.tx.activate(f.folder),other=f.host.gBrowser.addTab('https://background.test/',{inBackground:true});
 assert.equal(other.group,null);const chosen=f.choose();assert.equal(chosen.group,f.folder);
 await f.flush();assert.equal(await pending,true);assert.equal(other.group,null);
});

for(const mode of ['cancelled','replaced','destroyed','disconnected','foreign-workspace'])test(`an invalid ${mode} folder request cannot capture a URL-bar load`,async t=>{
 const f=fixture(t),pending=f.tx.activate(f.folder);
 if(mode==='cancelled'){f.host.gURLBar._zenHandleUrlbarClose(false,false);await f.flush();}
 if(mode==='replaced')f.host.gZenUIManager.handleNewTab(false,false,'tab',true,{});
 if(mode==='destroyed')f.tx.destroy();
 if(mode==='disconnected')f.folder.isConnected=false;
 if(mode==='foreign-workspace')f.host.gZenWorkspaces.activeWorkspace='other';
 const result=f.choose();assert.equal(f.opened[0].group,null);assert.equal(result.group,null);
 f.tx.destroy();await f.flush();await pending;
});

test('the synchronous creation capability cannot capture reentrant TabOpen work',async t=>{
 const f=fixture(t),pending=f.tx.activate(f.folder);let reentrant;
 const listener=()=>{f.host.gBrowser.tabContainer.removeEventListener('TabOpen',listener);reentrant=f.host.gBrowser.addTab('https://reentrant.test/',{});};
 f.host.gBrowser.tabContainer.addEventListener('TabOpen',listener);const chosen=f.choose();
 assert.equal(reentrant.group,null);assert.equal(chosen.group,f.folder);
 await f.flush();assert.equal(await pending,true);
});

test('a later foreign trusted-link wrapper survives handoff cleanup and manager teardown',async t=>{
 const f=fixture(t),pending=f.tx.activate(f.folder),ours=f.host.openTrustedLinkIn;
 const foreign=function(...args){return Reflect.apply(ours,this,args);};f.host.openTrustedLinkIn=foreign;
 const chosen=f.choose();await f.flush();assert.equal(await pending,true);assert.equal(chosen.group,f.folder);
 f.related.destroy();assert.equal(f.host.openTrustedLinkIn,foreign);
 const later=f.choose();assert.equal(later.group,null);
});

for(const mode of ['cancelled','replaced','destroyed'])test(`request ${mode} during TabOpen cannot perform stale completion work`,async t=>{
 const f=fixture(t,'top'),pending=f.tx.activate(f.folder);let insertions=0;
 const insert=f.folder.groupContainer.insertBefore;
 f.folder.groupContainer.insertBefore=(...args)=>{insertions++;return insert(...args);};
 f.host.gBrowser.tabContainer.addEventListener('TabOpen',()=>{
  if(mode==='cancelled')f.tx.handoff.cancel();
  if(mode==='replaced')f.host.gZenUIManager.handleNewTab(false,false,'tab',true,{});
  if(mode==='destroyed'){f.tx.destroy();f.related.destroy();}
  f.folder.collapsed=true;
 });
 const chosen=f.choose();
 assert.equal(insertions,0,'no completion insertion after invalidation');
 assert.equal(f.folder.collapsed,true,'no stale collapsed-path restoration');
 assert.deepEqual(f.folder.allItems,[f.a,f.b,chosen]);
 await f.flush();f.tx.destroy();assert.equal(await pending,false);
});

test('preparation errors preserve the native open result and use the transaction error path',async t=>{
 const f=fixture(t,'top'),pending=f.tx.activate(f.folder),sentinel=Error('placement sentinel');
 f.folder.groupContainer.insertBefore=()=>{throw sentinel;};
 let chosen;assert.doesNotThrow(()=>{chosen=f.choose();});
 assert.equal(chosen.group,f.folder,'created tab is retained');
 await f.flush();assert.equal(await pending,false);
 assert.equal(f.errors.length,1);assert.equal(f.errors[0][1],sentinel);
});

test('a genuine native insertion failure still propagates unchanged',async t=>{
 const f=fixture(t,'top'),pending=f.tx.activate(f.folder),sentinel=Error('native insertion sentinel');
 f.host.gBrowser.tabContainer.addEventListener('TabOpen',()=>{throw sentinel;});
 assert.throws(()=>f.choose(),error=>error===sentinel);
 f.tx.destroy();await f.flush();assert.equal(await pending,false);assert.deepEqual(f.errors,[]);
});
