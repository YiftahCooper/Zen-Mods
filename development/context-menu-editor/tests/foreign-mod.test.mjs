import nodeTest from 'node:test';
import {existsSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {dirname,join} from 'node:path';
import assert from 'node:assert/strict';
import {makeDOM} from './dom.mjs';
import {startContextMenuEditor} from '../src/entry.mjs';
import {mergeInventory,moveItem,updateItem,addSubmenu} from '../src/model.mjs';
// Execute the foreign mod's current source, rather than a copied implementation
// or a fixture that only imitates its menu insertion and command handler. Define
// Word's source is not in this repository: set CME_DEFINE_WORD_SOURCE to its src
// folder, or keep the usual sibling checkout <workspace>/Zen-Mods/define-word.
function defineWordSource(){
 const candidates=[];
 if(process.env.CME_DEFINE_WORD_SOURCE)candidates.push(join(process.env.CME_DEFINE_WORD_SOURCE,'controller.mjs'));
 for(let folder=dirname(fileURLToPath(import.meta.url));dirname(folder)!==folder;folder=dirname(folder)){
  candidates.push(join(folder,'Zen-Mods','define-word','src','controller.mjs'));
 }
 return candidates.find(path=>existsSync(path))||null;
}
const defineWordPath=defineWordSource();
const createDefineWord=defineWordPath?(await import(pathToFileURL(defineWordPath).href)).createController:null;
const test=(name,fn)=>nodeTest(name,{skip:createDefineWord?false:'Define Word source not found; set CME_DEFINE_WORD_SOURCE'},fn);

const ROOT='contentAreaContextMenu', KEY='define-word-menu';
const OWNER_ICON='chrome://sine/content/define-word/assets/define-word.svg';
const CHOSEN_ICON='chrome://sine/content/context-menu-editor/assets/packs/fluent/spell-check.svg';
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));

function preferences(initial='') {
 const data=new Map(initial ? [['extension.context-menu-editor.settings',initial]] : []),observers=new Map();
 return {
  getStringPref:(key,fallback='')=>data.get(key)??fallback,
  setStringPref(key,value){data.set(key,value);for(const observer of observers.get(key)||[])observer.observe(null,'nsPref:changed',key);},
  addObserver(key,observer){if(!observers.has(key))observers.set(key,new Set());observers.get(key).add(observer);},
  removeObserver(key,observer){observers.get(key)?.delete(observer);},
 };
}

