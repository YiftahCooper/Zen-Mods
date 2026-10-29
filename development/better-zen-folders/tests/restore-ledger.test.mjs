import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_MAX_FOLDER_DEPTH,
  FolderRestoreManager,
  NativeRestoreArtifactReconciler,
  RESTORE_KEY,
  bootstrapBrowserWindow,
  buildRestoreRecord,
  createBrowserRestoreAdapters,
  ensureFolderPath,
  resolveDirectInsertion,
  validateRestoreRecord,
} from "../scripts/better-zen-folders.uc.mjs";
import {
  makeCloseCaptureFixture,
  makeBrowserDomEventPathFixture,
  makeFolderHeaderMiddleClickFixture,
  makeNativeFolderDeletionHistoryFixture,
  makeBrowserHost,
  makeDeletedHierarchyFixture,
  makeDeletedLiveFolderFixture,
  makeExistingNestedRestoreFixture,
  makeExistingRenamedFolderFixture,
  FakeEventTarget,
  makeFolderIdCollisionFixture,
  makeIdenticalUrlFixture,
  makeLazyDeletedGroupRestoreFixture,
  makeNestedTabCloseEventPathFixture,
  makeNestedTabFixture,
  makeRecordWithDepth,
  makeRestoreManagerFixture,
} from "./fakes.mjs";

function makeSiblingRestoreFixture(options = {}) {
  const fixture = makeLazyDeletedGroupRestoreFixture({
    tabCount: 2, occupiedIds: ["folder-project"], ...options,
  });
  for (let index = 0; index < 2; index++) {
    fixture.mutateRestoreRecord(index, record => {
      const root = record.folders[0];
      record.folders.push({
        ...root, id: `leaf-${index}`, parentId: root.id, name: `Leaf ${index}`, slot: index,
      });
      record.placement.folderId = `leaf-${index}`;
      record.placement.slot = 0;
    });
  }
  fixture.adapters.getFolderAncestors = folder => {
    const ancestors = [];
    for (let parent = folder.parentFolder; parent; parent = parent.parentFolder) ancestors.push(parent);
    return ancestors;
  };
  return fixture;
}

test("Sticky folder flags are captured, validated and restored on reconstructed IDs", async () => {
  const fixture = makeNestedTabFixture();
  fixture.adapters.getFolderSticky = folder => folder === fixture.leaf;
  const record = buildRestoreRecord(fixture.tab, fixture.adapters);
  assert.equal(record.folders.at(-1).sticky, true);
  assert.ok(validateRestoreRecord(record));
  const invalid = JSON.parse(JSON.stringify(record));invalid.folders[0].sticky = "yes";
  assert.equal(validateRestoreRecord(invalid), null);
  const deleted = makeLazyDeletedGroupRestoreFixture({tabCount:2, occupiedIds:["folder-project"]});
  for (let i=0;i<2;i++) deleted.mutateRestoreRecord(i, value => { value.folders.at(-1).sticky=true; });
  const applied=[];deleted.adapters.setFolderSticky=(folder, sticky)=>applied.push([folder.id,sticky]);
  assert.equal(await deleted.restoreNativeGroup(),true);
  assert.deepEqual(applied,[[deleted.tabs[0].group.id,true]]);
});

test("sibling restore paths share one remapped ancestor after an ID collision", async () => {
  const fixture = makeSiblingRestoreFixture();
  assert.equal(await fixture.restoreNativeGroup(), true);
  const [first, second] = fixture.tabs;
  assert.equal(first.group.parentFolder, second.group.parentFolder);
  assert.equal(fixture.realFolderIds().length, 3);
  assert.deepEqual(first.group.parentFolder.visibleItems.filter(item => item.isZenFolder).map(item => item.id),
    ["leaf-0", "leaf-1"]);
  for (const tab of fixture.tabs) {
    const record = JSON.parse(fixture.restoreValue(tab));
    assert.equal(record.folders[0].id, first.group.parentFolder.id);
  }
  assert.deepEqual(fixture.errors, []);
});

test("failed sibling restore rolls back a shared remapped ancestor exactly once", async () => {
  const fixture = makeSiblingRestoreFixture({ failMoveAt: 2 });
  const rollbacks = [];
  const rollback = fixture.adapters.rollbackCreatedFolder;
  fixture.adapters.rollbackCreatedFolder = async folder => {
    rollbacks.push(folder.id);
    return rollback(folder);
  };
  assert.equal(await fixture.restoreNativeGroup(), false);
  assert.equal(rollbacks.length, 3);
  assert.equal(new Set(rollbacks).size, 3);
  assert.deepEqual(fixture.realFolderIds(), []);
  assert.deepEqual(fixture.nativeTabIds(), ["restored-1", "restored-2"]);
  assert.equal(fixture.nativeGroup.id, "folder-project");
});

test("TabGroupCreate converts all lazy restored children into one real Zen folder", async () => {
  const fixture = makeLazyDeletedGroupRestoreFixture({ tabCount: 4 });
  fixture.manager.captureNativeGroupCreate({ target: fixture.nativeGroup });
  fixture.flushDeferred();
  await fixture.manager.queue;

  assert.deepEqual(fixture.realFolderIds(), ["folder-project"]);
  assert.deepEqual(fixture.directTabIds("folder-project"), ["restored-1", "restored-2", "restored-3", "restored-4"]);
  assert.equal(fixture.tabGroupRemovedCount(), 1);
  assert.equal(fixture.nativeGroup.isConnected, true);
  assert.equal(fixture.finishNativeRemovalAnimation(), true);
  assert.equal(fixture.nativeGroup.isConnected, false);
  assert.deepEqual(fixture.errors, []);
});

test("TabGroupCreate declines a split wrapper without blocking ordinary split restoration", async () => {
  const fixture = makeLazyDeletedGroupRestoreFixture({ tabCount: 2 });
  fixture.nativeGroup.isSplitView = true;

  assert.equal(
    fixture.manager.captureNativeGroupCreate({ target: fixture.nativeGroup }),
    false,
  );
  assert.equal(await fixture.manager.restoreTab({ target: fixture.tabs[0] }), true);
  const [resolvedFolderId] = fixture.realFolderIds();
  assert.equal(typeof resolvedFolderId, "string");
  assert.deepEqual(fixture.nativeTabIds(), ["restored-2"]);
  assert.deepEqual(fixture.directTabIds(resolvedFolderId), ["restored-1"]);
});

test("direct native conversion defensively declines excluded split and collapsible-pin groups", async t => {
  for (const [name, exclude] of [
    ["split wrapper", group => { group.isSplitView = true; }],
    ["collapsible pins", group => { group.id = "zen-workspace-collapsible-pins"; }],
  ]) {
    await t.test(name, async () => {
      const fixture = makeLazyDeletedGroupRestoreFixture({ tabCount: 2 });
      exclude(fixture.nativeGroup);

      assert.equal(await fixture.restoreNativeGroup(), false);
      assert.deepEqual(fixture.realFolderIds(), []);
      assert.deepEqual(fixture.nativeTabIds(), ["restored-1", "restored-2"]);
      assert.equal(fixture.nativeGroup.isConnected, true);
    });
  }
});

test("TabGroupCreate declines the collapsible-pins shell without creating ownership", () => {
  const fixture = makeLazyDeletedGroupRestoreFixture({ tabCount: 2 });
  fixture.nativeGroup.id = "zen-workspace-collapsible-pins";

  assert.equal(
    fixture.manager.captureNativeGroupCreate({ target: fixture.nativeGroup }),
    false,
  );
});

test("lazy pending tabs keep restore metadata until their native group converts", async () => {
  const fixture = makeLazyDeletedGroupRestoreFixture({
    tabCount: 4,
    sessionRestoring: false,
    pending: true,
  });
  fixture.synchronizeMetadata();
  assert.equal(fixture.restoreValues().every(Boolean), true);

  fixture.manager.captureNativeGroupCreate({ target: fixture.nativeGroup });
  fixture.flushDeferred();
  await fixture.manager.queue;

  assert.deepEqual(fixture.realFolderIds(), ["folder-project"]);
  assert.deepEqual(fixture.directTabIds("folder-project"), [
    "restored-1", "restored-2", "restored-3", "restored-4",
  ]);
});

test("successful native-group conversion finishes through TabGroupRemoved", async () => {
  const fixture = makeLazyDeletedGroupRestoreFixture({
    tabCount: 4,
    sessionRestoring: false,
    pending: true,
  });
  assert.equal(await fixture.restoreNativeGroup(), true);
  assert.equal(fixture.tabGroupRemovedCount(), 1);
  assert.equal(fixture.rawRemoveCount(), 0);
  assert.equal(fixture.nativeGroup.isConnected, true);
  assert.equal(fixture.finishNativeRemovalAnimation(), true);
  assert.equal(fixture.nativeGroup.isConnected, false);
});

test("native conversion synchronously proves every remapped nested folder through Zen's collector", async () => {
  const fixture = makeLazyDeletedGroupRestoreFixture({
    tabCount: 2,
    nestedFolders: true,
    occupiedIds: ["folder-work", "folder-project"],
  });

  assert.equal(await fixture.restoreNativeGroup(), true);
  assert.equal(fixture.collectorCallCount(), 1);
  assert.deepEqual(fixture.realFolderIds(), ["folder-safe-2", "folder-safe-3"]);
  assert.deepEqual(fixture.directTabIds("folder-safe-3"), ["restored-1", "restored-2"]);
});

test("collector omission restores the final native child before native removal can commit", async () => {
  const fixture = makeLazyDeletedGroupRestoreFixture({ tabCount: 2 });
  fixture.adapters.collectPersistedZenFolders = () => [];

  assert.equal(await fixture.restoreNativeGroup(), false);
  assert.deepEqual(fixture.nativeTabIds(), ["restored-1", "restored-2"]);
  assert.deepEqual(fixture.realFolderIds(), []);
  assert.equal(fixture.nativeGroup.isConnected, true);
  assert.equal(fixture.tabGroupRemovedCount(), 0);
  assert.match(fixture.errors[0]?.message ?? "", /collector|persist/i);
});

test("malformed Zen collector data fails the native transaction and fully rolls back", async () => {
  const fixture = makeLazyDeletedGroupRestoreFixture({ tabCount: 2 });
  fixture.adapters.collectPersistedZenFolders = () => ({ id: "folder-project" });

  assert.equal(await fixture.restoreNativeGroup(), false);
  assert.deepEqual(fixture.nativeTabIds(), ["restored-1", "restored-2"]);
  assert.deepEqual(fixture.realFolderIds(), []);
  assert.equal(fixture.nativeGroup.isConnected, true);
  assert.equal(fixture.tabGroupRemovedCount(), 0);
});

test("throwing Zen collector fails the native transaction and fully rolls back", async () => {
  const fixture = makeLazyDeletedGroupRestoreFixture({ tabCount: 2 });
  const failure = new Error("collector failed");
  fixture.adapters.collectPersistedZenFolders = () => { throw failure; };

  assert.equal(await fixture.restoreNativeGroup(), false);
  assert.deepEqual(fixture.nativeTabIds(), ["restored-1", "restored-2"]);
  assert.deepEqual(fixture.realFolderIds(), []);
  assert.equal(fixture.nativeGroup.isConnected, true);
  assert.equal(fixture.tabGroupRemovedCount(), 0);
  assert.equal(fixture.errors[0], failure);
});

test("missing Zen collector adapter rejects native conversion before mutation", async () => {
  const fixture = makeLazyDeletedGroupRestoreFixture({ tabCount: 2 });
  fixture.adapters.collectPersistedZenFolders = undefined;

  assert.equal(await fixture.restoreNativeGroup(), false);
  assert.deepEqual(fixture.nativeTabIds(), ["restored-1", "restored-2"]);
  assert.deepEqual(fixture.realFolderIds(), []);
  assert.equal(fixture.nativeGroup.isConnected, true);
  assert.equal(fixture.tabGroupRemovedCount(), 0);
});

function assertNoNativeAdmissionMutations(fixture, expectedNativeIds = ["restored-1", "restored-2"]) {
  assert.equal(fixture.idReleaseCount(), 0);
  assert.equal(fixture.folderCreationCount(), 0);
  assert.equal(fixture.tabGroupRemovedCount(), 0);
  assert.deepEqual(fixture.realFolderIds(), []);
  assert.deepEqual(fixture.nativeTabIds(), expectedNativeIds);
  for (const id of expectedNativeIds) assert.equal(fixture.moveCount(id), 0);
  assert.equal(fixture.nativeGroup.id, "folder-project");
  assert.equal(fixture.nativeGroup.isConnected, true);
}

test("repeated folder IDs reject structural and presentation conflicts before admission", async t => {
  const cases = [
    ["folder slot", folder => { folder.slot = 2; }],
    ["previous sibling", folder => { folder.previousId = "different-before"; }],
    ["next sibling", folder => { folder.nextId = "different-after"; }],
    ["workspace", folder => { folder.workspaceId = "workspace-other"; }],
    ["name", folder => { folder.name = "Different project"; }],
    ["icon", folder => { folder.iconUrl = "chrome://icons/different.svg"; }],
    ["collapse", folder => { folder.collapsed = !folder.collapsed; }],
    ["save state", folder => { folder.saved = !folder.saved; }],
  ];

  for (const [name, mutate] of cases) {
    await t.test(name, async () => {
      const fixture = makeLazyDeletedGroupRestoreFixture({ tabCount: 2 });
      fixture.mutateRestoreRecord(1, record => mutate(record.folders[0]));

      assert.equal(await fixture.restoreNativeGroup(), false);
      assertNoNativeAdmissionMutations(fixture);
      assert.match(fixture.errors[0]?.message ?? "", /conflicting.*folder/i);
    });
  }
});

test("repeated folder IDs reject conflicting parents before admission", async () => {
  const fixture = makeLazyDeletedGroupRestoreFixture({ tabCount: 2, nestedFolders: true });
  fixture.mutateRestoreRecord(1, record => {
    record.folders[0].id = "folder-other-root";
    record.folders[1].parentId = "folder-other-root";
  });

  assert.equal(await fixture.restoreNativeGroup(), false);
  assertNoNativeAdmissionMutations(fixture);
  assert.match(fixture.errors[0]?.message ?? "", /conflicting.*folder/i);
});

test("repeated live folder IDs reject type dismissed and provider conflicts before admission", async t => {
  const cases = [
    ["regular/live type", record => {
      const folder = record.folders[0];
      folder.type = "regular";
      delete folder.live;
      delete folder.dismissed;
      delete record.presentation;
      delete record.liveTab;
    }],
    ["dismissed data", record => {
      record.folders[0].dismissed = ["folder-project:different-dismissal"];
    }],
    ["provider type", record => {
      record.folders[0].live.providerType = "github";
    }],
    ["serialized provider state", record => {
      const data = JSON.parse(record.folders[0].live.serializedState);
      data.state.url = "https://example.test/different-feed.xml";
      record.folders[0].live.serializedState = JSON.stringify(data);
    }],
  ];

  for (const [name, mutate] of cases) {
    await t.test(name, async () => {
      const fixture = makeLazyDeletedGroupRestoreFixture({ tabCount: 2, liveFolder: true });
      fixture.mutateRestoreRecord(1, mutate);

      assert.equal(await fixture.restoreNativeGroup(), false);
      assertNoNativeAdmissionMutations(fixture);
      assert.match(fixture.errors[0]?.message ?? "", /conflicting.*folder/i);
    });
  }
});

test("equivalent serialized provider state ignores JSON property insertion order", async () => {
  const fixture = makeLazyDeletedGroupRestoreFixture({ tabCount: 2, liveFolder: true });
  fixture.mutateRestoreRecord(1, record => {
    const { state } = JSON.parse(record.folders[0].live.serializedState);
    record.folders[0].live.serializedState = JSON.stringify({
      state: {
        timeRange: state.timeRange,
        maxItems: state.maxItems,
        url: state.url,
        options: state.options,
        lastFetched: state.lastFetched,
        interval: state.interval,
      },
    });
  });

  assert.equal(await fixture.restoreNativeGroup(), true);
  assert.equal(fixture.idReleaseCount(), 1);
  assert.equal(fixture.folderCreationCount(), 1);
});

test("a native group without complete Better Zen Folders records remains untouched", async () => {
  const fixture = makeLazyDeletedGroupRestoreFixture({
    tabCount: 4,
    pending: true,
    missingRecordAt: 2,
  });
  assert.equal(await fixture.restoreNativeGroup(), false);
  assert.deepEqual(fixture.realFolderIds(), []);
  assert.equal(fixture.nativeGroup.isConnected, true);
  assert.equal(fixture.tabGroupRemovedCount(), 0);
});

function makeNativeArtifactReconciler(
  fixture,
  { sessionReady, workspacesReady, adapterOverrides = {} } = {},
) {
  return new NativeRestoreArtifactReconciler(fixture.manager, {
    sessionRestoreReady: () => sessionReady ?? Promise.resolve(),
    workspacesReady: () => workspacesReady ?? Promise.resolve(),
    listNativeGroups: () => [fixture.nativeGroup],
    isNativeRestoredGroup: fixture.adapters.isNativeRestoredGroup,
    isExcludedNativeGroup: () => false,
    getNativeGroupTabs: fixture.adapters.getNativeGroupTabs,
    armNativeGroupRemoval: fixture.adapters.armNativeGroupRemoval,
    requestNativeGroupEmptyReconciliation: fixture.adapters.requestNativeGroupEmptyReconciliation,
    reportError: error => fixture.errors.push(error),
    ...adapterOverrides,
  });
}

