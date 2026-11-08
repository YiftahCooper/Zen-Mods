// Run only through native-sine-probe.py, which verifies the exact fresh profile.
// Clipboard safety is additionally checked below before ANY clipboard operation.
// Mozilla primary sources consulted for the headless clipboard boundary:
// https://raw.githubusercontent.com/mozilla-firefox/firefox/main/widget/windows/nsWidgetFactory.cpp
// https://raw.githubusercontent.com/mozilla-firefox/firefox/main/widget/headless/HeadlessClipboard.cpp
// https://raw.githubusercontent.com/mozilla-firefox/firefox/main/widget/headless/HeadlessClipboard.h
// https://raw.githubusercontent.com/mozilla-firefox/firefox/main/widget/GfxInfoBase.cpp
// These establish the memory boundary, not image-format support in this build.
// The Windows factory selects HeadlessClipboard when gfxPlatform::IsHeadless().
// Its per-instance mClipboards store synthetic text and image bytes in memory.
const {browser:w,Services,waitFor,pause,rect,sourceURI,nativeEvent}=ctx;
const checks={},details={stages:[],clipboard:{scope:'headless process-local Gecko clipboard; no Windows system clipboard access'},picker:{status:'not-automated',reason:'Headless Marionette controls browser DOM and Gecko commands. No native Windows dialog driver is available; neither FileList nor mozSetFileArray proves OS picker acceptance.'}};
details.browser={version:Services.appinfo.version,platformVersion:Services.appinfo.platformVersion,buildID:Services.appinfo.appBuildID,OS:Services.appinfo.OS};
const pref='extension.context-menu-editor.settings';
const pinnedURL='https://raw.githubusercontent.com/Starry-AXQG/Context-Menu-Icons/71750239d6fd114800989d91f2567cd4c47635e9/CMI/FluentUI/edit-copy.svg';
const fail=(name,error)=>{checks[name]=false;details[name]={...details[name],error:String(error),feedback:settings?.querySelector('[data-cme-status]')?.textContent,stack:error?.stack};};
const stage=async(name,work)=>{try{await work();details.stages.push(name);}catch(error){fail(name,error);}};
let p,card,settings,dialog;
async function openSettings(){
 w.gBrowser.selectedTab=w.gBrowser.addTab('about:preferences',{triggeringPrincipal:Services.scriptSecurityManager.getSystemPrincipal()});
 p=await waitFor(()=>{const page=w.gBrowser.selectedBrowser.contentWindow;return page?.document.querySelector('[mod-id="context-menu-editor"] [data-cme-settings]')?page:null;},'Sine icon settings');
 card=p.document.querySelector('[mod-id="context-menu-editor"]');dialog=card.querySelector('dialog');
 p.document.getElementById('category-sine-mods').activate();
 await waitFor(()=>rect(card).width>0&&p.getComputedStyle(card).visibility==='visible','rendered Sine card');
 card.querySelector('.sineItemConfigureButton').click();await waitFor(()=>dialog.open,'Configure dialog');
 settings=card.querySelector('[data-cme-settings]');
}
const raw=()=>Services.prefs.getStringPref(pref,'');
const saved=()=>JSON.parse(raw()).roots.contentAreaContextMenu.records['context-copy'].icon;
const row=()=>settings.querySelector('[data-cme-key="context-copy"]');
const select=name=>settings.querySelector(`[data-icon-tab="${name}"]`).click();
const iconAction=name=>settings.querySelector(`[data-icon-action="${name}"]`);
const status=()=>settings.querySelector('[data-cme-status]').textContent;
const openIcon=()=>row().querySelector('[data-action="icon"]').click();
const setSymbol=value=>{select('symbol');const field=settings.querySelector('[data-icon-text]');field.value=value;field.dispatchEvent(new p.Event('input',{bubbles:true}));};
const save=()=>iconAction('save').click();
const cancel=()=>iconAction('cancel').click();
const ready=async()=>{await waitFor(()=>/Icon ready|Use (?:an? |1)|Could not |Image took |Paste an |invalid/.test(status()),'icon input finished',12000);if(!/Icon ready/.test(status()))throw new Error('Import failed: '+status());};
async function imageInfo(data){
 const image=new p.Image();image.src=data;await image.decode();
 const canvas=p.document.createElement('canvas');canvas.width=canvas.height=32;
 const paint=canvas.getContext('2d');paint.drawImage(image,0,0);const pixels=paint.getImageData(0,0,32,32).data;
 const occupied=[];for(let y=0;y<32;y++)for(let x=0;x<32;x++)if(pixels[(y*32+x)*4+3])occupied.push([x,y]);
 return {width:image.naturalWidth,height:image.naturalHeight,png:data.startsWith('data:image/png;base64,'),opaquePixels:occupied.length,
  bounds:occupied.length?{left:Math.min(...occupied.map(v=>v[0])),right:Math.max(...occupied.map(v=>v[0])),top:Math.min(...occupied.map(v=>v[1])),bottom:Math.max(...occupied.map(v=>v[1]))}:null};
}
async function loadDiskFile(name){
 const uri=new w.URL('tests/native/icon-input-assets/'+name,sourceURI).href;
 const path=Services.io.newURI(uri).QueryInterface(Ci.nsIFileURL).file.path;
 const file=await p.File.createFromFileName(path);
 const input=settings.querySelector('[data-icon-file]');input.mozSetFileArray([file]);
 input.dispatchEvent(new p.Event('change',{bubbles:true}));
 return {name:file.name,size:file.size,type:file.type,route:'actual disk-backed File through privileged mozSetFileArray; change dispatched by test, no OS picker'};
}
await waitFor(()=>w.__contextMenuEditor?.controller,'Sine candidate');
await openSettings();
openIcon();setSymbol('🧪');save();
checks.baselineSaved=saved().kind==='text'&&saved().text==='🧪';

