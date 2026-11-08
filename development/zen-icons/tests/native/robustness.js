const done=arguments[arguments.length-1],checks=[];
(async()=>{
  const w=Services.wm.getMostRecentWindow('navigator:browser'),d=w.document;
  const pause=ms=>new Promise(r=>w.setTimeout(r,ms));
  const wait=async(fn,label)=>{for(let i=0;i<300;i++){if(fn())return;await pause(50);}throw Error('Timeout '+label);};
  const check=(name,ok,detail)=>{checks.push({name,passed:Boolean(ok),detail});if(!ok)throw Error(name+': '+JSON.stringify(detail));};
  await wait(()=>d.getElementById('PanelUI-zen-emojis-picker')?.hasAttribute('zen-icons-enhanced'),'startup');
  const panel=d.getElementById('PanelUI-zen-emojis-picker');
  const tab=w.gBrowser.addTrustedTab('about:blank');w.gBrowser.selectedTab=tab;
  let deliveries=0;
  const open=async()=>{
    w.gZenEmojiPicker.open(tab.iconImage,{emojiAsSVG:true,closeOnSelect:false,onSelect:icon=>{deliveries++;tab.zenStaticIcon=icon;w.gBrowser.setIcon(tab,icon);}}).catch(()=>{});
    await wait(()=>panel.state==='open'&&d.getElementById('zen-icons-sine-root'),'picker');
    return d.getElementById('zen-icons-sine-root');
  };
  const close=async()=>{panel.hidePopup();await wait(()=>!d.getElementById('zen-icons-sine-root'),'picker cleanup');await pause(15);};
  let maxOpenMs=0;
  for(let i=0;i<25;i++){
    const start=w.performance.now(),root=await open();maxOpenMs=Math.max(maxOpenMs,w.performance.now()-start);
    check('reopen '+i+' has one picker and one filter',d.querySelectorAll('#zen-icons-sine-root').length===1&&d.querySelectorAll('#zen-icons-sine-filter-panel').length===1);
    const s=root.querySelector('.zen-icons-search');s.value=i%2?'dog':'fish';s.dispatchEvent(new w.Event('input',{bubbles:true}));
    await close();
    check('close '+i+' leaves no filter or deferred tiles',!d.getElementById('zen-icons-sine-filter-panel')&&!d.getElementById('zen-icons-sine-root'));
  }
  check('repeated open does not deliver stray selections',deliveries===0,deliveries);
  check('warm native picker opens within two seconds',maxOpenMs<2000,{maxOpenMs});
  let root=await open();await pause(250);
  const search=()=>root.querySelector('.zen-icons-search');
  search().value='nativeaquacheck';search().dispatchEvent(new w.Event('input',{bubbles:true}));await pause(80);
  root.querySelector('[data-icon-id]').click();await pause(80);
  const selected=tab.zenStaticIcon;
  check('one choice delivers exactly one callback',deliveries===1,deliveries);
  check('real custom raster decodes in a tab',tab.iconImage.complete&&tab.iconImage.naturalWidth===6,{src:tab.iconImage.src,width:tab.iconImage.naturalWidth});
  await close();
  // Only files inside this invocation's fresh synthetic profile are changed.
  const custom=PathUtils.join(PathUtils.profileDir,'zen-icon-packs');
  const fish=PathUtils.join(custom,'Native Pack','Animals','fish.png'),bytes=await IOUtils.read(fish);
  await IOUtils.remove(fish);root=await open();await pause(250);
  check('deleted custom artwork uses visible native fallback',tab.iconImage.src.includes('/selectable/image.svg'),tab.iconImage.src);
  check('temporary fallback never overwrites saved choice',tab.zenStaticIcon===selected);
  search().value='nativeaquacheck';search().dispatchEvent(new w.Event('input',{bubbles:true}));await pause(80);
  check('deleted icon removed from search',root.querySelectorAll('[data-icon-id]').length===0);
  await close();await IOUtils.write(fish,bytes);root=await open();await pause(250);
  check('restored artwork automatically uses original choice',tab.iconImage.src===selected,tab.iconImage.src);
  await close();
  const metadata=PathUtils.join(custom,'Native Pack','icons.json'),original=await IOUtils.read(metadata);
  await IOUtils.writeUTF8(metadata,'{invalid json');root=await open();await pause(250);
  search().value='fish';search().dispatchEvent(new w.Event('input',{bubbles:true}));await pause(80);
  check('malformed optional JSON does not hide healthy custom files',Boolean([...root.querySelectorAll('[data-icon-id]')].find(n=>n.dataset.provider==='custom')));
  await close();await IOUtils.write(metadata,original);
  // New native windows use their own Sine instance and picker, sharing prefs only.
  const second=w.OpenBrowserWindow();
  try{
    await wait(()=>second.gBrowser&&second.document.getElementById('PanelUI-zen-emojis-picker')?.hasAttribute('zen-icons-enhanced'),'second-window Icons');
    check('Icons initializes in second native window',true);
    Services.prefs.setBoolPref('zen-icons.tab.use-space-colour',false);await pause(80);
    check('neutral default setting propagates to both windows',[w,second].every(win=>win.document.documentElement.hasAttribute('zen-icons-neutral-tab-default')));
    Services.prefs.setBoolPref('zen-icons.double-click-icons',true);await pause(80);
    check('gesture setting propagates to both windows',[w,second].every(win=>win.document.documentElement.hasAttribute('zen-icons-double-click-enabled')));
    const other=second.gBrowser.addTrustedTab('about:blank');second.gBrowser.selectedTab=other;
    let otherChoice=null;
    second.gZenEmojiPicker.open(other.iconImage,{emojiAsSVG:true,closeOnSelect:false,onSelect:v=>{otherChoice=v;}}).catch(()=>{});
    await wait(()=>second.document.getElementById('zen-icons-sine-root'),'second picker');
    const r=second.document.getElementById('zen-icons-sine-root'),s=r.querySelector('.zen-icons-search');s.value='dog';s.dispatchEvent(new second.Event('input',{bubbles:true}));await pause(80);
    r.querySelector('[data-icon-id="lucide:dog"]').click();await pause(50);
    check('second-window selection reaches only its callback',String(otherChoice).includes('/dog.svg')&&deliveries===1);
  } finally {second.close();}
  await pause(150);root=await open();
  check('closing another window does not destroy first-window runtime',root.isConnected&&panel.hasAttribute('zen-icons-enhanced'));
  await close();
  return {passed:true,checks};
})().then(done,error=>done({passed:false,checks,error:String(error),stack:error.stack}));
