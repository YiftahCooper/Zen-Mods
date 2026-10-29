// Independent bounded review fixture. No Zen process or existing browser profile.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';

const modulePath = process.env.BZF_PLAYWRIGHT_MODULE;
const skip = modulePath ? false : 'set BZF_PLAYWRIGHT_MODULE for isolated animation review';
const source = await readFile(new URL('../scripts/better-zen-folders.uc.mjs', import.meta.url), 'utf8');
const css = await readFile(new URL('../chrome.css', import.meta.url), 'utf8');
const nativeAnimation = await readFile(new URL('./fixtures/zen-1.22.2b-folder-animation.mjs', import.meta.url), 'utf8');
// These captured 1.22.2b sources were verified against installed omni.ja. Use the
// actual activeTabs/activeGroups/visible/indentation/selection code, not no-op mocks.
const folderSource = await readFile(new URL('../artifacts/native-20260915/ZenFolder.mjs', import.meta.url), 'utf8');
const foldersSource = await readFile(new URL('../artifacts/native-20260915/ZenFolders.mjs', import.meta.url), 'utf8');
const tabSource = await readFile(new URL('../artifacts/native-20260915/tab.js', import.meta.url), 'utf8');
const excerpt = (text, start, end) => {
  const from = text.indexOf(start), to = text.indexOf(end, from);
  assert.ok(from >= 0 && to > from, `native excerpt ${start}`);
  return text.slice(from, to).trim();
};
const native = {
  active: excerpt(folderSource, '  set activeTabs(tabs)', '  get resetButton()'),
  groups: excerpt(folderSource, '  get activeGroups()', '  rename()'),
  visible: excerpt(tabSource, '    get visible()', '    get hidden()'),
  indent: excerpt(foldersSource, '  setFolderIndentation(', '  changeFolderUserIcon('),
  select: excerpt(foldersSource, '  async animateSelect(group)', '  animateGroupMove('),
  icon: excerpt(foldersSource, '  updateFolderIcon(group, state = "auto")', '  setFolderIndentation('),
};
const animation = nativeAnimation.replace('setFolderIndentation() {}', `${native.indent}\n${native.select}`)
  .replace('updateFolderIcon() { return []; }', native.icon);
const sha = value => createHash('sha256').update(value).digest('hex');
console.log('animation-review source=' + sha(source) + ' css=' + sha(css));