test("native artifact reconciliation waits for session and workspace initialization", async () => {
  const fixture = makeLazyDeletedGroupRestoreFixture({ tabCount: 4 });
  let releaseSession;
  let releaseWorkspaces;
  const reconciler = makeNativeArtifactReconciler(fixture, {
    sessionReady: new Promise(resolve => { releaseSession = resolve; }),
    workspacesReady: new Promise(resolve => { releaseWorkspaces = resolve; }),
  });

  reconciler.start();
  await Promise.resolve();
  assert.deepEqual(fixture.realFolderIds(), []);

  releaseSession();
  await Promise.resolve();
  assert.deepEqual(fixture.realFolderIds(), []);
  releaseWorkspaces();
  await reconciler.promise;

  assert.deepEqual(fixture.realFolderIds(), ["folder-project"]);
});

test("native artifact reconciliation reports a top-level rejection and resolves false", async () => {
  const fixture = makeLazyDeletedGroupRestoreFixture({ tabCount: 4 });
  const failure = new Error("session initialization failed");
  let rejectSession;
  const reconciler = makeNativeArtifactReconciler(fixture, {
    sessionReady: new Promise((_resolve, reject) => { rejectSession = reject; }),
  });

  reconciler.start();
  rejectSession(failure);

  assert.equal(await reconciler.promise, false);
  assert.deepEqual(fixture.errors, [failure]);
});

test("native artifact reconciliation removes an empty shell through its native lifecycle", async () => {
  const fixture = makeLazyDeletedGroupRestoreFixture({ tabCount: 0 });
  const reconciler = makeNativeArtifactReconciler(fixture);

  reconciler.start();
  await reconciler.promise;

  assert.equal(fixture.tabGroupRemovedCount(), 1);
  assert.equal(fixture.rawRemoveCount(), 0);
  assert.equal(fixture.nativeGroup.isConnected, true);
  assert.equal(fixture.finishNativeRemovalAnimation(), true);
  assert.equal(fixture.nativeGroup.isConnected, false);
});

test("destroy cancels a pending empty-shell reconciliation without continuing", async () => {
  const fixture = makeLazyDeletedGroupRestoreFixture({ tabCount: 0 });
  const laterGroup = { isConnected: true, isZenFolder: false, tabs: [] };
  let signalRemovalRequested;
  const removalRequested = new Promise(resolve => { signalRemovalRequested = resolve; });
  let requestCount = 0;
  let postDestroyArmCount = 0;
  const reconciler = makeNativeArtifactReconciler(fixture, {
    adapterOverrides: {
      listNativeGroups: () => [fixture.nativeGroup, laterGroup],
      isNativeRestoredGroup: group => group === fixture.nativeGroup || group === laterGroup,
      getNativeGroupTabs: group => [...group.tabs],
      armNativeGroupRemoval: group => {
        if (group === fixture.nativeGroup) {
          return fixture.adapters.armNativeGroupRemoval(group);
        }
        postDestroyArmCount++;
        return { promise: Promise.resolve(), cancel() {} };
      },
      requestNativeGroupEmptyReconciliation: group => {
        requestCount++;
        if (group === fixture.nativeGroup) signalRemovalRequested();
      },
    },
  });

  reconciler.start();
  await removalRequested;
  assert.equal(fixture.nativeRemovalListenerCount(), 1);

  reconciler.destroy();
  const timedOut = Symbol("timed out");
  const managedResult = await Promise.race([
    reconciler.promise,
    new Promise(resolve => setImmediate(() => resolve(timedOut))),
  ]);

  assert.notEqual(managedResult, timedOut);
  assert.equal(managedResult, false);
  assert.equal(fixture.nativeRemovalListenerCount(), 0);
  assert.equal(requestCount, 1);
  assert.equal(postDestroyArmCount, 0);
  assert.equal(fixture.nativeGroup.isConnected, true);
  assert.equal(fixture.tabGroupRemovedCount(), 0);
  assert.equal(fixture.rawRemoveCount(), 0);
  await Promise.resolve();
  assert.equal(requestCount, 1);
  assert.equal(postDestroyArmCount, 0);
});

test("native artifact reconciliation retries a complete four-tab restore", async () => {
  const fixture = makeLazyDeletedGroupRestoreFixture({ tabCount: 4 });
  const reconciler = makeNativeArtifactReconciler(fixture);

  reconciler.start();
  await reconciler.promise;

  assert.deepEqual(fixture.realFolderIds(), ["folder-project"]);
  assert.deepEqual(fixture.directTabIds("folder-project"), [
    "restored-1", "restored-2", "restored-3", "restored-4",
  ]);
});

test("native artifact reconciliation leaves non-empty unannotated groups untouched", async () => {
  const fixture = makeLazyDeletedGroupRestoreFixture({ tabCount: 4, missingRecordAt: 1 });
  const reconciler = makeNativeArtifactReconciler(fixture);

  reconciler.start();
  await reconciler.promise;

  assert.deepEqual(fixture.realFolderIds(), []);
  assert.equal(fixture.nativeGroup.isConnected, true);
  assert.equal(fixture.tabGroupRemovedCount(), 0);
});

test("startup reconciliation retries a connected native group after an earlier incomplete conversion", async () => {
  const fixture = makeLazyDeletedGroupRestoreFixture({
    tabCount: 4,
    pending: true,
    missingRecordAt: 2,
  });

  assert.equal(await fixture.restoreNativeGroup(), false);
  assert.deepEqual(fixture.realFolderIds(), []);
  assert.equal(fixture.nativeGroup.isConnected, true);

  fixture.supplyRestoreRecord(2);
  const reconciler = makeNativeArtifactReconciler(fixture);
  reconciler.start();
  await reconciler.promise;

  assert.deepEqual(fixture.realFolderIds(), ["folder-project"]);
  assert.deepEqual(fixture.directTabIds("folder-project"), [
    "restored-1", "restored-2", "restored-3", "restored-4",
  ]);
  assert.equal(fixture.tabGroupRemovedCount(), 1);
  assert.equal(fixture.rawRemoveCount(), 0);
  assert.equal(fixture.nativeGroup.isConnected, true);
  assert.equal(fixture.finishNativeRemovalAnimation(), true);
  assert.equal(fixture.nativeGroup.isConnected, false);
});

test("a moved native-group child shares its active batch failure during provider startup", async () => {
  const fixture = makeLazyDeletedGroupRestoreFixture({
    tabCount: 4,
    liveFolder: true,
    delayProviderStart: true,
  });
  const providerFailure = new Error("provider startup failed");

  const batchRestore = fixture.restoreNativeGroup();
  await fixture.waitForProviderStart();
  assert.deepEqual(fixture.directTabIds("folder-project"), [
    "restored-1", "restored-2", "restored-3",
  ]);
  assert.deepEqual(fixture.nativeTabIds(), ["restored-4"]);

  const individualRestore = fixture.manager.restoreTab({ target: fixture.tabs[0] });
  const sharesBatchPromise = individualRestore === batchRestore;
  let individualSettled = false;
  void individualRestore.then(() => { individualSettled = true; });
  await Promise.resolve();
  assert.equal(individualSettled, false);

  fixture.failProviderStart(providerFailure);
  const [batchResult, individualResult] = await Promise.all([batchRestore, individualRestore]);

  assert.equal(sharesBatchPromise, true);
  assert.equal(batchResult, false);
  assert.equal(individualResult, false);
  assert.deepEqual(fixture.nativeTabIds(), [
    "restored-1", "restored-2", "restored-3", "restored-4",
  ]);
  assert.deepEqual(fixture.realFolderIds(), []);
  assert.equal(fixture.nativeGroup.isConnected, true);
  assert.equal(fixture.tabGroupRemovedCount(), 0);
  assert.equal(fixture.rawRemoveCount(), 0);
});

test("destroy waits for delayed provider rollback before settling native-group guards", async () => {
  const fixture = makeLazyDeletedGroupRestoreFixture({
    tabCount: 4,
    liveFolder: true,
    delayProviderStart: true,
  });

  const batchRestore = fixture.restoreNativeGroup();
  await fixture.waitForProviderStart();
  assert.deepEqual(fixture.directTabIds("folder-project"), [
    "restored-1", "restored-2", "restored-3",
  ]);
  assert.deepEqual(fixture.nativeTabIds(), ["restored-4"]);
  assert.equal(fixture.nativeRemovalListenerCount(), 1);

  const joinedRestore = fixture.manager.restoreTab({ target: fixture.tabs[0] });
  assert.equal(joinedRestore, batchRestore);
  const settlement = batchRestore.then(result => ({
    result,
    nativeTabIds: fixture.nativeTabIds(),
    realFolderIds: fixture.realFolderIds(),
    nativeRemovalListeners: fixture.nativeRemovalListenerCount(),
  }));

  fixture.manager.destroy();
  const timedOut = Symbol("timed out");
  const settledState = await Promise.race([
    settlement,
    new Promise(resolve => setImmediate(() => resolve(timedOut))),
  ]);

  assert.notEqual(settledState, timedOut);
  assert.deepEqual(settledState, {
    result: false,
    nativeTabIds: ["restored-1", "restored-2", "restored-3", "restored-4"],
    realFolderIds: [],
    nativeRemovalListeners: 0,
  });
  assert.equal(await joinedRestore, false);
  assert.equal(fixture.nativeGroup.isConnected, true);
  assert.equal(fixture.tabGroupRemovedCount(), 0);
  assert.equal(fixture.rawRemoveCount(), 0);

  fixture.failProviderStart(new Error("late provider rejection"));
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(fixture.nativeTabIds(), [
    "restored-1", "restored-2", "restored-3", "restored-4",
  ]);
  assert.deepEqual(fixture.realFolderIds(), []);
  assert.deepEqual(fixture.errors, []);
});

test("destroy interrupts native-removal wait before settling native-group guards", async () => {
  const fixture = makeLazyDeletedGroupRestoreFixture({
    tabCount: 4,
    holdNativeRemoval: true,
  });

  const batchRestore = fixture.restoreNativeGroup();
  await fixture.waitForNativeShellEmpty();
  assert.deepEqual(fixture.nativeTabIds(), []);
  assert.deepEqual(fixture.directTabIds("folder-project"), [
    "restored-1", "restored-2", "restored-3", "restored-4",
  ]);
  assert.equal(fixture.nativeRemovalListenerCount(), 1);

  const joinedRestore = fixture.manager.restoreTab({ target: fixture.tabs[0] });
  assert.equal(joinedRestore, batchRestore);
  const settlement = batchRestore.then(result => ({
    result,
    nativeTabIds: fixture.nativeTabIds(),
    realFolderIds: fixture.realFolderIds(),
    nativeRemovalListeners: fixture.nativeRemovalListenerCount(),
  }));

  fixture.manager.destroy();
  const timedOut = Symbol("timed out");
  const settledState = await Promise.race([
    settlement,
    new Promise(resolve => setImmediate(() => resolve(timedOut))),
  ]);

  assert.notEqual(settledState, timedOut);
  assert.deepEqual(settledState, {
    result: false,
    nativeTabIds: ["restored-1", "restored-2", "restored-3", "restored-4"],
    realFolderIds: [],
    nativeRemovalListeners: 0,
  });
  assert.equal(await joinedRestore, false);
  assert.equal(fixture.nativeGroup.isConnected, true);
  assert.equal(fixture.tabGroupRemovedCount(), 0);
  assert.equal(fixture.rawRemoveCount(), 0);
});

test("late SSTabRestoring does not move an early-restored tab twice", async () => {
  const fixture = makeLazyDeletedGroupRestoreFixture({ tabCount: 4 });
  await fixture.restoreNativeGroup();
  const moves = fixture.moveCount("restored-1");
  assert.equal(await fixture.manager.restoreTab({ target: fixture.tabs[0] }), true);
  assert.equal(fixture.moveCount("restored-1"), moves);
});

test("an unrelated or partially annotated native group remains native", async () => {
  const fixture = makeLazyDeletedGroupRestoreFixture({ tabCount: 4, missingRecordAt: 2 });
  assert.equal(await fixture.restoreNativeGroup(), false);
  assert.equal(fixture.nativeGroup.id, "folder-project");
  assert.equal(fixture.nativeGroup.isConnected, true);
  assert.deepEqual(fixture.realFolderIds(), []);
});

test("late SSTabRestoring cannot split a rejected partially annotated native group", async () => {
  const fixture = makeLazyDeletedGroupRestoreFixture({ tabCount: 4, missingRecordAt: 2 });
  assert.equal(await fixture.restoreNativeGroup(), false);

  const lateRestore = await fixture.manager.restoreTab({ target: fixture.tabs[0] });
  assert.deepEqual(fixture.nativeTabIds(), ["restored-1", "restored-2", "restored-3", "restored-4"]);
  assert.deepEqual(fixture.realFolderIds(), []);
  assert.equal(fixture.nativeGroup.isConnected, true);
  assert.equal(fixture.moveCount("restored-1"), 0);
  assert.equal(lateRestore, false);
});

test("late SSTabRestoring cannot bypass an unavailable native-group browser boundary", async () => {
  const fixture = makeLazyDeletedGroupRestoreFixture({ tabCount: 4, unavailableBoundary: true });
  assert.equal(
    fixture.manager.captureNativeGroupCreate({ target: fixture.nativeGroup }),
    false,
  );

  const lateRestore = await fixture.manager.restoreTab({ target: fixture.tabs[0] });
  assert.deepEqual(fixture.nativeTabIds(), ["restored-1", "restored-2", "restored-3", "restored-4"]);
  assert.deepEqual(fixture.realFolderIds(), []);
  assert.equal(fixture.nativeGroup.isConnected, true);
  assert.equal(fixture.moveCount("restored-1"), 0);
  assert.equal(fixture.errors.length, 1);
  assert.equal(lateRestore, false);
});

test("batch failure restores the native group id and every original tab placement", async () => {
  const fixture = makeLazyDeletedGroupRestoreFixture({ tabCount: 4, failMoveAt: 2 });
  assert.equal(await fixture.restoreNativeGroup(), false);
  assert.equal(fixture.nativeGroup.id, "folder-project");
  assert.deepEqual(fixture.nativeTabIds(), ["restored-1", "restored-2", "restored-3", "restored-4"]);
  assert.deepEqual(fixture.realFolderIds(), []);
  assert.equal(fixture.errors.length, 1);
});

function makeFourTabGroupCloseFixture() {
  const nested = makeNestedTabFixture({ visibleSlot: 0 });
  const tabs = ["first", "second", "third", "fourth"].map(id => ({
    id,
    group: nested.leaf,
  }));
  nested.leaf.allItems = [
    { id: "leaf-empty", zenEmptyTab: true },
    ...tabs,
  ];
  const values = new Map();
  const eventTarget = new FakeEventTarget();
  const errors = [];
  const adapters = {
    ...nested.adapters,
    eventTarget: () => eventTarget,
    isSupportedTab: () => true,
    isEssential: tab => tab.essential === true,
    isEmptyTab: tab => tab.zenEmptyTab === true,
    isSupportedFolder: folder => folder?.isZenFolder === true,
    isSupportedSplitWrapper: () => false,
    getDirectItem: tab => tab,
    getGroupTabsForClose: folder => folder.allItems,
    sessionStore: {
      getCustomTabValue: (tab, key) => key === RESTORE_KEY ? values.get(tab) ?? "" : "",
      setCustomTabValue: (tab, key, value) => {
        if (key === RESTORE_KEY) values.set(tab, value);
      },
      deleteCustomTabValue: (tab, key) => {
        if (key === RESTORE_KEY) values.delete(tab);
      },
    },
    clearRestoreValue: tab => values.delete(tab),
    reportError: error => errors.push(error),
  };
  return {
    manager: new FolderRestoreManager(adapters),
    eventTarget,
    event: { target: nested.leaf, detail: {} },
    tabs,
    values,
    errors,
  };
}

function makeLiveRecord(depth = 1) {
  const record = makeRecordWithDepth(depth);
  record.folders[0] = {
    ...record.folders[0],
    type: "live",
    live: { providerType: "pinned-tabs", serializedState: '{"view":"pinned"}' },
  };
  if (depth === 1) {
    record.presentation = { label: "Live", iconUrl: null, muted: false };
    record.liveTab = { itemId: "folder-0:item-1", label: null };
  }
  return record;
}

function pinnedTabsValidator(value) {
  return value === '{"view":"pinned"}';
}

test("ordinary eligible close clears stale metadata before writing its fresh record", () => {
  const stale = JSON.stringify(makeRecordWithDepth(1));
  const fixture = makeCloseCaptureFixture({ initialValue: stale });

  fixture.manager.captureClose(fixture.event);

  assert.deepEqual(fixture.calls.map(call => call.name), [
    "deleteCustomTabValue",
    "setCustomTabValue",
  ]);
  assert.notEqual(fixture.value(), stale);
  assert.equal(validateRestoreRecord(fixture.value())?.placement.folderId, "folder-project");
});

test("middle-click suppresses Zen's pinned-tab target handler only after folder removal succeeds", () => {
  const fixture = makeCloseCaptureFixture();
  const target = { closest: selector => selector === "tab" ? fixture.tab : null };
  const path = makeBrowserDomEventPathFixture(target, { targetLabel: "pinnedTab" });
  const closeCalls = [];
  let zenPinnedHandlerCalls = 0;
  fixture.manager.adapters.eventTarget = () => path.windowTarget;
  fixture.manager.adapters.closeFolderTab = (tab, event) => closeCalls.push({ tab, event });
  fixture.manager.start(new AbortController().signal);
  path.target.addEventListener("click", () => { zenPinnedHandlerCalls++; });
  const event = {
    button: 1,
    defaultPrevented: false,
    immediatePropagationStopped: false,
    preventDefault() { this.defaultPrevented = true; },
    stopImmediatePropagation() { this.immediatePropagationStopped = true; },
  };

  path.dispatch("click", event);

  assert.deepEqual(closeCalls, [{ tab: fixture.tab, event }]);
  assert.equal(event.defaultPrevented, true);
  assert.equal(event.immediatePropagationStopped, true);
  assert.equal(zenPinnedHandlerCalls, 0);
  assert.deepEqual(path.trace, ["window:capture"]);
});

