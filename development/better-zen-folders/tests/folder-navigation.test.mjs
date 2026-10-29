import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import * as bzf from "../scripts/better-zen-folders.uc.mjs";

// Source-based replay, not a second implementation of Zen's routing policy.
// Installed Zen 1.22.2b, build 20260915091052, source e74571eead515d37edd0914739f744bcb5258c51.
// browser/omni.ja chrome/browser/content/browser/ZenUIManager.mjs:932-954
// SHA-256 3ce07ab0e6c76d39ca6c190670b11badbdbda6aa5a385f6577b6dd08d2cd3cc4.
function nativeRoutingHelper(Services, gBrowser, console) {
  return {
  urlStringsDomainMatch(url1, url2) {
    if (!url1.startsWith("http") || !url2?.startsWith("http")) {
      return false;
    }
    return Services.io.newURI(url1).host === Services.io.newURI(url2).host;
  },

  getOpenUILinkWhere(url, browser, openUILinkWhere) {
    try {
      let tab = gBrowser.getTabForBrowser(browser);
      if (
        openUILinkWhere === "current" &&
        !this.urlStringsDomainMatch(url, browser.currentURI.spec) &&
        tab.pinned &&
        Services.prefs.getBoolPref("zen.tabs.open-pinned-in-new-tab")
      ) {
        return "tab";
      }
    } catch (e) {
      console.error("Error in getOpenUILinkWhere:", e);
    }
    return openUILinkWhere;
  },
  };
}

const KeyEvent = { DOM_VK_RETURN: 13 };
const losslessDecodeURL = url => url.href;
class NativeUrlbarNavigationFixture {
  #isAddressbar = true;
  constructor(host, load) {
    this.window = host;
    this.controller = { loadURL: load };
    this.inputField = { setSelectionRange() {} };
    this.view = { close() {} };
  }
  handleRevert() {}
  #notifyStartNavigation() {}
  navigate(options) { return this.#loadURL(options); }

  // Verbatim UrlbarInputBase.mjs:4512-4609; the shell above substitutes only
  // rendering/telemetry and the actual browser-load boundary, not destination
  // selection or allowPinnedTabHostChange propagation.
  // Whole entry SHA-256 20413b0fbb9a68864f5b0afacd0e05fec2c6f85daf220a0dfeb179aef0235a77.
  async #loadURL({
    loadRequest,
    event,
    where,
    params,
    resultDetails = null,
    keepViewOpen = false,
    browserId = null,
  }) {
    where = this.window.gZenUIManager.getOpenUILinkWhere(
      loadRequest.urlLoad?.url ?? "",
      this.window.gBrowser.selectedBrowser,
      where
    );
    let keyDownEnterDeferred;
    if (
      this._keyDownEnterDeferred &&
      event?.keyCode === KeyEvent.DOM_VK_RETURN &&
      where === "current"
    ) {
      // In this case, we move the focus to the browser that loads the content
      // upon key up the enter key.
      // To do it, send avoidBrowserFocus flag to openTrustedLinkIn() to avoid
      // focusing on the browser in the function. And also, set loadedContent
      // flag that whether the content is loaded in the current tab by this enter
      // key. The load resolves the deferred with the loaded browser's id, which
      // key up hands to the parent to focus.
      params.avoidBrowserFocus = true;
      this._keyDownEnterDeferred.loadedContent = true;
      keyDownEnterDeferred = this._keyDownEnterDeferred;
    }

    let userTypedValue;
    if (this.#isAddressbar && where == "current") {
      if (loadRequest.engineSearch) {
        this.value = loadRequest.engineSearch.query;
      } else {
        let { url } = loadRequest.urlLoad;
        // Make sure URL is formatted properly (don't show punycode).
        try {
          this.value = losslessDecodeURL(new URL(url));
        } catch {
          this.value = url;
        }
      }
      userTypedValue = this.value;
    }

    params.allowThirdPartyFixup = true;

    if (where == "current") {
      params.indicateErrorPageLoad = true;
      params.allowPinnedTabHostChange = this.#isAddressbar;
      params.allowPopups =
        loadRequest.urlLoad?.url.startsWith("javascript:") ?? false;
    }

    // Ensure the window gets the `private` feature if the current window
    // is private, unless the caller explicitly requested not to.
    if (this.isPrivate && !("private" in params)) {
      params.private = true;
    }

    // Make sure the domain name stays visible for spoof protection and
    // usability. The browser itself is focused parent-side, where the load
    // runs against the chrome window.
    if (!params.avoidBrowserFocus) {
      this.inputField.setSelectionRange(0, 0);
    }

    if (where != "current" && !this.isSearchbarSAP) {
      this.handleRevert();
    }

    // Notify about the start of navigation.
    this.#notifyStartNavigation(resultDetails);

    let loadStatus = await this.controller.loadURL({
      loadRequest,
      where,
      params,
      browserId,
      userTypedValue,
    });
    // Hand the loaded browser's id to the deferred-Enter key up handler so it
    // can focus it parent-side.
    keyDownEnterDeferred?.resolve(loadStatus.browserId);
    // The load can throw parent-side; unless an error page was shown we
    // replace the URL with the loaded one.
    if (loadStatus.reverted) {
      this.handleRevert();
    }
    if (!keepViewOpen) {
      // If we show the focus border after closing the view, it would appear
      // to flash since this._on_blur would remove it immediately after.
      this.view.close({ showFocusBorder: false });
    }
  }
}