function fixture(t,{order='define-first',prefs=preferences()}={}) {
 const dom=makeDOM(`<button id="origin">Selected page</button><menupopup id="${ROOT}"><menuitem id="context-copy" label="Copy"></menuitem><menuitem id="context-paste" label="Paste"></menuitem></menupopup><div id="mainPopupSet"></div>`);
 dom.reconfigure({url:'chrome://browser/content/browser.xhtml'});
 const w=dom.window,root=w.document.getElementById(ROOT),progress=new Set(),panelCalls=[],captures=[],lookups=[],owners=[];
 // jsdom has no native XUL widgets. Only the host's panel methods are stubbed;
 // Define Word's real popup creation, rendering, controls and cleanup run below.
 w.document.createXULElement=tag=>{
  const node=w.document.createElement(tag);
  if(tag==='panel'){
   node.openPopupAtScreen=(x,y)=>{panelCalls.push({kind:'open',node,x,y});node.dispatchEvent(new w.Event('popupshown',{bubbles:true}));};
   node.hidePopup=()=>{panelCalls.push({kind:'close',node});node.dispatchEvent(new w.Event('popuphidden',{bubbles:true}));};
  }
  return node;
 };
 const browser={getBoundingClientRect:()=>({left:0,top:0,width:900,height:700})};
 w.gBrowser={selectedBrowser:browser,tabContainer:new w.EventTarget(),addTabsProgressListener:listener=>progress.add(listener),removeTabsProgressListener:listener=>progress.delete(listener)};
 w.devicePixelRatio=2;
 w.fetch=()=>{throw new Error('This modeled integration must not make network requests.');};
 const settings={englishProvider:'wiktionary-en',hebrewProvider:'wiktionary-he',showIcon:true,textSize:14};
 const providers=new Map([
  ['wiktionary-en',{id:'wiktionary-en',language:'en',label:'Wiktionary'}],
  ['wiktionary-he',{id:'wiktionary-he',language:'he',label:'ויקימילון'}],
 ]);
 function loadDefine(){
  const lifecycle={releases:0};
  const owner=createDefineWord(w,{
   settings:()=>settings,providers,
   selection:{async capture(_window,context){captures.push(context);return {rawText:context?.selectionInfo?.text||'',anchor:context?.anchor};},isCurrent:()=>true,release(){lifecycle.releases++;}},
   lookup:{async lookup(args){lookups.push(args);return {status:'ok',definition:{headword:args.term.query,language:args.term.language,senses:[{partOfSpeech:'noun',text:`Definition of ${args.term.query}`}],attribution:{label:'Wiktionary',url:'https://en.wiktionary.org/wiki/browser'}}};}},
  });
  owners.push(owner);return {owner,lifecycle,item:w.document.getElementById(KEY)};
 }
 let define,editor;
 const services={prefs};
 if(order==='define-first'){define=loadDefine();editor=startContextMenuEditor(w,{Services:services});}
 else{editor=startContextMenuEditor(w,{Services:services});if(order!=='editor-only')define=loadDefine();}
 t.after(()=>{editor.unload();for(const owner of owners)owner.destroy();dom.window.close();});
 function context(text='browser',onPassword=false){w.gContextMenu={selectionInfo:{text},onPassword,frameBrowsingContext:{id:'selected-frame'},contentData:{context:{screenXDevPx:400,screenYDevPx:240}}};}
 const event=(name,target=root)=>target.dispatchEvent(new w.Event(name,{bubbles:true,cancelable:true}));
 async function open(text='browser',onPassword=false){context(text,onPassword);event('popupshowing');await tick();}
 const inventory=()=>editor.controller.getInventory().find(menu=>menu.id===ROOT).items;
 function save(state){const before=editor.store.read();assert.equal(before.error,null);editor.store.save(state,before.raw);return editor.store.read().raw;}
 function customize({parent=null,name='Dictionary',icon={kind:'asset',pack:'fluent',id:'spell-check'},index=0}={}){
  const descriptors=inventory();let state=mergeInventory(editor.store.read().state,ROOT,descriptors);
  if(parent)state=addSubmenu(state,ROOT,'Language',null,0,parent);
  state=moveItem(state,ROOT,KEY,parent,index,descriptors);
  state=updateItem(state,ROOT,KEY,{name,icon});return save(state);
 }
 return {dom,w,root,prefs,editor,define,loadDefine,open,event,context,inventory,save,customize,settings,captures,lookups,panelCalls,progress};
}

