const done=arguments[arguments.length-1];
(async()=>{
 const results=[],wait=ms=>new Promise(r=>setTimeout(r,ms)),assert=(v,m)=>{if(!v)throw Error(m);};
 const test=async(name,fn)=>{try{results.push({name,pass:true,detail:await fn()});}catch(e){results.push({name,pass:false,error:String(e),stack:e.stack});}};
 Services.io.getProtocolHandler('resource').QueryInterface(Ci.nsIResProtocolHandler).setSubstitution('bp-spaces',Services.io.newURI(Services.prefs.getStringPref('bp.test.source-root')));
 const api=ChromeUtils.importESModule('resource://bp-spaces/scripts/better-pins.uc.mjs');window.addUnloadListener??=(fn)=>window.addEventListener('unload',fn,{once:true});assert((await api.bootstrap(window))?.ok,'bootstrap');
 const c=window.__betterPinsController,original=gZenWorkspaces.activeWorkspace;
 const a=await c.newTab('upper'),b=await c.newTab('lower');
 const folder=gZenFolders.createFolder([b],{label:'Space folder'});await c.origins.flush();await c.zones.move(folder,'lower');
 let next;
 await test('new-space-gets-divider-upper-button-and-live-banner-toggle',async()=>{
  next=await gZenWorkspaces.createAndSaveWorkspace('Synthetic second Space');await wait(150);
  const space=gZenWorkspaces.workspaceElement(next.uuid);assert(space&&c.zones.dividers.has(space)&&c.controls.buttons.has(space),'new Space controls missing');
  Services.prefs.setBoolPref('better-pins.banner-collapse',false);space.collapsiblePins.collapsed=false;space.collapsiblePins.toggle();assert(!space.collapsiblePins.collapsed,'new Space banner ignored setting');Services.prefs.setBoolPref('better-pins.banner-collapse',true);
  c.controls.buttons.get(space).click();await c.origins.flush();await wait(100);assert(c.zones.space(gBrowser.selectedTab)===space&&api.areaOf(gBrowser.selectedTab)==='upper','new Space button wrong destination');
 });
 await test('native-cross-space-root-and-folder-moves-retain-url-choices-and-membership',async()=>{
  assert(next,'second Space not created');const space=gZenWorkspaces.workspaceElement(next.uuid);
  await c.policy.pin(a);await c.policy.pin(b);const raw=[a,b].map(t=>SessionStore.getCustomTabValue(t,api.FOLDER_PIN_INTENT_KEY)),saved=[a,b].map(t=>JSON.stringify(c.adapters.getSavedBaseline(t)));
  gZenWorkspaces.moveTabToWorkspace(a,next.uuid);gZenFolders.changeFolderToSpace(folder,next.uuid);await wait(150);await c.origins.flush();
  assert(c.zones.space(a)===space&&c.zones.space(folder)===space,'native Space transfer failed');
  for(const [i,t]of [a,b].entries()){assert(gZenWorkspaces.allStoredTabs.includes(t),'collector lost moved tab');assert(SessionStore.getCustomTabValue(t,api.FOLDER_PIN_INTENT_KEY)===raw[i]&&JSON.stringify(c.adapters.getSavedBaseline(t))===saved[i],'Space move changed URL state');}
  assert((await c.zones.move(folder,'lower')).ok,'zone command after Space transfer failed');assert(api.areaOf(b)==='lower','moved folder child wrong zone');
 });
 await test('native-split-group-remains-whole-through-both-zone-moves',async()=>{
  const x=await c.newTab('lower'),y=await c.newTab('lower');gZenViewSplitter.splitTabs([x,y],'grid',0,{activate:false});await c.origins.flush();
  const group=x.group;assert(group?.hasAttribute('split-view-group')&&y.group===group,'native split fixture failed');
  for(const zone of ['upper','lower']){const r=await c.zones.move(x,zone);assert(r.ok,'split move refused '+JSON.stringify(r));assert(x.group===group&&y.group===group&&api.areaOf(x)===zone&&api.areaOf(y)===zone,'split group broken');assert([x,y].every(t=>gZenWorkspaces.allStoredTabs.includes(t)),'split collector lost member');}
 });
 return {results};
})().then(done,e=>done({error:String(e),stack:e.stack}));
