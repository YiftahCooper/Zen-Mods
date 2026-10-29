import test from "node:test";
import assert from "node:assert/strict";

import {
  CollapsedFolderDragGuard,
  DRAG_HOVER_DELAY_MS,
  bootstrapBrowserWindow,
  createBrowserCollapsedFolderDragGuardAdapters,
} from "../scripts/better-zen-folders.uc.mjs";
import {
  FakeElement,
  makeBrowserHost,
  makeCollapsedFolderDragGuardFixture,
} from "./fakes.mjs";

function startNativeHover(fixture, folder) {
  fixture.emit("dragstart");
  fixture.emit("dragenter", { folder });
}

function openOnDrag(fixture) {
  const guard = new CollapsedFolderDragGuard(fixture.adapters);
  guard.start();
  startNativeHover(fixture, fixture.folderA);
  fixture.advance(500);
  assert.equal(fixture.folderA.collapsed, false);
  return guard;
}

test("leaving a drag-opened folder recollapses at the configured boundary", () => {
  for (const delay of [0, 237, 500, 1250]) {
    const fixture = makeCollapsedFolderDragGuardFixture({ recollapseDelayMs: delay });
    openOnDrag(fixture);
    fixture.emit("dragleave", { folder: fixture.folderA });
    if (delay) {
      fixture.advance(delay - 1);
      assert.equal(fixture.folderA.collapsed, false);
    }
    fixture.advance(delay ? 1 : 0);
    assert.equal(fixture.folderA.collapsed, true, `${delay} ms`);
  }
});

test("invalid recollapse delays fall back to 500 ms and valid strings are numeric", () => {
  for (const [value, delay] of [["237", 237], ["bad", 500], [-1, 500], [Infinity, 500], [1.5, 500]]) {
    const fixture = makeCollapsedFolderDragGuardFixture({ recollapseDelayMs: value });
    openOnDrag(fixture);
    fixture.emit("dragleave", { folder: fixture.folderA });
    fixture.advance(delay - 1);
    assert.equal(fixture.folderA.collapsed, false);
    fixture.advance(1);
    assert.equal(fixture.folderA.collapsed, true);
  }
});

test("header-to-descendant movement stays inside and reentry cancels recollapse", () => {
  const fixture = makeCollapsedFolderDragGuardFixture();
  fixture.nestFolderB();
  fixture.folderB.collapsed = false;
  openOnDrag(fixture);
  fixture.emit("dragleave", { folder: fixture.folderA, relatedFolder: fixture.folderB });
  fixture.advance(700);
  assert.equal(fixture.folderA.collapsed, false);
  fixture.emit("dragleave", { folder: fixture.folderB });
  fixture.advance(499);
  fixture.emit("dragenter", { folder: fixture.folderB });
  fixture.advance(700);
  assert.equal(fixture.folderA.collapsed, false);
  fixture.emit("dragover", { folder: null });
  fixture.advance(500);
  assert.equal(fixture.folderA.collapsed, true);
  assert.equal(fixture.folderB.collapsed, false);
});

test("reentry after recollapse requires a fresh hover delay", () => {
  const fixture = makeCollapsedFolderDragGuardFixture();
  openOnDrag(fixture);
  fixture.emit("dragleave", { folder: fixture.folderA });
  fixture.advance(500);
  assert.equal(fixture.folderA.collapsed, true);
  fixture.emit("dragenter", { folder: fixture.folderA });
  fixture.advance(499);
  assert.equal(fixture.folderA.collapsed, true);
  fixture.advance(1);
  assert.equal(fixture.folderA.collapsed, false);
});

test("end blur destroy and a new drag restore only drag-owned opens", () => {
  for (const finish of ["dragend", "blur", "destroy", "dragstart"]) {
    const fixture = makeCollapsedFolderDragGuardFixture();
    fixture.folderB.collapsed = false;
    const guard = openOnDrag(fixture);
    fixture.emit("dragover", { folder: fixture.folderB });
    if (finish === "destroy") guard.destroy();
    else if (finish === "blur") fixture.eventTarget.emit('blur', {type:'blur', target:fixture.eventTarget});
    else fixture.emit(finish);
    assert.equal(fixture.folderA.collapsed, true, finish);
    assert.equal(fixture.folderB.collapsed, false, finish);
    assert.equal(fixture.pendingTimerCount(), 0, finish);
  }
});

