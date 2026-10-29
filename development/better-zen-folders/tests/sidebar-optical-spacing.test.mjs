import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';

// HTML/SVG surrogate in standalone headless Chromium, NOT live Gecko/XUL proof.
// No persistent context, Zen/profile access, network or evidence files. Screenshots
// stay in memory. The tab is a controlled 16px reference, not a native-tab replica.
const modulePath = process.env.BZF_PLAYWRIGHT_MODULE;
const skip = modulePath ? false : 'set BZF_PLAYWRIGHT_MODULE for standalone Chromium';
const paths = {
  current: new URL('../chrome.css', import.meta.url),
  baseline: new URL('../artifacts/releases/20260922T055656Z-v0.3.11-round2-6b597aa8/package/chrome.css', import.meta.url),
  native: new URL('../artifacts/native-20260915/zen-folders.css', import.meta.url),
  folder: new URL('../artifacts/native-20260915/ZenFolder.mjs', import.meta.url),
  icons: new URL('../fixtures/zen-icons/sine/zen-icons/chrome.css', import.meta.url),
};
const inputs = Object.fromEntries(await Promise.all(Object.entries(paths).map(async ([key,path]) => [key,await readFile(path,'utf8')])));
const sha = value => createHash('sha256').update(value).digest('hex');
const nativeSvg = inputs.folder.slice(inputs.folder.indexOf('<svg width="28"'),inputs.folder.indexOf('</svg>')+6);
const glyph = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16" fill="black"/></svg>');
const dpr = 4;
const near = (actual,expected,tolerance,message) => assert.ok(Math.abs(actual-expected)<=tolerance,`${message}: ${actual} vs ${expected} (±${tolerance})`);
let browser, PNG;
before(async () => {
  if (skip) return;
  const require = createRequire(import.meta.url);
  ({PNG} = require(require.resolve('pngjs',{paths:[modulePath]})));
  browser = await require(modulePath).chromium.launch({headless:true});
});
after(async () => { await browser?.close(); });

