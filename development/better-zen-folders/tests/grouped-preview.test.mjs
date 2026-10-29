import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import * as api from '../scripts/better-zen-folders.uc.mjs';
const modulePath=process.env.BZF_PLAYWRIGHT_MODULE;
const skip=modulePath?false:'set BZF_PLAYWRIGHT_MODULE';
const source=await readFile(new URL('../scripts/better-zen-folders.uc.mjs',import.meta.url),'utf8');
const native=await readFile(new URL('./fixtures/zen-1.22.2b-folder-preview.mjs',import.meta.url),'utf8');
const css=await readFile(new URL('../chrome.css',import.meta.url),'utf8');
const nativeCss=await readFile(new URL('../artifacts/native-20260915/zen-folders.css',import.meta.url),'utf8');
const nativeTab=await readFile(new URL('../artifacts/native-20260915/tab.js',import.meta.url),'utf8');
const nativeGroupGetter=nativeTab.slice(nativeTab.indexOf('    get group() {'),nativeTab.indexOf('    get splitview() {'));
let browser;
before(async()=>{if(modulePath)browser=await createRequire(import.meta.url)(modulePath).chromium.launch({headless:true});});
after(async()=>{await browser?.close();});
test('grouped-preview preference has a validated expanded default',()=>{
  assert.equal(api.PREFERENCE_DEFINITIONS.previewSubfolders?.defaultValue,'expanded');
});

test('child-only preview default opens children while deeper branches start closed',{skip},async()=>{
  const page=await fixture('children');try{
    assert.deepEqual(await page.evaluate(()=>visibleRows()),['Wikipedia','Child','YouTube','Grand','GitHub','Reddit']);
    assert.equal(await page.locator('[data-bzf-preview-folder="child"]').getAttribute('aria-expanded'),'true');
    assert.equal(await page.locator('[data-bzf-preview-folder="grand"]').getAttribute('aria-expanded'),'false');
    await page.locator('[data-bzf-preview-folder="grand"]').click();
    assert.equal((await page.evaluate(()=>visibleRows())).includes('Needle'),true);
    await page.evaluate(()=>{document.getElementById('zen-folder-tabs-popup').hidePopup();openPreview();});
    assert.equal((await page.evaluate(()=>visibleRows())).includes('Needle'),false);
  }finally{await page.close();}
});

test('preview shows independent Sticky and explicit URL-pin states without adding toggle actions',{skip},async()=>{
  const page=await fixture();try{
    await page.evaluate(()=>{
      previewManager.state={isSticky:item=>['child','b','d'].includes(item.id),isUrlPinned:tab=>['b','c'].includes(tab.id)};
      document.getElementById('zen-folder-tabs-popup').hidePopup();openPreview();
    });
    const states=await page.evaluate(()=>previewManager.session.entries.map(e=>({
      name:e.folder?.name??e.tab?.label,sticky:e.row.querySelectorAll('.better-zen-folders-preview-sticky').length,
      pin:e.row.querySelectorAll('.better-zen-folders-preview-pin').length,
      buttons:e.row.querySelectorAll('button').length
    })));
    assert.deepEqual(states.map(e=>[e.name,e.sticky,e.pin,e.buttons]),[
      ['Wikipedia',0,0,0],['Child',1,0,0],['YouTube',1,1,0],['Grand',0,0,0],['Needle',0,1,0],['GitHub',1,0,0],['Reddit',0,0,0]
    ]);
    await page.locator('.folders-tabs-list-item-label',{hasText:'YouTube'}).click();
    assert.equal(await page.evaluate(()=>gBrowser.selectedTab.id),'b');
    await page.evaluate(()=>previewManager.destroy());
    assert.equal(await page.locator('.better-zen-folders-preview-status').count(),0);
  }finally{await page.close();}
});