test("a drop event without a new dragged-item membership restores the open", () => {
  for (const mode of ["rejected", "unrelated", "already-member", "elsewhere", "copy", "none"]) {
    const fixture = makeCollapsedFolderDragGuardFixture();
    if (mode === "already-member") fixture.folderA.items.push(fixture.draggedTab);
    openOnDrag(fixture);
    fixture.emit("drop", {
      folder: mode === "elsewhere" ? fixture.folderB : fixture.folderA,
      dropEffect: ["copy", "none"].includes(mode) ? mode : "move",
    });
    if (mode === "unrelated") fixture.folderA.items.push({ id: "unrelated" });
    if (mode === "copy" || mode === "none") fixture.nativeGroupDrop(fixture.folderA);
    fixture.flushDeferred();
    assert.equal(fixture.folderA.collapsed, true, mode);
    assert.deepEqual(fixture.committedFolders, [], mode);
  }
});

test("confirmed descendant drop commits owned ancestors and exposes the destination", () => {
  const fixture = makeCollapsedFolderDragGuardFixture();
  fixture.nestFolderB();
  openOnDrag(fixture);
  fixture.emit("dragenter", { folder: fixture.folderB });
  fixture.advance(500);
  fixture.emit("drop", { folder: fixture.folderB });
  fixture.nativeGroupDrop(fixture.folderB);
  // Native dragend can precede the deferred drop check.
  fixture.emit("dragend");
  fixture.flushDeferred();
  assert.equal(fixture.folderA.collapsed, false);
  assert.equal(fixture.folderB.collapsed, false);
  assert.deepEqual(fixture.committedFolders, [fixture.folderB]);
  assert.equal(fixture.pendingTimerCount(), 0);
});

test("quick drop never commits a temporary open", () => {
  const fixture = makeCollapsedFolderDragGuardFixture();
  const guard = new CollapsedFolderDragGuard(fixture.adapters);
  guard.start();
  startNativeHover(fixture, fixture.folderA);
  fixture.emit("drop", { folder: fixture.folderA });
  fixture.nativeGroupDrop(fixture.folderA);
  fixture.flushDeferred();
  assert.equal(fixture.folderA.collapsed, true);
  assert.deepEqual(fixture.committedFolders, []);
});

test("manual collapse then reopen wins over recollapse and drag cleanup", () => {
  const fixture = makeCollapsedFolderDragGuardFixture();
  openOnDrag(fixture);
  fixture.emit("dragleave", { folder: fixture.folderA });
  fixture.manualCollapse(fixture.folderA);
  fixture.nativeExpand(fixture.folderA);
  fixture.advance(1000);
  fixture.emit("dragend");
  assert.equal(fixture.folderA.collapsed, false);
  assert.deepEqual(fixture.committedFolders, []);
});

test("manual input before hover expiry prevents interception and delayed ownership", () => {
  for (const type of ["pointerdown", "keydown"]) {
    const fixture = makeCollapsedFolderDragGuardFixture();
    const guard = new CollapsedFolderDragGuard(fixture.adapters);
    guard.start();
    startNativeHover(fixture, fixture.folderA);
    fixture.emit(type, { folder: fixture.folderA });
    const expansion = fixture.nativeExpand(fixture.folderA);
    fixture.advance(1000);
    fixture.emit("dragend");
    assert.equal(expansion.immediatePropagationStopped, false);
    assert.equal(fixture.folderA.collapsed, false);
  }
});

test("Escape cancels owned expansion while unrelated modifier keys do not take ownership", () => {
  for (const key of ["Escape", "Control"]) {
    const fixture = makeCollapsedFolderDragGuardFixture();
    openOnDrag(fixture);
    fixture.emit("keydown", { folder: fixture.folderA, key });
    if (key === "Control") fixture.emit("dragend");
    assert.equal(fixture.folderA.collapsed, true, key);
    assert.equal(fixture.pendingTimerCount(), 0);
  }
});

