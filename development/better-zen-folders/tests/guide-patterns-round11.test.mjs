import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';

// Standalone headless HTML/CSS rendering, not Gecko/XUL or a Zen profile.
// Level assignment belongs to main's visibility-manager integration. These
// literal attributes exercise its agreed CSS contract through two full cycles.
const levels = ['0', '1', '2', '3', '0', '1', '2', '3'];
const modulePath = process.env.BZF_PLAYWRIGHT_MODULE;
const skip = modulePath ? false : 'set BZF_PLAYWRIGHT_MODULE for headless rendering';
const files = {
  css: new URL('../chrome.css', import.meta.url),
  product: new URL('../scripts/better-zen-folders.uc.mjs', import.meta.url),
  native: new URL('../artifacts/native-20260915/zen-folders.css', import.meta.url),
  theme: new URL('../theme.json', import.meta.url),
};
const input = Object.fromEntries(await Promise.all(Object.entries(files).map(async ([k,p]) => [k, await readFile(p, 'utf8')])));
let browser, PNG;
before(async () => {
  if (skip) return;
  const require = createRequire(import.meta.url);
  ({PNG} = require(require.resolve('pngjs', {paths:[modulePath]})));
  browser = await require(modulePath).chromium.launch({headless:true});
});
after(async () => { await browser?.close(); });
const dpr = 4;

async function fixture(direction, thickness, background) {
  const page = await browser.newPage({viewport:{width:600,height:1100},deviceScaleFactor:dpr});
  await page.route('**/*', route => route.abort());
  let tree = '';
  for (let i = 7; i >= 0; i--) tree = `<zen-folder id="folder-${i}">
    <div class="tab-group-label-container"><span class="tab-group-folder-icon"></span><label class="tab-group-label" aria-expanded="true">Folder ${i}</label></div>
    <div class="tab-group-container"><tab class="tabbrowser-tab" id="tab-${i}"></tab>${tree}</div></zen-folder>`;
  await page.setContent(`<style id="native-source">${input.native}</style><style>
    :root {--tab-min-height:36px;--tab-margin-block:2px;--tab-group-label-padding:8px;
      --zen-primary-color:#607080;--zen-colors-primary:#aaa;--tab-group-line-thickness:${thickness}px}
    body {margin:24px;background:${background};color:#e00000}
    .tab-group-label-container {display:flex;position:relative}
    .tab-group-container {display:flex;flex-direction:column}
    tab {display:block;position:relative;height:72px;flex:none}
  </style><style id="candidate">${input.css}</style>
    <zen-workspace active="true"><div class="zen-workspace-pinned-tabs-section">${tree}</div></zen-workspace>`);
  await page.evaluate(async ({direction,source}) => {
    document.documentElement.dir = direction;
    document.documentElement.setAttribute('zen-sidebar-expanded', 'true');
    document.documentElement.setAttribute('better-zen-folders-show-guides', 'true');
    const workspace = document.querySelector('zen-workspace');
    workspace.pinnedTabsContainer = workspace.firstElementChild;
    for (const folder of document.querySelectorAll('zen-folder')) {
      folder.isZenFolder = true;
      folder.labelElement = folder.querySelector(':scope > .tab-group-label-container > label');
      folder.style.setProperty('--better-zen-folders-folder-color', '#e00000');
    }
    for (const item of document.querySelectorAll('zen-folder,tab'))
      Object.defineProperty(item, 'group', {get:() => item.parentElement.closest('zen-folder')});
    const url = URL.createObjectURL(new Blob([source], {type:'text/javascript'}));
    const {StickyFolderVisibilityManager} = await import(url);
    URL.revokeObjectURL(url);
    const manager = new StickyFolderVisibilityManager({document,
      gBrowser:{isTab:item => item.localName === 'tab',isSplitViewWrapper:() => false}}, {get:() => true});
    // Only persisted Sticky state is supplied; production creates and styles
    // every button, including any inline geometry main later introduces.
    manager.store = {has:() => true};
    window.contentRects = () => [...document.querySelectorAll('.tab-group-label-container, .tab-group-label, .tab-group-folder-icon, tab')]
      .map(node => node.getBoundingClientRect().toJSON());
    window.beforeDecoration = window.contentRects();
    for (const item of document.querySelectorAll('zen-folder,tab')) manager.decorateEar(item, true);
  }, {direction,source:input.product});
  return page;
}

