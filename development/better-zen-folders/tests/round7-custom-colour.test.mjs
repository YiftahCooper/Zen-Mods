import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';

const modulePath = process.env.BZF_PLAYWRIGHT_MODULE;
const skip = modulePath ? false : 'Set BZF_PLAYWRIGHT_MODULE for isolated Chromium pixel tests';
const read = path => readFile(new URL(path, import.meta.url), 'utf8');
const [css, nativeCss, nativeModule, source] = await Promise.all([
  read('../chrome.css'), read('../artifacts/native-20260915/zen-folders.css'),
  read('../artifacts/native-20260915/ZenFolder.mjs'), read('../scripts/better-zen-folders.uc.mjs'),
]);
// Extract the complete receipt, including both back paths, both front rects,
// gradients, strokes, image and dots. Do not substitute simplified geometry.
const markup = nativeModule.match(/static rawIcon = [\s\S]*?`\s*(<svg[\s\S]*?<\/svg>)`/)[1];
const swatches = [
  ['Red', '#ef4444', [239,68,68]], ['Orange', '#f97316', [249,115,22]],
  ['Yellow', '#eab308', [234,179,8]], ['Green', '#22c55e', [34,197,94]],
  ['Cyan', '#06b6d4', [6,182,212]], ['Blue', '#3b82f6', [59,130,246]],
  ['Purple', '#8b5cf6', [139,92,246]], ['Pink', '#ec4899', [236,72,153]],
];
// Keep the legacy saturated cases above; these are the current built-in presets.
// Assert the exported defaults too, so an accidental palette change cannot
// silently redefine the expected pixels.
const currentPresets = [
  ['Red', '#e76565', [231,101,101]], ['Orange', '#ef8f4b', [239,143,75]],
  ['Yellow', '#e3bd41', [227,189,65]], ['Green', '#51c67c', [81,198,124]],
  ['Cyan', '#3ebcd2', [62,188,210]], ['Blue', '#5f95eb', [95,149,235]],
  ['Purple', '#9b79ea', [155,121,234]], ['Pink', '#e46da9', [228,109,169]],
];
const svgSelector = '#parent > .tab-group-label-container > .tab-group-folder-icon > svg';
const childSelector = '#child > .tab-group-label-container > .tab-group-folder-icon > svg';

async function withFixture(theme, run) {
  const require = createRequire(import.meta.url);
  const {chromium} = require(modulePath);
  const {PNG} = require(require.resolve('pngjs', {paths:[modulePath]}));
  // Only this explicitly authorized disposable-profile module is read. No
  // profile startup, writes, live browser, icon store, or network access.
  const companion = await read('../fixtures/zen-icons/folder-presentation.mjs');
  const browser = await chromium.launch({headless:true});
  try {
    const page = await browser.newPage({viewport:{width:640,height:480}, deviceScaleFactor:1, colorScheme:theme});
    await page.route('**/*', route => route.abort());
    const folder = (id, child = '') => `<zen-folder id="${id}"><div class="tab-group-label-container"><div class="tab-group-folder-icon">${markup}</div></div><div class="tab-group-container">${child}</div></zen-folder>`;
    await page.setContent(`<html zen-sidebar-expanded="true"><head>
      <style>${nativeCss}</style><style id="bzf-css">${css}</style>
      <style>
        :root {color-scheme:${theme};--zen-primary-color:#557799;--zen-colors-primary:#557799}
        body {margin:20px;background:${theme === 'light' ? '#ffffff' : '#202020'}}
        #menu {position:absolute;left:300px;top:20px}
        #parent, #child {margin:0!important;width:130px}
        .tab-group-label-container {position:relative;height:112px!important}
        .tab-group-folder-icon {position:relative!important;left:0!important;width:108px!important;height:108px!important}
        svg {display:block;width:108px!important;height:108px!important}
        #menu svg {width:108px!important;height:108px!important}
        .menu-icon {display:none}
      </style></head><body>
      <div id="menu"><div class="context-zen-move-to-folder-item"><img class="menu-icon"></div></div>
      ${folder('parent', folder('child'))}</body></html>`);
    await page.evaluate(async ({source, companion}) => {
      const load = async text => {
        const url = URL.createObjectURL(new Blob([text], {type:'text/javascript'}));
        try {return await import(url);} finally {URL.revokeObjectURL(url);}
      };
      const api = await load(source), presentation = await load(companion);
      const projection = api.createBrowserFolderColorAdapters(window);
      window.folder = document.getElementById('parent');
      window.item = document.querySelector('.context-zen-move-to-folder-item');
      window.menuAdapter = api.createBrowserMoveToFolderMenuAdapters(window);
      window.paint = (color, showFolderShape = true, iconSource = '') => {
        if (color) projection.projectColor(folder, color);
        else projection.clearProjectedColor(folder);
        return presentation.applyFolderIconPresentation({folder, showFolderShape, source:iconSource, unavailable:false});
      };
      window.setupColourPicker = () => {
        // Chromium has no XUL panel/window implementation. Supply element
        // creation only; the real adapter builds and colours the HTML controls.
        // No openPopup shim: this fixture does not claim native shadow coverage.
        document.createXULElement = name => document.createElement(name);
        const adapter = api.createBrowserFolderColorMenuAdapters(window);
        window.showColourPicker = color => adapter.openPicker(folder, color, {
          apply: color => paint(color), reset: () => paint(null),
        });
        showColourPicker(null);
        const panel = document.getElementById('better-zen-folders-colour-panel');
        Object.assign(panel.style, {position:'absolute', left:'280px', top:'160px'});
        return api.folderColorSwatches();
      };
    }, {source, companion});
    const capture = async (selector = svgSelector) => PNG.sync.read(await page.locator(selector).screenshot());
    await run(page, capture);
  } finally {await browser.close();}
}

