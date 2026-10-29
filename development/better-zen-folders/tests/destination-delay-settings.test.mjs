import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const modulePath=process.env.BZF_PLAYWRIGHT_MODULE;
const skip=modulePath ? false : 'requires isolated Chromium';
const source=await readFile(new URL('../scripts/better-zen-folders.uc.mjs',import.meta.url),'utf8');
test('Sticky removal seconds UI accepts zero and fractions without integer rounding',{skip},async()=>{
 const browser=await createRequire(import.meta.url)(modulePath).chromium.launch({headless:true});
 try {
  const page=await browser.newPage();
  const result=await page.evaluate(async source=>{
   const api=await import(URL.createObjectURL(new Blob([source],{type:'text/javascript'})));
   document.body.innerHTML='<div id="better-zen-folders-sticky-removal-delay-seconds"><input type="text"></div>';
   const input=document.querySelector('input'),writes=[];input.addEventListener('change',()=>writes.push(input.value));
   const stop=api.installNumericSettingsUi(window,{get:()=> '0.5'});
   const initial={type:input.type,step:input.step,value:input.value};
   for(const value of ['0','0.125','-1','2147483.648','']){input.value=value;input.dispatchEvent(new Event('change',{bubbles:true,cancelable:true}));}
   stop();return{initial,writes,type:input.type};
  },source);
  assert.deepEqual(result,{initial:{type:'number',step:'any',value:'0.5'},writes:['0','0.125'],type:'text'});
 } finally {await browser.close();}
});
// Break caught: Sine saves an invalid destination delay, or the new field is
// left as an unvalidated string instead of participating in the numeric UI.
test('destination hover delay uses free numeric entry, rejects invalid saves, and restores after unload', {skip},async()=>{
 const browser=await createRequire(import.meta.url)(modulePath).chromium.launch({headless:true});
 try {
  const page=await browser.newPage();
  const result=await page.evaluate(async source=>{
   const api=await import(URL.createObjectURL(new Blob([source],{type:'text/javascript'})));
   document.body.innerHTML='<div id="better-zen-folders-drag-destination-delay-ms"><label class="sineItemPreferenceLabel">Drag Destination Hover Delay (ms)</label><input type="text" value="300"></div><input id="unrelated" type="text">';
   const input=document.querySelector('input'),writes=[];
   let saved=300;
   input.addEventListener('change',()=>{saved=Number(input.value);writes.push(input.value);});
   const stop=api.installNumericSettingsUi(window,{get:()=>saved});
   const initial={type:input.type,min:input.min,max:input.max,step:input.step,label:input.getAttribute('aria-label')};
   const invalid=[];
   for(const value of ['-1','1.5','2147483648','']) {
    input.value=value;input.dispatchEvent(new Event('change',{bubbles:true,cancelable:true}));
    invalid.push({writes:[...writes],error:input.getAttribute('aria-invalid')});
   }
   for(const value of ['1273','0']) {input.value=value;input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));}
   input.value='900';input.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
   const escaped=input.value;
   stop();stop();
   return {initial,invalid,writes,escaped,typeAfter:input.type,unrelated:document.getElementById('unrelated').type};
  },source);
  assert.deepEqual(result.initial,{type:'number',min:'0',max:'2147483647',step:'1',label:'Drag Destination Hover Delay (ms)'});
  for(const attempt of result.invalid) assert.deepEqual(attempt,{writes:[],error:'true'});
  assert.deepEqual(result.writes,['1273','0']);assert.equal(result.escaped,'0');
  assert.equal(result.typeAfter,'text');assert.equal(result.unrelated,'text');
 } finally {await browser.close();}
});
