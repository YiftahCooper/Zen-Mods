import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {makeFolderButtonFixture} from './fakes.mjs';

const attr = 'better-zen-folders-hide-unload';
function fixture() {
  const f = makeFolderButtonFixture();
  const original = f.adapters.preferences;
  let show = false;
  const subscriptions = new Set();
  f.adapters.preferences = {
    get: key => key === 'showFolderUnloadButton' ? show : original.get(key),
    subscribe(key, callback) {
      if (key !== 'showFolderUnloadButton') return original.subscribe(key, callback);
      subscriptions.add(callback);
      return () => subscriptions.delete(callback);
    },
  };
  return Object.assign(f, {setShow(value) {show = value; for (const cb of subscriptions) cb(value);},
    subscriptions});
}

test('unload visibility is live, independent of plus visibility, and restored on cleanup', () => {
  const f = fixture();
  f.manager.start(new AbortController().signal);
  assert.equal(f.row.getAttribute(attr), 'true');
  assert.equal(f.ownedButtons().length, 1);
  f.setShow(true);
  assert.equal(f.row.getAttribute(attr), null);
  assert.equal(f.ownedButtons().length, 1);
  f.setVisibility('hidden');
  f.setShow(false);
  assert.equal(f.row.getAttribute(attr), 'true');
  assert.equal(f.ownedButtons().length, 0);
  f.setVisibility('always');
  assert.equal(f.ownedButtons().length, 1);
  f.manager.destroy();
  assert.equal(f.row.getAttribute(attr), null);
  assert.equal(f.subscriptions.size, 0);
  assert.equal(f.resetButton.parentNode, f.row);
});

test('regular-to-live conversion immediately releases native unload presentation', () => {
  const f = fixture();
  f.manager.start(new AbortController().signal);
  assert.equal(f.row.getAttribute(attr), 'true');
  f.folder.isLiveFolder = true;
  f.notifyEligibilityChange();
  assert.equal(f.row.getAttribute(attr), null);
  assert.equal(f.ownedButtons().length, 0);
  f.setShow(true); f.setShow(false);
  assert.equal(f.row.getAttribute(attr), null);
  f.manager.destroy();
});

test('removed or replaced folder rows release their owned marker and references', () => {
  const f = fixture();
  f.manager.start(new AbortController().signal);
  assert.equal(f.row.getAttribute(attr), 'true');
  f.folders.splice(0);
  f.manager.reconcileAll();
  assert.equal(f.row.getAttribute(attr), null);
  assert.equal(f.manager.unloadRows.size, 0);
  f.manager.destroy();
});

const modulePath = process.env.BZF_PLAYWRIGHT_MODULE;
test('hidden minus leaves nested plus, chevron, child controls and live actions visible', {
  skip: modulePath ? false : 'Set BZF_PLAYWRIGHT_MODULE for isolated CSS verification',
}, async () => {
  const css = await readFile(new URL('../chrome.css', import.meta.url), 'utf8');
  const {chromium} = createRequire(import.meta.url)(modulePath);
  const browser = await chromium.launch({headless:true});
  try {
    const page = await browser.newPage();
    await page.route('**/*', route => route.abort());
    await page.setContent(`<style>zen-folder,.tab-group-label-container{display:flex}.tab-reset-button{display:flex}</style>
      <zen-folder><div class="tab-group-container"><zen-folder data-bzf-chevron="expanded">
      <div class="tab-group-label-container" ${attr}="true">
      <label class="tab-group-label">Child</label>
      <button id="plus" class="better-zen-folders-new-tab-button">+</button>
      <button id="minus" class="tab-reset-button">-</button>
      <span id="chevron" class="better-zen-folders-state-chevron"></span>
      </div><div class="tab-group-container"><button id="other" class="tab-reset-button">Other control</button></div>
      </zen-folder></div></zen-folder>
      <zen-folder><div class="tab-group-label-container" ${attr}="true">
      <button id="live" class="tab-reset-button" live-folder-action="refresh">Refresh</button></div></zen-folder>
      <menuitem id="menu-unload">Unload All Tabs</menuitem>`);
    await page.evaluate(() => {
      document.documentElement.setAttribute('zen-sidebar-expanded', 'true');
      document.documentElement.setAttribute('better-zen-folders-new-tab-visibility', 'always');
    });
    await page.addStyleTag({content:css});
    const before = await page.evaluate(() => Object.fromEntries(
      ['plus','minus','chevron','other','live','menu-unload'].map(id => {
        const node = document.getElementById(id);
        return [id, {display:getComputedStyle(node).display, width:node.getBoundingClientRect().width}];
      })));
    assert.equal(before.minus.display, 'none');
    for (const id of ['plus','chevron','other','live','menu-unload']) {
      assert.notEqual(before[id].display, 'none', id);
      assert.ok(before[id].width > 0, id);
    }
    await page.evaluate(attr => document.getElementById('minus').parentNode.removeAttribute(attr), attr);
    assert.equal(await page.locator('#minus').evaluate(node => getComputedStyle(node).display), 'flex');
  } finally { await browser.close(); }
});
