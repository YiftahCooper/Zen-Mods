import test from "node:test";
import assert from "node:assert/strict";

import {
  createBrowserEmptyFolderAdapters,
  FolderPopulationRegistry,
} from "../scripts/better-zen-folders.uc.mjs";
import { makeDeletedHierarchyFixture, makeEmptyFolderFixture } from "./fakes.mjs";

test("closing the final real child deletes its regular folder after native removal", async () => {
  const fixture = makeEmptyFolderFixture();
  fixture.manager.start(new AbortController().signal);
  fixture.captureCloseOfLastChild();
  await fixture.flushReconciliation();
  assert.deepEqual(fixture.deletedFolderIds, []);
  fixture.finishNativeRemoval();
  await fixture.flushReconciliation();
  assert.deepEqual(fixture.deletedFolderIds, ["leaf"]);
});

test("moving the final child cascades deletion from leaf to newly empty regular parent", async () => {
  const fixture = makeEmptyFolderFixture({ nested: true });
  fixture.manager.start(new AbortController().signal);
  fixture.ungroupLastLeafChild();
  await fixture.flushAllMutations();
  assert.deepEqual(fixture.deletedFolderIds, ["leaf", "root"]);
});

test("removing a nested folder promotes its original regular parent", async () => {
  const fixture = makeEmptyFolderFixture({ nested: true });
  fixture.manager.start(new AbortController().signal);

  fixture.ungroupNestedLeafFolder();
  await fixture.flushAllMutations();

  assert.deepEqual(fixture.deletedFolderIds, ["root"]);
  assert.equal(fixture.leaf.isConnected, true);
});

test("nested-folder departure cascades through regular ancestors only", async () => {
  const fixture = makeEmptyFolderFixture({
    nested: true,
    withGrandparent: true,
    includeFreshEmpty: true,
    includeLiveEmpty: true,
  });
  fixture.manager.start(new AbortController().signal);

  fixture.ungroupNestedLeafFolder();
  await fixture.flushAllMutations();

  assert.deepEqual(fixture.deletedFolderIds, ["root", "grandparent"]);
  assert.equal(fixture.freshEmpty.isConnected, true);
  assert.equal(fixture.liveEmpty.isConnected, true);
});

test("fresh empty and live folders are never auto-deleted", async () => {
  const fixture = makeEmptyFolderFixture({ includeFreshEmpty: true, includeLiveEmpty: true });
  fixture.manager.start(new AbortController().signal);
  fixture.notifyMutation();
  await fixture.flushReconciliation();
  assert.deepEqual(fixture.deletedFolderIds, []);
});

test("disabling cleanup before a final child departure leaves the regular folder", async () => {
  const fixture = makeEmptyFolderFixture();
  fixture.manager.start(new AbortController().signal);
  fixture.setCleanupEnabled(false);
  fixture.captureCloseOfLastChild();
  fixture.finishNativeRemoval();
  await fixture.flushReconciliation();

  assert.deepEqual(fixture.deletedFolderIds, []);
  assert.equal(fixture.leaf.isConnected, true);
});

test("disabling cleanup clears a queued candidate without deleting it", async () => {
  const fixture = makeEmptyFolderFixture();
  fixture.manager.start(new AbortController().signal);
  fixture.captureCloseOfLastChild();
  fixture.setCleanupEnabled(false);
  fixture.finishNativeRemoval();
  await fixture.flushReconciliation();

  assert.deepEqual(fixture.deletedFolderIds, []);
  assert.equal(fixture.leaf.isConnected, true);
});

test("re-enabling cleanup ignores already empty folders and handles a later departure", async () => {
  const fixture = makeEmptyFolderFixture({ includeFreshEmpty: true, includeLiveEmpty: true });
  fixture.manager.start(new AbortController().signal);
  fixture.captureCloseOfLastChild();
  fixture.setCleanupEnabled(false);
  fixture.finishNativeRemoval();
  await fixture.flushReconciliation();

  fixture.setCleanupEnabled(true);
  fixture.notifyMutation();
  await fixture.flushReconciliation();
  assert.deepEqual(fixture.deletedFolderIds, []);
  assert.equal(fixture.leaf.isConnected, true);
  assert.equal(fixture.freshEmpty.isConnected, true);
  assert.equal(fixture.liveEmpty.isConnected, true);

  const laterTab = fixture.addLeafChild();
  fixture.closeLeafChild(laterTab);
  await fixture.flushReconciliation();
  assert.deepEqual(fixture.deletedFolderIds, ["leaf"]);
});

test("browser real-child detection includes tabs splits and folders but excludes Zen placeholders", () => {
  const tab = { kind: "tab" };
  const split = { kind: "split" };
  const nestedFolder = { isZenFolder: true };
  const placeholder = { hasAttribute: name => name === "zen-empty-tab" };
  const unsupported = {};
  const host = {
    gBrowser: {
      isTab: item => item?.kind === "tab",
      isSplitViewWrapper: item => item?.kind === "split",
    },
  };
  const adapters = createBrowserEmptyFolderAdapters(host, new FolderPopulationRegistry());

  assert.deepEqual(
    adapters.realChildren({ allItems: [placeholder, tab, split, nestedFolder, unsupported] }),
    [tab, split, nestedFolder, unsupported],
  );
});

