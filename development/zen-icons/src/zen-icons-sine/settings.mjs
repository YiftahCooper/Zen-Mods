export const DOUBLE_CLICK_PREF = 'zen-icons.double-click-icons';
export const SPACE_COLOUR_PREF = 'zen-icons.tab.use-space-colour';

function enabled(prefs, name, fallback) {
  try { return prefs.getBoolPref(name, fallback); } catch { return fallback; }
}
const settingsDocument=document=>/^about:(preferences|settings)(?:[?#]|$)/.test(document?.documentURI || '');

// Refresh only our rendered Sine controls. A draft text field stays untouched.
export function syncIconSettingsDocument(document, prefs) {
  if (!settingsDocument(document)) return;
  for (const kind of ['tab', 'folder', 'space']) {
    const heading=document.getElementById(`zen-icons-${kind}-heading`);
    const label=heading?.querySelector('.separator-label');
    if (label) { label.style.fontSize='18px';label.style.fontWeight='600'; }
    for (const provider of ['emoji','zen','lucide','custom']) {
      const key=`zen-icons.${kind}.show-${provider}`;
      const shell=document.getElementById(key.replaceAll('.','-'));
      const checkbox=shell?.querySelector('checkbox');
      if (!checkbox) continue;
      const value=enabled(prefs,key,true);
      if(value)shell.setAttribute('checked','true');else shell.removeAttribute('checked');
      checkbox.checked=value;
    }
    const shell=document.getElementById(`zen-icons-${kind}-hidden-categories`);
    const input=shell?.querySelector('input');
    if (input && document.activeElement!==input) {
      try {
        const current=prefs.getStringPref(`zen-icons.${kind}.hidden-categories`,'');
        if (input.value!==current) input.value=current;
      } catch { /* Leave a malformed preference for Sine to handle. */ }
    }
  }
}

export function connectIconSettings(host, prefs) {
  const root=host.document.documentElement;
  const markers=['zen-icons-neutral-tab-default','zen-icons-double-click-enabled'];
  const previous=markers.map(name=>root.getAttribute(name));
  const documents=new Map();
  let stopped=false;
  const refreshDocument=document=>syncIconSettingsDocument(document,prefs);
  const watch=document=>{
    if (!settingsDocument(document)) return;
    if (!documents.has(document) && host.MutationObserver) {
      const observer=new host.MutationObserver(()=>refreshDocument(document));
      observer.observe(document.documentElement,{childList:true,subtree:true});
      documents.set(document,observer);
    }
    refreshDocument(document);
  };
  const refresh=()=>{
    if (stopped) return;
    root.toggleAttribute(markers[0],!enabled(prefs,SPACE_COLOUR_PREF,true));
    root.toggleAttribute(markers[1],enabled(prefs,DOUBLE_CLICK_PREF,false));
    for (const document of documents.keys()) {
      if (!document.defaultView || document.defaultView.closed) {
        documents.get(document).disconnect();documents.delete(document);
      }
    }
    for (const browser of host.gBrowser?.browsers ?? []) {
      try { watch(browser.contentDocument); } catch { /* Remote website. */ }
    }
  };
  const onLoad=event=>watch(event.target);
  const onHide=event=>{
    const document=event.target;
    documents.get(document)?.disconnect();documents.delete(document);
  };
  const observer={observe:refresh};
  prefs.addObserver?.('zen-icons.',observer);
  host.addEventListener('DOMContentLoaded',onLoad,true);
  host.addEventListener('pagehide',onHide,true);
  refresh();
  return ()=>{
    stopped=true;
    prefs.removeObserver?.('zen-icons.',observer);
    host.removeEventListener('DOMContentLoaded',onLoad,true);
    host.removeEventListener('pagehide',onHide,true);
    for (const observer of documents.values()) observer.disconnect();
    documents.clear();
    for (const [index,name] of markers.entries()) {
      if (previous[index]===null) root.removeAttribute(name);
      else root.setAttribute(name,previous[index]);
    }
  };
}
