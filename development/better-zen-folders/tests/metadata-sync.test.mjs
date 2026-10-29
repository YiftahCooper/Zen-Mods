import test from "node:test";
import assert from "node:assert/strict";

import { RESTORE_KEY } from "../scripts/better-zen-folders.uc.mjs";
import {
  makeMetadataSyncFixture,
  makeRestoreManagerFixture,
} from "./fakes.mjs";

const SYNC_EVENTS = [
  "TabGrouped",
  "TabUngrouped",
  "TabMove",
  "FolderGrouped",
  "FolderUngrouped",
  "TabGroupUpdate",
  "TabGroupCollapse",
  "TabGroupExpand",
  "ZenFolderChangedWorkspace",
  "SSTabRestored",
  "command",
];

test("one metadata pass shares folder snapshots but the next pass sees edits", () => {
  const fixture = makeMetadataSyncFixture();
  const siblings = Array.from({ length: 40 }, (_, index) => ({ ...fixture.tab, id: `sibling-${index}` }));
  fixture.tabs.push(...siblings);
  fixture.leaf.allItems.push(...siblings);
  let folderReads = 0;
  const getData = fixture.adapters.getFolderData;
  fixture.adapters.getFolderData = folder => { folderReads++; return getData(folder); };
  fixture.manager.metadataSynchronizer.synchronize();
  assert.ok(folderReads < 10, `shared folder metadata read ${folderReads} times`);
  for (const tab of fixture.tabs) {
    const record = JSON.parse(fixture.values.get(tab));
    assert.equal(record.folders.at(-1).name, "Leaf");
    assert.equal(record.placement.slot, fixture.leaf.allItems.indexOf(tab));
  }
  fixture.leaf.name = "Renamed between passes";
  fixture.manager.metadataSynchronizer.synchronize();
  for (const tab of fixture.tabs) {
    assert.equal(JSON.parse(fixture.values.get(tab)).folders.at(-1).name, "Renamed between passes");
  }
});

test("metadata synchronizer starts eligible records and batches installed mutation classes", async t => {
  const initial = makeMetadataSyncFixture();
  initial.manager.start(new AbortController().signal);
  await initial.flush();
  assert.ok(initial.record());
  assert.deepEqual(initial.record().folders.map(folder => folder.id), ["root", "leaf"]);
  assert.equal(initial.record().placement.slot, 1);

  const cases = [
    ["grouping", makeMetadataSyncFixture({ initiallyEligible: false }), fixture => {
      fixture.groupTab(1);
    }, fixture => {
      assert.equal(fixture.record().placement.slot, 1);
    }],
    ["movement and reordering", makeMetadataSyncFixture(), fixture => {
      fixture.leaf.allItems = [fixture.tab, fixture.before, fixture.after];
      fixture.emit("TabMove");
    }, fixture => {
      assert.equal(fixture.record().placement.slot, 0);
    }],
    ["nesting", makeMetadataSyncFixture(), fixture => {
      fixture.addOuterAncestor();
    }, fixture => {
      assert.deepEqual(fixture.record().folders.map(folder => folder.id), ["outer", "root", "leaf"]);
    }],
    ["folder rename", makeMetadataSyncFixture(), fixture => {
      fixture.leaf.name = "Renamed";
      fixture.emit("TabGroupUpdate", fixture.leaf);
    }, fixture => {
      assert.equal(fixture.record().folders.at(-1).name, "Renamed");
    }],
    ["folder icon", makeMetadataSyncFixture(), fixture => {
      fixture.leaf.iconUrl = "chrome://renamed-icon.svg";
      fixture.emit("TabGroupUpdate", fixture.leaf);
    }, fixture => {
      assert.equal(fixture.record().folders.at(-1).iconUrl, "chrome://renamed-icon.svg");
    }],
    ["workspace", makeMetadataSyncFixture(), fixture => {
      fixture.leaf.workspaceId = "workspace-other";
      fixture.emit("ZenFolderChangedWorkspace", fixture.leaf);
    }, fixture => {
      assert.equal(fixture.record().folders.at(-1).workspaceId, "workspace-other");
    }],
    ["collapsed state", makeMetadataSyncFixture(), fixture => {
      fixture.leaf.collapsed = false;
      fixture.emit("TabGroupExpand", fixture.leaf);
    }, fixture => {
      assert.equal(fixture.record().folders.at(-1).collapsed, false);
    }],
    ["observable subtree state", makeMetadataSyncFixture(), fixture => {
      fixture.leaf.name = "Observed rename";
      fixture.notifyMutation();
    }, fixture => {
      assert.equal(fixture.record().folders.at(-1).name, "Observed rename");
    }],
    ["live-provider settings", makeMetadataSyncFixture({ liveLeaf: true }), fixture => {
      fixture.liveState.serializedState = JSON.stringify({
        state: { interval: 1800000, revision: 2 },
      });
      fixture.emit("command", {});
    }, fixture => {
      assert.equal(
        fixture.record().folders.at(-1).live.serializedState,
        fixture.liveState.serializedState,
      );
    }],
  ];

  for (const [name, fixture, mutate, verify] of cases) {
    await t.test(name, async () => {
      fixture.manager.start(new AbortController().signal);
      await fixture.flush();
      fixture.resetCalls();
      mutate(fixture);
      await fixture.flush();
      verify(fixture);
      assert.equal(fixture.writes.length, 1);
    });
  }
});

