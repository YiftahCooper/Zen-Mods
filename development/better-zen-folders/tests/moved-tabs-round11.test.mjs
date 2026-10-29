import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import * as api from '../scripts/better-zen-folders.uc.mjs';
import {DropNode, makeFolderEndDropFixture} from './folder-end-drop.fixture.mjs';
import {installNativeDropReplay} from './folder-end-drop.native.fixture.mjs';
import {makePreferenceFixture} from './fakes.mjs';

// Replay the recorded native command verbatim; membership remains its job.
const nativeFolders = readFileSync(new URL('../artifacts/native-20260915/ZenFolders.mjs', import.meta.url), 'utf8');
const commandBody = nativeFolders.split('moveTabToFolderMenu.addEventListener("command", event => {')[1].split('\n    });')[0];
const nativeSourceHashes = {
  receiver:'5e958d5a36d88f63d81d3c48d410e4158870cff653390d5bc79fd46f4fc06eee',
  tab:'0d2115030f11390303f84c962f82746f1ddbbb6332fc6ba3a0313a3d88fd22bf',
};
const reviewedNativeVersions = [
  {version:'Zen 1.22.2b', sources:nativeSourceHashes},
  JSON.parse(readFileSync(new URL('./fixtures/zen-1.22.3b-moved-tabs-identity.json', import.meta.url), 'utf8')),
  JSON.parse(readFileSync(new URL('./fixtures/zen-1.23.2b-moved-tabs-identity.json', import.meta.url), 'utf8')),
  JSON.parse(readFileSync(new URL('./fixtures/zen-1.23.3b-moved-tabs-identity.json', import.meta.url), 'utf8')),
  JSON.parse(readFileSync(new URL('./fixtures/zen-1.23.4b-moved-tabs-identity.json', import.meta.url), 'utf8')),
];
function assertReviewedNativeIdentity(hashes) {
  const identity = reviewedNativeVersions.find(({sources}) =>
    Object.keys(nativeSourceHashes).every(name => sources[name] === hashes[name]));
  assert.ok(identity,
    `native source drift requires a newly reviewed, version-matched replay: ${JSON.stringify(hashes)}`);
  return identity;
}
// MPL-2.0; https://mozilla.org/MPL/2.0/
// Verbatim installed Zen 1.22.2b / Gecko 156.0, build 20260915091052,
// source stamp e74571eead515d37edd0914739f744bcb5258c51.
// omni.ja!moz-src/browser/components/tabbrowser/Tabbrowser.sys.mjs:8030
// Whole-entry SHA-256: 5e958d5a36d88f63d81d3c48d410e4158870cff653390d5bc79fd46f4fc06eee
// Keep this replay version-matched with zen-1.22.2b-folder-drop.json.
const moveToBody = String.raw`
  moveTabTo(
    element,
    { elementIndex, tabIndex, forceUngrouped = false, metricsContext } = {}
  ) {
    if (typeof elementIndex == "number") {
      tabIndex = this.#elementIndexToTabIndex(elementIndex);
    }

    // Don't allow mixing pinned and unpinned tabs.
    if (element.pinned) {
      tabIndex = element.hasAttribute('zen-essential') ? Math.min(tabIndex, this._numZenEssentials - 1) : Math.min(Math.max(tabIndex, this._numZenEssentials), this.pinnedTabCount - 1);
    } else {
      tabIndex = Math.max(tabIndex, this.pinnedTabCount);
    }

    // Return early if the tab is already in the right spot.
    if (
      this.isTab(element) &&
      element.index == tabIndex &&
      !(element.group && forceUngrouped)
    ) {
      return;
    }

    // When asked to move a tab group label, we need to move the whole group
    // instead.
    if (this.isTabGroupLabel(element)) {
      element = element.group;
    }
    if (this.isTabGroup(element)) {
      forceUngrouped = true;
    }
    // When asked to move a tab in a splitview, move the entire wrapper instead.
    if (element.splitview) {
      element = element.splitview;
    }
    // When moving backwards, placing an element at tabIndex works trivially.
    // When moving forwards to a higher tabIndex, we need to increase the
    // index to account for the fact that the act of moving (multiple) tabs
    // causes all following tabs to have a decreased index.
    let movingForwards = false;
    if (this.isTab(element)) {
      movingForwards = tabIndex > element.index;
    } else {
      // tab group or split view (mutually exclusive with being pinned).
      let tabsInElement = element.tabs;
      movingForwards = tabIndex > tabsInElement[0].index;
      if (movingForwards) {
        // -1 because element will be *after* tabIndex instead of at it.
        tabIndex += tabsInElement.length - 1;
        tabIndex = Math.min(tabIndex, this.tabs.length);
      }
    }
    this.#handleTabMove(
      element,
      () => {
        let neighbor = this.documentGlobal.gZenGlanceManager.getTabOrGlanceParent(this.tabs[tabIndex]);
        if ((forceUngrouped && neighbor?.group) || neighbor?.group?.hasAttribute("split-view-group")) {
          neighbor = neighbor.group;
        }
        if (neighbor?.splitview) {
          neighbor = neighbor.splitview;
          if (neighbor === element) {
            // Already inside the same split view, don't move.
            // If you want to swap tabs, use splitview.reverseTabs() instead.
            return;
          }
        }
        if (element.group?.hasAttribute("split-view-group")) {
          element = element.group;
        }
        if (element.group?.hasAttribute("split-view-group") && neighbor == element.group) {
          return;
        }

        if (movingForwards && neighbor) {
          neighbor.after(element);
        } else {
          this.tabContainer.insertBefore(element, neighbor);
        }
      },
      { metricsContext }
    );
  }
`;

