import test from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';
import {createController} from '../src/controller.mjs';
const tick=()=>new Promise(r=>setImmediate(r));
function fixture(){
  const dom=new JSDOM('<div id="contentAreaContextMenu"></div>');const w=dom.window;w.document.createXULElement=t=>w.document.createElement(t);
  const listeners=new Set();w.gBrowser={selectedBrowser:{},tabContainer:new w.EventTarget(),addTabsProgressListener:l=>listeners.add(l),removeTabsProgressListener:l=>listeners.delete(l)};let selection='first',visible=false,destroyed=0,states=[],current=true,callbacks;const pending=[];
  const deps={selection:{capture:async()=>({rawText:selection}),isCurrent:()=>current,release(){ }},settings:()=>({englishProvider:'wiktionary-en',hebrewProvider:'wiktionary-he'}),providers:new Map([['wiktionary-en',{id:'wiktionary-en',language:'en',label:'Wiktionary'}]]),lookup:{lookup:args=>new Promise(resolve=>pending.push({args,resolve}))},createPopup:(_w,c)=>{callbacks=c;return {show(){visible=true;},render(s){states.push(s);},close(){visible=false;closes++;},destroy(){destroyed++;}};}};let closes=0;
  const c=createController(w,deps);return {w,c,deps,pending,states,listeners,get callbacks(){return callbacks;},invalidate(){current=false;},setSelection:s=>selection=s,get visible(){return visible;},get destroyed(){return destroyed;},get closes(){return closes;},close(){c.destroy();dom.window.close();}};
}

test('unexpected lookup rejection always replaces loading with an error',async t=>{const h=fixture();t.after(()=>h.close());h.deps.lookup.lookup=async()=>{throw null;};await h.c.define();assert.equal(h.states.at(-1).outcome.status,'unavailable');});
test('editing a query cancels old results and Enter detects Hebrew in the same popup',async t=>{const h=fixture();t.after(()=>h.close());h.deps.providers.set('wiktionary-he',{id:'wiktionary-he',language:'he',label:'ויקימילון'});h.c.define();await tick();h.callbacks.onQueryInput('בית');assert(h.pending[0].args.signal.aborted);h.callbacks.onSearch('בית');await tick();assert.equal(h.pending[1].args.providerId,'wiktionary-he');assert.equal(h.pending[1].args.term.query,'בית');h.pending[0].resolve({status:'no-result'});await tick();assert.equal(h.states.at(-1).term.query,'בית');});
test('Enter requests matches and ignores suggestions after closure',async t=>{const h=fixture();t.after(()=>h.close());const matches=[];h.deps.lookup.suggest=args=>new Promise(resolve=>matches.push({args,resolve}));h.c.define();await tick();assert.equal(matches.length,1);h.callbacks.onSearch('browser');await tick();assert.equal(matches.at(-1).args.term.query,'browser');h.c.close();assert(matches.at(-1).args.signal.aborted);matches.at(-1).resolve({status:'ok',suggestions:[{word:'browser',language:'en'}]});await tick();assert(!h.visible);});
test('rapid lookup keeps newer word even when old lookup resolves last',async t=>{const h=fixture();t.after(()=>h.close());h.c.define();await tick();h.setSelection('second');h.c.define();await tick();h.pending[1].resolve({status:'no-result'});await tick();h.pending[0].resolve({status:'ok',definition:{headword:'first'}});await tick();assert.equal(h.states.at(-1).term.query,'second');assert.equal(h.states.at(-1).outcome.status,'no-result');});
test('retriggering while popup owns focus keeps the invoking selection when content focus is unavailable',async t=>{
  const h=fixture();t.after(()=>h.close());h.c.define();await tick();
  h.setSelection('');h.c.define();await tick();
  assert.equal(h.states.at(-1).term.query,'first');assert.equal(h.pending.length,2);
});
test('retrigger does not reuse old text after the popup was dismissed or tab changed',async t=>{
  const h=fixture();t.after(()=>h.close());h.c.define();await tick();h.c.close();
  h.setSelection('');await h.c.define();assert.equal(h.states.at(-1).term.status,'empty');
});
test('close and tab switch cancel late results without reopening popup',async t=>{const h=fixture();t.after(()=>h.close());h.c.define();await tick();h.w.gBrowser.tabContainer.dispatchEvent(new h.w.Event('TabSelect'));assert.equal(h.visible,false);assert(h.pending[0].args.signal.aborted);const count=h.states.length;h.pending[0].resolve({status:'no-result'});await tick();assert.equal(h.states.length,count);assert.equal(h.visible,false);});
test('replacement controller removes prior menu and owns exactly one action',t=>{const h=fixture();t.after(()=>h.close());assert.equal(h.w.document.querySelectorAll('#define-word-menu').length,1);h.c.destroy();h.c.destroy();assert.equal(h.w.document.querySelectorAll('#define-word-menu').length,0);assert.equal(h.destroyed,1);});
test('menu hidden for empty selection and password fields',t=>{const h=fixture();t.after(()=>h.close());const menu=h.w.document.getElementById('contentAreaContextMenu'),item=h.w.document.getElementById('define-word-menu');h.w.gContextMenu={isTextSelected:true,selectionInfo:{text:'secret'},onPassword:true};menu.dispatchEvent(new h.w.Event('popupshowing'));assert(item.hidden);h.w.gContextMenu={isTextSelected:true,selectionInfo:{text:'hello'},onPassword:false};menu.dispatchEvent(new h.w.Event('popupshowing'));assert(!item.hidden);});

