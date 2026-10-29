import test from 'node:test';
import assert from 'node:assert/strict';
import {FolderPinPresentation} from '../scripts/better-zen-folders.uc.mjs';
import * as api from '../scripts/better-zen-folders.uc.mjs';
import {FakeElement, FakeEventTarget, FakeMutationObserver} from './fakes.mjs';

function fixture(scope='regular-folder') {
 const elements=[];
 const node=name=>{
  const item=new FakeElement(name),styles=new Map();elements.push(item);
  item.classList.remove=(...names)=>names.forEach(n=>item._classes.delete(n));
  item.hasAttribute=n=>item.attributes.has(n);
  item.style={setProperty:(n,v)=>styles.set(n,v),removeProperty:n=>styles.delete(n),getPropertyValue:n=>styles.get(n)??'',getPropertyPriority:()=>''};
  item.toggleAttribute=(n,v)=>v?item.setAttribute(n,''):item.removeAttribute(n);
  return item;
 };
 const menu=node('menupopup');menu.id='tabContextMenu';
 for(const id of ['context_pinTab','context_unpinTab','context_unloadTab','context_zen-reset-pinned-tab','context_zen-edit-pinned-page']){
  const item=node('menuitem');item.id=id;item.hidden=false;menu.appendChild(item);
 }
 const tab=node('tab');tab.id='one';tab.scope=scope;tab.pinned=true;tab.explicit=true;
 const content=node('div');content.setAttribute('class','tab-content');tab.appendChild(content);
 const calls=[],subscriptions=new Map(),prefs=new Map([['commandIconMode','mod'],['showRootPinBadge',false]]);
 const host={document:{createXULElement:node,createElementNS:(ns,name)=>node(name),getElementById:id=>elements.find(n=>n.id===id)},
  TabContextMenu:{contextTab:tab},gBrowser:{tabs:[tab],selectedTabs:[tab],unpinTab:t=>{calls.push(['unpin-root',t]);t.pinned=false;}}};
 const a={classify:t=>t?.scope,reportError:e=>{throw e;},getId:t=>t.id};
 const policy={adapters:a,blocked:()=>null,unpin:async t=>{calls.push(['unpin-url',t]);return {ok:true};}};
 const preferences={get:n=>prefs.get(n),subscribe:(n,f)=>{subscriptions.set(n,f);return ()=>subscriptions.delete(n);}};
 const manager=new FolderPinPresentation(host,preferences,{read:t=>({status:'known',explicit:t.explicit})},policy);
 manager.active=true;manager.menu=menu;
 return {host,tab,manager,calls,prefs,subscriptions,preferences,get:id=>host.document.getElementById(id)};
}

test('folder URL commands share one pinned submenu, distinct icons, and one native Unload',()=>{
 const f=fixture();f.manager.showMenu();
 const submenu=f.get('better-zen-folders-url-pin-menu');
 assert.ok(submenu,'URL commands need a submenu');assert.equal(submenu.localName,'menu');
 assert.equal(submenu.getAttribute('label'),'Pinned URL');assert.equal(submenu.parentNode,f.manager.menu);
 const commands=['pin-url','reset-url','edit-url','update-url'].map(n=>f.get(`better-zen-folders-${n}`));
 for(const command of commands)assert.equal(command.parentNode.parentNode,submenu);
 assert.equal(commands[0].getAttribute('image'),submenu.getAttribute('image'));
 assert.equal(new Set(commands.map(n=>n.getAttribute('image'))).size,4);
 assert.equal(f.get('better-zen-folders-unload-tab'),undefined);assert.equal(f.get('context_unloadTab').hidden,false);
 f.tab.scope='root';f.manager.showMenu();assert.equal(submenu.hidden,true);assert.equal(f.get('context_unpinTab').hidden,false);
});

test('native root Unpin context command receives a pin icon and keeps native command ownership',()=>{
 const f=fixture('root'),item=f.get('context_unpinTab');item.setAttribute('command','cmd_unpinTab');
 f.tab.isConnected=true;const roots=new api.FolderPinRootIntegration(f.host,f.preferences);roots.active=true;
 roots.showMenu();assert.ok(item.getAttribute('image'));assert.equal(item.getAttribute('command'),'cmd_unpinTab');
 roots.restoreMenu();assert.equal(item.getAttribute('image'),null);
 item.setAttribute('image','external.svg');roots.showMenu();assert.equal(item.getAttribute('image'),'external.svg');
});

test('optional native root badge delegates Unpin to native placement and never closes the tab',async()=>{
 const f=fixture('root');f.tab.isConnected=true;
 assert.equal(typeof api.FolderPinRootIntegration,'function');
 const root=new api.FolderPinRootIntegration(f.host,f.preferences);root.active=true;
 root.refresh();assert.equal(root.buttons.size,0,'root badges are opt-in');
 f.prefs.set('showRootPinBadge',true);root.refresh();assert.equal(root.buttons.size,1);
 const result=await root.unpin(f.tab);assert.deepEqual(result,{ok:true});
 assert.deepEqual(f.calls,[['unpin-root',f.tab]]);assert.equal(f.tab.isConnected,true);assert.equal(f.tab.pinned,false);
 root.refresh();assert.equal(root.buttons.size,0);
});

test('native root badge excludes essentials and folders and reports native refusal',async()=>{
 const f=fixture('root');f.tab.isConnected=true;f.prefs.set('showRootPinBadge',true);
 assert.equal(typeof api.FolderPinRootIntegration,'function');
 const root=new api.FolderPinRootIntegration(f.host,f.preferences);root.active=true;
 f.tab.setAttribute('zen-essential','true');root.refresh();assert.equal(root.buttons.size,0);
 f.tab.removeAttribute('zen-essential');f.tab.scope='regular-folder';
 f.tab.closest=selector=>selector==='zen-folder'?{}:null;root.refresh();assert.equal(root.buttons.size,0);
 f.tab.closest=()=>null;f.tab.scope='root';f.host.gBrowser.unpinTab=()=>{};
 assert.deepEqual(await root.unpin(f.tab),{ok:false,reason:'native-unpin-refused'});
 assert.equal(f.tab.pinned,true);assert.equal(f.tab.isConnected,true);
});

test('root badge preference changes apply live and teardown releases only owned UI',()=>{
 const f=fixture('root'),events=new FakeEventTarget();f.tab.isConnected=true;
 f.host.addEventListener=events.addEventListener.bind(events);f.host.removeEventListener=events.removeEventListener.bind(events);
 f.host.MutationObserver=FakeMutationObserver;f.host.gBrowser.tabContainer=f.manager.menu;
 const roots=new api.FolderPinRootIntegration(f.host,f.preferences);roots.start();
 assert.equal(roots.buttons.size,0);
 f.prefs.set('showRootPinBadge',true);f.subscriptions.get('showRootPinBadge')();
 assert.equal(roots.buttons.size,1);const button=roots.buttons.get(f.tab);
 const gesture={target:{closest:()=>button},type:'click',button:0,preventDefault(){},stopImmediatePropagation(){}};
 roots.onGesture(gesture);assert.equal(f.tab.pinned,false);assert.equal(f.calls.length,1);
 roots.onGesture(gesture);assert.equal(f.calls.length,1,'a stale button cannot unpin again');
 roots.destroy();assert.equal(f.subscriptions.size,0);assert.equal(roots.buttons.size,0);
 for(const listeners of events.listeners.values())assert.equal(listeners.size,0);
});
