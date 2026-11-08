const done=arguments[arguments.length-1],checks=[];
(async()=>{
  const w=Services.wm.getMostRecentWindow('navigator:browser'),d=w.document;
  const pause=ms=>new Promise(r=>w.setTimeout(r,ms));
  const wait=async(fn,label)=>{for(let i=0;i<300;i++){if(await fn())return;await pause(50);}throw Error('Timeout '+label);};
  const check=(name,ok,detail)=>{checks.push({name,passed:Boolean(ok),detail});if(!ok)throw Error(name+': '+JSON.stringify(detail));};
  await wait(()=>d.getElementById('PanelUI-zen-emojis-picker')?.hasAttribute('zen-icons-enhanced'),'startup');
  const mod=PathUtils.join(PathUtils.profileDir,'chrome','sine-mods','zen-icons-local'),root=PathUtils.join(PathUtils.profileDir,'zen-icon-packs');
  const registryPath=PathUtils.join(PathUtils.profileDir,'chrome','sine-mods','mods.json');
  await wait(()=>IOUtils.exists(PathUtils.join(root,'.zen-icons-migrated-v1.json')),'migration');
  const data=await IOUtils.read(PathUtils.join(root,'Native Pack','Animals','fish.png'));
  const live=PathUtils.join(root,'Added Later','Travel');await IOUtils.makeDirectory(live,{ignoreExisting:true});
  await IOUtils.write(PathUtils.join(live,'after.png'),data);
  await IOUtils.writeJSON(PathUtils.join(root,'Added Later','icons.json'),{'Travel/after.png':{tags:['postinstallartcheck']}});
  const deleted=PathUtils.join(root,'Other Pack','animals','bird.png');await IOUtils.remove(deleted);
  await IOUtils.writeUTF8(PathUtils.join(mod,'obsolete-code-only.txt'),'must disappear');
  const tab=w.gBrowser.addTrustedTab('about:preferences');w.gBrowser.selectedTab=tab;await wait(()=>tab.iconImage.src,'native favicon');
  const source='chrome://zen-icons-custom/content/Added%20Later/Travel/after.png#zen-icon.svg';
  tab.zenStaticIcon=source;w.gBrowser.setIcon(tab,source);await tab.iconImage.decode();
  const folder=await w.gZenFolders.createFolder([tab],{renameFolder:false,label:'Stock Sine Icons Update',insertBefore:tab});
  const f=Cc['@mozilla.org/file/local;1'].createInstance(Ci.nsIFile);f.initWithPath(PathUtils.join(live,'after.png'));
  w.gZenFolders.setFolderUserIcon(folder,Services.io.newFileURI(f).spec);
  const space=w.gZenWorkspaces.getWorkspaceFromId(w.gZenWorkspaces.activeWorkspace);space.icon=source;await w.gZenWorkspaces.saveWorkspace(space);
  const manager=ChromeUtils.importESModule('chrome://userscripts/content/core/manager.sys.mjs').default;
  const api=ChromeUtils.importESModule('chrome://userscripts/content/utils/uc_api.sys.mjs').default;
  const original=api.unpackRemoteArchive,registry=await IOUtils.readJSON(registryPath),next=await IOUtils.readJSON(PathUtils.join(mod,'theme.json'));
  // Substitute only the downloaded bytes with an exact, deterministic local
  // monorepo ZIP. The complete stock unpacker/updater executes unchanged.
  const zip=await IOUtils.read(PathUtils.join(PathUtils.profileDir,'synthetic-repository.zip'));
  const binary=Array.from(zip,byte=>String.fromCharCode(byte)).join('');
  let requested=null;
  api.unpackRemoteArchive=function(options){requested=options.url;return original.call(this,{...options,url:'data:application/zip;base64,'+w.btoa(binary)});};
  try{
    await manager.removeUnloadListeners('zen-icons-local');
    await manager.syncModData('https://github.com/YiftahCooper/Zen-Mods/tree/main/zen-icons',registry,next,registry['zen-icons-local']);
  }finally{api.unpackRemoteArchive=original;}
  check('stock Sine requested expected public monorepo archive',requested==='https://codeload.github.com/YiftahCooper/Zen-Mods/zip/refs/heads/main',requested);
  check('stock updater replaced code instead of preserving the old code tree',!await IOUtils.exists(PathUtils.join(mod,'obsolete-code-only.txt'))&&!await IOUtils.exists(PathUtils.join(mod,'custom')));
  check('monorepo normalization left root metadata, manifest, scripts and settings',await IOUtils.exists(PathUtils.join(mod,'chrome.manifest'))&&await IOUtils.exists(PathUtils.join(mod,'ZenIcons.uc.js'))&&await IOUtils.exists(PathUtils.join(mod,'preferences.json')));
  check('added artwork and JSON tags survive stock Sine replacement',await IOUtils.exists(PathUtils.join(live,'after.png'))&&(await IOUtils.readJSON(PathUtils.join(root,'Added Later','icons.json')))['Travel/after.png'].tags[0]==='postinstallartcheck');
  check('deliberately deleted artwork stays deleted',!await IOUtils.exists(deleted));
  check('external migration marker survives update',await IOUtils.exists(PathUtils.join(root,'.zen-icons-migrated-v1.json')));
  await manager.rebuildMods();
  await wait(()=>d.getElementById('PanelUI-zen-emojis-picker')?.hasAttribute('zen-icons-enhanced'),'post-update activation');
  w.gZenEmojiPicker.open(tab.iconImage,{closeOnSelect:false,onSelect:()=>{}}).catch(()=>{});
  await wait(()=>d.getElementById('zen-icons-sine-root'),'picker');await pause(250);
  const search=d.querySelector('.zen-icons-search');search.value='postinstallartcheck';search.dispatchEvent(new w.Event('input',{bubbles:true}));await pause(100);
  check('post-update picker discovers external pack by JSON-only tag',d.querySelectorAll('#zen-icons-sine-root [data-icon-id]').length===1);
  const preview=d.querySelector('#zen-icons-sine-root [data-icon-id] img');await preview.decode();
  check('registered external chrome artwork really decodes after update',preview.naturalWidth===6);
  d.getElementById('PanelUI-zen-emojis-picker').hidePopup();
  check('native tab and Space selections remain external stable URIs',tab.zenStaticIcon===source&&space.icon===source);
  w.SessionStore.setCustomTabValue(tab,'zen-icons-update-marker','updated');
  Services.prefs.setStringPref('zen-icons.test.update-folder',folder.id);Services.prefs.setStringPref('zen-icons.test.update-space',space.uuid);Services.prefs.savePrefFile(null);
  const {TabStateFlusher}=ChromeUtils.importESModule('moz-src:///browser/components/sessionstore/TabStateFlusher.sys.mjs');await TabStateFlusher.flush(tab.linkedBrowser);
  const {SessionSaver}=ChromeUtils.importESModule('moz-src:///browser/components/sessionstore/SessionSaver.sys.mjs');await SessionSaver.run();
  return {passed:true,transport:'local exact-package ZIP; unchanged native syncModData/unpacker/rebuild',checks};
})().then(done,error=>done({passed:false,checks,error:String(error),stack:error.stack}));
