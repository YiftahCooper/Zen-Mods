import test from "node:test";
import assert from "node:assert/strict";

import {
  EmptyRegularFolderManager,
  FolderButtonManager,
  FolderColorManager,
  FolderIconIntegrityManager,
  FolderPopulationRegistry,
  FolderUnloadManager,
  RESTORE_KEY,
  StickyFolderVisibilityManager,
  createBrowserFolderColorAdapters,
  isRelevantTabStripMutation,
} from "../scripts/better-zen-folders.uc.mjs";
import { makeMetadataSyncFixture } from "./fakes.mjs";

// Mutation records shaped like Gecko's. A tab title change replaces the text
// node inside .tab-label; it never adds or removes an element.
const TEXT = 3, ELEMENT = 1;
const textNode = value => ({ nodeType: TEXT, data: value });
const element = (localName, className = null, owned = false) => ({
  nodeType: ELEMENT, localName,
  getAttribute: name => name === "class" ? className
    : name === "data-better-zen-folders-owned" && owned ? "true" : null,
});
const titleChange = (tab, index) => ({
  type: "childList", target: { localName: "label", parentTab: tab },
  addedNodes: [textNode(`Title ${index}`)], removedNodes: [textNode(`Old ${index}`)],
});
const elementInsertion = node => ({ type: "childList", target: {}, addedNodes: [node], removedNodes: [] });
const tabs300 = () => Array.from({ length: 300 }, (_, index) => ({ localName: "tab", id: `tab-${index}` }));
const titleBurst = tabs => tabs.map((tab, index) => titleChange(tab, index));

test("tab-strip relevance ignores text-only records and owned additions, never removals", () => {
  assert.equal(isRelevantTabStripMutation(titleBurst(tabs300())), false);
  assert.equal(isRelevantTabStripMutation([elementInsertion(element("tab"))]), true);
  assert.equal(isRelevantTabStripMutation([elementInsertion(element("zen-folder"))]), true);
  // This mod's own decorations: additions are its own echo, removals may be external.
  const owned = element("button", "better-zen-folders-sticky-toggle", true);
  assert.equal(isRelevantTabStripMutation([elementInsertion(owned)]), false);
  assert.equal(isRelevantTabStripMutation([elementInsertion(element("span", "better-zen-folders-state-chevron"))]), false);
  assert.equal(isRelevantTabStripMutation([elementInsertion(element("span", "zen-better-zen-folders-like"))]), true);
  assert.equal(isRelevantTabStripMutation([{ type: "childList", addedNodes: [], removedNodes: [owned] }]), true);
  assert.equal(isRelevantTabStripMutation([elementInsertion(owned)], { ignoreOwnedAdditions: false }), true);
  // Attribute records were already selected by the observer's attributeFilter.
  assert.equal(isRelevantTabStripMutation([{ type: "attributes", attributeName: "pinned" }]), true);
  // Unknown shapes (test fakes, empty batches) remain conservative.
  for (const records of [undefined, null, [], [{}], [{ attributeName: "id" }]]) {
    assert.equal(isRelevantTabStripMutation(records), true, JSON.stringify(records));
  }
  // One structural record anywhere in a large burst still counts.
  const burst = titleBurst(tabs300());
  burst.splice(150, 0, elementInsertion(element("tab")));
  assert.equal(isRelevantTabStripMutation(burst), true);
});

function captureObserver() {
  const state = { callbacks: [], observed: [] };
  state.create = callback => {
    state.callbacks.push(callback);
    return { observe: (target, options) => state.observed.push({ target, options }), disconnect() {} };
  };
  state.deliver = records => { for (const callback of state.callbacks) callback(records); };
  return state;
}

