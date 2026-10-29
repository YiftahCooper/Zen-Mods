const done=arguments[arguments.length-1];
(async()=>{
 const wait=ms=>new Promise(r=>setTimeout(r,ms));const assert=(v,m)=>{if(!v)throw Error(m);};
 const expected=JSON.parse(Services.prefs.getStringPref('bp.test.expected'));
 Services.io.getProtocolHandler('resource').QueryInterface(Ci.nsIResProtocolHandler).setSubstitution('bp-restart',Services.io.newURI(Services.prefs.getStringPref('bp.test.source-root')));
 const api=ChromeUtils.importESModule('resource://bp-restart/scripts/better-pins.uc.mjs');window.addUnloadListener??=(fn)=>window.addEventListener('unload',fn,{once:true});
 const boot=await api.bootstrap(window);assert(boot?.ok,'boot');await wait(200);const c=window.__betterPinsController;
 const tab=gZenWorkspaces.allStoredTabs.find(t=>t.id===expected.root),folder=document.getElementById(expected.folder);
 assert(tab&&folder,'native identities missing');
 const state=()=>JSON.parse(SessionStore.getTabState(tab));const url=()=>state().entries?.[state().index-1]?.url;
 assert(url()===expected.current,'startup changed current URL');assert(c.store.read(tab).explicit,'explicit pin missing');assert(api.areaOf(tab)==='lower','root placement changed');assert(api.areaOf(folder)==='lower','folder area missing');
 assert(c.adapters.getSavedBaseline(tab)?.entry?.url===expected.baseline,'saved baseline missing');
 assert((await c.policy.reset(tab)).ok,'reset failed');for(let i=0;i<100&&tab.linkedBrowser.currentURI.spec!==expected.baseline;i++)await wait(25);await gBrowser.TabStateFlusher.flush(tab.linkedBrowser);assert(url()===expected.baseline,'reset wrong URL');
 return {results:[{name:'restart-keeps-lower-root-current-baseline-and-folder-zone',pass:true}],boot};
})().then(done,e=>done({error:String(e),stack:e.stack}));
