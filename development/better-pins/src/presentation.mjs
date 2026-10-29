import {rootOf,areaOf} from './zones.mjs';
import {ownMethod,restoreOwned} from './state.mjs';
import {insertionTarget,zoneMenuLabel} from './controls.mjs';
export function contextTarget(tab,trigger,folderMenu=false){return folderMenu?(trigger?.isZenFolder?trigger:trigger?.closest?.('zen-folder')??trigger?.group??trigger?.parentElement?.group):tab;}
function matchingDragPayload(dataTransfer,item){
  try{
    const type='application/x-moz-tabbrowser-tab',count=dataTransfer?.mozItemCount;
    if(!Array.from(dataTransfer?.types??[]).includes(type)||!Number.isSafeInteger(count)||count<1)return false;
    for(let i=0;i<count;i++)if(rootOf(dataTransfer.mozGetDataAt(type,i))!==item)return false;
    return true;
  }catch{return false;}
}
export class Presentation {
  constructor(c){this.c=c;this.h=c.host;this.nodes=[];this.buttons=new Map();this.hidden=new Map();this.folderHooks=new Map();this.active=false;}
  status(message){if(this.notice){this.notice.textContent=message;this.notice.hidden=false;}}
  async run(fn){try{const result=await fn();if(result?.ok===false)this.status(`Action not completed: ${result.reason}`);this.refresh();return result;}catch(e){this.c.reportError(e);return {ok:false,reason:'failed'};}}
  listen(owner,type,fn,capture=false){owner?.addEventListener(type,fn,capture);this.listeners??=[];this.listeners.push(()=>owner?.removeEventListener(type,fn,capture));}
  element(tag,attrs={}){const n=this.h.document.createElementNS('http://www.w3.org/1999/xhtml',tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,v);return n;}
  start(){
    this.active=true;this.notice=this.element('div',{class:'better-pins-status',role:'status','aria-live':'polite',tabindex:'0'});this.notice.hidden=true;
    this.listen(this.notice,'click',()=>{this.notice.hidden=true;});this.listen(this.notice,'keydown',e=>{if(e.key==='Escape')this.notice.hidden=true;});
    this.h.document.documentElement.appendChild(this.notice);this.nodes.push(this.notice);
    this.menu=this.h.document.getElementById('tabContextMenu');
    this.listen(this.menu,'popupshowing',e=>{if(e.target===this.menu)this.showMenu();});
    this.listen(this.menu,'popuphidden',e=>{if(e.target===this.menu)this.restoreMenu();});
    this.folderMenu=this.h.document.getElementById('zenFolderActions');
    this.listen(this.h,'contextmenu',e=>{this.folderContext=e.target?.closest?.('tab')?null:contextTarget(null,e.target,true);},true);
    this.listen(this.folderMenu,'popupshowing',e=>{if(e.target===this.folderMenu)this.showMenu(true,e.explicitOriginalTarget);});
    this.listen(this.folderMenu,'popuphidden',e=>{if(e.target===this.folderMenu)this.restoreMenu();});
    this.observer=new this.h.MutationObserver(()=>this.schedule());
    this.observer.observe(this.h.gBrowser.tabContainer,{childList:true,subtree:true});
    for(const name of ['TabOpen','TabClose','TabMove','TabGrouped','TabUngrouped','SSTabRestored','BetterZenFoldersUrlPinChanged'])this.listen(this.h,name,()=>this.schedule(),true);
    this.listen(this.h.document,'command',e=>this.onCommand(e),true);
    this.listen(this.h,'dragstart',e=>this.onDragStart(e),true);
    this.listen(this.h,'dragover',e=>this.onDragOver(e),true);
    this.listen(this.h,'drop',e=>this.onDrop(e),true);
    this.listen(this.h,'dragend',()=>{this.drag=null;this.hideDropMarker();},true);
    this.listen(this.h,'dragleave',e=>{if(!e.relatedTarget)this.hideDropMarker();},true);
    this.refresh();
  }
  schedule(){if(!this.active||this.scheduled)return;this.scheduled=true;Promise.resolve().then(()=>{this.scheduled=false;if(this.active)this.refresh();});}
  refresh(){
    if(!this.active)return;
    const wanted=new Set(),managed=new Set();
    for(const tab of this.h.gZenWorkspaces.allStoredTabs){
      if(!this.c.supported(tab))continue;
      tab.setAttribute('better-pins-tab','true');managed.add(tab);
      let record;try{record=this.c.store.read(tab);}catch{continue;}
      if(record.status!=='known'||!record.explicit)continue;
      const content=tab.querySelector('.tab-content');if(!content)continue;
      wanted.add(tab);let button=this.buttons.get(tab);
      if(!button){
        button=this.element('button',{type:'button',class:'better-pins-url-pin','aria-label':'Unpin URL',title:'Unpin URL',draggable:'false'});
        button.innerHTML='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M16 3H8L9 10L5 14V16H11V22H13V16H19V14L15 10Z"/></svg>';
        for(const name of ['mousedown','pointerdown','mouseup','dblclick','dragstart'])this.listen(button,name,e=>e.stopPropagation());
        this.listen(button,'click',e=>{e.preventDefault();e.stopPropagation();void this.run(()=>this.c.policy.unpin(tab));});
        content.insertBefore(button,content.querySelector('.tab-label-container'));this.buttons.set(tab,button);
      }
      button.disabled=!!this.c.policy.blocked(tab);
    }
    for(const tab of this.managedTabs??[])if(!managed.has(tab))tab.removeAttribute('better-pins-tab');
    this.managedTabs=managed;
    for(const[tab,button]of this.buttons)if(!wanted.has(tab)){button.remove();this.buttons.delete(tab);}
    // BZF already owns pure folder unload. Otherwise provide the same operation.
    const bzf=this.h.__betterZenFoldersController?.adapters?.managers?.find(m=>m.constructor?.name==='FolderUnloadManager'&&m.started);
    for(const [folder,entry]of this.folderHooks)if(!this.c.supportedTree(folder)&&restoreOwned(entry))this.folderHooks.delete(folder);
    for(const folder of this.h.document.querySelectorAll('zen-folder')){
      if(!this.c.supportedTree(folder)||bzf||this.folderHooks.has(folder))continue;
      if(typeof folder.unloadAllTabs==='function')this.folderHooks.set(folder,ownMethod(folder,'unloadAllTabs',(args,native)=>this.active&&this.c.supportedTree(folder)&&!this.h.__betterZenFoldersController?.adapters?.managers?.some(m=>m.constructor?.name==='FolderUnloadManager'&&m.started)?this.h.gBrowser.explicitUnloadTabs([...folder.tabs].filter(t=>!t.hasAttribute('zen-empty-tab'))):native()));
    }
    if(bzf){for(const [folder,entry]of this.folderHooks)if(restoreOwned(entry))this.folderHooks.delete(folder);}
    this.c.zones.layout();
    this.c.controls?.refresh();
  }
  onCommand(e){
    const id=e.target?.id;
    if(!['context_pinTab','context_unpinTab','context_pinSelectedTabs','context_unpinSelectedTabs','cmd_zenTogglePinTab'].includes(id))return;
    const tab=id==='cmd_zenTogglePinTab'?(this.h.gZenGlanceManager?.getTabOrGlanceParent(this.h.gBrowser.selectedTab)??this.h.gBrowser.selectedTab):this.h.TabContextMenu?.contextTab;
    if(!this.c.supported(tab))return;
    e.preventDefault();e.stopImmediatePropagation();
    const targets=tab.multiselected?this.h.gBrowser.selectedTabs:[tab];
    void this.run(async()=>{for(const t of targets){const action=id==='cmd_zenTogglePinTab'?(this.c.store.read(t).explicit?'unpin':'pin'):id.includes('_unpin')?'unpin':'pin';const result=await this.c.policy[action](t);if(!result.ok)return result;}return {ok:true};});
  }
  restoreMenu(){for(const[n,hidden]of this.hidden)if(n.hidden)n.hidden=hidden;this.hidden.clear();for(const n of this.commands??[])n.remove();this.commands=[];}
  showMenu(folderMenu=false,trigger=null){
    this.restoreMenu();const tab=this.h.TabContextMenu?.contextTab;
    const target=contextTarget(tab,this.folderContext??trigger??this.h.document.popupNode,folderMenu);
    const menu=folderMenu?this.folderMenu:this.menu;
    if(!target)return;
    const isTab=target.localName==='tab';if(isTab?!this.c.supported(target):!this.c.supportedTree(target))return;
    for(const id of ['context_pinTab','context_unpinTab','context_pinSelectedTabs','context_unpinSelectedTabs','context_zen-reset-pinned-tab','context_zen-edit-pinned-page',...(!isTab?['context_zenFolderUnloadAll']:target.multiselected?[]:['context_unloadTab'])]){
      const n=this.h.document.getElementById(id);if(n){this.hidden.set(n,n.hidden);n.hidden=true;}
    }
    const icon=(n,name)=>{n.classList.add('better-pins-menu');if(!this.c.pref('menu-icons',true))return;n.classList.add(n.localName==='menu'?'menu-iconic':'menuitem-iconic');
      const paths={pin:'M16 3H8L9 10L5 14V16H11V22H13V16H19V14L15 10Z',reset:'M4 5V11H10M4 11A8 8 0 1 1 5 18',edit:'M4 20L5 15L16 4L20 8L9 19Z',unload:'M5 12H19',update:'M12 4V20M4 12H20',zones:'M7 3V20M3 7L7 3L11 7M17 21V4M13 17L17 21L21 17',new:'M12 5V19M5 12H19'};
      const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="context-fill" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${paths[name]??paths.pin}"/></svg>`;
      n.setAttribute('image','data:image/svg+xml,'+encodeURIComponent(svg));};
    const add=(label,fn,disabled=false,parent=menu,symbol='pin')=>{const n=this.h.document.createXULElement('menuitem');n.setAttribute('label',label);icon(n,symbol);n.disabled=disabled;n.addEventListener('command',e=>{e.stopPropagation();if(!n.disabled)void this.run(fn);});parent.appendChild(n);this.commands.push(n);return n;};
    if(isTab){const explicit=this.c.store.read(target).explicit,blocked=!!this.c.policy.blocked(target)||target.multiselected;
      add(explicit?'Unpin URL':'Pin URL',()=>this.c.policy[explicit?'unpin':'pin'](target),blocked);
      add('Reset to Pinned URL',()=>this.c.policy.reset(target),blocked||!explicit,menu,'reset');
      add('Use Current Page as Pinned URL',()=>this.c.policy.update(target),blocked||!explicit,menu,'update');
      add('Edit Pinned URL…',()=>this.c.policy.edit(target),blocked||!explicit,menu,'edit');
      if(!target.multiselected)add('Unload Tab',()=>this.c.policy.unload([target]),blocked,menu,'unload');
    }else add('Unload Folder Tabs',()=>this.h.gBrowser.explicitUnloadTabs([...target.tabs].filter(t=>!t.hasAttribute('zen-empty-tab'))),false,menu,'unload');
    const zones=this.h.document.createXULElement('menu'),popup=this.h.document.createXULElement('menupopup');
    zones.setAttribute('label','Zones');icon(zones,'zones');zones.appendChild(popup);menu.appendChild(zones);this.commands.push(zones);
    const current=areaOf(target);
    const switchItem=add(zoneMenuLabel(current),()=>this.c.zones.move(target,current==='upper'?'lower':'upper'),!current||!!target.multiselected,popup,'zones');
    if(target.closest?.('zen-folder'))switchItem.setAttribute('tooltiptext','Moves the whole containing folder tree');
    add('New Tab in Upper Zone',()=>this.c.newTab('upper'),false,popup,'new');
    add('New Tab in Lower Zone',()=>this.c.newTab('lower'),false,popup,'new');
  }
  onDragStart(e){
    this.drag=null;this.hideDropMarker();
    const target=e.target?.nodeType===3?e.target.parentElement:e.target;
    let item=target?.closest?.('tab,zen-folder');
    if(!item||item.multiselected)return;item=rootOf(item);
    if(this.c.supportedTree(item)&&!item.multiselected)this.drag={item,space:this.c.zones.space(item)};
  }
  destination(e){
    if(!this.drag||!this.c.supportedTree(this.drag.item)||this.c.zones.space(this.drag.item)!==this.drag.space||!matchingDragPayload(e.dataTransfer,this.drag.item))return null;
    let zone=e.target?.closest?.('.zen-workspace-normal-tabs-section,.zen-workspace-pinned-tabs-section');
    // The native drag image can leave an expanded source tree over the pointer.
    // Use the actual pane under it without treating a different folder as a root drop.
    const folder=e.target.closest?.('zen-folder');
    if(folder&&rootOf(folder)!==this.drag.item)return null;
    if(!zone||folder){zone=[this.drag.space.pinnedTabsContainer,this.drag.space.tabsContainer].find(n=>{const r=n.getBoundingClientRect();return e.clientY>=r.top&&e.clientY<=r.bottom&&e.clientX>=r.left&&e.clientX<=r.right;});}
    if(!zone||this.c.zones.space(zone)!==this.drag.space)return null;
    return {zone:areaOf(zone),container:zone};
  }
  hideDropMarker(){if(this.dropMarker)this.dropMarker.hidden=true;this.h.document?.documentElement?.removeAttribute('better-pins-drag');}
  onDragOver(e){const dest=this.destination(e);if(!dest){this.hideDropMarker();return;}
    e.preventDefault();e.stopImmediatePropagation();e.dataTransfer.dropEffect='move';
    const roots=this.c.zones.roots(dest.container).filter(n=>n!==this.drag.item),before=insertionTarget(roots,this.drag.item,e.clientY);
    const visible=roots.filter(n=>n.getBoundingClientRect().height>0),visualBefore=before?(before.getBoundingClientRect().height>0?before:visible.find(n=>roots.indexOf(n)>roots.indexOf(before))):null;
    const pane=dest.container.getBoundingClientRect(),last=visible.at(-1),edge=visualBefore?.getBoundingClientRect().top??last?.getBoundingClientRect().bottom??pane.top+5;
    if(!this.dropMarker){this.dropMarker=this.element('div',{class:'better-pins-drop-marker','aria-hidden':'true'});this.h.document.documentElement.appendChild(this.dropMarker);this.nodes.push(this.dropMarker);}
    Object.assign(this.dropMarker.style,{top:Math.max(pane.top,Math.min(pane.bottom-2,edge))+'px',left:pane.left+5+'px',width:Math.max(0,pane.width-10)+'px'});
    this.dropMarker.hidden=false;this.h.document.documentElement.setAttribute('better-pins-drag','true');
  }
  onDrop(e){
    const item=this.drag?.item,dest=this.destination(e);this.drag=null;this.hideDropMarker();if(!dest)return;
    e.preventDefault();e.stopImmediatePropagation();
    const before=insertionTarget(this.c.zones.roots(dest.container),item,e.clientY);
    void this.run(()=>this.c.zones.move(item,dest.zone,before));
  }
  destroy(){this.active=false;this.observer?.disconnect();for(const off of this.listeners??[])off();this.restoreMenu();this.hideDropMarker();for(const tab of this.managedTabs??[])tab.removeAttribute('better-pins-tab');for(const n of this.nodes)n.remove();for(const b of this.buttons.values())b.remove();for(const entry of this.folderHooks.values())restoreOwned(entry);this.buttons.clear();}
}
