import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import * as api from '../scripts/better-zen-folders.uc.mjs';
import {makePreferenceFixture} from './fakes.mjs';

test('palette choices persist independently, invalid edits retain the last valid colour',()=>{
  assert.equal(typeof api.folderColorSwatches,'function');
  const f=makePreferenceFixture();
  const prefs=new api.BetterZenFoldersPreferences(api.createBrowserPreferenceAdapters(f.host));prefs.start();
  const defaults=api.folderColorSwatches(prefs);
  assert.equal(defaults.length,8);assert.equal(prefs.get('customPaletteEnabled'),false);
  const change=(key,value)=>{f.set('better-zen-folders.'+key,value);prefs.observe(null,'nsPref:changed','better-zen-folders.'+key);};
  change('palette-1','#ABCDEF');change('custom-palette-enabled',true);
  assert.equal(api.folderColorSwatches(prefs)[0][1],'#abcdef');
  change('palette-1','red');assert.equal(prefs.get('palette1'),'#abcdef');
  change('custom-palette-enabled',false);assert.deepEqual(api.folderColorSwatches(prefs),defaults);
  change('custom-palette-enabled',true);assert.equal(api.folderColorSwatches(prefs)[0][1],'#abcdef');
  prefs.destroy();
});

const modulePath=process.env.BZF_PLAYWRIGHT_MODULE;
test('invalid stored palette values fall back independently on startup',()=>{
  const f=makePreferenceFixture();f.set('better-zen-folders.custom-palette-enabled',true);
  f.set('better-zen-folders.palette-1','url(private)');f.set('better-zen-folders.palette-2','#123456');
  const prefs=new api.BetterZenFoldersPreferences(api.createBrowserPreferenceAdapters(f.host));prefs.start();
  assert.equal(prefs.get('palette1'),'#e76565');assert.equal(prefs.get('palette2'),'#123456');
  assert.equal(f.warnings.length,1);prefs.destroy();
});

test('Sine replacement rows are enhanced once and restore listeners on cleanup; unavailable picker focuses hex',{skip:!modulePath},async()=>{
  const source=await readFile(new URL('../scripts/better-zen-folders.uc.mjs',import.meta.url),'utf8');
  const {chromium}=createRequire(import.meta.url)(modulePath),browser=await chromium.launch({headless:true});
  try {
    const page=await browser.newPage();
    const result=await page.evaluate(async source=>{
      const url=URL.createObjectURL(new Blob([source],{type:'text/javascript'})),api=await import(url);URL.revokeObjectURL(url);
      const markup='<div id="better-zen-folders-palette-1"><input value="#e76565"></div>';
      document.body.innerHTML=markup;const subscriptions=new Set();
      const release=api.installPaletteSettingsUi(window,{get:()=> '#e76565',subscribe:(n,cb)=>{subscriptions.add(cb);return()=>subscriptions.delete(cb);}});
      const first=document.querySelector('input');document.body.innerHTML=markup;
      await new Promise(r=>setTimeout(r,0));
      const button=document.querySelector('.better-zen-folders-palette-preview');button.click();
      const row=document.getElementById('better-zen-folders-palette-1');
      const output={count:document.querySelectorAll('.better-zen-folders-palette-preview').length,subs:subscriptions.size,
        focused:document.activeElement===row.querySelector('input'),oldLabel:first.getAttribute('aria-label')};
      release();release();output.afterSubs=subscriptions.size;output.afterPreview=document.querySelectorAll('.better-zen-folders-palette-preview').length;return output;
    },source);
    assert.deepEqual(result,{count:1,subs:1,focused:true,oldLabel:null,afterSubs:0,afterPreview:0});
  }finally{await browser.close();}
});

test('palette settings provide preview, guarded hex edits, native picker commit and reversible cleanup',{skip:!modulePath},async()=>{
  const source=await readFile(new URL('../scripts/better-zen-folders.uc.mjs',import.meta.url),'utf8');
  const {chromium}=createRequire(import.meta.url)(modulePath),browser=await chromium.launch({headless:true});
  try {
    const page=await browser.newPage();
    const result=await page.evaluate(async source=>{
      const url=URL.createObjectURL(new Blob([source],{type:'text/javascript'})),api=await import(url);URL.revokeObjectURL(url);
      if(!api.installPaletteSettingsUi)return {missing:true};
      document.body.innerHTML='<div id="better-zen-folders-palette-1"><label class="sineItemPreferenceLabel">Swatch 1</label><input value="#e76565"></div>';
      let saved='#e76565',writes=0;const input=document.querySelector('input');
      input.addEventListener('change',()=>{saved=input.value;writes++;});
      let callback;
      const host={document,Event,MutationObserver,browsingContext:{},Ci:{nsIColorPicker:{}},Cc:{'@mozilla.org/colorpicker;1':{createInstance:()=>({init(){},open(cb){callback=cb;}})}}};
      const release=api.installPaletteSettingsUi(host,{get:()=>saved});
      const picker=document.querySelector('.better-zen-folders-palette-preview'),message=document.querySelector('[role=alert]');
      const initial={label:picker?.getAttribute('aria-label'),value:picker?.getAttribute('data-colour'),width:picker?.getBoundingClientRect().width};
      input.value='invalid';input.dispatchEvent(new Event('change',{bubbles:true,cancelable:true}));
      const invalid={saved,writes,message:message.textContent,invalid:input.getAttribute('aria-invalid')};
      input.value='#ABCDEF';input.dispatchEvent(new Event('input',{bubbles:true}));
      const preview={value:picker.getAttribute('data-colour'),saved};
      input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
      const committed={saved,writes};
      picker.click();callback.update('#112233');callback.done('');
      const previewOnly=saved;
      picker.click();callback.done('#112233');callback.done('#ffffff');
      const picked={saved,writes,input:input.value};
      input.value='#123';input.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));
      const escaped=input.value;
      picker.click();release();callback.done('#ffffff');
      return {initial,invalid,preview,committed,previewOnly,picked,escaped,remaining:document.querySelectorAll('.better-zen-folders-palette-preview,[role=alert]').length,aria:input.getAttribute('aria-invalid'),savedAfterRelease:saved};
    },source);
    assert.equal(result.missing,undefined);assert.match(result.initial.label,/Swatch 1/);assert.equal(result.initial.value,'#e76565');assert.ok(result.initial.width>=24);
    assert.equal(result.invalid.saved,'#e76565');assert.equal(result.invalid.writes,0);assert.equal(result.invalid.invalid,'true');assert.match(result.invalid.message,/six/i);
    assert.deepEqual(result.preview,{value:'#abcdef',saved:'#e76565'});assert.deepEqual(result.committed,{saved:'#abcdef',writes:1});
    assert.equal(result.previewOnly,'#abcdef');assert.deepEqual(result.picked,{saved:'#112233',writes:2,input:'#112233'});assert.equal(result.escaped,'#112233');assert.equal(result.remaining,0);assert.equal(result.aria,null);assert.equal(result.savedAfterRelease,'#112233');
  }finally{await browser.close();}
});
