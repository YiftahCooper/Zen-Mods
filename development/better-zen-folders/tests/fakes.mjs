import {
  EmptyRegularFolderManager,
  FolderPopulationRegistry,
  FolderRestoreManager,
  NewTabInFolderTransaction,
  FolderButtonManager,
  createBrowserNewTabTransactionAdapters,
  RESTORE_KEY,
} from "../scripts/better-zen-folders.uc.mjs";

export function makeRegularFolder(overrides = {}) {
  return {
    id: "folder-1", isZenFolder: true, isLiveFolder: false,
    isConnected: true, inCurrentWindow: true, inActiveWorkspace: true,
    collapsed: false, group: null, allItems: [],
    addTabs(tabs) { this.allItems.push(...tabs); for (const tab of tabs) tab.group = this; },
    ...overrides,
  };
}

function makeDirectItem(id, overrides = {}) {
  return { id, ...overrides };
}

export function makeNestedTabFixture({
  visibleSlot = 2,
  liveLeaf = false,
  dismissed,
  presentation,
  liveTab,
  split,
} = {}) {
  const root = makeRegularFolder({
    id: "folder-work",
    name: "Work",
    workspaceId: "workspace-main",
    iconUrl: "chrome://work.svg",
    collapsed: false,
    saved: true,
  });
  const leaf = makeRegularFolder({
    id: "folder-project",
    name: "Project",
    workspaceId: "workspace-main",
    iconUrl: "chrome://project.svg",
    collapsed: true,
    saved: false,
    parentFolder: root,
    isLiveFolder: liveLeaf,
  });
  if (dismissed !== undefined) leaf.dismissed = dismissed;
  if (liveLeaf) {
    leaf.liveProvider = {
      providerType: "pinned-tabs",
      serializedState: '{"view":"pinned"}',
    };
  }

  const tab = makeDirectItem("tab-project", {
    group: leaf,
    presentation,
    liveTabState: liveTab,
    split,
  });
  const visibleItems = [
    makeDirectItem("tab-alpha"),
    makeDirectItem("tab-beta"),
    makeDirectItem("tab-gamma"),
    makeDirectItem("tab-delta"),
  ];
  visibleItems.splice(visibleSlot, 0, tab);
  leaf.allItems = [visibleItems[0], makeDirectItem("leaf-empty", { zenEmptyTab: true }), ...visibleItems.slice(1)];
  root.allItems = [
    makeDirectItem("tab-alpha"),
    leaf,
    makeDirectItem("root-empty", { zenEmptyTab: true }),
    makeDirectItem("tab-omega"),
  ];
  const topLevelItems = [
    makeDirectItem("root-before"),
    root,
    makeDirectItem("top-empty", { zenEmptyTab: true }),
    makeDirectItem("root-after"),
  ];

  return {
    tab,
    root,
    leaf,
    adapters: {
      getTabFolder: current => current.group,
      getFolderAncestors: folder => {
        const ancestors = [];
        for (let current = folder.parentFolder; current; current = current.parentFolder) {
          ancestors.push(current);
        }
        return ancestors;
      },
      getDirectItems: folder => folder ? folder.allItems : topLevelItems,
      getStableId: item => item.id,
      isEmptyTab: item => item.zenEmptyTab === true,
      getFolderData: folder => ({
        id: folder.id,
        workspaceId: folder.workspaceId,
        name: folder.name,
        iconUrl: folder.iconUrl,
        collapsed: folder.collapsed,
        saved: folder.saved,
        type: folder.isLiveFolder ? "live" : "regular",
      }),
      getLiveFolderState: folder => folder.liveProvider ?? null,
      getDismissed: folder => folder.dismissed,
      getTabPresentation: current => current.presentation,
      getLiveTabState: current => current.liveTabState,
      getSplit: current => current.split,
      providerValidators: {
        "pinned-tabs": value => value === '{"view":"pinned"}',
      },
    },
  };
}

export function makeRecordWithDepth(depth) {
  const folders = Array.from({ length: depth }, (_, index) => ({
    id: `folder-${index}`,
    parentId: index === 0 ? null : `folder-${index - 1}`,
    slot: 0,
    previousId: null,
    nextId: null,
    workspaceId: "workspace-main",
    name: `Folder ${index}`,
    iconUrl: null,
    collapsed: false,
    saved: true,
    type: "regular",
  }));
  return {
    version: 1,
    placement: {
      folderId: folders.at(-1)?.id ?? "folder-0",
      slot: 0,
      previousId: null,
      nextId: null,
    },
    folders,
  };
}

function makeRestoreRecord(folderIds, slot) {
  const folders = folderIds.map((id, index) => ({
    id,
    parentId: index === 0 ? null : folderIds[index - 1],
    slot: 0,
    previousId: null,
    nextId: null,
    workspaceId: "workspace-main",
    name: `Folder ${index}`,
    iconUrl: null,
    collapsed: false,
    saved: true,
    type: "regular",
  }));
  return {
    version: 1,
    placement: {
      folderId: folderIds.at(-1),
      slot,
      previousId: null,
      nextId: null,
    },
    folders,
  };
}

export function makeRestoreManagerFixture({
  records,
  restoredTabs,
  initialItems,
  missingFolderIds = [],
  nativeCollapseWriter = false,
  adapterOverrides = {},
} = {}) {
  const state = {
    addTabsCalls: [],
    cacheInvalidations: 0,
    errors: [],
    pinCalls: [],
    selectedTabs: [],
    setCalls: [],
  };
  const root = makeRegularFolder({ id: "root", parentFolder: null, saved: true });
  const leaf = makeRegularFolder({
    id: "leaf",
    parentFolder: root,
    name: "Current leaf name",
    collapsed: true,
    saved: false,
  });
  root.visibleItems = [leaf];
  leaf.visibleItems = [...initialItems];
  leaf.groupContainer = {
    insertBefore(item, target) {
      const currentIndex = leaf.visibleItems.indexOf(item);
      if (currentIndex >= 0) leaf.visibleItems.splice(currentIndex, 1);
      const targetIndex = target === null ? -1 : leaf.visibleItems.indexOf(target);
      leaf.visibleItems.splice(targetIndex < 0 ? leaf.visibleItems.length : targetIndex, 0, item);
    },
  };
  leaf.addTabs = tabs => {
    state.addTabsCalls.push(tabs);
    for (const tab of tabs) {
      if (!leaf.visibleItems.includes(tab)) leaf.visibleItems.push(tab);
      tab.group = leaf;
    }
    if (nativeCollapseWriter) {
      leaf.collapsed = tabs.some(tab => tab.selected === true);
    }
  };

  const values = new Map(restoredTabs.map((tab, index) => [
    tab,
    JSON.stringify(records[index]),
  ]));
  const foldersById = new Map([[root.id, root], [leaf.id, leaf]]);
  const adapters = {
    sessionStore: {
      getCustomTabValue: (tab, key) => key === RESTORE_KEY ? values.get(tab) ?? "" : "",
      setCustomTabValue: (tab, key, value) => {
        state.setCalls.push({ tab, key, value });
        if (key === RESTORE_KEY) values.set(tab, value);
      },
    },
    getMaxFolderDepth: () => 5,
    providerValidators: {},
    resolveFolderPath: snapshots => {
      const folders = snapshots.map(snapshot =>
        missingFolderIds.includes(snapshot.id) ? undefined : foldersById.get(snapshot.id)
      );
      return folders.every(Boolean) ? folders : null;
    },
    isPinned: tab => tab.pinned === true,
    pinTab: tab => { state.pinCalls.push(tab); tab.pinned = true; },
    getDirectItem: tab => tab,
    getDirectItems: folder => folder?.visibleItems ?? [root],
    insertDirectItem: (folder, item, target) => folder.groupContainer.insertBefore(item, target),
    invalidateTabCaches: () => { state.cacheInvalidations++; },
    isSelected: tab => tab.selected === true,
    selectTab: tab => { state.selectedTabs.push(tab); tab.selected = true; },
    getTabFolder: tab => tab.group,
    getFolderAncestors: folder => {
      const ancestors = [];
      for (let current = folder.parentFolder; current; current = current.parentFolder) ancestors.push(current);
      return ancestors;
    },
    getStableId: item => item.id,
    isEmptyTab: item => item.zenEmptyTab === true,
    getFolderData: folder => ({
      id: folder.id,
      workspaceId: "workspace-main",
      name: folder.name ?? folder.id,
      iconUrl: null,
      collapsed: folder.collapsed,
      saved: folder.saved,
      type: "regular",
    }),
    getSplit: () => null,
    reportError: error => state.errors.push(error),
    ...adapterOverrides,
  };
  return { manager: new FolderRestoreManager(adapters), root, leaf, values, adapters, state };
}

export function makeCloseCaptureFixture({
  tabOverrides = {},
  adapterOverrides = {},
  initialValue = "",
} = {}) {
  const nested = makeNestedTabFixture({ visibleSlot: 2 });
  Object.assign(nested.tab, tabOverrides);
  const calls = [];
  const errors = [];
  const values = new Map([[nested.tab, initialValue]]);
  const {
    sessionStore: sessionStoreOverrides = {},
    ...remainingOverrides
  } = adapterOverrides;
  const sessionStore = {
    getCustomTabValue(tab, key) {
      return key === RESTORE_KEY ? values.get(tab) ?? "" : "";
    },
    setCustomTabValue(tab, key, value) {
      calls.push({ name: "setCustomTabValue", tab, key, value });
      if (key === RESTORE_KEY) values.set(tab, value);
    },
    deleteCustomTabValue(tab, key) {
      calls.push({ name: "deleteCustomTabValue", tab, key });
      if (key === RESTORE_KEY) values.delete(tab);
    },
    ...sessionStoreOverrides,
  };
  const manager = new FolderRestoreManager({
    ...nested.adapters,
    isSupportedTab: tab => tab.unsupported !== true,
    isEssential: tab => tab.essential === true,
    isEmptyTab: tab => tab.empty === true,
    isSupportedFolder: folder => folder?.isZenFolder === true && folder.unsupported !== true,
    getDirectItem: tab => tab.directItem ?? tab,
    sessionStore,
    clearRestoreValue(tab) {
      if (typeof sessionStore.deleteCustomTabValue === "function") {
        sessionStore.deleteCustomTabValue(tab, RESTORE_KEY);
      } else {
        sessionStore.setCustomTabValue(tab, RESTORE_KEY, "");
      }
    },
    reportError: error => errors.push(error),
    ...remainingOverrides,
  });
  return {
    manager,
    event: { target: nested.tab, detail: {} },
    calls,
    errors,
    tab: nested.tab,
    value: () => values.get(nested.tab) ?? "",
  };
}

