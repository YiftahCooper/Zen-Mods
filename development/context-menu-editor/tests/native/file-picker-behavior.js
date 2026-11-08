// Requires tools/native-file-picker-test.py and a fresh headed-hidden profile.
// The external worker selects only the verified child process's Windows dialog.
const {browser:w,Services,waitFor,pause,rect,nativeEvent}=ctx;
const checks={},details={changes:[],console:[]},pref='extension.context-menu-editor.settings';
const headless=Cc['@mozilla.org/gfx/info;1'].getService(Ci.nsIGfxInfo).isHeadless;
if(headless)throw new Error('Actual Windows picker test requires headed-hidden Zen');
checks.headedNativeProcess=headless===false;
await waitFor(()=>w.__contextMenuEditor?.controller,'editor runtime');
w.gBrowser.selectedTab=w.gBrowser.addTab('about:preferences',{triggeringPrincipal:Services.scriptSecurityManager.getSystemPrincipal()});
const p=await waitFor(()=>{const page=w.gBrowser.selectedBrowser.contentWindow;return page?.document.querySelector('[mod-id="context-menu-editor"] [data-cme-settings]')&&page;},'Sine editor');
p.document.getElementById('category-sine-mods').activate();
const card=p.document.querySelector('[mod-id="context-menu-editor"]'),dialog=card.querySelector('dialog');
await waitFor(()=>rect(card).width>0&&p.getComputedStyle(card).visibility==='visible','active Sine card rendered');
card.querySelector('.sineItemConfigureButton').click();await waitFor(()=>dialog.open,'Configure open');await pause(400);
const settings=card.querySelector('[data-cme-settings]');
async function clickVisible(element){
 element.scrollIntoView({block:'nearest'});await pause(70);
 const r=rect(element),x=r.left+r.width/2,y=r.top+r.height/2;
 if(!r.width||!element.contains(p.document.elementFromPoint(x,y)))throw new Error('Setup control obscured: '+element.getAttribute('data-action'));
 await nativeEvent.synthesizeMouseAtPoint(x,y,{button:0},p);await pause(60);
}
await clickVisible(settings.querySelector('[data-cme-key="context-copy"] [data-action="icon"]'));
await waitFor(()=>settings.querySelector('[data-icon-editor]'),'visible icon editor');
await clickVisible(settings.querySelector('[data-icon-tab="image"]'));
const input=await waitFor(()=>{const field=settings.querySelector('[data-icon-file]');return rect(field)?.width>0&&field;},'visible file input'),before=Services.prefs.getStringPref(pref,'');
input.addEventListener('change',event=>details.changes.push({trusted:event.isTrusted,files:[...input.files].map(file=>({name:file.name,size:file.size,type:file.type}))}));
input.addEventListener('click',event=>{details.fileInputClick={trusted:event.isTrusted};});
const listener={observe(message){const text=String(message.message||message);if(/filepicker|nsIFilePicker|NS_ERROR_NOT_AVAILABLE/i.test(text)&&details.console.length<8)details.console.push(text);}};
Services.console.registerListener(listener);
try{
 input.scrollIntoView({block:'nearest'});await pause(70);
 const bounds=rect(input),x=bounds.left+bounds.width/2,y=bounds.top+bounds.height/2;
 details.fileInputBounds=bounds;details.pointerHit=input.contains(p.document.elementFromPoint(x,y));
 if(!details.pointerHit)throw new Error('File input obscured before native click');
 await nativeEvent.synthesizeMouseAtPoint(x,y,{button:0},p);
 checks.nativePointerClick=details.fileInputClick?.trusted===true;
 await waitFor(()=>details.changes.length,'actual Windows picker selection and change',45000);
 checks.nativePickerTrustedChange=details.changes.length===1&&details.changes[0].trusted===true;
 checks.selectedExpectedDiskFile=input.files.length===1&&input.files[0].name==='wide-gradient.svg'&&input.files[0].size>0;
 await waitFor(()=>/Icon ready|Could not|invalid|unsupported/.test(settings.querySelector('[data-cme-status]').textContent),'OS-selected SVG normalization',12000);
 details.importStatus=settings.querySelector('[data-cme-status]').textContent;
 checks.fileImportReady=/Icon ready/.test(details.importStatus);
 checks.importRemainsDraft=Services.prefs.getStringPref(pref,'')===before;
 const save=settings.querySelector('[data-icon-action="save"]'),saveBounds=rect(save);
 await nativeEvent.synthesizeMouseAtPoint(saveBounds.left+saveBounds.width/2,saveBounds.top+saveBounds.height/2,{button:0},p);await pause(100);
 const saved=JSON.parse(Services.prefs.getStringPref(pref)).roots.contentAreaContextMenu.records['context-copy'].icon;
 checks.nativeSelectedImportSaves=saved.kind==='image'&&saved.data.startsWith('data:image/png;base64,');
 const image=new p.Image();image.src=saved.data;await image.decode();
 const canvas=p.document.createElement('canvas');canvas.width=canvas.height=32;const paint=canvas.getContext('2d');paint.drawImage(image,0,0);
 const pixels=paint.getImageData(0,0,32,32).data;let occupied=0,transparent=0;
 for(let i=3;i<pixels.length;i+=4){if(pixels[i])occupied++;else transparent++;}
 details.savedImage={width:image.naturalWidth,height:image.naturalHeight,occupiedPixels:occupied,transparentPixels:transparent};
 checks.normalizedTransparent32PNG=image.naturalWidth===32&&image.naturalHeight===32&&occupied>0&&transparent>0;
}catch(error){checks.actualOSPickerRoute=false;details.error={message:String(error),stack:error.stack,status:settings.querySelector('[data-cme-status]')?.textContent};}
finally{Services.console.unregisterListener(listener);}
return{checks,details,inputEvidence:'Fresh headed-hidden Zen with trusted Gecko file-input click. The process-tree-scoped worker first attempts UIAutomation ValuePattern/InvokePattern; only an unsupported pattern permits exact owned HWND WM_SETTEXT/readback/WM_COMMAND IDOK fallback. Actual OS selection proof requires the combined worker, trusted browser change, import, and save checks. No FileList assignment, mozSetFileArray, clipboard, foreground activation, or global mouse/keyboard input.'};
