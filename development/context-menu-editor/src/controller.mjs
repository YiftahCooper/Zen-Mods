import {ROOTS,discoverRoot,isHidden} from './registry.mjs';
import {changedOwnerPlacement} from './owner-settings.mjs';
import {appendFittedSymbol,fitSymbol} from './icon-view.mjs';
import {mergeInventory} from './model.mjs';
const HTML='http://www.w3.org/1999/xhtml';
const bool=(node,name)=>node.getAttribute(name)==='true'||node[name]===true;
const presentation='label.menu-text,label.menu-accel,img.menu-icon';
function derivedPresentation(record){
 const target=record.target.nodeType===1?record.target:record.target.parentElement;
 if(target?.closest?.(presentation))return !(record.type==='attributes'&&['src','srcset','style'].includes(record.attributeName)&&target.matches?.('img.menu-icon,.menu-iconic-icon'));
 const changed=[...record.addedNodes||[],...record.removedNodes||[]];
 return record.type==='childList'&&changed.length>0&&changed.every(node=>node.nodeType===3||node.matches?.(presentation));
}

/** A reversible overlay. Each popup opening is a new owner baseline, never a startup snapshot. */
export function createMenuController(window,{getState,resolveIcon=()=>null,resolveSource=()=>null,onInventory=()=>{},onOwnerChange=()=>{}}) {
 const document=window.document, contexts=new Map(),retired=new Map(),pendingOpenings=new WeakMap(),listeners=new Set();let destroyed=false,inventory=[],trigger=null;
 // Untracked top-level popups already found to have no mod owner. An entry is
 // dropped when that popup's subtree changes, when it opens (listeners cannot be
 // observed) and on every refresh (source catalogue or browser IDs changed).
 let unowned=new WeakSet(),syncQueued=false,rootObserver=null;
 const notify=()=>{ inventory=[...contexts.values()].map(c=>({id:c.root.id,label:c.label,items:[...c.scan.items,...[...c.remembered.values()].filter(item=>!c.scan.nodes.has(item.key)).map(item=>({...item,available:false}))]}));onInventory(inventory);for(const fn of listeners)fn(inventory); };
 function stopOwnerWindow(pending){if(pending.timer!==undefined){window.clearTimeout(pending.timer);delete pending.timer;}}
 function settleOwnerWindow(c,id,pending){if(pending.timer!==undefined)return;
  // A closed owner may render only on its next opening. Once it renders, allow
  // two seconds for async effects, then stop attributing ordinary later writes.
  pending.timer=window.setTimeout(()=>{if(c.pendingOwners.get(id)===pending)c.pendingOwners.delete(id);delete pending.timer;},2000);
 }
 function clearOwnerSettingsChanges(){for(const c of [...contexts.values(),...retired.values()]){for(const pending of c.pendingOwners.values())stopOwnerWindow(pending);c.pendingOwners.clear();}}
 function ownerChanges(c){
  const patches=[],placementKeys=new Set();
  for(const [id,pending]of c.pendingOwners){
   if(c.open)settleOwnerWindow(c,id,pending);const patchCount=patches.length,placementCount=placementKeys.size;
   const after=c.scan.items.filter(item=>item.source?.kind==='mod'&&item.source.id===id),before=pending.before;
   for(const item of after){const prior=before.get(item.key);if(!prior)continue;const patch={},fields=pending.remaining.get(item.key)||new Set();
    if(fields.has('name')&&item.label!==prior.label){patch.name=null;fields.delete('name');}
    if(fields.has('icon')&&item.iconURL!==prior.iconURL){patch.icon=null;patch.showIcon=Boolean(item.iconURL);patch.iconOwner=true;fields.delete('icon');}
    if(fields.has('visibility')&&item.available!==prior.available){patch.hidden=!item.available;patch.removed=false;fields.delete('visibility');}
    if(Object.keys(patch).length)patches.push({key:item.key,patch});
   }
   if([...pending.remaining.values()].some(fields=>fields.has('placement'))){
    for(const item of changedOwnerPlacement([...before.values()],c.scan.items))if(pending.remaining.get(item.key)?.has('placement')){placementKeys.add(item.key);pending.remaining.get(item.key).delete('placement');}
   }
   if([...pending.remaining.values()].every(fields=>!fields.size)){stopOwnerWindow(pending);c.pendingOwners.delete(id);}
   else if(patches.length>patchCount||placementKeys.size>placementCount)settleOwnerWindow(c,id,pending);
  }
  const placement=c.scan.items.filter(item=>placementKeys.has(item.key)).map(({key,parentKey})=>({key,parentKey}));
  if(patches.length||placement.length)onOwnerChange(c.root.id,c.scan.items,{patches,placement});
  const peers=new Map();for(const item of c.scan.items){const group=peers.get(item.parentKey)||[];group.push(item.key);peers.set(item.parentKey,group);}
  const currentOwners=new Map();for(const item of c.scan.items){
   if(item.source?.kind==='mod'){let owner=currentOwners.get(item.source.id);if(!owner)currentOwners.set(item.source.id,owner=new Map());owner.set(item.key,{...item,peers:peers.get(item.parentKey)});}
   if(item.identity==='mod-label')c.remembered.set(item.key,{...item});
  }
  for(const [id,current]of currentOwners){for(const [key,item]of c.lastOwners.get(id)||[])if(!current.has(key))current.set(key,item);c.lastOwners.set(id,current);}
 }
 function noteOwnerSettingsChange(id,fields){for(const c of [...contexts.values(),...retired.values()]){
  const before=c.lastOwners.get(id);if(!before?.size)continue;
  const pending=c.pendingOwners.get(id)||{before:new Map(),remaining:new Map()};
  for(const [key,item]of before){const prior=pending.before.get(key)||{...item},remaining=pending.remaining.get(key)||new Set();
   for(const field of fields){remaining.add(field);for(const property of ({name:['label'],icon:['iconURL'],visibility:['available'],placement:['parentKey','peers']}[field]||[]))prior[property]=item[property];}
   pending.before.set(key,prior);pending.remaining.set(key,remaining);
  }stopOwnerWindow(pending);c.pendingOwners.set(id,pending);if(c.open)settleOwnerWindow(c,id,pending);
 }}
 function adoptForeign(c,records){
  for(const record of records){
   if(record.type==='attributes'){
    // Even an owner writing the same value takes ownership of that attribute.
    c.attrs.get(record.target)?.delete(record.attributeName);
    if(record.attributeName==='style'){
     const previous=document.createElementNS(HTML,'span');previous.setAttribute('style',record.oldValue||'');
     for(const [name]of c.styles.get(record.target)||[])if(previous.style.getPropertyValue(name)!==record.target.style.getPropertyValue(name))c.styles.get(record.target).delete(name);
    }
   }
   if(record.type==='childList'){
    for(const n of record.removedNodes){const move=c.moves.get(n);if(move)move.foreign=true;}
    // A late owner insertion belongs in the restoration baseline as well.
    // Otherwise appending its older source siblings can move the new row to
    // the beginning when this opening's overlay is released.
    const order=c.sourceOrders?.get(record.target);
    const added=order?[...record.addedNodes].filter(n=>!order.includes(n)&&!c.owned.has(n)):[];
    if(added.length){
     const next=order.indexOf(record.nextSibling),previous=order.indexOf(record.previousSibling);
     const index=!record.nextSibling?order.length:!record.previousSibling?0:next>=0?next:previous>=0?previous+1:order.length;
     order.splice(index,0,...added);
    }
   }
  }
 }
 function pause(c){adoptForeign(c,c.observer.takeRecords());c.observer.disconnect();}
 function observe(c){if(!destroyed&&c.root.isConnected)c.observer.observe(c.root,{childList:true,subtree:true,attributes:true,attributeOldValue:true});}
 function attr(c,node,name,value){
  const old=node.getAttribute(name),next=value===null?null:String(value);if(old===next)return;
  let fields=c.attrs.get(node);if(!fields)c.attrs.set(node,fields=new Map());
  if(!fields.has(name))fields.set(name,{before:old,applied:next});else fields.get(name).applied=next;
  if(next===null)node.removeAttribute(name);else node.setAttribute(name,next);
 }
 function style(c,node,name,value){
  const before=node.style.getPropertyValue(name),priority=node.style.getPropertyPriority(name);if(before===value)return;
  let fields=c.styles.get(node);if(!fields)c.styles.set(node,fields=new Map());
  fields.set(name,{before,priority,applied:value});node.style.setProperty(name,value);
 }
 function restore(c,keepMenus=false){
  pause(c);
  // Owner writes can arrive while an editor-created popup is open. Retain its
  // widget identity through reconciliation; deleting it closes the live menu.
  const retained=new Set();
  if(keepMenus)for(const [key,container]of c.menus){
   if(c.root.contains(container.menu)&&container.popup.parentNode===container.menu){retained.add(container.menu);retained.add(container.popup);}
   else c.menus.delete(key);
  }
  for(const [node,fields]of c.attrs)for(const [name,record]of fields)if(node.getAttribute(name)===record.applied){if(record.before===null)node.removeAttribute(name);else node.setAttribute(name,record.before);}
  for(const [node,fields]of c.styles)for(const [name,record]of fields)if(node.style.getPropertyValue(name)===record.applied){if(record.before)node.style.setProperty(name,record.before,record.priority);else node.style.removeProperty(name);}
  // Restore in reverse *source* order, independent of the permutation's move
  // order. Each surviving later sibling is already a valid source anchor.
  // Detached owner parents remain valid destinations; removed/reparented nodes
  // themselves have a foreign move or a different parent and stay untouched.
  for(const [node]of [...c.positions||[]].reverse()){
   const move=c.moves.get(node);if(!move||move.foreign||node.parentNode!==move.appliedParent)continue;
   const siblings=c.sourceOrders.get(move.parent)||[],index=siblings.indexOf(node);
   const anchor=siblings.slice(index+1).find(sibling=>sibling.parentNode===move.parent&&!c.moves.get(sibling)?.foreign)||null;
   if(node.parentNode!==move.parent||node.nextSibling!==anchor)move.parent.insertBefore(node,anchor);
  }
  // A foreign owner may have inserted something into an owned popup. Preserve it at the root.
  for(const container of c.owned)if(container.isConnected&&['menu','menupopup'].includes(container.localName)){for(const child of [...container.children])if(!c.owned.has(child)&&(container.localName==='menupopup'||['menu','menuitem','menuseparator','menugroup','menupopup'].includes(child.localName)))c.root.insertBefore(child,container.closest('[data-cme-owned]')?.parentNode===c.root?container.closest('[data-cme-owned]'):null);}
  for(const node of c.owned)if(!retained.has(node))node.remove();c.attrs.clear();c.styles.clear();c.moves.clear();c.owned=retained;if(!keepMenus)c.menus.clear();c.positions=null;c.sourceOrders=null;
 }
 function move(c,node,parent,before=null){
  if(!c.moves.has(node))c.moves.set(node,{...c.positions?.get(node)||{parent:node.parentNode,next:node.nextSibling},appliedParent:parent,foreign:false});
  else c.moves.get(node).appliedParent=parent;
  parent.insertBefore(node,before);
 }
 function make(c,tag){const n=document.createXULElement(tag);n.setAttribute('data-cme-owned','true');c.owned.add(n);return n;}
 function rename(c,node,descriptor,record){
  if(record.name!==undefined && descriptor.kind!=='separator'){
   // Fluent retranslates moved nodes asynchronously. The explicit name owns
   // this opening; restoring the localization ID on close returns that control.
   attr(c,node,'data-l10n-id',null);
   attr(c,node,'label',record.name);
  }
 }
 function accessKeys(c,container,records){
  const children=[...container.children].filter(node=>!isHidden(node));
  // Reconsider earlier suppression against the latest owner baseline. A key
  // becomes available again when its sibling's conflicting key changes.
  for(const node of children){
   const fields=c.attrs.get(node),field=fields?.get('accesskey');
   if(field&&node.getAttribute('accesskey')===field.applied){
    if(field.before===null)node.removeAttribute('accesskey');else node.setAttribute('accesskey',field.before);
    fields.delete('accesskey');
   }
   const descriptor=c.scan.items.find(item=>c.scan.nodes.get(item.key)===node),name=descriptor&&records[descriptor.key]?.name,access=node.getAttribute('accesskey');
   if(name!==undefined&&access&&!name.toLocaleLowerCase().includes(access.toLocaleLowerCase()))attr(c,node,'accesskey',null);
  }
  const counts=new Map();for(const node of children){const key=node.getAttribute('accesskey')?.toLocaleLowerCase();if(key)counts.set(key,(counts.get(key)||0)+1);}
  for(const node of children){const descriptor=c.scan.items.find(item=>c.scan.nodes.get(item.key)===node),key=node.getAttribute('accesskey')?.toLocaleLowerCase();if(descriptor&&records[descriptor.key]?.name!==undefined&&counts.get(key)>1)attr(c,node,'accesskey',null);}
 }
 function decorate(c,node,descriptor,record,options){
  attr(c,node,'data-cme-item','true');rename(c,node,descriptor,record);
  const preferClean=options.preferCleanLinks&&c.root.id==='contentAreaContextMenu';
  if(record.hidden||record.removed||(options.hideUnavailable&&bool(node,'disabled'))||!descriptor.available||
    (preferClean&&((descriptor.key==='context-copylink'&&c.cleanLinkAvailable)||(descriptor.key==='context-stripOnShareLink'&&bool(node,'disabled')))))attr(c,node,'hidden','true');
  if(descriptor.kind==='separator')return;
  if(record.iconOwner){attr(c,node,'data-cme-icons','owner');return;}
  attr(c,node,'data-cme-icons',options.showIcons===false||record.showIcon===false?'off':'on');
  if(options.showIcons===false||record.showIcon===false)return;
  const icon=resolveIcon(descriptor,record,options);if(!icon)return;
  const deco=document.createElementNS(HTML,'span');deco.className='cme-decoration';deco.setAttribute('data-cme-icon','true');deco.setAttribute('aria-hidden','true');
  if(icon.type==='text')deco.textContent=icon.text;
  else if(icon.type==='image'){
   const image=document.createElementNS(HTML,'img');image.setAttribute('src',icon.src);image.setAttribute('alt','');
   if(icon.monochrome)image.setAttribute('data-cme-monochrome','true');
   if(icon.fallbackSrc)image.addEventListener('error',()=>{
    if(destroyed||!deco.isConnected)return;
    // Resource names can change with a browser update. This owned fallback
    // must not be interpreted as another mod changing the menu.
    c.fallbackWrites.set(image,icon.fallbackSrc);image.setAttribute('src',icon.fallbackSrc);
   },{once:true});
   deco.append(image);
  }
  else return;
  c.owned.add(deco);node.prepend(deco);
  if(icon.type==='text'){deco.textContent='';appendFittedSymbol(window,deco,icon.text,options.iconSize||16);}
 }
 function apply(c){
  const initial=getState(),state=initial?.roots?.[c.root.id]?.legacyHiddenIds?.length?mergeInventory(initial,c.root.id,c.scan.items):initial;
  const options={...state?.options,hideUnavailable:state?.roots?.[c.root.id]?.hideUnavailable??state?.options?.hideUnavailable};if(options.enabled===false||c.bypass){restore(c);return;}
  const saved=state?.roots?.[c.root.id]||{children:[],records:{}},records=saved.records||{};
  const descriptors=new Map(c.scan.items.map(d=>[d.key,d]));
  const parents=new Map(c.scan.items.map(item=>[item.key,item.parentKey]));
  for(const key of saved.children||[])parents.set(key,null);
  for(const [key,record]of Object.entries(records))for(const child of record.children||[])parents.set(child,key);
  function usable(key,seen=new Set()){
   if(seen.has(key))return false;seen.add(key);
   const record=records[key],descriptor=descriptors.get(key),node=c.scan.nodes.get(key);
   if(record?.hidden||record?.removed)return false;
   if(descriptor?(!descriptor.available||!node||bool(node,'disabled')):record?.kind!=='submenu')return false;
   const parent=parents.get(key);return parent==null||usable(parent,seen);
  }
  c.cleanLinkAvailable=usable('context-stripOnShareLink');
  attr(c,c.root,'data-cme-root',c.root.id);attr(c,c.root,'data-cme-rounded',String(options.rounded!==false));attr(c,c.root,'data-cme-hover',String(options.hoverShade!==false));
  attr(c,c.root,'data-cme-separators',options.showSeparators===false?'off':'on');
  style(c,c.root,'--cme-icon-size',`${options.iconSize??16}px`);style(c,c.root,'--cme-icon-gap',`${options.iconGap??8}px`);style(c,c.root,'--cme-row-spacing',`${options.rowSpacing??2}px`);style(c,c.root,'--cme-icon-align',options.iconAlignment||'center');style(c,c.root,'--cme-separator-opacity',String(options.separatorOpacity??0.5));
  const seen=new Set(),usedMenus=new Set(),containers=new Set([c.root]),desired=new Map(),baseline=new Map();
  for(const parent of [c.root,...c.root.querySelectorAll('menupopup,menugroup')])baseline.set(parent,[...parent.children]);
  c.sourceOrders=new Map([c.root,...c.root.querySelectorAll('*')].map(parent=>[parent,[...parent.childNodes]]));
  c.positions=new Map([...c.root.querySelectorAll('*')].map(node=>[node,{parent:node.parentNode,next:node.nextSibling}]));
  const queue=(parent,node)=>{if(!desired.has(parent))desired.set(parent,[]);desired.get(parent).push(node);};
  function place(keys,parent,boundary=null){
   for(const key of keys){
    if(seen.has(key))continue;seen.add(key);
    const record=records[key]||{},descriptor=descriptors.get(key);let node=c.scan.nodes.get(key);
    if(!descriptor){
     if(record.kind==='submenu'){
      let held=c.menus.get(key);
      if(!held){node=make(c,'menu');const popup=make(c,'menupopup');popup.setAttribute('needsgutter','true');node.append(popup);held={menu:node,popup};c.menus.set(key,held);}
      node=held.menu;const popup=held.popup;usedMenus.add(key);node.setAttribute('label',record.name||'Submenu');if(node.parentNode!==parent)parent.append(node);queue(parent,node);containers.add(popup);
      decorate(c,node,{key,kind:'submenu',label:record.name||'Submenu',available:true},record,options);place(record.children||[],popup,boundary);
      if(![...popup.children].some(n=>n.localName!=='menuseparator'&&!isHidden(n)))attr(c,node,'hidden','true');
     }else if(record.kind==='separator'&&record.owned){node=make(c,'menuseparator');parent.append(node);queue(parent,node);decorate(c,node,{key,kind:'separator',available:true},record,options);}
     continue;
    }
    // Defense in depth against stale or manually edited states bypassing model validation.
    if(descriptor.boundary!==boundary){continue;}
    if(descriptor.locked){if(node.parentNode===parent)queue(parent,node);continue;}
    queue(parent,node);
    if(node.parentNode!==parent)move(c,node,parent);decorate(c,node,descriptor,record,options);
    const navigation=c.scan.meta.get(key)?.navigation;
    if(navigation){attr(c,node,'data-cme-navigation','true');if(!node.getAttribute('label')){attr(c,node,'data-l10n-id',null);attr(c,node,'label',node.getAttribute('aria-label')||node.getAttribute('tooltiptext')||descriptor.label);}}
    if(descriptor.kind==='native-menu'){
     const popup=[...node.children].find(n=>n.localName==='menupopup');if(popup){containers.add(popup);const children=c.scan.items.filter(d=>d.parentKey===key).map(d=>d.key);place([...record.children||[],...children],popup,key);}
    }
   }
  }
  place([...saved.children||[],...c.scan.items.filter(d=>d.parentKey===null).map(d=>d.key)],c.root);
  for(const [key,held]of c.menus)if(!usedMenus.has(key)){held.menu.remove();c.owned.delete(held.menu);c.owned.delete(held.popup);c.menus.delete(key);}
  const assigned=new Set([...desired.values()].flat());
  for(const [parent,planned]of desired){
   const original=baseline.get(parent)||[];
   // Unknown owner rows remain in their native parent, anchored after their
   // preceding surviving source row (or before the next when it moved away).
   for(let i=0;i<original.length;i++){
    const node=original[i];if(assigned.has(node)||node.parentNode!==parent)continue;
    const previous=original.slice(0,i).reverse().find(n=>planned.includes(n));
    const next=original.slice(i+1).find(n=>planned.includes(n));
    planned.splice(previous?planned.indexOf(previous)+1:next?planned.indexOf(next):planned.length,0,node);
   }
   // A source-qualified owner may toggle its next sibling asynchronously.
   // Keep that companion attached to its head even for malformed saved input.
   for(const [head,members]of c.scan.dependencyGroups)if(planned.includes(head)){
    for(const member of members.slice(1)){
     const index=planned.indexOf(member);if(index>=0)planned.splice(index,1);
     if(member.parentNode===parent)planned.splice(planned.indexOf(head)+1,0,member);
    }
   }
   let cursor=parent.firstElementChild;
   for(const node of planned){if(node!==cursor)move(c,node,parent,cursor);cursor=node.nextElementSibling;}
  }
  for(const {navigation}of c.scan.meta.values())if(navigation&&!navigation.children.length)attr(c,navigation,'hidden','true');
  for(const descriptor of c.scan.items)if(descriptor.locked)decorate(c,c.scan.nodes.get(descriptor.key),descriptor,records[descriptor.key]||{},options);
  // Locked owner dependencies remain untouched, including their adjacent separator.
  for(const container of containers){
   const children=[...container.children].filter(n=>!isHidden(n));let priorSeparator=true;
   for(let i=0;i<children.length;i++){
    const node=children[i],sep=node.localName==='menuseparator',descriptor=c.scan.items.find(d=>c.scan.nodes.get(d.key)===node);
    if(sep&&(priorSeparator||i===children.length-1)&&!descriptor?.locked&&!c.scan.protectedNodes.has(node))attr(c,node,'hidden','true');else priorSeparator=sep;
   }
   accessKeys(c,container,records);
  }
 }
 function reconcile(c){
  if(destroyed||!c.root.isConnected)return;
  restore(c,c.open);try{c.scan=discoverRoot(c.root,{resolveSource});ownerChanges(c);if(c.open)apply(c);else restore(c);}catch(error){restore(c);window.console?.warn?.('Context Menu Editor kept the owner menu after an error.',error);}finally{observe(c);notify();}
 }
 function ownerOnlySubmenuChange(c,record){
  const popup=record.target.closest?.('menupopup');
  if(!popup||popup===c.root)return false;
  const parent=c.scan.items.find(item=>c.scan.nodes.get(item.key)===popup.parentElement);
  if(parent?.kind!=='native-menu')return false;
  const tracked=new Set(c.scan.nodes.values());
  const ownerOnly=node=>{
   if(node.nodeType!==1)return true;
   if(node.matches('style,link,script')||node.querySelector('style,link,script'))return false;
   const selector='menu,menuitem,menuseparator,menugroup',rows=[...node.querySelectorAll(selector)];if(node.matches(selector))rows.unshift(node);
   return rows.every(row=>!row.id&&!tracked.has(row)&&resolveSource(row)?.kind!=='mod');
  };
  if(record.target!==popup){
   const row=record.target.closest?.('menu,menuitem,menuseparator,menugroup');
   if(!row||!ownerOnly(row))return false;
  }
  if(record.type==='attributes')return record.target!==popup&&ownerOnly(record.target);
  const changed=[...record.addedNodes||[],...record.removedNodes||[]];
  return record.type==='childList'&&changed.length>0&&changed.every(ownerOnly);
 }
 function attach(root,label,previous){
  const c={root,label,scan:discoverRoot(root,{resolveSource}),attrs:new Map(),styles:new Map(),moves:new Map(),owned:new Set(),menus:new Map(),fallbackWrites:new WeakMap(),open:false,bypass:false,epoch:0,scheduled:false,reconciliations:0,lastOwners:previous?.lastOwners||new Map(),pendingOwners:previous?.pendingOwners||new Map(),remembered:previous?.remembered||new Map()};ownerChanges(c);
  c.observer=new window.MutationObserver(records=>{
   // Symbol fitting changes only our view. It must never restore/reinsert a
   // just-opened native submenu or consume a pending owner metadata change.
   records=records.filter(record=>!(record.type==='attributes'&&record.attributeName==='style'&&c.owned.has(record.target.closest?.('.cme-symbol')?.parentElement)));
   const fallbackTargets=new Set(records.filter(record=>record.type==='attributes'&&record.attributeName==='src'&&c.fallbackWrites.has(record.target)&&record.target.getAttribute('src')===c.fallbackWrites.get(record.target)).map(record=>record.target));
   records=records.filter(record=>!(record.type==='attributes'&&record.attributeName==='src'&&fallbackTargets.has(record.target)));
   for(const target of fallbackTargets)c.fallbackWrites.delete(target);
   // Gecko changes these attributes while navigating an already-open menu.
   // Rebuilding a custom submenu here would disconnect its active popup.
   records=records.filter(record=>!(record.type==='attributes'&&['_moz-menuactive','open'].includes(record.attributeName)&&['menu','menuitem','menupopup'].includes(record.target.localName)));
   // First-opening widget bookkeeping must not restore and reinsert a moved
   // native/foreign submenu: that would close its active popup.
   records=records.filter(record=>!(record.type==='attributes'&&record.attributeName==='hasbeenopened'&&record.target.localName==='menupopup'));
   // XUL label widgets update their text/value in a later observer turn. Those
   // derived mutations do not change command metadata and must not rebuild it.
   records=records.filter(record=>!derivedPresentation(record));
   if(!records.length)return;
   adoptForeign(c,records);
   // Native service menus recreate anonymous owner-only rows when opened.
   // They have no editor state to reconcile. Reinserting their parent here
   // can close or displace the popup that Gecko is currently positioning.
   if(c.open){
    const ownerOnly=records.filter(record=>ownerOnlySubmenuChange(c,record));
    if(ownerOnly.length){
     records=records.filter(record=>!ownerOnly.includes(record));
     const state=getState();
     if(state?.options?.enabled!==false&&!c.bypass){
      pause(c);
      const saved=state?.roots?.[c.root.id]?.records||{};
      for(const popup of new Set(ownerOnly.map(record=>record.target.closest('menupopup'))))accessKeys(c,popup,saved);
      observe(c);
     }
    }
   }
   if(!records.length)return;
   // Owners often refresh labels on bubbling child-popup events. Keep the
   // existing topology for these changes: restoring a reordered native menu
   // even briefly closes its popup. Metadata and overrides still stay fresh.
   if(c.open&&!c.scheduled&&records.every(record=>record.type==='attributes'&&['label','accesskey'].includes(record.attributeName))&&c.reconciliations<24){
    c.reconciliations++;pause(c);
    for(const node of new Set(records.map(record=>record.target))){
     const descriptor=c.scan.items.find(item=>c.scan.nodes.get(item.key)===node);if(!descriptor)continue;
     if(records.some(record=>record.target===node&&record.attributeName==='label'))descriptor.label=node.getAttribute('label')||node.getAttribute('aria-label')||descriptor.key;
    }
    ownerChanges(c);const state=getState(),active=state?.options?.enabled!==false&&!c.bypass,saved=state?.roots?.[c.root.id]?.records||{};
    for(const node of new Set(records.map(record=>record.target))){
     const descriptor=c.scan.items.find(item=>c.scan.nodes.get(item.key)===node);if(!descriptor)continue;
     if(active)rename(c,node,descriptor,saved[descriptor.key]||{});
    }
    if(active)for(const parent of new Set(records.map(record=>record.target.parentElement).filter(Boolean)))accessKeys(c,parent,saved);
    observe(c);notify();return;
   }
   if(c.scheduled)return;c.scheduled=true;window.queueMicrotask(()=>{c.scheduled=false;
   // An owner observer may intentionally rewrite every presentation mutation. Bound
   // this opening's reconciliation and release the overlay instead of fighting it.
   if(c.open&&++c.reconciliations>24)c.open=false;
   reconcile(c);
  });});contexts.set(root.id,c);observe(c);
 }
 const trackedRoot=node=>contexts.get(node.id)?.root===node;
 // Invalidates cached unowned popups around a changed node. Returns whether the
 // change happened inside a tracked root: that root has its own observer, and
 // its content (including this editor's own rebuilds) cannot change sync().
 function noteSubtree(target){
  let inside=false;
  for(let popup=target?.nodeType===1?target.closest('menupopup'):null;popup;popup=popup.parentElement?.closest('menupopup')){if(trackedRoot(popup))inside=true;else unowned.delete(popup);}
  return inside;
 }
 // Removed, replaced or (re)inserted tracked/built-in/retired roots, wherever
 // they are, without scanning removed subtrees.
 function staleRoots(){
  for(const [id,c]of contexts)if(document.getElementById(id)!==c.root)return true;
  for(const spec of ROOTS)if(!contexts.has(spec.id)&&document.getElementById(spec.id))return true;
  for(const id of retired.keys())if(document.getElementById(id)?.localName==='menupopup')return true;
  return false;
 }
 function rootRecord(record){
  if(noteSubtree(record.target))return false;
  for(const n of record.addedNodes)if(n.nodeType===1&&!n.hasAttribute('data-cme-owned')&&(n.localName==='menupopup'||(n.firstElementChild&&n.querySelector('menupopup'))))return true;
  return false;
 }
 function queueSync(){if(syncQueued||destroyed)return;syncQueued=true;window.queueMicrotask(()=>{syncQueued=false;sync();});}
 function sync(force=false){
  if(destroyed)return;
  // Apply invalidations still queued for the document observer first.
  for(const record of rootObserver?.takeRecords()||[])noteSubtree(record.target);
  if(force)unowned=new WeakSet();
  let changed=force;
  const specs=new Map(ROOTS.map(spec=>[spec.id,spec]));
  for(const root of document.querySelectorAll('menupopup[id]')){
   // An already tracked root keeps its context below; its owner label is unused.
   if(specs.has(root.id)||trackedRoot(root)||unowned.has(root)||root.parentElement?.closest('menupopup,menu')||root.closest('[data-cme-owned]'))continue;
   const source=resolveSource(root),owner=source?.kind==='mod'?source:discoverRoot(root,{resolveSource}).items.find(item=>item.source?.kind==='mod')?.source;
   if(owner)specs.set(root.id,{id:root.id,label:root.getAttribute('label')||`${owner.name} menu`});else unowned.add(root);
  }
  // Once an owner menu is discovered, retain its catalogue while its owner
  // temporarily removes/recreates the commands. Detached roots still release.
  for(const [id,c]of contexts)if(!specs.has(id)&&c.root.isConnected)specs.set(id,{id,label:c.label});
  for(const [id,c]of contexts)if(document.getElementById(id)!==c.root){restore(c);c.observer.disconnect();contexts.delete(id);retired.set(id,{label:c.label,lastOwners:c.lastOwners,pendingOwners:c.pendingOwners,remembered:c.remembered});changed=true;}
  for(const [id,c]of retired)if(document.getElementById(id)?.localName==='menupopup')specs.set(id,{id,label:c.label});
  for(const spec of specs.values()){const root=document.getElementById(spec.id),old=contexts.get(spec.id);if(old?.root===root)continue;if(root){attach(root,spec.label,retired.get(spec.id));retired.delete(spec.id);changed=true;}}
  // Every scan or reconciliation that changes inventory notifies on its own.
  if(changed)notify();
 }
 const onShow=event=>{
  let c=contexts.get(event.target?.id);
  if(c&&c.root!==event.target){sync();c=contexts.get(event.target?.id);}
  if(!c){
   const root=event.target;if(root?.localName!=='menupopup'||!root.id||root.parentElement?.closest('menupopup,menu')||root.closest('[data-cme-owned]'))return;
   const epoch=(pendingOpenings.get(root)||0)+1;pendingOpenings.set(root,epoch);
   // The owner's popupshowing handler may create all its rows. Inspect after
   // that dispatch, and apply on this first opening rather than the next one.
   window.queueMicrotask(()=>{if(destroyed||pendingOpenings.get(root)!==epoch||event.defaultPrevented||!root.isConnected)return;
    // Listener ownership cannot be observed, so this opening rechecks only its own root.
    unowned.delete(root);sync();const late=contexts.get(root.id);if(!late||late.root!==root||late.open)return;late.open=true;late.bypass=Boolean(getState()?.options?.shiftBypass&&(event.shiftKey||trigger?.shiftKey&&window.performance.now()-trigger.time<1500));trigger=null;late.reconciliations=0;reconcile(late);});return;
  }
  if(c.root!==event.target)return;
  c.epoch++;c.reconciliations=0;const epoch=c.epoch;restore(c);c.open=false;
  const recentTrigger=trigger?.rootId===c.root.id&&window.performance.now()-trigger.time<1500?trigger:null;
  c.bypass=Boolean(getState()?.options?.shiftBypass&&(event.shiftKey||event.triggerEvent?.shiftKey||c.root.triggerEvent?.shiftKey||recentTrigger?.shiftKey));trigger=null;
  // Capture happens before native root handlers; apply only after dispatch has completed.
  window.queueMicrotask(()=>{if(destroyed||c.epoch!==epoch||event.defaultPrevented||!c.root.isConnected){observe(c);return;}c.open=true;reconcile(c);});
 };
 const onHide=event=>{if(event.target)pendingOpenings.set(event.target,(pendingOpenings.get(event.target)||0)+1);const c=contexts.get(event.target?.id);if(!c||c.root!==event.target)return;c.epoch++;c.open=false;restore(c);observe(c);};
 const onShown=event=>{
  const popup=event.target;if(popup?.localName!=='menupopup'||!popup.closest('[data-cme-root]'))return;
  // Child popups have no rendered glyph bounds while their parent is closed.
  popup.querySelectorAll('.cme-decoration > .cme-symbol').forEach(symbol=>fitSymbol(window,symbol));
 };
 const onContext=event=>{
  const target=event.target,explicit=target.closest?.('[context]')?.getAttribute('context');
  const rootId=contexts.has(explicit)?explicit:target.closest?.('tab,.tabbrowser-tab')?'tabContextMenu':'contentAreaContextMenu';
  trigger={rootId,shiftKey:event.shiftKey,time:window.performance.now()};
 };
 window.addEventListener('contextmenu',onContext,true);
 window.addEventListener('popupshowing',onShow,true);window.addEventListener('popupshown',onShown,true);window.addEventListener('popuphiding',onHide,true);window.addEventListener('popuphidden',onHide,true);
 // Document-wide insertions only matter when they can add a top-level popup or
 // move a tracked/built-in root. Changes inside tracked roots, the editor's own
 // containers and unrelated chrome churn never rescan; relevant batches coalesce.
 rootObserver=new window.MutationObserver(records=>{let relevant=false;for(const record of records)if(rootRecord(record))relevant=true;if(relevant||(!syncQueued&&staleRoots()))queueSync();});
 rootObserver.observe(document,{childList:true,subtree:true});sync(true);
 const destroy=()=>{if(destroyed)return;destroyed=true;rootObserver.disconnect();clearOwnerSettingsChanges();for(const c of contexts.values()){c.epoch++;c.open=false;restore(c);c.observer.disconnect();}contexts.clear();retired.clear();listeners.clear();window.removeEventListener('contextmenu',onContext,true);window.removeEventListener('popupshowing',onShow,true);window.removeEventListener('popupshown',onShown,true);window.removeEventListener('popuphiding',onHide,true);window.removeEventListener('popuphidden',onHide,true);window.removeEventListener('unload',destroy);};
 window.addEventListener('unload',destroy,{once:true});
 return {getInventory:()=>inventory,noteOwnerSettingsChange,clearOwnerSettingsChanges,refresh(){sync(true);for(const c of contexts.values())reconcile(c);},subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},destroy};
}