function fixture(t, { install = true, pinnedRedirect = true, placement = "folder" } = {}) {
  const errors = [], loads = [], opened = [], urlbarAttributes = new Set();
  const browser = { currentURI: { spec: "https://www.youtube.com/" } };
  const folder = { isZenFolder: true, isLiveFolder: false, isConnected: true };
  const tabAttributes = new Set();
  const tab = { pinned: true, isConnected: true, closing: false, group: folder,
    linkedBrowser: browser, hasAttribute: name => tabAttributes.has(name),
    closest: selector => selector === "zen-folder" && tab.group?.isZenFolder ? tab.group : null };
  if (placement !== "folder") {
    tab.parentElement = { matches: selector => selector === ".zen-workspace-pinned-tabs-section" };
    // Native tab.js:419-432 returns collapsiblePins when workspace pins are
    // collapsed, and undefined for an ordinary ungrouped pin otherwise.
    tab.group = placement === "collapsed root" ? { isZenFolder: false, collapsed: true } : undefined;
  }
  const host = { gBrowser: { selectedBrowser: browser, selectedTab: tab,
      getTabForBrowser: candidate => candidate === browser ? tab : null },
    gURLBar: { focused: true, hasAttribute: name => urlbarAttributes.has(name) },
    console: { error: (...args) => errors.push(args) } };
  tab.ownerGlobal = folder.ownerGlobal = host;
  const Services = { io: { newURI: url => new URL(url) }, prefs: {
    getBoolPref(name) { assert.equal(name, "zen.tabs.open-pinned-in-new-tab"); return pinnedRedirect; },
    setBoolPref() { throw new Error("navigation must not change a native preference"); },
  } };
  host.Services = Services;
  host.gZenUIManager = nativeRoutingHelper(Services, host.gBrowser, host.console);
  const original = host.gZenUIManager.getOpenUILinkWhere;
  const manager = install && bzf.FolderNavigationManager ? new bzf.FolderNavigationManager(host) : null;
  manager?.start();
  t.after(() => manager?.destroy());
  const urlbar = new NativeUrlbarNavigationFixture(host, request => {
    loads.push(request);
    if (request.where === "current") browser.currentURI.spec = request.loadRequest.urlLoad?.url ?? "search-result";
    else opened.push(request.where);
    return { browserId: 7, reverted: false };
  });
  return { host, browser, folder, tab, tabAttributes, urlbarAttributes, manager, original, errors, loads, opened, urlbar,
    navigate: (url = "https://www.wikipedia.org/", where = "current") => urlbar.navigate({
      loadRequest: { urlLoad: { url, postData: null } }, where, params: {}, event: { keyCode: 13 },
    }) };
}

test("installed native pinned preference redirects an ordinary cross-host folder URL-bar load without a new-tab transaction", async t => {
  const f = fixture(t, { install: false });
  await f.navigate();
  assert.deepEqual(f.opened, ["tab"]);
  assert.equal(f.browser.currentURI.spec, "https://www.youtube.com/");
  assert.equal(f.loads[0].params.allowPinnedTabHostChange, undefined);
  assert.deepEqual(f.errors, []);
});