export function makeFolderHeaderMiddleClickFixture({
  targetName = "row",
  liveFolder = false,
  deletionError = null,
  middleClickDelete = true,
} = {}) {
  const deleted = [];
  const closedChildren = [];
  const errors = [];
  const makeFolder = (id, { live = false, zen = true } = {}) => {
    const folder = new FakeElement(zen ? "zen-folder" : "tab-group");
    Object.assign(folder, makeRegularFolder({ id, isZenFolder: zen, isLiveFolder: live }));
    folder.delete = async () => {
      if (deletionError && folder.id === "leaf") throw deletionError;
      deleted.push(folder.id);
    };
    const row = new FakeElement("hbox");
    row.setAttribute("class", "tab-group-label-container");
    const label = new FakeElement("label");
    const icon = new FakeElement("image");
    const iconPath = new FakeElement("path");
    icon.appendChild(iconPath);
    label.appendChild(icon);
    row.appendChild(label);
    folder.appendChild(row);
    folder.labelElement = label;
    return { folder, row, label, icon, iconPath };
  };
  const root = new FakeElement("tabs");
  const outer = makeFolder("outer");
  const leaf = makeFolder("leaf", { live: liveFolder });
  root.appendChild(outer.folder);
  outer.folder.appendChild(leaf.folder);

  const newTabButton = new FakeElement("toolbarbutton");
  newTabButton.setAttribute("data-better-zen-folders-owned", "true");
  const newTabIcon = new FakeElement("image");
  newTabButton.appendChild(newTabIcon);
  leaf.row.appendChild(newTabButton);
  const resetButton = new FakeElement("toolbarbutton");
  resetButton.setAttribute("class", "tab-reset-button");
  const resetIcon = new FakeElement("image");
  resetButton.appendChild(resetIcon);
  leaf.row.appendChild(resetButton);
  const overflow = new FakeElement("label");
  overflow.setAttribute("class", "tab-group-overflow-count-container");
  const overflowIcon = new FakeElement("image");
  overflow.appendChild(overflowIcon);
  leaf.row.appendChild(overflow);

  const childTab = new FakeElement("tab");
  childTab.group = leaf.folder;
  const childTabIcon = new FakeElement("image");
  childTab.appendChild(childTabIcon);
  leaf.folder.appendChild(childTab);
  const essentialTab = new FakeElement("tab");
  essentialTab.group = leaf.folder;
  essentialTab.essential = true;
  leaf.folder.appendChild(essentialTab);
  const placeholderTab = new FakeElement("tab");
  placeholderTab.group = leaf.folder;
  placeholderTab.empty = true;
  leaf.folder.appendChild(placeholderTab);

  const native = makeFolder("native", { zen: false });
  root.appendChild(native.folder);

  const manager = new FolderRestoreManager({
    preferences: {
      get: name => name === "middleClickDelete" ? middleClickDelete : undefined,
    },
    isSupportedTab: tab => tab?.localName === "tab",
    isEssential: tab => tab?.essential === true,
    isEmptyTab: tab => tab?.empty === true,
    getTabFolder: tab => tab?.group ?? null,
    closeFolderTab: tab => closedChildren.push(tab),
    deleteFolderFromHeader: folder => folder.delete(),
    reportError: error => errors.push(error),
  });
  const targets = {
    row: leaf.row,
    label: leaf.label,
    icon: leaf.icon,
    "icon-path": leaf.iconPath,
    "owned-plus": newTabButton,
    "owned-plus-icon": newTabIcon,
    reset: resetButton,
    "reset-icon": resetIcon,
    overflow,
    "overflow-icon": overflowIcon,
    "child-tab": childTabIcon,
    Essential: essentialTab,
    placeholder: placeholderTab,
    "native-tab-group": native.label,
    "outer-row": outer.row,
  };
  const eventFor = target => {
    const path = [];
    for (let current = target; current; current = current.parentElement) path.push(current);
    return {
      button: 1,
      target,
      defaultPrevented: false,
      propagationStopped: false,
      immediatePropagationStopped: false,
      composedPath: () => path,
      preventDefault() { this.defaultPrevented = true; },
      stopImmediatePropagation() {
        this.propagationStopped = true;
        this.immediatePropagationStopped = true;
      },
    };
  };

  return {
    manager,
    errors,
    middleClick(name = targetName) {
      const event = eventFor(targets[name]);
      this.handled = manager.captureMiddleClick(event);
      return event;
    },
    flushAsyncDeletion: async () => {
      await Promise.resolve();
      await Promise.resolve();
    },
    deletedFolderIds: () => [...deleted],
    closedChildCount: () => closedChildren.length,
  };
}

function observeNativeSessionStoreHistory(eventTarget, {
  closedGroups,
  _closedTabs,
  getGroupTabsForClose,
}) {
  eventTarget.addEventListener("TabGroupRemoveRequested", event => {
    closedGroups.push({ tabs: [...getGroupTabsForClose(event.target)] });
  });
  eventTarget.addEventListener("TabClose", event => {
    if (!event.detail?.skipSessionStore) _closedTabs.push(event.target);
  });
}

export function makeNativeFolderDeletionHistoryFixture({
  tabCount = 4,
  beforeUnloadCancels = false,
} = {}) {
  const eventTarget = new FakeEventTarget();
  const values = new Map();
  const closedGroups = [];
  const _closedTabs = [];
  const realTabs = Array.from({ length: tabCount }, (_, index) => ({
    id: ["first", "second", "third", "fourth"][index] ?? `tab-${index + 1}`,
    isConnected: true,
    supported: true,
  }));
  const placeholder = { id: "folder-project-empty", zenEmptyTab: true, isConnected: true };
  const folder = new FakeElement("zen-folder");
  Object.assign(folder, makeRegularFolder({
    id: "folder-project",
    name: "Project",
    workspaceId: "workspace-main",
    iconUrl: "chrome://project.svg",
    collapsed: false,
    saved: false,
    allItems: [placeholder, ...realTabs],
  }));
  const header = new FakeElement("hbox");
  header.setAttribute("class", "tab-group-label-container");
  const label = new FakeElement("label");
  header.appendChild(label);
  folder.appendChild(header);
  folder.labelElement = label;
  for (const tab of realTabs) tab.group = folder;
  const workspaceItems = [folder];

  const errors = [];
  let childCloseCalls = 0;
  let folderDeleteCalls = 0;
  let removeTabGroupCalls = 0;
  let restoredFolder = null;
  const manager = new FolderRestoreManager({
    eventTarget: () => eventTarget,
    preferences: { get: name => name === "middleClickDelete" ? true : undefined },
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
    isSupportedTab: tab => tab?.supported === true,
    isEssential: () => false,
    isEmptyTab: item => item?.zenEmptyTab === true,
    isSupportedFolder: current => current?.isZenFolder === true,
    getGroupTabsForClose: current => current.allItems,
    getTabFolder: tab => tab?.group ?? null,
    getFolderAncestors: () => [],
    getDirectItem: tab => tab,
    getDirectItems: current => current?.allItems ?? workspaceItems,
    getStableId: item => item?.id ?? null,
    getFolderData: current => ({
      id: current.id,
      workspaceId: current.workspaceId,
      name: current.name,
      iconUrl: current.iconUrl,
      collapsed: current.collapsed,
      saved: current.saved,
      type: "regular",
    }),
    getSplit: () => null,
    closeFolderTab: () => { childCloseCalls++; },
    deleteFolderFromHeader: current => current.delete(),
    reportError: error => errors.push(error),
  });
  manager.start(new AbortController().signal);
  observeNativeSessionStoreHistory(eventTarget, {
    closedGroups,
    _closedTabs,
    getGroupTabsForClose: current => current.allItems,
  });

  folder.delete = async () => {
    folderDeleteCalls++;
    if (beforeUnloadCancels) return false;

    // Native removal clears the empty placeholder before it creates group history.
    folder.allItems = folder.allItems.filter(item => item !== placeholder);
    placeholder.isConnected = false;
    removeTabGroupCalls++;
    eventTarget.emit("TabGroupRemoveRequested", { target: folder, detail: {} });
    for (const tab of folder.allItems) {
      eventTarget.emit("TabClose", { target: tab, detail: { skipSessionStore: true } });
      tab.isConnected = false;
      tab.group = null;
    }
    folder.allItems = [];
    folder.isConnected = false;
    return true;
  };

  const headerEvent = () => ({
    button: 1,
    target: header,
    defaultPrevented: false,
    immediatePropagationStopped: false,
    preventDefault() { this.defaultPrevented = true; },
    stopImmediatePropagation() { this.immediatePropagationStopped = true; },
  });

  return {
    manager,
    folder,
    placeholder,
    realTabs,
    closedGroups,
    _closedTabs,
    errors,
    get childCloseCalls() { return childCloseCalls; },
    get folderDeleteCalls() { return folderDeleteCalls; },
    get removeTabGroupCalls() { return removeTabGroupCalls; },
    async middleClickDelete() {
      const event = headerEvent();
      eventTarget.emit("click", event);
      await Promise.resolve();
      return event;
    },
    contextMenuDelete: () => folder.delete(),
    async restoreOnce() {
      if (restoredFolder) return restoredFolder;
      const closedGroup = closedGroups[0];
      if (!closedGroup) return null;
      const destination = makeFolderPathFixture({
        record: makeSingleFolderRecord({ id: folder.id, name: folder.name }),
      });
      const restoredTabs = closedGroup.tabs.map(tab => ({ id: tab.id }));
      for (let index = 0; index < restoredTabs.length; index++) {
        destination.values.set(restoredTabs[index], values.get(closedGroup.tabs[index]));
      }
      await Promise.all(restoredTabs.map(tab => destination.manager.restoreTab({ target: tab })));
      restoredFolder = destination.state.foldersById.get(folder.id) ?? null;
      return restoredFolder;
    },
    functionalFolderCount: () => restoredFolder?.isZenFolder === true ? 1 : 0,
    realTabIds: current => current?.visibleItems
      .filter(item => item.zenEmptyTab !== true && item.isZenFolder !== true)
      .map(item => item.id) ?? [],
  };
}

export function makeNestedTabCloseEventPathFixture(tab) {
  const trace = [];
  const listeners = {
    window: [],
    tabContainer: [],
    tab: [],
  };
  const addListener = node => (type, listener, options = {}) => {
    if (type !== "TabClose") return;
    listeners[node].push({
      listener,
      capture: options === true || options?.capture === true,
    });
  };
  const invoke = (node, capture, event) => {
    trace.push(`${node}:${node === "tab" ? "target" : capture ? "capture" : "bubble"}`);
    for (const entry of listeners[node]) {
      if (entry.capture === capture) entry.listener(event);
    }
  };
  return {
    windowTarget: { addEventListener: addListener("window") },
    tabContainer: { addEventListener: addListener("tabContainer") },
    tabTarget: { addEventListener: addListener("tab") },
    trace,
    dispatch(detail = {}) {
      const event = { type: "TabClose", target: tab, detail };
      invoke("window", true, event);
      invoke("tabContainer", true, event);
      invoke("tab", true, event);
      invoke("tab", false, event);
      invoke("tabContainer", false, event);
      invoke("window", false, event);
    },
  };
}

export function makeBrowserDomEventPathFixture(target, { targetLabel = "target" } = {}) {
  const trace = [];
  const listeners = {
    window: [],
    tabContainer: [],
    target: [],
  };
  const addListener = node => (type, listener, options = {}) => {
    listeners[node].push({
      type,
      listener,
      capture: options === true || options?.capture === true,
    });
  };
  const invoke = (node, capture, event) => {
    trace.push(`${node === "target" ? targetLabel : node}:${node === "target" ? "target" : capture ? "capture" : "bubble"}`);
    for (const entry of listeners[node]) {
      if (entry.type === event.type && entry.capture === capture) {
        entry.listener(event);
        if (event.immediatePropagationStopped) return false;
      }
    }
    return true;
  };
  return {
    windowTarget: { addEventListener: addListener("window") },
    tabContainer: { addEventListener: addListener("tabContainer") },
    target: { addEventListener: addListener("target") },
    trace,
    dispatch(type, event = {}) {
      event.type ??= type;
      event.target ??= target;
      for (const [node, capture] of [
        ["window", true],
        ["tabContainer", true],
        ["target", true],
        ["target", false],
        ["tabContainer", false],
        ["window", false],
      ]) {
        if (!invoke(node, capture, event)) break;
      }
    },
  };
}

export function makeExistingNestedRestoreFixture({
  recordedSlot = 2,
  nativeCollapseWriter = false,
} = {}) {
  const restored = { id: "restored", url: "https://example.test/same" };
  const record = makeRestoreRecord(["root", "leaf"], recordedSlot);
  const fixture = makeRestoreManagerFixture({
    records: [record],
    restoredTabs: [restored],
    initialItems: [{ id: "a" }, { id: "b" }, { id: "c" }],
    nativeCollapseWriter,
  });
  return { ...fixture, restored, event: { target: restored } };
}

export function makeIdenticalUrlFixture() {
  const first = { id: "first", url: "https://example.test/identical" };
  const second = { id: "second", url: "https://example.test/identical" };
  const fixture = makeRestoreManagerFixture({
    records: [makeRestoreRecord(["root", "leaf"], 1), makeRestoreRecord(["root", "leaf"], 3)],
    restoredTabs: [first, second],
    initialItems: [{ id: "a" }, { id: "b" }],
  });
  return {
    restoreSecondThenFirst: async () => {
      const secondRestore = fixture.manager.restoreTab({ target: second });
      const firstRestore = fixture.manager.restoreTab({ target: first });
      await Promise.all([secondRestore, firstRestore]);
    },
    positions: () => ({
      first: fixture.leaf.visibleItems.indexOf(first),
      second: fixture.leaf.visibleItems.indexOf(second),
    }),
  };
}

function makeRecordedFolder({
  id,
  parentId = null,
  slot = 0,
  previousId = null,
  nextId = null,
  workspaceId = "workspace-main",
  name,
  iconUrl = null,
  collapsed = false,
  saved = true,
  type = "regular",
  live,
  dismissed,
}) {
  const snapshot = {
    id, parentId, slot, previousId, nextId, workspaceId, name, iconUrl,
    collapsed, saved, type,
  };
  if (live !== undefined) snapshot.live = live;
  if (dismissed !== undefined) snapshot.dismissed = dismissed;
  return snapshot;
}

