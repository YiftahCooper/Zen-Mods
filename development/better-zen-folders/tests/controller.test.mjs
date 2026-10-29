import test from "node:test";
import assert from "node:assert/strict";

import {
  EmptyRegularFolderManager,
  FolderPopulationRegistry,
  FolderRestoreManager,
  FolderPinRuntime,
  isRegularFolder,
  NewTabInFolderTransaction,
  createBrowserNewTabTransactionAdapters,
  FolderButtonManager,
  BetterZenFoldersController,
  bootstrapBrowserWindow,
} from "../scripts/better-zen-folders.uc.mjs";
import {
  makeBrowserHost,
  makeBrowserNewTabHost,
  makeCollapsedNewTabFixture,
  makeFolderButtonFixture,
  makeNewTabTransaction,
  makePositionedNewTabFixture,
  makeRecordingNewTabTransaction,
  makeRegularFolder,
} from "./fakes.mjs";

test("new-tab eligibility excludes live folders", () => {
  assert.equal(isRegularFolder({ isZenFolder: true, isLiveFolder: false }), true);
  assert.equal(isRegularFolder({ isZenFolder: true, isLiveFolder: true }), false);
});

test("activation arms TabOpen before Zen creates the tab", async () => {
  const calls = [];
  const tx = makeNewTabTransaction({
    armTabOpen: handler => {
      calls.push("arm");
      return () => calls.push("disarm");
    },
    handleNewTab: () => {
      calls.push("create");
      return true;
    },
  });

  assert.equal(await tx.activate(makeRegularFolder()), true);
  assert.deepEqual(calls.slice(0, 2), ["arm", "create"]);
});

test("activation rejects live folders without invoking Zen", async () => {
  let invoked = false;
  const tx = makeNewTabTransaction({ handleNewTab: () => (invoked = true) });

  assert.equal(await tx.activate({ isZenFolder: true, isLiveFolder: true }), false);
  assert.equal(invoked, false);
});

test("activation rejects disconnected, foreign-window, and inactive-workspace folders", async () => {
  let invocations = 0;
  const tx = makeNewTabTransaction({ handleNewTab: () => ++invocations });

  assert.equal(await tx.activate(makeRegularFolder({ isConnected: false })), false);
  assert.equal(await tx.activate(makeRegularFolder({ inCurrentWindow: false })), false);
  assert.equal(await tx.activate(makeRegularFolder({ inActiveWorkspace: false })), false);
  assert.equal(invocations, 0);
});

test("browser adapter accepts Zen 1.21.15b UUID-shaped active workspaces", async () => {
  const fixture = makeBrowserNewTabHost({
    dialogueOpen: true,
    activeWorkspace: "workspace-active",
    activeWorkspaceRecord: { uuid: "workspace-fallback" },
    folderWorkspace: "workspace-active",
  });
  fixture.handleNewTab = () => {
    fixture.tabContainer.emit("TabOpen", { target: fixture.tab });
    fixture.emitZenURLBarClosed({ onElementPicked: true });
    return true;
  };
  const tx = new NewTabInFolderTransaction(
    createBrowserNewTabTransactionAdapters(fixture.host, fixture.tabContainer),
  );

  assert.equal(await tx.activate(fixture.folder), true);
  assert.deepEqual(fixture.handleNewTabCalls, [[false, false, "tab", true, {id:1}]]);
});

test("browser handoff ignores foreign tabs and cannot capture a later unrelated tab", async () => {
  const fixture = makeBrowserNewTabHost({ dialogueOpen: true });
  const adapters = createBrowserNewTabTransactionAdapters(fixture.host, fixture.tabContainer);
  const handoff = adapters.armNextTabOpen();
  adapters.handleNewTab(false, false, "tab", true, handoff.closeToken);
  const foreignTab = { documentGlobal: {} };

  fixture.tabContainer.emit("TabOpen", { target: foreignTab });
  assert.equal(fixture.tabContainer.listenerCount("TabOpen"), 1);
  fixture.tabContainer.emit("TabOpen", { target: fixture.tab });
  fixture.emitZenURLBarClosed({ onElementPicked: true });

  assert.equal(await handoff.promise, fixture.tab);
  assert.equal(fixture.tabContainer.listenerCount("TabOpen"), 0);
  fixture.tabContainer.emit("TabOpen", { target: { documentGlobal: fixture.host } });
  assert.equal(await handoff.promise, fixture.tab);
});

