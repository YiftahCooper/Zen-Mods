import {fileURLToPath} from 'node:url';
import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';

// Isolated Chromium only. Read repository assets; never connect to Zen or write
// screenshots/profile/evidence files. The native SVG and BOTH real stylesheets
// are essential: a hand-built 28-unit SVG missed the original paint displacement.
const modulePath = process.env.BZF_PLAYWRIGHT_MODULE;
const skip = modulePath ? false : 'set BZF_PLAYWRIGHT_MODULE for native SVG rendering';
const ziRoot = fileURLToPath(new URL('../fixtures/zen-icons/', import.meta.url));
const [source, css, nativeCss, folderSource, ziCss, glyphSource] = await Promise.all([
  readFile(new URL('../scripts/better-zen-folders.uc.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../chrome.css', import.meta.url), 'utf8'),
  readFile(new URL('../artifacts/native-20260915/zen-folders.css', import.meta.url), 'utf8'),
  readFile(new URL('../artifacts/native-20260915/ZenFolder.mjs', import.meta.url), 'utf8'),
  readFile(`${ziRoot}/sine/zen-icons/chrome.css`, 'utf8'),
  readFile(`${ziRoot}/src/browser/themes/shared/zen-icons/common/selectable/square.svg`, 'utf8'),
]);
const nativeSvg = folderSource.slice(folderSource.indexOf('<svg width="28"'), folderSource.indexOf('</svg>') + 6);
// Symmetric real selectable icon provides an unambiguous painted centre. Context
// paint is resolved for this data-image fixture because Chromium lacks Gecko's
// external SVG context paint. The actual native folder paths remain untouched.
const glyph = 'data:image/svg+xml,' + encodeURIComponent(glyphSource.slice(glyphSource.indexOf('<svg'))
  .replace(/context-(?:fill|stroke)-opacity/g, '1').replace(/context-(?:fill|stroke)/g, 'black'));
let browser, PNG;
before(async () => {
  if (skip) return;
  const require = createRequire(import.meta.url);
  ({PNG} = require(require.resolve('pngjs', {paths:[modulePath]})));
  browser = await require(modulePath).chromium.launch({headless:true});
});
after(async () => { await browser?.close(); });

