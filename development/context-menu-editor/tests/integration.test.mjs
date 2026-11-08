import test from 'node:test';
import assert from 'node:assert/strict';
import {makeDOM} from './dom.mjs';
import {createStore} from '../src/store.mjs';
let bridgeAPI,entryAPI;
try{bridgeAPI=await import('../src/sine-settings.mjs');}catch{}
try{entryAPI=await import('../src/entry.mjs');}catch{}
function preferences() {
 const data=new Map(),observers=new Set();
 return {getStringPref:(key,fallback='')=>data.get(key)??fallback,setStringPref(key,value){data.set(key,value);for(const observer of observers)observer.observe(null,'nsPref:changed',key);},addObserver(_key,observer){observers.add(observer);},removeObserver(_key,observer){observers.delete(observer);}};
}
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
test('Sine dialog rebuild remounts once and closing cancels drafts without saving',async()=>{
 assert.ok(bridgeAPI,'The Sine settings bridge must exist.');
 const dom=makeDOM('<div mod-id="context-menu-editor"><button class="sineItemConfigureButton"></button><dialog><div class="sineItemPreferenceDialogContent"></div></dialog></div>');
 let mounts=0,destroys=0,resets=0;
 const options={store:{},registry:{},icons:{},createUI(window){mounts++;const element=window.document.createElement('section');return {element,destroy(){destroys++;element.remove();},reset(){resets++;},refresh(){}};}};
 const bridge=bridgeAPI.createSineSettingsBridge(dom.window,options);
 assert.equal(mounts,1);
 const dialog=dom.window.document.querySelector('dialog');dialog.dispatchEvent(new dom.window.Event('close'));assert.equal(resets,1);
 const old=dom.window.document.querySelector('.sineItemPreferenceDialogContent'),next=old.cloneNode(false);old.replaceWith(next);await tick();
 assert.equal(mounts,2);assert.equal(destroys,1);assert.equal(next.children.length,1);
 bridge.destroy();await tick();assert.equal(destroys,2);assert.equal(next.children.length,0);dom.window.close();
});
test('browser entry reload leaves one original-node controller and releases observers on unload',async()=>{
 assert.ok(entryAPI,'The packaged browser entry must exist.');
 const dom=makeDOM('<menupopup id="contentAreaContextMenu"><menuitem id="context-copy" label="Copy"></menuitem></menupopup>');
 dom.reconfigure({url:'chrome://browser/content/browser.xhtml'});
 const prefs=preferences(),services={prefs};
 const first=entryAPI.startContextMenuEditor(dom.window,{Services:services});
 const second=entryAPI.startContextMenuEditor(dom.window,{Services:services});
 assert.equal(first.disposed,true);assert.equal(dom.window.__contextMenuEditor,second);
 const popup=dom.window.document.getElementById('contentAreaContextMenu');
 popup.dispatchEvent(new dom.window.Event('popupshowing',{bubbles:true,cancelable:true}));await tick();
 assert.equal(popup.querySelectorAll('#context-copy').length,1);assert.ok(second.controller.getInventory()[0].items.some(item=>item.key==='context-copy'));
 second.unload();await tick();assert.equal(dom.window.__contextMenuEditor,undefined);assert.equal(popup.querySelectorAll('[data-cme-owned]').length,0);
 dom.window.close();
});
