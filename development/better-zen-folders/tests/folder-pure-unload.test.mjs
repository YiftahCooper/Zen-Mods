import test from 'node:test';
import assert from 'node:assert/strict';
import * as api from '../scripts/better-zen-folders.uc.mjs';

function fixture() {
  const listeners = new Map();
  const updates = [];
  const calls = [];
  const errors = [];
  const tab = (id, extra = {}) => ({id, isConnected: true, currentURL: 'page-B',
    pinnedURL: 'page-A', sticky: true, localName: 'tab',
    hasAttribute(name) { return !!this[name]; }, ...extra});
  const direct = tab('direct');
  const nested = tab('nested');
  const placeholder = tab('empty', {'zen-empty-tab': true});
  const folder = {isZenFolder: true, isLiveFolder: false, isConnected: true,
    collapsed: false, tabs: [direct, nested, placeholder], activeTabs: [direct],
    unloadAllTabs() { throw Error('Native reset/collapse route must not run'); }};
  const original = folder.unloadAllTabs;
  const folders = [folder];
  const host = {
    document: {querySelectorAll: () => folders},
    gBrowser: {
      isTab: item => item.localName === 'tab',
      explicitUnloadTabs: async tabs => { calls.push(tabs); for (const tab of tabs) tab.pending = true; return true; },
      tabContainer: {addEventListener(type, fn) {listeners.set(type, fn);},
        removeEventListener(type, fn) {if (listeners.get(type) === fn) listeners.delete(type);}},
    },
    MutationObserver: class {
      constructor(fn) {updates.push(fn);}
      observe() {}
      disconnect() {}
    },
    console: {error: (...args) => errors.push(args)},
  };
  assert.equal(typeof api.FolderUnloadManager, 'function', 'pure folder unload routing is not implemented');
  const manager = new api.FolderUnloadManager(host);
  const controller = new AbortController();
  manager.start(controller.signal);
  return {host, manager, controller, folder, folders, direct, nested, placeholder,
    calls, original, updates, listeners, errors};
}

test('folder unload uses pure native discard without resetting URLs, Sticky or collapse', async () => {
  const f = fixture();
  assert.equal(await f.folder.unloadAllTabs(), true);
  assert.deepEqual(f.calls, [[f.direct, f.nested]]);
  assert.equal(f.direct.pending, true);
  assert.equal(f.nested.pending, true);
  assert.equal(f.placeholder.pending, undefined);
  assert.equal(f.direct.currentURL, 'page-B');
  assert.equal(f.direct.pinnedURL, 'page-A');
  assert.equal(f.direct.sticky, true);
  assert.equal(f.folder.collapsed, false);
  assert.deepEqual(f.folder.activeTabs, [f.direct]);
  f.manager.destroy();
});

test('before-unload refusal is returned without changing organisation or forcing another attempt', async () => {
  const f = fixture();
  f.host.gBrowser.explicitUnloadTabs = async () => undefined;
  assert.equal(await f.folder.unloadAllTabs(), undefined);
  assert.equal(f.folder.collapsed, false);
  assert.equal(f.direct.pending, undefined);
  assert.equal(f.direct.currentURL, 'page-B');
  f.manager.destroy();
});

test('concurrent folder unload requests share one native operation; rejection allows retry', async () => {
  const f = fixture();
  let reject;
  let calls = 0;
  f.host.gBrowser.explicitUnloadTabs = () => {calls++; return new Promise((_, no) => {reject = no;});};
  const first = f.folder.unloadAllTabs();
  const second = f.folder.unloadAllTabs();
  await Promise.resolve();
  assert.equal(calls, 1);
  reject(Error('discard failed'));
  assert.equal(await first, false);
  assert.equal(await second, false);
  assert.equal(f.errors.length, 1);
  f.host.gBrowser.explicitUnloadTabs = async () => {calls++; return true;};
  assert.equal(await f.folder.unloadAllTabs(), true);
  assert.equal(calls, 2);
  assert.equal(f.folder.collapsed, false);
  f.manager.destroy();
});

test('new folders are covered, live folders stay native, abort restores only owned methods', async () => {
  const f = fixture();
  const live = {...f.folder, isLiveFolder: true, unloadAllTabs: () => 'provider'};
  const added = {...f.folder, unloadAllTabs: f.original};
  f.folders.push(live, added);
  f.updates[0]();
  assert.equal(live.unloadAllTabs(), 'provider');
  assert.equal(await added.unloadAllTabs(), true);
  const laterOwner = () => 'another mod';
  added.unloadAllTabs = laterOwner;
  f.controller.abort();
  assert.equal(f.folder.unloadAllTabs, f.original);
  assert.equal(added.unloadAllTabs, laterOwner);
  assert.equal(f.listeners.size, 0);
});

test('conversion to a live folder returns to its native handler and disconnected items are not discarded', async () => {
  const f = fixture();
  f.direct.isConnected = false;
  f.nested['zen-essential'] = true;
  assert.equal(await f.folder.unloadAllTabs(), false);
  assert.equal(f.calls.length, 0);
  f.folder.isLiveFolder = true;
  f.listeners.get('TabGroupUpdate')?.({target: f.folder});
  assert.equal(f.folder.unloadAllTabs, f.original);
  f.manager.destroy();
});

test('cleanup removes a shadowing method when the native method was inherited', async () => {
  const f = fixture();
  const inherited = Object.assign(Object.create({unloadAllTabs: f.original}),
    {isZenFolder: true, isConnected: true, tabs: [f.direct]});
  f.folders.push(inherited);
  f.updates[0]();
  assert.equal(Object.hasOwn(inherited, 'unloadAllTabs'), true);
  assert.equal(await inherited.unloadAllTabs(), true);
  f.manager.destroy();
  assert.equal(Object.hasOwn(inherited, 'unloadAllTabs'), false);
  assert.equal(inherited.unloadAllTabs, f.original);
});

test('a queued unload does not discard a tab moved away before native invocation', async () => {
  const f = fixture();
  const operation = f.folder.unloadAllTabs();
  f.folder.tabs = [f.placeholder];
  assert.equal(await operation, false);
  assert.equal(f.calls.length, 0);
  f.manager.destroy();
});

test('destroy cancels queued work without discarding or collapsing', async () => {
  const f = fixture();
  const operation = f.folder.unloadAllTabs();
  f.manager.destroy();
  assert.equal(await operation, false);
  assert.equal(f.calls.length, 0);
  assert.equal(f.folder.collapsed, false);
});

test('overlapping child and parent requests unload each tab once and retain parent coverage', async () => {
  for (const childFirst of [true, false]) {
    const f = fixture();
    const child = {...f.folder, tabs: [f.nested], unloadAllTabs: f.original};
    f.folders.push(child);
    f.updates[0]();
    const releases = [];
    f.host.gBrowser.explicitUnloadTabs = tabs => {
      f.calls.push(tabs);
      return new Promise(resolve => releases.push(resolve));
    };
    const first = (childFirst ? child : f.folder).unloadAllTabs();
    await Promise.resolve();
    const second = (childFirst ? f.folder : child).unloadAllTabs();
    await Promise.resolve();
    assert.equal(f.calls.flat().filter(tab => tab === f.nested).length, 1);
    assert.equal(f.calls.flat().filter(tab => tab === f.direct).length, 1);
    releases.forEach(resolve => resolve(true));
    assert.equal(await first, true);
    assert.equal(await second, true);
    f.manager.destroy();
  }
});