await stage('diskBackedSVG',async()=>{
 const before=raw();openIcon();select('image');details.diskFile=await loadDiskFile('wide-gradient.svg');await ready();
 checks.fileImportDraftDoesNotSave=raw()===before;save();
 details.diskImage=await imageInfo(saved().data);
 const i=details.diskImage;
 checks.diskFile32TransparentAspectFit=i.png&&i.width===32&&i.height===32&&i.bounds.left===0&&i.bounds.right===31&&i.bounds.top===12&&i.bounds.bottom===19;
});

await stage('invalidFiles',async()=>{
 details.invalidFiles=[];
 for(const [name,pattern] of [['unsafe-script.svg',/active|external/i],['oversized-dimensions.svg',/4096/],['not-an-image.txt',/image|format|supported/i]]){
  const before=raw();openIcon();select('image');const file=await loadDiskFile(name);
  await waitFor(()=>!/Loading icon/.test(status()),'invalid local file feedback');const feedback=status();save();
  const unchanged=raw()===before,editorStillOpen=!!settings.querySelector('[data-icon-editor]');
  details.invalidFiles.push({...file,feedback,unchanged,editorStillOpen});
  checks['invalidFile_'+name]=unchanged&&editorStillOpen&&pattern.test(feedback);cancel();
 }
});

await stage('validChoiceAfterInvalidImport',async()=>{
 details.recoveredInvalidImports=[];
 for(const choice of ['automatic','reset','built-in']){
  openIcon();setSymbol('🔬');save();const before=raw();openIcon();select('image');await loadDiskFile('unsafe-script.svg');
  await waitFor(()=>/active|external/.test(status()),'invalid import before valid '+choice);
  if(choice==='built-in'){select('built-in');settings.querySelector('[data-icon-asset]').click();}else iconAction(choice).click();
  const feedback=status(),unchanged=raw()===before;
  checks['validChoiceClearsImportError_'+choice]=/ready|suggested/i.test(feedback)&&!/active|external/.test(feedback)&&unchanged&&!!iconAction('save');
  save();const value=saved();checks['validChoiceSaves_'+choice]=choice==='built-in'?value?.kind==='asset':!value;
  details.recoveredInvalidImports.push({choice,feedback,unchangedBeforeSave:unchanged,savedKind:value?.kind||'automatic'});
 }
});