test('preview eligibility restores the native accessor on error and retains native setter changes',()=>{
  const hidden={closest:()=>true},visible={closest:()=>null};let active=[hidden,visible];
  const proto={get activeTabs(){return active;},set activeTabs(value){active=value;}};
  const root=Object.create(proto),manager=new api.FolderPreviewHierarchyManager({},{});
  assert.throws(()=>manager.withPreviewEligibility(root,()=>{
    assert.deepEqual(root.activeTabs,[visible]);root.activeTabs=[visible,hidden];throw Error('native open failed');
  }),/native open failed/);
  assert.equal(Object.hasOwn(root,'activeTabs'),false);assert.deepEqual(root.activeTabs,[visible,hidden]);
  manager.withPreviewEligibility(root,()=>{
    manager.withPreviewEligibility(root,()=>assert.deepEqual(root.activeTabs,[visible]));
    Object.defineProperty(root,'activeTabs',{configurable:true,value:[hidden]});
  });
  assert.deepEqual(root.activeTabs,[hidden],'a later property owner is not overwritten by cleanup');
});
async function fixture(mode='expanded') {
  const page=await browser.newPage();
  page.setDefaultTimeout(3000);
  await page.route('**/*',r=>r.abort());
  await page.setContent(`<style>:root{--size-item-small:16px;--tab-inline-padding:8px;--tab-min-height:32px;--tab-margin-block:2px}zen-folder,tab{display:block}#zen-folder-tabs-popup{width:380px}[hidden]{display:none!important}</style>
  <div id="tabs"><zen-folder id="root"><div class="tab-group-label-container">Root</div><div class="tab-group-container">
    <tab id="a"></tab><zen-folder id="child"><div class="tab-group-label-container"><span class="tab-group-folder-icon"><svg viewBox="0 0 16 16"><rect width="16" height="16" fill="#51c67c"/></svg></span>Child</div><div class="tab-group-container">
      <tab id="b"></tab><zen-folder id="grand"><div class="tab-group-label-container">Grand</div><div class="tab-group-container"><tab id="c"></tab></div></zen-folder><tab id="d"></tab>
    </div></zen-folder><tab id="e"></tab><tab id="already-visible"></tab><tab id="hidden-native" hidden></tab>
  </div></zen-folder></div>
  <div id="zen-folder-tabs-popup"><input id="zen-folder-tabs-list-search"><div id="zen-folder-tabs-list"></div><div id="zen-folder-tabs-search-no-results" hidden>No matches</div></div>`);
  await page.addStyleTag({content:nativeCss});
  await page.addStyleTag({content:css});
  await page.evaluate(async({source,native,mode})=>{
    const url=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
    const api=await import(url); URL.revokeObjectURL(url);
    if(!api.FolderPreviewHierarchyManager)throw Error('Missing grouped preview manager');
    for(const f of document.querySelectorAll('zen-folder')){
      f.isZenFolder=true;f.collapsed=true;f.name=f.id==='root'?'Root':f.id==='child'?'Child':'Grand';
      f.label=f.name; f.activeTabs=[];
      Object.defineProperties(f,{tabs:{get:()=>Array.from(f.querySelectorAll('tab'))},group:{get:()=>f.parentElement.closest('zen-folder')}});
      f.style.setProperty('--better-zen-folders-folder-color','#51c67c');
    }
    for(const t of document.querySelectorAll('tab')){
      t.group=t.closest('zen-folder');t.label={a:'Wikipedia',b:'YouTube',c:'Needle',d:'GitHub',e:'Reddit'}[t.id]??t.id;
      t.linkedBrowser={currentURI:{spec:'https://example.test/'+t.id}};t.hasAttribute=t.hasAttribute.bind(t);
    }
    const root=document.getElementById('root');root.activeTabs=[document.getElementById('already-visible')];
    const panel=document.getElementById('zen-folder-tabs-popup');
    window.gURLBar={focused:false};window.gZenVerticalTabsManager={_prefsRightSide:false};
    window.gBrowser={tabContainer:document.getElementById('tabs'),getIcon:()=> 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>'};
    window.PlacesUtils={favicons:{defaultFavicon:{spec:''}}};window.formatRelativeTime=()=> 'Now';document.l10n={setArgs(){}};
    panel.openPopup=(anchor)=>{panel.anchorNode=anchor;panel.state='showing';panel.dispatchEvent(new Event('popupshowing'));panel.state='open';panel.dispatchEvent(new Event('popupshown'));};
    panel.hidePopup=()=>{panel.state='closed';panel.dispatchEvent(new Event('popuphidden'));};
    (0,eval)(native);window.nativePreview=new NativeFolderPreviewFixture(panel);window.gZenFolders=nativePreview;
    window.mode=mode;window.prefListeners=[];
    window.previewManager=new api.FolderPreviewHierarchyManager(window,{get:()=>window.mode,subscribe:(name,fn)=>{prefListeners.push(fn);return()=>{prefListeners=prefListeners.filter(x=>x!==fn);};}});
    window.previewManager.start();
    window.openPreview=()=>nativePreview.openTabsPopup({target:root.firstElementChild,stopPropagation(){}});
    window.visibleRows=()=>Array.from(document.querySelector('#zen-folder-tabs-list').children).filter(x=>!x.hidden).map(x=>x.getAttribute('data-bzf-preview-name')??x.querySelector('.folders-tabs-list-item-label')?.textContent);
    openPreview();
  },{source,native,mode});
  return page;
}
test('interleaved descendants retain actual order and native eligible tabs',{skip},async()=>{
  const page=await fixture();try{
    assert.deepEqual(await page.evaluate(()=>visibleRows()),['Wikipedia','Child','YouTube','Grand','Needle','GitHub','Reddit']);
    assert.equal(await page.locator('[data-bzf-preview-folder="child"] svg').count(),1);
    assert.equal(await page.locator('[data-bzf-preview-folder="child"]').getAttribute('aria-expanded'),'true');
    await page.locator('[data-bzf-preview-folder="child"]').click();
    assert.deepEqual(await page.evaluate(()=>visibleRows()),['Wikipedia','Child','Reddit']);
    assert.deepEqual(await page.evaluate(()=>Array.from(document.querySelectorAll('zen-folder')).map(f=>f.collapsed)),[true,true,true]);
    await page.locator('[data-bzf-preview-folder="child"]').click();
    await page.locator('[data-bzf-preview-folder="grand"]').click();
    assert.deepEqual(await page.evaluate(()=>visibleRows()),['Wikipedia','Child','YouTube','Grand','GitHub','Reddit']);
    await page.locator('.folders-tabs-list-item-label',{hasText:'GitHub'}).click();
    assert.equal(await page.evaluate(()=>gBrowser.selectedTab.id),'d');
  }finally{await page.close();}
});

test('a formerly exposed tab hidden by projection returns to preview without toggling its folder',{skip},async()=>{
  const page=await fixture();try{
    const result=await page.evaluate(()=>{
      const panel=document.getElementById('zen-folder-tabs-popup'),root=document.getElementById('root');
      const tab=document.getElementById('already-visible'),before=root.activeTabs;
      tab.setAttribute('data-bzf-visibility','hidden');
      panel.hidePopup();openPreview();
      return {rows:visibleRows(),sameActiveArray:root.activeTabs===before,retained:root.activeTabs.includes(tab),collapsed:root.collapsed};
    });
    assert.deepEqual(result,{rows:['Wikipedia','Child','YouTube','Grand','Needle','GitHub','Reddit','already-visible'],sameActiveArray:true,retained:true,collapsed:true});
    await page.evaluate(()=>previewManager.destroy());
    await page.evaluate(()=>openPreview());
    assert.equal((await page.evaluate(()=>visibleRows())).includes('already-visible'),false,'unload restores native preview eligibility');
  }finally{await page.close();}
});
test('search reveals matching paths and restores preview-only collapsed choices',{skip},async()=>{
  const page=await fixture('collapsed');try{
    assert.deepEqual(await page.evaluate(()=>visibleRows()),['Wikipedia','Child','Reddit']);
    const search=page.locator('#zen-folder-tabs-list-search');await search.fill('Needle');
    assert.deepEqual(await page.evaluate(()=>visibleRows()),['Child','Grand','Needle']);
    await search.fill('no match');assert.deepEqual(await page.evaluate(()=>visibleRows()),[]);
    assert.equal(await page.locator('#zen-folder-tabs-search-no-results').isVisible(),true);
    await search.fill('');assert.deepEqual(await page.evaluate(()=>visibleRows()),['Wikipedia','Child','Reddit']);
    await page.locator('[data-bzf-preview-folder="child"]').click();
    assert.deepEqual(await page.evaluate(()=>visibleRows()),['Wikipedia','Child','YouTube','Grand','GitHub','Reddit']);
    await page.evaluate(()=>{document.getElementById('zen-folder-tabs-popup').hidePopup();openPreview();});
    assert.deepEqual(await page.evaluate(()=>visibleRows()),['Wikipedia','Child','Reddit']);
  }finally{await page.close();}
});

test('deferred popupshowing retains grouping when former active tabs are hidden',{skip},async()=>{
  const page=await fixture();try{
    await page.evaluate(async()=>{
      const panel=document.getElementById('zen-folder-tabs-popup');panel.hidePopup();
      document.getElementById('already-visible').setAttribute('data-bzf-visibility','hidden');
      panel.openPopup=anchor=>{panel.anchorNode=anchor;queueMicrotask(()=>{
        panel.dispatchEvent(new Event('popupshowing'));panel.state='open';
      });};
      openPreview();await Promise.resolve();
    });
    assert.deepEqual(await page.evaluate(()=>visibleRows()),['Wikipedia','Child','YouTube','Grand','Needle','GitHub','Reddit','already-visible']);
  }finally{await page.close();}
});
test('hide policy excludes descendants from browsing and search',{skip},async()=>{
  const page=await fixture('hide');try{
    assert.deepEqual(await page.evaluate(()=>visibleRows()),['Wikipedia','Reddit']);
    await page.locator('#zen-folder-tabs-list-search').fill('Needle');
    assert.deepEqual(await page.evaluate(()=>visibleRows()),[]);
    await page.evaluate(()=>{mode='expanded';prefListeners.forEach(fn=>fn());});
    assert.deepEqual(await page.evaluate(()=>visibleRows()),['Child','Grand','Needle']);
  }finally{await page.close();}
});
test('keyboard headings toggle once, tabs activate, and cleanup restores native list',{skip},async()=>{
  const page=await fixture('collapsed');try{
    const search=page.locator('#zen-folder-tabs-list-search');await search.focus();
    await page.keyboard.press('ArrowDown');await page.keyboard.press('ArrowDown');
    assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('data-bzf-preview-folder')),'child');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('[data-bzf-preview-folder="child"]').getAttribute('aria-expanded'),'true');
    await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(()=>gBrowser.selectedTab.id),'b');
    await page.evaluate(()=>previewManager.destroy());
    assert.equal(await page.locator('[data-bzf-preview-folder]').count(),0);
    assert.deepEqual(await page.evaluate(()=>visibleRows()),['Wikipedia','YouTube','Needle','GitHub','Reddit']);
  }finally{await page.close();}
});