function paintedBounds(bytes) {
  const png = PNG.sync.read(bytes);
  let left = png.width, top = png.height, right = -1, bottom = -1;
  for (let y = 0; y < png.height; y++) for (let x = 0; x < png.width; x++) {
    const at = (y * png.width + x) * 4;
    // Ignore only the near-white antialias fringe on a solid white background.
    if (Math.min(...png.data.subarray(at, at + 3)) >= 245) continue;
    left = Math.min(left, x); right = Math.max(right, x);
    top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
  assert.ok(right >= left && bottom >= top, 'fixture must paint an icon');
  // Screenshot is a 48 CSS-pixel crop centred on a 32px menu column, DPR=4.
  return {dx:(left + right + 1) / 8 - 24, dy:(top + bottom + 1) / 8 - 24,
    width:(right - left + 1) / 4, height:(bottom - top + 1) / 4};
}

async function fixture(direction, state, percent, slot) {
  const page = await browser.newPage({viewport:{width:720,height:340}, deviceScaleFactor:4});
  await page.route('**/*', route => route.abort());
  await page.setContent(`<style>
    :root{--tab-min-height:36px;--tab-margin-block:2px;--tab-group-label-padding:8px;
      --toolbar-color:#151515;--zen-primary-color:#00b4d8;--zen-colors-primary:#eee;color-scheme:light}
    body{margin:24px;font:16px sans-serif;background:white;color:#151515}
    zen-folder{width:340px}.tab-group-label-container{display:flex;position:relative}
    .tab-group-label{display:block;box-sizing:border-box}svg{display:block}
    ${nativeCss}\n${ziCss}\n${css}
    menuitem{display:flex;align-items:center;width:360px;height:48px;padding:8px;box-sizing:border-box}
    .menu-icon,.menu-iconic-left{width:32px;height:32px;flex:none;margin-inline-end:8px}
    .menu-iconic-icon{width:32px;height:32px}
  </style><div id="menu">${['outlined','bare'].map(kind => `
    <menuitem id="menu-${kind}" class="context-zen-move-to-folder-item">${slot === 'direct'
      ? '<img class="menu-icon">'
      : '<span class="menu-iconic-left"><img class="menu-iconic-icon"></span>'}
      <span class="menu-label">Destination label</span></menuitem>`).join('')}</div>
    <div id="sidebar">${['outlined','bare'].map(kind => `
      <zen-folder id="${kind}" zen-icons-has-inner-icon ${kind === 'bare'
        ? 'zen-icons-hide-folder-shape zen-icons-enlarge-inner-icon' : ''}>
        <div class="tab-group-label-container"><div class="tab-group-folder-icon">${nativeSvg}</div>
        <label class="tab-group-label">Source folder</label></div></zen-folder>`).join('')}</div>`);
  await page.evaluate(async ({source, direction, state, percent, glyph}) => {
    document.documentElement.setAttribute('zen-sidebar-expanded', 'true');
    document.documentElement.dir = direction;
    for (const svg of document.querySelectorAll('svg')) {
      svg.setAttribute('state', state);
      svg.querySelector('image').setAttribute('href', glyph);
    }
    const loaded = new Image(); loaded.src = glyph; await loaded.decode();
    await new Promise(requestAnimationFrame);
    await Promise.all(document.getAnimations().map(a => a.finished));
    const url = URL.createObjectURL(new Blob([source], {type:'text/javascript'}));
    const api = await import(url); URL.revokeObjectURL(url);
    window.menuApi = api;
    window.adapter = api.createBrowserMoveToFolderMenuAdapters(window, {get:() => percent});
    window.measure = () => ({
      sidebar:document.getElementById('sidebar').innerHTML,
      rootChildren:document.documentElement.children.length,
      labels:[...document.querySelectorAll('.menu-label,.tab-group-label')].map(n => {
        const r=n.getBoundingClientRect(); return [r.x,r.y,r.width,r.height];
      }),
    });
  }, {source, direction, state, percent, glyph});
  return page;
}

// Catches source root nudges leaking into menu layout and open-state geometry
// moving the painted artwork even when both SVG element boxes have equal widths.
// The oracle is actual non-white pixels, independent of any centring algorithm.
for (const direction of ['ltr','rtl']) for (const state of ['closed','open'])
for (const percent of ['100','120','135.5']) for (const slot of ['direct','nested']) {
  test(`native menu PAINT centres: ${direction}/${state}/${percent}%/${slot}`, {skip}, async t => {
    const page = await fixture(direction, state, percent, slot);
    try {
      const before = await page.evaluate(() => measure());
      const sidebarBefore = await page.locator('#sidebar').screenshot();
      const geometry = await page.evaluate(() => {
        const result=[];
        for (const kind of ['outlined','bare']) {
          const folder=document.getElementById(kind), item=document.getElementById(`menu-${kind}`);
          const rootTransform=getComputedStyle(folder.querySelector('svg')).transform;
          adapter.decorateItem(item, folder, null);
          const clone=item.querySelector('svg');
          const row=item.getBoundingClientRect();
          // Layout column centre derives from the native row, NEVER the cloned
          // SVG's transformed boundingClientRect (which would hide this bug).
          const cx=document.documentElement.dir==='rtl' ? row.right-24 : row.left+24;
          const cy=row.top+24;
          result.push({kind,rootTransform,clip:{x:cx-24,y:cy-24,width:48,height:48},
            href:clone.querySelector('image').getAttribute('href'),
            cloneIds:[...clone.querySelectorAll('[id]')].map(n=>n.id),
            sourceIds:[...folder.querySelectorAll('svg [id]')].map(n=>n.id),
            centringTransform:clone.querySelector(':scope > g:not([class])')?.getAttribute('transform') ?? null,
            glyphScale:getComputedStyle(clone.querySelector('.icon')).scale});
        }
        return result;
      });
      assert.deepEqual(await page.evaluate(() => measure()), before, 'source markup and all labels stay unchanged');
      assert.ok((await page.locator('#sidebar').screenshot()).equals(sidebarBefore), 'source sidebar pixels stay unchanged');
      const paint=[];
      for (const entry of geometry) {
        assert.equal(entry.href, glyph, 'chosen source image identity survives');
        assert.ok(entry.cloneIds.every(id => !entry.sourceIds.includes(id)), 'gradient resources remain isolated');
        assert.equal(entry.glyphScale, entry.kind === 'bare' ? String(Number(percent)/100) : 'none',
          'only the outline-free glyph receives the requested scale');
        paint.push({kind:entry.kind,...paintedBounds(await page.screenshot({clip:entry.clip}))});
      }
      const menuBefore = await page.locator('#menu').screenshot();
      await page.evaluate(() => { document.getElementById('sidebar').style.display='none'; });
      assert.ok((await page.locator('#menu').screenshot()).equals(menuBefore), 'menu paint remains independent of sidebar visibility');
      await page.evaluate(() => {
        document.getElementById('sidebar').style.removeProperty('display');
        document.getElementById('menu').style.display='none';
        for (const kind of ['outlined','bare']) {
          adapter.decorateItem(document.getElementById(`menu-${kind}`), document.getElementById(kind), null);
        }
        document.getElementById('menu').style.removeProperty('display');
      });
      assert.ok((await page.locator('#menu').screenshot()).equals(menuBefore), 'snapshots built in a hidden popup paint identically when shown');
      await page.evaluate(() => {
        for (const item of document.querySelectorAll('menuitem')) { adapter.clearItem(item); adapter.clearItem(item); }
      });
      assert.equal(await page.locator('menuitem svg').count(), 0, 'clear removes the entire snapshot');
      assert.deepEqual(await page.evaluate(() => measure()), before, 'clear restores labels and leaves source untouched');
      t.diagnostic(JSON.stringify({direction,state,percent,slot,paint,
        sourceRootTransforms:geometry.map(g=>g.rootTransform),centringTransforms:geometry.map(g=>g.centringTransform)}));
      const faults=paint.filter(p=>Math.abs(p.dx)>0.25 || Math.abs(p.dy)>0.25);
      assert.deepEqual(faults, [], 'painted artwork must centre within 0.25 CSS px in its shared column');
      assert.ok(Math.abs(paint[0].dx-paint[1].dx)<=0.25 && Math.abs(paint[0].dy-paint[1].dy)<=0.25,
        'outlined and outline-free paint must share a centre');
    } finally { await page.close(); }
  });
}

test('native snapshot retains context paint and discards a late response after clear', {skip}, async () => {
  const page = await fixture('ltr', 'open', '120', 'direct');
  try {
    const initial = await page.evaluate(() => measure());
    await page.evaluate(rawGlyph => {
      const folder=document.getElementById('bare'), item=document.getElementById('menu-bare');
      window.originalHref=folder.querySelector('image').getAttribute('href');
      window.packagedHref='chrome://browser/skin/zen-icons/square.svg';
      folder.querySelector('image').setAttribute('href', packagedHref);
      window.pendingPaint=[];
      window.paintAdapter=menuApi.createBrowserMoveToFolderMenuAdapters({document,console,
        getComputedStyle:window.getComputedStyle.bind(window),
        fetch:address => new Promise(resolve => pendingPaint.push({address,resolve})),
      });
      window.packagedSvg=rawGlyph.slice(rawGlyph.indexOf('<svg'));
      paintAdapter.decorateItem(item, folder, null);
      window.cloneImage=item.querySelector('svg image');
      window.expectedFill=cloneImage.style.getPropertyValue('fill');
      window.expectedOpacity=cloneImage.style.getPropertyValue('fill-opacity');
      pendingPaint[0].resolve({ok:true,text:async () => packagedSvg});
    }, glyphSource);
    await page.waitForFunction(() => cloneImage.getAttribute('href').startsWith('data:image/svg+xml,'));
    const result = await page.evaluate(async () => {
      const painted=decodeURIComponent(cloneImage.getAttribute('href').split(',').slice(1).join(','));
      const item=document.getElementById('menu-bare'), folder=document.getElementById('bare');
      paintAdapter.decorateItem(item,folder,null);
      const lateImage=item.querySelector('svg image');
      paintAdapter.clearItem(item);
      pendingPaint[1].resolve({ok:true,text:async () => packagedSvg});
      await new Promise(requestAnimationFrame);
      const output={painted,fill:expectedFill,opacity:expectedOpacity,
        sourceHref:folder.querySelector('image').getAttribute('href'),
        lateHref:lateImage.getAttribute('href'),lateConnected:lateImage.isConnected,
        remaining:item.querySelectorAll('svg').length,requests:pendingPaint.map(p=>p.address)};
      folder.querySelector('image').setAttribute('href',originalHref);
      return output;
    });
    assert.ok(!/context-(?:fill|stroke)/.test(result.painted), 'context paint becomes self-contained');
    assert.ok(result.painted.includes(`fill="${result.fill}"`) && result.painted.includes(`fill-opacity="${result.opacity}"`),
      'resolved native colour and opacity survive the geometry pass');
    assert.equal(result.sourceHref,'chrome://browser/skin/zen-icons/square.svg');
    assert.deepEqual(result.requests,[result.sourceHref,result.sourceHref]);
    assert.equal(result.lateHref,result.sourceHref, 'late paint response does not mutate detached image');
    assert.equal(result.lateConnected,false); assert.equal(result.remaining,0);
    assert.deepEqual(await page.evaluate(() => measure()),initial, 'cleanup leaves source, labels and document root intact');
  } finally { await page.close(); }
});

for (const slot of ['direct','nested']) test(`repeated ${slot} snapshots release wrappers, resources and measurement viewports`, {skip}, async t => {
  const page = await fixture('ltr', 'open', '135.5', slot);
  try {
    const before = await page.evaluate(() => measure());
    const sidebarBefore = await page.locator('#sidebar').screenshot();
    const result = await page.evaluate(async () => {
      const menu=document.getElementById('menu'), root=document.documentElement;
      const items=[...menu.querySelectorAll('menuitem')], rootChildren=[...root.children];
      const faults=[], durations=[], previous=new Map(), expectedNodes=new Map();
      const measuredAdded=[], measuredRemoved=[];
      const observer=new MutationObserver(() => {});
      observer.observe(root,{childList:true});
      let maxWrappers=0, maxLiveResources=0;
      for (let cycle=0; cycle<60; cycle++) {
        menu.style.display=cycle%2 ? 'none' : '';
        for (const [index,item] of items.entries()) {
          const folder=document.getElementById(index===0 ? 'outlined' : 'bare');
          const prior=previous.get(item);
          const start=performance.now();
          adapter.decorateItem(item,folder,null);
          durations.push(performance.now()-start);
          const clone=item.querySelector('svg');
          const wrappers=clone.querySelectorAll('g:not([class])').length;
          maxWrappers=Math.max(maxWrappers,wrappers);
          if (wrappers!==(index===0 ? 1 : 0)) faults.push(`cycle ${cycle}: unexpected geometry wrapper count ${wrappers} for ${index}`);
          if (item.querySelectorAll('svg').length!==1) faults.push(`cycle ${cycle}: accumulated snapshots`);
          if (prior?.isConnected) faults.push(`cycle ${cycle}: prior snapshot retained`);
          if ([...root.children].some((node,i)=>node!==rootChildren[i]) || root.children.length!==rootChildren.length)
            faults.push(`cycle ${cycle}: measurement viewport retained at return`);
          const count=clone.querySelectorAll('*').length;
          if (expectedNodes.has(item) && expectedNodes.get(item)!==count) faults.push(`cycle ${cycle}: clone descendants grew`);
          expectedNodes.set(item,count); previous.set(item,clone);
          const resources=[...menu.querySelectorAll('svg [id]')];
          maxLiveResources=Math.max(maxLiveResources,resources.length);
          if (new Set(resources.map(n=>n.id)).size!==resources.length) faults.push(`cycle ${cycle}: resource ID collision`);
          if (resources.some(n=>document.getElementById(n.id)!==n)) faults.push(`cycle ${cycle}: resource resolves outside its current snapshot`);
        }
        for (const record of observer.takeRecords()) {
          measuredAdded.push(...record.addedNodes); measuredRemoved.push(...record.removedNodes);
        }
      }
      menu.style.removeProperty('display');
      for (const item of items) { adapter.clearItem(item); adapter.clearItem(item); }
      observer.disconnect();
      await new Promise(requestAnimationFrame);
      const resourcesAfterClear=document.querySelectorAll('[id^="better-zen-folders-menu-resource-"]').length;
      const rootRestored=root.children.length===rootChildren.length && [...root.children].every((n,i)=>n===rootChildren[i]);
      const removedAll=measuredAdded.every(n=>!n.isConnected && n.children.length===0 && measuredRemoved.includes(n));
      const sorted=[...durations].sort((a,b)=>a-b);
      return {faults,maxWrappers,maxLiveResources,resourcesAfterClear,rootRestored,removedAll,
        remainingSnapshots:menu.querySelectorAll('svg').length,
        added:measuredAdded.length,removed:measuredRemoved.length,
        timing:{calls:durations.length,totalMs:durations.reduce((a,b)=>a+b,0),
          medianMs:sorted[Math.floor(sorted.length*.5)],p95Ms:sorted[Math.floor(sorted.length*.95)],maxMs:sorted.at(-1)}};
    });
    t.diagnostic(JSON.stringify({slot,...result}));
    assert.deepEqual(result.faults,[]);
    assert.equal(result.added,60,'only outlined snapshots require a measurement viewport');
    assert.equal(result.removed,60,'each temporary viewport removed synchronously');
    assert.ok(result.removedAll && result.rootRestored,'no measurement nodes survive return or the next frame');
    assert.equal(result.resourcesAfterClear,0); assert.equal(result.remainingSnapshots,0);
    assert.deepEqual(await page.evaluate(() => measure()),before,'sidebar markup, labels and root remain intact');
    assert.ok((await page.locator('#sidebar').screenshot()).equals(sidebarBefore),'repeated measurement does not change source pixels');
    // Timings are evidence, not a brittle CI performance threshold. This is a
    // two-destination Chromium microbenchmark, not a live Gecko latency claim.
  } finally { await page.close(); }
});

test('round9 source provenance', t => {
  const sha = text => createHash('sha256').update(text).digest('hex');
  t.diagnostic(JSON.stringify({nativeSvg:sha(folderSource),nativeCss:sha(nativeCss),zenIconsCss:sha(ziCss),
    diskProduct:sha(source)}));
});