test("browser handoff replacement cancels stale token ownership", async () => {
  const fixture = makeBrowserNewTabHost({ dialogueOpen: true });
  const adapters = createBrowserNewTabTransactionAdapters(fixture.host, fixture.tabContainer);
  const stale = adapters.armNextTabOpen();
  const current = adapters.armNextTabOpen();
  adapters.handleNewTab(false, false, "tab", true, current.closeToken);

  assert.equal(await stale.promise, null);
  assert.equal(fixture.tabContainer.listenerCount("TabOpen"), 1);
  fixture.tabContainer.emit("TabOpen", { target: fixture.tab });
  fixture.emitZenURLBarClosed({ onElementPicked: true });

  assert.equal(await current.promise, fixture.tab);
  assert.equal(fixture.tabContainer.listenerCount("TabOpen"), 0);
});

test("transaction and controller teardown remove an armed browser handoff listener", async () => {
  const fixture = makeBrowserNewTabHost();
  const adapters = createBrowserNewTabTransactionAdapters(fixture.host, fixture.tabContainer);
  const transaction = new NewTabInFolderTransaction(adapters);
  const pending = transaction.activate(fixture.folder);

  assert.equal(fixture.tabContainer.listenerCount("TabOpen"), 1);
  transaction.destroy();
  assert.equal(fixture.tabContainer.listenerCount("TabOpen"), 0);
  assert.equal(fixture.host.listenerCount("ZenURLBarClosed"), 0);
  assert.equal(await pending, false);

  const secondTransaction = new NewTabInFolderTransaction(adapters);
  const buttonFixture = makeFolderButtonFixture({ newTabTransaction: secondTransaction });
  const controller = new BetterZenFoldersController({
    createAbortController: () => ({ abort() {}, signal: {} }),
    managers: [new FolderButtonManager(buttonFixture.adapters)],
  });
  controller.start();
  const secondPending = secondTransaction.activate(fixture.folder);

  assert.equal(fixture.tabContainer.listenerCount("TabOpen"), 1);
  controller.destroy();
  assert.equal(fixture.tabContainer.listenerCount("TabOpen"), 0);
  assert.equal(fixture.host.listenerCount("ZenURLBarClosed"), 0);
  assert.equal(await secondPending, false);
});

test("collapse restoration returns the target and ancestors to mixed initial states", async () => {
  const { tx, folder, ancestors, emitTabOpen } = makeCollapsedNewTabFixture();

  const pending = tx.activate(folder);
  emitTabOpen();

  assert.equal(await pending, true);
  assert.deepEqual([folder, ...ancestors].map(item => item.collapsed), [true, false, true]);
});

test("New Tab position bottom retains native order and excludes placeholders", async () => {
  const fixture = makePositionedNewTabFixture("bottom");
  const pending = fixture.tx.activate(fixture.folder);
  fixture.resolve();

  assert.equal(await pending, true);
  assert.deepEqual(fixture.visibleIds(), ["alpha", "beta", "new"]);
});

test("New Tab position top places the created tab before the first real direct child", async () => {
  const fixture = makePositionedNewTabFixture("top");
  const pending = fixture.tx.activate(fixture.folder);
  fixture.resolve();

  assert.equal(await pending, true);
  assert.deepEqual(fixture.visibleIds(), ["new", "alpha", "beta"]);
});

