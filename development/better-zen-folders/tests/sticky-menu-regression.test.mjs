import test from 'node:test';
import assert from 'node:assert/strict';
import {StickyFolderVisibilityManager, StickyStateStore} from '../scripts/better-zen-folders.uc.mjs';
import {FakeElement} from './fakes.mjs';

// Read-only native evidence: Zen 1.22.2b, build 20260915091052.
// omni.ja: global/elements/menu.js creates .menu-icon and inherits image -> srcset.
// global/menu.css (Windows) paints menuitem[checked] > .menu-icon, by PRESENCE.
// CMI FluentUI/Fluent-icons.css and ZenUI/Zen-icons.css hide that slot and paint
// menupopup > menuitem[type="checkbox"][checked]::before, also by presence.
// These tests exercise production menu code against that DOM contract; they
// do not claim to render Gecko, native XUL, or the CMI pseudo-element.
class MenuElement extends FakeElement {
  constructor(name, id = '') {
    super(name);
    this.id = id;
    this.styleProperties = new Map();
    this.style = {setProperty: (name, value) => this.styleProperties.set(name, value)};
    this.classList.remove = (...names) => names.forEach(name => this._classes.delete(name));
  }
  hasAttribute(name) { return this.attributes.has(name); }
  get nextSibling() {
    const siblings = this.parentNode?.children ?? [];
    return siblings[siblings.indexOf(this) + 1] ?? null;
  }
  get isConnected() { return !!this.parentNode; }
}

// Literal native order from browser.xhtml and ZenPinnedTabManager.mjs;
// Folder Colour is inserted after Change Icon by BZF's colour menu adapter.
const TAB_ORDER = ['context_zen-edit-tab-title', 'context_zen-edit-tab-icon',
  'appearance-separator', 'context_pinTab', 'context_unpinTab', 'context_duplicateTab'];
const FOLDER_ORDER = ['context_zenFolderRename', 'context_zenFolderChangeIcon',
  'better-zen-folders-folder-colour', 'appearance-separator',
  'context_zenFolderUnloadAll', 'context_zenFolderNewSubfolder',
  'context_zenChangeFolderSpace', 'context_zenFolderUnpack', 'context_zenFolderDelete'];

function fixture(kind, icons = true, order = kind === 'tab' ? TAB_ORDER : FOLDER_ORDER) {
  const root = new MenuElement('window');
  const menu = new MenuElement('menupopup', kind === 'tab' ? 'tabContextMenu' : 'zenFolderActions');
  root.appendChild(menu);
  for (const id of order) menu.appendChild(new MenuElement(id.endsWith('separator') ? 'menuseparator' : 'menuitem', id));
  const folder = new MenuElement('zen-folder', 'folder');
  folder.isZenFolder = true;
  root.appendChild(folder);
  const tab = new MenuElement('tab', 'tab');
  tab.group = folder;
  folder.appendChild(tab);
  const target = kind === 'tab' ? tab : folder;
  menu.triggerNode = target;
  const find = (node, id) => node.id === id ? node : node.children.map(child => find(child, id)).find(Boolean);
  const errors = [], writes = [], tabValues = new Map();
  let windowValue = '', failWrites = false;
  const save = value => { if (failWrites) throw Error('storage refused'); writes.push(value); };
  const host = {
    document: {getElementById: id => find(root, id), createXULElement: name => new MenuElement(name)},
    gBrowser: {isTab: node => node?.localName === 'tab'},
    TabContextMenu: {contextTab: tab},
    CustomEvent: class {},
    console: {error: (...args) => errors.push(args.at(-1))},
  };
  const manager = new StickyFolderVisibilityManager(host, {get: name => name === 'showFolderColourMenuIcon' ? icons : undefined});
  manager.store = new StickyStateStore({
    getId: node => node.id, isFolder: node => node.isZenFolder === true,
    getTabValue: node => tabValues.get(node) ?? '',
    setTabValue: (node, value) => { save(value); tabValues.set(node, value); },
    getWindowValue: () => windowValue,
    setWindowValue: value => { save(value); windowValue = value; },
  });
  // Projection needs a browser tabstrip; persistence and command handling stay real.
  manager.refresh = () => {};
  const commandId = `better-zen-folders-sticky-${kind}`;
  return {
    root, menu, target, manager, errors, writes, host, commandId,
    show: () => { manager.showMenu({target: menu}); return find(root, commandId); },
    order: () => menu.children.map(child => child.id),
    setIcons: value => { icons = value; },
    refuseWrites: () => { failWrites = true; },
  };
}

