import test from "node:test";
import assert from "node:assert/strict";
import {
  createBrowserNewTabTransactionAdapters, NewTabInFolderTransaction, FolderPopulationRegistry,
} from "../scripts/better-zen-folders.uc.mjs";
import { FakeEventTarget, makeRegularFolder } from "./fakes.mjs";
import { createNativeNewTabManager } from "./fixtures/zen-1.22.2b-new-tab.mjs";

// Native methods and their timer ordering are unmodified. Only browser services,
// event dispatch and mutation delivery are simulated; this does not launch Zen.
function fixture(t, { empty = false } = {}) {
  const events = new FakeEventTarget(), tabContainer = new FakeEventTarget();
  const observers = new Set(), timers = new Map(), attributes = new Map();
  const pinned = [], errors = [], closeEvents = [];
  let nextTimer = 0;
  const notifyMutation = name => {
    for (const observer of observers) {
      if (!observer.filter.includes(name) || observer.queued) continue;
      observer.queued = true;
      queueMicrotask(() => {
        observer.queued = false;
        if (observers.has(observer)) observer.callback([{ attributeName: name }]);
      });
    }
  };
  const host = {
    closed: false,
    addEventListener: (...args) => events.addEventListener(...args),
    removeEventListener: (...args) => events.removeEventListener(...args),
    dispatchEvent(event) { events.emit(event.type, event); return true; },
    setTimeout(callback, delay = 0) { const id = ++nextTimer; timers.set(id, {callback, delay}); return id; },
    clearTimeout: id => timers.delete(id),
    MutationObserver: class {
      constructor(callback) { this.callback = callback; }
      observe(target, options) {
        assert.equal(target, host.gURLBar);
        this.filter = options.attributeFilter;
        observers.add(this);
      }
      disconnect() { observers.delete(this); }
    },
    console: { error: (...args) => errors.push(args), warn: (...args) => errors.push(args) },
    gZenWorkspaces: {activeWorkspace: "space"},
    gBrowser: {
      tabContainer, pinTab: tab => pinned.push(tab), removeTab() { throw new Error("must not discard a tab"); },
    },
    gURLBar: {
      focused: false, _untrimmedValue: "", view: { close() {} },
      hasAttribute: name => attributes.has(name),
      setAttribute(name, value) { attributes.set(name, value); notifyMutation(name); },
      removeAttribute(name) { if (attributes.delete(name)) notifyMutation(name); },
      search() {}, handleRevert() {}, setURI() {}, updateTextOverflow() {}, getBrowserState: () => ({}),
    },
  };
  const document = {
    documentElement: {hasAttribute: () => false},
    getElementById: () => ({doCommand() { host.gURLBar.focused = true; }}),
  };
  host.gZenUIManager = createNativeNewTabManager({window:host, document,
    gBrowser:host.gBrowser, gURLBar:host.gURLBar,
    gZenVerticalTabsManager:{_canReplaceNewTab:true},
    setTimeout:host.setTimeout, clearTimeout:host.clearTimeout, CustomEvent, console:host.console});
  const makeTab = (isEmpty = false) => ({documentGlobal:host, isEmpty, isConnected:true,
    linkedBrowser:{currentURI:{spec:isEmpty ? "about:newtab" : "https://example.test/"}}});
  const initial = host.gBrowser.selectedTab = makeTab(empty);
  const folder = makeRegularFolder({ownerGlobal:host, collapsed:true,
    getAttribute:name => name === "zen-workspace-id" ? "space" : null});
  const population = new FolderPopulationRegistry();
  const tx = new NewTabInFolderTransaction(createBrowserNewTabTransactionAdapters(host,tabContainer,population));
  t.after(() => tx.destroy());
  events.addEventListener("ZenURLBarClosed", event => closeEvents.push(event.detail));
  const flush = async () => {
    for (let count=0; count<30; count++) {
      // Real mutation observers run after the native timer callback has queued
      // its second timer, never synchronously inside removeAttribute().
      await Promise.resolve();
      const next = [...timers].find(([,timer]) => timer.delay === 0);
      if (!next) { await Promise.resolve(); return; }
      timers.delete(next[0]); next[1].callback();
    }
    throw new Error("unexpected recurring timer");
  };
  const openOrdinaryDialogue = () => host.gZenUIManager.handleNewTab(false,false,"tab",true);
  const chooseNewTab = () => {
    const tab = makeTab();
    tabContainer.emit("TabOpen",{target:tab}); host.gBrowser.selectedTab = tab;
    host.gURLBar._zenHandleUrlbarClose(true,true);
    return tab;
  };
  const assertReleased = () => {
    assert.equal(tx.activating,false,"folder transaction must retire");
    assert.equal(tabContainer.listenerCount("TabOpen"),0);
    assert.equal(events.listenerCount("ZenURLBarClosed"),1,"only fixture witness remains");
    assert.equal(observers.size,0,"session observer must disconnect");
    assert.equal([...timers.values()].filter(timer => timer.delay === 0).length,0);
    assert.equal(population.isHeld(folder),false);
  };
  return {host,folder,tx,initial,pinned,errors,closeEvents,flush,observers,timers,tabContainer,
    openOrdinaryDialogue,chooseNewTab,assertReleased};
}