test("browser empty-shell cleanup does not shadow the closed group with an empty undo entry", async () => {
  const history = [{id:"leaf",tabs:["one","two","three","four"]}];
  const placeholder = {hasAttribute:name=>name==="zen-empty-tab"};
  const folder = {isZenFolder:true,allItems:[placeholder],
    delete(){ history.unshift({id:"leaf",tabs:[]}); }};
  const removed=[];
  const host={gBrowser:{isTab:item=>item===placeholder,isSplitViewWrapper:()=>false,
    removeTab(tab, options){removed.push({tab,options});folder.allItems=[];},
    removeTabGroup(group, options){
      if (!options?.skipSessionStore) history.unshift({id:"leaf",tabs:[]});
      group.isConnected=false;
    }}};
  const adapters=createBrowserEmptyFolderAdapters(host,new FolderPopulationRegistry());
  await adapters.deleteFolder(folder);
  assert.deepEqual(history,[{id:"leaf",tabs:["one","two","three","four"]}]);
  assert.equal(removed.length,1);
  assert.equal(removed[0].options.skipSessionStore,true);
  assert.equal(folder.isConnected,false);
});

test("empty-shell adapter refuses a folder repopulated before cleanup", async () => {
  const realTab={kind:"tab"};
  let deleted=false;
  const folder={isZenFolder:true,allItems:[realTab],delete(){deleted=true;}};
  const adapters=createBrowserEmptyFolderAdapters({gBrowser:{isTab:item=>item===realTab,
    removeTabGroup(){deleted=true;}}},new FolderPopulationRegistry());
  await adapters.deleteFolder(folder);
  assert.equal(deleted,false);
});

test("a held folder waits until population finishes before empty deletion", async () => {
  const fixture = makeEmptyFolderFixture();
  fixture.manager.start(new AbortController().signal);
  const release = fixture.populationRegistry.hold(fixture.leaf);
  fixture.captureCloseOfLastChild();
  fixture.finishNativeRemoval();
  await fixture.flushReconciliation();
  assert.deepEqual(fixture.deletedFolderIds, []);
  release();
  await fixture.flushReconciliation();
  assert.deepEqual(fixture.deletedFolderIds, ["leaf"]);
});

test("population holds are reference counted and release notifications are idempotent", () => {
  const registry = new FolderPopulationRegistry();
  const folder = {};
  const released = [];
  const unsubscribe = registry.subscribeReleased(current => released.push(current));
  const releaseFirst = registry.hold(folder);
  const releaseSecond = registry.hold(folder);

  releaseFirst();
  releaseFirst();
  assert.equal(registry.isHeld(folder), true);
  assert.deepEqual(released, []);
  releaseSecond();
  releaseSecond();
  assert.equal(registry.isHeld(folder), false);
  assert.deepEqual(released, [folder]);
  unsubscribe();
  unsubscribe();
});

test("restore-created folders stay held until their restored tab is attached", async () => {
  const populationRegistry = new FolderPopulationRegistry();
  const fixture = makeDeletedHierarchyFixture({ populationRegistry });

  assert.equal(await fixture.manager.restoreTab(fixture.event), true);
  assert.deepEqual(fixture.state.populationHeldDuringAdd, [true]);
  assert.equal(populationRegistry.isHeld(fixture.state.foldersById.get("folder-work")), false);
  assert.equal(populationRegistry.isHeld(fixture.state.foldersById.get("folder-project")), false);
});

test("aborting teardown removes every departure listener observer and release subscription", async () => {
  const fixture = makeEmptyFolderFixture();
  const controller = new AbortController();
  fixture.manager.start(controller.signal);

  assert.equal(fixture.eventTarget.listenerCapture("TabClose"), true);
  assert.equal(fixture.eventTarget.listenerCapture("TabUngrouped"), false);
  assert.equal(fixture.eventTarget.listenerCapture("FolderUngrouped"), false);
  assert.equal(fixture.eventTarget.listenerCount("TabClose"), 1);
  assert.equal(fixture.eventTarget.listenerCount("TabUngrouped"), 1);
  assert.equal(fixture.eventTarget.listenerCount("FolderUngrouped"), 1);
  assert.equal(fixture.cleanupSubscriberCount(), 1);
  assert.equal(fixture.populationRegistry.releaseSubscribers.size, 1);
  assert.deepEqual(fixture.observer().observed, [{
    target: fixture.adapters.tabContainer(),
    options: { childList: true, subtree: true },
  }]);

  fixture.captureCloseOfLastChild();
  fixture.finishNativeRemoval();
  controller.abort();
  controller.abort();
  await fixture.flushReconciliation();

  assert.deepEqual(fixture.deletedFolderIds, []);
  assert.equal(fixture.observer().disconnects, 1);
  assert.equal(fixture.eventTarget.listenerCount("TabClose"), 0);
  assert.equal(fixture.eventTarget.listenerCount("TabUngrouped"), 0);
  assert.equal(fixture.eventTarget.listenerCount("FolderUngrouped"), 0);
  assert.equal(fixture.cleanupSubscriberCount(), 0);
  assert.equal(fixture.populationRegistry.releaseSubscribers.size, 0);
});

test("a deletion error leaves the folder visible and reports only once", async () => {
  const failure = new Error("native delete failed");
  const fixture = makeEmptyFolderFixture({ deleteError: failure });
  fixture.manager.start(new AbortController().signal);
  fixture.captureCloseOfLastChild();
  fixture.finishNativeRemoval();
  await fixture.flushReconciliation();
  fixture.notifyMutation();
  await fixture.flushReconciliation();

  assert.equal(fixture.leaf.isConnected, true);
  assert.deepEqual(fixture.deletedFolderIds, []);
  assert.deepEqual(fixture.errors, [failure]);
});
