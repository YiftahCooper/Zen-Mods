import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {projectFolderVisibility} from '../scripts/better-zen-folders.uc.mjs';

const source=await readFile(new URL('../scripts/better-zen-folders.uc.mjs',import.meta.url),'utf8');
const css=await readFile(new URL('../chrome.css',import.meta.url),'utf8');
const nativeAnimations=await readFile(new URL('./fixtures/zen-1.22.2b-folder-animation.mjs',import.meta.url),'utf8');
const modulePath=process.env.BZF_PLAYWRIGHT_MODULE;
const skip=modulePath?false:'set BZF_PLAYWRIGHT_MODULE for isolated workspace fixture';

for(const policy of ['hide','expanded','all']) test(`workspace boundary shows only anchored roots with ${policy} subfolder policy`,()=>{
  const sticky={id:'sticky',sticky:true},selected={id:'selected',selected:true};
  const branch={id:'branch',folder:true,children:[{id:'sibling'},{id:'leaf',sticky:true}]};
  const ordinary={id:'ordinary',folder:true,children:[{id:'ordinary-child'}]};
  const stickyFolder={id:'sticky-folder',folder:true,sticky:true,children:[{id:'contents'}]};
  const roots=[ordinary,sticky,branch,selected,stickyFolder];
  const result=projectFolderVisibility(roots,{
    isFolder:n=>!!n.folder,children:n=>n.children??[],isCollapsed:n=>!!n.collapsed,
    isSticky:n=>!!n.sticky,isSelected:n=>!!n.selected,isExposed:()=>false,
    rootInitialState:(node,anchored)=>({visible:anchored,pathOnly:anchored&&!!node.folder&&!node.sticky,projected:true}),
  },policy);
  assert.deepEqual([...result].filter(([,v])=>v.visible).map(([n])=>n.id),
    ['sticky','branch','leaf','selected','sticky-folder','contents']);
  assert.equal(result.get(branch).pathOnly,true);
  assert.deepEqual(roots.map(n=>n.id),['ordinary','sticky','branch','selected','sticky-folder']);
});

