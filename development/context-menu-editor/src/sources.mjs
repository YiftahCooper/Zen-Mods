const XUL='http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul';
const MENU_TAGS=new Set(['menu','menuitem','menupopup','menuseparator','menugroup']);
const EVENTS=new Set(['command','click','popupshowing']);
const UNKNOWN=Object.freeze({kind:'unknown',name:'Source unknown'});
const BROWSER=Object.freeze({kind:'browser',name:'Zen Browser',via:'browser'});
const BUILT_IN_ROOTS=['contentAreaContextMenu','tabContextMenu','placesContext','zenFolderActions'];
const OWN_PREFIX='chrome://sine/content/context-menu-editor/';
const MOD_FRAME=/^chrome:\/\/sine\/content\/([\w.-]+)\//;
// Sine's own helpers create elements on behalf of the mod that called them.
const TRANSPARENT_PREFIXES=['chrome://userscripts/content/','self-hosted'];
// One creation hook per document survives this editor's unload when another
// script wrapped the same method later. A reload reuses it instead of stacking.
const HOOK='__contextMenuEditorCreationHook';
// This module's own file (the bundle, or src/sources.mjs in unit tests). Its
// frames (capture, the creation hook) are skipped when naming a creator.
const OWN_FILE=(()=>{
 try{return String(new Error().stack||'').split('\n').map(line=>frameURL(line)).find(Boolean)||null;}
 catch{return null;}
})();

/** Parse browser.xhtml as inert XML once per build. `rows` are the IDs inside
 * the four built-in roots (attributed to the browser); `popups` and `popupRows`
 * are every menupopup ID and every ID inside any menupopup. */
export function browserMarkupIds(window,markup){
 // Neutralize privileged XUL before inert XML parsing. Keeping XML hierarchy
 // matters: HTML parsing treats self-closing menu elements as unclosed tags.
 const inert=markup.split(XUL).join('urn:context-menu-editor:inert-xul');
 const parsed=new window.DOMParser().parseFromString(inert,'application/xml');
 const rows=new Set(),popups=new Set(),popupRows=new Set();
 function visit(document){
  for(const rootId of BUILT_IN_ROOTS){
   const root=document.querySelector(`[id="${rootId}"]`);
   for(const item of root?.querySelectorAll('[id]')||[])rows.add(item.id);
  }
  for(const popup of document.querySelectorAll('menupopup')){
   if(popup.id)popups.add(popup.id);
   for(const item of popup.querySelectorAll('[id]'))popupRows.add(item.id);
  }
  for(const template of document.querySelectorAll('template'))if(template.content)visit(template.content);
 }
 visit(parsed);
 return {rows,popups,popupRows};
}
export const browserMenuIds=(window,markup)=>browserMarkupIds(window,markup).rows;

/** The URL of one stack frame, in Gecko (`name@url:1:2`) or V8 (`at name (url:1:2)`) form. */
function frameURL(line){
 let text=line.trim();
 if(!text)return null;
 if(text.startsWith('at ')){
  const inner=text.match(/\(([^()]*)\)$/);
  text=inner?inner[1]:text.slice(3);
 }else{
  const at=text.lastIndexOf('@');
  if(at<0)return null;
  text=text.slice(at+1);
 }
 // "url line 2 > eval:1:5" names the evaluating script first.
 text=text.split(' ')[0].replace(/:\d+(?::\d+)?$/,'');
 return text||null;
}

