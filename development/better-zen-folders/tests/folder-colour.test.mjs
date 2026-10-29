import test from "node:test";
import assert from "node:assert/strict";
import {makePresetBindingFixture} from './preset-binding.fixture.mjs';

import {
  FOLDER_COLOR_LEDGER_PREF,
  FolderColorManager,
  FolderColorMenuManager,
  MAX_FOLDER_COLOR_ENTRIES,
  createBrowserFolderColorAdapters,
  createBrowserFolderColorMenuAdapters,
  normalizeFolderColor,
} from "../scripts/better-zen-folders.uc.mjs";

class FakeEventTarget {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
  }
  removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener); }
  emit(type, event = {}) {
    event.type = type;
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

class FakeNode extends FakeEventTarget {
  constructor(localName, id = null, namespaceURI = null) {
    super();
    this.localName = localName;
    this.id = id;
    this.namespaceURI = namespaceURI;
    this.attributes = new Map();
    this.children = [];
    this.parentElement = null;
    this.hidden = false;
    this.disabled = false;
    this.styleProperties = new Map();
    this.style = {
      setProperty: (name, value) => this.styleProperties.set(name, value),
      removeProperty: name => this.styleProperties.delete(name),
    };
    this.classes = new Set();
    this.classList = {
      add: (...names) => names.forEach(name => this.classes.add(name)),
      remove: (...names) => names.forEach(name => this.classes.delete(name)),
      contains: name => this.classes.has(name),
    };
  }
  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name === "id") this.id = String(value);
    if (name === "class") {
      this.classes = new Set(String(value).split(/\s+/).filter(Boolean));
    }
  }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  removeAttribute(name) { this.attributes.delete(name); }
  toggleAttribute(name, force) {
    if (force) this.setAttribute(name, "true");
    else this.removeAttribute(name);
  }
  appendChild(child) {
    child.parentElement = this;
    this.children.push(child);
    return child;
  }
  after(node) {
    const index = this.parentElement.children.indexOf(this);
    node.parentElement = this.parentElement;
    this.parentElement.children.splice(index + 1, 0, node);
  }
  remove() {
    const index = this.parentElement?.children.indexOf(this) ?? -1;
    if (index >= 0) this.parentElement.children.splice(index, 1);
    this.parentElement = null;
  }
  openPopup(anchor, position, x, y) { this.openedAt = anchor; this.openingGeometry = {position, x, y}; }
  hidePopup() { this.hiddenByPopup = true; this.emit("popuphidden", { target: this }); }
  focus() { this.focused = true; }
  click() {
    this.clickCalls = (this.clickCalls ?? 0) + 1;
    this.emit("click", { target: this });
  }
}

function descendants(node) {
  return node.children.flatMap(child => [child, ...descendants(child)]);
}

function makeFolder(id, { live = false } = {}) {
  return { id, isZenFolder: true, isLiveFolder: live, isConnected: true };
}

function makeColorFixture({ raw = "", folders = [] } = {}) {
  let stored = raw;
  let now = 100;
  let mutationCallback = null;
  let ledgerCallback = null;
  const projections = new Map();
  const events = [];
  const writes = [];
  const warnings = [];
  const observer = {
    observing: false,
    disconnected: false,
    observe() { this.observing = true; },
    disconnect() { this.disconnected = true; },
  };
  const adapters = {
    readLedger: () => stored,
    writeLedger(value) { stored = value; writes.push(value); },
    addLedgerObserver(callback) { ledgerCallback = callback; },
    removeLedgerObserver(callback) {
      if (ledgerCallback === callback) ledgerCallback = null;
    },
    now: () => ++now,
    listFolders: () => folders,
    tabContainer: () => ({}),
    createMutationObserver(callback) {
      mutationCallback = callback;
      return observer;
    },
    getFolderId: folder => folder.id,
    isFolder: folder => folder?.isZenFolder === true,
    projectColor(folder, color) { projections.set(folder, color); },
    clearProjectedColor(folder) { projections.delete(folder); },
    dispatchColorChanged(folder, color) { events.push({ folder, color }); },
    warn: warning => warnings.push(String(warning)),
  };
  return {
    adapters,
    projections,
    events,
    writes,
    warnings,
    observer,
    mutate: () => mutationCallback?.([]),
    notifyLedger(value) { stored = value; ledgerCallback?.(); },
    hasLedgerObserver: () => ledgerCallback !== null,
    stored: () => stored,
  };
}

test("folder colours accept only normalized six-digit hex values", () => {
  assert.equal(normalizeFolderColor("#A1B2C3"), "#a1b2c3");
  assert.equal(normalizeFolderColor("#000000"), "#000000");
  for (const invalid of [null, "", "fff", "#fff", "#12345g", "red", "#000000; color:red"]) {
    assert.equal(normalizeFolderColor(invalid), null);
  }
  assert.equal(FOLDER_COLOR_LEDGER_PREF, "better-zen-folders.folder-colors.v1");
  assert.equal(MAX_FOLDER_COLOR_ENTRIES, 256);
});