async function fixture(action){
  const {chromium}=createRequire(import.meta.url)(modulePath);
  const browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage();const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
    await page.setContent(`<style>
      :root{--tab-min-height:36px} body{margin:0} #tabs{width:320px}
      zen-workspace,.workspace-arrowscrollbox,.zen-workspace-pinned-tabs-section,.zen-workspace-normal-tabs-section,zen-folder,.tab-group-container{display:flex;flex-direction:column}
      tab,.tab-group-label-container{display:flex;min-height:36px;flex-shrink:0}.tab-group-label{display:flex;min-height:36px}
      .zen-tab-group-start{height:0;min-height:0;order:-9999;flex-shrink:0}
      [hidden],tab[zen-empty-tab]{display:none} zen-workspace:not([active]){display:none}
      zen-workspace[collapsedpinnedtabs] .zen-workspace-pinned-tabs-section{overflow-y:clip}
      ${css}
    </style><div id="tabs"><div id="essentials"><tab id="essential" zen-essential pinned>Essential</tab></div>
      <zen-workspace id="a" active="true"><div class="zen-current-workspace-indicator" tabindex="0">A</div><div class="workspace-arrowscrollbox">
        <div class="zen-workspace-pinned-tabs-section"><div class="space-fake-collapsible-start zen-tab-group-start"></div>
          <tab id="ordinary" pinned>Ordinary</tab><tab id="sticky" pinned>Sticky</tab>
          <zen-folder id="branch"><div class="tab-group-label-container"><span class="tab-group-label" tabindex="0">Branch</span></div><div class="tab-group-container"><div class="zen-tab-group-start"></div><tab id="sibling" pinned>Sibling</tab><tab id="leaf" pinned>Leaf</tab></div></zen-folder>
          <zen-folder id="otherFolder"><div class="tab-group-label-container"><span class="tab-group-label">Other folder</span></div><div class="tab-group-container"><div class="zen-tab-group-start"></div><tab id="otherChild" pinned>Other child</tab></div></zen-folder>
          <tab id="selected" pinned>Selected</tab><tab id="multi" pinned multiselected>Multiselected</tab><tab id="visualOnly" pinned visuallyselected>Visual only</tab>
          <tab id="hidden" pinned hidden>Independently hidden</tab><tab id="empty" pinned zen-empty-tab>Empty</tab>
        </div><div class="zen-workspace-normal-tabs-section"><tab id="normal">Normal</tab></div>
      </div></zen-workspace>
      <zen-workspace id="b"><div class="zen-current-workspace-indicator" tabindex="0">B</div><div class="workspace-arrowscrollbox"><div class="zen-workspace-pinned-tabs-section"><div class="space-fake-collapsible-start zen-tab-group-start"></div><tab id="foreign" pinned>Foreign</tab></div><div class="zen-workspace-normal-tabs-section"></div></div></zen-workspace>
    </div><menupopup id="tabContextMenu"></menupopup><menupopup id="zenFolderActions"></menupopup>`);
    await page.evaluate(async({source,nativeAnimations})=>{
      document.documentElement.setAttribute('zen-sidebar-expanded','true');
      const url=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));window.api=await import(url);URL.revokeObjectURL(url);
      window.q=id=>document.getElementById(id);
      window.isTab=n=>n?.localName==='tab';window.isTabGroup=n=>n?.isZenFolder===true;
      const folders=[...document.querySelectorAll('zen-folder')];
      for(const f of folders){f.isZenFolder=true;f.groupContainer=f.querySelector(':scope > .tab-group-container');f.labelElement=f.querySelector('.tab-group-label');f.labelElement.group=f;
        Object.defineProperty(f,'group',{get:()=>f.parentElement.closest('zen-folder')});}
      for(const workspace of document.querySelectorAll('zen-workspace')){
        workspace.pinnedTabsContainer=workspace.querySelector('.zen-workspace-pinned-tabs-section');workspace.indicator=workspace.querySelector('.zen-current-workspace-indicator');
        Object.defineProperty(workspace,'hasCollapsedPinnedTabs',{get:()=>workspace.hasAttribute('collapsedpinnedtabs')});
        const pins=document.createElement('zen-workspace-collapsible-pins');pins.hidden=true;pins.isZenFolder=true;workspace.prepend(pins);workspace.collapsiblePins=pins;
        pins.groupContainer=workspace.pinnedTabsContainer;folders.push(pins);
        workspace.indicator.addEventListener('click',()=>pins.collapsed=!pins.collapsed);
      }
      for(const f of folders){f._activeTabs=[];
        Object.defineProperties(f,{
          collapsed:{get:()=>f.hasAttribute('collapsed'),set:value=>{if(f.collapsed===value)return;f.toggleAttribute('collapsed',value);
            if(f.localName==='zen-workspace-collapsible-pins')f.parentElement.toggleAttribute('collapsedpinnedtabs',value);
            f.dispatchEvent(new Event(value?'TabGroupCollapse':'TabGroupExpand',{bubbles:true}));}},
          allItems:{get:()=>[...f.groupContainer.children].filter(n=>n.matches('tab,zen-folder,tab-split-view-wrapper'))},
          groupStartElement:{get:()=>f.groupContainer.firstElementChild},
          childGroupsAndTabs:{get:()=>[...f.groupContainer.querySelectorAll('tab,.tab-group-label')]},
          tabs:{get:()=>[...f.groupContainer.querySelectorAll('tab')]},
          childActiveGroups:{get:()=>[...f.groupContainer.querySelectorAll('zen-folder[has-active]')]},activeGroups:{get:()=>[]},
          activeTabs:{get:()=>f._activeTabs,set:tabs=>{if(tabs.length){f._activeTabs=tabs;tabs.forEach(t=>t.setAttribute('folder-active','true'));}
            else{for(const t of f._activeTabs){t.removeAttribute('folder-active');t.style.removeProperty('--zen-folder-indent');}f._activeTabs=[];}}},
        });}
      window.gZenWorkspaces={activeWorkspaceElement:q('a'),promiseInitialized:Promise.resolve()};
      const tabs=[...document.querySelectorAll('tab')];
      for(const t of tabs){Object.defineProperties(t,{group:{get:()=>t.parentElement.closest('zen-folder')},
        pinned:{get:()=>t.hasAttribute('pinned')},selected:{get:()=>t.id==='selected'},multiselected:{get:()=>t.hasAttribute('multiselected')},
        splitview:{get:()=>t.parentElement?.localName==='tab-split-view-wrapper'?t.parentElement:null},
        // Installed 1.22.2b tab.js:231-250, including native workspace activeTabs gate.
        visible:{get:()=>{if(t.hidden||t.hasAttribute('zen-empty-tab'))return false;if(t.selected||t.multiselected)return true;
          for(let p=t.group;p;p=p.group)if(p.collapsed&&!p.activeTabs.includes(t))return false;
          const w=gZenWorkspaces.activeWorkspaceElement;
          return !(t.pinned&&!t.hasAttribute('zen-essential')&&w?.hasCollapsedPinnedTabs&&!w.collapsiblePins.activeTabs.includes(t));}},
      });}
      window.gBrowser={tabs,selectedTab:q('selected'),tabContainer:q('tabs'),isTab,isTabGroup,
        isTabGroupLabel:n=>n?.classList?.contains('tab-group-label'),isSplitViewWrapper:n=>n?.localName==='tab-split-view-wrapper'};
      let cached;
      Object.defineProperty(gBrowser.tabContainer,'ariaFocusableItems',{get:()=>cached??=[q('essential'),
        ...(gZenWorkspaces.activeWorkspaceElement.hasCollapsedPinnedTabs?[]:[...gZenWorkspaces.activeWorkspaceElement.pinnedTabsContainer.querySelectorAll('tab,.tab-group-label')].filter(n=>n.visible!==false)),q('normal')]});
      gBrowser.tabContainer._invalidateCachedVisibleTabs=()=>{cached=null;};
      const values=new Map(),windows=new Map();
      window.SessionStore={promiseAllWindowsRestored:Promise.resolve(),getCustomTabValue:(t,k)=>values.get(t)?.[k]??'',setCustomTabValue:(t,k,v)=>values.set(t,{...values.get(t),[k]:v}),getCustomWindowValue:(_,k)=>windows.get(k)??'',setCustomWindowValue:(_,k,v)=>windows.set(k,v)};
      document.createXULElement=name=>document.createElement(name);
      window.prefs={get:n=>({subfolderCollapsePolicy:'all',folderStateChevron:'always'})[n],subscribe:(name,callback)=>{if(typeof name!=='string'||typeof callback!=='function')throw new RangeError('named subscription required');return()=>{};}};
      window.manager=new api.StickyFolderVisibilityManager(window,prefs);manager.start();
      manager.setSticky(q('sticky'),true);manager.setSticky(q('leaf'),true);manager.setSticky(q('normal'),true);manager.setSticky(q('hidden'),true);manager.setSticky(q('foreign'),true);
      window.flush=()=>new Promise(r=>setTimeout(r,20));
      window.collapse=()=>{q('a').collapsiblePins.collapsed=true;q('a').pinnedTabsContainer.hidden=true;q('a').collapsiblePins.groupStartElement.style.marginTop='-400px';manager.refresh();};
      window.shown=id=>q(id).getBoundingClientRect().height>0&&getComputedStyle(q(id)).display!=='none';
      window.nativeAnimationSource=nativeAnimations;
    },{source,nativeAnimations});
    await page.evaluate(()=>flush());
    const result=await action(page);
    assert.deepEqual(errors,[],'uncaught fixture errors');return result;
  }finally{await browser.close();}
}