test("New Tab position is snapshotted while the dialogue is open", async () => {
  const fixture = makePositionedNewTabFixture("top");
  const first = fixture.tx.activate(fixture.folder);
  fixture.preferences.position = "bottom";
  fixture.resolve();

  assert.equal(await first, true);
  assert.deepEqual(fixture.visibleIds(), ["new", "alpha", "beta"]);

  fixture.tx.state.tab = { id: "later", isBlankNewTab: true };
  const second = fixture.tx.activate(fixture.folder);
  fixture.resolve();

  assert.equal(await second, true);
  assert.deepEqual(fixture.visibleIds(), ["new", "alpha", "beta", "later"]);
});

test("activation cancels cleanly when Zen declines the new-tab command", async () => {
  const tx = makeNewTabTransaction({ handleNewTab: () => false });

  assert.equal(await tx.activate(makeRegularFolder()), false);
  assert.equal(tx.state.handoffCancelled, true);
  assert.deepEqual(tx.state.removedTabs, []);
  assert.deepEqual(tx.state.errors, []);
});

test("new-tab activation holds its folder from dialogue open through final cleanup", async () => {
  const populationRegistry = new FolderPopulationRegistry();
  const folder = makeRegularFolder();
  let heldWhileOpening = false;
  const tx = makeNewTabTransaction({
    handleNewTab: () => {
      heldWhileOpening = populationRegistry.isHeld(folder);
      return false;
    },
    adapters: { populationRegistry },
  });

  assert.equal(await tx.activate(folder), false);
  assert.equal(heldWhileOpening, true);
  assert.equal(populationRegistry.isHeld(folder), false);
});

test("destroyed transactions never group a tab captured just before teardown", async () => {
  let emitTabOpen = () => {};
  const folder = makeRegularFolder();
  const tx = makeNewTabTransaction({
    onHandoff: handoff => { emitTabOpen = () => handoff.resolve(); },
  });

  const pending = tx.activate(folder);
  emitTabOpen();
  tx.destroy();

  assert.equal(await pending, false);
  assert.deepEqual(folder.allItems, []);
});

test("grouping failure restores the collapse snapshot and removes only its blank tab", async () => {
  const { tx, folder, ancestors, emitTabOpen } = makeCollapsedNewTabFixture();
  folder.addTabs = () => {
    folder.collapsed = false;
    ancestors[0].collapsed = true;
    ancestors[1].collapsed = false;
    throw new Error("native grouping failed");
  };

  const pending = tx.activate(folder);
  emitTabOpen();

  assert.equal(await pending, false);
  assert.deepEqual(tx.state.removedTabs, [tx.state.tab]);
  assert.equal(tx.state.errors.length, 1);
  assert.deepEqual([folder, ...ancestors].map(item => item.collapsed), [true, false, true]);
});

test("destroy is idempotent and aborts owned listeners", () => {
  let aborts = 0;
  const controller = new BetterZenFoldersController({
    createAbortController: () => ({ abort: () => aborts++, signal: {} }),
    managers: [],
  });
  controller.start();
  controller.destroy();
  controller.destroy();
  assert.equal(aborts, 1);
});

test("button reconciliation creates one owned control before the native reset control", () => {
  const fixture = makeFolderButtonFixture();
  const manager = new FolderButtonManager(fixture.adapters);

  manager.reconcile(fixture.folder);
  manager.reconcile(fixture.folder);

  const [button] = fixture.ownedButtons();
  assert.equal(fixture.ownedButtons().length, 1);
  assert.equal(button.localName, "toolbarbutton");
  assert.equal(button.getAttribute("class"), "better-zen-folders-new-tab-button");
  assert.equal(button.getAttribute("data-better-zen-folders-owned"), "true");
  assert.equal(button.getAttribute("tooltiptext"), "New Tab in Folder");
  assert.equal(button.getAttribute("aria-label"), "New Tab in Folder");
  assert.deepEqual(fixture.row.children, [button, fixture.resetButton]);
});

test("button visibility hover inserts one control and projects the hover mode", () => {
  const fixture = makeFolderButtonFixture({ newTabButtonVisibility: "hover" });
  fixture.manager.start({});

  assert.equal(fixture.ownedButtons().length, 1);
  assert.equal(fixture.root.getAttribute("better-zen-folders-new-tab-visibility"), "hover");
});

