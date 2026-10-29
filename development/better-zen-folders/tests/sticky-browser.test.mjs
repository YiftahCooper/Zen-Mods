import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const modulePath=process.env.BZF_PLAYWRIGHT_MODULE;
const skip=modulePath ? false : 'set BZF_PLAYWRIGHT_MODULE for isolated browser fixture';
const source=await readFile(new URL('../scripts/better-zen-folders.uc.mjs',import.meta.url),'utf8');
const css=await readFile(new URL('../chrome.css',import.meta.url),'utf8');
const nativeFolders=await readFile(new URL('./fixtures/zen-1.22.2b-folder-animation.mjs',import.meta.url),'utf8');

async function saveGutterPreview(page,name) {
  if(!process.env.BZF_SAVE_GUTTER_TESTS)return;
  const output=new URL('../artifacts/round3-review/sticky-corners/',import.meta.url);
  await mkdir(output,{recursive:true});
  await page.screenshot({path:fileURLToPath(new URL(`${name}.png`,output))});
}

async function run(testFunction) {
  const {chromium}=createRequire(import.meta.url)(modulePath);
  const browser=await chromium.launch({headless:true});
  try {
    const page=await browser.newPage();
    const pageErrors=[];page.on('pageerror',error=>pageErrors.push(error.message));
    await page.setContent(`<style>body{font:14px sans-serif}zen-folder{display:flex;flex-direction:column}.tab-group-label-container{display:flex;position:relative;min-height:36px;align-items:center}.tab-group-label{flex:1;min-width:0}.tab-group-container{display:flex;flex-direction:column;position:relative}.tab-group-container>:is(tab,zen-folder){margin-inline-start:14px;--zen-folder-indent:14px}tab{display:flex;position:relative;min-height:36px;align-items:center}.tab-group-folder-icon{width:28px}.tab-group-container[hidden]{display:none} ${css}</style><div id="tabs"><zen-folder id="root"><div class="tab-group-label-container"><span class="tab-group-folder-icon"></span><span tabindex="0" class="tab-group-label">Root</span></div><div class="tab-group-container"><div class="zen-tab-group-start"></div><zen-folder id="child"><div class="tab-group-label-container"><span class="tab-group-folder-icon"></span><span tabindex="0" class="tab-group-label">Child</span></div><div class="tab-group-container"><div class="zen-tab-group-start"></div><tab id="one" class="tabbrowser-tab" tabindex="0">One</tab><tab id="two" class="tabbrowser-tab" tabindex="0">Two</tab></div></zen-folder></div></zen-folder></div><menupopup id="zenFolderActions"></menupopup><menupopup id="tabContextMenu"></menupopup>`);
    await page.evaluate(async source=>{
      document.documentElement.setAttribute('zen-sidebar-expanded','true');
      document.documentElement.style.setProperty('--tab-min-height','36px');
      const url=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
      window.api=await import(url);URL.revokeObjectURL(url);
      const tabs=[...document.querySelectorAll('tab')],folders=[...document.querySelectorAll('zen-folder')];
      for(const f of folders){f.isZenFolder=true;f.groupContainer=f.querySelector(':scope > .tab-group-container');f.labelElement=f.querySelector(':scope > .tab-group-label-container > .tab-group-label');
        Object.defineProperties(f,{group:{get:()=>f.parentElement.closest('zen-folder')},allItems:{get:()=>[...f.groupContainer.children].filter(n=>n.matches('tab,zen-folder,tab-split-view-wrapper'))},collapsed:{get:()=>f.hasAttribute('collapsed'),set:v=>{f.toggleAttribute('collapsed',v);f.dispatchEvent(new Event(v?'TabGroupCollapse':'TabGroupExpand',{bubbles:true}));}}});}
      for(const f of folders)f.activeTabs=[];
      for(const t of tabs)Object.defineProperties(t,{group:{get:()=>t.parentElement.closest('zen-folder')},
        splitview:{get:()=>t.parentElement?.localName==='tab-split-view-wrapper'?t.parentElement:null},visible:{get:()=>{
        if(t.selected)return true;
        for(let f=t.group;f;f=f.group)if(f.collapsed&&!f.activeTabs.includes(t))return false;
        return true;
      }}});
      window.gBrowser={tabs,tabContainer:document.getElementById('tabs'),isTab:t=>t?.localName==='tab',isSplitViewWrapper:()=>false};
      let nativeItems=null;
      Object.defineProperty(gBrowser.tabContainer,'ariaFocusableItems',{get:()=>nativeItems??=(
        [...document.querySelectorAll('tab,.tab-group-label')].filter(n=>{
          if(n.localName==='tab')return n.visible;
          for(let parent=n.closest('zen-folder').group;parent;parent=parent.group)if(parent.collapsed)return false;
          return true;
        })
      )});
      gBrowser.tabContainer._invalidateCachedVisibleTabs=()=>{nativeItems=null;};
      const values=new Map(),windows=new Map();
      window.SessionStore={getCustomTabValue:(t,k)=>values.get(t)?.[k]??'',setCustomTabValue:(t,k,v)=>values.set(t,{...values.get(t),[k]:v}),getCustomWindowValue:(_,k)=>windows.get(k)??'',setCustomWindowValue:(_,k,v)=>windows.set(k,v)};
      document.createXULElement=name=>document.createElement(name);
      window.prefs={get:name=>({subfolderCollapsePolicy:'hide',folderStateChevron:'always',doubleClickRename:true,folderTitleClickDelayMs:300,showFolderColourMenuIcon:true})[name],subscribe:()=>()=>{}};
      window.root=document.getElementById('root');window.child=document.getElementById('child');
      window.one=document.getElementById('one');window.two=document.getElementById('two');
    },source);
    const result=await testFunction(page);
    assert.deepEqual(pageErrors,[],'isolated browser must not hide uncaught event-handler errors');
    return result;
  }finally{await browser.close();}
}

test('Sticky removal waits half a second, can be cancelled, and commits once without selecting the tab',{skip},()=>run(async page=>{
  await page.clock.install();
  await page.clock.pauseAt(new Date());
  await page.evaluate(()=>{
    const original=prefs.get;prefs.get=n=>n==='stickyRemovalDelaySeconds'?'0.5':original(n);
    window.manager=new api.StickyFolderVisibilityManager(window,prefs);manager.start();
    manager.setSticky(two,true);root.collapsed=true;child.collapsed=true;manager.refresh();
    window.changes=0;two.addEventListener('BetterZenFolderStickyChanged',()=>changes++);
    window.activate=()=>two.querySelector('.better-zen-folders-sticky-toggle').click();
    activate();
  });
  assert.equal(await page.evaluate(()=>manager.isSticky(two)),true,'grace keeps the actual saved state Sticky');
  assert.equal(await page.locator('#two button').getAttribute('data-bzf-sticky-pending'),'true');
  await page.clock.runFor(499);
  assert.equal(await page.evaluate(()=>manager.isSticky(two)),true);
  await page.evaluate(()=>activate());
  await page.clock.runFor(600);
  assert.deepEqual(await page.evaluate(()=>[manager.isSticky(two),changes]),[true,0],'second activation cancels removal');
  await page.evaluate(()=>activate());
  await page.clock.runFor(500);
  assert.deepEqual(await page.evaluate(()=>[manager.isSticky(two),changes,!!two.selected,two.getAttribute('data-bzf-visibility')]),[false,1,false,'hidden']);
  await page.evaluate(()=>manager.destroy());
}));

for(const interruption of ['destroy','move','disable','external-change']) test(`pending Sticky removal is cancelled on ${interruption}`,{skip},()=>run(async page=>{
  await page.clock.install();
  await page.clock.pauseAt(new Date());
  await page.evaluate(interruption=>{
    const original=prefs.get;window.enabled=true;
    prefs.get=n=>n==='stickyRemovalDelaySeconds'?'0.5':n==='stickyTabsEnabled'?enabled:original(n);
    window.manager=new api.StickyFolderVisibilityManager(window,prefs);manager.start();manager.setSticky(two,true);
    two.querySelector('.better-zen-folders-sticky-toggle').click();
    if(interruption==='destroy')manager.destroy();
    if(interruption==='move'){root.groupContainer.append(two);manager.refresh();}
    if(interruption==='disable'){enabled=false;manager.refresh();}
    if(interruption==='external-change')manager.setSticky(two,true);
  },interruption);
  await page.clock.runFor(1000);
  assert.equal(await page.evaluate(()=>manager.isSticky(two)),true,'no deferred write after the control loses its original context');
  await page.evaluate(()=>manager.destroy());
}));

test('zero Sticky removal delay acts immediately',{skip},()=>run(async page=>{
  const sticky=await page.evaluate(()=>{
    const original=prefs.get;prefs.get=n=>n==='stickyRemovalDelaySeconds'?'0':original(n);
    const manager=new api.StickyFolderVisibilityManager(window,prefs);manager.start();manager.setSticky(two,true);
    two.querySelector('.better-zen-folders-sticky-toggle').click();const value=manager.isSticky(two);manager.destroy();return value;
  });
  assert.equal(sticky,false);
}));