test('native collapsed pins retain ordered anchors, paths and native selected/multiselected exemption',{skip},()=>fixture(async page=>{
  const r=await page.evaluate(()=>{collapse();const result={
    shown:['ordinary','sticky','branch','sibling','leaf','otherFolder','otherChild','selected','multi','visualOnly','hidden','empty','normal','essential','foreign'].filter(shown),
    stickyNative:q('sticky').visible,leafNative:q('leaf').visible,path:manager.projection.get(q('branch'))?.pathOnly,
    collapsed:[q('a').hasCollapsedPinnedTabs,q('a').collapsiblePins.collapsed,q('branch').collapsed],
    focus:gBrowser.tabContainer.ariaFocusableItems.map(n=>n.id||n.group?.id),
    order:[...q('a').pinnedTabsContainer.children].filter(n=>n.id).map(n=>n.id),
    scrollStyle:q('a').querySelector('.workspace-arrowscrollbox').getAttribute('style'),
  };manager.destroy();return result;});
  assert.deepEqual(r.shown,['sticky','branch','leaf','selected','multi','normal','essential']);
  assert.equal(r.stickyNative,true);assert.equal(r.leafNative,true);assert.equal(r.path,true);
  assert.deepEqual(r.collapsed,[true,true,false]);
  assert.deepEqual(r.focus,['essential','sticky','branch','leaf','selected','multi','normal']);
  assert.deepEqual(r.order,['ordinary','sticky','branch','otherFolder','selected','multi','visualOnly','hidden','empty']);assert.equal(r.scrollStyle,null);
}));

