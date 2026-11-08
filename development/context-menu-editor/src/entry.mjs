import {createState,serializeState} from './model.mjs';
import {createStore} from './store.mjs';
import {createIconService} from './icons.mjs';
import {createMenuController} from './controller.mjs';
import {createSineSettingsBridge} from './sine-settings.mjs';
import {createSourceTracker,browserMarkupIds} from './sources.mjs';
import {createOwnerSettingsObserver,applyOwnerChanges} from './owner-settings.mjs';
import {initializeLegacySettings} from './legacy.mjs';

const TOPIC='context-menu-editor-inventory';
// Announces, before the write, the exact settings value an owner change saves.
// Other windows then know that write is not a user edit (see B5 in DEVELOPMENT.md).
const OWNER_WRITE_TOPIC='context-menu-editor-owner-write';
const BASE='chrome://sine/content/context-menu-editor/';
// build.mjs replaces __CME_VERSION__ with theme.json's version.
const VERSION=typeof __CME_VERSION__==='string'?__CME_VERSION__:'dev';

const loadSineMods=async()=>ChromeUtils.importESModule('chrome://userscripts/content/core/utils.sys.mjs').default.getMods();

/** The browser.xhtml menu IDs depend only on the installed build. Reuse the set
 * another open browser window already parsed for this build. */
function sharedMarkup(services,build){
 try{
  const windows=services.wm?.getEnumerator('navigator:browser');
  while(windows?.hasMoreElements()){
   const markup=windows.getNext().__contextMenuEditor?.browserMarkup;
   if(markup?.build===build)return markup;
  }
 }catch{/* Another window's state is only an optimization. */}
 return null;
}

async function loadMarkup(window,services){
 const build=`${services.appinfo?.appBuildID||''}:${services.appinfo?.version||''}`;
 const shared=sharedMarkup(services,build);
 if(shared)return shared;
 const response=await window.fetch('chrome://browser/content/browser.xhtml');
 const text=await response.text();
 if(text.length>2*1024*1024)return null;
 return {build,...browserMarkupIds(window,text)};
}