const row = (id,attrs='',svg=nativeSvg) => `<zen-folder id="${id}" ${attrs}><div class="tab-group-label-container"><div class="tab-group-folder-icon">${svg}</div><label class="tab-group-label"><span>Folder</span></label></div></zen-folder>`;
async function fixture({direction='ltr',state='closed',companion=true,expanded=true,rows}={}) {
  const page = await browser.newPage({viewport:{width:640,height:800},deviceScaleFactor:dpr});
  await page.route('**/*',route => route.abort());
  await page.setContent(`<style>
    :root{--tab-min-height:36px;--tab-margin-block:2px;--tab-group-label-padding:8px;
      --toolbar-color:#151515;--zen-primary-color:#00b4d8;--zen-colors-primary:#eee;color-scheme:light}
    body{margin:20px;font:14px sans-serif;background:white;color:#151515}
    zen-folder{width:300px}.tab-group-label-container{display:flex;position:relative}
    svg{display:block}.tab-group-label{display:block;box-sizing:border-box}
    ${inputs.native}\n${companion?inputs.icons:''}
  </style>${rows??row('outlined')+row('bare','zen-icons-has-inner-icon zen-icons-hide-folder-shape zen-icons-enlarge-inner-icon')+row('fallback','zen-icons-hide-folder-shape zen-icons-enlarge-inner-icon zen-icons-custom-unavailable')}
  <div id="reference" style="position:relative;height:40px"><img id="favicon" style="position:absolute;width:16px;height:16px" src="${glyph}"><span id="reference-title" style="position:absolute">Tab</span></div>`);
  await page.evaluate(async ({direction,state,expanded,glyph}) => {
    document.documentElement.dir=direction;
    if(expanded)document.documentElement.setAttribute('zen-sidebar-expanded','true');
    for(const svg of document.querySelectorAll('zen-folder svg')) {
      svg.setAttribute('state',state);
      for(const image of svg.querySelectorAll('image'))image.setAttribute('href',glyph);
    }
    // Unavailable means no loaded custom image; native folder/dots must survive.
    document.querySelector('#fallback image')?.removeAttribute('href');
    const loaded=new Image();loaded.src=glyph;await loaded.decode();
    await document.getElementById('favicon').decode();
  },{direction,state,expanded,glyph});
  await settle(page);
  return page;
}
async function settle(page) {
  await page.evaluate(async () => {
    await new Promise(requestAnimationFrame);
    await Promise.all(document.getAnimations().map(a=>a.finished));
    await new Promise(requestAnimationFrame);
  });
}
async function applyCss(page,css) {
  await page.evaluate(css => {
    let style=document.getElementById('candidate-css');
    if(!style){style=document.createElement('style');style.id='candidate-css';document.head.appendChild(style);}
    style.textContent=css;
  },css);
  await settle(page);
}
async function measure(page) {
  return page.evaluate(() => Object.fromEntries([...document.querySelectorAll('zen-folder')].map(folder => {
    const svg=folder.querySelector('svg'),slot=folder.querySelector('.tab-group-folder-icon');
    const rect=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};};
    const style=getComputedStyle(svg),matrix=new DOMMatrix(style.transform),s=rect(slot),v=rect(svg);
    const span=folder.querySelector('label span'),range=document.createRange();range.selectNodeContents(span);
    const text=range.getBoundingClientRect();
    return [folder.id,{slot:s,viewport:v,row:rect(folder.querySelector('.tab-group-label-container')),
      title:rect(folder.querySelector('label')),textLeft:text.left,textRight:text.right,
      dx:v.x+v.width/2-(s.x+s.width/2),dy:v.y+v.height/2-(s.y+s.height/2),
      tx:matrix.e,ty:matrix.f,transform:style.transform,
      margins:[style.marginTop,style.marginRight,style.marginBottom,style.marginLeft],
      imageTransform:svg.querySelector('image')?getComputedStyle(svg.querySelector('image')).transform:null,
      shapes:[...svg.querySelectorAll('.front,.back')].map(el=>getComputedStyle(el).opacity)}];
  })));
}
function assertCentered(value) {
  near(value.slot.width,28,.01,'native slot width');near(value.slot.height,28,.01,'native slot height');
  near(value.viewport.width,24,.01,'outlined viewport width');near(value.viewport.height,24,.01,'outlined viewport height');
  assert.deepEqual(value.margins,['2px','2px','2px','2px']);
  // Center the layout viewport; explicitly account for the inherited native
  // optical translation instead of falsely reporting its screen box as centred.
  near(value.dx-value.tx,0,.02,'viewport horizontal layout centre');
  near(value.dy-value.ty,0,.02,'viewport vertical layout centre');
}
function assertOpenNative(before,after) {
  near(after.viewport.width,28,.01,'open native viewport width');
  near(after.viewport.height,28,.01,'open native viewport height');
  assert.deepEqual(after.margins,['0px','0px','0px','0px'],'open art receives no added margins');
  assert.deepEqual(after,before,'open native geometry and transforms exactly match frozen release');
}
function assertStable(before,after) {
  for(const id of Object.keys(before))for(const key of ['slot','row','title','textLeft','textRight','transform','imageTransform'])
    assert.deepEqual(after[id][key],before[id][key],`${id}: ${key} remains unchanged`);
}
function paintBounds(bytes,slot) {
  const png=PNG.sync.read(bytes);
  // Crop the SLOT, never the smaller viewport, so overflow remains observable.
  const x0=Math.round(slot.x*dpr),y0=Math.round(slot.y*dpr);
  const x1=Math.round((slot.x+slot.width)*dpr),y1=Math.round((slot.y+slot.height)*dpr);
  let left=x1,top=y1,right=-1,bottom=-1;
  for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){
    const i=(y*png.width+x)*4;
    if(Math.min(...png.data.subarray(i,i+3))>=230)continue;
    left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);
  }
  assert.ok(right>=left&&bottom>=top,'fixture artwork must actually paint');
  assert.ok(left>x0&&right<x1-1&&top>y0&&bottom<y1-1,'paint must not touch the sampling boundary');
  return {left:left/dpr,right:(right+1)/dpr,top:top/dpr,bottom:(bottom+1)/dpr,width:(right-left+1)/dpr,height:(bottom-top+1)/dpr};
}
async function paint(page,geometry) {
  const bytes=await page.screenshot();
  return Object.fromEntries(Object.entries(geometry).map(([id,g])=>[id,paintBounds(bytes,g.slot)]));
}
function assertOpticalGap(previous,current,textLeft,referenceRight) {
  const oldGap=textLeft-previous.right,gap=textLeft-current.right,referenceGap=textLeft-referenceRight;
  assert.ok(gap>0,'no painted overlap with title');
  assert.ok(Math.abs(gap-referenceGap)<=Math.abs(oldGap-referenceGap)+.25,'gap mismatch must not worsen');
  // Perspective art is asymmetric: bound its difference, do not demand equality.
  near(gap,referenceGap,2,'bounded optical gap against favicon');
  return {oldGap,gap,referenceGap};
}

