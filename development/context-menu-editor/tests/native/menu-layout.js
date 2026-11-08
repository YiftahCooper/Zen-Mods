// Full native menus, including an Essential, at the real OS scale. No shortened
// menu, forced popup position, system input or external Share command is used.
const {browser:w,Services,waitFor,pause,nativeEvent,sourceURI}=ctx;
let editor=await waitFor(()=>w.__contextMenuEditor?.controller&&w.__contextMenuEditor,'editor');
const root=w.document.getElementById('tabContextMenu'),checks={},details={cases:[]};
const resource=Services.io.getProtocolHandler('resource').QueryInterface(Ci.nsIResProtocolHandler);
resource.setSubstitution('cme-layout',Services.io.newURI(sourceURI));
const model=ChromeUtils.importESModule('resource://cme-layout/src/model.mjs');
const stateJSON=Cu.getGlobalForObject(model.createState).JSON;
const save=state=>editor.store.save(w.JSON.parse(model.serializeState(state)),editor.store.read().raw);
const box=node=>{const r=node.getBoundingClientRect();return {left:r.left,top:r.top,width:r.width,height:r.height,right:r.right,bottom:r.bottom};};
async function close(){root.hidePopup();await pause(100);}
async function open(){
 const tab=w.gBrowser.selectedTab;tab.scrollIntoView({block:'center'});await pause(60);const r=tab.getBoundingClientRect();
 const hit=w.document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
 if(hit?.closest('tab')!==tab)throw new Error('Native context target is covered: '+hit?.id);
 await nativeEvent.synthesizeMouseAtPoint(r.x+r.width/2,r.y+r.height/2,{type:'contextmenu',button:2},w);
 await waitFor(()=>root.state==='open','full native tab menu');await pause(180);
}
async function capture(name){
 await open();
 const rootBox=box(root),share=root.querySelector(':scope > menu.share-tab-url-item');
 const rows=[...root.children].filter(n=>['menu','menuitem'].includes(n.localName)&&!n.hidden&&n.getAttribute('data-cme-icons')==='on'&&n.querySelector(':scope > .cme-decoration'));
 const metrics=rows.map(row=>{
  const deco=row.querySelector(':scope > .cme-decoration'),image=deco.querySelector('img');
  const label=[...row.children].find(n=>n.matches('label.menu-text,label.menu-iconic-text'));
  const arrow=[...row.children].find(n=>n.matches('.menu-right,.menu-accel'));
  const icon=image?box(image):box(deco),rowBox=box(row),labelBox=label?box(label):null;
  return {id:row.id||row.getAttribute('data-l10n-id')||row.getAttribute('label'),status:['checkbox','radio'].includes(row.getAttribute('type'))||row.hasAttribute('checked'),row:rowBox,icon,label:labelBox,arrow:arrow?box(arrow):null,leftSpace:icon.left-rootBox.left,
   gap:labelBox?labelBox.left-icon.right:null,decoded:!image||image.complete&&image.naturalWidth>0,source:image?.getAttribute('src')};
 });
 const shareImage=share?.querySelector(':scope > .cme-decoration img');
 if(shareImage&&!shareImage.complete)await pause(200);
 checks[name+'_fullMenu']=metrics.length>=8;
 // 5px native popup inset + 8px row inset + 2px centring allowance, with
 // a small rounding tolerance at fractional display scales.
 checks[name+'_noWideLeftGutter']=metrics.every(row=>row.leftSpace>=0&&row.leftSpace<=18);
 checks[name+'_labelsClearIcons']=metrics.every(row=>row.gap===null||row.gap>=7&&(row.status||row.gap<=12));
 checks[name+'_iconsDecoded']=metrics.every(row=>row.decoded);
 checks[name+'_shareIconVisible']=Boolean(shareImage?.complete&&shareImage.naturalWidth>0&&box(shareImage).width>=15&&w.getComputedStyle(shareImage).visibility==='visible');
 const popups=[];
 for(const menu of [share,w.document.getElementById('context_zenMoveToFolder'),w.document.getElementById('better-zen-folders-move-space')].filter(n=>n&&!n.hidden&&!n.disabled)){
  const popup=menu.querySelector('menupopup');if(!popup)continue;
  menu.open=true;await pause(280);
  const p=popup.getOuterScreenRect(),r=menu.getBoundingClientRect(),left=menu.screenX,top=menu.screenY;
  const adjacent=(Math.abs(p.x-left-r.width)<12||Math.abs(p.x+p.width-left)<12)&&p.y<=top+r.height+12&&p.y+p.height>=top-12;
  popups.push({label:menu.getAttribute('label'),state:popup.state,adjacent,row:{left,top,width:r.width,height:r.height},popup:{left:p.x,top:p.y,width:p.width,height:p.height}});
  menu.open=false;await pause(80);
 }
 checks[name+'_submenusStayAdjacent']=popups.length>=1&&popups.every(p=>p.state==='open'&&p.adjacent);
 details.cases.push({name,dpr:w.devicePixelRatio,root:rootBox,rows:metrics,popups});
 await close();
}
try{
 details.environment={version:Services.appinfo.version,buildID:Services.appinfo.appBuildID,dpr:w.devicePixelRatio};
 const state=model.createState();save(state);await pause(100);
 await capture('normal');
 w.gZenPinnedTabManager.addToEssentials(w.gBrowser.selectedTab);await pause(250);
 await capture('essential');
 const utils=ChromeUtils.importESModule('chrome://userscripts/content/core/utils.sys.mjs').default,manager=w.SineAPI.manager;
 await manager.toggleTheme(await utils.getMods(),'context-menu-editor');await waitFor(()=>!w.__contextMenuEditor,'Sine unload');
 await manager.toggleTheme(await utils.getMods(),'context-menu-editor');editor=await waitFor(()=>w.__contextMenuEditor?.controller&&w.__contextMenuEditor,'Sine reload');
 await capture('essential-after-reload');
 const changed=model.parseState(editor.store.read().raw);changed.options.iconPack='zen';save(changed);await pause(100);
 await capture('zen-pack');
 return {checks,details};
}catch(error){checks.completed=false;details.error=String(error);details.stack=error.stack;return {checks,details};}
finally{await close();resource.setSubstitution('cme-layout',null);}
