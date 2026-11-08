const {browser:w,Services,pause,waitFor,rect,nativeEvent,sourceURI}=ctx;
if(Cc['@mozilla.org/gfx/info;1'].getService(Ci.nsIGfxInfo).isHeadless!==true||Services.env.get('MOZ_HEADLESS')!=='1')throw new Error('This probe requires the isolated headless clipboard; no clipboard API called.');
const owner=await waitFor(()=>w.__contextMenuEditor?.controller&&w.__contextMenuEditor,'Sine editor');
const PlacesUtils=ChromeUtils.importESModule('resource://gre/modules/PlacesUtils.sys.mjs').PlacesUtils;
const root=w.document.getElementById('placesContext');
const resource=Services.io.getProtocolHandler('resource').QueryInterface(Ci.nsIResProtocolHandler);
resource.setSubstitution('cme-native-places',Services.io.newURI(sourceURI));
const model=ChromeUtils.importESModule('resource://cme-native-places/src/model.mjs');
const json=Cu.getGlobalForObject(model.createState).JSON,patch=value=>json.parse(JSON.stringify(value));
const save=state=>owner.store.save(w.JSON.parse(model.serializeState(state)),owner.store.read().raw);
const read=()=>model.parseState(owner.store.read().raw),originalRaw=owner.store.read().raw;
const inventory=()=>owner.controller.getInventory().find(menu=>menu.id===root.id).items;
const checks={},details={baseline:[],edited:[],commands:[],errors:[]},fixtures=[];
const toolbar=w.document.getElementById('PersonalToolbar');
const ids=['placesContext_open:newtab','placesContext_copy','placesContext_deleteBookmark','placesContext_openBookmarkContainer:tabs','placesContext_deleteFolder','placesContext_sortBy:name'];
const nodes=new Map(ids.map(id=>[id,w.document.getElementById(id)]));
const baseURL=w.gBrowser.selectedBrowser.currentURI.spec;
if(!/^http:\/\/127\.0\.0\.1:\d+\/sample-page\.html$/.test(baseURL))throw new Error('Disposable HTTP fixture required');
const errorListener=event=>details.errors.push({message:event.message,file:event.filename,line:event.lineno});
w.addEventListener('error',errorListener);
const insert=async data=>{const item=await PlacesUtils.bookmarks.insert(data);fixtures.push(item.guid);return item;};
function snapshot(kind){return{kind,trigger:root.triggerNode?._placesNode?.bookmarkGuid,selected:root._view?.selectedNode?.bookmarkGuid,
 rows:Object.fromEntries([...nodes].map(([id,node])=>[id,{hidden:Boolean(node?.hidden),disabled:Boolean(node?.disabled),label:node?.getAttribute('label'),command:node?.getAttribute('command')}]))};}