async function geometry(page) {
  return page.evaluate(() => [...document.querySelectorAll('zen-folder')].map(folder => {
    const container = folder.querySelector(':scope > .tab-group-container');
    const rect = node => node.getBoundingClientRect().toJSON();
    const g = getComputedStyle(container, '::before'), c = rect(container);
    const width = parseFloat(g.borderInlineStartWidth), offset = parseFloat(g.insetInlineStart);
    return {container:c, row:rect(folder.firstElementChild), tab:rect(container.firstElementChild),
      guide:{x:getComputedStyle(folder).direction === 'rtl' ? c.right-offset-width : c.left+offset,
        y:c.top,width,color:g.borderInlineStartColor,opacity:g.opacity,content:g.content},
      button:rect(container.firstElementChild.querySelector('button'))};
  }));
}

async function assignLevels(page) {
  await page.evaluate(levels => levels.forEach((value,i) =>
    document.getElementById(`folder-${i}`).setAttribute('data-bzf-guide-level',value)), levels);
}

function guideRuns(png, guide) {
  const x = Math.floor((guide.x + guide.width/2)*dpr);
  const painted = Array.from({length:64*dpr}, (_,y) => {
    const offset = ((Math.round(guide.y*dpr)+y)*png.width+x)*4;
    return png.data[offset] > 120 && png.data[offset+1] < 65 && png.data[offset+2] < 65;
  });
  const runs = [];
  for (const value of painted) {
    if (runs.at(-1)?.painted === value) runs.at(-1).length++;
    else runs.push({painted:value,length:1});
  }
  return runs.map(run => ({...run,length:run.length/dpr}));
}

