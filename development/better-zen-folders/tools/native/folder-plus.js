const done=arguments[arguments.length-1];
(async()=>{
 const w=Services.wm.getMostRecentWindow('navigator:browser'),pause=ms=>new Promise(r=>w.setTimeout(r,ms));
 const wait=async(fn,label)=>{for(let i=0;i<250;i++){if(fn())return;await pause(20);}throw Error('Timeout '+label);};
 const assert=(ok,why)=>{if(!ok)throw Error(why);};
 await wait(()=>w.__betterZenFoldersController?.started,'BZF');
 let pins=w.__betterZenFoldersFolderPins;
 const feature=Services.prefs.getBoolPref('better-zen-folders.folder-url-pins-enabled',false);
 if(feature)await wait(()=>pins?.origins?.active,'URL pins');
 const base=Services.prefs.getStringPref('bzf.proof.base-url');
 const original=w.gBrowser.addTrustedTab(base+'/outside');w.gBrowser.selectedTab=original;
 await wait(()=>original.linkedBrowser.currentURI.spec===base+'/outside'&&!original.linkedBrowser.webProgress.isLoadingDocument,'outside origin');
 const a=w.gBrowser.addTrustedTab('about:blank'),b=w.gBrowser.addTrustedTab('about:blank');
 const folder=await w.gZenFolders.createFolder([a,b],{renameFolder:false,label:'Synthetic destination',insertBefore:a});
 const results=[];
 async function open(name,{position='bottom',pin=false,collapsed=false,background=false}={}){
  Services.prefs.setStringPref('better-zen-folders.new-tab-position',position);
  Services.prefs.setBoolPref('better-zen-folders.pin-new-folder-tab-urls',pin);
  folder.collapsed=collapsed;w.gBrowser.selectedTab=original;await pause(100);
  const before=new Set(w.gBrowser.tabs),events=[],frames=[],url=base+'/'+name.replaceAll(' ','-');
  let unrelated=null,opened=null,sampling=true;
  const witness=e=>{if(!before.has(e.target)&&e.target!==unrelated)events.push({tab:e.target,group:e.target.group,pinned:e.target.pinned});};
  w.gBrowser.tabContainer.addEventListener('TabOpen',witness,true);
  folder.querySelector('.better-zen-folders-new-tab-button').doCommand();
  await wait(()=>w.gURLBar.hasAttribute('zen-newtab'),'dialogue '+name);
  if(background){
   unrelated=w.gBrowser.addTrustedTab(base+'/background',{inBackground:true});before.add(unrelated);events.length=0;
   assert(!unrelated.group&&!unrelated.pinned,'background tab captured before confirmed request');
  }
  await w.gURLBar.search(url);await pause(180);
  const sample=()=>{for(const t of w.gBrowser.tabs)if(!before.has(t))frames.push({group:t.group?.id??null,normal:!!t.closest('.zen-workspace-normal-tabs-section'),order:position==='top'?!!(t.compareDocumentPosition(a)&4):!!(b.compareDocumentPosition(t)&4),collapsed:folder.collapsed});if(sampling)w.requestAnimationFrame(sample);};
  w.requestAnimationFrame(sample);w.gURLBar.handleCommand();
  await wait(()=>Array.from(w.gBrowser.tabs).some(t=>!before.has(t)),'creation '+name);
  opened=Array.from(w.gBrowser.tabs).find(t=>!before.has(t));
  await wait(()=>!w.gURLBar.hasAttribute('zen-newtab'),'confirmation '+name);
  await wait(()=>opened.linkedBrowser.currentURI.spec===url&&!opened.linkedBrowser.webProgress.isLoadingDocument,'navigation '+name);
  await pause(120);sampling=false;w.gBrowser.tabContainer.removeEventListener('TabOpen',witness,true);
  assert(events.length===1&&events[0].group===folder&&events[0].pinned,'wrong creation boundary '+name);
  assert(frames.length>0&&frames.every(f=>f.group===folder.id&&!f.normal&&f.order&&f.collapsed===collapsed),'bad frame '+name+' '+JSON.stringify(frames));
  assert(opened.group===folder&&w.gBrowser.selectedTab===opened,'final selection '+name);
  await pins?.origins?.flush();
  if(feature){assert(pins.store.read(opened).explicit===pin,'pin policy '+name);if(pin)assert(opened._zenPinnedInitialState?.entry?.url===url,'placeholder URL pinned '+name);}
  if(background)assert(!unrelated.group&&!unrelated.pinned,'background tab captured after confirmation');
  results.push({case:name,position,collapsed,atTabOpen:true,frames:frames.length,allFramesCorrect:true,urlPin:feature?pins.store.read(opened).explicit:null,backgroundUntouched:background?!unrelated.group&&!unrelated.pinned:null});
 }
 await open('root bottom');await open('root top',{position:'top'});
 await open('root collapsed',{collapsed:true});
 const p=w.gBrowser.addTrustedTab('about:blank'),q=w.gBrowser.addTrustedTab('about:blank');
 const parent=await w.gZenFolders.createFolder([p,q],{renameFolder:false,label:'Synthetic parent',insertBefore:p});
 parent.groupContainer.appendChild(folder);w.gBrowser.tabContainer._invalidateCachedTabs();parent.collapsed=false;
 await open('nested top',{position:'top'});await open('nested bottom with URL pins',{pin:true});
 await open('background during dialogue',{background:true});
 // A dismissed request must not influence a subsequent regular-area URL-bar load.
 w.gBrowser.selectedTab=original;folder.querySelector('.better-zen-folders-new-tab-button').doCommand();
 await wait(()=>w.gURLBar.hasAttribute('zen-newtab'),'cancel dialogue');
 w.gURLBar._zenHandleUrlbarClose(false,false);await wait(()=>!w.gURLBar.hasAttribute('zen-newtab'),'cancel');await pause(50);
 const control=w.openTrustedLinkIn(base+'/cancel-control','tab',{initiatedByURLBar:true,inBackground:true});
 // openTrustedLinkIn has no return value in this build; inspect the created tab.
 const regular=Array.from(w.gBrowser.tabs).find(t=>t.linkedBrowser.currentURI.spec===base+'/cancel-control');
 await wait(()=>Array.from(w.gBrowser.tabs).some(t=>t.linkedBrowser.currentURI.spec===base+'/cancel-control'),'cancel control load');
 const controlTab=regular??Array.from(w.gBrowser.tabs).find(t=>t.linkedBrowser.currentURI.spec===base+'/cancel-control');
 assert(!controlTab.group&&!controlTab.pinned,'cancelled request leaked');
 const old=w.__betterZenFoldersController,sine=ChromeUtils.importESModule('chrome://userscripts/content/core/manager.sys.mjs').default;
 await sine.rebuildMods();await sine.loadMods(null,['5b0aa51f-cea7-4de5-8344-3e86e77fb88d']);
 await wait(()=>w.__betterZenFoldersController!==old&&w.__betterZenFoldersController?.started,'stock live reload');
 pins=w.__betterZenFoldersFolderPins;if(feature)await wait(()=>pins?.origins?.active,'reloaded URL pins');
 await open('after stock live reload',{position:'top'});
 return {cases:results,feature,cancelledRequestRetired:true,stockSineReload:true};
})().then(done,error=>done({error:String(error),stack:error.stack}));