async function fixture(action, options = {}) {
  const {chromium} = createRequire(import.meta.url)(modulePath);
  const browser = await chromium.launch({headless:true});
  try {
    const page = await browser.newPage({reducedMotion:options.reduced ? 'reduce' : 'no-preference'});
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    const row = (id, attrs = 'pinned') => `<tab id="${id}" ${attrs}><div class="tab-stack"><div class="tab-background"></div><div class="tab-content">${id}</div></div></tab>`;
    const folder = (id, contents) => `<zen-folder id="${id}"><div class="tab-group-label-container"><span class="tab-group-label" tabindex="0">${id}</span></div><div class="tab-group-container"><div class="zen-tab-group-start"></div>${contents}</div></zen-folder>`;
    const pins = contents => `<div class="zen-workspace-pinned-tabs-section"><div class="space-fake-collapsible-start zen-tab-group-start"></div>${contents}</div>`;
    await page.setContent(`<style>
      :root {--tab-min-height:36px;--tab-margin-block:0px} body{margin:0} #tabs{width:320px}
      zen-workspace,.workspace-arrowscrollbox,.zen-workspace-pinned-tabs-section,.zen-workspace-normal-tabs-section,zen-folder,.tab-group-container{display:flex;flex-direction:column}
      tab,.tab-group-label-container{display:flex;min-height:36px;flex-shrink:0}.tab-group-label{display:flex;min-height:36px}
      /* Native tabs.css: .tab-background contributes the minimum row height,
         even when animateSelect temporarily writes min-height:0 on the tab. */
      .tab-stack{display:grid;flex:1}.tab-stack>*{grid-area:1/1}.tab-background{min-height:var(--tab-min-height)}
      .zen-tab-group-start{height:0;min-height:0;order:-9999;flex-shrink:0}
      zen-folder>.tab-group-container>:is(tab,zen-folder){--zen-folder-indent:14px;margin-inline-start:var(--zen-folder-indent)!important}
      [hidden],zen-workspace:not([active]){display:none}
      zen-workspace[collapsedpinnedtabs] .zen-workspace-pinned-tabs-section,zen-folder[collapsed]>.tab-group-container{overflow-y:clip}
      ${css}
    </style><div id="tabs">${row('essential','zen-essential pinned')}
      <zen-workspace id="a" active="true"><div class="zen-current-workspace-indicator" tabindex="0">A</div><div class="workspace-arrowscrollbox">
      ${pins(row('ordinary') + row('rootSticky') + folder('parent', folder('child', row('leaf') + row('sibling'))) + folder('unrelated', row('unrelatedTab') + row('unrelatedOther')))}
      <div class="zen-workspace-normal-tabs-section">${row('normal','selected')}</div></div></zen-workspace>
      <zen-workspace id="b"><div class="zen-current-workspace-indicator">B</div>${pins(row('foreign'))}</zen-workspace>
    </div><menupopup id="tabContextMenu"></menupopup><menupopup id="zenFolderActions"></menupopup>`);
    await page.evaluate(async ({source, animation, native, options}) => {
      document.documentElement.setAttribute('zen-sidebar-expanded','true');
      window.q = id => document.getElementById(id);
      const load = async text => { const url=URL.createObjectURL(new Blob([text],{type:'text/javascript'}));const module=await import(url);URL.revokeObjectURL(url);return module; };
      window.api = await load(source);
      window.groupIsCollapsiblePins = node => node?.localName === 'zen-workspace-collapsible-pins';
      const folders = [...document.querySelectorAll('zen-folder')];
      for (const f of folders) {
        f.groupContainer=f.querySelector(':scope > .tab-group-container');
        f.labelElement=f.querySelector(':scope > .tab-group-label-container > .tab-group-label');f.labelElement.group=f;
      }
      for (const w of document.querySelectorAll('zen-workspace')) {
        w.pinnedTabsContainer=w.querySelector('.zen-workspace-pinned-tabs-section');w.indicator=w.querySelector('.zen-current-workspace-indicator');
        Object.defineProperty(w,'hasCollapsedPinnedTabs',{get:()=>w.hasAttribute('collapsedpinnedtabs')});
        const p=document.createElement('zen-workspace-collapsible-pins');p.id=w.id+'-pins';p.hidden=true;w.prepend(p);
        p.groupContainer=w.pinnedTabsContainer;w.collapsiblePins=p;folders.push(p);
      }
      const ActiveState=new Function(`return class {${native.active}\n${native.groups}}`)();
      const activeDescriptors=Object.getOwnPropertyDescriptors(ActiveState.prototype);delete activeDescriptors.constructor;
      for (const f of folders) {
        f.isZenFolder=true;f._activeTabs=[];
        Object.defineProperties(f,{
          ...activeDescriptors,
          group:{get:()=>f.parentElement.closest('zen-folder')},
          level:{get:()=>f.group ? f.group.level+1 : 0},
          collapsed:{get:()=>f.hasAttribute('collapsed'),set:value=>{
            if (f.collapsed===value) return;
            f.toggleAttribute('collapsed',value);
            if (groupIsCollapsiblePins(f)) f.parentElement.toggleAttribute('collapsedpinnedtabs',value);
            f.dispatchEvent(new Event(value?'TabGroupCollapse':'TabGroupExpand',{bubbles:true}));
          }},
          allItems:{get:()=>[...f.groupContainer.children].filter(n=>n.matches('tab,zen-folder'))},
          groupStartElement:{get:()=>f.groupContainer.firstElementChild},
          childGroupsAndTabs:{get:()=>[...f.groupContainer.querySelectorAll('tab,.tab-group-label')]},
          tabs:{get:()=>[...f.groupContainer.querySelectorAll('tab')]},
        });
      }
      window.gZenWorkspaces={activeWorkspaceElement:q('a'),promiseInitialized:Promise.resolve()};
      window.gZenPinnedTabManager={expandedSidebarMode:true};
      const tabs=[...document.querySelectorAll('tab')];
      const visible=Object.getOwnPropertyDescriptor(new Function(`return ({${native.visible}})`)(),'visible');
      for (const [index,t] of tabs.entries()) {
        t.isOpen=true;t.index=index;
        Object.defineProperties(t,{visible,group:{get:()=>t.parentElement.closest('zen-folder')},
          pinned:{get:()=>t.hasAttribute('pinned')},selected:{get:()=>t.hasAttribute('selected')},multiselected:{get:()=>t.hasAttribute('multiselected')}});
      }
      window.gBrowser={tabs,selectedTab:q('normal'),tabContainer:q('tabs'),isTab:n=>n?.localName==='tab',isTabGroup:n=>n?.isZenFolder===true,
        isTabGroupLabel:n=>n?.classList?.contains('tab-group-label'),isSplitViewWrapper:()=>false};
      let cached;
      Object.defineProperty(gBrowser.tabContainer,'ariaFocusableItems',{get:()=>cached??=[...gBrowser.tabs].filter(t=>t.visible)});
      gBrowser.tabContainer._invalidateCachedVisibleTabs=()=>{cached=null;};
      window.windowUtils={getBoundsWithoutFlushing:node=>node.getBoundingClientRect()};
      const values=new Map(),windows=new Map();
      for (const id of ['rootSticky','leaf']) values.set(q(id),{[api.STICKY_TAB_KEY]:JSON.stringify({id,sticky:true})});
      window.SessionStore={promiseAllWindowsRestored:Promise.resolve(),getCustomTabValue:(t,k)=>values.get(t)?.[k]??'',setCustomTabValue:(t,k,v)=>values.set(t,{...values.get(t),[k]:v}),getCustomWindowValue:(_,k)=>windows.get(k)??'',setCustomWindowValue:(_,k,v)=>windows.set(k,v)};
      document.createXULElement=name=>document.createElement(name);
      window.prefs={get:name=>({subfolderCollapsePolicy:'hide',folderStateChevron:'always',stickyTabsEnabled:true,stickyFoldersEnabled:true,showEmptyFolderActiveIndicator:options.indicator})[name],subscribe:()=>()=>{}};
      // Native implementation MUST exist before the manager installs its instance adapter.
      await load(animation);
      window.originalCollapse=gZenFolders.animateCollapse;window.originalExpand=gZenFolders.animateExpand;
      window.jobs=[];window.seen=[];
      for (const type of ['TabGroupCollapse','TabGroupExpand']) window.addEventListener(type,event=>{
        seen.push([type,event.target.id]);jobs.push(gZenFolders['on_'+type](event));
      });
      if (options.restore) {
        const p=q('a').collapsiblePins;p.setAttribute('collapsed','true');q('a').setAttribute('collapsedpinnedtabs','');
        p.groupContainer.hidden=true;p.groupStartElement.style.marginTop='-400px';
      }
      window.manager=new api.StickyFolderVisibilityManager(window,prefs);manager.start();
      window.height=id=>q(id).getBoundingClientRect().height;
      window.frame=()=>new Promise(requestAnimationFrame);
      window.settle=async()=>{await Promise.all(jobs.splice(0));await new Promise(r=>setTimeout(r,25));};
      window.foreignBefore=q('b').outerHTML;
      await new Promise(r=>setTimeout(r,25));
    }, {source,animation,native,options});
    assert.equal(await page.evaluate(()=>gZenFolders.animateCollapse!==originalCollapse&&gZenFolders.animateExpand!==originalExpand),true,'native hooks must actually be installed');
    const result=await action(page);
    assert.deepEqual(errors,[],'review fixture must not swallow native or product errors');
    return result;
  } finally { await browser.close(); }
}