for(const direction of ['ltr','rtl'])for(const state of ['closed','open'])for(const companion of [false,true])
test(`outlined viewport centred before native translation: ${direction}/${state}/icons=${companion}`,{skip},async t=>{
  const page=await fixture({direction,state,companion,rows:row('outlined')});
  try{
    await applyCss(page,inputs.baseline);const before=await measure(page);
    await applyCss(page,inputs.current);const after=await measure(page);
    if(state==='open')assertOpenNative(before.outlined,after.outlined);
    else assertCentered(after.outlined);
    assertStable(before,after);
    near(after.outlined.tx,-1,.01,'native horizontal correction retained');
    near(after.outlined.ty,companion?0:-1,.01,'native vertical correction retained');
    t.diagnostic(JSON.stringify({direction,state,companion,screenCentreOffset:[after.outlined.dx,after.outlined.dy],layoutCentreOffset:[after.outlined.dx-after.outlined.tx,after.outlined.dy-after.outlined.ty]}));
  }finally{await page.close();}
});

// Gap comparison is LTR: the captured native CSS uses physical left:5px and
// padding-left:32px. Inventing RTL mirroring here would conceal that limitation.
// Reference favicon is centred on the SAME slot and shares the title text edge.
// This bounds the CSS change, not all themes, favicon artwork, or native tab UI.
for(const state of ['closed','open'])test(`painted folder size and optical title gap vs frozen release: ${state}`,{skip},async t=>{
  const page=await fixture({state});
  try{
    await applyCss(page,inputs.baseline);const before=await measure(page);
    await page.evaluate(({slot,textLeft})=>{
      const row=document.getElementById('reference').getBoundingClientRect();
      Object.assign(document.getElementById('favicon').style,{left:`${slot.x+6-row.x}px`,top:'12px'});
      Object.assign(document.getElementById('reference-title').style,{left:`${textLeft-row.x}px`,top:'12px'});
    },before.outlined);
    const oldPaint=await paint(page,before);
    await applyCss(page,inputs.current);const after=await measure(page),newPaint=await paint(page,after);
    const faviconSlot=await page.locator('#favicon').evaluate(el=>{const r=el.getBoundingClientRect();return {x:r.x-2,y:r.y-2,width:r.width+4,height:r.height+4};});
    const favicon=paintBounds(await page.screenshot(),faviconSlot);
    near(favicon.width,16,.01,'reference favicon paints 16px wide');near(favicon.height,16,.01,'reference favicon paints 16px high');
    assertStable(before,after);
    for(const id of ['outlined','fallback']){
      const previous=oldPaint[id],current=newPaint[id];
      let gaps;
      if(state==='open'){
        assertOpenNative(before[id],after[id]);
        assert.deepEqual(current,previous,`${id}: preserve every measured open painted bound`);
        near(current.height,16,.5,`${id}: native open painted height already near favicon`);
        assert.ok(current.width>current.height,`${id}: preserve native open aspect asymmetry`);
        const oldGap=before[id].textLeft-previous.right,gap=after[id].textLeft-current.right;
        assert.equal(gap,oldGap,`${id}: open horizontal gap exactly preserved`);
        gaps={oldGap,gap,referenceGap:after[id].textLeft-favicon.right};
      }else{
        assertCentered(after[id]);
        // Raster edges allow one device pixel per edge (0.5 CSS px overall).
        near(current.width,previous.width*6/7,.5,`${id}: painted width reduces with viewport`);
        near(current.height,previous.height*6/7,.5,`${id}: painted height reduces with viewport`);
        const extent=Math.max(current.width,current.height),oldExtent=Math.max(previous.width,previous.height);
        assert.ok(Math.abs(extent-16)<Math.abs(oldExtent-16),`${id}: largest painted extent moves toward 16px favicon`);
        near(extent,16,1,`${id}: closed folder near favicon size`);
        gaps=assertOpticalGap(previous,current,after[id].textLeft,favicon.right);
      }
      t.diagnostic(JSON.stringify({state,id,before:previous,after:current,favicon:{width:favicon.width,height:favicon.height},...gaps}));
    }
    assert.deepEqual(newPaint.bare,oldPaint.bare,'outline-free painted glyph, including position and size, unchanged');
    assert.equal(after.bare.viewport.width,28,'bare viewport remains 28px');
    assert.ok(after.fallback.shapes.every(opacity=>opacity==='1'),'unavailable custom icon restores painted folder shapes');
    assert.equal(after.fallback.imageTransform,after.outlined.imageTransform,'unavailable fallback does not acquire bare-image centring');
  }finally{await page.close();}
});