test('menu icon is visible by default and can be disabled without removing Define',t=>{const h=fixture();t.after(()=>h.close());const item=h.w.document.getElementById('define-word-menu');assert(item.classList.contains('menuitem-iconic'));assert.equal(item.getAttribute('image'),'chrome://sine/content/define-word/assets/define-word.svg');h.c.updateAppearance({showIcon:false});assert(!item.hasAttribute('image'));assert(!item.classList.contains('menuitem-iconic'));assert(item.isConnected);h.c.updateAppearance({showIcon:true});assert(item.hasAttribute('image'));});

test('same-tab navigation cancels work and removes the progress listener on destroy',async t=>{const h=fixture();t.after(()=>h.close());h.c.define();await tick();assert.equal(h.listeners.size,1);for(const listener of h.listeners)listener.onLocationChange(h.w.gBrowser.selectedBrowser,{isTopLevel:true});assert(h.pending[0].args.signal.aborted);assert(!h.visible);const count=h.states.length;h.pending[0].resolve({status:'no-result'});await tick();assert.equal(h.states.length,count);h.c.destroy();assert.equal(h.listeners.size,0);});

test('replaced invoking frame rejects a result even before location notification and cannot be rerun',async t=>{const h=fixture();t.after(()=>h.close());h.c.define();await tick();h.invalidate();const count=h.states.length;h.pending[0].resolve({status:'no-result'});await tick();assert.equal(h.states.length,count);assert(!h.visible);h.callbacks.onProviderChange('wiktionary-en');await tick();assert.equal(h.pending.length,1);});

test('a closed popup ignores tab switches, tab closes and navigation',async t=>{
  const h=fixture();t.after(()=>h.close());const browser=h.w.gBrowser.selectedBrowser;
  h.c.define();await tick();h.c.close();const count=h.closes;
  const closed=new h.w.Event('TabClose');Object.defineProperty(closed,'target',{value:{linkedBrowser:browser}});
  for(let i=0;i<3;i++){h.w.gBrowser.tabContainer.dispatchEvent(new h.w.Event('TabSelect'));h.w.gBrowser.tabContainer.dispatchEvent(closed);for(const listener of h.listeners)listener.onLocationChange(browser,{isTopLevel:true},null,null,0);}
  assert.equal(h.closes,count,'idle tab and location events must not repeat popup cleanup');
});
test('a tab switch while the selection is still being captured cancels that invocation',async t=>{
  const h=fixture();t.after(()=>h.close());let resolve;h.deps.selection.capture=()=>new Promise(r=>resolve=r);
  const operation=h.c.define();h.w.gBrowser.tabContainer.dispatchEvent(new h.w.Event('TabSelect'));resolve({rawText:'late'});await operation;
  assert.equal(h.pending.length,0);assert.equal(h.visible,false);assert.equal(h.states.length,0);
});
test('same-document and unrelated subframe location changes keep the popup; real navigation closes it',async t=>{
  const h=fixture();t.after(()=>h.close());const browser=h.w.gBrowser.selectedBrowser,notify=(...args)=>{for(const listener of h.listeners)listener.onLocationChange(browser,...args);};
  h.c.define();await tick();
  notify({isTopLevel:true},null,null,0x1);// history.pushState or a fragment link
  notify({isTopLevel:false},null,null,0);// an unrelated iframe loads
  notify({isTopLevel:false},null,null,0x1);
  assert(h.visible);assert(!h.pending[0].args.signal.aborted);
  h.pending[0].resolve({status:'ok',definition:{headword:'first'}});await tick();assert.equal(h.states.at(-1).outcome.status,'ok');
  h.invalidate();notify({isTopLevel:false},null,null,0);// the selected frame itself was replaced
  assert(!h.visible,'a subframe load that replaced the selected frame closes the popup');
  const n=fixture();t.after(()=>n.close());n.c.define();await tick();assert(n.visible);
  for(const listener of n.listeners)listener.onLocationChange(n.w.gBrowser.selectedBrowser,{isTopLevel:true},null,null,0);
  assert(!n.visible,'top-level navigation closes the popup');assert(n.pending[0].args.signal.aborted);
});

