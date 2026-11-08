// Reviewed isolated native fixture. Run with popup_probe.py --script this file.
const {window:w,popup,pause,snapshot,mouseDrag,setSavedSize,nativeEvent}=ctx;
const report={scope:'Isolated headless Gecko trusted mouse input; stalled HTTP transport is injected'};
const near=(a,b)=>Math.abs(a-b)<=2;
const boxSame=(a,b)=>['x','y','width','height'].every(key=>near(a[key],b[key]));
async function openAt(size={width:480,height:320},anchor={x:600,y:300,width:80,height:20}){
  popup.close();await pause(70);setSavedSize(size);popup.render(ctx.fixture);popup.show(anchor);await pause(120);
}
await openAt();
let before=snapshot('header-before');
const header=w.document.querySelector('#define-word-panel .dw-bar strong');
const drag=await mouseDrag(header,35,20),after=snapshot('header-after');
report.header={before,drag,after,
  trustedDown:drag.events.some(e=>e.type==='mousedown'&&e.trusted),
  stationaryDown:!!drag.afterDown&&boxSame(before.outer,drag.afterDown.outer),
  moved:near(after.outer.x-before.outer.x,35)&&near(after.outer.y-before.outer.y,20)};
report.edges=[];
for(const edge of ['n','s','e','w','ne','nw','se','sw']){
  await openAt();before=snapshot(edge+'-before');
  const dx=edge.includes('w')?-24:edge.includes('e')?24:0;
  const dy=edge.includes('n')?-18:edge.includes('s')?18:0;
  const input=await mouseDrag(w.document.querySelector(`[data-resize-edge="${edge}"]`),dx,dy);
  const after=snapshot(edge+'-after');
  report.edges.push({edge,before,input,after,
    trustedDown:input.events.some(e=>e.type==='mousedown'&&e.trusted&&e.edge===edge),
    stationaryDown:!!input.afterDown&&boxSame(before.outer,input.afterDown.outer),
    expectedDimensions:near(after.shell.width-before.shell.width,dx?24:0)&&near(after.shell.height-before.shell.height,dy?18:0),
    expectedPosition:near(after.outer.x-before.outer.x,edge.includes('w')?-24:0)&&near(after.outer.y-before.outer.y,edge.includes('n')?-18:0)});
}
await openAt();
const paragraph=w.document.querySelector('#define-word-panel [data-result] ol li p');
w.getSelection().removeAllRanges();
const selectionInput=await mouseDrag(paragraph,65,0);
const mouseSelection=w.getSelection().toString();
const range=w.document.createRange();range.selectNodeContents(paragraph);w.getSelection().removeAllRanges();w.getSelection().addRange(range);
report.selection={input:selectionInput,mouseSelection,domRangeSelection:w.getSelection().toString(),
  computedUserSelect:w.getComputedStyle(paragraph).userSelect,
  scope:mouseSelection?'Trusted Gecko mouse selection observed':'Only DOM Range selection and computed CSS verified; mouse selection not established'};
w.getSelection().removeAllRanges();
popup.setTextSize(13.5);await pause(70);
report.typography=Object.fromEntries(['.dw-shell','.dw-bar strong','.dw-bar select','.dw-search input','.dw-search button','h2','[data-result] ol li p','.dw-footer','.dw-footer button'].map(selector=>{
  const element=w.document.querySelector('#define-word-panel '+selector);return [selector,element?{fontSize:w.getComputedStyle(element).fontSize,lineHeight:w.getComputedStyle(element).lineHeight}:null];
}));
const largeAnchor={x:600,y:440,width:80,height:20};await openAt({width:700,height:800},largeAnchor);
const large=snapshot('large-saved-at-anchor');
report.anchor={anchor:largeAnchor,geometry:large,
  noOverlap:large.outer.bottom<=largeAnchor.y||large.outer.top>=largeAnchor.y+largeAnchor.height,
  onScreen:large.outer.left>=0&&large.outer.top>=0&&large.outer.right<=w.innerWidth&&large.outer.bottom<=w.innerHeight};
