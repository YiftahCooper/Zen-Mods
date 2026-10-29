import test from 'node:test';
import assert from 'node:assert/strict';
import * as api from '../scripts/better-zen-folders.uc.mjs';

function fixture(){
 const values=new Map(),folders=[],listeners=new Map(),errors=[];let next=0;
 const host={document:{querySelectorAll:()=>folders},addEventListener:(n,f)=>listeners.set(n,f),removeEventListener:(n,f)=>{if(listeners.get(n)===f)listeners.delete(n);}};
 const tab=()=>({id:`tab-${++next}`,localName:'tab',isConnected:true,pinned:false,folder:null,baseline:null,
  closest(){return this.folder;},hasAttribute:n=>false});
 const browser=host.gBrowser={pinTab(t){t.pinned=true;t.baseline??={entry:{url:'structural'}};},unpinTab(t){t.pinned=false;t.folder=null;t.baseline=null;},
  addTab(url,options={}){const t=tab();t.current=url;t.folder=options.tabGroup??null;host.gZenFolders.on_TabOpen({target:t});return t;},
  duplicateTab(t){return this.addTab(null,{skipLoad:true,tabGroup:t.folder});},
  moveTabToExistingGroup(t,g){this.pinTab(t);t.folder=g;},ungroupTab(t){t.folder=null;},
  tabContainer:{tabDragAndDrop:{handle_drop(e){browser.pinTab(e.tab);e.folder.addTabs([e.tab]);}}}};
 host.gZenFolders={_createFolderNode(){const f={isZenFolder:true,isConnected:true,addTabs(ts){for(const t of ts){browser.pinTab(t);t.folder=this;}}};folders.push(f);return f;},
  createFolder(ts){for(const t of ts)browser.pinTab(t);const f=this._createFolderNode();f.addTabs(ts);return f;},
  on_TabOpen(e){if(e.target.folder){const f=e.target.folder;browser.pinTab(e.target);f.addTabs([e.target]);}}};
 const adapters={getId:t=>t.id,classify:t=>t.folder?'regular-folder':'root',getLocation:t=>t.folder,isNativePinned:t=>t.pinned,
  getTabValue:t=>values.get(t)??'',setTabValue:(t,k,v)=>values.set(t,v),getSavedBaseline:t=>structuredClone(t.baseline),
  setSavedBaseline:(t,v)=>{t.baseline=structuredClone(v);},isConnected:t=>t.isConnected,
  setRootPlacement:(t,p)=>{if(p)browser.pinTab(t);else browser.unpinTab(t);},clearDuplicateState:t=>{t.baseline=null;t.sticky=false;},
  isRestorationReady:()=>true,getStartupResetEnabled:()=>false,reportError:e=>errors.push(e),};
 const store=new api.FolderPinIntentStore(adapters),policy={pin:async t=>{t.baseline={entry:{url:t.current}};store.write(t,true);return {ok:true};}};
 const lifecycle=new api.FolderPinLifecycle(adapters,store,policy);lifecycle.start();
 const prefs={get:()=>false},hooks=new api.FolderPinOriginHooks(host,lifecycle,adapters,prefs);hooks.start();
 return {host,browser,store,lifecycle,hooks,prefs,values,tab,errors,listeners};
}
test('createFolder captures ordinary/root pin origin before native pins its supplied existing tabs',async()=>{
 const f=fixture(),a=f.tab(),b=f.tab();b.pinned=true;b.baseline={entry:{url:'saved'}};
 f.host.gZenFolders.createFolder([a,b]);await f.hooks.flush();
 assert.equal(f.store.read(a).explicit,false);assert.equal(f.store.read(b).explicit,true);assert.equal(b.baseline.entry.url,'saved');
 assert.deepEqual(f.errors,[]);
});
test('new folder-owned tabs use only the new default; direct moves and root export preserve choice',async()=>{
 const f=fixture(),folder=f.host.gZenFolders._createFolderNode();f.prefs.get=()=>true;
 const fresh=f.browser.addTab('new',{tabGroup:folder});await f.hooks.flush();assert.equal(f.store.read(fresh).explicit,true);assert.equal(fresh.baseline.entry.url,'new');
 const moved=f.tab();folder.addTabs([moved]);await f.hooks.flush();assert.equal(f.store.read(moved).explicit,false);
 f.browser.ungroupTab(moved);await f.hooks.flush();assert.equal(moved.pinned,false);
 f.browser.ungroupTab(fresh);await f.hooks.flush();assert.equal(fresh.pinned,true);assert.equal(fresh.baseline.entry.url,'new');
});
for(const pinNew of [false,true])test(`live window.open is a new folder tab, not restored state (pin default=${pinNew})`,async()=>{
 const f=fixture(),folder=f.host.gZenFolders._createFolderNode(),context={};f.prefs.get=()=>pinNew;
 const opened=f.browser.addTab('homepage',{tabGroup:folder,skipLoad:true,openerBrowser:{browsingContext:context},openWindowInfo:{parent:{top:context}}});
 await f.hooks.flush();
 assert.equal(f.store.read(opened).status,'known');assert.equal(f.store.read(opened).explicit,pinNew);
 if(pinNew)assert.equal(opened.baseline?.entry?.url,'homepage');
 assert.deepEqual(f.errors,[]);
});
test('duplicate returns a tab immediately and waits for restored identity before clearing copied choices',async()=>{
 const f=fixture(),folder=f.host.gZenFolders._createFolderNode(),original=f.browser.addTab('A',{tabGroup:folder});await f.hooks.flush();f.store.write(original,true);
 const copy=f.browser.duplicateTab(original);assert.equal(copy.localName,'tab');assert.equal(copy.then,undefined);
 copy.id='restored-new-id';f.values.set(copy,f.values.get(original));copy.sticky=true;copy.baseline={entry:{url:'A'}};
 f.listeners.get('SSTabRestoring')({target:copy});await f.hooks.flush();
 assert.equal(f.store.read(copy).explicit,false);assert.equal(copy.sticky,false);assert.equal(copy.baseline,null);assert.equal(f.store.read(original).explicit,true);
});
test('restoration creation is not a new default and destroyed hooks cannot reapply it',async()=>{
 const f=fixture(),folder=f.host.gZenFolders._createFolderNode();f.prefs.get=()=>true;
 const restored=f.browser.addTab('A',{tabGroup:folder,skipLoad:true,insertTab:false});await f.hooks.flush();assert.equal(f.store.read(restored).status,'missing');
 f.hooks.destroy();const after=f.browser.addTab('B',{tabGroup:folder});await f.hooks.flush();assert.equal(f.store.read(after).status,'missing');
 assert.equal(f.listeners.size,0);
});