test("metadata synchronizer clears tabs that cease to qualify and suppresses unchanged writes", async () => {
  const fixture = makeMetadataSyncFixture();
  fixture.manager.start(new AbortController().signal);
  await fixture.flush();
  fixture.resetCalls();

  fixture.emit("TabMove");
  fixture.emit("TabGroupUpdate", fixture.leaf);
  await fixture.flush();
  assert.deepEqual(fixture.writes, []);
  assert.deepEqual(fixture.clears, []);

  fixture.ungroupTab();
  await fixture.flush();
  assert.deepEqual(fixture.clears, [fixture.tab]);
  assert.equal(fixture.values.has(fixture.tab), false);
});

test("RSS feed URL metadata waits for prompt close after cold localization", async () => {
  const fixture = makeMetadataSyncFixture({ liveLeaf: true });
  fixture.manager.start(new AbortController().signal);
  await fixture.flush();
  const before = fixture.liveState.serializedState;
  const after = JSON.stringify({
    state: { url: "https://example.test/updated.xml", revision: 2 },
  });
  fixture.resetCalls();

  fixture.emitLiveOption("feedURL");
  await fixture.flush();

  assert.equal(fixture.record().folders.at(-1).live.serializedState, before);
  assert.deepEqual(fixture.writes, []);
  assert.equal(fixture.scanCount(), 1);
  assert.equal(fixture.pendingMetadataTasks(), 1);

  assert.equal(fixture.runNextMetadataTask(), true);
  await fixture.flush();
  assert.equal(fixture.record().folders.at(-1).live.serializedState, before);
  assert.deepEqual(fixture.writes, []);
  assert.equal(fixture.scanCount(), 2);
  assert.equal(fixture.pendingMetadataTasks(), 0);

  fixture.emitDialogClosed();
  Promise.resolve().then(() => {
    fixture.liveState.serializedState = after;
  });
  assert.equal(fixture.pendingMetadataTasks(), 1);
  await fixture.flush();

  assert.equal(fixture.record().folders.at(-1).live.serializedState, before);
  assert.deepEqual(fixture.writes, []);
  assert.equal(fixture.pendingMetadataTasks(), 1);

  assert.equal(fixture.runNextMetadataTask(), true);
  await fixture.flush();
  assert.equal(fixture.record().folders.at(-1).live.serializedState, after);
  assert.equal(fixture.writes.length, 1);
  assert.equal(fixture.pendingMetadataTasks(), 0);
});

test("unarmed dialog close does not schedule metadata work", async () => {
  const fixture = makeMetadataSyncFixture({ liveLeaf: true });
  fixture.manager.start(new AbortController().signal);
  await fixture.flush();
  fixture.resetCalls();

  fixture.emitDialogClosed();
  await fixture.flush();

  assert.equal(fixture.pendingMetadataTasks(), 0);
  assert.equal(fixture.scanCount(), 0);
  assert.deepEqual(fixture.writes, []);
});

test("cancelled RSS prompt scans unchanged state without writing", async () => {
  const fixture = makeMetadataSyncFixture({ liveLeaf: true });
  fixture.manager.start(new AbortController().signal);
  await fixture.flush();
  fixture.resetCalls();

  fixture.emitLiveOption("feedURL");
  await fixture.flush();
  assert.equal(fixture.runNextMetadataTask(), true);
  await fixture.flush();
  assert.equal(fixture.pendingMetadataTasks(), 0);

  fixture.emitDialogClosed();
  assert.equal(fixture.pendingMetadataTasks(), 1);
  assert.equal(fixture.runNextMetadataTask(), true);
  await fixture.flush();

  assert.deepEqual(fixture.writes, []);
  assert.equal(fixture.pendingMetadataTasks(), 0);
});

