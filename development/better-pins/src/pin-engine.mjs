// Attributed BZF transaction component. See docs/pin-engine-provenance.json.
const STICKY_TAB_KEY="betterZenFolders.stickyTab.v1";
const RESTORE_KEY="betterZenFolders.restore.v1";

function browserFolderAncestors(folder) {
  const ancestors = [];
  const visited = new Set([folder]);
  let current = folder.parentFolder ?? folder.parentNode?.closest?.("zen-folder") ?? null;
  while (current && !visited.has(current)) {
    ancestors.push(current);
    visited.add(current);
    current = current.parentFolder ?? current.parentNode?.closest?.("zen-folder") ?? null;
  }
  return ancestors;
}


function browserSynchronizedWindows(host) {
  const windows = [];
  const seen = new Set();
  const syncOwner = host.gZenWindowSync;
  let candidates = [host];
  try {
    const enumerator = host.Services?.wm?.getEnumerator?.("navigator:browser");
    if (enumerator) candidates = Array.from(enumerator);
  } catch {}
  if (!candidates.includes(host)) candidates.unshift(host);
  for (const candidate of candidates) {
    if (!candidate || seen.has(candidate) || candidate.closed === true) continue;
    const isCurrent = candidate === host;
    const isSynchronized = syncOwner && candidate.gZenWindowSync === syncOwner
      && candidate.__SSi && !candidate.gZenWorkspaces?.privateWindowOrDisabled;
    if (!isCurrent && !isSynchronized) continue;
    seen.add(candidate);
    windows.push(candidate);
  }
  return windows;
}


export function isRegularFolder(folder) {
  return Boolean(folder?.isZenFolder && !folder?.isLiveFolder);
}


const isPlainObject=v=>!!v&&typeof v==="object"&&!Array.isArray(v)&&(Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null);
const hasOnlyFields=(v,keys)=>Object.keys(v).every(k=>keys.includes(k));
const isNonEmptyString=v=>typeof v==="string"&&v.length>0;

export function isValidUrlPinRecovery(value) {
  if (!isPlainObject(value) || !hasOnlyFields(value, ["explicit", "baseline"])
      || typeof value.explicit !== "boolean") return false;
  if (!value.explicit) return value.baseline === null;
  const baseline = value.baseline;
  return isPlainObject(baseline) && hasOnlyFields(baseline, ["entry", "image"])
    && isPlainObject(baseline.entry) && hasOnlyFields(baseline.entry, ["url", "title"])
    && isNonEmptyString(baseline.entry.url)
    && (baseline.entry.title === undefined || typeof baseline.entry.title === "string")
    && (baseline.image === undefined || baseline.image === null || typeof baseline.image === "string");
}


export const FOLDER_PIN_INTENT_KEY = "better-zen-folders.url-pin.v1";
const folderPinDuplicates = new WeakSet();

/** No cache or external persistence: SessionStore controls private-session and
 * undo lifetimes. Missing, invalid and explicitly ordinary are different states.
 * Read errors propagate so callers cannot migrate an inaccessible record. */
export class FolderPinIntentStore {
  constructor(adapters) { this.adapters = adapters; }

  read(tab) {
    const id = this.adapters.getId(tab);
    if (typeof id !== "string" || !id.length) return {status: "invalid"};
    const raw = this.adapters.getTabValue(tab, FOLDER_PIN_INTENT_KEY);
    if (raw === "" || raw === null || raw === undefined) return {status: "missing"};
    let value;
    try { value = JSON.parse(raw); } catch { return {status: "invalid"}; }
    if (!value || value.schema !== 1 || value.tabId !== id
        || typeof value.explicit !== "boolean") return {status: "invalid"};
    return {status: "known", tabId: id, explicit: value.explicit};
  }

  write(tab, explicit) {
    if (typeof explicit !== "boolean") throw new TypeError("URL pin intent must be boolean");
    const tabId = this.adapters.getId(tab);
    if (typeof tabId !== "string" || !tabId.length) {
      throw new TypeError("URL pin intent requires a stable native identity");
    }
    const targets = [...new Set(this.adapters.getIntentTargets?.(tab) ?? [tab])];
    if (!targets.includes(tab) || targets.some(item => this.adapters.getId(item) !== tabId)) {
      throw new Error("URL pin identity changed before write");
    }
    const previous = targets.map(item => ({tab: item,
      raw: this.adapters.getTabValue(item, FOLDER_PIN_INTENT_KEY) ?? ""}));
    const raw = JSON.stringify({schema: 1, tabId, explicit});
    const attempted = [];
    try {
      for (const entry of previous) {
        attempted.push(entry);
        this.adapters.setTabValue(entry.tab, FOLDER_PIN_INTENT_KEY, raw);
      }
      for (const item of targets) {
        const saved = this.read(item);
        if (saved.status !== "known" || saved.tabId !== tabId || saved.explicit !== explicit) {
          throw new Error("Unable to verify saved URL pin intent");
        }
      }
      const current = [...new Set(this.adapters.getIntentTargets?.(tab) ?? [tab])];
      if (current.length !== targets.length || current.some(item => !targets.includes(item))) {
        throw new Error("URL pin mirror membership changed during write");
      }
      try { this.adapters.notifyIntentChanged?.(tab); }
      catch (error) { this.adapters.reportError?.(error); }
      return {status: "known", tabId, explicit};
    } catch (cause) {
      const failures = [];
      for (const entry of attempted.reverse()) {
        try {
          if (this.adapters.getId(entry.tab) !== tabId) throw new Error("URL pin identity changed during rollback");
          const current = this.adapters.getTabValue(entry.tab, FOLDER_PIN_INTENT_KEY) ?? "";
          if (current === entry.raw) continue;
          if (current !== raw) throw new Error("URL pin rollback no longer owns the record");
          this.adapters.setTabValue(entry.tab, FOLDER_PIN_INTENT_KEY, entry.raw);
          if ((this.adapters.getTabValue(entry.tab, FOLDER_PIN_INTENT_KEY) ?? "") !== entry.raw) {
            throw new Error("Unable to verify URL pin rollback");
          }
        } catch (rollback) { failures.push(rollback); }
      }
      if (failures.length) throw new AggregateError([cause, ...failures], `URL pin rollback failed: ${cause.message}`);
      throw cause;
    }
  }
}

/** The caller supplies a verified transaction origin, never guesses from the
 * final native pinned flag. null means defer/reject, not an ordinary default. */
export function resolveFolderPinIntent(record, {
  origin, settled = true, pinNew = false, incomingExplicit,
} = {}) {
  if (!settled) return null;
  if (origin === "duplicate") return false;
  if (record?.status === "known") return record.explicit;
  if (record?.status !== "missing") return null;
  if (origin === "new") return pinNew === true;
  if (origin === "legacy") return false;
  if (origin === "move" && typeof incomingExplicit === "boolean") return incomingExplicit;
  return null;
}

