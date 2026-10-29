import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';

const modulePath = process.env.BZF_PLAYWRIGHT_MODULE;
const skip = modulePath ? false : 'Set BZF_PLAYWRIGHT_MODULE for isolated Chromium resource tests';
const source = await readFile(new URL('../scripts/better-zen-folders.uc.mjs', import.meta.url), 'utf8');
// Minimal native structure: fixed gradient IDs, base fill + 0.1-opacity overlay,
// and the native .icon slot. No external resources or profile files.
const markup = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="28" height="28" viewBox="0 0 28 28">
  <defs>
    <linearGradient id="gradient-0" gradientUnits="userSpaceOnUse" x1="14" x2="14" y1="5.625" y2="22.375"><stop offset="0" stop-color="white"/><stop offset="1" stop-color="black"/></linearGradient>
    <linearGradient id="gradient-1" gradientUnits="userSpaceOnUse" x1="14" x2="14" y1="9.625" y2="22.375"><stop offset="0" stop-color="white"/><stop offset="1" stop-color="black"/></linearGradient>
    <path id="glyph" d="M11 13h6v4h-6z"/>
  </defs>
  <rect class="back" x="4" y="5.625" width="19" height="16.75" rx="2" fill="#22c55e"/>
  <rect class="back" x="4" y="5.625" width="19" height="16.75" rx="2" style="fill:url(#gradient-0);fill-opacity:0.1"/>
  <rect class="front" x="5.625" y="9.625" width="16.75" height="12.75" rx="2.375" fill="#22c55e"/>
  <rect class="front" x="5.625" y="9.625" width="16.75" height="12.75" rx="2.375" fill="url(#gradient-1)" fill-opacity="0.1"/>
  <g class="icon"><use href="#glyph" fill="black"/><use xlink:href="about:blank#glyph" fill="black"/></g>
