const done=arguments[arguments.length-1],checks=[];
(async()=>{
  const w=Services.wm.getMostRecentWindow('navigator:browser'),d=w.document;
  const pause=ms=>new Promise(r=>w.setTimeout(r,ms));
  const wait=async(fn,label)=>{for(let i=0;i<200;i++){if(fn())return;await pause(50);}throw Error('Timeout '+label);};
  const check=(name,ok,detail)=>{checks.push({name,passed:Boolean(ok),detail});if(!ok)throw Error(name+': '+JSON.stringify(detail));};
  await wait(()=>w.gZenWorkspaces?.activeWorkspaceIndicator&&d.getElementById('PanelUI-zen-emojis-picker')?.hasAttribute('zen-icons-enhanced'),'native startup');
  const root=PathUtils.join(PathUtils.profileDir,'zen-icon-packs','Probe');await IOUtils.makeDirectory(root,{ignoreExisting:true});
  const target=PathUtils.join(root,'sample.png');
  await IOUtils.copy(PathUtils.join(PathUtils.profileDir,'chrome','sine-mods','zen-icons-local','custom','Native Pack','Animals','fish.png'),target);
  const file=Cc['@mozilla.org/file/local;1'].createInstance(Ci.nsIFile);file.initWithPath(target);
  const source=Services.io.newFileURI(file).spec+'#zen-icon.svg';
  const diagnostic=[];
  for(const url of [source.split('#')[0],source]){
    const direct=new w.Image();direct.src=url;
    try{await direct.decode();diagnostic.push({kind:'direct',url,width:direct.naturalWidth});}catch(error){diagnostic.push({kind:'direct',url,error:String(error)});}
  }
  const tab=w.gBrowser.addTrustedTab('about:preferences');w.gBrowser.selectedTab=tab;
  await wait(()=>tab.linkedBrowser.currentURI.spec==='about:preferences'&&tab.iconImage.src,'test page favicon');
  tab.zenStaticIcon=source;await w.gBrowser.setIcon(tab,source);
  await pause(1000);
  try{await tab.iconImage.decode();diagnostic.push({kind:'tab',width:tab.iconImage.naturalWidth,src:tab.iconImage.src});}catch(error){diagnostic.push({kind:'tab',src:tab.iconImage.src,attr:tab.getAttribute('image'),error:String(error)});}
  diagnostic.push({setter:String(w.gBrowser.setIcon)});
  const tabWorks=tab.iconImage.naturalWidth===6&&tab.iconImage.src===source;
  const space=w.gZenWorkspaces.getWorkspaceFromId(w.gZenWorkspaces.activeWorkspace);space.icon=source;await w.gZenWorkspaces.saveWorkspace(space);await pause(100);
  const image=w.gZenWorkspaces.activeWorkspaceIndicator.querySelector('img');
  try{await image.decode();diagnostic.push({kind:'space',width:image.naturalWidth,src:image.src});}catch(error){diagnostic.push({kind:'space',error:String(error),markup:w.gZenWorkspaces.activeWorkspaceIndicator.innerHTML});}
  const spaceWorks=image.naturalWidth===6&&image.src===source;
  const folder=await w.gZenFolders.createFolder([tab],{renameFolder:false,label:'File URI',insertBefore:tab});
  w.gZenFolders.setFolderUserIcon(folder,source.split('#')[0]);await pause(100);
  const glyph=folder.querySelector(':scope > .tab-group-label-container > .tab-group-folder-icon svg .icon image');
  check('external file URI works in native folder icon',glyph.getAttribute('href')===source.split('#')[0]);
  check('external file URI works in native Space icon',spaceWorks,diagnostic);
  check('external file URI works in native tab icon',tabWorks,diagnostic);
  return {passed:true,checks};
})().then(done,error=>done({passed:false,checks,error:String(error),stack:error.stack}));
