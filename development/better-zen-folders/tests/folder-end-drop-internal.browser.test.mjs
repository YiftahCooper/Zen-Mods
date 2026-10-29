import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const modulePath=process.env.BZF_PLAYWRIGHT_MODULE;
const source=await readFile(new URL('../scripts/better-zen-folders.uc.mjs',import.meta.url),'utf8');
const css=await readFile(new URL('../chrome.css',import.meta.url),'utf8');
const labels=['End of Great','After Great in Grand','After Grand in Child','After Child in Parent','After Parent in Pinned Tabs'];

for(const direction of ['ltr','rtl'])for(const transformed of [false,true,'scale']){
 test(`internal chooser keeps all depths reachable without shifting native rows (${direction}, transformed=${transformed})`,{skip:!modulePath&&'requires isolated Chromium'},async()=>{
  const browser=await createRequire(import.meta.url)(modulePath).chromium.launch({headless:true});
  try{
   const page=await browser.newPage({viewport:{width:700,height:600}}),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   const folder=(id,colour,children)=>`<zen-folder id="${id}" style="--better-zen-folders-folder-color:${colour}"><div class="tab-group-label-container"><span class="tab-group-folder-icon"><svg viewBox="0 0 24 24"><defs><linearGradient id="paint-${id}"><stop stop-color="${colour}"/></linearGradient></defs><path fill="url(#paint-${id})" d="M2 5h8l2 2h10v15H2z"/></svg></span>${id}</div><div class="tab-group-container">${children}</div></zen-folder>`;
   const tree=folder('Parent','#e76565',folder('Child','#51c67c',folder('Grand','#3ebcd2',folder('Great','#9b79ea','<tab id="last">Last nested tab</tab>')))+'<tab id="following">Later outer tab</tab>');
   await page.setContent(`<style>body{margin:20px;font:14px sans-serif}#clip{width:340px;height:440px;overflow:auto;${transformed==='scale'?`transform:scale(1.25);transform-origin:top ${direction==='rtl'?'right':'left'}`:transformed?'transform:translate(12px,9px)':''}}#tabs,section,zen-folder,.tab-group-container{display:flex;flex-direction:column;flex-shrink:0}.tab-group-label-container,tab{display:flex;align-items:center;height:36px;flex-shrink:0}.tab-group-container>zen-folder,.tab-group-container>tab{margin-inline-start:14px}.tab-group-folder-icon svg{width:20px;height:20px}#spacer{height:80px;flex-shrink:0}.pinned-tabs-container-separator{height:8px}${css}</style><div id="clip"><div id="tabs"><div id="spacer"></div><section id="pins" class="zen-workspace-pinned-tabs-section">${tree}<div class="pinned-tabs-container-separator"></div></section><section><tab id="source" zen-workspace-id="active">Dragged tab</tab></section></div></div>`);
   const result=await page.evaluate(async({source,direction})=>{
    document.documentElement.dir=direction;document.documentElement.setAttribute('zen-sidebar-expanded','true');
    const url=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));const api=await import(url);URL.revokeObjectURL(url);
    const tabs=document.getElementById('tabs'),pins=document.getElementById('pins'),clip=document.getElementById('clip');
    const dragged=document.getElementById('source'),last=document.getElementById('last'),following=document.getElementById('following');
    const rect=node=>{const r=node.getBoundingClientRect();return {top:r.top,left:r.left,bottom:r.bottom,right:r.right,width:r.width,height:r.height};};
    const projection=new Map();for(const item of document.querySelectorAll('tab,zen-folder')){
     item.documentGlobal=window;projection.set(item,{visible:true});
     if(item.localName==='zen-folder'){item.isZenFolder=true;item.label=item.id;item.groupContainer=item.querySelector(':scope>.tab-group-container');item.labelContainerElement=item.querySelector(':scope>.tab-group-label-container');}
    }
    pins.scrollbox=clip;pins.separatorElement=pins.lastElementChild;clip.scrollTop=40;
    window.gBrowser={tabContainer:tabs,pinnedTabsContainer:pins,isTab:n=>n?.localName==='tab',isSplitViewWrapper:()=>false};
    window.gZenWorkspaces={activeWorkspace:'active',pinnedTabsContainer:pins};
    window.gZenPinnedTabManager={_dragIndicator:null,get dragIndicator(){return this._dragIndicator??=document.body.appendChild(document.createElement('div'));}};
    tabs.tabDragAndDrop={getDropEffectForTabDrag:()=> 'move',_clearDragOverSplit(){}};
    tabs.addEventListener('dragover',e=>{e.preventDefault();e.stopPropagation();});
    const callbacks=new Set();let colours=true;
    const prefs={get:n=>n==='colourCodeDragDestinations'?colours:0,subscribe:(n,fn)=>{callbacks.add(fn);return()=>callbacks.delete(fn);}};
    const adapters=api.createBrowserFolderEndDropAdapters(window,{projection},prefs),manager=new api.FolderEndDropManager(adapters);manager.start();
    dragged._dragData={movingTabs:[dragged],dropElement:last,dropBefore:false};
    const dt=new DataTransfer();dt.setData('application/x-moz-tabbrowser-tab','fixture');dt.dropEffect='move';dt.mozItemCount=1;dt.mozGetDataAt=()=>dragged;
    manager.begin({target:dragged,dataTransfer:dt});
    const nativeRows=[...document.querySelectorAll('.tab-group-label-container,tab')],before=nativeRows.map(rect),pinsBefore=rect(pins);
    const point={clientX:direction==='rtl'?rect(pins).right-1:rect(pins).left+1,clientY:rect(last).bottom-5};
    const target=document.elementFromPoint(point.clientX,point.clientY);target.dispatchEvent(new DragEvent('dragover',{bubbles:true,cancelable:true,dataTransfer:dt,...point}));
    if(!manager.footer)return {missing:true,target:target?.localName};
    const footer=manager.footer.element,rows=manager.footer.rows;
    const hits=rows.map(row=>{const r=rect(row.element),point={clientX:(r.left+r.right)/2,clientY:(r.top+r.bottom)/2};const target=document.elementFromPoint(point.clientX,point.clientY);return {target:target===row.element,hit:adapters.hitTest(manager.footer,{target,...point})===row,rect:r};});
    const iconNodes=rows.map(row=>row.icon.firstElementChild);
    const coloursOn=rows.map(row=>getComputedStyle(row.element,'::before').backgroundColor);
    const ids=[...footer.querySelectorAll('[id]')].map(n=>n.id);
    const colourAttr=footer.getAttribute('data-bzf-drop-colours');
    let mutations=0;const observer=new MutationObserver(records=>mutations+=records.length);observer.observe(footer,{subtree:true,childList:true});
    for(let n=0;n<10;n++)adapters.updateFooter(manager.footer,adapters.getLayout(dragged,manager.layout.root));
    await new Promise(r=>setTimeout(r,30));const stable=mutations===0;
    colours=false;for(const callback of callbacks)callback();await new Promise(r=>setTimeout(r,20));
    const neutral={attr:footer.getAttribute('data-bzf-drop-colours'),filters:rows.map(r=>getComputedStyle(r.icon).filter),strips:rows.map(r=>getComputedStyle(r.element,'::before').content)};
    const after=nativeRows.map(rect),pinsAfter=rect(pins),bounds=rect(footer),clipBounds=rect(clip),boundary=rect(last);
    clip.style.height='180px';clip.scrollTop=60;adapters.updateFooter(manager.footer,adapters.getLayout(dragged,manager.layout.root));
    const smallBounds=rect(footer),smallClip=rect(clip),scrolled=[];
    for(const row of rows){footer.scrollTop=row.element.offsetTop;const r=rect(row.element);const point={clientX:(r.left+r.right)/2,clientY:Math.max(r.top,smallBounds.top)+Math.min(10,r.height/2)};const target=document.elementFromPoint(point.clientX,point.clientY);scrolled.push(adapters.hitTest(manager.footer,{target,...point})===row);}
    const outcome={labels:rows.map(r=>r.element.textContent),root:manager.layout.root.id,directAncestry:footer.parentElement===pins,floating:footer.hasAttribute('data-bzf-drop-floating'),hits,coloursOn,colourAttr,ids,icons:iconNodes.map(n=>n?.localName??null),stable,neutral,before,after,pinsBefore,pinsAfter,bounds,clipBounds,boundary,smallBounds,smallClip,scrolled,followingParent:following.parentElement.parentElement.id};
    observer.disconnect();manager.destroy();outcome.cleaned=!document.querySelector('.better-zen-folders-drop-footer');outcome.subscriptions=callbacks.size;return outcome;
   },{source,direction});
   assert.equal(result.missing,undefined,JSON.stringify(result));assert.deepEqual(result.labels,labels);assert.equal(result.root,'Child');
   assert.equal(result.directAncestry,true);assert.equal(result.floating,true);assert.equal(result.followingParent,'Parent');
   assert.deepEqual(result.before,result.after);assert.deepEqual(result.pinsBefore,result.pinsAfter);
   for(const hit of result.hits){assert.equal(hit.target,true,JSON.stringify(hit));assert.equal(hit.hit,true);}
   assert.deepEqual(result.icons,['svg','svg','svg','svg',null]);
   assert.deepEqual(result.coloursOn.slice(0,4),['rgb(155, 121, 234)','rgb(62, 188, 210)','rgb(81, 198, 124)','rgb(231, 101, 101)']);
   assert.equal(result.colourAttr,'true');assert.equal(result.neutral.attr,'false');assert.ok(result.neutral.filters.every(x=>x==='grayscale(1)'));assert.ok(result.neutral.strips.every(x=>x==='none'));
   assert.equal(new Set(result.ids).size,result.ids.length);assert.ok(result.ids.every(id=>id.startsWith('better-zen-folders-menu-resource-')));assert.equal(result.stable,true);
   assert.ok(result.bounds.top>=result.clipBounds.top);assert.ok(result.bounds.bottom<=result.clipBounds.bottom);
   assert.ok(result.bounds.left>=result.clipBounds.left-0.1);assert.ok(result.bounds.right<=result.clipBounds.right+0.1);
   assert.ok(result.bounds.top<=result.boundary.bottom+8,'no gap between trigger and chooser');
   assert.ok(result.bounds.bottom>=Math.min(result.boundary.bottom,result.clipBounds.bottom)-8);
   assert.ok(result.smallBounds.top>=result.smallClip.top);assert.ok(result.smallBounds.bottom<=result.smallClip.bottom);assert.ok(result.scrolled.every(Boolean),JSON.stringify(result.scrolled));
   assert.equal(result.cleaned,true);assert.equal(result.subscriptions,0);assert.deepEqual(errors,[]);
  }finally{await browser.close();}
 });
}