test('root controls/menu use existing persistence and are inactive in the ordinary unpinned area',{skip},()=>fixture(async page=>{
  const r=await page.evaluate(()=>{
    const rootControl=q('sticky').querySelector('.better-zen-folders-sticky-toggle');
    const folderControl=q('branch').querySelector(':scope > .tab-group-label-container > .better-zen-folders-sticky-toggle');
    const childControl=q('leaf').querySelector('.better-zen-folders-sticky-toggle');
    const menu=q('tabContextMenu');menu.triggerNode=q('sticky');manager.showMenu({target:menu});
    const result={rootMarker:rootControl?.getAttribute('data-bzf-root-sticky-control'),folderMarker:folderControl?.getAttribute('data-bzf-root-sticky-control'),
      nestedMarker:childControl?.hasAttribute('data-bzf-root-sticky-control'),menuVisible:!q('better-zen-folders-sticky-tab').hidden,
      ordinaryControl:!!q('normal').querySelector('.better-zen-folders-sticky-toggle'),essentialControl:!!q('essential').querySelector('.better-zen-folders-sticky-toggle')};
    collapse();q('a').querySelector('.zen-workspace-normal-tabs-section').append(q('sticky'));q('sticky').removeAttribute('pinned');manager.refresh();
    result.afterUnpin={stored:manager.isSticky(q('sticky')),projection:q('sticky').getAttribute('data-bzf-visibility'),control:!!q('sticky').querySelector('.better-zen-folders-sticky-toggle'),active:q('a').collapsiblePins.activeTabs.includes(q('sticky'))};
    manager.destroy();return result;
  });
  assert.deepEqual(r,{rootMarker:'true',folderMarker:'true',nestedMarker:false,menuVisible:true,ordinaryControl:false,essentialControl:false,
    afterUnpin:{stored:true,projection:null,control:false,active:false}});
}));

test('root tab/folder corners remain inside the viewport, hit the button and leave row positions unchanged',{skip},()=>fixture(async page=>{
  const r=await page.evaluate(()=>{
    const rows=[q('sticky'),q('branch').labelElement.parentElement];
    const rect=node=>{const r=node.getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};};
    const before=rows.map(rect);
    const corners=rows.map(row=>{
      const button=row.querySelector(':scope > .better-zen-folders-sticky-toggle');
      const ear=button.querySelector('.better-zen-folders-sticky-ear');const b=rect(button),e=rect(ear),r=rect(row);
      const hit=document.elementFromPoint(e.x+e.width/2,e.y+e.height/2);
      return{inside:b.x>=r.x&&b.x+b.width<=r.x+r.width&&b.y>=r.y&&b.y+b.height<=r.y+r.height,
        visible:e.width>=11&&e.height>=11,hit:hit===button||button.contains(hit),short:b.height<r.height};
    });
    manager.destroy();return{corners,before,after:rows.map(rect)};
  });
  assert.deepEqual(r.corners,[{inside:true,visible:true,hit:true,short:true},{inside:true,visible:true,hit:true,short:true}]);
  assert.deepEqual(r.before,r.after);
}));