test("synchronous live option retains the command-time metadata task", async () => {
  const fixture = makeMetadataSyncFixture({ liveLeaf: true });
  fixture.manager.start(new AbortController().signal);
  await fixture.flush();
  fixture.resetCalls();

  fixture.emitLiveOption("maxItems");
  fixture.liveState.serializedState = JSON.stringify({
    state: { maxItems: 50, revision: 2 },
  });

  assert.equal(fixture.pendingMetadataTasks(), 1);
  await fixture.flush();
  assert.equal(fixture.writes.length, 1);
  assert.equal(fixture.runNextMetadataTask(), true);
  await fixture.flush();
  assert.equal(fixture.writes.length, 1);
});

test("live option commands coalesce into one deferred metadata scan and write", async () => {
  const fixture = makeMetadataSyncFixture({ liveLeaf: true });
  fixture.manager.start(new AbortController().signal);
  await fixture.flush();
  fixture.resetCalls();

  fixture.emitLiveOption("feedURL");
  fixture.emitLiveOption("maxItems");
  fixture.emitLiveOption("timeRange");
  Promise.resolve().then(() => {
    fixture.liveState.serializedState = JSON.stringify({
      state: { url: "https://example.test/coalesced.xml", revision: 2 },
    });
  });
  await fixture.flush();

  assert.equal(fixture.pendingMetadataTasks(), 1);
  assert.equal(fixture.scanCount(), 1);
  assert.deepEqual(fixture.writes, []);
  fixture.emitDialogClosed();
  assert.equal(fixture.pendingMetadataTasks(), 1);
  fixture.resetCalls();

  assert.equal(fixture.runNextMetadataTask(), true);
  await fixture.flush();
  assert.equal(fixture.pendingMetadataTasks(), 0);
  assert.equal(fixture.scanCount(), 1);
  assert.equal(fixture.writes.length, 1);
});

test("metadata synchronizer teardown clears armed and scheduled prompt-close work", async t => {
  await t.test("after arming", async () => {
    const fixture = makeMetadataSyncFixture({ liveLeaf: true });
    const controller = new AbortController();
    fixture.manager.start(controller.signal);
    await fixture.flush();
    fixture.resetCalls();

    fixture.emitLiveOption("feedURL");
    assert.equal(fixture.pendingMetadataTasks(), 1);

    controller.abort();
    assert.equal(fixture.pendingMetadataTasks(), 0);
    fixture.emitDialogClosed();
    fixture.liveState.serializedState = JSON.stringify({
      state: { url: "https://example.test/armed-cancelled.xml", revision: 2 },
    });
    await fixture.flush();

    assert.equal(fixture.runNextMetadataTask(), false);
    assert.deepEqual(fixture.writes, []);
  });

  await t.test("after prompt close", async () => {
    const fixture = makeMetadataSyncFixture({ liveLeaf: true });
    const controller = new AbortController();
    fixture.manager.start(controller.signal);
    await fixture.flush();
    fixture.resetCalls();

    fixture.emitLiveOption("feedURL");
    await fixture.flush();
    assert.equal(fixture.runNextMetadataTask(), true);
    await fixture.flush();
    fixture.emitDialogClosed();
    assert.equal(fixture.pendingMetadataTasks(), 1);

    controller.abort();
    assert.equal(fixture.pendingMetadataTasks(), 0);
    fixture.liveState.serializedState = JSON.stringify({
      state: { url: "https://example.test/closed-cancelled.xml", revision: 2 },
    });
    assert.equal(fixture.runNextMetadataTask(), false);
    await fixture.flush();
    assert.deepEqual(fixture.writes, []);
  });
});

test("metadata synchronizer preserves metadata until an in-flight session restore consumes it", async () => {
  const fixture = makeMetadataSyncFixture({ initiallyEligible: false });
  const persisted = JSON.stringify({ version: 1, persisted: true });
  fixture.values.set(fixture.tab, persisted);
  fixture.tab.sessionRestoring = true;

  fixture.manager.start(new AbortController().signal);
  await fixture.flush();

  assert.equal(fixture.values.get(fixture.tab), persisted);
  assert.deepEqual(fixture.clears, []);

  fixture.tab.sessionRestoring = false;
  fixture.emit("SSTabRestored");
  await fixture.flush();
  assert.equal(fixture.values.has(fixture.tab), false);
  assert.deepEqual(fixture.clears, [fixture.tab]);
});