test('native identity guard still accepts the original 1.22.2b source pair', () => {
  assert.equal(assertReviewedNativeIdentity(nativeSourceHashes).version, 'Zen 1.22.2b');
});

test('native identity guard rejects unreviewed receiver or tab bytes', () => {
  for (const identity of reviewedNativeVersions) for (const name of ['receiver', 'tab']) {
    assert.throws(() => assertReviewedNativeIdentity({...identity.sources, [name]:'0'.repeat(64)}),
      /native source drift requires a newly reviewed, version-matched replay/);
  }
});

test('installed Zen receiver and tab API match a reviewed version and the retained replay',
  {skip:process.platform !== 'win32' || process.env.BZF_CHECK_INSTALLED_ZEN !== '1'}, () => {
    // Read archive bytes only; no extraction, browser process, or profile.
    // Archive overrides support read-only copies of either reviewed build.
    const script = `
      $ProgressPreference = 'SilentlyContinue'
      $ErrorActionPreference = 'Stop'
      Add-Type -AssemblyName System.IO.Compression.FileSystem
      $result = @{}
      foreach ($pair in @(
        @('receiver', $env:BZF_MOVED_TABS_ROOT_ARCHIVE, 'moz-src/browser/components/tabbrowser/Tabbrowser.sys.mjs'),
        @('tab', $env:BZF_MOVED_TABS_BROWSER_ARCHIVE, 'chrome/browser/content/browser/tabbrowser/tab.js')
      )) {
        $zip = [IO.Compression.ZipFile]::OpenRead($pair[1])
        try {
          $entry = $zip.GetEntry($pair[2])
          if (!$entry) { throw "Missing native entry: $($pair[2])" }
          $stream = $entry.Open()
          $bytes = [IO.MemoryStream]::new()
          try { $stream.CopyTo($bytes); $result[$pair[0]] = [Convert]::ToBase64String($bytes.ToArray()) }
          finally { $stream.Dispose(); $bytes.Dispose() }
        } finally { $zip.Dispose() }
      }
      $result | ConvertTo-Json -Compress
    `;
    const encoded = JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive',
      '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], {
      encoding:'utf8', maxBuffer:4 * 1024 * 1024,
      env:{...process.env,
        BZF_MOVED_TABS_ROOT_ARCHIVE:process.env.BZF_NATIVE_ROOT_OMNI ?? 'C:/Program Files/Zen Browser/omni.ja',
        BZF_MOVED_TABS_BROWSER_ARCHIVE:process.env.BZF_NATIVE_BROWSER_OMNI ?? 'C:/Program Files/Zen Browser/browser/omni.ja'},
    }));
    const sources = {};
    const hashes = {};
    for (const name of Object.keys(nativeSourceHashes)) {
      const bytes = Buffer.from(encoded[name], 'base64');
      hashes[name] = createHash('sha256').update(bytes).digest('hex');
      sources[name] = bytes.toString('utf8');
    }
    const reviewed = assertReviewedNativeIdentity(hashes);
    const start = sources.receiver.indexOf('  moveTabTo(\n');
    const end = sources.receiver.indexOf('  moveTabBefore(', start);
    assert.ok(start >= 0 && end > start, 'current native method boundaries exist');
    const section = sources.receiver.slice(start, end);
    assert.equal(section.slice(0, section.lastIndexOf('\n\n  /**')).trim(), moveToBody.trim(),
      'the retained replay must be the exact installed moveTabTo body');
    assert.ok(sources.receiver.includes(moveToBody.slice(1)),
      'moveTabTo also matches byte-for-byte including indentation and final newline');
    const dropReplay = JSON.parse(readFileSync(new URL('./fixtures/zen-1.22.2b-folder-drop.json', import.meta.url), 'utf8'));
    const withoutBlockComments = source => source.replace(/\/\*[\s\S]*?\*\//g,'');
    assert.ok(reviewed.receiverCommentsChanged
      ? withoutBlockComments(sources.receiver).includes(withoutBlockComments(dropReplay.receiver))
      : sources.receiver.includes(dropReplay.receiver),
      'the retained before/after receiver executable code must remain byte-identical (reviewed JSDoc-only changes may differ)');
    assert.match(sources.tab, /get index\(\)\s*\{\s*return this\._index;\s*\}/,
      'the installed tab API exposes the current index getter');
  });