test("native close command closes folder selections before Zen's pinned handler", () => {
  const fixture = makeCloseCaptureFixture();
  const command = { id: "cmd_close" };
  const path = makeBrowserDomEventPathFixture(command);
  const closed = [];
  let nativeCalls = 0;
  Object.assign(fixture.manager.adapters, {
    eventTarget: () => path.windowTarget,
    isCloseTabCommand: event => event.target === command,
    getCloseCommandTabs: () => [fixture.tab],
    closeFolderTabs: (tabs, event) => closed.push({ tabs, event }),
  });
  fixture.manager.start(new AbortController().signal);
  path.target.addEventListener("command", () => { nativeCalls++; });
  const event = {
    defaultPrevented: false,
    preventDefault() { this.defaultPrevented = true; },
    stopImmediatePropagation() { this.immediatePropagationStopped = true; },
  };
  path.dispatch("command", event);
  assert.deepEqual(closed, [{ tabs: [fixture.tab], event }]);
  assert.equal(nativeCalls, 0);
  assert.equal(event.defaultPrevented, true);
});

test("close command leaves Essentials ordinary pins placeholders and mixed selections native", () => {
  for (const extra of [{ essential: true }, { group: null }, { empty: true }, { closing: true }]) {
    const fixture = makeCloseCaptureFixture();
    const other = { ...fixture.tab, ...extra };
    Object.assign(fixture.manager.adapters, {
      isCloseTabCommand: () => true,
      getCloseCommandTabs: () => [fixture.tab, other],
      closeFolderTabs: () => assert.fail("mixed selection must remain native"),
    });
    const event = { preventDefault: () => assert.fail("must not claim mixed command") };
    assert.equal(fixture.manager.captureCloseCommand(event), false);
  }
});

test("claimed close command does not fall through after a native close error or teardown", () => {
  const fixture = makeCloseCaptureFixture();
  let attempts = 0;
  Object.assign(fixture.manager.adapters, {
    isCloseTabCommand: () => true,
    getCloseCommandTabs: () => [fixture.tab],
    closeFolderTabs: () => { attempts++; throw new Error("native close failed"); },
  });
  const event = {
    preventDefault() { this.defaultPrevented = true; },
    stopImmediatePropagation() { this.immediatePropagationStopped = true; },
  };
  assert.equal(fixture.manager.captureCloseCommand(event), true);
  assert.equal(event.defaultPrevented, true);
  assert.equal(event.immediatePropagationStopped, true);
  assert.equal(fixture.errors[0].message, "native close failed");
  fixture.manager.destroy();
  assert.equal(fixture.manager.captureCloseCommand(event), false);
  assert.equal(attempts, 1);
});

test("browser close command adapter requires the native command and preserves bulk native removal", () => {
  const command = { id: "cmd_close" };
  const tab = { id: "selected" };
  const other = { id: "also-selected" };
  const removals = [];
  const host = {
    document: { getElementById: id => id === "cmd_close" ? command : null },
    gBrowser: {
      selectedTab: tab, selectedTabs: [tab, other], multiSelectedTabsCount: 0,
      removeTabs: (tabs, options) => removals.push({ tabs, options }),
    },
  };
  const adapters = createBrowserRestoreAdapters(host);
  assert.equal(adapters.isCloseTabCommand({ target: { id: "cmd_close" } }), false);
  assert.equal(adapters.isCloseTabCommand({ target: command }), true);
  assert.deepEqual(adapters.getCloseCommandTabs(), [tab]);
  host.gBrowser.multiSelectedTabsCount = 2;
  assert.deepEqual(adapters.getCloseCommandTabs(), [tab, other]);
  const event = { target: command };
  adapters.closeFolderTabs([tab, other], event);
  assert.deepEqual(removals, [{ tabs: [tab, other], options: { animate: true, triggeringEvent: event } }]);
});

test("failed folder removal leaves middle-click native for Zen's pinned-tab target handler", () => {
  const fixture = makeCloseCaptureFixture();
  const target = { closest: selector => selector === "tab" ? fixture.tab : null };
  const path = makeBrowserDomEventPathFixture(target, { targetLabel: "pinnedTab" });
  let zenPinnedHandlerCalls = 0;
  fixture.manager.adapters.eventTarget = () => path.windowTarget;
  fixture.manager.adapters.closeFolderTab = () => { throw new Error("remove failed"); };
  fixture.manager.start(new AbortController().signal);
  path.target.addEventListener("click", () => { zenPinnedHandlerCalls++; });
  const event = {
    button: 1,
    defaultPrevented: false,
    immediatePropagationStopped: false,
    preventDefault() { this.defaultPrevented = true; },
    stopImmediatePropagation() { this.immediatePropagationStopped = true; },
  };

  path.dispatch("click", event);

  assert.equal(fixture.errors[0]?.message, "remove failed");
  assert.equal(event.defaultPrevented, false);
  assert.equal(event.immediatePropagationStopped, false);
  assert.equal(zenPinnedHandlerCalls, 1);
  assert.deepEqual(path.trace, [
    "window:capture",
    "tabContainer:capture",
    "pinnedTab:target",
    "pinnedTab:target",
    "tabContainer:bubble",
    "window:bubble",
  ]);
});

test("middle-click interception leaves ordinary pinned tabs Essentials placeholders and left clicks native", () => {
  const cases = [
    { tabOverrides: { group: null }, button: 1 },
    { tabOverrides: { essential: true }, button: 1 },
    { tabOverrides: { empty: true }, button: 1 },
    { tabOverrides: {}, button: 0 },
  ];

  for (const current of cases) {
    const fixture = makeCloseCaptureFixture({ tabOverrides: current.tabOverrides });
    const closeCalls = [];
    fixture.manager.adapters.closeFolderTab = tab => closeCalls.push(tab);
    const event = {
      button: current.button,
      target: { closest: selector => selector === "tab" ? fixture.tab : null },
      preventDefault() { throw new Error("ineligible click must stay native"); },
      stopImmediatePropagation() { throw new Error("ineligible click must stay native"); },
    };

    assert.equal(fixture.manager.captureMiddleClick(event), false);
    assert.deepEqual(closeCalls, []);
  }
});

for (const targetName of ["row", "label", "icon", "icon-path"]) {
  test(`middle-clicking folder ${targetName} deletes only that folder`, async () => {
    const fixture = makeFolderHeaderMiddleClickFixture({ targetName });
    const event = fixture.middleClick();
    await fixture.flushAsyncDeletion();

    assert.deepEqual(fixture.deletedFolderIds(), ["leaf"]);
    assert.equal(fixture.closedChildCount(), 0);
    assert.equal(event.defaultPrevented, true);
    assert.equal(event.propagationStopped, true);
  });
}

test("enabled folder-header middle-click deletes exactly one folder and suppresses the event", async () => {
  const fixture = makeFolderHeaderMiddleClickFixture({ middleClickDelete: true });
  const event = fixture.middleClick();
  await fixture.flushAsyncDeletion();

  assert.deepEqual(fixture.deletedFolderIds(), ["leaf"]);
  assert.equal(fixture.closedChildCount(), 0);
  assert.equal(event.defaultPrevented, true);
  assert.equal(event.propagationStopped, true);
});

test("disabled folder-header middle-click leaves the direct header event native", async () => {
  const fixture = makeFolderHeaderMiddleClickFixture({ middleClickDelete: false });
  const event = fixture.middleClick();
  await fixture.flushAsyncDeletion();

  assert.deepEqual(fixture.deletedFolderIds(), []);
  assert.equal(fixture.closedChildCount(), 0);
  assert.equal(event.defaultPrevented, false);
  assert.equal(event.propagationStopped, false);
});

test("folder header control isolation leaves protected controls native", async () => {
  for (const targetName of [
    "owned-plus",
    "owned-plus-icon",
    "reset",
    "reset-icon",
    "overflow",
    "overflow-icon",
    "Essential",
    "placeholder",
  ]) {
    const fixture = makeFolderHeaderMiddleClickFixture({ targetName });
    const event = fixture.middleClick();
    await fixture.flushAsyncDeletion();

    assert.deepEqual(fixture.deletedFolderIds(), [], targetName);
    assert.equal(fixture.closedChildCount(), 0, targetName);
    assert.equal(event.defaultPrevented, false, targetName);
    assert.equal(event.propagationStopped, false, targetName);
  }
});

test("folder header control isolation preserves child-tab middle-click closing", async () => {
  const fixture = makeFolderHeaderMiddleClickFixture({ targetName: "child-tab" });
  const event = fixture.middleClick();
  await fixture.flushAsyncDeletion();

  assert.deepEqual(fixture.deletedFolderIds(), []);
  assert.equal(fixture.closedChildCount(), 1);
  assert.equal(event.defaultPrevented, true);
  assert.equal(event.propagationStopped, true);
});

test("native tab-group header middle-click stays native", async () => {
  const fixture = makeFolderHeaderMiddleClickFixture({ targetName: "native-tab-group" });
  const event = fixture.middleClick();
  await fixture.flushAsyncDeletion();

  assert.deepEqual(fixture.deletedFolderIds(), []);
  assert.equal(fixture.closedChildCount(), 0);
  assert.equal(event.defaultPrevented, false);
  assert.equal(event.propagationStopped, false);
});

test("outer nested folder header deletes only the outer folder", async () => {
  const fixture = makeFolderHeaderMiddleClickFixture({ targetName: "outer-row" });
  const event = fixture.middleClick();
  await fixture.flushAsyncDeletion();

  assert.deepEqual(fixture.deletedFolderIds(), ["outer"]);
  assert.equal(fixture.closedChildCount(), 0);
  assert.equal(event.defaultPrevented, true);
  assert.equal(event.propagationStopped, true);
});

test("live folder header middle-click deletes that live folder", async () => {
  const fixture = makeFolderHeaderMiddleClickFixture({ liveFolder: true });
  const event = fixture.middleClick();
  await fixture.flushAsyncDeletion();

  assert.deepEqual(fixture.deletedFolderIds(), ["leaf"]);
  assert.equal(fixture.closedChildCount(), 0);
  assert.equal(event.defaultPrevented, true);
  assert.equal(event.propagationStopped, true);
});

test("rejected folder deletion is diagnosed after immediate click suppression", async () => {
  const failure = new Error("folder delete failed");
  const fixture = makeFolderHeaderMiddleClickFixture({ deletionError: failure });
  const event = fixture.middleClick();

  assert.equal(event.defaultPrevented, true);
  assert.equal(event.propagationStopped, true);
  await fixture.flushAsyncDeletion();
  assert.deepEqual(fixture.deletedFolderIds(), []);
  assert.deepEqual(fixture.errors, [failure]);
});

test("one native group history transaction records and restores four folder tabs from header middle-click", async () => {
  const fixture = makeNativeFolderDeletionHistoryFixture({ tabCount: 4 });

  const event = await fixture.middleClickDelete();

  assert.equal(fixture.folderDeleteCalls, 1);
  assert.equal(fixture.removeTabGroupCalls, 1);
  assert.equal(event.defaultPrevented, true);
  assert.equal(event.immediatePropagationStopped, true);
  assert.equal(fixture.childCloseCalls, 0);
  assert.deepEqual(fixture.closedGroups.map(group => group.tabs.map(tab => tab.id)), [
    ["first", "second", "third", "fourth"],
  ]);
  assert.deepEqual(fixture._closedTabs, []);

  const restored = await fixture.restoreOnce();
  assert.equal(fixture.functionalFolderCount(), 1);
  assert.equal(restored?.isZenFolder, true);
  assert.deepEqual(fixture.realTabIds(restored), ["first", "second", "third", "fourth"]);
});

test("one native group history transaction records and restores four folder tabs from context-menu deletion", async () => {
  const fixture = makeNativeFolderDeletionHistoryFixture({ tabCount: 4 });

  await fixture.contextMenuDelete();

  assert.equal(fixture.folderDeleteCalls, 1);
  assert.equal(fixture.removeTabGroupCalls, 1);
  assert.equal(fixture.childCloseCalls, 0);
  assert.deepEqual(fixture.closedGroups.map(group => group.tabs.map(tab => tab.id)), [
    ["first", "second", "third", "fourth"],
  ]);
  assert.deepEqual(fixture._closedTabs, []);

  const restored = await fixture.restoreOnce();
  assert.equal(fixture.functionalFolderCount(), 1);
  assert.equal(restored?.isZenFolder, true);
  assert.deepEqual(fixture.realTabIds(restored), ["first", "second", "third", "fourth"]);
});

test("native folder deletion before-unload cancellation preserves children and history", async () => {
  const fixture = makeNativeFolderDeletionHistoryFixture({ tabCount: 4, beforeUnloadCancels: true });

  await fixture.contextMenuDelete();

  assert.equal(fixture.folderDeleteCalls, 1);
  assert.equal(fixture.removeTabGroupCalls, 0);
  assert.equal(fixture.folder.isConnected, true);
  assert.equal(fixture.realTabs.every(tab => tab.isConnected), true);
  assert.equal(fixture.placeholder.isConnected, true);
  assert.equal(fixture.childCloseCalls, 0);
  assert.deepEqual(fixture.closedGroups, []);
  assert.deepEqual(fixture._closedTabs, []);
});

test("group removal capture annotates every tab before SessionStore records the closed folder", () => {
  const fixture = makeFourTabGroupCloseFixture();
  const path = makeBrowserDomEventPathFixture(fixture.event.target, { targetLabel: "folder" });
  const sessionStoreSnapshots = [];
  fixture.manager.adapters.eventTarget = () => path.windowTarget;
  fixture.manager.start(new AbortController().signal);
  path.tabContainer.addEventListener("TabGroupRemoveRequested", () => {
    sessionStoreSnapshots.push(fixture.tabs.map(tab =>
      validateRestoreRecord(fixture.values.get(tab))
    ));
  }, true);

  path.dispatch("TabGroupRemoveRequested", fixture.event);

  assert.equal(sessionStoreSnapshots.length, 1);
  const [observedRecords] = sessionStoreSnapshots;
  assert.deepEqual(observedRecords.map(record => record?.placement.slot), [0, 1, 2, 3]);
  assert.equal(observedRecords.every(record => record?.placement.folderId === "folder-project"), true);
  assert.equal(observedRecords.every(record => record?.folders.at(-1).name === "Project"), true);
  assert.deepEqual(path.trace, [
    "window:capture",
    "tabContainer:capture",
    "folder:target",
    "folder:target",
    "tabContainer:bubble",
    "window:bubble",
  ]);
  assert.deepEqual(fixture.errors, []);
});

test("four group-restored tabs converge on one recreated folder in their recorded order", async () => {
  const source = makeFourTabGroupCloseFixture();
  source.manager.captureGroupClose(source.event);
  const destination = makeDeletedHierarchyFixture();
  const restoredTabs = source.tabs.map(tab => ({ id: `restored-${tab.id}` }));
  for (let index = 0; index < restoredTabs.length; index++) {
    destination.values.set(restoredTabs[index], source.values.get(source.tabs[index]));
  }

  const results = await Promise.all(restoredTabs.map(tab =>
    destination.manager.restoreTab({ target: tab })
  ));
  const leaf = destination.state.foldersById.get("folder-project");

  assert.deepEqual(results, [true, true, true, true]);
  assert.deepEqual(destination.state.createCalls.map(call => call.options.id), [
    "folder-work",
    "folder-project",
  ]);
  assert.deepEqual(destination.directIds(leaf), restoredTabs.map(tab => tab.id));
  assert.equal(restoredTabs.every(tab => tab.group === leaf), true);
});

test("restore returns a tab to third position in its existing nested folder", async () => {
  const fixture = makeExistingNestedRestoreFixture({ recordedSlot: 2 });

  await fixture.manager.restoreTab(fixture.event);

  assert.deepEqual(fixture.leaf.visibleItems.map(item => item.id), ["a", "b", "restored", "c"]);
  assert.equal(fixture.restored.group, fixture.leaf);
});

test("identical URLs restore by their own SessionStore values", async () => {
  const fixture = makeIdenticalUrlFixture();

  await fixture.restoreSecondThenFirst();

  assert.deepEqual(fixture.positions(), { first: 1, second: 3 });
});

test("ordinary close outside a folder clears its stale restore record", () => {
  const fixture = makeCloseCaptureFixture({
    initialValue: JSON.stringify(makeRecordWithDepth(1)),
    tabOverrides: { group: null },
  });

  assert.equal(fixture.manager.captureClose(fixture.event), false);
  assert.equal(validateRestoreRecord(fixture.value()), null);
  assert.deepEqual(fixture.calls.map(call => call.name), ["deleteCustomTabValue"]);
});

test("ordinary Essential, placeholder, and unsupported closes clear stale metadata", () => {
  const cases = [
    { tabOverrides: { essential: true } },
    { tabOverrides: { empty: true } },
    { tabOverrides: { unsupported: true } },
  ];

  for (const current of cases) {
    const fixture = makeCloseCaptureFixture({
      initialValue: JSON.stringify(makeRecordWithDepth(1)),
      tabOverrides: current.tabOverrides,
    });
    assert.equal(fixture.manager.captureClose(fixture.event), false);
    assert.equal(validateRestoreRecord(fixture.value()), null);
    assert.deepEqual(fixture.calls.map(call => call.name), ["deleteCustomTabValue"]);
  }
});

