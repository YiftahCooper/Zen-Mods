const {window:w,Services,pause}=ctx;
ctx.popup.destroy();
const {createController}=ChromeUtils.importESModule('resource://dw-test/src/controller.mjs');
const {createLookupService}=ChromeUtils.importESModule('resource://dw-test/src/lookup.mjs');
const {freeDictionary}=ChromeUtils.importESModule('resource://dw-test/src/providers/free-dictionary.mjs');
const {createSettingsControls}=ChromeUtils.importESModule('resource://dw-test/src/settings.mjs');
const providers=new Map([[freeDictionary.id,freeDictionary]]);
const lookup=createLookupService({providers,fetch:w.fetch.bind(w),timers:w});
const selection={capture:async()=>({rawText:'computer',anchor:{x:600,y:250,width:60,height:20}}),isCurrent:()=>true,release(){}};
const settings=()=>({englishProvider:'free-en',hebrewProvider:'academy-he',textSize:14,showIcon:false});
const controller=createController(w,{providers,lookup,selection,settings});
const start=Date.now();
try{
  const pending=controller.define();await pause(100);
  const loading=w.document.querySelector('[data-result]').textContent;
  await pending;
  const elapsed=Date.now()-start,result=w.document.querySelector('[data-result]').textContent;
  const terminal=!result.includes('Looking up');
  controller.destroy();
  // All preference writes are in the verified disposable profile. No real keys.
  Services.prefs.setBoolPref('layout.forms.reveal-password-button.enabled',true);
  const holder=w.document.createElementNS('http://www.w3.org/1999/xhtml','div');holder.setAttribute('mod-id','define-word');
  w.document.documentElement.append(holder);
  const controls=createSettingsControls(w,{prefs:Services.prefs,credentials:{get:async()=> 'synthetic-probe-key',set:async()=>{},remove:async()=>{}}});
  holder.append(controls.element);await pause(100);
  const inputs=[...holder.querySelectorAll('.dw-key-field input')];
  const fields=inputs.map(input=>({masked:input.type==='password',populated:input.value==='synthetic-probe-key',appearance:w.getComputedStyle(input).appearance,revealControls:input.parentElement.querySelectorAll('button').length}));
  const size=holder.querySelector('#dw-text-size');size.value='17.5';size.dispatchEvent(new w.Event('change',{bubbles:true}));
  const textSize=Services.prefs.getStringPref('extension.define-word.text-size');
  controls.destroy();holder.remove();
  return {loading,result,elapsed,terminal,fields,textSize,pass:terminal&&elapsed<13000&&fields.length===3&&fields.every(f=>f.masked&&f.populated&&f.appearance==='textfield'&&f.revealControls===1)&&textSize==='17.5'};
}finally{controller.destroy();}