for(const order of ['define-first','editor-first']) {
 test(`real Define Word is discovered, saved, reordered, renamed and invoked (${order})`,async t=>{
  const f=fixture(t,{order}),item=f.define.item;
  await f.open();
  const descriptor=f.inventory().find(row=>row.key===KEY);
  assert.deepEqual({kind:descriptor.kind,locked:descriptor.locked,boundary:descriptor.boundary,parentKey:descriptor.parentKey},{kind:'command',locked:false,boundary:null,parentKey:null});
  assert.equal(descriptor.label,'Define “browser”');assert.equal(descriptor.iconURL,OWNER_ICON);
  assert.equal(item.querySelector('[data-cme-icon] img').getAttribute('src'),OWNER_ICON);
  let direct,delegated;
  item.addEventListener('command',event=>{direct={target:event.target,ctrl:event.ctrlKey};});
  f.root.addEventListener('command',event=>{delegated=event.target;});
  const saved=f.customize();await tick();
  assert.equal(f.root.firstElementChild,item);assert.equal(item.getAttribute('label'),'Dictionary');
  assert.equal(item.getAttribute('image'),OWNER_ICON);
  assert.equal(item.querySelector('[data-cme-icon] img').getAttribute('src'),CHOSEN_ICON);
  assert.equal(f.w.document.querySelectorAll(`#${KEY}`).length,1);
  assert.equal(saved.includes('browser'),false,'selected text must stay out of preferences');
  assert.equal(saved.includes(OWNER_ICON),false,'live owner artwork must stay out of preferences');
  const before=f.editor.store.read().raw;
  item.dispatchEvent(new f.w.MouseEvent('command',{bubbles:true,ctrlKey:true}));await tick();
  assert.deepEqual(direct,{target:item,ctrl:true});assert.equal(delegated,item);
  assert.equal(f.lookups.length,1);assert.equal(f.lookups[0].term.query,'browser');
  assert.equal(f.captures[0].frameBrowsingContext,f.w.gContextMenu.frameBrowsingContext);
  assert.deepEqual(f.captures[0].anchor,{x:200,y:120,width:1,height:1});
  assert.equal(f.w.document.querySelector('#define-word-panel h2').textContent,'Browser');
  assert.equal(f.w.document.querySelector('#define-word-panel ol li p').textContent,'Definition of browser');
  assert.equal(f.editor.store.read().raw,before,'command execution must not rewrite preferences');
  assert.ok(f.panelCalls.some(call=>call.kind==='open'));
  f.w.document.querySelector('[aria-label="Close definition"]').click();
  assert.equal(f.panelCalls.at(-1).kind,'close');
  let ownerCleanup;
  f.root.addEventListener('popuphiding',()=>{ownerCleanup={parent:item.parentElement,label:item.getAttribute('label'),decoration:item.querySelector('[data-cme-icon]')};},{once:true});
  f.event('popuphiding');
  assert.deepEqual(ownerCleanup,{parent:f.root,label:'Define “browser”',decoration:null});
  assert.deepEqual([...f.root.children].map(node=>node.id),['context-copy','context-paste',KEY]);
  await f.open('book');assert.equal(f.root.firstElementChild,item);assert.equal(item.getAttribute('label'),'Dictionary');
  f.editor.unload();
  assert.equal(item.getAttribute('label'),'Define “book”');assert.equal(item.getAttribute('image'),OWNER_ICON);
  assert.equal(f.root.querySelector('[data-cme-owned]'),null);
  item.dispatchEvent(new f.w.Event('command',{bubbles:true}));await tick();assert.equal(f.lookups.at(-1).term.query,'book');
 });

 test(`real Define Word availability and latest owner appearance survive custom presentation (${order})`,async t=>{
  const f=fixture(t,{order}),item=f.define.item;await f.open('first');f.customize({icon:{kind:'text',text:'📖'}});await tick();f.event('popuphiding');
  for(const [text,password] of [['',false],['secret',true],['שלום',false]]){
   await f.open(text,password);
   assert.equal(item.hidden,!text||password);assert.equal(item.getAttribute('label'),'Dictionary');
   assert.equal(f.inventory().find(row=>row.key===KEY).available,Boolean(text&&!password));
   f.event('popuphiding');assert.equal(item.getAttribute('label'),`Define “${text}”`);
  }
  await f.open('latest');
  f.define.owner.updateAppearance({...f.settings,showIcon:false});await tick();
  assert.equal(item.hasAttribute('image'),false);assert.equal(item.classList.contains('menuitem-iconic'),false);
  assert.equal(item.querySelector('[data-cme-icon]').textContent,'📖');
  f.event('popuphiding');assert.equal(item.getAttribute('label'),'Define “latest”');assert.equal(item.hasAttribute('image'),false);
  f.define.owner.updateAppearance({...f.settings,showIcon:true});
  await f.open('again');f.editor.unload();
  assert.equal(item.getAttribute('label'),'Define “again”');assert.equal(item.getAttribute('image'),OWNER_ICON);
  assert.equal(item.querySelector('[data-cme-icon]'),null);
 });
}

