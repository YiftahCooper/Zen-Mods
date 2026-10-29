const done=arguments[arguments.length-1];
(async()=>{
 const wait=ms=>new Promise(r=>setTimeout(r,ms));
 Services.io.getProtocolHandler('resource').QueryInterface(Ci.nsIResProtocolHandler).setSubstitution('bp-drag',Services.io.newURI(Services.prefs.getStringPref('bp.test.source-root')));
 const api=ChromeUtils.importESModule('resource://bp-drag/scripts/better-pins.uc.mjs');window.addUnloadListener??=(fn)=>window.addEventListener('unload',fn,{once:true});await api.bootstrap(window);
 const c=window.__betterPinsController;if(!c?.result?.ok)throw Error('bootstrap');
 const link=document.createElementNS('http://www.w3.org/1999/xhtml','link');link.rel='stylesheet';link.href=Services.prefs.getStringPref('bp.test.source-root')+'chrome.css';document.documentElement.appendChild(link);
 const a=await c.newTab('upper'),b=await c.newTab('upper'),external=await c.newTab('lower');
 const folder=gZenFolders.createFolder([a,b],{label:'Drag test folder'});await c.origins.flush();await wait(250);
 const events=[];for(const type of ['mousedown','mousemove','dragstart','dragenter','dragover','drop','dragend'])window.addEventListener(type,e=>{if(events.length<150)events.push({type,target:e.target.localName,cls:e.target.className?.baseVal??String(e.target.className),trusted:e.isTrusted,x:e.clientX,y:e.clientY,types:e.dataTransfer?[...e.dataTransfer.types]:null});},true);
 window.__bpPrepareDrag=async mode=>{
  events.length=0;
  await c.zones.move(folder,'upper');folder.collapsed=mode!=='expanded';gBrowser.selectedTab=mode==='collapsed-selected-child'?a:external;
  c.zones.layout();await wait(180);const space=c.zones.space(folder);space.pinnedTabsContainer.scrollTop=0;space.tabsContainer.scrollTop=0;
  const row=folder.querySelector('.tab-group-label-container').getBoundingClientRect(),dest=space.tabsContainer.getBoundingClientRect();
  const point={sx:Math.round(row.left+50),sy:Math.round(row.top+row.height/2),dx:Math.round(dest.left+50),dy:Math.round(dest.bottom-16)};
  window.__bpDragFixture={point,row:row.toJSON(),destination:dest.toJSON(),target:document.elementFromPoint(point.sx,point.sy)?.outerHTML.slice(0,400)};return point;
 };
 window.__bpCheckDrag=()=>({area:api.areaOf(folder),markerVisible:!!c.presentation.dropMarker&&!c.presentation.dropMarker.hidden,marker:c.presentation.dropMarker?.getBoundingClientRect().toJSON(),children:folder.tabs.filter(t=>!t.hasAttribute('zen-empty-tab')).length,fixture:window.__bpDragFixture,events:[...events],dragState:!!c.presentation.drag,session:window.windowUtils.dragSession?{canDrop:window.windowUtils.dragSession.canDrop,dragAction:window.windowUtils.dragSession.dragAction,dropEffect:window.windowUtils.dragSession.dataTransfer?.dropEffect,effectAllowed:window.windowUtils.dragSession.dataTransfer?.effectAllowed}:null});
 return {results:[{name:'physical-folder-drag-fixture-ready',pass:true}]};
})().then(done,e=>done({error:String(e),stack:e.stack}));
