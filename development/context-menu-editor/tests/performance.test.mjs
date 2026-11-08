import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {makeDOM,JSDOM} from './dom.mjs';
import {createMenuController} from '../src/controller.mjs';
import {createStore,SETTINGS_PREF} from '../src/store.mjs';
import {createIconService} from '../src/icons.mjs';
import {createSourceTracker} from '../src/sources.mjs';
import {createState,serializeState} from '../src/model.mjs';

// These tests pin work that must NOT happen: whole-document rescans, repeated
// rediscovery of popups already known to need no editing, repeated settings
// parsing and eager stack formatting. Behavior itself is covered elsewhere.
const wait=()=>new Promise(resolve=>setTimeout(resolve,0));
const MOD={kind:'mod',id:'foreign',name:'Foreign Tools'};

function fixture(t,{markup='',records={a:{kind:'command',name:'Custom'},b:{kind:'command'},custom:{kind:'submenu',name:'More',children:['a']}},children=['custom','b'],owned=()=>false}={}){
 const dom=makeDOM(`<menupopup id="contentAreaContextMenu"><menuitem id="a" label="Owner A"></menuitem><menuitem id="b" label="Owner B"></menuitem></menupopup><div id="mainPopupSet"><menupopup id="plain-popup"><menuitem id="plain-item" label="Plain"></menuitem></menupopup>${markup}</div><div id="tabs"></div>`);
 const w=dom.window,document=w.document,root=document.getElementById('contentAreaContextMenu');
 const counts={scans:0,plain:0,sources:0};
 const select=document.querySelectorAll.bind(document);
 document.querySelectorAll=selector=>{if(selector==='menupopup[id]')counts.scans++;return select(selector);};
 const state={version:1,options:{enabled:true},roots:{contentAreaContextMenu:{children,records}}};
 const ctl=createMenuController(w,{getState:()=>state,resolveIcon:()=>({type:'text',text:'*'}),resolveSource:node=>{
  counts.sources++;if(node.closest?.('#plain-popup'))counts.plain++;
  return owned(node)?MOD:null;
 }});
 const reset=()=>{counts.scans=0;counts.plain=0;counts.sources=0;};
 const event=(name,target=root)=>target.dispatchEvent(new w.Event(name,{bubbles:true,cancelable:true}));
 t.after(()=>{ctl.destroy();dom.window.close();});
 return {w,document,root,state,ctl,counts,reset,event,inventory:id=>ctl.getInventory().find(menu=>menu.id===id)};
}

test('opening and closing a menu with editor-owned submenus never rescans the document',async t=>{
 const f=fixture(t);assert.ok(f.counts.plain>0,'the initial scan inspects the untracked popup once');f.reset();
 for(let i=0;i<3;i++){
  f.event('popupshowing');await wait();
  assert.ok(f.root.querySelector('menu[data-cme-owned] > menupopup'),'the custom submenu is applied');
  assert.notEqual(f.document.getElementById('a').parentElement,f.root);
  f.event('popuphiding');f.event('popuphidden');await wait();
  assert.equal(f.root.querySelector('[data-cme-owned]'),null);
 }
 assert.equal(f.counts.scans,0,'the editor\'s own insertions and removals must not trigger sync()');
 assert.equal(f.counts.plain,0,'an untracked popup is not rediscovered because of another menu opening');
});

test('unrelated chrome churn performs no rescans, no source lookups and no removed-subtree searches',async t=>{
 const f=fixture(t),tabs=f.document.getElementById('tabs');f.reset();
 let searches=0;const search=f.w.Element.prototype.querySelector;
 f.w.Element.prototype.querySelector=function(selector){if(selector==='menupopup')searches++;return search.call(this,selector);};
 t.after(()=>{f.w.Element.prototype.querySelector=search;});
 const leaves=[];for(let i=0;i<40;i++){const tab=f.document.createElement('div');tab.className='tab';tabs.append(tab);leaves.push(tab);}
 await wait();
 for(const tab of leaves)tab.setAttribute('selected','true');
 for(const tab of leaves)tab.remove();
 const subtree=f.document.createElement('div');subtree.innerHTML='<span><b>label</b></span>';tabs.append(subtree);await wait();
 const searchesBeforeRemoval=searches;subtree.remove();await wait();
 assert.equal(f.counts.scans,0);assert.equal(f.counts.sources,0);
 assert.equal(searchesBeforeRemoval,1,'only the added non-leaf subtree is searched for a popup');
 assert.equal(searches,searchesBeforeRemoval,'removed subtrees are never searched');
});

