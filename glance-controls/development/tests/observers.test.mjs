// Browser-free unit tests for the two #tabbrowser-tabpanels MutationObservers
// in button-order.uc.js and copy-url.uc.js. Both scripts run unchanged inside
// a jsdom window with small stubs for Services.prefs, ResizeObserver and the
// Sine unload hook. See ../README.md, "Run unit tests".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const modRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const depsDir = process.env.GLANCE_UNIT_DEPS || join(modRoot, '.backup-scratch', 'unit-deps');
let JSDOM;
try {
  ({ JSDOM } = createRequire(join(depsDir, 'package.json'))('jsdom'));
} catch {
  throw new Error(`jsdom was not found in ${depsDir}. Install it there with: ` +
    `npm install --prefix "${depsDir}" --no-audit --no-fund --ignore-scripts jsdom@26.1.0`);
}

const PREF = 'glance.position.order';
const DEFAULT = ['close', 'expand', 'split', 'copy'];
const SAVED = ['copy', 'split', 'expand', 'close'];
// Script load order: the template is arranged first, then Copy URL is appended.
const TEMPLATE_AT_LOAD = [...SAVED.filter(key => key !== 'copy'), 'copy'];
const CONTAINER = 'zen-glance-sidebar-container';
const nativeButtons = ['Close', 'Expand', 'Split']
  .map(name => `<toolbarbutton command="cmd_zenGlance${name}"></toolbarbutton>`).join('');
const source = name => readFileSync(join(modRoot, name), 'utf8');
const scripts = ['button-order.uc.js', 'copy-url.uc.js'].map(name => [name, source(name)]);
const flush = async () => { for (let i = 0; i < 3; i++) await new Promise(r => setTimeout(r, 0)); };

function keyOf(button) {
  if (button.classList.contains('glance-position-copy-url')) return 'copy';
  return button.getAttribute('command').replace('cmd_zenGlance', '').toLowerCase();
}
const orderOf = container => [...container.children].map(keyOf);

function setup({ order = SAVED, openGlance = false } = {}) {
  const glance = openGlance ? `<div class="${CONTAINER}" id="open">${nativeButtons}</div>` : '';
  const dom = new JSDOM(`<!doctype html><body>
    <template id="zen-glance-sidebar-template"><div class="${CONTAINER}">${nativeButtons}</div></template>
    <div id="tabbrowser-tabpanels">
      <div class="browserSidebarContainer"><div class="browserContainer" id="panel"><browser></browser>${glance}</div></div>
    </div></body>`, { runScripts: 'outside-only' });
  const { window } = dom;
  const { document } = window;

  const prefs = new Map([[PREF, order.join(',')]]);
  const prefObservers = [];
  const counts = { prefReads: 0 };
  window.Services = {
    prefs: {
      getStringPref(key, fallback) { counts.prefReads++; return prefs.has(key) ? prefs.get(key) : fallback; },
      setStringPref(key, value) {
        prefs.set(key, value);
        for (const [name, observer] of [...prefObservers]) if (name === key) observer.observe(null, 'nsPref:changed', key);
      },
      addObserver(key, observer) { prefObservers.push([key, observer]); },
      removeObserver(key, observer) {
        const i = prefObservers.findIndex(([name, o]) => name === key && o === observer);
        if (i >= 0) prefObservers.splice(i, 1);
      }
    }
  };
  window.gBrowser = {};
  window.Cc = {};
  window.Ci = {};
  const unloaders = [];
  window.addUnloadListener = fn => unloaders.push(fn);
  const measured = new Set();
  window.ResizeObserver = class {
    observe(target) { measured.add(target); }
    unobserve(target) { measured.delete(target); }
    disconnect() { measured.clear(); }
  };
  document.createXULElement = tag => document.createElement(tag);

  // Record every search rooted at the document, <html>, <body> or the tab
  // panels. Each of these walks a subtree that grows with the tab count.
  const wideQueries = [];
  const tabpanels = document.getElementById('tabbrowser-tabpanels');
  for (const [label, root] of [['document', document], ['html', document.documentElement],
    ['body', document.body], ['tabpanels', tabpanels]]) {
    for (const method of ['querySelector', 'querySelectorAll', 'getElementsByClassName', 'getElementsByTagName']) {
      const original = root[method];
      root[method] = function (...args) {
        wideQueries.push(`${label}.${method}(${args[0]})`);
        return original.apply(this, args);
      };
    }
  }

  for (const [name, code] of scripts) window.eval(`${code}\n//# sourceURL=${name}`);

  const templateContainer = document.getElementById('zen-glance-sidebar-template')
    .content.querySelector(`.${CONTAINER}`);
  return {
    window, document, tabpanels, templateContainer, measured, wideQueries, counts,
    panel: document.getElementById('panel'),
    setPref: value => window.Services.prefs.setStringPref(PREF, value.join(',')),
    unload: () => unloaders.forEach(fn => fn()),
    reset() { wideQueries.length = 0; counts.prefReads = 0; },
    // Clone the template as Glance does and count arrange() passes over the
    // clone: arrange() looks up the Close button exactly once per pass.
    cloneGlance() {
      const clone = document.importNode(templateContainer, true);
      const lookup = clone.querySelector;
      clone.arrangeCount = 0;
      clone.querySelector = function (selector) {
        if (selector === '[command="cmd_zenGlanceClose"]') clone.arrangeCount++;
        return lookup.call(this, selector);
      };
      return clone;
    }
  };
}