test('folder new-tab handoff preserves new versus reused provenance before structural pinning',async t=>{
 for(const empty of [false,true]) {
  const f=fixture(t,{empty}),seen=[];
  f.host.__betterZenFoldersFolderPins={origins:{active:true,placeCreatedTab(tab,origin,operation){
   seen.push({tab,origin,pinned:f.pinned.includes(tab)});return operation();
  }}};
  const pending=f.tx.activate(f.folder);
  let chosen;
  if(empty){chosen=f.initial;chosen.isEmpty=false;chosen.linkedBrowser.currentURI.spec='https://chosen.test/';f.host.gURLBar._zenHandleUrlbarClose(true,true);}
  else chosen=f.chooseNewTab();
  await f.flush();assert.equal(await pending,true);
  assert.deepEqual(seen,[{tab:chosen,origin:empty?'move':'new',pinned:false}]);
 }
});

test("native unfocused dismissal retires without a close event and permits a later folder action",async t => {
  const f=fixture(t), pending=f.tx.activate(f.folder);
  await f.flush();
  f.host.gURLBar.focused=false;
  f.host.gURLBar._zenHandleUrlbarClose(false,false);
  await f.flush();
  assert.deepEqual(f.closeEvents,[],"this is the native silent-dismissal path");
  assert.equal(f.host.gZenUIManager._urlbarOwner,null);
  f.assertReleased();
  assert.equal(await pending,false);
  const next=f.tx.activate(f.folder), chosen=f.chooseNewTab();
  await f.flush();
  assert.equal(await next,true);
  assert.deepEqual(f.folder.allItems,[chosen]);
  f.assertReleased();
});

test("a later ordinary new-tab session is never pulled into a silently dismissed folder session",async t => {
  const f=fixture(t), pending=f.tx.activate(f.folder);
  f.host.gURLBar.focused=false;
  f.host.gURLBar._zenHandleUrlbarClose(false,false);
  await f.flush();
  f.openOrdinaryDialogue();
  const unrelated=f.chooseNewTab();
  await f.flush();
  assert.deepEqual(f.folder.allItems,[],"the later ordinary tab must stay outside the folder");
  assert.deepEqual(f.pinned,[]);
  assert.equal(f.host.gBrowser.selectedTab,unrelated);
  assert.equal(await pending,false);
  f.assertReleased();
});

for (const picked of [false,true]) {
  test(`a foreign close token cannot ${picked ? "confirm" : "cancel"} the current folder action`,async t => {
    const f=fixture(t), pending=f.tx.activate(f.folder);
    const sequence=f.host.gZenUIManager._urlbarOwner;
    f.host.dispatchEvent(new CustomEvent("ZenURLBarClosed",{
      detail:{closeSeq:sequence+42,onElementPicked:picked},
    }));
    await f.flush();
    assert.equal(f.tx.activating,true);
    assert.equal(f.tabContainer.listenerCount("TabOpen"),1);
    const chosen=f.chooseNewTab();
    await f.flush();
    assert.equal(await pending,true);
    assert.deepEqual(f.folder.allItems,[chosen]);
    f.assertReleased();
  });
}

test("native focused confirmation wins over deferred attribute-removal cleanup",async t => {
  const f=fixture(t), pending=f.tx.activate(f.folder), chosen=f.chooseNewTab();
  await f.flush();
  assert.equal(await pending,true);
  assert.deepEqual(f.closeEvents,[{onSwitch:true,onElementPicked:true,closeSeq:1}]);
  assert.deepEqual(f.folder.allItems,[chosen]);
  assert.equal(f.folder.collapsed,true);
  f.assertReleased();
});

test("native confirmation can still reuse the original empty tab without TabOpen",async t => {
  const f=fixture(t,{empty:true}), pending=f.tx.activate(f.folder);
  f.initial.linkedBrowser.currentURI.spec="https://chosen.test/";
  f.host.gURLBar._zenHandleUrlbarClose(true,true);
  await f.flush();
  assert.equal(await pending,true);
  assert.deepEqual(f.folder.allItems,[f.initial]);
  f.assertReleased();
});

test("native session replacement cancels the old handoff even without a close event",async t => {
  const f=fixture(t), pending=f.tx.activate(f.folder);
  f.openOrdinaryDialogue();
  await f.flush();
  f.assertReleased();
  assert.equal(await pending,false);
  const unrelated=f.chooseNewTab();
  await f.flush();
  assert.deepEqual(f.folder.allItems,[]);
  assert.deepEqual(f.pinned,[]);
  assert.equal(f.host.gBrowser.selectedTab,unrelated);
});

test("a late confirmation from an old native owner cannot use a newer session's selected tab",async t => {
  const f=fixture(t), pending=f.tx.activate(f.folder);
  f.chooseNewTab(); // native close event is delayed through two tasks
  f.openOrdinaryDialogue();
  const unrelated=f.chooseNewTab();
  await f.flush();
  assert.equal(await pending,false);
  assert.deepEqual(f.folder.allItems,[]);
  assert.deepEqual(f.pinned,[]);
  assert.equal(f.host.gBrowser.selectedTab,unrelated);
  f.assertReleased();
});

test("an open session has no polling timeout and teardown releases only BZF resources",async t => {
  const f=fixture(t), pending=f.tx.activate(f.folder);
  await f.flush();
  assert.equal(f.tx.activating,true);
  assert.equal(f.timers.size,0,"no arbitrary time limit on typing a new-tab address");
  f.tx.destroy();
  await f.flush();
  assert.equal(await pending,false);
  assert.equal(f.host.gURLBar.hasAttribute("zen-newtab"),true,"do not close native UI on teardown");
  f.assertReleased();
});