test("button visibility always inserts one control and projects the always mode", () => {
  const fixture = makeFolderButtonFixture({ newTabButtonVisibility: "always" });
  fixture.manager.start({});

  assert.equal(fixture.ownedButtons().length, 1);
  assert.equal(fixture.root.getAttribute("better-zen-folders-new-tab-visibility"), "always");
});

test("button visibility hidden removes owned controls but leaves the native reset control", () => {
  const fixture = makeFolderButtonFixture({ newTabButtonVisibility: "hidden" });
  fixture.manager.start({});

  assert.equal(fixture.ownedButtons().length, 0);
  assert.deepEqual(fixture.row.children, [fixture.resetButton]);
  assert.equal(fixture.root.getAttribute("better-zen-folders-new-tab-visibility"), "hidden");
});

test("button visibility changes immediately reconcile every regular folder", () => {
  const fixture = makeFolderButtonFixture({
    newTabButtonVisibility: "hover",
    regularFolderCount: 2,
  });
  fixture.manager.start({});
  assert.deepEqual(fixture.folders.map(folder => fixture.ownedButtonsFor(folder).length), [1, 1]);
  fixture.setVisibility("hidden");

  assert.deepEqual(fixture.folders.map(folder => fixture.ownedButtonsFor(folder).length), [0, 0]);
  fixture.setVisibility("always");
  assert.deepEqual(fixture.folders.map(folder => fixture.ownedButtonsFor(folder).length), [1, 1]);
  assert.equal(fixture.root.getAttribute("better-zen-folders-new-tab-visibility"), "always");
});

test("pointer activation opens Zen's dialogue without toggling the folder row", async () => {
  const fixtureTransaction = makeRecordingNewTabTransaction();
  const fixture = makeFolderButtonFixture({ newTabTransaction: fixtureTransaction });
  fixture.manager.reconcile(fixture.folder);
  const events = fixture.ownedButtons()[0].activateByPointer();
  await Promise.resolve();

  assert.equal(events.click.defaultPrevented, false);
  assert.equal(events.click.propagationStopped, true);
  assert.equal(fixtureTransaction.activations.length, 1);
  assert.equal(fixture.rowToggleCount(), 0);
});

test("command activation is isolated and opens Zen's dialogue", async () => {
  const fixtureTransaction = makeRecordingNewTabTransaction();
  const fixture = makeFolderButtonFixture({ newTabTransaction: fixtureTransaction });
  fixture.manager.reconcile(fixture.folder);
  const command = fixture.ownedButtons()[0].dispatch("command");
  await Promise.resolve();

  assert.equal(command.defaultPrevented, true);
  assert.equal(command.propagationStopped, true);
  assert.deepEqual(fixtureTransaction.activations, [fixture.folder]);
});

test("TabOpen uses documentGlobal and groups the chosen tab", async () => {
  const fixture = makeBrowserNewTabHost({ dialogueOpen: true });
  const pending = fixture.transaction.activate(fixture.folder);
  const tab = fixture.emitTabOpen({ documentGlobal: fixture.host, ownerGlobal: undefined });
  fixture.host.gBrowser.selectedTab = tab;
  fixture.emitZenURLBarClosed({ onElementPicked: true });
  assert.equal(await pending, true);
  assert.deepEqual(fixture.folderTabs(), [tab]);
});

test("TabOpen falls back to ownerDocument.defaultView when documentGlobal is unavailable", async () => {
  const fixture = makeBrowserNewTabHost({ dialogueOpen: true });
  const pending = fixture.transaction.activate(fixture.folder);
  const tab = fixture.emitTabOpen({
    documentGlobal: undefined,
    ownerDocument: { defaultView: fixture.host },
  });
  fixture.host.gBrowser.selectedTab = tab;
  fixture.emitZenURLBarClosed({ onElementPicked: true });

  assert.equal(await pending, true);
  assert.deepEqual(fixture.folderTabs(), [tab]);
});