function fixture(position = 'top') {
  const f = makeFolderEndDropFixture(api, {install:false});
  installNativeDropReplay(f);
  const {host, child:folder, last, source, own, root} = f;
  const tabMenu = root.appendChild(own(new DropNode('menupopup', 'tabContextMenu')));
  const menu = tabMenu.appendChild(own(new DropNode('menu', 'context_zenMoveToFolder')));
  const popup = menu.appendChild(own(new DropNode('menupopup')));
  const item = popup.appendChild(own(new DropNode('menuitem')));
  item.setAttribute('class', 'context-zen-move-to-folder-item'); item._group = folder;
  host.document.getElementById = id => id === menu.id ? menu : id === tabMenu.id ? tabMenu : null;
  const placeholder = own(new DropNode('tab', 'empty')); placeholder.setAttribute('zen-empty-tab', 'true'); placeholder.setAttribute('pinned', 'true');
  folder.groupContainer.insertBefore(placeholder, last);
  const second = own(new DropNode('tab', 'second')); f.normal.appendChild(second);
  const context = host.TabContextMenu = {contextTab:source};
  host.gBrowser.selectedTabs = [source, second]; source.multiselected = true;
  const values = {movedTabPosition:position, newTabPosition:'top', movedFolderPosition:'top'};
  const reads = [], errors = [], calls = [];
  host.console = {warn:(...args) => errors.push(args)};
  const preferences = {get:name => {reads.push(name); return values[name];}};
  // The receiver's private side-effect dispatcher is a fixture seam. The
  // receiver decisions, pin routing, wrapper promotion and index maths are native.
  const sandbox = vm.createContext({});
  const receiver = vm.runInContext(`(class {
    elementIndexToTabIndex(index) { return index; }
    handleTabMove(element, callback) { callback(); }
    ${moveToBody.replaceAll('#elementIndexToTabIndex', 'elementIndexToTabIndex').replaceAll('#handleTabMove', 'handleTabMove')}
  })`, sandbox);
  host.gBrowser.moveTabTo = receiver.prototype.moveTabTo;
  host.gBrowser.handleTabMove = receiver.prototype.handleTabMove;
  host.gBrowser.isSplitViewWrapper = node => node?.localName === 'tab-split-view-wrapper';
  host.gBrowser.isTabGroup = node => node?.isZenFolder || node?.localName === 'tab-group';
  f.tabContainer.insertBefore = (node, neighbor) => neighbor.parentElement.insertBefore(node, neighbor);
  for (const name of ['moveTabBefore', 'moveTabAfter', 'moveTabTo']) {
    const original = host.gBrowser[name];
    host.gBrowser[name] = function(...args) { calls.push([name, ...args]); return Reflect.apply(original, this, args); };
  }
  const indexTabs = () => { for (const tab of host.gBrowser.tabs) Object.defineProperty(tab, 'index', {configurable:true, get:() => host.gBrowser.tabs.indexOf(tab)}); };
  let accept = () => true, nativeCalls = 0, duringNative = () => {};
  folder.addTabs = tabs => {
    nativeCalls++;
    for (const tab of tabs) {
      if (!accept(tab)) continue;
      // Model native Essentials removal and selection clearing, not BZF work.
      tab.removeAttribute('zen-essential'); tab.setAttribute('pinned', 'true');
      const moving = tab.splitview ?? (tab.group?.hasAttribute('split-view-group') ? tab.group : tab);
      if (moving.parentElement !== folder.groupContainer) folder.groupContainer.appendChild(moving);
      tab.multiselected = false;
    }
    host.gBrowser.selectedTabs = []; indexTabs(); duringNative();
  };
  const nativeAddTabs = folder.addTabs;
  const nativeCommand = new Function('gBrowser', 'TabContextMenu', `return event => {${commandBody}\n}`)(host.gBrowser, context);
  const dispatch = (target = item, type = 'command') => {
    const path = []; for (let node = target; node; node = node.parentElement) path.push(node);
    const event = {type, target, defaultPrevented:false};
    for (const node of [...path].reverse()) node.fire(event, true);
    for (const node of path) node.fire(event, false);
    return event;
  };
  const start = (signal, nativeFirst = true, settings = preferences) => {
    assert.equal(typeof api.MovedTabsMenuManager, 'function', 'menu-only moved-tab manager exists');
    if (nativeFirst) menu.addEventListener('command', nativeCommand);
    const manager = new api.MovedTabsMenuManager(host, settings); manager.start(signal);
    if (!nativeFirst) menu.addEventListener('command', nativeCommand);
    assert.equal(folder.addTabs, nativeAddTabs, 'native addTabs is never wrapped');
    return manager;
  };
  const order = () => folder.groupContainer.children.map(node => node.id);
  const split = (kind, parent = f.normal, id = 'split') => {
    const wrapper = own(new DropNode(kind, id)); parent.appendChild(wrapper);
    if (kind === 'tab-group') wrapper.setAttribute('split-view-group', 'true');
    Object.defineProperty(wrapper, 'pinned', {value:kind === 'tab-group' ? undefined : false});
    const tabs = ['left', 'right'].map(name => {
      const tab = own(new DropNode('tab', `${id}-${name}`)); tab.setAttribute('pinned', 'true'); wrapper.appendChild(tab);
      if (kind === 'tab-group') Object.defineProperty(tab, 'group', {get:() => wrapper});
      else Object.defineProperty(tab, 'splitview', {get:() => tab.parentElement === wrapper ? wrapper : null});
      return tab;
    });
    indexTabs(); return {wrapper, tabs};
  };
  return {...f, folder, placeholder, second, tabMenu, menu, item, context, values, reads, errors, calls,
    start, dispatch, order, split, nativeAddTabs, nativeCalls:() => nativeCalls,
    setAccept:fn => {accept = fn;}, duringNative:fn => {duringNative = fn;}};
}

