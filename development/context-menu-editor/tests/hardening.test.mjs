// 0.2.0 hardening: provenance (B2), saved-state growth (B4), cross-window owner
// writes (B5), adoption of browser popups (B6) and shared startup work (item 10).
import test from 'node:test';
import assert from 'node:assert/strict';
import {makeDOM,JSDOM} from './dom.mjs';
import {createSourceTracker} from '../src/sources.mjs';
import {createMenuController,REMEMBERED_LIMIT} from '../src/controller.mjs';
import {createState,validateState,parseState,serializeState,fitWriteLimits,pruneUnsavedAbsentRows,recordHasEdits} from '../src/model.mjs';
import {startContextMenuEditor} from '../src/entry.mjs';
import {discoverRoot} from '../src/registry.mjs';

const wait=()=>new Promise(resolve=>setTimeout(resolve,0));
const bytes=text=>Buffer.byteLength(text,'utf8');

function chromeDOM(){
 const dom=new JSDOM('<menupopup id="contentAreaContextMenu"></menupopup>',{url:'chrome://browser/content/browser.xhtml',runScripts:'outside-only'});
 dom.window.document.createXULElement=name=>dom.window.document.createElement(name);
 return dom;
}
const script=(w,url,code)=>w.eval(`${code}\n//# sourceURL=${url}`);

test('B2: only the innermost frame outside the editor and Sine helpers names the creator',t=>{
 const dom=chromeDOM(),w=dom.window;
 const tracker=createSourceTracker(w,{initialMods:{beta:{id:'beta',name:'Beta'}}});
 t.after(()=>{tracker.destroy();w.close();});
 script(w,'chrome://browser/content/native-share.js',`function nativeMake(id){const n=document.createXULElement('menu');n.id=id;document.querySelector('menupopup').append(n);return n;}`);
 script(w,'chrome://userscripts/content/utils.sys.mjs',`function sineHelper(id){const n=document.createXULElement('menuitem');n.id=id;document.querySelector('menupopup').append(n);return n;}`);
 // A mod that wraps a browser function: the browser's own creation stays the browser's.
 script(w,'chrome://sine/content/beta/wrap.uc.js',`nativeMake('native-under-mod');sineHelper('mod-through-helper');const own=document.createXULElement('menuitem');own.id='mod-direct';document.querySelector('menupopup').append(own);`);
 const resolve=id=>tracker.resolve(w.document.getElementById(id));
 assert.equal(resolve('native-under-mod').kind,'unknown');
 assert.equal(resolve('mod-through-helper').id,'beta');
 assert.equal(resolve('mod-direct').id,'beta');
});

test('B2: Sine reloads reuse one creation hook instead of stacking wrappers',()=>{
 const dom=chromeDOM(),w=dom.window,document=w.document,original=document.createXULElement;
 const first=createSourceTracker(w);
 const wrapped=document.createXULElement;
 assert.notEqual(wrapped,original);
 first.destroy();
 assert.equal(document.createXULElement,original,'an unload with no later wrapper restores the original');
 const second=createSourceTracker(w);
 // Another script wraps after us; our unload must keep its wrapper working.
 const ours=document.createXULElement;let foreignCalls=0;w.countForeign=()=>foreignCalls++;w.ours=ours;
 // That later wrapper belongs to a mod too, so a captured creation names it.
 script(w,'chrome://sine/content/beta/wrapper.uc.js',`document.createXULElement=function(...args){countForeign();return ours.apply(this,args);};`);
 const foreign=document.createXULElement;
 second.destroy();
 assert.equal(document.createXULElement,foreign);
 const third=createSourceTracker(w,{initialMods:{beta:{id:'beta',name:'Beta'}}});
 assert.equal(document.createXULElement,foreign,'the reload reuses the inert wrapper, adding none');
 assert.equal(document.__contextMenuEditorCreationHook.wrappers.get('createXULElement').wrapped,ours);
 script(w,'chrome://sine/content/beta/late.uc.js',`const n=document.createXULElement('menuitem');n.id='late';document.querySelector('menupopup').append(n);`);
 assert.equal(foreignCalls,1);
 assert.equal(third.resolve(document.getElementById('late')).id,'beta');
 third.destroy();w.close();
});