for(const id of ['two','child']) test(`failed deferred Sticky write restores an honest control (${id})`,{skip},()=>run(async page=>{
  await page.clock.install();await page.clock.pauseAt(new Date());
  await page.evaluate(id=>{
    const original=prefs.get;prefs.get=n=>n==='stickyRemovalDelaySeconds'?'0.5':original(n);
    window.manager=new api.StickyFolderVisibilityManager(window,prefs);manager.start();
    window.item=document.getElementById(id);manager.setSticky(item,true);window.failures=[];manager.report=e=>failures.push(e.message);
    const key=item.isZenFolder?'setCustomWindowValue':'setCustomTabValue';const write=SessionStore[key];
    SessionStore[key]=()=>{throw Error('save unavailable');};window.restoreWrite=()=>SessionStore[key]=write;
    item.querySelector('.better-zen-folders-sticky-toggle').click();
  },id);
  await page.clock.runFor(500);
  assert.deepEqual(await page.evaluate(()=>({sticky:manager.isSticky(item),pending:item.querySelector('.better-zen-folders-sticky-toggle').hasAttribute('data-bzf-sticky-pending'),failures})),{sticky:true,pending:false,failures:['save unavailable']});
  await page.evaluate(()=>{restoreWrite();item.querySelector('.better-zen-folders-sticky-toggle').click();});
  await page.clock.runFor(500);
  assert.equal(await page.evaluate(()=>manager.isSticky(item)),false,'a later retry can succeed');
  await page.evaluate(()=>manager.destroy());
}));

test('Sticky marker changes live and releases all icon decorations on unload',{skip},()=>run(async page=>{
  const actual=await page.evaluate(async()=>{
    for(const tab of [one,two]){const icon=document.createElement('span');icon.className='tab-icon-stack';tab.prepend(icon);}
    let marker='underline';const listeners=new Map(),original=prefs.get;
    prefs.get=n=>n==='stickyMarker'?marker:original(n);
    prefs.subscribe=(name,callback)=>{listeners.set(name,callback);return()=>listeners.delete(name);};
    const manager=new api.StickyFolderVisibilityManager(window,prefs);manager.start();manager.setSticky(two,true);
    const count=()=>document.querySelectorAll('.better-zen-folders-sticky-underline').length;
    const initial=count();marker='corner';listeners.get('stickyMarker')?.(marker);
    await new Promise(resolve=>setTimeout(resolve,20));const corners=count();
    marker='underline';listeners.get('stickyMarker')?.(marker);
    await new Promise(resolve=>setTimeout(resolve,20));const restored=count();
    const replacement=document.createElement('span');replacement.className='tab-icon-stack';
    const old=two.querySelector('.tab-icon-stack');old.replaceWith(replacement);
    await new Promise(resolve=>setTimeout(resolve,20));
    const replaced={newCount:replacement.children.length,oldCount:old.children.length,sticky:manager.isSticky(two)};
    manager.destroy();
    return{initial,corners,restored,replaced,leftovers:count(),subscriptions:listeners.size};
  });
  assert.deepEqual(actual,{initial:3,corners:0,restored:3,replaced:{newCount:1,oldCount:0,sticky:true},leftovers:0,subscriptions:0});
}));

test('Sticky browser projection shows path, suppresses native hiding, preserves order and restores on unload',{skip},()=>run(async page=>{
  const actual=await page.evaluate(()=>{
    if(!api.StickyFolderVisibilityManager)return {missing:true};
    const manager=new api.StickyFolderVisibilityManager(window,prefs);manager.start();
    manager.setSticky(two,true);root.collapsed=true;child.collapsed=true;
    root.groupContainer.hidden=true;child.groupContainer.hidden=true;
    manager.refresh();
    const result={one:getComputedStyle(one).display,two:getComputedStyle(two).display,
      path:child.getAttribute('data-bzf-path-only'),childCollapsed:child.collapsed,
      rootHeight:root.getBoundingClientRect().height,tabHeight:two.getBoundingClientRect().height,
      twoAria:two.getAttribute('aria-hidden'),markers:document.querySelectorAll('.better-zen-folders-sticky-toggle[aria-pressed="true"] > .better-zen-folders-sticky-ear').length,
      order:[...child.allItems].map(n=>n.id)};
    manager.destroy();result.leftovers=document.querySelectorAll('[data-bzf-visibility],.better-zen-folders-sticky-ear,.better-zen-folders-state-chevron').length;
    return result;
  });
  assert.equal(actual.missing,undefined);assert.equal(actual.one,'none');assert.notEqual(actual.two,'none');
  assert.equal(actual.path,'true');assert.equal(actual.childCollapsed,true);
  assert.ok(actual.rootHeight>=108);assert.ok(actual.tabHeight>=36);assert.notEqual(actual.twoAria,'true');
  assert.equal(actual.markers,1);assert.deepEqual(actual.order,['one','two']);assert.equal(actual.leftovers,0);
}));

test('opening a path-only header reveals that branch without expanding parent; parent cycle resets it',{skip},()=>run(async page=>{
  const actual=await page.evaluate(()=>{
    if(!api.StickyFolderVisibilityManager)return {missing:true};
    const manager=new api.StickyFolderVisibilityManager(window,prefs);manager.start();manager.setSticky(two,true);
    root.collapsed=true;manager.refresh();
    const initial=getComputedStyle(one).display;
    manager.toggleFolder(child);const opened=getComputedStyle(one).display;
    const parentStillCollapsed=root.collapsed;
    manager.toggleFolder(root);manager.toggleFolder(root);manager.refresh();
    const reset=getComputedStyle(one).display,childState=child.collapsed;
    manager.destroy();return {initial,opened,parentStillCollapsed,reset,childState};
  });
  assert.equal(actual.missing,undefined);assert.equal(actual.initial,'none');assert.notEqual(actual.opened,'none');
  assert.equal(actual.parentStillCollapsed,true);assert.equal(actual.reset,'none');assert.equal(actual.childState,false);
}));

test('Sticky menu uses a check only regardless of decorative icons and excludes Essentials',{skip},()=>run(async page=>{
  const actual=await page.evaluate(()=>{
    const manager=new api.StickyFolderVisibilityManager(window,prefs);manager.start();
    window.TabContextMenu={contextTab:two};
    const menu=document.getElementById('tabContextMenu');manager.showMenu({target:menu});
    const item=document.getElementById('better-zen-folders-sticky-tab');
    const before={type:item.getAttribute('type'),checked:item.getAttribute('checked'),icon:item.getAttribute('image')};
    item.dispatchEvent(new Event('command'));manager.showMenu({target:menu});
    const checked=item.getAttribute('checked');
    const original=prefs.get;prefs.get=n=>n==='showFolderColourMenuIcon'?false:original(n);
    manager.showMenu({target:menu});const disabledIcon=item.getAttribute('image');
    two.setAttribute('zen-essential','true');manager.showMenu({target:menu});
    const hidden=item.hidden;manager.destroy();
    return {before,checked,disabledIcon,hidden};
  });
  assert.equal(actual.before.type,'checkbox');assert.equal(actual.before.checked,null);
  assert.equal(actual.before.icon,null);assert.equal(actual.checked,'true');
  assert.equal(actual.disabledIcon,null);assert.equal(actual.hidden,true);
}));

test('first tab popup uses the background trigger after native context initialisation, not a stale tab',{skip},()=>run(async page=>{
  const actual=await page.evaluate(()=>{
    const menu=document.getElementById('tabContextMenu');
    window.TabContextMenu={contextTab:null};gBrowser.selectedTab=one;
    // Installed main-popupset.js updates contextTab on the popup target, not
    // on window capture. Keep that ordering in this regression fixture.
    menu.addEventListener('popupshowing',()=>{TabContextMenu.contextTab=menu.triggerNode.closest('tab');});
    const manager=new api.StickyFolderVisibilityManager(window,prefs);manager.start();
    menu.triggerNode=two;menu.dispatchEvent(new Event('popupshowing',{bubbles:true}));
    const command=document.getElementById('better-zen-folders-sticky-tab');
    const firstVisible=command?.hidden===false;
    command?.dispatchEvent(new Event('command'));
    const first=[manager.isSticky(one),manager.isSticky(two),gBrowser.selectedTab.id];
    menu.triggerNode=one;menu.dispatchEvent(new Event('popupshowing',{bubbles:true}));
    command?.dispatchEvent(new Event('command'));
    const second=[manager.isSticky(one),manager.isSticky(two)];
    manager.destroy();return {firstVisible,first,second};
  });
  assert.deepEqual(actual,{firstVisible:true,first:[false,true,'one'],second:[true,true]});
}));

test('keyboard popup uses freshly initialised native tab context when no trigger is available',{skip},()=>run(async page=>{
  const actual=await page.evaluate(()=>{
    const menu=document.getElementById('tabContextMenu');
    window.TabContextMenu={contextTab:two};gBrowser.selectedTab=one;
    menu.addEventListener('popupshowing',()=>{TabContextMenu.contextTab=gBrowser.selectedTab;});
    const manager=new api.StickyFolderVisibilityManager(window,prefs);manager.start();
    menu.dispatchEvent(new Event('popupshowing',{bubbles:true}));
    document.getElementById('better-zen-folders-sticky-tab')?.dispatchEvent(new Event('command'));
    const result=[manager.isSticky(one),manager.isSticky(two)];
    manager.destroy();return result;
  });
  assert.deepEqual(actual,[true,false]);
}));