test('new origin waits for addTab to assign identity and start its requested load after TabOpen',async()=>{
 const f=fixture();f.hooks.destroy();const folder=f.host.gZenFolders._createFolderNode();
 f.browser.addTab=(url,options)=>{const t=f.tab(),id=t.id;t.id='';t.folder=options.tabGroup;t.current='about:blank';f.host.gZenFolders.on_TabOpen({target:t});t.id=id;t.current=url;return t;};
 f.prefs.get=()=>true;f.hooks.start();const t=f.browser.addTab('requested',{tabGroup:folder});await f.hooks.flush();
 assert.equal(f.store.read(t).explicit,true);assert.equal(t.baseline.entry.url,'requested');
});

test('creation remains pending until the native identity handoff and cancels on teardown',async()=>{
 const f=fixture(),folder=f.host.gZenFolders._createFolderNode();f.prefs.get=()=>true;
 let ready;f.hooks.adapters.waitForCreation=()=>new Promise(r=>ready=r);
 const t=f.browser.addTab('B',{tabGroup:folder});assert.equal(f.store.read(t).status,'missing');
 ready(true);await f.hooks.flush();assert.equal(f.store.read(t).explicit,true);
 const later=f.browser.addTab('C',{tabGroup:folder});f.hooks.destroy();ready(true);await f.hooks.flush();
 assert.equal(f.store.read(later).status,'missing');
});

test('explicit native root Pin and Unpin supersede an exported record without treating structural pins as choices',async()=>{
 const f=fixture(),tab=f.tab();f.store.write(tab,false);
 f.browser.pinTab(tab);assert.equal(f.store.read(tab).explicit,true);
 f.browser.unpinTab(tab);assert.equal(f.store.read(tab).explicit,false);
 const folder=f.host.gZenFolders.createFolder([tab]);await f.hooks.flush();assert.equal(f.store.read(tab).explicit,false);
 const reused=f.tab();f.store.write(reused,false);
 f.hooks.placeCreatedTab(reused,'move',()=>{f.browser.pinTab(reused);folder.addTabs([reused]);});await f.hooks.flush();assert.equal(f.store.read(reused).explicit,false);
});

