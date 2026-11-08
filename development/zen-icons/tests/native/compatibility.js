const done=arguments[arguments.length-1],checks=[];
(async()=>{
  const w=Services.wm.getMostRecentWindow('navigator:browser'),d=w.document;
  const pause=ms=>new Promise(r=>w.setTimeout(r,ms));
  const wait=async(fn,label)=>{for(let i=0;i<250;i++){if(fn())return;await pause(50);}throw Error('Timeout '+label);};
  const check=(name,ok,detail)=>{checks.push({name,passed:Boolean(ok),detail});if(!ok)throw Error(name+': '+JSON.stringify(detail));};
  await wait(()=>w.__betterZenFoldersFolderPins?.policy?.active&&d.getElementById('PanelUI-zen-emojis-picker')?.hasAttribute('zen-icons-enhanced'),'both mods');
  const controller=w.__betterZenFoldersController,pins=w.__betterZenFoldersFolderPins;
  const tab=w.gBrowser.addTrustedTab('https://icons.invalid/synthetic');w.gBrowser.selectedTab=tab;
  await wait(()=>tab.linkedBrowser.currentURI.spec.includes('icons.invalid'),'synthetic URL');
  const folder=await w.gZenFolders.createFolder([tab],{renameFolder:false,label:'Compatibility',insertBefore:tab});await pause(120);await pins.origins.flush();
  Services.prefs.setBoolPref('zen-icons.double-click-icons',true);
  const pinned=await pins.policy.pin(tab);check('native fixture explicitly URL-pinned',pinned.ok,{result:pinned,intent:pins.store.read(tab),uri:tab.linkedBrowser.currentURI.spec});
  const sticky=controller.adapters.managers.find(m=>m.constructor.name==='StickyFolderVisibilityManager');
  check('BZF Sticky owner available',Boolean(sticky));sticky.setSticky(tab,true);w.__iconsTestSticky=sticky;
  tab.setAttribute('data-icons-control-tab','true');
  await wait(()=>tab.querySelector('.better-zen-folders-url-pin')&&tab.querySelector('.better-zen-folders-sticky-underline'),'control targets');
  // Native folder icon selection; BZF then snapshots this same live SVG in its menu.
  w.gZenFolders.changeFolderUserIcon(folder);await wait(()=>d.getElementById('zen-icons-sine-root'),'folder picker');
  const root=d.getElementById('zen-icons-sine-root'),search=root.querySelector('.zen-icons-search');search.value='dog';search.dispatchEvent(new w.Event('input',{bubbles:true}));await pause(80);
  root.querySelector('[data-icon-id="lucide:dog"]').click();d.getElementById('PanelUI-zen-emojis-picker').hidePopup();await pause(80);
  const colors=controller.adapters.managers.find(m=>m.constructor.name==='FolderColorManager');colors.setColor(folder,'#ff8000');await pause(80);
  check('Icons exposes canonical selected source to BZF',folder.getAttribute('data-zen-icons-icon-source')?.endsWith('/dog.svg'));
  const outside=w.gBrowser.addTrustedTab('about:blank');
  w.gBrowser.selectedTab=outside;
  w.TabContextMenu.contextTab=outside;
  const menu=d.getElementById('context_zenMoveToFolder'),popup=menu.querySelector('menupopup');
  const context=d.getElementById('tabContextMenu');
  for(const outlined of [true,false]){
    w.gZenFolders.changeFolderUserIcon(folder);await wait(()=>d.getElementById('zen-icons-sine-root'),'outline picker');
    const shape=d.querySelector('.zen-icons-folder-shape input');shape.checked=outlined;shape.dispatchEvent(new w.Event('change',{bubbles:true}));
    d.getElementById('PanelUI-zen-emojis-picker').hidePopup();await pause(100);
    w.gBrowser.selectedTab=outside;context.openPopup(outside,'after_start',0,0,true,false);
    await wait(()=>context.state==='open','native tab context menu');w.TabContextMenu.contextTab=outside;
    menu.openMenu(true);await wait(()=>popup.state==='open','Move to Folder popup');await pause(100);
    const item=[...menu.querySelectorAll('.context-zen-move-to-folder-item')].find(n=>n._group===folder);
    check((outlined?'outlined':'outline-free')+' custom icon appears in native Move to Folder item',Boolean(item?.querySelector('svg')),{item:item?.outerHTML.slice(0,500),folder:folder.id,contextGroup:w.TabContextMenu.contextTab?.group?.id,contents:[...menu.querySelectorAll('menuitem')].map(n=>({label:n.getAttribute('label'),group:n._group?.id,class:n.className}))});
    const live=folder.querySelector(':scope > .tab-group-label-container > .tab-group-folder-icon svg'),copy=item.querySelector('svg');
    check((outlined?'outlined':'outline-free')+' sidebar shape matches requested UI setting',outlined?!folder.hasAttribute('zen-icons-enlarge-inner-icon'):folder.hasAttribute('zen-icons-enlarge-inner-icon'));
    const copied=copy.querySelector('.icon image')?.getAttribute('href')||'';
    const nativeSource=live.querySelector('.icon image')?.getAttribute('href');
    // BZF intentionally freezes context paint into a data URI in native menus.
    // Compare SVG geometry, rather than requiring its rendered URI to stay raw.
    const originalSvg=new w.DOMParser().parseFromString(await (await w.fetch(nativeSource)).text(),'image/svg+xml');
    const copiedSvg=copied.startsWith('data:image/svg+xml,')?new w.DOMParser().parseFromString(decodeURIComponent(copied.split(',').slice(1).join(',')),'image/svg+xml'):null;
    const geometry=svg=>[...(svg?.querySelectorAll('path,circle,ellipse,line,polyline,polygon,rect')||[])].map(n=>n.outerHTML.replace(/\s(?:fill|stroke)(?:-opacity)?="[^"]*"/g,''));
    check((outlined?'outlined':'outline-free')+' menu snapshot keeps chosen dog geometry',copied===nativeSource||(geometry(originalSvg).length>0&&JSON.stringify(geometry(copiedSvg))===JSON.stringify(geometry(originalSvg))));
    const source=w.getComputedStyle(live.querySelector('.front')),snapshot=w.getComputedStyle(copy.querySelector('.front'));
    check((outlined?'outlined':'outline-free')+' actual sidebar front opacity matches setting',Number(source.opacity)===(outlined?1:0),{opacity:source.opacity});
    await wait(()=>Math.abs(Number(source.opacity)-Number(snapshot.opacity))<.001,'native snapshot transition');
    check((outlined?'outlined':'outline-free')+' menu preserves outline visibility and colour',source.opacity===snapshot.opacity&&source.stroke===snapshot.stroke&&source.fill===snapshot.fill,{source:{opacity:source.opacity,fill:source.fill,stroke:source.stroke},copy:{opacity:snapshot.opacity,fill:snapshot.fill,stroke:snapshot.stroke}});
    popup.hidePopup();context.hidePopup();await pause(50);
  }
  w.gBrowser.selectedTab=tab;
  return {passed:true,checks};
})().then(done,error=>done({passed:false,checks,error:String(error),stack:error.stack}));
