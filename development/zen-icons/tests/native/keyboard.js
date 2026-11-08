const done=arguments[arguments.length-1];
(async()=>{
  const w=Services.wm.getMostRecentWindow('navigator:browser'),d=w.document;
  const pause=ms=>new Promise(r=>w.setTimeout(r,ms));
  const wait=async fn=>{for(let i=0;i<200;i++){if(fn())return;await pause(50);}throw Error('Keyboard setup timeout');};
  await wait(()=>d.getElementById('PanelUI-zen-emojis-picker')?.hasAttribute('zen-icons-enhanced'));
  const tab=w.gBrowser.addTab('about:blank',{triggeringPrincipal:Services.scriptSecurityManager.getSystemPrincipal()});
  w.gBrowser.selectedTab=tab;
  w.gZenEmojiPicker.open(tab.iconImage,{emojiAsSVG:true,closeOnSelect:false,onSelect:v=>{w.__iconsKeyboardChoice=v;}}).catch(()=>{});
  await wait(()=>d.getElementById('PanelUI-zen-emojis-picker').state==='open');
  await pause(150);
  return {passed:true,checks:[{name:'native keyboard fixture opened',passed:true}]};
})().then(done,e=>done({passed:false,error:String(e),stack:e.stack}));