test("a burst of 300 tab-title mutations runs no structural reconcile; one insertion runs one", async () => {
  const tabs = tabs300();
  const folders = [{ id: "folder", isZenFolder: true, isConnected: true, children: [] }];
  const scans = { color: 0, icon: 0, button: 0, unload: 0, empty: 0 };
  const observers = captureObserver();
  const controller = new AbortController();

  const color = new FolderColorManager({
    readLedger: () => "", writeLedger() {}, tabContainer: () => ({}),
    createMutationObserver: observers.create,
    listFolders: () => { scans.color++; return folders; },
    isFolder: folder => folder?.isZenFolder === true, getFolderId: folder => folder.id,
    projectColor() {}, clearProjectedColor() {},
  });
  const icon = new FolderIconIntegrityManager({
    tabContainer: () => ({}), eventTarget: () => null, createMutationObserver: observers.create,
    listFolders: () => { scans.icon++; return folders; }, isFolder: () => true, hasNativeIcon: () => true,
  });
  const button = new FolderButtonManager({
    tabContainer: () => ({}), createMutationObserver: observers.create,
    listFolders: () => { scans.button++; return folders; }, getFolderRow: () => null,
  });
  const unload = new FolderUnloadManager({
    gBrowser: { explicitUnloadTabs() {}, tabContainer: { addEventListener() {}, removeEventListener() {} } },
    document: { querySelectorAll: () => { scans.unload++; return folders; } },
    MutationObserver: class { constructor(callback) { observers.callbacks.push(callback); } observe() {} disconnect() {} },
  });
  const registry = new FolderPopulationRegistry();
  const empty = new EmptyRegularFolderManager({
    eventTarget: () => null, tabContainer: () => ({}), createMutationObserver: observers.create,
  }, registry);
  empty.scheduleReconciliation = () => { scans.empty++; };
  for (const manager of [color, icon, button, unload, empty]) manager.start(controller.signal);
  empty.candidates.add(folders[0]);
  const afterStart = { ...scans };

  observers.deliver(titleBurst(tabs));
  observers.deliver([elementInsertion(element("button", "better-zen-folders-new-tab-button", true))]);
  await Promise.resolve();
  assert.deepEqual(scans, afterStart, "title text and owned decorations must not reconcile");

  observers.deliver([...titleBurst(tabs), elementInsertion(element("tab"))]);
  await Promise.resolve();
  for (const name of Object.keys(scans)) {
    assert.equal(scans[name], afterStart[name] + 1, `${name} reconciles exactly once per structural batch`);
  }
  // Conservative path used by existing fixtures: a bare notification still reconciles.
  observers.deliver([]);
  for (const name of Object.keys(scans)) assert.equal(scans[name], afterStart[name] + 2, name);
  controller.abort();
});

test("restore metadata ignores title text, re-serialises only retitled tabs, and writes nothing unchanged", async () => {
  const fixture = makeMetadataSyncFixture({ liveLeaf: true });
  const siblings = Array.from({ length: 299 }, (_, index) => ({
    ...fixture.tab, id: `sibling-${index}`, localName: "tab", presentation: { ...fixture.tab.presentation },
  }));
  fixture.tab.localName = "tab";
  fixture.tabs.push(...siblings);
  fixture.leaf.allItems.push(...siblings);
  let reads = 0;
  const getValue = fixture.adapters.sessionStore.getCustomTabValue;
  fixture.adapters.sessionStore.getCustomTabValue = (tab, key) => { reads++; return getValue(tab, key); };
  fixture.manager.start(new AbortController().signal);
  await fixture.flush();
  assert.equal(fixture.writes.length, 300);
  fixture.resetCalls();
  reads = 0;
  const scansBefore = fixture.scanCount();

  // Title text replacement under every tab: no pass, no reads, no writes.
  fixture.observer().callback(titleBurst(fixture.tabs));
  await fixture.flush();
  assert.equal(fixture.scanCount(), scansBefore);
  assert.equal(reads, 0);
  assert.deepEqual(fixture.writes, []);

  // Label attribute on two tabs: only those two records are rebuilt. Live-folder
  // presentation still persists the new label for the tab that changed.
  const [first, second] = [fixture.tabs[10], fixture.tabs[200]];
  first.presentation.label = "Renamed page";
  fixture.observer().callback([
    { type: "attributes", attributeName: "label", target: first },
    { type: "attributes", attributeName: "image", target: second },
    { type: "attributes", attributeName: "label", target: first },
  ]);
  await fixture.flush();
  assert.equal(reads, 2, "each retitled tab is read once, the other 298 are untouched");
  assert.deepEqual(fixture.writes.map(write => write.tab), [first]);
  assert.equal(JSON.parse(fixture.values.get(first)).presentation.label, "Renamed page");

  // A structural change keeps the full pass; unchanged records are not rewritten.
  fixture.resetCalls();
  reads = 0;
  fixture.observer().callback([elementInsertion(element("tab"))]);
  await fixture.flush();
  assert.equal(reads, 300);
  assert.deepEqual(fixture.writes, []);

  // An attribute that can move other tabs' placement keeps the full pass too.
  reads = 0;
  fixture.observer().callback([{ type: "attributes", attributeName: "id", target: first }]);
  await fixture.flush();
  assert.equal(reads, 300);
  assert.deepEqual(fixture.writes, []);
});