async function close(){root.hidePopup();await waitFor(()=>root.state==='closed','Places popup closed',5000);await pause(60);}
async function open(guid,kind){
 if(root.state!=='closed')await close();
 const node=await waitFor(()=>[...w.document.getElementById('PlacesToolbarItems').children].find(node=>node._placesNode?.bookmarkGuid===guid),'native bookmark toolbar node '+kind,8000);
 const box=node.getBoundingClientRect();if(box.width<=0||box.height<=0)throw new Error('Native bookmark toolbar node is not visible: '+kind);
 const x=box.x+Math.min(box.width/2,20),y=box.y+box.height/2,hit=w.document.elementFromPoint(x,y);
 details.lastOpen={kind,guid,bounds:rect(node),toolbar:rect(toolbar),hit:hit?.id||hit?.localName,ancestors:[]};
 for(let parent=node;parent;parent=parent.parentElement)details.lastOpen.ancestors.push({id:parent.id,tag:parent.localName,context:parent.getAttribute('context'),view:Boolean(parent._placesView)});
 await nativeEvent.synthesizeMouseAtPoint(x,y,{type:'contextmenu',button:2},w);
 try{await waitFor(()=>root.state==='open','trusted native bookmark '+kind+' context menu',6000);}catch(error){details.lastOpen.openPopups=[...w.document.querySelectorAll('menupopup')].filter(popup=>popup.state==='open').map(popup=>({id:popup.id,trigger:popup.triggerNode?.id||popup.triggerNode?.localName}));throw error;}
 await pause(150);
 return snapshot(kind);
}
async function invoke(id,input='command'){
 const node=nodes.get(id),menu=node.parentElement.parentElement;if(node.hidden||node.disabled)throw new Error('Places command unavailable: '+id);
 if(menu.matches?.('menu[data-cme-owned]')){menu.open=true;await waitFor(()=>node.parentElement.state==='open','Places command custom submenu',5000);}
 checks['originalInPlacesCustomSubmenu:'+id]=menu.matches?.('menu[data-cme-owned]')&&menu.getAttribute('label')==='Native bookmark actions';
 checks['placesCustomPopupRetainsTrigger:'+id]=node.parentElement.triggerNode===root.triggerNode;
 let trusted=false;const routes=[],command=w.document.getElementById(node.getAttribute('command'));
 const handler=event=>{trusted ||=event.isTrusted;routes.push(event.target.id);};node.addEventListener('command',handler);command?.addEventListener('command',handler);
 const parent=node.parentElement;
 if(input==='mouse'){const box=node.getBoundingClientRect();await nativeEvent.synthesizeMouseAtPoint(box.x+box.width/2,box.y+box.height/2,{button:0},w);await waitFor(()=>trusted,'trusted native Places click '+id,5000);}else node.doCommand();
 node.removeEventListener('command',handler);command?.removeEventListener('command',handler);
 details.commands.push({id,input,trusted,routes,originalIdentity:w.document.getElementById(id)===node,parentTag:parent.localName,parentTrigger:parent.triggerNode?._placesNode?.bookmarkGuid||null,rootTrigger:root.triggerNode?._placesNode?.bookmarkGuid||null});
 checks['originalTrustedCommand:'+id]=trusted&&w.document.getElementById(id)===node;
 await pause(150);
}
function clipboardText(){const transfer=Cc['@mozilla.org/widget/transferable;1'].createInstance(Ci.nsITransferable);transfer.init(null);transfer.addDataFlavor('text/plain');Services.clipboard.getData(transfer,Ci.nsIClipboard.kGlobalClipboard);const data={};transfer.getTransferData('text/plain',data);return data.value.QueryInterface(Ci.nsISupportsString).data;}
try{
 const bookmark=await insert({parentGuid:PlacesUtils.bookmarks.toolbarGuid,index:0,title:'CME disposable link',url:baseURL+'#opened=bookmark'});
 const folder=await insert({parentGuid:PlacesUtils.bookmarks.toolbarGuid,index:1,title:'CME disposable folder',type:PlacesUtils.bookmarks.TYPE_FOLDER});
 const first=await insert({parentGuid:folder.guid,title:'CME disposable child 1',url:baseURL+'#opened=folder-1'});
 const second=await insert({parentGuid:folder.guid,title:'CME disposable child 2',url:baseURL+'#opened=folder-2'});
 const separator=await insert({parentGuid:PlacesUtils.bookmarks.toolbarGuid,index:2,type:PlacesUtils.bookmarks.TYPE_SEPARATOR});
 // Zen's native single-toolbar preference otherwise clips the newly enabled
 // bookmarks toolbar until hover. This fresh-profile preference makes native
 // toolbar hit testing deterministic; it does not replace any Places behavior.
 Services.prefs.setBoolPref('zen.view.hide-window-controls',false);
 w.setToolbarVisibility(toolbar,true);await w.PlacesToolbarHelper.init();
 await waitFor(()=>w.document.getElementById('PlacesToolbar')._placesView,'native bookmarks toolbar view');
 await w.document.getElementById('PlacesToolbar')._placesView.promiseRebuilt();
 await pause(250);
 let state=read();state.options.enabled=false;save(state);await pause(100);
 for(const [kind,item]of [['bookmark',bookmark],['folder',folder],['separator',separator]]){const baseline=await open(item.guid,kind);details.baseline.push(baseline);checks['nativePlacesSelection:'+kind]=baseline.selected===item.guid&&baseline.trigger===item.guid;await close();}
 state=model.mergeInventory(read(),root.id,inventory());state.options.enabled=true;
 state=model.addSubmenu(state,root.id,'Native bookmark actions',null,0,'cme-bookmark-actions');
 for(const [id,node]of nodes){
  const descriptor=inventory().find(row=>row.key===id);if(!node||!descriptor)continue;
  state=model.updateItem(state,root.id,id,patch({name:'Edited '+id,icon:{kind:'text',text:'★'}}));
  if(!descriptor.locked&&descriptor.boundary===null)state=model.moveItem(state,root.id,id,'cme-bookmark-actions',state.roots[root.id].records['cme-bookmark-actions'].children.length,inventory());
 }
 save(state);await pause(100);
 for(const [kind,item]of [['bookmark',bookmark],['folder',folder],['separator',separator]]){
  const edited=await open(item.guid,kind),baseline=details.baseline.find(row=>row.kind===kind);details.edited.push(edited);
  checks['placesVisibilityPreserved:'+kind]=ids.every(id=>edited.rows[id].hidden===baseline.rows[id].hidden);
  checks['placesDisabledPreserved:'+kind]=ids.every(id=>edited.rows[id].disabled===baseline.rows[id].disabled);
  checks['placesOriginalIdentity:'+kind]=[...nodes].every(([id,node])=>w.document.getElementById(id)===node);
  checks['placesCustomizations:'+kind]=[...nodes].filter(([id])=>!edited.rows[id].hidden).every(([id,node])=>node.getAttribute('label')==='Edited '+id&&node.querySelector('.cme-decoration')?.textContent==='★');
  await close();checks['placesCloseRestores:'+kind]=[...nodes].every(([,node])=>node.parentElement===root)&&!root.querySelector('[data-cme-owned],.cme-decoration');
 }
 save(model.updateItem(read(),root.id,'placesContext_open:newtab',patch({hidden:true})));
 await open(bookmark.guid,'bookmark');checks.placesHiddenSuppressesCommand=nodes.get('placesContext_open:newtab').hidden;await close();
 save(model.updateItem(read(),root.id,'placesContext_open:newtab',patch({hidden:false})));
 await open(folder.guid,'folder');checks.placesUnhideKeepsFolderIneligible=nodes.get('placesContext_open:newtab').hidden;await close();
 // These invoke native commandset/controller handling on the exact original
 // menuitems while the real Places view still owns the selected bookmark.
 const tabsBefore=new Set(w.gBrowser.tabs);await open(bookmark.guid,'bookmark');await invoke('placesContext_open:newtab','mouse');
 const opened=await waitFor(()=>[...w.gBrowser.tabs].find(tab=>!tabsBefore.has(tab)&&tab.linkedBrowser.currentURI.spec===bookmark.url.href),'native bookmarked URL opened in tab',8000);
 checks.nativeBookmarkOpenInTab=Boolean(opened);await close();w.gBrowser.removeTab(opened,{animate:false});
 await open(bookmark.guid,'bookmark');await invoke('placesContext_copy');checks.nativeBookmarkCopy=clipboardText().includes(bookmark.url.href);await close();
 // Root-delegated native commands are important: their original implementation
 // may inspect event.target.parentNode.triggerNode, unlike commandset routes.
 const folderTabsBefore=new Set(w.gBrowser.tabs);await open(folder.guid,'folder');await invoke('placesContext_openBookmarkContainer:tabs','mouse');
 await pause(700);const folderTabs=[...w.gBrowser.tabs].filter(tab=>!folderTabsBefore.has(tab));
 details.folderCommandTabs=folderTabs.map(tab=>tab.linkedBrowser.currentURI.spec);
 checks.nativeFolderOpenAllTabs=[first.url.href,second.url.href].every(url=>folderTabs.some(tab=>tab.linkedBrowser.currentURI.spec===url));
 await close();for(const tab of folderTabs)w.gBrowser.removeTab(tab,{animate:false});
 await open(bookmark.guid,'bookmark');await invoke('placesContext_deleteBookmark');await close();await pause(150);
 checks.nativeBookmarkDelete=(await PlacesUtils.bookmarks.fetch(bookmark.guid))===null;
 return{checks,details,syntheticGuids:{bookmark:bookmark.guid,folder:folder.guid,separator:separator.guid},
  inputEvidence:'Fresh-profile-only PlacesUtils bookmarks, actual PlacesToolbar and PlacesController selection, trusted native contextmenu input, original renamed/moved XUL nodes, native mouse activation for new-tab/open-all, original XUL doCommand for copy/delete, real browser and bookmark-store effects. No everyday bookmarks read.'};
}catch(error){checks.nativePlacesProbeCompleted=false;details.failure={message:String(error),stack:error.stack};return{checks,details};
}finally{
 root.hidePopup();owner.store.save(w.JSON.parse(model.serializeState(model.parseState(originalRaw))),owner.store.read().raw);
 for(const guid of fixtures.reverse()){try{if(await PlacesUtils.bookmarks.fetch(guid))await PlacesUtils.bookmarks.remove(guid);}catch{}}
 w.removeEventListener('error',errorListener);resource.setSubstitution('cme-native-places',null);
}
