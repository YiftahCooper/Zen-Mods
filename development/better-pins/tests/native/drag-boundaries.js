const done=arguments[arguments.length-1];
(async()=>{
 const wait=ms=>new Promise(r=>setTimeout(r,ms)),assert=(v,m)=>{if(!v)throw Error(m);},results=[];
 const test=async(name,fn)=>{try{await fn();results.push({name,pass:true});}catch(e){results.push({name,pass:false,error:String(e),stack:e.stack});}};
 Services.io.getProtocolHandler('resource').QueryInterface(Ci.nsIResProtocolHandler).setSubstitution('bp-drag-boundaries',Services.io.newURI(Services.prefs.getStringPref('bp.test.source-root')));
 const api=ChromeUtils.importESModule('resource://bp-drag-boundaries/scripts/better-pins.uc.mjs');window.addUnloadListener??=(fn)=>window.addEventListener('unload',fn,{once:true});assert((await api.bootstrap(window))?.ok,'bootstrap');
 const c=window.__betterPinsController,events={};Services.scriptloader.loadSubScript('chrome://remote/content/external/EventUtils.js',events);
 const link=document.createElementNS('http://www.w3.org/1999/xhtml','link');link.rel='stylesheet';link.href=Services.prefs.getStringPref('bp.test.source-root')+'chrome.css';document.documentElement.appendChild(link);
 const a=await c.newTab('upper'),b=await c.newTab('upper'),outside=await c.newTab('lower'),folder=gZenFolders.createFolder([a,b],{label:'Boundary folder'});await c.origins.flush();folder.collapsed=false;gBrowser.selectedTab=outside;await wait(120);
 const finish=()=>{window.windowUtils.dragSession?.endDragSession(true,0);events.synthesizeMouse(folder,10,10,{type:'mouseup'},window);};
 const start=async()=>{const source=folder.querySelector('.tab-group-label-container');events.synthesizeMouse(source,50,20,{type:'mousedown'},window);await wait(0);events.synthesizeMouse(source,60,25,{type:'mousemove'},window);await wait(0);events.synthesizeMouse(source,70,30,{type:'mousemove'},window);await wait(0);assert(c.presentation.drag?.item===folder,'native source drag missing');};
 await test('new-unrelated-drag-clears-captured-folder-and-marker',async()=>{
  try{
   await start();const pane=c.zones.space(folder).tabsContainer,r=pane.getBoundingClientRect();events.sendDragEvent({type:'dragover',clientX:r.left+20,clientY:r.bottom-10},pane,window);assert(!c.presentation.dropMarker.hidden,'fixture marker absent');
   const button=c.controls.buttons.get(c.zones.space(folder));events.sendDragEvent({type:'dragstart'},button,window);
   assert(c.presentation.drag===null&&c.presentation.dropMarker.hidden,'previous drag retained');
  }finally{finish();}
 });
 await test('foreign-browser-data-transfer-is-delegated-without-moving-captured-folder',async()=>{
  try{
   await start();const transfer=new DataTransfer();transfer.setData('text/plain','synthetic foreign text');const pane=c.zones.space(folder).tabsContainer,r=pane.getBoundingClientRect();let consumed=false;
   c.presentation.onDrop({target:pane,dataTransfer:transfer,clientX:r.left+20,clientY:r.bottom-10,preventDefault(){consumed=true;},stopImmediatePropagation(){}});
   assert(!consumed&&api.areaOf(folder)==='upper'&&c.presentation.drag===null,'foreign payload moved old folder');
  }finally{finish();}
 });
 await test('native-multiselected-folder-children-keep-native-drag-handling',async()=>{
  try{
   gBrowser.selectedTab=a;gBrowser.addToMultiSelectedTabs(a);gBrowser.addToMultiSelectedTabs(b);assert(a.multiselected&&b.multiselected,'native multi selection missing');
   events.startDragSession(window,'move');events.sendDragEvent({type:'dragstart'},a.querySelector('.tab-label'),window);
   assert(c.presentation.drag===null,'multiselection captured as folder');
  }finally{gBrowser.clearMultiSelectedTabs();finish();}
 });
 return {results};
})().then(done,e=>done({error:String(e),stack:e.stack}));
