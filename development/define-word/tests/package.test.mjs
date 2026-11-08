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

test('one package version reaches every module URL and the actor name',async()=>{
  const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');
  const {version}=JSON.parse(await read('package.json'));assert.equal(JSON.parse(await read('theme.json')).version,version);
  globalThis.JSWindowActorChild??=class {};globalThis.JSWindowActorParent??=class {};
  const selection=await import('../src/selection.sys.mjs'),child=await import('../actors/DefineWordChild.sys.mjs'),parent=await import('../actors/DefineWordParent.sys.mjs');
  assert.equal(selection.VERSION,version);assert.equal(selection.ACTOR_NAME,`DefineWordV${version.replace(/\./g,'_')}`);
  assert.equal(typeof child[`${selection.ACTOR_NAME}Child`],'function');assert.equal(typeof parent[`${selection.ACTOR_NAME}Parent`],'function');
  let registration;selection.createSelectionService({chrome:{registerWindowActor:(name,options)=>registration={name,options},unregisterWindowActor(){}},services:{}}).acquire().release();
  assert.equal(registration.name,selection.ACTOR_NAME);
  assert.equal(registration.options.parent.esModuleURI,`chrome://sine/content/define-word/actors/DefineWordParent.sys.mjs?v=${version}`);
  assert.equal(registration.options.child.esModuleURI,`chrome://sine/content/define-word/actors/DefineWordChild.sys.mjs?v=${version}`);
  // Static imports and any literal cache-buster in runtime files use the same version.
  for(const path of ['define-word.uc.js','src/selection.sys.mjs','actors/DefineWordChild.sys.mjs','actors/DefineWordParent.sys.mjs','src/entry.js','src/sine-settings.mjs'])
    for(const [,stamp] of (await read(path)).matchAll(/\?v=([^'"`$\s)]+)/g))assert.equal(stamp,version,`${path} has a stale ?v=${stamp}`);
  assert((await read("actors/DefineWordChild.sys.mjs")).includes(`from '../src/selection.sys.mjs?v=${version}'`));
  // The built entry imports the selection module and loads settings CSS at this version.
  const source=await read('define-word.uc.js');assert(source.startsWith(`// Define Word ${version} `));
  const imported=[];const dom=new JSDOM('<div id="mainPopupSet"></div><div id="contentAreaContextMenu"></div><div id="browser"></div>',{runScripts:'outside-only'}),w=dom.window;
  Object.defineProperty(w.document,'readyState',{value:'complete',configurable:true});
  w.document.createXULElement=tag=>{const n=w.document.createElement(tag);n.openPopup=()=>{};n.hidePopup=()=>{};return n;};
  w.Services={prefs:{getStringPref:(k,d)=>d,addObserver(){},removeObserver(){}},obs:{addObserver(){},removeObserver(){}},logins:{isLoggedIn:true},focus:{}};
  w.ChromeUtils={importESModule:url=>{imported.push(url);return {acquireSelectionService:()=>({capture:async()=>null,release(){}})};}};
  w.gBrowser={selectedBrowser:w.document.getElementById('browser'),tabContainer:new w.EventTarget(),addTabsProgressListener(){},removeTabsProgressListener(){}};w.fetch=()=>{throw Error('No request expected');};
  w.eval(source);assert.deepEqual(imported,[`chrome://sine/content/define-word/src/selection.sys.mjs?v=${version}`]);assert.equal(w.__defineWord.version,version);
  w.__defineWord.unload();dom.window.close();
  const settings=new JSDOM('',{runScripts:'outside-only',url:'about:preferences#sineMods'}).window;settings.Services=w.Services;settings.ChromeUtils=w.ChromeUtils;
  Object.defineProperty(settings.document,'readyState',{value:'complete',configurable:true});settings.eval(source);
  assert.equal(settings.document.querySelector('link[rel=stylesheet]').getAttribute('href'),`chrome://sine/content/define-word/style.css?v=${version}`);
  settings.__defineWord.unload();settings.close();
});

test('settings observers cover only prefs that change live window state',async()=>{
  const source=await readFile(new URL('../define-word.uc.js',import.meta.url),'utf8');
  const dom=new JSDOM('<div id="mainPopupSet"></div><div id="contentAreaContextMenu"></div><div id="browser"></div>',{runScripts:'outside-only'}),w=dom.window;
  Object.defineProperty(w.document,'readyState',{value:'complete',configurable:true});
  w.document.createXULElement=tag=>{const n=w.document.createElement(tag);n.openPopup=()=>{};n.hidePopup=()=>{};return n;};
  const values=new Map(),registrations=[];
  w.Services={prefs:{getStringPref:(k,d)=>values.get(k)??d,getBoolPref:(k,d)=>values.get(k)??d,addObserver:(domain,observer)=>registrations.push({domain,observer}),
    removeObserver:(domain,observer)=>{const index=registrations.findIndex(r=>r.domain===domain&&r.observer===observer);assert(index>=0,`unknown observer for ${domain}`);registrations.splice(index,1);}},
    obs:{addObserver(){},removeObserver(){}},logins:{isLoggedIn:true},focus:{}};
  w.ChromeUtils={importESModule:()=>({acquireSelectionService:()=>({capture:async()=>null,release(){}})})};
  w.gBrowser={selectedBrowser:w.document.getElementById('browser'),tabContainer:new w.EventTarget(),addTabsProgressListener(){},removeTabsProgressListener(){}};w.fetch=()=>{throw Error('No request expected');};
  let scans=0;const query=w.document.querySelectorAll.bind(w.document);w.document.querySelectorAll=selector=>{if(selector==='key')scans++;return query(selector);};
  w.eval(source);
  assert.deepEqual(registrations.map(r=>r.domain).sort(),['extension.define-word.shortcut','extension.define-word.show-icon','extension.define-word.text-size'],
    'dictionary choices and popup-size writes must not notify every window');
  const notify=name=>{for(const r of registrations)if(name.startsWith(r.domain))r.observer.observe(null,'nsPref:changed',name);};
  scans=0;values.set('extension.define-word.text-size','20');notify('extension.define-word.text-size');
  assert.equal(w.document.querySelector('.dw-shell').style.getPropertyValue('--dw-text-size'),'20px');
  values.set('extension.define-word.show-icon',false);notify('extension.define-word.show-icon');assert(!w.document.getElementById('define-word-menu').hasAttribute('image'));
  assert.equal(scans,0,'appearance changes must not rescan browser shortcuts');
  values.set('extension.define-word.shortcut',JSON.stringify({code:'KeyF',ctrl:true,alt:true,shift:false,meta:false}));notify('extension.define-word.shortcut');assert.equal(scans,1);
  for(const name of ['popup-size','english','hebrew'])notify(`extension.define-word.${name}`);assert.equal(scans,1);
  w.__defineWord.unload();assert.equal(registrations.length,0);dom.window.close();
});
