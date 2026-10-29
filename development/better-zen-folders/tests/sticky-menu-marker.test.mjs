import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const modulePath=process.env.BZF_PLAYWRIGHT_MODULE;
for(const kind of ['tab','folder'])test(`${kind} menu follows marker preference without changing native check`,{skip:modulePath?false:'set BZF_PLAYWRIGHT_MODULE'},async()=>{
  const source=await readFile(new URL('../scripts/better-zen-folders.uc.mjs',import.meta.url),'utf8');
  const browser=await createRequire(import.meta.url)(modulePath).chromium.launch({headless:true});
  try{
    const page=await browser.newPage();await page.route('**/*',r=>r.abort());
    await page.setContent('<zen-folder id="folder"><tab id="tab"></tab></zen-folder><menupopup id="tabContextMenu"></menupopup><menupopup id="zenFolderActions"></menupopup>');
    const result=await page.evaluate(async({source,kind})=>{
      const url=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
      const api=await import(url);URL.revokeObjectURL(url);
      document.createXULElement=name=>{const n=document.createElement(name);n.innerHTML='<img class="menu-icon"><label class="menu-text"></label>';return n;};
      const folder=document.getElementById('folder'),tab=document.getElementById('tab');folder.isZenFolder=true;tab.group=folder;
      window.gBrowser={isTab:n=>n===tab};window.TabContextMenu={contextTab:tab};
      const menu=document.getElementById(kind==='tab'?'tabContextMenu':'zenFolderActions');menu.triggerNode=kind==='tab'?tab:folder;
      let marker='underline',mode='mod';
      const manager=new api.StickyFolderVisibilityManager(window,{get:n=>n==='stickyMarker'?marker:n==='commandIconMode'?mode:undefined});
      manager.isSticky=()=>true;manager.stickyEnabled=()=>true;
      const show=()=>{manager.showMenu({target:menu});return document.getElementById('better-zen-folders-sticky-'+kind);};
      const item=show();
      const read=()=>({style:item.querySelector('svg')?.getAttribute('data-bzf-sticky-marker'),paint:item.querySelector('svg')?.innerHTML,checked:item.hasAttribute('checked'),before:item.querySelector('svg')?.nextElementSibling?.className});
      const underline=read();marker='corner';show();const corner=read();marker='underline';show();const again=read();mode='off';show();
      return{underline,corner,again,offCount:item.querySelectorAll('svg').length,offChecked:item.hasAttribute('checked')};
    },{source,kind});
    assert.equal(result.underline.style,'underline');assert.equal(result.corner.style,'corner');
    assert.notEqual(result.underline.paint,result.corner.paint);assert.equal(result.again.paint,result.underline.paint);
    assert.equal(result.underline.before,'menu-text');assert.equal(result.corner.checked,true);
    assert.equal(result.offCount,0);assert.equal(result.offChecked,true);
  }finally{await browser.close();}
});
