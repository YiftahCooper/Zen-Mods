import test from "node:test";
import assert from "node:assert/strict";

import {
  FolderIconIntegrityManager,
  SubfolderCreationManager,
  createBrowserFolderIconIntegrityAdapters,
  createBrowserSubfolderCreationAdapters,
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

function makePreferences(initial = "bottom") {
  let value = initial;
  let subscriber = null;
  return {
    preferences: {
      get: name => name === "subfolderPosition" ? value : undefined,
      subscribe(name, callback) {
        assert.equal(name, "subfolderPosition");
        subscriber = callback;
        return () => { subscriber = null; };
      },
    },
    set(next) { value = next; subscriber?.(next); },
  };
}

test("subfolder command uses the selected top or bottom preference and blocks Zen's duplicate", () => {
  const menu = new FakeEventTarget();
  const item = { id: "context_zenFolderNewSubfolder" };
  const parent = { id: "parent", isZenFolder: true };
  const calls = [];
  const preferences = makePreferences("bottom");
  const manager = new SubfolderCreationManager({
    ...preferences,
    menuTarget: () => menu,
    getContextFolder: event => event.folder ?? null,
    isCreateCommand: event => event.target === item,
    createSubfolder: (folder, position) => calls.push([folder, position]),
  });
  manager.start(new AbortController().signal);

  menu.emit("popupshowing", { target: menu, folder: parent });
  const bottomCommand = {
    target: item,
    preventDefault() { this.prevented = true; },
    stopPropagation() { this.stopped = true; },
  };
  menu.emit("command", bottomCommand);
  assert.deepEqual(calls, [[parent, "bottom"]]);
  assert.equal(bottomCommand.prevented, true);
  assert.equal(bottomCommand.stopped, true);

  preferences.set("top");
  menu.emit("popupshowing", { target: menu, folder: parent });
  menu.emit("command", {
    target: item,
    preventDefault() {},
    stopPropagation() {},
  });
  assert.deepEqual(calls.at(-1), [parent, "top"]);

  menu.emit("command", { target: { id: "unrelated" } });
  assert.equal(calls.length, 2);
});

test("icon integrity repairs only a missing native SVG and observes later folders", () => {
  const missing = { id: "missing", isZenFolder: true, hasIcon: false };
  const existing = { id: "existing", isZenFolder: true, hasIcon: true };
  const folders = [missing, existing];
  const repairs = [];
  let mutationCallback = null;
  const observer = { disconnected: false, observe() {}, disconnect() { this.disconnected = true; } };
  const manager = new FolderIconIntegrityManager({
    listFolders: () => folders,
    tabContainer: () => ({}),
    createMutationObserver(callback) { mutationCallback = callback; return observer; },
    isFolder: folder => folder?.isZenFolder === true,
    hasNativeIcon: folder => folder.hasIcon,
    repairNativeIcon(folder) { folder.hasIcon = true; repairs.push(folder.id); return true; },
  });
  const controller = new AbortController();
  manager.start(controller.signal);

  assert.deepEqual(repairs, ["missing"]);
  const later = { id: "later", isZenFolder: true, hasIcon: false };
  folders.push(later);
  mutationCallback();
  assert.deepEqual(repairs, ["missing", "later"]);

  controller.abort();
  assert.equal(observer.disconnected, true);
});

test("folder-created repair waits for Zen's connected callback before deciding an icon is missing", () => {
  const eventTarget = new FakeEventTarget();
  const folder = { id: "during-connect", isZenFolder: true, hasIcon: false };
  const scheduled = [];
  const repairs = [];
  const manager = new FolderIconIntegrityManager({
    listFolders: () => [],
    eventTarget: () => eventTarget,
    tabContainer: () => null,
    scheduleAfterFolderCreate: callback => scheduled.push(callback),
    isFolder: current => current?.isZenFolder === true,
    hasNativeIcon: current => current.hasIcon,
    repairNativeIcon(current) {
      current.hasIcon = true;
      repairs.push(current.id);
      return true;
    },
  });
  manager.start(new AbortController().signal);

  eventTarget.emit("TabGroupCreate", { target: folder });
  assert.deepEqual(repairs, []);
  assert.equal(scheduled.length, 1);

  // ZenFolder.connectedCallback appends its own SVG after TabGroupCreate.
  folder.hasIcon = true;
  scheduled.shift()();
  assert.deepEqual(repairs, []);
});

test("deferred folder-created repair still restores a genuinely missing direct icon once", () => {
  const eventTarget = new FakeEventTarget();
  const folder = { id: "still-missing", isZenFolder: true, hasIcon: false };
  const scheduled = [];
  const repairs = [];
  const manager = new FolderIconIntegrityManager({
    listFolders: () => [],
    eventTarget: () => eventTarget,
    tabContainer: () => null,
    scheduleAfterFolderCreate: callback => scheduled.push(callback),
    isFolder: current => current?.isZenFolder === true,
    hasNativeIcon: current => current.hasIcon,
    repairNativeIcon(current) {
      current.hasIcon = true;
      repairs.push(current.id);
      return true;
    },
  });
  manager.start(new AbortController().signal);

  eventTarget.emit("TabGroupCreate", { target: folder });
  eventTarget.emit("TabGroupCreate", { target: folder });
  assert.equal(scheduled.length, 1);
  scheduled.shift()();
  assert.deepEqual(repairs, ["still-missing"]);
});

test("a queued folder-created repair becomes inert when the controller tears down", () => {
  const eventTarget = new FakeEventTarget();
  const folder = { id: "aborted", isZenFolder: true, hasIcon: false };
  const scheduled = [];
  const repairs = [];
  const controller = new AbortController();
  const manager = new FolderIconIntegrityManager({
    listFolders: () => [],
    eventTarget: () => eventTarget,
    tabContainer: () => null,
    scheduleAfterFolderCreate: callback => scheduled.push(callback),
    isFolder: current => current?.isZenFolder === true,
    hasNativeIcon: current => current.hasIcon,
    repairNativeIcon: current => { repairs.push(current.id); return true; },
  });
  manager.start(controller.signal);

  eventTarget.emit("TabGroupCreate", { target: folder });
  controller.abort();
  scheduled.shift()();

  assert.deepEqual(repairs, []);
  assert.equal(manager.destroyed, true);
});

test("browser icon repair clones Zen's own raw icon and refreshes its state", () => {
  const clone = { localName: "svg" };
  const template = { cloneNode: deep => { assert.equal(deep, true); return clone; } };
  const icon = {
    children: [],
    querySelector: selector => selector === "svg" && icon.children.includes(clone) ? clone : null,
    appendChild(node) { this.children.push(node); return node; },
  };
  const events = [];
  const folder = {
    isZenFolder: true,
    icon,
    constructor: { rawIcon: template },
    dispatchEvent: event => events.push(event),
  };
  class FakeCustomEvent {
    constructor(type, options) { this.type = type; Object.assign(this, options); }
  }
  const updates = [];
  const adapters = createBrowserFolderIconIntegrityAdapters({
    CustomEvent: FakeCustomEvent,
    document: { querySelectorAll: () => [folder] },
    gBrowser: { tabContainer: {} },
    gZenFolders: { updateFolderIcon: (current, state) => updates.push([current, state]) },
  });

  assert.equal(adapters.hasNativeIcon(folder), false);
  assert.equal(adapters.repairNativeIcon(folder), true);
  assert.equal(adapters.hasNativeIcon(folder), true);
  assert.deepEqual(updates, [[folder, "auto"]]);
  assert.equal(events[0].type, "TabGroupUpdate");
  assert.equal(adapters.repairNativeIcon(folder), false);
});

test("nested icon repair inspects and repairs only the folder's direct icon container", () => {
  const childSvg = { localName: "svg", owner: "child" };
  const repairedSvg = { localName: "svg", owner: "parent" };
  const directIcon = {
    children: [],
    querySelector(selector) {
      return selector === ":scope > svg"
        ? this.children.find(child => child.localName === "svg") ?? null
        : null;
    },
    appendChild(node) { this.children.push(node); return node; },
  };
  const childIcon = {
    querySelector(selector) {
      return selector === "svg" || selector === ":scope > svg" ? childSvg : null;
    },
  };
  const folder = {
    id: "parent",
    isZenFolder: true,
    // Mirrors Zen's current unscoped getter resolving a nested child.
    icon: childIcon,
    querySelector(selector) {
      return selector ===
        ":scope > .tab-group-label-container > .tab-group-folder-icon"
        ? directIcon
        : childIcon;
    },
    constructor: {
      rawIcon: { cloneNode: () => repairedSvg },
    },
    dispatchEvent() {},
  };
  const adapters = createBrowserFolderIconIntegrityAdapters({
    document: { querySelectorAll: () => [folder] },
    gBrowser: { tabContainer: {} },
    gZenFolders: { updateFolderIcon() {} },
    CustomEvent: class {},
  });

  assert.equal(adapters.hasNativeIcon(folder), false);
  assert.equal(adapters.repairNativeIcon(folder), true);
  assert.equal(adapters.hasNativeIcon(folder), true);
  assert.equal(directIcon.children[0], repairedSvg);
  assert.equal(childIcon.querySelector(":scope > svg"), childSvg);
});

test("browser subfolder creation preserves native expansion and selects the first or last slot", () => {
  const menu = new FakeEventTarget();
  const item = { id: "context_zenFolderNewSubfolder" };
  const start = { id: "start", after() {} };
  const child = { id: "child", after() {} };
  const parent = {
    id: "parent",
    isZenFolder: true,
    collapsed: true,
    groupStartElement: start,
    groupContainer: { children: [start, child], lastElementChild: child },
    getAttribute: name => name === "zen-workspace-id" ? "workspace" : null,
  };
  const ancestor = { isZenFolder: true, collapsed: true, group: null };
  parent.group = ancestor;
  const created = { isZenFolder: true };
  const createCalls = [];
  const repairs = [];
  const host = {
    document: {
      getElementById: id => id === "zenFolderActions" ? menu : id === item.id ? item : null,
    },
    gBrowser: { isTabGroupLabel: () => false },
    gZenFolders: {
      createFolder: (tabs, options) => { createCalls.push({ tabs, options }); return created; },
    },
    gZenUIManager: { testingEnabled: false },
    console: { error() {} },
  };
  const adapters = createBrowserSubfolderCreationAdapters(host, null, {
    reconcileFolder: folder => repairs.push(folder),
  });

  adapters.createSubfolder(parent, "top");
  assert.equal(parent.collapsed, false);
  assert.equal(ancestor.collapsed, false);
  assert.equal(createCalls[0].options.insertAfter, start);
  assert.equal(createCalls[0].options.label, "Subfolder");
  assert.equal(createCalls[0].options.renameFolder, true);
  assert.equal(createCalls[0].options.workspaceId, "workspace");
  assert.deepEqual(repairs, [created]);

  adapters.createSubfolder(parent, "bottom");
  assert.equal(createCalls[1].options.insertAfter, child);
});