function makeHierarchyRecord() {
  return {
    version: 1,
    placement: {
      folderId: "folder-project", slot: 0, previousId: null, nextId: null,
    },
    folders: [
      makeRecordedFolder({
        id: "folder-work", slot: 1, previousId: "root-before", nextId: "root-after",
        name: "Work", iconUrl: "chrome://icons/work.svg", collapsed: false, saved: true,
      }),
      makeRecordedFolder({
        id: "folder-project", parentId: "folder-work", slot: 1,
        previousId: "tab-alpha", nextId: "tab-omega", name: "Project",
        iconUrl: "chrome://icons/project.svg", collapsed: true, saved: true,
      }),
    ],
  };
}

function makeSingleFolderRecord({
  id = "folder-single",
  name = "Original name",
  type = "regular",
  live,
  dismissed,
  presentation,
  liveTab,
} = {}) {
  const record = {
    version: 1,
    placement: { folderId: id, slot: 0, previousId: null, nextId: null },
    folders: [makeRecordedFolder({
      id, slot: 1, previousId: "root-before", nextId: "root-after",
      name, iconUrl: "chrome://icons/single.svg", collapsed: true, saved: true,
      type, live, dismissed,
    })],
  };
  if (presentation !== undefined) record.presentation = presentation;
  if (liveTab !== undefined) record.liveTab = liveTab;
  return record;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function emitZenNativeLiveDeparture(liveManager, state, tab) {
  state.nativeLiveDepartures.push({
    type: "TabUngrouped",
    itemId: tab.liveTabState?.itemId ?? null,
  });
  const itemId = tab.liveTabState?.itemId;
  if (!itemId) return;
  liveManager.dismissedItems.add(itemId);
  tab.liveTabState = null;
  liveManager.saveState();
}

function makeFolderPathFixture({
  record = makeHierarchyRecord(),
  existingRoot: seedExistingRoot = false,
  existingSingle = null,
  deletedWorkspace = false,
  occupiedIds = [],
  providerRegistered = true,
  existingProvider = false,
  providerStartFails = false,
  immediateProviderRefresh = false,
  groupingFailure = null,
  groupingFailureAddsUserContent = false,
  nativeCollapseWriter = false,
  nativeLiveDeparture = false,
  initialDismissedItems = [],
  originalLiveTabState = undefined,
  populationRegistry = null,
} = {}) {
  const activeWorkspace = "workspace-active";
  const restored = {
    id: "restored",
    closed: false,
    presentation: null,
    liveTabState: cloneJson(
      originalLiveTabState === undefined && nativeLiveDeparture
        ? record.liveTab ?? null
        : originalLiveTabState ?? null,
    ),
  };
  const values = new Map([[restored, JSON.stringify(record)]]);
  const state = {
    cacheInvalidations: 0,
    createCalls: [],
    deleteOrder: [],
    errors: [],
    fabricatedProviderIds: [],
    foldersById: new Map(),
    mutations: [],
    nativeLiveDepartures: [],
    pinCalls: [],
    providerRestoreCalls: [],
    providerStartSnapshots: [],
    populationHeldDuringAdd: [],
    selectedTabs: [],
    setCalls: [],
    warnings: [],
  };
  const occupied = new Set(occupiedIds);
  const workspaceIds = new Set(deletedWorkspace
    ? [activeWorkspace]
    : ["workspace-main", activeWorkspace]);
  const workspaceItems = new Map([...workspaceIds].map(id => [id, [
    { id: "root-before" },
    { id: "root-after" },
  ]]));
  let nextSafeId = 0;

  const liveManager = {
    registry: new Map(),
    liveFolders: new Map(),
    dismissedItems: new Set(initialDismissedItems),
    saveCalls: 0,
    getFolder(id) { return this.liveFolders.get(id); },
    saveState() { this.saveCalls++; },
  };

  class FakeLiveProvider {
    static type = "rss";

    constructor({ id, state: providerState, manager }) {
      this.id = id;
      this.state = cloneJson(providerState);
      this.manager = manager;
      this.tabsState = [];
      this.started = false;
    }

    start() {
      if (providerStartFails) throw new Error("provider start failed");
      const folder = state.foldersById.get(this.id);
      const originalIdentity = record.liveTab;
      const expectedIdentity = originalIdentity ? {
        itemId: `${this.id}:${originalIdentity.itemId.slice(originalIdentity.itemId.indexOf(":") + 1)}`,
        label: originalIdentity.label,
      } : null;
      state.providerStartSnapshots.push({
        folderId: this.id,
        tabsState: cloneJson(this.tabsState),
        tabIdentities: folder?.visibleItems
          .filter(item => !item.zenEmptyTab)
          .map(item => cloneJson(item.liveTabState ?? null)) ?? [],
      });
      if (immediateProviderRefresh && expectedIdentity) {
        const hasIdentity = folder?.visibleItems.some(item =>
          item.liveTabState?.itemId === expectedIdentity.itemId
        );
        const hasState = this.tabsState.some(item =>
          item.itemId === expectedIdentity.itemId && item.label === expectedIdentity.label
        );
        if (!hasIdentity || !hasState) {
          folder.visibleItems.push({
            id: "provider-duplicate",
            group: folder,
            liveTabState: expectedIdentity,
          });
        }
      }
      this.started = true;
    }

    stop() {
      this.started = false;
    }

    serialize() {
      return { state: cloneJson(this.state) };
    }
  }

  if (providerRegistered) liveManager.registry.set(FakeLiveProvider.type, FakeLiveProvider);

  const removeFromContainers = folder => {
    for (const items of workspaceItems.values()) {
      const index = items.indexOf(folder);
      if (index >= 0) items.splice(index, 1);
    }
    for (const other of state.foldersById.values()) {
      const index = other.visibleItems?.indexOf(folder) ?? -1;
      if (index >= 0) other.visibleItems.splice(index, 1);
    }
  };

  const makeFolder = options => {
    const placeholder = { id: `${options.id}-empty`, zenEmptyTab: true };
    const folder = {
      id: options.id,
      label: options.label,
      name: options.label,
      iconURL: null,
      workspaceId: options.workspaceId,
      collapsed: options.collapsed,
      saveOnWindowClose: options.saveOnWindowClose,
      saved: options.saveOnWindowClose,
      isZenFolder: true,
      isLiveFolder: options.isLiveFolder === true,
      isConnected: true,
      parentFolder: null,
      visibleItems: [placeholder],
      get group() { return this.parentFolder; },
      get allItems() { return this.visibleItems; },
      addTabs(tabs) {
        state.populationHeldDuringAdd.push(populationRegistry?.isHeld(this) === true);
        if (groupingFailure === "before-add") throw new Error("grouping failed before add");
        for (const tab of tabs) {
          if (nativeLiveDeparture) emitZenNativeLiveDeparture(liveManager, state, tab);
          if (!this.visibleItems.includes(tab)) this.visibleItems.push(tab);
          tab.group = this;
        }
        if (nativeCollapseWriter) {
          this.collapsed = tabs.some(tab => tab.selected === true);
        }
        if (groupingFailure === "after-add") {
          if (groupingFailureAddsUserContent) {
            this.visibleItems.push({ id: "user-content", group: this });
          }
          throw new Error("grouping failed after add");
        }
      },
      async delete() {
        state.deleteOrder.push(this.id);
        removeFromContainers(this);
        state.foldersById.delete(this.id);
        occupied.delete(this.id);
        this.isConnected = false;
      },
    };
    folder.groupContainer = {
      insertBefore(item, target) {
        const currentIndex = folder.visibleItems.indexOf(item);
        if (currentIndex >= 0) folder.visibleItems.splice(currentIndex, 1);
        const targetIndex = target === null ? -1 : folder.visibleItems.indexOf(target);
        folder.visibleItems.splice(targetIndex < 0 ? folder.visibleItems.length : targetIndex, 0, item);
        item.parentFolder = folder;
        if (item && !item.zenEmptyTab && !item.isZenFolder) item.group = folder;
      },
    };
    return folder;
  };

  const seedFolder = options => {
    const folder = makeFolder(options);
    state.foldersById.set(folder.id, folder);
    occupied.add(folder.id);
    workspaceItems.get(folder.workspaceId).splice(1, 0, folder);
    return folder;
  };

  let existingRoot = null;
  if (seedExistingRoot) {
    existingRoot = seedFolder({
      id: "folder-work", label: "Work renamed after close",
      workspaceId: "workspace-main", collapsed: true, saveOnWindowClose: false,
      isLiveFolder: false,
    });
    existingRoot.iconURL = "chrome://icons/current-work.svg";
    existingRoot.visibleItems = [
      { id: "tab-alpha" },
      { id: "root-existing-empty", zenEmptyTab: true },
      { id: "tab-omega" },
    ];
  }

  let existing = null;
  if (existingSingle) {
    existing = seedFolder({
      id: record.folders[0].id,
      label: existingSingle.label,
      workspaceId: existingSingle.workspaceId ?? "workspace-main",
      collapsed: existingSingle.collapsed,
      saveOnWindowClose: existingSingle.saveOnWindowClose,
      isLiveFolder: existingSingle.isLiveFolder ?? false,
    });
    existing.iconURL = existingSingle.iconURL;
  }

  if (existing?.isLiveFolder && existingProvider) {
    const currentState = {
      interval: 900000,
      lastFetched: 0,
      options: {},
      url: "https://example.test/current.xml",
      maxItems: 10,
      timeRange: 0,
    };
    liveManager.liveFolders.set(existing.id, new FakeLiveProvider({
      id: existing.id,
      state: currentState,
      manager: liveManager,
    }));
  }

  const currentProviderValidators = () => {
    const validators = new Map();
    for (const providerType of liveManager.registry.keys()) {
      validators.set(providerType, serializedState => {
        try {
          const data = JSON.parse(serializedState);
          return data !== null && typeof data === "object"
            && data.state !== null && typeof data.state === "object";
        } catch {
          return false;
        }
      });
    }
    return validators;
  };

  const adapters = {
    sessionStore: {
      getCustomTabValue: (tab, key) => key === RESTORE_KEY ? values.get(tab) ?? "" : "",
      setCustomTabValue: (tab, key, value) => {
        state.setCalls.push({ tab, key, value });
        if (key === RESTORE_KEY) values.set(tab, value);
      },
    },
    getMaxFolderDepth: () => 5,
    get providerValidators() { return currentProviderValidators(); },
    validateMissingLiveFolder: snapshot =>
      currentProviderValidators().get(snapshot.live.providerType)?.(snapshot.live.serializedState) === true,
    findZenFolder: id => state.foldersById.get(id) ?? null,
    isIdFree: id => !occupied.has(id),
    newFolderId: () => {
      let candidate;
      do candidate = `folder-safe-${++nextSafeId}`; while (occupied.has(candidate));
      return candidate;
    },
    createFolder: (tabs, options) => {
      state.createCalls.push({ tabs: [...tabs], options: { ...options } });
      state.mutations.push(`create:${options.id}`);
      const folder = makeFolder(options);
      state.foldersById.set(folder.id, folder);
      occupied.add(folder.id);
      workspaceItems.get(folder.workspaceId).push(folder);
      return folder;
    },
    setFolderIcon: (folder, iconUrl) => {
      state.mutations.push(`icon:${folder.id}`);
      folder.iconURL = iconUrl;
    },
    placeFolder: (folder, parent, placement) => {
      state.mutations.push(`place:${folder.id}`);
      removeFromContainers(folder);
      const items = parent ? parent.visibleItems : workspaceItems.get(folder.workspaceId);
      const visible = items.filter(item => !item.zenEmptyTab && item !== folder);
      const target = visible[Math.min(placement.slot, visible.length)] ?? null;
      const targetIndex = target === null ? -1 : items.indexOf(target);
      items.splice(targetIndex < 0 ? items.length : targetIndex, 0, folder);
      folder.parentFolder = parent;
    },
    resolveWorkspace: id => workspaceIds.has(id) ? id : activeWorkspace,
    reportWarning: warning => state.warnings.push(String(warning)),
    restoreLiveProvider: (folder, snapshot) => {
      state.providerRestoreCalls.push(folder.id);
      const ProviderClass = liveManager.registry.get(snapshot.live.providerType);
      if (!ProviderClass) throw new Error(`missing live provider ${snapshot.live.providerType}`);
      const data = JSON.parse(snapshot.live.serializedState);
      const provider = new ProviderClass({ id: folder.id, state: data.state, manager: liveManager });
      liveManager.liveFolders.set(folder.id, provider);
      for (const itemId of snapshot.dismissed ?? []) {
        const suffix = itemId.slice(itemId.indexOf(":") + 1);
        liveManager.dismissedItems.add(`${folder.id}:${suffix}`);
      }
      return provider;
    },
    startRestoredLiveProvider: (_folder, provider, tabsState) => {
      provider.tabsState = cloneJson(tabsState);
      provider.start();
      liveManager.saveState();
      return provider;
    },
    rollbackCreatedFolder: async folder => {
      const provider = liveManager.liveFolders.get(folder.id);
      provider?.stop();
      liveManager.liveFolders.delete(folder.id);
      for (const itemId of [...liveManager.dismissedItems]) {
        if (itemId.startsWith(`${folder.id}:`)) liveManager.dismissedItems.delete(itemId);
      }
      await folder.delete();
    },
    isPinned: tab => tab.pinned === true,
    pinTab: tab => { state.pinCalls.push(tab); tab.pinned = true; },
    unpinTab: tab => { tab.pinned = false; },
    getDirectItem: tab => tab,
    getDirectItems: (folder, directItem) => folder?.visibleItems
      ?? workspaceItems.get(directItem?.workspaceId ?? activeWorkspace)
      ?? [],
    captureDirectItemPlacement: item => ({
      group: item.group ?? null,
      parentFolder: item.parentFolder ?? null,
    }),
    restoreDirectItemPlacement: (item, placement) => {
      if (nativeLiveDeparture) emitZenNativeLiveDeparture(liveManager, state, item);
      for (const folder of state.foldersById.values()) {
        const index = folder.visibleItems?.indexOf(item) ?? -1;
        if (index >= 0) folder.visibleItems.splice(index, 1);
      }
      if (placement.group) item.group = placement.group;
      else delete item.group;
      if (placement.parentFolder) item.parentFolder = placement.parentFolder;
      else delete item.parentFolder;
    },
    insertDirectItem: (folder, item, target) => folder.groupContainer.insertBefore(item, target),
    invalidateTabCaches: () => { state.cacheInvalidations++; },
    isSelected: tab => tab.selected === true,
    selectTab: tab => { state.selectedTabs.push(tab); tab.selected = true; },
    getTabFolder: tab => tab.group ?? null,
    getFolderAncestors: folder => {
      const ancestors = [];
      for (let current = folder.parentFolder; current; current = current.parentFolder) ancestors.push(current);
      return ancestors;
    },
    getStableId: item => item.id,
    isEmptyTab: item => item.zenEmptyTab === true,
    getFolderData: folder => ({
      id: folder.id,
      workspaceId: folder.workspaceId,
      name: folder.label,
      iconUrl: folder.iconURL,
      collapsed: folder.collapsed,
      saved: folder.saveOnWindowClose,
      type: folder.isLiveFolder ? "live" : "regular",
    }),
    getLiveFolderState: folder => {
      const provider = liveManager.getFolder(folder.id);
      return provider ? {
        providerType: provider.constructor.type,
        serializedState: JSON.stringify(provider.serialize()),
      } : null;
    },
    getDismissed: folder => [...liveManager.dismissedItems]
      .filter(itemId => itemId.startsWith(`${folder.id}:`)),
    getTabPresentation: tab => tab.presentation,
    restoreTabPresentation: (tab, presentation) => { tab.presentation = cloneJson(presentation); },
    getLiveTabState: tab => cloneJson(tab.liveTabState ?? null),
    restoreLiveTabState: (tab, liveTabState) => {
      tab.liveTabState = liveTabState === null ? null : cloneJson(liveTabState);
    },
    getSplit: () => null,
    reportError: error => state.errors.push(error),
    populationRegistry,
  };

  const manager = new FolderRestoreManager(adapters);
  const directIds = folder => folder.visibleItems.filter(item => !item.zenEmptyTab).map(item => item.id);
  const topLevelIds = () => [...workspaceItems.values()]
    .find(items => items.some(item => item.id === "folder-work"))
    ?.filter(item => !item.zenEmptyTab).map(item => item.id)
    ?? [];
  return {
    record,
    adapters,
    manager,
    restored,
    event: { target: restored },
    values,
    state,
    liveManager,
    FakeLiveProvider,
    existingRoot,
    existing,
    directIds,
    topLevelIds,
  };
}

export function makeDeletedHierarchyFixture(options = {}) {
  return makeFolderPathFixture({ record: makeHierarchyRecord(), ...options });
}

export function makeLazyDeletedGroupRestoreFixture({
  tabCount = 4,
  sessionRestoring = true,
  pending = false,
  missingRecordAt = null,
  failMoveAt = null,
  unavailableBoundary = false,
  nativeCollapseWriter = false,
  liveFolder = false,
  nestedFolders = false,
  delayProviderStart = false,
  holdNativeRemoval = false,
  occupiedIds = [],
  nativeLiveDeparture = false,
  initialDismissedItems = [],
} = {}) {
  const deferred = [];
  const errors = [];
  const foldersById = new Map();
  const moveCounts = new Map();
  const values = new Map();
  const validRestoreValues = new Map();
  const workspaceItems = [];
  const providerStartSnapshots = [];
  const nativeLiveDepartures = [];
  const occupied = new Set(occupiedIds);
  let emittedEarlyRestore = false;
  let moveAttempt = 0;
  let collectorCalls = 0;
  let folderCreationCount = 0;
  let idReleaseCount = 0;
  let nextSafeId = 0;
  let delayedProviderStart = null;
  let providerStartWasDelayed = false;
  let signalProviderStart;
  const providerStartReached = delayProviderStart
    ? new Promise(resolve => { signalProviderStart = resolve; })
    : Promise.resolve();
  let signalNativeShellEmpty;
  const nativeShellEmpty = holdNativeRemoval
    ? new Promise(resolve => { signalNativeShellEmpty = resolve; })
    : Promise.resolve();
  let nativeShellEmptySignalled = false;

  const liveManager = {
    registry: new Map(),
    liveFolders: new Map(),
    dismissedItems: new Set(initialDismissedItems),
    saveCalls: 0,
    getFolder(id) { return this.liveFolders.get(id); },
    saveState() { this.saveCalls++; },
  };

  class FakeLiveProvider {
    static type = "rss";

    constructor({ id, state: providerState, manager }) {
      this.id = id;
      this.state = cloneJson(providerState);
      this.manager = manager;
      this.tabsState = [];
      this.started = false;
      this.ownedDismissedItems = [];
    }

    start() {
      providerStartSnapshots.push({
        folderId: this.id,
        tabsState: cloneJson(this.tabsState),
        tabIdentities: tabs.map(tab => cloneJson(tab.liveTabState ?? null)),
      });
      this.started = true;
    }

    stop() { this.started = false; }
    serialize() { return { state: cloneJson(this.state) }; }
  }

  if (liveFolder) liveManager.registry.set(FakeLiveProvider.type, FakeLiveProvider);

  const emitNativeLiveDeparture = tab => {
    if (!nativeLiveDeparture) return;
    emitZenNativeLiveDeparture(liveManager, { nativeLiveDepartures }, tab);
  };

  const tabs = Array.from({ length: tabCount }, (_, index) => ({
    id: `restored-${index + 1}`,
    pinned: true,
    presentation: null,
    selected: false,
    sessionRestoring,
    hasAttribute(name) { return name === "pending" && pending; },
  }));

  const nativeGroupEvents = new FakeEventTarget();
  let nativeObserverQueued = false;
  let nativeRemovalEventEmitted = false;
  let tabGroupRemovedCount = 0;
  let rawRemoveCount = 0;

  const queueNativeGroupObserver = () => {
    if (
      nativeObserverQueued
      || nativeRemovalEventEmitted
      || nativeGroup.tabs.length !== 0
      || !nativeGroup.isConnected
    ) return;
    if (!nativeShellEmptySignalled) {
      nativeShellEmptySignalled = true;
      signalNativeShellEmpty?.();
    }
    if (holdNativeRemoval) return;
    nativeObserverQueued = true;
    queueMicrotask(() => {
      nativeObserverQueued = false;
      if (
        nativeRemovalEventEmitted
        || nativeGroup.tabs.length !== 0
        || !nativeGroup.isConnected
      ) return;
      nativeRemovalEventEmitted = true;
      tabGroupRemovedCount++;
      nativeGroupEvents.emit("TabGroupRemoved", { target: nativeGroup });
    });
  };

  const nativeGroup = {
    id: "folder-project",
    isConnected: true,
    isZenFolder: false,
    tabs: [...tabs],
    insertBefore(item, target) {
      emitNativeLiveDeparture(item);
      detach(item);
      const targetIndex = target === null ? -1 : this.tabs.indexOf(target);
      this.tabs.splice(targetIndex < 0 ? this.tabs.length : targetIndex, 0, item);
      item.parentNode = this;
      item.group = this;
    },
    remove() {
      rawRemoveCount++;
    },
    addEventListener: (...args) => nativeGroupEvents.addEventListener(...args),
    removeEventListener: (...args) => nativeGroupEvents.removeEventListener(...args),
  };
  workspaceItems.push(nativeGroup);
  for (const tab of tabs) {
    tab.parentNode = nativeGroup;
    tab.group = nativeGroup;
  }

  function itemsForParent(parent) {
    if (parent === nativeGroup) return nativeGroup.tabs;
    return parent?.folder?.visibleItems ?? null;
  }

  function detach(item) {
    const items = itemsForParent(item.parentNode);
    const index = items?.indexOf(item) ?? -1;
    if (index >= 0) items.splice(index, 1);
    if (item.parentNode === nativeGroup) queueNativeGroupObserver();
  }

  function makeFolder(options) {
    const placeholder = { id: `${options.id}-empty`, zenEmptyTab: true };
    const folder = {
      id: options.id,
      label: options.label,
      name: options.label,
      iconURL: null,
      workspaceId: options.workspaceId,
      collapsed: options.collapsed,
      saveOnWindowClose: options.saveOnWindowClose,
      isZenFolder: true,
      isLiveFolder: options.isLiveFolder === true,
      isConnected: true,
      parentFolder: null,
      visibleItems: [placeholder],
      get group() { return this.parentFolder; },
      get allItems() { return this.visibleItems; },
      addTabs(items) {
        for (const item of items) {
          moveAttempt++;
          emitNativeLiveDeparture(item);
          this.groupContainer.insertBefore(item, null);
          moveCounts.set(item.id, (moveCounts.get(item.id) ?? 0) + 1);
          if (moveAttempt === failMoveAt) throw new Error(`move ${moveAttempt} failed`);
        }
        if (nativeCollapseWriter) {
          this.collapsed = items.some(item => item.selected === true);
        }
      },
      async delete() {
        detach(this);
        const index = workspaceItems.indexOf(this);
        if (index >= 0) workspaceItems.splice(index, 1);
        foldersById.delete(this.id);
        occupied.delete(this.id);
        this.isConnected = false;
      },
    };
    folder.groupContainer = {
      folder,
      insertBefore(item, target) {
        detach(item);
        const targetIndex = target === null ? -1 : folder.visibleItems.indexOf(target);
        folder.visibleItems.splice(
          targetIndex < 0 ? folder.visibleItems.length : targetIndex,
          0,
          item,
        );
        item.parentNode = this;
        item.group = folder;
      },
    };
    placeholder.parentNode = folder.groupContainer;
    return folder;
  }

  const serializedLiveState = JSON.stringify({
    state: {
      interval: 900000,
      lastFetched: 0,
      options: {},
      url: "https://example.test/group-feed.xml",
      maxItems: 10,
      timeRange: 0,
    },
  });
  if (nestedFolders && liveFolder) {
    throw new Error("nested live restore fixture is unsupported");
  }
  const record = nestedFolders ? makeHierarchyRecord() : makeSingleFolderRecord({
    id: "folder-project",
    name: "Project",
    ...(liveFolder ? {
      type: "live",
      live: { providerType: "rss", serializedState: serializedLiveState },
      dismissed: ["folder-project:dismissed-1"],
      presentation: {
        label: "Restored live tab",
        iconUrl: "https://example.test/live.svg",
        muted: false,
      },
      liveTab: {
        itemId: "folder-project:item-1",
        label: "Native sublabel 1",
      },
    } : {}),
  });
  tabs.forEach((tab, index) => {
    const tabRecord = cloneJson(record);
    tabRecord.placement.slot = index;
    if (liveFolder) {
      tabRecord.liveTab.itemId = `folder-project:item-${index + 1}`;
      tabRecord.liveTab.label = `Native sublabel ${index + 1}`;
      tab.liveTabState = cloneJson(tabRecord.liveTab);
      tab.presentation = cloneJson(tabRecord.presentation);
    }
    const serialized = JSON.stringify(tabRecord);
    validRestoreValues.set(tab, serialized);
    if (index !== missingRecordAt) values.set(tab, serialized);
  });

  const validateLiveProviderState = serializedState => {
    try {
      const data = JSON.parse(serializedState);
      return data !== null && typeof data === "object"
        && data.state !== null && typeof data.state === "object";
    } catch {
      return false;
    }
  };

  const adapters = {
    sessionStore: {
      getCustomTabValue: (tab, key) => key === RESTORE_KEY ? values.get(tab) ?? "" : "",
      setCustomTabValue: (tab, key, value) => {
        if (key === RESTORE_KEY) values.set(tab, value);
      },
    },
    listTabs: () => [...tabs],
    getMaxFolderDepth: () => 5,
    providerValidators: liveFolder ? { rss: validateLiveProviderState } : {},
    validateMissingLiveFolder: snapshot => liveFolder
      && validateLiveProviderState(snapshot.live.serializedState),
    nativeGroupRestoreAvailabilityError: () => unavailableBoundary
      ? new Error("required native-group browser boundary is unavailable")
      : null,
    deferNativeGroupRestore: callback => {
      deferred.push(callback);
      return () => {
        const index = deferred.indexOf(callback);
        if (index >= 0) deferred.splice(index, 1);
      };
    },
    isNativeRestoredGroup: group => group === nativeGroup && group.isConnected,
    isExcludedNativeGroup: group => group?.isSplitView === true
      || group?.id === "zen-workspace-collapsible-pins",
    isSessionRestoreCandidate: tab => tab.sessionRestoring === true
      || tab.hasAttribute?.("pending") === true,
    getNativeGroupTabs: group => [...group.tabs],
    collectPersistedZenFolders: () => {
      collectorCalls++;
      return [...foldersById.values()]
        .filter(folder => folder.isConnected)
        .map(folder => ({
          pinned: true,
          essential: false,
          splitViewGroup: false,
          id: folder.id,
          name: folder.label,
          collapsed: folder.collapsed,
          saveOnWindowClose: folder.saveOnWindowClose,
          parentId: folder.parentFolder?.id ?? null,
          prevSiblingInfo: null,
          emptyTabIds: [],
          userIcon: folder.iconURL,
          showFolderShape: true,
          isLiveFolder: folder.isLiveFolder,
          workspaceId: folder.workspaceId,
        }));
    },
    armNativeGroupRemoval: group => {
      let settled = false;
      let resolve;
      const onRemoved = event => {
        if (event.target !== group || settled) return;
        settled = true;
        group.removeEventListener("TabGroupRemoved", onRemoved);
        resolve();
      };
      const promise = new Promise(currentResolve => { resolve = currentResolve; });
      group.addEventListener("TabGroupRemoved", onRemoved, { once: true });
      return {
        promise,
        cancel: () => {
          if (settled) return;
          settled = true;
          group.removeEventListener("TabGroupRemoved", onRemoved);
          resolve();
        },
      };
    },
    requestNativeGroupEmptyReconciliation: group => {
      if (group !== nativeGroup) throw new Error("unexpected native group");
      queueNativeGroupObserver();
    },
    releaseNativeGroupId: group => {
      idReleaseCount++;
      const original = group.id;
      let finished = false;
      group.id = `better-zen-folders-native-${++nextSafeId}`;
      return {
        commit: () => { finished = true; },
        rollback: () => {
          if (finished) return;
          finished = true;
          if (group.isConnected) group.id = original;
        },
      };
    },
    findZenFolder: id => foldersById.get(id) ?? null,
    isIdFree: id => !occupied.has(id)
      && !foldersById.has(id)
      && (!nativeGroup.isConnected || nativeGroup.id !== id),
    newFolderId: () => {
      let candidate;
      do candidate = `folder-safe-${++nextSafeId}`; while (occupied.has(candidate));
      return candidate;
    },
    createFolder: (_tabs, options) => {
      folderCreationCount++;
      const folder = makeFolder(options);
      foldersById.set(folder.id, folder);
      occupied.add(folder.id);
      workspaceItems.push(folder);
      return folder;
    },
    setFolderIcon: (folder, iconUrl) => { folder.iconURL = iconUrl; },
    placeFolder: (folder, parent, placement) => {
      detach(folder);
      const items = parent ? parent.visibleItems : workspaceItems;
      const visible = items.filter(item => !item.zenEmptyTab && item !== folder);
      const target = visible[Math.min(placement.slot, visible.length)] ?? null;
      const targetIndex = target === null ? -1 : items.indexOf(target);
      items.splice(targetIndex < 0 ? items.length : targetIndex, 0, folder);
      folder.parentFolder = parent;
      folder.parentNode = parent?.groupContainer ?? null;
    },
    resolveWorkspace: () => "workspace-main",
    restoreLiveProvider: (folder, snapshot) => {
      const ProviderClass = liveManager.registry.get(snapshot.live.providerType);
      if (!ProviderClass) throw new Error(`missing live provider ${snapshot.live.providerType}`);
      const data = JSON.parse(snapshot.live.serializedState);
      const provider = new ProviderClass({ id: folder.id, state: data.state, manager: liveManager });
      for (const itemId of snapshot.dismissed ?? []) {
        const suffix = itemId.slice(itemId.indexOf(":") + 1);
        const translated = `${folder.id}:${suffix}`;
        if (liveManager.dismissedItems.has(translated)) continue;
        liveManager.dismissedItems.add(translated);
        provider.ownedDismissedItems.push(translated);
      }
      liveManager.liveFolders.set(folder.id, provider);
      return provider;
    },
    startRestoredLiveProvider: (_folder, provider, tabsState) => {
      provider.tabsState = cloneJson(tabsState);
      provider.start();
      liveManager.saveState();
      if (delayProviderStart && !providerStartWasDelayed) {
        providerStartWasDelayed = true;
        const pending = new Promise((resolve, reject) => {
          delayedProviderStart = { provider, resolve, reject };
        });
        signalProviderStart();
        return pending;
      }
      return provider;
    },
    rollbackCreatedFolder: async folder => {
      const provider = liveManager.liveFolders.get(folder.id);
      provider?.stop();
      liveManager.liveFolders.delete(folder.id);
      for (const itemId of provider?.ownedDismissedItems ?? []) {
        liveManager.dismissedItems.delete(itemId);
      }
      await folder.delete();
    },
    isPinned: tab => tab.pinned === true,
    pinTab: tab => { tab.pinned = true; },
    unpinTab: tab => { tab.pinned = false; },
    getDirectItem: tab => tab,
    getDirectItems: (folder, directItem) => folder?.visibleItems
      ?? itemsForParent(directItem?.parentNode)
      ?? workspaceItems,
    captureDirectItemPlacement: item => {
      const parent = item.parentNode;
      const items = itemsForParent(parent) ?? [];
      return { parent, nextSibling: items[items.indexOf(item) + 1] ?? null };
    },
    restoreDirectItemPlacement: (item, placement) =>
      placement.parent.insertBefore(item, placement.nextSibling),
    insertDirectItem: (folder, item, target) => folder.groupContainer.insertBefore(item, target),
    invalidateTabCaches: () => {},
    isSelected: tab => tab.selected === true,
    getSelectedTab: () => tabs.find(tab => tab.selected) ?? null,
    selectTab: tab => { tab.selected = true; },
    restoreSelectedTab: tab => { if (tab) tab.selected = true; },
    getTabFolder: tab => tab.group,
    getFolderAncestors: () => [],
    getStableId: item => item.id,
    isEmptyTab: item => item.zenEmptyTab === true,
    getFolderData: folder => ({
      id: folder.id,
      workspaceId: folder.workspaceId,
      name: folder.label,
      iconUrl: folder.iconURL,
      collapsed: folder.collapsed,
      saved: folder.saveOnWindowClose,
      type: folder.isLiveFolder ? "live" : "regular",
    }),
    getLiveFolderState: folder => {
      const provider = liveManager.getFolder(folder.id);
      return provider ? {
        providerType: provider.constructor.type,
        serializedState: JSON.stringify(provider.serialize()),
      } : null;
    },
    getDismissed: folder => [...liveManager.dismissedItems]
      .filter(itemId => itemId.startsWith(`${folder.id}:`)),
    getTabPresentation: tab => tab.presentation,
    restoreTabPresentation: (tab, presentation) => { tab.presentation = cloneJson(presentation); },
    getLiveTabState: tab => cloneJson(tab.liveTabState ?? null),
    restoreLiveTabState: (tab, liveTabState) => {
      tab.liveTabState = liveTabState === null ? null : cloneJson(liveTabState);
    },
    getSplit: () => null,
    reportError: error => errors.push(error),
  };
  const manager = new FolderRestoreManager(adapters);

  return {
    manager,
    adapters,
    nativeGroup,
    tabs,
    errors,
    liveManager,
    providerStartSnapshots,
    nativeLiveDepartures,
    flushDeferred() {
      if (!emittedEarlyRestore) {
        emittedEarlyRestore = true;
        void manager.restoreTab({ target: tabs[0] });
      }
      for (const callback of deferred.splice(0)) callback();
    },
    synchronizeMetadata: () => manager.metadataSynchronizer.synchronize(),
    restoreNativeGroup: () => manager.restoreNativeGroup(nativeGroup),
    realFolderIds: () => [...foldersById.keys()].sort(),
    directTabIds: id => foldersById.get(id)?.visibleItems
      .filter(item => !item.zenEmptyTab && !item.isZenFolder)
      .map(item => item.id) ?? [],
    folderCollapsed: id => foldersById.get(id)?.collapsed,
    restoreValue: tab => values.get(tab) ?? "",
    restoreValues: () => tabs.map(tab => values.get(tab) ?? ""),
    supplyRestoreRecord: index => {
      const tab = tabs[index];
      const serialized = validRestoreValues.get(tab);
      if (!tab || serialized === undefined) throw new Error(`missing fixture tab ${index}`);
      values.set(tab, serialized);
    },
    mutateRestoreRecord: (index, mutate) => {
      const tab = tabs[index];
      const serialized = values.get(tab);
      if (!tab || serialized === undefined) throw new Error(`missing fixture tab ${index}`);
      const record = JSON.parse(serialized);
      mutate(record);
      values.set(tab, JSON.stringify(record));
    },
    waitForProviderStart: () => providerStartReached,
    waitForNativeShellEmpty: () => nativeShellEmpty,
    failProviderStart: error => {
      if (!delayedProviderStart) throw new Error("provider start is not pending");
      const { reject } = delayedProviderStart;
      delayedProviderStart = null;
      reject(error);
    },
    finishNativeRemovalAnimation: () => {
      if (!nativeRemovalEventEmitted || !nativeGroup.isConnected) return false;
      const index = workspaceItems.indexOf(nativeGroup);
      if (index >= 0) workspaceItems.splice(index, 1);
      nativeGroup.isConnected = false;
      return true;
    },
    nativeTabIds: () => nativeGroup.tabs.map(tab => tab.id),
    nativeRemovalListenerCount: () => nativeGroupEvents.listenerCount("TabGroupRemoved"),
    tabGroupRemovedCount: () => tabGroupRemovedCount,
    collectorCallCount: () => collectorCalls,
    folderCreationCount: () => folderCreationCount,
    idReleaseCount: () => idReleaseCount,
    rawRemoveCount: () => rawRemoveCount,
    moveCount: id => moveCounts.get(id) ?? 0,
    liveProvider: id => liveManager.getFolder(id),
  };
}

export function makeExistingRenamedFolderFixture() {
  return makeFolderPathFixture({
    record: makeSingleFolderRecord(),
    existingSingle: {
      label: "Renamed after close",
      collapsed: false,
      saveOnWindowClose: false,
      iconURL: "chrome://icons/renamed.svg",
    },
  });
}

export function makeDeletedLiveFolderFixture(options = {}) {
  const serializedState = JSON.stringify({
    state: {
      interval: 900000,
      lastFetched: 0,
      options: {},
      url: "https://example.test/feed.xml",
      maxItems: 10,
      timeRange: 0,
    },
  });
  return makeFolderPathFixture({
    record: makeSingleFolderRecord({
      id: "folder-live",
      name: "Live project",
      type: "live",
      live: { providerType: "rss", serializedState },
      dismissed: ["folder-live:dismissed-1"],
      presentation: {
        label: "Restored live tab",
        iconUrl: "https://example.test/live.svg",
        muted: true,
      },
      liveTab: {
        itemId: "folder-live:item-1",
        label: "Native sublabel",
      },
    }),
    ...options,
  });
}

export function makeFolderIdCollisionFixture() {
  const record = makeSingleFolderRecord({ id: "folder-collision", name: "Collision" });
  const unrelated = { id: "folder-collision", isZenFolder: false };
  return {
    ...makeFolderPathFixture({ record, occupiedIds: [unrelated.id] }),
    unrelated,
  };
}

export const makeLiveFolder = overrides =>
  makeRegularFolder({ isLiveFolder: true, ...overrides });

export function makeController(name, calls) {
  return {
    start() { calls.push(`${name}:start`); },
    destroy() { calls.push(`${name}:destroy`); },
  };
}

export function replaceController(controller, host = globalThis) {
  host.__betterZenFoldersController?.destroy();
  host.__betterZenFoldersController = controller;
  controller.start();
}

export class FakeElement {
  constructor(localName = "box") {
    this.localName = localName;
    this.attributes = new Map();
    this.children = [];
    this.parentNode = null;
    this.listeners = new Map();
    this.classList = {
      add: (...names) => {
        for (const name of names) this._classes.add(name);
      },
      contains: name => this._classes.has(name),
    };
    this._classes = new Set();
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name === "class") this.classList.add(...String(value).split(/\s+/));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  get parentElement() {
    return this.parentNode;
  }

  matches(selector) {
    return selector.split(",").some(candidate => {
      const current = candidate.trim();
      if (current === this.localName) return true;
      if (current.startsWith(".")) return this.classList.contains(current.slice(1));
      if (current === '[data-better-zen-folders-owned="true"]') {
        return this.getAttribute("data-better-zen-folders-owned") === "true";
      }
      return false;
    });
  }

  closest(selector) {
    for (let current = this; current; current = current.parentElement) {
      if (current.matches?.(selector)) return current;
    }
    return null;
  }

  insertBefore(child, reference) {
    child.remove();
    const index = reference ? this.children.indexOf(reference) : -1;
    this.children.splice(index < 0 ? this.children.length : index, 0, child);
    child.parentNode = this;
    return child;
  }

  appendChild(child) {
    return this.insertBefore(child, null);
  }

  remove() {
    if (!this.parentNode) return;
    const index = this.parentNode.children.indexOf(this);
    if (index >= 0) this.parentNode.children.splice(index, 1);
    this.parentNode = null;
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  removeEventListener(type, listener) {
    if (this.listeners.get(type) === listener) this.listeners.delete(type);
  }

  dispatch(type) {
    const event = {
      type,
      defaultPrevented: false,
      propagationStopped: false,
      preventDefault() { this.defaultPrevented = true; },
      stopPropagation() { this.propagationStopped = true; },
    };
    this.listeners.get(type)?.(event);
    if (!event.propagationStopped) this.parentNode?.dispatchFromChild?.(event);
    return event;
  }

  dispatchFromChild(event) {
    this.listeners.get(event.type)?.(event);
    if (!event.propagationStopped) this.parentNode?.dispatchFromChild?.(event);
  }

  activateByPointer() {
    const pointerdown = this.dispatch("pointerdown");
    const click = this.dispatch("click");
    const command = click.defaultPrevented ? null : this.dispatch("command");
    return { pointerdown, click, command };
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] ?? null;
  }

  querySelectorAll(selector) {
    const predicate = selector.startsWith(".")
      ? node => node.classList.contains(selector.slice(1))
      : node => node.getAttribute("data-better-zen-folders-owned") === "true";
    return this.children.filter(predicate);
  }
}

export class FakeMutationObserver {
  constructor(callback) {
    this.callback = callback;
    this.observed = [];
    this.disconnects = 0;
  }

  observe(target, options) {
    this.observed.push({ target, options });
  }

  disconnect() {
    this.disconnects++;
  }

  notify() {
    this.callback([]);
  }
}

export class FakeEventTarget {
  constructor() {
    this.listeners = new Map();
    this.options = new Map();
  }

  addEventListener(type, listener, options) {
    const listeners = this.listeners.get(type) ?? new Set();
    listeners.add(listener);
    this.listeners.set(type, listeners);
    const listenerOptions = this.options.get(type) ?? new Map();
    listenerOptions.set(listener, options);
    this.options.set(type, listenerOptions);
    options?.signal?.addEventListener?.("abort", () => {
      this.removeEventListener(type, listener);
    }, { once: true });
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
    this.options.get(type)?.delete(listener);
  }

  emit(type, event) {
    for (const listener of this.listeners.get(type) ?? []) {
      listener(event);
      if (event.immediatePropagationStopped) break;
    }
  }

  listenerCount(type) {
    return this.listeners.get(type)?.size ?? 0;
  }

  listenerCapture(type) {
    const options = this.options.get(type)?.values().next().value;
    return options === true || options?.capture === true;
  }
}

export function makePreferenceFixture() {
  const userValues = new Map();
  const observers = new Set();
  const warnings = [];
  const writes = [];
  const clears = [];
  const types = {
    invalid: 0,
    string: 32,
    int: 64,
    bool: 128,
  };
  const typeFor = value => {
    if (typeof value === "string") return types.string;
    if (typeof value === "number") return types.int;
    if (typeof value === "boolean") return types.bool;
    return types.invalid;
  };
  const read = (property, type) => {
    const entry = userValues.get(property);
    if (!entry || entry.type !== type) throw new Error(`wrong preference type: ${property}`);
    return entry.value;
  };
  const write = (property, value, type) => {
    userValues.set(property, { type, value });
    writes.push({ property, value, type });
  };
  const prefs = {
    PREF_INVALID: types.invalid,
    PREF_STRING: types.string,
    PREF_INT: types.int,
    PREF_BOOL: types.bool,
    getPrefType: property => userValues.get(property)?.type ?? types.invalid,
    getStringPref: property => read(property, types.string),
    getIntPref: property => read(property, types.int),
    getBoolPref: property => read(property, types.bool),
    setStringPref: (property, value) => write(property, value, types.string),
    setIntPref: (property, value) => write(property, value, types.int),
    setBoolPref: (property, value) => write(property, value, types.bool),
    clearUserPref(property) {
      userValues.delete(property);
      clears.push(property);
    },
    addObserver(branch, observer) {
      observers.add({ branch, observer });
    },
    removeObserver(branch, observer) {
      for (const entry of observers) {
        if (entry.branch === branch && entry.observer === observer) observers.delete(entry);
      }
    },
  };
  const host = { Services: { prefs }, console: { warn: warning => warnings.push(warning) } };

  return {
    host,
    warnings,
    writes,
    clears,
    observerCount: () => observers.size,
    set(property, value) {
      userValues.set(property, { type: typeFor(value), value });
    },
    setRaw(property, type, value) {
      userValues.set(property, { type, value });
    },
    get(property) {
      return userValues.get(property)?.value;
    },
    notify(property) {
      for (const { observer } of observers) observer.observe(null, "nsPref:changed", property);
    },
    types,
  };
}

export function makeEmptyFolderFixture({
  nested = false,
  withGrandparent = false,
  includeFreshEmpty = false,
  includeLiveEmpty = false,
  deleteError = null,
} = {}) {
  const eventTarget = new FakeEventTarget();
  const tabContainer = {};
  const deletedFolderIds = [];
  const errors = [];
  const pendingNativeDeletes = [];
  let observer = null;

  const placeholder = id => ({ id, zenEmptyTab: true });
  const realTab = { id: "real-tab", isTab: true };
  const makeDeletableFolder = (id, overrides = {}) => makeRegularFolder({
    id,
    allItems: [],
    async delete() {
      if (deleteError && this.id === "leaf") throw deleteError;
      deletedFolderIds.push(this.id);
      pendingNativeDeletes.push(this);
    },
    ...overrides,
  });
  const grandparent = nested && withGrandparent
    ? makeDeletableFolder("grandparent")
    : null;
  const root = nested ? makeDeletableFolder("root", { parentFolder: grandparent }) : null;
  const leaf = makeDeletableFolder("leaf", {
    parentFolder: root,
    allItems: [realTab, placeholder("leaf-placeholder")],
  });
  if (nested) {
    root.allItems = [leaf, placeholder("root-placeholder")];
  }
  if (grandparent) {
    grandparent.allItems = [root, placeholder("grandparent-placeholder")];
  }
  realTab.group = leaf;

  const freshEmpty = includeFreshEmpty ? makeRegularFolder({
    id: "fresh",
    allItems: [placeholder("fresh-placeholder")],
    async delete() { deletedFolderIds.push(this.id); },
  }) : null;
  const liveEmpty = includeLiveEmpty ? makeLiveFolder({
    id: "live",
    allItems: [placeholder("live-placeholder")],
    async delete() { deletedFolderIds.push(this.id); },
  }) : null;
  const populationRegistry = new FolderPopulationRegistry();
  let cleanupEnabled = true;
  const cleanupSubscribers = new Set();
  const adapters = {
    eventTarget: () => eventTarget,
    tabContainer: () => tabContainer,
    createMutationObserver: callback => (observer = new FakeMutationObserver(callback)),
    closeDepartureFolder: event => event.target?.group ?? null,
    ungroupDepartureFolder: event => event.target,
    getFolderAncestors: folder => {
      const ancestors = [];
      for (let current = folder?.parentFolder; current; current = current.parentFolder) {
        ancestors.push(current);
      }
      return ancestors;
    },
    realChildren: folder => folder.allItems.filter(item => item.zenEmptyTab !== true),
    deleteFolder: folder => folder.delete(),
    reportError: error => errors.push(error),
    preferences: {
      get: name => name === "deleteEmptyRegularFolders" ? cleanupEnabled : undefined,
      subscribe(name, callback) {
        if (name !== "deleteEmptyRegularFolders") return () => {};
        cleanupSubscribers.add(callback);
        return () => cleanupSubscribers.delete(callback);
      },
    },
  };
  const manager = new EmptyRegularFolderManager(adapters, populationRegistry);

  const flushReconciliation = async () => {
    for (let index = 0; index < 6; index++) await Promise.resolve();
  };
  const finishOneNativeDelete = () => {
    const folder = pendingNativeDeletes.shift();
    if (!folder) return false;
    const parent = folder.parentFolder;
    folder.isConnected = false;
    if (parent) parent.allItems = parent.allItems.filter(item => item !== folder);
    observer?.notify();
    return true;
  };

  return {
    adapters,
    deletedFolderIds,
    errors,
    eventTarget,
    freshEmpty,
    leaf,
    liveEmpty,
    manager,
    populationRegistry,
    realTab,
    root: root ?? leaf,
    grandparent,
    observer: () => observer,
    captureCloseOfLastChild() {
      eventTarget.emit("TabClose", { target: realTab, detail: {} });
    },
    finishNativeRemoval() {
      leaf.allItems = leaf.allItems.filter(item => item !== realTab);
      realTab.group = null;
      observer?.notify();
    },
    ungroupLastLeafChild() {
      eventTarget.emit("TabUngrouped", { target: leaf, detail: { tab: realTab } });
      this.finishNativeRemoval();
    },
    ungroupNestedLeafFolder() {
      eventTarget.emit("FolderUngrouped", { target: root, detail: leaf });
      root.allItems = root.allItems.filter(item => item !== leaf);
      leaf.parentFolder = null;
      observer?.notify();
    },
    notifyMutation() { observer?.notify(); },
    setCleanupEnabled(value) {
      cleanupEnabled = value;
      for (const callback of cleanupSubscribers) callback(value);
    },
    cleanupSubscriberCount: () => cleanupSubscribers.size,
    addLeafChild(id = "later-real-tab") {
      const tab = { id, isTab: true, group: leaf };
      leaf.allItems = [tab, ...leaf.allItems];
      return tab;
    },
    closeLeafChild(tab) {
      eventTarget.emit("TabClose", { target: tab, detail: {} });
      leaf.allItems = leaf.allItems.filter(item => item !== tab);
      tab.group = null;
      observer?.notify();
    },
    flushReconciliation,
    async flushAllMutations() {
      await flushReconciliation();
      while (finishOneNativeDelete()) await flushReconciliation();
    },
  };
}

export function makeMetadataSyncFixture({
  initiallyEligible = true,
  liveLeaf = false,
} = {}) {
  const eventTarget = new FakeEventTarget();
  const tabContainer = {};
  const values = new Map();
  const writes = [];
  const clears = [];
  const metadataTasks = new Map();
  let nextMetadataTaskId = 0;
  let scans = 0;
  let observer = null;
  const topLevelItems = [];
  const tabs = [];
  const liveState = {
    providerType: "rss",
    serializedState: JSON.stringify({ state: { interval: 900000, revision: 1 } }),
  };
  const dismissed = new Set();

  const root = makeRegularFolder({
    id: "root",
    name: "Root",
    workspaceId: "workspace-main",
    iconUrl: "chrome://root.svg",
    collapsed: false,
    saved: true,
    parentFolder: null,
  });
  const leaf = makeRegularFolder({
    id: "leaf",
    name: "Leaf",
    workspaceId: "workspace-main",
    iconUrl: "chrome://leaf.svg",
    collapsed: true,
    saved: false,
    parentFolder: root,
    isLiveFolder: liveLeaf,
  });
  const before = { id: "before" };
  const after = { id: "after" };
  const tab = {
    id: "tracked",
    group: initiallyEligible ? leaf : null,
    supported: true,
    presentation: {
      label: "Tracked tab",
      iconUrl: "https://example.test/tracked.svg",
      muted: false,
    },
    liveTabState: liveLeaf ? {
      itemId: "leaf:item-1",
      label: "Native sublabel",
    } : null,
  };
  tabs.push(tab);
  leaf.allItems = initiallyEligible ? [before, tab, after] : [before, after];
  root.allItems = [leaf];
  topLevelItems.push(root);

  const folderAncestors = folder => {
    const ancestors = [];
    for (let current = folder?.parentFolder; current; current = current.parentFolder) {
      ancestors.push(current);
    }
    return ancestors;
  };
  const adapters = {
    eventTarget: () => eventTarget,
    tabContainer: () => tabContainer,
    createMutationObserver: callback => (observer = new FakeMutationObserver(callback)),
    listTabs: () => {
      scans++;
      return [...tabs];
    },
    deferMetadataSynchronization: callback => {
      const id = ++nextMetadataTaskId;
      metadataTasks.set(id, callback);
      return () => metadataTasks.delete(id);
    },
    sessionStore: {
      getCustomTabValue: (current, key) => key === RESTORE_KEY ? values.get(current) ?? "" : "",
      setCustomTabValue: (current, key, value) => {
        if (key !== RESTORE_KEY) return;
        writes.push({ tab: current, value });
        values.set(current, value);
      },
    },
    clearRestoreValue(current) {
      clears.push(current);
      values.delete(current);
    },
    isSupportedTab: current => current?.supported === true,
    isEssential: current => current?.essential === true,
    isEmptyTab: item => item?.zenEmptyTab === true,
    isSupportedFolder: folder => folder?.isZenFolder === true,
    isSupportedSplitWrapper: () => false,
    isSessionRestoreCandidate: current => current?.sessionRestoring === true
      || current?.hasAttribute?.("pending") === true,
    getTabFolder: current => current?.group ?? null,
    getDirectItem: current => current,
    getDirectItems: folder => folder?.allItems ?? topLevelItems,
    getStableId: item => item?.id ?? null,
    getFolderAncestors: folderAncestors,
    getFolderData: folder => ({
      id: folder.id,
      workspaceId: folder.workspaceId,
      name: folder.name,
      iconUrl: folder.iconUrl,
      collapsed: folder.collapsed,
      saved: folder.saved,
      type: folder.isLiveFolder ? "live" : "regular",
    }),
    getLiveFolderState: folder => folder === leaf && liveLeaf ? { ...liveState } : null,
    getDismissed: folder => folder === leaf ? [...dismissed] : [],
    getTabPresentation: current => ({ ...current.presentation }),
    getLiveTabState: current => current.liveTabState === null
      ? null
      : { ...current.liveTabState },
    getSplit: () => null,
    providerValidators: {
      rss: serialized => {
        try { return typeof JSON.parse(serialized)?.state === "object"; } catch { return false; }
      },
    },
    reportError: () => {},
  };
  const manager = new FolderRestoreManager(adapters);
  const flush = async () => {
    for (let index = 0; index < 8; index++) await Promise.resolve();
  };

  return {
    adapters,
    after,
    before,
    clears,
    dismissed,
    eventTarget,
    leaf,
    liveState,
    manager,
    observer: () => observer,
    root,
    tab,
    tabs,
    topLevelItems,
    values,
    writes,
    flush,
    emit(type, target = tab) {
      eventTarget.emit(type, { type, target, detail: tab });
    },
    notifyMutation() { observer?.notify(); },
    emitLiveOption(key = "feedURL") {
      this.emit("command", {
        getAttribute(name) {
          if (name === "option-folder") return "leaf";
          if (name === "option-key") return key;
          return null;
        },
      });
    },
    emitDialogClosed() {
      this.emit("DOMModalDialogClosed", eventTarget);
    },
    pendingMetadataTasks() { return metadataTasks.size; },
    runNextMetadataTask() {
      const next = metadataTasks.entries().next();
      if (next.done) return false;
      const [id, callback] = next.value;
      metadataTasks.delete(id);
      callback();
      return true;
    },
    scanCount() { return scans; },
    groupTab(slot = 1) {
      tab.group = leaf;
      leaf.allItems = [before, after];
      leaf.allItems.splice(slot, 0, tab);
      this.emit("TabGrouped");
    },
    ungroupTab() {
      leaf.allItems = leaf.allItems.filter(item => item !== tab);
      tab.group = null;
      this.emit("TabUngrouped", leaf);
    },
    addOuterAncestor() {
      const outer = makeRegularFolder({
        id: "outer",
        name: "Outer",
        workspaceId: "workspace-main",
        iconUrl: null,
        collapsed: false,
        saved: true,
        parentFolder: null,
        allItems: [root],
      });
      root.parentFolder = outer;
      topLevelItems.splice(0, topLevelItems.length, outer);
      this.emit("FolderGrouped", outer);
      return outer;
    },
    record() {
      const raw = values.get(tab);
      return raw ? JSON.parse(raw) : null;
    },
    resetCalls() {
      writes.length = 0;
      clears.length = 0;
      scans = 0;
    },
  };
}

export function makeCollapsedFolderDragGuardFixture({
  folderACollapsed = true,
  folderAIsLive = false,
  hoverDelayMs = 500,
  recollapseDelayMs = 500,
} = {}) {
  const eventTarget = new FakeEventTarget();
  const dragStartTarget = new FakeEventTarget();
  const timers = new Map();
  const writes = [];
  const draggedTab = { id: "dragged-tab" };
  const committedFolders = [];
  let clock = 0;
  let timerSequence = 0;
  let lastExpand = null;
  let reenterOnCollapse = false;
  let reentrantExpands = 0;
  let configuredHoverDelayMs = hoverDelayMs;
  let configuredRecollapseDelayMs = recollapseDelayMs;

  const makeFolder = (id, collapsed, isLiveFolder = false) => ({
    id,
    isZenFolder: true,
    isLiveFolder,
    collapsed,
    items: [],
    selectedChild: null,
  });
  const folderA = makeFolder("folder-a", folderACollapsed, folderAIsLive);
  const folderB = makeFolder("folder-b", true, false);

  const makeEvent = (type, {
    folder = null,
    native = true,
    relatedFolder = null,
    dropEffect = "move",
    key = "Enter",
  } = {}) => ({
    type,
    key,
    nativeSource: native,
    target: folder ?? { closest: () => null },
    relatedTarget: relatedFolder,
    dataTransfer: {
      dropEffect,
      types: type === "dragstart"
        ? []
        : native ? ["application/x-moz-tabbrowser-tab"] : ["text/uri-list"],
      getData() { throw new Error("drag guard must not read payload values"); },
    },
    defaultPrevented: false,
    propagationStopped: false,
    immediatePropagationStopped: false,
    preventDefault() { this.defaultPrevented = true; },
    stopPropagation() { this.propagationStopped = true; },
    stopImmediatePropagation() {
      this.immediatePropagationStopped = true;
      this.propagationStopped = true;
    },
  });

  // Installed Zen populates TAB_DROP_TYPE in its tab-strip dragstart listener,
  // then calls stopPropagation(). Later listeners on that same node still run.
  dragStartTarget.addEventListener("dragstart", event => {
    event.dataTransfer.types = event.nativeSource
      ? ["application/x-moz-tabbrowser-tab"]
      : ["text/uri-list"];
    event.stopPropagation();
  });

  const dispatchExpand = folder => {
    const event = makeEvent("TabGroupExpand", { folder });
    eventTarget.emit("TabGroupExpand", event);
    lastExpand = event;
    return event;
  };

  const setFolderCollapsed = (folder, collapsed) => {
    writes.push({ folder, collapsed });
    if (collapsed === folder.collapsed) return;
    if (collapsed) {
      if (reenterOnCollapse) {
        reenterOnCollapse = false;
        reentrantExpands++;
        folder.collapsed = false;
        dispatchExpand(folder);
      }
      folder.collapsed = true;
      eventTarget.emit("TabGroupCollapse", makeEvent("TabGroupCollapse", { folder }));
      return;
    }
    folder.collapsed = false;
    dispatchExpand(folder);
  };

  const runDueTimers = target => {
    while (true) {
      const due = [...timers.entries()]
        .filter(([, timer]) => timer.due <= target)
        .sort((left, right) => left[1].due - right[1].due || left[0] - right[0])[0];
      if (!due) break;
      const [id, timer] = due;
      timers.delete(id);
      clock = timer.due;
      timer.callback();
    }
    clock = target;
  };

  const adapters = {
    eventTarget: () => eventTarget,
    dragStartTarget: () => dragStartTarget,
    isNativeTabDrag: event =>
      Array.from(event.dataTransfer?.types ?? [])
        .includes("application/x-moz-tabbrowser-tab"),
    getTargetFolder: event => event.target?.isZenFolder ? event.target : null,
    getRelatedTargetFolder: event =>
      event.relatedTarget?.isZenFolder ? event.relatedTarget : null,
    isZenFolder: folder => folder?.isZenFolder === true,
    isFolderCollapsed: folder => folder?.collapsed === true,
    setFolderCollapsed,
    getHoverDelayMs: () => configuredHoverDelayMs,
    getRecollapseDelayMs: () => configuredRecollapseDelayMs,
    getParentFolder: folder => folder?.parentFolder ?? null,
    getDraggedItems: () => [draggedTab],
    isItemInFolder(item, folder) {
      return folder.items.includes(item) || folder.items.some(child =>
        child.isZenFolder && this.isItemInFolder(item, child)
      );
    },
    commitDragExpansion: folder => committedFolders.push(folder),
    setTimer(callback, delay) {
      const id = ++timerSequence;
      timers.set(id, { callback, due: clock + delay });
      return id;
    },
    clearTimer: id => timers.delete(id),
    defer(callback) {
      const id = ++timerSequence;
      timers.set(id, { callback, due: clock });
      return () => timers.delete(id);
    },
  };

  return {
    adapters,
    eventTarget,
    dragStartTarget,
    folderA,
    folderB,
    draggedTab,
    committedFolders,
    nestFolderB() {
      folderB.parentFolder = folderA;
      folderA.items.push(folderB);
    },
    manualCollapse(folder) {
      folder.collapsed = true;
      eventTarget.emit("TabGroupCollapse", makeEvent("TabGroupCollapse", { folder }));
    },
    emit(type, overrides = {}) {
      const event = makeEvent(type, overrides);
      (type === "dragstart" ? dragStartTarget : eventTarget).emit(type, event);
      return event;
    },
    nativeExpand(folder) {
      folder.collapsed = false;
      return dispatchExpand(folder);
    },
    nativeGroupDrop(folder) {
      folder.items.push(draggedTab);
      folder.selectedChild = draggedTab;
      return folder.collapsed ? this.nativeExpand(folder) : null;
    },
    advance(milliseconds) {
      runDueTimers(clock + milliseconds);
    },
    flushDeferred() {
      runDueTimers(clock);
    },
    pendingTimerCount: () => timers.size,
    lastExpandEvent: () => lastExpand,
    reenterExpandOnNextRecollapse() { reenterOnCollapse = true; },
    reentrantExpandCount: () => reentrantExpands,
    writesFor: folder => writes.filter(write => write.folder === folder),
    collapseWrites: folder => writes.filter(write =>
      write.folder === folder && write.collapsed === true
    ).length,
    setHoverDelayMs: value => { configuredHoverDelayMs = value; },
    setRecollapseDelayMs: value => { configuredRecollapseDelayMs = value; },
    listenerCapture: type => (type === "dragstart" ? dragStartTarget : eventTarget)
      .listenerCapture(type),
  };
}

export function makeFolderButtonFixture(overrides = {}) {
  const row = new FakeElement("hbox");
  const root = new FakeElement("window");
  root.setAttribute("another-mod-attribute", "keep");
  const resetButton = new FakeElement("toolbarbutton");
  resetButton.setAttribute("class", "tab-reset-button");
  row.appendChild(resetButton);
  const folder = makeRegularFolder({ row });
  const additionalFolders = Array.from(
    { length: Math.max(0, (overrides.regularFolderCount ?? 1) - 1) },
    (_, index) => {
      const additionalRow = new FakeElement("hbox");
      const additionalResetButton = new FakeElement("toolbarbutton");
      additionalResetButton.setAttribute("class", "tab-reset-button");
      additionalRow.appendChild(additionalResetButton);
      return makeRegularFolder({ id: `folder-${index + 2}`, row: additionalRow });
    },
  );
  const folders = [folder, ...additionalFolders];
  const tabContainer = new FakeElement("tabs");
  const preferenceValues = new Map([
    ["newTabButtonVisibility", overrides.newTabButtonVisibility ?? "hover"],
  ]);
  const preferenceSubscribers = new Map();
  let observer;
  let eligibilityListener;
  let eligibilityStops = 0;
  let rowToggles = 0;
  row.addEventListener("click", () => rowToggles++);

  const adapters = {
    listFolders: () => folders,
    getFolderRow: current => current.row,
    root: () => root,
    createToolbarButton: () => new FakeElement("toolbarbutton"),
    tabContainer: () => tabContainer,
    createMutationObserver: callback => (observer = new FakeMutationObserver(callback)),
    newTabTransaction: overrides.newTabTransaction ?? null,
    preferences: {
      get: name => preferenceValues.get(name),
      subscribe(name, callback) {
        const subscribers = preferenceSubscribers.get(name) ?? new Set();
        subscribers.add(callback);
        preferenceSubscribers.set(name, subscribers);
        return () => subscribers.delete(callback);
      },
    },
    observeEligibilityChanges: callback => {
      eligibilityListener = callback;
      return () => eligibilityStops++;
    },
  };

  return {
    folder,
    folders,
    row,
    root,
    resetButton,
    tabContainer,
    adapters,
    manager: new FolderButtonManager(adapters),
    observer: () => observer,
    notifyEligibilityChange: () => eligibilityListener(folder),
    setVisibility(value) {
      preferenceValues.set("newTabButtonVisibility", value);
      for (const callback of preferenceSubscribers.get("newTabButtonVisibility") ?? []) callback(value);
    },
    visibilitySubscriberCount: () => preferenceSubscribers.get("newTabButtonVisibility")?.size ?? 0,
    eligibilityStops: () => eligibilityStops,
    rowToggleCount: () => rowToggles,
    ownedButtons: () => row.querySelectorAll('[data-better-zen-folders-owned="true"]'),
    ownedButtonsFor: current => current.row.querySelectorAll('[data-better-zen-folders-owned="true"]'),
  };
}

export function makePositionedNewTabFixture(position = "bottom") {
  const placeholder = { id: "empty", zenEmptyTab: true };
  const alpha = { id: "alpha" };
  const beta = { id: "beta" };
  const folder = makeRegularFolder({ allItems: [placeholder, alpha, beta] });
  folder.groupContainer = {
    insertBefore(item, target) {
      const currentIndex = folder.allItems.indexOf(item);
      if (currentIndex >= 0) folder.allItems.splice(currentIndex, 1);
      const targetIndex = target === null ? -1 : folder.allItems.indexOf(target);
      folder.allItems.splice(targetIndex < 0 ? folder.allItems.length : targetIndex, 0, item);
    },
  };
  const preferences = {
    position,
    get(name) { return name === "newTabPosition" ? this.position : undefined; },
  };
  let handoff;
  const tab = { id: "new", isBlankNewTab: true };
  const tx = makeNewTabTransaction({
    tab,
    onHandoff: current => { handoff = current; },
    adapters: {
      preferences,
      getDirectItems: current => current.allItems,
      isEmptyTab: item => item.zenEmptyTab === true,
      insertDirectItem: (current, item, target) => current.groupContainer.insertBefore(item, target),
    },
  });

  return {
    tx,
    folder,
    preferences,
    resolve: tabToResolve => handoff.resolve(tabToResolve),
    visibleIds: () => folder.allItems.filter(item => item.zenEmptyTab !== true).map(item => item.id),
  };
}

export function makeRecordingNewTabTransaction() {
  const activations = [];
  return {
    activations,
    activate(folder) {
      activations.push(folder);
      return Promise.resolve(true);
    },
  };
}

export function makeNewTabTransaction(overrides = {}) {
  const state = {
    errors: [],
    handoffCancelled: false,
    pinnedTabs: [],
    removedTabs: [],
    selectedTabs: [],
    tab: overrides.tab ?? { isBlankNewTab: true },
  };
  let activeHandoff = null;
  const armNextTabOpen = () => {
    let settled = false;
    let resolvePromise;
    const promise = new Promise(resolve => { resolvePromise = resolve; });
    const finish = tab => {
      if (settled) return;
      settled = true;
      resolvePromise(tab);
    };
    const disarm = overrides.armTabOpen?.(tab => finish(tab)) ?? null;
    const handoff = {
      promise,
      resolve: (tab = state.tab) => finish(tab),
      cancel: () => {
        state.handoffCancelled = true;
        disarm?.();
        finish(null);
      },
    };
    activeHandoff = handoff;
    overrides.onHandoff?.(handoff);
    return handoff;
  };
  const adapters = {
    isFolderInCurrentWindow: folder => folder.inCurrentWindow,
    isFolderInActiveWorkspace: folder => folder.inActiveWorkspace,
    getFolderAncestors: folder => {
      const ancestors = [];
      for (let current = folder.parentFolder; current; current = current.parentFolder) {
        ancestors.push(current);
      }
      return ancestors;
    },
    armNextTabOpen,
    handleNewTab: (...args) => {
      const result = overrides.handleNewTab?.(...args) ?? true;
      if (result && overrides.armTabOpen) activeHandoff?.resolve(state.tab);
      return result;
    },
    pinTab: tab => state.pinnedTabs.push(tab),
    selectTab: tab => state.selectedTabs.push(tab),
    isBlankNewTab: tab => tab.isBlankNewTab === true,
    removeTab: tab => state.removedTabs.push(tab),
    reportError: error => state.errors.push(error),
    ...overrides.adapters,
  };

  const tx = new NewTabInFolderTransaction(adapters);
  tx.state = state;
  return tx;
}

export function makeCollapsedNewTabFixture() {
  const ancestors = [
    makeRegularFolder({ id: "ancestor-1", collapsed: false }),
    makeRegularFolder({ id: "ancestor-2", collapsed: true }),
  ];
  ancestors[0].parentFolder = ancestors[1];
  const folder = makeRegularFolder({ id: "leaf", collapsed: true, parentFolder: ancestors[0] });
  let emitTabOpen = () => {};
  const tx = makeNewTabTransaction({
    onHandoff: handoff => { emitTabOpen = () => handoff.resolve(); },
  });
  const originalAddTabs = folder.addTabs;
  folder.addTabs = function(tabs) {
    this.collapsed = false;
    ancestors[0].collapsed = true;
    ancestors[1].collapsed = false;
    return originalAddTabs.call(this, tabs);
  };

  return { tx, folder, ancestors, emitTabOpen: () => emitTabOpen() };
}

export function makeBrowserNewTabHost(overrides = {}) {
  const tabContainer = new FakeEventTarget();
  const windowTarget = new FakeEventTarget();
  const timers = new Map();
  let nextTimerId = 0;
  const handleNewTabCalls = [];
  const state = { pinnedTabs: [], removedTabs: [], selectedTab: null, errors: [] };
  const host = {
    MutationObserver: FakeMutationObserver,
    setTimeout(callback) {
      const id = ++nextTimerId;
      timers.set(id, callback);
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    gBrowser: {
      tabContainer,
      pinTab(tab) { state.pinnedTabs.push(tab); },
      removeTab(tab) { state.removedTabs.push(tab); },
      get selectedTab() { return state.selectedTab; },
      set selectedTab(tab) { state.selectedTab = tab; },
    },
    gURLBar: {
      hasAttribute: name => name === "zen-newtab" && dialogueOpen,
    },
    gZenUIManager: {
      _urlbarSessionCounter: 0,
      _urlbarOwner: null,
      _isOwner(id) { return this._urlbarOwner === id; },
      matchesCloseToken(token, event) {
        return typeof token?.id === "number" && token.id === event.detail?.closeSeq;
      },
      handleNewTab(...args) {
        const closeToken = args[4] ?? {};
        closeToken.id = ++this._urlbarSessionCounter;
        this._urlbarOwner = closeToken.id;
        dialogueOpen = true;
        handleNewTabCalls.push(args);
        return fixture.handleNewTab(...args);
      },
    },
    gZenWorkspaces: {
      activeWorkspace: overrides.activeWorkspace ?? "workspace-active",
      getActiveWorkspace: () => overrides.activeWorkspaceRecord ?? { uuid: "workspace-active" },
    },
    console: { error: error => state.errors.push(error) },
    addEventListener: (...args) => windowTarget.addEventListener(...args),
    removeEventListener: (...args) => windowTarget.removeEventListener(...args),
    listenerCount: type => windowTarget.listenerCount(type),
  };
  let dialogueOpen = overrides.dialogueOpen ?? false;
  const selectedTabEmpty = overrides.selectedTabEmpty ?? true;
  const tab = {
    documentGlobal: host,
    isEmpty: selectedTabEmpty,
    linkedBrowser: { currentURI: { spec: selectedTabEmpty ? "about:newtab" : "https://existing.test/" } },
  };
  state.selectedTab = tab;
  const folder = makeRegularFolder({
    ownerGlobal: host,
    getAttribute: name => name === "zen-workspace-id"
      ? (overrides.folderWorkspace ?? "workspace-active")
      : null,
  });
  const fixture = {
    host,
    tab,
    folder,
    state,
    tabContainer,
    handleNewTabCalls,
    handleNewTab: () => true,
    selectedTab: () => state.selectedTab,
    folderTabs: () => folder.allItems,
    emitTabOpen: (openedTab = tab) => {
      tabContainer.emit("TabOpen", { target: openedTab });
      return openedTab;
    },
    navigateSelectedTab: spec => {
      state.selectedTab.isEmpty = false;
      state.selectedTab.linkedBrowser.currentURI.spec = spec;
    },
    navigateSelectedTabURIOnly: spec => {
      state.selectedTab.linkedBrowser.currentURI.spec = spec;
    },
    selectExistingTab: () => {
      const existingTab = {
        documentGlobal: host,
        isEmpty: false,
        linkedBrowser: { currentURI: { spec: "https://existing.test/" } },
      };
      state.selectedTab = existingTab;
      return existingTab;
    },
    emitZenURLBarClosed: (detail = {}) => {
      dialogueOpen = false;
      windowTarget.emit("ZenURLBarClosed", {
        target: host, detail: {closeSeq: host.gZenUIManager._urlbarOwner, ...detail},
      });
      host.gZenUIManager._urlbarOwner = null;
    },
    runTimers: () => {
      for (const [id, callback] of [...timers]) {
        timers.delete(id);
        callback();
      }
    },
  };
  fixture.transaction = new NewTabInFolderTransaction(
    createBrowserNewTabTransactionAdapters(host, tabContainer),
  );
  return fixture;
}

export function makeBrowserHost(href, calls) {
  const unloadListeners = [];
  const windowListeners = [];
  const mutationObservers = [];
  const preferenceFixture = makePreferenceFixture();
  const tabContainer = new FakeElement("tabs");
  class BrowserMutationObserver extends FakeMutationObserver {
    constructor(callback) {
      super(callback);
      mutationObservers.push(this);
    }
  }
  const document = {
    documentElement: new FakeElement("window"),
    querySelectorAll(selector) {
      calls.push(`query:${selector}`);
      return [];
    },
    createXULElement: localName => new FakeElement(localName),
  };

  return {
    host: {
      location: { href },
      document,
      gBrowser: { tabContainer },
      Services: preferenceFixture.host.Services,
      MutationObserver: BrowserMutationObserver,
      AbortController,
      addUnloadListener(listener) {
        unloadListeners.push(listener);
      },
      addEventListener(type, listener, options) {
        windowListeners.push({ type, listener, options });
      },
      removeEventListener(type, listener, options) {
        const index = windowListeners.findIndex(entry =>
          entry.type === type && entry.listener === listener && entry.options === options
        );
        if (index >= 0) windowListeners.splice(index, 1);
      },
    },
    unloadListeners,
    windowListeners,
    mutationObservers,
    preferenceFixture,
  };
}