test("browser adapters confirm DOM membership and forward committed visibility without payload reads", () => {
  const fixture = makeCollapsedFolderDragGuardFixture();
  const folder = { isZenFolder: true, collapsed: true, contains: item => members.has(item) };
  const members = new Set();
  const commits = [];
  const host = {
    addEventListener: (...args) => fixture.eventTarget.addEventListener(...args),
    removeEventListener: (...args) => fixture.eventTarget.removeEventListener(...args),
    gBrowser: { tabContainer: fixture.dragStartTarget, isTab: item => item?.localName === "tab" },
    setTimeout: fixture.adapters.setTimer,
    clearTimeout: fixture.adapters.clearTimer,
  };
  const tab = { localName: "tab", documentGlobal: host, isConnected: true };
  tab._dragData = {movingTabs:[tab]};
  const adapters = createBrowserCollapsedFolderDragGuardAdapters(host,
    { get: name => name === "dragRecollapseDelayMs" ? "123" : 500 },
    { commitDragExpansion: value => commits.push(value) });
  const guard = new CollapsedFolderDragGuard(adapters);
  guard.start();
  const event = {
    type: "dragstart", target: tab,
    dataTransfer: { types: ["application/x-moz-tabbrowser-tab"], getData() { throw Error("payload read"); } },
  };
  guard.handleEvent(event);
  guard.handleEvent({ type: "dragenter", target: folder, dataTransfer:event.dataTransfer });
  fixture.advance(500);
  assert.equal(folder.collapsed, false);
  guard.handleEvent({ type: "dragleave", relatedTarget: null });
  fixture.advance(122);
  assert.equal(folder.collapsed, false);
  fixture.advance(1);
  assert.equal(folder.collapsed, true);
  guard.handleEvent({ type: "dragenter", target: folder, dataTransfer:event.dataTransfer });
  fixture.advance(500);
  guard.handleEvent({ type: "drop", target: folder, dataTransfer: { dropEffect: "move" } });
  members.add(tab);
  fixture.flushDeferred();
  assert.equal(folder.collapsed, false);
  assert.deepEqual(commits, [folder]);
});

test("same-node dragstart activates after Zen populates flavor and stops propagation", () => {
  const fixture = makeCollapsedFolderDragGuardFixture();
  const guard = new CollapsedFolderDragGuard(fixture.adapters);
  guard.start();

  const dragstart = fixture.emit("dragstart");
  fixture.emit("dragenter", { folder: fixture.folderA });

  assert.equal(dragstart.propagationStopped, true);
  assert.deepEqual(dragstart.dataTransfer.types, ["application/x-moz-tabbrowser-tab"]);
  assert.equal(fixture.pendingTimerCount(), 1);
});

test("short hover drop stays collapsed while native grouping and selection succeed", () => {
  const fixture = makeCollapsedFolderDragGuardFixture();
  const guard = new CollapsedFolderDragGuard(fixture.adapters);
  guard.start();
  startNativeHover(fixture, fixture.folderA);
  fixture.advance(499);

  const drop = fixture.emit("drop", { folder: fixture.folderA });
  const expand = fixture.nativeGroupDrop(fixture.folderA);

  assert.equal(drop.defaultPrevented, false);
  assert.equal(drop.propagationStopped, false);
  assert.equal(fixture.folderA.items.includes(fixture.draggedTab), true);
  assert.equal(fixture.folderA.selectedChild, fixture.draggedTab);
  assert.equal(fixture.folderA.collapsed, true);
  assert.equal(expand.immediatePropagationStopped, true);
  fixture.flushDeferred();
  assert.equal(fixture.folderA.collapsed, true);
});

test("configured hover delay expands only at each literal configured boundary", () => {
  assert.equal(DRAG_HOVER_DELAY_MS, 500);
  for (const delay of [1, 327, 500, 750, 1273, 10000]) {
    const fixture = makeCollapsedFolderDragGuardFixture({ hoverDelayMs: delay });
    const guard = new CollapsedFolderDragGuard(fixture.adapters);
    guard.start();
    startNativeHover(fixture, fixture.folderA);

    fixture.advance(delay - 1);
    assert.equal(fixture.folderA.collapsed, true, `${delay}ms remains collapsed before boundary`);
    assert.equal(fixture.pendingTimerCount(), 1, `${delay}ms retains its timer before boundary`);

    fixture.advance(1);
    assert.equal(fixture.folderA.collapsed, false, `${delay}ms expands at boundary`);
    assert.equal(fixture.pendingTimerCount(), 0, `${delay}ms consumes its timer`);
    assert.equal(fixture.lastExpandEvent().immediatePropagationStopped, false, `${delay}ms stays native`);
  }
});

