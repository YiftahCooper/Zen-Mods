const BASE = 'chrome://sine/content/define-word/';
// Stamped from package.json by build.mjs. Gecko caches modules by URL for the
// session, so module URLs and the actor name change with every release.
export const VERSION='0.3.5';
export const ACTOR_NAME=`DefineWordV${VERSION.replace(/\./g,'_')}`;
// Actor names of earlier releases. Later releases record theirs in REGISTERED.
const LEGACY_ACTOR_NAMES=['DefineWord','DefineWordV030','DefineWordV031'];
const REGISTERED=Symbol.for('define-word.registered-actor-names');
// Each browser window's entry script publishes its owner with the bundled
// version. Until no window runs older code, its actor must stay registered.
export function olderCodeRunning(services) {
  try {
    for(const window of services.wm.getEnumerator('navigator:browser')){const owner=window.__defineWord;if(owner&&owner.version!==VERSION)return true;}
    return false;
  } catch {return true;}
}
// Screen CSS pixels, including negative coordinates on monitors left/above the
// primary display. Copy only geometry; never retain actor-provided extra data.
export function sanitizeSelectionAnchor(value) {
  if(!value || !['x','y','width','height'].every(key=>Number.isFinite(value[key]) && Math.abs(value[key])<=100000)) return null;
  if(value.width<=0 || value.height<=0) return null;
  return {x:value.x,y:value.y,width:value.width,height:value.height};
}

async function menuGeometry(window,global) {
  let timer;
  try {
    const query=global.getActor(ACTOR_NAME).sendQuery('DefineWord:GetSelection');
    return await Promise.race([query,new Promise(resolve=>{timer=window.setTimeout(()=>resolve(null),250);})]);
  } catch {return null;}
  finally {if(timer!==undefined)window.clearTimeout(timer);}
}

export function createSelectionService({chrome,services,registered=new Set(),olderCode=()=>true}) {
  let owners=0;
  // Unregister earlier releases' actors only once every window runs this code;
  // an updated window must not break one that has not reloaded yet.
  function releaseOlderActors(){
    if(olderCode())return;
    for(const name of new Set([...LEGACY_ACTOR_NAMES,...registered])){
      if(name===ACTOR_NAME)continue;
      try{chrome.unregisterWindowActor(name);}catch{}
      registered.delete(name);
    }
  }
  return {acquire() {
    if (!owners) {chrome.registerWindowActor(ACTOR_NAME, {
      parent:{esModuleURI:`${BASE}actors/DefineWordParent.sys.mjs?v=${VERSION}`},
      child:{esModuleURI:`${BASE}actors/DefineWordChild.sys.mjs?v=${VERSION}`},
      // This actor only reads selected text/geometry; its parent exposes no
      // privileged message handlers. Gecko 157 enforces this declaration for
      // web and file content processes. Keep the explicit document allowlist.
      safeForUntrustedWebProcess:true,
      allFrames:true, matches:['http://*/*','https://*/*','file:///*'],
    });registered.add(ACTOR_NAME);}
    owners++;
    releaseOlderActors();
    let released=false;
    const snapshots=new WeakMap();
    function isCurrent(window,selection){
      const saved=selection&&snapshots.get(selection);
      if(released||!saved)return false;
      try{return !saved.context.isDiscarded && saved.context.currentWindowGlobal===saved.global &&
        saved.top.currentWindowGlobal===saved.topGlobal && window.gBrowser.selectedBrowser===saved.browser;
      }catch{return false;}
    }
    return {
      isCurrent,
      async capture(window,menu) {
        if(released || menu?.onPassword) return null;
        const browser=window.gBrowser.selectedBrowser, top=browser.browsingContext;
        const context=menu ? menu.frameBrowsingContext : services.focus.focusedContentBrowsingContext;
        if(!context || context.isDiscarded || context.top.id!==top.id) return null;
        const global=context.currentWindowGlobal,topGlobal=top.currentWindowGlobal;
        if(!global) return null;
        try {
          // Context-menu text is the snapshot from the invoking frame. A later
          // actor reply may enrich its geometry, but cannot replace its text.
          const cachedText=menu?.selectionInfo?.text || '';
          const reply=menu ? await menuGeometry(window,global) : await global.getActor(ACTOR_NAME).sendQuery('DefineWord:GetSelection');
          const matchingReply=reply && reply.contextId===context.id && reply.innerWindowId===global.innerWindowId && reply.rawText===cachedText;
          const result=menu ? {rawText:cachedText,contextId:context.id,innerWindowId:global.innerWindowId,anchor:matchingReply?reply.anchor:null} : reply;
          if(released || context.isDiscarded || context.currentWindowGlobal!==global || top.currentWindowGlobal!==topGlobal || window.gBrowser.selectedBrowser!==browser) return null;
          if(!result || result.contextId!==context.id || result.innerWindowId!==global.innerWindowId || typeof result.rawText!=='string') return null;
          // Keep enough characters to let normalization reject an oversized selection.
          const selection={rawText:result.rawText.slice(0,2048),contextId:context.id,innerWindowId:global.innerWindowId,anchor:sanitizeSelectionAnchor(result.anchor)||sanitizeSelectionAnchor(menu?.anchor)};
          snapshots.set(selection,{context,global,top,topGlobal,browser});return selection;
        } catch {return null;}
      },
      release(){if(released)return;released=true;if(--owners===0){chrome.unregisterWindowActor(ACTOR_NAME);registered.delete(ACTOR_NAME);}},
    };
  }};
}
let singleton;
export function acquireSelectionService() {
  // System modules share one global, so later releases can find this name.
  singleton ||= createSelectionService({chrome:ChromeUtils,services:Services,
    registered:globalThis[REGISTERED] ||= new Set(),olderCode:()=>olderCodeRunning(Services)});
  return singleton.acquire();
}