test('folder popup resolves its trigger even when explicitOriginalTarget is the popup, and never reuses a stale folder',{skip},()=>run(async page=>{
  const actual=await page.evaluate(()=>{
    const menu=document.getElementById('zenFolderActions');
    const manager=new api.StickyFolderVisibilityManager(window,prefs);manager.start();
    const show=trigger=>{
      menu.triggerNode=trigger;
      const event=new Event('popupshowing',{bubbles:true});
      Object.defineProperty(event,'explicitOriginalTarget',{value:menu});
      menu.dispatchEvent(event);
    };
    show(child.querySelector('.tab-group-folder-icon'));
    const command=document.getElementById('better-zen-folders-sticky-folder');
    const visible=command?.hidden===false;
    command?.dispatchEvent(new Event('command'));
    const sticky=manager.isSticky(child);
    show(document.body);
    const invalidHidden=command?.hidden;
    command?.dispatchEvent(new Event('command'));
    const unchanged=manager.isSticky(child);
    manager.destroy();return {visible,sticky,invalidHidden,unchanged};
  });
  assert.deepEqual(actual,{visible:true,sticky:true,invalidHidden:true,unchanged:true});
}));

test('folder popup supports native label group and later event/popupNode fallback targets',{skip},()=>run(async page=>{
  const actual=await page.evaluate(()=>{
    const menu=document.getElementById('zenFolderActions');
    const manager=new api.StickyFolderVisibilityManager(window,prefs);manager.start();
    const results=[];
    for(const route of ['explicitOriginalTarget','originalTarget','popupNode']) {
      const event=new Event('popupshowing',{bubbles:true});
      Object.defineProperty(event,'explicitOriginalTarget',{value:route==='explicitOriginalTarget'?{group:child}:menu});
      if(route==='originalTarget')Object.defineProperty(event,'originalTarget',{value:child.labelElement});
      Object.defineProperty(document,'popupNode',{configurable:true,value:route==='popupNode'?child.labelElement:null});
      menu.dispatchEvent(event);
      const command=document.getElementById('better-zen-folders-sticky-folder');
      command?.dispatchEvent(new Event('command'));
      results.push(command?.hidden===false && manager.isSticky(child));
      manager.setSticky(child,false);
    }
    manager.destroy();return results;
  });
  assert.deepEqual(actual,[true,true,true]);
}));

test('dog-ear follows the parent guide without moving the tab; title leaves room for chevron',{skip},()=>run(async page=>{
  const actual=await page.evaluate(()=>{
    document.body.style.width='300px';
    document.documentElement.style.setProperty('--tab-group-line-thickness','1px');
    child.labelElement.setAttribute('aria-expanded','true');
    const before=two.getBoundingClientRect().x;
    const manager=new api.StickyFolderVisibilityManager(window,prefs);manager.start();manager.setSticky(two,true);
    const ear=two.querySelector('.better-zen-folders-sticky-ear').getBoundingClientRect();
    const line=child.groupContainer.getBoundingClientRect();
    const guideOffset=parseFloat(getComputedStyle(child.groupContainer,'::before').insetInlineStart)||0;
    const chevron=child.querySelector('.better-zen-folders-state-chevron').getBoundingClientRect();
    const label=child.labelElement.getBoundingClientRect();
    const result={before,after:two.getBoundingClientRect().x,gap:ear.left-line.left-guideOffset-1,earTop:ear.top,rowTop:two.getBoundingClientRect().top,
      earWidth:ear.width,chevronLeft:chevron.left,labelRight:label.right};
    manager.destroy();return result;
  });
  assert.equal(actual.before,actual.after);
  assert.equal(actual.gap,0,JSON.stringify(actual));
  assert.ok(actual.earTop>=actual.rowTop&&actual.earTop<=actual.rowTop+2);
  assert.ok(actual.earWidth>6 && actual.earWidth<15);
  assert.ok(actual.labelRight<=actual.chevronLeft);
}));

test('gutter hover previews the ear and pointer activation toggles a background tab without selecting it',{skip},()=>run(async page=>{
  await page.setViewportSize({width:420,height:260});
  await page.evaluate(()=>{
    document.body.style.padding='32px';
    window.manager=new api.StickyFolderVisibilityManager(window,prefs);manager.start();
    gBrowser.selectedTab=one;window.nativeRowEvents=[];
    for(const type of ['pointerdown','mousedown','mouseup','click','dblclick','auxclick','dragstart']) {
      two.addEventListener(type,()=>{nativeRowEvents.push(type);gBrowser.selectedTab=two;});
    }
  });
  const button=page.locator('#two > .better-zen-folders-sticky-toggle');
  assert.equal(await button.count(),1,'unselected, non-Sticky folder tabs need a gutter toggle');
  const before=await page.locator('#two').boundingBox();
  const ear=button.locator('.better-zen-folders-sticky-ear');
  assert.equal(await ear.evaluate(n=>getComputedStyle(n).opacity),'0');
  await page.locator('#two').hover();
  assert.equal(await ear.evaluate(n=>getComputedStyle(n).opacity),'0','row hover must not reveal the gutter preview');
  await saveGutterPreview(page,'off');
  await button.hover();
  const preview=Number(await ear.evaluate(n=>getComputedStyle(n).opacity));
  assert.ok(preview>0&&preview<1);
  await saveGutterPreview(page,'hover');
  await button.click();
  await page.mouse.move(500,400);
  assert.equal(await button.getAttribute('aria-pressed'),'true');
  assert.equal(await ear.evaluate(n=>getComputedStyle(n).opacity),'1');
  await saveGutterPreview(page,'sticky');
  await button.click();
  await page.mouse.move(500,400);
  assert.equal(await button.getAttribute('aria-pressed'),'false');
  assert.equal(await ear.evaluate(n=>getComputedStyle(n).opacity),'0');
  const after=await page.locator('#two').boundingBox();
  const result=await page.evaluate(()=>({selected:gBrowser.selectedTab.id,events:nativeRowEvents,
    order:child.allItems.map(n=>n.id),sticky:manager.isSticky(two)}));
  assert.deepEqual(result,{selected:'one',events:[],order:['one','two'],sticky:false});
  assert.deepEqual(after,before);
}));

test('every physical Sticky click toggles even within a multi-click sequence',{skip},()=>run(async page=>{
  const actual=await page.evaluate(()=>{
    const manager=new api.StickyFolderVisibilityManager(window,prefs);manager.start();
    gBrowser.selectedTab=one;
    const button=two.querySelector('.better-zen-folders-sticky-toggle'),states=[];
    for(const detail of [1,2,3,4,1]){
      button.dispatchEvent(new MouseEvent('click',{button:0,detail,bubbles:true,cancelable:true}));
      states.push(manager.isSticky(two));
    }
    button.dispatchEvent(new MouseEvent('dblclick',{button:0,detail:2,bubbles:true,cancelable:true}));
    const afterDouble=manager.isSticky(two),selected=gBrowser.selectedTab.id;
    manager.destroy();return {states,afterDouble,selected};
  });
  assert.deepEqual(actual,{states:[true,false,true,false,true],afterDouble:true,selected:'one'});
}));

test('disabling Sticky Tabs or Folders hides only their controls and makes saved flags dormant',{skip},()=>run(async page=>{
  const actual=await page.evaluate(()=>{
    const original=prefs.get,settings={stickyTabsEnabled:true,stickyFoldersEnabled:true},listeners=new Map();
    prefs.get=name=>name in settings?settings[name]:original(name);
    prefs.subscribe=(name,fn)=>{listeners.set(name,fn);return()=>listeners.delete(name);};
    const manager=new api.StickyFolderVisibilityManager(window,prefs);manager.start();
    manager.setSticky(two,true);manager.setSticky(child,true);root.collapsed=true;child.collapsed=true;manager.refresh();
    const capture=()=>({tab:getComputedStyle(two).display!=='none',folder:getComputedStyle(child).display!=='none',
      tabControl:!!two.querySelector('.better-zen-folders-sticky-toggle'),
      folderControl:!!child.querySelector(':scope > .tab-group-label-container > .better-zen-folders-sticky-toggle'),
      remembered:[manager.isSticky(two),manager.isSticky(child)]});
    const states=[capture()];
    settings.stickyTabsEnabled=false;listeners.get('stickyTabsEnabled')?.();manager.refresh();states.push(capture());
    settings.stickyFoldersEnabled=false;listeners.get('stickyFoldersEnabled')?.();manager.refresh();states.push(capture());
    settings.stickyTabsEnabled=true;listeners.get('stickyTabsEnabled')?.();manager.refresh();states.push(capture());
    settings.stickyFoldersEnabled=true;listeners.get('stickyFoldersEnabled')?.();manager.refresh();states.push(capture());
    manager.destroy();return states;
  });
  assert.deepEqual(actual,[
    {tab:true,folder:true,tabControl:true,folderControl:true,remembered:[true,true]},
    {tab:false,folder:true,tabControl:false,folderControl:true,remembered:[true,true]},
    {tab:false,folder:false,tabControl:false,folderControl:false,remembered:[true,true]},
    {tab:true,folder:true,tabControl:true,folderControl:false,remembered:[true,true]},
    {tab:true,folder:true,tabControl:true,folderControl:true,remembered:[true,true]},
  ]);
}));