for (const position of ['top', 'bottom', undefined, 'invalid']) test(`native menu places a selected block at ${position ?? 'default bottom'}`, () => {
  const f = fixture(position); if (position === undefined) f.values.movedTabPosition = undefined;
  const manager = f.start(); f.dispatch();
  assert.deepEqual(f.order(), position === 'top' ? ['empty', 'source', 'second', 'last'] : ['empty', 'last', 'source', 'second']);
  assert.equal(f.nativeCalls(), 1); assert.deepEqual(f.reads, ['movedTabPosition']);
  if (position !== 'top') assert.equal(f.calls.length, 0, 'already-correct native block needs no extra moves');
  assert.deepEqual(f.errors, []); assert.equal(f.folder.addTabs, f.nativeAddTabs); manager.destroy();
});

test('capture freezes multiselection and preference before native clears them', () => {
  const f = fixture(); f.duringNative(() => {f.values.movedTabPosition = 'bottom'; f.context.contextTab = f.last;});
  const manager = f.start(undefined, false); f.dispatch();
  assert.deepEqual(f.order(), ['empty', 'source', 'second', 'last']); manager.destroy();
});

test('saved moved-tab setting and a live change reach the native menu independently', () => {
  const settings = makePreferenceFixture();
  settings.set('better-zen-folders.moved-tab-position', 'top');
  settings.set('better-zen-folders.new-tab-position', 'bottom');
  settings.set('better-zen-folders.moved-folder-position', 'bottom');
  const preferences = new api.BetterZenFoldersPreferences(api.createBrowserPreferenceAdapters(settings.host));
  preferences.start();
  const f = fixture(), manager = f.start(undefined, true, preferences);
  try {
    f.dispatch(); assert.deepEqual(f.order(), ['empty', 'source', 'second', 'last']);
    for (const tab of [f.source, f.second]) f.normal.appendChild(tab);
    f.source.multiselected = true; f.host.gBrowser.selectedTabs = [f.source, f.second];
    settings.set('better-zen-folders.moved-tab-position', 'bottom');
    settings.notify('better-zen-folders.moved-tab-position');
    f.dispatch(); assert.deepEqual(f.order(), ['empty', 'last', 'source', 'second']);
    assert.equal(preferences.get('newTabPosition'), 'bottom');
    assert.equal(preferences.get('movedFolderPosition'), 'bottom');
    assert.deepEqual(f.errors, []);
  } finally {manager.destroy(); preferences.destroy();}
});

