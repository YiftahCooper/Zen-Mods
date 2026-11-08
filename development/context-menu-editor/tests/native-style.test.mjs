import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {makeDOM} from './dom.mjs';
import {createMenuController} from '../src/controller.mjs';
import {createState,mergeInventory,addSubmenu,moveItem} from '../src/model.mjs';

const stylesheet=await readFile(new URL('../style.css',import.meta.url),'utf8');
// Installed Gecko 157 menu.js uses light-DOM .menu-icon/.menu-text children.
// Its menu.css paints the status glyph in that same native .menu-icon slot.
// This fixture verifies our selectors and ownership only, not XUL painting.
function fixture(){
 const dom=makeDOM(`<style>.menu-icon,.menu-iconic-icon{visibility:visible}</style><style>${stylesheet}</style>
 <menupopup data-cme-root="tabContextMenu">
  <menuitem id="current" data-cme-item="true" data-cme-icons="on"><img class="menu-icon"><label class="menu-text">Copy</label><span class="cme-decoration">★</span></menuitem>
  <menuitem id="off" data-cme-item="true" data-cme-icons="off"><img class="menu-icon"></menuitem>
  <menuitem id="check" data-cme-item="true" data-cme-icons="on" type="checkbox" checked="true"><img class="menu-icon"></menuitem>
  <menuitem id="radio" data-cme-item="true" data-cme-icons="off" type="radio" checked="true"><img class="menu-icon"></menuitem>
  <menuitem id="legacy" data-cme-item="true" data-cme-icons="on"><img class="menu-iconic-icon"></menuitem>
 </menupopup>
 <menupopup><menuitem id="untouched"><img class="menu-icon"></menuitem></menupopup>`);
 return dom;
}
test('current Gecko decorative owner icons are suppressed for either icon switch',()=>{
 const dom=fixture(),style=id=>dom.window.getComputedStyle(dom.window.document.querySelector(`#${id} .menu-icon`));
 assert.equal(style('current').visibility,'hidden');assert.equal(style('off').visibility,'hidden');
 assert.equal(dom.window.getComputedStyle(dom.window.document.querySelector('.cme-decoration')).visibility,'visible');
 dom.window.close();
});
test('current native check and radio slots remain visible and unrelated menus stay untouched',()=>{
 const dom=fixture(),style=id=>dom.window.getComputedStyle(dom.window.document.querySelector(`#${id} .menu-icon`));
 assert.equal(style('check').visibility,'visible');assert.equal(style('radio').visibility,'visible');
 assert.equal(style('untouched').visibility,'visible');dom.window.close();
});
test('legacy decorative icon markup remains supported',()=>{
 const dom=fixture();assert.equal(dom.window.getComputedStyle(dom.window.document.querySelector('#legacy .menu-iconic-icon')).visibility,'hidden');dom.window.close();
});
test('custom native popups reserve Gecko check and radio status slots',async()=>{
 const dom=makeDOM('<menupopup id="tabContextMenu"><menuitem id="native-check" label="Check" type="checkbox" checked="true"></menuitem></menupopup>');
 let state=createState();const controller=createMenuController(dom.window,{getState:()=>state});
 const inventory=controller.getInventory()[0];state=mergeInventory(state,inventory.id,inventory.items);
 state=addSubmenu(state,inventory.id,'Tools',null,0,'tools');state=moveItem(state,inventory.id,'native-check','tools',0,inventory.items);
 const root=dom.window.document.getElementById('tabContextMenu');root.dispatchEvent(new dom.window.Event('popupshowing',{bubbles:true}));
 await new Promise(resolve=>setTimeout(resolve,0));
 assert.equal(root.querySelector('menu[data-cme-owned] > menupopup').getAttribute('needsgutter'),'true');
 controller.destroy();dom.window.close();
});
