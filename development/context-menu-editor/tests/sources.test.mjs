import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from './dom.mjs';
let api={};try{api=await import('../src/sources.mjs');}catch{}
const mods={alpha:{id:'alpha',name:'Alpha Tools'},beta:{id:'beta',name:'Beta Menu'}};
function fixture(t){
 assert.equal(typeof api.createSourceTracker,'function','Source attribution must be implemented');
 const dom=new JSDOM('<menupopup id="contentAreaContextMenu"></menupopup>',{url:'chrome://browser/content/browser.xhtml',runScripts:'outside-only'});
 const w=dom.window;w.document.createXULElement=name=>w.document.createElement(name);
 const locations=new WeakMap(),listeners=new WeakMap();
 const tracker=api.createSourceTracker(w,{initialMods:mods,listenerInfo:node=>listeners.get(node)||[],functionLocation:fn=>locations.get(fn),builtInIds:new Set(['context-copy'])});
 t.after(()=>{tracker.destroy();w.close();});
 return{w,tracker,locations,listeners};
}
test('late creation identifies an unfamiliar mod submenu and command from their real creation stack',t=>{
 const f=fixture(t);f.w.eval(`const menu=document.createXULElement('menu');menu.id='unfamiliar-menu';const popup=document.createXULElement('menupopup');menu.append(popup);const command=document.createXULElement('menuitem');command.id='unfamiliar-command';popup.append(command);document.querySelector('menupopup').append(menu);\n//# sourceURL=chrome://sine/content/beta/menu.uc.js`);
 const menu=f.w.document.getElementById('unfamiliar-menu'),command=f.w.document.getElementById('unfamiliar-command');
 assert.equal(f.tracker.resolve(menu).id,'beta');assert.equal(f.tracker.resolve(menu).name,'Beta Menu');
 assert.equal(f.tracker.resolve(command).id,'beta');
});
test('an already loaded command or submenu is identified from its own handler source',t=>{
 const f=fixture(t),menu=f.w.document.createXULElement('menu'),popup=f.w.document.createXULElement('menupopup');menu.append(popup);
 const command=f.w.document.createXULElement('menuitem'),handler=()=>{};
 f.locations.set(handler,{filename:'chrome://sine/content/alpha/controller.uc.js'});
 f.listeners.set(command,[{type:'command',listenerObject:handler}]);f.listeners.set(popup,[{type:'popupshowing',listenerObject:handler}]);
 assert.equal(f.tracker.resolve(command).id,'alpha');assert.equal(f.tracker.resolve(menu).id,'alpha');
});
test('owner artwork identifies a known mod but an unrelated image path cannot invent a mod',t=>{
 const f=fixture(t),node=f.w.document.createXULElement('menuitem');
 node.setAttribute('image','chrome://sine/content/alpha/assets/icon.svg');assert.equal(f.tracker.resolve(node).name,'Alpha Tools');
 const other=f.w.document.createXULElement('menuitem');other.setAttribute('image','https://example.invalid/alpha/icon.png');
 assert.equal(f.tracker.resolve(other).kind,'unknown');
});
test('a native ID can be attributed to a mod when its actual handler belongs to that mod',t=>{
 const f=fixture(t),node=f.w.document.createXULElement('menuitem');node.id='context-copy';
 const handler=()=>{};f.locations.set(handler,{filename:'chrome://sine/content/alpha/copy.uc.js'});f.listeners.set(node,[{type:'command',listenerObject:handler}]);
 assert.equal(f.tracker.resolve(node).id,'alpha');
});
test('unknown sources remain explicit and known built-in IDs remain browser items',t=>{
 const f=fixture(t),node=f.w.document.createXULElement('menuitem');node.id='unfamiliar-action';
 assert.equal(f.tracker.resolve(node).kind,'unknown');node.id='context-copy';assert.equal(f.tracker.resolve(node).kind,'browser');
});
test('catalog refresh resolves a previously unknown source without guessing its display name',t=>{
 const f=fixture(t),node=f.w.document.createXULElement('menuitem');node.setAttribute('image','chrome://sine/content/newly-installed/icon.svg');
 assert.equal(f.tracker.resolve(node).kind,'unknown');
 f.tracker.setMods({...mods,'newly-installed':{id:'newly-installed',name:'New Tool'}});
 assert.equal(f.tracker.resolve(node).name,'New Tool');
});
test('namespaced XUL creation is attributed and ordinary HTML creation keeps its behavior',t=>{
 const f=fixture(t);f.w.eval(`const item=document.createElementNS('http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul','menuitem');item.id='namespaced';document.querySelector('menupopup').append(item);\n//# sourceURL=chrome://sine/content/alpha/namespace.uc.js`);
 assert.equal(f.tracker.resolve(f.w.document.getElementById('namespaced')).id,'alpha');
 assert.equal(f.w.document.createElementNS('http://www.w3.org/1999/xhtml','span').localName,'span');
});
test('unloading restores document creation methods and preserves a later foreign wrapper',t=>{
 const f=fixture(t),doc=f.w.document,wrapped=doc.createXULElement;
 const foreign=function(...args){return Reflect.apply(wrapped,this,args);};doc.createXULElement=foreign;
 f.tracker.destroy();assert.equal(doc.createXULElement,foreign);assert.equal(doc.createXULElement('menu').localName,'menu');
 assert.equal(Object.hasOwn(doc,'createElementNS'),false);
});
test('source discovery does not invoke an object listener handleEvent accessor',t=>{
 const f=fixture(t),node=f.w.document.createXULElement('menuitem');let calls=0;
 const listener={get handleEvent(){calls++;return ()=>{};}};
 f.listeners.set(node,[{type:'command',listenerObject:listener}]);
 assert.equal(f.tracker.resolve(node).kind,'unknown');assert.equal(calls,0);
});
test('a browser command decorated by an icon mod keeps its browser source',t=>{
 const f=fixture(t),node=f.w.document.createXULElement('menuitem');node.id='context-copy';node.setAttribute('image','chrome://sine/content/alpha/icons/copy.svg');
 assert.equal(f.tracker.resolve(node).kind,'browser');
});
test('a handler from a newly installed mod triggers a throttled catalogue refresh',async t=>{
 const f=fixture(t);f.tracker.destroy();let reads=0;
 const node=f.w.document.createXULElement('menuitem'),handler=()=>{};
 const tracker=api.createSourceTracker(f.w,{loadMods:async()=>++reads===1?{alpha:mods.alpha}:mods,
  listenerInfo:target=>target===node?[{type:'command',listenerObject:handler}]:[],
  functionLocation:()=>({filename:'chrome://sine/content/beta/new-handler.uc.js'})});
 t.after(()=>tracker.destroy());await tracker.refresh();
 const clock=Date.now;Date.now=()=>clock()+3000;
 try{tracker.resolve(node);await new Promise(resolve=>setTimeout(resolve,0));}finally{Date.now=clock;}
 assert.equal(reads,2);assert.equal(tracker.resolve(node).name,'Beta Menu');
});
test('native browser source IDs are recovered from XUL with self-closing scripts and inert templates',t=>{
 const f=fixture(t);assert.equal(typeof api.browserMenuIds,'function');
 const markup='<html><script src="chrome://browser/content/native.js"/><template><menupopup id="contentAreaContextMenu"><menuitem id="context-copy"/></menupopup></template><menupopup id="tabContextMenu"><menuitem id="context_reloadTab"/></menupopup><script>globalThis.executed=true;</script></html>';
 const ids=api.browserMenuIds(f.w,markup);assert.equal(ids.has('context-copy'),true);assert.equal(ids.has('context_reloadTab'),true);assert.equal(f.w.executed,undefined);
});
test('browser source IDs exclude XML siblings after a self-closing menu',t=>{
 const f=fixture(t);
 const markup='<html xmlns="http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul"><menupopup id="contentAreaContextMenu"><menu id="inside"/></menupopup><box id="outside"/></html>';
 assert.deepEqual([...api.browserMenuIds(f.w,markup)],['inside']);
});
