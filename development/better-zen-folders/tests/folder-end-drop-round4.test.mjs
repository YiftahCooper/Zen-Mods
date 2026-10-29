import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import * as api from '../scripts/better-zen-folders.uc.mjs';
import { makeFolderEndDropFixture } from './folder-end-drop.fixture.mjs';

// Round 4 activation-only reproduction. Native method bodies are verbatim MPL
// source captured from Zen 1.22.2b, not handwritten _dragData initialization.
// DOM, canvas/thumbnail, drag-image and moving-mode UI are boundary doubles.
// No browser/profile is opened. No native movement is exercised here.
function capturedLines(name, hash, first, last) {
  const bytes = readFileSync(new URL(`../artifacts/round3-review/native/${name}`, import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), hash);
  return bytes.toString('utf8').split('\n').slice(first - 1, last).join('\n');
}

function activationFixture({ legacyOwner = false } = {}) {
  const f = makeFolderEndDropFixture(api, { install: false });
  // Removed from Gecko's JS bindings in bug 2033243 (Firefox 152).
  // Zen's installed platform.ini identifies Gecko 156. Native accepts uses
  // documentGlobal; the old fixture incorrectly supplied both spellings.
  if (legacyOwner) f.source.ownerGlobal = f.host;
  Object.defineProperty(f.source, 'multiselected', {
    get() { return this.hasAttribute('multiselected'); },
  });
  const base = capturedLines('drag-and-drop.js',
    '7b673832efc9674215cf14c087242fcebf6f74a1e7d1c6e132b6485b1e7bafc1', 1292, 1516);
  const zen = capturedLines('ZenDragAndDrop.js',
    '77bf730cff5826b41034a82771ca79d01425168ce1bc18d35adf804d2cf46aa1', 139, 164);
  const accepts = JSON.parse(readFileSync(new URL('./fixtures/zen-1.22.2b-folder-drop.json', import.meta.url))).accepts;
  const { host, source, tabContainer } = f;
  host.isChromeWindow = true;
  host.devicePixelRatio = 1; host.screenX = host.screenY = 0;
  host.document.documentElement.setAttribute('windowtype', 'navigator:browser');
  source.linkedBrowser = { currentURI: { spec: 'about:blank' } };
  source.container = tabContainer;
  Object.assign(host.gBrowser, { selectedTabs: [source], selectedElements: [source],
    tabGroupMenu: { nextUnusedColor: 'blue' } });
  Object.assign(tabContainer, { verticalMode: true, arrowScrollbox: { scrollPosition: 0 },
    isContainerVerticalPinnedGrid: () => false,
    _dndCanvas: { style: {}, getContext: () => ({ fillRect() {} }) } });
  const context = vm.createContext({ window: host, document: host.document, gBrowser: host.gBrowser,
    TAB_DROP_TYPE: 'application/x-moz-tabbrowser-tab', RTL_UI: false, gMultiProcessBrowser: true,
    AppConstants: { platform: 'win' }, PageThumbs: { captureToCanvas: () => Promise.resolve() },
    PrivateBrowsingUtils: { isWindowPrivate: () => false },
    Services: { droppedLinkHandler: { canDropLink: () => false } },
    isTab: node => node?.localName === 'tab', isTabGroupLabel: () => false,
    isSplitViewWrapper: () => false, gZenCompactModeManager: {}, console });
  vm.runInContext(`
    class NativeBase {
      #setMovingTabMode(value) { this.movingMode = value; }
      ${base}
      ${accepts}
    }
    globalThis.NativeZen = class extends NativeBase {
      #isOutOfWindow = false;
      #dragImageEssential = false;
      #getDragImageOffset() { return { offsetX: 0, offsetY: 0 }; }
      #createDragImageForTabs() { return {}; }
      ${zen}
    };
  `, context);
  const native = new context.NativeZen();
  Object.assign(native, { _tabbrowserTabs: tabContainer, _rtlMode: false,
    ZenDragAndDropService: { onDragStart() {}, armDropLanding() {} } });
  tabContainer.tabDragAndDrop = native;
  // Replace only the fixture's synthetic dragstart listener. Native tabs.js
  // installs its bubble listener on this same target before the BZF bootstrap.
  tabContainer.listeners.delete('dragstart');
  tabContainer.addEventListener('dragstart', event => native.startTabDrag(event, source));
  f.manager.start();
  const start = () => {
    const payloads = new Map();
    const dt = { types: [], dropEffect: 'move', mozItemCount: 0,
      mozSetDataAt(type, value, index) {
        if (!this.types.includes(type)) this.types.push(type);
        payloads.set(`${index}:${type}`, value); this.mozItemCount = Math.max(this.mozItemCount, index + 1);
      },
      mozTypesAt() { return this.types; },
      mozGetDataAt(type, index) { return payloads.get(`${index}:${type}`); },
      addElement() {}, setDragImage() {},
    };
    return f.emit('dragstart', source, { dataTransfer: dt, screenX: 100, screenY: 215 });
  };
  return { ...f, native, start };
}

