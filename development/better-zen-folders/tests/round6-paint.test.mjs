import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const modulePath=process.env.BZF_PLAYWRIGHT_MODULE;
const css=await readFile(new URL('../chrome.css',import.meta.url),'utf8');
const native=await readFile(new URL('./fixtures/zen-1.23.2b-folder-paint.css',import.meta.url),'utf8');
const source=await readFile(new URL('../scripts/better-zen-folders.uc.mjs',import.meta.url),'utf8');
for(const dir of ['ltr','rtl'])test(`folder underline follows the visible artwork rather than its wider slot (${dir})`,{skip:!modulePath},async()=>{
 const browser=await createRequire(import.meta.url)(modulePath).chromium.launch({headless:true});try{
  const page=await browser.newPage();await page.setContent(`<style>${css}.tab-group-label-container{position:relative;display:flex;height:40px}.tab-group-folder-icon{position:relative;width:28px;height:28px}svg{transform:translateX(3px)}rect{transform:translateX(2px)}</style><zen-folder id="folder"><div class="tab-group-label-container"><span class="tab-group-folder-icon"><svg width="28" height="28" viewBox="0 0 28 28"><rect class="front" x="5" y="8" width="18" height="15"></rect></svg></span><label>Folder</label></div></zen-folder>`);
  const value=await page.evaluate(async({source,dir})=>{
   const api=await import(URL.createObjectURL(new Blob([source],{type:'text/javascript'})));document.documentElement.dir=dir;document.documentElement.setAttribute('zen-sidebar-expanded','true');
   const folder=document.getElementById('folder');folder.isZenFolder=true;folder.labelElement=folder.querySelector('label');
   const manager=new api.StickyFolderVisibilityManager({document,getComputedStyle:n=>getComputedStyle(n),gBrowser:{isTab:()=>false}}, {get:n=>n==='stickyMarker'?'underline':true});manager.store={has:()=>true};manager.isRootPinnedItem=()=>true;manager.decorateEar(folder,true);
   const art=folder.querySelector('.front').getBoundingClientRect(),mark=folder.querySelector('.better-zen-folders-sticky-underline').getBoundingClientRect();return{art:art.x+art.width/2,mark:mark.x+mark.width/2};
  },{source,dir});assert.ok(Math.abs(value.art-value.mark)<.5,JSON.stringify(value));
 }finally{await browser.close();}
});
for(const scheme of ['light','dark'])test(`Zen 1.23 folder-local defaults respect neutral mode and separate Space themes (${scheme})`,{skip:!modulePath},async()=>{
 const browser=await createRequire(import.meta.url)(modulePath).chromium.launch({headless:true});try{
  const page=await browser.newPage();await page.setContent(`<style>${css}${native}
   :root{color-scheme:${scheme};--zen-primary-color:#3366cc;--zen-colors-primary:#3366cc}
   zen-folder,zen-workspace,i{display:block}.paint{background:var(--zen-folder-front-bgcolor);width:20px;height:20px}
   </style><zen-workspace style="--zen-primary-color:#3366cc;--zen-colors-primary:#3366cc"><zen-folder id="outer" data-better-zen-folders-color="#51c67c" style="--better-zen-folders-custom-color:#51c67c;--zen-folder-front-bgcolor:#51c67c"><i class="paint"></i><zen-folder id="child"><i class="paint"></i></zen-folder></zen-folder></zen-workspace>
   <zen-workspace style="--zen-primary-color:#ff0000;--zen-colors-primary:#ff0000"><zen-folder id="second"><i class="paint"></i></zen-folder></zen-workspace>`);
  const result=await page.evaluate(()=>{
   const paint=id=>getComputedStyle(document.querySelector('#'+id+' > .paint')).backgroundColor;
   const on=[paint('child'),paint('second')],customBefore=paint('outer');
   document.documentElement.setAttribute('better-zen-folders-space-colour','false');
   const off=[paint('child'),paint('second')],customAfter=paint('outer');
   document.documentElement.setAttribute('better-zen-folders-space-colour','true');
   return{on,off,customBefore,customAfter,again:[paint('child'),paint('second')]};
  });
  assert.notEqual(result.on[0],result.on[1],'each Space keeps its own theme');
  assert.notEqual(result.off[0],result.on[0],'neutral mode changes actual folder paint');
  assert.equal(result.off[0],result.off[1],'neutral default ignores Space colour');
  assert.equal(result.customAfter,result.customBefore,'manual colours remain exact');
  assert.deepEqual(result.again,result.on);
 }finally{await browser.close();}
});