test('workspace activation projects only its own pins and removes old visibility/focus loans',{skip},()=>fixture(async page=>{
  const r=await page.evaluate(async()=>{
    collapse();q('b').collapsiblePins.collapsed=true;q('b').pinnedTabsContainer.hidden=true;
    q('a').removeAttribute('active');q('b').setAttribute('active','true');gZenWorkspaces.activeWorkspaceElement=q('b');
    window.dispatchEvent(new Event('ZenWorkspacesUIUpdate'));await flush();
    const result={foreign:shown('foreign'),oldLoans:q('a').collapsiblePins.activeTabs.map(t=>t.id),oldMarker:q('a').pinnedTabsContainer.getAttribute('data-bzf-workspace-projection'),
      focus:gBrowser.tabContainer.ariaFocusableItems.map(n=>n.id),collapsed:[q('a').hasCollapsedPinnedTabs,q('b').hasCollapsedPinnedTabs]};
    manager.destroy();return result;
  });
  assert.deepEqual(r,{foreign:true,oldLoans:[],oldMarker:null,focus:['essential','normal','foreign'],collapsed:[true,true]});
}));

test('a valid folder remains menu-eligible independently of the active workspace projection',{skip},()=>fixture(async page=>{
  const r=await page.evaluate(()=>{
    q('b').pinnedTabsContainer.append(q('branch'));manager.refresh();
    const menu=q('zenFolderActions');menu.triggerNode=q('branch').labelElement;manager.showMenu({target:menu});
    const command=q('better-zen-folders-sticky-folder');const visible=!command.hidden;command.dispatchEvent(new Event('command'));
    const result={visible,stored:manager.isSticky(q('branch')),projected:manager.projection.has(q('branch')),foreignMarker:q('b').pinnedTabsContainer.getAttribute('data-bzf-workspace-projection')};
    manager.destroy();return result;
  });
  assert.deepEqual(r,{visible:true,stored:true,projected:false,foreignMarker:null});
}));

test('path-only root can expose its branch and workspace collapse cycle resets exposure',{skip},()=>fixture(async page=>{
  const r=await page.evaluate(()=>{collapse();const before=shown('sibling');manager.toggleFolder(q('branch'));
    const opened=shown('sibling'),parentStillCollapsed=q('a').hasCollapsedPinnedTabs;
    q('a').collapsiblePins.collapsed=false;q('a').collapsiblePins.collapsed=true;manager.refresh();
    const result={before,opened,parentStillCollapsed,reset:shown('sibling'),remembered:q('branch').collapsed};manager.destroy();return result;});
  assert.deepEqual(r,{before:false,opened:true,parentStillCollapsed:true,reset:false,remembered:false});
}));

for(const boundary of ['first collapse','expansion']) for(const inactive of [false,true])
test(`Space ${boundary} clears only its own temporary exposure (inactive=${inactive})`,{skip},()=>fixture(async page=>{
  const r=await page.evaluate(async({boundary,inactive})=>{
    const getPreference=prefs.get;
    prefs.get=name=>name==='subfolderCollapsePolicy'?'hide':getPreference(name);
    q('otherFolder').groupContainer.append(q('branch'));
    q('otherFolder').collapsed=true;q('branch').collapsed=true;
    if(boundary==='expansion')q('a').indicator.click();
    manager.refresh();manager.toggleFolder(q('branch'));
    const before={exposed:manager.exposure.has(q('branch')),sibling:shown('sibling'),leaf:shown('leaf')};
    // An unrelated Space's pending branch exposure must survive either boundary.
    const foreignBranch=document.createElement('zen-folder');foreignBranch.isZenFolder=true;
    q('b').pinnedTabsContainer.append(foreignBranch);manager.exposure.expose(foreignBranch);
    if(inactive){
      q('a').removeAttribute('active');q('b').setAttribute('active','true');
      gZenWorkspaces.activeWorkspaceElement=q('b');manager.refresh();
    }
    q('a').indicator.click();await flush();
    const exposures={own:manager.exposure.has(q('branch')),foreign:manager.exposure.has(foreignBranch)};
    if(inactive){
      q('b').removeAttribute('active');q('a').setAttribute('active','true');
      gZenWorkspaces.activeWorkspaceElement=q('a');manager.refresh();
    }
    const result={before,exposures,sibling:shown('sibling'),leaf:shown('leaf'),
      spaceCollapsed:q('a').hasCollapsedPinnedTabs,folderCollapsed:q('otherFolder').collapsed,
      branchCollapsed:q('branch').collapsed,sticky:manager.isSticky(q('leaf'))};
    manager.destroy();return result;
  },{boundary,inactive});
  assert.deepEqual(r,{before:{exposed:true,sibling:true,leaf:true},exposures:{own:false,foreign:true},
    sibling:false,leaf:true,spaceCollapsed:boundary==='first collapse',folderCollapsed:true,
    branchCollapsed:false,sticky:true});
}));