test("restore metadata never clears or writes a value that was never stored", async () => {
  const fixture = makeMetadataSyncFixture();
  const plain = Array.from({ length: 300 }, (_, index) => ({ id: `plain-${index}`, supported: true, group: null }));
  fixture.tabs.push(...plain);
  const getValue = fixture.adapters.sessionStore.getCustomTabValue;
  // Firefox can report a missing custom value as undefined rather than "".
  fixture.adapters.sessionStore.getCustomTabValue = (tab, key) =>
    fixture.values.has(tab) ? getValue(tab, key) : undefined;
  fixture.manager.start(new AbortController().signal);
  await fixture.flush();
  assert.deepEqual(fixture.clears, []);
  assert.deepEqual(fixture.writes.map(write => write.tab), [fixture.tab]);
  fixture.resetCalls();
  fixture.emit("TabMove");
  await fixture.flush();
  assert.deepEqual(fixture.clears, []);
  assert.deepEqual(fixture.writes, []);
  // A real stale value is still removed.
  fixture.values.set(plain[0], JSON.stringify({ stale: true }));
  fixture.emit("TabMove");
  await fixture.flush();
  assert.deepEqual(fixture.clears, [plain[0]]);
  assert.equal(RESTORE_KEY.length > 0, true);
});

test("a URL-pin intent change re-serialises only that tab's restore record", async () => {
  // Native 0.3.27 finding: a URL pin made from the tab menu wrote the intent
  // after the menu command's full pass, and its badge (an owned decoration)
  // no longer reached the observer, so the restore record kept urlPin false.
  const fixture = makeMetadataSyncFixture();
  fixture.tab.localName = "tab";
  const siblings = Array.from({ length: 50 }, (_, index) => ({
    ...fixture.tab, id: `sibling-${index}`, presentation: { ...fixture.tab.presentation },
  }));
  fixture.tabs.push(...siblings);
  fixture.leaf.allItems.push(...siblings);
  const intents = new Map();
  fixture.adapters.getUrlPinRecovery = tab => intents.get(tab) ?? { explicit: false, baseline: null };
  let reads = 0;
  const getValue = fixture.adapters.sessionStore.getCustomTabValue;
  fixture.adapters.sessionStore.getCustomTabValue = (tab, key) => { reads++; return getValue(tab, key); };
  fixture.manager.start(new AbortController().signal);
  await fixture.flush();
  assert.equal(JSON.parse(fixture.values.get(fixture.tab)).urlPin.explicit, false);
  fixture.resetCalls();
  reads = 0;

  intents.set(fixture.tab, { explicit: true,
    baseline: { entry: { url: "https://example.test/pinned", title: "Pinned" }, image: null } });
  // The badge insertion alone is an owned decoration and stays filtered.
  fixture.observer().callback([elementInsertion(element("button", "better-zen-folders-url-pin"))]);
  await fixture.flush();
  assert.deepEqual(fixture.writes, []);
  // The intent store's notification on the tab re-serialises that tab only.
  fixture.emit("BetterZenFoldersUrlPinChanged", fixture.tab);
  await fixture.flush();
  assert.equal(reads, 1, "only the changed tab is read");
  assert.deepEqual(fixture.writes.map(write => write.tab), [fixture.tab]);
  assert.equal(JSON.parse(fixture.values.get(fixture.tab)).urlPin.explicit, true);

  // A notification without a tab target keeps the conservative full pass.
  reads = 0;
  fixture.emit("BetterZenFoldersUrlPinChanged", {});
  await fixture.flush();
  assert.equal(reads, 51);
});

