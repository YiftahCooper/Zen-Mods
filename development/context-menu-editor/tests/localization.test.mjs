import test from 'node:test';
import assert from 'node:assert/strict';
import {makeDOM} from './dom.mjs';
import {createMenuController} from '../src/controller.mjs';
import {createState,mergeInventory,addSubmenu,moveItem,updateItem} from '../src/model.mjs';
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));

test('temporary navigation and renamed labels are protected from localization while open and restored on close',async()=>{
 const dom=makeDOM('<menupopup id="contentAreaContextMenu"><menugroup id="context-navigation"><menuitem id="context-back" data-l10n-id="navigation-back" aria-label="Back"></menuitem></menugroup><menuitem id="copy" data-l10n-id="menu-copy" label="Copy"></menuitem></menupopup>');
 const w=dom.window,root=w.document.querySelector('menupopup'),copy=w.document.getElementById('copy'),back=w.document.getElementById('context-back');
 // Fluent owns the declared localized attributes. This narrow model represents
 // the native failure: moving a localized node or editing its label queues a
 // translation that removes/rewrites an undeclared temporary label.
 const localizer=new w.MutationObserver(records=>{
  for(const node of [copy,back])if(node.hasAttribute('data-l10n-id')&&records.some(record=>record.target===node||[...record.addedNodes||[]].includes(node))){
   if(node===back&&node.hasAttribute('label'))node.removeAttribute('label');
   if(node===copy&&node.getAttribute('label')!=='Copy')node.setAttribute('label','Copy');
  }
 });localizer.observe(root,{attributes:true,childList:true,subtree:true});
 let state=createState();const controller=createMenuController(w,{getState:()=>state,resolveIcon:()=>({type:'text',text:'★'})});
 const items=controller.getInventory()[0].items;state=mergeInventory(state,root.id,items);state=addSubmenu(state,root.id,'Tools',null,0,'tools');state=moveItem(state,root.id,'copy','tools',0,items);state=updateItem(state,root.id,'copy',{name:'Copy mine'});
 root.dispatchEvent(new w.Event('popupshowing',{bubbles:true}));await tick();await tick();
 assert.equal(copy.getAttribute('label'),'Copy mine');assert.equal(back.getAttribute('label'),'Back');
 assert.equal(copy.hasAttribute('data-l10n-id'),false);assert.equal(back.hasAttribute('data-l10n-id'),false);
 assert.ok(root.querySelector('[data-cme-owned]'));
 root.dispatchEvent(new w.Event('popuphiding',{bubbles:true}));await tick();
 assert.equal(copy.getAttribute('data-l10n-id'),'menu-copy');assert.equal(copy.getAttribute('label'),'Copy');assert.equal(back.getAttribute('data-l10n-id'),'navigation-back');assert.equal(back.hasAttribute('label'),false);
 controller.destroy();localizer.disconnect();dom.window.close();
});
test('asynchronous native label presentation does not rebuild an active custom popup',async()=>{
 const dom=makeDOM('<menupopup id="tabContextMenu"><menuitem id="a" label="Owner"><label class="menu-text"></label></menuitem></menupopup>');
 const w=dom.window,root=w.document.querySelector('menupopup'),a=w.document.getElementById('a'),label=a.querySelector('label');
 let state=createState();const controller=createMenuController(w,{getState:()=>state,resolveIcon:()=>({type:'text',text:'★'})});
 const items=controller.getInventory()[0].items;state=mergeInventory(state,root.id,items);state=addSubmenu(state,root.id,'Tools',null,0,'tools');state=moveItem(state,root.id,'a','tools',0,items);
 root.dispatchEvent(new w.Event('popupshowing',{bubbles:true}));await tick();const decoration=a.querySelector('.cme-decoration');
 label.setAttribute('value','Owner');label.replaceChildren(w.document.createTextNode('Owner'));await tick();
 assert.equal(a.querySelector('.cme-decoration'),decoration,'derived label rendering must not trigger overlay reconciliation');
 controller.destroy();dom.window.close();
});