await stage('httpsImport',async()=>{
 const requests=[],violations=[];details.https={url:pinnedURL,requests,violations,pageCSP:p.document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content};
 const violation=event=>{if(event.blockedURI?.startsWith('https://raw.githubusercontent.com'))violations.push({blockedURI:event.blockedURI,effectiveDirective:event.effectiveDirective,violatedDirective:event.violatedDirective,originalPolicy:event.originalPolicy});};
 p.document.addEventListener('securitypolicyviolation',violation);
 const observer={observe(subject){
  try{const channel=subject.QueryInterface(Ci.nsIHttpChannel);if(channel.URI.spec===pinnedURL)requests.push({url:channel.URI.spec,status:channel.responseStatus,contentType:channel.contentType,contentLength:channel.contentLength,loadingPrincipal:channel.loadInfo.loadingPrincipal?.origin});}catch{}
 }};
 Services.obs.addObserver(observer,'http-on-examine-response');
 try{
  const before=raw();openIcon();select('image');settings.querySelector('[data-icon-url]').value=pinnedURL;iconAction('load').click();await ready();
  checks.httpsDraftDoesNotSave=raw()===before;save();
  details.https.image=await imageInfo(saved().data);details.https.productionRequests=[...requests];
  const i=details.https.image;
  checks.realHTTPSFetchAndDecode=requests.some(r=>r.status===200)&&i.png&&i.width===32&&i.height===32&&i.opaquePixels>0;
 }catch(error){
  details.https.productionRequests=[...requests];
  try{const response=await w.fetch(pinnedURL,{credentials:'omit',referrerPolicy:'no-referrer',redirect:'error',signal:w.AbortSignal.timeout(8000)});
   details.https.browserChromeFetch={ok:response.ok,status:response.status,url:response.url,bytes:(await response.arrayBuffer()).byteLength};
  }catch(diagnostic){details.https.browserChromeFetch={error:String(diagnostic)};}
  throw error;
 }finally{Services.obs.removeObserver(observer,'http-on-examine-response');p.document.removeEventListener('securitypolicyviolation',violation);}
});

await stage('invalidURLs',async()=>{
 details.invalidURLs=[];
 for(const value of ['http://example.invalid/image.png','https://user:password@example.invalid/image.png','not a link']){
  const before=raw();openIcon();select('image');settings.querySelector('[data-icon-url]').value=value;iconAction('load').click();
  await waitFor(()=>!/Loading icon/.test(status()),'invalid link feedback');const feedback=status();save();
  const unchanged=raw()===before;details.invalidURLs.push({kind:value.startsWith('http:')?'http':value.includes('@')?'credentials':'malformed',feedback,unchanged});
  checks['invalidURL_'+details.invalidURLs.at(-1).kind]=unchanged&&!!settings.querySelector('[data-icon-editor]')&&/HTTPS|credentials/.test(feedback);cancel();
 }
});

await stage('cancelPendingImport',async()=>{
 const before=raw();openIcon();select('image');settings.querySelector('[data-icon-url]').value=pinnedURL;iconAction('load').click();
 checks.pendingImportReported=/Loading icon/.test(status());save();checks.pendingSaveRefused=raw()===before&&/Wait for/.test(status());cancel();
 await pause(500);checks.cancelPendingDoesNotSave=raw()===before&&!settings.querySelector('[data-icon-editor]');
 openIcon();setSymbol('✅');save();await pause(500);checks.freshSaveAfterCancel=saved().kind==='text'&&saved().text==='✅';
});