test('an unexpected lookup rejection is logged with its provider in the browser console (0.3.6)',async t=>{
  const h=fixture();t.after(()=>h.close());const warned=[],error=new TypeError('fixture parser failure');
  h.w.console.warn=(...args)=>warned.push(args);h.deps.lookup.lookup=async()=>{throw error;};
  await h.c.define();assert.equal(h.states.at(-1).outcome.status,'unavailable');
  assert.equal(warned.length,1);assert.match(warned[0][0],/wiktionary-en/);assert.equal(warned[0][1],error);
});

test('Define sits after the native selection search item, ignores submenu openings and is removed on destroy (0.3.6)',t=>{
  const dom=new JSDOM('<div id="contentAreaContextMenu"><div id="context-searchselect"></div><div id="context-searchselect-private"></div><div id="submenu"><div id="subpopup"></div></div></div>'),w=dom.window;
  w.document.createXULElement=tag=>w.document.createElement(tag);
  w.gBrowser={selectedBrowser:{},tabContainer:new w.EventTarget(),addTabsProgressListener(){},removeTabsProgressListener(){}};
  const c=createController(w,{selection:{capture:async()=>null,isCurrent:()=>true,release(){}},settings:()=>({}),providers:new Map(),lookup:{},createPopup:()=>({show(){},render(){},close(){},destroy(){}})});
  t.after(()=>{c.destroy();dom.window.close();});
  const menu=w.document.getElementById('contentAreaContextMenu'),item=w.document.getElementById('define-word-menu');
  assert.equal(w.document.getElementById('context-searchselect').nextElementSibling,item);
  w.gContextMenu={selectionInfo:{text:'hello'},onPassword:false};menu.dispatchEvent(new w.Event('popupshowing'));
  assert(!item.hidden);const label=item.getAttribute('label');assert.match(label,/hello/);
  w.gContextMenu={selectionInfo:{text:''},onPassword:false};w.document.getElementById('subpopup').dispatchEvent(new w.Event('popupshowing',{bubbles:true}));
  assert(!item.hidden,'a submenu opening must not hide Define');assert.equal(item.getAttribute('label'),label,'a submenu opening must not relabel Define');
  c.destroy();assert.equal(w.document.getElementById('define-word-menu'),null);
});

test('typing never requests suggestions from keyed providers; a search still does, and keyless typing still suggests (0.3.6)',async t=>{
  const h=fixture();t.after(()=>h.close());const suggested=[],timers=[];
  h.deps.lookup.suggest=async args=>{suggested.push(args.providerId);return {status:'ok',suggestions:[]};};
  h.deps.providers.set('keyed',{id:'keyed',language:'en',label:'Keyed',keyRequired:true});
  h.deps.settings=()=>({englishProvider:'keyed',hebrewProvider:'wiktionary-he'});
  h.w.setTimeout=callback=>{timers.push(callback);return timers.length;};
  h.c.define();await tick();assert.deepEqual(suggested,['keyed'],'an explicit lookup may suggest');
  h.callbacks.onQueryInput('brows');for(const callback of timers.splice(0))callback();await tick();
  assert.deepEqual(suggested,['keyed'],'typing makes no keyed request');
  h.callbacks.onSearch('browse');await tick();assert.deepEqual(suggested,['keyed','keyed']);
  const k=fixture();t.after(()=>k.close());const free=[],pending=[];
  k.deps.lookup.suggest=async args=>{free.push(args.providerId);return {status:'ok',suggestions:[]};};k.w.setTimeout=callback=>{pending.push(callback);return pending.length;};
  k.c.define();await tick();free.length=0;k.callbacks.onQueryInput('brows');for(const callback of pending.splice(0))callback();await tick();
  assert.deepEqual(free,['wiktionary-en'],'keyless providers keep typing suggestions');
});