for (const reduced of [false,true]) test(`ordinary folders without Sticky children animate their changing rows (reduced=${reduced})`,{skip},()=>fixture(async page=>{
  const r=await page.evaluate(async()=>{
    const folder=q('unrelated'),row=q('unrelatedTab');
    const before=height('unrelatedTab');
    folder.collapsed=true;
    const collapsing={height:height('unrelatedTab'),moving:row.hasAttribute('data-bzf-motion')};
    await settle();
    const closed=height('unrelatedTab');
    folder.collapsed=false;
    const expanding={height:height('unrelatedTab'),moving:row.hasAttribute('data-bzf-motion')};
    await settle();
    return {before,collapsing,closed,expanding,opened:height('unrelatedTab'),selected:gBrowser.selectedTab.id};
  });
  assert.equal(r.before,36);
  assert.deepEqual(r.collapsing,{height:reduced?0:36,moving:!reduced},'ordinary rows must fold instead of disappearing before the animator can see them');
  assert.equal(r.closed,0);
  assert.deepEqual(r.expanding,{height:reduced?36:0,moving:!reduced},'ordinary rows must unfold instead of appearing at full height immediately');
  assert.equal(r.opened,36);assert.equal(r.selected,'normal');
},{reduced}));

for (const reduced of [false,true]) test(`leaving a selected tab in a collapsed folder folds its remaining row (reduced=${reduced})`,{skip},()=>fixture(async page=>{
  const r=await page.evaluate(async()=>{
    const folder=q('unrelated'),tab=q('unrelatedTab');
    q('normal').removeAttribute('selected');tab.setAttribute('selected','true');gBrowser.selectedTab=tab;manager.refresh();
    folder.collapsed=true;await settle();
    const before=height('unrelatedTab');
    tab.removeAttribute('selected');q('normal').setAttribute('selected','true');gBrowser.selectedTab=q('normal');
    q('normal').dispatchEvent(new Event('TabSelect',{bubbles:true}));await new Promise(r=>setTimeout(r,25));
    const during={height:height('unrelatedTab'),moving:tab.hasAttribute('data-bzf-motion')};
    await new Promise(r=>setTimeout(r,240));
    return {before,during,after:height('unrelatedTab'),collapsed:folder.collapsed,selected:gBrowser.selectedTab.id};
  });
  assert.equal(r.before,36);assert.equal(r.during.moving,!reduced);
  if(!reduced)assert.ok(r.during.height>0&&r.during.height<=36,'selection exit must not snap to zero');
  assert.equal(r.after,0);assert.equal(r.collapsed,true);assert.equal(r.selected,'normal');
},{reduced}));