test("malformed colour ledger fails closed and is replaced once", () => {
  const fixture = makeColorFixture({ raw: '{"version":1,"entries":[{"id":"x","color":"red"}]}' });
  const manager = new FolderColorManager(fixture.adapters);

  manager.start(new AbortController().signal);

  assert.equal(manager.getColor("x"), null);
  assert.equal(fixture.warnings.length, 1);
  assert.equal(fixture.writes.length, 1);
  assert.deepEqual(JSON.parse(fixture.stored()), { version: 1, entries: [] });
});

test("startup projects persisted colours onto regular and live folders", () => {
  const regular = makeFolder("regular");
  const live = makeFolder("live", { live: true });
  const raw = JSON.stringify({
    version: 1,
    entries: [
      { id: "regular", color: "#123456", updatedAt: 1 },
      { id: "live", color: "#abcdef", updatedAt: 2 },
    ],
  });
  const fixture = makeColorFixture({ raw, folders: [regular, live] });
  const manager = new FolderColorManager(fixture.adapters);

  manager.start(new AbortController().signal);

  assert.equal(manager.getColor(regular), "#123456");
  assert.equal(manager.getColor(live), "#abcdef");
  assert.equal(fixture.projections.get(regular), "#123456");
  assert.equal(fixture.projections.get(live), "#abcdef");
  assert.equal(fixture.observer.observing, true);
});

test("setting and resetting one folder colour persists and emits one scoped event", () => {
  const folder = makeFolder("folder-a");
  const fixture = makeColorFixture({ folders: [folder] });
  const manager = new FolderColorManager(fixture.adapters);
  manager.start(new AbortController().signal);

  assert.equal(manager.setColor(folder, "#ABCDEF"), true);
  assert.equal(manager.setColor(folder, "#abcdef"), false);
  assert.equal(manager.getColor(folder), "#abcdef");
  assert.equal(fixture.projections.get(folder), "#abcdef");
  assert.deepEqual(fixture.events, [{ folder, color: "#abcdef" }]);

  assert.equal(manager.clearColor(folder), true);
  assert.equal(manager.clearColor(folder), false);
  assert.equal(manager.getColor(folder), null);
  assert.equal(fixture.projections.has(folder), false);
  assert.deepEqual(fixture.events.at(-1), { folder, color: null });
  assert.deepEqual(JSON.parse(fixture.stored()), { version: 1, entries: [] });
});

test("colour ledger remains bounded and retains the most recently selected identities", () => {
  const fixture = makeColorFixture();
  const manager = new FolderColorManager(fixture.adapters);
  manager.start(new AbortController().signal);

  for (let index = 0; index < MAX_FOLDER_COLOR_ENTRIES + 3; index++) {
    manager.setColor(makeFolder(`folder-${index}`), "#123456");
  }

  const entries = JSON.parse(fixture.stored()).entries;
  assert.equal(entries.length, MAX_FOLDER_COLOR_ENTRIES);
  assert.equal(entries[0].id, "folder-3");
  assert.equal(entries.at(-1).id, `folder-${MAX_FOLDER_COLOR_ENTRIES + 2}`);
});

test("restore snapshots can roll a remapped folder colour back without losing prior identity", () => {
  const oldFolder = makeFolder("original");
  const remapped = makeFolder("remapped");
  const fixture = makeColorFixture({ folders: [oldFolder] });
  const manager = new FolderColorManager(fixture.adapters);
  manager.start(new AbortController().signal);
  manager.setColor(oldFolder, "#111111");

  const before = manager.captureLedgerState(remapped);
  manager.setColor(remapped, "#222222");
  manager.restoreLedgerState(remapped, before);

  assert.equal(manager.getColor(oldFolder), "#111111");
  assert.equal(manager.getColor(remapped), null);
});

test("mutation reconciliation projects newly restored folders and teardown removes only projections", () => {
  const folders = [];
  const raw = JSON.stringify({
    version: 1,
    entries: [{ id: "later", color: "#fedcba", updatedAt: 1 }],
  });
  const fixture = makeColorFixture({ raw, folders });
  const manager = new FolderColorManager(fixture.adapters);
  manager.start(new AbortController().signal);
  const later = makeFolder("later");
  folders.push(later);

  fixture.mutate();
  assert.equal(fixture.projections.get(later), "#fedcba");

  manager.destroy();
  manager.destroy();
  assert.equal(fixture.projections.has(later), false);
  assert.equal(fixture.observer.disconnected, true);
  assert.equal(manager.getColor("later"), "#fedcba");
});