test('folder gutter toggle preserves collapsed state and native keyboard activation works once',{skip},()=>run(async page=>{
  await page.evaluate(()=>{
    document.body.style.padding='32px';
    window.manager=new api.StickyFolderVisibilityManager(window,prefs);manager.start();
    child.collapsed=true;manager.refresh();window.headerEvents=[];
    child.labelElement.parentElement.addEventListener('click',()=>{headerEvents.push('click');child.collapsed=!child.collapsed;});
  });
  const button=page.locator('#child > .tab-group-label-container > .better-zen-folders-sticky-toggle');
  assert.equal(await button.count(),1,'nested folders need their own gutter toggle');
  await button.click();
  assert.deepEqual(await page.evaluate(()=>[manager.isSticky(child),child.collapsed,headerEvents]),[true,true,[]]);
  await button.focus();
  assert.equal(await button.getAttribute('aria-label'),'Sticky Folder');
  assert.notEqual(await button.evaluate(n=>getComputedStyle(n).outlineStyle),'none');
  await page.keyboard.press('Enter');
  assert.equal(await button.getAttribute('aria-pressed'),'false');
  await page.keyboard.press('Space');
  assert.deepEqual(await page.evaluate(()=>[manager.isSticky(child),child.collapsed,headerEvents]),[true,true,[]]);
}));

test('Gecko system-group activation cannot click a retained folder ARIA target and is removed on unload',{skip},()=>run(async page=>{
  const actual=await page.evaluate(()=>{
    // Chromium has no Gecko event groups. Model the second dispatch explicitly,
    // including the installed tabs.js retained ariaFocusedItem Enter/Space path.
    const add=window.addEventListener.bind(window),remove=window.removeEventListener.bind(window);
    const system=[];
    window.addEventListener=(type,fn,options)=>options?.mozSystemGroup
      ?system.push({type,fn,options}):add(type,fn,options);
    window.removeEventListener=(type,fn,options)=>{
      if(!options?.mozSystemGroup)return remove(type,fn,options);
      const index=system.findIndex(row=>row.type===type&&row.fn===fn&&row.options.capture===options.capture);
      if(index>=0)system.splice(index,1);
    };
    const manager=new api.StickyFolderVisibilityManager(window,prefs);manager.start();
    child.collapsed=true;manager.refresh();
    gBrowser.tabContainer.ariaFocusedItem=child.labelElement;
    const button=child.labelElement.parentElement.querySelector('.better-zen-folders-sticky-toggle');
    button.focus();
    let headerClicks=0;
    child.labelElement.addEventListener('click',()=>headerClicks++);
    const defaultActions=[],states=[];
    for(const key of ['Enter',' ']){
      let defaultPrevented=false;
      for(const type of ['keydown','keypress','keyup']){
        button.dispatchEvent(new KeyboardEvent(type,{key,bubbles:true,cancelable:true}));
        // Gecko resets propagation-stop flags between ordinary/system groups.
        let stopped=false;
        const event={type,key,target:button,get defaultPrevented(){return defaultPrevented;},
          preventDefault(){defaultPrevented=true;},stopImmediatePropagation(){stopped=true;}};
        for(const listener of system.filter(row=>row.type===type&&row.options.capture)){
          listener.fn(event);if(stopped)break;
        }
        if(!stopped&&type==='keydown'){
          gBrowser.tabContainer.ariaFocusedItem.click();event.preventDefault();
        }
        if(!stopped&&type==='keypress'&&!defaultPrevented){event.preventDefault();button.click();}
      }
      // Default button activation is preserved, not manually implemented by BZF.
      defaultActions.push(!defaultPrevented);if(!defaultPrevented)button.click();
      states.push({collapsed:child.collapsed,sticky:manager.isSticky(child)});
    }
    const result={collapsed:child.collapsed,sticky:manager.isSticky(child),headerClicks,defaultActions,states};
    manager.destroy();result.remainingSystemListeners=system.length;return result;
  });
  assert.deepEqual(actual,{collapsed:true,sticky:false,headerClicks:0,defaultActions:[true,true],
    states:[{collapsed:true,sticky:true},{collapsed:true,sticky:false}],remainingSystemListeners:0});
}));

test('gutter controls exclude Essentials and placeholders, ignore middle/drag, and clean up on departure/unload',{skip},()=>run(async page=>{
  const actual=await page.evaluate(()=>{
    window.manager=new api.StickyFolderVisibilityManager(window,prefs);manager.start();
    const button=two.querySelector('.better-zen-folders-sticky-toggle');
    if(!button)return {missing:true};
    let leaked=0;two.addEventListener('auxclick',()=>leaked++);two.addEventListener('dragstart',()=>leaked++);
    button.dispatchEvent(new MouseEvent('auxclick',{button:1,bubbles:true,cancelable:true}));
    button.dispatchEvent(new Event('dragstart',{bubbles:true,cancelable:true}));
    const ignored=!manager.isSticky(two)&&leaked===0;
    one.setAttribute('zen-essential','true');manager.refresh();
    const essential=!one.querySelector('.better-zen-folders-sticky-toggle');
    two.setAttribute('zen-empty-tab','true');manager.refresh();
    const placeholder=!two.querySelector('.better-zen-folders-sticky-toggle');
    two.removeAttribute('zen-empty-tab');manager.refresh();
    manager.setSticky(two,true);gBrowser.tabContainer.appendChild(two);manager.refresh();
    const departed=!two.querySelector('.better-zen-folders-sticky-toggle')&&manager.isSticky(two);
    manager.destroy();const leftovers=document.querySelectorAll('.better-zen-folders-sticky-toggle').length;
    return {ignored,essential,placeholder,departed,leftovers};
  });
  assert.deepEqual(actual,{ignored:true,essential:true,placeholder:true,departed:true,leftovers:0});
}));

test('keyboard unstick of the last visible child returns focus to its folder header',{skip},()=>run(async page=>{
  await page.evaluate(()=>{
    window.manager=new api.StickyFolderVisibilityManager(window,prefs);manager.start();
    manager.setSticky(two,true);child.collapsed=true;manager.refresh();
  });
  const button=page.locator('#two > .better-zen-folders-sticky-toggle');
  assert.equal(await button.count(),1,'Sticky tab needs a keyboard-operable toggle');
  await button.focus();await page.keyboard.press('Space');
  assert.deepEqual(await page.evaluate(()=>({sticky:manager.isSticky(two),display:getComputedStyle(two).display,
    focus:document.activeElement===child.labelElement,collapsed:child.collapsed})),
    {sticky:false,display:'none',focus:true,collapsed:true});
}));

test('native tab clipping leaves the gutter clickable but collapsed sidebar removes its hitbox',{skip},()=>run(async page=>{
  const actual=await page.evaluate(()=>{
    document.body.style.padding='32px';
    const native=document.createElement('style');
    native.textContent='.tabbrowser-tab { overflow: clip; overflow-clip-margin: 4px; }';
    document.head.appendChild(native);
    const manager=new api.StickyFolderVisibilityManager(window,prefs);manager.start();
    const button=two.querySelector('.better-zen-folders-sticky-toggle');
    const box=button.getBoundingClientRect();
    const hit=()=>document.elementFromPoint(box.x+box.width/2,box.y+box.height/2);
    const expanded=hit()===button;
    const line=child.groupContainer.getBoundingClientRect();
    const offset=parseFloat(getComputedStyle(child.groupContainer,'::before').insetInlineStart)||13;
    const row=two.getBoundingClientRect();
    const atCorner=box.left===row.left-14&&box.right===row.left+13&&box.height<row.height;
    document.documentElement.removeAttribute('zen-sidebar-expanded');
    const collapsed=hit()===button;
    manager.destroy();return {expanded,atCorner,collapsed};
  });
  assert.deepEqual(actual,{expanded:true,atCorner:true,collapsed:false});
}));

test('a split row has one gutter control and preserves background selection while toggling its real tabs',{skip},()=>run(async page=>{
  const actual=await page.evaluate(()=>{
    const manager=new api.StickyFolderVisibilityManager(window,prefs);manager.start();
    const outside=document.createElement('tab');outside.id='outside';gBrowser.tabContainer.appendChild(outside);
    gBrowser.selectedTab=outside;
    child.collapsed=true;manager.refresh();
    const split=document.createElement('tab-split-view-wrapper');split.id='split';
    child.groupContainer.appendChild(split);split.append(one,two);split.tabs=[one,two];
    Object.defineProperty(split,'group',{get:()=>split.parentElement.closest('zen-folder')});
    gBrowser.isSplitViewWrapper=node=>node?.localName==='tab-split-view-wrapper';
    manager.setSticky(two,true);manager.refresh();
    const controls=split.querySelectorAll('.better-zen-folders-sticky-toggle').length;
    const childrenVisible=[one,two].every(tab=>getComputedStyle(tab).display!=='none');
    const button=split.querySelector(':scope > .better-zen-folders-sticky-toggle');
    button.click();const off=[manager.isSticky(one),manager.isSticky(two)];
    child.collapsed=false;manager.refresh();button.click();
    const on=[manager.isSticky(one),manager.isSticky(two)];
    const selected=gBrowser.selectedTab.id;
    manager.destroy();return {controls,childrenVisible,off,on,selected};
  });
  assert.deepEqual(actual,{controls:1,childrenVisible:true,off:[false,false],on:[true,true],selected:'outside'});
}));

