const BASE = 'chrome://sine/content/define-word/';
export function createSelectionService({chrome,services}) {
  let owners=0;
  return {acquire() {
    if (!owners) chrome.registerWindowActor('DefineWord', {
      parent:{esModuleURI:`${BASE}actors/DefineWordParent.sys.mjs`},
      child:{esModuleURI:`${BASE}actors/DefineWordChild.sys.mjs`},
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
          const result=menu ? {rawText:menu.selectionInfo?.text || '',contextId:context.id,innerWindowId:global.innerWindowId,anchor:null}
            : await global.getActor('DefineWord').sendQuery('DefineWord:GetSelection');
          if(released || context.isDiscarded || context.currentWindowGlobal!==global || top.currentWindowGlobal!==topGlobal || window.gBrowser.selectedBrowser!==browser) return null;
          if(!result || result.contextId!==context.id || result.innerWindowId!==global.innerWindowId || typeof result.rawText!=='string') return null;
          // Keep enough characters to let normalization reject an oversized selection.
          const selection={rawText:result.rawText.slice(0,2048),contextId:context.id,innerWindowId:global.innerWindowId,anchor:null};
          snapshots.set(selection,{context,global,top,topGlobal,browser});return selection;
        } catch {return null;}
      },
      release(){if(released)return;released=true;if(--owners===0)chrome.unregisterWindowActor('DefineWord');},
    };
  }};
}
let singleton;
export function acquireSelectionService() {
  singleton ||= createSelectionService({chrome:ChromeUtils,services:Services});
  return singleton.acquire();
}
