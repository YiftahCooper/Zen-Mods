// Real built entry + real child selection actor + production controller/provider.
// Only dictionary HTTP is replaced with deterministic fixture JSON.
const {window:w,popup,pause,snapshot,nativeEvent}=ctx;
popup.destroy();
const manifestDir=Services.dirsvc.get('ProfD',Ci.nsIFile).clone();manifestDir.append('dw-chrome-fixture');
manifestDir.create(Ci.nsIFile.DIRECTORY_TYPE,0o700);
const sourceParent=new URL('../',sourceUri).href;
await IOUtils.writeUTF8(manifestDir.path+'\\chrome.manifest','content sine '+sourceParent+'\n');
Components.manager.addBootstrappedManifestLocation(manifestDir);
const originalFetch=w.fetch,requests=[],keys=[];
w.fetch=async(url,options)=>{requests.push({url:String(url),credentials:options?.credentials});return new w.Response(JSON.stringify([{word:'computer',meanings:[{partOfSpeech:'noun',definitions:[{definition:'A deterministic native integration fixture definition.'}]}],sourceUrls:['https://en.wiktionary.org/wiki/computer']}]),{status:200,headers:{'Content-Type':'application/json'}});};
Services.prefs.setStringPref('extension.define-word.english','free-en');
Services.prefs.setStringPref('extension.define-word.shortcut',JSON.stringify({code:'KeyD',ctrl:true,alt:true,shift:false,meta:false}));
const record=e=>{if(e.code==='KeyD')keys.push({type:e.type,code:e.code,trusted:e.isTrusted,ctrl:e.ctrlKey,alt:e.altKey,target:e.target.localName});};
w.addEventListener('keydown',record,true);
const report={scope:'Full built entry with real selection actor and trusted Gecko shortcut; content selection established using DOM Range; dictionary HTTP stubbed'};
try{
  Services.scriptloader.loadSubScript('resource://dw-test/define-word.uc.js',w,'UTF-8');
  await pause(100);
  if(!w.__defineWord)throw new Error('Built entry did not acquire its owner');
  const {ACTOR_NAME}=ChromeUtils.importESModule('chrome://sine/content/define-word/src/selection.sys.mjs?v=0.3.1');
  report.actorName=ACTOR_NAME;
  report.selection=await w.gBrowser.selectedBrowser.browsingContext.currentWindowGlobal.getActor(ACTOR_NAME).sendQuery('DefineWord:GetSelection');
  report.zoom=w.gBrowser.selectedBrowser.fullZoom;
  report.focusedContextId=Services.focus.focusedContentBrowsingContext?.id||null;
  report.cycles=[];
  for(let index=0;index<6;index++){
    nativeEvent.sendSingleKey({key:'d',printable:true,code:'KeyD',location:0,ctrlKey:true,altKey:true},w);
    await pause(250);
    const panel=w.document.getElementById('define-word-panel');
    if(!panel)throw new Error('No popup after real shortcut');
    const geometry=snapshot('shortcut-'+index),input=panel.querySelector('.dw-search input');
    report.cycles.push({index,geometry,query:input.value,focused:w.document.activeElement===input,text:panel.querySelector('[data-result]').textContent});
  }
  report.keys=keys;report.requests=requests;
  const anchor=report.selection.anchor,first=report.cycles[0],outer=first.geometry.outer;
  report.checks={actorCapturedWord:report.selection.rawText==='computer',
    actorAnchor:!!anchor&&anchor.width>0&&anchor.height>0,
    trustedShortcuts:keys.length===6&&keys.every(k=>k.trusted&&k.ctrl&&k.alt),
    allQueriesRetained:report.cycles.every(c=>c.query==='Computer'),
    popupFocused:report.cycles.every(c=>c.focused),
    sizesStable:report.cycles.every(c=>Math.abs(c.geometry.outer.width-outer.width)<=1&&Math.abs(c.geometry.outer.height-outer.height)<=1),
    actualAnchorClear:!!anchor&&(outer.bottom<=anchor.y||outer.top>=anchor.y+anchor.height),
    definitionsRendered:report.cycles.every(c=>c.text.includes('deterministic native integration fixture'))};
  return report;
}finally{
  w.removeEventListener('keydown',record,true);w.__defineWord?.unload();w.fetch=originalFetch;
  Components.manager.removeBootstrappedManifestLocation(manifestDir);
}
