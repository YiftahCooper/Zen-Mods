import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';

const modulePath = process.env.BZF_PLAYWRIGHT_MODULE;
const skip = modulePath ? false : 'requires isolated Chromium';
const source = await readFile(new URL('../scripts/better-zen-folders.uc.mjs', import.meta.url), 'utf8');
const sineCss = await readFile(new URL('../fixtures/sine/settings.css', import.meta.url), 'utf8');
const defaults = ['#e76565', '#ef8f4b', '#e3bd41', '#51c67c', '#3ebcd2', '#5f95eb', '#9b79ea', '#e46da9'];

async function fixture(run) {
  const browser = await createRequire(import.meta.url)(modulePath).chromium.launch({headless:true});
  try {
    const page = await browser.newPage({viewport:{width:900, height:900}});
    await page.setContent(`<style>
      /* Chromium has no XUL UA sheet: supply only its box display behavior. */
      hbox { display:flex; } vbox { display:block; }
      body { margin:8px; } * { box-sizing:border-box; }
    </style><style>${sineCss}</style><main class="sineItemPreferenceDialogContent"><vbox>
      ${defaults.map((value, i) => `<hbox id="better-zen-folders-palette-${i+1}"><label class="sineItemPreferenceLabel">Swatch ${i+1}</label><input value="${value}"></hbox>`).join('')}
      <hbox id="unrelated"><label>Other setting</label><input></hbox>
    </vbox></main>`);
    await page.evaluate(async ({source, defaults}) => {
      const url = URL.createObjectURL(new Blob([source], {type:'text/javascript'}));
      const api = await import(url); URL.revokeObjectURL(url);
      const stored = new Map(defaults.map((value, i) => [`better-zen-folders.palette-${i+1}`, value]));
      stored.set('better-zen-folders.custom-palette-enabled', true);
      stored.set('folder-colour-ledger', '{"existing-folder":"#123456"}');
      const writes = [], callbacks = [];
      const adapters = {
        prefTypes:{invalid:0, string:32, boolean:128, integer:64},
        getPrefType:key => !stored.has(key) ? 0 : typeof stored.get(key) === 'boolean' ? 128 : 32,
        read:(_, key) => stored.get(key), hasUserValue:key => stored.has(key),
        write:(_, key, value) => { stored.set(key, value); writes.push([key, value]); prefs.observe(null, 'nsPref:changed', key); },
        clearUserPref:key => stored.delete(key), addObserver(){}, removeObserver(){}, warn(message){throw new Error(message);},
      };
      const prefs = new api.BetterZenFoldersPreferences(adapters); prefs.start();
      const host = {document, Event, MutationObserver, browsingContext:{}, Ci:{nsIColorPicker:{}},
        Cc:{'@mozilla.org/colorpicker;1':{createInstance:() => ({init(){}, open:cb => callbacks.push(cb)})}}};
      for (let i=1; i<=8; i++) {
        const input = document.querySelector(`#better-zen-folders-palette-${i} input`);
        input.addEventListener('change', () => adapters.write('string', `better-zen-folders.palette-${i}`, input.value));
      }
      window.palette = {writes, callbacks, stored, prefs, adapters, release:api.installPaletteSettingsUi(host, prefs)};
    }, {source, defaults});
    await run(page);
  } finally { await browser.close(); }
}

// Break caught: Sine's real space-between rule separates each row's controls.
test('all eight palette rows stay adjacent under installed Sine CSS and wrap without overflow', {skip}, async () => fixture(async page => {
  await page.evaluate(() => {
    for (let i=1; i<=8; i++) palette.adapters.write('string', `better-zen-folders.palette-${i}`, '#abcdef');
  });
  const measure = () => page.evaluate(() => [...document.querySelectorAll('[id^="better-zen-folders-palette-"]')]
    .filter(row => row.localName === 'hbox').map(row => ({
      justify:getComputedStyle(row).justifyContent,
      children:[...row.children].filter(el => !el.hidden).map(el => {
        const r = el.getBoundingClientRect(); return {left:r.left, right:r.right, top:r.top, bottom:r.bottom, width:r.width, height:r.height};
      }), right:row.getBoundingClientRect().right, scroll:row.scrollWidth, width:row.clientWidth,
    })));
  const wide = await measure();
  assert.equal(wide.length, 8);
  for (const row of wide) {
    assert.equal(row.justify, 'flex-start');
    assert.equal(row.children.length, 4);
    for (let i=1; i<4; i++) {
      assert.ok(row.children[i].left - row.children[i-1].right <= 12, 'adjacent controls have a small gap');
      assert.ok(row.children[i].left >= row.children[i-1].right, 'controls do not overlap');
    }
    for (const target of row.children.slice(2)) assert.ok(target.width >= 24 && target.height >= 24);
  }
  assert.equal(await page.locator('#unrelated').evaluate(el => getComputedStyle(el).justifyContent), 'space-between');
  await page.setViewportSize({width:240, height:900});
  for (const row of await measure()) {
    assert.ok(row.scroll <= row.width + 1, 'row has no horizontal overflow');
    assert.ok(row.children.every(el => el.right <= row.right + 1), 'controls stay inside the narrow row');
    assert.ok(row.children.at(-1).top >= row.children[0].bottom, 'controls wrap to another line');
  }
}));