/** A grace period delays the actual write. Cancellation never repins the
 * current page or changes the previously saved destination. */
export class FolderPinUnpinGrace {
  constructor(adapters, store, policy, onChange = () => {}, onSettled = () => {}) {
    Object.assign(this, {adapters, store, policy, onChange, onSettled});
    this.pending = new Map();
    this.active = true;
  }
  cancel(tab) {
    const token = this.pending.get(tab);
    if (!token) return false;
    this.pending.delete(tab);
    this.adapters.clearTimer(token.timer);
    this.onChange(tab);
    if (this.active) this.onSettled({ok:true,reason:'cancelled'});
    return true;
  }
  async toggle(tab, delayMs = 0) {
    if (!this.active) return {ok: false, reason: "cancelled"};
    if (this.cancel(tab)) return {ok: true, reason: "cancelled"};
    const reason = this.policy.blocked(tab);
    if (reason) return {ok: false, reason};
    const record = this.store.read(tab);
    if (record.status !== "known" || !record.explicit) return {ok: false, reason: "not-url-pinned"};
    if (!Number.isFinite(delayMs) || delayMs <= 0) {
      const result = await this.policy.unpin(tab);
      if (this.active) this.onChange(tab);
      return result;
    }
    const a = this.adapters;
    const token = {id: a.getId(tab), location: a.getLocation(tab), baseline: a.captureBaseline(tab)};
    this.pending.set(tab, token);
    token.timer = a.setTimer(async () => {
      if (!this.active || this.pending.get(tab) !== token) return;
      this.pending.delete(tab);
      let result = {ok:true,reason:'cancelled'};
      try {
        if (!a.isConnected(tab) || a.getId(tab) !== token.id || a.getLocation(tab) !== token.location
            || !a.ownsBaseline(tab, token.baseline) || this.policy.blocked(tab)) return;
        const current = this.store.read(tab);
        if (current.status === "known" && current.explicit) result = await this.policy.unpin(tab);
      } catch (error) { a.reportError?.(error);result = {ok:false,reason:'failed'}; }
      finally { if (this.active) { this.onChange(tab);this.onSettled(result); } }
    }, delayMs);
    this.onChange(tab);
    return {ok: true, reason: "pending"};
  }
  destroy() {
    this.active = false;
    for (const tab of [...this.pending.keys()]) this.cancel(tab);
  }
}

/** Origin tokens are captured before native structural pinning and consumed
 * only at the verified end of that operation, never from final DOM flags. */
export class FolderPinLifecycle {
  constructor(adapters, store, policy) {
    this.adapters = adapters; this.store = store; this.policy = policy;
    this.active = false; this.generation = 0;
  }
  start() { this.active = true; }
  destroy() { this.active = false; this.generation++; }
  begin(tab, origin) {
    const a = this.adapters, record = this.store.read(tab), scope = a.classify(tab);
    return {tab, origin, id: a.getId(tab), generation: this.generation, record, scope,
      location: a.getLocation(tab), incomingExplicit: scope === "root" ? a.isNativePinned(tab) : undefined,
      baseline: a.getSavedBaseline(tab), done: false};
  }
  async settle(token, {settled = true, pinNew = false} = {}) {
    const a = this.adapters, tab = token?.tab;
    if (!token || !this.active || token.generation !== this.generation || a.getId(tab) !== token.id
        || !a.isConnected(tab)) return {ok: false, reason: "cancelled"};
    if (!settled) return {ok: false, reason: "unsettled"};
    if (token.done) return token.promise ?? token.result;
    if (a.coordinator?.uncertain.has(token.id)) return {ok:false,reason:'state-uncertain'};
    const held = a.coordinator?.locks.get(token.id);
    if (held) {
      if (!held.released) return {ok:false,reason:'busy'};
      const destination = a.getLocation(tab);
      await held.released;
      if (a.getLocation(tab) !== destination) return {ok:false,reason:'cancelled'};
      // Re-run every identity, intent, baseline and lifecycle check after the
      // command relinquishes ownership. Never lose an already completed move.
      return this.settle(token,{settled,pinNew});
    }
    if (a.getStartupResetEnabled() !== false || a.isRestorationReady() !== true) {
      return {ok: false, reason: "not-ready"};
    }
    const scope = a.classify(tab);
    if (!["root", "regular-folder"].includes(scope)) return {ok: false, reason: "unsupported"};
    const current = this.store.read(tab);
    // A later deliberate choice wins over an old movement/default token.
    if (token.origin !== "duplicate" && (current.status !== token.record.status
        || current.explicit !== token.record.explicit)) return {ok: false, reason: "changed-intent"};
    const explicit = resolveFolderPinIntent(token.record, {origin: token.origin, settled,
      pinNew, incomingExplicit: token.incomingExplicit});
    if (explicit === null) return {ok: false, reason: "unknown-intent"};
    // A new root tab is not a folder creation. Its native placement semantics
    // remain outside this feature; defaults cannot follow it indefinitely.
    if (scope === "root" && token.scope !== "regular-folder" && token.origin !== "duplicate") {
      return {ok: true, reason: "native-root"};
    }
    const baseline = a.getSavedBaseline(tab);
    if (explicit && token.origin !== "new" && baseline !== null && baseline !== undefined
        && JSON.stringify(baseline) !== JSON.stringify(token.baseline)) {
      return {ok: false, reason: "changed-baseline"};
    }
    token.done = true;
    const pinNewTab = explicit && token.origin === 'new' && token.record.status === 'missing';
    const lock = {}, previousBaseline = a.captureBaseline?.(tab);
    let changedBaseline = false, writtenBaseline;
    if (!pinNewTab) a.coordinator?.locks.set(token.id,lock);
    try {
      if (token.origin === "duplicate") {
        this.store.write(tab, false);
        a.clearDuplicateState(tab);
      } else if (pinNewTab) {
        this.store.write(tab, false);
        token.promise = this.policy.pin(tab);
        token.result = await token.promise;
        return token.result;
      } else {
        if (explicit && !isValidUrlPinRecovery({explicit: true, baseline: token.baseline})) {
          throw new Error("Moved explicit pin has no saved baseline");
        }
        // Restoring before a root pin prevents Zen from inventing a new reset
        // destination. Ordinary export may delete that obsolete native state.
        if (explicit) { writtenBaseline = a.setSavedBaseline(tab, token.baseline);changedBaseline = true; }
        this.store.write(tab, explicit);
        if (scope === "root") a.setRootPlacement(tab, explicit);
      }
      token.result = {ok: true};
    } catch (error) {
      if (changedBaseline && a.restoreBaseline && !a.restoreBaseline(tab,previousBaseline,writtenBaseline)) {
        a.reportError(new Error('Movement baseline rollback no longer owns the saved address'));
      }
      a.reportError(error);
      a.coordinator?.uncertain.add(token.id);
      token.result = {ok: false, reason: "failed"};
    } finally {
      if (a.coordinator?.locks.get(token.id) === lock) a.coordinator.locks.delete(token.id);
    }
    return token.result;
  }
}

