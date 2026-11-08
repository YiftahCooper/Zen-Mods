const done=arguments[arguments.length-1],checks=[];
(async()=>{
  const w=Services.wm.getMostRecentWindow('navigator:browser');
  const pause=ms=>new Promise(r=>w.setTimeout(r,ms));
  const wait=async(fn,label)=>{for(let i=0;i<250;i++){if(fn())return;await pause(50);}throw Error('Timeout '+label);};
  const check=(name,ok,detail)=>{checks.push({name,passed:Boolean(ok),detail});if(!ok)throw Error(name+': '+JSON.stringify(detail));};
  await wait(()=>w.document.getElementById('PanelUI-zen-emojis-picker')?.hasAttribute('zen-icons-enhanced'),'initial Icons');
  const original=w.gBrowser.selectedTab,previous=original.zenStaticIcon;
  const privateWindow=w.OpenBrowserWindow({private:true});
  try{
    await wait(()=>privateWindow.document.getElementById('PanelUI-zen-emojis-picker')?.hasAttribute('zen-icons-enhanced'),'private Icons');
    const d=privateWindow.document;
    const {PrivateBrowsingUtils}=ChromeUtils.importESModule('resource://gre/modules/PrivateBrowsingUtils.sys.mjs');
    check('Icons activates in native private window',PrivateBrowsingUtils.isWindowPrivate(privateWindow));
    const tab=privateWindow.gBrowser.selectedTab;
    privateWindow.gZenEmojiPicker.open(tab.iconImage,{emojiAsSVG:true,closeOnSelect:false,onSelect:icon=>{tab.zenStaticIcon=icon;privateWindow.gBrowser.setIcon(tab,icon);}}).catch(()=>{});
    await wait(()=>d.getElementById('zen-icons-sine-root'),'private picker');
    const root=d.getElementById('zen-icons-sine-root'),search=root.querySelector('.zen-icons-search');
    search.value='dog';search.dispatchEvent(new privateWindow.Event('input',{bubbles:true}));await pause(100);
    root.querySelector('[data-icon-id="lucide:dog"]').click();await pause(60);
    check('native private tab selection works',String(tab.zenStaticIcon).includes('/dog.svg')&&tab.iconImage.src===tab.zenStaticIcon);
    check('private selection never changes normal-window tab',original.zenStaticIcon===previous);
    d.getElementById('PanelUI-zen-emojis-picker').hidePopup();
  }finally{privateWindow.close();}
  await pause(100);
  check('private-window close leaves normal Icons active',w.document.getElementById('PanelUI-zen-emojis-picker').hasAttribute('zen-icons-enhanced')&&original.zenStaticIcon===previous);
  return {passed:true,checks};
})().then(done,error=>done({passed:false,checks,error:String(error),stack:error.stack}));