test("provider, build, and fresh-set failures cannot retain stale folder metadata", () => {
  const stale = JSON.stringify(makeRecordWithDepth(1));
  const cases = [
    { isSupportedFolder: () => { throw new Error("provider failed"); } },
    { getFolderData: () => { throw new Error("build failed"); } },
    { sessionStore: { setCustomTabValue: () => { throw new Error("set failed"); } } },
  ];

  for (const adapterOverrides of cases) {
    const fixture = makeCloseCaptureFixture({ initialValue: stale, adapterOverrides });
    assert.equal(fixture.manager.captureClose(fixture.event), false);
    assert.equal(validateRestoreRecord(fixture.value()), null);
    assert.equal(fixture.calls[0]?.name, "deleteCustomTabValue");
    assert.equal(fixture.errors.length, 1);
  }
});

test("adopted and skipSessionStore closes preserve their custom restore value", () => {
  const stale = JSON.stringify(makeRecordWithDepth(1));
  for (const detail of [{ adoptedBy: {} }, { skipSessionStore: true }]) {
    const fixture = makeCloseCaptureFixture({ initialValue: stale });
    fixture.event.detail = detail;
    assert.equal(fixture.manager.captureClose(fixture.event), false);
    assert.equal(fixture.value(), stale);
    assert.deepEqual(fixture.calls, []);
  }
});

test("Zen 1.21.15b window capture updates metadata before SessionStore tabContainer capture", () => {
  const stale = JSON.stringify(makeRecordWithDepth(1));
  const cases = [
    { tabOverrides: {}, observedFolderId: "folder-project" },
    { tabOverrides: { group: null }, observedFolderId: null },
  ];

  for (const current of cases) {
    const fixture = makeCloseCaptureFixture({
      initialValue: stale,
      tabOverrides: current.tabOverrides,
    });
    const path = makeNestedTabCloseEventPathFixture(fixture.tab);
    let observedValue = null;
    path.tabContainer.addEventListener("TabClose", () => {
      observedValue = fixture.value();
    }, true);
    fixture.manager.adapters.eventTarget = () => path.windowTarget;
    fixture.manager.start(new AbortController().signal);

    path.dispatch();

    assert.equal(validateRestoreRecord(observedValue)?.placement.folderId ?? null, current.observedFolderId);
    assert.deepEqual(path.trace, [
      "window:capture",
      "tabContainer:capture",
      "tab:target",
      "tab:target",
      "tabContainer:bubble",
      "window:bubble",
    ]);
  }
});

test("capture failures never escape into Firefox's close flow", () => {
  const fixture = makeCloseCaptureFixture({
    adapterOverrides: {
      sessionStore: { setCustomTabValue: () => { throw new Error("write failed"); } },
    },
  });

  assert.doesNotThrow(() => fixture.manager.captureClose(fixture.event));
  assert.equal(fixture.errors[0]?.message, "write failed");

  const brokenReporter = makeCloseCaptureFixture({
    adapterOverrides: {
      sessionStore: { setCustomTabValue: () => { throw new Error("write failed"); } },
      reportError: () => { throw new Error("report failed"); },
    },
  });
  assert.doesNotThrow(() => brokenReporter.manager.captureClose(brokenReporter.event));

  const brokenEligibility = makeCloseCaptureFixture({
    adapterOverrides: {
      isSupportedFolder: () => { throw new Error("provider failed"); },
    },
  });
  assert.doesNotThrow(() => brokenEligibility.manager.captureClose(brokenEligibility.event));
  assert.equal(brokenEligibility.errors[0]?.message, "provider failed");
});

test("restore preserves current folder state, pins once, invalidates caches, and refreshes its value", async () => {
  const fixture = makeExistingNestedRestoreFixture({
    recordedSlot: 99,
    nativeCollapseWriter: true,
  });
  fixture.restored.selected = true;

  assert.equal(await fixture.manager.restoreTab(fixture.event), true);

  assert.deepEqual(fixture.leaf.visibleItems.map(item => item.id), ["a", "b", "c", "restored"]);
  assert.deepEqual({
    name: fixture.leaf.name,
    collapsed: fixture.leaf.collapsed,
    saved: fixture.leaf.saved,
  }, { name: "Current leaf name", collapsed: true, saved: false });
  assert.equal(fixture.state.pinCalls.length, 1);
  assert.equal(fixture.state.cacheInvalidations, 1);
  assert.deepEqual(fixture.state.selectedTabs, [fixture.restored]);
  assert.equal(JSON.parse(fixture.values.get(fixture.restored)).placement.slot, 3);
});

test("ordinary background restore reapplies current collapse state after Zen native grouping", async () => {
  const fixture = makeExistingNestedRestoreFixture({
    recordedSlot: 1,
    nativeCollapseWriter: true,
  });
  fixture.restored.selected = false;
  assert.equal(fixture.leaf.collapsed, true);

  assert.equal(await fixture.manager.restoreTab(fixture.event), true);

  assert.equal(fixture.leaf.collapsed, true);
  assert.equal(JSON.parse(fixture.values.get(fixture.restored)).folders.at(-1).collapsed, true);
});

test("ordinary nested recreation reapplies recorded collapse state after Zen native grouping", async () => {
  const fixture = makeDeletedHierarchyFixture({ nativeCollapseWriter: true });
  fixture.restored.selected = false;

  assert.equal(await fixture.manager.restoreTab(fixture.event), true);

  assert.equal(fixture.state.foldersById.get("folder-work").collapsed, false);
  assert.equal(fixture.state.foldersById.get("folder-project").collapsed, true);
});

test("whole native-group restore reapplies recorded collapse state after every grouped item", async () => {
  const fixture = makeLazyDeletedGroupRestoreFixture({
    tabCount: 4,
    nativeCollapseWriter: true,
  });
  fixture.tabs[0].selected = true;

  assert.equal(await fixture.restoreNativeGroup(), true);

  assert.equal(fixture.folderCollapsed("folder-project"), true);
  for (const tab of fixture.tabs) {
    assert.equal(JSON.parse(fixture.restoreValue(tab)).folders[0].collapsed, true);
  }
});

test("restore does not repin or steal selection when Firefox did not request it", async () => {
  const fixture = makeExistingNestedRestoreFixture({ recordedSlot: 1 });
  fixture.restored.pinned = true;

  await fixture.manager.restoreTab(fixture.event);

  assert.equal(fixture.state.pinCalls.length, 0);
  assert.equal(fixture.state.selectedTabs.length, 0);
});

test("restore returns cleanly when any recorded folder ID is missing", async () => {
  const restored = { id: "restored" };
  const record = makeRecordWithDepth(2);
  record.folders[0].id = "root";
  record.folders[1].id = "leaf";
  record.folders[1].parentId = "root";
  record.placement.folderId = "leaf";
  const fixture = makeRestoreManagerFixture({
    records: [record],
    restoredTabs: [restored],
    initialItems: [{ id: "a" }],
    missingFolderIds: ["leaf"],
  });

  assert.equal(await fixture.manager.restoreTab({ target: restored }), false);
  assert.deepEqual(fixture.leaf.visibleItems.map(item => item.id), ["a"]);
  assert.equal(fixture.state.pinCalls.length, 0);
  assert.equal(fixture.state.errors.length, 0);
});

test("missing root and leaf are recreated with native placeholders, recorded settings, nesting, and order", async () => {
  const fixture = makeDeletedHierarchyFixture();

  const result = await ensureFolderPath(fixture.record, fixture.adapters);

  assert.deepEqual(result.created.map(folder => folder.label), ["Work", "Project"]);
  assert.equal(result.created[0].iconURL, "chrome://icons/work.svg");
  assert.equal(result.created[1].group, result.created[0]);
  assert.equal(result.created[1].collapsed, true);
  assert.equal(result.created[1].saveOnWindowClose, true);
  assert.equal(result.created.every(folder => folder.allItems.some(item => item.zenEmptyTab)), true);
  assert.deepEqual(fixture.topLevelIds(), ["root-before", "folder-work", "root-after"]);
  assert.deepEqual(fixture.directIds(result.created[0]), ["folder-project"]);
});

test("missing folders recover their recorded custom colours, including remapped identities", async t => {
  for (const [name, fixture] of [
    ["retained identities", makeDeletedHierarchyFixture()],
    ["remapped identity", makeFolderIdCollisionFixture()],
  ]) {
    await t.test(name, async () => {
      const applications = [];
      fixture.record.folders.forEach((folder, index) => {
        folder.color = index === 0 ? "#123456" : "#abcdef";
      });
      fixture.adapters.setFolderColor = (folder, color) => {
        folder.customColor = color;
        applications.push({ id: folder.id, color });
      };

      const result = await ensureFolderPath(fixture.record, fixture.adapters);

      assert.deepEqual(
        result.created.map(folder => folder.customColor),
        fixture.record.folders.map(folder => folder.color),
      );
      assert.deepEqual(
        applications,
        result.created.map(folder => ({ id: folder.id, color: folder.customColor })),
      );
    });
  }
});

test("partial missing ancestry reuses the modified root and recreates only the leaf", async () => {
  const fixture = makeDeletedHierarchyFixture({ existingRoot: true });

  const result = await ensureFolderPath(fixture.record, fixture.adapters);

  assert.deepEqual(result.created.map(folder => folder.id), ["folder-project"]);
  assert.equal(result.leaf.group, fixture.existingRoot);
  assert.deepEqual({
    label: fixture.existingRoot.label,
    collapsed: fixture.existingRoot.collapsed,
    saveOnWindowClose: fixture.existingRoot.saveOnWindowClose,
    iconURL: fixture.existingRoot.iconURL,
  }, {
    label: "Work renamed after close",
    collapsed: true,
    saveOnWindowClose: false,
    iconURL: "chrome://icons/current-work.svg",
  });
  assert.deepEqual(fixture.directIds(fixture.existingRoot), ["tab-alpha", "folder-project", "tab-omega"]);
});

test("existing renamed folder is reused without reverting user changes", async () => {
  const fixture = makeExistingRenamedFolderFixture();

  const result = await ensureFolderPath(fixture.record, fixture.adapters);

  assert.equal(result.leaf, fixture.existing);
  assert.equal(result.leaf.label, "Renamed after close");
  assert.deepEqual(result.created, []);
  assert.deepEqual(fixture.state.mutations, []);
});

test("deleted live folder restores its registered provider state, dismissals, and tab presentation", async () => {
  const fixture = makeDeletedLiveFolderFixture();

  assert.equal(await fixture.manager.restoreTab(fixture.event), true);

  const folder = fixture.restored.group;
  const provider = fixture.liveManager.getFolder(folder.id);
  assert.equal(folder.isLiveFolder, true);
  assert.deepEqual(provider.serialize(), JSON.parse(fixture.record.folders[0].live.serializedState));
  assert.deepEqual([...fixture.liveManager.dismissedItems], [`${folder.id}:dismissed-1`]);
  assert.deepEqual(provider.tabsState, [fixture.record.liveTab]);
  assert.equal(provider.started, true);
  assert.equal(fixture.liveManager.saveCalls, 1);
  assert.deepEqual(fixture.restored.presentation, fixture.record.presentation);
  assert.deepEqual(fixture.restored.liveTabState, fixture.record.liveTab);
  assert.equal(fixture.state.fabricatedProviderIds.length, 0);
});

test("native live departure fake matches Zen TabUngrouped dismissal side effects", async () => {
  const fixture = makeDeletedLiveFolderFixture({
    nativeLiveDeparture: true,
    initialDismissedItems: ["external-live:genuine-1"],
  });
  const originalPlacement = fixture.adapters.captureDirectItemPlacement(fixture.restored);
  const ensured = await ensureFolderPath(fixture.record, fixture.adapters);
  const sourceIdentity = { ...fixture.record.liveTab };

  ensured.leaf.addTabs([fixture.restored]);

  assert.deepEqual(fixture.state.nativeLiveDepartures, [{
    type: "TabUngrouped",
    itemId: sourceIdentity.itemId,
  }]);
  assert.equal(fixture.restored.liveTabState, null);
  assert.equal(fixture.liveManager.dismissedItems.has(sourceIdentity.itemId), true);
  assert.equal(fixture.liveManager.saveCalls, 1);

  const targetIdentity = { itemId: "folder-live:item-2", label: "Target sublabel" };
  fixture.adapters.restoreLiveTabState(fixture.restored, targetIdentity);
  fixture.adapters.restoreDirectItemPlacement(fixture.restored, originalPlacement);

  assert.deepEqual(fixture.state.nativeLiveDepartures.at(-1), {
    type: "TabUngrouped",
    itemId: targetIdentity.itemId,
  });
  assert.equal(fixture.restored.liveTabState, null);
  assert.equal(fixture.liveManager.dismissedItems.has(targetIdentity.itemId), true);
  assert.equal(fixture.liveManager.saveCalls, 2);
});

test("ordinary live restore creates no false dismissal or extra manager save", async () => {
  const genuineDismissed = ["external-live:genuine-1", "external-live:genuine-2"];
  const fixture = makeDeletedLiveFolderFixture({
    nativeLiveDeparture: true,
    initialDismissedItems: genuineDismissed,
  });

  assert.equal(await fixture.manager.restoreTab(fixture.event), true);

  const folder = fixture.restored.group;
  const targetItemId = `${folder.id}:item-1`;
  assert.deepEqual([...fixture.liveManager.dismissedItems], [
    ...genuineDismissed,
    `${folder.id}:dismissed-1`,
  ]);
  assert.equal(fixture.liveManager.dismissedItems.has(targetItemId), false);
  assert.equal(fixture.liveManager.saveCalls, 1);
  assert.deepEqual(fixture.state.nativeLiveDepartures, [{
    type: "TabUngrouped",
    itemId: null,
  }]);
});

test("whole native-group live restore creates no false dismissal with retained or remapped IDs", async t => {
  for (const [name, occupiedIds] of [
    ["retained folder ID", []],
    ["collision-remapped folder ID", ["folder-project"]],
  ]) {
    await t.test(name, async () => {
      const fixture = makeLazyDeletedGroupRestoreFixture({
        tabCount: 3,
        liveFolder: true,
        occupiedIds,
        nativeLiveDeparture: true,
        initialDismissedItems: ["external-live:genuine-group"],
      });

      assert.equal(await fixture.restoreNativeGroup(), true);

      const [folderId] = fixture.realFolderIds();
      const expectedTabsState = fixture.tabs.map((_, index) => ({
        itemId: `${folderId}:item-${index + 1}`,
        label: `Native sublabel ${index + 1}`,
      }));
      assert.deepEqual(fixture.liveProvider(folderId).tabsState, expectedTabsState);
      assert.deepEqual(fixture.providerStartSnapshots, [{
        folderId,
        tabsState: expectedTabsState,
        tabIdentities: expectedTabsState,
      }]);
      assert.deepEqual([...fixture.liveManager.dismissedItems], [
        "external-live:genuine-group",
        `${folderId}:dismissed-1`,
      ]);
      assert.equal(fixture.liveManager.saveCalls, 1);
      assert.deepEqual(
        fixture.nativeLiveDepartures.map(event => event.itemId),
        [null, null, null],
      );
    });
  }
});

test("live rollback identity clears target identity before placement without false dismissal", async () => {
  const failure = new Error("forced failure after target identity application");
  const genuineDismissed = ["external-live:genuine-before-rollback"];
  const fixture = makeDeletedLiveFolderFixture({
    existingSingle: {
      label: "Existing live folder",
      workspaceId: "workspace-main",
      collapsed: false,
      saveOnWindowClose: true,
      iconURL: null,
      isLiveFolder: true,
    },
    existingProvider: true,
    nativeLiveDeparture: true,
    initialDismissedItems: genuineDismissed,
  });
  const originalIdentity = { ...fixture.restored.liveTabState };
  const originalPresentation = {
    label: "Original live title",
    iconUrl: "https://example.test/original-live.svg",
    muted: false,
  };
  fixture.restored.presentation = { ...originalPresentation };
  const originalRestoreValue = fixture.values.get(fixture.restored);
  const originalSetValue = fixture.adapters.sessionStore.setCustomTabValue;
  let failed = false;
  fixture.adapters.sessionStore.setCustomTabValue = (...args) => {
    originalSetValue(...args);
    if (!failed) {
      failed = true;
      throw failure;
    }
  };

  assert.equal(await fixture.manager.restoreTab(fixture.event), false);

  assert.deepEqual(fixture.restored.liveTabState, originalIdentity);
  assert.deepEqual(fixture.restored.presentation, originalPresentation);
  assert.equal(fixture.restored.group, undefined);
  assert.equal(fixture.values.get(fixture.restored), originalRestoreValue);
  assert.deepEqual([...fixture.liveManager.dismissedItems], genuineDismissed);
  assert.equal(fixture.liveManager.saveCalls, 0);
  assert.deepEqual(
    fixture.state.nativeLiveDepartures.map(event => event.itemId),
    [null, null],
  );
  assert.deepEqual(fixture.state.errors, [failure]);
});

test("live rollback identity failures retain combined rollback-error reporting", async () => {
  const failures = [
    new Error("forward live identity clear failed"),
    new Error("rollback live identity clear failed"),
    new Error("rollback live identity restore failed"),
  ];
  const fixture = makeDeletedLiveFolderFixture({ nativeLiveDeparture: true });
  const originalRestoreLiveTabState = fixture.adapters.restoreLiveTabState;
  let call = 0;
  fixture.adapters.restoreLiveTabState = (...args) => {
    originalRestoreLiveTabState(...args);
    throw failures[call++];
  };

  assert.equal(await fixture.manager.restoreTab(fixture.event), false);

  assert.equal(fixture.state.errors.length, 1);
  const [reported] = fixture.state.errors;
  assert.equal(reported instanceof AggregateError, true);
  assert.match(reported.message, /restore failed.*rollback was incomplete/i);
  assert.equal(reported.errors[0], failures[0]);
  assert.equal(reported.errors[1] instanceof AggregateError, true);
  assert.deepEqual(
    reported.errors[1].errors.map(error => error.cause),
    failures.slice(1),
  );
  assert.deepEqual(fixture.restored.liveTabState, fixture.record.liveTab);
  assert.deepEqual(fixture.state.nativeLiveDepartures, []);
});

