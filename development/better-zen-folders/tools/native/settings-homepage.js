const done=arguments[arguments.length-1];
(async()=>{
 const w=Services.wm.getMostRecentWindow('navigator:browser'),pause=ms=>new Promise(r=>w.setTimeout(r,ms));
 const wait=async(fn,label)=>{for(let i=0;i<300;i++){if(fn())return;await pause(30);}throw Error('Timeout '+label);};
 const assert=(ok,why)=>{if(!ok)throw Error(why);};
 await wait(()=>w.__betterZenFoldersController?.started,'BZF');
 let pins=w.__betterZenFoldersFolderPins;
 const pinFeature=Services.prefs.getBoolPref('better-zen-folders.folder-url-pins-enabled',false);
 if(pinFeature)await wait(()=>pins?.origins?.active,'URL pin controller');
 const utils=ChromeUtils.importESModule('chrome://userscripts/content/core/utils.sys.mjs').default;
 const mod='bzf-synthetic-homepage',metadata=(await utils.getMods())[mod],homepage=metadata.homepage;
 const settings=w.gBrowser.addTrustedTab('about:preferences#sineMods'),sibling=w.gBrowser.addTrustedTab('about:blank');
 const folder=await w.gZenFolders.createFolder([settings,sibling],{renameFolder:false,label:'Synthetic Settings source',insertBefore:settings});
 w.gBrowser.selectedTab=settings;
 await wait(()=>settings.linkedBrowser.contentWindow?.document.querySelector('.sineItemHomepageButton'),'Sine UI');
 const page=settings.linkedBrowser.contentWindow,selector='.sineItem[mod-id="'+mod+'"] .sineItemHomepageButton';
 const results=[];
 const open=async(name,expectedFolder,pinNew)=>{
  w.gBrowser.selectedTab=settings;const before=new Set(w.gBrowser.tabs),sourceId=settings.id;
  const button=page.document.querySelector(selector);assert(button,'actual Sine homepage button missing');
  button.click();await wait(()=>Array.from(w.gBrowser.tabs).some(t=>!before.has(t)),'new homepage tab');
  const opened=Array.from(w.gBrowser.tabs).find(t=>!before.has(t));
  await wait(()=>opened.linkedBrowser.currentURI.spec===homepage&&!opened.linkedBrowser.webProgress.isLoadingDocument,'final homepage navigation');
  await pins?.origins?.flush();
  assert((opened.group??null)===expectedFolder,name+': homepage escaped source folder '+JSON.stringify({actual:opened.group?.id??null,expected:expectedFolder?.id??null}));
  assert(w.gBrowser.selectedTab===opened,name+': native foreground selection changed');
  if(expectedFolder){
   assert(settings.nextElementSibling===opened,name+': homepage not directly after Settings');
   if(pins?.origins?.active){
    assert(pins.store.read(opened).explicit===pinNew,name+': new-tab URL-pin default wrong '+JSON.stringify(pins.store.read(opened)));
    if(pinNew)assert(opened._zenPinnedInitialState?.entry?.url===homepage,name+': pinned placeholder instead of final homepage '+JSON.stringify(opened._zenPinnedInitialState));
   }
  }else assert(!opened.pinned,name+': regular Settings created a structural pin');
  results.push({case:name,sourceId,group:opened.group?.id??null,foreground:true,besideSource:expectedFolder?settings.nextElementSibling===opened:null,urlPin:pins?.origins?.active?pins.store.read(opened).explicit:null,finalUrl:opened.linkedBrowser.currentURI.spec});
  return opened;
 };
 Services.prefs.setBoolPref('better-zen-folders.pin-new-folder-tab-urls',false);await pause(100);
 await open('root folder homepage',folder,false);
 await open('repeat homepage',folder,false);
 const a=w.gBrowser.addTrustedTab('about:blank'),b=w.gBrowser.addTrustedTab('about:blank');
 const parent=await w.gZenFolders.createFolder([a,b],{renameFolder:false,label:'Synthetic outer',insertBefore:a});
 parent.groupContainer.appendChild(folder);w.gBrowser.tabContainer._invalidateCachedTabs();
 await open('nested folder homepage',folder,false);
 if(pins?.origins?.active){Services.prefs.setBoolPref('better-zen-folders.pin-new-folder-tab-urls',true);await pause(100);await open('URL-pin default enabled',folder,true);}
 // Stock Sine unload/reload must leave one working set of instance-owned hooks.
 const old=w.__betterZenFoldersController,sine=ChromeUtils.importESModule('chrome://userscripts/content/core/manager.sys.mjs').default;
 await sine.rebuildMods();await sine.loadMods(null,['5b0aa51f-cea7-4de5-8344-3e86e77fb88d']);
 await wait(()=>w.__betterZenFoldersController!==old&&w.__betterZenFoldersController?.started,'Sine live reload');
 assert(!old.started,'old controller remained active');
 pins=w.__betterZenFoldersFolderPins;
 if(pinFeature)await wait(()=>pins?.origins?.active,'reloaded URL pin controller');
 Services.prefs.setBoolPref('better-zen-folders.pin-new-folder-tab-urls',false);await pause(150);
 await open('homepage after stock reload',folder,false);
 // Keep unrelated new tabs and regular-area Settings native.
 const unrelated=w.gBrowser.addTrustedTab('about:blank');assert(!unrelated.group?.isZenFolder&&!unrelated.pinned,'unrelated new tab was swept into folder');
 w.gBrowser.unpinTab(settings);await pause(100);assert(!settings.group?.isZenFolder,'Settings did not reach regular area');
 await open('regular-area Settings homepage',null,false);
 return {cases:results,pinFeature,unrelatedNative:true,stockSineUnmodified:true};
})().then(done,error=>done({error:String(error),stack:error.stack}));
