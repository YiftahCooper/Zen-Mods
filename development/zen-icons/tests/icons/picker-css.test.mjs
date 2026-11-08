import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const modulePath=process.env.ZEN_ICONS_PLAYWRIGHT_MODULE;
const options={skip:modulePath?false:'set ZEN_ICONS_PLAYWRIGHT_MODULE for isolated headless layout checks'};
const css=await readFile(process.env.ZEN_ICONS_CSS_FIXTURE || new URL('../../sine/zen-icons/chrome.css',import.meta.url),'utf8');
async function page(run){
  const {chromium}=createRequire(import.meta.url)(modulePath);
  const browser=await chromium.launch({headless:true});
  try{const p=await browser.newPage();await p.route('**/*',r=>r.abort());await run(p);}
  finally{await browser.close();}
}
test('Default heading padding stays inside a narrow picker instead of clipping the right edge',options,()=>page(async p=>{
  await p.setContent('<div id="zen-icons-sine-root" style="width:200px"><section class="zen-icons-default-section"><div class="zen-icons-default-heading">Default</div></section></div>');
  await p.addStyleTag({content:css});
  const sizes=await p.locator('#zen-icons-sine-root').evaluate(root=>{
    const heading=root.querySelector('.zen-icons-default-heading'),r=root.getBoundingClientRect(),h=heading.getBoundingClientRect();
    return {overflow:root.scrollWidth>root.clientWidth,contained:h.right<=r.right};
  });
  assert.deepEqual(sizes,{overflow:false,contained:true});
}));
test('native squircle rule cannot turn the Space Default dot into a square',options,()=>page(async p=>{
  await p.setContent('<div id="zen-icons-sine-root"><span class="zen-icons-default-placeholder no-squircles" data-default-shape="circle"></span></div>');
  await p.addStyleTag({content:css+'\n*:not(.no-squircles){corner-shape:superellipse(0)}'});
  const style=await p.locator('span').evaluate(n=>{const s=getComputedStyle(n);return {width:s.width,height:s.height,corner:s.cornerShape,radius:s.borderRadius};});
  assert.deepEqual(style,{width:'8px',height:'8px',corner:'round',radius:'50%'});
}));
test('folder Default SVG fits its hover target at narrow widths',options,()=>page(async p=>{
  await p.setContent('<div id="zen-icons-sine-root" style="width:250px;--zen-icons-grid-size:30px"><div class="zen-icons-default-container"><button class="zen-icons-result zen-icons-default-choice"><svg xmlns="http://www.w3.org/2000/svg" class="zen-icons-default-folder-preview" width="28" height="28" viewBox="0 0 27 27"><rect x="4" y="5" width="19" height="18"/></svg></button></div></div>');
  await p.addStyleTag({content:css});
  const sizes=await p.locator('button').evaluate(n=>{const b=n.getBoundingClientRect(),s=n.firstElementChild.getBoundingClientRect();return {right:s.right<=b.right-4,bottom:s.bottom<=b.bottom-4,centerX:Math.abs((s.x+s.width/2)-(b.x+b.width/2)),centerY:Math.abs((s.y+s.height/2)-(b.y+b.height/2))};});
  assert.ok(sizes.right&&sizes.bottom,JSON.stringify(sizes));assert.ok(sizes.centerX<1&&sizes.centerY<1,JSON.stringify(sizes));
}));

test('selected and preview tab squares match native no-website paint and full icon dimensions',options,()=>page(async p=>{
  // Installed Zen 1.23.2b vertical-tabs.css uses the native blank asset and
  // toolbar-element background. Old accent/opacity approximations must fail.
  const nativeCSS=`.tab-icon-image,.native-reference{width:16px;height:16px}
    .native-reference{display:block;border-radius:4px;opacity:1;
    background:var(--zen-toolbar-element-bg)}`;
  await p.setContent(`<span class="native-reference"></span>
    <img class="tab-icon-image" src="chrome://sine/content/zen-icons-local/blank-tab.svg">
    <div id="zen-icons-sine-root"><span class="zen-icons-native-tab-placeholder"></span></div>`);
  await p.addStyleTag({content:nativeCSS+'\n'+css});
  for(const scheme of ['light','dark']) for(const accent of ['#52a4b8','#af63c9']) {
    await p.evaluate(({scheme,accent})=>{document.documentElement.style.colorScheme=scheme;document.documentElement.style.setProperty('--zen-primary-color',accent);document.documentElement.style.setProperty('--zen-toolbar-element-bg',scheme==='dark'?'rgba(240,240,240,.1)':'rgba(20,20,20,.08)');},{scheme,accent});
    const styles=await p.evaluate(()=>[...document.querySelectorAll('.native-reference,.tab-icon-image,.zen-icons-native-tab-placeholder')].map(n=>{
      const s=getComputedStyle(n);return {width:s.width,height:s.height,radius:s.borderRadius,opacity:s.opacity,background:s.backgroundColor};
    }));
    assert.deepEqual(styles[1],styles[0],`selected/previously saved square: ${scheme} ${accent}`);
    assert.deepEqual(styles[2],styles[0],`picker preview: ${scheme} ${accent}`);
  }
  const content=await p.locator('.tab-icon-image').evaluate(n=>getComputedStyle(n).content);
  assert.match(content,/chrome:\/\/browser\/skin\/zen-icons\/blank\.svg/,'use the literal native blank asset');
}));