test('folder artwork follows visible projected activity, even when native active membership persists',{skip},()=>fixture(async page=>{
  const r=await page.evaluate(async()=>{
    const folder=q('unrelated'),tab=q('unrelatedTab');
    const slot=document.createElement('span');slot.className='tab-group-folder-icon';
    slot.innerHTML='<svg width="28" height="28" active="false"><g class="icon"><image href=""/></g><g class="dots"/></svg>';
    folder.firstElementChild.prepend(slot);const svg=slot.querySelector('svg');
    q('normal').removeAttribute('selected');tab.setAttribute('selected','true');gBrowser.selectedTab=tab;manager.refresh();
    folder.collapsed=true;await settle();const selected=svg.getAttribute('active');
    tab.removeAttribute('selected');q('normal').setAttribute('selected','true');gBrowser.selectedTab=q('normal');
    q('normal').dispatchEvent(new Event('TabSelect',{bubbles:true}));await new Promise(r=>setTimeout(r,240));
    const inactive=svg.getAttribute('active');gZenFolders.updateFolderIcon(folder);const afterNativeRefresh=svg.getAttribute('active');
    return {selected,inactive,afterNativeRefresh,collapsed:folder.collapsed};
  });
  assert.deepEqual(r,{selected:'true',inactive:'false',afterNativeRefresh:'false',collapsed:true});
},{indicator:true}));

test('selection exit folds the outer nested path without changing either folder state',{skip},()=>fixture(async page=>{
  const r=await page.evaluate(async()=>{
    manager.setSticky(q('leaf'),false);
    q('normal').removeAttribute('selected');q('sibling').setAttribute('selected','true');gBrowser.selectedTab=q('sibling');manager.refresh();
    q('child').collapsed=true;await settle();q('parent').collapsed=true;await settle();
    const initial=height('child');
    q('sibling').removeAttribute('selected');q('normal').setAttribute('selected','true');gBrowser.selectedTab=q('normal');
    q('normal').dispatchEvent(new Event('TabSelect',{bubbles:true}));await new Promise(r=>setTimeout(r,25));
    const during={height:height('child'),moving:q('child').hasAttribute('data-bzf-motion')};
    await new Promise(r=>setTimeout(r,240));
    return {initial,during,after:height('child'),states:[q('parent').collapsed,q('child').collapsed]};
  });
  assert.ok(r.initial>36);assert.equal(r.during.moving,true);assert.ok(r.during.height>0);
  assert.equal(r.after,0);assert.deepEqual(r.states,[true,true]);
}));

test('icon hook teardown preserves a later owner and restores untouched native methods',{skip},()=>fixture(async page=>{
  const r=await page.evaluate(()=>{
    const ours=gZenFolders.updateFolderIcon,foreign=function(){return 'foreign';};gZenFolders.updateFolderIcon=foreign;
    manager.destroy();return {foreign:gZenFolders.updateFolderIcon===foreign,oldHooksInactive:manager.started===false,oursDistinct:ours!==foreign};
  });
  assert.deepEqual(r,{foreign:true,oldHooksInactive:true,oursDistinct:true});
}));

