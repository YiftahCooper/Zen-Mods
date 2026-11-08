const XUL='http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul';
const MENU_TAGS=new Set(['menu','menuitem','menupopup','menuseparator','menugroup']);
const EVENTS=new Set(['command','click','popupshowing']);
const UNKNOWN=Object.freeze({kind:'unknown',name:'Source unknown'});
const BROWSER=Object.freeze({kind:'browser',name:'Zen Browser',via:'browser'});

export function browserMenuIds(window,markup){
 // Neutralize privileged XUL before inert XML parsing. Keeping XML hierarchy
 // matters: HTML parsing treats self-closing menu elements as unclosed tags.
 const inert=markup.split(XUL).join('urn:context-menu-editor:inert-xul');
 const parsed=new window.DOMParser().parseFromString(inert,'application/xml'),ids=new Set();
 function visit(document){
  for(const rootId of ['contentAreaContextMenu','tabContextMenu','placesContext','zenFolderActions']){
   const root=document.querySelector(`[id="${rootId}"]`);
   for(const item of root?.querySelectorAll('[id]')||[])ids.add(item.id);
  }
  for(const template of document.querySelectorAll('template'))if(template.content)visit(template.content);
 }
 visit(parsed);return ids;
}

/** Ephemeral provenance only. Never execute handlers or persist script paths. */
export function createSourceTracker(window,{initialMods={},loadMods,listenerInfo=()=>[],functionLocation=()=>null,
 builtInIds=new Set(),onChange=()=>{}}={}){
 const document=window.document,restorers=[];
 let mods=new Map(),creation=new WeakMap(),disposed=false,pending=null,lastRefresh=0,nativeIds=builtInIds,uncatalogued=false;
 function setMods(value){
  const next=new Map();
  for(const mod of Object.values(value||{}))if(mod&&typeof mod.id==='string'&&/^[\w.-]{1,256}$/.test(mod.id)&&typeof mod.name==='string'){
   next.set(mod.id,{id:mod.id,name:mod.name.replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,120)||mod.id});
  }
  mods=next;
 }
 function identify(value,via){
  if(typeof value!=='string')return null;
  for(const match of value.matchAll(/chrome:\/\/sine\/content\/([\w.-]+)\//g)){
   const mod=mods.get(match[1]);if(mod&&mod.id!=='context-menu-editor')return {kind:'mod',...mod,via};
   if(!mod&&match[1]!=='context-menu-editor')uncatalogued=true;
  }
  return null;
 }
 async function refresh(){
  if(disposed||!loadMods||pending)return pending;
  lastRefresh=Date.now();
  pending=Promise.resolve().then(loadMods).then(value=>{
   if(disposed)return;const before=JSON.stringify([...mods]);setMods(value);
   if(JSON.stringify([...mods])!==before)onChange();
  }).catch(()=>{}).finally(()=>{pending=null;});
  return pending;
 }
 function capture(node){
  if(disposed||!MENU_TAGS.has(node?.localName))return;
  // The engine records the call frames when the error is constructed. Formatting
  // them as text and matching them is deferred until this node is attributed;
  // most created menu elements (bookmarks, history) never are. The error holds
  // call frames only; caller text, menu labels and selections are not retained.
  creation.set(node,new window.Error());
 }
 function creationURI(node){
  const value=creation.get(node);
  if(!value||typeof value!=='object')return value;
  let stack='';try{stack=String(value.stack||'');}catch{/* An unreadable stack names no source. */}
  // Afterwards keep only the source URI (or null), as before.
  const uri=stack.match(/chrome:\/\/sine\/content\/[\w.-]+\/[^\s)]+/g)?.find(frame=>!frame.startsWith('chrome://sine/content/context-menu-editor/'))||null;
  creation.set(node,uri);return uri;
 }
 function wrap(name,accept){
  const original=document[name],descriptor=Object.getOwnPropertyDescriptor(document,name);
  if(typeof original!=='function')return;
  const wrapped=function(...args){const node=Reflect.apply(original,this,args);if(accept(args))capture(node);return node;};
  try{Object.defineProperty(document,name,{value:wrapped,writable:true,configurable:true});}
  catch{return;}
  restorers.push(()=>{if(document[name]!==wrapped)return;if(descriptor)Object.defineProperty(document,name,descriptor);else delete document[name];});
 }
 setMods(initialMods);
 wrap('createXULElement',args=>MENU_TAGS.has(args[0]));
 wrap('createElementNS',args=>args[0]===XUL&&MENU_TAGS.has(args[1]));
 function handlerSource(node){
  const candidates=[node,...[...node.children||[]].filter(child=>child.localName==='menupopup')];
  for(const target of candidates){
   let entries;try{entries=listenerInfo(target)||[];}catch{continue;}
   for(const entry of entries){
    if(!EVENTS.has(entry.type))continue;
    try{
     let handler=entry.listenerObject;
     if(typeof handler!=='function'){
      // Never invoke a foreign handleEvent getter during mere discovery.
      let object=handler;handler=null;
      for(let depth=0;object&&depth<12;depth++,object=Object.getPrototypeOf(object)){
       const descriptor=Object.getOwnPropertyDescriptor(object,'handleEvent');
       if(descriptor){handler=descriptor.value;break;}
      }
     }
     if(typeof handler!=='function')continue;
     const location=functionLocation(handler),source=identify(location?.filename||location?.source,'handler');
     if(source)return source;
    }catch{/* Native or inaccessible listener metadata is not proof of a mod. */}
   }
  }
  return null;
 }
 function resolve(node){
  if(disposed||!node)return UNKNOWN;
  uncatalogued=false;
  const direct=handlerSource(node)||identify(creationURI(node),'creation');
  if(direct)return direct;
  const artwork=identify(node.getAttribute('image'),'artwork');
  if(uncatalogued&&Date.now()-lastRefresh>2000)void refresh();
  // A theme can replace a native icon without creating the command itself.
  if(nativeIds.has(node.id))return BROWSER;
  return artwork?{...artwork,kind:'artwork'}:UNKNOWN;
 }
 void refresh();
 return {resolve,setMods,refresh,setBrowserIds(ids){if(!disposed){nativeIds=new Set(ids);onChange();}},destroy(){if(disposed)return;disposed=true;for(const restore of restorers.reverse())restore();creation=new WeakMap();mods.clear();}};
}
