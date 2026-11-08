import {normalizeTerm} from './normalize.mjs';
import {createPopup as defaultPopup} from './popup.mjs';
export function createController(window,deps) {
  const {document}=window,menu=document.getElementById('contentAreaContextMenu');
  const item=document.createXULElement('menuitem');item.id='define-word-menu';item.hidden=true;item.setAttribute('label','Define');menu?.append(item);
  function updateAppearance(settings=deps.settings()){
    const visible=settings.showIcon!==false;item.classList.toggle('menuitem-iconic',visible);
    if(visible)item.setAttribute('image','chrome://sine/content/define-word/assets/define-word.svg');else item.removeAttribute('image');
    popup?.setTextSize?.(settings.textSize);
  }
  let generation=0,pending,suggestionsPending,debounce,disposed=false,opened=false,capturing=null,lastTerm,lastProvider,lastSelection,originBrowser;
  const available=language=>[...deps.providers.values()].filter(p=>p.language===language);
  const current=()=>originBrowser===window.gBrowser.selectedBrowser&&(!lastSelection||deps.selection.isCurrent(window,lastSelection));
  // Tab and location events are constant. With no popup open and no invocation
  // capturing its selection, closing would only repeat completed cleanup.
  const idle=()=>!opened&&capturing===null;
  function cancel(){generation++;pending?.abort();suggestionsPending?.abort();pending=suggestionsPending=null;window.clearTimeout(debounce);}
  function close({restoreFocus=false}={}){cancel();opened=false;popup.close({restoreFocus:restoreFocus&&current()});}
  const popup=(deps.createPopup||defaultPopup)(window,{
    onClose:close,
    readSize:deps.loadPopupSize,
    onSizeChange:deps.savePopupSize,
    onProviderChange(id,query=lastTerm?.original){if(!lastTerm||!current()){close();return;}const term=normalizeTerm(query||'');if(deps.providers.get(id)?.language!==term.language)return;deps.saveProvider?.(term.language,id);void run(term,id);},
    onSearch(query){if(!current()){close();return;}const term=normalizeTerm(query);void run(term,chooseProvider(term.language));},
    onQueryInput(query){if(!current()){close();return;}cancel();const token=generation,term=normalizeTerm(query),providerId=chooseProvider(term.language);popup.editing?.({term,providerId,providers:available(term.language)});debounce=window.setTimeout(()=>{void suggest(term,providerId,token);},350);},
  });
  updateAppearance();
  const defaultProvider=language=>language==='he'?deps.settings().hebrewProvider:deps.settings().englishProvider;
  const chooseProvider=language=>deps.providers.get(lastProvider)?.language===language?lastProvider:defaultProvider(language);
  async function suggest(term,providerId,token){
    if(term.status||!term.language||!deps.lookup.suggest)return;
    suggestionsPending?.abort();const operation=new AbortController();suggestionsPending=operation;
    let outcome;try{outcome=await deps.lookup.suggest({term,providerId,signal:operation.signal});}catch{outcome={status:'unavailable'};}
    if(disposed||token!==generation||operation.signal.aborted||outcome?.status==='cancelled')return;
    if(!current()){close();return;}popup.renderSuggestions?.({outcome:outcome||{status:'unavailable'},label:deps.providers.get(providerId)?.suggestionsLabel||'Matching words'});
  }
  async function run(term,providerId,token){
    if(disposed||!current()){close();return;}
    if(token===undefined){cancel();token=generation;}else{pending?.abort();suggestionsPending?.abort();window.clearTimeout(debounce);}
    pending=new AbortController();lastTerm=term;lastProvider=providerId;
    const state={term,providerId,providers:available(term.language),textSize:deps.settings().textSize};
    popup.render({...state,outcome:{status:term.status||(!term.language?'unsupported':'loading')}});
    popup.show(lastSelection?.anchor);
    opened=true;
    if(term.status || !term.language)return;
    // Merriam-Webster serves definitions and suggestions from one endpoint; its
    // lookup outcome carries both, so a parallel suggest would repeat the request.
    const provider=deps.providers.get(providerId),shared=typeof provider?.lookupWithSuggestions==='function';
    if(!shared)void suggest(term,providerId,token);
    let outcome;try{outcome=await deps.lookup.lookup({term,providerId,signal:pending.signal});}catch{outcome={status:'unavailable'};}
    outcome ||= {status:'unavailable'};
    if(disposed || token!==generation || outcome.status==='cancelled')return;
    if(!current()){close();return;}
    popup.render({...state,outcome,textSize:deps.settings().textSize});
    if(shared)popup.renderSuggestions?.({outcome:outcome.suggestions||{status:['ok','no-result'].includes(outcome.status)?'unavailable':outcome.status},label:provider.suggestionsLabel||'Matching words'});
    if(outcome.status==='ok'&&outcome.definition?.matches?.length)popup.renderSuggestions?.({outcome:{status:'ok',suggestions:outcome.definition.matches},label:'Matching dictionary entries'});
  }
  async function define(contextMenu){
    if(disposed)return;
    // The popup's input can own chrome focus on a repeated shortcut. Reuse only
    // this still-open invocation's validated page selection, never a dismissed
    // popup, another tab, or a document replaced by navigation.
    const repeat=!contextMenu&&opened&&current()?lastSelection:null;
    close();const token=generation;originBrowser=window.gBrowser.selectedBrowser;
    let selection;capturing=token;
    try{selection=await deps.selection.capture(window,contextMenu);}catch{if(token===generation)close();return;}finally{if(capturing===token)capturing=null;}
    if(disposed || token!==generation)return;
    if(!contextMenu&&!selection?.rawText?.trim()&&repeat&&deps.selection.isCurrent(window,repeat))selection=repeat;
    lastSelection=selection;const term=normalizeTerm(selection?.rawText||'');await run(term,defaultProvider(term.language),token);
  }
  function showing(){const context=window.gContextMenu;const value=context?.selectionInfo?.text||'';item.hidden=!value.trim()||!!context?.onPassword;item.setAttribute('label',`Define “${value.slice(0,36)}${value.length>36?'…':''}”`);}
  const command=()=>{const context=window.gContextMenu;if(!context||context.onPassword)return;
    // Use Gecko's native context-menu point only as a fallback when the selection
    // actor is unavailable. The native coordinates are device pixels.
    const point=context.contentData?.context,scale=window.devicePixelRatio||1;
    const anchor=Number.isFinite(point?.screenXDevPx)&&Number.isFinite(point?.screenYDevPx)?{x:point.screenXDevPx/scale,y:point.screenYDevPx/scale,width:1,height:1}:null;
    void define({frameBrowsingContext:context.frameBrowsingContext,selectionInfo:{text:context.selectionInfo?.text||''},onPassword:context.onPassword,anchor});};
  item.addEventListener('command',command);menu?.addEventListener('popupshowing',showing);
  const dismiss=()=>{if(!idle())close();};
  // Real top-level navigation replaces the page that owns the selection. Same-
  // document changes (history.pushState, fragment links) and subframe loads close
  // the popup only if they invalidated the selected frame or page.
  const SAME_DOCUMENT=0x1;// nsIWebProgressListener.LOCATION_CHANGE_SAME_DOCUMENT
  const progress={onLocationChange(browser,webProgress,_request,_location,flags=0){
    if(idle()||browser!==originBrowser)return;
    if(webProgress?.isTopLevel===false||flags&SAME_DOCUMENT){if(opened&&!current())close();return;}
    close();
  }};
  const tabClosed=event=>{if(!idle()&&event.target.linkedBrowser===originBrowser)close();};
  window.gBrowser.tabContainer.addEventListener('TabSelect',dismiss);
  window.gBrowser.tabContainer.addEventListener('TabClose',tabClosed);
  window.gBrowser.addTabsProgressListener(progress);
  return {define,close,updateAppearance,credentialsChanged(id){if(id===lastProvider)close();},destroy(){if(disposed)return;disposed=true;close();item.removeEventListener('command',command);item.remove();menu?.removeEventListener('popupshowing',showing);window.gBrowser.tabContainer.removeEventListener('TabSelect',dismiss);window.gBrowser.tabContainer.removeEventListener('TabClose',tabClosed);window.gBrowser.removeTabsProgressListener(progress);popup.destroy();deps.selection.release();}};
}