test('single context tab does not pull unrelated selected tabs or duplicate it', () => {
  const f = fixture(); f.source.multiselected = false; const manager = f.start(); f.dispatch();
  assert.deepEqual(f.order(), ['empty', 'source', 'last']); assert.equal(f.second.parentElement, f.normal);
  assert.equal(f.folder.tabs.filter(tab => tab === f.source).length, 1); manager.destroy();
});

test('partial native success reorders only the tab that arrived', () => {
  const f = fixture(); f.setAccept(tab => tab === f.source); const manager = f.start(); f.dispatch();
  assert.deepEqual(f.order(), ['empty', 'source', 'last']); assert.equal(f.second.parentElement, f.normal); manager.destroy();
});

test('refused move and pre-existing destination tabs are not reordered', () => {
  const f = fixture(); f.host.gBrowser.selectedTabs = [f.last, f.source]; f.setAccept(() => false);
  const manager = f.start(); f.dispatch(); assert.deepEqual(f.order(), ['empty', 'last']); assert.equal(f.calls.length, 0); manager.destroy();
});

for (const position of ['top', 'bottom']) for (const kind of ['tab-split-view-wrapper', 'tab-group']) {
  test(`${position}: moved ${kind} remains one ordered item with both tabs intact`, () => {
    const f = fixture(position), {wrapper, tabs} = f.split(kind);
    f.host.gBrowser.selectedTabs = [f.source, ...tabs, f.second, ...tabs];
    const manager = f.start(); f.dispatch();
    assert.deepEqual(f.order(), position === 'top' ? ['empty', 'source', 'split', 'second', 'last'] : ['empty', 'last', 'source', 'split', 'second']);
    assert.deepEqual(wrapper.children, tabs); assert.equal(wrapper.parentElement, f.folder.groupContainer);
    assert.equal(f.nativeCalls(), 1); assert.deepEqual(f.errors, []); manager.destroy();
  });
  test(`${position}: an existing ${kind} stays intact at the destination boundary`, () => {
    const f = fixture(position); f.last.remove(); const {wrapper, tabs} = f.split(kind, f.folder.groupContainer);
    const manager = f.start(); f.dispatch();
    assert.deepEqual(f.order(), position === 'top' ? ['empty', 'source', 'second', 'split'] : ['empty', 'split', 'source', 'second']);
    assert.deepEqual(wrapper.children, tabs); assert.deepEqual(f.errors, []); manager.destroy();
  });
  test(`${position}: native insertion at the front preserves ${kind} as one block`, () => {
    const f = fixture(position), {wrapper, tabs} = f.split(kind);
    f.host.gBrowser.selectedTabs = [f.source, ...tabs, f.second];
    f.duringNative(() => {
      // A synchronous native/other listener may have changed the insertion edge.
      // The requested placement still applies, without moving the existing row.
      for (const item of [f.source, wrapper, f.second]) f.folder.groupContainer.insertBefore(item, f.last);
    });
    const manager = f.start(); f.dispatch();
    assert.deepEqual(f.order(), position === 'top' ? ['empty', 'source', 'split', 'second', 'last'] : ['empty', 'last', 'source', 'split', 'second']);
    assert.deepEqual(wrapper.children, tabs); assert.deepEqual(f.errors, []); manager.destroy();
  });
}