// Break caught: retaining Zen's pinned-tab cross-host diversion for a normal
// selected folder tab makes an extra tab and leaves the requested tab unchanged.
test("ordinary cross-host URL-bar navigation stays in the selected regular-folder tab", async t => {
  const f = fixture(t);
  await f.navigate();
  assert.deepEqual(f.opened, [], "ordinary navigation must not create a new tab");
  assert.equal(f.browser.currentURI.spec, "https://www.wikipedia.org/");
  assert.equal(f.loads[0].where, "current");
  assert.equal(f.loads[0].params.allowPinnedTabHostChange, true);
  assert.equal(f.loads.length, 1);
  assert.equal(f.tab.pinned, true);
  assert.equal(f.tab.group, f.folder);
  assert.deepEqual(f.errors, []);
});

// Break caught: rejecting top-level pins (including the native collapsed-pins
// group) diverts this real native caller/helper replay into an extra tab.
for (const placement of ["root", "collapsed root"]) {
  test(`ordinary cross-host URL-bar navigation stays in the selected ${placement} pin`, async t => {
    const f = fixture(t, { placement }), group = f.tab.group, parent = f.tab.parentElement;
    await f.navigate();
    assert.deepEqual(f.opened, [], "ordinary root-pin navigation must not create a new tab");
    assert.equal(f.browser.currentURI.spec, "https://www.wikipedia.org/");
    assert.equal(f.loads[0].where, "current");
    assert.equal(f.loads[0].params.allowPinnedTabHostChange, true);
    assert.equal(f.loads.length, 1);
    assert.equal(f.host.gBrowser.selectedTab, f.tab);
    assert.equal(f.tab.pinned, true);
    assert.equal(f.tab.group, group);
    assert.equal(f.tab.parentElement, parent);
    assert.deepEqual(f.errors, []);
  });
}

for (const placement of ["folder", "root"]) {
for (const where of ["tab", "tabshifted", "window", "save"]) {
  test(`native URL-bar caller preserves explicit ${where} destination for a ${placement} pin`, async t => {
    const f = fixture(t, { placement });
    await f.navigate("https://www.wikipedia.org/", where);
    assert.deepEqual(f.opened, [where]);
    assert.equal(f.browser.currentURI.spec, "https://www.youtube.com/");
    assert.equal(f.loads[0].params.allowPinnedTabHostChange, undefined);
  });
}
}

test("an explicit destination stays explicit even if a native adapter returns tab", async t => {
  const f = fixture(t, { install: false });
  const calls = [];
  f.host.gZenUIManager.getOpenUILinkWhere = function (...args) { calls.push({ receiver: this, args }); return "tab"; };
  const manager = new bzf.FolderNavigationManager(f.host);
  manager.start(); t.after(() => manager.destroy());
  for (const where of ["tab", "tabshifted", "window", "save"]) await f.navigate("https://www.wikipedia.org/", where);
  assert.deepEqual(f.opened, ["tab", "tab", "tab", "tab"]);
  assert.deepEqual(calls.map(call => call.args[2]), ["tab", "tabshifted", "window", "save"]);
  assert.ok(calls.every(call => call.receiver === f.host.gZenUIManager));
  assert.equal(f.browser.currentURI.spec, "https://www.youtube.com/");
});

for (const placement of ["folder", "root"]) {
for (const excluded of ["pin outside the pinned section", "Essential", "live folder", "placeholder", "disconnected tab",
  "closing tab", "disconnected folder", "unfocused URL bar", "new-tab UI", "retiring new-tab session", "unrelated selected tab"]) {
  if (placement === "root" && ["live folder", "disconnected folder"].includes(excluded)) continue;
  test(`${excluded} retains native pinned-tab navigation (${placement})`, async t => {
    const f = fixture(t, { placement });
    if (excluded === "pin outside the pinned section") {
      f.tab.group = null;
      f.tab.parentElement = { matches: () => false };
    }
    if (excluded === "Essential") f.tabAttributes.add("zen-essential");
    if (excluded === "live folder") f.folder.isLiveFolder = true;
    if (excluded === "placeholder") f.tabAttributes.add("zen-empty-tab");
    if (excluded === "disconnected tab") f.tab.isConnected = false;
    if (excluded === "closing tab") f.tab.closing = true;
    if (excluded === "disconnected folder") f.folder.isConnected = false;
    if (excluded === "unfocused URL bar") f.host.gURLBar.focused = false;
    if (excluded === "new-tab UI") f.urlbarAttributes.add("zen-newtab");
    if (excluded === "retiring new-tab session") f.host.gZenUIManager._urlbarOwner = 12;
    if (excluded === "unrelated selected tab") f.host.gBrowser.selectedTab = { ...f.tab };
    await f.navigate();
    assert.deepEqual(f.opened, ["tab"]);
    assert.equal(f.browser.currentURI.spec, "https://www.youtube.com/");
    assert.equal(f.loads[0].params.allowPinnedTabHostChange, undefined);
  });
}
}

