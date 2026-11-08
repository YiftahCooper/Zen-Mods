const {browser:w,Services,waitFor,pause,rect,nativeEvent,manager}=ctx;
await waitFor(()=>w.__contextMenuEditor?.controller,'Sine editor runtime');
const pref='extension.context-menu-editor.settings',rootId='tabContextMenu',root=w.document.getElementById(rootId);
const checks={},details={},fixtures=[];
const raw=()=>Services.prefs.getStringPref(pref,''),state=()=>JSON.parse(raw());
for(const [id,label] of [['cme-qa-alpha','Alpha action'],['cme-qa-beta','Beta action'],['cme-qa-gamma','Gamma action'],['cme-qa-disabled','Disabled action']]){
 const item=w.document.createXULElement('menuitem');item.id=id;item.setAttribute('label',label);if(id.endsWith('disabled'))item.disabled=true;root.append(item);fixtures.push(item);
}
w.__contextMenuEditor.controller.refresh();
async function settingsFor(browser){
 await waitFor(()=>browser.gBrowserInit.delayedStartupFinished,'native browser delayed startup');
 const settingsTab=browser.gBrowser.addTab('about:preferences',{triggeringPrincipal:Services.scriptSecurityManager.getSystemPrincipal()});browser.gBrowser.selectedTab=settingsTab;
 const page=await waitFor(()=>{const p=settingsTab.linkedBrowser.contentWindow;return p?.document.querySelector('[mod-id="context-menu-editor"] [data-cme-settings]')&&p;},'Sine settings document');browser.gBrowser.selectedTab=settingsTab;
 page.document.getElementById('category-sine-mods').activate();const card=page.document.querySelector('[mod-id="context-menu-editor"]');card.querySelector('.sineItemConfigureButton').click();await pause(450);
 const ui={browser,page,card,get element(){return card.querySelector('[data-cme-settings]');}};
 ui.row=key=>[...ui.element.querySelectorAll('[data-cme-key]')].find(row=>row.dataset.cmeKey===key);
 ui.pop=()=>ui.element.querySelector('[data-cme-popover]');ui.top=id=>ui.element.querySelector(`[data-cme-toolbar="${id}"]`).click();
 ui.change=(el,value)=>{if(el.type==='checkbox')el.checked=value;else el.value=String(value);el.dispatchEvent(new page.Event('change',{bubbles:true}));};
 ui.choose=id=>ui.change(ui.element.querySelector('[data-cme-menu]'),id);
 ui.key=(el,key)=>el.dispatchEvent(new page.KeyboardEvent('keydown',{key,bubbles:true,cancelable:true}));
 ui.rename=(key,name)=>{ui.row(key).querySelector('[data-action="label"]').click();const input=ui.row(key).querySelector('[data-action="name"]');input.value=name;ui.key(input,'Enter');};
 ui.action=(key,action)=>{ui.row(key).querySelector('[data-action="more"]').click();ui.pop().querySelector(`[data-action="${action}"]`).click();};
 ui.move=(key,parent)=>{ui.action(key,'move');ui.change(ui.pop().querySelector('[data-action="move-to"]'),parent||'@root');};
 ui.add=kind=>{const before=new Set([...ui.element.querySelectorAll('[data-cme-key]')].map(el=>el.dataset.cmeKey));ui.top('add');ui.pop().querySelector(`[data-cme-add="${kind}"]`).click();return[...ui.element.querySelectorAll('[data-cme-key]')].find(el=>!before.has(el.dataset.cmeKey))?.dataset.cmeKey;};
 ui.option=(key,value)=>{ui.top(['enabled','hideUnavailable','shiftBypass'].includes(key)?'options':'appearance');const el=ui.pop().querySelector(`[data-option="${key}"]`);el.closest('details')?.setAttribute('open','');ui.change(el,value);ui.key(ui.pop(),'Escape');};
 ui.choose(rootId);return ui;
}
async function showMenu(){const tab=w.gBrowser.selectedTab,b=rect(tab);await nativeEvent.synthesizeMouseAtPoint(b.x+b.width/2,b.y+b.height/2,{type:'contextmenu',button:2},w);await waitFor(()=>root.state==='open','native tab popup');await pause(70);}
const originalA=fixtures[0],originalB=fixtures[1],originalC=fixtures[2];let second;
try{
 const ui=await settingsFor(w),a=originalA.id,b=originalB.id,c=originalC.id;
 ui.rename(a,'My alpha action');
 ui.row(a).querySelector('[data-action="icon"]').click();ui.pop().querySelector('[data-icon-tab="symbol"]').click();const text=ui.pop().querySelector('[data-icon-text]');text.value='★';text.dispatchEvent(new ui.page.Event('input',{bubbles:true}));ui.pop().querySelector('[data-icon-action="save"]').click();
 const group=ui.add('submenu');let name=ui.row(group).querySelector('[data-action="name"]');name.value='QA tools';ui.key(name,'Enter');ui.move(a,group);
 const separator=ui.add('separator');ui.move(b,group);const nested=ui.add('submenu');name=ui.row(nested).querySelector('[data-action="name"]');name.value='Nested tools';ui.key(name,'Enter');ui.move(c,nested);
 checks.nestedSubmenusAndSeparatorPersist=state().roots[rootId].records[group].children.join('|')===[a,separator,b,nested].join('|')&&state().roots[rootId].records[nested].children[0]===c;
 ui.action(nested,'remove');checks.removingCustomSubmenuReturnsChildren=ui.row(c).dataset.parent===group&&!state().roots[rootId].records[nested]&&state().roots[rootId].records[group].children.join('|')===[a,separator,b,c].join('|');
 ui.action(a,'remove');checks.removePreservesCustomization=state().roots[rootId].records[a].removed&&!ui.row(a)&&state().roots[rootId].records[a].name==='My alpha action';
 ui.top('options');ui.pop().querySelector('[data-cme-restore-removed]').click();ui.pop().querySelector(`[data-restore="${a}"]`).click();
 checks.restoreReturnsOriginalPosition=state().roots[rootId].records[group].children[0]===a&&ui.row(a).dataset.parent===group&&ui.row(a).querySelector('[data-action="label"]').textContent==='My alpha action';
 ui.change(ui.row(a).querySelector('[data-action="enabled"]'),false);ui.change(ui.row(a).querySelector('[data-action="enabled"]'),true);
 checks.checkboxKeepsPositionAndIcon=state().roots[rootId].records[group].children[0]===a&&state().roots[rootId].records[a].icon.text==='★';
 await showMenu();let nativeGroup=root.querySelector(`menu[label="QA tools"]`);nativeGroup.open=true;await waitFor(()=>originalA.parentElement?.state==='open','edited submenu open');
 checks.nativeNestedLayoutMatchesSettings=originalA===originalA.parentElement.children[0]&&originalA.nextElementSibling.localName==='menuseparator'&&originalB.parentElement===originalA.parentElement&&originalC.parentElement===originalA.parentElement;
 root.hidePopup();
 ui.option('hideUnavailable',true);await showMenu();checks.hideUnavailableHidesDisabled=fixtures[3].hidden&&fixtures[3].disabled;root.hidePopup();
 ui.option('hideUnavailable',false);await showMenu();checks.defaultKeepsDisabledCommandVisible=!fixtures[3].hidden&&fixtures[3].disabled;root.hidePopup();
 ui.option('enabled',false);await showMenu();checks.disableRestoresOwnerMenu=originalA.parentElement===root&&originalA.getAttribute('label')==='Alpha action'&&!root.querySelector('[data-cme-owned],.cme-decoration');root.hidePopup();
 ui.option('enabled',true);await showMenu();checks.reenableRestoresSavedMenu=originalA.getAttribute('label')==='My alpha action'&&originalA.parentElement.parentElement.getAttribute('label')==='QA tools';root.hidePopup();
 for(const [key,value] of [['iconSize',12],['iconSize',24],['iconGap',0],['iconGap',16],['rowSpacing',0],['rowSpacing',8],['rounded',false],['hoverShade',false],['separatorOpacity',0],['separatorOpacity',1],['monochromeExtensions',true],['iconPack','zen']])ui.option(key,value);
 await showMenu();nativeGroup=root.querySelector('menu[label="QA tools"]');nativeGroup.open=true;await waitFor(()=>originalA.parentElement.state==='open','appearance test submenu');await pause(80);
 const deco=originalA.querySelector('.cme-decoration'),computed=w.getComputedStyle(deco),itemStyle=w.getComputedStyle(originalA);
 checks.appearanceExtremesReachNativeMenu=parseFloat(computed.height)===24&&parseFloat(computed.marginInlineEnd)===16&&parseFloat(itemStyle.paddingTop)===8&&root.dataset.cmeRounded==='false'&&root.dataset.cmeHover==='false';
 details.appearance={iconHeight:computed.height,gap:computed.marginInlineEnd,padding:itemStyle.paddingTop};root.hidePopup();
 ui.option('showIcons',false);await showMenu();checks.globalIconsOffRemovesDecorations=!root.querySelector('.cme-decoration');root.hidePopup();ui.option('showIcons',true);
 ui.row(a).querySelector('[data-action="icon"]').click();ui.change(ui.pop().querySelector('[data-icon-show]'),false);ui.pop().querySelector('[data-icon-action="save"]').click();await showMenu();checks.perItemIconsOffKeepsOtherIcons=!originalA.querySelector('.cme-decoration')&&!!originalB.querySelector('.cme-decoration');root.hidePopup();
 ui.row(a).querySelector('[data-action="icon"]').click();ui.pop().querySelector('[data-icon-action="reset"]').click();ui.pop().querySelector('[data-icon-action="save"]').click();checks.iconResetKeepsName=state().roots[rootId].records[a].name==='My alpha action'&&state().roots[rootId].records[a].showIcon&&!state().roots[rootId].records[a].icon;
 const beforeOrder=state().roots[rootId].records[a].name;ui.top('options');ui.pop().querySelector('[data-cme-restore-order]').click();checks.restoreOrderKeepsNameAndSeparators=state().roots[rootId].records[a].name===beforeOrder&&state().roots[rootId].children.indexOf(a)<state().roots[rootId].children.indexOf(b)&&state().roots[rootId].records[separator]?.owned;ui.key(ui.pop(),'Escape');
 const beforeReset=raw();ui.top('options');ui.pop().querySelector('[data-cme-reset-menu]').click();checks.resetOnlySelectedMenu=!state().roots[rootId]&&state().options.iconSize===24;ui.key(ui.pop(),'Escape');ui.element.querySelector('[data-cme-undo]').click();checks.undoRestoresFullMenu=raw()===beforeReset;
 second=w.OpenBrowserWindow();await waitFor(()=>second.__contextMenuEditor?.controller,'editor in second real browser window');const other=await settingsFor(second);
 ui.rename(a,'First window edit');await waitFor(()=>other.row(a)?.querySelector('[data-action="label"]').textContent==='First window edit','cross-window settings update');checks.settingsSynchronizeAcrossWindows=true;
 other.row(a).querySelector('[data-action="icon"]').click();ui.rename(a,'Newer first-window edit');await pause(50);checks.newerWindowChangeCancelsStaleIcon=!other.pop()&&other.row(a).querySelector('[data-action="label"]').textContent==='Newer first-window edit';
 const saved=raw();second.close();second=null;
 // Sine's chrome.css is a user sheet, which Zen's own author rules outrank (row
 // padding, decoration display). Each page therefore keeps exactly one author link.
 checks.oneStylesheetLinkPerPage=w.document.querySelectorAll('[data-cme-stylesheet]').length===1&&ui.page.document.querySelectorAll('[data-cme-stylesheet]').length===1;
 const utils=ChromeUtils.importESModule('chrome://userscripts/content/core/utils.sys.mjs').default;
 await manager.toggleTheme(await utils.getMods(),'context-menu-editor');await waitFor(()=>!w.__contextMenuEditor,'Sine unload');
 checks.sineUnloadCleansNativeOverlay=!root.querySelector('[data-cme-owned],.cme-decoration,[data-cme-item]')&&w.document.querySelectorAll('[data-cme-stylesheet]').length===0&&originalA.parentElement===root;
 await manager.toggleTheme(await utils.getMods(),'context-menu-editor');await waitFor(()=>w.__contextMenuEditor?.controller,'Sine reload');await pause(250);
 checks.sineReloadRetainsSettings=raw()===saved&&w.document.querySelectorAll('[data-cme-stylesheet]').length===1;await showMenu();// The saved row spacing comes from the author stylesheet link (B: item 7 finding).
 const reloaded=w.getComputedStyle(originalA).paddingTop;details.reloadedPadding=reloaded;
 checks.sineReloadStylesStillApply=reloaded===details.appearance?.padding;checks.sineReloadUsesSavedOriginalNodes=originalA===w.document.getElementById(a)&&originalA.getAttribute('label')==='Newer first-window edit';root.hidePopup();
 // Corruption is injected only into this fresh profile, after the valid-state tests.
 Services.prefs.setStringPref(pref,'{broken-qa');await pause(60);
 checks.invalidStateLeavesOwnerMenu=Boolean(w.__contextMenuEditor.store.read().error);await showMenu();checks.invalidStateLeavesOwnerMenu&&=originalA.getAttribute('label')==='Alpha action'&&!root.querySelector('[data-cme-owned],.cme-decoration');root.hidePopup();
 const current=ui.page.document.querySelector('[mod-id="context-menu-editor"] [data-cme-settings]');const recovery=[...current.querySelectorAll('button')].find(el=>el.textContent==='Reset saved settings');
 checks.invalidStateExplained=!!recovery&&[...current.querySelectorAll('input,select,button')].every(el=>el===recovery||el.disabled);
 recovery.click();checks.recoveryPreservesCorruptBytes=Services.prefs.getStringPref(pref+'.recovery')==='{broken-qa'&&!w.__contextMenuEditor.store.read().error;
 return{checks,details,inputEvidence:'Actual Sine controls, original XUL menu nodes, two browser windows in the same disposable profile, Sine disable/re-enable loading, native appearance and explicit corrupt-state recovery. DOM controls are exercised here; trusted pointer tests are separate.'};
}catch(error){checks.completed=false;details.error=String(error);details.stack=error.stack;if(second&&!second.closed)details.secondWindow={delayedStartup:second.gBrowserInit?.delayedStartupFinished,selectedURI:second.gBrowser.selectedBrowser.currentURI.spec,tabs:[...second.gBrowser.tabs].map(tab=>({uri:tab.linkedBrowser.currentURI.spec,selected:tab.selected})),documentURI:second.gBrowser.selectedBrowser.contentWindow?.document?.documentURI,body:second.gBrowser.selectedBrowser.contentWindow?.document?.body?.innerHTML?.slice(0,400)};return{checks,details};}
finally{root.hidePopup();second?.close();for(const fixture of fixtures)fixture.remove();}