test("false dismissal guard preserves genuine dismissed IDs byte-for-byte through success and rollback", async t => {
  const genuineDismissed = [
    "external-live:genuine:alpha",
    "external-live:genuine:beta",
  ];
  const expectedBytes = JSON.stringify(genuineDismissed);

  for (const mode of ["success", "rollback"]) {
    await t.test(mode, async () => {
      const fixture = makeDeletedLiveFolderFixture({
        existingSingle: mode === "rollback" ? {
          label: "Existing live folder",
          workspaceId: "workspace-main",
          collapsed: false,
          saveOnWindowClose: true,
          iconURL: null,
          isLiveFolder: true,
        } : null,
        existingProvider: mode === "rollback",
        nativeLiveDeparture: true,
        initialDismissedItems: genuineDismissed,
      });
      if (mode === "rollback") {
        const originalSetValue = fixture.adapters.sessionStore.setCustomTabValue;
        let failed = false;
        fixture.adapters.sessionStore.setCustomTabValue = (...args) => {
          originalSetValue(...args);
          if (!failed) {
            failed = true;
            throw new Error("force genuine-dismissal rollback");
          }
        };
      }

      assert.equal(await fixture.manager.restoreTab(fixture.event), mode === "success");

      const preserved = [...fixture.liveManager.dismissedItems]
        .filter(itemId => genuineDismissed.includes(itemId));
      assert.equal(JSON.stringify(preserved), expectedBytes);
    });
  }
});

test("native live departure guard is a no-op for regular-folder tabs", async () => {
  const fixture = makeDeletedHierarchyFixture({ nativeLiveDeparture: true });
  fixture.adapters.restoreLiveTabState = () => {
    throw new Error("regular restore must not touch live identity");
  };

  assert.equal(await fixture.manager.restoreTab(fixture.event), true);
  assert.equal(fixture.liveManager.saveCalls, 0);
  assert.deepEqual(fixture.state.nativeLiveDepartures, [{
    type: "TabUngrouped",
    itemId: null,
  }]);
});

test("live records strictly capture native item identity and sublabel presentation", () => {
  const { tab, adapters } = makeNestedTabFixture({
    liveLeaf: true,
    presentation: {
      label: "Provider title",
      iconUrl: "https://example.test/provider.svg",
      muted: false,
    },
    liveTab: {
      itemId: "folder-project:item:with:colons",
      label: "Native sublabel",
    },
  });
  const record = buildRestoreRecord(tab, adapters);
  assert.deepEqual(record.liveTab, {
    itemId: "folder-project:item:with:colons",
    label: "Native sublabel",
  });

  const validationOptions = {
    providerValidators: { "pinned-tabs": pinnedTabsValidator },
  };
  for (const mutate of [
    value => { delete value.liveTab; },
    value => { value.liveTab.itemId = "other-folder:item:with:colons"; },
    value => { value.liveTab.label = 7; },
    value => { value.liveTab.extra = true; },
  ]) {
    const invalid = JSON.parse(JSON.stringify(record));
    mutate(invalid);
    assert.equal(validateRestoreRecord(invalid, validationOptions), null);
  }
  const regular = makeRecordWithDepth(1);
  regular.liveTab = { itemId: "folder-0:item-1", label: null };
  assert.equal(validateRestoreRecord(regular), null);
});

test("immediate live refresh sees retained and remapped identity before provider start", async t => {
  for (const [name, occupiedIds] of [
    ["retained folder ID", []],
    ["remapped folder ID", ["folder-live"]],
  ]) {
    await t.test(name, async () => {
      const fixture = makeDeletedLiveFolderFixture({
        occupiedIds,
        immediateProviderRefresh: true,
      });

      assert.equal(await fixture.manager.restoreTab(fixture.event), true);

      const folder = fixture.restored.group;
      const suffix = fixture.record.liveTab.itemId.slice("folder-live".length);
      const expectedIdentity = {
        itemId: `${folder.id}${suffix}`,
        label: fixture.record.liveTab.label,
      };
      const provider = fixture.liveManager.getFolder(folder.id);
      assert.deepEqual(provider.tabsState, [expectedIdentity]);
      assert.deepEqual(fixture.restored.liveTabState, expectedIdentity);
      assert.deepEqual(fixture.state.providerStartSnapshots, [{
        folderId: folder.id,
        tabsState: [expectedIdentity],
        tabIdentities: [expectedIdentity],
      }]);
      assert.deepEqual(fixture.directIds(folder), ["restored"]);
      assert.deepEqual(fixture.restored.presentation, fixture.record.presentation);
      assert.equal(fixture.restored.liveTabState.label, "Native sublabel");
    });
  }
});

test("ID collision creates a safe replacement and rewrites the restored tab record", async () => {
  const fixture = makeFolderIdCollisionFixture();
  const result = await ensureFolderPath(fixture.record, fixture.adapters);
  const actualId = result.leaf.id;
  const recordedId = fixture.record.folders.at(-1).id;

  assert.notEqual(actualId, recordedId);
  assert.equal(result.idMap.get(recordedId), actualId);
  assert.equal(fixture.unrelated.id, recordedId);
  assert.equal(fixture.unrelated.isZenFolder, false);

  const restoredFixture = makeFolderIdCollisionFixture();
  assert.equal(await restoredFixture.manager.restoreTab(restoredFixture.event), true);
  const restoredId = restoredFixture.restored.group.id;
  const refreshed = JSON.parse(restoredFixture.values.get(restoredFixture.restored));
  assert.equal(refreshed.folders.at(-1).id, restoredId);
  assert.equal(refreshed.placement.folderId, restoredId);
});

test("deleted workspace recreates the path in the active workspace with one scoped warning", async () => {
  const fixture = makeDeletedHierarchyFixture({ deletedWorkspace: true });

  const result = await ensureFolderPath(fixture.record, fixture.adapters);

  assert.equal(result.created.every(folder => folder.workspaceId === "workspace-active"), true);
  assert.equal(fixture.state.warnings.length, 1);
  assert.match(fixture.state.warnings[0], /workspace-main.*workspace-active/);
});

test("missing live provider is a hard compatibility failure without regular-folder conversion", async () => {
  const fixture = makeDeletedLiveFolderFixture({ providerRegistered: false });

  assert.equal(await fixture.manager.restoreTab(fixture.event), false);

  assert.equal(fixture.state.errors.length, 1);
  assert.match(fixture.state.errors[0].message, /provider.*rss/i);
  assert.deepEqual(fixture.state.createCalls, []);
  assert.equal(fixture.restored.closed, false);
});

test("existing live folder is reused with recorded provider payload inert when registry entry is absent", async () => {
  const fixture = makeDeletedLiveFolderFixture({
    providerRegistered: false,
    existingProvider: true,
    existingSingle: {
      label: "Current live name",
      collapsed: false,
      saveOnWindowClose: false,
      iconURL: "chrome://icons/current-live.svg",
      isLiveFolder: true,
    },
  });
  const existingProvider = fixture.liveManager.liveFolders.get(fixture.existing.id);
  fixture.record.folders[0].live.serializedState = "not-json-and-must-stay-inert";
  fixture.values.set(fixture.restored, JSON.stringify(fixture.record));

  assert.equal(await fixture.manager.restoreTab(fixture.event), true);

  assert.equal(fixture.restored.group, fixture.existing);
  assert.equal(fixture.existing.label, "Current live name");
  assert.equal(fixture.liveManager.liveFolders.get(fixture.existing.id), existingProvider);
  assert.deepEqual(fixture.state.createCalls, []);
  assert.deepEqual(fixture.state.providerRestoreCalls, []);
  const refreshed = JSON.parse(fixture.values.get(fixture.restored));
  assert.equal(
    JSON.parse(refreshed.folders[0].live.serializedState).state.url,
    "https://example.test/current.xml",
  );
});

test("missing live folder sees a provider registered after adapter construction", async () => {
  const fixture = makeDeletedLiveFolderFixture({ providerRegistered: false });
  fixture.liveManager.registry.set(fixture.FakeLiveProvider.type, fixture.FakeLiveProvider);

  assert.equal(await fixture.manager.restoreTab(fixture.event), true);

  assert.equal(fixture.state.createCalls.length, 1);
  assert.equal(fixture.restored.group.isLiveFolder, true);
  assert.equal(fixture.liveManager.liveFolders.get(fixture.restored.group.id)?.started, true);
});

test("all missing live levels are dynamically preflighted before any folder creation", async () => {
  const record = makeRecordWithDepth(2);
  record.folders[1] = {
    ...record.folders[1],
    type: "live",
    live: {
      providerType: "rss",
      serializedState: JSON.stringify({
        state: {
          interval: 900000,
          lastFetched: 0,
          options: {},
          url: "https://example.test/feed.xml",
          maxItems: 10,
          timeRange: 0,
        },
      }),
    },
  };
  record.presentation = { label: "Live", iconUrl: null, muted: false };
  record.liveTab = { itemId: "folder-1:item-1", label: null };
  const fixture = makeDeletedHierarchyFixture({ record });
  const pending = fixture.manager.restoreTab(fixture.event);
  fixture.liveManager.registry.delete("rss");

  assert.equal(await pending, false);

  assert.deepEqual(fixture.state.createCalls, []);
  assert.equal(fixture.state.errors.length, 1);
  assert.match(fixture.state.errors[0].message, /provider.*rss/i);
});

test("live provider start failure rolls back its manager state and transaction-owned folder", async () => {
  const fixture = makeDeletedLiveFolderFixture({ providerStartFails: true });

  assert.equal(await fixture.manager.restoreTab(fixture.event), false);

  assert.equal(fixture.state.errors.length, 1);
  assert.match(fixture.state.errors[0].message, /provider start failed/);
  assert.deepEqual(fixture.state.deleteOrder, ["folder-live"]);
  assert.equal(fixture.liveManager.liveFolders.size, 0);
  assert.equal(fixture.liveManager.dismissedItems.size, 0);
  assert.equal(fixture.restored.closed, false);
});

test("grouping failure rolls back empty transaction-owned folders in reverse order", async () => {
  const fixture = makeDeletedHierarchyFixture({ groupingFailure: "before-add" });

  assert.equal(await fixture.manager.restoreTab(fixture.event), false);

  assert.deepEqual(fixture.state.deleteOrder, ["folder-project", "folder-work"]);
  assert.equal(fixture.state.foldersById.has("folder-work"), false);
  assert.equal(fixture.state.foldersById.has("folder-project"), false);
  assert.equal(fixture.restored.closed, false);
});

test("rollback deletion failure is reported without deleting a pre-existing ancestor", async () => {
  const fixture = makeDeletedHierarchyFixture({
    existingRoot: true,
    groupingFailure: "before-add",
  });
  const preExistingRoot = fixture.existingRoot;
  const rollbackFailure = new Error("forced rollback deletion failure");
  fixture.adapters.rollbackCreatedFolder = async folder => {
    assert.equal(folder.id, "folder-project");
    throw rollbackFailure;
  };

  assert.equal(await fixture.manager.restoreTab(fixture.event), false);

  assert.equal(fixture.state.foldersById.get("folder-work"), preExistingRoot);
  assert.equal(fixture.state.foldersById.has("folder-project"), true);
  assert.deepEqual(fixture.state.deleteOrder, []);
  assert.equal(fixture.state.errors.length, 1);
  const [reported] = fixture.state.errors;
  assert.equal(reported instanceof AggregateError, true);
  assert.match(reported.message, /rollback.*incomplete/i);
  assert.match(reported.errors[0].message, /grouping failed before add/);
  assert.equal(reported.errors[1] instanceof AggregateError, true);
  assert.equal(reported.errors[1].errors[0].cause, rollbackFailure);
});

test("rollback preserves recreated folders when external user content arrives", async () => {
  const fixture = makeDeletedHierarchyFixture({
    groupingFailure: "after-add",
    groupingFailureAddsUserContent: true,
  });

  assert.equal(await fixture.manager.restoreTab(fixture.event), false);

  assert.deepEqual(fixture.state.deleteOrder, []);
  assert.equal(fixture.state.foldersById.has("folder-work"), true);
  assert.equal(fixture.state.foldersById.has("folder-project"), true);
  assert.equal(fixture.restored.group, undefined);
  assert.deepEqual(
    fixture.state.foldersById.get("folder-project").visibleItems
      .filter(item => !item.zenEmptyTab)
      .map(item => item.id),
    ["user-content"],
  );
  assert.equal(fixture.restored.closed, false);
});

test("runtime depth and registered provider validators gate restoration before adapters", async () => {
  const tooDeepTab = { id: "too-deep" };
  const tooDeep = makeRestoreManagerFixture({
    records: [makeRecordWithDepth(2)],
    restoredTabs: [tooDeepTab],
    initialItems: [],
    adapterOverrides: { getMaxFolderDepth: () => 1 },
  });
  assert.equal(await tooDeep.manager.restoreTab({ target: tooDeepTab }), false);
  assert.equal(tooDeep.state.pinCalls.length, 0);

  const liveTab = { id: "live" };
  const liveRecord = makeLiveRecord();
  const rejected = makeRestoreManagerFixture({
    records: [liveRecord],
    restoredTabs: [liveTab],
    initialItems: [],
    adapterOverrides: { providerValidators: { "pinned-tabs": () => false } },
  });
  assert.equal(await rejected.manager.restoreTab({ target: liveTab }), false);
  assert.equal(rejected.state.pinCalls.length, 0);
});

test("restore places a supported split wrapper at the tab's direct ordinal", async () => {
  const restored = { id: "restored", selected: false };
  const wrapper = { id: "split-wrapper", tabs: [{ id: "other" }, restored] };
  restored.group = wrapper;
  const record = makeRecordWithDepth(2);
  record.folders[0].id = "root";
  record.folders[1].id = "leaf";
  record.folders[1].parentId = "root";
  record.placement = { folderId: "leaf", slot: 1, previousId: null, nextId: null };
  record.split = { id: "split-7", itemSlot: 1 };
  const fixture = makeRestoreManagerFixture({
    records: [record],
    restoredTabs: [restored],
    initialItems: [{ id: "a" }, { id: "b" }],
    adapterOverrides: {
      getDirectItem: tab => tab === restored ? wrapper : tab,
      getTabFolder: tab => tab === restored ? wrapper.group : tab.group,
      getSplit: tab => tab === restored ? { id: "split-7", itemSlot: 1 } : null,
    },
  });

  await fixture.manager.restoreTab({ target: restored });

  assert.deepEqual(fixture.leaf.visibleItems.map(item => item.id), ["a", "split-wrapper", "b"]);
  assert.deepEqual(fixture.state.addTabsCalls, [[wrapper]]);
});

test("destroyed managers discard queued restores without touching the tab", async () => {
  const fixture = makeExistingNestedRestoreFixture({ recordedSlot: 1 });
  let release;
  fixture.manager.queue = new Promise(resolve => { release = resolve; });
  const pending = fixture.manager.restoreTab(fixture.event);

  fixture.manager.destroy();
  release();

  assert.equal(await pending, false);
  assert.deepEqual(fixture.leaf.visibleItems.map(item => item.id), ["a", "b", "c"]);
  assert.equal(fixture.state.errors.length, 0);
});

test("teardown during live-folder recreation prevents delayed tab mutations", async () => {
  const fixture = makeDeletedLiveFolderFixture();
  const originalGroup = fixture.restored.group;
  const originalParentFolder = fixture.restored.parentFolder;
  let releaseProvider;
  let signalProviderStarted;
  const providerStarted = new Promise(resolve => { signalProviderStarted = resolve; });
  fixture.adapters.restoreLiveProvider = async () => {
    signalProviderStarted();
    await new Promise(resolve => { releaseProvider = resolve; });
  };

  const pending = fixture.manager.restoreTab(fixture.event);
  await providerStarted;
  fixture.manager.destroy();
  releaseProvider();

  assert.equal(await pending, false);
  assert.deepEqual(fixture.state.pinCalls, []);
  assert.equal(fixture.restored.group, originalGroup);
  assert.equal(fixture.restored.parentFolder, originalParentFolder);
  assert.equal(fixture.state.foldersById.has(fixture.record.folders[0].id), false);
  assert.equal(fixture.state.errors.length, 0);
});

test("teardown during ancestor live-provider restoration blocks descendant mutations", async () => {
  const record = makeRecordWithDepth(2);
  record.folders[0] = {
    ...record.folders[0],
    type: "live",
    live: {
      providerType: "rss",
      serializedState: JSON.stringify({ state: { url: "https://example.test/feed.xml" } }),
    },
  };
  const fixture = makeDeletedHierarchyFixture({ record });
  const originalGroup = fixture.restored.group;
  const originalParentFolder = fixture.restored.parentFolder;
  let releaseProvider;
  let signalProviderStarted;
  const providerStarted = new Promise(resolve => { signalProviderStarted = resolve; });
  fixture.adapters.restoreLiveProvider = async () => {
    signalProviderStarted();
    await new Promise(resolve => { releaseProvider = resolve; });
  };

  const pending = fixture.manager.restoreTab(fixture.event);
  await providerStarted;
  const mutationsAtTeardown = [...fixture.state.mutations];
  fixture.manager.destroy();
  releaseProvider();

  assert.equal(await pending, false);
  assert.deepEqual(fixture.state.mutations, mutationsAtTeardown);
  assert.deepEqual(fixture.state.createCalls.map(call => call.options.id), ["folder-0"]);
  assert.deepEqual(fixture.state.pinCalls, []);
  assert.equal(fixture.restored.group, originalGroup);
  assert.equal(fixture.restored.parentFolder, originalParentFolder);
  assert.equal(fixture.state.foldersById.has("folder-0"), false);
  assert.equal(fixture.state.foldersById.has("folder-1"), false);
  assert.equal(fixture.state.errors.length, 0);
});

