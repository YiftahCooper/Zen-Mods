const done=arguments[arguments.length-1];
(async()=>{
 Services.io.getProtocolHandler('resource').QueryInterface(Ci.nsIResProtocolHandler).setSubstitution('bp-empty-restart',Services.io.newURI(Services.prefs.getStringPref('bp.test.source-root')));
 const api=ChromeUtils.importESModule('resource://bp-empty-restart/scripts/better-pins.uc.mjs');window.addUnloadListener??=(fn)=>window.addEventListener('unload',fn,{once:true});await api.bootstrap(window);
 const id=Services.prefs.getStringPref('bp.test.empty-expected'),folder=document.getElementById(id);
 return {results:[{name:'empty-folder-native-restart-retains-identity-and-lower-zone',pass:!!folder&&api.areaOf(folder)==='lower'&&folder.tabs.filter(t=>!t.hasAttribute('zen-empty-tab')).length===0,detail:{id,exists:!!folder,area:api.areaOf(folder)}}]};
})().then(done,e=>done({error:String(e),stack:e.stack}));
