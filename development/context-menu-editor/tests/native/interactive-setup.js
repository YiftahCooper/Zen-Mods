const {browser:w,Services,waitFor,pause,rect}=ctx;
await waitFor(()=>w.__contextMenuEditor?.controller,'editor loaded through Sine');
if(!/^(file:|http:\/\/127\.0\.0\.1:\d+\/sample-page\.html$)/.test(w.gBrowser.selectedBrowser.currentURI.spec))throw new Error('The disposable sample page must be open');
if(w.__betterPinsController){
 await waitFor(()=>w.__betterPinsController.active,'disposable Better Pins ready');
 const tab=w.gBrowser.selectedTab,bounds=tab.getBoundingClientRect();await ctx.nativeEvent.synthesizeMouseAtPoint(bounds.x+bounds.width/2,bounds.y+bounds.height/2,{type:'contextmenu',button:2},w);
 await waitFor(()=>w.document.getElementById('tabContextMenu').state==='open','discovery of real tab-menu additions');await pause(150);w.document.getElementById('tabContextMenu').hidePopup();
}
w.gBrowser.selectedTab=w.gBrowser.addTab('about:preferences',{triggeringPrincipal:Services.scriptSecurityManager.getSystemPrincipal()});
const p=await waitFor(()=>{const page=w.gBrowser.selectedBrowser.contentWindow;return page?.document.getElementById('category-sine-mods')&&page.document.querySelector('[mod-id="context-menu-editor"] [data-cme-settings]')&&page;},'Sine registered the editor settings');
p.document.getElementById('category-sine-mods').activate();
const card=p.document.querySelector('[mod-id="context-menu-editor"]');card.querySelector('.sineItemConfigureButton').click();
await waitFor(()=>card.querySelector('dialog').open,'Configure open');
await pause(700);
if(w.document.documentElement.hasAttribute('zen-welcome-stage'))throw new Error('The fresh-profile welcome screen obscures the editor');
return{checks:{editorReady:!!w.__contextMenuEditor,defineWordReady:!!w.__defineWord,configureOpen:card.querySelector('dialog').open,
 browserVisible:rect(w.gBrowser.selectedBrowser).width>0&&rect(w.gBrowser.selectedBrowser).height>0},
 instructions:'Configure is open. Use the sample-page tab to test page and tab menus. This profile is disposable.'};