test("TabOpen waits for Zen's delayed confirmed choice", async () => {
  const fixture = makeBrowserNewTabHost({ dialogueOpen: true });
  const pending = fixture.transaction.activate(fixture.folder);
  fixture.emitTabOpen();
  let settled = false;
  pending.then(() => { settled = true; });
  await Promise.resolve();

  assert.equal(settled, false);
  assert.equal(fixture.host.listenerCount("ZenURLBarClosed"), 1);
  fixture.emitZenURLBarClosed({ onElementPicked: true });
  assert.equal(await pending, true);
});

test("Zen may reuse the same initially empty tab without TabOpen", async () => {
  const fixture = makeBrowserNewTabHost({ selectedTabEmpty: true });
  const initial = fixture.selectedTab();
  const pending = fixture.transaction.activate(fixture.folder);
  fixture.navigateSelectedTab("https://example.test/");
  fixture.emitZenURLBarClosed({ onElementPicked: true });

  assert.equal(await pending, true);
  assert.deepEqual(fixture.folderTabs(), [initial]);
});

test("Zen may reuse the same initially empty tab when only its browser URI changes", async () => {
  const fixture = makeBrowserNewTabHost({ selectedTabEmpty: true });
  const initial = fixture.selectedTab();
  const pending = fixture.transaction.activate(fixture.folder);
  fixture.navigateSelectedTabURIOnly("https://example.test/uri-only");
  fixture.emitZenURLBarClosed({ onElementPicked: true });

  assert.equal(initial.isEmpty, true);
  assert.equal(await pending, true);
  assert.deepEqual(fixture.folderTabs(), [initial]);
});

test("switching to an existing tab never steals it into the folder", async () => {
  const fixture = makeBrowserNewTabHost({ selectedTabEmpty: false });
  const pending = fixture.transaction.activate(fixture.folder);
  fixture.selectExistingTab();
  fixture.emitZenURLBarClosed({ onElementPicked: true });

  assert.equal(await pending, false);
  assert.deepEqual(fixture.folderTabs(), []);
});

test("dialogue cancellation never groups a captured tab", async () => {
  const fixture = makeBrowserNewTabHost({ dialogueOpen: true });
  const pending = fixture.transaction.activate(fixture.folder);
  fixture.emitTabOpen();
  fixture.emitZenURLBarClosed();
  assert.equal(await pending, false);
  assert.deepEqual(fixture.folderTabs(), []);
  assert.equal(fixture.tabContainer.listenerCount("TabOpen"), 0);
});

test("folder dialogue groups its selected new tab instead of an earlier background open", async () => {
  const fixture = makeBrowserNewTabHost({ dialogueOpen: true, selectedTabEmpty: false });
  const pending = fixture.transaction.activate(fixture.folder);
  const background = fixture.emitTabOpen({ documentGlobal: fixture.host });
  const chosen = fixture.emitTabOpen({ documentGlobal: fixture.host });
  fixture.host.gBrowser.selectedTab = chosen;
  fixture.emitZenURLBarClosed({ onElementPicked: true });
  assert.equal(await pending, true);
  assert.deepEqual(fixture.folderTabs(), [chosen]);
  assert.deepEqual(fixture.state.pinnedTabs, [chosen]);
  assert.equal(fixture.folderTabs().includes(background), false);
});

test("a background open cannot turn an existing-tab switch into a folder insertion", async () => {
  const fixture = makeBrowserNewTabHost({ dialogueOpen: true, selectedTabEmpty: false });
  const pending = fixture.transaction.activate(fixture.folder);
  fixture.emitTabOpen({ documentGlobal: fixture.host });
  const existing = fixture.selectExistingTab();
  fixture.emitZenURLBarClosed({ onElementPicked: true });
  assert.equal(await pending, false);
  assert.deepEqual(fixture.folderTabs(), []);
  assert.deepEqual(fixture.state.pinnedTabs, []);
  assert.equal(fixture.selectedTab(), existing);
});