test('keyboard opening of path-only header, click isolation and focus fallback are coherent',{skip},()=>run(async page=>{
  const actual=await page.evaluate(()=>{
    const manager=new api.StickyFolderVisibilityManager(window,prefs);manager.start();manager.setSticky(two,true);
    root.collapsed=true;manager.refresh();
    child.labelElement.focus();child.labelElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
    const shown=getComputedStyle(one).display;
    const button=document.createElement('button');button.className='better-zen-folders-new-tab-button';
    button.setAttribute('data-better-zen-folders-owned','true');child.labelElement.parentElement.appendChild(button);
    button.click();const afterButton=child.collapsed;
    manager.setSticky(two,false);manager.exposure.clear();manager.refresh();
    const focused=document.activeElement===root.labelElement;
    manager.destroy();return {shown,afterButton,focused};
  });
  assert.notEqual(actual.shown,'none');assert.equal(actual.afterButton,false);assert.equal(actual.focused,true);
}));

test('native tab visibility recognises Sticky through every collapsed ancestor and cleans up only owned additions',{skip},()=>run(async page=>{
  const actual=await page.evaluate(()=>{
    const manager=new api.StickyFolderVisibilityManager(window,prefs);manager.start();
    child.activeTabs=[one];root.activeTabs=[one];one.setAttribute('folder-active','true');
    root.collapsed=true;child.collapsed=true;manager.setSticky(two,true);manager.refresh();
    const visible=two.visible,parents=[root.activeTabs.includes(two),child.activeTabs.includes(two)];
    manager.setSticky(two,false);const noLongerVisible=two.visible;
    const keptNative=root.activeTabs.includes(one)&&child.activeTabs.includes(one);
    manager.setSticky(two,true);manager.destroy();
    return {visible,parents,noLongerVisible,keptNative,after:two.visible,nativeFlag:one.getAttribute('folder-active')};
  });
  assert.equal(actual.visible,true);assert.deepEqual(actual.parents,[true,true]);
  assert.equal(actual.noLongerVisible,false);assert.equal(actual.keptNative,true);
  assert.equal(actual.after,false);assert.equal(actual.nativeFlag,'true');
}));

test('native focus/drop list contains projected headers, preserves DOM order, and refreshes after cache invalidation',{skip},()=>run(async page=>{
  const actual=await page.evaluate(()=>{
    const manager=new api.StickyFolderVisibilityManager(window,prefs);manager.start();
    root.collapsed=true;child.collapsed=true;manager.setSticky(two,true);manager.refresh();
    const ids=()=>gBrowser.tabContainer.ariaFocusableItems.map(n=>n.id||n.closest('zen-folder').id+'-header');
    const first=ids();gBrowser.tabContainer._invalidateCachedVisibleTabs();
    const drag=new Event('dragover',{bubbles:true});Object.defineProperty(drag,'dataTransfer',{value:{types:['application/x-moz-tabbrowser-tab']}});
    child.labelElement.dispatchEvent(drag);const rebuilt=ids();
    manager.destroy();return {first,rebuilt,after:ids()};
  });
  assert.deepEqual(actual.first,['root-header','child-header','two']);
  assert.deepEqual(actual.rebuilt,actual.first);
  assert.deepEqual(actual.after,['root-header']);
}));

test('unload retains a formerly Sticky child that has since become natively selected',{skip},()=>run(async page=>{
  const actual=await page.evaluate(()=>{
    const manager=new api.StickyFolderVisibilityManager(window,prefs);manager.start();
    root.collapsed=true;child.collapsed=true;manager.setSticky(two,true);
    two.selected=true;manager.refresh();manager.destroy();
    return {selected:two.visible,flag:two.getAttribute('folder-active'),root:root.activeTabs.includes(two)};
  });
  assert.equal(actual.selected,true);assert.equal(actual.root,true);assert.equal(actual.flag,'true');
}));

test('Sticky contributions do not trip the installed native select-all-active auto-expansion guard',{skip},()=>run(async page=>{
  const actual=await page.evaluate(async()=>{
    const manager=new api.StickyFolderVisibilityManager(window,prefs);manager.start();
    root.collapsed=true;child.collapsed=true;manager.setSticky(two,true);manager.refresh();
    const nativeGuard=()=>{
      const active=new Set([...(child.activeTabs??[]),one]);
      if(child.collapsed && [one,two].every(tab=>active.has(tab)||tab.selected||tab.multiselected||tab.hasAttribute('folder-active')))child.collapsed=false;
    };
    window.addEventListener('TabSelect',nativeGuard);
    one.selected=true;one.dispatchEvent(new Event('TabSelect',{bubbles:true}));
    await new Promise(r=>setTimeout(r,0));
    window.removeEventListener('TabSelect',nativeGuard);
    const result={collapsed:child.collapsed,stickyVisible:two.visible};
    manager.destroy();return result;
  });
  assert.deepEqual(actual,{collapsed:true,stickyVisible:true});
}));

test('moving hidden and Sticky split rows outside folders clears projection but retains constituent flags',{skip},()=>run(async page=>{
  const actual=await page.evaluate(()=>{
    const split=document.createElement('tab-split-view-wrapper');split.id='split';
    child.groupContainer.appendChild(split);split.append(one,two);split.tabs=[one,two];
    Object.defineProperty(split,'group',{get:()=>split.parentElement.closest('zen-folder')});
    gBrowser.isSplitViewWrapper=node=>node?.localName==='tab-split-view-wrapper';
    const manager=new api.StickyFolderVisibilityManager(window,prefs);manager.start();child.collapsed=true;manager.refresh();
    const hidden=getComputedStyle(split).display;
    gBrowser.tabContainer.appendChild(split);manager.refresh();
    const outsideHidden=split.getAttribute('data-bzf-visibility');
    child.groupContainer.appendChild(split);manager.setSticky(two,true);manager.refresh();
    gBrowser.tabContainer.appendChild(split);manager.refresh();
    const result={hidden,outsideHidden,ear:!!split.querySelector('.better-zen-folders-sticky-ear'),
      sticky:manager.isSticky(two),aria:two.getAttribute('aria-hidden')};
    manager.destroy();return result;
  });
  assert.equal(actual.hidden,'none');assert.equal(actual.outsideHidden,null);
  assert.equal(actual.ear,false);assert.equal(actual.sticky,true);assert.notEqual(actual.aria,'true');
}));

for(const rememberedCollapsed of [true,false])test(`drag temporarily reveals path-only branch (remembered collapsed=${rememberedCollapsed}) and restores it on cancel`,{skip},()=>run(async page=>{
  const actual=await page.evaluate(async rememberedCollapsed=>{
    const manager=new api.StickyFolderVisibilityManager(window,prefs);manager.start();manager.setSticky(two,true);
    root.collapsed=true;child.collapsed=rememberedCollapsed;manager.refresh();
    const adapters=api.createBrowserCollapsedFolderDragGuardAdapters(window,prefs,manager);
    adapters.getHoverDelayMs=()=>0;
    const guard=new api.CollapsedFolderDragGuard(adapters);guard.start();
    // Native startTabDrag initializes the initiating tab before the guard's listener.
    one.documentGlobal=window;
    one._dragData={movingTabs:[one],movingTabsSet:new Set([one]),fromTabList:false};
    guard.beginDrag({target:one,dataTransfer:{types:['application/x-moz-tabbrowser-tab']}});
    guard.trackFolder(child);
    await new Promise(r=>setTimeout(r,5));manager.refresh();
    const opened=getComputedStyle(one).display;
    guard.cleanupDrag();manager.refresh();
    const result={opened,after:getComputedStyle(one).display,child:child.collapsed,root:root.collapsed};
    guard.destroy();manager.destroy();return result;
  },rememberedCollapsed);
  assert.notEqual(actual.opened,'none');assert.equal(actual.after,'none');
  assert.equal(actual.child,rememberedCollapsed);assert.equal(actual.root,true);
}));

test('a membership-confirmed drop commits a drag-exposed nested branch without opening its parent',{skip},()=>run(async page=>{
  const actual=await page.evaluate(async()=>{
    const manager=new api.StickyFolderVisibilityManager(window,prefs);manager.start();manager.setSticky(two,true);
    root.collapsed=true;child.collapsed=true;manager.refresh();
    const external=document.createElement('tab');external.id='external';gBrowser.tabContainer.appendChild(external);
    external.documentGlobal=window;Object.defineProperty(external,'group',{get:()=>external.parentElement.closest('zen-folder')});
    gBrowser.tabs.push(external);
    const adapters=api.createBrowserCollapsedFolderDragGuardAdapters(window,prefs,manager);adapters.getHoverDelayMs=()=>0;
    const guard=new api.CollapsedFolderDragGuard(adapters);guard.start();
    const dataTransfer={types:['application/x-moz-tabbrowser-tab'],dropEffect:'move'};
    // This direct guard call bypasses native startTabDrag; supply its source-owned session.
    external._dragData={movingTabs:[external],movingTabsSet:new Set([external]),fromTabList:false};
    guard.beginDrag({target:external,dataTransfer});guard.trackFolder(child);
    await new Promise(r=>setTimeout(r,5));
    guard.prepareDrop({target:child.labelElement,dataTransfer});child.groupContainer.appendChild(external);
    await new Promise(r=>setTimeout(r,5));manager.refresh();
    const result={child:child.collapsed,root:root.collapsed,ordinary:getComputedStyle(one).display,
      owned:manager.dragExposure.size,exposed:manager.exposure.has(child),sticky:manager.isSticky(external)};
    guard.destroy();manager.destroy();return result;
  });
  assert.equal(actual.child,false);assert.equal(actual.root,true);assert.notEqual(actual.ordinary,'none');
  assert.equal(actual.owned,0);assert.equal(actual.exposed,true);assert.equal(actual.sticky,false);
}));