export function startContextMenuEditor(window,{Services:services}={}){
 services??=typeof Services!=='undefined'?Services:globalThis.Services;
 if(!services?.prefs)throw new Error('Context Menu Editor needs the browser preference service.');
 try{initializeLegacySettings(services.prefs);}
 catch(problem){window.console?.warn?.('Context Menu Editor could not import previous settings.',problem);}
 window.__contextMenuEditor?.unload();

 let disposed=false,offStore=()=>{},controller=null,bridge=null,sources=null,ownerSettings=null;
 let ownerWrite=false,ownerRaw=null,markup=null,markupState='pending',stylesheet=null;
 const store=createStore(services.prefs,{onError:problem=>window.console?.warn?.('Context Menu Editor could not refresh settings.',problem)});
 const browserWindow=()=>window.browsingContext?.topChromeWindow||(/^chrome:/.test(window.location.href)?window:services.wm?.getMostRecentWindow('navigator:browser'));
 // about:preferences blocks external fetches through its document CSP. Keep
 // decoding in this window but use its browser's privileged transport for the
 // explicit HTTPS import, with the icon service's limits and request policy.
 const icons=createIconService(window,{baseURL:BASE,fetch:(...args)=>browserWindow().fetch(...args)});
 const ownerWriteObserver={observe(_subject,_topic,data){ownerRaw=data;}};

 const owner={
  get disposed(){return disposed;},
  get controller(){return controller;},
  get browserMarkup(){return markup;},
  store,
  /** Read-only provenance for diagnostics and native tests. */
  resolveSource:node=>sources?.resolve(node)||null,
  unload(){
   if(disposed)return;
   disposed=true;
   offStore();
   ownerSettings?.destroy();
   bridge?.destroy();
   controller?.destroy();
   sources?.destroy();
   store.destroy();
   stylesheet?.remove();
   services.obs?.removeObserver(ownerWriteObserver,OWNER_WRITE_TOPIC);
   window.removeEventListener('unload',owner.unload);
   if(window.__contextMenuEditor===owner)delete window.__contextMenuEditor;
   services.obs?.notifyObservers(null,TOPIC);
  }};
 window.__contextMenuEditor=owner;
 window.addEventListener('unload',owner.unload,{once:true});
 window.addUnloadListener?.(owner.unload);
 try{
  if(/^about:(preferences|settings)(?:[?#]|$)/.test(window.location.href))startSettingsPage();
  else startBrowserWindow();
 }catch(problem){owner.unload();throw problem;}
 return owner;

 /** One author-level copy of style.css per page. Sine's chrome.css adds it as a
  * user sheet in browser windows only, and Zen's own author rules outrank user
  * sheets (row padding, decoration layout), so this link is not a duplicate.
  * The version query avoids a stale cached sheet after updates. */
 function linkStylesheet(){
  stylesheet=window.document.createElementNS('http://www.w3.org/1999/xhtml','link');
  stylesheet.rel='stylesheet';
  stylesheet.href=`${BASE}style.css?v=${VERSION}`;
  stylesheet.setAttribute('data-cme-stylesheet','true');
  window.document.documentElement.append(stylesheet);
 }

 function startSettingsPage(){
  linkStylesheet();
  const registry={
   getInventory:()=>browserWindow()?.__contextMenuEditor?.controller?.getInventory()||[],
   subscribe(listener){
    const observer={observe(){listener();}};
    services.obs?.addObserver(observer,TOPIC);
    return()=>services.obs?.removeObserver(observer,TOPIC);
   }};
  bridge=createSineSettingsBridge(window,{store,registry,icons});
 }

 function startBrowserWindow(){
  linkStylesheet();
  let listenerService;
  try{listenerService=Cc['@mozilla.org/eventlistenerservice;1'].getService(Ci.nsIEventListenerService);}catch{}
  // Startup inputs (installed mods, browser markup) each used to trigger a full
  // refresh of every menu. Until both settle, their changes wait for one refresh.
  let started=false;
  const refreshAll=()=>{
   if(disposed||!started)return;
   controller?.refresh();
   void ownerSettings?.refresh();
  };
  sources=createSourceTracker(window,{
   loadMods:loadSineMods,
   listenerInfo:node=>listenerService?.getListenerInfoFor(node)||[],
   functionLocation:fn=>Cu.getFunctionSourceLocation(fn),
   onChange:refreshAll,
  });
  // Identify browser rows from this installed browser's own inert markup,
  // rather than assuming that a familiar ID prefix belongs to Zen.
  const markupLoaded=(async()=>{
   if(typeof ChromeUtils==='undefined'||typeof window.fetch!=='function'){markupState='unavailable';return;}
   try{
    markup=await loadMarkup(window,services);
    if(disposed)return;
    markupState=markup?'ready':'unavailable';
    if(markup)sources.setBrowserIds(markup.rows);
   }catch{markupState='unavailable';/* Source unknown remains honest when native markup is unavailable. */}
  })();

  const getState=()=>{
   const result=store.read();
   if(!result.error)return result.state;
   const fallback=createState();
   fallback.options.enabled=false;
   return fallback;
  };
  controller=createMenuController(window,{
   getState,
   resolveIcon:(...args)=>icons.resolve(...args),
   resolveSource:node=>sources.resolve(node),
   // A popup from browser.xhtml is adopted only for rows a mod added to it,
   // never because a mod merely listens on it (B6).
   classifyPopup:root=>markupState==='pending'?'pending':markup?.popups.has(root.id)?'native':'foreign',
   isNativeRow:id=>Boolean(id&&markup?.popupRows.has(id)),
   onOwnerChange:(rootId,items,changes)=>{
    const before=store.read();
    if(before.error)return;
    const next=applyOwnerChanges(before.state,rootId,items,changes);
    ownerWrite=true;
    try{
     services.obs?.notifyObservers(null,OWNER_WRITE_TOPIC,serializeState(next));
     store.save(next,before.raw);
    }finally{ownerWrite=false;}
   },
   onInventory:()=>services.obs?.notifyObservers(null,TOPIC)});
  services.obs?.addObserver(ownerWriteObserver,OWNER_WRITE_TOPIC);
  offStore=store.subscribe(()=>{
   if(ownerWrite){ownerRaw=null;return;}
   // A user's edit ends every pending owner window. Another window's owner
   // write is not a user edit, so this window keeps its own pending fields.
   const fromOwner=ownerRaw!==null&&store.read().raw===ownerRaw;
   ownerRaw=null;
   if(!fromOwner)controller.clearOwnerSettingsChanges();
   controller.refresh();
  });
  ownerSettings=createOwnerSettingsObserver(window,{prefs:services.prefs,loadMods:loadSineMods,
   onChange:(id,fields)=>{
    controller.noteOwnerSettingsChange(id,fields);
    window.queueMicrotask(()=>{if(!disposed)controller.refresh();});
   },
  });
  void Promise.allSettled([sources.ready,markupLoaded]).then(()=>{started=true;refreshAll();});
 }
}

if(typeof window!=='undefined'){
 const start=()=>{
  try{startContextMenuEditor(window);}
  catch(problem){window.console?.error?.('Context Menu Editor could not start.',problem);}
 };
 if(document.readyState==='complete')start();else window.addEventListener('load',start,{once:true});
}
