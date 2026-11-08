const {browser:w,Services,waitFor,pause,nativeEvent,sourceURI}=ctx;
let editor=await waitFor(()=>w.__contextMenuEditor?.controller&&w.__contextMenuEditor,'editor');
await waitFor(()=>w.__betterZenFoldersController,'folder mod');
const root=w.document.getElementById('tabContextMenu'),checks={},details={cases:[]};
const resource=Services.io.getProtocolHandler('resource').QueryInterface(Ci.nsIResProtocolHandler);resource.setSubstitution('cme-geometry',Services.io.newURI(sourceURI));
const model=ChromeUtils.importESModule('resource://cme-geometry/src/model.mjs');
const modelJSON=Cu.getGlobalForObject(model.createState).JSON,patch=value=>modelJSON.parse(JSON.stringify(value));
const ids=['native:tab-context-share-url','context_zenMoveToFolder','better-zen-folders-move-space'];
const inventory=()=>editor.controller.getInventory().find(row=>row.id===root.id)?.items||[];
const read=()=>model.parseState(editor.store.read().raw),save=state=>editor.store.save(w.JSON.parse(model.serializeState(state)),editor.store.read().raw);
const menuByKey=key=>key===ids[0]?root.querySelector(':scope > menu.share-tab-url-item'):w.document.getElementById(key);
async function close(){root.hidePopup();await pause(80);}
async function open(position){
 const tab=w.gBrowser.selectedTab,b=tab.getBoundingClientRect();
 await nativeEvent.synthesizeMouseAtPoint(b.x+b.width/2,b.y+b.height/2,{type:'contextmenu',button:2},w);await waitFor(()=>root.state==='open','native context');
 const event=root.triggerEvent;await close();root.openPopupAtScreen(w.mozInnerScreenX+50,w.mozInnerScreenY+Math.round(w.innerHeight*position),true,event);await waitFor(()=>root.state==='open','positioned native context');await pause(100);
}
// B3 diagnostic: what decides whether Share keeps its native identity.
function diagnose(){
 const shares=[...w.document.querySelectorAll('.share-tab-url-item')],row=editor.controller.diagnostics?.().find(menu=>menu.id===root.id);
 return {count:shares.length,parents:shares.map(node=>node.parentElement?.id||node.parentElement?.localName||null),
  decorated:shares.map(node=>Boolean(node.querySelector(':scope > .cme-decoration'))),
  sources:shares.map(node=>editor.resolveSource?.(node)?.kind??'not exposed'),
  reconciliations:row?.reconciliations??null,inInventory:inventory().some(item=>item.key===ids[0])};
}
const visibleRows=()=>[...root.children].filter(node=>['menu','menuitem'].includes(node.localName)&&node.getBoundingClientRect().height>0);
const shareIcon=menu=>Boolean(menu?.querySelector(':scope > .cme-decoration img')?.getAttribute('src')?.endsWith('/share.svg'));
function geometry(menu,popup){
 const r=menu.getBoundingClientRect(),p=popup.getOuterScreenRect(),left=menu.screenX,top=menu.screenY;
 return {row:{left,top,width:r.width,height:r.height},popup:{left:p.x,top:p.y,width:p.width,height:p.height},adjacent:(Math.abs(p.x-left-r.width)<12||Math.abs(p.x+p.width-left)<12)&&p.y<=top+r.height+12&&p.y+p.height>=top-12};
}
try{
 Services.prefs.setStringPref('layout.css.devPixelsPerPx','1');await pause(250);
 details.initialWindow={dpr:w.devicePixelRatio,width:w.innerWidth,height:w.innerHeight};
 await w.gZenWorkspaces.createAndSaveWorkspace('Geometry destination','★',true);
 w.gZenFolders.createFolder([],{label:'Geometry destination folder',id:'cme-native-geometry-folder'});
 await open(.2);let items=inventory();
 checks.realNativeShareDiscovered=items.some(item=>item.key===ids[0]&&item.source?.kind==='browser');
 checks.realFolderAndSpaceMenusDiscovered=ids.slice(1).every(key=>items.some(item=>item.key===key));
 let state=model.mergeInventory(read(),root.id,items);state.options.iconPack='zen';
 for(const key of state.roots[root.id].children){if(!ids.includes(key))state=model.updateItem(state,root.id,key,patch({hidden:true}));}
 state=model.moveItem(state,root.id,ids[0],null,0,items);save(state);await close();
 for(const phase of ['first-load','sine-reload']){
  if(phase==='sine-reload'){
   const utils=ChromeUtils.importESModule('chrome://userscripts/content/core/utils.sys.mjs').default,manager=w.SineAPI.manager;
   await manager.toggleTheme(await utils.getMods(),'context-menu-editor');await waitFor(()=>!w.__contextMenuEditor,'Sine unload');
   await manager.toggleTheme(await utils.getMods(),'context-menu-editor');editor=await waitFor(()=>w.__contextMenuEditor?.controller&&w.__contextMenuEditor,'Sine reload');
  }
  for(const scale of [1,2])for(const position of [.2,.7]){
   Services.prefs.setStringPref('layout.css.devPixelsPerPx',String(scale));await pause(100);
   for(const key of ids){
    await open(position);const menu=menuByKey(key),popup=menu?.querySelector('menupopup');if(!popup)throw new Error('Native submenu absent: '+key);
    const insert=root.insertBefore.bind(root);let moves=0;root.insertBefore=(node,...args)=>{if(node===menu)moves++;return insert(node,...args);};
    try{
     menu.open=true;await pause(350);const result=geometry(menu,popup);
     const name=`${phase}_scale${scale}_position${position}_${key}`;
     checks[name+'_staysOpen']=popup.state==='open';checks[name+'_staysAnchored']=result.adjacent;checks[name+'_noParentReinsert']=moves===0;
     details.cases.push({phase,scale,position,key,moves,state:popup.state,...result});
     // Record every phase/scale/position case; the aggregate fails if any case loses the icon.
     // Each case asserts the icon and the live position, not only the saved order.
     if(key===ids[0]){
      const visible=shareIcon(menu),first=visibleRows()[0]===menu;
      checks[name+'_nativeShareHasVisibleIcon']=visible;
      checks[name+'_nativeShareFirstLive']=first;
      checks.nativeShareHasVisibleIcon=(checks.nativeShareHasVisibleIcon??true)&&visible;
      checks.nativeShareFirstLive=(checks.nativeShareFirstLive??true)&&first;
      details.cases.at(-1).share=diagnose();
     }
    }finally{root.insertBefore=insert;await close();}
   }
  }
 }
 checks.savedShareOrderRetained=read().roots[root.id].children[0]===ids[0];
 // B3 duplicate: move SharingUtils' anchor away from Share, as a layout mod
 // could. The next opening then inserts a second Share after the anchor.
 Services.prefs.setStringPref('layout.css.devPixelsPerPx','1');await pause(100);
 const before=new Set(root.querySelectorAll(':scope > menu.share-tab-url-item'));
 root.append(w.document.getElementById('context_moveTabOptions'));
 await open(.2);
 const shares=[...root.querySelectorAll(':scope > menu.share-tab-url-item')],live=shares.find(node=>node.querySelector(':scope > .cme-decoration'));
 details.duplicate=diagnose();
 // Zen 1.24 rearranges the menu before SharingUtils runs, so this usually
 // yields no duplicate. Either way the edited Share must stay decorated and first.
 details.duplicateCreated=shares.length===2;
 if(shares.length===2)checks.duplicateShareEditsFollowLiveMenu=Boolean(live)&&!before.has(live);
 checks.duplicateShareKeepsIcon=shareIcon(live);
 checks.duplicateShareKeepsPosition=Boolean(live)&&visibleRows()[0]===live;
 await close();
 return {checks,details,inputEvidence:'Real native SharingUtils, folder and space menus in a fresh profile; reordered Share; real popup population; screen-coordinate adjacency at two scales and vertical positions before and after actual Sine unload/reload. No Share command, clipboard or external sharing service is invoked.'};
}catch(error){checks.completed=false;details.error=String(error);details.stack=error.stack;return {checks,details};}
finally{await close();resource.setSubstitution('cme-geometry',null);}