await stage('isolatedClipboard',async()=>{
 // Refuse every clipboard API unless the exact C++ headless-mode getter agrees.
 // Headed/interactive runs must never read, snapshot, replace or clear clipboard.
 const headless=Cc['@mozilla.org/gfx/info;1'].getService(Ci.nsIGfxInfo).isHeadless;
 details.clipboard.isHeadless=headless;details.clipboard.envHeadless=Services.env.get('MOZ_HEADLESS');
 if(headless!==true||details.clipboard.envHeadless!=='1')throw new Error('Clipboard tests require verified headless mode; no clipboard API called.');
 checks.clipboardHeadlessGuard=true;
 const helper=Cc['@mozilla.org/widget/clipboardhelper;1'].getService(Ci.nsIClipboardHelper);
 await stage('clipboardButtonText',async()=>{
 helper.copyString('🧭');openIcon();select('image');iconAction('paste').click();await ready();save();
 checks.nativeClipboardPasteButtonText=saved().kind==='text'&&saved().text==='🧭';
 });
 await stage('clipboardNativeEvent',async()=>{
 helper.copyString('⭐');openIcon();select('image');
 const target=settings.querySelector('[data-icon-paste-target]'),events=[];
 target.addEventListener('paste',event=>events.push({trusted:event.isTrusted,types:[...event.clipboardData.types]}));target.focus();
 const accepted=p.document.execCommand('paste');details.clipboard.pasteCommand={accepted,events,activeElement:p.document.activeElement?.getAttribute('data-icon-paste-target')};
 await pause(200);
 if(!events.length){
  details.clipboard.pasteCommand.keyboardFallback=true;nativeEvent.sendSingleKey({key:'v',code:'KeyV',location:0,printable:true,ctrlKey:true},p);
 }
 await pause(200);details.clipboard.pasteCommand.targetEvents=events.length;
 checks.nativePasteTargetReceivesTrustedPaste=events.some(e=>e.trusted&&e.types.includes('text/plain'));
 if(events.length){await ready();save();checks.nativeBrowserPasteEventText=saved().text==='⭐';}else cancel();
 });
 await stage('clipboardURLField',async()=>{
 helper.copyString(pinnedURL);openIcon();select('image');const field=settings.querySelector('[data-icon-url]');
 const before=raw(),beforeStatus=status(),events=[],requests=[];field.value='';field.focus();
 field.addEventListener('paste',event=>{const item={trusted:event.isTrusted};events.push(item);p.queueMicrotask(()=>{item.defaultPrevented=event.defaultPrevented;});});
 const observer={observe(subject){try{const channel=subject.QueryInterface(Ci.nsIHttpChannel);if(channel.URI.spec===pinnedURL)requests.push(channel.URI.spec);}catch{}}};
 Services.obs.addObserver(observer,'http-on-modify-request');
 try{const command=p.document.execCommand('paste');await pause(500);
  details.clipboard.urlField={command,events,value:field.value,statusBefore:beforeStatus,statusAfter:status(),requestsBeforeLoad:requests.length};
  checks.nativeURLPastePopulatesField=events.some(e=>e.trusted&&!e.defaultPrevented)&&field.value===pinnedURL;
  checks.nativeURLPasteWaitsForLoad=requests.length===0&&raw()===before&&status()===beforeStatus;
  if(checks.nativeURLPastePopulatesField&&checks.nativeURLPasteWaitsForLoad){
   iconAction('load').click();await ready();details.clipboard.urlField.requestsAfterLoad=requests.length;
   checks.nativeURLPastedFieldLoadsOnCommand=requests.length>0&&raw()===before;
  }
 }finally{Services.obs.removeObserver(observer,'http-on-modify-request');if(iconAction('cancel'))cancel();}
 });
 await stage('clipboardSymbolField',async()=>{
 helper.copyString('🌟');openIcon();select('symbol');const field=settings.querySelector('[data-icon-text]'),events=[];
 field.value='';field.dispatchEvent(new p.Event('input',{bubbles:true}));field.focus();
 field.addEventListener('paste',event=>{const item={trusted:event.isTrusted};events.push(item);p.queueMicrotask(()=>{item.defaultPrevented=event.defaultPrevented;});});
 const before=raw(),command=p.document.execCommand('paste');await pause(500);
 details.clipboard.symbolField={command,events,value:field.value,feedback:status()};
 checks.nativeSymbolPastePopulatesField=events.some(e=>e.trusted&&!e.defaultPrevented)&&field.value==='🌟';
 checks.nativeSymbolPasteClearsValidationError=!/Use 1.8 short Unicode symbols/.test(status())&&raw()===before&&!!iconAction('save');
 save();checks.nativeSymbolPasteSaves=saved().kind==='text'&&saved().text==='🌟';
 });
 await stage('clipboardButtonImage',async()=>{
 const canvas=p.document.createElement('canvas');canvas.width=80;canvas.height=20;
 const paint=canvas.getContext('2d');paint.fillStyle='#15a87a';paint.fillRect(0,0,80,20);
 const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
 await p.navigator.clipboard.write([new p.ClipboardItem({'image/png':blob})]);
 const items=await p.navigator.clipboard.read();details.clipboard.imageTransfer={written:'image/png',readTypes:items.map(item=>[...item.types])};
 if(!items.some(item=>item.types.some(type=>type.startsWith('image/')))){
  details.clipboard.image={status:'unavailable-in-installed-headless-backend',route:'Actual Clipboard.write(image/png) completed; Clipboard.read returned no image flavor. Windows clipboard is untouched.'};
  helper.copyString(canvas.toDataURL('image/png'));openIcon();select('image');iconAction('paste').click();await ready();save();
  details.clipboard.encodedImageFallback={image:await imageInfo(saved().data),route:'Real headless clipboard text containing an owned PNG data URL, read by the actual Paste button; image/png clipboard flavor remains unavailable'};
  const i=details.clipboard.encodedImageFallback.image;checks.nativeClipboardPNGDataURLPaste=i.png&&i.width===32&&i.height===32&&i.bounds.top===12&&i.bounds.bottom===19;
  return;
 }
 openIcon();select('image');iconAction('paste').click();await ready();save();
 details.clipboard.image=await imageInfo(saved().data);
 const i=details.clipboard.image;
 checks.nativeClipboardPasteButtonImage=i.png&&i.width===32&&i.height===32&&i.bounds.top===12&&i.bounds.bottom===19;
 });
 await stage('clipboardInvalidText',async()=>{
 helper.copyString('123456789');const before=raw();openIcon();select('image');iconAction('paste').click();
 await waitFor(()=>/1.8/.test(status()),'invalid clipboard text feedback');save();
 checks.invalidNativePasteDoesNotSave=raw()===before&&!!settings.querySelector('[data-icon-editor]');if(iconAction('cancel'))cancel();
 });
 await stage('clipboardInvalidImage',async()=>{
 helper.copyString('data:image/png;base64,AAAA');const before=raw();openIcon();select('image');iconAction('paste').click();
 await waitFor(()=>/PNG|image|invalid/i.test(status())&&!/Icon ready|Loading icon/.test(status()),'invalid clipboard PNG feedback');
 const feedback=status();save();checks.invalidNativeImagePasteDoesNotSave=raw()===before&&!!settings.querySelector('[data-icon-editor]');
 details.clipboard.invalidImageFeedback=feedback;if(iconAction('cancel'))cancel();
 });
 await stage('nativePickerAvailability',async()=>{
  // Windows Gecko explicitly denies native file-picker Open in headless mode.
  // https://bugzilla.mozilla.org/show_bug.cgi?id=1864118
  // This only establishes the native barrier; no OS file selection is claimed.
  let operation='createInstance';
  try{const picker=Cc['@mozilla.org/filepicker;1'].createInstance(Ci.nsIFilePicker);operation='init';
   picker.init(w.browsingContext,'Disposable icon picker availability',Ci.nsIFilePicker.modeOpen);
   operation='open';
   picker.open({done(result){details.picker.callback=result;}});details.picker.status='open-returned';}
  catch(error){details.picker={status:'headless-native-picker-unavailable',operation,error:String(error),result:error.result,source:'https://bugzilla.mozilla.org/show_bug.cgi?id=1864118',acceptance:'OS file picker selection remains unverified'};}
 });
});

