import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const modulePath = process.env.BZF_PLAYWRIGHT_MODULE;
test('folded corner keeps rounded paint inside the expanded gutter hit area', {
  skip: modulePath ? false : 'set BZF_PLAYWRIGHT_MODULE for isolated browser fixture',
}, async () => {
  const { chromium } = createRequire(import.meta.url)(modulePath);
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ deviceScaleFactor: 8, viewport: { width: 100, height: 100 } });
    const css = await readFile(new URL('../chrome.css', import.meta.url), 'utf8');
    await page.setContent(`<style>${css}
      html,body{margin:0;background:transparent}
      .row{position:absolute;left:20px;top:20px;width:70px;height:36px;color:rgb(6,182,212)}
    </style><div class="row"><button class="better-zen-folders-sticky-toggle" aria-pressed="true"><span class="better-zen-folders-sticky-ear"></span></button></div>`);
    await page.evaluate(() => document.documentElement.setAttribute('zen-sidebar-expanded', 'true'));
    const ear = page.locator('.better-zen-folders-sticky-ear');
    const bounds = await ear.boundingBox();
    assert.equal(bounds.width, 12);
    assert.equal(bounds.height, 12);
    const hitbox=await page.locator('button').boundingBox();
    assert.deepEqual(hitbox,{x:6,y:20,width:27,height:16});
    assert.equal(bounds.x,20,'paint begins at the row corner while the expanded gutter remains clickable');
    assert.ok(bounds.x>=hitbox.x&&bounds.x+bounds.width<=hitbox.x+hitbox.width);
    const paints = await ear.evaluate(node => ({
      surface: getComputedStyle(node).backgroundImage,
      overlay: getComputedStyle(node, '::after').backgroundImage,
    }));
    assert.equal(paints.surface, 'none', 'the fold is a flat colour, not a gradient');
    assert.equal(paints.overlay, 'none', 'the fold has no gradient seam overlay');
    const png = await ear.screenshot({ omitBackground: true });
    const alpha = await page.evaluate(async base64 => {
      const img = new Image(); img.src = `data:image/png;base64,${base64}`; await img.decode();
      const canvas = document.createElement('canvas'); canvas.width=img.width;canvas.height=img.height;
      const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0);
      return [[88,1],[1,88],[12,12],[72,72],[5,2]].map(([x,y])=>ctx.getImageData(x,y,1,1).data[3]);
    }, png.toString('base64'));
    assert.equal(alpha[0], 0, 'upper-right needle tip must be rounded away');
    assert.equal(alpha[1], 0, 'lower-left needle tip must be rounded away');
    assert.equal(alpha[2], 255, 'upper-left page corner remains filled');
    assert.equal(alpha[3], 0, 'diagonal still faces down and right');
    assert.equal(alpha[4], 0, 'upper-left bend is visibly rounded, not just the two tips');
    assert.equal(await page.evaluate(() => document.elementFromPoint(26,28)?.localName), 'button');
    if (process.env.BZF_SAVE_VISUAL_TESTS) {
      const output=new URL('../artifacts/round5-review/sticky-corner/',import.meta.url);
      await mkdir(output,{recursive:true});
      await page.screenshot({path:fileURLToPath(new URL('softened-corner.png',output)),omitBackground:true});
    }
  } finally { await browser.close(); }
});