test("Alt+Enter's resolved new-tab destination stays native for a root pin", async t => {
  const f = fixture(t, { placement: "root" });
  await f.urlbar.navigate({ loadRequest: { urlLoad: { url: "https://www.wikipedia.org/" } },
    event: { keyCode: 13, altKey: true }, where: "tab", params: {} });
  assert.deepEqual(f.opened, ["tab"]);
  assert.equal(f.browser.currentURI.spec, "https://www.youtube.com/");
  assert.equal(f.loads[0].params.allowPinnedTabHostChange, undefined);
});

test("unpinned root-section tabs retain the native routing result", async t => {
  const f = fixture(t, { placement: "root" });
  f.tab.pinned = false;
  await f.navigate();
  assert.deepEqual(f.opened, []);
  assert.equal(f.loads[0].where, "current");
  assert.equal(f.browser.currentURI.spec, "https://www.wikipedia.org/");
  assert.equal(f.tab.pinned, false);
});

test("root-pin navigation cannot override another window's browser or native receiver", t => {
  const f = fixture(t, { placement: "root" }), other = fixture(t, { placement: "root" });
  const wrapper = f.host.gZenUIManager.getOpenUILinkWhere;
  const url = "https://www.wikipedia.org/";
  // A native helper capable of resolving both browsers must still be fenced by
  // the adapter's selected-browser identity and native-receiver ownership.
  f.host.gBrowser.getTabForBrowser = browser => browser === f.browser ? f.tab : other.tab;
  assert.equal(wrapper.call(f.host.gZenUIManager, url, other.browser, "current"), "tab");
  assert.equal(wrapper.call(other.host.gZenUIManager, url, f.browser, "current"), "tab");
  assert.equal(wrapper.call(f.host.gZenUIManager, url, f.browser, "current"), "current");
  f.manager.destroy();
  assert.equal(f.host.gZenUIManager.getOpenUILinkWhere(url, f.browser, "current"), "tab");
  assert.equal(other.host.gZenUIManager.getOpenUILinkWhere(url, other.browser, "current"), "current");
});

test("selected split member uses actual folder ancestry rather than a workspace-pins group", async t => {
  const f = fixture(t);
  f.tab.group = { isZenFolder: false };
  f.tab.closest = selector => selector === "zen-folder" ? f.folder : null;
  await f.navigate();
  assert.deepEqual(f.opened, []);
  assert.equal(f.loads[0].where, "current");
  assert.equal(f.browser.currentURI.spec, "https://www.wikipedia.org/");
});

test("an ungrouped split member retains native pinned-tab navigation", async t => {
  const f = fixture(t);
  f.tab.group = { isZenFolder: false };
  f.tab.closest = () => null;
  await f.navigate();
  assert.deepEqual(f.opened, ["tab"]);
});

test("same-host navigation and native preference disabled retain their current-tab behavior", async t => {
  const sameHost = fixture(t);
  await sameHost.navigate("https://www.youtube.com/watch?v=fixture");
  assert.deepEqual(sameHost.opened, []);
  assert.equal(sameHost.browser.currentURI.spec, "https://www.youtube.com/watch?v=fixture");
  const disabled = fixture(t, { pinnedRedirect: false });
  await disabled.navigate();
  assert.deepEqual(disabled.opened, []);
  assert.equal(disabled.loads[0].params.allowPinnedTabHostChange, true);
});

for (const placement of ["folder", "root", "collapsed root"]) {
test(`native URL-bar search requests remain current in the selected ${placement} pin`, async t => {
  const f = fixture(t, { placement });
  const engineSearch = { query: "encyclopedia", engineId: "fixture-engine" };
  await f.urlbar.navigate({ loadRequest: { engineSearch }, where: "current", params: {} });
  assert.deepEqual(f.opened, []);
  assert.equal(f.loads[0].loadRequest.engineSearch, engineSearch);
  assert.equal(f.loads[0].userTypedValue, "encyclopedia");
  assert.equal(f.loads[0].params.allowPinnedTabHostChange, true);
});
}