test('focus/drop projection respects clipped collapsed pinned sections and inactive workspaces',{skip},()=>run(async page=>{
  const actual=await page.evaluate(()=>{
    const workspace=document.createElement('zen-workspace'),pins=document.createElement('div');
    pins.className='zen-workspace-pinned-tabs-section';workspace.setAttribute('active','true');
    gBrowser.tabContainer.appendChild(workspace);workspace.appendChild(pins);pins.appendChild(root);
    window.gZenWorkspaces={activeWorkspaceElement:workspace};
    const manager=new api.StickyFolderVisibilityManager(window,prefs);manager.start();
    root.collapsed=true;child.collapsed=true;manager.setSticky(two,true);manager.refresh();
    const list=gBrowser.tabContainer.ariaFocusableItems;list.splice(0);
    workspace.hasCollapsedPinnedTabs=true;pins.style.height='0px';pins.style.overflow='clip';
    const positiveRect=two.getBoundingClientRect().height>0;
    manager.projectNativeFocusableItems();const clipped=list.length;
    workspace.hasCollapsedPinnedTabs=false;pins.style.height='';manager.projectNativeFocusableItems();
    const open=list.map(n=>n.id||n.closest('zen-folder').id+'-header'),indices=list.map(n=>n.elementIndex);
    list.splice(0);gZenWorkspaces.activeWorkspaceElement=document.createElement('zen-workspace');
    manager.projectNativeFocusableItems();const inactive=list.length;
    manager.destroy();return {positiveRect,clipped,open,indices,inactive};
  });
  assert.equal(actual.positiveRect,true);assert.equal(actual.clipped,0);
  assert.deepEqual(actual.open,['child-header','two']);assert.deepEqual(actual.indices,[0,1]);assert.equal(actual.inactive,0);
}));

for (const [headerHeight,cancellation] of [['auto','none'],['native','none'],['native','before-collection'],['native','after-collection']]) test(`opening a Sticky projection measures visible rows before native expansion (${headerHeight} header, cancel ${cancellation})`,{skip},()=>run(async page=>{
  await page.evaluate(async ({nativeSource,headerHeight,cancellation})=>{
    window.windowUtils={getBoundsWithoutFlushing:node=>node.getBoundingClientRect()};
    const url=URL.createObjectURL(new Blob([nativeSource],{type:'text/javascript'}));
    await import(url);URL.revokeObjectURL(url);
    // Only unrelated icon painting/indentation services are stubbed. All native
    // collapse/expand collection, measurement, WAAPI and final style writes run.
    gBrowser.isTabGroup=node=>node?.isZenFolder===true;
    gBrowser.isTabGroupLabel=node=>node?.classList?.contains('tab-group-label')===true;
    for(const folder of [root,child]){
      folder.labelElement.group=folder;
      Object.defineProperties(folder,{
        groupStartElement:{get:()=>folder.groupContainer.firstElementChild},
        childGroupsAndTabs:{get:()=>[...folder.groupContainer.querySelectorAll('tab,.tab-group-label')]},
        childActiveGroups:{get:()=>[...folder.groupContainer.querySelectorAll('zen-folder[has-active]')]},
        activeGroups:{get:()=>[]},
      });
    }
    root.groupContainer.insertBefore(two,child);
    child.labelElement.parentElement.style.minHeight='0';
    if(headerHeight==='native'){
      const nativeStyle=document.createElement('style');
      nativeStyle.textContent='#child > .tab-group-label-container { height: calc(var(--tab-min-height) + 0px); }';
      document.head.appendChild(nativeStyle);
    }
    window.manager=new api.StickyFolderVisibilityManager(window,prefs);manager.start();
    manager.setSticky(two,true);
    window.pendingNative=[];
    window.addEventListener('TabGroupCollapse',e=>pendingNative.push(gZenFolders.on_TabGroupCollapse(e)));
    window.addEventListener('TabGroupExpand',e=>pendingNative.push(gZenFolders.on_TabGroupExpand(e)));
    if(cancellation!=='none')window.addEventListener('TabGroupExpand',e=>{
      const cancel=()=>e.target.groupStartElement.getAnimations().forEach(animation=>animation.cancel());
      if(cancellation==='before-collection')cancel();else queueMicrotask(cancel);
    });
    root.collapsed=true;
    await Promise.all(pendingNative);manager.refresh();
  },{nativeSource:nativeFolders,headerHeight,cancellation});
  const frames=await page.evaluate(async()=>{
    // Native collapse stores a negative group-start offset even though BZF's
    // collapsed CSS uses actual hidden rows. It must never flash back on expand.
    const before={offset:root.groupStartElement.style.marginTop,height:root.getBoundingClientRect().height};
    root.collapsed=false;
    const samples=[];
    for(let i=0;i<18;i++){
      await new Promise(requestAnimationFrame);
      const header=root.labelElement.parentElement.getBoundingClientRect();
      const folderLabel=child.labelElement.getBoundingClientRect(),a=one.getBoundingClientRect(),b=two.getBoundingClientRect();
      samples.push({headerBottom:header.bottom,firstTop:b.top,childTop:a.top,folderLabelBottom:folderLabel.bottom,
        childHeaderHeight:child.labelElement.parentElement.getBoundingClientRect().height,
        margin:getComputedStyle(root.groupStartElement).marginTop});
    }
    await Promise.all(pendingNative);
    const after={height:root.getBoundingClientRect().height,collapsed:root.collapsed,
      projection:root.getAttribute('data-bzf-projection'),order:root.allItems.map(n=>n.id),
      childHeight:child.labelElement.parentElement.getBoundingClientRect().height,
      tabHeight:one.getBoundingClientRect().height};
    manager.destroy();return {before,samples,after};
  });
  assert.ok(frames.samples.every(f=>f.firstTop>=f.headerBottom-0.5),JSON.stringify(frames));
  assert.ok(frames.samples.every(f=>f.childTop>=f.folderLabelBottom-0.5),JSON.stringify(frames));
  assert.equal(frames.after.collapsed,false);assert.equal(frames.after.projection,null);
  assert.deepEqual(frames.after.order,['two','child']);
  assert.equal(frames.after.childHeight,36,'folder label must recover its natural row height');
  assert.equal(frames.after.tabHeight,36,'newly revealed child must recover its natural row height');
}));

test('Sticky accordion leaves retained rows full-height and finishes in the latest clicked state',{skip},()=>run(async page=>{
  const result=await page.evaluate(async nativeSource=>{
    window.windowUtils={getBoundsWithoutFlushing:node=>node.getBoundingClientRect()};
    const url=URL.createObjectURL(new Blob([nativeSource],{type:'text/javascript'}));await import(url);URL.revokeObjectURL(url);
    gBrowser.isTabGroup=n=>n?.isZenFolder===true;gBrowser.isTabGroupLabel=n=>n?.classList?.contains('tab-group-label');
    for(const f of [root,child]){
      f.labelElement.group=f;
      Object.defineProperties(f,{groupStartElement:{get:()=>f.groupContainer.firstElementChild},
        childGroupsAndTabs:{get:()=>[...f.groupContainer.querySelectorAll('tab,.tab-group-label')]},
        childActiveGroups:{get:()=>[...f.groupContainer.querySelectorAll('zen-folder[has-active]')]},
        activeGroups:{get:()=>[f,...(f.group?[f.group]:[])].filter(n=>n.hasAttribute('has-active'))}});
    }
    // Installed indentation formula (ZenFolders.mjs:1058-1133), not the old
    // no-op fixture. A collapsed ancestor flattens the descendant's offset.
    gZenFolders.setFolderIndentation=(tabs,group)=>{
      const level=f=>f?.group?level(f.group)+1:0;
      tabs.forEach(t=>t.style.setProperty('--zen-folder-indent',`${((level(group)+1)-level(t.group))*14}px`));
    };
    const s=document.createElement('style');s.textContent='.tab-group-container>tab{margin-inline-start:var(--zen-folder-indent)!important}';document.head.appendChild(s);
    window.addEventListener('TabGroupCollapse',e=>gZenFolders.on_TabGroupCollapse(e));
    window.addEventListener('TabGroupExpand',e=>gZenFolders.on_TabGroupExpand(e));
    const manager=new api.StickyFolderVisibilityManager(window,prefs);manager.start();manager.setSticky(one,true);
    const pause=ms=>new Promise(r=>setTimeout(r,ms));
    const samples=[];
    child.collapsed=true;await pause(260);
    const steady=one.getBoundingClientRect();
    child.collapsed=false;
    for(let i=0;i<8;i++){await new Promise(requestAnimationFrame);samples.push({sticky:one.getBoundingClientRect().height,shown:two.getBoundingClientRect().height});}
    for(const closed of [true,false,true,false]){child.collapsed=closed;await pause(65);}
    await pause(320);
    const settled={collapsed:child.collapsed,ordinary:two.getBoundingClientRect().height,
      sticky:one.getBoundingClientRect().height,opacity:getComputedStyle(two).opacity,
      indent:[one,two].map(t=>t.getBoundingClientRect().x)};
    root.collapsed=true;await pause(260);root.collapsed=false;await pause(260);
    const reopened=[one,two].map(t=>t.getBoundingClientRect().x);
    manager.destroy();return {steady:steady.height,samples,settled,reopened};
  },nativeFolders);
  assert.ok(result.samples.every(s=>s.sticky===36),'Sticky row must not shrink or disappear: '+JSON.stringify(result));
  assert.ok(result.samples.some(s=>s.shown>0&&s.shown<36),'only the newly visible row should unfold');
  assert.deepEqual(result.settled,{collapsed:false,ordinary:36,sticky:36,opacity:'1',indent:[36,36]});
  assert.deepEqual(result.reopened,[36,36],'parent cycle must not leave native flattening on one child');
}));