// A realistic long-lived state: three menus of native rows, a few hundred user
// edits, and thousands of remembered ID-less mod rows without edits.
function largeState(modRows){
 const state=createState();state.options.iconPack='zen';
 for(const rootId of ['contentAreaContextMenu','tabContextMenu','placesContext']){
  const root={children:[],records:{}};
  for(let i=0;i<120;i++){
   const key=`${rootId}-native-${i}`;
   root.records[key]={kind:'command',hidden:i%7===0,removed:false,showIcon:true,...i%5===0?{name:`Renamed ${i}`}:{},...i%9===0?{icon:{kind:'asset',pack:'fluent',id:'copy'}}:{}};
   root.children.push(key);
  }
  root.records[`cme-menu-${rootId}`]={kind:'submenu',name:'Mine',hidden:false,removed:false,showIcon:true,children:[`${rootId}-native-1`,`${rootId}-native-2`]};
  root.children=root.children.filter(key=>!key.endsWith('-native-1')&&!key.endsWith('-native-2'));
  root.children.unshift(`cme-menu-${rootId}`);
  state.roots[rootId]=root;
 }
 const tab=state.roots.tabContextMenu;
 for(let i=0;i<modRows;i++){
  const key=`mod:some-mod-with-a-long-identifier:${String(i).padStart(6,'0')}abcdefghij`;
  tab.records[key]={kind:'command',hidden:false,removed:false,showIcon:true,...i===3?{name:'Edited old row'}:{}};
  tab.children.push(key);
 }
 return state;
}

test('B4: a large existing state loads unchanged and a save keeps every edit',()=>{
 const raw=JSON.stringify(validateState(largeState(4500)));
 assert.ok(bytes(raw)>512*1024&&bytes(raw)<1024*1024,`fixture size ${bytes(raw)}`);
 // 0.1.6 refused such a state at 512 KiB, which disabled customization.
 const loaded=parseState(raw);
 assert.equal(JSON.stringify(loaded),raw,'loads unchanged');
 const saved=JSON.parse(serializeState(loaded));
 assert.ok(bytes(JSON.stringify(saved))<=512*1024);
 for(const [rootId,root]of Object.entries(loaded.roots)){
  for(const [key,record]of Object.entries(root.records)){
   if(recordHasEdits(record)||!key.startsWith('mod:'))assert.deepEqual(saved.roots[rootId].records[key],record,key);
  }
 }
 const modKeys=Object.keys(loaded.roots.tabContextMenu.records).filter(key=>key.startsWith('mod:'));
 const kept=modKeys.filter(key=>saved.roots.tabContextMenu.records[key]);
 assert.ok(kept.length<modKeys.length,'some unedited remembered rows were dropped');
 assert.ok(saved.roots.tabContextMenu.records[modKeys[3]],'an edited old row is kept');
 // Oldest unedited rows go first: what remains is the newest tail.
 const unedited=modKeys.filter((_,index)=>index!==3),keptUnedited=unedited.filter(key=>saved.roots.tabContextMenu.records[key]);
 assert.deepEqual(keptUnedited,unedited.slice(unedited.length-keptUnedited.length));
 // The result is a valid, stable state.
 assert.equal(serializeState(saved),JSON.stringify(validateState(saved)));
});

test('B4: an ordinary state round-trips byte for byte',()=>{
 const raw=JSON.stringify(validateState(largeState(40)));
 assert.equal(serializeState(parseState(raw)),raw);
 assert.equal(fitWriteLimits(parseState(raw)).roots.tabContextMenu.children.length,parseState(raw).roots.tabContextMenu.children.length);
});

test('B4: absent remembered rows are saved only once they carry an edit or a move',()=>{
 const row=(key,extra={})=>({key,kind:'command',parentKey:null,label:key,available:false,remembered:true,...extra});
 const record={kind:'command',hidden:false,removed:false,showIcon:true};
 const saved={version:1,options:{},roots:{m:{children:['keep'],records:{keep:record}}}};
 const before={version:1,options:{},roots:{m:{children:['keep','plain','edited','moved','present'],records:{keep:record,plain:record,edited:record,moved:record,present:record}}}};
 const after={version:1,options:{},roots:{m:{children:['keep','moved','plain','edited','present'],records:{keep:record,plain:record,edited:{...record,name:'Mine'},moved:record,present:record}}}};
 const inventory=[{id:'m',items:[row('keep'),row('plain'),row('edited'),row('moved'),{...row('present'),available:true,remembered:undefined}]}];
 const next=pruneUnsavedAbsentRows(after,saved,before,inventory);
 assert.deepEqual(next.roots.m.children,['keep','moved','edited','present']);
 assert.equal(next.roots.m.records.plain,undefined);
});

