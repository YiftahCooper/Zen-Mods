// All legacy preferences below are synthetic and belong to the exact fresh
// profile guarded by the Python helper and its bootstrap. No other profile is read.
const {browser:w,Services,waitFor,pause,rect,nativeEvent,manager}=ctx;
const pref='extension.context-menu-editor.settings',rootId='tabContextMenu',root=w.document.getElementById(rootId);
const checks={},details={},raw=()=>Services.prefs.getStringPref(pref,''),state=()=>w.__contextMenuEditor.store.read().state;
const seed={
 'uc.hidecontext.reloadtab':true,'uc.hidecontext.duplicatetab':true,
 'uc.hidecontext.savelink':true,'uc.hidecontext.navigation':true,
 'uc.hidecontext.copylink':true,'uc.hidecontext.separators':true,
 'cmi-Switch-Icon-Package':2,'cmi-menuseparator-opacity':'0.6',
 'cmi-zenui-text-leftmargin':'12px','cmi-Grayscale-Extensions-Icons':true,
 'cmi-Hide-Inactive-Items-ContentAreaContextMenu':true,
 'cmi-Hide-Inactive-Items-TabContextMenu':true,
};
function setPrefs(values){for(const [key,value]of Object.entries(values)){if(typeof value==='boolean')Services.prefs.setBoolPref(key,value);else if(typeof value==='number')Services.prefs.setIntPref(key,value);else Services.prefs.setStringPref(key,value);}}
function legacySnapshot(){return Object.fromEntries(Object.entries(seed).map(([key,value])=>[key,typeof value==='boolean'?Services.prefs.getBoolPref(key):typeof value==='number'?Services.prefs.getIntPref(key):Services.prefs.getStringPref(key)]));}
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const original={reload:w.document.getElementById('context_reloadTab'),duplicate:w.document.getElementById('context_duplicateTab'),pin:w.document.getElementById('context_pinTab'),late:w.document.getElementById('context_reloadSelectedTabs')};
if(Object.values(original).some(node=>!node))throw new Error('Installed native tab commands required by legacy probe are missing');
const lateParent=original.late.parentElement,lateNext=original.late.nextSibling;
const utils=ChromeUtils.importESModule('chrome://userscripts/content/core/utils.sys.mjs').default;
async function disable(){await manager.toggleTheme(await utils.getMods(),'context-menu-editor');await waitFor(()=>!w.__contextMenuEditor,'actual Sine unload');}
async function enable(){await manager.toggleTheme(await utils.getMods(),'context-menu-editor');await waitFor(()=>w.__contextMenuEditor?.controller,'actual Sine reload');await pause(250);}
// Zen 1.24 starts a fresh profile on its hidden placeholder tab (zen-empty-tab,
// display:none), which has no bounds to right-click. Use a real tab instead.
async function visibleTab(){let tab=w.gBrowser.selectedTab;if(tab.hasAttribute('zen-empty-tab')||!(tab.getBoundingClientRect().width>0)){tab=w.gBrowser.addTab('about:blank#cme-native-tab',{triggeringPrincipal:Services.scriptSecurityManager.getSystemPrincipal()});w.gBrowser.selectedTab=tab;}await waitFor(()=>{const r=tab.getBoundingClientRect();return r.width>0&&r.height>0;},'visible native tab');return tab;}
async function openNative(){const bounds=rect(await visibleTab());await nativeEvent.synthesizeMouseAtPoint(bounds.x+bounds.width/2,bounds.y+bounds.height/2,{type:'contextmenu',button:2},w);await waitFor(()=>root.state==='open','native legacy tab menu');await pause(90);}
async function closeNative(){root.hidePopup();await pause(70);}
async function pageFixture(){
 const html='<meta charset="utf-8"><style>body{font:20px sans-serif;padding:40px}a,p{display:block;margin:35px;padding:20px}</style><a id="tracking" href="https://example.com/?utm_source=cme-legacy-probe&amp;keep=yes">Tracking link</a><a id="plain" href="https://example.com/?keep=yes">Ordinary link</a><p id="selection">Native selection stays available</p>';
 const tab=w.gBrowser.addTab('data:text/html;charset=utf-8,'+encodeURIComponent(html),{triggeringPrincipal:Services.scriptSecurityManager.getSystemPrincipal()});w.gBrowser.selectedTab=tab;
 const browser=tab.linkedBrowser;await waitFor(()=>browser.currentURI.spec.startsWith('data:'),'own data-page fixture');await pause(250);
 const popup=w.document.getElementById('contentAreaContextMenu'),copy=w.document.getElementById('context-copylink'),clean=w.document.getElementById('context-stripOnShareLink'),save=w.document.getElementById('context-savelink'),selection=w.document.getElementById('context-copy');
 if(!copy||!clean||!save||!selection)throw new Error('Installed original Page commands required by legacy probe are missing');
 const name='CME:LegacyFixture:'+Services.uuid.generateUUID().toString(),reply=name+':reply',mm=browser.messageManager,pending=new Map();let sequence=0,ownerMode=null,lastTrusted=false,lastOwner=null;
 const receive=message=>{const resolve=pending.get(message.data.id);if(resolve){pending.delete(message.data.id);resolve(message.data);}};mm.addMessageListener(reply,receive);
 mm.loadFrameScript('data:application/javascript,'+encodeURIComponent(`(function(){const name=${JSON.stringify(name)},reply=${JSON.stringify(reply)};addMessageListener(name,function(message){const {id,target}=message.data;try{const el=content.document.getElementById(target);if(!el)throw new Error('Fixture is not ready');content.getSelection().removeAllRanges();if(target==='selection'){const range=content.document.createRange();range.selectNodeContents(el);content.getSelection().addRange(range);}el.scrollIntoView({block:'center'});const b=el.getBoundingClientRect();sendAsyncMessage(reply,{id,ok:true,x:b.x+Math.min(20,b.width/2),y:b.y+b.height/2});}catch(error){sendAsyncMessage(reply,{id,ok:false,error:String(error)});}});})();`),false);
 const request=async target=>{const id=++sequence,promise=new Promise(resolve=>pending.set(id,resolve));mm.sendAsyncMessage(name,{id,target});return Promise.race([promise,pause(3000).then(()=>({ok:false,error:'Own data-page frame query timed out'}))]);};
 const owner=event=>{if(event.target!==popup)return;lastTrusted=event.isTrusted;if(ownerMode){copy.hidden=false;copy.disabled=false;clean.hidden=ownerMode==='hidden';clean.disabled=ownerMode==='disabled';}lastOwner={copyAvailable:!copy.hidden&&!copy.disabled,cleanAvailable:!clean.hidden&&!clean.disabled,cleanHidden:clean.hidden,cleanDisabled:clean.disabled};};popup.addEventListener('popupshowing',owner);
 return{tab,popup,copy,clean,save,selection,
  async open(target,mode=null){w.gBrowser.selectedTab=tab;ownerMode=mode;lastTrusted=false;lastOwner=null;let point;for(let attempt=0;attempt<20;attempt++){point=await request(target);if(point.ok)break;await pause(100);}if(!point?.ok)throw new Error(point?.error||'Own data-page target unavailable');const bounds=rect(browser);await nativeEvent.synthesizeMouseAtPoint(bounds.x+point.x,bounds.y+point.y,{type:'contextmenu',button:2},w);await waitFor(()=>popup.state==='open','trusted native Page '+target+' menu');await pause(120);return{target,ownerMode:mode,trusted:lastTrusted,ownerBeforeOverlay:lastOwner,copyAvailable:!copy.hidden&&!copy.disabled,cleanAvailable:!clean.hidden&&!clean.disabled,copyHidden:copy.hidden,cleanHidden:clean.hidden,cleanDisabled:clean.disabled,sameOriginalNodes:w.document.getElementById(copy.id)===copy&&w.document.getElementById(clean.id)===clean};},
  async close(){popup.hidePopup();await pause(70);},
  cleanup(){popup.hidePopup();popup.removeEventListener('popupshowing',owner);mm.removeMessageListener(reply,receive);if(tab.isConnected)w.gBrowser.removeTab(tab,{animate:false});},
 };
}
async function settingsFor(){
 const tab=w.gBrowser.addTab('about:preferences',{triggeringPrincipal:Services.scriptSecurityManager.getSystemPrincipal()});w.gBrowser.selectedTab=tab;
 const page=await waitFor(()=>{const p=tab.linkedBrowser.contentWindow;return p?.document.querySelector('[mod-id="context-menu-editor"] [data-cme-settings]')&&p;},'real Sine legacy settings');
 page.document.getElementById('category-sine-mods').activate();const card=page.document.querySelector('[mod-id="context-menu-editor"]');card.querySelector('.sineItemConfigureButton').click();await waitFor(()=>card.querySelector('dialog')?.open,'Sine legacy Configure dialog');
 const ui={page,tab,get element(){return card.querySelector('[data-cme-settings]');}};
 ui.row=key=>[...ui.element.querySelectorAll('[data-cme-key]')].find(row=>row.dataset.cmeKey===key);
 ui.pop=()=>ui.element.querySelector('[data-cme-popover]');ui.top=id=>ui.element.querySelector(`[data-cme-toolbar="${id}"]`).click();
 ui.key=(el,key)=>el.dispatchEvent(new page.KeyboardEvent('keydown',{key,bubbles:true,cancelable:true}));
 ui.change=(el,value)=>{if(!el)throw new Error('Legacy settings control missing');if(el.type==='checkbox')el.checked=value;else el.value=String(value);el.dispatchEvent(new page.Event('change',{bubbles:true}));};
 ui.choose=id=>ui.change(ui.element.querySelector('[data-cme-menu]'),id);
 ui.option=(panel,key,value)=>{ui.top(panel);const control=ui.pop().querySelector(`[data-option="${key}"]`);control?.closest('details')?.setAttribute('open','');ui.change(control,value);ui.key(ui.pop(),'Escape');};
 ui.symbol=(key,text)=>{ui.row(key).querySelector('[data-action="icon"]').click();ui.pop().querySelector('[data-icon-tab="symbol"]').click();const input=ui.pop().querySelector('[data-icon-text]');input.value=text;input.dispatchEvent(new page.Event('input',{bubbles:true}));ui.pop().querySelector('[data-icon-action="save"]').click();};
 ui.rename=(key,name)=>{ui.row(key).querySelector('[data-action="label"]').click();const input=ui.row(key).querySelector('[data-action="name"]');input.value=name;ui.key(input,'Enter');};
 ui.choose(rootId);return ui;
}
let ui,page;
try{
 await waitFor(()=>w.__contextMenuEditor?.controller,'initial fresh Sine runtime');
 checks.startsWithoutSavedEditorState=raw()==='';
 checks.syntheticLegacyPrefsInitiallyAbsent=Object.keys(seed).every(key=>!Services.prefs.prefHasUserValue(key));
 await disable();
 checks.actualSineDisabledBeforeSeeding=!w.__contextMenuEditor&&!root.querySelector('[data-cme-owned],.cme-decoration,[data-cme-item]');
 Services.prefs.setBoolPref('privacy.query_stripping.strip_on_share.enabled',true);
 page=await pageFixture();details.pageOwnerBaseline={};
 for(const target of ['tracking','plain']){details.pageOwnerBaseline[target]=await page.open(target);await page.close();}
 checks.actualPageBaselineUsesTrustedOriginalCommands=Object.values(details.pageOwnerBaseline).every(value=>value.trusted&&value.sameOriginalNodes&&value.copyAvailable);
 // Withhold an actual original node so the imported rule must also work when
 // that command is discovered after the initial import and later UI edits.
 original.late.remove();setPrefs(seed);Services.prefs.clearUserPref(pref);
 await enable();
 checks.importWritesNonemptyEditorState=raw()!=='';
 if(!checks.importWritesNonemptyEditorState)throw new Error('Legacy import did not create editor settings');
 const imported=state();details.importedOptions={...imported.options};
 checks.importedVersionAndOrdinaryDefaults=imported.version===1&&imported.options.enabled===true&&imported.options.iconSize===16&&imported.options.rowSpacing===2&&imported.options.rounded===true&&imported.options.hoverShade===true;
 checks.importedAppearance=imported.options.iconPack==='zen'&&imported.options.showIcons===true&&imported.options.iconGap===8&&imported.options.separatorOpacity===0.6&&imported.options.monochromeExtensions===true;
 checks.legacyPackOffsetIsNotMisreadAsIconGap=imported.options.iconGap===8&&Services.prefs.getStringPref('cmi-zenui-text-leftmargin')==='12px';
 checks.importedSeparatorAndCleanLinkChoices=imported.options.showSeparators===false&&imported.options.preferCleanLinks===true;
 checks.inactiveHidingKeepsPageTabScope=imported.options.hideUnavailable===false&&imported.roots.contentAreaContextMenu?.hideUnavailable===true&&imported.roots.tabContextMenu?.hideUnavailable===true&&!imported.roots.placesContext?.hideUnavailable;
 checks.lateNativeCommandStillPending=imported.roots.tabContextMenu?.legacyHiddenIds?.includes(original.late.id)===true&&!imported.roots.tabContextMenu?.records[original.late.id];
 checks.importDoesNotMutateLegacyPrefs=same(legacySnapshot(),seed);
 await openNative();
 checks.nativeImportUsesOriginalNodes=w.document.getElementById(original.reload.id)===original.reload&&w.document.getElementById(original.duplicate.id)===original.duplicate&&original.reload.parentElement===root&&original.duplicate.parentElement===root;
 checks.nativeImportHidesRequestedCommands=original.reload.hidden===true&&original.duplicate.hidden===true;
 const deco=original.pin.querySelector('.cme-decoration'),image=deco?.querySelector('img'),style=deco&&w.getComputedStyle(deco);
 details.nativeImportedAppearance={icon:image?.getAttribute('src'),gap:style?.marginInlineEnd,separatorOpacity:w.getComputedStyle(root).getPropertyValue('--cme-separator-opacity')};
 checks.nativeImportAppliesZenArtworkAndGap=Boolean(image)&&/^chrome:\/\//.test(image.getAttribute('src'))&&parseFloat(style.marginInlineEnd)===8;
 details.nativeImportedSeparators={rootAttribute:root.getAttribute('data-cme-separators'),nodes:[...root.querySelectorAll('menuseparator')].map(node=>({id:node.id,hidden:node.hidden,display:w.getComputedStyle(node).display,parent:node.parentElement.id||node.parentElement.localName,inOpenRoot:node.closest('menupopup')===root,matchesRule:node.matches('[data-cme-root][data-cme-separators="off"] menuseparator')}))};
 // Gecko has no computed display for rows in never-opened child popups.
 // Assess the actual rendered root popup and retain child scope in details.
 const renderedSeparators=details.nativeImportedSeparators.nodes.filter(node=>node.inOpenRoot);
 checks.nativeImportHidesRenderedRootSeparators=renderedSeparators.length>0&&renderedSeparators.every(node=>node.hidden||node.display==='none');
 checks.nativeImportAppliesSeparatorOpacity=parseFloat(w.getComputedStyle(root).getPropertyValue('--cme-separator-opacity'))===0.6;
 await closeNative();
 details.pageImported={};
 // Native query stripping can finish initializing between openings. Compare
 // against the owner in this dispatch, before CME applies its queued overlay.
 for(const target of ['tracking','plain']){const actual=await page.open(target);details.pageImported[target]=actual;checks['nativePageCleanLinkConditional:'+target]=actual.trusted&&actual.sameOriginalNodes&&actual.ownerBeforeOverlay?.copyAvailable===true&&actual.copyHidden===actual.ownerBeforeOverlay?.cleanAvailable;checks['nativePageHidesImportedSaveLink:'+target]=page.save.hidden===true;await page.close();}
 if(!details.pageImported.tracking.ownerBeforeOverlay?.cleanAvailable){
  // A native command can be installed while its stripping list is unavailable
  // offline. Keep that evidence explicit and test eligibility changes by a
  // disposable owner on the same original nodes and trusted popup path.
  details.pageCleanLinkQualification='Installed Gecko did not offer a usable clean command for the tracking link. Positive eligibility below is a disposable owner-controlled original-node fixture.';
  for(const mode of ['usable','disabled','hidden']){const actual=await page.open('tracking',mode);details.pageImported['owner:'+mode]=actual;checks['nativeOriginalNodeOwnerEligibility:'+mode]=actual.trusted&&actual.sameOriginalNodes&&actual.copyHidden===(mode==='usable');await page.close();}
 }else details.pageCleanLinkQualification='Installed Gecko offered a usable original clean command for the tracking link; imported hiding follows that actual owner eligibility.';
 await page.open('selection');checks.nativeSelectionCopyRemainsAvailable=page.selection.hidden===false;await page.close();
 ui=await settingsFor();
 checks.realUIShowsImportedHiddenCommands=ui.row(original.reload.id)?.querySelector('[data-action="enabled"]')?.checked===false&&ui.row(original.duplicate.id)?.querySelector('[data-action="enabled"]')?.checked===false;
 ui.top('appearance');const appearance=Object.fromEntries(['iconPack','iconGap','separatorOpacity','showSeparators','monochromeExtensions'].map(key=>{const c=ui.pop().querySelector(`[data-option="${key}"]`);return[key,c?.type==='checkbox'?c.checked:c?.value];}));
 checks.realUIShowsImportedAppearance=appearance.iconPack==='zen'&&appearance.iconGap==='8'&&appearance.separatorOpacity==='0.6'&&appearance.showSeparators===false&&appearance.monochromeExtensions===true;ui.key(ui.pop(),'Escape');
 ui.top('options');checks.realUIShowsImportedCleanLinks=ui.pop().querySelector('[data-option="preferCleanLinks"]')?.checked===true;checks.realUIShowsRootInactiveChoice=ui.pop().querySelector('[data-option="hideUnavailable"]')?.checked===true;ui.key(ui.pop(),'Escape');
 ui.change(ui.row(original.reload.id).querySelector('[data-action="enabled"]'),true);ui.rename(original.reload.id,'Reload after legacy import');ui.symbol(original.reload.id,'★');
 ui.option('appearance','iconGap',9);ui.option('appearance','separatorOpacity',0.7);ui.option('appearance','showSeparators',true);
 ui.option('options','hideUnavailable',false);ui.option('options','preferCleanLinks',false);
 checks.explicitUIEditsOverrideImport=state().roots.tabContextMenu.records[original.reload.id].hidden===false&&state().roots.tabContextMenu.records[original.reload.id].name==='Reload after legacy import'&&state().roots.tabContextMenu.records[original.reload.id].icon?.text==='★'&&state().options.iconGap===9&&state().options.showSeparators===true&&state().options.preferCleanLinks===false&&state().roots.tabContextMenu.hideUnavailable===false;
 checks.unseenLegacyCommandSurvivesOtherEdits=state().roots.tabContextMenu.legacyHiddenIds?.includes(original.late.id)===true;
 lateParent.insertBefore(original.late,lateNext?.parentNode===lateParent?lateNext:null);w.__contextMenuEditor.controller.refresh();await pause(150);
 checks.realUIDiscoversLateOriginalAsHidden=ui.row(original.late.id)?.querySelector('[data-action="enabled"]')?.checked===false;
 // A normal appearance edit persists the merged inventory, consuming only
 // this newly discovered command's pending default into its own record.
 ui.option('appearance','rowSpacing',3);
 checks.lateHiddenDefaultConsumedIntoOwnRecord=state().roots.tabContextMenu.records[original.late.id]?.hidden===true&&!state().roots.tabContextMenu.legacyHiddenIds?.includes(original.late.id);
 const saved=raw();checks.uiEditsStillLeaveLegacyPrefsUntouched=same(legacySnapshot(),seed);
 const changed={...seed,'uc.hidecontext.duplicatetab':false,'cmi-Switch-Icon-Package':1,'cmi-menuseparator-opacity':'0.2','cmi-zenui-text-leftmargin':'4px','cmi-Hide-Inactive-Items-TabContextMenu':false};setPrefs(changed);
 await disable();checks.sineUnloadRestoresOriginalNativeNodes=original.reload.parentElement===root&&original.reload.getAttribute('label')!=='Reload after legacy import'&&!root.querySelector('[data-cme-owned],.cme-decoration,[data-cme-item]');
 await enable();
 checks.sineReloadKeepsExactEditedBytes=raw()===saved;
 checks.changedLegacyPrefsDoNotReimport=state().options.iconPack==='zen'&&state().options.iconGap===9&&state().options.separatorOpacity===0.7&&state().roots.tabContextMenu.records.context_reloadTab.hidden===false&&state().roots.tabContextMenu.records.context_duplicateTab.hidden===true;
 checks.sineReloadLeavesChangedLegacyPrefsUntouched=same(legacySnapshot(),changed);
 await openNative();
 checks.nativeReloadRetainsExplicitEdit=original.reload.hidden===false&&original.reload.getAttribute('label')==='Reload after legacy import'&&original.reload.querySelector('.cme-decoration')?.textContent==='★';
 checks.nativeReloadRetainsOtherImportedHiding=original.duplicate.hidden===true&&original.late.hidden===true;
 checks.nativeReloadUsesEditedAppearance=parseFloat(w.getComputedStyle(original.reload.querySelector('.cme-decoration')).marginInlineEnd)===9&&parseFloat(w.getComputedStyle(original.reload).paddingTop)===3;
 await closeNative();
 const pageAfterOverride=await page.open('tracking');checks.explicitCleanLinkOverrideReachesOriginalNativeCommand=pageAfterOverride.trusted&&pageAfterOverride.sameOriginalNodes&&pageAfterOverride.copyAvailable;details.pageAfterOverride=pageAfterOverride;await page.close();
 Services.prefs.savePrefFile(null);const path=Services.dirsvc.get('ProfD',Ci.nsIFile);path.append('prefs.js');const disk=await(await w.fetch(Services.io.newFileURI(path).spec)).text();
 const line=disk.split('\n').find(value=>value.startsWith('user_pref("'+pref+'",'));const diskRaw=line?JSON.parse(line.slice(('user_pref("'+pref+'",').length).trim().replace(/\);$/,'')):null;
 checks.flushedPreferenceMatchesEditedState=diskRaw===raw();details.legacyPrefsAfterExplicitSyntheticChange=changed;details.saved={rawLength:raw().length,lateCommand:original.late.id,editedCommand:original.reload.id,appearance:state().options};
 return{checks,details,persistedRaw:raw(),inputEvidence:'First own headless Zen process: only synthetic explicit legacy prefs; actual Sine disable/enable; same original native tab nodes; real Configure controls; late native-node discovery; edited prefs.js flush/readback. No everyday profile, clipboard or global UI.'};
}catch(error){checks.completed=false;details.error=String(error);details.stack=error.stack;details.status=ui?.element.querySelector('[data-cme-status]')?.textContent;return{checks,details};}
finally{root.hidePopup();page?.cleanup();if(!original.late.isConnected)lateParent.insertBefore(original.late,lateNext?.parentNode===lateParent?lateNext:null);}