test('rapid expansion handoffs ignore obsolete completion and teardown removes pending masks',{skip},()=>run(async page=>{
  const actual=await page.evaluate(async()=>{
    const manager=new api.StickyFolderVisibilityManager(window,prefs);manager.start();
    manager.setSticky(two,true);child.collapsed=true;manager.refresh();
    const spacer=child.groupContainer.firstElementChild;
    const completions=[];
    spacer.getAnimations=()=>[{finished:new Promise(resolve=>completions.push(resolve))}];
    child.collapsed=false;await Promise.resolve();
    const firstMask=child.getAttribute('data-bzf-expanding');
    child.collapsed=true;manager.refresh();child.collapsed=false;await Promise.resolve();
    completions[0]();await new Promise(resolve=>setTimeout(resolve,0));
    const newerMask=child.getAttribute('data-bzf-expanding');
    completions[1]();await new Promise(resolve=>setTimeout(resolve,0));
    const settled=child.hasAttribute('data-bzf-expanding');
    child.collapsed=true;manager.refresh();child.collapsed=false;await Promise.resolve();
    manager.destroy();completions[2]();await new Promise(resolve=>setTimeout(resolve,0));
    return {firstMask,newerMask,settled,afterDestroy:child.hasAttribute('data-bzf-expanding'),
      pending:manager.expansionHandoffs.size,controls:document.querySelectorAll('.better-zen-folders-sticky-toggle').length};
  });
  assert.deepEqual(actual,{firstMask:'true',newerMask:'true',settled:false,afterDestroy:false,pending:0,controls:0});
}));

test('expansion handoff cleans up when native animation is absent or cancelled',{skip},()=>run(async page=>{
  const actual=await page.evaluate(async()=>{
    const manager=new api.StickyFolderVisibilityManager(window,prefs);manager.start();
    const spacer=child.groupContainer.firstElementChild,result=[];
    for(const cancelled of [false,true]){
      child.collapsed=true;manager.refresh();
      spacer.getAnimations=()=>cancelled?[{finished:Promise.reject(new Error('native animation cancelled'))}]:[];
      child.collapsed=false;await new Promise(resolve=>setTimeout(resolve,0));
      result.push({mask:child.hasAttribute('data-bzf-expanding'),pending:manager.expansionHandoffs.size,collapsed:child.collapsed});
    }
    manager.destroy();return result;
  });
  assert.deepEqual(actual,[{mask:false,pending:0,collapsed:false},{mask:false,pending:0,collapsed:false}]);
}));

test('cancel cleanup preserves newer spacer styling and a newly collapsed state',{skip},()=>run(async page=>{
  const actual=await page.evaluate(async()=>{
    const manager=new api.StickyFolderVisibilityManager(window,prefs);manager.start();
    const spacer=child.groupContainer.firstElementChild,result=[];
    for(const change of ['external-writer','collapse']){
      child.collapsed=true;manager.refresh();spacer.style.marginTop='-100px';
      let finish;spacer.getAnimations=()=>[{finished:new Promise(resolve=>{finish=resolve;})}];
      child.collapsed=false;await Promise.resolve();
      if(change==='external-writer')spacer.style.marginTop='-12px';
      else child.collapsed=true;
      finish();await new Promise(resolve=>setTimeout(resolve,0));
      result.push({margin:spacer.style.marginTop,collapsed:child.collapsed});
    }
    manager.destroy();return result;
  });
  assert.deepEqual(actual,[{margin:'-12px',collapsed:false},{margin:'-100px',collapsed:true}]);
}));

test('folded corner is legible within the unchanged gutter in light, dark and RTL layouts',{skip},()=>run(async page=>{
  await page.setViewportSize({width:360,height:240});
  await page.evaluate(()=>{
    document.body.style.padding='18px';document.body.style.margin='0';
    const style=document.createElement('style');style.textContent=`
      .tab-group-label-container>.tab-group-label{padding-inline-start:32px}
      .tab-group-folder-icon{position:absolute;inset-inline-start:5px;width:28px;height:28px;display:grid;place-items:center;color:#147b99}
      .tab-group-folder-icon svg{width:22px;height:22px}
      tab>.tab-content{display:flex;align-items:center;gap:8px;padding-inline-start:9px}
      .tab-favicon{width:16px;height:16px;border-radius:3px;background:#80b4c5;display:inline-block}
    `;document.head.append(style);
    for(const slot of document.querySelectorAll('.tab-group-folder-icon'))slot.innerHTML='<svg viewBox="0 0 24 24"><path d="M3 5h6l2 2h10v14H3z" fill="none" stroke="currentColor" stroke-width="2"/></svg>';
    const workspace=document.createElement('zen-workspace'),pins=document.createElement('div');
    workspace.setAttribute('active','true');pins.className='zen-workspace-pinned-tabs-section';root.before(workspace);workspace.append(pins);pins.append(root);
    workspace.pinnedTabsContainer=pins;window.gZenWorkspaces={activeWorkspaceElement:workspace};
    document.documentElement.setAttribute('better-zen-folders-show-guides','true');
    document.documentElement.style.setProperty('--tab-group-line-thickness','1px');
    document.documentElement.style.setProperty('--zen-folder-stroke','currentColor');
    window.visualManager=new api.StickyFolderVisibilityManager(window,prefs);visualManager.start();
    root.labelElement.textContent='Parent Folder';child.labelElement.textContent='Subfolder';
    two.innerHTML='<span class="tab-content"><span class="tab-favicon"></span><span>Frequently used tab</span></span>';
    visualManager.setSticky(root,true);visualManager.setSticky(child,true);visualManager.setSticky(two,true);
    root.collapsed=true;child.collapsed=true;visualManager.refresh();
  });
  for(const [mode,bg,fg,direction] of [['light','#f4f4f5','#18181b','ltr'],['dark','#202124','#e8eaed','ltr'],['rtl','#f4f4f5','#18181b','rtl']]) {
    await page.evaluate(({bg,fg,direction})=>{
      document.documentElement.dir=direction;document.body.style.background=bg;document.body.style.color=fg;
    },{bg,fg,direction});
    const box=await page.evaluate(()=>{
      const e=two.querySelector('.better-zen-folders-sticky-ear').getBoundingClientRect(),g=child.groupContainer.getBoundingClientRect();
      const offset=parseFloat(getComputedStyle(child.groupContainer,'::before').insetInlineStart)||0;
      const button=two.querySelector('.better-zen-folders-sticky-toggle').getBoundingClientRect();
      const row=two.getBoundingClientRect();
      const rtl=getComputedStyle(two).direction==='rtl';
      return {left:e.left,right:e.right,rowLeft:row.left,rowRight:row.right,width:e.width,height:e.height,gutterWidth:button.width,
        gap:rtl ? g.right-offset-1-e.right : e.left-g.left-offset-1,
        insideButton:e.left>=button.left&&e.right<=button.right};
    });
    assert.ok(box.width>=12 && box.height>=12,'folded corner must be large enough to read at normal 14px tab text');
    assert.ok(box.width<=box.gutterWidth,'fold stays within the existing gutter, without indenting the tab');
    assert.equal(box.gap,0,JSON.stringify(box));
    assert.equal(box.insideButton,true,'paint remains inside the expanded hitbox');
    if(process.env.BZF_SAVE_VISUAL_TESTS){
      const output=new URL('../artifacts/round3-review/sticky-corners/',import.meta.url);await mkdir(output,{recursive:true});
      await page.screenshot({path:fileURLToPath(new URL(`${mode}.png`,output))});
    }
  }
}));

test('first nested folder marker is fully inside the sidebar and clickable at native indentation',{skip},()=>run(async page=>{
  await page.setViewportSize({width:300,height:260});
  await page.evaluate(()=>{
    // No compensating fixture padding: the supplied screenshot clipped this
    // first marker at the sidebar edge even though deeper markers looked fine.
    document.body.style.cssText='margin:0;padding:0;overflow:hidden';
    document.documentElement.setAttribute('better-zen-folders-show-guides','true');
    document.documentElement.style.setProperty('--tab-group-line-thickness','1px');
    window.markerManager=new api.StickyFolderVisibilityManager(window,prefs);markerManager.start();markerManager.setSticky(child,true);
  });
  for(const direction of ['ltr','rtl']) {
    await page.evaluate(direction=>{document.documentElement.dir=direction;},direction);
    const box=await page.evaluate(()=>{
      const button=child.querySelector(':scope > .tab-group-label-container > .better-zen-folders-sticky-toggle');
      const b=button.getBoundingClientRect(),e=button.firstElementChild.getBoundingClientRect();
      return {left:e.left,right:e.right,width:e.width,viewport:innerWidth,
        hit:document.elementFromPoint(b.x+b.width/2,b.y+b.height/2)===button,
        row:child.getBoundingClientRect().toJSON()};
    });
    assert.ok(box.left>=0&&box.right<=box.viewport,`entire folded corner must be visible: ${JSON.stringify(box)}`);
    assert.ok(box.width>=12);assert.equal(box.hit,true,'native gutter hit target must be reachable');
    assert.equal(box.row.width,286,'marker must not add indentation or consume row width');
  }
}));

