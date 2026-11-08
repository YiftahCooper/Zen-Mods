/** Live inventory only. Labels and node references must never enter persistent state. */
export const ROOTS = Object.freeze([
 {id:'contentAreaContextMenu',label:'Page menu'},
 {id:'tabContextMenu',label:'Tab menu'},
 {id:'placesContext',label:'Bookmarks menu'},
 {id:'zenFolderActions',label:'Folder menu'},
]);
export const isHidden = node => Boolean(node && ((node.hasAttribute('hidden') ? node.getAttribute('hidden') !== 'false' : node.hidden === true) || node.getAttribute('collapsed') === 'true'));
const owned = node => node.closest?.('[data-cme-owned]');
const transient = node => node.matches?.('.spell-suggestion, .spell-suggestion-item, .bookmark-item, [data-cme-transient]') || /^(?:spell-suggestion-|spell-add-to-dictionary-|webext-context-menu-(?:.*-)?\d+$)/.test(node.id) || /-menuitem-\d+$/.test(node.id);
const AI_IDS = new Set(['context_askChat','context-ask-chat','context-ask-chatgpt','context-genai']);
// The rows SharingUtils inserts Share after (classic and alternative tab menu layouts).
const SHARE_ANCHORS = ['context_moveTabOptions','context_shareSelectedTabs'];
const digest=value=>{
 let a=2166136261,b=5381;for(const char of value){const code=char.codePointAt(0);a=Math.imul(a^code,16777619);b=Math.imul(b,33)^code;}
 return (a>>>0).toString(36)+(b>>>0).toString(36);
};