test("each native drag snapshots its configured hover delay", () => {
  const fixture = makeCollapsedFolderDragGuardFixture({ hoverDelayMs: 500 });
  const guard = new CollapsedFolderDragGuard(fixture.adapters);
  guard.start();
  startNativeHover(fixture, fixture.folderA);

  fixture.advance(200);
  fixture.setHoverDelayMs(1000);
  fixture.advance(299);
  assert.equal(fixture.folderA.collapsed, true);
  fixture.advance(1);
  assert.equal(fixture.folderA.collapsed, false);

  fixture.emit("dragend");
  fixture.folderA.collapsed = true;
  startNativeHover(fixture, fixture.folderA);
  fixture.advance(999);
  assert.equal(fixture.folderA.collapsed, true);
  fixture.advance(1);
  assert.equal(fixture.folderA.collapsed, false);
});

test("moving between folders cancels and restarts the 500 ms hover timer", () => {
  const fixture = makeCollapsedFolderDragGuardFixture();
  const guard = new CollapsedFolderDragGuard(fixture.adapters);
  guard.start();
  startNativeHover(fixture, fixture.folderA);
  fixture.advance(300);

  fixture.emit("dragover", { folder: fixture.folderB });
  fixture.advance(499);
  assert.equal(fixture.folderA.collapsed, true);
  assert.equal(fixture.folderB.collapsed, true);

  fixture.advance(1);
  assert.equal(fixture.folderA.collapsed, true);
  assert.equal(fixture.folderB.collapsed, false);
});

test("dragleave to outside cancels a collapsed target's pending expansion", () => {
  const fixture = makeCollapsedFolderDragGuardFixture();
  const guard = new CollapsedFolderDragGuard(fixture.adapters);
  guard.start();
  startNativeHover(fixture, fixture.folderA);
  fixture.advance(499);

  fixture.emit("dragleave", { folder: fixture.folderA, relatedFolder: null });
  fixture.advance(1000);

  assert.equal(fixture.folderA.collapsed, true);
  assert.equal(fixture.pendingTimerCount(), 0);
});

test("premature TabGroupExpand is intercepted without recursive recollapse", () => {
  const fixture = makeCollapsedFolderDragGuardFixture();
  const guard = new CollapsedFolderDragGuard(fixture.adapters);
  guard.start();
  startNativeHover(fixture, fixture.folderA);
  fixture.reenterExpandOnNextRecollapse();

  const expand = fixture.nativeExpand(fixture.folderA);

  assert.equal(expand.immediatePropagationStopped, true);
  assert.equal(fixture.folderA.collapsed, true);
  assert.equal(fixture.reentrantExpandCount(), 1);
  assert.equal(fixture.collapseWrites(fixture.folderA), 1);
});

test("intentional 500 ms expansion remains expanded through drop and cleanup", () => {
  const fixture = makeCollapsedFolderDragGuardFixture();
  const guard = new CollapsedFolderDragGuard(fixture.adapters);
  guard.start();
  startNativeHover(fixture, fixture.folderA);
  fixture.advance(500);

  fixture.emit("drop", { folder: fixture.folderA });
  fixture.nativeGroupDrop(fixture.folderA);
  fixture.flushDeferred();
  fixture.emit("dragend");
  guard.destroy();

  assert.equal(fixture.folderA.collapsed, false);
  assert.equal(fixture.folderA.items.includes(fixture.draggedTab), true);
});

test("a folder first hovered while expanded retains native drag behavior", () => {
  const fixture = makeCollapsedFolderDragGuardFixture({ folderACollapsed: false });
  const guard = new CollapsedFolderDragGuard(fixture.adapters);
  guard.start();
  startNativeHover(fixture, fixture.folderA);

  fixture.advance(1000);
  const drop = fixture.emit("drop", { folder: fixture.folderA });
  fixture.nativeGroupDrop(fixture.folderA);
  fixture.flushDeferred();

  assert.equal(drop.defaultPrevented, false);
  assert.equal(fixture.folderA.collapsed, false);
  assert.equal(fixture.writesFor(fixture.folderA).length, 0);
});

