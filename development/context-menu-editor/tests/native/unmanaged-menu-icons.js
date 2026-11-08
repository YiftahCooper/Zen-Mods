const {browser:w,Services,waitFor,pause,nativeEvent,sourceURI,manager}=ctx;
let editor=await waitFor(()=>w.__contextMenuEditor?.controller&&w.__contextMenuEditor,'editor');
const doc=w.document,checks={},details={menus:{},how:{}};
const resource=Services.io.getProtocolHandler('resource').QueryInterface(Ci.nsIResProtocolHandler);resource.setSubstitution('cme-unmanaged',Services.io.newURI(sourceURI));
const model=ChromeUtils.importESModule('resource://cme-unmanaged/src/model.mjs');
const read=()=>model.parseState(editor.store.read().raw);
const save=state=>editor.store.save(w.JSON.parse(model.serializeState(state)),editor.store.read().raw);
const setOptions=patch=>{const state=read();for(const [key,value]of Object.entries(patch))state.options[key]=value;save(state);};
const utils=ChromeUtils.importESModule('chrome://userscripts/content/core/utils.sys.mjs').default;
const isCheck=node=>['checkbox','radio'].includes(node.getAttribute('type'));
// Every visible action row: does it show a real, loaded icon (native artwork or
// this editor's glyph)? Checks and radios are reported, never counted as icons.
function census(popup){
 return [...popup.children].filter(node=>['menu','menuitem'].includes(node.localName)&&node.getBoundingClientRect().height>0).map(node=>{
  const image=node.querySelector(':scope > .cme-decoration img'),box=image?.getBoundingClientRect();
  const slot=node.querySelector(':scope > .menu-icon'),style=slot&&w.getComputedStyle(slot),slotBox=slot?.getBoundingClientRect();
  const art=slot&&((slot.complete&&slot.naturalWidth>0)||/url\(/.test(style.content)||/url\(/.test(style.listStyleImage));
  const native=Boolean(art&&!isCheck(node)&&style.display!=='none'&&style.visibility==='visible'&&slotBox.width>0);
  const cme=Boolean(image&&image.complete&&image.naturalWidth>0&&box.width>0);
  const label=node.querySelector(':scope > .menu-text');
  return {row:node.id||node.getAttribute('anonid')||node.classList[0]||node.getAttribute('command')||node.getAttribute('data-action')||node.getAttribute('data-l10n-id'),
   check:isCheck(node),native,cme,icon:!isCheck(node)&&(native||cme),src:image?.getAttribute('src')||null,labelX:label?Math.round(label.getBoundingClientRect().x*10)/10:null};
 });
}
const summary=rows=>({visible:rows.length,withIcon:rows.filter(row=>row.icon).length,checks:rows.filter(row=>row.check).length});
async function closePopup(popup){if(popup.state!=='closed'){popup.hidePopup();await waitFor(()=>popup.state==='closed','close '+(popup.id||popup.className||'popup'));}await pause(60);}
const byKey=key=>key.startsWith('.')?doc.querySelector(`#mainPopupSet > menupopup${key}`):doc.getElementById(key);
const openStack=()=>[...doc.querySelectorAll('#mainPopupSet > menupopup:not([id]):not([class])')].find(popup=>popup.state==='open');
async function rightClick(target,key,label,timeout=20000){
 target.scrollIntoView?.({block:'center'});await pause(80);
 const b=target.getBoundingClientRect();if(!b.width||!b.height)throw new Error('No bounds for '+label);
 await nativeEvent.synthesizeMouseAtPoint(b.x+Math.min(20,b.width/2),b.y+b.height/2,{type:'contextmenu',button:2},w);
 const popup=await waitFor(()=>byKey(key)?.state==='open'&&byKey(key),label,timeout);
 await pause(250);return popup;
}
// The owner's own contextmenu handler, reached by a DOM event instead of a pointer.
async function ownerContextEvent(target,find,label){
 target.dispatchEvent(new w.MouseEvent('contextmenu',{bubbles:true,cancelable:true,button:2,screenX:w.mozInnerScreenX+120,screenY:w.mozInnerScreenY+120}));
 const popup=await waitFor(()=>find(),label,5000);await pause(250);return popup;
}
// Menus whose real trigger needs an extension, a tab group, a video or Zen's
// site panel: opened with openPopupAtScreen, the owner's population handler kept out
// (it would cancel without that context). Every markup row is then visible.
async function openByCode(id,setup){
 const popup=doc.getElementById(id);if(!popup)throw new Error('Menu absent: '+id);
 const keepOwnerOut=event=>{if(event.target===popup)event.stopPropagation();};
 popup.addEventListener('popupshowing',keepOwnerOut);
 try{setup?.(popup);popup.openPopupAtScreen(w.mozInnerScreenX+80,w.mozInnerScreenY+80,true);await waitFor(()=>popup.state==='open',id);await pause(250);}
 finally{popup.removeEventListener('popupshowing',keepOwnerOut);}
 return popup;
}
const textField=async()=>{
 const input=w.gURLBar.inputField;input.focus();w.gURLBar.value='https://example.com/?utm_source=cme';await pause(100);
 return rightClick(input,'textbox-contextmenu','address bar menu');
};
let downloadReady=null;
const ensureDownload=()=>{
 downloadReady??=(async()=>{
  const {Downloads}=ChromeUtils.importESModule('resource://gre/modules/Downloads.sys.mjs');
  const dir=PathUtils.join(PathUtils.profileDir,'cme-downloads');await IOUtils.makeDirectory(dir,{ignoreExisting:true});
  const sourceFile=PathUtils.join(dir,'source.txt');await IOUtils.writeUTF8(sourceFile,'disposable download for Context Menu Editor');
  const download=await Downloads.createDownload({source:PathUtils.toFileURI(sourceFile),target:PathUtils.join(dir,'copy.txt')});
  const list=await Downloads.getList(Downloads.ALL);await list.add(download);await download.start();
  return download;
 })();
 return downloadReady;
};
// Disposable fixtures for the Zen Library: a finished download (above), one
// history visit to a reserved example domain and one boost for it.
let libraryReady=null;
const ensureLibraryData=()=>{
 libraryReady??=(async()=>{
  await ensureDownload();
  const {PlacesUtils}=ChromeUtils.importESModule('resource://gre/modules/PlacesUtils.sys.mjs');
  await PlacesUtils.history.insert({url:'https://example.com/cme-history',title:'CME history fixture',visits:[{date:new Date()}]});
  const {gZenBoostsManager}=ChromeUtils.importESModule('resource:///modules/zen/boosts/ZenBoostsManager.sys.mjs');
  // The Library lists a boost once it holds a change (an empty new boost is a draft).
  const boost=gZenBoostsManager.createNewBoost('example.com');
  Object.assign(boost.boostEntry.boostData,{changeWasMade:true,boostName:'CME fixture'});
  gZenBoostsManager.saveBoostToStore(boost);
 })();
 return libraryReady;
};
const Library=()=>w.customElements.get('zen-library');
const how={};
// Opens the Zen Library on a section, then right-clicks its first row: a real
// pointer event when the row has geometry, else the row's own contextmenu handler.
async function libraryMenu(section,key){
 await ensureLibraryData();
 const lib=Library().getInstance();
 if(lib.activeTab!==section)lib.activeTab=section;
 await Promise.race([Library().animateProgress(1),pause(3000)]);
 const row=await waitFor(()=>doc.querySelector(`zen-library-${section}-section .zen-library-row`),section+' row',6000);await pause(300);
 try{const popup=await rightClick(row,key,section+' menu',3000);how[key]='real right-click on a Library row';return popup;}
 catch(error){
  const b=row.getBoundingClientRect(),hit=doc.elementFromPoint(b.x+Math.min(20,b.width/2),b.y+b.height/2);
  how[key]='Library row contextmenu handler (DOM event): '+String(error).slice(0,60)+'; row '+[b.x,b.y,b.width,b.height].map(Math.round)+' hit '+(hit?hit.localName+'#'+hit.id+'.'+hit.className:'none')+' open '+Library().getInstance().openProgress;
 }
 return ownerContextEvent(row,()=>byKey(key)?.state==='open'&&byKey(key),section+' menu by handler');
}
// Zen 1.24 replaces the downloads button with the Library button by default.
// This disposable profile adds it to the sidebar foot (its Zen area) so the
// Firefox downloads panel can open and be right-clicked for real.
async function downloadsMenu(){
 await ensureDownload();
 if(!doc.getElementById('downloads-button')?.closest('toolbar'))w.CustomizableUI.addWidgetToArea('downloads-button','zen-sidebar-foot-buttons');
 w.DownloadsPanel.showPanel();
 const item=await waitFor(()=>w.DownloadsPanel.isPanelShowing&&doc.querySelector('#downloadsListBox richlistitem'),'download in panel',8000);await pause(250);
 return rightClick(item,'downloadsContextMenu','downloads item menu',5000);
}
async function stackMenu(){
 await ensureDownload();
 const entry=await waitFor(()=>[...doc.querySelectorAll('#zen-library-download-list > .zen-library-download-list-download')].find(node=>node.download),'stack entry',6000);
 how['zen-library-download-stack']='download stack entry contextmenu handler (DOM event)';
 return ownerContextEvent(entry,openStack,'download stack menu');
}
const MENUS=[
 ['textbox-contextmenu','address bar (real right-click)',textField],
 ['.zen-library-downloads-menu','Library downloads',()=>libraryMenu('downloads','.zen-library-downloads-menu')],
 ['.zen-library-history-menu','Library history',()=>libraryMenu('history','.zen-library-history-menu')],
 ['.zen-library-boosts-menu','Library boosts',()=>libraryMenu('boosts','.zen-library-boosts-menu')],
 ['zen-library-download-stack','library button download stack',stackMenu],
 // Zen 1.24's Library button replaces the downloads button, so this panel has no anchor by default.
 ['downloadsContextMenu','downloads panel item (real right-click; downloads button added to the sidebar foot)',downloadsMenu],
 ['unified-extensions-context-menu','by code',()=>openByCode('unified-extensions-context-menu')],
 ['pageActionContextMenu','by code',()=>openByCode('pageActionContextMenu')],
 ['zenSiteDataActions','by code',()=>openByCode('zenSiteDataActions')],
 ['open-tab-group-context-menu','by code',()=>openByCode('open-tab-group-context-menu')],
 ['saved-tab-group-context-menu','by code',()=>openByCode('saved-tab-group-context-menu')],
 ['pictureInPictureToggleContextMenu','by code (move-left label set as PictureInPicture does)',()=>openByCode('pictureInPictureToggleContextMenu',
  ()=>doc.l10n.setAttributes(doc.getElementById('context_MovePictureInPictureToggle'),'picture-in-picture-move-toggle-left'))],
];
async function survey(phase){
 const out={};
 for(const [id,label,open]of MENUS){
  details.how[id]=label;
  let popup;
  try{
   popup=await open();
   const rows=census(popup);
   out[id]={...summary(rows),decorated:popup.getAttribute('data-cme-decorated'),managed:popup.getAttribute('data-cme-root'),rows};
  }catch(error){out[id]={error:String(error)};}
  finally{
   if(popup){await closePopup(popup);out[id].leftovers=popup.querySelectorAll('.cme-decoration,[data-cme-item]').length+(popup.hasAttribute('data-cme-decorated')?1:0);}
   if(id.startsWith('.zen-library')){await Promise.race([Library().animateProgress(0),pause(2000)]);await pause(150);}
   if(how[id])details.how[id]=how[id];
   if(id==='downloadsContextMenu'&&w.DownloadsPanel?.isPanelShowing){w.DownloadsPanel.hidePanel();await pause(200);}
  }
 }
 details.menus[phase]=out;
 return out;
}
try{
 // Phase 1: the editor is loaded with its default options (Fluent pack).
 const after=await survey('after');
 for(const [id]of MENUS){
  const menu=after[id];
  checks[id+'_opened']=!menu.error&&menu.visible>0;
  // Every visible non-check row shows a real loaded icon, except the rows deliberately left bare.
  checks[id+'_nonCheckRowsHaveIcons']=!menu.error&&menu.rows.filter(row=>!row.check).every(row=>row.icon);
  checks[id+'_notManaged']=!menu.error&&menu.managed===null&&menu.decorated===id;
  checks[id+'_restoredOnClose']=menu.leftovers===0;
  // Labels stay in one column: decorated rows and bare (check) rows alike.
  const xs=(menu.rows||[]).map(row=>row.labelX).filter(x=>x!==null);
  checks[id+'_labelsAligned']=xs.length>0&&Math.max(...xs)-Math.min(...xs)<=1.5;
 }
 checks.textFieldCheckRowsBare=after['textbox-contextmenu'].rows?.filter(row=>row.check).every(row=>!row.cme)??false;
 checks.downloadCheckRowsBare=after.downloadsContextMenu.rows?.filter(row=>row.check).every(row=>!row.cme)??false;
 // Phase 2: the Zen pack resolves the browser's own artwork.
 setOptions({iconPack:'zen'});await pause(150);
 let popup=await textField();let rows=census(popup);
 details.zenPack={textField:rows};
 checks.zenPackTextField=rows.filter(row=>!row.check).every(row=>row.cme&&row.src?.startsWith('chrome://browser/skin/zen-icons/'));
 await closePopup(popup);
 // Phase 3: the icon switch turns these menus plain as well.
 setOptions({showIcons:false});await pause(150);
 popup=await textField();rows=census(popup);
 details.iconsOff={textField:summary(rows),decorated:popup.getAttribute('data-cme-decorated')};
 checks.iconsOffLeavesTextFieldPlain=rows.every(row=>!row.cme)&&!popup.hasAttribute('data-cme-decorated');
 await closePopup(popup);
 setOptions({showIcons:true,iconPack:'fluent'});await pause(150);
 // Phase 4: unloading the editor while a decorated menu is open removes every write.
 popup=await textField();
 checks.decoratedBeforeUnload=census(popup).some(row=>row.cme);
 await manager.toggleTheme(await utils.getMods(),'context-menu-editor');await waitFor(()=>!w.__contextMenuEditor,'Sine unload');
 checks.unloadWhileOpenRestores=popup.querySelectorAll('.cme-decoration,[data-cme-item]').length===0&&!popup.hasAttribute('data-cme-decorated');
 await closePopup(popup);
 // Phase 5: the browser alone ("before").
 const before=await survey('before');
 for(const [id]of MENUS){
  checks[id+'_beforeOpened']=!before[id].error;
  checks[id+'_beforeHasNoEditorIcons']=!before[id].error&&before[id].rows.every(row=>!row.cme);
 }
 details.counts=Object.fromEntries(MENUS.map(([id])=>[id,{before:before[id].error?null:before[id].withIcon,after:after[id].error?null:after[id].withIcon,
  visible:after[id].visible,checks:after[id].checks}]));
 // Phase 6: reloading brings the glyphs back.
 await manager.toggleTheme(await utils.getMods(),'context-menu-editor');editor=await waitFor(()=>w.__contextMenuEditor?.controller&&w.__contextMenuEditor,'Sine reload');
 popup=await textField();checks.reloadDecoratesAgain=census(popup).filter(row=>!row.check).every(row=>row.cme);await closePopup(popup);
 return {checks,details,inputEvidence:'The address bar menu opens from a synthesized native right-click (Gecko test event helper). Zen Library menus open on a real finished download, history visit and boost in this disposable profile, by native right-click where the row has geometry, else through the row own contextmenu handler (details.how). The download stack menu opens through its entry contextmenu handler. The Firefox downloads panel menu opens from a native right-click once this profile adds the downloads button to the sidebar foot. The other menus need an extension, a tab group, a video or the Zen site panel to open for real; they are opened by code with their owner population handler kept out. No menu command is run.'};
}catch(error){checks.completed=false;details.error=String(error);details.stack=error.stack;return {checks,details};}
finally{resource.setSubstitution('cme-unmanaged',null);}