for (const kind of ['tab-split-view-wrapper', 'tab-group']) {
  test(`Zen 1.22.2b index-only ${kind}: Top places the complete selected block`, () => {
    const f = fixture('top'), {wrapper, tabs} = f.split(kind);
    f.host.gBrowser.selectedTabs = [f.source, ...tabs, f.second];
    for (const tab of [f.last, f.source, ...tabs, f.second]) {
      assert.equal('_tPos' in tab, false, 'do not give current tabs the obsolete index alias');
      assert.equal(Number.isInteger(tab.index), true);
    }
    const manager = f.start();
    try {
      f.dispatch();
      assert.deepEqual(f.order(), ['empty', 'source', 'split', 'second', 'last']);
      assert.deepEqual(wrapper.children, tabs);
      assert.equal(wrapper.parentElement, f.folder.groupContainer);
      assert.deepEqual(f.errors, []);
    } finally {manager.destroy();}
  });
}

test('empty destinations retain their placeholder and native block order', () => {
  const f = fixture(); f.last.remove(); const manager = f.start(); f.dispatch();
  assert.deepEqual(f.order(), ['empty', 'source', 'second']); assert.equal(f.calls.length, 0); manager.destroy();
});

for (const position of ['top', 'bottom']) for (const kind of ['tab-split-view-wrapper', 'tab-group']) {
  test(`${position}: ${kind} stays beside a nested folder, never inside its descendants`, () => {
    const f = fixture(position); f.last.remove();
    const nested = f.addFolder('nested', f.folder.groupContainer, 0, 0);
    const sentinel = f.own(new DropNode('tab', 'nested-empty')); sentinel.setAttribute('zen-empty-tab', 'true'); sentinel.setAttribute('pinned', 'true'); nested.groupContainer.appendChild(sentinel);
    const grandchild = f.addFolder('grandchild', nested.groupContainer, 0, 0);
    const leaf = f.own(new DropNode('tab', 'leaf')); leaf.setAttribute('pinned', 'true'); grandchild.groupContainer.appendChild(leaf);
    const {wrapper, tabs} = f.split(kind); f.host.gBrowser.selectedTabs = [f.source, ...tabs, f.second];
    if (position === 'bottom') f.duringNative(() => {
      for (const item of [f.source, wrapper, f.second]) f.folder.groupContainer.insertBefore(item, nested);
    });
    const manager = f.start(); f.dispatch();
    assert.deepEqual(f.order(), position === 'top' ? ['empty', 'source', 'split', 'second', 'nested'] : ['empty', 'nested', 'source', 'split', 'second']);
    assert.deepEqual(nested.groupContainer.children, [sentinel, grandchild]);
    assert.deepEqual(grandchild.groupContainer.children, [leaf]);
    assert.deepEqual(wrapper.children, tabs); assert.deepEqual(f.errors, []); manager.destroy();
  });
}

test('Essentials conversion stays native and direct addTabs/drag receives no placement', () => {
  const f = fixture(); f.source.setAttribute('zen-essential', 'true'); const manager = f.start();
  f.dispatch(f.item, 'drop'); assert.equal(f.nativeCalls(), 0); assert.equal(f.source.hasAttribute('zen-essential'), true);
  f.dispatch(); assert.equal(f.source.hasAttribute('zen-essential'), false); assert.equal(f.nativeCalls(), 1);
  f.folder.addTabs([f.last]); assert.deepEqual(f.order(), ['empty', 'source', 'second', 'last']);
  assert.equal(f.nativeCalls(), 2); manager.destroy();
});

test('similar items in other or nested menus never receive BZF placement', () => {
  const f = fixture(); const manager = f.start();
  const other = f.tabMenu.appendChild(f.own(new DropNode('menu', 'other')));
  const nested = f.menu.appendChild(f.own(new DropNode('menu', 'nested')));
  for (const parent of [other, nested]) {
    const item = parent.appendChild(f.own(new DropNode('menuitem')));
    item.setAttribute('class', 'context-zen-move-to-folder-item'); item._group = f.folder;
    f.dispatch(item);
  }
  assert.equal(f.calls.length, 0); assert.deepEqual(f.reads, []); manager.destroy();
});