test('normal folder collapse retains exposure until its own expand/collapse cycle',{skip},()=>fixture(async page=>{
  const r=await page.evaluate(()=>{
    const getPreference=prefs.get;
    prefs.get=name=>name==='subfolderCollapsePolicy'?'hide':getPreference(name);
    q('otherFolder').groupContainer.append(q('branch'));q('branch').collapsed=true;
    manager.refresh();manager.toggleFolder(q('branch'));
    q('otherFolder').collapsed=true;manager.refresh();
    const firstCollapse={exposed:manager.exposure.has(q('branch')),sibling:shown('sibling')};
    q('otherFolder').collapsed=false;manager.refresh();
    const expanded=manager.exposure.has(q('branch'));
    q('otherFolder').collapsed=true;manager.refresh();
    const result={firstCollapse,expanded,afterCycle:{exposed:manager.exposure.has(q('branch')),sibling:shown('sibling')},
      spaceCollapsed:q('a').hasCollapsedPinnedTabs};manager.destroy();return result;
  });
  assert.deepEqual(r,{firstCollapse:{exposed:true,sibling:true},expanded:true,
    afterCycle:{exposed:false,sibling:false},spaceCollapsed:false});
}));

test('Sticky root folder respects its own remembered collapse state inside collapsed Space pins',{skip},()=>fixture(async page=>{
  const r=await page.evaluate(()=>{
    manager.setSticky(q('otherFolder'),true);collapse();
    const expanded=shown('otherChild');q('otherFolder').collapsed=true;manager.refresh();
    const collapsed=shown('otherChild'),header=shown('otherFolder');
    q('a').collapsiblePins.collapsed=false;q('a').pinnedTabsContainer.hidden=false;manager.refresh();
    const result={expanded,collapsed,header,remembered:q('otherFolder').collapsed,ordinary:shown('ordinary')};manager.destroy();return result;
  });
  assert.deepEqual(r,{expanded:true,collapsed:false,header:true,remembered:true,ordinary:true});
}));

test('root split has one shared control and both native-visible constituents, then becomes inactive when unpinned',{skip},()=>fixture(async page=>{
  const r=await page.evaluate(()=>{
    const split=document.createElement('tab-split-view-wrapper');split.id='split';q('sticky').before(split);split.append(q('sticky'),q('ordinary'));
    Object.defineProperties(split,{tabs:{get:()=>[...split.querySelectorAll('tab')]},group:{get:()=>split.parentElement.closest('zen-folder')}});
    collapse();const result={shown:shown('split'),native:split.tabs.map(t=>t.visible),
      controls:split.querySelectorAll('.better-zen-folders-sticky-toggle').length,
      rootMarker:split.querySelector('.better-zen-folders-sticky-toggle')?.getAttribute('data-bzf-root-sticky-control')};
    q('a').querySelector('.zen-workspace-normal-tabs-section').append(split);split.tabs.forEach(t=>t.removeAttribute('pinned'));manager.refresh();
    result.unpinned={projection:split.getAttribute('data-bzf-visibility'),controls:split.querySelectorAll('.better-zen-folders-sticky-toggle').length,
      stored:manager.isSticky(q('sticky')),loan:q('a').collapsiblePins.activeTabs.some(t=>split.contains(t))};manager.destroy();return result;
  });
  assert.deepEqual(r,{shown:true,native:[true,true],controls:1,rootMarker:'true',unpinned:{projection:null,controls:0,stored:true,loan:false}});
}));