/** Instance-owned origin hooks; wrappers retain native synchronous return types.
 * Duplicate provenance survives until SessionStore has restored chrome state. */
export class FolderPinOriginHooks {
  constructor(host, lifecycle, adapters, preferences) {
    Object.assign(this, {host, lifecycle, adapters, preferences});
    this.active = false; this.generation = 0; this.owned = [];
    this.transactions = new WeakMap(); this.duplicates = new Set();
    this.folders = new WeakSet(); this.pending = new Set(); this.creationOrigin = null;
    this.onRestore = event => {
      if (!this.active || !this.duplicates.has(event.target)) return;
      this.duplicates.delete(event.target);
      this.finish(this.lifecycle.begin(event.target, "duplicate"));
      // Other capture listeners in this dispatch must still know this is not
      // undo, even when native SessionStore copied the source's restore record.
      Promise.resolve().then(() => folderPinDuplicates.delete(event.target));
    };
    this.onAbort = () => this.destroy();
    this.onClose = event => { this.duplicates.delete(event.target);folderPinDuplicates.delete(event.target); };
  }
  wrap(owner, name, route) {
    const original = owner?.[name];
    if (typeof original !== "function") return;
    const descriptor = Object.getOwnPropertyDescriptor(owner, name), hooks = this, generation = this.generation;
    const wrapper = function(...args) {
      const native = () => Reflect.apply(original, this, args);
      return hooks.active && hooks.generation === generation ? route(args, native) : native();
    };
    Object.defineProperty(owner, name, {value: wrapper, writable: true, configurable: true,
      enumerable: descriptor?.enumerable ?? true});
    this.owned.push({owner, name, descriptor, wrapper});
  }
  members(items) {
    return [...new Set(Array.from(items ?? []).flatMap(item => item?.localName === "tab" ? [item]
      : Array.from(item?.tabs ?? item?.group?.tabs ?? [])))].filter(tab =>
      tab && !tab.hasAttribute?.("zen-empty-tab") && !tab.hasAttribute?.("zen-essential"));
  }
  finish(token, options = {pinNew: this.preferences?.get?.("pinNewFolderTabUrls") === true}) {
    const task = this.lifecycle.settle(token, options)
      .then(result => {
        if (!result.ok && !["unknown-intent", "unsupported", "cancelled"].includes(result.reason)) {
          this.adapters.reportError(new Error(`URL pin transition failed: ${result.reason}`));
        }
        return result;
      }).catch(error => { this.adapters.reportError(error); return {ok: false, reason: "failed"}; });
    this.pending.add(task);void task.finally(() => this.pending.delete(task));
    return task;
  }
  async flush() { while (this.pending.size) await Promise.all([...this.pending]); }
  adopt(source, native) {
    const owner = source?.ownerDocument?.defaultView?.__betterPinsController;
    const origin = owner?.adapters, record = owner?.store?.read(source);
    if (!owner?.origins?.active || record?.status !== 'known'
        || !['root','regular-folder'].includes(origin.classify(source))) return native();
    if (origin.coordinator?.locks.has(record.tabId) || origin.coordinator?.uncertain.has(record.tabId)) {
      this.adapters.reportError(new Error('Window move refused while URL pin state is busy or uncertain'));
      return null;
    }
    // Clone data into this window's realm; strict recovery validation correctly
    // rejects objects whose prototypes belong to another window.
    const saved = JSON.parse(JSON.stringify({explicit:record.explicit,
      baseline:record.explicit ? origin.getSavedBaseline(source) : null}));
    const sourceRaw = origin.getTabValue(source,FOLDER_PIN_INTENT_KEY) ?? '';
    if (!isValidUrlPinRecovery(saved)) {
      this.adapters.reportError(new Error('Window move refused: saved URL is not recoverable'));return null;
    }
    const previous = this.creationOrigin;this.creationOrigin = 'adoption';
    let tab;
    try { tab = native(); } finally { this.creationOrigin = previous; }
    if (!tab) return tab;
    const generation = this.generation, id = this.adapters.getId(tab);
    const raw = this.adapters.getTabValue(tab,FOLDER_PIN_INTENT_KEY) ?? '';
    // Native drop can finish placing this returned tab later in the same
    // stack. Bind the transferred record only after that synchronous handoff.
    const task = Promise.resolve().then(() => {
      const a = this.adapters;
      if (!this.active || generation !== this.generation || a.getId(tab) !== id || !a.isConnected(tab)) return;
      if (raw && raw !== sourceRaw) throw new Error('Window move found conflicting destination intent');
      if ((a.getTabValue(tab,FOLDER_PIN_INTENT_KEY) ?? '') !== raw) throw new Error('Window move intent changed before handoff');
      const undo = new FolderPinRecovery(a,this.lifecycle.store).apply(tab,saved,{allowRoot:true});
      try { if (a.classify(tab) === 'root') a.setRootPlacement(tab,saved.explicit); }
      catch (error) { try { undo(); } catch (rollback) { a.reportError(rollback); }throw error; }
    }).catch(error => { this.adapters.coordinator?.uncertain.add(id);this.adapters.reportError(error); });
    this.pending.add(task);void task.finally(()=>this.pending.delete(task));
    return tab;
  }
  placeCreatedTab(tab, origin, operation) {
    if (!this.active) return operation();
    if (origin !== "new") return this.transaction([tab], "move", operation);
    const previous = this.creationOrigin;
    this.creationOrigin = "new";
    try {
      const value = operation();
      this.finishCreation(tab);
      return value;
    } finally { this.creationOrigin = previous; }
  }
  finishCreation(tab) {
    const generation = this.generation;
    const location = this.adapters.getLocation(tab);
    const pinNew = this.adapters.creationPinDefault(tab);
    const task = (async () => {
      if (this.adapters.waitForCreation && !await this.adapters.waitForCreation(tab, this.controller.signal, pinNew)) return;
      if (this.active && this.generation === generation && this.adapters.getLocation(tab) === location) {
        return this.finish(this.lifecycle.begin(tab, "new"), {pinNew});
      }
    })().catch(error => this.adapters.reportError(error));
    this.pending.add(task);void task.finally(() => this.pending.delete(task));
  }
  transaction(items, origin, native) {
    const actualOrigin = this.creationOrigin ?? origin;
    if (["new", "restore", "duplicate-pending", "adoption"].includes(actualOrigin)) return native();
    const tokens = [];
    for (const tab of this.members(items)) {
      if (this.transactions.has(tab) || this.duplicates.has(tab)) continue;
      const token = this.lifecycle.begin(tab, actualOrigin);
      this.transactions.set(tab, token);tokens.push(token);
    }
    const complete = success => {
      for (const token of tokens) {
        if (this.transactions.get(token.tab) !== token) continue;
        this.transactions.delete(token.tab);
        if (success && this.active) this.finish(token);
        // A root-to-root native drag may really be a Pin action. Defer its
        // automatic capture until placement is known, never discard it merely
        // because it travelled through the drop wrapper.
        if (this.active && token.nativeCapture && this.adapters.classify(token.tab) === 'root'
            && this.adapters.isNativePinned(token.tab) && !this.adapters.getSavedBaseline(token.tab)) {
          void Promise.resolve(token.nativeCapture()).catch(error => this.adapters.reportError(error));
        }
      }
    };
    try {
      const result = native();
      if (result?.then) return result.then(value => { complete(true);return value; }, error => { complete(false);throw error; });
      complete(true);return result;
    } catch (error) { complete(false);throw error; }
  }
  register(folder) {
    if (!isRegularFolder(folder) || this.folders.has(folder)) return;
    this.folders.add(folder);
    this.wrap(folder, "addTabs", ([tabs], native) => this.transaction(tabs, "move", native));
  }
  start(signal) {
    if (this.active || signal?.aborted) return;
    this.active = true;
    this.controller = new (this.host.AbortController ?? AbortController)();
    const browser = this.host.gBrowser, folders = this.host.gZenFolders;
    this.wrap(this.host.gZenWindowSync, 'setPinnedTabState', ([tab], native) => {
      const scope = this.adapters.classify(tab);
      if (scope === 'regular-folder') return Promise.resolve();
      if (scope === 'root' && this.creationOrigin === 'adoption') return Promise.resolve();
      const token = this.transactions.get(tab);
      if (scope === 'root' && token) {
        token.nativeCapture ??= native;
        return Promise.resolve();
      }
      return native();
    });
    this.wrap(folders, "_createFolderNode", (args, native) => { const folder = native();this.register(folder);return folder; });
    for (const folder of this.host.document.querySelectorAll("zen-folder")) this.register(folder);
    this.wrap(folders, "createFolder", ([tabs], native) => this.transaction(tabs, "move", native));
    this.wrap(folders, "on_TabOpen", ([event], native) => this.transaction([event.target], this.creationOrigin ?? "restore", native));
    this.wrap(browser, "addTab", ([url, options = {}], native) => {
      const previous = this.creationOrigin;
      this.creationOrigin ??= options.skipLoad || options.insertTab === false ? "restore" : "new";
      try {
        const tab = native();
        // TabOpen precedes Zen's identity assignment and initial load. The
        // exact tab returned by genuine addTab is the verified handoff.
        if (tab && this.creationOrigin === "new" && this.adapters.classify(tab) === "regular-folder") {
          this.finishCreation(tab);
        }
        return tab;
      } finally { this.creationOrigin = previous; }
    });
    this.wrap(browser, "duplicateTab", (args, native) => {
      const previous = this.creationOrigin;this.creationOrigin = "duplicate-pending";
      try { const tab = native();if (tab) { this.duplicates.add(tab);folderPinDuplicates.add(tab); }return tab; }
      finally { this.creationOrigin = previous; }
    });
    this.wrap(browser,'adoptTab',([source],native)=>this.adopt(source,native));
    for (const [name, explicit] of [["pinTab",true],["unpinTab",false]]) {
      this.wrap(browser,name,([tab],native)=>{
        const ownsChoice = !this.creationOrigin && !this.transactions.has(tab) && !this.duplicates.has(tab)
          && this.adapters.classify(tab) === 'root' && this.lifecycle.store.read(tab).status === 'known'
          && this.adapters.isNativePinned(tab) !== explicit;
        const result = native();
        if (ownsChoice && this.adapters.classify(tab) === 'root' && this.adapters.isNativePinned(tab) === explicit) {
          try { this.lifecycle.store.write(tab,explicit); }
          catch (error) { this.adapters.coordinator?.uncertain.add(this.adapters.getId(tab));this.adapters.reportError(error); }
        }
        return result;
      });
    }
    for (const name of ["moveTabToExistingGroup", "moveSplitViewToExistingGroup", "ungroupTab", "moveTabTo", "zenHandleTabMove"]) {
      this.wrap(browser, name, ([item], native) => this.transaction([item], "move", native));
    }
    for (const name of ['moveTabForward','moveTabBackward','moveTabToStart','moveTabToEnd']) {
      this.wrap(browser,name,(args,native)=>this.transaction([browser.selectedTab?.splitview ?? browser.selectedTab],'move',native));
    }
    this.wrap(this.host.gZenWorkspaces, 'moveTabsToWorkspace', ([tabs], native) =>
      this.transaction(this.members(tabs).flatMap(tab => tab.group?.hasAttribute?.('split-view-group')
        ? Array.from(tab.group.tabs) : [tab]), 'move', native));
    const drag = browser?.tabContainer?.tabDragAndDrop;
    this.wrap(drag, "handle_drop", ([event], native) => {
      let source;
      try { source = event?.dataTransfer?.mozGetDataAt?.("application/x-moz-tabbrowser-tab", 0); } catch {}
      return this.transaction(source?._dragData?.movingTabs ?? (source ? [source] : []), "move", native);
    });
    this.host.addEventListener("SSTabRestoring", this.onRestore, true);
    this.host.addEventListener("TabClose", this.onClose, true);
    this.signal = signal;signal?.addEventListener("abort", this.onAbort, {once: true});
  }
  destroy() {
    this.active = false;this.generation++;
    this.controller?.abort();
    this.signal?.removeEventListener("abort", this.onAbort);this.signal = null;
    this.host.removeEventListener("SSTabRestoring", this.onRestore, true);
    this.host.removeEventListener("TabClose", this.onClose, true);
    for (const tab of this.duplicates) folderPinDuplicates.delete(tab);
    for (const {owner, name, descriptor, wrapper} of this.owned.reverse()) {
      if (owner[name] !== wrapper) continue;
      if (descriptor) Object.defineProperty(owner, name, descriptor);else delete owner[name];
    }
    this.owned = [];this.folders = new WeakSet();this.duplicates.clear();this.transactions = new WeakMap();
  }
}

