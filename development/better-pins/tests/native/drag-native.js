const done=arguments[arguments.length-1];
(async()=>{
 const wait=ms=>new Promise(r=>setTimeout(r,ms));
 const assert=(v,m)=>{if(!v)throw Error(m);};
 Services.io.getProtocolHandler('resource').QueryInterface(Ci.nsIResProtocolHandler).setSubstitution('bp-native-drag',Services.io.newURI(Services.prefs.getStringPref('bp.test.source-root')));
 const api=ChromeUtils.importESModule('resource://bp-native-drag/scripts/better-pins.uc.mjs');window.addUnloadListener??=(fn)=>window.addEventListener('unload',fn,{once:true});await api.bootstrap(window);
 const c=window.__betterPinsController;assert(c?.result?.ok,'bootstrap');
 const link=document.createElementNS('http://www.w3.org/1999/xhtml','link');link.rel='stylesheet';link.href=Services.prefs.getStringPref('bp.test.source-root')+'chrome.css';document.documentElement.appendChild(link);
 const events={};Services.scriptloader.loadSubScript('chrome://remote/content/external/EventUtils.js',events);
 const a=await c.newTab('upper'),b=await c.newTab('upper'),external=await c.newTab('lower');
 const folder=gZenFolders.createFolder([a,b],{label:'Native drag folder'});await c.origins.flush();await wait(200);
 const results=[];
 for(const mode of ['expanded','collapsed-external','collapsed-selected-child']){
  try{
   for(const destination of ['lower','upper']){
    await c.zones.move(folder,destination==='lower'?'upper':'lower');folder.collapsed=mode!=='expanded';gBrowser.selectedTab=mode==='collapsed-selected-child'?a:external;await wait(150);
    const space=c.zones.space(folder),pane=destination==='lower'?space.tabsContainer:space.pinnedTabsContainer;
    const source=folder.querySelector('.tab-group-label-container'),r=pane.getBoundingClientRect();
    events.synthesizeMouse(source,50,20,{type:'mousedown'},window);await wait(0);
    events.synthesizeMouse(source,60,25,{type:'mousemove'},window);await wait(0);
    events.synthesizeMouse(source,70,30,{type:'mousemove'},window);await wait(0);
    assert(c.presentation.drag?.item===folder,'trusted dragstart did not resolve folder');
    const coordinates={clientX:r.left+30,clientY:r.bottom-10};
    events.sendDragEvent({type:'dragenter',...coordinates},pane,window);
    events.sendDragEvent({type:'dragover',...coordinates},pane,window);
    assert(c.presentation.dropMarker&&!c.presentation.dropMarker.hidden,'marker missing');
    const m=c.presentation.dropMarker.getBoundingClientRect();assert(m.top>=r.top&&m.top<=r.bottom,'marker in wrong pane');
    events.sendDragEvent({type:'drop',...coordinates},pane,window);
    window.windowUtils.dragSession?.endDragSession(true,0);
    events.synthesizeMouse(pane,30,20,{type:'mouseup'},window);
    await wait(150);assert(api.areaOf(folder)===destination,'wrong destination '+destination);assert(folder.tabs.filter(t=>!t.hasAttribute('zen-empty-tab')).length===2,'folder children lost');
   }
   results.push({name:'native-drag-'+mode+'-both-directions',pass:true});
  }catch(e){results.push({name:'native-drag-'+mode+'-both-directions',pass:false,error:String(e),stack:e.stack});}
 }
 return {results};
})().then(done,e=>done({error:String(e),stack:e.stack}));
