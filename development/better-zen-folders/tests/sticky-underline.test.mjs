import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, mkdir} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {BetterZenFoldersPreferences, createBrowserPreferenceAdapters} from '../scripts/better-zen-folders.uc.mjs';
import {makePreferenceFixture} from './fakes.mjs';

test('Sticky marker defaults to underline and preserves a stored corner choice', () => {
  const fixture = makePreferenceFixture();
  const prefs = new BetterZenFoldersPreferences(createBrowserPreferenceAdapters(fixture.host));
  prefs.start();
  assert.equal(prefs.get('stickyMarker'), 'underline');
  fixture.set('better-zen-folders.sticky-marker', 'corner');
  fixture.notify('better-zen-folders.sticky-marker');
  assert.equal(prefs.get('stickyMarker'), 'corner');
  fixture.set('better-zen-folders.sticky-marker', 'invalid');
  fixture.notify('better-zen-folders.sticky-marker');
  assert.equal(prefs.get('stickyMarker'), 'underline');
  prefs.destroy();
});

const modulePath = process.env.BZF_PLAYWRIGHT_MODULE;
const skip = modulePath ? false : 'set BZF_PLAYWRIGHT_MODULE';
const source = await readFile(new URL('../scripts/better-zen-folders.uc.mjs', import.meta.url), 'utf8');
const css = await readFile(new URL('../chrome.css', import.meta.url), 'utf8');
const native = await readFile(new URL('../artifacts/native-20260915/zen-folders.css', import.meta.url), 'utf8');
const verticalTabs = await readFile(new URL('../artifacts/task-8-root-cause/omni/chrome/browser/content/browser/zen-styles/zen-tabs/vertical-tabs.css', import.meta.url), 'utf8');
const iconMargins = verticalTabs.match(/\.tab-throbber,\s*\.tab-icon-pending,\s*\.tab-icon-image,\s*\.tab-sharing-icon-overlay,\s*\.tab-icon-overlay\s*\{[^}]*margin-inline-start:[^}]*\}/)[0];
for (const dir of ['ltr','rtl']) test(`coloured icon underlines retain layout with only the current marker clickable (${dir})`, {skip}, async () => {
  const {chromium} = createRequire(import.meta.url)(modulePath);
  const browser = await chromium.launch({headless:true});
  try {
    const page = await browser.newPage({viewport:{width:440,height:400},deviceScaleFactor:2});
    await page.setContent(`<style>${native}
      :root{--tab-min-height:36px;--tab-margin-block:2px;--tab-group-label-padding:8px;--toolbarbutton-padding-inner:10px}
      body{margin:24px;background:#d4d4d4;font:14px sans-serif;color:#24383d}
      zen-folder{display:flex;flex-direction:column}.tab-group-label-container{display:flex}
      .tab-group-folder-icon{background:#f0c334;border-radius:5px}
      .tab-group-container{display:flex;flex-direction:column}
      tab{display:flex;align-items:center;position:relative;height:40px;padding-inline:10px;gap:10px}
      .tab-icon-stack{display:grid;position:relative;height:16px}
      .tab-icon-image{grid-area:1/1;width:16px;height:16px;background:#ddd;border-radius:50%}
      ${iconMargins}
      .tab-label{flex:1} ${css}</style>
      <div id="tabs"><zen-folder id="parent" style="--better-zen-folders-folder-color:#e3bd41"><div class="tab-group-label-container"><span class="tab-group-folder-icon"></span><label class="tab-group-label">Parent</label></div><div class="tab-group-container">
      <zen-folder id="child" zen-icons-enlarge-inner-icon style="--better-zen-folders-folder-color:#3ebcd2"><div class="tab-group-label-container"><span class="tab-group-folder-icon"></span><label class="tab-group-label">Child</label></div><div class="tab-group-container">
      <tab id="nested"><span class="tab-icon-stack"><span class="tab-icon-image"></span></span><span class="tab-label">Nested tab</span></tab>
      </div></zen-folder></div></zen-folder>
      <tab id="rootTab"><span class="tab-icon-stack"><span class="tab-icon-image"></span></span><span class="tab-label">Root tab</span></tab></div>`);
    await page.evaluate(async ({source,dir}) => {
      document.documentElement.dir=dir;document.documentElement.setAttribute('zen-sidebar-expanded','true');
      const url=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
      const api=await import(url);URL.revokeObjectURL(url);
      window.items=[...document.querySelectorAll('zen-folder,tab')];
      for(const item of items){item.isZenFolder=item.localName==='zen-folder';Object.defineProperty(item,'group',{get:()=>item.parentElement.closest('zen-folder')});
        if(item.isZenFolder)item.labelElement=item.querySelector(':scope > .tab-group-label-container > label');}
      const values=new Set(items);
      window.marker='underline';window.enabled=true;
      window.manager=new api.StickyFolderVisibilityManager({document,gBrowser:{isTab:n=>n.localName==='tab',isSplitViewWrapper:()=>false}},
        {get:n=>n==='stickyMarker'?marker:n==='stickyRemovalDelaySeconds'?'0':enabled});
      manager.store={has:n=>values.has(n),set:(n,on)=>on?values.add(n):values.delete(n)};
      manager.isRootPinnedItem=n=>!n.group;
      // This fixture supplies only native membership/state; production owns
      // decoration, colour inheritance and gesture handling.
      manager.refresh=()=>items.forEach(n=>manager.decorateEar(n,true));
      window.rects=()=>[...document.querySelectorAll('.tab-group-label-container,.tab-group-folder-icon,label,tab,.tab-icon-stack,.tab-icon-image,.tab-label')].map(n=>n.getBoundingClientRect().toJSON());
      window.before=rects();manager.refresh();
      for(const type of ['pointerdown','mousedown','mouseup','click','dblclick','auxclick','dragstart'])
        document.addEventListener(type,e=>manager.handleStickyToggle(e),true);
    },{source,dir});
    const state=await page.evaluate(()=>({unchanged:JSON.stringify(before)===JSON.stringify(rects()),
      markers:[...document.querySelectorAll('.better-zen-folders-sticky-underline')].map(n=>{
        const r=n.getBoundingClientRect(),i=(n.parentElement.querySelector('.tab-icon-image')??n.parentElement).getBoundingClientRect(),s=getComputedStyle(n,'::after');
        return {center:r.x+r.width/2,iconCenter:i.x+i.width/2,y:r.y,iconBottom:i.bottom,colour:s.backgroundColor,height:s.height,radius:s.borderRadius,opacity:getComputedStyle(n).opacity};
      }),ears:[...document.querySelectorAll('.better-zen-folders-sticky-ear')].map(n=>getComputedStyle(n).display)}));
    assert.equal(state.markers.length,4,'every eligible icon gets the underline projection');
    assert.equal(state.unchanged,true,'marker must not move any row, icon or label');
    assert.deepEqual(state.markers.map(n=>n.colour),['rgb(227, 189, 65)','rgb(62, 188, 210)','rgb(62, 188, 210)','rgb(36, 56, 61)']);
    for(const mark of state.markers){assert.ok(Math.abs(mark.center-mark.iconCenter)<.1);assert.ok(mark.y>=mark.iconBottom-2);assert.equal(mark.height,'2px');assert.equal(mark.opacity,'1');}
    assert.ok(state.ears.every(v=>v==='none'));
    assert.equal(await page.locator('#nested > button').isVisible(),false,'the old corner target is absent in underline mode');
    await page.locator('#nested .better-zen-folders-sticky-underline').hover();
    assert.equal(await page.locator('#nested .better-zen-folders-sticky-underline').evaluate(n=>getComputedStyle(n).opacity),'1');
    assert.equal(await page.locator('#nested .better-zen-folders-sticky-underline').evaluate(n=>n.localName),'button','the visible marker is keyboard operable');
    if(dir==='ltr'){
      await mkdir(new URL('../artifacts/round13-review/',import.meta.url),{recursive:true});
      await page.screenshot({path:fileURLToPath(new URL('../artifacts/round13-review/underline-preview.png',import.meta.url))});
    }
    await page.locator('#nested .better-zen-folders-sticky-underline').click();
    assert.equal(await page.locator('#nested > button').getAttribute('aria-pressed'),'false');
    await page.mouse.move(420,390);
    assert.equal(await page.locator('#nested .better-zen-folders-sticky-underline').evaluate(n=>getComputedStyle(n).opacity),'0');
    await page.evaluate(()=>document.querySelector('#nested > button').click());
    assert.equal(await page.locator('#nested > button').getAttribute('aria-pressed'),'false','a stale old target cannot toggle Sticky');
    await page.locator('#nested .better-zen-folders-sticky-underline').click();
    assert.equal(await page.locator('#nested > button').getAttribute('aria-pressed'),'true');
    await page.evaluate(()=>{marker='corner';manager.refresh();});
    assert.equal(await page.locator('.better-zen-folders-sticky-underline').count(),0,'switching back removes the underline');
    assert.equal(await page.locator('#nested .better-zen-folders-sticky-ear').evaluate(n=>getComputedStyle(n).opacity),'1');
    await page.evaluate(()=>{marker='underline';manager.refresh();enabled=false;manager.refresh();});
    assert.equal(await page.locator('.better-zen-folders-sticky-toggle,.better-zen-folders-sticky-underline').count(),0,'disabled Sticky has no marker or click target');
    assert.equal(await page.evaluate(()=>JSON.stringify(before)===JSON.stringify(rects())),true);
  } finally {await browser.close();}
});