test('native icon handback uses its latest activity even when no measured motion occurred',{skip},()=>fixture(async page=>{
  const r=await page.evaluate(async()=>{
    manager.destroy();const nativeIcon=gZenFolders.updateFolderIcon;
    const folder=q('unrelated'),tab=q('unrelatedTab');folder.setAttribute('collapsed','');
    const slot=document.createElement('span');slot.className='tab-group-folder-icon';
    slot.innerHTML='<svg width="28" height="28" active="false"><g class="icon"><image href=""/></g><g class="dots"/></svg>';
    folder.firstElementChild.prepend(slot);const svg=slot.querySelector('svg');
    SessionStore.setCustomTabValue(tab,api.STICKY_TAB_KEY,JSON.stringify({id:tab.id,sticky:true}));
    window.manager=new api.StickyFolderVisibilityManager(window,prefs);manager.start();await new Promise(r=>setTimeout(r,25));
    q('normal').removeAttribute('selected');tab.setAttribute('selected','true');gBrowser.selectedTab=tab;
    window.addEventListener('TabSelect',()=>jobs.push(gZenFolders.animateSelect(folder)),{once:true});
    tab.dispatchEvent(new Event('TabSelect',{bubbles:true}));await settle();
    const before={active:svg.getAttribute('active'),managed:manager.motion.managedGroups.size};
    manager.destroy();return {before,after:svg.getAttribute('active'),nativeMemberKept:folder.activeTabs.includes(tab),nativeRestored:gZenFolders.updateFolderIcon===nativeIcon};
  });
  assert.deepEqual(r,{before:{active:'true',managed:0},after:'true',nativeMemberKept:true,nativeRestored:true});
},{indicator:true}));

test('empty-folder activity setting hides only the unchosen icon and updates live',{skip},()=>fixture(async page=>{
  const r=await page.evaluate(async()=>{
    const folder=q('unrelated'),tab=q('unrelatedTab');
    const slot=document.createElement('span');slot.className='tab-group-folder-icon';
    slot.innerHTML='<svg width="28" height="28" active="false"><g class="icon"><image href=""/></g><g class="dots"/></svg>';
    folder.firstElementChild.prepend(slot);const svg=slot.querySelector('svg'),image=slot.querySelector('image');
    q('normal').removeAttribute('selected');tab.setAttribute('selected','true');gBrowser.selectedTab=tab;manager.refresh();
    folder.collapsed=true;await settle();const defaultOff=svg.getAttribute('active');
    const get=prefs.get;prefs.get=n=>n==='showEmptyFolderActiveIndicator'?true:get(n);manager.refresh();
    const enabled=svg.getAttribute('active');prefs.get=n=>n==='showEmptyFolderActiveIndicator'?false:get(n);manager.refresh();
    const disabled=svg.getAttribute('active');image.setAttribute('href','data:image/svg+xml,custom');manager.refresh();
    const customUnaffected=svg.getAttribute('active');image.setAttribute('href','');prefs.get=get;manager.refresh();
    return {defaultOff,enabled,disabled,customUnaffected,restored:svg.getAttribute('active'),visible:height('unrelatedTab'),collapsed:folder.collapsed};
  });
  assert.deepEqual(r,{defaultOff:'false',enabled:'true',disabled:'false',customUnaffected:'true',restored:'false',visible:36,collapsed:true});
}));

for (const reduced of [false,true]) test(`removing a Sticky marker animates only disappearing rows (reduced=${reduced})`,{skip},()=>fixture(async page=>{
  const r=await page.evaluate(async()=>{
    q('child').collapsed=true;await settle();
    const before=height('leaf');
    manager.toggleStickyFromMarker(q('leaf'));
    const immediate={height:height('leaf'),moving:q('leaf').hasAttribute('data-bzf-motion'),sibling:height('sibling')};
    await Promise.all([...manager.motion.running.values()].map(()=>new Promise(r=>setTimeout(r,250))));await settle();
    return {before,immediate,after:height('leaf'),sticky:manager.isSticky(q('leaf')),selected:gBrowser.selectedTab.id};
  });
  assert.equal(r.before,36);assert.equal(r.sticky,false);assert.equal(r.after,0);
  assert.equal(r.immediate.moving,!reduced);assert.equal(r.immediate.height,reduced?0:36);assert.equal(r.immediate.sibling,0);
  assert.equal(r.selected,'normal');
},{reduced}));