/** Undo evidence is independent of placement and of the currently enabled UI.
 * Restores only verified records, never infers intent from a structural pin. */
export class FolderPinRecovery {
  constructor(adapters, store) { this.adapters = adapters; this.store = store; }

  capture(tab) {
    const scope = this.adapters.classifyForRecovery?.(tab) ?? this.adapters.classify(tab);
    if (scope !== "regular-folder") return null;
    const intent = this.store.read(tab);
    if (intent.status !== "known") return null;
    const value = {explicit: intent.explicit,
      baseline: intent.explicit ? JSON.parse(JSON.stringify(tab._zenPinnedInitialState ?? null)) : null};
    if (!isValidUrlPinRecovery(value)) throw new Error("Explicit pin has no recoverable baseline");
    return value;
  }

  apply(tab, value, {allowRoot = false} = {}) {
    const scope = this.adapters.classify(tab);
    if (!isValidUrlPinRecovery(value) || (scope !== "regular-folder" && !(allowRoot && scope === 'root'))) {
      throw new Error("Invalid or unsupported URL pin recovery");
    }
    const a = this.adapters, id = a.getId(tab), token = {};
    if (a.coordinator.locks.has(id)) throw new Error("URL pin recovery is busy");
    a.coordinator.locks.set(id, token);
    let before, records, after;
    try {
      before = a.captureBaseline(tab);
      records = a.getIntentTargets(tab).map(item => ({tab: item, id: a.getId(item),
        raw: a.getTabValue(item, FOLDER_PIN_INTENT_KEY) ?? ""}));
      after = value.explicit ? a.setSavedBaseline(tab, value.baseline) : before;
      this.store.write(tab, value.explicit);
    } catch (cause) {
      if (after && after !== before && !a.restoreBaseline(tab, before, after)) {
        a.coordinator.uncertain.add(id);
        throw new AggregateError([cause], "URL pin recovery baseline rollback failed");
      }
      if (cause instanceof AggregateError) a.coordinator.uncertain.add(id);
      throw cause;
    } finally {
      if (a.coordinator.locks.get(id) === token) a.coordinator.locks.delete(id);
    }
    const written = JSON.stringify({schema: 1, tabId: id, explicit: value.explicit});
    let undone = false;
    return () => {
      if (undone) return;
      const current = a.getIntentTargets(tab);
      if (a.coordinator.locks.has(id) || !a.ownsBaseline(tab, after)
          || current.length !== records.length || records.some(entry => !current.includes(entry.tab)
            || a.getId(entry.tab) !== entry.id || a.getTabValue(entry.tab, FOLDER_PIN_INTENT_KEY) !== written)) {
        throw new Error("URL pin recovery rollback no longer owns state (later owner)");
      }
      // All ownership checked before restoring any part of the transaction.
      try {
        if (!a.restoreBaseline(tab, before, after)) throw new Error("URL pin recovery baseline rollback refused");
        for (const entry of records) {
          a.setTabValue(entry.tab, FOLDER_PIN_INTENT_KEY, entry.raw);
          if ((a.getTabValue(entry.tab, FOLDER_PIN_INTENT_KEY) ?? "") !== entry.raw) {
            throw new Error("URL pin recovery intent rollback refused");
          }
        }
        undone = true;
      } catch (error) { a.coordinator.uncertain.add(id); throw error; }
    };
  }
}

