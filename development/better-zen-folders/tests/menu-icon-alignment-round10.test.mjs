import {fileURLToPath} from 'node:url';
import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';

// Investigation only. No Zen connection, profile access, network, screenshots on
// disk, or source mutation. Chromium screenshots are buffers. BZF_ROUND10_PROPOSAL
// applies the reviewable patch to a string only; the default tests current disk.
// The coordinate-space fault below is explicitly a hypothesis simulation, NOT a
// reproduction of Gecko's implementation or proof of this screenshot's cause.
// Opt in with BZF_ROUND10_FAULTS=1 for the two deliberately red current-source
// sensitivity checks; also set BZF_ROUND10_PROPOSAL=1 to test the proposal green.
// Ordinary project runs do not assert unproven cross-engine fault tolerance.
const modulePath = process.env.BZF_PLAYWRIGHT_MODULE;
const skip = modulePath ? false : 'set BZF_PLAYWRIGHT_MODULE for isolated Chromium';
// A historical symptom measurement is not a product regression. Keep its
// assertions when the original attachment exists, without requiring a purged
// Windows Temp file for all future source verification.
const symptomImage = process.env.BZF_ROUND10_SCREENSHOT
  ?? new URL('../fixtures/private-reference-not-distributed.png', import.meta.url);
const symptomSkip = skip || await access(symptomImage).then(()=>false,()=> 'original Round 10 screenshot is no longer available; rendered product regressions still run');
const zi = fileURLToPath(new URL('../fixtures/zen-icons/', import.meta.url));
const paths = {
  product: new URL('../scripts/better-zen-folders.uc.mjs', import.meta.url),
  css: new URL('../chrome.css', import.meta.url),
  nativeCss: new URL('../artifacts/native-20260915/zen-folders.css', import.meta.url),
  nativeFolder: new URL('../artifacts/native-20260915/ZenFolder.mjs', import.meta.url),
  iconsCss: `${zi}/sine/zen-icons/chrome.css`,
  eclipse: `${zi}/src/browser/themes/shared/zen-icons/common/lucide/eclipse.svg`,
  square: `${zi}/src/browser/themes/shared/zen-icons/common/selectable/square.svg`,
};
const inputs = Object.fromEntries(await Promise.all(Object.entries(paths).map(async ([k,p]) => [k,await readFile(p,'utf8')])));
const sha = s => createHash('sha256').update(s).digest('hex');
let source = inputs.product;
if (process.env.BZF_ROUND10_PROPOSAL === '1') {
  const patch = await readFile(new URL('../tmp/round10-menu-alignment-proposal.patch', import.meta.url), 'utf8');
  // Single ordinary unified hunk; exact context, applied in memory, fail closed.
  const lines = patch.slice(patch.indexOf('@@ ')).split(/\r?\n/).slice(1).filter(l => /^[ +\-]/.test(l));
  const old = lines.filter(l => l[0] !== '+').map(l => l.slice(1)).join('\n');
  const replacement = lines.filter(l => l[0] !== '-').map(l => l.slice(1)).join('\n');
  source = source.replaceAll('\r\n','\n');
  assert.equal(source.split(old).length,2,'proposal must match exactly once');
  source = source.replace(old,replacement);
}
const nativeSvg = inputs.nativeFolder.slice(inputs.nativeFolder.indexOf('<svg width="28"'),inputs.nativeFolder.indexOf('</svg>')+6);
const dataSvg = raw => 'data:image/svg+xml,' + encodeURIComponent(raw.slice(raw.indexOf('<svg'))
  .replace(/context-(?:fill|stroke)-opacity/g,'1').replace(/context-(?:fill|stroke)/g,'black'));
let browser, PNG;
before(async () => {
  if (skip) return;
  const require = createRequire(import.meta.url);
  ({PNG} = require(require.resolve('pngjs',{paths:[modulePath]})));
  browser = await require(modulePath).chromium.launch({headless:true});
});
after(async () => { await browser?.close(); });

function bounds(bytes, predicate = (r,g,b) => Math.min(r,g,b) < 230, crop) {
  const png = PNG.sync.read(bytes);
  const [x0,y0,x1,y1] = crop ?? [0,0,png.width,png.height];
  let l=x1,t=y1,r=-1,b=-1;
  for(let y=y0;y<y1;y++) for(let x=x0;x<x1;x++) {
    const i=(y*png.width+x)*4;
    if(!predicate(...png.data.subarray(i,i+4))) continue;
    l=Math.min(l,x);r=Math.max(r,x);t=Math.min(t,y);b=Math.max(b,y);
  }
  assert.ok(r>=l && b>=t,'artwork must paint');
  return {x:(l+r+1)/2,y:(t+b+1)/2,width:r-l+1,height:b-t+1};
}