/** Ephemeral provenance only. Never execute handlers or persist script paths. */
export function createSourceTracker(window,{initialMods={},loadMods,listenerInfo=()=>[],functionLocation=()=>null,
 builtInIds=new Set(),onChange=()=>{}}={}){
 const document=window.document;
 let mods=new Map(),creation=new WeakMap(),disposed=false,pending=null,lastRefresh=0,nativeIds=builtInIds,uncatalogued=false;

 function setMods(value){
  const next=new Map();
  for(const mod of Object.values(value||{})){
   if(!mod||typeof mod.id!=='string'||!/^[\w.-]{1,256}$/.test(mod.id)||typeof mod.name!=='string')continue;
   next.set(mod.id,{id:mod.id,name:mod.name.replace(/[\u0000-\u001f\u007f]/g,' ').trim().slice(0,120)||mod.id});
  }
  mods=next;
 }
 function identify(value,via){
  if(typeof value!=='string')return null;
  for(const match of value.matchAll(/chrome:\/\/sine\/content\/([\w.-]+)\//g)){
   const mod=mods.get(match[1]);
   if(mod&&mod.id!=='context-menu-editor')return {kind:'mod',...mod,via};
   if(!mod&&match[1]!=='context-menu-editor')uncatalogued=true;
  }
  return null;
 }
 async function refresh(){
  if(disposed||!loadMods||pending)return pending;
  lastRefresh=Date.now();
  pending=Promise.resolve().then(loadMods).then(value=>{
   if(disposed)return;
   const before=JSON.stringify([...mods]);
   setMods(value);
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
 /** The creating script, only when it is the innermost frame outside this
  * editor (and Sine's helpers). Native code that merely runs below a mod frame,
  * for example a wrapped browser function, is not that mod's creation. */
 function creationURI(node){
  const value=creation.get(node);
  if(!value||typeof value!=='object')return value;
  let stack='';
  try{stack=String(value.stack||'');}catch{/* An unreadable stack names no source. */}
  let uri=null;
  const urls=stack.split('\n').map(frameURL).filter(Boolean);
  // Frames inside the Error constructor (instrumentation) precede capture().
  const own=urls.indexOf(OWN_FILE);
  for(const url of own>=0?urls.slice(own):urls){
   if(url===OWN_FILE||url.startsWith(OWN_PREFIX)||TRANSPARENT_PREFIXES.some(prefix=>url.startsWith(prefix)))continue;
   uri=MOD_FRAME.test(url)?url:null;
   break;
  }
  // Afterwards keep only the source URI (or null).
  creation.set(node,uri);
  return uri;
 }

 const hook=installCreationHook(document);
 hook.capture=capture;

 function handlerSource(node){
  const candidates=[node,...[...node.children||[]].filter(child=>child.localName==='menupopup')];
  for(const target of candidates){
   let entries;
   try{entries=listenerInfo(target)||[];}catch{continue;}
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
     const location=functionLocation(handler);
     const source=identify(location?.filename||location?.source,'handler');
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
 setMods(initialMods);
 const ready=refresh()||Promise.resolve();
 return {
  resolve,setMods,refresh,ready,
  setBrowserIds(ids){if(!disposed){nativeIds=new Set(ids);onChange();}},
  destroy(){
   if(disposed)return;
   disposed=true;
   if(hook.capture===capture)hook.capture=null;
   releaseCreationHook(document,hook);
   creation=new WeakMap();
   mods.clear();
  }};
}

function installCreationHook(document){
 let hook=document[HOOK];
 if(!hook){
  hook={capture:null,wrappers:new Map()};
  try{Object.defineProperty(document,HOOK,{value:hook,configurable:true});}catch{}
 }
 const wrap=(name,accept)=>{
  if(hook.wrappers.has(name))return; // A wrapper left by an earlier instance still forwards here.
  const original=document[name],descriptor=Object.getOwnPropertyDescriptor(document,name);
  if(typeof original!=='function')return;
  const wrapped=function(...args){
   const node=Reflect.apply(original,this,args);
   if(hook.capture&&accept(args))hook.capture(node);
   return node;
  };
  try{Object.defineProperty(document,name,{value:wrapped,writable:true,configurable:true});}
  catch{return;}
  hook.wrappers.set(name,{wrapped,descriptor});
 };
 wrap('createXULElement',args=>MENU_TAGS.has(args[0]));
 wrap('createElementNS',args=>args[0]===XUL&&MENU_TAGS.has(args[1]));
 return hook;
}

function releaseCreationHook(document,hook){
 for(const [name,{wrapped,descriptor}]of [...hook.wrappers]){
  // Another script wrapped this method after us: removing ours would drop
  // theirs. Leave ours as an inert pass-through for the next instance to reuse.
  if(document[name]!==wrapped)continue;
  if(descriptor)Object.defineProperty(document,name,descriptor);else delete document[name];
  hook.wrappers.delete(name);
 }
 if(!hook.wrappers.size&&document[HOOK]===hook){try{delete document[HOOK];}catch{}}
}