await stage('cancelReadyImportAndPersistence',async()=>{
 const before=raw();openIcon();select('image');await loadDiskFile('wide-gradient.svg');await ready();cancel();
 checks.cancelReadyImportDoesNotSave=raw()===before;
 openIcon();setSymbol('🦊');save();const expected=raw();
 const old=w.gBrowser.selectedTab;w.gBrowser.removeTab(old,{animate:false});await openSettings();
 checks.reopenedSettingsKeepsSavedValue=raw()===expected&&saved().text==='🦊';
 openIcon();checks.reopenedEditorReadsSavedValue=settings.querySelector('[data-icon-text]').value==='🦊';cancel();
 Services.prefs.savePrefFile(null);
 const profile=Services.dirsvc.get('ProfD',Ci.nsIFile);profile.append('prefs.js');
 const content=await (await w.fetch(Services.io.newFileURI(profile).spec)).text();
 const serialized=content.split('\n').find(line=>line.startsWith('user_pref("'+pref+'",'));
 const diskRaw=serialized?JSON.parse(serialized.slice(('user_pref("'+pref+'",').length).trim().replace(/\);$/,'')):null;
 checks.savedPreferenceWrittenToDisposableDisk=diskRaw===expected;
 details.persistence={scope:'new preferences page/store in the same process, plus prefs.js flush and readback; browser restart not claimed',savedSymbol:saved().text};
});
return {checks,details,inputEvidence:'Actual disposable Gecko/Sine controls with a real HTTPS fetch, disk-backed File reads, and real headless clipboard APIs and trusted browser-generated paste event. OS file picker, Windows system clipboard, physical keyboard paste and browser restart acceptance remain separate.'};