test("a reused empty tab wins over unrelated background opens", async () => {
  const fixture = makeBrowserNewTabHost({ dialogueOpen: true, selectedTabEmpty: true });
  const initial = fixture.selectedTab();
  const pending = fixture.transaction.activate(fixture.folder);
  fixture.emitTabOpen({ documentGlobal: fixture.host });
  fixture.navigateSelectedTab("https://chosen.test/");
  fixture.emitZenURLBarClosed({ onElementPicked: true });
  assert.equal(await pending, true);
  assert.deepEqual(fixture.folderTabs(), [initial]);
});

test("button reconciliation removes only the owned control when a folder becomes live", () => {
  const fixture = makeFolderButtonFixture();
  const manager = new FolderButtonManager(fixture.adapters);

  manager.reconcile(fixture.folder);
  fixture.folder.isLiveFolder = true;
  manager.reconcile(fixture.folder);

  assert.equal(fixture.ownedButtons().length, 0);
  assert.deepEqual(fixture.row.children, [fixture.resetButton]);
});

test("eligibility change removes the owned button without directly reconciling", () => {
  const fixture = makeFolderButtonFixture();
  const manager = new FolderButtonManager(fixture.adapters);

  manager.start({});
  fixture.folder.isLiveFolder = true;
  fixture.notifyEligibilityChange();

  assert.equal(fixture.ownedButtons().length, 0);
  assert.deepEqual(fixture.row.children, [fixture.resetButton]);
});

test("button visibility removes a regular folder control after it becomes live in every mode", () => {
  for (const mode of ["hover", "always", "hidden"]) {
    const fixture = makeFolderButtonFixture({ newTabButtonVisibility: mode });
    fixture.manager.start({});
    fixture.folder.isLiveFolder = true;
    fixture.notifyEligibilityChange();
    assert.equal(fixture.ownedButtons().length, 0, mode);
    assert.deepEqual(fixture.row.children, [fixture.resetButton], mode);
  }
});

test("button reconciliation waits for the native reset anchor instead of appending", () => {
  const fixture = makeFolderButtonFixture();
  const manager = new FolderButtonManager(fixture.adapters);
  fixture.resetButton.remove();

  manager.reconcile(fixture.folder);

  assert.equal(fixture.ownedButtons().length, 0);
  assert.deepEqual(fixture.row.children, []);
});

test("button manager reconciles on startup and tab-container child changes", () => {
  const fixture = makeFolderButtonFixture();
  const manager = new FolderButtonManager(fixture.adapters);

  manager.start({});
  fixture.ownedButtons()[0].remove();
  fixture.observer().notify();

  assert.equal(fixture.ownedButtons().length, 1);
  assert.deepEqual(fixture.observer().observed, [{
    target: fixture.tabContainer,
    options: { childList: true, subtree: true },
  }]);
});

test("button manager cleanup removes owned controls without touching the native reset control", () => {
  const fixture = makeFolderButtonFixture();
  const manager = new FolderButtonManager(fixture.adapters);

  manager.start({});
  manager.destroy();

  assert.equal(fixture.ownedButtons().length, 0);
  assert.deepEqual(fixture.row.children, [fixture.resetButton]);
  assert.equal(fixture.observer().disconnects, 1);
  assert.equal(fixture.eligibilityStops(), 1);
  assert.equal(fixture.visibilitySubscriberCount(), 0);
  assert.equal(fixture.root.getAttribute("better-zen-folders-new-tab-visibility"), null);
  assert.equal(fixture.root.getAttribute("another-mod-attribute"), "keep");
});

test("bootstrap leaves non-browser XHTML windows untouched", () => {
  const calls = [];
  const { host, unloadListeners } = makeBrowserHost("about:blank", calls);
  const oldController = { destroy: () => calls.push("old:destroy") };
  host.__betterZenFoldersController = oldController;

  bootstrapBrowserWindow(host);

  assert.equal(host.__betterZenFoldersController, oldController);
  assert.deepEqual(calls, []);
  assert.deepEqual(unloadListeners, []);
});