test('initial Up reaches last row and hiding a focused descendant returns to search',{skip},async()=>{
  const page=await fixture();try{
    await page.locator('#zen-folder-tabs-list-search').focus();
    await page.keyboard.press('ArrowUp');
    assert.equal(await page.evaluate(()=>document.activeElement.querySelector('.folders-tabs-list-item-label')?.textContent),'Reddit');
    await page.locator('.folders-tabs-list-item-label',{hasText:'Needle'}).evaluate(n=>n.closest('.folders-tabs-list-item').focus());
    await page.evaluate(()=>{mode='hide';prefListeners.forEach(fn=>fn());});
    assert.equal(await page.evaluate(()=>document.activeElement.id),'zen-folder-tabs-list-search');
  }finally{await page.close();}
});

test('a tab moved outside the previewed folder cannot activate through a stale row',{skip},async()=>{
  const page=await fixture();try{
    await page.evaluate(()=>document.getElementById('tabs').appendChild(document.getElementById('b')));
    await page.locator('.folders-tabs-list-item-label',{hasText:'YouTube'}).click();
    assert.equal(await page.evaluate(()=>gBrowser.selectedTab?.id??null),null);
    assert.equal(await page.evaluate(()=>document.getElementById('zen-folder-tabs-popup').state),'closed');
  }finally{await page.close();}
});

