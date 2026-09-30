import test from 'node:test';import assert from 'node:assert/strict';import {readFile,access} from 'node:fs/promises';import {JSDOM} from 'jsdom';
test('Sine manifest resolves one entry, actor modules, preferences and style',async()=>{
  const theme=JSON.parse(await readFile(new URL('../theme.json',import.meta.url),'utf8'));
  assert.deepEqual(Object.keys(theme.scripts),['define-word.uc.js']);assert.equal(theme.supportsUnload,true);
  assert(theme.scripts['define-word.uc.js'].include.includes('about:preferences*'));
  assert(theme.scripts['define-word.uc.js'].include.includes('about:settings*'));
  for(const path of ['define-word.uc.js',theme.preferences,theme.style.chrome,'assets/define-word.svg','src/selection.sys.mjs','actors/DefineWordParent.sys.mjs','actors/DefineWordChild.sys.mjs'])await access(new URL('../'+path,import.meta.url));
});
test('built entry reloads without duplicate controls and completely unloads',async()=>{
  const source=await readFile(new URL('../define-word.uc.js',import.meta.url),'utf8');
  const dom=new JSDOM('<div id="mainPopupSet"></div><div id="contentAreaContextMenu"></div><div id="browser"></div>',{runScripts:'outside-only'}),w=dom.window;
  Object.defineProperty(w.document,'readyState',{value:'complete',configurable:true});
  w.document.createXULElement=tag=>{const n=w.document.createElement(tag);n.openPopup=()=>{};n.hidePopup=()=>{};return n;};
  const observers=new Set(),unloaders=new Set();let acquired=0,released=0;
  w.Services={prefs:{getStringPref:(k,d)=>d,addObserver:(p,o)=>observers.add(o),removeObserver:(p,o)=>observers.delete(o)},obs:{addObserver(){},removeObserver(){}},logins:{isLoggedIn:true},focus:{}};
  w.ChromeUtils={importESModule:()=>({acquireSelectionService:()=>{acquired++;return {capture:async()=>null,release:()=>released++};}})};
  w.addUnloadListener=f=>unloaders.add(f);w.gBrowser={selectedBrowser:w.document.getElementById('browser'),tabContainer:new w.EventTarget(),addTabsProgressListener(){},removeTabsProgressListener(){}};w.fetch=()=>{throw Error('No request expected');};
  w.eval(source);assert.equal(w.document.querySelectorAll('#define-word-menu').length,1);w.eval(source);assert.equal(w.document.querySelectorAll('#define-word-menu').length,1);assert.equal(w.document.querySelectorAll('#define-word-panel').length,1);assert.equal(observers.size,1);assert.equal(acquired-released,1);
  for(const unload of unloaders)unload();assert.equal(w.document.querySelectorAll('#define-word-menu,#define-word-panel').length,0);assert.equal(observers.size,0);assert.equal(acquired,released);dom.window.close();
});