test('B4: remembered ID-less mod rows are capped, oldest first, keeping rows with saved edits',async()=>{
 const dom=makeDOM('<menupopup id="contentAreaContextMenu"></menupopup>'),w=dom.window,root=w.document.getElementById('contentAreaContextMenu');
 const state={version:1,options:{enabled:true},roots:{contentAreaContextMenu:{children:[],records:{}}}};
 const ctl=createMenuController(w,{getState:()=>state,resolveSource:node=>node.localName==='menuitem'?{kind:'mod',id:'beta',name:'Beta'}:null});
 const open=async labels=>{
  root.replaceChildren(...labels.map(label=>{const n=w.document.createXULElement('menuitem');n.setAttribute('label',label);return n;}));
  root.dispatchEvent(new w.Event('popupshowing',{bubbles:true,cancelable:true}));await wait();
  root.dispatchEvent(new w.Event('popuphidden',{bubbles:true}));await wait();
 };
 const first=Array.from({length:REMEMBERED_LIMIT+60},(_,i)=>`Row ${i}`);
 await open(first);
 const keys=ctl.getInventory()[0].items.map(item=>item.key);
 assert.equal(keys.length,first.length);
 // The user renamed the oldest row; it must survive eviction.
 state.roots.contentAreaContextMenu.records[keys[0]]={kind:'command',hidden:false,removed:false,showIcon:true,name:'Mine'};
 state.roots.contentAreaContextMenu.children.push(keys[0]);
 await open(['Fresh row']);
 const items=ctl.getInventory()[0].items,absent=items.filter(item=>item.remembered);
 assert.equal(absent.length,REMEMBERED_LIMIT);
 assert.ok(absent.every(item=>item.available===false));
 assert.ok(absent.some(item=>item.key===keys[0]),'the edited row is kept');
 assert.ok(!absent.some(item=>item.key===keys[1]),'the oldest unedited row is evicted');
 assert.ok(absent.some(item=>item.key===keys.at(-1)),'the newest rows are kept');
 ctl.destroy();w.close();
});

test('B6: a browser popup is adopted only for rows a mod added, not for its listeners',async()=>{
 const dom=makeDOM('<div id="set"></div>'),w=dom.window,document=w.document;
 let kind='pending';
 const modRoots=new Set(),modRows=new Set();
 const ctl=createMenuController(w,{getState:()=>({version:1,options:{enabled:true},roots:{}}),
  resolveSource:node=>modRoots.has(node)||modRows.has(node)?{kind:'mod',id:'beta',name:'Beta'}:null,
  classifyPopup:()=>kind,isNativeRow:id=>id==='native-row'});
 const popup=document.createXULElement('menupopup');popup.id='downloadsContextMenu';
 const native=document.createXULElement('menuitem');native.id='native-row';native.setAttribute('label','Native');popup.append(native);
 document.getElementById('set').append(popup);
 const tracked=()=>ctl.getInventory().some(root=>root.id==='downloadsContextMenu');
 const open=async()=>{popup.dispatchEvent(new w.Event('popupshowing',{bubbles:true,cancelable:true}));await wait();popup.dispatchEvent(new w.Event('popuphidden',{bubbles:true}));await wait();};
 // A mod listening on the popup and on a native row (seen as their source).
 modRoots.add(popup);modRows.add(native);
 await open();assert.equal(tracked(),false,'undecided while the browser markup is loading');
 kind='native';await open();
 assert.equal(tracked(),false,'listeners alone never adopt a browser popup');
 const added=document.createXULElement('menuitem');added.id='beta-action';added.setAttribute('label','Beta action');modRows.add(added);popup.append(added);
 await open();assert.equal(tracked(),true,'a row the mod added adopts it');
 // Foreign (non-markup) popups keep the 0.1.6 rule: a mod source is enough.
 const foreign=document.createXULElement('menupopup');foreign.id='beta-popup';modRoots.add(foreign);document.getElementById('set').append(foreign);
 kind='foreign';
 foreign.dispatchEvent(new w.Event('popupshowing',{bubbles:true,cancelable:true}));await wait();
 assert.ok(ctl.getInventory().some(root=>root.id==='beta-popup'));
 ctl.destroy();w.close();
});

test('the toolbar context menu is a built-in menu, never credited to a mod',async()=>{
 const dom=makeDOM('<menupopup id="toolbar-context-menu"><menuitem id="toolbar-context-customize" label="Customize Toolbar"></menuitem><menuitem id="toggle_toolbar-menubar" label="Menu Bar" type="checkbox"></menuitem></menupopup>'),w=dom.window;
 const ctl=createMenuController(w,{getState:()=>({version:1,options:{enabled:true},roots:{}}),classifyPopup:()=>'native',isNativeRow:()=>true});
 const root=ctl.getInventory().find(menu=>menu.id==='toolbar-context-menu');
 assert.equal(root?.label,'Toolbar menu','tracked without any mod row (no Better Zen Folders adoption)');
 assert.deepEqual(root.items.map(item=>item.key),['toolbar-context-customize','toggle_toolbar-menubar']);
 ctl.destroy();w.close();
});

