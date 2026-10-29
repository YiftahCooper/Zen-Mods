import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {FolderPinPresentation} from '../scripts/better-zen-folders.uc.mjs';

test('unrelated non-Element gesture targets never belong to a URL-pin button',()=>{
 const presentation=new FolderPinPresentation({}, {}, {}, {adapters:{}});presentation.active=true;
 for(const type of ['pointerdown','mousedown','mouseup','click','dblclick','auxclick','dragstart']){
  let prevented=false,stopped=false;
  presentation.onGesture({type,button:0,target:{nodeType:3,parentElement:{localName:'label'}},
   preventDefault(){prevented=true;},stopImmediatePropagation(){stopped=true;}});
  assert.equal(prevented,false,type);assert.equal(stopped,false,type);
 }
});
const modulePath=process.env.BZF_PLAYWRIGHT_MODULE;
const source=await readFile(new URL('../scripts/better-zen-folders.uc.mjs',import.meta.url),'utf8');
const css=await readFile(new URL('../chrome.css',import.meta.url),'utf8');
for(const direction of ['ltr','rtl'])test(`URL pin badge and commands isolate pointer/keyboard actions (${direction})`,{skip:modulePath?false:'set BZF_PLAYWRIGHT_MODULE'},async()=>{
 const browser=await createRequire(import.meta.url)(modulePath).chromium.launch({headless:true});
 try{
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.setContent(`<style>${css}body{font:14px sans-serif}.tab-content{display:flex;align-items:center;width:280px;height:36px}.tab-icon-stack{width:20px;height:20px}.tab-label-container{flex:1}button.favicon{width:20px;height:20px;padding:0}.tabbrowser-tab{display:block}</style><div id="tabs" dir="${direction}"><zen-folder id="f"><tab class="tabbrowser-tab" id="one"><div class="tab-content"><div class="tab-icon-stack"><button class="favicon">F</button><button class="better-zen-folders-sticky-underline">S</button></div><span class="tab-label-container">Page</span><button class="close">X</button></div></tab></zen-folder></div><menupopup id="tabContextMenu"><menuitem id="context_unpinTab"></menuitem><menuitem id="context_pinTab" hidden></menuitem><menuitem id="context_zen-reset-pinned-tab"></menuitem><menuitem id="context_zen-edit-pinned-page"></menuitem></menupopup>`);
  await page.evaluate(async source=>{
   const url=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));const api=await import(url);URL.revokeObjectURL(url);
   document.createXULElement=name=>{const n=document.createElement(name);n.render=()=>{};return n;};
   const tab=document.getElementById('one');window.t=tab;tab.explicit=true;tab.pinned=true;
   window.calls={unpin:0,pin:0,reset:0,select:0,sticky:0,icon:0};
   tab.addEventListener('mousedown',()=>calls.select++);tab.addEventListener('click',()=>calls.select++);
   tab.querySelector('.favicon').addEventListener('click',()=>calls.icon++);
   tab.querySelector('.better-zen-folders-sticky-underline').addEventListener('click',()=>calls.sticky++);
   window.gBrowser={tabs:[tab],tabContainer:document.getElementById('tabs')};window.TabContextMenu={contextTab:tab};
   const a={classify:n=>n===tab?'regular-folder':'root',getId:n=>n.id,getLocation:n=>n.closest('zen-folder'),isConnected:n=>n.isConnected,
    captureBaseline:()=>1,ownsBaseline:()=>true,reportError:e=>{throw e;}};
   const store={read:n=>({status:'known',explicit:n.explicit})};
   const policy={adapters:a,blocked:()=>null,unpin:async n=>{calls.unpin++;n.explicit=false;return {ok:true};},pin:async n=>{calls.pin++;n.explicit=true;return {ok:true};},reset:async()=>{calls.reset++;return {ok:true};}};
   window.manager=new api.FolderPinPresentation(window,{get:n=>n==='urlUnpinGraceSeconds'?'0':n==='commandIconMode'?'mod':undefined,subscribe:()=>()=>{}},store,policy);
   manager.start();
  },source);
  assert.deepEqual(await page.evaluate(()=>{
   const text=document.querySelector('.tab-label-container').firstChild;
   const event=new DragEvent('dragstart',{bubbles:true,cancelable:true});let reachedTab=false;
   const observe=()=>{reachedTab=true;};t.addEventListener('dragstart',observe,{once:true});
   const allowed=text.dispatchEvent(event);t.removeEventListener('dragstart',observe);
   return{allowed,prevented:event.defaultPrevented,reachedTab};
  }),{allowed:true,prevented:false,reachedTab:true},'Text-node drag events must reach native tab handling');
  const button=page.locator('.better-zen-folders-url-pin');await button.waitFor();
  assert.equal(await button.getAttribute('aria-label'),'Unpin URL');
  const boxes=await page.evaluate(()=>{const b=n=>{const r=n.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};};return [b(document.querySelector('.better-zen-folders-url-pin')),b(document.querySelector('.favicon')),b(document.querySelector('.better-zen-folders-sticky-underline'))];});
  const [badge,...others]=boxes;assert.ok(badge.w>=24&&badge.h>=24);for(const other of others)assert.ok(badge.x+badge.w<=other.x||other.x+other.w<=badge.x||badge.y+badge.h<=other.y||other.y+other.h<=badge.y,'badge must not overlap existing targets');
  await button.click();assert.deepEqual(await page.evaluate(()=>calls),{unpin:1,pin:0,reset:0,select:0,sticky:0,icon:0});
  await page.evaluate(()=>{t.explicit=true;manager.refresh();});await button.focus();await page.keyboard.press('Space');
  assert.equal(await page.evaluate(()=>calls.unpin),2);assert.equal(await page.evaluate(()=>calls.select),0);
  const menu=await page.evaluate(()=>{const m=document.getElementById('tabContextMenu');m.dispatchEvent(new Event('popupshowing'));return {native:document.getElementById('context_unpinTab').hidden,pin:document.getElementById('better-zen-folders-pin-url').getAttribute('label'),reset:document.getElementById('better-zen-folders-reset-url').disabled};});
  assert.deepEqual(menu,{native:true,pin:'Pin URL',reset:true});
  await page.evaluate(()=>document.getElementById('better-zen-folders-pin-url').dispatchEvent(new Event('command')));
  assert.equal(await page.evaluate(()=>calls.pin),1);
  await page.evaluate(()=>manager.run(()=>({ok:false,reason:'failed'})));
  const failure=page.locator('.better-zen-folders-url-pin-status');
  assert.equal(await failure.getAttribute('data-bzf-error'),'true');
  assert.equal(await failure.evaluate(n=>getComputedStyle(n).clipPath),'none');
  await failure.getByRole('button',{name:'Dismiss URL pin message'}).click();
  assert.equal(await failure.getAttribute('data-bzf-error'),null);
  await page.evaluate(()=>{manager.destroy();});assert.equal(await button.count(),0);
  assert.equal(await page.evaluate(()=>document.getElementById('context_unpinTab').hidden),false);
  assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});