// Break caught: reset affects another preference, is not keyboard reachable,
// retains a validation error, or accepts a native picker result from before reset.
test('each custom swatch resets by keyboard to its built-in default and rejects pending picker completion', {skip}, async () => fixture(async page => {
  assert.equal(await page.getByRole('button', {name:/Reset Swatch/}).count(), 0);
  for (let i=1; i<=8; i++) {
    const input = page.getByRole('textbox', {name:`Swatch ${i} hex colour`, exact:true});
    await input.fill('#ABCDEF'); await input.press('Tab');
    const reset = page.getByRole('button', {name:`Reset Swatch ${i} to default`, exact:true});
    assert.equal(await reset.count(), 1, 'custom colour exposes a named reset button');
    await page.getByRole('button', {name:`Choose Swatch ${i} colour`, exact:true}).click();
    await input.fill('invalid'); await input.press('Enter');
    await input.focus(); await page.keyboard.press('Tab'); await page.keyboard.press('Tab');
    assert.equal(await reset.evaluate(el => document.activeElement === el), true);
    const outline = await reset.evaluate(el => ({style:getComputedStyle(el).outlineStyle, width:getComputedStyle(el).outlineWidth}));
    assert.notEqual(outline.style, 'none'); assert.ok(parseFloat(outline.width) >= 2);
    await page.keyboard.press(i % 2 ? 'Enter' : 'Space');
    await page.evaluate(() => {palette.callbacks.at(-1).update('#112233'); palette.callbacks.at(-1).done('#112233');});
    assert.equal(await input.inputValue(), defaults[i-1]);
    assert.equal(await input.getAttribute('aria-invalid'), null);
    assert.equal(await input.evaluate(el => el.validationMessage), '');
    assert.equal(await input.evaluate(el => document.activeElement === el), true, 'focus returns to the hex field before reset disappears');
    assert.equal(await page.getByRole('button', {name:`Choose Swatch ${i} colour`, exact:true}).getAttribute('data-colour'), defaults[i-1]);
    assert.equal(await reset.count(), 0);
  }
  const result = await page.evaluate(() => ({writes:palette.writes, stored:[...palette.stored]}));
  assert.deepEqual(result.writes, defaults.flatMap((value, i) => [[`better-zen-folders.palette-${i+1}`, '#abcdef'], [`better-zen-folders.palette-${i+1}`, value]]));
  assert.deepEqual(result.stored, [...defaults.map((value, i) => [`better-zen-folders.palette-${i+1}`, value]), ['better-zen-folders.custom-palette-enabled', true], ['folder-colour-ledger', '{"existing-folder":"#123456"}']]);
}));

// Break caught: default-equivalent edits show reset, external reset leaves a
// stale button/picker, or release leaves reset controls/listeners behind.
test('reset visibility follows normalized defaults and external changes with reversible cleanup', {skip}, async () => fixture(async page => {
  const result = await page.evaluate(() => {
    const input = document.querySelector('#better-zen-folders-palette-1 input');
    const reset = document.querySelector('.better-zen-folders-palette-reset');
    if (!reset) return {missing:true};
    input.value = '#E76565'; input.dispatchEvent(new Event('input', {bubbles:true}));
    const sameDefaultHidden = reset.hidden;
    palette.adapters.write('string', 'better-zen-folders.palette-1', '#abcdef');
    const customVisible = !reset.hidden;
    document.querySelector('.better-zen-folders-palette-preview').click();
    palette.adapters.write('string', 'better-zen-folders.palette-1', '#e76565');
    palette.callbacks.at(-1).done('#112233');
    const externalReset = {hidden:reset.hidden, value:input.value};
    palette.release(); palette.release(); const count = palette.writes.length;
    reset.click();
    return {sameDefaultHidden, customVisible, externalReset,
      remaining:document.querySelectorAll('.better-zen-folders-palette-reset,.better-zen-folders-palette-preview,[role=alert]').length,
      label:input.getAttribute('aria-label'), subscriptions:[...palette.prefs.subscribers.values()].reduce((n, set) => n+set.size, 0),
      writesAfterRelease:palette.writes.length-count};
  });
  assert.deepEqual(result, {sameDefaultHidden:true, customVisible:true, externalReset:{hidden:true, value:'#e76565'}, remaining:0, label:null, subscriptions:0, writesAfterRelease:0});
}));