for (const reduced of [false,true]) test(`restored collapsed Space expands through installed adapter (reduced=${reduced})`,{skip},()=>fixture(async page=>{
  const r=await page.evaluate(async()=>{
    const initial={collapsed:q('a').hasCollapsedPinnedTabs,ordinary:height('ordinary'),sticky:height('rootSticky')};
    q('a').collapsiblePins.collapsed=false;await settle();
    return {initial,expanded:['ordinary','rootSticky','leaf','sibling'].map(height),collapsed:q('a').hasCollapsedPinnedTabs,
      pinsHidden:q('a').pinnedTabsContainer.hidden,spacer:getComputedStyle(q('a').collapsiblePins.groupStartElement).marginTop,
      foreignUnchanged:q('b').outerHTML===foreignBefore,moving:document.querySelectorAll('[data-bzf-motion]').length};
  });
  assert.deepEqual(r.initial,{collapsed:true,ordinary:0,sticky:36});
  assert.deepEqual(r.expanded,[36,36,36,36],JSON.stringify(r));
  assert.equal(r.collapsed,false);assert.equal(r.foreignUnchanged,true);assert.equal(r.moving,0);
  assert.equal(r.spacer,'0px','a stale restore offset must not move expanded pins above the viewport');
}, {restore:true,reduced}));

test('removing the last root Sticky marker keeps the pins container through its exit',{skip},()=>fixture(async page=>{
  const r=await page.evaluate(async()=>{
    manager.setSticky(q('leaf'),false);q('a').collapsiblePins.collapsed=true;await settle();
    const before=height('rootSticky');manager.toggleStickyFromMarker(q('rootSticky'));
    const during={height:height('rootSticky'),moving:q('rootSticky').hasAttribute('data-bzf-motion')};
    await new Promise(r=>setTimeout(r,250));await settle();
    return{before,during,after:height('rootSticky'),container:q('a').pinnedTabsContainer.getBoundingClientRect().height};
  });
  assert.deepEqual(r,{before:36,during:{height:36,moving:true},after:0,container:0});
}));

test('removing Sticky from the selected tab keeps the row exposed without exit animation',{skip},()=>fixture(async page=>{
  const r=await page.evaluate(async()=>{
    q('normal').removeAttribute('selected');q('leaf').setAttribute('selected','true');gBrowser.selectedTab=q('leaf');
    q('child').collapsed=true;await settle();manager.toggleStickyFromMarker(q('leaf'));
    return {sticky:manager.isSticky(q('leaf')),height:height('leaf'),moving:q('leaf').hasAttribute('data-bzf-motion'),selected:gBrowser.selectedTab.id};
  });
  assert.deepEqual(r,{sticky:false,height:36,moving:false,selected:'leaf'});
}));

test('failed Sticky persistence consumes the prepared motion snapshot without hiding the saved item',{skip},()=>fixture(async page=>{
  const r=await page.evaluate(async()=>{
    q('child').collapsed=true;await settle();
    const get=prefs.get;prefs.get=n=>n==='stickyRemovalDelaySeconds'?'0.01':get(n);
    const reported=new Promise(resolve=>manager.report=error=>resolve(error.message));
    SessionStore.setCustomTabValue=()=>{throw Error('save unavailable');};
    manager.toggleStickyFromMarker(q('leaf'));const error=await reported;
    return{error,sticky:manager.isSticky(q('leaf')),height:height('leaf'),pending:manager.stickyRemovals.size,snapshots:manager.motion.before.size,running:manager.motion.running.size};
  });
  assert.deepEqual(r,{error:'save unavailable',sticky:true,height:36,pending:0,snapshots:0,running:0});
}));

test('rapid Space/parent/child reversals keep latest state, order and native indentation',{skip},()=>fixture(async page=>{
  const r=await page.evaluate(async()=>{
    const x=()=>['leaf','sibling'].map(id=>q(id).getBoundingClientRect().x);
    const initial=x(), order=[...q('a').pinnedTabsContainer.children].map(n=>n.id);
    const retained=[];
    for (const [id,closed] of [['child',true],['parent',true],['a-pins',true],['parent',false],['a-pins',false],['child',false],['child',true],['child',false]]) {
      q(id).collapsed=closed;await frame();await frame();retained.push(height('leaf'));
    }
    await settle();
    const result={initial,final:x(),retained,closed:['child','parent','a-pins'].map(id=>q(id).collapsed),
      heights:['ordinary','rootSticky','leaf','sibling'].map(height),orderSame:JSON.stringify(order)===JSON.stringify([...q('a').pinnedTabsContainer.children].map(n=>n.id)),
      pending:manager.motion.running.size,foreign:q('b').outerHTML===foreignBefore};
    manager.destroy();return result;
  });
  assert.deepEqual(r.closed,[false,false,false]);assert.deepEqual(r.heights,[36,36,36,36],JSON.stringify(r));
  assert.deepEqual(r.final,r.initial,'parent cycle must not flatten one nested row');
  assert.ok(r.retained.every(h=>h===36),'retained Sticky leaf must stay full-height: '+JSON.stringify(r));
  assert.equal(r.pending,0);assert.equal(r.orderSame,true);assert.equal(r.foreign,true);
}));