function sharedServices(){
 const data=new Map(),prefObservers=new Set(),topics=new Map(),windows=[];
 const prefs={getStringPref:(key,fallback='')=>data.get(key)??fallback,
  setStringPref(key,value){data.set(key,value);for(const [name,observer]of[...prefObservers])if(key.startsWith(name))observer.observe(null,'nsPref:changed',key);},
  getBoolPref:(_key,fallback)=>fallback,getIntPref:(_key,fallback)=>fallback,prefHasUserValue:key=>data.has(key),clearUserPref:key=>data.delete(key),
  getPrefType:()=>0,getChildList:()=>[],
  addObserver(name,observer){prefObservers.add([name,observer]);},
  removeObserver(name,observer){for(const entry of prefObservers)if(entry[0]===name&&entry[1]===observer)prefObservers.delete(entry);}};
 const obs={addObserver(observer,topic){if(!topics.has(topic))topics.set(topic,new Set());topics.get(topic).add(observer);},
  removeObserver(observer,topic){topics.get(topic)?.delete(observer);},
  notifyObservers(subject,topic,data){for(const observer of[...topics.get(topic)||[]])observer.observe(subject,topic,data);}};
 const wm={getEnumerator(){let index=0;return {hasMoreElements:()=>index<windows.length,getNext:()=>windows[index++]};},getMostRecentWindow:()=>windows[0]};
 return {services:{prefs,obs,wm,appinfo:{appBuildID:'20261101',version:'1.24.1b'}},windows};
}
function browserWindow(windows,counter){
 const dom=makeDOM('<menupopup id="contentAreaContextMenu"><menuitem id="context-copy" label="Copy"></menuitem></menupopup>');
 dom.reconfigure({url:'chrome://browser/content/browser.xhtml'});
 dom.window.fetch=async()=>{counter.fetches++;return {text:async()=>'<window xmlns="http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul"><menupopup id="contentAreaContextMenu"><menuitem id="context-copy"/></menupopup><menupopup id="toolbar-context-menu"><menuitem id="native-row"/></menupopup></window>'};};
 windows.push(dom.window);
 return dom;
}

test('item 10 and B5: windows share the parsed browser markup, and another window\'s owner write keeps pending fields',async t=>{
 const previous=globalThis.ChromeUtils;
 globalThis.ChromeUtils={importESModule(){throw new Error('Sine is not available in unit tests.');}};
 t.after(()=>{if(previous===undefined)delete globalThis.ChromeUtils;else globalThis.ChromeUtils=previous;});
 const {services,windows}=sharedServices(),counter={fetches:0};
 const first=browserWindow(windows,counter),a=startContextMenuEditor(first.window,{Services:services});
 for(let i=0;i<5;i++)await wait();
 const second=browserWindow(windows,counter),b=startContextMenuEditor(second.window,{Services:services});
 for(let i=0;i<5;i++)await wait();
 assert.equal(counter.fetches,1,'the second window reuses the first window\'s markup');
 assert.equal(b.browserMarkup,a.browserMarkup);
 assert.ok(a.browserMarkup.popups.has('toolbar-context-menu')&&a.browserMarkup.popupRows.has('native-row'));
 assert.equal(first.window.document.querySelectorAll('[data-cme-stylesheet]').length,1,'one author stylesheet link per window');
 // B5: window A saves an owner change; window B must not treat it as a user edit.
 let clears=0;b.controller.clearOwnerSettingsChanges=()=>{clears++;};
 const state=createState();state.roots.contentAreaContextMenu={children:['context-copy'],records:{'context-copy':{kind:'command',hidden:true,removed:false,showIcon:true}}};
 const raw=serializeState(state);
 services.obs.notifyObservers(null,'context-menu-editor-owner-write',raw);
 a.store.save(state,a.store.read().raw);
 await wait();
 assert.equal(clears,0,'an announced owner write keeps the other window\'s pending owner fields');
 // A user's edit (no announcement) still ends every pending owner window.
 const edit=createState();
 b.store.save(edit,b.store.read().raw);await wait();
 assert.ok(clears>=1);
 a.unload();b.unload();first.window.close();second.window.close();
});
test('B3: with a duplicate Share menu, the one after its layout anchor keeps the native identity',()=>{
 const share='<menu class="share-tab-url-item" data-l10n-id="tab-context-share-url" label="Share"><menupopup></menupopup></menu>';
 const find=html=>{
  const dom=makeDOM(`<menupopup id="tabContextMenu">${html}</menupopup>`),root=dom.window.document.getElementById('tabContextMenu');
  const scan=discoverRoot(root),node=scan.nodes.get('native:tab-context-share-url');
  const result=node?[...root.children].indexOf(node):-1;dom.window.close();return result;
 };
 assert.equal(find(`<menuitem id="a"></menuitem>${share}<menuitem id="b"></menuitem><menu id="context_moveTabOptions"></menu>${share}`),4);
 assert.equal(find(`${share}<menuitem id="context_shareSelectedTabs"></menuitem>${share}`),2);
 assert.equal(find(`${share}<menuitem id="a"></menuitem>${share}`),-1,'ambiguous duplicates stay unidentified');
 assert.equal(find(`<menu id="context_moveTabOptions"></menu>${share}`),1);
});
