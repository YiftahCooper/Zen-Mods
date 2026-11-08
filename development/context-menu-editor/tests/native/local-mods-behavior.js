const {browser:w,Services,waitFor,pause,sourceURI,nativeEvent}=ctx;
const editor=await waitFor(()=>w.__contextMenuEditor?.controller&&w.__contextMenuEditor,'editor');
await waitFor(()=>w.__betterPinsController?.active,'real Better Pins runtime');
await waitFor(()=>w.__betterZenFoldersController,'real Better Zen Folders runtime');
await waitFor(()=>w.__zenSiteAppearanceToggle,'real SAT runtime');
await waitFor(()=>w.__defineWord,'real Define Word runtime');
await waitFor(()=>w.__searchEngineSelect,'real SES runtime');
const checks={},details={};
checks.localRuntimeControllersAlive=Boolean(w.__betterPinsController.active&&w.__betterZenFoldersController&&w.__zenSiteAppearanceToggle&&w.__defineWord&&w.__searchEngineSelect);
checks.zenIconsRuntimeActive=Boolean(await waitFor(()=>w.document.querySelector('[zen-icons-enhanced="true"]'),'real Zen Icons runtime'));
checks.newTabRuntimeActive=Boolean(w.__evenBetterNewTabSlotSizing);
checks.glanceRuntimeActive=Boolean(w.document.getElementById('zen-glance-sidebar-template')?.content.querySelector('.glance-position-copy-url'));
const resource=Services.io.getProtocolHandler('resource').QueryInterface(Ci.nsIResProtocolHandler);resource.setSubstitution('cme-native-probe',Services.io.newURI(sourceURI));
const model=ChromeUtils.importESModule('resource://cme-native-probe/src/model.mjs'),json=Cu.getGlobalForObject(model.createState).JSON,patch=value=>json.parse(JSON.stringify(value));
const save=state=>editor.store.save(w.JSON.parse(model.serializeState(state)),editor.store.read().raw),read=()=>model.parseState(editor.store.read().raw);
const tab=w.gBrowser.selectedTab,tabMenu=w.document.getElementById('tabContextMenu');
async function openTab(){const bounds=tab.getBoundingClientRect();await nativeEvent.synthesizeMouseAtPoint(bounds.x+bounds.width/2,bounds.y+bounds.height/2,{type:'contextmenu',button:2},w);await waitFor(()=>tabMenu.state==='open','native tab menu');await pause(150);}
const inventory=id=>editor.controller.getInventory().find(root=>root.id===id)?.items||[];
const findNode=(root,label)=>[...root.querySelectorAll('menuitem,menu')].find(node=>node.getAttribute('label')===label);
try{
 await openTab();
 await waitFor(()=>inventory(tabMenu.id).some(item=>item.source?.name==='Better Pins'),'Better Pins anonymous commands');
 const all=inventory(tabMenu.id),foreign=all.filter(item=>item.source?.kind==='mod'&&['Better Pins','Better Zen Folders'].includes(item.source.name));
 details.tabInventory=foreign;checks.betterPinsAnonymousCommands=foreign.some(item=>item.source.name==='Better Pins'&&item.identity==='mod-label'&&item.kind==='command');
 checks.betterPinsAnonymousSubmenu=foreign.some(item=>item.source.name==='Better Pins'&&item.identity==='mod-label'&&item.kind==='native-menu');
 checks.betterZenFoldersCommands=foreign.some(item=>item.source.name==='Better Zen Folders');
 const original=new Map(foreign.map(item=>[item.key,item.nativeId?w.document.getElementById(item.nativeId):[...tabMenu.querySelectorAll('.better-pins-menu')].find(node=>node.getAttribute('label')===item.label)]));
 let state=model.mergeInventory(read(),tabMenu.id,all);const names=new Map();let index=0;
 for(const item of foreign){const name=`Edited ${++index}: ${item.label}`;names.set(item.key,name);state=model.updateItem(state,tabMenu.id,item.key,patch({name,icon:{kind:'text',text:'★'}}));}
 save(state);await pause(100);
 checks.allDiscoveredForeignNamesAndIcons=foreign.length>5&&foreign.every(item=>{const node=findNode(tabMenu,names.get(item.key));return node===original.get(item.key)&&node.querySelector('.cme-decoration')?.textContent==='★';});
 details.afterEdits=foreign.map(item=>{const node=findNode(tabMenu,names.get(item.key));return{key:item.key,label:item.label,sameNode:node===original.get(item.key),found:!!node,icon:node?.querySelector('.cme-decoration')?.textContent,hidden:node?.hidden,type:node?.getAttribute('type')};});
 const zones=foreign.find(item=>item.source.name==='Better Pins'&&item.kind==='native-menu'),child=foreign.find(item=>item.parentKey===zones.key);
 state=model.addSubmenu(read(),tabMenu.id,'My zone tools',zones.key,0,'cme-zone-tools');state=model.moveItem(state,tabMenu.id,child.key,'cme-zone-tools',0,all);save(state);await pause(100);
 checks.foreignSubmenuChildNested=findNode(tabMenu,names.get(child.key))?.parentElement?.parentElement?.getAttribute('label')==='My zone tools';
 const movable=foreign.find(item=>item.source.name==='Better Pins'&&item.parentKey===null&&item.kind==='command'&&!item.locked);
 state=model.moveItem(read(),tabMenu.id,movable.key,null,0,all);state=model.updateItem(state,tabMenu.id,movable.key,patch({hidden:true}));save(state);await pause(50);
 checks.foreignCommandCanMoveAndHide=findNode(tabMenu,names.get(movable.key))?.hidden===true&&read().roots[tabMenu.id].children[0]===movable.key;
 state=model.updateItem(read(),tabMenu.id,movable.key,patch({hidden:false}));save(state);await pause(50);
 checks.reenableRetainsPosition=read().roots[tabMenu.id].children[0]===movable.key&&!findNode(tabMenu,names.get(movable.key)).hidden;
 tabMenu.hidePopup();await pause(100);await openTab();
 checks.recreatedAnonymousRowsRetainEdits=foreign.filter(item=>item.source.name==='Better Pins').every(item=>findNode(tabMenu,names.get(item.key))?.querySelector('.cme-decoration')?.textContent==='★');
 // Better Pins reads this real setting when recreating its native rows.
 Services.prefs.setBoolPref('better-pins.menu-icons',false);tabMenu.hidePopup();await pause(100);await openTab();
 const bp=foreign.filter(item=>item.source.name==='Better Pins');
 checks.ownerIconSettingWins=bp.every(item=>{const record=read().roots[tabMenu.id].records[item.key];return record.icon===undefined&&record.showIcon===false&&!findNode(tabMenu,names.get(item.key))?.querySelector(':scope > .cme-decoration');});
 details.afterOwnerIcons=bp.map(item=>({key:item.key,record:read().roots[tabMenu.id].records[item.key],ownerImage:findNode(tabMenu,names.get(item.key))?.getAttribute('image'),decoration:findNode(tabMenu,names.get(item.key))?.querySelector('.cme-decoration')?.textContent}));
 checks.ownerIconChangeKeepsNamesAndOrder=bp.every(item=>read().roots[tabMenu.id].records[item.key].name===names.get(item.key))&&read().roots[tabMenu.id].children[0]===movable.key;
 const reclaim=bp.find(item=>item.kind==='command');state=model.updateItem(read(),tabMenu.id,reclaim.key,patch({icon:{kind:'text',text:'✦'},showIcon:true}));save(state);await pause(100);
 checks.editorCanTakeIconBack=findNode(tabMenu,names.get(reclaim.key))?.querySelector('.cme-decoration')?.textContent==='✦';
 const create=bp.find(item=>item.label==='New Tab in Lower Zone'),beforeTabs=w.gBrowser.tabs.length;
 findNode(tabMenu,names.get(create.key)).doCommand();await waitFor(()=>w.gBrowser.tabs.length>beforeTabs,'real Better Pins command creates a tab');checks.originalBetterPinsCommandRuns=true;tabMenu.hidePopup();
 // SAT owns a standalone native right-click popup, rather than an injected row.
 w.gBrowser.selectedTab=tab;await pause(200);
 const button=await waitFor(()=>w.document.getElementById('zen-colorscheme-toggle'),'SAT toolbar button'),bounds=button.getBoundingClientRect();
 details.satButtonBounds={width:bounds.width,height:bounds.height};
 // A fresh Zen layout can put SAT's widget in its palette. Exercise its actual
 // context handler directly in that case; never replace the SAT menu itself.
 if(bounds.width&&bounds.height)await nativeEvent.synthesizeMouseAtPoint(bounds.x+bounds.width/2,bounds.y+bounds.height/2,{type:'contextmenu',button:2},w);
 else button.dispatchEvent(new w.MouseEvent('contextmenu',{bubbles:true,cancelable:true,button:2,screenX:350,screenY:250}));
 const sat=await waitFor(()=>w.document.getElementById('sat-appearance-menu')?.state==='open'&&w.document.getElementById('sat-appearance-menu'),'native SAT menu');
 await waitFor(()=>inventory(sat.id).length>=4,'standalone SAT menu discovery');const satItems=inventory(sat.id);
 checks.standaloneSatMenuIdentified=satItems.every(item=>item.source?.id==='zen-site-appearance-toggle');
 const light=satItems.find(item=>item.key==='sat-choice-light'),node=w.document.getElementById(light.key),radio=node.getAttribute('type');
 state=model.mergeInventory(read(),sat.id,satItems);state=model.updateItem(state,sat.id,light.key,patch({name:'My light mode',icon:{kind:'text',text:'☀'}}));save(state);await pause(100);
 checks.satRadioRetainsNativeStatus=node.getAttribute('type')===radio&&node.getAttribute('label')==='My light mode'&&node.querySelector('.cme-decoration')?.textContent==='☀';
 node.doCommand();await pause(150);details.satChoice={choice:w.__zenSiteAppearanceToggle.controller.choice(),error:w.__satError,busy:w.__zenSiteAppearanceToggle.busy,context:w.__zenSiteAppearanceToggle.controller.currentContext()};checks.originalSatCommandRuns=w.__zenSiteAppearanceToggle.controller.choice()==='light';sat.hidePopup();
 const folder=w.gZenFolders.createFolder([tab],{label:'Editor compatibility',id:'cme-compat-folder'});await w.__betterPinsController.origins.flush();folder.collapsed=false;await pause(200);
 const folderTarget=folder.labelElement||folder.querySelector('.tab-group-label')||folder,folderBounds=folderTarget.getBoundingClientRect();
 await nativeEvent.synthesizeMouseAtPoint(folderBounds.x+Math.min(30,folderBounds.width/2),folderBounds.y+folderBounds.height/2,{type:'contextmenu',button:2},w);
 const folderMenu=await waitFor(()=>w.document.getElementById('zenFolderActions')?.state==='open'&&w.document.getElementById('zenFolderActions'),'native folder menu');
 await waitFor(()=>inventory(folderMenu.id).some(item=>item.source?.name==='Better Pins'),'real folder-menu additions');
 const folderItems=inventory(folderMenu.id),folderForeign=folderItems.filter(item=>item.source?.kind==='mod');details.folderInventory=folderForeign;
 checks.folderCommandsAndSubmenusRecognized=folderForeign.some(item=>item.kind==='native-menu')&&folderForeign.some(item=>item.source.name==='Better Zen Folders');
 state=model.mergeInventory(read(),folderMenu.id,folderItems);const folderNames=new Map();index=0;
 for(const item of folderForeign){const name=`Folder edit ${++index}: ${item.label}`;folderNames.set(item.key,name);state=model.updateItem(state,folderMenu.id,item.key,patch({name,icon:{kind:'text',text:'✦'}}));}save(state);await pause(100);
 checks.folderForeignNamesAndIcons=folderForeign.length>3&&folderForeign.every(item=>findNode(folderMenu,folderNames.get(item.key))?.querySelector(':scope > .cme-decoration')?.textContent==='✦');
 const bzfNew=w.document.getElementById('better-zen-folders-new-tab-menu'),beforeFolderTabs=folder.tabs.length;
 if(bzfNew&&!bzfNew.hidden&&!bzfNew.disabled){
  bzfNew.doCommand();await waitFor(()=>w.gURLBar.hasAttribute('zen-newtab'),'BZF opens the native new-tab address bar');
  // BZF intentionally waits for a URL choice before creating/grouping the tab.
  // Complete that actual Zen interaction rather than substituting a fake TabOpen.
  await w.gURLBar.search(tab.linkedBrowser.currentURI.spec);await pause(200);
  nativeEvent.sendSingleKey({key:'Enter',code:'Enter',location:0,printable:false},w);
  await waitFor(()=>folder.tabs.length>beforeFolderTabs,'real BZF New Tab in Folder command');checks.originalBzfCommandRuns=true;
 }else checks.originalBzfCommandRuns=false;
 folderMenu.hidePopup();save(model.resetRoot(read(),folderMenu.id));
 w.gBrowser.selectedTab=w.gBrowser.addTab('about:preferences',{triggeringPrincipal:Services.scriptSecurityManager.getSystemPrincipal()});
 const p=await waitFor(()=>{const page=w.gBrowser.selectedBrowser.contentWindow;return page?.document.querySelector('[mod-id="context-menu-editor"] [data-cme-settings]')&&page;},'Sine source labels');p.document.getElementById('category-sine-mods').activate();
 const card=p.document.querySelector('[mod-id="context-menu-editor"]');card.querySelector('.sineItemConfigureButton').click();await pause(700);const settings=card.querySelector('[data-cme-settings]'),choice=settings.querySelector('[data-cme-menu]');choice.value=folderMenu.id;choice.dispatchEvent(new p.Event('change',{bubbles:true}));
 checks.sineListsForeignFolderSources=folderForeign.every(item=>[...settings.querySelectorAll('[data-cme-key]')].find(row=>row.dataset.cmeKey===item.key)?.querySelector('[data-cme-source]')?.textContent===item.source.name);
 settings.querySelector('[data-cme-toolbar="find"]').click();const find=settings.querySelector('[data-cme-find]');find.value='Better';find.dispatchEvent(new p.Event('input',{bubbles:true}));await pause(100);
 details.roots=editor.controller.getInventory().map(root=>({id:root.id,label:root.label,foreign:root.items.filter(item=>item.source?.kind==='mod').length}));
 return{checks,details,inputEvidence:'Unmodified local runtime files copied into a fresh profile, real Sine loading, native tab and SAT popups, original native command handlers. No everyday profile.'};
}catch(error){checks.completed=false;details.error=String(error);details.stack=error.stack;return{checks,details};}
finally{tabMenu.hidePopup();w.document.getElementById('sat-appearance-menu')?.hidePopup();resource.setSubstitution('cme-native-probe',null);}