test('prominent Reset and icon-only default tile fit a narrow picker without stretching the square',options,()=>page(async p=>{
  await p.setContent(`<div id="zen-icons-sine-root" style="width:200px;font:13px sans-serif;--zen-icons-grid-size:30px">
    <button class="zen-icons-reset-tab-icon"><span class="zen-icons-reset-symbol"></span><span class="zen-icons-reset-label">Reset Icon</span></button>
    <div class="zen-icons-default-container"><button class="zen-icons-result zen-icons-default-choice" data-default-kind="tab"><span class="zen-icons-native-tab-placeholder"></span></button></div></div>`);
  await p.addStyleTag({content:css});
  const sizes=await p.evaluate(()=>{
    const root=document.querySelector('#zen-icons-sine-root');
    const reset=root.querySelector('.zen-icons-reset-tab-icon'),s=getComputedStyle(reset),icon=getComputedStyle(root.querySelector('.zen-icons-reset-symbol'));
    const button=root.querySelector('.zen-icons-default-choice'),b=button.getBoundingClientRect(),square=root.querySelector('.zen-icons-native-tab-placeholder').getBoundingClientRect();
    return {font:s.fontSize,weight:s.fontWeight,iconWidth:icon.width,iconHeight:icon.height,overflow:root.scrollWidth>root.clientWidth,buttonWidth:b.width,buttonHeight:b.height,squareWidth:square.width,squareHeight:square.height,inside:square.left>=b.left&&square.right<=b.right,centerX:Math.abs(square.x+square.width/2-b.x-b.width/2),centerY:Math.abs(square.y+square.height/2-b.y-b.height/2)};
  });
  assert.equal(sizes.font,'16px');assert.equal(sizes.weight,'600');
  assert.equal(sizes.iconWidth,'18px');assert.equal(sizes.iconHeight,'18px');
  assert.equal(sizes.overflow,false);assert.ok(sizes.buttonHeight<64,JSON.stringify(sizes));
  assert.equal(sizes.squareWidth,16);assert.equal(sizes.squareHeight,16);assert.ok(sizes.inside);
  assert.ok(sizes.buttonWidth<40,JSON.stringify(sizes));
  assert.ok(sizes.centerX<1&&sizes.centerY<1,JSON.stringify(sizes));
}));

test('custom images fit the native space heading and switcher without intrinsic-size overflow',options,()=>page(async p=>{
  // Model the installed Zen heading wrapper and its unconstrained child image.
  // Removing our image constraint must expose the original oversized-image bug.
  const source='chrome://sine/content/zen-icons-local/custom/Test/Travel/bands.jpg';
  for(const [width,height] of [[360,120],[120,360],[512,512]]) {
    await p.setContent(`<span class="zen-current-workspace-indicator-icon" style="display:inline-flex;width:16px;height:16px"><img src="${source}" width="${width}" height="${height}"></span>
      <toolbarbutton><img class="zen-workspace-icon" src="${source}" width="${width}" height="${height}"></toolbarbutton>`);
    await p.addStyleTag({content:'.zen-workspace-icon {width:14px}\n'+css});
    const images=await p.locator('img').evaluateAll(nodes=>nodes.map(n=>{
      const r=n.getBoundingClientRect(),s=getComputedStyle(n);
      return {width:r.width,height:r.height,fit:s.objectFit};
    }));
    assert.deepEqual(images,[{width:16,height:16,fit:'contain'},{width:14,height:14,fit:'contain'}]);
  }
}));

test('custom tab images preserve proportions without changing native tab or Glance dimensions',options,()=>page(async p=>{
  await p.setContent(`<img class="tab-icon-image" src="chrome://sine/content/zen-icons-local/custom/Test/portrait.jpeg">
    <div class="glance"><img class="tab-icon-image" src="chrome://sine/content/zen-icons-local/custom/Test/landscape.jpg"></div>
    <img class="tab-icon-image" src="https://example.invalid/favicon.png">`);
  await p.addStyleTag({content:'.tab-icon-image{width:16px;height:16px}.glance .tab-icon-image{width:14px;height:14px}\n'+css});
  const images=await p.locator('img').evaluateAll(nodes=>nodes.map(n=>{
    const s=getComputedStyle(n);return {width:s.width,height:s.height,fit:s.objectFit};
  }));
  assert.deepEqual(images,[
    {width:'16px',height:'16px',fit:'contain'},
    {width:'14px',height:'14px',fit:'contain'},
    {width:'16px',height:'16px',fit:'fill'},
  ]);
}));
