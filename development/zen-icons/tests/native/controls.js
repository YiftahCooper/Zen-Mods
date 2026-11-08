const done=arguments[arguments.length-1],checks=[];
(async()=>{
  const w=Services.wm.getMostRecentWindow('navigator:browser'),d=w.document;
  const pause=ms=>new Promise(r=>w.setTimeout(r,ms));
  const wait=async(fn,label)=>{for(let i=0;i<250;i++){if(fn())return;await pause(50);}throw Error('Timeout '+label);};
  await wait(()=>w.__betterZenFoldersFolderPins?.policy?.active&&d.getElementById('PanelUI-zen-emojis-picker')?.hasAttribute('zen-icons-enhanced'),'both mods');
  const pins=w.__betterZenFoldersFolderPins,tab=w.gBrowser.addTrustedTab('https://icons.invalid/synthetic');w.gBrowser.selectedTab=tab;
  await wait(()=>tab.linkedBrowser.currentURI.spec.includes('icons.invalid'),'synthetic URL');
  await w.gZenFolders.createFolder([tab],{renameFolder:false,label:'Control Test',insertBefore:tab});await pause(120);await pins.origins.flush();
  const result=await pins.policy.pin(tab);if(!result.ok)throw Error(JSON.stringify(result));
  const sticky=w.__betterZenFoldersController.adapters.managers.find(m=>m.constructor.name==='StickyFolderVisibilityManager');
  sticky.setSticky(tab,true);w.__iconsTestSticky=sticky;
  Services.prefs.setBoolPref('zen-icons.double-click-icons',true);tab.setAttribute('data-icons-control-tab','true');
  await wait(()=>tab.querySelector('.better-zen-folders-url-pin')&&tab.querySelector('.better-zen-folders-sticky-underline'),'control targets');
  return {passed:true,checks:[{name:'native separate URL-pin and Sticky targets ready',passed:true}]};
})().then(done,error=>done({passed:false,checks,error:String(error),stack:error.stack}));