test("pin-triggered teardown stops before folder grouping", async () => {
  const fixture = makeExistingNestedRestoreFixture({ recordedSlot: 1 });
  let groupedAfterTeardown = false;

  const originalPinTab = fixture.adapters.pinTab;
  fixture.adapters.pinTab = tab => {
    originalPinTab(tab);
    fixture.manager.destroy();
  };
  fixture.adapters.unpinTab = tab => { tab.pinned = false; };
  const originalAddTabs = fixture.leaf.addTabs;
  fixture.leaf.addTabs = tabs => {
    groupedAfterTeardown = fixture.manager.destroyed;
    originalAddTabs(tabs);
  };

  assert.equal(await fixture.manager.restoreTab(fixture.event), false);
  assert.equal(groupedAfterTeardown, false);
  assert.equal(fixture.restored.group, undefined);
  assert.equal(fixture.restored.pinned, false);
  assert.equal(fixture.state.errors.length, 0);
});

test("pin failure after teardown rolls back pin state and reports the native error", async () => {
  const fixture = makeExistingNestedRestoreFixture({ recordedSlot: 1 });
  const pinFailure = new Error("forced pin failure after teardown");

  const originalPinTab = fixture.adapters.pinTab;
  fixture.adapters.pinTab = tab => {
    originalPinTab(tab);
    fixture.manager.destroy();
    throw pinFailure;
  };
  fixture.adapters.unpinTab = tab => { tab.pinned = false; };

  assert.equal(await fixture.manager.restoreTab(fixture.event), false);
  assert.equal(fixture.restored.pinned, false);
  assert.equal(fixture.restored.group, undefined);
  assert.deepEqual(fixture.state.errors, [pinFailure]);
});

test("ordinary restore rolls back every journaled mutation after non-teardown failures", async t => {
  for (const phase of [
    "pin",
    "group",
    "placement",
    "presentation",
    "cache",
    "selection",
    "metadata",
  ]) {
    await t.test(phase, async () => {
      const record = makeRecordWithDepth(2);
      record.folders[0].id = "root";
      record.folders[1] = {
        ...record.folders[1],
        id: "leaf",
        parentId: "root",
        type: "live",
        live: { providerType: "pinned-tabs", serializedState: '{"view":"pinned"}' },
      };
      record.placement = { folderId: "leaf", slot: 1, previousId: null, nextId: null };
      record.presentation = {
        label: "Recorded",
        iconUrl: "https://example.test/recorded.svg",
        muted: true,
      };
      record.liveTab = { itemId: "leaf:item-1", label: "Recorded sublabel" };
      const restored = {
        id: "restored",
        pinned: false,
        selected: false,
        presentation: {
          label: "Original",
          iconUrl: "https://example.test/original.svg",
          muted: false,
        },
        liveTabState: { itemId: "original:item-1", label: "Original sublabel" },
      };
      const fixture = makeRestoreManagerFixture({
        records: [record],
        restoredTabs: [restored],
        initialItems: [{ id: "a" }, { id: "b" }, { id: "c" }],
        nativeCollapseWriter: true,
        adapterOverrides: {
          providerValidators: { "pinned-tabs": value => value === '{"view":"pinned"}' },
        },
      });
      const failure = new Error(`forced ${phase} failure`);
      const originalRestoreValue = fixture.values.get(restored);
      const originalLeafItems = [...fixture.leaf.visibleItems];
      const before = { id: "before" };
      const after = { id: "after" };
      const originalItems = [before, restored, after];
      const originalParent = {
        insertBefore(item, target) {
          const current = originalItems.indexOf(item);
          if (current >= 0) originalItems.splice(current, 1);
          const targetIndex = target === null ? -1 : originalItems.indexOf(target);
          originalItems.splice(targetIndex < 0 ? originalItems.length : targetIndex, 0, item);
          item.parentNode = this;
        },
      };
      restored.parentNode = originalParent;
      const originallySelected = { id: "originally-selected", selected: true };

      fixture.adapters.getFolderData = folder => ({
        id: folder.id,
        workspaceId: "workspace-main",
        name: folder.name ?? folder.id,
        iconUrl: null,
        collapsed: folder.collapsed,
        saved: folder.saved,
        type: folder === fixture.leaf ? "live" : "regular",
      });
      fixture.adapters.getLiveFolderState = folder => folder === fixture.leaf
        ? { providerType: "pinned-tabs", serializedState: '{"view":"pinned"}' }
        : null;
      fixture.adapters.getDismissed = () => [];
      fixture.adapters.getTabPresentation = tab => ({ ...tab.presentation });
      fixture.adapters.restoreTabPresentation = (tab, presentation) => {
        tab.presentation = { ...presentation };
      };
      fixture.adapters.getLiveTabState = tab => ({ ...tab.liveTabState });
      fixture.adapters.restoreLiveTabState = (tab, liveTabState) => {
        tab.liveTabState = liveTabState === null ? null : { ...liveTabState };
      };
      fixture.adapters.captureDirectItemPlacement = item => ({
        parent: item.parentNode,
        nextSibling: originalItems[originalItems.indexOf(item) + 1] ?? null,
      });
      fixture.adapters.restoreDirectItemPlacement = (item, placement) => {
        const leafIndex = fixture.leaf.visibleItems.indexOf(item);
        if (leafIndex >= 0) fixture.leaf.visibleItems.splice(leafIndex, 1);
        placement.parent.insertBefore(item, placement.nextSibling);
        delete item.group;
      };
      fixture.adapters.unpinTab = tab => { tab.pinned = false; };
      fixture.adapters.isSelected = tab => tab === restored;
      fixture.adapters.getSelectedTab = () => originallySelected;
      fixture.adapters.selectTab = tab => {
        originallySelected.selected = false;
        tab.selected = true;
      };
      fixture.adapters.restoreSelectedTab = tab => {
        restored.selected = false;
        if (tab) tab.selected = true;
      };

      const wrapAfter = (object, name) => {
        const original = object[name];
        let thrown = false;
        object[name] = (...args) => {
          const result = original(...args);
          if (!thrown) {
            thrown = true;
            throw failure;
          }
          return result;
        };
      };
      if (phase === "pin") wrapAfter(fixture.adapters, "pinTab");
      if (phase === "group") wrapAfter(fixture.leaf, "addTabs");
      if (phase === "placement") wrapAfter(fixture.adapters, "insertDirectItem");
      if (phase === "presentation") wrapAfter(fixture.adapters, "restoreTabPresentation");
      if (phase === "cache") wrapAfter(fixture.adapters, "invalidateTabCaches");
      if (phase === "selection") wrapAfter(fixture.adapters, "selectTab");
      if (phase === "metadata") wrapAfter(fixture.adapters.sessionStore, "setCustomTabValue");

      assert.equal(await fixture.manager.restoreTab({ target: restored }), false);
      assert.equal(restored.pinned, false);
      assert.deepEqual(originalItems, [before, restored, after]);
      assert.deepEqual(fixture.leaf.visibleItems, originalLeafItems);
      assert.equal(restored.group, undefined);
      assert.deepEqual(restored.presentation, {
        label: "Original",
        iconUrl: "https://example.test/original.svg",
        muted: false,
      });
      assert.deepEqual(restored.liveTabState, {
        itemId: "original:item-1",
        label: "Original sublabel",
      });
      assert.equal(restored.selected, false);
      assert.equal(originallySelected.selected, true);
      assert.equal(fixture.leaf.collapsed, true);
      assert.equal(fixture.values.get(restored), originalRestoreValue);
      assert.deepEqual(fixture.state.errors, [failure]);
    });
  }
});

test("re-entrant teardown after restore mutations rolls back only the restored tab", async t => {
  for (const phase of [
    "pinTab",
    "addTabs",
    "insertDirectItem",
    "selectTab",
  ]) {
    await t.test(phase, async () => {
      const fixture = makeExistingNestedRestoreFixture({ recordedSlot: 1 });
      const originalItems = [...fixture.leaf.visibleItems];
      fixture.restored.selected = true;
      const originalRestoreValue = fixture.values.get(fixture.restored);

      const originalPinTab = fixture.adapters.pinTab;
      fixture.adapters.pinTab = tab => {
        originalPinTab(tab);
        if (phase === "pinTab") fixture.manager.destroy();
      };
      fixture.adapters.unpinTab = tab => { tab.pinned = false; };

      const originalAddTabs = fixture.leaf.addTabs;
      fixture.leaf.addTabs = tabs => {
        originalAddTabs(tabs);
        if (phase === "addTabs") fixture.manager.destroy();
      };
      fixture.adapters.captureDirectItemPlacement = () => ({ kind: "top-level" });
      fixture.adapters.restoreDirectItemPlacement = item => {
        const index = fixture.leaf.visibleItems.indexOf(item);
        if (index >= 0) fixture.leaf.visibleItems.splice(index, 1);
        delete item.group;
        delete item.parentFolder;
      };

      const originalInsertDirectItem = fixture.adapters.insertDirectItem;
      fixture.adapters.insertDirectItem = (...args) => {
        originalInsertDirectItem(...args);
        if (phase === "insertDirectItem") fixture.manager.destroy();
      };

      fixture.adapters.getSelectedTab = () => fixture.restored;
      fixture.adapters.restoreSelectedTab = tab => {
        fixture.restored.selected = tab === fixture.restored;
      };
      const originalSelectTab = fixture.adapters.selectTab;
      fixture.adapters.selectTab = tab => {
        originalSelectTab(tab);
        if (phase === "selectTab") fixture.manager.destroy();
      };

      assert.equal(await fixture.manager.restoreTab(fixture.event), false);
      assert.equal(fixture.restored.pinned, false);
      assert.deepEqual(fixture.leaf.visibleItems, originalItems);
      assert.equal(fixture.restored.group, undefined);
      assert.equal(fixture.restored.selected, true);
      assert.equal(fixture.values.get(fixture.restored), originalRestoreValue);
      assert.equal(fixture.state.errors.length, 0);
    });
  }
});

test("re-entrant teardown from presentation restore reverses only restored-tab changes", async () => {
  const fixture = makeDeletedLiveFolderFixture({
    existingSingle: {
      label: "Existing live folder",
      workspaceId: "workspace-main",
      collapsed: false,
      saveOnWindowClose: true,
      isLiveFolder: true,
    },
    existingProvider: true,
  });
  const originalItems = [...fixture.existing.visibleItems];
  const originalPresentation = {
    label: "Original label",
    iconUrl: "https://example.test/original.svg",
    muted: false,
  };
  fixture.restored.presentation = { ...originalPresentation };
  const originalRestoreValue = fixture.values.get(fixture.restored);
  fixture.adapters.unpinTab = tab => { tab.pinned = false; };
  fixture.adapters.captureDirectItemPlacement = () => ({ kind: "top-level" });
  fixture.adapters.restoreDirectItemPlacement = item => {
    const index = fixture.existing.visibleItems.indexOf(item);
    if (index >= 0) fixture.existing.visibleItems.splice(index, 1);
    delete item.group;
    delete item.parentFolder;
  };
  let presentationCalls = 0;
  const originalRestorePresentation = fixture.adapters.restoreTabPresentation;
  fixture.adapters.restoreTabPresentation = (tab, presentation) => {
    originalRestorePresentation(tab, presentation);
    if (++presentationCalls === 1) fixture.manager.destroy();
  };

  assert.equal(await fixture.manager.restoreTab(fixture.event), false);
  assert.equal(fixture.restored.pinned, false);
  assert.deepEqual(fixture.existing.visibleItems, originalItems);
  assert.equal(fixture.restored.group, undefined);
  assert.deepEqual(fixture.restored.presentation, originalPresentation);
  assert.equal(fixture.values.get(fixture.restored), originalRestoreValue);
  assert.equal(fixture.state.errors.length, 0);
});

test("re-entrant teardown reports an incomplete restored-tab rollback", async () => {
  const fixture = makeExistingNestedRestoreFixture({ recordedSlot: 1 });
  const originalItems = [...fixture.leaf.visibleItems];
  const rollbackFailure = new Error("forced direct-item rollback failure");
  fixture.adapters.unpinTab = tab => { tab.pinned = false; };
  fixture.adapters.captureDirectItemPlacement = () => ({ kind: "top-level" });
  fixture.adapters.restoreDirectItemPlacement = () => { throw rollbackFailure; };
  const originalAddTabs = fixture.leaf.addTabs;
  fixture.leaf.addTabs = tabs => {
    originalAddTabs(tabs);
    fixture.manager.destroy();
  };

  assert.equal(await fixture.manager.restoreTab(fixture.event), false);
  assert.equal(fixture.restored.pinned, false);
  assert.deepEqual(
    fixture.leaf.visibleItems.filter(item => item !== fixture.restored),
    originalItems,
  );
  assert.equal(fixture.leaf.visibleItems.includes(fixture.restored), true);
  assert.equal(fixture.state.errors.length, 1);
  const [reported] = fixture.state.errors;
  assert.equal(reported instanceof AggregateError, true);
  assert.match(reported.message, /restored-tab rollback was incomplete/i);
  assert.equal(reported.errors[0].cause, rollbackFailure);
});

test("listeners are capture-phase, signal-owned, and registered on the supplied window target", () => {
  const calls = [];
  const target = { addEventListener: (type, listener, options) => calls.push({ type, listener, options }) };
  const manager = new FolderRestoreManager({ eventTarget: () => target });
  const controller = new AbortController();

  manager.start(controller.signal);

  assert.deepEqual(calls.map(call => call.type), [
    "TabClose",
    "TabGroupRemoveRequested",
    "TabGroupCreate",
    "click",
    "command",
    "SSTabRestoring",
  ]);
  assert.equal(calls.every(call => call.options.capture === true), true);
  assert.equal(calls.every(call => call.options.signal === controller.signal), true);
  controller.abort();
  assert.equal(manager.destroyed, true);
});

test("browser restore adapters match installed Zen split, preference, path, and cache shapes", () => {
  const cacheCalls = [];
  const removeCalls = [];
  const root = { id: "root", isZenFolder: true };
  const leaf = { id: "leaf", isZenFolder: true };
  const unrelated = { id: "leaf", isZenFolder: false };
  const wrapper = { tagName: "tab-split-view-wrapper", splitViewId: 7, tabs: [] , group: leaf };
  const tab = {
    localName: "tab",
    splitview: wrapper,
    hasAttribute: name => name === "zen-essential",
  };
  wrapper.tabs.push({ id: "other" }, tab);
  const directTab = { id: "direct", localName: "tab" };
  const nestedTab = { id: "nested", localName: "tab" };
  const nestedFolder = { id: "nested-folder", isZenFolder: true, allItems: [nestedTab] };
  leaf.allItems = [directTab, wrapper, nestedFolder, { zenEmptyTab: true }];
  const byId = new Map([["root", root], ["leaf", leaf], ["unrelated", unrelated]]);
  const prefCalls = [];
  const host = {
    document: { getElementById: id => byId.get(id) ?? null },
    gBrowser: {
      isTab: item => item?.localName === "tab",
      isSplitViewWrapper: item => item?.tagName === "tab-split-view-wrapper",
      tabContainer: { _invalidateCachedTabs: () => cacheCalls.push("tabs") },
      removeTab: (removedTab, options) => removeCalls.push({ removedTab, options }),
    },
    Services: { prefs: { getIntPref: (...args) => { prefCalls.push(args); return 4; } } },
  };
  const adapters = createBrowserRestoreAdapters(host);

  assert.equal(adapters.getMaxFolderDepth(), 4);
  assert.deepEqual(prefCalls, [["zen.folders.max-subfolders", 5]]);
  assert.equal(adapters.getTabFolder(tab), leaf);
  assert.equal(adapters.getDirectItem(tab), wrapper);
  assert.deepEqual(adapters.getSplit(tab), { id: "7", itemSlot: 1 });
  assert.deepEqual(adapters.getGroupTabsForClose(leaf), [directTab, tab, nestedTab]);
  const clickEvent = { button: 1 };
  adapters.closeFolderTab(directTab, clickEvent);
  assert.deepEqual(removeCalls, [{
    removedTab: directTab,
    options: { animate: true, triggeringEvent: clickEvent },
  }]);
  assert.deepEqual(adapters.resolveFolderPath([{ id: "root" }, { id: "leaf" }]), [root, leaf]);
  assert.equal(adapters.resolveFolderPath([{ id: "unrelated" }]), null);
  adapters.invalidateTabCaches();
  assert.deepEqual(cacheCalls, ["tabs"]);
  assert.equal(adapters.isEssential(tab), true);
  assert.deepEqual(adapters.getFolderData({
    id: null,
    name: "Broken",
    collapsed: false,
    saveOnWindowClose: false,
    isLiveFolder: false,
  }), {
    id: null,
    workspaceId: null,
    name: "Broken",
    iconUrl: null,
    collapsed: false,
    saved: false,
    type: "regular",
  });
});