test("folder colour projection performs no DOM write when the colour is unchanged", () => {
  const adapters = createBrowserFolderColorAdapters({ document: {}, gBrowser: {} });
  const writes = [];
  const attributes = new Map(), properties = new Map();
  const folder = {
    getAttribute: name => attributes.get(name) ?? null,
    setAttribute: (name, value) => { writes.push(`attr:${name}`); attributes.set(name, String(value)); },
    removeAttribute: name => attributes.delete(name),
    style: {
      getPropertyValue: name => properties.get(name) ?? "",
      getPropertyPriority: () => "",
      setProperty: (name, value) => { writes.push(`style:${name}`); properties.set(name, value); },
      removeProperty: name => properties.delete(name),
    },
  };
  adapters.projectColor(folder, "#06b6d4");
  assert.equal(writes.length, 3);
  adapters.projectColor(folder, "#06b6d4");
  assert.equal(writes.length, 3, "an unchanged projection must not dirty style or attributes");
  adapters.projectColor(folder, "#22c55e");
  assert.equal(writes.length, 6);
  assert.equal(attributes.get("data-better-zen-folders-color"), "#22c55e");
  assert.equal(properties.get("--better-zen-folders-folder-color"), "#22c55e");
  adapters.clearProjectedColor(folder);
  assert.equal(attributes.has("data-better-zen-folders-color"), false);
  assert.equal(properties.size, 0);
});

function stickyHost() {
  const timers = [];
  const observers = captureObserver();
  const host = {
    timers, observers,
    gBrowser: { tabContainer: {}, isTab: () => false },
    document: { querySelectorAll: () => [], querySelector: () => null, getElementById: () => null, activeElement: null },
    SessionStore: {
      setCustomWindowValue() {}, getCustomWindowValue: () => "", getCustomTabValue: () => "", setCustomTabValue() {},
      promiseAllWindowsRestored: Promise.resolve(),
    },
    MutationObserver: class { constructor(callback) { observers.callbacks.push(callback); } observe() {} disconnect() {} },
    addEventListener() {}, removeEventListener() {},
    setTimeout: callback => { timers.push(callback); return timers.length; },
    clearTimeout() {},
    console: { error: (...args) => { throw new Error(`unexpected Sticky error: ${args.join(" ")}`); } },
  };
  return host;
}

test("Sticky projection is not scheduled by keystrokes or title text, but is by structure", () => {
  const host = stickyHost();
  const manager = new StickyFolderVisibilityManager(host, { get: () => undefined, subscribe: () => () => {} });
  manager.start(new AbortController().signal);
  assert.equal(host.observers.callbacks.length, 1);
  const deliver = records => host.observers.callbacks[0](records);
  const run = () => { const callback = host.timers.shift(); callback?.(); return Boolean(callback); };
  while (run()) { /* settle start-up work */ }

  for (const type of ["keypress", "keydown", "keyup"]) {
    for (let index = 0; index < 50; index++) manager.handleEvent({ type, key: "a", target: { closest: () => null } });
  }
  assert.equal(host.timers.length, 0, "typing must not schedule a projection pass");

  deliver(titleBurst(tabs300()));
  deliver([elementInsertion(element("span", "better-zen-folders-sticky-underline"))]);
  assert.equal(host.timers.length, 0, "title text and owned decorations must not schedule a pass");

  deliver([...titleBurst(tabs300()), elementInsertion(element("tab"))]);
  deliver([{ type: "attributes", attributeName: "selected", target: {} }]);
  manager.handleEvent({ type: "TabOpen", target: {} });
  assert.equal(host.timers.length, 1, "structural records and tab events share one coalesced pass");
  manager.destroy();
});