test("browser XHTML bootstrap destroys the old controller before starting its replacement", () => {
  const calls = [];
  const { host, unloadListeners } = makeBrowserHost(
    "chrome://browser/content/browser.xhtml",
    calls,
  );
  host.__betterZenFoldersController = { destroy: () => calls.push("old:destroy") };

  bootstrapBrowserWindow(host);

  assert.deepEqual(calls.slice(0, 2), ["old:destroy", "query:zen-folder"]);
  assert.equal(unloadListeners.length, 1);
  assert.equal(unloadListeners[0], host.__betterZenFoldersController.boundDestroy);
  assert.equal(
    host.document.documentElement.getAttribute("better-zen-folders-new-tab-visibility"),
    "hover",
  );
});

test("browser XHTML unload callback destroys its controller managers exactly once", () => {
  const calls = [];
  const { host, unloadListeners, mutationObservers } = makeBrowserHost(
    "chrome://browser/content/browser.xhtml",
    calls,
  );

  bootstrapBrowserWindow(host);
  const unload = unloadListeners[0];
  unload();
  unload();

  assert.equal(unload, host.__betterZenFoldersController.boundDestroy);
  assert.equal(host.__betterZenFoldersController.started, false);
  assert.equal(mutationObservers[0].disconnects, 1);
});

test("browser bootstrap shares one population registry across restore, new-tab, and cleanup", () => {
  const calls = [];
  const { host } = makeBrowserHost("chrome://browser/content/browser.xhtml", calls);
  host.SessionStore = {
    getCustomTabValue: () => "",
    setCustomTabValue: () => {},
  };
  host.gZenUIManager = { handleNewTab: () => false };

  bootstrapBrowserWindow(host);

  const managers = host.__betterZenFoldersController.adapters.managers;
  assert.ok(managers.some(manager => manager instanceof FolderPinRuntime), 'normal controller must own URL-pin runtime and teardown');
  const restore = managers.find(manager => manager instanceof FolderRestoreManager);
  const cleanup = managers.find(manager => manager instanceof EmptyRegularFolderManager);
  const buttons = managers.find(manager => manager instanceof FolderButtonManager);
  assert.ok(restore);
  assert.ok(cleanup);
  assert.ok(buttons?.newTabTransaction);
  assert.equal(restore.adapters.populationRegistry, cleanup.populationRegistry);
  assert.equal(buttons.newTabTransaction.adapters.populationRegistry, cleanup.populationRegistry);
  assert.ok(managers.indexOf(cleanup) > managers.indexOf(restore));
  assert.ok(managers.indexOf(cleanup) > managers.indexOf(buttons));
});

test("full SessionStore startup reaches folder controls with the real typed preferences", async () => {
  const calls = [];
  const {host, unloadListeners, preferenceFixture} = makeBrowserHost("chrome://browser/content/browser.xhtml", calls);
  host.document.getElementById = () => null;
  host.setTimeout = setTimeout; host.clearTimeout = clearTimeout;
  host.SessionStore = {
    getCustomTabValue: () => "", setCustomTabValue() {},
    getCustomWindowValue: () => "", setCustomWindowValue() {},
    promiseAllWindowsRestored: Promise.resolve(),
  };
  host.gZenWorkspaces = {promiseInitialized: Promise.resolve()};
  host.console = {error: error => {throw error;}};
  try {
    assert.doesNotThrow(() => bootstrapBrowserWindow(host));
    await Promise.resolve();
    assert.equal(host.document.documentElement.getAttribute("better-zen-folders-new-tab-visibility"), "hover");
    assert.equal(unloadListeners.length, 1);
    const before = calls.length;
    preferenceFixture.set("better-zen-folders.subfolder-collapse-policy", "all");
    preferenceFixture.notify("better-zen-folders.subfolder-collapse-policy");
    await new Promise(resolve => setTimeout(resolve, 5));
    assert.ok(calls.length > before, "live visibility settings refresh the actual running manager");
  } finally { host.__betterZenFoldersController?.destroy(); }
});
