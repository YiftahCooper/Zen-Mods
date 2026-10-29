import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const source=await readFile(new URL('../scripts/better-zen-folders.uc.mjs',import.meta.url),'utf8');
const css=await readFile(new URL('../chrome.css',import.meta.url),'utf8');
const native=await readFile(new URL('../artifacts/native-20260915/zen-folders.css',import.meta.url),'utf8');
const modulePath=process.env.BZF_PLAYWRIGHT_MODULE;

for(const scheme of ['light','dark']) test(`default folder Space colour can be disabled without changing explicit colours (${scheme})`,{skip:!modulePath},async()=>{
  const browser=await createRequire(import.meta.url)(modulePath).chromium.launch({headless:true});
  try {
    const page=await browser.newPage();
    await page.setContent(`<style>${native}${css}:root{color-scheme:${scheme};--zen-primary-color:#3366cc;--zen-colors-primary:#3366cc}zen-folder{display:block}.front{background:var(--zen-folder-front-bgcolor)}.back{background:var(--zen-folder-behind-bgcolor)}.stroke{color:var(--zen-folder-stroke)}</style>
      <zen-folder id="custom" data-better-zen-folders-color="#51c67c" style="--better-zen-folders-custom-color:#51c67c;--zen-folder-front-bgcolor:#51c67c;--zen-folder-behind-bgcolor:#51c67c"><i class="front"></i><i class="back"></i><i class="stroke"></i><zen-folder id="default"><i class="front"></i><i class="back"></i><i class="stroke"></i></zen-folder></zen-folder>`);
    const result=await page.evaluate(async source=>{
      const url=URL.createObjectURL(new Blob([source],{type:'text/javascript'})),api=await import(url);URL.revokeObjectURL(url);
      const root=document.documentElement;let listener;let enabled=true;
      const projection=new api.FolderSpaceColourPreferenceProjection({root:()=>root,preferences:{get:()=>enabled,subscribe:(_,fn)=>{listener=fn;return()=>listener=null;}}});
      const paint=id=>[...document.querySelector('#'+id).children].filter(n=>n.localName==='i').map(n=>getComputedStyle(n)[n.className==='stroke'?'color':'backgroundColor']);
      const nativeBefore=paint('default'),customBefore=paint('custom');projection.start();
      const on=paint('default');enabled=false;listener(false);const neutral=paint('default');
      root.style.setProperty('--zen-primary-color','#ff0000');root.style.setProperty('--zen-colors-primary','#ff0000');
      const changedSpaceOff=paint('default'),customOff=paint('custom');
      enabled=true;listener(true);const changedSpaceOn=paint('default');
      enabled=false;listener(false);projection.destroy();
      return {nativeBefore,on,neutral,changedSpaceOff,changedSpaceOn,customBefore,customOff,restored:paint('default'),attribute:root.getAttribute('better-zen-folders-space-colour'),unsubscribed:listener===null};
    },source);
    assert.deepEqual(result.on,result.nativeBefore);assert.notDeepEqual(result.neutral,result.on);
    assert.deepEqual(result.changedSpaceOff,result.neutral,'neutral default stays neutral when the Space theme changes');
    assert.notDeepEqual(result.changedSpaceOn,result.neutral);assert.notDeepEqual(result.changedSpaceOn,result.on);
    assert.deepEqual(result.customOff,result.customBefore,'explicit colour does not follow the new preference');
    assert.deepEqual(result.restored,result.changedSpaceOn);assert.equal(result.attribute,null);assert.equal(result.unsubscribed,true);
  } finally {await browser.close();}
});