async function fixture({direction='ltr',state='closed',percent='120',slot='direct',font=13,glyph='eclipse'}={}) {
  const page = await browser.newPage({viewport:{width:720,height:360},deviceScaleFactor:4});
  await page.route('**/*',route => route.abort());
  await page.setContent(`<style>
    :root{--tab-min-height:36px;--tab-margin-block:2px;--tab-group-label-padding:8px;
      --toolbar-color:#151515;--zen-primary-color:#00b4d8;--zen-colors-primary:#eee;
      --space-small:8px;--space-xxsmall:2px;color-scheme:light}
    body{margin:24px;font:16px sans-serif;background:white;color:#151515}
    zen-folder{width:340px}.tab-group-label-container{display:flex;position:relative}
    .tab-group-label{display:block;box-sizing:border-box}svg{display:block}
    ${inputs.nativeCss}\n${inputs.iconsCss}\n${inputs.css}
    /* Source-derived XUL UA/menu.css geometry, modeled in Chromium. Native
       menu.js uses direct html:img.menu-icon, menu-text, menu-highlightable-text,
       menu-accel. XUL's UA has display:flex and box-sizing:border-box. Windows
       menu.css centres items, pads rows .5em 1em, and adds 2px above its img.
       HTML surrogates are required: Chromium does not style XUL classes like
       Gecko. This exercises the native slot structure, NOT XUL rendering.
       The 52px minimum merely separates independent pixel sampling crops. */
    menuitem{display:flex;box-sizing:border-box;align-items:center;flex-shrink:0;
      width:440px;min-height:52px;padding:.5em 1em;font:${font}px sans-serif}
    .menu-icon{width:16px;height:16px;box-sizing:border-box;margin-top:2px;margin-inline-end:8px}
    .menu-text{display:flex;flex:1;margin:0;padding:1px 0}
    .menu-highlightable-text,.menu-accel{display:none}
    .menu-iconic-left{display:flex;align-items:center;flex:none;width:2em;height:2em;margin-inline-end:8px}
    .menu-iconic-icon{width:16px;height:16px}
  </style><div id="menu"></div><div id="sidebar">${['outlined','bare'].map(kind => `
    <zen-folder id="${kind}" zen-icons-has-inner-icon ${kind==='bare'?'zen-icons-hide-folder-shape zen-icons-enlarge-inner-icon':''}>
    <div class="tab-group-label-container"><div class="tab-group-folder-icon">${nativeSvg}</div>
    <label class="tab-group-label">Source folder</label></div></zen-folder>`).join('')}</div>`);
  await page.evaluate(async ({source,direction,state,percent,slot,glyph}) => {
    document.documentElement.dir=direction;
    document.documentElement.setAttribute('zen-sidebar-expanded','true');
    for(const kind of ['outlined','bare']) {
      const item=document.createElement('menuitem');
      item.id=`menu-${kind}`;item.classList.add('context-zen-move-to-folder-item');
      const img=document.createElement('img');
      if(slot==='direct'){img.className='menu-icon';item.appendChild(img);}
      else {const hbox=document.createElement('hbox');hbox.classList.add('menu-iconic-left');
        img.className='menu-iconic-icon';hbox.appendChild(img);item.appendChild(hbox);}
      for(const name of ['menu-text','menu-highlightable-text','menu-accel']){
        const label=document.createElement('label');label.classList.add(name);
        if(name==='menu-text')label.textContent='Destination';item.appendChild(label);
      }
      document.getElementById('menu').appendChild(item);
      const svg=document.getElementById(kind).querySelector('svg');svg.setAttribute('state',state);
      svg.querySelector('image').setAttribute('href',glyph);
    }
    const loaded=new Image();loaded.src=glyph;await loaded.decode();
    await new Promise(requestAnimationFrame);
    await Promise.all(document.getAnimations().map(a=>a.finished));
    const url=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
    const api=await import(url);URL.revokeObjectURL(url);
    window.adapter=api.createBrowserMoveToFolderMenuAdapters(window,{get:()=>percent});
    window.decorate=()=>{for(const kind of ['outlined','bare'])adapter.decorateItem(
      document.getElementById(`menu-${kind}`),document.getElementById(kind),null);};
  },{source,direction,state,percent,slot,glyph:dataSvg(inputs[glyph])});
  return page;
}

async function paint(page) {
  const clips = await page.evaluate(() => ['outlined','bare'].map(kind => {
    const row=document.getElementById(`menu-${kind}`),r=row.getBoundingClientRect();
    const style=getComputedStyle(row),pad=parseFloat(style.paddingLeft),size=parseFloat(style.fontSize)*2;
    const x=document.documentElement.dir==='rtl'?r.right-pad-size/2:r.left+pad+size/2;
    return {kind,clip:{x:x-20,y:r.y+r.height/2-20,width:40,height:40}};
  }));
  const result=[];
  // Hide only menu text while sampling the ink; keep its layout dimensions.
  await page.addStyleTag({content:'#menu .menu-text{visibility:hidden}'});
  for(const {kind,clip} of clips){const p=bounds(await page.screenshot({clip}));
    result.push({kind,dx:p.x/4-20,dy:p.y/4-20,width:p.width/4,height:p.height/4});}
  return result;
}