test("browser adapters expose one shared DOM colour contract without tinting the inner icon", () => {
  let stored = "";
  const attributes = new Map();
  const properties = new Map();
  const events = [];
  const folder = {
    id: "folder-browser",
    isZenFolder: true,
    setAttribute: (name, value) => attributes.set(name, String(value)),
    removeAttribute: name => attributes.delete(name),
    style: {
      setProperty: (name, value) => properties.set(name, value),
      removeProperty: name => properties.delete(name),
    },
    dispatchEvent: event => events.push(event),
  };
  class FakeCustomEvent {
    constructor(type, options) {
      this.type = type;
      Object.assign(this, options);
    }
  }
  class FakeMutationObserver {
    constructor(callback) { this.callback = callback; }
  }
  const tabContainer = {};
  const adapters = createBrowserFolderColorAdapters({
    CustomEvent: FakeCustomEvent,
    MutationObserver: FakeMutationObserver,
    Services: {
      prefs: {
        getStringPref: (_property, fallback) => stored || fallback,
        setStringPref: (_property, value) => { stored = value; },
      },
    },
    console: { warn() {} },
    document: { querySelectorAll: () => [folder] },
    gBrowser: { tabContainer },
  });

  assert.equal(adapters.readLedger(), "");
  adapters.writeLedger('{"version":1,"entries":[]}');
  assert.equal(stored, '{"version":1,"entries":[]}');
  assert.deepEqual(adapters.listFolders(), [folder]);
  assert.equal(adapters.tabContainer(), tabContainer);
  assert.equal(adapters.getFolderId(folder), "folder-browser");

  adapters.projectColor(folder, "#123456");
  assert.equal(attributes.get("data-better-zen-folders-color"), "#123456");
  assert.equal(properties.get("--better-zen-folders-custom-color"), "#123456");
  assert.equal(properties.get("--better-zen-folders-folder-color"), "#123456");
  assert.equal(properties.has("color"), false);

  adapters.dispatchColorChanged(folder, "#123456");
  assert.equal(events[0].type, "BetterZenFolderColorChanged");
  assert.equal(events[0].bubbles, true);
  assert.deepEqual(events[0].detail, { color: "#123456" });

  adapters.clearProjectedColor(folder);
  assert.equal(attributes.has("data-better-zen-folders-color"), false);
  assert.equal(properties.has("--better-zen-folders-custom-color"), false);
  assert.equal(properties.has("--better-zen-folders-folder-color"), false);
});

test("external colour preference changes project across windows and emit scoped events", () => {
  const folder = makeFolder("shared-folder");
  const fixture = makeColorFixture({ folders: [folder] });
  const manager = new FolderColorManager(fixture.adapters);
  manager.start(new AbortController().signal);

  fixture.notifyLedger(JSON.stringify({
    version: 1,
    entries: [{ id: folder.id, color: "#445566", updatedAt: 10 }],
  }));

  assert.equal(manager.getColor(folder), "#445566");
  assert.equal(fixture.projections.get(folder), "#445566");
  assert.deepEqual(fixture.events, [{ folder, color: "#445566" }]);

  fixture.notifyLedger('{"version":1,"entries":[]}');
  assert.equal(manager.getColor(folder), null);
  assert.equal(fixture.projections.has(folder), false);
  assert.deepEqual(fixture.events.at(-1), { folder, color: null });

  manager.destroy();
  assert.equal(fixture.hasLedgerObserver(), false);
});

test("an unreadable colour ledger cannot crash startup when its repair write also fails", () => {
  const warnings = [];
  const manager = new FolderColorManager({
    readLedger: () => "not-json",
    writeLedger: () => { throw new Error("storage unavailable"); },
    listFolders: () => [],
    tabContainer: () => null,
    warn: warning => warnings.push(String(warning)),
  });

  assert.doesNotThrow(() => manager.start(new AbortController().signal));
  assert.equal(manager.getColor("anything"), null);
  assert.equal(warnings.some(warning => warning.includes("storage unavailable")), true);
});

test("folder colour menu scopes apply and reset to the folder that opened it", () => {
  const menu = new FakeEventTarget();
  const menuItem = {};
  const folder = makeFolder("folder-menu");
  const colors = new Map([[folder.id, "#112233"]]);
  const pickerCalls = [];
  const states = [];
  let removed = 0;
  const colorManager = {
    getColor: current => colors.get(current.id) ?? null,
    setColor(current, color) { colors.set(current.id, color); return true; },
    clearColor(current) { colors.delete(current.id); return true; },
  };
  const manager = new FolderColorMenuManager({
    menuTarget: () => menu,
    ensureMenuItem: () => menuItem,
    getContextFolder: event => event.folder ?? null,
    setMenuItemState: (_item, state) => states.push(state),
    openPicker: (current, color, actions) => pickerCalls.push({ current, color, actions }),
    removeOwnedUi: () => { removed++; },
  }, colorManager);
  manager.start(new AbortController().signal);

  menu.emit("popupshowing", { folder });
  const command = {
    target: menuItem,
    preventDefaultCalled: false,
    stopPropagationCalled: false,
    preventDefault() { this.preventDefaultCalled = true; },
    stopPropagation() { this.stopPropagationCalled = true; },
  };
  menu.emit("command", command);

  assert.deepEqual(states.at(-1), { folder, color: "#112233" });
  assert.equal(pickerCalls[0].current, folder);
  assert.equal(pickerCalls[0].color, "#112233");
  assert.equal(command.preventDefaultCalled, true);
  assert.equal(command.stopPropagationCalled, true);

  pickerCalls[0].actions.apply("#abcdef");
  assert.equal(colors.get(folder.id), "#abcdef");
  pickerCalls[0].actions.reset();
  assert.equal(colors.has(folder.id), false);

  menu.emit("popuphidden", { target: menu });
  menu.emit("command", command);
  assert.equal(pickerCalls.length, 1);

  manager.destroy();
  manager.destroy();
  assert.equal(removed, 1);
});

