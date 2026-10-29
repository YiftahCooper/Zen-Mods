import test from 'node:test';
import assert from 'node:assert/strict';
import * as api from '../scripts/better-zen-folders.uc.mjs';
import {DropNode, makeFolderEndDropFixture} from './folder-end-drop.fixture.mjs';
import {installNativeDropReplay} from './folder-end-drop.native.fixture.mjs';
import {makePreferenceFixture} from './fakes.mjs';

function fixture() {
  const f=makeFolderEndDropFixture(api,{install:false});
  installNativeDropReplay(f);
  const moving=f.addFolder('Moving',f.pins,30,10);
  const nested=f.addFolder('Nested',moving.groupContainer,60,24);
  const tab=f.own(new DropNode('tab','kept-tab'));tab.setAttribute('pinned','true');nested.groupContainer.appendChild(tab);
  moving.setAttribute('data-better-zen-folders-sticky','true');
  moving.setAttribute('zen-user-icon','custom');moving.setAttribute('data-better-zen-folders-color','#123456');
  moving.collapsed=true;nested.collapsed=true;
  const placeholder=f.own(new DropNode('tab','empty'));placeholder.setAttribute('pinned','true');placeholder.setAttribute('zen-empty-tab','true');
  f.child.groupContainer.insertBefore(placeholder,f.last);
  const end=f.own(new DropNode('tab','end'));end.setAttribute('pinned','true');f.child.groupContainer.appendChild(end);
  f.host.gBrowser.tabGroups=[f.parent,f.child,moving,nested];
  f.host.Services={prefs:{getIntPref:()=>5}};
  let position='bottom';
  const prefs={get:name=>name==='movedFolderPosition'?position:undefined};
  return {...f,moving,nested,tab,placeholder,end,prefs,setPosition:value=>{position=value;}};
}
function adapters(f) {
  assert.equal(typeof api.createBrowserFolderMoveAdapters,'function','whole-folder native move adapter exists');
  return api.createBrowserFolderMoveAdapters(f.host,f.prefs,new api.FolderPopulationRegistry());
}

test('saved and changed folder-placement preferences reach the native move receiver',()=>{
  const settings=makePreferenceFixture();
  settings.set('better-zen-folders.moved-folder-position','top');
  settings.set('better-zen-folders.new-tab-position','bottom');
  const prefs=new api.BetterZenFoldersPreferences(api.createBrowserPreferenceAdapters(settings.host));
  prefs.start();
  const f=fixture(),a=api.createBrowserFolderMoveAdapters(f.host,prefs,new api.FolderPopulationRegistry());
  try {
    assert.equal(a.move(f.moving,f.child),true);
    assert.equal(f.child.groupContainer.children.filter(n=>!n.hasAttribute('zen-empty-tab'))[0].id,'Moving');
    settings.set('better-zen-folders.moved-folder-position','bottom');
    settings.notify('better-zen-folders.moved-folder-position');
    assert.equal(a.move(f.moving,f.child),true);
    assert.equal(f.child.groupContainer.children.at(-1).id,'Moving');
    settings.set('better-zen-folders.moved-folder-position','top');
    settings.notify('better-zen-folders.moved-folder-position');
    assert.equal(a.move(f.moving,f.child),true);
    assert.equal(f.child.groupContainer.children.filter(n=>!n.hasAttribute('zen-empty-tab'))[0].id,'Moving');
    assert.equal(prefs.get('newTabPosition'),'bottom');
  }finally{prefs.destroy();}
});