test('provided screenshot: Test ink is above/left of an outlined destination', {skip:symptomSkip}, async t => {
  const bytes=await readFile(symptomImage);
  // Ignore the grey panel/white background; avoid the row-2 mouse pointer.
  const blue=(r,g,b)=>b-r>12&&g-r>8;
  const bare=bounds(bytes,blue,[25,15,76,65]);
  const outlined=bounds(bytes,blue,[25,165,76,215]);
  const relative={dx:bare.x-outlined.x,dy:(bare.y-46)-(outlined.y-190)};
  t.diagnostic(JSON.stringify({screenshot:sha(bytes),bare,outlined,relative,
    units:'original screenshot pixels; manual row centres 46 and 190; no CSS/DPR inference'}));
  assert.ok(relative.dx < -7 && relative.dy < -7,'recorded native symptom must remain adverse evidence');
});

test('actual eclipse SVG paint is centred in its own viewport', {skip}, async t => {
  const page=await browser.newPage({viewport:{width:96,height:96},deviceScaleFactor:4});
  try {
    await page.setContent(`<style>body{margin:0;background:white}img{display:block;width:96px;height:96px}</style><img>`);
    await page.locator('img').evaluate(async (el,src)=>{el.src=src;await el.decode();},dataSvg(inputs.eclipse));
    const p=bounds(await page.screenshot());t.diagnostic(JSON.stringify(p));
    assert.ok(Math.abs(p.x/4-48)<=.25&&Math.abs(p.y/4-48)<=.25);
  } finally {await page.close();}
});

for(const slot of ['direct','nested']) for(const direction of ['ltr','rtl'])
for(const state of ['closed','open']) for(const percent of ['100','120','135.5'])
test(`current native assets, modeled slot: ${slot}/${direction}/${state}/${percent}`,{skip},async t=>{
  const page=await fixture({slot,direction,state,percent});
  try {
    const before=await page.locator('#sidebar').screenshot();
    await page.evaluate(()=>decorate());
    const p=await paint(page);
    t.diagnostic(JSON.stringify(p));
    for(const v of p)assert.ok(Math.abs(v.dx)<=.25&&Math.abs(v.dy)<=.25,JSON.stringify(v));
    const geometry=await page.evaluate(()=>['outlined','bare'].map(kind=>{
      const svg=document.getElementById(kind).querySelector('svg'),menu=document.getElementById(`menu-${kind}`).querySelector('svg');
      const s=getComputedStyle(svg);return {sourceWidth:svg.getBoundingClientRect().width,
        sourceMargin:s.marginLeft,viewBox:svg.getAttribute('viewBox'),menuWidth:menu.getBoundingClientRect().width};}));
    assert.deepEqual(geometry.map(g=>g.sourceWidth),[state==='open'?28:24,28],'account for state-aware sidebar-only viewport change');
    assert.deepEqual(geometry.map(g=>g.menuWidth),[26,26],'both menu SVGs retain the same 2em viewport');
    assert.ok((await page.locator('#sidebar').screenshot()).equals(before),'source pixels untouched');
  } finally {await page.close();}
});

// Break caught: redundant remeasurement displaces already-centred bare artwork
// if the measurement crosses viewport/user-space units. Use the REAL temporary
// SVG CTM, not a guessed pixel nudge. The injected error is a sensitivity test;
// it must never be described as observed Gecko behavior.
for(const font of (process.env.BZF_ROUND10_FAULTS==='1'?[13,16]:[])) test(`bare centre survives viewport-coordinate measurement fault (${font}px menu)`,{skip},async t=>{
  const page=await fixture({font});
  try {
    await page.evaluate(()=>{
      const original=SVGGraphicsElement.prototype.getBBox;
      SVGGraphicsElement.prototype.getBBox=function(...args){
        const b=original.apply(this,args);
        if(this.parentElement?.localName==='svg'&&this.querySelector('.icon')&&
          this.querySelector('.front')?.style.getPropertyValue('opacity')==='0'){
          // Feed viewport units across a user-space API boundary, derived from
          // this actual 28px/27-unit measuring viewport. No engine claim.
          const m=this.getCTM();return new DOMRect(b.x*m.a,b.y*m.d,b.width*m.a,b.height*m.d);
        }
        return b;
      };
      decorate();
    });
    const p=await paint(page);t.diagnostic(JSON.stringify({simulation:true,paint:p}));
    const bare=p.find(p=>p.kind==='bare');
    assert.ok(Math.abs(bare.dx)<=.25&&Math.abs(bare.dy)<=.25,
      `already centred bare viewport must not acquire a measurement offset: ${JSON.stringify(bare)}`);
  } finally {await page.close();}
});

test('round10 provenance and source identity',async t=>{
  t.diagnostic(JSON.stringify({proposal:process.env.BZF_ROUND10_PROPOSAL==='1',
    hashes:Object.fromEntries(Object.entries(inputs).map(([k,v])=>[k,sha(v)])),testedProduct:sha(source)}));
  for(const [k,p] of Object.entries(paths))assert.equal(sha(await readFile(p)),sha(inputs[k]),`${k} changed during this run; rerun with fresh inputs`);
});