test("folder colour menu remains inert for non-folder context and abort teardown", () => {
  const menu = new FakeEventTarget();
  const menuItem = {};
  const states = [];
  let opened = 0;
  let removed = 0;
  const controller = new AbortController();
  const manager = new FolderColorMenuManager({
    menuTarget: () => menu,
    ensureMenuItem: () => menuItem,
    getContextFolder: () => null,
    setMenuItemState: (_item, state) => states.push(state),
    openPicker: () => { opened++; },
    removeOwnedUi: () => { removed++; },
  }, { getColor: () => null });
  manager.start(controller.signal);

  menu.emit("popupshowing", {});
  menu.emit("command", { target: menuItem });
  assert.deepEqual(states.at(-1), { folder: null, color: null });
  assert.equal(opened, 0);

  controller.abort();
  assert.equal(manager.destroyed, true);
  assert.equal(removed, 1);
});

test("folder colour menu icon preference updates immediately without removing the action", () => {
  const menu = new FakeEventTarget();
  const menuItem = {};
  const folder = makeFolder("menu-icon-preference");
  const visibility = [];
  let opened = 0;
  let subscriber = null;
  let unsubscribed = 0;
  const preferences = {
    get: name => name === "commandIconMode" ? "mod" : undefined,
    subscribe(name, callback) {
      assert.equal(name, "commandIconMode");
      subscriber = callback;
      return () => { subscriber = null; unsubscribed++; };
    },
  };
  const manager = new FolderColorMenuManager({
    preferences,
    menuTarget: () => menu,
    ensureMenuItem: () => menuItem,
    getContextFolder: event => event.folder ?? null,
    setMenuItemState() {},
    setMenuItemIconMode: (_item, mode) => visibility.push(mode),
    openPicker: () => { opened++; },
    removeOwnedUi() {},
  }, { getColor: () => null });
  manager.start(new AbortController().signal);

  assert.deepEqual(visibility, ["mod"]);
  subscriber("off");
  assert.deepEqual(visibility, ["mod", "off"]);
  assert.equal(manager.menuItem, menuItem);
  menu.emit("popupshowing", { folder });
  menu.emit("command", {
    target: menuItem,
    preventDefault() {},
    stopPropagation() {},
  });
  assert.equal(opened, 1);

  manager.destroy();
  assert.equal(unsubscribed, 1);
});