test('repeated opening and abort leave no owned rows or listeners',{skip},async()=>{
  const page=await fixture();try{
    await page.evaluate(()=>{for(let i=0;i<3;i++){document.getElementById('zen-folder-tabs-popup').hidePopup();openPreview();}});
    assert.equal(await page.locator('[data-bzf-preview-folder]').count(),2);
    await page.evaluate(()=>{previewManager.destroy();window.controller=new AbortController();previewManager.start(controller.signal);document.getElementById('zen-folder-tabs-popup').hidePopup();openPreview();controller.abort();});
    assert.equal(await page.locator('[data-bzf-preview-folder]').count(),0);
    assert.equal(await page.evaluate(()=>prefListeners.length),0);
    assert.equal(await page.locator('[data-bzf-grouped-preview]').count(),0);
    await page.evaluate(()=>{document.getElementById('zen-folder-tabs-popup').hidePopup();openPreview();});
    assert.equal(await page.locator('[data-bzf-preview-folder]').count(),0);
  }finally{await page.close();}
});

test('long folder names remain inside the popup and RTL indentation follows hierarchy',{skip},async()=>{
  const page=await fixture();try{
    await page.evaluate(()=>{
      document.getElementById('child').name='A very long folder name with enough words to require truncation';
      document.getElementById('zen-folder-tabs-popup').hidePopup();openPreview();
    });
    const geometry=()=>page.evaluate(()=>{
      const list=document.getElementById('zen-folder-tabs-list');
      const child=list.querySelector('[data-bzf-preview-folder="child"]'), grand=list.querySelector('[data-bzf-preview-folder="grand"]');
      return{client:list.clientWidth,scroll:list.scrollWidth,child:child.getBoundingClientRect().toJSON(),grand:grand.getBoundingClientRect().toJSON()};
    });
    const ltr=await geometry();assert.ok(ltr.scroll<=ltr.client+1,JSON.stringify(ltr));
    assert.ok(ltr.grand.left>ltr.child.left);
    await page.evaluate(()=>document.documentElement.dir='rtl');
    const rtl=await geometry();assert.ok(rtl.scroll<=rtl.client+1,JSON.stringify(rtl));
    assert.ok(rtl.grand.right<rtl.child.right);
    await page.locator('[data-bzf-preview-folder="child"]').focus();await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('[data-bzf-preview-folder="child"]').getAttribute('aria-expanded'),'false');
    await page.keyboard.press('ArrowLeft');
    assert.equal(await page.locator('[data-bzf-preview-folder="child"]').getAttribute('aria-expanded'),'true');
    await page.evaluate(()=>document.documentElement.dir='ltr');
    await page.locator('#zen-folder-tabs-popup').screenshot({path:'artifacts/alpha-preview-review/grouped-preview.png'});
  }finally{await page.close();}
});

