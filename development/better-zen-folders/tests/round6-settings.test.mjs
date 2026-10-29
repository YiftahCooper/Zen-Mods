import test, {before,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const modulePath=process.env.BZF_PLAYWRIGHT_MODULE;
const skip=modulePath?false:'set BZF_PLAYWRIGHT_MODULE';
const source=await readFile(new URL('../scripts/better-zen-folders.uc.mjs',import.meta.url),'utf8');
const schema=JSON.parse(await readFile(new URL('../preferences.json',import.meta.url),'utf8'));
// Replay the installed, unmodified Sine conversion and save functions. The
// former fake input listener did not exercise Sine's numeric type conversion.
const sine=await readFile(new URL('../fixtures/sine/preferences.sys.mjs',import.meta.url),'utf8');
const context=sine.slice(sine.indexOf('const buildPrefContext ='),sine.indexOf('const applySeparator ='));
const apply=sine.slice(sine.indexOf('const applyString ='),sine.indexOf('const applyDropdown ='));
const sineCss=await readFile(new URL('../fixtures/sine/settings.css',import.meta.url),'utf8');
let browser;
before(async()=>{if(modulePath)browser=await createRequire(import.meta.url)(modulePath).chromium.launch({headless:true});});
after(async()=>{await browser?.close();});

test('Sine commits seconds and CSS sizes without changing their storage type; live readers see the change',{skip},async()=>{
 const page=await browser.newPage();try{
  const result=await page.evaluate(async({source,schema,context,apply})=>{
   const api=await import(URL.createObjectURL(new Blob([source],{type:'text/javascript'})));
   const stored=new Map(),observers=new Set(),types={string:32,number:64,boolean:128};
   const set=(key,value)=>{stored.set(key,value);for(const observer of observers)observer.observe(null,'nsPref:changed',key);};
   const get=(key,kind)=>{if(typeof stored.get(key)!==kind)throw Error('Wrong pref type');return stored.get(key);};
   const prefs={PREF_INVALID:0,PREF_STRING:32,PREF_INT:64,PREF_BOOL:128,
    getPrefType:k=>stored.has(k)?types[typeof stored.get(k)]:0,prefHasUserValue:k=>stored.has(k),
    getStringPref:k=>get(k,'string'),getIntPref:k=>get(k,'number'),getBoolPref:k=>get(k,'boolean'),
    setStringPref:set,setIntPref:set,setBoolPref:set,clearUserPref:k=>stored.delete(k),
    addObserver:(_,o)=>observers.add(o),removeObserver:(_,o)=>observers.delete(o)};
   const host={Services:{prefs},console};
   const live=new api.BetterZenFoldersPreferences(api.createBrowserPreferenceAdapters(host));live.start();
   const ui=new api.BetterZenFoldersPreferences(api.createBrowserPreferenceAdapters(host));ui.start();
   const events=[];for(const name of ['urlUnpinGraceSeconds','stickyRemovalDelaySeconds'])live.subscribe(name,v=>events.push([name,v]));
   const ucAPI={prefs:{get:k=>stored.get(k),set},showToast(){}};
   const Services={prefs};
   const domUtils={appendXUL(row){const input=document.createElement('input');row.appendChild(input);return input;}};
   const mount=new Function('Services','ucAPI','domUtils',context+apply+'return pref=>{const row=document.createElement("div");row.id=pref.property.replaceAll(".","-");document.body.appendChild(row);applyString(pref,row,buildPrefContext(pref),{rebuildMods(){}});return row.querySelector("input");};')(Services,ucAPI,domUtils);
   const names=['urlUnpinGraceSeconds','stickyRemovalDelaySeconds','folderNameSize','menuIconSizePercent'];
   const inputs=names.map(name=>mount(schema.find(p=>p.property===api.PREFERENCE_DEFINITIONS[name].property)));
   const release=api.installNumericSettingsUi(window,ui);
   for(let i=0;i<inputs.length;i++){inputs[i].value=['2','2','15.5','115.5'][i];inputs[i].dispatchEvent(new Event('change',{bubbles:true,cancelable:true}));}
   const values=names.map(name=>live.get(name)),saved=names.map(name=>stored.get(api.PREFERENCE_DEFINITIONS[name].property));
   inputs[0].value='0';inputs[0].dispatchEvent(new Event('change',{bubbles:true,cancelable:true}));
   const zero=live.get('urlUnpinGraceSeconds');release();live.destroy();ui.destroy();
   return{values,saved,zero,events};
  },{source,schema,context,apply});
  assert.deepEqual(result.values,['2','2','15.5','115.5']);
  assert.deepEqual(result.saved,['2','2','15.5','115.5']);
  assert.equal(result.zero,'0');
  assert.deepEqual(result.events,[['urlUnpinGraceSeconds','2'],['stickyRemovalDelaySeconds','2'],['urlUnpinGraceSeconds','0']]);
 }finally{await page.close();}
});

test('only the BZF settings dialog is capped and centred; narrow windows wrap controls',{skip},async()=>{
 const page=await browser.newPage({viewport:{width:1600,height:1000}});try{
  await page.setContent(`<style>hbox{display:flex}vbox{display:block}label{display:block}menulist{display:block}</style><style>${sineCss}</style>
   <dialog open class="sineItemPreferenceDialog" id="bzf"><div class="sineItemPreferenceDialogTopBar"><h3>Better Zen Folders</h3><button>Close</button></div><div class="sineItemPreferenceDialogContent">
   <hbox id="better-zen-folders-command-icon-mode"><label class="sineItemPreferenceLabel">BZF Menu Command Icons - ${'a descriptive explanation '.repeat(12)}</label><menulist>Context Menu Icons Compatibility</menulist></hbox>
   <hbox id="better-zen-folders-url-unpin-grace-seconds"><label class="sineItemPreferenceLabel">Delay Before Unpinning a URL</label><input></hbox>
   </div></dialog><dialog open class="sineItemPreferenceDialog" id="other"><div class="sineItemPreferenceDialogContent"><p>${'Another mod has its own settings. '.repeat(22)}</p></div></dialog>`);
  await page.evaluate(async source=>{const api=await import(URL.createObjectURL(new Blob([source],{type:'text/javascript'})));window.release=api.installNumericSettingsUi(window,{get:()=> '0'});},source);
  const measure=()=>page.evaluate(()=>{const d=document.getElementById('bzf'),r=d.getBoundingClientRect();return{width:r.width,centre:r.x+r.width/2,scroll:d.scrollWidth,client:d.clientWidth,other:document.getElementById('other')?.getBoundingClientRect().width};});
  const wide=await measure();assert.ok(wide.width<=900,JSON.stringify(wide));assert.ok(wide.width>=640);
  assert.ok(Math.abs(wide.centre-800)<2);assert.ok(wide.scroll<=wide.client+1);assert.ok(wide.other>1000,'another mod keeps Sine sizing');
  await page.setViewportSize({width:420,height:800});const narrow=await measure();
  assert.ok(narrow.width<=400,JSON.stringify(narrow));assert.ok(narrow.scroll<=narrow.client+1);
  await page.setViewportSize({width:1600,height:1000});await page.evaluate(()=>document.getElementById('other').remove());
  await mkdir(new URL('../.backup-scratch/round6/',import.meta.url),{recursive:true});
  await page.screenshot({path:fileURLToPath(new URL('../.backup-scratch/round6/settings-layout.png',import.meta.url))});
  await page.evaluate(()=>release());assert.ok((await measure()).width>1000,'unload restores native sizing');
 }finally{await page.close();}
});