test("browser colour-menu adapter installs one owned immediate-action picker", () => {
  const menu = new FakeNode("menupopup", "zenFolderActions");
  const iconItem = menu.appendChild(new FakeNode("menuitem", "context_zenFolderChangeIcon"));
  const popupSet = new FakeNode("popupset", "mainPopupSet");
  const nodesById = new Map([
    [menu.id, menu],
    [iconItem.id, iconItem],
    [popupSet.id, popupSet],
  ]);
  const document = {
    documentElement: new FakeNode("window", "root"),
    getElementById: id => nodesById.get(id)
      ?? descendants(menu).find(node => node.id === id)
      ?? descendants(popupSet).find(node => node.id === id)
      ?? null,
    createXULElement: name => new FakeNode(name, null, "xul"),
    createElementNS: (namespace, name) => new FakeNode(name, null, namespace),
  };
  const adapters = createBrowserFolderColorMenuAdapters({
    document,
    gBrowser: { isTabGroupLabel: () => false },
    Services: {prompt:{prompt:(_host,_title,_label,value)=>{value.value="#abcdef";return true;}}},
  });

  const item = adapters.ensureMenuItem();
  assert.equal(adapters.ensureMenuItem(), item);
  assert.equal(menu.children.indexOf(item), menu.children.indexOf(iconItem) + 1);
  assert.equal(item.getAttribute("label"), "Folder Colour…");
  assert.equal(
    item.getAttribute("image"),
    "chrome://browser/skin/zen-icons/selectable/palette.svg",
  );
  adapters.setMenuItemIconMode(item, "off");
  assert.equal(item.styleProperties.has("--menu-image"), false, "Off must not suppress external icons");
  assert.equal(item.classList.contains("menuitem-iconic"), false);
  assert.equal(item.getAttribute("image"), null);
  adapters.setMenuItemIconMode(item, "mod");
  assert.equal(item.classList.contains("menuitem-iconic"), true);
  assert.equal(
    item.getAttribute("image"),
    "chrome://browser/skin/zen-icons/selectable/palette.svg",
  );

  const folder = makeFolder("picker-folder");
  folder.label = "Picker folder";
  folder.icon = new FakeNode("div", "picker-folder-icon");
  adapters.setMenuItemState(item, { folder, color: "#123456" });
  assert.equal(item.hidden, false);
  assert.equal(
    item.getAttribute("data-better-zen-folders-colour-marker"),
    "custom",
  );
  assert.equal(item.styleProperties.get("--better-zen-folders-menu-folder-color"), "#123456");

  adapters.setMenuItemState(item, { folder, color: null });
  assert.equal(
    item.getAttribute("data-better-zen-folders-colour-marker"),
    "default",
  );
  assert.equal(item.styleProperties.has("--better-zen-folders-menu-folder-color"), false);

  adapters.setMenuItemState(item, { folder, color: "#123456" });

  const calls = [];
  adapters.openPicker(folder, "#123456", {
    apply: color => calls.push(["apply", color]),
    reset: () => calls.push(["reset"]),
  });
  const panel = descendants(popupSet).find(node =>
    node.getAttribute("class") === "better-zen-folders-colour-panel"
  );
  const input = descendants(panel).find(node => node.localName === "input");
  const commands = descendants(panel).filter(node =>
    node.getAttribute("data-better-zen-folders-colour-action") !== null
  );
  const swatches = descendants(panel).filter(node =>
    node.getAttribute("data-better-zen-folders-colour-swatch") !== null
  );
  assert.equal(panel.openedAt, folder.icon);
  assert.deepEqual(panel.openingGeometry, {position: "after_start", x: 0, y: 16},
    "keep the popup shadow clear of the selected folder artwork");
  assert.equal(input.value, "#123456");
  assert.equal(
    commands.every(button => button.namespaceURI === "http://www.w3.org/1999/xhtml"),
    true,
  );
  assert.equal(commands.every(button => button.getAttribute("type") === "button"), true);
  assert.deepEqual(
    commands.map(button => button.textContent),
    ["Custom Colour…", "Reset to Default"],
  );
  assert.equal(
    descendants(panel).some(node => ["Apply", "Cancel"].includes(node.textContent)),
    false,
  );
  assert.equal(commands[1].disabled, false);
  panel.emit("popupshown", { target: panel });
  assert.equal(swatches[0].focused, true);

  commands[0].emit("click", { target: commands[0] });
  assert.equal(input.clickCalls ?? 0, 0);
  input.value = "#abcdef";
  input.emit("change", { target: input });
  assert.deepEqual(calls, [["apply", "#abcdef"]]);

  adapters.openPicker(folder, "#abcdef", {
    apply: color => calls.push(["apply", color]),
    reset: () => calls.push(["reset"]),
  });
  commands[1].emit("click", { target: commands[1] });
  assert.deepEqual(calls.at(-1), ["reset"]);

  adapters.openPicker(folder, null, {
    apply: color => calls.push(["apply", color]),
    reset: () => calls.push(["reset"]),
  });
  assert.equal(commands[1].disabled, true);

  adapters.removeOwnedUi(item);
  assert.equal(menu.children.includes(item), false);
  assert.equal(popupSet.children.includes(panel), false);
});

test("retargeted native folder popup resolves its trigger for Folder Colour", () => {
  const folder = makeFolder("popup-folder");
  const menu = new FakeNode("menupopup", "zenFolderActions");
  const trigger = {closest: selector => selector === "zen-folder" ? folder : null};
  menu.triggerNode = trigger;
  const adapters = createBrowserFolderColorMenuAdapters({document: {}, gBrowser: {isTabGroupLabel: () => false}});
  assert.equal(adapters.getContextFolder({target: menu, explicitOriginalTarget: menu}), folder);
});