test('premise: the template is arranged before Copy URL exists, so Copy is last', () => {
  const env = setup();
  assert.deepEqual(orderOf(env.templateContainer), TEMPLATE_AT_LOAD);
});

test('unrelated tab-panel mutations run no document-wide query and arrange nothing', async () => {
  const env = setup();
  await flush();
  env.reset();
  const { document, tabpanels, panel } = env;

  tabpanels.append(document.createTextNode('text only'));
  panel.firstElementChild.append(document.createTextNode('more text'));
  const box = document.createElement('div');
  box.innerHTML = '<div class="notificationbox"><span>dialog</span><div class="findbar"></div></div>';
  tabpanels.append(box);
  panel.append(document.createElement('div'));
  panel.setAttribute('busy', 'true');
  await flush();
  tabpanels.lastChild.remove();
  box.remove();
  await flush();

  assert.deepEqual(env.wideQueries, []);
  assert.equal(env.counts.prefReads, 0, 'no order work for unrelated records');
  assert.equal(env.measured.size, 0);
});

test('a new Glance container is arranged exactly once, in the saved order', async () => {
  const env = setup();
  await flush();
  env.reset();
  const clone = env.cloneGlance();
  assert.deepEqual(orderOf(clone), TEMPLATE_AT_LOAD, 'the clone starts with Copy last');

  env.panel.append(clone);
  await flush();

  assert.equal(clone.arrangeCount, 1);
  assert.deepEqual(orderOf(clone), SAVED);
  assert.deepEqual(env.wideQueries, []);
  assert.ok(env.measured.has(clone), 'Copy URL measures the new container');
});

test('a container inside a newly added panel subtree is arranged exactly once', async () => {
  const env = setup();
  await flush();
  env.reset();
  const clone = env.cloneGlance();
  const panel = env.document.createElement('div');
  panel.className = 'browserSidebarContainer';
  const browserContainer = env.document.createElement('div');
  browserContainer.className = 'browserContainer';
  browserContainer.append(env.document.createElement('browser'), clone);
  panel.append(browserContainer);

  env.tabpanels.append(panel);
  await flush();

  assert.equal(clone.arrangeCount, 1);
  assert.deepEqual(orderOf(clone), SAVED);
  assert.deepEqual(env.wideQueries, []);
  assert.ok(env.measured.has(clone));
});

test('a container inserted before its buttons is ordered once the buttons arrive', async () => {
  const env = setup();
  await flush();
  const clone = env.cloneGlance();
  const buttons = [...clone.children];
  buttons.forEach(button => button.remove());
  env.panel.append(clone);
  await flush();
  clone.append(...buttons);
  await flush();
  assert.deepEqual(orderOf(clone), SAVED);
});

test('a Glance open at load receives Copy URL in the saved order and is measured', async () => {
  const env = setup({ openGlance: true });
  await flush();
  const open = env.document.getElementById('open');
  assert.deepEqual(orderOf(open), SAVED);
  assert.ok(env.measured.has(open));
});

test('closing a Glance stops measuring it', async () => {
  const env = setup();
  await flush();
  const clone = env.cloneGlance();
  env.panel.append(clone);
  await flush();
  assert.ok(env.measured.has(clone));
  clone.remove();
  await flush();
  assert.equal(env.measured.has(clone), false);
});

test('a preference change re-orders open Glances and the template; unload restores both', async () => {
  const env = setup();
  await flush();
  const clone = env.cloneGlance();
  env.panel.append(clone);
  await flush();

  const next = ['split', 'close', 'copy', 'expand'];
  env.setPref(next);
  await flush();
  assert.deepEqual(orderOf(clone), next);
  assert.deepEqual(orderOf(env.templateContainer), next);

  env.unload();
  await flush();
  assert.deepEqual(orderOf(clone), DEFAULT.slice(0, 3));
  assert.deepEqual(orderOf(env.templateContainer), DEFAULT.slice(0, 3));
  assert.equal(env.measured.size, 0);
});