function pixel(png, x, y) {
  const offset = (y * png.width + x) * 4;
  return [...png.data.subarray(offset, offset + 4)];
}
function assertFlat(png, rgb, label) {
  assert.equal(png.width, 108); assert.equal(png.height, 108);
  // Interior of the back tab plus three separated areas of the front. Several
  // rows per patch catch a residual gradient; avoid antialiased stroke edges.
  for (const [x,y] of [[35,29], [35,48], [54,67], [74,78]]) {
    for (let dx=0; dx<3; dx++) for (let dy=0; dy<3; dy++) {
      assert.deepEqual(pixel(png,x+dx,y+dy), [...rgb,255], `${label}: flat RGB at ${x+dx},${y+dy}`);
    }
  }
  assert.deepEqual(pixel(png,22,60), [0,0,0,255], `${label}: black outline survives`);
}
function assertSame(actual, expected, message) {
  assert.equal(actual.width, expected.width); assert.equal(actual.height, expected.height);
  assert.ok(actual.data.equals(expected.data), message);
}
async function nativePaint(page, selector = svgSelector) {
  return page.locator(selector).evaluate(svg => ({
    filter:getComputedStyle(svg).filter,
    overlays:[...svg.querySelectorAll(':scope > path.back + path.back, :scope > rect.front + rect.front')]
      .map(node => ({fillOpacity:getComputedStyle(node).fillOpacity, stroke:getComputedStyle(node).stroke,
        strokeWidth:getComputedStyle(node).strokeWidth, display:getComputedStyle(node).display})),
  }));
}