for(const position of ['top','bottom']) test(`Move Folder uses native whole-group receiver at ${position} without changing identity or child order`,()=>{
  const f=fixture(),a=adapters(f);f.setPosition(position);
  const contents=[...f.moving.children],tabs=[...f.moving.tabs],attributes=[...f.moving.attributes];
  assert.equal(a.move(f.moving,f.child),true);
  assert.equal(f.moving.group,f.child);
  assert.deepEqual(f.child.groupContainer.children,position==='top'
    ?[f.placeholder,f.moving,f.last,f.end]:[f.placeholder,f.last,f.end,f.moving]);
  assert.deepEqual(f.moving.children,contents);assert.deepEqual(f.moving.tabs,tabs);
  assert.deepEqual([...f.moving.attributes],attributes);
  assert.equal(f.moving.collapsed,true);assert.equal(f.nested.collapsed,true);
  assert.equal(f.child.collapsed,false);assert.equal(f.parent.collapsed,true);
});

test('moving into an empty native folder uses its placeholder without escaping to its parent',()=>{
  const f=fixture(),a=adapters(f);f.last.remove();f.end.remove();
  assert.equal(a.move(f.moving,f.child),true);
  assert.deepEqual(f.child.groupContainer.children,[f.placeholder,f.moving]);
});

test('destinations exclude self, descendants, live folders, other Spaces and unsafe nesting depth',()=>{
  const f=fixture(),a=adapters(f);
  assert.deepEqual(a.listDestinations(f.moving),[f.parent,f.child]);
  for(const target of [f.moving,f.nested])assert.equal(a.move(f.moving,target),false);
  f.child.isLiveFolder=true;assert.equal(a.canMove(f.moving,f.child),false);f.child.isLiveFolder=false;
  f.child.setAttribute('zen-workspace-id','other');assert.equal(a.canMove(f.moving,f.child),false);f.child.setAttribute('zen-workspace-id','active');
  f.host.Services.prefs.getIntPref=()=>3;
  assert.equal(a.canMove(f.moving,f.parent),true,'root0 + destination child1 + nested2 fits');
  assert.equal(a.canMove(f.moving,f.child),false,'nested descendant would reach forbidden level3');
  f.moving.isLiveFolder=true;assert.deepEqual(a.listDestinations(f.moving),[]);
});

test('command-time checks reject removed, foreign-window, changed-Space and native-refused destinations',()=>{
  for(const kind of ['removed','foreign','workspace','native']) {
    const f=fixture(),a=adapters(f);assert.equal(a.canMove(f.moving,f.child),true);
    if(kind==='removed')f.child.remove();
    if(kind==='foreign')f.child.ownerDocument={};
    if(kind==='workspace')f.host.gZenWorkspaces.activeWorkspace='other';
    if(kind==='native')f.host.gZenFolders.canDropElement=()=>false;
    const old=f.moving.parentElement;
    assert.equal(a.move(f.moving,f.child),false,kind);assert.equal(f.moving.parentElement,old);
  }
});

test('missing native receiver or missing empty-folder anchor fails closed',()=>{
  const f=fixture(),a=adapters(f);f.child.groupContainer.children.slice().forEach(node=>node.remove());
  assert.equal(a.move(f.moving,f.child),false);
  f.host.gBrowser.moveTabBefore=undefined;f.host.gBrowser.moveTabAfter=undefined;
  assert.equal(a.move(f.moving,f.parent),false);
});

test('moved-folder position is independently stored and defaults safely',()=>{
  assert.equal(api.PREFERENCE_DEFINITIONS.movedFolderPosition?.defaultValue,'bottom');
  const f=fixture(),a=adapters(f);f.setPosition('unexpected');
  assert.equal(a.move(f.moving,f.child),true);
  assert.equal(f.child.groupContainer.children.at(-1),f.moving);
});

for(const position of ['top','bottom']) test(`Move Folder respects a native split group at the ${position} edge`,()=>{
  const f=fixture(),a=adapters(f);f.setPosition(position);
  f.host.gBrowser.isTabGroup=node=>node?.isZenFolder || node?.localName==='tab-group';
  const split=f.own(new DropNode('tab-group','split'));split.setAttribute('split-view-group','true');
  Object.defineProperty(split,'pinned',{value:undefined}); // ordinary tab-group has no Zen-folder pinned getter
  const splitTab=f.own(new DropNode('tab','split-tab'));splitTab.setAttribute('pinned','true');split.appendChild(splitTab);
  Object.defineProperty(splitTab,'group',{get:()=>split});
  const container=f.child.groupContainer;
  container.insertBefore(split,position==='top'?f.last:null);
  assert.equal(a.move(f.moving,f.child),true);
  const real=container.children.filter(item=>!item.hasAttribute('zen-empty-tab'));
  assert.equal((position==='top'?real[0]:real.at(-1)).id,f.moving.id);
});

