const {browser:w,Services,waitFor,pause,rect}=ctx;
await waitFor(()=>w.__contextMenuEditor?.controller,'editor runtime');
w.gBrowser.selectedTab=w.gBrowser.addTab('about:preferences',{triggeringPrincipal:Services.scriptSecurityManager.getSystemPrincipal()});
const p=await waitFor(()=>{const page=w.gBrowser.selectedBrowser.contentWindow;return page?.document.querySelector('[mod-id="context-menu-editor"] [data-cme-settings]')&&page;},'Sine settings');
p.document.getElementById('category-sine-mods').activate();const card=p.document.querySelector('[mod-id="context-menu-editor"]'),dialog=card.querySelector('dialog');card.querySelector('.sineItemConfigureButton').click();await pause(500);
const settings=card.querySelector('[data-cme-settings]'),checks={},details={cases:[]};
const pop=()=>settings.querySelector('[data-cme-popover]');
const within=el=>{const b=rect(el);return b.width>0&&b.height>0&&b.left>=0&&b.top>=0&&b.right<=p.innerWidth+1&&b.bottom<=p.innerHeight+1;};
const key=(el,key)=>el.dispatchEvent(new p.KeyboardEvent('keydown',{key,bubbles:true,cancelable:true}));
const oldDir=p.document.documentElement.dir,settingsBrowser=w.gBrowser.selectedBrowser,oldZoom=w.ZoomManager.getZoomForBrowser(settingsBrowser);
const scalePref='layout.css.devPixelsPerPx',oldScale=Services.prefs.prefHasUserValue(scalePref)?Services.prefs.getStringPref(scalePref):null;
try{
 for(const scale of [1,1.25,2])for(const direction of ['ltr','rtl'])for(const zoom of [0.75,1,1.5,2]){
  Services.prefs.setStringPref(scalePref,String(scale));
  p.document.documentElement.dir=direction;w.ZoomManager.setZoomForBrowser(settingsBrowser,zoom);await pause(100);
  const record={scale,dpr:p.devicePixelRatio,direction,zoom,viewport:{width:p.innerWidth,height:p.innerHeight},dialog:rect(dialog),overflow:settings.scrollWidth-settings.clientWidth,panels:[]};
  if(record.overflow>1){const outer=rect(settings);record.overflowingElements=[...settings.querySelectorAll('*')].filter(el=>{const b=rect(el);return b.width>0&&(b.left<outer.left-1||b.right>outer.right+1);}).slice(0,15).map(el=>({tag:el.localName,class:el.className,action:el.dataset.action,toolbar:el.dataset.cmeToolbar,bounds:rect(el)}));}
  if(record.overflow>1)record.overflowingText=[...settings.querySelectorAll('*')].filter(el=>rect(el).height>0&&el.scrollWidth>el.clientWidth+1).slice(0,12).map(el=>({tag:el.localName,class:el.className,toolbar:el.dataset.cmeToolbar,width:el.clientWidth,scroll:el.scrollWidth,overflow:p.getComputedStyle(el).overflowX,text:el.textContent.slice(0,40)}));
  let good=within(dialog)&&settings.scrollWidth<=settings.clientWidth+1;
  for(const panel of ['add','appearance','options']){
   settings.querySelector(`[data-cme-toolbar="${panel}"]`).click();await pause(30);if(panel==='appearance'){pop().querySelector('details').open=true;await pause(30);}
   const b=rect(pop());good&&=within(pop())&&pop().scrollWidth<=pop().clientWidth+1;record.panels.push({panel,bounds:b,overflow:pop().scrollWidth-pop().clientWidth});key(pop(),'Escape');
  }
  const icon=settings.querySelector('[data-cme-key="context-copy"] [data-action="icon"]');icon.scrollIntoView({block:'center'});icon.click();
  for(const tab of ['built-in','image','symbol']){pop().querySelector(`[data-icon-tab="${tab}"]`).click();await pause(30);good&&=within(pop())&&pop().scrollWidth<=pop().clientWidth+1;record.panels.push({panel:`icon-${tab}`,bounds:rect(pop()),overflow:pop().scrollWidth-pop().clientWidth});}
  key(pop(),'Escape');checks[`scale${scale}_${direction}${Math.round(zoom*100)}PercentFits`]=good;details.cases.push(record);
 }
 return{checks,details,inputEvidence:'Real Gecko ZoomManager fullZoom at 75/100/150/200 percent, profile-only device-pixel scale1/1.25/2, and document ltr/rtl direction. Actual Sine dialog, three toolbar panels, all icon method panels, viewport containment and horizontal overflow. This covers layout direction, not translated operating-system UI or a global display-setting change.'};
}catch(error){checks.completed=false;details.error=String(error);details.stack=error.stack;return{checks,details};}
finally{p.document.documentElement.dir=oldDir;w.ZoomManager.setZoomForBrowser(settingsBrowser,oldZoom);if(oldScale===null)Services.prefs.clearUserPref(scalePref);else Services.prefs.setStringPref(scalePref,oldScale);}
