// The helper injects comparison bytes only. They are never written or imported.
const expectedRaw=/* EXPECTED_SETUP_RAW */null;
const {browser:w,Services,waitFor,pause,rect,nativeEvent,manager}=ctx;
const owner=await waitFor(()=>w.__contextMenuEditor?.controller&&w.__contextMenuEditor,'legacy editor after full process restart');
const pref='extension.context-menu-editor.settings',root=w.document.getElementById('tabContextMenu'),raw=()=>Services.prefs.getStringPref(pref,'');
const checks={},details={},startupRaw=raw(),startup=owner.store.read().state,records=startup.roots.tabContextMenu.records;let extraTab;
const changed={
 'uc.hidecontext.reloadtab':true,'uc.hidecontext.duplicatetab':false,
 'uc.hidecontext.savelink':true,'uc.hidecontext.navigation':true,
 'uc.hidecontext.copylink':true,'uc.hidecontext.separators':true,
 'cmi-Switch-Icon-Package':1,'cmi-menuseparator-opacity':'0.2',
 'cmi-zenui-text-leftmargin':'4px','cmi-Grayscale-Extensions-Icons':true,
 'cmi-Hide-Inactive-Items-ContentAreaContextMenu':true,
 'cmi-Hide-Inactive-Items-TabContextMenu':false,
};
function legacySnapshot(){return Object.fromEntries(Object.entries(changed).map(([key,value])=>[key,typeof value==='boolean'?Services.prefs.getBoolPref(key):typeof value==='number'?Services.prefs.getIntPref(key):Services.prefs.getStringPref(key)]));}
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
// Zen 1.24 starts a fresh profile on its hidden placeholder tab (zen-empty-tab,
// display:none), which has no bounds to right-click. Use a real tab instead.
async function visibleTab(){let tab=w.gBrowser.selectedTab;if(tab.hasAttribute('zen-empty-tab')||!(tab.getBoundingClientRect().width>0)){tab=w.gBrowser.addTab('about:blank#cme-native-tab',{triggeringPrincipal:Services.scriptSecurityManager.getSystemPrincipal()});w.gBrowser.selectedTab=tab;}await waitFor(()=>{const r=tab.getBoundingClientRect();return r.width>0&&r.height>0;},'visible native tab');return tab;}
async function openNative(){const bounds=rect(await visibleTab());await nativeEvent.synthesizeMouseAtPoint(bounds.x+bounds.width/2,bounds.y+bounds.height/2,{type:'contextmenu',button:2},w);await waitFor(()=>root.state==='open','native legacy menu after process restart');await pause(100);}
async function closeNative(){root.hidePopup();await pause(70);}
try{
 checks.secondProcessReadsExactPersistedBytes=startupRaw===expectedRaw;
 checks.explicitItemEditSurvivesFullRestart=records.context_reloadTab.hidden===false&&records.context_reloadTab.name==='Reload after legacy import'&&records.context_reloadTab.icon?.kind==='text'&&records.context_reloadTab.icon.text==='★';
 checks.otherImportedHidingSurvivesFullRestart=records.context_duplicateTab.hidden===true&&records.context_reloadSelectedTabs.hidden===true;
 checks.editedOptionsSurviveFullRestart=startup.options.iconPack==='zen'&&startup.options.iconGap===9&&startup.options.rowSpacing===3&&startup.options.separatorOpacity===0.7&&startup.options.showSeparators===true&&startup.options.preferCleanLinks===false;
 checks.rootScopeAndExplicitOverrideSurviveRestart=startup.options.hideUnavailable===false&&startup.roots.contentAreaContextMenu.hideUnavailable===true&&startup.roots.tabContextMenu.hideUnavailable===false&&!startup.roots.placesContext?.hideUnavailable;
 checks.restartDoesNotMutateLegacyPrefs=same(legacySnapshot(),changed);
 const reload=w.document.getElementById('context_reloadTab'),duplicate=w.document.getElementById('context_duplicateTab'),late=w.document.getElementById('context_reloadSelectedTabs');
 await openNative();
 checks.nativeRestartUsesOriginalNodes=Boolean(reload&&duplicate&&late)&&reload.parentElement===root&&duplicate.parentElement===root&&late.parentElement===root&&root.querySelectorAll('#context_reloadTab').length===1;
 checks.nativeRestartRetainsExplicitEnabledNameAndIcon=reload.hidden===false&&reload.getAttribute('label')==='Reload after legacy import'&&reload.querySelector('.cme-decoration')?.textContent==='★';
 checks.nativeRestartKeepsImportedCommandsHidden=duplicate.hidden===true&&late.hidden===true;
 const deco=reload.querySelector('.cme-decoration'),style=w.getComputedStyle(deco),rowStyle=w.getComputedStyle(reload);
 checks.nativeRestartRetainsEditedAppearance=parseFloat(style.marginInlineEnd)===9&&parseFloat(rowStyle.paddingTop)===3&&parseFloat(w.getComputedStyle(root).getPropertyValue('--cme-separator-opacity'))===0.7;
 await closeNative();
 const tab=w.gBrowser.addTab('about:preferences',{triggeringPrincipal:Services.scriptSecurityManager.getSystemPrincipal()});w.gBrowser.selectedTab=tab;
 const page=await waitFor(()=>{const p=tab.linkedBrowser.contentWindow;return p?.document.querySelector('[mod-id="context-menu-editor"] [data-cme-settings]')&&p;},'Sine legacy Configure after full restart');
 page.document.getElementById('category-sine-mods').activate();const card=page.document.querySelector('[mod-id="context-menu-editor"]');card.querySelector('.sineItemConfigureButton').click();await waitFor(()=>card.querySelector('dialog')?.open,'restarted legacy Configure dialog');
 const ui={get element(){return card.querySelector('[data-cme-settings]');}},row=key=>[...ui.element.querySelectorAll('[data-cme-key]')].find(el=>el.dataset.cmeKey===key),pop=()=>ui.element.querySelector('[data-cme-popover]');
 const change=(el,value)=>{if(el.type==='checkbox')el.checked=value;else el.value=String(value);el.dispatchEvent(new page.Event('change',{bubbles:true}));};
 const key=(el,value)=>el.dispatchEvent(new page.KeyboardEvent('keydown',{key:value,bubbles:true,cancelable:true}));
 change(ui.element.querySelector('[data-cme-menu]'),'tabContextMenu');
 checks.settingsOpeningKeepsExactPersistedBytes=raw()===startupRaw;
 checks.realUIRetainsExplicitEnabledNameAndIcon=row('context_reloadTab')?.querySelector('[data-action="enabled"]')?.checked===true&&row('context_reloadTab')?.querySelector('[data-action="label"]')?.textContent==='Reload after legacy import'&&row('context_reloadTab')?.querySelector('.cme-symbol-glyph')?.textContent==='★';
 checks.realUIRetainsImportedHiddenCommands=row('context_duplicateTab')?.querySelector('[data-action="enabled"]')?.checked===false&&row('context_reloadSelectedTabs')?.querySelector('[data-action="enabled"]')?.checked===false;
 ui.element.querySelector('[data-cme-toolbar="appearance"]').click();const appearance=Object.fromEntries(['iconPack','iconGap','rowSpacing','separatorOpacity','showSeparators'].map(name=>{const control=pop().querySelector(`[data-option="${name}"]`);return[name,control.type==='checkbox'?control.checked:control.value];}));
 checks.realUIRetainsEditedAppearance=appearance.iconPack==='zen'&&appearance.iconGap==='9'&&appearance.rowSpacing==='3'&&appearance.separatorOpacity==='0.7'&&appearance.showSeparators===true;key(pop(),'Escape');
 ui.element.querySelector('[data-cme-toolbar="options"]').click();checks.realUIRetainsExplicitRootAndCleanLinkOverrides=pop().querySelector('[data-option="hideUnavailable"]')?.checked===false&&pop().querySelector('[data-option="preferCleanLinks"]')?.checked===false;key(pop(),'Escape');
 // The late imported default can itself be changed after restart. The old
 // reloadtab preference remains true, so another real Sine reload must honor
 // the command's now-explicit false setting rather than reseeding it.
 change(row('context_reloadSelectedTabs').querySelector('[data-action="enabled"]'),true);
 const edited=raw();checks.lateCommandCanBeExplicitlyReenabled=JSON.parse(edited).roots.tabContextMenu.records.context_reloadSelectedTabs.hidden===false;
 const utils=ChromeUtils.importESModule('chrome://userscripts/content/core/utils.sys.mjs').default;
 await manager.toggleTheme(await utils.getMods(),'context-menu-editor');await waitFor(()=>!w.__contextMenuEditor,'restarted editor unload');
 checks.restartedUnloadRestoresNativeOverlay=reload.parentElement===root&&!root.querySelector('[data-cme-owned],.cme-decoration,[data-cme-item]');
 await manager.toggleTheme(await utils.getMods(),'context-menu-editor');await waitFor(()=>w.__contextMenuEditor?.controller,'restarted editor reload');await pause(250);
 checks.lateExplicitReenableSurvivesAnotherReload=raw()===edited&&w.__contextMenuEditor.store.read().state.roots.tabContextMenu.records.context_reloadSelectedTabs.hidden===false;
 const selected=w.gBrowser.selectedTab;extraTab=w.gBrowser.addTab('about:blank#cme-legacy-multi',{triggeringPrincipal:Services.scriptSecurityManager.getSystemPrincipal()});w.gBrowser.addToMultiSelectedTabs(selected);w.gBrowser.addToMultiSelectedTabs(extraTab);
 await openNative();checks.lateExplicitReenableReachesEligibleNativeCommand=late.hidden===false&&w.document.getElementById(late.id)===late;await closeNative();w.gBrowser.clearMultiSelectedTabs();
 checks.repeatedReloadStillLeavesLegacyPrefsUntouched=same(legacySnapshot(),changed);
 details.persisted={rawLength:startupRaw.length,editedCommand:'context_reloadTab',lateCommand:'context_reloadSelectedTabs',appearance,legacyPrefs:legacySnapshot()};
 return{checks,details,inputEvidence:'Second distinct own headless Zen process reusing only the helper-created profile, without recopying Sine or the candidate. Exact saved startup bytes, actual original native nodes, real Sine Configure values, late-command override and another actual Sine reload. No everyday profile, clipboard or global UI.'};
}catch(error){checks.completed=false;details.error=String(error);details.stack=error.stack;return{checks,details};}
finally{root.hidePopup();w.gBrowser.clearMultiSelectedTabs();if(extraTab?.isConnected)w.gBrowser.removeTab(extraTab,{animate:false});}