test('native Zen dragstart synchronously initializes the supported single-tab strip source', t => {
  const f = activationFixture(); t.after(() => f.manager.destroy());
  assert.equal(f.source._dragData, undefined);
  const event = f.start();
  assert.equal(f.source.multiselected, false);
  assert.equal(f.source._dragData.fromTabList, false);
  assert.equal(f.source._dragData.movingTabs.length, 1);
  assert.equal(f.source._dragData.movingTabs[0], f.source);
  assert.equal(f.native.getDropEffectForTabDrag(event), 'move');
  assert.equal(f.native._dropLandingArmed, true);
  assert.equal(event.stopped, 1);
});

test('legacy fixture ownership masks the activation failure after the same native dragstart', t => {
  const f = activationFixture({ legacyOwner: true }); t.after(() => f.manager.destroy());
  f.start(); f.reveal();
  assert.equal(f.rows().length, 3);
});

test('BZF accepts native-approved documentGlobal-only source without removed ownerGlobal', t => {
  const f = activationFixture(); t.after(() => f.manager.destroy());
  const event = f.start();
  assert.equal('ownerGlobal' in f.source, false);
  assert.equal(f.source.documentGlobal, f.host);
  assert.equal(f.native.getDropEffectForTabDrag(event), 'move');
  assert.equal(f.adapters.accepts(f.source, event), true);
});

test('native dragstart records modern source and zero-delay region entry exposes footer', t => {
  const f = activationFixture(); t.after(() => f.manager.destroy());
  f.start(); assert.equal(f.rows().length, 0); f.reveal();
  assert.equal(f.rows().length, 3, 'ordinary native drag must activate the three footer destinations');
});

test('native-initialized modern source participates in drag membership confirmation', t => {
  const f = activationFixture(); t.after(() => f.manager.destroy());
  const event = f.start();
  const guard = api.createBrowserCollapsedFolderDragGuardAdapters(f.host);
  const items = guard.getDraggedItems(event);
  assert.equal(items.length, 1);
  assert.equal(items[0], f.source);
  assert.equal(guard.isItemInFolder(f.source, f.child), false);
  f.child.groupContainer.appendChild(f.source);
  assert.equal(guard.isItemInFolder(f.source, f.child), true);
});

test('cross-window source remains rejected even when native permits a compatible window move', t => {
  const f = activationFixture(); t.after(() => f.manager.destroy());
  // Native accepts cross-window moves; this feature deliberately supports only
  // same-window drags. Retain local containment to isolate the ownership guard.
  f.source.documentGlobal = { isChromeWindow: true };
  const event = f.start();
  assert.equal(f.native.getDropEffectForTabDrag(event), 'move');
  assert.equal(f.adapters.accepts(f.source, event), false);
  assert.equal(f.rows().length, 0);
  const guard = api.createBrowserCollapsedFolderDragGuardAdapters(f.host);
  assert.deepEqual(guard.getDraggedItems(event), []);
  f.child.groupContainer.appendChild(f.source);
  assert.equal(guard.isItemInFolder(f.source, f.child), false);
});

test('drag membership filters a foreign-window moving item without losing the local source', t => {
  const f = activationFixture(); t.after(() => f.manager.destroy());
  const event = f.start();
  f.last.documentGlobal = { isChromeWindow: true };
  f.source._dragData.movingTabs.push(f.last);
  const guard = api.createBrowserCollapsedFolderDragGuardAdapters(f.host);
  const items = guard.getDraggedItems(event);
  assert.equal(items.length, 1);
  assert.equal(items[0], f.source);
  assert.equal(guard.isItemInFolder(f.last, f.child), false);
});
