import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Presentation} from '../src/presentation.mjs';
import {ownMethod,restoreOwned} from '../src/state.mjs';

for(const laterOwner of [false,true])test(`folder unload returns to native handling outside supported scope (later owner=${laterOwner})`,()=>{
 let supported=true,native=0,pure=0;
 const folder={tabs:[],unloadAllTabs(){native++;}};
 const c={host:{gBrowser:{explicitUnloadTabs(){pure++;}},gZenWorkspaces:{allStoredTabs:[]},document:{querySelectorAll:()=>[folder]}},supportedTree:()=>supported,zones:{layout(){}}};
 const p=new Presentation(c);p.active=true;p.refresh();folder.unloadAllTabs();assert.equal(pure,1);
 const later=laterOwner?ownMethod(folder,'unloadAllTabs',(_,original)=>original()):null;
 supported=false;p.refresh();folder.unloadAllTabs();assert.equal(native,1);assert.equal(pure,1);
 if(later)restoreOwned(later);p.destroy();
});

function element(localName,id='') {
 const attrs=new Map();
 return {localName,id,hidden:false,isConnected:true,children:[],classList:{add(){}},
  setAttribute:(key,value)=>attrs.set(key,String(value)),
  getAttribute:key=>attrs.get(key)??null,
  hasAttribute:key=>attrs.has(key),removeAttribute:key=>attrs.delete(key),
  addEventListener(){},querySelector(){return null;},closest(){return null;},
  appendChild(child){this.children.push(child);child.parentNode=this;},
  remove(){if(this.parentNode)this.parentNode.children=this.parentNode.children.filter(child=>child!==this);},
 };
}

function refreshFixture() {
 const tab=element('tab'),tabs=[tab];let supported=true;
 const c={host:{gZenWorkspaces:{allStoredTabs:tabs},document:{querySelectorAll:()=>[]}},
  supported:node=>node===tab&&supported&&node.isConnected,
  store:{read:()=>({status:'known',explicit:false})},zones:{layout(){}},
 };
 const p=new Presentation(c);p.active=true;
 return {p,tab,tabs,unsupported(){supported=false;},supported(){supported=true;}};
}

test('a tab leaving the supported scope loses the Close/reset styling marker',()=>{
 const f=refreshFixture();f.p.refresh();assert.equal(f.tab.hasAttribute('better-pins-tab'),true);
 f.unsupported();f.p.refresh();
 assert.equal(f.tab.hasAttribute('better-pins-tab'),false);
 assert.equal(f.p.managedTabs.has(f.tab),false);
 f.supported();f.p.refresh();assert.equal(f.tab.hasAttribute('better-pins-tab'),true);
});

test('refresh releases styling markers from disconnected tabs no longer collected by Zen',()=>{
 const f=refreshFixture();f.p.refresh();
 f.tab.isConnected=false;f.tabs.length=0;f.p.refresh();
 assert.equal(f.tab.hasAttribute('better-pins-tab'),false);
 assert.equal(f.p.managedTabs.has(f.tab),false);
});

test('reconciling a departed tab keeps supported tabs marked',()=>{
 const f=refreshFixture(),departed=element('tab');
 departed.setAttribute('better-pins-tab','true');f.p.managedTabs=new Set([departed]);
 f.p.refresh();
 assert.equal(departed.hasAttribute('better-pins-tab'),false);
 assert.equal(f.tab.hasAttribute('better-pins-tab'),true);
});

function menuFixture(folderMenu,initialHidden=false) {
 const target=element(folderMenu?'zen-folder':'tab');target.isZenFolder=folderMenu;
 const menu=element('menupopup'),native=element('menuitem',folderMenu?'context_zenFolderUnloadAll':'context_unloadTab');
 native.hidden=initialHidden;menu.appendChild(native);let supported=true;
 const c={host:{document:{getElementById:id=>id===native.id?native:null,createXULElement:element},TabContextMenu:{contextTab:target}},
  supported:()=>supported,supportedTree:()=>supported,pref:()=>false,
  store:{read:()=>({explicit:false})},policy:{blocked:()=>false},
 };
 const p=new Presentation(c);p.menu=menu;p.folderMenu=menu;
 if(folderMenu)p.folderContext=target;
 return {p,menu,native,target,unsupported(){supported=false;},show(){p.showMenu(folderMenu);}};
}

for(const initialHidden of [false,true])test(`multiselection keeps only native unload with its hidden=${initialHidden} state`,()=>{
 const f=menuFixture(false,initialHidden);f.target.multiselected=true;f.show();
 assert.equal(f.native.hidden,initialHidden,'native bulk unload availability must be preserved');
 assert.deepEqual(f.menu.children.filter(n=>n===f.native||n.getAttribute('label')==='Unload Tab'),[f.native]);
 for(const label of ['Pin URL','Reset to Pinned URL','Use Current Page as Pinned URL','Edit Pinned URL…'])
  assert.equal(f.p.commands.find(n=>n.getAttribute('label')===label)?.disabled,true,label);
 f.p.restoreMenu();assert.equal(f.native.hidden,initialHidden);
});

for(const folderMenu of [false,true]) {
 const scope=folderMenu?'folder':'tab',replacement=folderMenu?'Unload Folder Tabs':'Unload Tab';
 for(const initialHidden of [false,true])test(`${scope} menu replaces native unload and restores its prior hidden=${initialHidden} value`,()=>{
  const f=menuFixture(folderMenu,initialHidden);f.show();
  assert.equal(f.native.hidden,true,'the native unload entry must not duplicate the replacement');
  assert.equal(f.menu.children.filter(n=>!n.hidden&&n.getAttribute('label')===replacement).length,1);
  f.p.restoreMenu();
  assert.equal(f.native.hidden,initialHidden);
  assert.deepEqual(f.menu.children,[f.native]);
 });
 test(`unsupported ${scope} menu keeps native unload and removes prior replacements`,()=>{
  const f=menuFixture(folderMenu);f.show();f.unsupported();f.show();
  assert.equal(f.native.hidden,false);
  assert.deepEqual(f.menu.children,[f.native]);
 });
}
