const done=arguments[arguments.length-1];
(async()=>{
 const wait=ms=>new Promise(r=>setTimeout(r,ms)),assert=(v,m)=>{if(!v)throw Error(m);};
 const until=async fn=>{for(let i=0;i<160;i++){if(fn())return;await wait(25);}throw Error('compact transition timeout');};
 Services.io.getProtocolHandler('resource').QueryInterface(Ci.nsIResProtocolHandler).setSubstitution('bp-compact',Services.io.newURI(Services.prefs.getStringPref('bp.test.source-root')));
 const api=ChromeUtils.importESModule('resource://bp-compact/scripts/better-pins.uc.mjs');window.addUnloadListener??=(fn)=>window.addEventListener('unload',fn,{once:true});assert((await api.bootstrap(window))?.ok,'bootstrap');
 const c=window.__betterPinsController,manager=gZenCompactModeManager;
 const link=document.createElementNS('http://www.w3.org/1999/xhtml','link');link.rel='stylesheet';link.href=Services.prefs.getStringPref('bp.test.source-root')+'chrome.css';document.documentElement.appendChild(link);
 const tab=await c.newTab('upper');await c.newTab('lower');
 const keys=['zen.tabs.vertical.right-side','zen.view.compact.hide-tabbar','zen.view.compact.hide-toolbar'],before=keys.map(key=>({key,user:Services.prefs.prefHasUserValue(key),value:Services.prefs.getBoolPref(key,false)}));
 const original=manager.preference,variants=[];
 try{
  for(const right of [false,true])for(const mode of ['hideSidebar','hideToolbar','hideBoth']){
   manager.preference=false;await until(()=>!document.documentElement.hasAttribute('zen-compact-animating'));
   Services.prefs.setBoolPref('zen.tabs.vertical.right-side',right);manager[mode]();manager.preference=true;
   await until(()=>manager.preference&&!document.documentElement.hasAttribute('zen-compact-animating'));
   manager._setElementExpandAttribute(manager.sidebar,true);await wait(100);c.zones.layout();
   const space=c.zones.space(tab),u=space.pinnedTabsContainer.getBoundingClientRect(),l=space.tabsContainer.getBoundingClientRect(),d=c.zones.dividers.get(space).getBoundingClientRect();
   assert(u.width>0&&l.width>0&&u.height>=48&&l.height>=48,'zones lost in compact '+mode+'/'+right);
   assert(u.bottom<=d.top+2&&d.bottom<=l.top+2,'zones overlap in compact '+mode+'/'+right);
   assert(!c.controls.buttons.get(space).hidden,'upper button disappeared');
   const count=gZenWorkspaces.allStoredTabs.length;c.controls.buttons.get(space).click();await c.origins.flush();await wait(50);assert(gZenWorkspaces.allStoredTabs.length===count+1&&api.areaOf(gBrowser.selectedTab)==='upper','button wrong in compact mode');
   variants.push({right,mode,upperHeight:u.height,lowerHeight:l.height});
  }
 }finally{
  manager.preference=false;await until(()=>!document.documentElement.hasAttribute('zen-compact-animating'));
  for(const p of before)if(p.user)Services.prefs.setBoolPref(p.key,p.value);else Services.prefs.clearUserPref(p.key);manager.preference=original;
 }
 return {results:[{name:'compact-variants-on-either-sidebar-side-retain-zones-and-button',pass:true,detail:variants}]};
})().then(done,e=>done({error:String(e),stack:e.stack}));