class GeometryNode {
  constructor(log, name, rect = { x: 0, right: 0, width: 0 }) {
    Object.assign(this, { log, name, rect, children: [], attributes: new Map(), parentElement: null, isConnected: true });
    const properties = new Map();
    this.style = {
      getPropertyValue: key => properties.get(key) ?? "",
      getPropertyPriority: () => "",
      setProperty: (key, value) => { log.push(`write:${name}`); properties.set(key, value); },
      removeProperty: key => { log.push(`remove:${name}`); properties.delete(key); },
    };
    this.classList = { contains: token => (this.attributes.get("class") ?? "").split(/\s+/).includes(token) };
  }
  set className(value) { this.attributes.set("class", value); }
  setAttribute(key, value) { this.attributes.set(key, String(value)); }
  getAttribute(key) { return this.attributes.get(key) ?? null; }
  hasAttribute(key) { return this.attributes.has(key); }
  removeAttribute(key) { this.attributes.delete(key); }
  toggleAttribute(key, force) { if (force) this.attributes.set(key, ""); else this.attributes.delete(key); }
  appendChild(node) { node.parentElement = this; this.children.push(node); }
  remove() {}
  closest() { return null; }
  querySelector(selector) { return this.select?.(selector) ?? null; }
  getBoundingClientRect() { this.log.push(`read:${this.name}`); return this.rect; }
}

test("underline centring reads all folder geometry after the writes, in one phase", () => {
  const log = [];
  const host = stickyHost();
  host.document.createElementNS = (_ns, name) => new GeometryNode(log, `created-${name}`);
  host.getComputedStyle = node => ({ direction: node.rtl ? "rtl" : "ltr" });
  const manager = new StickyFolderVisibilityManager(host, {
    get: name => name === "stickyMarker" ? "underline" : undefined,
  });
  const folder = (name, slot, paint, rtl = false) => {
    const row = new GeometryNode(log, `${name}-row`);
    const icon = new GeometryNode(log, `${name}-icon`, slot);
    const art = new GeometryNode(log, `${name}-art`, paint);
    icon.rtl = rtl;
    icon.select = selector => selector === "svg .front" ? art : null;
    row.select = selector => selector === ":scope > .tab-group-folder-icon" ? icon : null;
    const item = new GeometryNode(log, name);
    Object.assign(item, { isZenFolder: true, group: { isZenFolder: true }, labelElement: { parentElement: row } });
    return item;
  };
  const left = folder("left", { x: 100, right: 124, width: 24 }, { x: 104, width: 16 });
  const right = folder("right", { x: 100, right: 124, width: 24 }, { x: 102, width: 16 }, true);

  manager.iconCentreQueue = [];
  manager.decorateEar(left, true);
  manager.decorateEar(right, true);
  assert.deepEqual(log, [], "decoration must not read layout between writes");
  const centres = manager.measureIconCentres(manager.iconCentreQueue.splice(0));
  assert.ok(log.every(entry => entry.startsWith("read:")), log.join());
  manager.applyIconCentres(centres);
  const mark = item => item.labelElement.parentElement.select(":scope > .tab-group-folder-icon").children[0];
  assert.equal(mark(left).style.getPropertyValue("--bzf-sticky-icon-centre"), "12px");
  assert.equal(mark(right).style.getPropertyValue("--bzf-sticky-icon-centre"), "14px");
  // An unchanged centre is not rewritten on the next pass.
  log.length = 0;
  manager.applyIconCentres(manager.measureIconCentres([{ mark: mark(left), icon: mark(left).parentElement,
    art: mark(left).parentElement.select("svg .front") }]));
  assert.ok(!log.some(entry => entry.startsWith("write:")), log.join());
  manager.iconCentreQueue = null;
  // Outside a projection pass the original immediate behaviour remains.
  log.length = 0;
  const lone = folder("lone", { x: 0, right: 20, width: 20 }, { x: 0, width: 0 });
  manager.decorateEar(lone, true);
  assert.ok(log.includes("read:lone-icon"));
  assert.ok(log.includes("remove:created-button"));
});