test("browser live identity adapters preserve installed item and sublabel state", () => {
  const attributes = new Map([
    ["zen-live-folder-item-id", "folder-live:item-1"],
    ["zen-show-sublabel", "Native sublabel"],
  ]);
  const sublabel = {};
  const l10nCalls = [];
  const tab = {
    getAttribute: name => attributes.get(name) ?? null,
    hasAttribute: name => attributes.has(name),
    setAttribute: (name, value) => attributes.set(name, String(value)),
    removeAttribute: name => attributes.delete(name),
    querySelector: selector => selector === ".zen-tab-sublabel" ? sublabel : null,
  };
  const adapters = createBrowserRestoreAdapters({
    gBrowser: { tabs: [], tabContainer: {} },
    document: {
      l10n: { setArgs: (...args) => l10nCalls.push(args) },
    },
    SessionStore: {},
  });
  assert.equal(typeof adapters.getLiveTabState, "function");
  assert.equal(typeof adapters.restoreLiveTabState, "function");
  assert.deepEqual(adapters.getLiveTabState(tab), {
    itemId: "folder-live:item-1",
    label: "Native sublabel",
  });

  adapters.restoreLiveTabState(tab, {
    itemId: "folder-safe:item-1",
    label: "Changed sublabel",
  });
  assert.equal(attributes.get("zen-live-folder-item-id"), "folder-safe:item-1");
  assert.equal(attributes.get("zen-show-sublabel"), "Changed sublabel");
  assert.deepEqual(l10nCalls.at(-1), [sublabel, { tabSubtitle: "Changed sublabel" }]);

  adapters.restoreLiveTabState(tab, null);
  assert.equal(attributes.has("zen-live-folder-item-id"), false);
  assert.equal(attributes.has("zen-show-sublabel"), false);
  assert.deepEqual(l10nCalls.at(-1), [sublabel, { tabSubtitle: "zen-default-pinned" }]);
});

test("browser recreation treats synchronized-window and manager-only folder IDs as globally occupied", async () => {
  const syncOwner = {};
  const remoteDeletes = [];
  const remoteFolder = {
    id: "folder-remote",
    isZenFolder: true,
    async delete() { remoteDeletes.push(this.id); },
  };
  const remoteById = new Map([[remoteFolder.id, remoteFolder]]);
  const remoteWindow = {
    __SSi: "remote-window",
    closed: false,
    gZenWindowSync: syncOwner,
    gZenWorkspaces: { privateWindowOrDisabled: false },
    document: { getElementById: id => remoteById.get(id) ?? null },
  };
  const foreignProvider = { id: "folder-manager-only", stopCalls: 0, stop() { this.stopCalls++; } };
  const liveManager = {
    registry: new Map(),
    liveFolders: new Map([[foreignProvider.id, foreignProvider]]),
    dismissedItems: new Set([`${foreignProvider.id}:kept`]),
    saveState() {},
  };
  const localById = new Map();
  const localChildren = [];
  const localContainer = {
    children: localChildren,
    insertBefore(item, target) {
      const current = localChildren.indexOf(item);
      if (current >= 0) localChildren.splice(current, 1);
      const targetIndex = target === null ? -1 : localChildren.indexOf(target);
      localChildren.splice(targetIndex < 0 ? localChildren.length : targetIndex, 0, item);
      item.parentElement = this;
    },
  };
  let uuid = 0;
  const host = {
    __SSi: "local-window",
    closed: false,
    gZenWindowSync: syncOwner,
    ChromeUtils: {
      importESModule: () => ({ ZenLiveFoldersManager: liveManager }),
    },
    Services: {
      prefs: { getIntPref: (_name, fallback) => fallback },
      uuid: { generateUUID: () => ({ toString: () => `{safe-${++uuid}}` }) },
      wm: { getEnumerator: () => [host, remoteWindow][Symbol.iterator]() },
    },
    console: { error() {}, warn() {} },
    document: { getElementById: id => localById.get(id) ?? null },
    gBrowser: {
      isTab: item => item?.localName === "tab",
      isSplitViewWrapper: () => false,
      tabContainer: { _invalidateCachedTabs() {} },
    },
    gZenFolders: {
      createFolder(_tabs, options) {
        const folder = {
          id: options.id,
          label: options.label,
          isZenFolder: true,
          isLiveFolder: false,
          parentElement: localContainer,
          allItems: [{ id: `${options.id}-empty`, zenEmptyTab: true }],
          async delete() {
            localById.delete(this.id);
            const index = localChildren.indexOf(this);
            if (index >= 0) localChildren.splice(index, 1);
          },
        };
        localById.set(folder.id, folder);
        localChildren.push(folder);
        return folder;
      },
      setFolderUserIcon(folder, iconUrl) { folder.iconURL = iconUrl; },
    },
    gZenWorkspaces: {
      privateWindowOrDisabled: false,
      activeWorkspace: "workspace-main",
      getWorkspaceFromId: id => ({ uuid: id }),
    },
  };
  const adapters = createBrowserRestoreAdapters(host);
  const remoteRecord = makeRecordWithDepth(1);
  remoteRecord.folders[0].id = remoteFolder.id;
  remoteRecord.placement.folderId = remoteFolder.id;
  const managerRecord = makeRecordWithDepth(1);
  managerRecord.folders[0].id = foreignProvider.id;
  managerRecord.placement.folderId = foreignProvider.id;

  assert.equal(adapters.findZenFolder(remoteFolder.id), null);
  assert.equal(adapters.isIdFree(remoteFolder.id), false);
  assert.equal(adapters.isIdFree(foreignProvider.id), false);

  const remoteResult = await ensureFolderPath(remoteRecord, adapters);
  const managerResult = await ensureFolderPath(managerRecord, adapters);

  assert.equal(remoteResult.leaf.id, "safe-1");
  assert.equal(managerResult.leaf.id, "safe-2");
  assert.equal(remoteById.get(remoteFolder.id), remoteFolder);
  assert.equal(liveManager.liveFolders.get(foreignProvider.id), foreignProvider);
  assert.deepEqual([...liveManager.dismissedItems], [`${foreignProvider.id}:kept`]);

  await adapters.rollbackCreatedFolder(remoteFolder);
  assert.deepEqual(remoteDeletes, []);
  assert.equal(foreignProvider.stopCalls, 0);
  assert.equal(liveManager.liveFolders.get(foreignProvider.id), foreignProvider);
});

test("browser recreation adapters match installed Zen folder and live-provider shapes", async () => {
  const calls = {
    color: [],
    colorRollback: [],
    create: [],
    icon: [],
    iconRepair: [],
    save: 0,
    tabIcons: [],
    warnings: [],
  };
  const colors = new Map([["folder-live-new", "#010203"]]);
  const colorManager = {
    captureLedgerState(folder) {
      return colors.has(folder.id)
        ? { exists: true, color: colors.get(folder.id), updatedAt: 1 }
        : { exists: false };
    },
    getColor: folder => colors.get(folder.id) ?? null,
    setColor(folder, color) {
      colors.set(folder.id, color);
      calls.color.push([folder.id, color]);
      return true;
    },
    restoreLedgerState(folder, state) {
      if (state.exists) colors.set(folder.id, state.color);
      else colors.delete(folder.id);
      calls.colorRollback.push([folder.id, state]);
      return true;
    },
  };
  const before = { id: "before", localName: "tab" };
  const after = { id: "after", localName: "tab" };
  const children = [before, after];
  const container = {
    children,
    insertBefore(item, target) {
      const current = children.indexOf(item);
      if (current >= 0) children.splice(current, 1);
      const index = target === null ? -1 : children.indexOf(target);
      children.splice(index < 0 ? children.length : index, 0, item);
      item.parentElement = this;
    },
  };
  class BaseProvider {
    constructor({ id, state, manager }) {
      this.id = id;
      this.state = { ...state };
      this.manager = manager;
      this.started = false;
    }
    start() { this.started = true; }
    stop() { this.started = false; }
    serialize() { return { state: this.state }; }
  }
  class RssProvider extends BaseProvider {
    static type = "rss";
    constructor({ id, state, manager }) {
      super({ id, state, manager });
      this.state.url = state.url;
      this.state.maxItems = state.maxItems ?? 10;
      this.state.timeRange = state.timeRange ?? 0;
    }
  }
  class GithubProvider extends BaseProvider {
    static type = "github";
    constructor({ id, state, manager }) {
      super({ id, state, manager });
      this.state.type = state.type;
      this.state.url = state.type === "pull-requests"
        ? "https://github.com/pulls"
        : "https://github.com/issues/assigned";
      this.state.repos = new Set(state.repos ?? []);
      this.state.options = { ...state.options, repoExcludes: new Set(state.options.repoExcludes ?? []) };
    }
    serialize() {
      return {
        state: {
          ...this.state,
          repos: [...this.state.repos],
          options: { ...this.state.options, repoExcludes: [...this.state.options.repoExcludes] },
        },
      };
    }
  }
  class UnsupportedProvider extends BaseProvider {
    static type = "unsupported-test-provider";
  }
  const liveManager = {
    registry: new Map([
      [RssProvider.type, RssProvider],
      [UnsupportedProvider.type, UnsupportedProvider],
    ]),
    liveFolders: new Map(),
    dismissedItems: new Set(),
    getFolder(id) { return this.liveFolders.get(id); },
    saveState() { calls.save++; },
  };
  const unrelated = { id: "occupied", isZenFolder: false };
  const byId = new Map([[unrelated.id, unrelated]]);
  const host = {
    ChromeUtils: {
      importESModule: path => {
        assert.equal(path, "resource:///modules/zen/ZenLiveFoldersManager.sys.mjs");
        return { ZenLiveFoldersManager: liveManager };
      },
    },
    SessionStore: {},
    Services: {
      prefs: { getIntPref: (_name, fallback) => fallback },
      uuid: { generateUUID: () => ({ toString: () => "{safe-uuid}" }) },
    },
    console: { error: () => {}, warn: warning => calls.warnings.push(warning) },
    crypto: {},
    document: { getElementById: id => byId.get(id) ?? null },
    gBrowser: {
      isTab: item => item?.localName === "tab",
      isSplitViewWrapper: () => false,
      setIcon: (tab, iconUrl) => { calls.tabIcons.push([tab.id, iconUrl]); tab.image = iconUrl; },
      tabContainer: { _invalidateCachedTabs: () => {} },
    },
    gZenFolders: {
      createFolder(tabs, options) {
        calls.create.push({ tabs, options });
        const folder = {
          id: options.id,
          label: options.label,
          isZenFolder: true,
          isLiveFolder: options.isLiveFolder,
          parentElement: container,
          allItems: [{ id: `${options.id}-empty`, zenEmptyTab: true }],
          async delete() {
            byId.delete(this.id);
            const index = children.indexOf(this);
            if (index >= 0) children.splice(index, 1);
          },
        };
        children.push(folder);
        byId.set(folder.id, folder);
        return folder;
      },
      setFolderUserIcon: (folder, iconUrl) => {
        calls.icon.push([folder.id, iconUrl]);
        folder.iconURL = iconUrl;
      },
    },
    gZenWorkspaces: {
      activeWorkspace: "workspace-active",
      getWorkspaceFromId: id => id === "workspace-active" ? { uuid: id } : null,
    },
  };
  const iconIntegrityManager = {
    reconcileFolder(folder) {
      calls.iconRepair.push(folder.id);
      return true;
    },
  };
  const adapters = createBrowserRestoreAdapters(
    host,
    null,
    null,
    colorManager,
    iconIntegrityManager,
  );
  liveManager.registry.set(GithubProvider.type, GithubProvider);
  const validRssState = JSON.stringify({
    state: {
      interval: 1800000,
      lastFetched: 0,
      options: {},
      url: "https://example.test/feed.xml",
      maxItems: 10,
      timeRange: 0,
    },
  });
  const validGithubState = JSON.stringify({
    state: {
      interval: 1800000,
      lastFetched: 0,
      options: { assignedMe: true, repoExcludes: ["openai/codex"] },
      type: "issues",
      url: "https://github.com/issues/assigned",
      repos: ["openai/codex"],
    },
  });

  assert.equal(adapters.findZenFolder("occupied"), null);
  assert.equal(adapters.isIdFree("occupied"), false);
  assert.equal(adapters.newFolderId(), "safe-uuid");
  assert.equal(adapters.resolveWorkspace("workspace-deleted"), "workspace-active");
  assert.equal(adapters.providerValidators.has("github"), true);
  assert.equal(adapters.providerValidators.has("unsupported-test-provider"), false);
  assert.equal(adapters.providerValidators.get("rss")(validRssState), true);
  assert.equal(adapters.providerValidators.get("rss")(JSON.stringify({
    state: {
      interval: 1800000, lastFetched: 0, options: {},
      url: "file:///tmp/feed.xml", maxItems: 10, timeRange: 0,
    },
  })), false);
  assert.equal(adapters.providerValidators.get("rss")(JSON.stringify({
    state: {
      interval: 1800000, lastFetched: 0, options: {}, maxItems: 10, timeRange: 0,
    },
  })), false);
  assert.equal(adapters.providerValidators.get("rss")('{"state":{}}'), false);
  assert.equal(adapters.providerValidators.get("github")(validGithubState), true);
  assert.equal(adapters.providerValidators.get("github")(JSON.stringify({
    state: {
      interval: 1800000, lastFetched: 0,
      options: { assignedMe: true, repoExcludes: {} },
      type: "notifications", url: "https://github.com/notifications", repos: [],
    },
  })), false);
  assert.equal(adapters.providerValidators.get("github")(JSON.stringify({
    state: {
      interval: 1800000, lastFetched: 0,
      options: { assignedMe: true, repoExcludes: ["openai/codex"] },
      type: "issues", url: "https://github.com/issues/assigned", repos: {},
    },
  })), false);
  assert.equal(adapters.providerValidators.get("github")(JSON.stringify({
    state: {
      interval: 1800000, lastFetched: 0,
      options: { assignedMe: true, repoExcludes: {} },
      type: "issues", url: "https://github.com/issues/assigned", repos: [],
    },
  })), false);
  assert.equal(adapters.validateMissingLiveFolder({
    live: { providerType: "rss", serializedState: validRssState },
  }), true);
  assert.throws(() => adapters.validateMissingLiveFolder({
    live: { providerType: "unsupported-test-provider", serializedState: validRssState },
  }), /trusted schema/i);
  const unsupportedRecord = makeRecordWithDepth(1);
  unsupportedRecord.folders[0] = {
    ...unsupportedRecord.folders[0],
    id: "folder-unsupported",
    type: "live",
    live: {
      providerType: "unsupported-test-provider",
      serializedState: validRssState,
    },
  };
  unsupportedRecord.placement.folderId = "folder-unsupported";
  await assert.rejects(
    ensureFolderPath(unsupportedRecord, adapters),
    /trusted schema/i,
  );
  assert.deepEqual(calls.create, []);

  const folder = adapters.createFolder([], {
    id: "folder-live-new", label: "Live", collapsed: true,
    saveOnWindowClose: true, workspaceId: "workspace-active", isLiveFolder: true,
  });
  adapters.setFolderIcon(folder, "chrome://icons/live.svg");
  adapters.setFolderColor(folder, "#abcdef");
  adapters.placeFolder(folder, null, { slot: 1 });
  const provider = adapters.restoreLiveProvider(folder, {
    id: "folder-live-old",
    dismissed: ["folder-live-old:dismissed-1"],
    live: {
      providerType: "rss",
      serializedState: validRssState,
    },
  });
  assert.equal(provider.started, false);
  adapters.startRestoredLiveProvider(folder, provider, [{
    itemId: "folder-live-new:item-1",
    label: "Native sublabel",
  }]);

  assert.deepEqual(calls.create, [{
    tabs: [],
    options: {
      id: "folder-live-new", label: "Live", collapsed: true,
      saveOnWindowClose: true, workspaceId: "workspace-active", isLiveFolder: true,
    },
  }]);
  assert.deepEqual(calls.icon, [["folder-live-new", "chrome://icons/live.svg"]]);
  assert.deepEqual(calls.iconRepair, ["folder-live-new", "folder-live-new"]);
  assert.deepEqual(calls.color, [["folder-live-new", "#abcdef"]]);
  assert.equal(adapters.getFolderColor(folder), "#abcdef");
  assert.deepEqual(children.map(item => item.id), ["before", "folder-live-new", "after"]);
  assert.equal(folder.allItems[0].zenEmptyTab, true);
  assert.equal(liveManager.liveFolders.get(folder.id), provider);
  assert.deepEqual([...liveManager.dismissedItems], ["folder-live-new:dismissed-1"]);
  assert.equal(provider.started, true);
  assert.deepEqual(provider.tabsState, [{
    itemId: "folder-live-new:item-1",
    label: "Native sublabel",
  }]);
  assert.equal(calls.save, 1);

  const restored = {
    id: "restored", label: "Old", muted: false,
    toggleMuteAudio() { this.muted = !this.muted; },
  };
  adapters.restoreTabPresentation(restored, {
    label: "Recorded", iconUrl: "https://example.test/recorded.svg", muted: true,
  });
  assert.deepEqual({
    label: restored.label,
    zenStaticLabel: restored.zenStaticLabel,
    image: restored.image,
    muted: restored.muted,
  }, {
    label: "Recorded",
    zenStaticLabel: "Recorded",
    image: "https://example.test/recorded.svg",
    muted: true,
  });
  assert.deepEqual(calls.tabIcons, [["restored", "https://example.test/recorded.svg"]]);

  await adapters.rollbackCreatedFolder(folder);
  assert.equal(liveManager.liveFolders.size, 0);
  assert.equal(liveManager.dismissedItems.size, 0);
  assert.equal(colors.get("folder-live-new"), "#010203");
  assert.deepEqual(calls.colorRollback, [[
    "folder-live-new",
    { exists: true, color: "#010203", updatedAt: 1 },
  ]]);
  assert.deepEqual(children.map(item => item.id), ["before", "after"]);

  const raceFolder = adapters.createFolder([], {
    id: "folder-race", label: "Race", collapsed: false,
    saveOnWindowClose: true, workspaceId: "workspace-active", isLiveFolder: true,
  });
  const foreignProvider = {
    stopCalls: 0,
    stop() { this.stopCalls++; },
  };
  liveManager.liveFolders.set(raceFolder.id, foreignProvider);
  liveManager.dismissedItems.add(`${raceFolder.id}:pre-existing`);
  assert.throws(() => adapters.restoreLiveProvider(raceFolder, {
    id: "folder-race-old",
    dismissed: ["folder-race-old:owned"],
    live: { providerType: "rss", serializedState: validRssState },
  }), /already manager-owned/i);
  await adapters.rollbackCreatedFolder(raceFolder);
  assert.equal(liveManager.liveFolders.get(raceFolder.id), foreignProvider);
  assert.deepEqual([...liveManager.dismissedItems], [`${raceFolder.id}:pre-existing`]);
  assert.equal(foreignProvider.stopCalls, 0);
  assert.deepEqual(children.map(item => item.id), ["before", "after"]);

  const replacedFolder = adapters.createFolder([], {
    id: "folder-replaced", label: "Replaced", collapsed: false,
    saveOnWindowClose: true, workspaceId: "workspace-active", isLiveFolder: true,
  });
  liveManager.dismissedItems.add(`${replacedFolder.id}:pre-existing`);
  const ownedProvider = adapters.restoreLiveProvider(replacedFolder, {
    id: "folder-replaced-old",
    dismissed: [
      "folder-replaced-old:pre-existing",
      "folder-replaced-old:transaction-owned",
    ],
    live: { providerType: "rss", serializedState: validRssState },
  });
  const replacementProvider = { stopCalls: 0, stop() { this.stopCalls++; } };
  liveManager.liveFolders.set(replacedFolder.id, replacementProvider);

  await adapters.rollbackCreatedFolder(replacedFolder);

  assert.equal(ownedProvider.started, false);
  assert.equal(liveManager.liveFolders.get(replacedFolder.id), replacementProvider);
  assert.equal(replacementProvider.stopCalls, 0);
  assert.deepEqual(
    [...liveManager.dismissedItems].filter(itemId => itemId.startsWith(`${replacedFolder.id}:`)),
    [`${replacedFolder.id}:pre-existing`],
  );
  assert.deepEqual(children.map(item => item.id), ["before", "after"]);
});