test('popup insertions coalesce into one cheap scan that skips popups already known to need no editing',async t=>{
 const f=fixture(t),tabs=f.document.getElementById('tabs');f.reset();
 for(let i=0;i<5;i++){const menu=f.document.createElement('menu');menu.append(f.document.createElement('menupopup'));tabs.append(menu);}
 await wait();
 assert.equal(f.counts.scans,1,'one batch of insertions causes one sync()');
 assert.equal(f.counts.plain,0,'the unchanged untracked popup is not rediscovered');
 // A change inside that popup invalidates only its cached result.
 const late=f.document.createElement('menuitem');late.setAttribute('label','Late');f.document.getElementById('plain-popup').append(late);
 await wait();assert.equal(f.counts.scans,1,'a row inside an untracked popup does not itself rescan');
 const other=f.document.createElement('menupopup');other.id='other-popup';f.document.getElementById('mainPopupSet').append(other);await wait();
 assert.equal(f.counts.scans,2);assert.ok(f.counts.plain>0,'the changed popup is rediscovered on the next scan');
});

test('opening an untracked popup rechecks only that popup and still adopts unobservable mod ownership',async t=>{
 let modOwned=false;
 const f=fixture(t,{markup:'<menupopup id="quiet-popup"><menuitem id="quiet-item" label="Quiet"></menuitem></menupopup>',owned:node=>modOwned&&Boolean(node.closest?.('#quiet-popup'))});
 f.reset();
 // A mod listener attached without any DOM change is invisible to observers.
 modOwned=true;
 f.event('popupshowing',f.document.getElementById('quiet-popup'));await wait();
 assert.ok(f.inventory('quiet-popup'),'the opened popup is adopted on this opening');
 assert.equal(f.counts.plain,0,'other untracked popups are not rediscovered when one opens');
});

test('refresh still rediscovers every untracked popup',async t=>{
 let modOwned=false;
 const f=fixture(t,{owned:node=>modOwned&&Boolean(node.closest?.('#plain-popup'))});
 assert.equal(f.inventory('plain-popup'),undefined);modOwned=true;f.reset();
 f.ctl.refresh();assert.ok(f.counts.plain>0);assert.ok(f.inventory('plain-popup'));
});

test('tracked roots removed with an ancestor are released and nested built-in roots still attach',async t=>{
 const f=fixture(t,{markup:'<div id="holder"><menupopup id="mod-popup"><menuitem id="mod-item" label="Mod"></menuitem></menupopup></div>',owned:node=>Boolean(node.closest?.('#mod-popup'))});
 assert.ok(f.inventory('mod-popup'));
 f.document.getElementById('holder').remove();await wait();
 assert.equal(f.inventory('mod-popup'),undefined,'a root removed inside its container is released');
 const menu=f.document.createElement('menu'),tabs=f.document.createElement('menupopup');tabs.id='tabContextMenu';
 const item=f.document.createElement('menuitem');item.id='tab-new';tabs.append(item);menu.append(tabs);
 // Inside another tracked root, so only the cheap built-in root check sees it.
 f.root.append(menu);
 await wait();assert.ok(f.inventory('tabContextMenu')?.items.some(row=>row.key==='tab-new'));
});

function prefs(initial=''){
 const values=new Map([[SETTINGS_PREF,initial]]),observers=new Set();
 return {getStringPref:(key,fallback='')=>values.get(key)??fallback,setStringPref(key,value){values.set(key,value);for(const observer of observers)observer.observe(null,'nsPref:changed',key);},
  addObserver(_key,observer){observers.add(observer);},removeObserver(_key,observer){observers.delete(observer);}};
}
function countParses(t){
 const parse=JSON.parse,counter={count:0};
 JSON.parse=function(...args){counter.count++;return parse.apply(this,args);};
 t.after(()=>{JSON.parse=parse;});
 return counter;
}

test('saved settings are parsed and validated once per raw value and shared read-only',t=>{
 const state=createState();state.options.iconSize=20;
 const p=prefs(serializeState(state)),store=createStore(p),parses=countParses(t);
 const first=store.read();for(let i=0;i<5;i++)assert.equal(store.read(),first);
 assert.equal(parses.count,1);assert.equal(first.state.options.iconSize,20);
 assert.ok(Object.isFrozen(first)&&Object.isFrozen(first.state)&&Object.isFrozen(first.state.options)&&Object.isFrozen(first.state.roots));
 assert.throws(()=>{first.state.options.iconSize=12;},TypeError);
 const next=createState();next.options.iconGap=12;store.save(next,first.raw);
 const second=store.read();assert.notEqual(second,first);assert.equal(second.state.options.iconGap,12);
 const before=parses.count;store.read();store.read();assert.equal(parses.count,before);
 p.setStringPref(SETTINGS_PREF,'{broken');const broken=store.read();assert.ok(broken.error);
 const attempts=parses.count;assert.equal(store.read(),broken);assert.equal(parses.count,attempts);
 store.destroy();
});

