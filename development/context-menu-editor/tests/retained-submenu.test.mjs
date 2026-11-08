import test from 'node:test';
import assert from 'node:assert/strict';
import {makeDOM} from './dom.mjs';
import {createMenuController} from '../src/controller.mjs';
import {createState,mergeInventory,addSubmenu,moveItem} from '../src/model.mjs';

const tick=()=>new Promise(resolve=>setTimeout(resolve,0));

function fixture(t,{nested=false}={}){
 const dom=makeDOM('<menupopup id="contentAreaContextMenu"><menuitem id="a" label="Owner A"></menuitem><menuitem id="b" label="Owner B"></menuitem></menupopup>');
 const w=dom.window,root=w.document.getElementById('contentAreaContextMenu'),original=[...root.children];
 let state=createState();
 const controller=createMenuController(w,{getState:()=>state});
 const inventory=controller.getInventory()[0].items;
 state=mergeInventory(state,root.id,inventory);
 state=addSubmenu(state,root.id,'Tools',null,0,'tools');
 if(nested)state=addSubmenu(state,root.id,'Nested tools','tools',0,'nested-tools');
 state=moveItem(state,root.id,'a',nested?'nested-tools':'tools',0,inventory);
 t.after(()=>{controller.destroy();dom.window.close();});
 return {w,root,original,controller,get state(){return state;},set state(value){state=value;},
  show(){root.dispatchEvent(new w.Event('popupshowing',{bubbles:true}));return tick();},
  close(){root.dispatchEvent(new w.Event('popuphiding',{bubbles:true}));},
  menu(label='Tools'){return root.querySelector(`menu[label="${label}"]`);}};
}

test('disabling during an open custom submenu removes every retained widget and restores owner rows',async t=>{
 const f=fixture(t);await f.show();assert.ok(f.menu());
 f.state={...f.state,options:{...f.state.options,enabled:false}};f.controller.refresh();
 assert.deepEqual([...f.root.children],f.original);
 assert.equal(f.root.querySelector('[data-cme-owned],[data-cme-item],[data-cme-icon],.cme-decoration'),null);
 assert.equal(f.root.hasAttribute('data-cme-root'),false);
});

test('Gecko menu presentation children stay with a retained widget and do not leak on close',async t=>{
 const f=fixture(t);await f.show();const menu=f.menu(),popup=menu.querySelector('menupopup');
 // Installed Gecko menu.js renders these light-DOM children into every menu.
 // They belong to the widget rather than being newly inserted owner commands.
 const icon=f.w.document.createElement('img');icon.className='menu-icon';
 const label=f.w.document.createElement('label');label.className='menu-text';
 const accel=f.w.document.createElement('label');accel.className='menu-accel';
 menu.prepend(icon,label,accel);await tick();await tick();
 assert.equal(f.menu(),menu);assert.equal(popup.parentNode,menu);
 assert.equal(icon.parentNode,menu);assert.equal(label.parentNode,menu);assert.equal(accel.parentNode,menu);
 f.close();assert.deepEqual([...f.root.children],f.original);
 assert.equal(f.root.querySelector('.menu-icon,.menu-text,.menu-accel,[data-cme-owned]'),null);
});

test('nested custom widget identity and topology survive native owner label writes',async t=>{
 const f=fixture(t,{nested:true});await f.show();
 const outer=f.menu(),inner=f.menu('Nested tools'),outerPopup=outer.querySelector('menupopup'),innerPopup=inner.querySelector('menupopup');
 inner.setAttribute('open','true');f.original[0].setAttribute('label','Owner changed');await tick();await tick();
 assert.equal(f.menu(),outer);assert.equal(f.menu('Nested tools'),inner);
 assert.equal(inner.parentNode,outerPopup);assert.equal(innerPopup.parentNode,inner);assert.equal(f.original[0].parentNode,innerPopup);
 f.close();assert.deepEqual([...f.root.children],f.original);assert.equal(f.original[0].getAttribute('label'),'Owner changed');
 assert.equal(f.root.querySelector('[data-cme-owned]'),null);
});

test('removing a retained submenu preserves a foreign command while releasing stale widgets',async t=>{
 const f=fixture(t);await f.show();const menu=f.menu(),popup=menu.querySelector('menupopup');
 const foreign=f.w.document.createElement('menuitem');foreign.id='owner-late';foreign.setAttribute('label','Owner late');popup.append(foreign);
 await tick();f.state={...f.state,roots:{...f.state.roots,[f.root.id]:{children:['a','b'],records:{a:{kind:'command'},b:{kind:'command'}}}}};
 f.controller.refresh();await tick();
 assert.equal(foreign.parentNode,f.root);assert.equal(menu.isConnected,false);
 assert.equal(f.root.querySelector('[data-cme-owned]'),null);f.close();
 assert.deepEqual([...f.root.children].filter(node=>node!==foreign),f.original);
});

test('owner label writes do not detach unchanged native ancestry around a retained custom popup',async t=>{
 const dom=makeDOM('<menupopup id="contentAreaContextMenu"><menu id="native" label="Native"><menupopup id="native-popup"><menuitem id="a" label="Owner A"></menuitem></menupopup></menu><menuitem id="b" label="Owner B"></menuitem></menupopup>');
 const w=dom.window,root=w.document.getElementById('contentAreaContextMenu'),native=w.document.getElementById('native'),nativePopup=w.document.getElementById('native-popup'),item=w.document.getElementById('a');
 let state=createState();const controller=createMenuController(w,{getState:()=>state});
 const inventory=controller.getInventory()[0].items;
 state=mergeInventory(state,root.id,inventory);state=addSubmenu(state,root.id,'Tools','native',0,'tools');state=moveItem(state,root.id,'a','tools',0,inventory);
 root.dispatchEvent(new w.Event('popupshowing',{bubbles:true}));await tick();
 const menu=root.querySelector('menu[data-cme-owned]'),popup=menu.querySelector('menupopup'),removals=[];
 const observer=new w.MutationObserver(records=>{
  for(const record of records)for(const node of record.removedNodes)if([native,nativePopup,menu,popup].includes(node))removals.push(node);
 });
 observer.observe(root,{childList:true,subtree:true});
 t.after(()=>{observer.disconnect();controller.destroy();dom.window.close();});
 item.setAttribute('label','Owner updated');await tick();await tick();
 assert.deepEqual(removals,[],'no unchanged widget in the active ancestry may be removed and reinserted');
 assert.equal(native.parentNode,root);assert.equal(menu.parentNode,nativePopup);assert.equal(popup.parentNode,menu);assert.equal(item.parentNode,popup);
});

for(const position of ['append','prepend','before-b'])test(`late owner ${position} keeps its owner insertion position after closing the overlay`,async t=>{
 const f=fixture(t);await f.show();
 const foreign=f.w.document.createElement('menuitem');foreign.id='late';foreign.setAttribute('label','Late owner row');
 if(position==='append')f.root.append(foreign);
 else if(position==='prepend')f.root.prepend(foreign);
 else f.root.insertBefore(foreign,f.original[1]);
 await tick();await tick();f.close();
 const expected=position==='append'?['a','b','late']:position==='prepend'?['late','a','b']:['a','late','b'];
 assert.deepEqual([...f.root.children].map(node=>node.id),expected);
 assert.equal(f.root.querySelector('[data-cme-owned]'),null);
});