test("browser colour picker presents one selected swatch row and applies immediately", () => {
  const menu = new FakeNode("menupopup", "zenFolderActions");
  menu.appendChild(new FakeNode("menuitem", "context_zenFolderChangeIcon"));
  const popupSet = new FakeNode("popupset", "mainPopupSet");
  const document = {
    documentElement: new FakeNode("window", "root"),
    getElementById: id => [menu, popupSet, ...descendants(menu), ...descendants(popupSet)]
      .find(node => node.id === id) ?? null,
    createXULElement: name => new FakeNode(name, null, "xul"),
    createElementNS: (namespace, name) => new FakeNode(name, null, namespace),
  };
  const adapters = createBrowserFolderColorMenuAdapters({
    document,
    gBrowser: { isTabGroupLabel: () => false },
    Services: {prompt:{prompt:(_host,_title,_label,value)=>{value.value="#7c3aed";return true;}}},
  });
  const folder = makeFolder("swatch-folder");
  folder.icon = new FakeNode("div", "swatch-folder-icon");
  const calls = [];

  adapters.openPicker(folder, "#9b79ea", {
    apply: color => calls.push(["apply", color]),
    reset: () => calls.push(["reset"]),
  });
  const panel = descendants(popupSet).find(node =>
    node.getAttribute("class") === "better-zen-folders-colour-panel"
  );
  const customButton = descendants(panel).find(node =>
    node.getAttribute("data-better-zen-folders-colour-action") === "custom"
  );
  assert.ok(customButton);
  assert.equal(customButton.textContent, "Custom Colour…");
  assert.equal(customButton.namespaceURI, "http://www.w3.org/1999/xhtml");
  const customPreview = customButton.children.find(node =>
    node.getAttribute("class") === "better-zen-folders-colour-custom-preview"
  );
  assert.ok(customPreview);
  assert.equal(customPreview.namespaceURI, "http://www.w3.org/1999/xhtml");
  assert.equal(customPreview.getAttribute("aria-hidden"), "true");
  const presetGroup = descendants(panel).find(node =>
    node.getAttribute("class") === "better-zen-folders-colour-swatches"
  );
  assert.equal(presetGroup.getAttribute("role"), "group");
  assert.equal(presetGroup.getAttribute("aria-label"), "Folder colour presets");
  const swatches = descendants(panel).filter(node =>
    node.getAttribute("data-better-zen-folders-colour-swatch") !== null
  );
  assert.equal(swatches.length, 8);
  assert.equal(
    swatches.every(node => node.namespaceURI === "http://www.w3.org/1999/xhtml"),
    true,
  );
  assert.deepEqual(
    swatches.map(node => node.getAttribute("aria-pressed")),
    ["false", "false", "false", "false", "false", "false", "true", "false"],
  );
  assert.equal(
    swatches[6].getAttribute("data-better-zen-folders-colour-selected"),
    "true",
  );
  assert.equal(
    panel.styleProperties.get("--better-zen-folders-picker-color"),
    "#9b79ea",
  );
  panel.emit("popupshown", { target: panel });
  assert.equal(swatches[6].focused, true);
  swatches[5].emit("click", { target: swatches[5] });
  assert.deepEqual(calls.at(-1), ["apply", "#5f95eb"]);
  assert.equal(panel.hiddenByPopup, true);

  adapters.openPicker(folder, null, {
    apply: color => calls.push(["apply", color]),
    reset: () => calls.push(["reset"]),
  });
  const input = descendants(panel).find(node => node.localName === "input");
  assert.equal(
    panel.styleProperties.get("--better-zen-folders-picker-color"),
    "#808080",
  );
  customButton.emit("click", { target: customButton });
  assert.equal(input.clickCalls ?? 0, 0);
  panel.emit("popuphidden", { target: panel });
  input.value = "#7c3aed";
  input.emit("change", { target: input });
  assert.deepEqual(calls.at(-1), ["apply", "#7c3aed"]);
});

test("preset choices are lighter and less saturated, apply their exact swatch and never rewrite a saved colour on open", () => {
  const popupSet = new FakeNode("popupset", "mainPopupSet");
  const document = {
    documentElement: new FakeNode("window", "root"),
    getElementById: id => [popupSet, ...descendants(popupSet)].find(node => node.id === id) ?? null,
    createXULElement: name => new FakeNode(name, null, "xul"),
    createElementNS: (namespace, name) => new FakeNode(name, null, namespace),
  };
  const adapter = createBrowserFolderColorMenuAdapters({document});
  const folder = makeFolder("palette"); folder.icon = new FakeNode("div");
  const writes = [], actions = {apply: value => writes.push(value), reset: () => writes.push(null)};
  adapter.openPicker(folder, "#8b5cf6", actions);
  const panel = descendants(popupSet).find(node => node.getAttribute("class") === "better-zen-folders-colour-panel");
  const swatches = descendants(panel).filter(node => node.getAttribute("data-better-zen-folders-colour-swatch") !== null);
  const old = ["#ef4444", "#f97316", "#eab308", "#22c55e", "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899"];
  const dull = ["#df8585", "#e5ab7f", "#dbc77a", "#80c69a", "#75c2cf", "#82a7df", "#ab96de", "#db91b8"];
  const hsl = hex => {
    const rgb = hex.slice(1).match(/../g).map(x => parseInt(x,16)/255);
    const min = Math.min(...rgb), max = Math.max(...rgb), l = (min+max)/2;
    return {l, s: (max-min)/(1-Math.abs(2*l-1))};
  };
  assert.equal(swatches.length,8);
  for(let i=0;i<8;i++) {
    const value = swatches[i].getAttribute("data-better-zen-folders-colour-swatch"), current = hsl(value), previous = hsl(old[i]);
    assert.ok(current.l > previous.l, `preset ${i} is lighter`);
    assert.ok(current.s < previous.s, `preset ${i} is softer`);
    assert.ok(current.s > hsl(dull[i]).s, `preset ${i} regains colour from the dull palette`);
    assert.ok(current.l < hsl(dull[i]).l, `preset ${i} sits between the two palettes`);
    assert.ok(current.l < 0.8, 'not an extremely pale pastel');
    assert.equal(swatches[i].styleProperties.get("--better-zen-folders-swatch-color"), value);
  }
  assert.deepEqual(writes,[]);
  assert.equal(panel.styleProperties.get("--better-zen-folders-picker-color"),"#8b5cf6",'old saved colour stays exact');
  for(const swatch of swatches) {
    adapter.openPicker(folder,"#8b5cf6",actions);
    swatch.emit("click",{target:swatch});
    assert.equal(writes.at(-1),swatch.getAttribute("data-better-zen-folders-colour-swatch"));
  }
});