test('repeated menu openings do not reparse unchanged saved settings',async t=>{
 const dom=makeDOM('<menupopup id="contentAreaContextMenu"><menuitem id="a" label="Owner A"></menuitem></menupopup>'),w=dom.window,root=w.document.getElementById('contentAreaContextMenu');
 const state=createState();state.roots.contentAreaContextMenu={children:['a'],records:{a:{kind:'command',name:'Custom',hidden:false,removed:false,showIcon:true}}};
 const store=createStore(prefs(serializeState(state)));
 const ctl=createMenuController(w,{getState:()=>store.read().state});
 t.after(()=>{ctl.destroy();store.destroy();dom.window.close();});
 const parses=countParses(t);
 for(let i=0;i<4;i++){root.dispatchEvent(new w.Event('popupshowing',{bubbles:true,cancelable:true}));await wait();assert.equal(w.document.getElementById('a').getAttribute('label'),'Custom');root.dispatchEvent(new w.Event('popuphiding',{bubbles:true}));}
 assert.ok(parses.count<=1,`settings were parsed ${parses.count} times`);
});

test('a saved PNG icon is validated once across menu openings',t=>{
 const PNG32='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAGUlEQVRYhe3BMQEAAADCoPVPbQ0PoAAAAOBvAjAAAfkG7AAAAABJRU5ErkJggg==';
 const dom=makeDOM(),w=dom.window;t.after(()=>dom.window.close());
 let decodes=0;const atob=w.atob.bind(w);w.atob=value=>{decodes++;return atob(value);};
 const icons=createIconService(w,{fetch:()=>{throw new Error('offline');}}),record={kind:'command',icon:{kind:'image',data:PNG32}};
 for(let i=0;i<5;i++)assert.equal(icons.resolve({key:'a',kind:'command'},record,{}).src,PNG32);
 assert.equal(decodes,1);
 assert.equal(icons.resolve({key:'a',kind:'command'},{kind:'command',icon:{kind:'image',data:'data:image/png;base64,AAAA'}},{}).source,'fallback');
});

test('creation stacks are formatted only when a node is attributed, with unchanged attribution',t=>{
 const dom=new JSDOM('<menupopup id="contentAreaContextMenu"></menupopup>',{url:'chrome://browser/content/browser.xhtml',runScripts:'outside-only'});
 const w=dom.window;w.document.createXULElement=name=>w.document.createElement(name);
 const Base=w.Error;let reads=0;
 w.Error=function(...args){const error=new Base(...args);return new Proxy(error,{get(target,key){if(key==='stack')reads++;return Reflect.get(target,key);}});};
 const tracker=createSourceTracker(w,{initialMods:{beta:{id:'beta',name:'Beta Menu'}}});
 t.after(()=>{tracker.destroy();w.close();});
 w.eval(`for(let i=0;i<20;i++){const item=document.createXULElement('menuitem');item.id='made-'+i;document.querySelector('menupopup').append(item);}\n//# sourceURL=chrome://sine/content/beta/menu.uc.js`);
 const plain=w.document.createXULElement('menuitem');
 assert.equal(reads,0,'creating menu elements must not format stacks');
 const first=w.document.getElementById('made-0');
 assert.equal(tracker.resolve(first).id,'beta');assert.equal(reads,1);
 assert.equal(tracker.resolve(first).id,'beta');assert.equal(reads,1,'the attributed source is remembered');
 assert.equal(tracker.resolve(w.document.getElementById('made-7')).name,'Beta Menu');assert.equal(reads,2);
 assert.equal(tracker.resolve(plain).kind,'unknown');
});

test('the stylesheet cache-buster, manifest and package versions agree',async()=>{
 const manifest=JSON.parse(await readFile(new URL('../theme.json',import.meta.url),'utf8'));
 const pkg=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
 const entry=await readFile(new URL('../src/entry.mjs',import.meta.url),'utf8');
 const bundle=await readFile(new URL('../../../context-menu-editor/context-menu-editor.uc.js',import.meta.url),'utf8');
 assert.equal(pkg.version,manifest.version);
 // The source takes the version from the build, never from a hand-edited literal.
 assert.match(entry,/style\.css\?v=\$\{VERSION\}/);
 assert.doesNotMatch(entry,/style\.css\?v=[\d.]/);
 assert.ok(bundle.includes(JSON.stringify(manifest.version)),'the bundle embeds the manifest version');
 assert.match(bundle,/style\.css\?v=\$\{VERSION\}/);
});