popup.close();await pause(70);
// DOM plus computed native CSS probe. Fake credentials only, no Login Manager.
Services.prefs.setBoolPref('layout.forms.reveal-password-button.enabled',true);
const {createSettingsControls}=ChromeUtils.importESModule('resource://dw-test/src/settings.mjs');
const section=w.document.createElementNS('http://www.w3.org/1999/xhtml','div');section.setAttribute('mod-id','define-word');
section.style.cssText='position:fixed;left:10px;top:10px;width:700px;height:850px;overflow:auto;z-index:100000;background:white;';w.document.documentElement.append(section);
const values=new Map();const prefs={getStringPref:(key,fallback)=>values.get(key)??fallback,getBoolPref:(_key,fallback)=>fallback,setStringPref:(key,value)=>values.set(key,value)};
const controls=createSettingsControls(w,{prefs,credentials:{get:async()=> 'synthetic-fixture-key',set:async()=>{},remove:async()=>{}},browserWindow:()=>w});
section.append(controls.element);await pause(150);
report.passwordFields=[...section.querySelectorAll('input[type=password]')].map(input=>({id:input.id,
  appearance:w.getComputedStyle(input).appearance,customEyeCount:input.parentElement.querySelectorAll('.dw-key-reveal').length,
  scope:'Native computed appearance and custom DOM button count; no visual pixel assertion'}));
const field=section.querySelector('input[type=password]'),button=field.parentElement.querySelector('.dw-key-reveal');
const r=button.getBoundingClientRect();await nativeEvent.synthesizeMouseAtPoint(r.x+r.width/2,r.y+r.height/2,{},w);await pause(70);
report.passwordToggle={typeAfterTrustedClick:field.type,ariaPressed:button.getAttribute('aria-pressed')};
controls.destroy();section.remove();
// Full production controller + lookup service + Free Dictionary provider. Only
// the transport is replaced with a promise that deliberately ignores abort.
popup.destroy();
const {createController}=ChromeUtils.importESModule('resource://dw-test/src/controller.mjs');
const {createLookupService}=ChromeUtils.importESModule('resource://dw-test/src/lookup.mjs');
const {providers}=ChromeUtils.importESModule('resource://dw-test/src/providers/registry.mjs');
const requests=[];const lookup=createLookupService({providers,fetch:(url,options)=>{requests.push({url,credentials:options.credentials});return new Promise(()=>{});},timers:w});
const selection={capture:async()=>({rawText:'computer',anchor:{x:600,y:300,width:80,height:20}}),isCurrent:()=>true,release:()=>{}};
const controller=createController(w,{providers,selection,lookup,settings:()=>({englishProvider:'free-en',hebrewProvider:'academy-he',textSize:13.5,showIcon:false})});
try{
  const started=Date.now();const pending=controller.define();await pause(150);
  const loading=w.document.querySelector('#define-word-panel [data-result]').textContent;
  await pending;
  report.timeout={elapsedMs:Date.now()-started,requests,loading,
    finalText:w.document.querySelector('#define-word-panel [data-result]').textContent,
    panelState:w.document.getElementById('define-word-panel').state,
    scope:'Production Free Dictionary provider/controller with injected stalled fetch and real 10-second timer; not live provider availability'};
}finally{controller.destroy();}
report.checks={header:report.header.trustedDown&&report.header.stationaryDown&&report.header.moved,
  allEightEdges:report.edges.every(e=>e.trustedDown&&e.stationaryDown&&e.expectedDimensions&&e.expectedPosition),
  anchor:report.anchor.noOverlap&&report.anchor.onScreen,
  textSelectable:report.selection.mouseSelection.length>0,
  font13_5:report.typography['.dw-shell']?.fontSize==='13.5px',
  passwordAppearance:report.passwordFields.length===3&&report.passwordFields.every(f=>f.appearance==='textfield'&&f.customEyeCount===1),
  passwordToggle:report.passwordToggle.typeAfterTrustedClick==='text'&&report.passwordToggle.ariaPressed==='true',
  freeApiTimeout:report.timeout.elapsedMs>=9900&&report.timeout.elapsedMs<12000&&report.timeout.finalText.includes('took too long')};
return report;