test("navigation adapter delegates exactly once with receiver and extra arguments intact", t => {
  const f = fixture(t, { install: false }), calls = [], extra = { originalGesture: "fixture" };
  f.host.gZenUIManager.getOpenUILinkWhere = function (...args) {
    calls.push({ receiver: this, args });
    return f.original.apply(this, args);
  };
  const manager = new bzf.FolderNavigationManager(f.host);
  manager.start(); t.after(() => manager.destroy());
  const result = f.host.gZenUIManager.getOpenUILinkWhere("https://www.wikipedia.org/", f.browser, "current", extra);
  assert.equal(result, "current");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].receiver, f.host.gZenUIManager);
  assert.deepEqual(calls[0].args, ["https://www.wikipedia.org/", f.browser, "current", extra]);
});

test("native thrown errors are not swallowed or replaced by the adapter", t => {
  const f = fixture(t, { install: false }), failure = new Error("native failure");
  f.host.gZenUIManager.getOpenUILinkWhere = () => { throw failure; };
  const manager = new bzf.FolderNavigationManager(f.host);
  manager.start(); t.after(() => manager.destroy());
  assert.throws(() => f.host.gZenUIManager.getOpenUILinkWhere("https://www.wikipedia.org/", f.browser, "current"), error => error === failure);
});

test("start is idempotent and abort restores native navigation without retaining the old signal", async t => {
  const f = fixture(t), first = new AbortController(), second = new AbortController();
  f.manager.destroy(); f.manager.start(first.signal);
  const wrapper = f.host.gZenUIManager.getOpenUILinkWhere;
  f.manager.start(first.signal);
  assert.equal(f.host.gZenUIManager.getOpenUILinkWhere, wrapper);
  first.abort();
  assert.equal(f.host.gZenUIManager.getOpenUILinkWhere, f.original);
  await f.navigate(); assert.deepEqual(f.opened, ["tab"]);
  f.manager.start(first.signal);
  assert.equal(f.host.gZenUIManager.getOpenUILinkWhere, f.original);
  f.manager.start(second.signal);
  await f.navigate(); assert.equal(f.loads.at(-1).where, "current");
  second.abort(); f.manager.destroy();
  assert.equal(f.host.gZenUIManager.getOpenUILinkWhere, f.original);
});

test("destroy preserves a later mod wrapper and deactivates the retained BZF wrapper inside it", async t => {
  const f = fixture(t), ours = f.host.gZenUIManager.getOpenUILinkWhere;
  let calls = 0;
  const later = function (...args) { calls++; return ours.apply(this, args); };
  f.host.gZenUIManager.getOpenUILinkWhere = later;
  f.manager.destroy();
  assert.equal(f.host.gZenUIManager.getOpenUILinkWhere, later);
  await f.navigate();
  assert.equal(calls, 1);
  assert.deepEqual(f.opened, ["tab"]);
});

for (const inherited of [false, true]) {
  test(`destroy restores the exact ${inherited ? "inherited" : "own"} native method descriptor`, async t => {
    const f = fixture(t, { install: false });
    const nativeUI = f.host.gZenUIManager;
    const nativeDescriptor = { value: f.original, writable: true, enumerable: false, configurable: true };
    Object.defineProperty(nativeUI, "getOpenUILinkWhere", nativeDescriptor);
    if (inherited) f.host.gZenUIManager = Object.create(nativeUI);
    const ui = f.host.gZenUIManager;
    const ownBefore = Object.getOwnPropertyDescriptor(ui, "getOpenUILinkWhere");
    const prototypeBefore = Object.getPrototypeOf(ui);
    const manager = new bzf.FolderNavigationManager(f.host);
    manager.start(); t.after(() => manager.destroy());
    assert.equal(Object.hasOwn(ui, "getOpenUILinkWhere"), true);
    await f.navigate(); assert.equal(f.loads.at(-1).where, "current");
    manager.destroy(); manager.destroy();
    assert.deepEqual(Object.getOwnPropertyDescriptor(ui, "getOpenUILinkWhere"), ownBefore);
    assert.equal(Object.getPrototypeOf(ui), prototypeBefore);
    assert.deepEqual(Object.getOwnPropertyDescriptor(nativeUI, "getOpenUILinkWhere"), nativeDescriptor);
    assert.equal(ui.getOpenUILinkWhere, f.original);
    await f.navigate("https://example.net/"); assert.equal(f.loads.at(-1).where, "tab");
  });
}