test('saved foreign settings wait for a late Define Word owner and survive its replacement without resurrection',async t=>{
 const seed=fixture(t);await seed.open('unique selection');const raw=seed.customize({name:'Lookup',icon:{kind:'text',text:'📚'}});seed.editor.unload();seed.define.owner.destroy();
 const f=fixture(t,{order:'editor-only',prefs:preferences(raw)});await f.open('new text');
 assert.equal(f.inventory().some(row=>row.key===KEY),false);assert.equal(f.w.document.getElementById(KEY),null);
 const first=f.loadDefine();await tick();f.event('popuphiding');await f.open('first owner');
 assert.equal(f.root.firstElementChild,first.item);assert.equal(first.item.getAttribute('label'),'Lookup');
 assert.equal(first.item.querySelector('[data-cme-icon]').textContent,'📚');
 first.item.dispatchEvent(new f.w.Event('command',{bubbles:true}));await tick();assert.equal(f.lookups.at(-1).term.query,'first owner');
 first.owner.destroy();await tick();
 assert.equal(first.lifecycle.releases,1);assert.equal(first.item.isConnected,false);assert.equal(f.w.document.getElementById('define-word-panel'),null);
 assert.equal(f.inventory().some(row=>row.key===KEY),false);assert.equal(f.editor.store.read().raw,raw);
 const next=f.loadDefine();await tick();f.event('popuphiding');await f.open('second owner');
 assert.notEqual(next.item,first.item);assert.equal(f.root.firstElementChild,next.item);assert.equal(next.item.getAttribute('label'),'Lookup');
 const count=f.lookups.length;next.item.dispatchEvent(new f.w.Event('command',{bubbles:true}));await tick();
 assert.equal(f.lookups.length,count+1);assert.equal(f.lookups.at(-1).term.query,'second owner');
 f.editor.unload();assert.equal(first.item.isConnected,false);assert.equal(next.item.parentElement,f.root);
 assert.equal(next.item.getAttribute('label'),'Define “second owner”');assert.equal(next.item.querySelector('[data-cme-icon]'),null);
 assert.equal(f.editor.store.read().raw,raw);assert.equal(f.progress.size,1);
});

test('real Define Word command works in an editor submenu and root cleanup restores the original owner node',async t=>{
 const f=fixture(t),item=f.define.item;await f.open();f.customize({parent:'cme-language',name:'Meaning',icon:{kind:'text',text:'Aa'}});await tick();
 const popup=item.parentElement,menu=popup.parentElement;assert.equal(popup.localName,'menupopup');assert.equal(menu.getAttribute('label'),'Language');
 let delegated;f.root.addEventListener('command',event=>{delegated=event.target;});
 item.dispatchEvent(new f.w.Event('command',{bubbles:true}));await tick();assert.equal(delegated,item);assert.equal(f.lookups.at(-1).term.query,'browser');
 let baseline;f.root.addEventListener('popuphiding',()=>{baseline={parent:item.parentElement,label:item.getAttribute('label')};});f.event('popuphiding');
 assert.deepEqual(baseline,{parent:f.root,label:'Define “browser”'});assert.equal(popup.isConnected,false);assert.equal(menu.isConnected,false);
 await f.open('word');assert.equal(item.parentElement.parentElement.getAttribute('label'),'Language');
 f.define.owner.destroy();await tick();f.editor.unload();
 assert.equal(item.isConnected,false);assert.equal(f.w.document.getElementById(KEY),null);assert.equal(f.w.document.getElementById('define-word-panel'),null);
});