// Compare vertical INK gaps in two adjacent-row pairs: Tab X -> Tab Y and
// Tab X -> Folder A. Reference rows use the existing native 40px pitch; neither
// native folder geometry nor its asymmetric/open artwork is repositioned.
for(const state of ['closed','open'])for(const companion of [false,true])
test(`vertical painted gap ${state==='open'?'preserved':'mismatch reduces'} at unchanged row pitch: ${state}/icons=${companion}`,{skip},async t=>{
  const tab=id=>`<div id="${id}" class="vertical-tab" style="position:relative;width:300px;height:calc(var(--tab-min-height) + 2 * var(--tab-margin-block))"><img src="${glyph}" style="position:absolute;width:16px;height:16px;top:50%;transform:translateY(-50%)"></div>`;
  const page=await fixture({state,companion,rows:tab('tab-x')+tab('tab-y')+tab('tab-before-folder')+row('outlined')});
  try{
    await applyCss(page,inputs.baseline);
    const initial=await measure(page);
    await page.evaluate(async slot=>{
      for(const img of document.querySelectorAll('.vertical-tab img')){
        img.style.left=`${slot.x+6-img.parentElement.getBoundingClientRect().x}px`;
        await img.decode();
      }
    },initial.outlined.slot);
    const sample=async()=>{
      const geometry=await measure(page);
      const tabs=await page.evaluate(()=>Object.fromEntries([...document.querySelectorAll('.vertical-tab')].map(el=>{
        const row=el.getBoundingClientRect(),img=el.querySelector('img').getBoundingClientRect();
        return [el.id,{row:{x:row.x,y:row.y,width:row.width,height:row.height},
          slot:{x:img.x-2,y:img.y-2,width:img.width+4,height:img.height+4}}];
      })));
      const bytes=await page.screenshot();
      const ink=Object.fromEntries(Object.entries(tabs).map(([id,g])=>[id,paintBounds(bytes,g.slot)]));
      ink.folder=paintBounds(bytes,geometry.outlined.slot);
      const tabGap=ink['tab-y'].top-ink['tab-x'].bottom;
      const folderGap=ink.folder.top-ink['tab-before-folder'].bottom;
      for(const id of ['tab-x','tab-y','tab-before-folder'])near(ink[id].height,16,.01,`${id}: actual 16px favicon paint`);
      const pitch=tabs['tab-y'].row.y-tabs['tab-x'].row.y;
      near(pitch,40,.01,'reference row pitch');
      near(geometry.outlined.row.y-tabs['tab-before-folder'].row.y,pitch,.01,'folder pair uses same row pitch');
      near(geometry.outlined.row.height,pitch,.01,'native folder row height');
      near(tabGap,pitch-16,.01,'reference painted vertical gap');
      assert.ok(folderGap>0&&folderGap<pitch,'folder paint remains separated within adjacent rows');
      return {geometry,tabs,ink,pitch,tabGap,folderGap,difference:Math.abs(folderGap-tabGap)};
    };
    const before=await sample();
    await applyCss(page,inputs.current);const after=await sample();
    assertStable(before.geometry,after.geometry);
    assert.deepEqual(after.tabs,before.tabs,'reference row geometry and pitch unchanged');
    for(const id of ['tab-x','tab-y','tab-before-folder'])assert.deepEqual(after.ink[id],before.ink[id],'reference favicon paint unchanged');
    t.diagnostic(JSON.stringify({state,companion,pitch:after.pitch,tabToTabGap:after.tabGap,
      previousTabToFolderGap:before.folderGap,currentTabToFolderGap:after.folderGap,
      previousDifference:before.difference,currentDifference:after.difference,
      previousFolderPaint:before.ink.folder,currentFolderPaint:after.ink.folder}));
    if(state==='open'){
      assertOpenNative(before.geometry.outlined,after.geometry.outlined);
      assert.deepEqual(after.ink.folder,before.ink.folder,'open painted bounds remain exactly native');
      assert.equal(after.folderGap,before.folderGap,'open vertical painted gap unchanged');
      assert.equal(after.difference,before.difference,'open gap mismatch unchanged, never worsened');
    }else{
      // Require actual improvement for closed art, not exact favicon equality.
      assert.ok(after.difference<before.difference,
        `vertical gap mismatch must reduce: ${before.difference}px -> ${after.difference}px (${state}, icons=${companion})`);
    }
  }finally{await page.close();}
});

