// The helper supplies expectedRaw only for comparison. This probe never writes
// the expected string or imports the first process's in-memory store.
const expectedRaw=/* EXPECTED_SETUP_RAW */null;
const {browser:w,Services,waitFor,pause,rect,nativeEvent}=ctx;
const owner=await waitFor(()=>w.__contextMenuEditor?.controller&&w.__contextMenuEditor,'Sine editor in second process');
const root=w.document.getElementById('tabContextMenu'),pref='extension.context-menu-editor.settings',raw=()=>Services.prefs.getStringPref(pref,'');
const checks={},details={},startupRaw=raw(),startup=JSON.parse(startupRaw),records=startup.roots.tabContextMenu.records;
const group=Object.keys(records).find(key=>records[key].kind==='submenu'&&records[key].name==='Restart tools'),order=records[group]?.children||[],separator=order.find(key=>records[key]?.owned&&records[key]?.kind==='separator');
checks.secondProcessReadsExactPersistedBytes=startupRaw===expectedRaw;
checks.persistedNativeName=records.context_duplicateTab.name==='Duplicate after restart';
checks.persistedUnicodeIcon=records.context_duplicateTab.icon?.text==='🦊';
checks.persistedImageIcon=records.context_reloadTab.icon?.kind==='image'&&records.context_reloadTab.icon.data.startsWith('data:image/png;base64,');
checks.persistedSubmenuSeparatorAndOrder=Boolean(group&&separator)&&order.join('|')===['context_reloadTab',separator,'context_duplicateTab','context_pinTab'].join('|');
checks.persistedDisabledAndRemoved=records.context_pinTab.hidden===true&&records.context_bookmarkTab.removed===true;
checks.persistedAppearance=startup.options.iconSize===20&&startup.options.iconAlignment==='right'&&startup.options.iconGap===12&&startup.options.rowSpacing===4&&startup.options.rounded===false&&startup.options.hoverShade===false&&startup.options.separatorOpacity===0.65&&startup.options.iconPack==='zen'&&startup.options.monochromeExtensions===true;
const tab=w.gBrowser.addTab('about:preferences',{triggeringPrincipal:Services.scriptSecurityManager.getSystemPrincipal()});w.gBrowser.selectedTab=tab;
const p=await waitFor(()=>{const page=tab.linkedBrowser.contentWindow;return page?.document.querySelector('[mod-id="context-menu-editor"] [data-cme-settings]')&&page;},'Sine settings in restarted process');
p.document.getElementById('category-sine-mods').activate();const card=p.document.querySelector('[mod-id="context-menu-editor"]');card.querySelector('.sineItemConfigureButton').click();await waitFor(()=>card.querySelector('dialog')?.open,'restarted Sine Configure');
const ui={get element(){return card.querySelector('[data-cme-settings]');}};
ui.row=key=>[...ui.element.querySelectorAll('[data-cme-key]')].find(row=>row.dataset.cmeKey===key);
ui.pop=()=>ui.element.querySelector('[data-cme-popover]');ui.top=id=>ui.element.querySelector(`[data-cme-toolbar="${id}"]`).click();
ui.change=(el,value)=>{if(el.type==='checkbox')el.checked=value;else el.value=String(value);el.dispatchEvent(new p.Event('change',{bubbles:true}));};
ui.key=(el,key)=>el.dispatchEvent(new p.KeyboardEvent('keydown',{key,bubbles:true,cancelable:true}));
ui.change(ui.element.querySelector('[data-cme-menu]'),'tabContextMenu');
// Zen 1.24 starts a fresh profile on its hidden placeholder tab (zen-empty-tab,
// display:none), which has no bounds to right-click. Use a real tab instead.
async function visibleTab(){let tab=w.gBrowser.selectedTab;if(tab.hasAttribute('zen-empty-tab')||!(tab.getBoundingClientRect().width>0)){tab=w.gBrowser.addTab('about:blank#cme-native-tab',{triggeringPrincipal:Services.scriptSecurityManager.getSystemPrincipal()});w.gBrowser.selectedTab=tab;}await waitFor(()=>{const r=tab.getBoundingClientRect();return r.width>0&&r.height>0;},'visible native tab');return tab;}
async function openNative(target=null){target=target||await visibleTab();w.gBrowser.selectedTab=target;const bounds=rect(target);await nativeEvent.synthesizeMouseAtPoint(bounds.x+bounds.width/2,bounds.y+bounds.height/2,{type:'contextmenu',button:2},w);await waitFor(()=>root.state==='open','native tab menu after restart');await pause(100);}
try{
 checks.realUIOpeningDoesNotRewritePersistedBytes=raw()===startupRaw;
 checks.realUIShowsPersistedName=ui.row('context_duplicateTab')?.querySelector('[data-action="label"]')?.textContent==='Duplicate after restart';
 checks.realUIShowsPersistedIcon=ui.row('context_duplicateTab')?.querySelector('.cme-symbol-glyph')?.textContent==='🦊';
 checks.realUIShowsPersistedImage=ui.row('context_reloadTab')?.querySelector('[data-action="icon"] img')?.getAttribute('src')===records.context_reloadTab.icon.data;
 checks.realUIShowsDisabledAndRemoved=ui.row('context_pinTab')?.querySelector('[data-action="enabled"]')?.checked===false&&!ui.row('context_bookmarkTab');
 checks.realUIShowsPersistedParents=order.every(key=>ui.row(key)?.dataset.parent===group);
 ui.top('appearance');const appearance={};for(const key of ['iconPack','iconSize','iconAlignment','iconGap','rowSpacing','rounded','hoverShade','separatorOpacity','monochromeExtensions']){const control=ui.pop().querySelector(`[data-option="${key}"]`);appearance[key]=control.type==='checkbox'?control.checked:control.value;}
 checks.realUIShowsPersistedAppearance=Object.entries(appearance).every(([key,value])=>String(startup.options[key])===String(value));ui.key(ui.pop(),'Escape');
 const duplicate=w.document.getElementById('context_duplicateTab'),reload=w.document.getElementById('context_reloadTab'),pin=w.document.getElementById('context_pinTab'),removed=w.document.getElementById('context_bookmarkTab');
 await openNative();let menu=root.querySelector('menu[label="Restart tools"]'),popup=menu?.querySelector('menupopup');if(!popup)throw new Error('Persisted custom native submenu absent');menu.open=true;await waitFor(()=>popup.state==='open','native persisted submenu');await pause(100);
 checks.nativeRestartUsesNewOriginalNodes=popup.children[0]===reload&&popup.children[2]===duplicate&&popup.children[3]===pin;
 checks.nativeRestartPreservesSeparatorOrder=popup.children[1]?.localName==='menuseparator'&&!popup.children[1].hidden;
 checks.nativeRestartAppliesNameAndUnicode=duplicate.getAttribute('label')==='Duplicate after restart'&&duplicate.querySelector('.cme-decoration')?.textContent==='🦊';
 checks.nativeRestartAppliesImage=reload.querySelector('.cme-decoration img')?.getAttribute('src')===records.context_reloadTab.icon.data;
 checks.nativeRestartAppliesDisabledAndRemoved=pin.hidden===true&&removed.hidden===true;
 const deco=duplicate.querySelector('.cme-decoration'),style=w.getComputedStyle(deco),itemStyle=w.getComputedStyle(duplicate);
 checks.nativeRestartAppliesAppearance=parseFloat(style.height)===20&&parseFloat(style.marginInlineEnd)===12&&parseFloat(itemStyle.paddingTop)===4&&root.dataset.cmeRounded==='false'&&root.dataset.cmeHover==='false';
 const image=new p.Image();image.src=records.context_reloadTab.icon.data;await image.decode();checks.normalizedImageSurvivesRestart=image.naturalWidth===32&&image.naturalHeight===32;
 root.hidePopup();await pause(60);
 ui.change(ui.row('context_pinTab').querySelector('[data-action="enabled"]'),true);
 ui.top('options');ui.pop().querySelector('[data-cme-restore-removed]').click();const restore=ui.pop().querySelector('[data-restore="context_bookmarkTab"]');checks.realUIOffersPersistedRemovedEntry=Boolean(restore);restore?.click();
 checks.reenableKeepsPersistedPosition=JSON.parse(raw()).roots.tabContextMenu.records[group].children.join('|')===order.join('|');
 checks.restoreKeepsPersistedCustomization=JSON.parse(raw()).roots.tabContextMenu.records.context_duplicateTab.name==='Duplicate after restart'&&!JSON.parse(raw()).roots.tabContextMenu.records.context_bookmarkTab.removed;
 const target=w.gBrowser.addTab('about:blank#cme-process-restart',{triggeringPrincipal:Services.scriptSecurityManager.getSystemPrincipal()});w.gBrowser.selectedTab=target;await pause(200);
 await openNative(target);menu=root.querySelector('menu[label="Restart tools"]');menu.open=true;popup=menu.querySelector('menupopup');await waitFor(()=>popup.state==='open','restart command submenu');
 checks.nativeReenableAndRestoreTakeEffect=!pin.hidden&&!removed.hidden;
 const before=new Set(w.gBrowser.tabs);let trusted=false;duplicate.addEventListener('command',event=>{trusted=event.isTrusted;},{once:true});const bounds=rect(duplicate);
 await nativeEvent.synthesizeMouseAtPoint(bounds.x+bounds.width/2,bounds.y+bounds.height/2,{button:0},w);
 const duplicated=await waitFor(()=>[...w.gBrowser.tabs].find(candidate=>!before.has(candidate)&&candidate.linkedBrowser.currentURI.spec==='about:blank#cme-process-restart'),'original duplicate-tab handler after restart',10000);
 checks.originalTrustedNativeHandlerWorksAfterRestart=trusted&&Boolean(duplicated)&&w.document.getElementById('context_duplicateTab')===duplicate;
 root.hidePopup();await pause(60);checks.closeStillRestoresNativeNodes=duplicate.parentElement===root&&reload.parentElement===root&&pin.parentElement===root&&!root.querySelector('[data-cme-owned],.cme-decoration');
 w.gBrowser.removeTab(duplicated,{animate:false});w.gBrowser.removeTab(target,{animate:false});
 details.persisted={rootId:'tabContextMenu',group,separator,order,rawLength:startupRaw.length,appearance,normalizedImage:{width:image.naturalWidth,height:image.naturalHeight},command:'context_duplicateTab',trusted};
 return{checks,details,inputEvidence:'Second distinct own headless process using the helper-created profile without recopying Sine or the candidate. Exact startup preference bytes, real Sine UI, new original native menu nodes, normalized image decode, restoration controls and trusted native mouse command effect are verified. No everyday profile or clipboard.'};
}catch(error){checks.completed=false;details.error=String(error);details.stack=error.stack;details.status=ui.element.querySelector('[data-cme-status]')?.textContent;return{checks,details};}
finally{root.hidePopup();}