for (const direction of ['ltr','rtl']) for (const [background,thickness] of [['#ffffff',1],['#17212b',2]]) {
  test(`two painted guide cycles, fallback and opacity without layout changes: ${direction}/${thickness}px`, {skip}, async () => {
    const page = await fixture(direction,thickness,background);
    try {
      const before = await geometry(page);
      const fallback = PNG.sync.read(await page.screenshot());
      assert.deepEqual(guideRuns(fallback,before[0].guide), [{painted:true,length:64}], 'unannotated root stays solid');
      assert.ok(guideRuns(fallback,before[1].guide).some(run => !run.painted), 'unannotated child stays dashed');
      await assignLevels(page);
      assert.deepEqual(await geometry(page),before,'attributes must change paint only');
      const png = PNG.sync.read(await page.screenshot());
      for (let i=0;i<8;i++) {
        const runs = guideRuns(png,before[i].guide);
        if (levels[i] === '0') assert.deepEqual(runs,[{painted:true,length:64}], `depth ${i}: solid, including nested restart`);
        else {
          const expectedInk = {'1':8,'2':3,'3':thickness}[levels[i]];
          const fullRuns = runs.slice(1,-1).filter(run => run.painted);
          assert.ok(fullRuns.length >= 4, `depth ${i}: repeated painted marks`);
          for (const run of fullRuns) assert.ok(Math.abs(run.length-expectedInk)<=.5,
            `depth ${i}: expected ${expectedInk}px marks, got ${JSON.stringify(runs)}`);
          assert.ok(runs.some(run => !run.painted && run.length>=2),`depth ${i}: transparent gaps`);
        }
        assert.equal(before[i].guide.width,thickness);
        assert.equal(before[i].guide.color,'rgb(224, 0, 0)');
      }
      for (const enabled of [false,true,false,true]) {
        await page.evaluate(value => document.documentElement.setAttribute('better-zen-folders-show-guides',String(value)),enabled);
        const actual = await geometry(page);
        for (let i=0;i<8;i++) {
          assert.equal(actual[i].guide.opacity,enabled?'1':'0');
          actual[i].guide.opacity='1';
          assert.deepEqual(actual[i],before[i],'toggle must preserve geometry and colour');
        }
        if (!enabled) {
          const hidden = PNG.sync.read(await page.screenshot());
          for (const {guide} of actual) assert.deepEqual(guideRuns(hidden,guide),[{painted:false,length:64}]);
        }
      }
      assert.equal(await page.locator('#native-source').textContent(),input.native,'native stylesheet untouched');
    } finally { await page.close(); }
  });

  test(`ear paint advances one indent per depth with unchanged hitboxes and rounded flat silhouette: ${direction}/${thickness}px`, {skip}, async () => {
    const page = await fixture(direction,thickness,background);
    try {
      await assignLevels(page);
      const guides = await geometry(page);
      assert.equal(await page.evaluate(() => JSON.stringify(contentRects()) === JSON.stringify(beforeDecoration)),
        true, 'decoration must not move rows, icons or labels');
      const folderCorners = await page.evaluate(() => [...document.querySelectorAll('zen-folder')].map(folder => {
        const row = folder.firstElementChild.getBoundingClientRect();
        const ear = folder.firstElementChild.querySelector('.better-zen-folders-sticky-ear').getBoundingClientRect();
        const rtl = getComputedStyle(folder).direction === 'rtl';
        return {row:rtl ? row.right : row.left, ear:rtl ? ear.right : ear.left};
      }));
      for (let depth=0;depth<folderCorners.length;depth++) {
        assert.equal(folderCorners[depth].ear, folderCorners[depth].row, `depth ${depth}: row leading corner`);
        if (depth) assert.equal((folderCorners[depth].ear-folderCorners[depth-1].ear)*(direction==='rtl'?-1:1),
          14, `depth ${depth}: exactly one native indentation step, including root to first child`);
      }
      const markers = await page.evaluate(() => [...document.querySelectorAll(
        '.better-zen-folders-sticky-toggle:not([data-bzf-root-sticky-control="true"])')].map(button => {
        const ear=button.firstElementChild, s=getComputedStyle(ear), b=button.getBoundingClientRect();
        return {guideIndex:Number(button._bzfStickyTarget.group.id.replace('folder-','')),
          ear:ear.getBoundingClientRect().toJSON(),button:b.toJSON(),
          hit:document.elementFromPoint(b.x+b.width/2,b.y+b.height/2)===button,
          background:s.backgroundColor,image:s.backgroundImage,mask:s.maskImage,opacity:s.opacity,
          pointer:s.pointerEvents,transform:s.transform};
      }));
      assert.equal(markers.length,15,'eight tabs and seven nested folder markers');
      for (const {ear,button,guideIndex,...paint} of markers) {
        const guide=guides[guideIndex].guide;
        const gap = direction==='ltr' ? ear.left-guide.x-guide.width : guide.x-ear.right;
        assert.equal(gap,0,`guide ${guideIndex}: paint begins after the parent guide, without overlap`);
        assert.equal(button.width,27,'expanded gutter hitbox must not change');
        assert.equal(button.height,16,'production button height must not change');
        assert.equal(ear.width,13-thickness,'fit paint and 1px gap within the 14px gutter');
        assert.equal(ear.height,ear.width);
        assert.ok(ear.left>=button.left&&ear.right<=button.right,'paint stays inside expanded hitbox');
        assert.equal(ear.top,button.top+1);
        assert.equal(paint.hit,true,'original button hit area stays reachable');
        assert.equal(paint.background,'rgb(224, 0, 0)');assert.equal(paint.image,'none');
        assert.equal(paint.opacity,'1');assert.equal(paint.pointer,'none');
        assert.match(paint.mask,/svg/);
        assert.equal(paint.transform,direction==='rtl'?'matrix(-1, 0, 0, 1, 0, 0)':'none');
      }
      // Sample actual masked paint; reflect sampling coordinates for RTL.
      const png=PNG.sync.read(await page.screenshot()), ear=markers[0].ear;
      const isInk=(x,y) => {
        const scale=ear.width/12;
        const px=Math.floor((direction==='rtl'?ear.right-x*scale:ear.left+x*scale)*dpr);
        const py=Math.floor((ear.top+y*scale)*dpr), offset=(py*png.width+px)*4;
        return png.data[offset]>120 && png.data[offset+1]<65 && png.data[offset+2]<65;
      };
      assert.equal(isInk(2,2),true,'upper leading corner filled');
      assert.equal(isInk(9,9),false,'diagonal faces down toward row content');
      assert.equal(isInk(.25,.25),false,'rounded leading bend');
      assert.equal(isInk(11,.25),false,'rounded top tip');
      assert.equal(isInk(.25,11),false,'rounded lower tip');
      const root = await page.locator('#folder-0 > .tab-group-label-container').evaluate(row => {
        const r=row.getBoundingClientRect(),e=row.querySelector('.better-zen-folders-sticky-ear').getBoundingClientRect();
        return e.left>=r.left && e.right<=r.right;
      });
      assert.equal(root,true,'root marker has no parent guide and stays inside its row');
    } finally { await page.close(); }
  });
}

