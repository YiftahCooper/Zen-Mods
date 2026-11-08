const {browser:w,waitFor,pause,rect}=ctx;
await waitFor(()=>w.__contextMenuEditor?.controller,'Sine loaded candidate browser script');
await waitFor(()=>w.SineAPI?.manager,'Sine browser interface');
const inventory=w.__contextMenuEditor.controller.getInventory();
const prefs=ctx.Services.prefs;
const prefName='extension.context-menu-editor.settings';
const rawBefore=prefs.getStringPref(prefName,'');
w.gBrowser.selectedTab=w.gBrowser.addTab('about:preferences',{
 triggeringPrincipal:ctx.Services.scriptSecurityManager.getSystemPrincipal()});
const p=await waitFor(()=>{
 const current=w.gBrowser.selectedBrowser.contentWindow;
 return current?.document.getElementById('category-sine-mods')&&current.document.querySelector('[mod-id="context-menu-editor"]')?current:null;
},'Sine registered its category and candidate card');
const card=p.document.querySelector('[mod-id="context-menu-editor"]');
// Sine registers after preferences handles its initial hash. Activate the
// installed moz-page-nav button only after registration, then wait for paint.
const category=p.document.getElementById('category-sine-mods');
if(typeof category.activate!=='function')throw new Error('Installed Sine category has no native activation API');
category.activate();
await waitFor(()=>{
 const bounds=rect(card);
 return p.document.getElementById('categories').currentView==='paneSineMods'&&bounds.width>0&&bounds.height>0&&p.getComputedStyle(card).visibility==='visible';
},'active Sine pane rendered its candidate card');
await waitFor(()=>card.querySelector('[data-cme-settings]'),'candidate mounted inside Sine dialog');
const dialog=card.querySelector('.sineItemPreferenceDialog');
card.querySelector('.sineItemConfigureButton').click();
await waitFor(()=>dialog.open,'Sine opened its configure dialog');
await pause(700);
const content=card.querySelector('.sineItemPreferenceDialogContent');
const settings=content.querySelector('[data-cme-settings]');
const rawAfter=prefs.getStringPref(prefName,'');
const dimensions={viewport:{width:p.innerWidth,height:p.innerHeight},card:rect(card),dialog:rect(dialog),content:rect(content),settings:rect(settings),
 scrollWidth:content.scrollWidth,clientWidth:content.clientWidth,
 computed:{width:p.getComputedStyle(dialog).width,minWidth:p.getComputedStyle(dialog).minWidth,maxWidth:p.getComputedStyle(dialog).maxWidth},
 tree:rect(settings.querySelector('[data-cme-tree]')),add:rect(settings.querySelector('[data-cme-toolbar="add"]')),
 fontSize:parseFloat(p.getComputedStyle(settings).fontSize)};
return{checks:{loadedThroughSine:!!w.SineAPI.manager&&!!w.__contextMenuEditor,
 candidateOwnsNativeRegistry:inventory.some(root=>root.id==='contentAreaContextMenu'&&root.items.length>30),
 sineConfigureDialog:dialog.open&&!!settings,
 settingsDidNotWriteOnOpen:rawBefore===rawAfter,
 compactDialog:dimensions.dialog.width<=720&&dimensions.dialog.width>400,
 noHorizontalOverflow:content.scrollWidth<=content.clientWidth+1,
 readableText:dimensions.fontSize>=14,
 editorControlsFit:dimensions.tree.top-dimensions.dialog.top<350&&dimensions.add.bottom<=dimensions.dialog.bottom-10},
 inventory:inventory.map(root=>({id:root.id,label:root.label,count:root.items.length})),
 compactRows:[...settings.querySelectorAll('.cme-row-main')].filter(el=>rect(el).height>0).slice(0,10).every(el=>rect(el).height<=40),
 dimensions,settingsLabels:[...settings.querySelectorAll('.cme-toolbar button')].map(el=>el.getAttribute('aria-label')),
 settingsRows:settings.querySelectorAll('[data-cme-key]').length,
 app:{version:ctx.Services.appinfo.version,buildID:ctx.Services.appinfo.appBuildID}};