export function discoverRoot(root,{resolveSource=()=>null}={}) {
 const styles=new Map(),style=node=>{if(!styles.has(node))styles.set(node,node?.ownerDocument?.defaultView?.getComputedStyle(node));return styles.get(node);};
 const unavailable=node=>node&&(isHidden(node)||node.style?.display==='none'||(!node.hasAttribute('hidden')&&style(node)?.display==='none')||['hidden','collapse'].includes(node.style?.visibility));
 const artwork=node=>{
  const direct=node.getAttribute('image');if(direct)return direct;
  const status=['checkbox','radio'].includes(node.getAttribute('type'));
  const slot=status?null:[...node.children].find(child=>child.matches?.('img.menu-icon,.menu-iconic-icon')&&!child.closest('[data-cme-owned]'));
  // currentSrc can still be the previous decoded image during an async switch.
  // The owner's explicit attributes are the authoritative requested artwork.
  const image=slot&&(slot.getAttribute('src')||slot.getAttribute('srcset'));if(image)return image;
  const css=style(node)?.listStyleImage||(!status&&slot?style(slot)?.listStyleImage:null);
  return css?.match(/^url\(["']?(.*?)["']?\)$/)?.[1]||null;
 };
 const items=[],nodes=new Map(),meta=new Map();
 const all=[...root.querySelectorAll('menuitem,menu,menuseparator,menugroup')].filter(n=>!owned(n));
 const counts=new Map();for(const n of all) if(n.id) counts.set(n.id,(counts.get(n.id)||0)+1);
 const stable=n=>n?.id && counts.get(n.id)===1 && !transient(n);
 const sources=new Map(all.map(node=>[node,resolveSource(node)])),signatures=new Map(),anonymous=new Map(),identities=new Map();
 // SharingUtils creates this browser submenu without an ID. Its exact native
 // root, role class and localization ID are stable; its translated label is not.
 // Keep this adapter narrow and leave ambiguous or source-owned rows alone.
 const nativeShareKey='native:tab-context-share-url';
 const nativeShares=root.id==='tabContextMenu'?all.filter(node=>{
  const source=sources.get(node);
  return !node.id&&!transient(node)&&node.parentElement===root&&node.localName==='menu'&&node.classList.contains('share-tab-url-item')&&node.getAttribute('data-l10n-id')==='tab-context-share-url'&&(!source||['unknown','browser'].includes(source.kind));
 }):[];
 // SharingUtils reuses its menu only when it directly follows the layout anchor;
 // otherwise it inserts another one there. With duplicates, that anchored menu
 // is the one the browser keeps updating, so it carries the user's edits (B3).
 const anchoredShare=()=>{
  const anchored=nativeShares.filter(node=>SHARE_ANCHORS.includes(node.previousElementSibling?.id));
  return anchored.length===1?anchored[0]:null;
 };
 const nativeShare=nativeShares.length===1?nativeShares[0]:nativeShares.length>1?anchoredShare():null;
 if(nativeShare&&!counts.has(nativeShareKey)){
  identities.set(nativeShare,nativeShareKey);
  sources.set(nativeShare,{kind:'browser',name:'Zen Browser',via:'browser'});
 }
 function identity(node){
  if(identities.has(node))return identities.get(node);
  if(stable(node)){identities.set(node,node.id);return node.id;}
  const source=sources.get(node),label=node.getAttribute('label')?.trim();
  if(node.id||transient(node)||!['menu','menuitem'].includes(node.localName)||source?.kind!=='mod'||!source.id||!label||label.length>256)return null;
  const parent=node.parentElement?.closest('menu,menugroup'),parentKey=parent?identity(parent):root.id;
  if(!parentKey)return null;
  const signature=JSON.stringify([source.id,parentKey,node.localName,label]),key=`mod:${source.id}:${digest(signature)}`;
  if(key.length>512)return null;
  const existing=signatures.get(key);signatures.set(key,existing===undefined||existing===signature?signature:null);
  anonymous.set(key,(anonymous.get(key)||0)+1);identities.set(node,key);return key;
 }
 for(const node of all)identity(node);
 const protectedNodes=new Set(),dependencyGroups=new Map();for(const n of all)if(AI_IDS.has(n.id)){protectedNodes.add(n);dependencyGroups.set(n,[n]);if(n.nextElementSibling){protectedNodes.add(n.nextElementSibling);dependencyGroups.get(n).push(n.nextElementSibling);}}
 function walk(container,parentKey=null,boundary=null,inherited=null,groupLocked=false){
  for(const node of container.children){
   if(owned(node))continue;
   const tag=node.localName;
   if(tag==='menupopup'){walk(node,parentKey,boundary,inherited,groupLocked);continue;}
   if(!['menu','menuitem','menuseparator','menugroup'].includes(tag))continue;
   if(node.id==='context-navigation' && tag==='menugroup') {walk(node,parentKey,boundary,node,groupLocked);continue;}
   // Identified mods sometimes recreate ID-less commands each opening. Only
   // unambiguous source + native ancestry + original label matches are reused.
   // Unknown anonymous rows, duplicate labels and separators remain owner-only.
   const key=identities.get(node);
   if(anonymous.has(key)&&(anonymous.get(key)!==1||!signatures.get(key)))continue;
   if(!key || key.length>512)continue;
   const locked=groupLocked||tag==='menugroup'||protectedNodes.has(node);
   const kind=tag==='menuseparator'?'separator':tag==='menu'||tag==='menugroup'?'native-menu':'command';
   const restriction=protectedNodes.has(node)?'This owner-managed action and its adjacent separator must stay together.':groupLocked||tag==='menugroup'?'This owner-managed group requires a movement adapter.':boundary?'Keep this command inside its native submenu to preserve command handling.':'';
   const dependencyGroup=[...dependencyGroups].find(([,members])=>members.includes(node))?.[0].id;
   items.push({key,kind,label:node.getAttribute('label')||node.getAttribute('aria-label')||(kind==='separator'?'Separator':key),parentKey,nativeId:node.id||null,l10nId:node.getAttribute('data-l10n-id')||null,iconURL:artwork(node),available:!unavailable(node)&&!unavailable(inherited),boundary,locked,restriction,...dependencyGroup?{dependencyGroup}:{}});
   const source=sources.get(node);if(source)items[items.length-1].source=source;
   if(anonymous.has(key))items[items.length-1].identity='mod-label';
   nodes.set(key,node);meta.set(key,{navigation:inherited,protected:protectedNodes.has(node)});
   if(kind==='native-menu') walk(node,key,key,inherited,locked);
  }
 }
 walk(root);
 const byNode=new Map(items.map(item=>[nodes.get(item.key),item]));
 return {items,nodes,byNode,meta,protectedNodes,dependencyGroups};
}