/** Semantic commands only. Native event interception/presentation own their
 * lifecycle separately. No command silently changes Zen's startup preference. */
export class FolderPinPolicy {
  constructor(adapters, store) {
    this.adapters = adapters;
    this.store = store;
    this.active = false;
    this.generation = 0;
    this.busy = new Set();
    this.uncertain = new WeakSet();
    this.coordinator = adapters.coordinator ?? {locks: new Map(), uncertain: new Set()};
    this.onAbort = () => this.destroy();
  }

  start(signal) {
    if (this.active || signal?.aborted) return;
    this.active = true;
    this.signal = signal;
    signal?.addEventListener("abort", this.onAbort, {once: true});
  }

  destroy() {
    this.active = false;
    this.generation++;
    this.signal?.removeEventListener("abort", this.onAbort);
    this.signal = null;
    // In-flight transactions retain their locks until their finally block.
  }

  blocked(tab) {
    if (!this.active) return "inactive";
    if (this.adapters.getStartupResetEnabled() !== false) return "startup-reset-enabled";
    if (this.adapters.isRestorationReady() !== true) return "restoring";
    if (this.adapters.classify(tab) !== "regular-folder") return "unsupported";
    const nativeBlock = this.adapters.getCommandBlockReason?.(tab);
    if (nativeBlock) return nativeBlock;
    if (this.uncertain.has(tab) || this.coordinator.uncertain.has(this.adapters.getId(tab))) return "uncertain-state";
    if (this.store.read(tab).status !== "known") return "unknown-intent";
    return null;
  }

  async run(tabs, action) {
    const targets = [...new Set(tabs)];
    if (!targets.length) return {ok: false, reason: "no-tabs"};
    const ids = targets.map(tab => this.adapters.getId(tab));
    let release;
    const lock = {released:new Promise(resolve=>{release=resolve;})};
    if (targets.some(tab => this.busy.has(tab)) || ids.some(id => this.coordinator.locks.has(id))) {
      return {ok: false, reason: "busy"};
    }
    try {
      for (const tab of targets) {
        const reason = this.blocked(tab);
        if (reason) return {ok: false, reason};
      }
      for (const tab of targets) this.busy.add(tab);
      for (const id of ids) this.coordinator.locks.set(id, lock);
      return await action(targets);
    } catch (error) {
      if (error instanceof AggregateError) {
        for (const tab of targets) this.markUncertain(tab);
      }
      this.adapters.reportError(error);
      return {ok: false, reason: "failed"};
    } finally {
      for (const tab of targets) this.busy.delete(tab);
      for (const id of ids) if (this.coordinator.locks.get(id) === lock) this.coordinator.locks.delete(id);
      release();
    }
  }

  markUncertain(tab) {
    this.uncertain.add(tab);
    this.coordinator.uncertain.add(this.adapters.getId(tab));
  }

  pin(tab) { return this.changeBaseline(tab, "pin"); }
  update(tab) { return this.changeBaseline(tab, "update"); }
  edit(tab) { return this.changeBaseline(tab, "edit"); }

  changeBaseline(tab, mode) {
    return this.run([tab], async () => {
      const explicit = this.store.read(tab).explicit;
      if (mode === "pin" && explicit) return {ok: true};
      if (mode !== "pin" && !explicit) return {ok: false, reason: "not-url-pinned"};
      const token = {generation: this.generation, id: this.adapters.getId(tab),
        location: this.adapters.getLocation(tab)};
      const stillCurrent = () => this.generation === token.generation && !this.blocked(tab)
        && this.store.read(tab).explicit === explicit
        && this.adapters.getId(tab) === token.id && this.adapters.getLocation(tab) === token.location;
      let url;
      if (mode === "edit") {
        url = await this.adapters.promptBaselineUrl(tab);
        if (url === null || !stillCurrent()) return {ok: false, reason: "cancelled"};
      }
      const previous = this.adapters.captureBaseline(tab);
      let next;
      const rollback = () => {
        try {
          // A concurrent explicit choice may now own this same baseline. Even
          // equal bytes do not authorise us to undo that choice.
          if (this.adapters.getId(tab) === token.id
              && this.store.read(tab).explicit === explicit
              && this.adapters.restoreBaseline(tab, previous, next) === true) return true;
        } catch (error) { this.adapters.reportError(error); }
        this.markUncertain(tab);
        return false;
      };
      try {
        next = mode === "edit" ? await this.adapters.setUrlAsBaseline(tab, url)
          : await this.adapters.setCurrentAsBaseline(tab);
        if (!stillCurrent() || this.adapters.ownsBaseline(tab, next) !== true) {
          if (!rollback()) return {ok: false, reason: "rollback-failed"};
          return {ok: false, reason: "cancelled"};
        }
        this.store.write(tab, true);
        return {ok: true};
      } catch (error) {
        // Adapters must roll back their own incomplete capture if they reject
        // before returning the new baseline; policy owns the completed capture.
        if (next !== undefined && !rollback()) {
          this.adapters.reportError(error);
          return {ok: false, reason: "rollback-failed"};
        }
        if (error instanceof AggregateError) this.markUncertain(tab);
        throw error;
      }
    });
  }