</svg>`;

async function withFixture(run) {
  const {chromium} = createRequire(import.meta.url)(modulePath);
  const browser = await chromium.launch({headless:true});
  try {
    const page = await browser.newPage({viewport:{width:200,height:100},deviceScaleFactor:2});
    await page.route('**/*', route=>route.abort());
    await page.setContent(`<style>body{margin:0;background:#202020}#menu{position:absolute;left:80px;top:20px}#sidebar{position:absolute;left:20px;top:20px}.menu-icon{display:none}svg{display:block}</style>
      <div id="menu"><div class="context-zen-move-to-folder-item"><img class="menu-icon"></div></div>
      <div id="sidebar"><zen-folder><div class="tab-group-label-container"><div class="tab-group-folder-icon">${markup}</div></div></zen-folder></div>`);
    await page.evaluate(async source=>{
      const url=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
      const api=await import(url);URL.revokeObjectURL(url);
      window.folder=document.querySelector('zen-folder');
      window.item=document.querySelector('.context-zen-move-to-folder-item');
      window.originalSvg=folder.querySelector('svg').outerHTML;
      window.adapter=api.createBrowserMoveToFolderMenuAdapters(window);
    },source);
    await run(page);
  } finally {await browser.close();}
}
const capture=(page,x)=>page.screenshot({clip:{x,y:16,width:36,height:36}});
const assertSamePixels=(actual,expected,message)=>{
  const require=createRequire(import.meta.url);
  const {PNG}=require(require.resolve('pngjs',{paths:[modulePath]}));
  const a=PNG.sync.read(actual),b=PNG.sync.read(expected);
  assert.equal(a.width,b.width);assert.equal(a.height,b.height);
  assert.ok(a.data.equals(b.data),message);
};
async function evidence(name, bytes) {
  if (!process.env.BZF_COLOUR_EVIDENCE) return;
  const dir=new URL('../artifacts/round5-review/',import.meta.url);
  const phase=process.env.BZF_COLOUR_EVIDENCE;
  await mkdir(dir,{recursive:true});await writeFile(new URL(`colour-production-${phase}-${name}.png`,dir),bytes);
}

// Break caught: adding a hidden menu clone changes which gradient the original
// sidebar resolves. Exercise the real adapter and compare decoded output pixels.
test('production menu clone cannot darken the original when inserted before it and hidden', {skip}, async()=>{
  await withFixture(async page=>{
    const baseline=await capture(page,16);await evidence('sidebar-before',baseline);
    await page.evaluate(()=>{document.getElementById('menu').style.display='none';adapter.decorateItem(item,folder,'#22c55e');});
    const hidden=await capture(page,16);await evidence('sidebar-hidden-menu',hidden);
    assertSamePixels(hidden,baseline,'hidden menu clone must not capture original gradient resolution');
    await page.evaluate(()=>{document.getElementById('menu').style.display='block';});
    assertSamePixels(await capture(page,16),baseline,'showing the menu must not change the sidebar');
    await page.evaluate(()=>{document.getElementById('menu').style.display='none';});
    assertSamePixels(await capture(page,16),baseline,'hiding an already shown menu must preserve the sidebar');
    await page.evaluate(()=>adapter.clearItem(item));
    assertSamePixels(await capture(page,16),baseline,'clearing menu decoration preserves sidebar pixels');
    assert.equal(await page.evaluate(()=>folder.querySelector('svg').outerHTML),await page.evaluate(()=>originalSvg));
  });
});

// Break caught: references copied into the clone still depend on original defs.
test('production clone renders its own gradients and use references when the source is hidden', {skip}, async()=>{
  await withFixture(async page=>{
    await page.evaluate(()=>adapter.decorateItem(item,folder,'#22c55e'));
    const baseline=await capture(page,76);await evidence('clone-before',baseline);
    await page.evaluate(()=>{
      document.querySelectorAll('#sidebar stop').forEach(stop=>stop.setAttribute('stop-color','red'));
      document.getElementById('sidebar').style.display='none';
    });
    const independent=await capture(page,76);await evidence('clone-source-hidden',independent);
    assertSamePixels(independent,baseline,'menu clone paints independently of original resource renderability');
  });
});

// Break caught: renaming a gradient removes ID-based theme rules before the
// clone has retained the source's resolved stop paint.
test('production clone preserves ID-styled gradient stop colour and opacity after resource renaming', {skip}, async()=>{
  await withFixture(async page=>{
    await page.addStyleTag({content:'#gradient-0 stop:first-child {stop-color:red!important;stop-opacity:.4!important}'});
    const result=await page.evaluate(()=>{
      const svg=folder.querySelector('svg'), original=svg.outerHTML;
      const paint=stop=>({color:getComputedStyle(stop).stopColor,opacity:getComputedStyle(stop).stopOpacity});
      const originalStop=svg.querySelector('linearGradient stop');
      const before=paint(originalStop);
      adapter.decorateItem(item,folder,'#22c55e');
      const clone=item.querySelector('svg');
      return {before,after:paint(originalStop),clone:paint(clone.querySelector('linearGradient stop')),
        otherStop:paint(clone.querySelector('linearGradient stop:last-child')),
        renamed:clone.querySelector('linearGradient').id!=='gradient-0',sourceUnchanged:svg.outerHTML===original};
    });
    assert.deepEqual(result.before,{color:'rgb(255, 0, 0)',opacity:'0.4'});
    assert.deepEqual(result.after,result.before);
    assert.ok(result.sourceUnchanged);assert.ok(result.renamed);
    assert.deepEqual(result.clone,{color:'rgb(255, 0, 0)',opacity:'0.4'},'resolved ID-based stop paint must survive renaming');
    assert.deepEqual(result.otherStop,{color:'rgb(0, 0, 0)',opacity:'1'});
  });
});

test('clone rewrites local href, xlink and absolute same-document computed URL references only', {skip}, async()=>{
  await withFixture(async page=>{
    const result=await page.evaluate(async source=>{
      const api=await import(URL.createObjectURL(new Blob([source],{type:'text/javascript'})));
      const nativeComputed=window.getComputedStyle.bind(window);
      const host={document,console,getComputedStyle(node){
        const css=nativeComputed(node);return {getPropertyPriority:key=>css.getPropertyPriority(key),
          getPropertyValue:key=>css.getPropertyValue(key).replace(/url\("?#(gradient-[01])"?\)/g,'url("about:blank#$1")')};
      },fetch(){throw Error('this fixture has no external fetch authority');}};
      const svg=folder.querySelector('svg');
      svg.setAttribute('data-external','url("https://example.invalid/image.svg#gradient-0")');
      svg.setAttribute('data-missing','url(#not-in-this-svg)');
      svg.setAttribute('data-encoded','url("about:blank#gradient%2D0")');
      svg.setAttribute('data-multi',"url('#gradient-0') url(about:blank#gradient-1)");
      const original=svg.outerHTML;
      const own=api.createBrowserMoveToFolderMenuAdapters(host);
      own.decorateItem(item,folder,'#22c55e');
      const clone=item.querySelector('svg');
      const ids=[...clone.querySelectorAll('[id]')].map(n=>n.id);
      const refs=[...clone.querySelectorAll('use')].map(n=>n.getAttribute('href')??n.getAttributeNS('http://www.w3.org/1999/xlink','href'));
      const fills=[...clone.querySelectorAll('.back,.front')].map(n=>n.style.fill).filter(v=>v.includes('url('));
      const firstIds=[...ids];
      const second=item.cloneNode(false);second.innerHTML='<img class="menu-icon">';item.after(second);
      own.decorateItem(second,folder,'#22c55e');
      const secondIds=[...second.querySelectorAll('svg [id]')].map(n=>n.id);
      return {ids,secondIds,refs,fills,sourceUnchanged:svg.outerHTML===original,
        allLocalResolve:[...refs,...fills.map(value=>value.match(/#([^"')]+)/)?.[1]).map(id=>`#${id}`)]
          .every(ref=>ids.includes(ref.slice(1))),
        external:clone.getAttribute('data-external'),missing:clone.getAttribute('data-missing'),
        encoded:clone.getAttribute('data-encoded'),multi:clone.getAttribute('data-multi'),
        originalsResolve:['gradient-0','gradient-1','glyph'].every(id=>svg.contains(document.getElementById(id)))};
    },source);
    assert.ok(result.sourceUnchanged);
    assert.ok(result.originalsResolve,'document-global original IDs still resolve inside the original');
    assert.ok(result.allLocalResolve,'all internal references resolve to a clone-owned resource');
    assert.equal(new Set([...result.ids,...result.secondIds]).size,result.ids.length+result.secondIds.length);
    assert.equal(result.external,'url("https://example.invalid/image.svg#gradient-0")');
    assert.equal(result.missing,'url(#not-in-this-svg)');
    assert.match(result.encoded,new RegExp(`#${result.ids[0]}`));
    for(const id of result.ids.slice(0,2))assert.ok(result.multi.includes(`#${id}`));
  });
});