test('destroying collapsed motion returns native hiding and removes borrowed active ownership',{skip},()=>fixture(async page=>{
  const r=await page.evaluate(async()=>{
    q('child').collapsed=true;await settle();
    manager.destroy();
    await Promise.allSettled(document.getAnimations().map(a=>a.finished));await settle();
    const child=q('child'), rect=q('sibling').getBoundingClientRect(), viewport=child.groupContainer.getBoundingClientRect();
    const painted=rect.height>0&&getComputedStyle(q('sibling')).display!=='none'&&rect.bottom>viewport.top&&rect.top<viewport.bottom;
    return {collapsed:child.collapsed,ordinaryPainted:painted,loans:child.activeTabs.map(t=>t.id),active:child.hasAttribute('has-active'),
      wrappers:[gZenFolders.animateCollapse===originalCollapse,gZenFolders.animateExpand===originalExpand]};
  });
  assert.deepEqual(r,{collapsed:true,ordinaryPainted:false,loans:[],active:false,wrappers:[true,true]});
}));

for (const newer of [false,true]) test(`motion teardown preserves ${newer?'newer':'preexisting'} inline height ownership`,{skip},()=>fixture(async page=>{
  const r=await page.evaluate(async newer=>{
    const item=q('sibling');item.style.setProperty('--bzf-motion-height','73px','important');
    q('child').collapsed=true;await frame();
    const wasMoving=item.hasAttribute('data-bzf-motion');
    if (newer) item.style.setProperty('--bzf-motion-height','91px','important');
    manager.destroy();
    return {wasMoving,value:item.style.getPropertyValue('--bzf-motion-height'),priority:item.style.getPropertyPriority('--bzf-motion-height')};
  },newer);
  assert.equal(r.wasMoving,true);assert.deepEqual(r,{wasMoving:true,value:newer?'91px':'73px',priority:'important'});
}));

test('expanding a natively active Sticky branch cleans native active flag and indent',{skip},()=>fixture(async page=>{
  const r=await page.evaluate(async()=>{
    const child=q('child'), nativeTab=q('sibling');
    child.collapsed=true;await settle();
    // A native selection can leave this state before the user expands the group.
    child.activeTabs=[...child.activeTabs,nativeTab];child.setAttribute('has-active','true');
    nativeTab.style.setProperty('--zen-folder-indent','0px');
    child.collapsed=false;await settle();manager.destroy();
    return {closed:child.collapsed,active:child.activeTabs.map(t=>t.id),flag:nativeTab.hasAttribute('folder-active'),indent:nativeTab.style.getPropertyValue('--zen-folder-indent')};
  });
  assert.deepEqual(r,{closed:false,active:[],flag:false,indent:''});
}));

test('native selection guard sees no Sticky loans before deciding whether to auto-expand',{skip},()=>fixture(async page=>{
  const r=await page.evaluate(async()=>{
    q('child').collapsed=true;await settle();
    window.addEventListener('TabSelect',()=>jobs.push(gZenFolders.animateSelect(q('child'))));
    q('normal').removeAttribute('selected');q('sibling').setAttribute('selected','true');gBrowser.selectedTab=q('sibling');
    q('sibling').dispatchEvent(new Event('TabSelect',{bubbles:true}));await settle();
    const result={closed:q('child').collapsed,heights:['leaf','sibling'].map(height),selected:q('sibling').selected};
    manager.destroy();return result;
  });
  assert.deepEqual(r,{closed:true,heights:[36,36],selected:true});
}));

test('unload does not overwrite a later instance adapter installed by another owner',{skip},()=>fixture(async page=>{
  const r=await page.evaluate(()=>{
    const other=function(){return 'other';};gZenFolders.animateCollapse=other;manager.destroy();
    return {otherRetained:gZenFolders.animateCollapse===other,untouchedExpandRestored:gZenFolders.animateExpand===originalExpand};
  });
  assert.deepEqual(r,{otherRetained:true,untouchedExpandRestored:true});
}));

