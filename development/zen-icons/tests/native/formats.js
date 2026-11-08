const done=arguments[arguments.length-1],checks=[];
(async()=>{
  const w=Services.wm.getMostRecentWindow('navigator:browser'),d=w.document;
  const pause=ms=>new Promise(r=>w.setTimeout(r,ms));
  const wait=async(fn,label)=>{for(let i=0;i<200;i++){if(fn())return;await pause(50);}throw Error('Timeout '+label);};
  const check=(name,ok,detail)=>{checks.push({name,passed:Boolean(ok),detail});if(!ok)throw Error(name+': '+JSON.stringify(detail));};
  await wait(()=>d.getElementById('PanelUI-zen-emojis-picker')?.hasAttribute('zen-icons-enhanced'),'startup');
  const tab=w.gBrowser.addTrustedTab('about:blank');w.gBrowser.selectedTab=tab;
  w.gZenEmojiPicker.open(tab.iconImage,{emojiAsSVG:true,closeOnSelect:false,onSelect:icon=>{tab.zenStaticIcon=icon;w.gBrowser.setIcon(tab,icon);}}).catch(()=>{});
  await wait(()=>d.getElementById('zen-icons-sine-root'),'picker');
  const root=d.getElementById('zen-icons-sine-root'),search=root.querySelector('.zen-icons-search');
  search.value='formats';search.dispatchEvent(new w.Event('input',{bubbles:true}));await pause(400);
  const group=root.querySelector('[data-category="Formats"]');
  check('invalid category raster falls back to JSON emoji',group.querySelector('.zen-icons-category-icon').textContent==='🎨'&&!group.querySelector('.zen-icons-category-artwork'));
  check('corrupt image tile and category artwork leave no blank buttons',group.querySelectorAll('[data-icon-id]').length===6);
  for(const ext of ['png','jpg','jpeg','webp','avif','ico']){
    const button=[...group.querySelectorAll('[data-icon-id]')].find(n=>n.dataset.iconId.endsWith('.'+ext));
    check(ext+' appears in normal native picker',Boolean(button));
    const preview=button.querySelector('img');await preview.decode();
    check(ext+' preview decodes using Gecko',preview.naturalWidth===(ext==='ico'?32:60),{width:preview.naturalWidth,height:preview.naturalHeight});
    const b=button.getBoundingClientRect(),r=preview.getBoundingClientRect();
    check(ext+' rectangular preview fits inside square hit target',r.left>=b.left&&r.right<=b.right&&r.top>=b.top&&r.bottom<=b.bottom&&w.getComputedStyle(preview).objectFit==='contain');
    const expected=preview.src;
    button.click();await wait(()=>tab.iconImage.src===expected,ext+' selected source');
    check(ext+' choice replaces both saved and rendered tab source',tab.zenStaticIcon===expected&&tab.iconImage.src===expected,{expected,saved:tab.zenStaticIcon,rendered:tab.iconImage.src});
    await tab.iconImage.decode();
    check(ext+' selected tab image decodes without distortion',tab.iconImage.naturalWidth===(ext==='ico'?32:60)&&w.getComputedStyle(tab.iconImage).objectFit==='contain');
  }
  return {passed:true,checks};
})().then(done,error=>done({passed:false,checks,error:String(error),stack:error.stack}));