test('opening a custom submenu with real Define Word preserves that active popup and command node',async t=>{
 const f=fixture(t),item=f.define.item;await f.open();f.customize({parent:'cme-language'});await tick();
 const popup=item.parentElement,menu=popup.parentElement;
 menu.setAttribute('open','true');menu.setAttribute('_moz-menuactive','true');item.setAttribute('_moz-menuactive','true');
 f.event('popupshowing',popup);await tick();
 assert.equal(item.parentElement,popup,'foreign owner showing writes must not disconnect an open submenu');
 assert.equal(popup.parentElement,menu);assert.equal(popup.isConnected,true);assert.equal(item.getAttribute('label'),'Dictionary');
 // A later bubbling opening invokes the actual DW showing handler with newer
 // owner text, after native hover/open attributes were already set.
 f.context('after hover');f.event('popupshowing',popup);await tick();
 assert.equal(item.parentElement,popup);assert.equal(popup.parentElement,menu);assert.equal(menu.getAttribute('open'),'true');
 assert.equal(item.getAttribute('label'),'Dictionary');
 assert.equal(f.inventory().find(row=>row.key===KEY).label,'Define “after hover”');
 // DW has no popuphiding handler. Model a host settings callback during nested
 // hiding through its real public API, rather than adding a fake DW handler.
 f.root.addEventListener('popuphiding',event=>{
  if(event.target===popup)f.define.owner.updateAppearance({...f.settings,showIcon:false});
 });
 f.event('popuphiding',popup);await tick();
 assert.equal(item.parentElement,popup,'nested hiding plus owner writes must retain the root overlay');
 assert.equal(popup.isConnected,true);assert.equal(menu.isConnected,true);assert.equal(menu.getAttribute('open'),'true');
 assert.equal(item.hasAttribute('image'),false);assert.equal(item.classList.contains('menuitem-iconic'),false);
 assert.equal(item.getAttribute('label'),'Dictionary');assert.equal(item.querySelector('[data-cme-icon] img').getAttribute('src'),CHOSEN_ICON);
 item.dispatchEvent(new f.w.Event('command',{bubbles:true}));await tick();assert.equal(f.lookups.at(-1).term.query,'after hover');
 let cleanup;
 f.root.addEventListener('popuphiding',event=>{if(event.target===f.root)cleanup={parent:item.parentElement,label:item.getAttribute('label'),image:item.getAttribute('image'),decoration:item.querySelector('[data-cme-icon]')};});
 f.event('popuphiding');
 assert.deepEqual(cleanup,{parent:f.root,label:'Define “after hover”',image:null,decoration:null});
 assert.equal(popup.isConnected,false);assert.equal(menu.isConnected,false);
 assert.deepEqual([...f.root.children].map(node=>node.id),['context-copy','context-paste',KEY]);
});

test('a generic stable action inserted while a custom submenu is open is discovered and customized without replacing that popup',async t=>{
 const f=fixture(t);await f.open();f.customize({parent:'cme-language'});await tick();
 const dw=f.define.item,popup=dw.parentElement,menu=popup.parentElement;
 menu.setAttribute('open','true');f.event('popupshowing',popup);await tick();
 const foreign=f.w.document.createXULElement('menuitem');foreign.id='third-party-palette-action';foreign.setAttribute('label','Owner palette');
 let invoked,delegated;
 foreign.addEventListener('command',event=>{invoked={target:event.target,alt:event.altKey};});
 f.root.addEventListener('command',event=>{delegated=event.target;});f.root.append(foreign);await tick();
 const descriptors=f.inventory(),found=descriptors.find(row=>row.key===foreign.id);
 assert.ok(found,'an unfamiliar stable owner action must be discovered without an allowlist');
 assert.equal(found.locked,false);assert.equal(found.boundary,null);assert.equal(found.label,'Owner palette');
 assert.equal(dw.parentElement,popup);assert.equal(popup.isConnected,true);
 let state=mergeInventory(f.editor.store.read().state,ROOT,descriptors);
 state=moveItem(state,ROOT,foreign.id,'cme-language',0,descriptors);
 state=updateItem(state,ROOT,foreign.id,{name:'Palette',icon:{kind:'text',text:'🎨'}});const raw=f.save(state);await tick();
 assert.equal(foreign.parentElement,popup);assert.equal(popup.firstElementChild,foreign);assert.equal(dw.parentElement,popup);
 assert.equal(popup.parentElement,menu);assert.equal(menu.getAttribute('open'),'true');assert.equal(foreign.getAttribute('label'),'Palette');
 assert.equal(foreign.querySelector('[data-cme-icon]').textContent,'🎨');
 foreign.dispatchEvent(new f.w.MouseEvent('command',{bubbles:true,altKey:true}));
 assert.deepEqual(invoked,{target:foreign,alt:true});assert.equal(delegated,foreign);
 f.event('popuphiding');
 assert.equal(foreign.parentElement,f.root);assert.equal(foreign.getAttribute('label'),'Owner palette');assert.equal(foreign.querySelector('[data-cme-icon]'),null);
 assert.equal(popup.isConnected,false);assert.equal(menu.isConnected,false);assert.equal(f.editor.store.read().raw,raw);
 assert.deepEqual([...f.root.children].map(node=>node.id),['context-copy','context-paste',KEY,foreign.id]);
});