for (const direction of ['ltr','rtl']) for (const thickness of [1,2]) for (const width of [96,180])
test(`paint and dead-space pointer gestures toggle without clipping or moving content: ${direction}/${thickness}px/${width}px`,{skip},()=>run(async page=>{
  await page.setViewportSize({width,height:260});
  await page.evaluate(({direction,thickness})=>{
    document.documentElement.dir=direction;
    document.documentElement.style.setProperty('--tab-group-line-thickness',`${thickness}px`);
    document.documentElement.setAttribute('better-zen-folders-show-guides','true');
    document.body.style.cssText='margin:0;padding:0;overflow:hidden';
    const workspace=document.createElement('zen-workspace'),pins=document.createElement('div');
    workspace.setAttribute('active','true');pins.className='zen-workspace-pinned-tabs-section';
    root.before(workspace);workspace.append(pins);pins.append(root);
    workspace.pinnedTabsContainer=pins;window.gZenWorkspaces={activeWorkspaceElement:workspace};
    for(const tab of [one,two]) tab.innerHTML='<span class="tab-content" style="display:flex;padding-inline-start:16px"><span class="tab-favicon" style="width:16px;height:16px;flex:none"></span><span class="tab-title">Tab</span></span>';
    window.pointerManager=new api.StickyFolderVisibilityManager(window,prefs);pointerManager.start();
    gBrowser.selectedTab=one;
    window.rowGestures=[];
    for(const item of [root,child,one,two]) item.addEventListener('click',()=>rowGestures.push(item.id));
    window.contentGeometry=()=>[...document.querySelectorAll('.tab-group-label-container,.tab-group-folder-icon,.tab-group-label,tab,.tab-favicon,.tab-title')].map(node=>node.getBoundingClientRect().toJSON());
  },{direction,thickness});
  const before=await page.evaluate(()=>{
    const buttons=[...document.querySelectorAll('.better-zen-folders-sticky-toggle')];
    buttons.forEach(button=>button.style.display='none');
    const absent=contentGeometry();
    buttons.forEach(button=>button.style.removeProperty('display'));
    return {absent,present:contentGeometry()};
  });
  assert.deepEqual(before.present,before.absent,'controls consume no row, icon or title space');
  for(const id of ['root','child','two']) {
    const button=page.locator(id==='two'?'#two > .better-zen-folders-sticky-toggle':`#${id} > .tab-group-label-container > .better-zen-folders-sticky-toggle`);
    const points=await button.evaluate(button=>{
      const b=button.getBoundingClientRect(),e=button.firstElementChild.getBoundingClientRect(),r=button.parentElement.getBoundingClientRect();
      const rtl=getComputedStyle(button).direction==='rtl';
      return {paint:{x:rtl?e.right-2:e.left+2,y:e.top+2},dead:{x:rtl?r.right-6:r.left+6,y:r.top+8},
        b:b.toJSON(),e:e.toJSON(),r:r.toJSON(),
        outsideAbove:document.elementFromPoint(b.x+b.width/2,b.top-1)!==button,
        outsideBelow:document.elementFromPoint(b.x+b.width/2,b.bottom+1)!==button};
    });
    assert.ok(points.b.left>=0 && points.b.right<=width,`${id}: entire target stays inside narrow sidebar`);
    assert.ok(points.b.top>=points.r.top && points.b.bottom<=points.r.bottom,`${id}: no adjacent-row overlap`);
    assert.equal(points.outsideAbove,true);assert.equal(points.outsideBelow,true);
    if(id==='root') assert.ok(points.b.left>=points.r.left&&points.b.right<=points.r.right,'root stays inside row');
    const opacity=()=>button.locator('.better-zen-folders-sticky-ear').evaluate(node=>getComputedStyle(node).opacity);
    for(const [region,point] of Object.entries({paint:points.paint,dead:points.dead})) {
      await page.mouse.move(width-1,250);
      assert.equal(await button.getAttribute('aria-pressed'),'false');assert.equal(await opacity(),'0');
      await page.mouse.move(point.x,point.y);
      assert.equal(await opacity(),'0.45',`${id}/${region}: real pointer hover reveals preview`);
      await page.mouse.click(point.x,point.y);
      assert.equal(await button.getAttribute('aria-pressed'),'true',`${id}/${region}: real click toggles on`);
      assert.equal(await opacity(),'1');
      assert.equal(await page.evaluate(id=>pointerManager.isSticky(document.getElementById(id)),id),true,'production Sticky state changed');
      await page.mouse.click(point.x,point.y);
      assert.equal(await button.getAttribute('aria-pressed'),'false',`${id}/${region}: second click toggles off`);
    }
    assert.ok(points.e.left>=points.b.left && points.e.right<=points.b.right,`${id}: ear inside target`);
  }
  const after=await page.evaluate(()=>({geometry:contentGeometry(),selected:gBrowser.selectedTab.id,gestures:rowGestures,
    collapsed:[root.collapsed,child.collapsed]}));
  assert.deepEqual(after.geometry,before.present,'gestures leave all content geometry unchanged');
  assert.equal(after.selected,'one');assert.deepEqual(after.gestures,[]);assert.deepEqual(after.collapsed,[false,false]);
}));

test('complete browser bootstrap installs Sticky, colour, rename and both new-tab controls together',{skip},()=>run(async page=>{
  const actual=await page.evaluate(async()=>{
    const errors=[],values=new Map(),observers=new Set();
    const service={PREF_INVALID:0,PREF_STRING:32,PREF_INT:64,PREF_BOOL:128,
      getPrefType:key=>values.has(key)?({string:32,number:64,boolean:128})[typeof values.get(key)]:0,
      getStringPref:(key,fallback='')=>values.get(key)??fallback,
      getIntPref:(key,fallback=350)=>values.get(key)??fallback,
      getBoolPref:(key,fallback=false)=>values.get(key)??fallback,
      clearUserPref:key=>values.delete(key),prefHasUserValue:key=>values.has(key),
      addObserver:(_,observer)=>observers.add(observer),removeObserver:(_,observer)=>observers.delete(observer)};
    for(const type of ['String','Int','Bool'])service[`set${type}Pref`]=(key,value)=>{values.set(key,value);};
    let renames=0;
    for(const folder of [root,child]){
      folder.name=folder.labelElement.textContent;folder.setAttribute('zen-workspace-id','fixture-space');
      folder.querySelector('.tab-group-folder-icon').innerHTML='<svg></svg>';
      const reset=document.createElement('toolbarbutton');reset.className='tab-reset-button';folder.labelElement.parentElement.append(reset);
      folder.rename=()=>{renames++;};
    }
    const menu=document.getElementById('zenFolderActions');
    menu.innerHTML='<menuitem id="context_zenFolderNewSubfolder"></menuitem>';
    let unload;
    const overrides={location:{href:'chrome://browser/content/browser.xhtml'},Services:{prefs:service},
      console:{error:(...args)=>errors.push(args.map(String).join(' ')),warn(){}},
      gZenWorkspaces:{promiseInitialized:Promise.resolve()},
      addUnloadListener:callback=>{unload=callback;},gZenUIManager:{handleNewTab:()=>false}};
    const host=new Proxy(window,{get(target,key){
      if(Object.hasOwn(overrides,key))return overrides[key];
      const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;
    }});
    api.bootstrapBrowserWindow(host);await Promise.resolve();
    menu.triggerNode=child.labelElement;menu.dispatchEvent(new Event('popupshowing',{bubbles:true}));
    const labelBox=child.labelElement.getBoundingClientRect();
    child.labelElement.dispatchEvent(new MouseEvent('dblclick',{button:0,detail:2,bubbles:true,cancelable:true,
      clientX:labelBox.x+5,clientY:labelBox.y+labelBox.height/2}));
    const result={
      plus:child.querySelectorAll(':scope > .tab-group-label-container > .better-zen-folders-new-tab-button').length,
      colour:document.getElementById('better-zen-folders-folder-colour')?.hidden===false,
      sticky:document.getElementById('better-zen-folders-sticky-folder')?.hidden===false,
      newTab:document.getElementById('better-zen-folders-new-tab-menu')?.hidden===false,
      renames,errors,unload:typeof unload};
    host.__betterZenFoldersController.destroy();
    result.ownedCommands=document.querySelectorAll('#better-zen-folders-new-tab-menu,#better-zen-folders-folder-colour,#better-zen-folders-sticky-folder').length;
    return result;
  });
  assert.deepEqual(actual,{plus:1,colour:true,sticky:true,newTab:true,renames:1,errors:[],unload:'function',ownedCommands:0});
}));