for (const lifecycle of ['destroy', 'abort', 'already-aborted', 'abort-during-command']) test(`${lifecycle} releases placement listeners and pending snapshots`, () => {
  const f = fixture(); const signal = new AbortController();
  if (lifecycle === 'already-aborted') signal.abort();
  const manager = f.start(signal.signal); manager.start(signal.signal);
  if (lifecycle === 'destroy') {manager.destroy(); manager.destroy();}
  if (lifecycle === 'abort') signal.abort();
  if (lifecycle === 'abort-during-command') f.duringNative(() => signal.abort());
  f.dispatch(); assert.deepEqual(f.order(), ['empty', 'last', 'source', 'second']);
  assert.equal(f.menu.count(), 1); assert.equal(f.tabMenu.count(), 0); manager.destroy();
});

test('disconnected destination and unknown destination children leave native result alone', () => {
  for (const scenario of ['disconnect', 'unknown']) {
    const f = fixture();
    if (scenario === 'unknown') f.folder.groupContainer.appendChild(f.own(new DropNode('future-wrapper', 'unknown')));
    else f.duringNative(() => f.folder.remove());
    const manager = f.start(); f.dispatch(); assert.equal(f.calls.length, 0); manager.destroy();
  }
});

test('headless DOM dispatch orders capture, native command and placement without replacing the command',
  {skip:!process.env.BZF_PLAYWRIGHT_MODULE}, async () => {
    const {chromium} = createRequire(import.meta.url)(process.env.BZF_PLAYWRIGHT_MODULE);
    const browser = await chromium.launch({headless:true});
    try {
      const page = await browser.newPage(); await page.route('**/*', route => route.abort());
      const source = readFileSync(new URL('../scripts/better-zen-folders.uc.mjs', import.meta.url), 'utf8');
      const result = await page.evaluate(async ({source, commandBody}) => {
        const url = URL.createObjectURL(new Blob([source], {type:'text/javascript'}));
        const api = await import(url); URL.revokeObjectURL(url);
        if (!api.MovedTabsMenuManager) return {missing:true};
        document.body.innerHTML = '<menupopup id="tabContextMenu"><menu id="context_zenMoveToFolder"><menupopup><menuitem class="context-zen-move-to-folder-item"></menuitem></menupopup></menu></menupopup><zen-folder><div><tab id="old"></tab></div></zen-folder><tab id="one"></tab><tab id="two"></tab>';
        const folder = document.querySelector('zen-folder'), menu = document.querySelector('menu'), item = document.querySelector('menuitem');
        folder.isZenFolder = true; folder.groupContainer = folder.firstElementChild; item._group = folder;
        const one = document.getElementById('one'), two = document.getElementById('two'); one.multiselected = true;
        for (const tab of document.querySelectorAll('tab')) Object.defineProperty(tab, 'pinned', {get:() => tab.hasAttribute('pinned')});
        document.getElementById('old').setAttribute('pinned', 'true');
        const trace = [], gBrowser = {selectedTabs:[one, two], isTab:n => n?.localName === 'tab',
          moveTabBefore(n, anchor) {trace.push(`place:${n.id}`); anchor.before(n);},
          moveTabAfter(n, anchor) {trace.push(`place:${n.id}`); anchor.after(n);}};
        const TabContextMenu = {contextTab:one};
        folder.addTabs = tabs => {trace.push('native'); for (const tab of tabs) {folder.groupContainer.appendChild(tab); tab.setAttribute('pinned', 'true');} gBrowser.selectedTabs = [];};
        const original = folder.addTabs;
        const manager = new api.MovedTabsMenuManager({document, gBrowser, TabContextMenu, console}, {get:() => {trace.push('capture'); return 'top';}});
        manager.start();
        menu.addEventListener('command', new Function('gBrowser', 'TabContextMenu', `return event => {${commandBody}\n}`)(gBrowser, TabContextMenu));
        item.dispatchEvent(new Event('command', {bubbles:true}));
        const order = [...folder.groupContainer.children].map(n => n.id); manager.destroy();
        return {order, trace, original:folder.addTabs === original};
      }, {source, commandBody});
      assert.deepEqual(result.order, ['one', 'two', 'old']);
      assert.deepEqual(result.trace, ['capture', 'native', 'place:one', 'place:two']);
      assert.equal(result.original, true);
    } finally {await browser.close();}
  });