test("metadata synchronization waits for restore commit and cannot overwrite its rollback journal", async () => {
  const fixture = makeMetadataSyncFixture({ initiallyEligible: false });
  const controller = new AbortController();
  fixture.manager.start(controller.signal);
  await fixture.flush();
  fixture.resetCalls();
  assert.equal(fixture.eventTarget.listenerCount("TabGrouped"), 1);

  const record = {
    version: 1,
    placement: { folderId: "leaf", slot: 1, previousId: null, nextId: null },
    folders: [
      {
        id: "root", parentId: null, slot: 0, previousId: null, nextId: null,
        workspaceId: "workspace-main", name: "Root", iconUrl: "chrome://root.svg",
        collapsed: false, saved: true, type: "regular",
      },
      {
        id: "leaf", parentId: "root", slot: 0, previousId: null, nextId: null,
        workspaceId: "workspace-main", name: "Leaf", iconUrl: "chrome://leaf.svg",
        collapsed: true, saved: false, type: "regular",
      },
    ],
  };
  const raw = JSON.stringify(record);
  fixture.values.set(fixture.tab, raw);
  fixture.adapters.resolveFolderPath = () => [fixture.root, fixture.leaf];
  fixture.adapters.isPinned = () => true;
  fixture.adapters.getMaxFolderDepth = () => 5;
  fixture.adapters.isSelected = () => false;
  fixture.adapters.insertDirectItem = (folder, item, target) => {
    folder.allItems = folder.allItems.filter(current => current !== item);
    const index = target === null ? -1 : folder.allItems.indexOf(target);
    folder.allItems.splice(index < 0 ? folder.allItems.length : index, 0, item);
  };
  fixture.adapters.invalidateTabCaches = () => {};
  fixture.leaf.addTabs = tabs => {
    for (const tab of tabs) {
      tab.group = fixture.leaf;
      if (!fixture.leaf.allItems.includes(tab)) fixture.leaf.allItems.push(tab);
    }
    fixture.emit("TabGrouped");
  };

  assert.equal(await fixture.manager.restoreTab({ target: fixture.tab }), true);
  await fixture.flush();

  assert.equal(fixture.writes.length, 1);
  assert.notEqual(fixture.writes[0].value, raw);
});

test("metadata synchronizer teardown owns listeners observer and pending batches", async () => {
  const fixture = makeMetadataSyncFixture();
  const controller = new AbortController();
  fixture.manager.start(controller.signal);
  for (const type of SYNC_EVENTS) assert.equal(fixture.eventTarget.listenerCount(type), type === "command" ? 2 : 1);
  assert.ok(fixture.observer());
  assert.deepEqual(fixture.observer().observed, [{
    target: fixture.adapters.tabContainer(),
    options: {
      attributes: true,
      childList: true,
      subtree: true,
      attributeFilter: [
        "collapsed", "href", "id", "image", "label", "muted",
        "zen-live-folder-item-id", "zen-show-sublabel", "zen-workspace-id",
      ],
    },
  }]);

  fixture.emit("TabMove");
  controller.abort();
  await fixture.flush();

  for (const type of SYNC_EVENTS) assert.equal(fixture.eventTarget.listenerCount(type), 0);
  assert.equal(fixture.observer().disconnects, 1);
  assert.deepEqual(fixture.writes, []);
});

test("persisted synchronized value is consumed by a simulated later restart", async () => {
  const fixture = makeMetadataSyncFixture();
  fixture.manager.start(new AbortController().signal);
  await fixture.flush();
  fixture.leaf.allItems = [fixture.tab, fixture.before, fixture.after];
  fixture.emit("TabMove");
  await fixture.flush();
  const persisted = fixture.values.get(fixture.tab);
  assert.equal(typeof persisted, "string");

  const restored = { id: "later-restored", pinned: true, selected: false };
  const later = makeRestoreManagerFixture({
    records: [JSON.parse(persisted)],
    restoredTabs: [restored],
    initialItems: [{ id: "a" }, { id: "b" }],
  });
  assert.equal(await later.manager.restoreTab({ target: restored }), true);
  assert.deepEqual(later.leaf.visibleItems.map(item => item.id), ["later-restored", "a", "b"]);
  assert.equal(later.leaf.collapsed, true);
  assert.equal(later.values.has(restored), true);
  assert.equal(JSON.parse(later.values.get(restored)).placement.slot, 0);
  assert.equal(RESTORE_KEY, "betterZenFolders.restore.v1");
});