for (const theme of ['light', 'dark']) {
  // Break caught: current palette, selected swatch, preview chip or either
  // native folder surface diverges. Exercise actual preset click/application
  // and adapter colour binding; only native popup placement is outside scope.
  test(`${theme}: current eight presets match front, back, selected swatch and preview chip exactly`, {skip}, async t => {
    await withFixture(theme, async (page, capture) => {
      const defaults = await page.evaluate(() => setupColourPicker());
      assert.deepEqual(defaults, currentPresets.map(([name, color]) => [name, color]));
      for (const [name, color, rgb] of currentPresets) {
        await t.test(name, async () => {
          const selector = `[data-better-zen-folders-colour-swatch="${color}"]`;
          await page.locator(selector).click();
          assert.equal(await page.locator('#parent').getAttribute('data-better-zen-folders-color'), color);
          assert.equal(await page.evaluate(color => showColourPicker(color), color), true);
          assert.equal(await page.locator(selector).getAttribute('aria-pressed'), 'true');
          const folderPng = await capture();
          assertFlat(folderPng, rgb, `${theme} current ${name}`);
          const swatchPng = await capture(selector);
          const previewPng = await capture('.better-zen-folders-colour-custom-preview');
          // Top-centre stays clear of the selected checkmark and rounded border.
          // The preview has no glyph; sample its centre. Compare both with the
          // independently asserted RGB and the actual back/front pixels.
          for (const [label, png, y] of [
            ['selected swatch', swatchPng, 3],
            ['preview chip', previewPng, Math.floor(previewPng.height / 2) - 1],
          ]) {
            const x = Math.floor(png.width / 2) - 1;
            for (let dx=0; dx<3; dx++) for (let dy=0; dy<2; dy++) {
              const actual = pixel(png, x+dx, y+dy);
              assert.deepEqual(actual, [...rgb,255], `${theme} ${name}: ${label} RGB`);
              assert.deepEqual(actual, pixel(folderPng,35,29), `${label} matches back`);
              assert.deepEqual(actual, pixel(folderPng,74,78), `${label} matches front`);
            }
          }
        });
      }
    });
  });

  // Break caught: native contrast or either gradient changes the selected RGB.
  test(`${theme}: all eight custom swatches render flat native art and retain black outlines`, {skip}, async t => {
    await withFixture(theme, async (page, capture) => {
      const original = await page.locator(svgSelector).evaluate(svg => svg.outerHTML);
      for (const [name, color, rgb] of swatches) {
        await t.test(name, async () => {
          await page.evaluate(color => paint(color), color);
          assertFlat(await capture(), rgb, `${theme} ${name}`);
          const result = await nativePaint(page);
          assert.equal(result.filter, 'none');
          assert.equal(result.overlays.length, 2);
          for (const shape of result.overlays) {
            assert.equal(shape.fillOpacity, '0');
            assert.equal(shape.stroke, 'rgb(0, 0, 0)');
            assert.equal(shape.strokeWidth, '1.5px');
            assert.notEqual(shape.display, 'none');
          }
          assert.equal(await page.locator(svgSelector).evaluate(svg => svg.outerHTML), original);
        });
      }
    });
  });

  // Break caught: global overrides flatten Default, or parent paint leaks into
  // a nested Default child. Compare rendered pixels against native CSS alone.
  test(`${theme}: Default and reset restore native filter/shading; nested Default stays independent`, {skip}, async () => {
    await withFixture(theme, async (page, capture) => {
      await page.evaluate(() => {document.getElementById('bzf-css').disabled = true;});
      const native = await capture(), nativeChild = await capture(childSelector);
      await page.evaluate(() => {document.getElementById('bzf-css').disabled = false;});
      assertSame(await capture(), native, 'Default matches native-only pixels');
      const before = await nativePaint(page);
      assert.equal(before.filter, 'contrast(1.25)');
      assert.deepEqual(before.overlays.map(s => s.fillOpacity), ['0.1','0.1']);
      await page.evaluate(() => paint('#06b6d4'));
      assertSame(await capture(childSelector), nativeChild, 'custom parent does not recolour/flatten Default child');
      assert.equal((await nativePaint(page, childSelector)).filter, 'contrast(1.25)');
      assertFlat(await capture(), [6,182,212], 'custom before Reset');
      await page.evaluate(() => paint(null));
      assertSame(await capture(), native, 'Reset restores all native pixels');
      assert.deepEqual(await nativePaint(page), before, 'Reset restores filter and gradient fills');
    });
  });

  // Break caught: clone paint loses the flattened state, steals gradient IDs,
  // or mutates the original when an earlier menu is inserted/hidden/removed.
  test(`${theme}: real menu clone retains flat paint without changing original`, {skip}, async () => {
    await withFixture(theme, async (page, capture) => {
      await page.evaluate(() => paint('#22c55e'));
      const before = await capture();
      const original = await page.locator(svgSelector).evaluate(svg => svg.outerHTML);
      await page.evaluate(() => {
        document.getElementById('menu').style.display = 'none';
        menuAdapter.decorateItem(item, folder, '#22c55e');
      });
      assertSame(await capture(), before, 'hidden clone preserves original pixels');
      await page.evaluate(() => {document.getElementById('menu').style.display = 'block';});
      assertFlat(await capture('#menu svg'), [34,197,94], 'menu clone');
      assertSame(await capture(), before, 'visible clone preserves original pixels');
      const clone = await capture('#menu svg');
      await page.evaluate(() => {folder.style.display = 'none';});
      assertSame(await capture('#menu svg'), clone, 'clone retains paint with source hidden');
      await page.evaluate(() => {folder.style.display = '';menuAdapter.clearItem(item);});
      assertSame(await capture(), before, 'clearing clone preserves original pixels');
      assert.equal(await page.locator(svgSelector).evaluate(svg => svg.outerHTML), original);
    });
  });
}

// Glyph context paint is a Gecko boundary: assert the real companion's colour
// contract, not a fake Chromium implementation of context-fill or icon storage.
test('companion retains outlined-black / outline-free-custom glyph policy and external image source', {skip}, async () => {
  await withFixture('light', async page => {
    const result = await page.evaluate(() => {
      const source = 'chrome://browser/skin/zen-icons/selectable/star.svg';
      const outlined = paint('#8b5cf6', true, source);
      const outlineFree = paint('#8b5cf6', false, source);
      const image = folder.querySelector('.icon image');
      const external = 'https://example.invalid/custom-folder.png';
      image.setAttribute('href', external);
      const original = image.outerHTML;
      const customImage = paint('#ec4899', true, external);
      return {outlined, outlineFree, customImage, imageUnchanged:image.outerHTML === original,
        recolor:folder.hasAttribute('zen-icons-recolor-inner-icon'),
        innerColor:folder.style.getPropertyValue('--zen-icons-inner-icon-color')};
    });
    assert.equal(result.outlined.innerIconColor, '#000000');
    assert.equal(result.outlined.enlargeInnerIcon, false);
    assert.equal(result.outlineFree.innerIconColor, '#8b5cf6');
    assert.equal(result.outlineFree.enlargeInnerIcon, true);
    assert.equal(result.customImage.innerIconColor, null);
    assert.equal(result.recolor, false); assert.equal(result.innerColor, '');
    assert.ok(result.imageUnchanged);
  });
});

// Break caught: broad svg or .front/.back rules affect non-native custom art.
test('custom image SVG without native shape pairs keeps its pixels and filter', {skip}, async () => {
  await withFixture('dark', async (page, capture) => {
    await page.locator(svgSelector).evaluate(svg => {
      svg.innerHTML = '<rect class="front" width="27" height="27" fill="#997744"/>';
    });
    const before = await capture();
    await page.evaluate(() => paint('#22c55e', false, 'https://example.invalid/custom.svg'));
    assertSame(await capture(), before, 'non-native custom art stays unchanged');
    assert.equal((await nativePaint(page)).filter, 'contrast(1.25)');
  });
});