test("custom presets refresh a cached picker without recolouring saved folders and apply the displayed value", () => {
  const popupSet=new FakeNode('popupset','mainPopupSet');
  const document={documentElement:new FakeNode('window'),
    getElementById:id=>[popupSet,...descendants(popupSet)].find(n=>n.id===id)??null,
    createXULElement:name=>new FakeNode(name,null,'xul'),
    createElementNS:(ns,name)=>new FakeNode(name,null,ns)};
  const values={customPaletteEnabled:false,palette1:'#abcdef'};
  const adapters=createBrowserFolderColorMenuAdapters({document},{get:n=>values[n]});
  const folder=makeFolder('preserved'),writes=[],actions={apply:c=>writes.push(c),reset(){}};
  adapters.openPicker(folder,'#123456',actions);
  const first=descendants(popupSet).find(n=>n.getAttribute('data-better-zen-folders-colour-swatch'));
  assert.equal(first.getAttribute('data-better-zen-folders-colour-swatch'),'#e76565');
  values.customPaletteEnabled=true;adapters.openPicker(folder,'#123456',actions);
  assert.deepEqual(writes,[]);assert.equal(first.getAttribute('data-better-zen-folders-colour-swatch'),'#abcdef');
  assert.equal(first.getAttribute('aria-label'),'Swatch 1 folder colour');
  first.emit('click');assert.deepEqual(writes,['#abcdef']);
  values.customPaletteEnabled=false;adapters.openPicker(folder,'#123456',actions);
  assert.equal(first.getAttribute('data-better-zen-folders-colour-swatch'),'#e76565');
  first.emit('click');assert.deepEqual(writes,['#abcdef','#e76565']);
});

test('an open picker follows external colour, same-colour preset and reset changes, then releases its listener',t=>{
 const f=makePresetBindingFixture(t),folder=f.add('shared'),a=f.start(),b=f.start();
 const root=new FakeNode('window'),popupSet=root.appendChild(new FakeNode('popupset','mainPopupSet'));
 Object.assign(f.host.document,{
  documentElement:root,
  getElementById:id=>[popupSet,...descendants(popupSet)].find(n=>n.id===id)??null,
  createXULElement:name=>new FakeNode(name,null,'xul'),
  createElementNS:(ns,name)=>new FakeNode(name,null,ns),
 });
 const adapter=createBrowserFolderColorMenuAdapters(f.host,f.preferences);t.after(()=>adapter.removeOwnedUi(null));
 a.setPresetColor(folder,4);
 const actions={read:()=>a.getColor(folder),readPreset:()=>a.getPresetIndex(folder),reset:()=>a.clearColor(folder)};
 adapter.openPicker(folder,a.getColor(folder),actions);
 const panel=descendants(popupSet).find(n=>n.localName==='panel');
 const swatches=descendants(panel).filter(n=>n.getAttribute('data-better-zen-folders-colour-swatch'));
 const reset=descendants(panel).find(n=>n.getAttribute('data-better-zen-folders-colour-action')==='reset');
 const selected=()=>swatches.findIndex(n=>n.getAttribute('aria-pressed')==='true')+1;
 b.setPresetColor(folder,6);assert.equal(selected(),6);assert.equal(reset.disabled,false);
 f.change('custom-palette-enabled',true);f.change('palette-4','#5f95eb');
 b.setPresetColor(folder,4);assert.equal(a.getColor(folder),'#5f95eb');assert.equal(selected(),4,'same-colour binding changes still refresh selection');
 b.clearColor(folder);assert.equal(selected(),0);assert.equal(reset.disabled,true);
 assert.equal(panel.styleProperties.get('--better-zen-folders-picker-color'),'#808080');
 b.setPresetColor(folder,6);assert.equal(selected(),6);
 panel.hidePopup();b.setPresetColor(folder,4);assert.equal(selected(),6,'a closed picker no longer listens to the old folder');
 adapter.openPicker(folder,a.getColor(folder),actions);assert.equal(selected(),4);
 adapter.removeOwnedUi(null);b.setPresetColor(folder,6);assert.equal(selected(),4,'teardown releases the active folder listener');
});

