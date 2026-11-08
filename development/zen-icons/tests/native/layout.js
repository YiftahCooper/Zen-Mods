const done=arguments[arguments.length-1],checks=[];
(async()=>{
  const w=Services.wm.getMostRecentWindow('navigator:browser'),d=w.document;
  const pause=ms=>new Promise(r=>w.setTimeout(r,ms));
  const wait=async(fn,label)=>{for(let i=0;i<200;i++){if(fn())return;await pause(50);}throw Error('Timeout '+label);};
  const check=(name,ok,detail)=>{checks.push({name,passed:Boolean(ok),detail});if(!ok)throw Error(name+': '+JSON.stringify(detail));};
  await wait(()=>d.getElementById('PanelUI-zen-emojis-picker')?.hasAttribute('zen-icons-enhanced'),'startup');
  const scale=Services.prefs.getStringPref('layout.css.devPixelsPerPx','-1');
  check('requested profile-local UI scale is active',Number(scale)<0||Math.abs(w.devicePixelRatio-Number(scale))<.1,{requested:scale,actual:w.devicePixelRatio});
  const panel=d.getElementById('PanelUI-zen-emojis-picker'),toolbox=d.getElementById('navigator-toolbox');
  const tab=w.gBrowser.addTrustedTab('about:blank');w.gBrowser.selectedTab=tab;
  for(const direction of ['ltr','rtl']) for(const width of [200,250,500]){
    d.documentElement.style.direction=direction;
    for(const name of ['width','min-width','max-width'])toolbox.style.setProperty(name,width+'px','important');
    w.gZenEmojiPicker.open(tab.iconImage,{emojiAsSVG:true,closeOnSelect:false,onSelect(){}}).catch(()=>{});
    await wait(()=>panel.state==='open','picker');await pause(120);
    const root=d.getElementById('zen-icons-sine-root'),toolbar=root.querySelector('.zen-icons-toolbar'),filter=root.querySelector('.zen-icons-filter-button'),search=root.querySelector('.zen-icons-search');
    const r=root.getBoundingClientRect(),t=toolbar.getBoundingClientRect(),f=filter.getBoundingClientRect(),s=search.getBoundingClientRect();
    check(direction+' '+width+'px picker wraps within sidebar',r.width<=width&&r.width>=width-20&&root.scrollWidth<=root.clientWidth+1,{width:r.width,scroll:root.scrollWidth,client:root.clientWidth});
    check(direction+' '+width+'px search and Filter not clipped',t.top>=r.top&&t.bottom<=r.bottom&&f.left>=r.left&&f.right<=r.right&&s.width>50,{root:{x:r.x,y:r.y,width:r.width,height:r.height},toolbar:{y:t.y,height:t.height},filter:{x:f.x,width:f.width},searchWidth:s.width});
    const first=root.querySelector('[data-icon-id]'),icon=first?.querySelector('img,image');
    check(direction+' '+width+'px hit area includes icon',first&&(!icon||(()=>{const b=first.getBoundingClientRect(),i=icon.getBoundingClientRect();return i.left>=b.left-.1&&i.right<=b.right+.1&&i.top>=b.top-.1&&i.bottom<=b.bottom+.1;})()));
    filter.click();await wait(()=>d.getElementById('zen-icons-sine-filter-panel')?.state==='open','filter');
    const fp=d.getElementById('zen-icons-sine-filter-panel'),menu=fp.querySelector('.zen-icons-filter-menu');
    check(direction+' '+width+'px Filter content has no horizontal overflow',menu.scrollWidth<=menu.clientWidth+1,{scroll:menu.scrollWidth,client:menu.clientWidth});
    fp.hidePopup();panel.hidePopup();await pause(50);
  }
  return {passed:true,checks};
})().then(done,error=>done({passed:false,checks,error:String(error),stack:error.stack}));