test("destroy leaves a later own descriptor intact over an inherited native method", async t => {
  const f = fixture(t, { install: false });
  const nativeUI = f.host.gZenUIManager;
  f.host.gZenUIManager = Object.create(nativeUI);
  const manager = new bzf.FolderNavigationManager(f.host);
  manager.start(); t.after(() => manager.destroy());
  const ours = f.host.gZenUIManager.getOpenUILinkWhere;
  const laterDescriptor = { value: function (...args) { return ours.apply(this, args); },
    writable: false, enumerable: false, configurable: true };
  Object.defineProperty(f.host.gZenUIManager, "getOpenUILinkWhere", laterDescriptor);
  manager.destroy(); manager.destroy();
  assert.deepEqual(Object.getOwnPropertyDescriptor(f.host.gZenUIManager, "getOpenUILinkWhere"), laterDescriptor);
  assert.equal(nativeUI.getOpenUILinkWhere, f.original);
  await f.navigate(); assert.deepEqual(f.opened, ["tab"]);
});

for (const split of [false, true]) {
  test(`native URL-bar routing on real ${split ? "split-member" : "direct-tab"} folder DOM preserves the selected tab`,
    { skip: process.env.BZF_PLAYWRIGHT_MODULE ? false : "set BZF_PLAYWRIGHT_MODULE for isolated native URL-bar replay" }, async () => {
      const source = await readFile(new URL("../scripts/better-zen-folders.uc.mjs", import.meta.url), "utf8");
      const { chromium } = createRequire(import.meta.url)(process.env.BZF_PLAYWRIGHT_MODULE);
      const browser = await chromium.launch({ headless: true });
      try {
        const page = await browser.newPage(), errors = [];
        page.on("pageerror", error => errors.push(error.message));
        await page.route("**/*", route => route.abort());
        await page.setContent('<input id="urlbar"><div id="tabs"><zen-folder id="folder"><div id="items"><tab id="selected"></tab></div></zen-folder></div>');
        const actual = await page.evaluate(async ({ source, policy, caller, split }) => {
          const moduleURL = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
          const api = await import(moduleURL); URL.revokeObjectURL(moduleURL);
          const folder = document.getElementById("folder"), tab = document.getElementById("selected"), bar = document.getElementById("urlbar");
          Object.assign(folder, { isZenFolder: true, isLiveFolder: false });
          if (split) {
            const wrapper = document.createElement("tab-split-view-wrapper");
            tab.replaceWith(wrapper); wrapper.append(tab);
          }
          const current = { currentURI: { spec: "https://www.youtube.com/" } };
          Object.assign(tab, { pinned: true, group: split ? { isZenFolder: false } : folder, linkedBrowser: current });
          Object.defineProperty(bar, "focused", { get: () => document.activeElement === bar });
          const host = { gBrowser: { selectedBrowser: current, selectedTab: tab, getTabForBrowser: candidate => candidate === current ? tab : null }, gURLBar: bar };
          const Services = { io: { newURI: value => new URL(value) }, prefs: { getBoolPref: () => true } };
          host.gZenUIManager = eval(`(${policy})`)(Services, host.gBrowser, console);
          const KeyEvent = { DOM_VK_RETURN: 13 }, losslessDecodeURL = url => url.href;
          const NativeCaller = eval(`(${caller})`), loads = [];
          const urlbar = new NativeCaller(host, request => { loads.push(request); return { browserId: 1 }; });
          urlbar.inputField = bar;
          const manager = new api.FolderNavigationManager(host); manager.start();
          bar.focus();
          await urlbar.navigate({ loadRequest: { urlLoad: { url: "https://www.wikipedia.org/" } }, where: "current", params: {} });
          manager.destroy();
          return { where: loads[0].where, allowPinnedTabHostChange: loads[0].params.allowPinnedTabHostChange,
            pinned: tab.pinned, folderIntact: tab.closest("zen-folder") === folder, selected: host.gBrowser.selectedTab === tab,
            nativeRestored: host.gZenUIManager.getOpenUILinkWhere("https://www.wikipedia.org/", current, "current") };
        }, { source, policy: nativeRoutingHelper.toString(), caller: NativeUrlbarNavigationFixture.toString(), split });
        assert.deepEqual(actual, { where: "current", allowPinnedTabHostChange: true, pinned: true, folderIntact: true, selected: true, nativeRestored: "tab" });
        assert.deepEqual(errors, []);
      } finally { await browser.close(); }
    });
}
