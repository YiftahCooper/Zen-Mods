const EXCLUDED = '.better-zen-folders-url-pin, .better-zen-folders-root-pin, .better-zen-folders-sticky-underline, .better-zen-folders-sticky-toggle, .tab-icon-overlay, .tab-audio-button';

export function resolveIconTarget(node) {
  if (!node?.closest || node.closest(EXCLUDED)) return null;
  const image=node.closest('.tab-icon-image, .tab-reset-pin-button');
  const tab=image?.closest('tab, .tabbrowser-tab');
  if (tab) return {kind:'tab',item:tab,anchor:tab.iconImage || image,
    reset:Boolean(image.closest('.tab-reset-pin-button'))};
  const folderIcon=node.closest('.tab-group-folder-icon');
  const folder=folderIcon?.closest('zen-folder');
  if (folder) return {kind:'folder',item:folder,anchor:folderIcon};
  const indicator=node.closest('.zen-current-workspace-indicator-icon, .zen-workspace-icon');
  if (indicator) {
    const button=indicator.closest('toolbarbutton[zen-workspace-id]');
    const workspace=indicator.closest('zen-workspace');
    return {kind:'space',item:button?.getAttribute('zen-workspace-id') || workspace?.id,anchor:indicator};
  }
  return null;
}

// Only the native reset overlay needs a deferred single click. Selection,
// modifier gestures, context menus and all non-icon row gestures stay native.
export function connectIconGestures({host,isEnabled,openPicker,resetTab,
  resolveTarget=resolveIconTarget,doubleClickMilliseconds=500}) {
  const pending=new Map();
  let stopped=false;
  const cancel=item=>{
    const entry=pending.get(item);
    if(entry) host.clearTimeout(entry.timer);
    pending.delete(item);
  };
  const cancelAll=()=>{for(const item of pending.keys())cancel(item);};
  const cancelBrowser=browser=>{
    for(const tab of pending.keys())if(tab.linkedBrowser===browser)cancel(tab);
  };
  const progress={
    onLocationChange(browser,webProgress){if(webProgress?.isTopLevel!==false)cancelBrowser(browser);},
    onStateChange(browser,webProgress,request,flags){
      // nsIWebProgressListener STATE_START | STATE_IS_DOCUMENT.
      if(webProgress?.isTopLevel!==false && (flags & 1) && (flags & 0x20000))cancelBrowser(browser);
    },
  };
  host.gBrowser?.addTabsProgressListener?.(progress);
  const consume=event=>{event.preventDefault();event.stopImmediatePropagation();};
  const listener=event=>{
    if(['TabMove','TabClose','TabGrouped','TabUngrouped','TabPinned','TabUnpinned','dragstart','blur'].includes(event.type)) {
      cancelAll();return;
    }
    if(stopped || !isEnabled()) {cancelAll();return;}
    if(event.button!==0 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    const target=resolveTarget(event.target);
    if(!target?.item) return;
    if(event.type==='dblclick') {
      cancelAll();consume(event);
      openPicker(target);return;
    }
    if(event.type!=='click' || !target.reset) return;
    consume(event);
    if(event.detail>=2) {cancel(target.item);return;}
    cancelAll();
    const tab=target.item,browser=tab.linkedBrowser,url=browser?.currentURI?.spec;
    if(host.gBrowser)host.gBrowser.selectedTab=tab;
    const baseline=tab._zenPinnedInitialState;
    const timer=host.setTimeout(()=>{
      pending.delete(tab);
      if(!stopped && isEnabled() && tab.isConnected!==false && !tab.closing &&
        tab.linkedBrowser===browser && browser?.currentURI?.spec===url && tab._zenPinnedInitialState===baseline) resetTab(tab);
    },doubleClickMilliseconds);
    pending.set(tab,{timer});
  };
  const events=['click','dblclick','TabMove','TabClose','TabGrouped','TabUngrouped','TabPinned','TabUnpinned','dragstart','blur'];
  for(const type of events)host.addEventListener(type,listener,true);
  return ()=>{
    stopped=true;cancelAll();
    host.gBrowser?.removeTabsProgressListener?.(progress);
    for(const type of events)host.removeEventListener(type,listener,true);
  };
}