test('switching Space during motion releases old projection without touching the new Space',{skip},()=>fixture(async page=>{
  const r=await page.evaluate(async()=>{
    q('child').collapsed=true;await frame();
    q('a').removeAttribute('active');q('b').setAttribute('active','true');gZenWorkspaces.activeWorkspaceElement=q('b');
    window.dispatchEvent(new Event('ZenWorkspacesUIUpdate'));await settle();
    const result={foreignHeight:height('foreign'),oldHeight:height('leaf'),foreignStyle:q('foreign').getAttribute('style'),
      foreignProjection:q('foreign').getAttribute('data-bzf-visibility'),foreignActive:q('foreign').hasAttribute('folder-active'),
      oldLoans:q('child').activeTabs.map(t=>t.id),oldProjection:q('a').querySelectorAll('[data-bzf-visibility],[data-bzf-stable-row],[data-bzf-motion]').length,
      nativeCollapsed:q('child').collapsed};
    manager.destroy();return result;
  });
  assert.deepEqual(r,{foreignHeight:36,oldHeight:0,foreignStyle:null,foreignProjection:null,foreignActive:false,
    oldLoans:[],oldProjection:0,nativeCollapsed:true});
}));

test('destroy during motion followed by a new native gesture retains that latest state',{skip},()=>fixture(async page=>{
  const r=await page.evaluate(async()=>{
    q('child').collapsed=true;await frame();manager.destroy();
    q('child').collapsed=false;await settle();
    return {closed:q('child').collapsed,heights:['leaf','sibling'].map(height),flag:q('child').hasAttribute('has-active')};
  });
  assert.deepEqual(r,{closed:false,heights:[36,36],flag:false});
}));

test('destroy after changing workspace leaves the departed collapsed folder natively hidden',{skip},()=>fixture(async page=>{
  const r=await page.evaluate(async()=>{
    q('child').collapsed=true;await settle();
    q('a').removeAttribute('active');q('b').setAttribute('active','true');gZenWorkspaces.activeWorkspaceElement=q('b');
    window.dispatchEvent(new Event('ZenWorkspacesUIUpdate'));await settle();manager.destroy();
    q('b').removeAttribute('active');q('a').setAttribute('active','true');gZenWorkspaces.activeWorkspaceElement=q('a');
    window.dispatchEvent(new Event('ZenWorkspacesUIUpdate'));await settle();
    const child=q('child'), box=child.groupContainer.getBoundingClientRect(), tab=q('sibling').getBoundingClientRect();
    return {collapsed:child.collapsed,painted:tab.height>0&&box.height>0&&tab.bottom>box.top&&tab.top<box.bottom,
      active:child.hasAttribute('has-active'),loans:child.activeTabs.map(t=>t.id)};
  });
  assert.deepEqual(r,{collapsed:true,painted:false,active:false,loans:[]});
}));

test('animating a separate branch does not finish or restart an unrelated accordion',{skip},()=>fixture(async page=>{
  const r=await page.evaluate(async()=>{
    manager.setSticky(q('unrelatedTab'),true);
    q('child').collapsed=true;await frame();await frame();
    const first=manager.motion.running.get(q('child'));
    q('unrelated').collapsed=true;await frame();
    const independent=manager.motion.running.get(q('child'))===first;
    await settle();
    return {independent,heights:['leaf','sibling','unrelatedTab','unrelatedOther'].map(height)};
  });
  assert.deepEqual(r,{independent:true,heights:[36,0,36,0]});
}));

test('native pre-event aria hiding still animates ordinary rows from their previous visible height',{skip},()=>fixture(async page=>{
  const r=await page.evaluate(async()=>{
    const child=q('child');
    // Native group collapse updates aria before dispatching its group event.
    child.setAttribute('collapsed','true');
    q('leaf').setAttribute('aria-hidden','true');q('sibling').setAttribute('aria-hidden','true');
    child.dispatchEvent(new Event('TabGroupCollapse',{bubbles:true}));
    await new Promise(r=>setTimeout(r,65));
    const middle={retained:height('leaf'),folding:height('sibling'),pointer:getComputedStyle(q('sibling')).pointerEvents};
    await settle();return {middle,end:height('sibling')};
  });
  assert.equal(r.middle.retained,36);assert.ok(r.middle.folding>0&&r.middle.folding<36,JSON.stringify(r));
  assert.equal(r.middle.pointer,'none');assert.equal(r.end,0);
}));