for (const kind of ['tab', 'folder']) {
  for (const icons of [true, false]) {
    test(`${kind}: native and CMI check selectors track off/on/off with icons ${icons}`, () => {
      const f = fixture(kind, icons);
      const command = f.show();
      assert.equal(command.getAttribute('type'), 'checkbox');
      assert.equal(command.getAttribute('autocheck'), 'false');
      assert.equal(command.hasAttribute('checked'), false, 'checked="false" still paints both native and CMI ticks');
      command.dispatch('command');
      assert.equal(f.manager.isSticky(f.target), true);
      assert.equal(command.getAttribute('checked'), 'true', 'sync the open item after the persisted toggle');
      assert.equal(f.show(), command);
      command.dispatch('command');
      assert.equal(f.manager.isSticky(f.target), false);
      assert.equal(command.hasAttribute('checked'), false);
      f.show();
      assert.equal(command.hasAttribute('checked'), false, 'reopening must not recreate the false-valued attribute');
      assert.equal(f.writes.length, 2, 'showing the menu never writes Sticky state');
    });
  }

  test(`${kind}: Sticky uses only a state check, never an icon that changes meaning`, () => {
    const f = fixture(kind);
    assert.equal(f.show().getAttribute('image'), null, 'off is an unchecked menu item, not a page icon');
    f.manager.setSticky(f.target, true);
    const command = f.show();
    f.setIcons(false);
    f.show();
    assert.equal(command.getAttribute('image'), null);
    // Installed menu.css displays the slot for .menuitem-iconic even without
    // [needsgutter]. BZF's generic :not([image]) rule must not hide this check.
    assert.equal(command.classList.contains('menuitem-iconic'), true);
    assert.equal(command.classList.contains('better-zen-folders-command-item'), false);
    assert.equal(command.getAttribute('checked'), 'true');
    assert.equal(command.styleProperties.get('--menu-image'), 'none', 'no inherited CMI background icon');
    f.setIcons(true);
    f.show();
    assert.equal(command.getAttribute('image'), null, 'decorative icon preference never replaces the state check');
    assert.equal(command.getAttribute('checked'), 'true');
  });

  test(`${kind}: Sticky follows appearance controls before the native separator and structural actions`, () => {
    const f = fixture(kind);
    const original = f.order();
    const before = kind === 'tab' ? 2 : 3;
    const command = f.show();
    const expected = [...original.slice(0, before), f.commandId, ...original.slice(before)];
    assert.deepEqual(f.order(), expected);
    // Reopening repairs a moved owned item and does not duplicate or reorder native items.
    f.menu.appendChild(command);
    f.show();
    f.show();
    assert.deepEqual(f.order(), expected);
    assert.equal(f.manager.decorations.size, 1);
  });

  test(`${kind}: missing appearance controls use the first native structural boundary`, () => {
    const order = kind === 'tab' ? ['context_unpinTab', 'context_duplicateTab']
      : ['context_zenFolderNewSubfolder', 'context_zenFolderDelete'];
    const f = fixture(kind, true, order);
    f.show();
    assert.deepEqual(f.order(), [f.commandId, ...order]);
  });

  test(`${kind}: failed persistence restores the check from stored state`, () => {
    const f = fixture(kind);
    f.manager.setSticky(f.target, true);
    const command = f.show();
    f.refuseWrites();
    command.dispatch('command');
    assert.equal(f.manager.isSticky(f.target), true);
    assert.equal(command.getAttribute('checked'), 'true');
    assert.match(f.errors[0].message, /storage refused/);
  });

  test(`${kind}: retargeting to an ineligible item clears the previous check and command target`, () => {
    const f = fixture(kind);
    f.manager.setSticky(f.target, true);
    const command = f.show();
    if (kind === 'tab') f.target.setAttribute('zen-essential', 'true');
    else f.menu.triggerNode = f.root;
    f.show();
    assert.equal(command.hidden, true);
    assert.equal(command.hasAttribute('checked'), false);
    assert.equal(command._bzfStickyTarget, null);
    command.dispatch('command');
    assert.equal(f.writes.length, 1);
  });
}

test('late Folder Colour insertion remains above Sticky on the next popup', () => {
  const f = fixture('folder', true, FOLDER_ORDER.filter(id => id !== 'better-zen-folders-folder-colour'));
  const command = f.show();
  const icon = f.host.document.getElementById('context_zenFolderChangeIcon');
  f.menu.insertBefore(new MenuElement('menuitem', 'better-zen-folders-folder-colour'), icon.nextSibling);
  f.show();
  assert.deepEqual(f.order().slice(0, 5), ['context_zenFolderRename', 'context_zenFolderChangeIcon',
    'better-zen-folders-folder-colour', command.id, 'appearance-separator']);
});

test('nested lookalike anchors are ignored and an empty popup has one stable Sticky item', () => {
  const f = fixture('tab', true, []);
  const nested = new MenuElement('menupopup', 'unrelated-submenu');
  nested.appendChild(new MenuElement('menuitem', 'context_zen-edit-tab-icon'));
  f.menu.appendChild(nested);
  f.show();
  f.show();
  assert.deepEqual(f.order(), ['unrelated-submenu', f.commandId]);
  assert.equal(nested.children.length, 1);
});