test('unknown real children refuse a move rather than silently corrupt top/bottom placement',()=>{
  const f=fixture(),a=adapters(f),unknown=f.own(new DropNode('future-tab-wrapper'));
  f.child.groupContainer.appendChild(unknown);
  assert.equal(a.canMove(f.moving,f.child),false);
  assert.equal(a.move(f.moving,f.child),false);
});

test('departure cleanup never treats an existing split group or unknown wrapper as an empty folder',()=>{
  const f=fixture(),removed=[];
  f.host.gBrowser.removeTabGroup=folder=>removed.push(folder);
  const a=api.createBrowserEmptyFolderAdapters(f.host,new api.FolderPopulationRegistry());
  for(const name of ['tab-group','future-tab-wrapper']) {
    f.child.groupContainer.children.slice().forEach(node=>node.remove());
    const child=f.own(new DropNode(name));f.child.groupContainer.appendChild(child);
    assert.equal(a.realChildren(f.child).length,1);
    a.deleteFolder(f.child);assert.equal(removed.length,0);
  }
});

test('synchronous grouping events retain collapse states and hold empty ancestors until native move returns',async()=>{
  const f=fixture(),registry=new api.FolderPopulationRegistry();
  const old=f.addFolder('Old',f.pins,0,0);old.groupContainer.appendChild(f.moving);old.collapsed=true;
  const removed=[],events=[];
  f.host.gBrowser.removeTabGroup=folder=>{removed.push(folder);folder.remove();};
  const cleanup=new api.EmptyRegularFolderManager(api.createBrowserEmptyFolderAdapters(f.host,registry),registry);
  cleanup.start();
  const a=api.createBrowserFolderMoveAdapters(f.host,f.prefs,registry),container=f.child.groupContainer;
  f.child.collapsed=true;
  const insert=container.insertBefore.bind(container);
  container.insertBefore=(node,anchor)=>{
    const result=insert(node,anchor);
    // Model native custom-element reconnection and the synchronous movement
    // notifications. The installed receiver body still supplies placement.
    for(const [type,target] of [['FolderUngrouped',old],['FolderGrouped',f.child],['TabMove',f.tab],['TabGroupMoved',f.moving]]) {
      events.push(type);
      for(const held of [old,f.moving,f.nested,f.child,f.parent])assert.equal(registry.isHeld(held),true,type);
      if(type==='FolderGrouped')f.child.collapsed=false;
      f.host.fire({type,target,detail:f.moving},false);
      if(type==='FolderUngrouped')void cleanup.reconcile();
      assert.deepEqual(removed,[],'departure cleanup cannot delete while native receiver is running');
    }
    return result;
  };
  try {
    assert.equal(a.move(f.moving,f.child),true);
    assert.deepEqual(events,['FolderUngrouped','FolderGrouped','TabMove','TabGroupMoved']);
    assert.equal(f.child.collapsed,true,'restore native expansion');
    assert.equal(f.moving.collapsed,true);assert.equal(f.nested.collapsed,true);assert.equal(f.parent.collapsed,true);
    for(const held of [old,f.moving,f.nested,f.child,f.parent])assert.equal(registry.isHeld(held),false);
    for(let n=0;n<8;n++)await Promise.resolve();
    await cleanup.reconcile();
    assert.deepEqual(removed.map(node=>node.id),[old.id],'empty old parent is reconciled after holds release');
    assert.equal(f.moving.isConnected,true);assert.equal(f.child.isConnected,true);
  }finally{cleanup.destroy();}
});