test('resource isolation survives occupied prefixes, adapter recreation and module reload with punctuation in IDs', {skip}, async()=>{
  await withFixture(async page=>{
    const result=await page.evaluate(async source=>{
      const svg=folder.querySelector('svg');
      const gradient=svg.querySelector('linearGradient');gradient.id='paint.dot:+(a)';
      svg.querySelector('[id="glyph"]').id='glyph.dot:+(a)';
      svg.setAttribute('data-paint','url("about:blank#paint.dot%3A%2B(a)")');
      svg.setAttribute('data-other-document','url("about:blank?different#paint.dot%3A%2B(a)")');
      svg.setAttribute('data-foreign','url(#foreign-resource)');
      const uses=svg.querySelectorAll('use');
      uses[0].setAttribute('href','#glyph.dot:+(a)');
      uses[1].setAttributeNS('http://www.w3.org/1999/xlink','xlink:href','about:blank#glyph.dot%3A%2B(a)');
      const collision=document.createElement('div');collision.id='better-zen-folders-menu-resource-1';document.body.prepend(collision);
      const original=svg.outerHTML;
      const first=adapter;
      const moduleUrl=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
      const reloaded=await import(moduleUrl);URL.revokeObjectURL(moduleUrl);
      const recreated=reloaded.createBrowserMoveToFolderMenuAdapters(window);
      const again=reloaded.createBrowserMoveToFolderMenuAdapters(window);
      const clones=[];
      for(const owner of [first,recreated,again]){
        const entry=item.cloneNode(false);entry.innerHTML='<img class="menu-icon">';item.after(entry);
        owner.decorateItem(entry,folder,'#22c55e');
        const clone=entry.querySelector('svg');
        clones.push({ids:[...clone.querySelectorAll('[id]')].map(n=>n.id),
          refs:[...clone.querySelectorAll('use')].map(n=>n.getAttribute('href')??n.getAttributeNS('http://www.w3.org/1999/xlink','href')),
          paint:clone.getAttribute('data-paint'),other:clone.getAttribute('data-other-document'),foreign:clone.getAttribute('data-foreign')});
      }
      return {clones,sourceUnchanged:svg.outerHTML===original,collisionUnchanged:document.getElementById(collision.id)===collision};
    },source);
    assert.ok(result.sourceUnchanged);assert.ok(result.collisionUnchanged);
    const all=result.clones.flatMap(c=>c.ids);
    assert.equal(new Set(all).size,all.length);
    assert.ok(!all.includes('better-zen-folders-menu-resource-1'));
    for(const clone of result.clones){
      assert.ok(clone.paint.includes(`#${clone.ids[0]}`));
      assert.deepEqual(clone.refs,[`#${clone.ids[2]}`,`#${clone.ids[2]}`]);
      assert.equal(clone.other,'url("about:blank?different#paint.dot%3A%2B(a)")');
      assert.equal(clone.foreign,'url(#foreign-resource)');
    }
  });
});