test("native custom picker ignores preview and Cancel, and applies only a changed completion", () => {
  const popupSet = new FakeNode("popupset", "mainPopupSet");
  const document = {
    documentElement: new FakeNode("window", "root"),
    getElementById: id => [popupSet, ...descendants(popupSet)].find(node => node.id === id) ?? null,
    createXULElement: name => new FakeNode(name, null, "xul"),
    createElementNS: (ns, name) => new FakeNode(name, null, ns),
  };
  let callback;
  let initial;
  const native = {init: (context, title, color) => { initial = color; }, open: cb => { callback = cb; }};
  const host = {document, browsingContext: {},
    Cc: {"@mozilla.org/colorpicker;1": {createInstance: () => native}}, Ci: {nsIColorPicker: {}},
  };
  const adapters = createBrowserFolderColorMenuAdapters(host);
  const applied = [];
  const folder = makeFolder("native-picker");
  const open = color => {
    adapters.openPicker(folder, color, {apply: value => applied.push(value), reset() {}});
    descendants(popupSet).find(node => node.getAttribute("data-better-zen-folders-colour-action") === "custom").click();
  };
  open("#22c55e");
  assert.equal(initial, "#22c55e");
  callback.update("#008040");
  callback.done("#22c55e"); // Windows Cancel returns the initial colour.
  assert.deepEqual(applied, []);
  assert.deepEqual(host.__betterZenFoldersColourDiagnostics?.map(record=>[record.phase,record.returnedColor]),
    [["pre-panel",null],["open",null],["preview","#008040"],["completion","#22c55e"],["unchanged",null]]);
  open(null);
  callback.update("#000080");
  callback.done(""); // Other backends can signal unchanged via empty completion.
  assert.deepEqual(applied, []);
  open("#22c55e");
  callback.update("#ff0000");
  callback.done("#abcdef");
  assert.deepEqual(applied, ["#abcdef"]);
  open("#abcdef");
  adapters.removeOwnedUi(null);
  callback.done("#123456");
  assert.deepEqual(applied, ["#abcdef"]);
});

test("component aliases and docshell context use the native picker, never HTML input change", () => {
  const popupSet = new FakeNode("popupset", "mainPopupSet");
  const document = {
    documentElement:new FakeNode("window", "root"),
    getElementById:id=>[popupSet,...descendants(popupSet)].find(n=>n.id===id)??null,
    createXULElement:name=>new FakeNode(name,null,"xul"),
    createElementNS:(ns,name)=>new FakeNode(name,null,ns),
  };
  let callback;
  const context = {};
  const native = {init:(bc,title,color)=>{assert.equal(bc,context);assert.equal(color,"#22c55e");},open:cb=>{callback=cb;}};
  const adapters = createBrowserFolderColorMenuAdapters({document,docShell:{browsingContext:context},
    Components:{classes:{"@mozilla.org/colorpicker;1":{createInstance:()=>native}},interfaces:{nsIColorPicker:{}}},
  });
  const writes=[];
  adapters.openPicker(makeFolder("alias"),"#22c55e",{apply:color=>writes.push(color),reset(){}});
  descendants(popupSet).find(n=>n.getAttribute("data-better-zen-folders-colour-action")==="custom").click();
  assert.ok(callback,"native route must resolve aliases and docshell");
  callback.update("#006020"); callback.done("#22c55e");
  const input=descendants(popupSet).find(n=>n.localName==="input");
  input.value="#006020"; input.emit("change",{target:input});
  assert.deepEqual(writes,[]);
});

test("unavailable native picker requires explicit prompt acceptance; Cancel cannot save sampled colour", () => {
  const popupSet=new FakeNode("popupset","mainPopupSet");
  const document={documentElement:new FakeNode("window","root"),
    getElementById:id=>[popupSet,...descendants(popupSet)].find(n=>n.id===id)??null,
    createXULElement:name=>new FakeNode(name,null,"xul"),createElementNS:(ns,name)=>new FakeNode(name,null,ns)};
  let accepted=false, prompts=0;
  const adapters=createBrowserFolderColorMenuAdapters({document,Services:{prompt:{prompt:(win,title,label,value)=>{
    prompts++;value.value="#123456";return accepted;
  }}}});
  const writes=[];
  const open=()=>{
    adapters.openPicker(makeFolder("fallback"),"#22c55e",{apply:c=>writes.push(c),reset(){}});
    descendants(popupSet).find(n=>n.getAttribute("data-better-zen-folders-colour-action")==="custom").click();
  };
  open(); assert.equal(prompts,1);assert.deepEqual(writes,[]);
  accepted=true;open();assert.deepEqual(writes,["#123456"]);
});