test('owned duplicate provenance is released on close and teardown before asynchronous restore',async()=>{
 const f=fixture(),copy=f.browser.duplicateTab(f.tab());assert.equal(f.hooks.duplicates.has(copy),true);
 f.listeners.get('TabClose')({target:copy});assert.equal(f.hooks.duplicates.has(copy),false);
 f.browser.duplicateTab(f.tab());f.hooks.destroy();assert.equal(f.hooks.duplicates.size,0);
});

test('asynchronous duplicate restore cannot reuse the source identity or its URL pin',async()=>{
 const f=fixture(),folder=f.host.gZenFolders._createFolderNode(),source=f.browser.addTab('A',{tabGroup:folder});
 await f.hooks.flush();f.store.write(source,true);source.baseline={entry:{url:'A'}};
 const copy=f.browser.duplicateTab(source),createdId=copy.id;
 // SessionStore copies extData asynchronously; legacy zenPinnedId can also
 // restore the source ID even though native duplicate clears zenSyncId.
 await Promise.resolve();copy.id=source.id;copy.baseline=structuredClone(source.baseline);
 f.values.set(copy,f.values.get(source));
 f.listeners.get('SSTabRestoring')({target:copy});await f.hooks.flush();
 assert.equal(copy.id,createdId);assert.notEqual(copy.id,source.id);
 assert.equal(f.store.read(copy).explicit,false);assert.equal(copy.baseline,null);
 assert.equal(f.store.read(source).explicit,true);assert.equal(source.baseline.entry.url,'A');
 assert.deepEqual(f.errors,[]);
});

test('structural pinning cannot enqueue a late native baseline capture; root pinning remains native',async()=>{
 const f=fixture();f.hooks.destroy();const queued=[];
 f.host.gZenWindowSync={setPinnedTabState(t){return new Promise(resolve=>queued.push(()=>{t.baseline={entry:{url:'late-native'}};resolve();}));}};
 f.browser.pinTab=t=>{if(t.pinned)return;t.pinned=true;if(!t.baseline)void f.host.gZenWindowSync.setPinnedTabState(t);};
 f.hooks.start();const moved=f.tab();f.host.gZenFolders.createFolder([moved]);await f.hooks.flush();
 assert.equal(queued.length,0,'folder placement must not start native URL capture');
 const root=f.tab();f.browser.pinTab(root);assert.equal(queued.length,1,'native root Pin still captures its URL');queued.shift()();
 f.hooks.destroy();const after=f.tab();f.host.gZenFolders.createFolder([after]);assert.equal(queued.length,1,'teardown restores native capture');queued.shift()();
});

test('Space moves export ordinary folder members without making them native URL pins',async()=>{
 const f=fixture();f.hooks.destroy();
 f.host.gZenWorkspaces={moveTabsToWorkspace(tabs,id){for(const t of tabs){t.folder=null;t.space=id;}return true;}};
 f.hooks.start();const ordinary=f.tab(),explicit=f.tab();explicit.pinned=true;explicit.baseline={entry:{url:'saved'}};
 f.host.gZenFolders.createFolder([ordinary,explicit]);await f.hooks.flush();
 assert.equal(f.host.gZenWorkspaces.moveTabsToWorkspace([ordinary,explicit],'next'),true);await f.hooks.flush();
 assert.equal(ordinary.pinned,false);assert.equal(explicit.pinned,true);assert.equal(explicit.baseline.entry.url,'saved');
 assert.equal(f.store.read(ordinary).explicit,false);assert.equal(f.store.read(explicit).explicit,true);
});

test('native positional and keyboard moves preserve folder export intent',async()=>{
 const f=fixture();f.hooks.destroy();f.browser.moveTabTo=t=>{t.folder=null;};
 f.browser.moveTabForward=()=>{f.browser.selectedTab.folder=null;};f.hooks.start();
 for(const route of [t=>f.browser.moveTabTo(t),t=>{f.browser.selectedTab=t;f.browser.moveTabForward();}]){
  const t=f.tab();f.host.gZenFolders.createFolder([t]);await f.hooks.flush();route(t);await f.hooks.flush();assert.equal(t.pinned,false);
 }
});
