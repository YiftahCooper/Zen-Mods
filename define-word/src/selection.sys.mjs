const BASE = 'chrome://sine/content/define-word/';
export const ACTOR_NAME='DefineWordV030';
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

export function createSelectionService({chrome,services}) {
  let owners=0;
  return {acquire() {
    if (!owners) chrome.registerWindowActor(ACTOR_NAME, {
      parent:{esModuleURI:`${BASE}actors/DefineWordParent.sys.mjs?v=0.3.0`},
      child:{esModuleURI:`${BASE}actors/DefineWordChild.sys.mjs?v=0.3.0`},
      allFrames:true, matches:['http://*/*','https://*/*','file:///*'],
    });
    owners++;
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
      release(){if(released)return;released=true;if(--owners===0)chrome.unregisterWindowActor(ACTOR_NAME);},
    };
  }};
}
let singleton;
export function acquireSelectionService() {
  singleton ||= createSelectionService({chrome:ChromeUtils,services:Services});
  return singleton.acquire();
}