test("non-native drags never start a timer or intercept folder expansion", () => {
  const fixture = makeCollapsedFolderDragGuardFixture();
  const guard = new CollapsedFolderDragGuard(fixture.adapters);
  guard.start();

  fixture.emit("dragstart", { native: false });
  fixture.emit("dragenter", { folder: fixture.folderA, native: false });
  const expand = fixture.nativeExpand(fixture.folderA);

  assert.equal(fixture.pendingTimerCount(), 0);
  assert.equal(expand.immediatePropagationStopped, false);
  assert.equal(fixture.folderA.collapsed, false);
});

test("drop listener is capture-phase and cleanup remains deferred past native grouping", () => {
  const fixture = makeCollapsedFolderDragGuardFixture();
  const guard = new CollapsedFolderDragGuard(fixture.adapters);
  guard.start();
  assert.equal(fixture.listenerCapture("dragstart"), false);
  assert.equal(fixture.listenerCapture("drop"), true);
  assert.equal(fixture.listenerCapture("TabGroupExpand"), true);
  startNativeHover(fixture, fixture.folderA);

  fixture.emit("drop", { folder: fixture.folderA });
  const duringNativeDrop = fixture.nativeExpand(fixture.folderA);
  assert.equal(duringNativeDrop.immediatePropagationStopped, true);
  assert.equal(fixture.folderA.collapsed, true);

  fixture.flushDeferred();
  const afterNativeDrop = fixture.nativeExpand(fixture.folderA);
  assert.equal(afterNativeDrop.immediatePropagationStopped, false);
  assert.equal(fixture.folderA.collapsed, false);
});

test("repeated short drops into the same collapsed folder remain collapsed", () => {
  const fixture = makeCollapsedFolderDragGuardFixture();
  const guard = new CollapsedFolderDragGuard(fixture.adapters);
  guard.start();

  for (let trial = 0; trial < 2; trial++) {
    startNativeHover(fixture, fixture.folderA);
    fixture.advance(100);
    fixture.emit("drop", { folder: fixture.folderA });
    fixture.nativeGroupDrop(fixture.folderA);
    fixture.flushDeferred();
    assert.equal(fixture.folderA.collapsed, true);
  }

  assert.equal(fixture.folderA.items.length, 2);
});

test("dragend blur and destroy each clear timer and protected drag state", () => {
  for (const finish of ["dragend", "blur", "destroy"]) {
    const fixture = makeCollapsedFolderDragGuardFixture();
    const guard = new CollapsedFolderDragGuard(fixture.adapters);
    guard.start();
    startNativeHover(fixture, fixture.folderA);

    if (finish === "destroy") guard.destroy();
    else if (finish === "blur") fixture.eventTarget.emit('blur', {type:'blur', target:fixture.eventTarget});
    else fixture.emit(finish);

    assert.equal(fixture.pendingTimerCount(), 0, finish);
    const expand = fixture.nativeExpand(fixture.folderA);
    assert.equal(expand.immediatePropagationStopped, false, finish);
    assert.equal(fixture.folderA.collapsed, false, finish);
    guard.destroy();
    for (const type of [
      "dragenter", "dragover", "dragleave", "drop",
      "dragend", "TabGroupExpand", "blur",
    ]) {
      assert.equal(fixture.eventTarget.listenerCount(type), 0, `${finish}:${type}`);
    }
    assert.equal(fixture.dragStartTarget.listenerCount("dragstart"), 1, finish);
  }
});

test("live collapsed folders use the same short-drop and delayed-expand rule", () => {
  const fixture = makeCollapsedFolderDragGuardFixture({ folderAIsLive: true });
  const guard = new CollapsedFolderDragGuard(fixture.adapters);
  guard.start();
  startNativeHover(fixture, fixture.folderA);
  fixture.advance(499);
  fixture.emit("drop", { folder: fixture.folderA });
  fixture.nativeGroupDrop(fixture.folderA);
  fixture.flushDeferred();

  assert.equal(fixture.folderA.isLiveFolder, true);
  assert.equal(fixture.folderA.collapsed, true);
});