  unpin(tab) {
    return this.run([tab], () => {
      this.store.write(tab, false);
      return {ok: true};
    });
  }

  reset(tab) {
    return this.run([tab], async () => {
      if (!this.store.read(tab).explicit) return {ok: false, reason: "not-url-pinned"};
      await this.adapters.resetToBaseline(tab);
      return {ok: true};
    });
  }

  close(tabs, event) {
    return this.run(tabs, async targets => (await this.adapters.closeTabs(targets, event)) === true
      ? {ok: true} : {ok: false, reason: "refused"});
  }

  unload(tabs) {
    return this.run(tabs, async targets => (await this.adapters.unloadTabs(targets)) === true
      ? {ok: true} : {ok: false, reason: "refused"});
  }
}

/** Browser boundary for folder URL intent. Constructing it changes no tabs or
 * preferences. The controller must explicitly opt in after compatibility and
 * restoration gates; these adapters do not install native event hooks. */
export function createBrowserFolderPinAdapters(host, {flushTab} = {}) {
  const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
  const reportError = error => host.console?.error?.("Better Pins URL pins", error);
  const nativeReset = host.gZenPinnedTabManager?.resetPinnedTab;
  // Shared only with windows participating in the same native sync service.
  // No tab references, URLs or private data are retained by this coordinator.
  const coordinatorOwner = !host.gZenWorkspaces?.privateWindowOrDisabled && host.gZenWindowSync
    ? host.gZenWindowSync : host;
  const coordinatorKey = Symbol.for("better-zen-folders.url-pin-coordinator.v1");
  const coordinator = coordinatorOwner[coordinatorKey] ??= {locks: new Map(), uncertain: new Set()};
  let restorationReady = false;
  const startup = host.gZenStartup?.promiseInitialized;
  const workspaces = host.gZenWorkspaces?.promiseInitialized;
  // Native Zen never resolves pinned initialization in these window modes.
  // Skipping that promise alone would not make its sync-only baseline API safe.
  const unsupportedWindow = host.gZenWorkspaces?.privateWindowOrDisabled === true
    || host.gZenPinnedTabManager?.enabled === false;
  const ready = unsupportedWindow ? Promise.resolve(false) : Promise.all([startup, workspaces, host.SessionStore?.promiseAllWindowsRestored,
    host.gZenWorkspaces?.promisePinnedInitialized]).then(() => {
    restorationReady = Boolean(startup?.then && workspaces?.then && !host.closed);
    return restorationReady;
  }).catch(error => { reportError(error); return false; });
  const location = tab => tab?.closest?.("zen-folder") ?? null;
  const classifyInDocument = (tab, document, {allowClosing = false} = {}) => {
    if (!tab || !document || tab.ownerDocument !== document || tab.localName !== "tab"
        || !tab.isConnected || (!allowClosing && tab.closing) || tab.hasAttribute("zen-empty-tab")) return "unsupported";
    if (tab.hasAttribute("zen-essential")) return "essential";
    const folder = location(tab);
    if (!folder) return "regular-folder";
    if ([folder, ...browserFolderAncestors(folder)].some(item => item.isLiveFolder)) return "live";
    return isRegularFolder(folder) ? "regular-folder" : "unsupported";
  };
  const classify = (tab, options) => classifyInDocument(tab,host.document,options);
  // Migration may inspect a verified synchronized mirror, but command routing
  // must continue rejecting tabs owned by another document.
  const classifyIntentTarget = tab => {
    if (tab?.ownerDocument === host.document) return classify(tab);
    const owner = browserSynchronizedWindows(host).find(win=>win.document === tab?.ownerDocument
      && win.gZenWorkspaces?.allStoredTabs?.includes(tab));
    return owner ? classifyInDocument(tab,owner.document) : 'unsupported';
  };
  const mirrors = tab => {
    const found = new Set([tab]);
    if (host.gZenWorkspaces?.privateWindowOrDisabled) return [...found];
    for (const win of browserSynchronizedWindows(host)) {
      const other = win.gZenWorkspaces?.allStoredTabs?.find(item => item.id === tab.id);
      if (other) found.add(other);
    }
    return [...found];
  };
  const snapshot = tab => mirrors(tab).map(item => ({tab: item, id: item.id,
    owner: item._zenPinnedInitialState, value: clone(item._zenPinnedInitialState)}));
  const ownsBaseline = (tab, expected) => {
    const current = mirrors(tab);
    return current.length === expected.length && expected.every(entry =>
      current.includes(entry.tab) && entry.tab.id === entry.id
        && entry.tab.isConnected && entry.tab._zenPinnedInitialState === entry.owner);
  };
  const restoreBaseline = (tab, previous, expected) => {
    const current = mirrors(tab);
    if (previous.length !== expected.length || current.length !== expected.length
        || expected.some((entry, index) => entry.tab !== previous[index].tab
          || !current.includes(entry.tab) || entry.tab.id !== entry.id
          || !entry.tab.isConnected || entry.tab._zenPinnedInitialState !== entry.owner)) return false;
    for (const entry of previous) {
      if (entry.value === undefined) delete entry.tab._zenPinnedInitialState;
      else entry.tab._zenPinnedInitialState = clone(entry.value);
    }
    return true;
  };
  const getState = tab => JSON.parse(host.SessionStore.getTabState(tab));
  const commitBaseline = (tab, entry, image, previous = snapshot(tab)) => {
    try {
      host.gZenWindowSync.setPinnedInitialState(tab, entry, image);
      const next = snapshot(tab);
      if (next.length !== previous.length || next.some((item, index) =>
        item.tab !== previous[index].tab || item.owner?.entry !== entry)) {
        throw new Error("Unable to verify URL pin baseline");
      }
      return next;
    } catch (cause) {
      const partial = snapshot(tab);
      if (partial.length !== previous.length || partial.some((item, index) =>
        item.tab !== previous[index].tab || (item.owner !== previous[index].owner
          && item.owner?.entry !== entry)) || !restoreBaseline(tab, previous, partial)) {
        throw new AggregateError([cause], "URL pin baseline rollback failed");
      }
      throw cause;
    }
  };
  const adapters = {
    ready, classify, classifyIntentTarget, getLocation: location, reportError, coordinator, getIntentTargets: mirrors,
    notifyIntentChanged: tab => {
      for (const target of mirrors(tab)) {
        const owner = target.ownerDocument?.defaultView ?? host;
        if (owner.CustomEvent) target.dispatchEvent?.(new owner.CustomEvent('BetterZenFoldersUrlPinChanged',{bubbles:true}));
      }
    },
    classifyForRecovery: tab => classify(tab, {allowClosing: true}),
    getId: tab => tab?.id,
    waitForCreation: (tab, signal, waitForHistory = false) => new Promise(resolve => {
      let observer, completed = false, checking = false, recheck = false;
      const finish = value => { if (completed) return;completed = true;
        observer?.disconnect();host.gBrowser.removeTabsProgressListener?.(progress);
        host.removeEventListener("TabClose", close, true);
        signal?.removeEventListener("abort", abort);resolve(value); };
      const check = async () => {
        if (completed) return;
        if (checking) { recheck = true;return; }
        if (signal?.aborted || tab.closing || !tab.isConnected) finish(false);
        else if (tab.id) {
          if (!waitForHistory) return finish(true);
          checking = true;
          try {
            await host.gBrowser.TabStateFlusher.flush(tab.linkedBrowser);
            const state = getState(tab);
            if (!signal?.aborted && !tab.closing && state.entries?.[state.index - 1]?.url) finish(true);
          } catch (error) { reportError(error);finish(false); }
          finally { checking = false;if (recheck && !completed) { recheck = false;void check(); } }
        }
      };
      const progress = {
        onLocationChange: (browser, webProgress) => { if (browser === tab.linkedBrowser && webProgress.isTopLevel) void check(); },
        onStateChange: (browser, webProgress) => { if (browser === tab.linkedBrowser && webProgress.isTopLevel) void check(); },
      };
      const close = event => { if (event.target === tab) finish(false); };
      const abort = () => finish(false);
      observer = new host.MutationObserver(check);
      observer.observe(tab, {attributes: true, attributeFilter: ["id"]});
      if (waitForHistory) host.gBrowser.addTabsProgressListener(progress);
      host.addEventListener("TabClose", close, true);signal?.addEventListener("abort", abort, {once: true});check();
    }),
    isNativePinned: tab => tab?.pinned === true,
    isConnected: tab => tab?.isConnected === true && !tab.closing,
    getSavedBaseline: tab => clone(tab?._zenPinnedInitialState ?? null),
    setRootPlacement: (tab, pinned) => {
      if (location(tab)) throw new Error("Cannot export a tab before native movement completes");
      if (pinned !== tab.pinned) host.gBrowser[pinned ? "pinTab" : "unpinTab"](tab);
      if (pinned !== tab.pinned) throw new Error("Unable to verify exported tab placement");
    },
    clearDuplicateState: tab => {
      for (const other of mirrors(tab)) {
        delete other._zenPinnedInitialState;
        host.SessionStore.setCustomTabValue(other, STICKY_TAB_KEY, "");
        // A duplicate must not replay the source tab's undo snapshot.
        host.SessionStore.setCustomTabValue(other, RESTORE_KEY, "");
      }
    },
    getTabValue: (tab, key) => host.SessionStore.getCustomTabValue(tab, key),
    setTabValue: (tab, key, value) => host.SessionStore.setCustomTabValue(tab, key, value),
    getStartupResetEnabled: () => host.Services.prefs.getBoolPref(
      "zen.pinned-tab-manager.restore-pinned-tabs-to-pinned-url", false),
    isRestorationReady: () => restorationReady && !host.closed,
    captureBaseline: snapshot, restoreBaseline, ownsBaseline,
    setSavedBaseline: (tab, baseline) => {
      if (!isValidUrlPinRecovery({explicit: true, baseline})) throw new Error("Invalid saved URL baseline");
      return commitBaseline(tab, clone(baseline.entry), baseline.image);
    },
    getCommandBlockReason: tab => {
      const raw = adapters.getTabValue(tab, FOLDER_PIN_INTENT_KEY);
      return mirrors(tab).some(other => adapters.getTabValue(other, FOLDER_PIN_INTENT_KEY) !== raw)
        ? "conflicting-intent" : null;
    },
    promptBaselineUrl(tab) {
      const value = {value: tab._zenPinnedInitialState?.entry?.url ?? ""};
      return host.Services.prompt.prompt(host, "Edit Pinned URL",
        "Change the saved address only. Use Reset to Pinned URL to open it.",
        value, null, {value: false}) ? value.value : null;
    },
    setCurrentAsBaseline(tab) { return adapters.writeBaseline(tab); },
    setUrlAsBaseline(tab, input) {
      try {
        if (typeof input !== "string" || !input.trim()) throw new Error("Enter a valid URL");
        const uri = host.Services.uriFixup
          ? host.Services.uriFixup.getFixupURIInfo(input.trim(),
            host.Ci.nsIURIFixup.FIXUP_FLAG_FIX_SCHEME_TYPOS).preferredURI
          : host.Services.io.newURI(input.trim());
        // Editing a destination is not permission to execute script or target
        // privileged browser chrome. Normal navigable page schemes only.
        if (!uri || !["http", "https", "file", "about", "moz-extension", "ftp"].includes(uri.scheme)) {
          throw new Error("Unsupported pinned URL");
        }
        return adapters.writeBaseline(tab, uri.spec);
      } catch (error) { return Promise.reject(error); }
    },
    async writeBaseline(tab, editedUrl) {
      if (adapters.getCommandBlockReason(tab)) throw new Error("URL pin mirrors have conflicting intent");
      if (classify(tab) !== "regular-folder" || !adapters.isRestorationReady()
          || adapters.getStartupResetEnabled()) throw new Error("URL pin capture is not ready");
      const id = tab.id, folder = location(tab), previous = snapshot(tab);
      // Native setPinnedTabState mutates in finally(), even after a failed
      // flush. Flush ourselves and commit only after a successful read.
      if (editedUrl === undefined && !tab.hasAttribute("pending")) {
        if (flushTab) await flushTab(tab);
        else {
          await host.gBrowser.TabStateFlusher.flush(tab.linkedBrowser);
        }
      }
      const current = snapshot(tab);
      if (tab.id !== id || location(tab) !== folder || classify(tab) !== "regular-folder"
          || adapters.getStartupResetEnabled() || !adapters.isRestorationReady()
          || adapters.getCommandBlockReason(tab)
          || current.length !== previous.length || current.some((entry, index) =>
            entry.tab !== previous[index].tab || entry.owner !== previous[index].owner)) {
        throw new Error("URL pin capture changed while flushing");
      }
      const state = getState(tab), saved = editedUrl === undefined ? state.entries?.[state.index - 1]
        : {url: editedUrl, title: tab.zenStaticLabel ?? editedUrl};
      if (!saved || typeof saved.url !== "string" || !saved.url.length) {
        throw new Error("URL pin capture has no current history entry");
      }
      const entry = {url: saved.url, title: saved.title ?? tab.label ?? ""};
      return commitBaseline(tab, entry, editedUrl === undefined ? state.image : tab.zenStaticIcon, previous);
    },
    async resetToBaseline(tab) {
      const url = tab._zenPinnedInitialState?.entry?.url;
      if (!url || typeof nativeReset !== "function") throw new Error("No native pinned URL reset available");
      Reflect.apply(nativeReset, host.gZenPinnedTabManager, [tab]);
      const state = getState(tab);
      if (state.entries?.length !== 1 || state.entries[0]?.url !== url) {
        throw new Error("Unable to verify pinned URL reset");
      }
    },
    async closeTabs(tabs, event) {
      // Native removeTabs returns void. Keep permission prompts and SessionStore
      // undo intact, then inspect actual removal instead of trusting that return.
      host.gBrowser.removeTabs(tabs, {animate: true, triggeringEvent: event});
      return tabs.every(tab => tab.closing || !tab.isConnected);
    },
    async unloadTabs(tabs) {
      const accepted = await host.gBrowser.explicitUnloadTabs(tabs);
      return accepted === true && tabs.every(tab => tab.hasAttribute("pending"));
    },
  };
  return adapters;
}