test('split-view members follow physical folder ancestry for collapse and hidden-subfolder search',{skip},async()=>{
  const page=await fixture('collapsed');try{
    await page.evaluate(getter=>{
      const tab=document.getElementById('c'), wrapper=document.createElement('tab-split-view-wrapper');
      tab.before(wrapper);wrapper.appendChild(tab);tab.pinned=true;
      window.gZenWorkspaces={workspaceElement:()=>({collapsiblePins:{collapsed:true}})};
      gBrowser.isTabGroup=node=>node?.isZenFolder===true;
      const descriptor=Object.getOwnPropertyDescriptor((0,eval)('({'+getter+'})'),'group');
      Object.defineProperty(tab,'group',descriptor);
      document.getElementById('zen-folder-tabs-popup').hidePopup();openPreview();
    },nativeGroupGetter);
    assert.deepEqual(await page.evaluate(()=>visibleRows()),['Wikipedia','Child','Reddit']);
    await page.evaluate(()=>{mode='hide';prefListeners.forEach(fn=>fn());});
    assert.deepEqual(await page.evaluate(()=>visibleRows()),['Wikipedia','Reddit']);
    await page.locator('#zen-folder-tabs-list-search').fill('Needle');
    assert.deepEqual(await page.evaluate(()=>visibleRows()),[]);
    await page.evaluate(()=>{mode='expanded';prefListeners.forEach(fn=>fn());});
    assert.deepEqual(await page.evaluate(()=>visibleRows()),['Child','Grand','Needle']);
  }finally{await page.close();}
});

for(const target of ['Reddit','Child'])test(`pointer highlighting ${target} after keyboard focus determines Enter action`,{skip},async()=>{
  const page=await fixture();try{
    await page.locator('#zen-folder-tabs-list-search').focus();await page.keyboard.press('ArrowDown');
    const row=target==='Child'?page.locator('[data-bzf-preview-folder="child"]'):page.locator('.folders-tabs-list-item-label',{hasText:'Reddit'});
    await row.hover();await page.keyboard.press('Enter');
    if(target==='Reddit')assert.equal(await page.evaluate(()=>gBrowser.selectedTab?.id),'e');
    else{
      assert.equal(await page.locator('[data-bzf-preview-folder="child"]').getAttribute('aria-expanded'),'false');
      assert.equal(await page.evaluate(()=>gBrowser.selectedTab?.id??null),null);
    }
  }finally{await page.close();}
});

test('disabling during an empty search closes the popup through native cleanup',{skip},async()=>{
  const page=await fixture();try{
    await page.locator('#zen-folder-tabs-list-search').fill('no such page');
    await page.evaluate(()=>previewManager.destroy());
    assert.equal(await page.evaluate(()=>document.getElementById('zen-folder-tabs-popup').state),'closed');
    assert.equal(await page.locator('#zen-folder-tabs-list-search').inputValue(),'');
    assert.equal(await page.locator('[data-bzf-preview-folder]').count(),0);
  }finally{await page.close();}
});