test("browser adapter recognizes native tab flavor without reading payload values", () => {
  let payloadReads = 0;
  const tabContainer = new FakeElement("tabs");
  const host = {
    gBrowser: { tabContainer },
    setTimeout: () => 1,
    clearTimeout() {},
  };
  const folder = { isZenFolder: true, collapsed: true };
  const adapters = createBrowserCollapsedFolderDragGuardAdapters(host);
  const event = {
    target: { closest: selector => selector === "zen-folder" ? folder : null },
    dataTransfer: {
      types: ["application/x-moz-tabbrowser-tab", "text/uri-list"],
      getData() { payloadReads++; return "private"; },
    },
  };

  assert.equal(adapters.isNativeTabDrag(event), true);
  assert.equal(adapters.dragStartTarget(), tabContainer);
  assert.equal(adapters.getTargetFolder(event), folder);
  assert.equal(payloadReads, 0);
});

test("browser bootstrap projects and tears down the hierarchy-guide root state", () => {
  const calls = [];
  const browser = makeBrowserHost("chrome://browser/content/browser.xhtml", calls);
  const root = browser.host.document.documentElement;
  root.setAttribute("another-mod-attribute", "keep");

  bootstrapBrowserWindow(browser.host);
  assert.equal(root.getAttribute("better-zen-folders-show-guides"), "true");

  browser.preferenceFixture.set("better-zen-folders.show-hierarchy-guides", false);
  browser.preferenceFixture.notify("better-zen-folders.show-hierarchy-guides");
  assert.equal(root.getAttribute("better-zen-folders-show-guides"), "false");

  browser.preferenceFixture.set("better-zen-folders.show-hierarchy-guides", true);
  browser.preferenceFixture.notify("better-zen-folders.show-hierarchy-guides");
  assert.equal(root.getAttribute("better-zen-folders-show-guides"), "true");

  browser.host.__betterZenFoldersController.destroy();
  assert.equal(root.getAttribute("better-zen-folders-show-guides"), null);
  assert.equal(root.getAttribute("another-mod-attribute"), "keep");
});

test("browser startup installs the production guard without debug UI or native drag preference access", () => {
  const calls = [];
  const browser = makeBrowserHost("chrome://browser/content/browser.xhtml", calls);
  const sidebar = new FakeElement("vbox");
  sidebar.appendChild(browser.host.gBrowser.tabContainer);
  const preferenceCalls = [];
  browser.host.Services = {
    prefs: {
      prefHasUserValue(name) { preferenceCalls.push(`has:${name}`); return false; },
      getIntPref(name, fallback) { preferenceCalls.push(`get-int:${name}`); return fallback; },
      setIntPref(name) { preferenceCalls.push(`set-int:${name}`); },
      getStringPref(name, fallback) { preferenceCalls.push(`get-string:${name}`); return fallback; },
      setStringPref(name) { preferenceCalls.push(`set-string:${name}`); },
      getBoolPref(name) { preferenceCalls.push(`get-bool:${name}`); return true; },
      clearUserPref(name) { preferenceCalls.push(`clear:${name}`); },
    },
  };
  browser.host.console = { error() {}, debug() {} };
  browser.host.setTimeout = () => 1;
  browser.host.clearTimeout = () => {};

  bootstrapBrowserWindow(browser.host);

  assert.deepEqual(preferenceCalls, [
    "get-string:better-zen-folders.folder-colors.v1",
    "get-string:better-zen-folders.folder-color-presets.v1",
  ]);
  assert.equal(
    preferenceCalls.some(call => call.includes("browser.tabs.dragDrop.expandGroup.delayMS")),
    false,
  );
  assert.equal(
    sidebar.children.some(child =>
      child.getAttribute("data-better-zen-folders-drag-diagnostic") === "true"
    ),
    false,
  );
  assert.equal(
    browser.host.__betterZenFoldersController.adapters.managers
      .some(manager => manager instanceof CollapsedFolderDragGuard),
    true,
  );
  browser.host.__betterZenFoldersController.destroy();
});