const negatives = [
  ['matching-viewBox-only','<svg width="28" height="28" viewBox="0 0 27 27"><circle cx="14" cy="14" r="8"/></svg>'],
  ['no-back-pair',nativeSvg.replace(/<path class="back"[\s\S]*?<\/path>/g,'')],
  ['no-front-pair',nativeSvg.replace(/<rect class="front"[\s\S]*?<\/rect>/g,'')],
  ['single-back',nativeSvg.replace(/<path class="back"[\s\S]*?<\/path>/,'')],
  ['single-front',nativeSvg.replace(/<rect class="front"[\s\S]*?<\/rect>/,'')],
  ['wrong-width',nativeSvg.replace('width="28"','width="30"')],
  ['wrong-height',nativeSvg.replace('height="28"','height="30"')],
  ['missing-width',nativeSvg.replace('width="28"','')],
  ['missing-height',nativeSvg.replace('height="28"','')],
  ['wrong-viewBox',nativeSvg.replace('viewBox="0 0 27 27"','viewBox="0 0 28 28"')],
];
for(const expanded of [true,false])test(`native reduction selector exclusions, expanded=${expanded}`,{skip},async()=>{
  const rows=negatives.flatMap(([id,svg])=>[
    row(id,'',svg),row(`${id}-unavailable`,'zen-icons-enlarge-inner-icon zen-icons-custom-unavailable',svg),
  ]).join('');
  const page=await fixture({expanded,rows:rows+row('native')});
  try{
    await applyCss(page,inputs.baseline);const before=await measure(page);
    await applyCss(page,inputs.current);const after=await measure(page);
    for(const [id] of negatives)for(const key of [id,`${id}-unavailable`])
      assert.deepEqual(after[key],before[key],`${key}: viewBox alone or partial native signature must not resize/move`);
    if(expanded)assertCentered(after.native);
    else assert.deepEqual(after.native,before.native,'collapsed sidebar stays outside the resize selector');
  }finally{await page.close();}
});

test('centering and size assertions reject in-memory spacing regressions', {skip},async()=>{
  const page=await fixture({rows:row('outlined')});
  try{
    await applyCss(page,inputs.current);assertCentered((await measure(page)).outlined);
    await applyCss(page,inputs.current+'\n#outlined svg{margin:0!important}');
    const missingMargin=(await measure(page)).outlined;
    assert.throws(()=>assertCentered(missingMargin),{name:'AssertionError'});
    await applyCss(page,inputs.baseline);
    const unreduced=(await measure(page)).outlined;
    assert.throws(()=>assertCentered(unreduced),/outlined viewport width/);
  }finally{await page.close();}
});

test('painted-gap assertion rejects a shifted silhouette with unchanged title', {skip},async()=>{
  const page=await fixture({rows:row('outlined')});
  try{
    await applyCss(page,inputs.baseline);const before=await measure(page),oldPaint=await paint(page,before);
    const referenceRight=before.outlined.slot.x+14+8; // centred 16px reference
    await applyCss(page,inputs.current);const current=await measure(page),goodPaint=await paint(page,current);
    assertOpticalGap(oldPaint.outlined,goodPaint.outlined,current.outlined.textLeft,referenceRight);
    // Move ink four CSS px toward the title in memory only. This tests the
    // pixel/gap assertion independently of the DOM viewport-size assertion.
    await applyCss(page,inputs.current+'\n#outlined svg{transform:translate(3px,0)!important}');
    const shifted=await measure(page),badPaint=await paint(page,shifted);
    assert.equal(shifted.outlined.textLeft,current.outlined.textLeft);
    assert.equal(shifted.outlined.viewport.width,24);
    assert.throws(()=>assertOpticalGap(oldPaint.outlined,badPaint.outlined,shifted.outlined.textLeft,referenceRight),/gap mismatch must not worsen/);
  }finally{await page.close();}
});

test('optical fixture source identity',async t=>{
  assert.equal(sha(inputs.baseline),'85572605102c68c577dfa46eaf1a40486a68d967adf2a60e72752733e5c033f0','immutable round2 CSS identity');
  t.diagnostic(JSON.stringify({proof:'standalone Chromium fixture only',hashes:Object.fromEntries(Object.entries(inputs).map(([key,value])=>[key,sha(value)]))}));
  for(const [key,path] of Object.entries(paths))assert.equal(sha(await readFile(path)),sha(inputs[key]),`${key} changed during run; rerun with fresh inputs`);
});
