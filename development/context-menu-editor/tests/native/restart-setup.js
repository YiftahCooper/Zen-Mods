const {browser:w,Services,waitFor,pause,rect,nativeEvent}=ctx;
const owner=await waitFor(()=>w.__contextMenuEditor?.controller&&w.__contextMenuEditor,'Sine editor before process restart');
const root=w.document.getElementById('tabContextMenu'),rootId=root.id,pref='extension.context-menu-editor.settings';
const checks={},details={},raw=()=>Services.prefs.getStringPref(pref,''),state=()=>JSON.parse(raw());
// Zen 1.24 starts a fresh profile on its hidden placeholder tab (zen-empty-tab,
// display:none), which has no bounds to right-click. Use a real tab instead.
async function visibleTab(){let tab=w.gBrowser.selectedTab;if(tab.hasAttribute('zen-empty-tab')||!(tab.getBoundingClientRect().width>0)){tab=w.gBrowser.addTab('about:blank#cme-native-tab',{triggeringPrincipal:Services.scriptSecurityManager.getSystemPrincipal()});w.gBrowser.selectedTab=tab;}await waitFor(()=>{const r=tab.getBoundingClientRect();return r.width>0&&r.height>0;},'visible native tab');return tab;}
async function openNative(){const bounds=rect(await visibleTab());await nativeEvent.synthesizeMouseAtPoint(bounds.x+bounds.width/2,bounds.y+bounds.height/2,{type:'contextmenu',button:2},w);await waitFor(()=>root.state==='open','native tab menu');await pause(80);}
await openNative();root.hidePopup();await pause(60);
const tab=w.gBrowser.addTab('about:preferences',{triggeringPrincipal:Services.scriptSecurityManager.getSystemPrincipal()});w.gBrowser.selectedTab=tab;
const p=await waitFor(()=>{const page=tab.linkedBrowser.contentWindow;return page?.document.querySelector('[mod-id="context-menu-editor"] [data-cme-settings]')&&page;},'real Sine settings');
p.document.getElementById('category-sine-mods').activate();
const card=p.document.querySelector('[mod-id="context-menu-editor"]');card.querySelector('.sineItemConfigureButton').click();await waitFor(()=>card.querySelector('dialog')?.open,'Sine Configure dialog');
const ui={get element(){return card.querySelector('[data-cme-settings]');}};
ui.row=key=>[...ui.element.querySelectorAll('[data-cme-key]')].find(row=>row.dataset.cmeKey===key);
ui.pop=()=>ui.element.querySelector('[data-cme-popover]');ui.top=id=>ui.element.querySelector(`[data-cme-toolbar="${id}"]`).click();
ui.key=(el,key)=>el.dispatchEvent(new p.KeyboardEvent('keydown',{key,bubbles:true,cancelable:true}));
ui.change=(el,value)=>{if(el.type==='checkbox')el.checked=value;else el.value=String(value);el.dispatchEvent(new p.Event('change',{bubbles:true}));};
ui.rename=(key,value)=>{ui.row(key).querySelector('[data-action="label"]').click();const field=ui.row(key).querySelector('[data-action="name"]');field.value=value;ui.key(field,'Enter');};
ui.action=(key,action)=>{ui.row(key).querySelector('[data-action="more"]').click();const button=ui.pop().querySelector(`[data-action="${action}"]`);if(button.disabled)throw new Error('Restart setup action disabled: '+key+'/'+action);button.click();};
ui.move=(key,parent)=>{ui.action(key,'move');ui.change(ui.pop().querySelector('[data-action="move-to"]'),parent);};
ui.add=kind=>{const before=new Set([...ui.element.querySelectorAll('[data-cme-key]')].map(row=>row.dataset.cmeKey));ui.top('add');ui.pop().querySelector(`[data-cme-add="${kind}"]`).click();return [...ui.element.querySelectorAll('[data-cme-key]')].find(row=>!before.has(row.dataset.cmeKey))?.dataset.cmeKey;};
ui.option=(key,value)=>{ui.top('appearance');const control=ui.pop().querySelector(`[data-option="${key}"]`);control.closest('details')?.setAttribute('open','');ui.change(control,value);ui.key(ui.pop(),'Escape');};
ui.change(ui.element.querySelector('[data-cme-menu]'),rootId);
try{
 checks.startsWithFreshSettings=raw()==='';
 ui.rename('context_duplicateTab','Duplicate after restart');
 ui.row('context_duplicateTab').querySelector('[data-action="icon"]').click();ui.pop().querySelector('[data-icon-tab="symbol"]').click();
 const symbol=ui.pop().querySelector('[data-icon-text]');symbol.value='🦊';symbol.dispatchEvent(new p.Event('input',{bubbles:true}));ui.pop().querySelector('[data-icon-action="save"]').click();
 ui.row('context_reloadTab').querySelector('[data-action="icon"]').click();ui.pop().querySelector('[data-icon-tab="image"]').click();
 const svg='<svg xmlns="http://www.w3.org/2000/svg" width="80" height="20"><rect width="80" height="20" fill="#2c6bc1"/><circle cx="40" cy="10" r="8" fill="#ffc947"/></svg>';
 const files=new p.DataTransfer();files.items.add(new p.File([svg],'restart-icon.svg',{type:'image/svg+xml'}));const file=ui.pop().querySelector('[data-icon-file]');file.files=files.files;file.dispatchEvent(new p.Event('change',{bubbles:true}));
 await waitFor(()=>/Icon ready/.test(ui.element.querySelector('[data-cme-status]').textContent),'normalized restart PNG');ui.pop().querySelector('[data-icon-action="save"]').click();
 const group=ui.add('submenu');let name=ui.row(group).querySelector('[data-action="name"]');name.value='Restart tools';ui.key(name,'Enter');
 ui.move('context_duplicateTab',group);const separator=ui.add('separator');ui.move('context_reloadTab',group);ui.move('context_pinTab',group);
 ui.change(ui.row('context_pinTab').querySelector('[data-action="enabled"]'),false);ui.action('context_bookmarkTab','remove');
 ui.action('context_reloadTab','up');ui.action('context_reloadTab','up');ui.action(separator,'up');
 for(const [key,value]of [['iconPack','zen'],['iconSize',20],['iconAlignment','right'],['iconGap',12],['rowSpacing',4],['rounded',false],['hoverShade',false],['separatorOpacity',0.65],['monochromeExtensions',true]])ui.option(key,value);
 const saved=state(),records=saved.roots[rootId].records,order=[...records[group].children];
 checks.realUINameSaved=records.context_duplicateTab.name==='Duplicate after restart';
 checks.realUIUnicodeSaved=records.context_duplicateTab.icon?.kind==='text'&&records.context_duplicateTab.icon.text==='🦊';
 checks.realUINormalizedPNGSaved=records.context_reloadTab.icon?.kind==='image'&&records.context_reloadTab.icon.data.startsWith('data:image/png;base64,');
 checks.realUICustomSubmenuAndSeparator=records[group].kind==='submenu'&&records[group].name==='Restart tools'&&records[separator].kind==='separator'&&records[separator].owned===true;
 checks.realUIOrderSaved=order.join('|')===['context_reloadTab',separator,'context_duplicateTab','context_pinTab'].join('|');
 checks.realUIDisabledSaved=records.context_pinTab.hidden===true;
 checks.realUIRemovedSaved=records.context_bookmarkTab.removed===true&&!ui.row('context_bookmarkTab');
 checks.realUIAppearanceSaved=saved.options.iconSize===20&&saved.options.iconAlignment==='right'&&saved.options.iconGap===12&&saved.options.rowSpacing===4&&saved.options.rounded===false&&saved.options.hoverShade===false&&saved.options.separatorOpacity===0.65&&saved.options.iconPack==='zen'&&saved.options.monochromeExtensions===true;
 await openNative();const menu=root.querySelector('menu[label="Restart tools"]'),popup=menu?.querySelector('menupopup');
 if(!popup)throw new Error('Restart setup native custom submenu missing');menu.open=true;await waitFor(()=>popup.state==='open','restart setup submenu');
 checks.nativeSetupUsesOriginalNodes=popup.children[0]===w.document.getElementById('context_reloadTab')&&popup.children[2]===w.document.getElementById('context_duplicateTab');
 checks.nativeSetupHasDisabledAndRemoved=w.document.getElementById('context_pinTab').hidden&&w.document.getElementById('context_bookmarkTab').hidden;
 root.hidePopup();await pause(50);
 Services.prefs.savePrefFile(null);const filePath=Services.dirsvc.get('ProfD',Ci.nsIFile);filePath.append('prefs.js');
 const disk=await(await w.fetch(Services.io.newFileURI(filePath).spec)).text();
 const line=disk.split('\n').find(value=>value.startsWith('user_pref("'+pref+'",'));
 const diskRaw=line?JSON.parse(line.slice(('user_pref("'+pref+'",').length).trim().replace(/\);$/,'')):null;
 checks.flushedPreferenceMatchesSavedUI=diskRaw===raw();details.saved={rootId,group,separator,order,rawLength:raw().length,iconKinds:[records.context_duplicateTab.icon.kind,records.context_reloadTab.icon.kind],appearance:saved.options};
 return{checks,details,persistedRaw:raw(),inputEvidence:'First own headless process: real Sine controls save native-tab customizations and normalized PNG; explicit prefs.js flush/readback. Process exit and relaunch are verified by the bounded Python helper.'};
}catch(error){checks.completed=false;details.error=String(error);details.stack=error.stack;details.status=ui.element.querySelector('[data-cme-status]')?.textContent;return{checks,details};}
finally{root.hidePopup();}
