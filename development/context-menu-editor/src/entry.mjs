import {createState} from './model.mjs';
import {createStore} from './store.mjs';
import {createIconService} from './icons.mjs';
import {createMenuController} from './controller.mjs';
import {createSineSettingsBridge} from './sine-settings.mjs';
import {createSourceTracker,browserMenuIds} from './sources.mjs';
import {createOwnerSettingsObserver,applyOwnerChanges} from './owner-settings.mjs';
import {initializeLegacySettings} from './legacy.mjs';

const TOPIC='context-menu-editor-inventory';
const BASE='chrome://sine/content/context-menu-editor/';

export function startContextMenuEditor(window,{Services:services}={}){
 services??=typeof Services!=='undefined'?Services:globalThis.Services;
 if(!services?.prefs)throw new Error('Context Menu Editor needs the browser preference service.');
 try{initializeLegacySettings(services.prefs);}catch(problem){window.console?.warn?.('Context Menu Editor could not import previous settings.',problem);}
 window.__contextMenuEditor?.unload();
 let disposed=false,offStore=()=>{},offRegistry=()=>{},controller=null,bridge=null,sources=null,ownerSettings=null,ownerWrite=false;
 const store=createStore(services.prefs,{onError:problem=>window.console?.warn?.('Context Menu Editor could not refresh settings.',problem)});
 const browserWindow=()=>window.browsingContext?.topChromeWindow||(/^chrome:/.test(window.location.href)?window:services.wm?.getMostRecentWindow('navigator:browser'));
 // about:preferences blocks external fetches through its document CSP. Keep
 // decoding in this window but use its browser's privileged transport for the
 // explicit HTTPS import, with the icon service's limits and request policy.
 const icons=createIconService(window,{baseURL:BASE,fetch:(...args)=>browserWindow().fetch(...args)});
 const stylesheet=window.document.createElementNS('http://www.w3.org/1999/xhtml','link');
 stylesheet.rel='stylesheet';stylesheet.href=BASE+'style.css?v=0.1.6';stylesheet.setAttribute('data-cme-stylesheet','true');window.document.documentElement.append(stylesheet);
 const owner={get disposed(){return disposed;},get controller(){return controller;},store,
  unload(){
   if(disposed)return;disposed=true;offStore();offRegistry();ownerSettings?.destroy();bridge?.destroy();controller?.destroy();sources?.destroy();store.destroy();stylesheet.remove();
   window.removeEventListener('unload',owner.unload);
   if(window.__contextMenuEditor===owner)delete window.__contextMenuEditor;
   services.obs?.notifyObservers(null,TOPIC);
  }};
 window.__contextMenuEditor=owner;
 window.addEventListener('unload',owner.unload,{once:true});window.addUnloadListener?.(owner.unload);
 try{
  const location=window.location.href;
  if(/^about:(preferences|settings)(?:[?#]|$)/.test(location)){
   const registry={
    getInventory:()=>browserWindow()?.__contextMenuEditor?.controller?.getInventory()||[],
    subscribe(listener){
     const observer={observe(){listener();}};
     services.obs?.addObserver(observer,TOPIC);
     return()=>services.obs?.removeObserver(observer,TOPIC);
    }};
   bridge=createSineSettingsBridge(window,{store,registry,icons});
  }else{
   let listenerService;
   try{listenerService=Cc['@mozilla.org/eventlistenerservice;1'].getService(Ci.nsIEventListenerService);}catch{}
   sources=createSourceTracker(window,{
    loadMods:async()=>ChromeUtils.importESModule('chrome://userscripts/content/core/utils.sys.mjs').default.getMods(),
    listenerInfo:node=>listenerService?.getListenerInfoFor(node)||[],
    functionLocation:fn=>Cu.getFunctionSourceLocation(fn),
    onChange:()=>{if(!disposed){controller?.refresh();void ownerSettings?.refresh();}},
   });
   // Identify browser rows from this installed browser's own inert markup,
   // rather than assuming that a familiar ID prefix belongs to Zen.
   if(typeof ChromeUtils!=='undefined'&&typeof window.fetch==='function')void(async()=>{
    try{
     const response=await window.fetch('chrome://browser/content/browser.xhtml');
     const markup=await response.text();if(markup.length>2*1024*1024)return;
     const ids=browserMenuIds(window,markup);
     if(!disposed&&ids.size)sources.setBrowserIds(ids);
    }catch{/* Source unknown remains honest when native markup is unavailable. */}
   })();
   const getState=()=>{const result=store.read();if(!result.error)return result.state;const fallback=createState();fallback.options.enabled=false;return fallback;};
   controller=createMenuController(window,{getState,resolveIcon:(...args)=>icons.resolve(...args),
    resolveSource:node=>sources.resolve(node),
    onOwnerChange:(rootId,items,changes)=>{
     const before=store.read();if(before.error)return;
     const next=applyOwnerChanges(before.state,rootId,items,changes);
     ownerWrite=true;try{store.save(next,before.raw);}finally{ownerWrite=false;}
    },
    onInventory:()=>services.obs?.notifyObservers(null,TOPIC)});
   offStore=store.subscribe(()=>{if(!ownerWrite){controller.clearOwnerSettingsChanges();controller.refresh();}});
   ownerSettings=createOwnerSettingsObserver(window,{prefs:services.prefs,
    loadMods:async()=>ChromeUtils.importESModule('chrome://userscripts/content/core/utils.sys.mjs').default.getMods(),
    onChange:(id,fields)=>{controller.noteOwnerSettingsChange(id,fields);window.queueMicrotask(()=>{if(!disposed)controller.refresh();});},
   });
   controller.refresh();
  }
 }catch(problem){owner.unload();throw problem;}
 return owner;
}

if(typeof window!=='undefined'){
 const start=()=>{try{startContextMenuEditor(window);}catch(problem){window.console?.error?.('Context Menu Editor could not start.',problem);}};
 if(document.readyState==='complete')start();else window.addEventListener('load',start,{once:true});
}
