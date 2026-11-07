const done=arguments[arguments.length-1];
// Restart phase 2: the resumed session keeps folders, the moved tab's
// placement, colours and every folder decoration.
(async()=>{
 const w=Services.wm.getMostRecentWindow('navigator:browser'),pause=ms=>new Promise(r=>w.setTimeout(r,ms));
 const wait=async(fn,label,tries=500,ms=20)=>{for(let i=0;i<tries;i++){try{if(fn())return;}catch{}await pause(ms);}throw Error('Timeout '+label);};
 await wait(()=>w.__betterZenFoldersController?.started,'BZF');
 const gB=w.gBrowser,SS=w.SessionStore;await SS.promiseAllWindowsRestored;
 const expected=JSON.parse(Services.prefs.getStringPref('bzf.proof.expected','[]'));
 const url=t=>{try{const s=JSON.parse(SS.getTabState(t));return s.entries?.[(s.index||s.entries.length)-1]?.url??null;}catch{return null;}};
 const snap=()=>[...w.document.querySelectorAll('zen-folder')].filter(f=>f.label?.startsWith('Restart ')).map(f=>({label:f.label,
  parent:f.parentElement?.closest('zen-folder')?.label??null,tabs:[...f.tabs].filter(t=>t.group===f).map(url),
  colour:f.getAttribute('data-better-zen-folders-color'),collapsed:f.collapsed})).sort((a,b)=>a.label.localeCompare(b.label));
 let actual=[];try{await wait(()=>JSON.stringify(actual=snap())===JSON.stringify(expected),'placement',300,30);}catch{}
 await pause(800);actual=snap();
 const row=f=>f.querySelector(':scope > .tab-group-label-container');
 const deco=[...w.document.querySelectorAll('zen-folder')].filter(f=>f.label?.startsWith('Restart ')).map(f=>{const r=row(f);return {label:f.label,
  plus:!!r?.querySelector('.better-zen-folders-new-tab-button'),hideUnload:r?.getAttribute('better-zen-folders-hide-unload')==='true',
  icon:!!r?.querySelector(':scope > .tab-group-folder-icon > svg'),underline:!!r?.querySelector('.better-zen-folders-sticky-underline')};});
 // The URL pin made through the menu just before quit survives the restart.
 const pinnedUrl=Services.prefs.getStringPref('bzf.proof.pinned-url','');let pin=null;
 if(pinnedUrl){const pins=w.__betterZenFoldersFolderPins;await wait(()=>pins?.origins?.active,'URL pins');await pause(300);
  const P=[...gB.tabs].find(t=>url(t)===pinnedUrl);
  pin={found:!!P,explicit:P?pins.store.read(P).explicit:null,badge:!!P?.querySelector('.better-zen-folders-url-pin'),
   record:P?JSON.parse(SS.getCustomTabValue(P,'betterZenFolders.restore.v1')||'null')?.urlPin??null:null,group:P?.group?.label??null};}
 const placement=expected.length===3&&JSON.stringify(actual)===JSON.stringify(expected);
 const decorated=deco.length===3&&deco.every(d=>d.plus&&d.hideUnload&&d.icon&&d.underline);
 const pinKept=!pin||(pin.explicit===true&&pin.badge);
 return {pass:placement&&decorated&&pinKept,placement,decorated,pinKept,pin,expected,actual,deco};
})().then(done,error=>done({error:String(error),stack:error.stack}));