for (const icon of ['', 'data:image/png;base64,invalid'])
test(`production default Space glyph paints a grey circle despite border-radius reset: ${icon ? 'failed image' : 'empty'}`, {skip}, async () => {
  const page=await browser.newPage({deviceScaleFactor:4});
  try {
    await page.route('**/*', route => route.abort());
    await page.setContent(`<style>${input.css}
      html,body{background:transparent}menuitem{font-size:16px;display:flex;align-items:center;padding-inline:8px}
      .menu-icon{display:block;width:16px;height:16px}
      .better-zen-folders-space-icon{width:16px;height:16px;flex-basis:16px}
    </style><style id="reset"></style><menupopup><menuitem zen-workspace-id="default" label="Native"
      type="radio" checked="true" image="original.svg" command="native-move">
      <span class="menu-icon"></span><label>Unnamed Space</label>
    </menuitem></menupopup>`);
    await page.evaluate(async ({source,icon}) => {
      const url=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
      const {SpaceMoveMenuManager}=await import(url);URL.revokeObjectURL(url);
      const workspace={name:'Unnamed Space',icon,theme:{gradientColors:[{c:[12,34,56]}]}};
      window.manager=new SpaceMoveMenuManager({document,CSS,gZenWorkspaces:{getWorkspaceFromId:()=>workspace}}, {get:()=>true});
      manager.popup=document.querySelector('menupopup');manager.decorate();
      const image=document.querySelector('.better-zen-folders-space-icon img');
      if(image && !image.complete) await new Promise(resolve=>image.addEventListener('error',resolve,{once:true}));
    }, {source:input.product,icon});
    for (const direction of ['ltr','rtl']) for (const reset of [false,true]) {
      await page.evaluate(direction => document.documentElement.dir=direction,direction);
      await page.locator('#reset').evaluate((node,reset) => {
        // A resilience test, not a claim about the unidentified live CSS cause.
        node.textContent=reset?'*{border-radius:0 !important}':'';
      },reset);
      const fallback=page.locator('.better-zen-folders-space-default-icon');
      const actual=await fallback.evaluate(node => {
        const s=getComputedStyle(node),r=node.getBoundingClientRect(),slot=node.parentElement.getBoundingClientRect();
        return {width:r.width,height:r.height,slot:[slot.width,slot.height],
          dx:r.x+r.width/2-slot.x-slot.width/2,dy:r.y+r.height/2-slot.y-slot.height/2,
          pointer:s.pointerEvents,text:node.textContent,
          before:getComputedStyle(node,'::before').content,after:getComputedStyle(node,'::after').content};
      });
      assert.ok(Math.abs(actual.width-10.4)<.1,'circle is .65em at 16px');
      assert.equal(actual.width,actual.height);assert.deepEqual(actual.slot,[16,16]);
      assert.ok(Math.abs(actual.dx)<.02);assert.ok(Math.abs(actual.dy)<.02);
      assert.equal(actual.pointer,'none');
      assert.equal(actual.text,'');assert.equal(actual.before,'none');assert.equal(actual.after,'none');
      const bounds=await fallback.boundingBox();
      const clip={x:Math.floor(bounds.x),y:Math.floor(bounds.y),
        width:Math.ceil(bounds.x+bounds.width)-Math.floor(bounds.x),
        height:Math.ceil(bounds.y+bounds.height)-Math.floor(bounds.y)};
      const png=PNG.sync.read(await page.screenshot({omitBackground:true,clip}));
      const pixel=(x,y) => {
        const px=Math.floor((bounds.x-clip.x+x*bounds.width)*4);
        const py=Math.floor((bounds.y-clip.y+y*bounds.height)*4);
        return [...png.data.subarray((py*png.width+px)*4,(py*png.width+px)*4+4)];
      };
      assert.deepEqual(pixel(.5,.5),[128,128,128,255],`${direction}/${reset}: grey centre`);
      for(const [x,y] of [[.05,.05],[.95,.05],[.05,.95],[.95,.95]])
        assert.equal(pixel(x,y)[3],0,`${direction}/${reset}: transparent corner ${x},${y}: ${pixel(x,y)}`);
      for(const [x,y] of [[.5,.1],[.9,.5],[.5,.9],[.1,.5]])
        assert.deepEqual(pixel(x,y),[128,128,128,255],'circle reaches each cardinal edge');
      let area=0;for(let index=3;index<png.data.length;index+=4)area+=png.data[index]/255;
      const coverage=area/(bounds.width*bounds.height*16);
      assert.ok(Math.abs(coverage-Math.PI/4)<.08,`${direction}/${reset}: circular painted area, got ${coverage}`);
    }
    const lifecycle=await page.evaluate(() => {
      const item=document.querySelector('menuitem');
      const before={check:item.getAttribute('checked'),display:getComputedStyle(item.querySelector('.menu-icon')).display,
        image:item.getAttribute('image'),strip:item.querySelector('.better-zen-folders-space-colour').style.background};
      manager.clearDecoration();manager.clearDecoration();
      return {before,after:{check:item.getAttribute('checked'),image:item.getAttribute('image'),label:item.getAttribute('label'),
        command:item.getAttribute('command'),owned:item.querySelectorAll('[aria-hidden="true"]').length}};
    });
    assert.deepEqual(lifecycle,{before:{check:'true',display:'block',image:null,strip:'rgb(12, 34, 56)'},
      after:{check:'true',image:'original.svg',label:'Native',command:'native-move',owned:0}});
  } finally { await page.close(); }
});

test('native theme and source inputs remain unchanged on disk', async () => {
  const sha = value => createHash('sha256').update(value).digest('hex');
  for (const key of ['native','theme']) assert.equal(sha(await readFile(files[key])),sha(input[key]),key);
});