test("browser clear adapter prefers SessionStore delete and falls back to invalid empty data", () => {
  const tab = { id: "restored" };
  const deleted = [];
  const set = [];
  const baseHost = {
    document: { getElementById: () => null },
    gBrowser: {
      isTab: () => true,
      isSplitViewWrapper: () => false,
      tabContainer: { _invalidateCachedTabs: () => {} },
    },
  };
  const native = createBrowserRestoreAdapters({
    ...baseHost,
    SessionStore: {
      deleteCustomTabValue: (...args) => deleted.push(args),
      setCustomTabValue: (...args) => set.push(args),
    },
  });

  assert.equal(typeof native.clearRestoreValue, "function");
  native.clearRestoreValue(tab);
  assert.deepEqual(deleted, [[tab, RESTORE_KEY]]);
  assert.deepEqual(set, []);

  const fallback = createBrowserRestoreAdapters({
    ...baseHost,
    SessionStore: { setCustomTabValue: (...args) => set.push(args) },
  });
  fallback.clearRestoreValue(tab);
  assert.deepEqual(set, [[tab, RESTORE_KEY, ""]]);
});

test("browser native-group restore adapters defer, identify, release, and finish through native removal", async () => {
  const timers = [];
  const cleared = [];
  const storedFolders = [{ id: "folder-project", parentId: null }];
  const host = {
    SessionStore: { isTabRestoring: tab => tab.restoring === true },
    Services: {
      prefs: { getIntPref: (_name, fallback) => fallback },
      uuid: { generateUUID: () => ({ toString: () => "{native-safe}" }) },
    },
    clearTimeout: timer => cleared.push(timer),
    crypto: {},
    document: { getElementById: () => null },
    gBrowser: {
      isTab: () => true,
      isTabGroup: group => group.native === true,
      isSplitViewWrapper: () => false,
      tabContainer: { _invalidateCachedTabs: () => {} },
    },
    gZenFolders: { storeDataForSessionStore: () => storedFolders },
    setTimeout: (callback, delay) => {
      const timer = { callback, delay };
      timers.push(timer);
      return timer;
    },
  };
  const adapters = createBrowserRestoreAdapters(host);
  const nativeEvents = new FakeEventTarget();
  const tab = { restoring: true, hasAttribute: name => name === "pending" };
  const group = {
    id: "folder-project",
    isConnected: true,
    isZenFolder: false,
    native: true,
    tabs: [tab],
    addEventListener: (...args) => nativeEvents.addEventListener(...args),
    removeEventListener: (...args) => nativeEvents.removeEventListener(...args),
  };

  const cancel = adapters.deferNativeGroupRestore(() => {});
  assert.equal(timers.length, 1);
  assert.equal(timers[0].delay, 0);
  cancel();
  assert.deepEqual(cleared, [timers[0]]);
  assert.equal(adapters.isNativeRestoredGroup(group), true);
  assert.equal(adapters.isSessionRestoreCandidate(tab), true);
  assert.equal(adapters.isSessionRestoreCandidate({ hasAttribute: () => false }), false);
  assert.deepEqual(adapters.getNativeGroupTabs(group), [tab]);
  assert.equal(adapters.collectPersistedZenFolders(), storedFolders);

  const rolledBack = adapters.releaseNativeGroupId(group);
  assert.equal(group.id, "better-zen-folders-native-native-safe");
  rolledBack.rollback();
  rolledBack.rollback();
  assert.equal(group.id, "folder-project");

  const committed = adapters.releaseNativeGroupId(group);
  committed.commit();
  committed.rollback();
  assert.equal(group.id, "better-zen-folders-native-native-safe");

  const removal = adapters.armNativeGroupRemoval(group);
  nativeEvents.emit("TabGroupRemoved", { target: group });
  await removal.promise;
});

test("browser bootstrap installs restoration listeners above SessionStore's tab-container listener", () => {
  const calls = [];
  const fixture = makeBrowserHost("chrome://browser/content/browser.xhtml", calls);
  fixture.host.SessionStore = {
    getCustomTabValue: () => "",
    setCustomTabValue: () => {},
  };
  fixture.host.Services = { prefs: { getIntPref: (_name, fallback) => fallback } };

  bootstrapBrowserWindow(fixture.host);

  const restorationListeners = fixture.windowListeners.slice(0, 6);
  assert.deepEqual(restorationListeners.map(listener => listener.type), [
    "TabClose",
    "TabGroupRemoveRequested",
    "TabGroupCreate",
    "click",
    "command",
    "SSTabRestoring",
  ]);
  assert.equal(restorationListeners.every(listener => listener.options.capture === true), true);
});

test("record captures the exact direct slot and root-to-leaf folders", () => {
  const { tab, adapters } = makeNestedTabFixture({ visibleSlot: 2 });
  const record = buildRestoreRecord(tab, adapters);

  assert.equal(RESTORE_KEY, "betterZenFolders.restore.v1");
  assert.equal(record.version, 1);
  assert.deepEqual(record.placement, {
    folderId: "folder-project",
    slot: 2,
    previousId: "tab-beta",
    nextId: "tab-gamma",
  });
  assert.deepEqual(record.folders.map(folder => ({
    id: folder.id,
    parentId: folder.parentId,
    slot: folder.slot,
    previousId: folder.previousId,
    nextId: folder.nextId,
    workspaceId: folder.workspaceId,
    name: folder.name,
    iconUrl: folder.iconUrl,
    collapsed: folder.collapsed,
    saved: folder.saved,
    type: folder.type,
  })), [
    {
      id: "folder-work", parentId: null, slot: 1, previousId: "root-before",
      nextId: "root-after", workspaceId: "workspace-main", name: "Work",
      iconUrl: "chrome://work.svg", collapsed: false, saved: true, type: "regular",
    },
    {
      id: "folder-project", parentId: "folder-work", slot: 1, previousId: "tab-alpha",
      nextId: "tab-omega", workspaceId: "workspace-main", name: "Project",
      iconUrl: "chrome://project.svg", collapsed: true, saved: false, type: "regular",
    },
  ]);
});

test("record captures optional normalized folder colours and validation rejects unsafe values", () => {
  const { tab, root, leaf, adapters } = makeNestedTabFixture({ visibleSlot: 2 });
  adapters.getFolderColor = folder => folder === root ? "#123456" : "#abcdef";

  const record = buildRestoreRecord(tab, adapters);

  assert.deepEqual(record.folders.map(folder => folder.color), ["#123456", "#abcdef"]);
  assert.equal(validateRestoreRecord(record)?.folders[1].color, "#abcdef");

  const legacy = makeRecordWithDepth(1);
  assert.notEqual(validateRestoreRecord(legacy), null);
  for (const color of ["red", "#fff", "#ABCDEF", "#12345g", "#000000; color:red"]) {
    const invalid = makeRecordWithDepth(1);
    invalid.folders[0].color = color;
    assert.equal(validateRestoreRecord(invalid), null);
  }

  adapters.getFolderColor = folder => folder === leaf ? "red" : null;
  assert.throws(() => buildRestoreRecord(tab, adapters), /invalid restore record/i);
});

test("ordinal is authoritative when neighbors changed", () => {
  const items = [{ id: "a" }, { id: "new" }, { id: "b" }, { id: "c" }];

  assert.equal(
    resolveDirectInsertion(items, { slot: 2, previousId: "b", nextId: "c" }),
    items[2],
  );
});

test("resolver excludes Zen's placeholder and returns null for append", () => {
  const placeholder = { id: "empty", zenEmptyTab: true };
  const items = [{ id: "a" }, placeholder, { id: "b" }];

  assert.equal(resolveDirectInsertion(items, { slot: 1 }), items[2]);
  assert.equal(resolveDirectInsertion(items, { slot: 2 }), null);
});

test("record omits absent optional state and preserves validated live state", () => {
  const regular = makeNestedTabFixture();
  const regularRecord = buildRestoreRecord(regular.tab, regular.adapters);
  assert.equal(Object.hasOwn(regularRecord, "presentation"), false);
  assert.equal(Object.hasOwn(regularRecord, "split"), false);
  assert.equal(Object.hasOwn(regularRecord.folders[1], "dismissed"), false);

  const { tab, adapters } = makeNestedTabFixture({
    liveLeaf: true,
    dismissed: true,
    presentation: { label: "Project tab", iconUrl: "https://example.test/tab.svg", muted: true },
    liveTab: { itemId: "folder-project:item-1", label: "Native sublabel" },
    split: { id: "split-1", itemSlot: 3 },
  });
  const record = buildRestoreRecord(tab, adapters);

  assert.deepEqual(record.folders[1].live, {
    providerType: "pinned-tabs",
    serializedState: '{"view":"pinned"}',
  });
  assert.equal(record.folders[1].dismissed, true);
  assert.deepEqual(record.presentation, {
    label: "Project tab", iconUrl: "https://example.test/tab.svg", muted: true,
  });
  assert.deepEqual(record.liveTab, {
    itemId: "folder-project:item-1", label: "Native sublabel",
  });
  assert.deepEqual(record.split, { id: "split-1", itemSlot: 3 });
});

test("validation rejects unknown versions, malformed fields, and unregistered providers", () => {
  assert.equal(validateRestoreRecord(JSON.stringify({ version: 2, folders: [] })), null);
  assert.equal(validateRestoreRecord(JSON.stringify(makeRecordWithDepth(6))), null);
  assert.equal(validateRestoreRecord(JSON.stringify({
    ...makeRecordWithDepth(1),
    unexpected: true,
  })), null);
  assert.equal(validateRestoreRecord({
    ...makeRecordWithDepth(1),
    placement: { ...makeRecordWithDepth(1).placement, slot: -1 },
  }), null);
  assert.equal(validateRestoreRecord({
    ...makeRecordWithDepth(1),
    folders: [{
      ...makeRecordWithDepth(1).folders[0],
      type: "live",
      live: { providerType: "unregistered", serializedState: "{}" },
    }],
  }), null);
  assert.equal(validateRestoreRecord({
    ...makeRecordWithDepth(1),
    folders: [{ ...makeRecordWithDepth(1).folders[0], name: () => "executable" }],
  }), null);
});

test("validation remains strict by default and defers provider payload only when explicitly requested", () => {
  const record = makeLiveRecord();

  assert.equal(validateRestoreRecord(record), null);
  const deferred = validateRestoreRecord(record, { deferProviderValidation: true });

  assert.equal(deferred.folders[0].live.providerType, "pinned-tabs");
  assert.equal(Object.isFrozen(deferred.folders[0].live), true);
});

test("validation returns a frozen defensive clone and honors provider registration", () => {
  const raw = makeRecordWithDepth(DEFAULT_MAX_FOLDER_DEPTH);
  raw.folders[0] = {
    ...raw.folders[0],
    type: "live",
    live: { providerType: "pinned-tabs", serializedState: '{"view":"pinned"}' },
  };
  const record = validateRestoreRecord(raw, {
    providerValidators: {
      "pinned-tabs": value => value === '{"view":"pinned"}',
    },
  });

  assert.notEqual(record, raw);
  assert.notEqual(record.folders, raw.folders);
  assert.equal(Object.isFrozen(record), true);
  assert.equal(Object.isFrozen(record.folders[0]), true);
  assert.throws(() => { record.placement.slot = 9; }, TypeError);
  raw.placement.slot = 4;
  assert.equal(record.placement.slot, 0);
});

test("validation rejects accessor, hidden, symbol, and non-enumerable record fields without execution", () => {
  const arrayGetter = makeRecordWithDepth(1);
  let arrayGetterCalls = 0;
  delete arrayGetter.folders[0];
  Object.defineProperty(arrayGetter.folders, 0, {
    enumerable: true,
    get() { arrayGetterCalls++; throw new Error("array getter ran"); },
  });
  assert.doesNotThrow(() => assert.equal(validateRestoreRecord(arrayGetter), null));
  assert.equal(arrayGetterCalls, 0);

  const objectGetter = makeRecordWithDepth(1);
  let objectGetterCalls = 0;
  delete objectGetter.folders[0].name;
  Object.defineProperty(objectGetter.folders[0], "name", {
    enumerable: true,
    get() { objectGetterCalls++; throw new Error("object getter ran"); },
  });
  assert.doesNotThrow(() => assert.equal(validateRestoreRecord(objectGetter), null));
  assert.equal(objectGetterCalls, 0);

  const hidden = makeRecordWithDepth(1);
  Object.defineProperty(hidden, "hidden", { value: true, enumerable: false });
  assert.equal(validateRestoreRecord(hidden), null);

  const symbol = makeRecordWithDepth(1);
  symbol[Symbol("hidden")] = true;
  assert.equal(validateRestoreRecord(symbol), null);

  const hiddenArrayKey = makeRecordWithDepth(1);
  Object.defineProperty(hiddenArrayKey.folders, "hidden", { value: true, enumerable: false });
  assert.equal(validateRestoreRecord(hiddenArrayKey), null);

  const sparseArray = makeRecordWithDepth(1);
  sparseArray.folders.length = 2;
  assert.equal(validateRestoreRecord(sparseArray), null);

  const nonEnumerableRequired = makeRecordWithDepth(1);
  Object.defineProperty(nonEnumerableRequired, "version", { value: 1, enumerable: false });
  assert.equal(validateRestoreRecord(nonEnumerableRequired), null);
});

test("validation completes structural checks before calling live provider validators", () => {
  let providerCalls = 0;
  const providerValidators = { "pinned-tabs": () => (++providerCalls, true) };

  const malformedLaterFolder = makeLiveRecord(2);
  malformedLaterFolder.folders[1].name = 42;
  assert.equal(validateRestoreRecord(malformedLaterFolder, { providerValidators }), null);
  assert.equal(providerCalls, 0);

  const disconnectedAncestry = makeLiveRecord(2);
  disconnectedAncestry.folders[1].parentId = "missing-folder";
  assert.equal(validateRestoreRecord(disconnectedAncestry, { providerValidators }), null);
  assert.equal(providerCalls, 0);
});

test("validation accepts only own or Map provider validators", () => {
  let inheritedCalls = 0;
  const inherited = Object.create({ "pinned-tabs": () => (++inheritedCalls, true) });
  assert.equal(validateRestoreRecord(makeLiveRecord(), { providerValidators: inherited }), null);
  assert.equal(inheritedCalls, 0);

  const inheritedEntry = Object.create({ validateSerializedState: () => (++inheritedCalls, true) });
  assert.equal(validateRestoreRecord(makeLiveRecord(), {
    providerValidators: { "pinned-tabs": inheritedEntry },
  }), null);
  assert.equal(inheritedCalls, 0);

  const map = new Map([["pinned-tabs", pinnedTabsValidator]]);
  assert.equal(validateRestoreRecord(makeLiveRecord(), { providerValidators: map })?.folders[0].id, "folder-0");
});

test("validation rejects duplicate folder IDs and ambiguous ancestry", () => {
  const record = makeRecordWithDepth(2);
  record.folders[1].id = "folder-0";
  record.folders[1].parentId = "folder-0";
  record.placement.folderId = "folder-0";

  assert.equal(validateRestoreRecord(record), null);
});

test("regular folders never carry or query live-only state", () => {
  const dismissed = makeRecordWithDepth(1);
  dismissed.folders[0].dismissed = true;
  assert.equal(validateRestoreRecord(dismissed), null);

  const presentation = makeRecordWithDepth(1);
  presentation.presentation = { label: "Regular tab", iconUrl: null, muted: false };
  assert.equal(validateRestoreRecord(presentation), null);

  const { tab, adapters } = makeNestedTabFixture();
  const calls = { dismissed: 0, live: 0, presentation: 0 };
  adapters.getDismissed = () => { calls.dismissed++; return false; };
  adapters.getLiveFolderState = () => { calls.live++; return null; };
  adapters.getTabPresentation = () => { calls.presentation++; return null; };
  buildRestoreRecord(tab, adapters);
  assert.deepEqual(calls, { dismissed: 0, live: 0, presentation: 0 });
});