test('capture releases Sticky activity before native selection guards and reprojects afterwards',{skip},()=>fixture(async page=>{
  const r=await page.evaluate(async()=>{
    q('branch').collapsed=true;collapse();let during;
    window.addEventListener('TabSelect',()=>{during={workspace:q('a').collapsiblePins.activeTabs.map(t=>t.id),
      folder:q('branch').activeTabs.map(t=>t.id),stickyFlag:q('leaf').hasAttribute('folder-active')};},{once:true});
    q('selected').dispatchEvent(new Event('TabSelect',{bubbles:true}));await flush();
    const result={during,after:{workspace:q('a').collapsiblePins.activeTabs.map(t=>t.id),folder:q('branch').activeTabs.map(t=>t.id)},
      collapsed:[q('a').hasCollapsedPinnedTabs,q('branch').collapsed]};manager.destroy();return result;
  });
  assert.deepEqual(r,{during:{workspace:[],folder:[],stickyFlag:false},after:{workspace:['sticky','leaf'],folder:['leaf']},collapsed:[true,true]});
}));

test('cleanup preserves native hidden/margin, preexisting ARIA and unowned native activity',{skip},()=>fixture(async page=>{
  const r=await page.evaluate(()=>{
    q('sticky').setAttribute('aria-hidden','original');q('sticky').style.setProperty('--zen-folder-indent','7px');
    q('a').collapsiblePins.activeTabs=[q('ordinary')];collapse();
    manager.destroy();return{hidden:q('a').pinnedTabsContainer.hasAttribute('hidden'),margin:q('a').collapsiblePins.groupStartElement.style.marginTop,
      aria:q('sticky').getAttribute('aria-hidden'),indent:q('sticky').style.getPropertyValue('--zen-folder-indent'),
      native:q('a').collapsiblePins.activeTabs.map(t=>t.id),collapsed:q('a').hasCollapsedPinnedTabs,
      leftovers:document.querySelectorAll('[data-bzf-workspace-projection],[data-bzf-visibility],.better-zen-folders-sticky-toggle').length};
  });
  assert.deepEqual(r,{hidden:true,margin:'-400px',aria:'original',indent:'7px',native:['ordinary'],collapsed:true,leftovers:0});
}));

test('turning off the focused last root Sticky control returns focus to the Space header',{skip},()=>fixture(async page=>{
  const r=await page.evaluate(()=>{collapse();const button=q('sticky').querySelector('.better-zen-folders-sticky-toggle');button?.focus();manager.setSticky(q('sticky'),false);
    const result={hidden:!shown('sticky'),focused:document.activeElement===q('a').indicator};manager.destroy();return result;});
  assert.deepEqual(r,{hidden:true,focused:true});
}));

for(const cancel of [false,true])test(`workspace expansion masks obsolete native negative spacer (cancel=${cancel})`,{skip},()=>fixture(async page=>{
  const r=await page.evaluate(async cancel=>{
    window.windowUtils={getBoundsWithoutFlushing:n=>n.getBoundingClientRect()};
    const url=URL.createObjectURL(new Blob([nativeAnimationSource],{type:'text/javascript'}));await import(url);URL.revokeObjectURL(url);
    const pending=[];
    window.addEventListener('TabGroupExpand',e=>{pending.push(gZenFolders.on_TabGroupExpand(e));if(cancel)e.target.groupStartElement.getAnimations().forEach(a=>a.cancel());});
    collapse();const spacer=q('a').collapsiblePins.groupStartElement;q('a').collapsiblePins.collapsed=false;
    const during={margin:getComputedStyle(spacer).marginTop,ordinary:shown('ordinary')};
    await Promise.allSettled(pending);await flush();
    const result={during,afterMargin:spacer.style.marginTop,ordinary:shown('ordinary'),collapsed:q('a').hasCollapsedPinnedTabs,pending:manager.expansionHandoffs.size};manager.destroy();return result;
  },cancel);
  assert.equal(r.during.margin,'0px');assert.equal(r.during.ordinary,true);assert.ok(!r.afterMargin||parseFloat(r.afterMargin)===0);
  assert.equal(r.ordinary,true);assert.equal(r.collapsed,false);assert.equal(r.pending,0);
}));