/** Owned runtime entry points, separate from migration/presentation. Kept
 * uninstalled by bootstrap until the full capability contract is established. */
export class FolderPinNativeHooks {
  constructor(host, policy, adapters, onResult = () => {}) {
    this.host = host;
    this.policy = policy;
    this.adapters = adapters;
    this.onResult = onResult;
    this.active = false;
    this.generation = 0;
    this.owned = [];
    this.onAbort = () => this.destroy();
    this.onCommand = event => {
      if (!this.active || event.target !== this.host.document.getElementById("cmd_close")) return;
      const tab = this.host.gBrowser.selectedTab;
      if (!this.isFolder(tab)) return;
      this.consume(event);
      void this.complete(() => this.policy.close([tab], event));
    };
  }
  isFolder(tab) { return this.adapters.classify(tab) === "regular-folder"; }
  consume(event) {
    event?.preventDefault?.();
    if (event?.stopImmediatePropagation) event.stopImmediatePropagation();
    else event?.stopPropagation?.();
  }
  async complete(operation) {
    const generation = this.generation;
    const outcome = await operation();
    if (this.active && this.generation === generation) {
      try { this.onResult(outcome); } catch (error) { this.adapters.reportError(error); }
    }
    return outcome;
  }
  wrap(name, route) {
    const owner = this.host.gZenPinnedTabManager;
    const original = owner[name];
    if (typeof original !== "function") throw new Error(`Missing native pin entry: ${name}`);
    const descriptor = Object.getOwnPropertyDescriptor(owner, name);
    const hooks = this;
    const generation = this.generation;
    const wrapper = function(...args) {
      if (!hooks.active || hooks.generation !== generation) return Reflect.apply(original, this, args);
      return route(args, (...replacement) => Reflect.apply(original, this, replacement.length ? replacement : args));
    };
    Object.defineProperty(owner, name, {value: wrapper, writable: true, configurable: true,
      enumerable: descriptor?.enumerable ?? true});
    this.owned.push({owner, name, descriptor, wrapper});
  }
  start(signal) {
    if (this.active || signal?.aborted || !this.policy.active
        || this.adapters.getStartupResetEnabled() !== false
        || this.adapters.isRestorationReady() !== true) return;
    this.active = true;
    try {
      this.wrap("resetPinnedTab", ([tab], native) => {
        const target = tab ?? this.host.TabContextMenu?.contextTab;
        return this.isFolder(target) ? this.complete(() => this.policy.reset(target)) : native();
      });
      for (const [name, action] of [["editPinnedUrl", "edit"], ["replacePinnedUrlWithCurrent", "update"]]) {
        this.wrap(name, ([tab], native) => {
          const target = tab ?? this.host.TabContextMenu?.contextTab;
          return this.isFolder(target) ? this.complete(() => this.policy[action](target)) : native();
        });
      }
      this.wrap("onCloseTabShortcut", ([event, selected, options = {}], native) => {
        const selectedTabs = selected ?? this.host.gBrowser.selectedTab;
        const tabs = Array.isArray(selectedTabs) ? selectedTabs : [selectedTabs];
        if (!tabs.some(tab => this.isFolder(tab))) return native();
        this.consume(event);
        const folders = tabs.filter(tab => this.isFolder(tab)), roots = tabs.filter(tab => !this.isFolder(tab));
        if (roots.some(tab => this.adapters.classify(tab) !== 'root')) {
          return this.complete(() => ({ok:false,reason:'unsupported-mixed-targets'}));
        }
        const unload = options.alwaysUnload || options.folderToUnload || options.noClose;
        const generation = this.generation;
        return this.complete(async () => {
          const result = await (unload ? this.policy.unload(folders) : this.policy.close(folders,event));
          if (!result.ok || !roots.length) return result;
          if (!this.active || this.generation !== generation) return {ok:false,reason:'cancelled'};
          // Never pass folder constituents to native's split/reset expansion.
          if (roots.some(tab => this.adapters.classify(tab) !== 'root')) return {ok:false,reason:'changed-targets'};
          if (unload) return await this.adapters.unloadTabs(roots) === true ? {ok:true} : {ok:false,reason:'refused'};
          const ordinary = roots.filter(tab => this.adapters.isNativePinned?.(tab) === false);
          const pinned = roots.filter(tab => !ordinary.includes(tab));
          if (ordinary.length && await this.adapters.closeTabs(ordinary,event) !== true) return {ok:false,reason:'refused'};
          if (!this.active || this.generation !== generation) return {ok:false,reason:'cancelled'};
          if (pinned.length) await native(event,pinned,options);
          return {ok:true,reason:'native-targets-dispatched'};
        });
      });
      this.wrap("_onTabResetPinButton", ([event, tab], native) => {
        if (!this.isFolder(tab)) return native();
        this.consume(event);
        // Native Accel duplicates then resets through a private callback. Do not
        // let that path bypass intent; the duplicate lifecycle is a rollout gate.
        if (event?.getModifierState?.("Accel")) {
          return this.complete(() => ({ok: false, reason: "unsupported-modified-reset"}));
        }
        return this.complete(() => this.policy.reset(tab));
      });
      // Zen bound its original handler before Sine loaded. A method wrapper
      // alone cannot protect keyboard Close, so capture that command earlier.
      this.host.document.addEventListener("command", this.onCommand, true);
      this.signal = signal;
      signal?.addEventListener("abort", this.onAbort, {once: true});
    } catch (error) {
      this.destroy();
      this.adapters.reportError(error);
    }
  }
  destroy() {
    this.active = false;
    this.generation++;
    this.signal?.removeEventListener("abort", this.onAbort);
    this.signal = null;
    this.host.document.removeEventListener("command", this.onCommand, true);
    for (const {owner, name, descriptor, wrapper} of this.owned.reverse()) {
      if (owner[name] !== wrapper) continue;
      if (descriptor) Object.defineProperty(owner, name, descriptor);
      else delete owner[name];
    }
    this.owned = [];
  }
}

