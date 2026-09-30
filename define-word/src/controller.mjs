import {normalizeTerm} from './normalize.mjs';
import {createPopup as defaultPopup} from './popup.mjs';
export function createController(window,deps) {
  const {document}=window,menu=document.getElementById('contentAreaContextMenu');
  const item=document.createXULElement('menuitem');item.id='define-word-menu';item.hidden=true;item.setAttribute('label','Define');menu?.append(item);
  function updateAppearance(settings=deps.settings()){
    const visible=settings.showIcon!==false;item.classList.toggle('menuitem-iconic',visible);
    if(visible)item.setAttribute('image','chrome://sine/content/define-word/assets/define-word.svg');else item.removeAttribute('image');
  }
  updateAppearance();
  let generation=0,pending,disposed=false,lastTerm,lastProvider,lastSelection,originBrowser;
  const available=language=>[...deps.providers.values()].filter(p=>p.language===language);
  const current=()=>originBrowser===window.gBrowser.selectedBrowser&&(!lastSelection||deps.selection.isCurrent(window,lastSelection));
  function close({restoreFocus=false}={}){generation++;pending?.abort();pending=null;popup.close({restoreFocus:restoreFocus&&current()});}
  const popup=(deps.createPopup||defaultPopup)(window,{
    onClose:close,
    onProviderChange(id){if(!lastTerm||!current()){close();return;}deps.saveProvider?.(lastTerm.language,id);run(lastTerm,id);},
    onLanguageChange(language){if(!lastTerm||!current()){close();return;}lastTerm={...lastTerm,language};run(lastTerm,defaultProvider(language));},
    onSettings(){close();deps.openSettings?.();},
  });
  const defaultProvider=language=>language==='he'?deps.settings().hebrewProvider:deps.settings().englishProvider;
  async function run(term,providerId,token=++generation){
    if(disposed||!current()){close();return;}
    pending?.abort();pending=new AbortController();lastTerm=term;lastProvider=providerId;
    const state={term,providerId,providers:available(term.language)};
    popup.render({...state,outcome:{status:term.status||(!term.language?'unsupported':'loading')}});
    popup.show(null);
    if(term.status || !term.language)return;
    const outcome=await deps.lookup.lookup({term,providerId,signal:pending.signal});
    if(disposed || token!==generation || outcome.status==='cancelled')return;
    if(!current()){close();return;}
    popup.render({...state,outcome});
  }
  async function define(contextMenu){
    if(disposed)return;
    const token=++generation;pending?.abort();originBrowser=window.gBrowser.selectedBrowser;
    const selection=await deps.selection.capture(window,contextMenu);
    if(disposed || token!==generation)return;
    lastSelection=selection;const term=normalizeTerm(selection?.rawText||'');await run(term,defaultProvider(term.language),token);
  }
  function showing(){const context=window.gContextMenu;const value=context?.selectionInfo?.text||'';item.hidden=!value.trim()||!!context?.onPassword;item.setAttribute('label',`Define “${value.slice(0,36)}${value.length>36?'…':''}”`);}
  const command=()=>{const context=window.gContextMenu; if(context&&!context.onPassword)void define({frameBrowsingContext:context.frameBrowsingContext,selectionInfo:{text:context.selectionInfo?.text||''},onPassword:context.onPassword});};
  item.addEventListener('command',command);menu?.addEventListener('popupshowing',showing);
  const dismiss=()=>close();
  const progress={onLocationChange(browser){if(browser===originBrowser)close();}};
  const tabClosed=event=>{if(event.target.linkedBrowser===originBrowser)close();};
  window.gBrowser.tabContainer.addEventListener('TabSelect',dismiss);
  window.gBrowser.tabContainer.addEventListener('TabClose',tabClosed);
  window.gBrowser.addTabsProgressListener(progress);
  return {define,close,updateAppearance,credentialsChanged(id){if(id===lastProvider)close();},destroy(){if(disposed)return;disposed=true;close();item.removeEventListener('command',command);item.remove();menu?.removeEventListener('popupshowing',showing);window.gBrowser.tabContainer.removeEventListener('TabSelect',dismiss);window.gBrowser.tabContainer.removeEventListener('TabClose',tabClosed);window.gBrowser.removeTabsProgressListener(progress);popup.destroy();deps.selection.release();}};
}
