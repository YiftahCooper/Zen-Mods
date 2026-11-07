const done=arguments[arguments.length-1];
// Restart phase 1: build folders, move a tab between folders, record the
// expected placement in a profile pref, then let the driver quit cleanly.
(async()=>{
 const w=Services.wm.getMostRecentWindow('navigator:browser'),pause=ms=>new Promise(r=>w.setTimeout(r,ms));
 const wait=async(fn,label,tries=400,ms=20)=>{for(let i=0;i<tries;i++){try{if(fn())return;}catch{}await pause(ms);}throw Error('Timeout '+label);};
 await wait(()=>w.__betterZenFoldersController?.started,'BZF');
 const base=Services.prefs.getStringPref('bzf.proof.base-url'),gB=w.gBrowser,SS=w.SessionStore;
 const loaded=async p=>{const t=gB.addTrustedTab(base+p,{inBackground:true});await wait(()=>t.linkedBrowser.currentURI.spec===base+p&&!t.linkedBrowser.webProgress?.isLoadingDocument,'load '+p);return t;};
 const url=t=>{try{const s=JSON.parse(SS.getTabState(t));return s.entries?.[(s.index||s.entries.length)-1]?.url??null;}catch{return null;}};
 const snap=()=>[...w.document.querySelectorAll('zen-folder')].filter(f=>f.label?.startsWith('Restart ')).map(f=>({label:f.label,
  parent:f.parentElement?.closest('zen-folder')?.label??null,tabs:[...f.tabs].filter(t=>t.group===f).map(url),
  colour:f.getAttribute('data-better-zen-folders-color'),collapsed:f.collapsed})).sort((a,b)=>a.label.localeCompare(b.label));
 const a=[await loaded('/ra-1'),await loaded('/ra-2'),await loaded('/ra-3')],b=[await loaded('/rb-1'),await loaded('/rb-2')],n=[await loaded('/rn-1')];
 const A=await w.gZenFolders.createFolder(a,{renameFolder:false,label:'Restart A',insertBefore:a[0]});
 const B=await w.gZenFolders.createFolder(b,{renameFolder:false,label:'Restart B',insertBefore:b[0]});
 const N=await w.gZenFolders.createFolder(n,{renameFolder:false,label:'Restart nested',insertBefore:n[0]});
 A.groupContainer.appendChild(N);gB.tabContainer._invalidateCachedTabs?.();A.collapsed=false;B.collapsed=false;
 const colours=w.__betterZenFoldersController.adapters.managers.find(m=>m.constructor?.name==='FolderColorManager');
 colours.setColor(B,'#2f7fd0');
 await pause(500);
 const method=typeof gB.moveTabToExistingGroup==='function'?'moveTabToExistingGroup':'appendChild';
 if(method==='moveTabToExistingGroup')gB.moveTabToExistingGroup(a[1],B);else B.groupContainer.appendChild(a[1]);
 await wait(()=>a[1].group===B,'moved');await pause(2500);
 // URL pin through the real tab context menu, then quit soon afterwards.
 let pin={feature:Services.prefs.getBoolPref('better-zen-folders.folder-url-pins-enabled',false)};
 if(pin.feature){
  const pins=w.__betterZenFoldersFolderPins;await wait(()=>pins?.origins?.active,'URL pins');
  const P=b[0];gB.selectedTab=P;await pause(150);
  const menu=w.document.getElementById('tabContextMenu');
  const shown=new Promise(r=>menu.addEventListener('popupshown',r,{once:true}));
  menu.openPopup(P,'after_start',0,0,true,false,null);await Promise.race([shown,pause(2000)]);
  const item=w.document.getElementById('better-zen-folders-pin-url');
  pin.menuItem={label:item?.getAttribute('label')??null,disabled:!!item?.disabled,contextTab:w.TabContextMenu?.contextTab===P};
  item?.doCommand();menu.hidePopup();
  await wait(()=>pins.store.read(P).explicit===true,'menu pin',200);await pause(300);
  pin.storeAfterMenuPin=pins.store.read(P).explicit;
  pin.recordAfterMenuPin=JSON.parse(SS.getCustomTabValue(P,'betterZenFolders.restore.v1')||'null')?.urlPin??null;
  pin.url=url(P);
  Services.prefs.setStringPref('bzf.proof.pinned-url',pin.url);
 }
 const expected=snap();
 Services.prefs.setStringPref('bzf.proof.expected',JSON.stringify(expected));
 Services.prefs.savePrefFile(null);
 return {method,pin,expected,movedRecord:JSON.parse(SS.getCustomTabValue(a[1],'betterZenFolders.restore.v1')||'null')?.folders?.map(f=>f.name)};
})().then(done,error=>done({error:String(error),stack:error.stack}));
