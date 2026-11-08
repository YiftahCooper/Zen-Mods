// Context Menu Editor 0.2.3 — generated from src/entry.mjs.
// Run node build.mjs; native qualification is reported separately.
(() => {
  // project:src/model.mjs
  var READ_LIMITS = Object.freeze({ bytes: 1024 * 1024, records: 4e4 });
  var WRITE_LIMITS = Object.freeze({ bytes: 512 * 1024, records: 1e4 });
  var MAX_DEPTH = 64;
  var KINDS = /* @__PURE__ */ new Set(["command", "native-menu", "submenu", "separator"]);
  var CONTAINERS = /* @__PURE__ */ new Set(["native-menu", "submenu"]);
  var FORBIDDEN_KEYS = /* @__PURE__ */ new Set(["__proto__", "prototype", "constructor"]);
  var LIVE_FIELDS = /* @__PURE__ */ new Set(["label", "nativeId", "iconURL", "available", "boundary", "locked", "restriction", "dependencyGroup", "parentKey", "node", "source", "identity"]);
  var DEFAULT_OPTIONS = Object.freeze({
    enabled: true,
    showIcons: true,
    iconPack: "fluent",
    iconSize: 16,
    iconAlignment: "center",
    iconGap: 8,
    rowSpacing: 2,
    rounded: true,
    hoverShade: true,
    separatorOpacity: 0.5,
    monochromeExtensions: false,
    hideUnavailable: false,
    shiftBypass: true,
    showSeparators: true,
    preferCleanLinks: false
  });
  function fail(message) {
    throw new Error(message);
  }
  function object(value) {
    return value !== null && typeof value === "object" && !Array.isArray(value) && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
  }
  function validKey(key) {
    return typeof key === "string" && key.length > 0 && key.length <= 512 && !FORBIDDEN_KEYS.has(key) && !/[\u0000-\u001f\u007f]/u.test(key);
  }
  function keyCheck(key) {
    if (!validKey(key)) fail("Invalid menu item key.");
  }
  function bytes(value) {
    return new TextEncoder().encode(value).length;
  }
  function jsonCopy(value, seen = /* @__PURE__ */ new Set(), depth = 0) {
    if (depth > MAX_DEPTH + 12) fail("Settings hierarchy is too deep.");
    if (value === null || typeof value === "string" || typeof value === "boolean") return value;
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (!Array.isArray(value) && !object(value)) fail("Settings contain an invalid value.");
    if (seen.has(value)) fail("Settings contain a cycle.");
    seen.add(value);
    const result = Array.isArray(value) ? [] : {};
    for (const [key, child] of Object.entries(value)) {
      if (FORBIDDEN_KEYS.has(key)) fail("Settings contain an invalid key.");
      result[key] = jsonCopy(child, seen, depth + 1);
    }
    seen.delete(value);
    return result;
  }
  function boundedText(value, max, message) {
    if (typeof value !== "string" || value.length > max || !value.trim() || /[\u0000-\u001f\u007f]/u.test(value)) fail(message);
  }
  function validateIcon(icon) {
    if (!object(icon)) fail("Invalid icon choice.");
    if (icon.kind === "asset") {
      if (!["fluent", "zen"].includes(icon.pack) || typeof icon.id !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/u.test(icon.id)) fail("Invalid built-in icon choice.");
    } else if (icon.kind === "text") {
      boundedText(icon.text, 64, "Use a short text icon.");
    } else if (icon.kind === "image") {
      if (typeof icon.data !== "string" || icon.data.length > 8192 || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/u.test(icon.data)) fail("Use a normalized PNG icon.");
      let raw;
      try {
        raw = atob(icon.data.slice(22));
      } catch {
        fail("Invalid PNG icon.");
      }
      const signature = [137, 80, 78, 71, 13, 10, 26, 10];
      if (raw.length < 33 || signature.some((n, i) => raw.charCodeAt(i) !== n) || raw.slice(12, 16) !== "IHDR") fail("Invalid PNG icon.");
      const read32 = (offset) => raw.charCodeAt(offset) * 16777216 + (raw.charCodeAt(offset + 1) << 16) + (raw.charCodeAt(offset + 2) << 8) + raw.charCodeAt(offset + 3);
      if (read32(16) !== 32 || read32(20) !== 32) fail("Use a normalized 32 pixel PNG icon.");
    } else fail("Invalid icon choice.");
  }
  function createState() {
    return { version: 1, options: { ...DEFAULT_OPTIONS }, roots: {} };
  }
  function validateState(value, limits = READ_LIMITS) {
    if (!object(value) || value.version !== 1) fail("Unsupported settings version.");
    const state = jsonCopy(value);
    if (!object(state.options) || !object(state.roots)) fail("Invalid menu settings.");
    state.options = { ...DEFAULT_OPTIONS, ...state.options };
    for (const [key, defaultValue] of Object.entries(DEFAULT_OPTIONS)) {
      if (typeof defaultValue === "boolean" && typeof state.options[key] !== "boolean") fail("Invalid appearance option.");
    }
    for (const [key, min, max] of [["iconSize", 12, 24], ["iconGap", 0, 16], ["rowSpacing", 0, 8]]) {
      if (!Number.isInteger(state.options[key]) || state.options[key] < min || state.options[key] > max) fail("Icon size or spacing is outside its allowed range.");
    }
    if (!["left", "center", "right"].includes(state.options.iconAlignment)) fail("Invalid icon alignment.");
    if (!["fluent", "zen"].includes(state.options.iconPack)) fail("Invalid icon pack option.");
    if (typeof state.options.separatorOpacity !== "number" || state.options.separatorOpacity < 0 || state.options.separatorOpacity > 1) fail("Separator opacity must be between zero and one.");
    let count = 0;
    for (const [rootId, root] of Object.entries(state.roots)) {
      let visit = function(children, depth) {
        if (depth > MAX_DEPTH) fail("Menu hierarchy is too deep.");
        for (const key of children) {
          keyCheck(key);
          if (!Object.hasOwn(root.records, key)) fail("The hierarchy refers to a missing item.");
          if (active.has(key)) fail("Menu hierarchy contains a cycle.");
          if (placed.has(key)) fail("Each menu item must be placed only once.");
          placed.add(key);
          const record = root.records[key];
          if (CONTAINERS.has(record.kind)) {
            active.add(key);
            visit(record.children, depth + 1);
            active.delete(key);
          }
        }
      };
      keyCheck(rootId);
      if (!object(root) || !Array.isArray(root.children) || !object(root.records)) fail("Invalid menu hierarchy.");
      if ("hideUnavailable" in root && typeof root.hideUnavailable !== "boolean") fail("Invalid unavailable-command menu option.");
      if ("legacyHiddenIds" in root && (!Array.isArray(root.legacyHiddenIds) || root.legacyHiddenIds.length > 512 || new Set(root.legacyHiddenIds).size !== root.legacyHiddenIds.length || root.legacyHiddenIds.some((id2) => !validKey(id2) || !/^[a-zA-Z][a-zA-Z0-9_-]{0,127}$/u.test(id2)))) fail("Invalid legacy menu identities.");
      for (const [key, record] of Object.entries(root.records)) {
        keyCheck(key);
        if (++count > limits.records) fail("Too many saved menu items.");
        if (!object(record) || !KINDS.has(record.kind)) fail("Invalid menu item.");
        for (const field of LIVE_FIELDS) if (Object.hasOwn(record, field)) fail("Live menu details cannot be saved.");
        for (const field of ["hidden", "removed", "showIcon"]) if (typeof record[field] !== "boolean") fail("Invalid menu item option.");
        if ("iconOwner" in record && typeof record.iconOwner !== "boolean") fail("Invalid icon ownership.");
        if ("owned" in record && (record.kind !== "separator" || typeof record.owned !== "boolean")) fail("Invalid separator ownership.");
        if ("name" in record) boundedText(record.name, 256, "Use a short menu name.");
        if ("icon" in record) validateIcon(record.icon);
        if (CONTAINERS.has(record.kind)) {
          if (!Array.isArray(record.children)) fail("A submenu needs a child list.");
          if (record.kind === "submenu" && !record.name) fail("Give the submenu a name.");
        } else if ("children" in record) fail("Only submenus can contain menu items.");
      }
      const placed = /* @__PURE__ */ new Set();
      const active = /* @__PURE__ */ new Set();
      visit(root.children, 0);
      if (placed.size !== Object.keys(root.records).length) fail("Every saved item needs a hierarchy placement.");
    }
    if (bytes(JSON.stringify(state)) > limits.bytes) fail("Saved settings are too large.");
    return state;
  }
  function recordHasEdits(record) {
    if (!object(record)) return false;
    if (record.kind === "submenu" || record.kind === "separator" && record.owned) return true;
    if (record.hidden || record.removed || record.showIcon === false || record.iconOwner) return true;
    if ("name" in record || "icon" in record) return true;
    return Array.isArray(record.children) && record.children.length > 0;
  }
  function recordCount(state) {
    let count = 0;
    for (const root of Object.values(state.roots)) count += Object.keys(root.records).length;
    return count;
  }
  function withinWriteLimits(state) {
    return recordCount(state) <= WRITE_LIMITS.records && bytes(JSON.stringify(state)) <= WRITE_LIMITS.bytes;
  }
  function detach(root, key) {
    const { list } = location(root, key);
    list.splice(list.indexOf(key), 1);
    delete root.records[key];
  }
  function fitWriteLimits(value) {
    const state = validateState(value);
    if (withinWriteLimits(state)) return state;
    const candidates = [];
    for (const [rootId, root] of Object.entries(state.roots)) {
      for (const [key, record] of Object.entries(root.records)) {
        if (key.startsWith("mod:") && !recordHasEdits(record)) candidates.push([rootId, key]);
      }
    }
    const total = bytes(JSON.stringify(state)), count = recordCount(state);
    let index = 0;
    while (!withinWriteLimits(state)) {
      if (index >= candidates.length) fail("Saved settings are too large. Remove some custom icons or submenus.");
      const overBytes = bytes(JSON.stringify(state)) - WRITE_LIMITS.bytes;
      const overRecords = recordCount(state) - WRITE_LIMITS.records;
      const average = Math.max(1, total / Math.max(1, count));
      const batch = Math.max(1, overRecords, Math.ceil(overBytes / average));
      for (const end = Math.min(candidates.length, index + batch); index < end; index++) {
        const [rootId, key] = candidates[index];
        detach(state.roots[rootId], key);
      }
    }
    return validateState(state, WRITE_LIMITS);
  }
  function pruneUnsavedAbsentRows(state, saved, before, inventory) {
    const next = validateState(state);
    const moved = (rootId, key) => {
      const old = before?.roots?.[rootId];
      if (!old || !Object.hasOwn(old.records, key)) return false;
      const was = location(old, key), now = location(next.roots[rootId], key);
      if (was.parentKey !== now.parentKey) return true;
      const index = now.list.indexOf(key), oldIndex = was.list.indexOf(key);
      const previous = was.list[oldIndex - 1], following = was.list[oldIndex + 1];
      if (previous !== void 0 && now.list.includes(previous) && now.list.indexOf(previous) > index) return true;
      return following !== void 0 && now.list.includes(following) && now.list.indexOf(following) < index;
    };
    for (const { id: id2, items } of inventory || []) {
      const root = next.roots[id2];
      if (!root) continue;
      for (const item of items || []) {
        if (!item?.remembered || item.available !== false) continue;
        if (Object.hasOwn(saved?.roots?.[id2]?.records || {}, item.key)) continue;
        const record = root.records[item.key];
        if (!record || recordHasEdits(record)) continue;
        if (moved(id2, item.key)) continue;
        detach(root, item.key);
      }
    }
    return validateState(next);
  }
  function parseState(raw) {
    if (raw === null || raw === void 0 || raw === "") return createState();
    if (typeof raw !== "string") fail("Could not read saved settings.");
    if (bytes(raw) > READ_LIMITS.bytes) fail("Saved settings are too large.");
    let value;
    try {
      value = JSON.parse(raw);
    } catch {
      fail("Saved settings are not valid JSON.");
    }
    return validateState(value);
  }
  function serializeState(state) {
    return JSON.stringify(fitWriteLimits(state));
  }
  function editable(state, rootId) {
    const next = validateState(state);
    keyCheck(rootId);
    if (!Object.hasOwn(next.roots, rootId)) fail("This menu is not currently available.");
    return next;
  }
  function newRecord(kind) {
    return { kind, hidden: false, removed: false, showIcon: true, ...CONTAINERS.has(kind) ? { children: [] } : {} };
  }
  function descriptorsByKey(descriptors) {
    if (!Array.isArray(descriptors)) fail("Invalid menu inventory.");
    const counts = /* @__PURE__ */ new Map();
    for (const item of descriptors) {
      if (item?.dependencyGroup !== void 0 && !validKey(item.dependencyGroup)) fail("Invalid dependency group in menu inventory.");
      if (item && validKey(item.key)) counts.set(item.key, (counts.get(item.key) || 0) + 1);
    }
    const result = /* @__PURE__ */ new Map();
    for (const item of descriptors) if (item && counts.get(item.key) === 1 && ["command", "native-menu", "separator"].includes(item.kind) && (item.parentKey === null || validKey(item.parentKey))) result.set(item.key, item);
    let changed;
    do {
      changed = false;
      for (const [key, item] of result) if (item.parentKey !== null && (!result.has(item.parentKey) || result.get(item.parentKey).kind !== "native-menu")) {
        result.delete(key);
        changed = true;
      }
    } while (changed);
    return result;
  }
  function mergeInventory(state, rootId, descriptors) {
    const next = validateState(state);
    keyCheck(rootId);
    const items = descriptorsByKey(descriptors);
    const root = next.roots[rootId] ??= { children: [], records: {} };
    const added = [];
    for (const [key, item] of items) {
      if (Object.hasOwn(root.records, key)) {
        if (root.records[key].kind !== item.kind || root.records[key].owned) fail("A menu item identity conflicts with saved settings.");
      } else {
        root.records[key] = newRecord(item.kind);
        if (root.legacyHiddenIds?.includes(key)) {
          root.records[key].hidden = true;
          root.legacyHiddenIds = root.legacyHiddenIds.filter((id2) => id2 !== key);
          if (!root.legacyHiddenIds.length) delete root.legacyHiddenIds;
        }
        added.push(key);
      }
    }
    for (const key of added) {
      const parent = items.get(key).parentKey;
      (parent === null ? root.children : root.records[parent].children).push(key);
    }
    return validateState(next);
  }
  function location(root, key) {
    if (!Object.hasOwn(root.records, key)) fail("This item is not in the selected menu.");
    if (root.children.includes(key)) return { parentKey: null, list: root.children };
    for (const [parentKey, record] of Object.entries(root.records)) {
      if (CONTAINERS.has(record.kind) && record.children.includes(key)) return { parentKey, list: record.children };
    }
    fail("This item has no saved position.");
  }
  function childList(root, parentKey) {
    if (parentKey === null) return root.children;
    if (!Object.hasOwn(root.records, parentKey) || !CONTAINERS.has(root.records[parentKey].kind)) fail("Choose a valid parent submenu.");
    if (root.records[parentKey].removed) fail("Restore the parent submenu first.");
    return root.records[parentKey].children;
  }
  function insertionIndex(index, list) {
    if (index === void 0) return list.length;
    if (!Number.isInteger(index) || index < 0 || index > list.length) fail("Choose a valid insertion position.");
    return index;
  }
  function nativeBoundary(root, key) {
    let parentKey = location(root, key).parentKey;
    while (parentKey !== null) {
      if (root.records[parentKey].kind === "native-menu") return parentKey;
      parentKey = location(root, parentKey).parentKey;
    }
    return null;
  }
  function subtree(root, key) {
    const keys = [key];
    for (let i = 0; i < keys.length; i++) {
      const record = root.records[keys[i]];
      if (CONTAINERS.has(record.kind)) keys.push(...record.children);
    }
    return keys;
  }
  function validatePlacement(state, rootId, descriptors) {
    const next = validateState(state);
    keyCheck(rootId);
    const items = descriptorsByKey(descriptors);
    const root = next.roots[rootId];
    if (!root) return next;
    const groups = /* @__PURE__ */ new Map();
    for (const [key, descriptor] of items) {
      if (Object.hasOwn(root.records, key) && nativeBoundary(root, key) !== (descriptor.boundary ?? null)) {
        fail("Keep this item within its native owner submenu.");
      }
      if (descriptor.dependencyGroup !== void 0) {
        const members = groups.get(descriptor.dependencyGroup) ?? [];
        members.push(descriptor);
        groups.set(descriptor.dependencyGroup, members);
      }
    }
    for (const members of groups.values()) {
      if (members.length < 2) continue;
      const existing = members.filter((item) => Object.hasOwn(root.records, item.key));
      if (existing.length === 0) continue;
      if (existing.length !== members.length) fail("Refresh this menu before arranging its owner-managed group.");
      const first = location(root, members[0].key);
      const start = first.list.indexOf(members[0].key);
      for (let i = 0; i < members.length; i++) {
        const item = members[i];
        const current = location(root, item.key);
        if (current.parentKey !== first.parentKey || current.parentKey !== item.parentKey || current.list[start + i] !== item.key) {
          fail("Keep this owner-managed group together in its original order.");
        }
      }
    }
    return next;
  }
  function moveItem(state, rootId, key, parentKey, index, descriptors) {
    const next = editable(state, rootId);
    const root = next.roots[rootId];
    const old = location(root, key);
    const descendants = subtree(root, key);
    if (descendants.includes(parentKey)) fail("A submenu cannot be moved inside itself.");
    const target = childList(root, parentKey);
    const items = descriptorsByKey(descriptors);
    for (const child of descendants) {
      const record = root.records[child];
      if (record.kind === "submenu" || record.kind === "separator" && record.owned) continue;
      const descriptor = items.get(child);
      if (!descriptor) fail("This owner is not currently available. Open its menu before moving this item.");
      if (descriptor.locked) fail(descriptor.restriction || "This item cannot be moved until its adapter is ready.");
    }
    old.list.splice(old.list.indexOf(key), 1);
    target.splice(insertionIndex(index, target), 0, key);
    for (const child of descendants) {
      const descriptor = items.get(child);
      if (!descriptor) continue;
      if (nativeBoundary(root, child) !== (descriptor.boundary ?? null)) fail("Keep this item within its native owner submenu.");
    }
    return validatePlacement(next, rootId, descriptors);
  }
  function updateItem(state, rootId, key, patch) {
    const next = editable(state, rootId);
    const record = next.roots[rootId].records[key];
    if (!record) fail("This item is not in the selected menu.");
    if (!object(patch)) fail("Invalid item edit.");
    if ((Object.hasOwn(patch, "icon") || Object.hasOwn(patch, "showIcon")) && !Object.hasOwn(patch, "iconOwner")) delete record.iconOwner;
    for (const [field, value] of Object.entries(patch)) {
      if (!["name", "icon", "hidden", "removed", "showIcon", "iconOwner"].includes(field)) fail("This field cannot be edited.");
      if ((field === "name" || field === "icon") && value === null) delete record[field];
      else record[field] = jsonCopy(value);
    }
    return validateState(next);
  }
  function add(state, rootId, record, parentKey, index, key) {
    const next = validateState(state);
    keyCheck(rootId);
    keyCheck(key);
    const root = next.roots[rootId] ??= { children: [], records: {} };
    if (Object.hasOwn(root.records, key)) fail("This menu item key is already used.");
    const list = childList(root, parentKey);
    list.splice(insertionIndex(index, list), 0, key);
    root.records[key] = record;
    return validateState(next);
  }
  function addSubmenu(state, rootId, name, parentKey = null, index, key = `cme-menu-${crypto.randomUUID()}`) {
    return add(state, rootId, { ...newRecord("submenu"), name }, parentKey, index, key);
  }
  function addSeparator(state, rootId, parentKey = null, index, key = `cme-separator-${crypto.randomUUID()}`) {
    return add(state, rootId, { ...newRecord("separator"), owned: true }, parentKey, index, key);
  }
  function removeItem(state, rootId, key) {
    const next = editable(state, rootId);
    const root = next.roots[rootId];
    const { list } = location(root, key);
    const record = root.records[key];
    if (record.kind === "submenu" || record.kind === "separator" && record.owned) {
      list.splice(list.indexOf(key), 1, ...record.children ?? []);
      delete root.records[key];
    } else record.removed = true;
    return validateState(next);
  }
  function restoreItem(state, rootId, key) {
    return updateItem(state, rootId, key, { removed: false });
  }
  function resetRoot(state, rootId) {
    const next = validateState(state);
    keyCheck(rootId);
    delete next.roots[rootId];
    return validateState(next);
  }
  function flattenRoot(state, rootId) {
    const next = validateState(state);
    const root = next.roots[rootId];
    const rows = [];
    if (!root) return rows;
    function visit(children, parentKey, depth) {
      for (const key of children) {
        const record = root.records[key];
        rows.push({ key, record, parentKey, depth });
        if (CONTAINERS.has(record.kind)) visit(record.children, key, depth + 1);
      }
    }
    visit(root.children, null, 0);
    return rows;
  }
  function restoreOriginalOrder(state, rootId, descriptors) {
    const next = mergeInventory(state, rootId, descriptors);
    const root = next.roots[rootId];
    const items = descriptorsByKey(descriptors);
    const original = flattenRoot(next, rootId);
    root.children = [];
    for (const record of Object.values(root.records)) if (CONTAINERS.has(record.kind)) record.children = [];
    for (const [key, item] of items) {
      (item.parentKey === null ? root.children : root.records[item.parentKey].children).push(key);
    }
    for (const row of original) if (!items.has(row.key)) {
      const parent = row.parentKey;
      (parent === null ? root.children : root.records[parent].children).push(row.key);
    }
    return validateState(next);
  }

  // project:src/store.mjs
  var SETTINGS_PREF = "extension.context-menu-editor.settings";
  function deepFreeze(value) {
    if (value && typeof value === "object" && !Object.isFrozen(value)) {
      Object.freeze(value);
      for (const child of Object.values(value)) deepFreeze(child);
    }
    return value;
  }
  function createStore(prefs, { onError = () => {
  } } = {}) {
    let disposed = false, lastUndo = null, cached = null;
    const listeners = /* @__PURE__ */ new Set();
    const raw = () => prefs.getStringPref(SETTINGS_PREF, "");
    const read = () => {
      const value = raw();
      if (cached?.raw === value) return cached;
      let result;
      try {
        result = { state: deepFreeze(parseState(value)), raw: value, error: null };
      } catch (problem) {
        result = { state: deepFreeze(createState()), raw: value, error: problem.message };
      }
      return cached = Object.freeze(result);
    };
    const announce = () => {
      if (!disposed) for (const listener of [...listeners]) try {
        listener();
      } catch (problem) {
        onError(problem);
      }
    };
    const observer = { observe(_subject, _topic, name) {
      if (name === SETTINGS_PREF) announce();
    } };
    prefs.addObserver(SETTINGS_PREF, observer);
    function guard(expected) {
      if (disposed) throw new Error("These settings are closed.");
      if (typeof expected !== "string" || raw() !== expected) throw new Error("Settings changed in another window. Reopen the editor.");
    }
    function write(value, expected, remember = true) {
      guard(expected);
      if (value === expected) return;
      prefs.setStringPref(SETTINGS_PREF, value);
      if (remember) lastUndo = { before: expected, after: value };
    }
    return {
      read,
      save(next, expectedRaw) {
        guard(expectedRaw);
        if (read().error) throw new Error("Reset the invalid saved settings before editing.");
        const encoded = serializeState(next);
        write(encoded, expectedRaw);
        return parseState(encoded);
      },
      subscribe(listener) {
        if (disposed) return () => {
        };
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      undo() {
        if (!lastUndo) return;
        const previous = lastUndo;
        guard(previous.after);
        write(previous.before, previous.after, false);
        lastUndo = null;
      },
      resetInvalid(expectedRaw) {
        guard(expectedRaw);
        if (!read().error) return;
        prefs.setStringPref(SETTINGS_PREF + ".recovery", expectedRaw);
        write(serializeState(createState()), expectedRaw);
      },
      destroy() {
        if (disposed) return;
        disposed = true;
        prefs.removeObserver(SETTINGS_PREF, observer);
        listeners.clear();
        lastUndo = null;
        cached = null;
      }
    };
  }

  // project:assets/catalog.json
  var catalog_default = { packs: [{ id: "fluent", label: "FluentUI", icons: [{ id: "AI-chat", label: "Ai chat", tags: ["ai", "chat"], path: "assets/packs/fluent/AI-chat.svg" }, { id: "AI-summarize", label: "Ai summarize", tags: ["ai", "summarize"], path: "assets/packs/fluent/AI-summarize.svg" }, { id: "TabGroup-add", label: "Tab group add", tags: ["tab", "group", "add"], path: "assets/packs/fluent/TabGroup-add.svg" }, { id: "TabGroup-remove", label: "Tab group remove", tags: ["tab", "group", "remove"], path: "assets/packs/fluent/TabGroup-remove.svg" }, { id: "accessibility", label: "Accessibility", tags: ["accessibility"], path: "assets/packs/fluent/accessibility.svg" }, { id: "add-to-dictionary", label: "Add to dictionary", tags: ["add", "to", "dictionary"], path: "assets/packs/fluent/add-to-dictionary.svg" }, { id: "arrow-down", label: "Arrow down", tags: ["arrow", "down"], path: "assets/packs/fluent/arrow-down.svg" }, { id: "arrow-left", label: "Arrow left", tags: ["arrow", "left"], path: "assets/packs/fluent/arrow-left.svg" }, { id: "arrow-right", label: "Arrow right", tags: ["arrow", "right"], path: "assets/packs/fluent/arrow-right.svg" }, { id: "arrow-up", label: "Arrow up", tags: ["arrow", "up"], path: "assets/packs/fluent/arrow-up.svg" }, { id: "ask-chat", label: "Ask chat", tags: ["ask", "chat"], path: "assets/packs/fluent/ask-chat.svg" }, { id: "audio-save", label: "Audio save", tags: ["audio", "save"], path: "assets/packs/fluent/audio-save.svg" }, { id: "autoplay-media-blocked", label: "Autoplay media blocked", tags: ["autoplay", "media", "blocked"], path: "assets/packs/fluent/autoplay-media-blocked.svg" }, { id: "autoplay-media", label: "Autoplay media", tags: ["autoplay", "media"], path: "assets/packs/fluent/autoplay-media.svg" }, { id: "bookmark-hollow", label: "Bookmark hollow", tags: ["bookmark", "hollow"], path: "assets/packs/fluent/bookmark-hollow.svg" }, { id: "bookmark-star-on-tray", label: "Bookmark star on tray", tags: ["bookmark", "star", "on", "tray"], path: "assets/packs/fluent/bookmark-star-on-tray.svg" }, { id: "bookmark", label: "Bookmark", tags: ["bookmark"], path: "assets/packs/fluent/bookmark.svg" }, { id: "camera-blocked", label: "Camera blocked", tags: ["camera", "blocked"], path: "assets/packs/fluent/camera-blocked.svg" }, { id: "camera", label: "Camera", tags: ["camera"], path: "assets/packs/fluent/camera.svg" }, { id: "canvas-blocked", label: "Canvas blocked", tags: ["canvas", "blocked"], path: "assets/packs/fluent/canvas-blocked.svg" }, { id: "canvas", label: "Canvas", tags: ["canvas"], path: "assets/packs/fluent/canvas.svg" }, { id: "checkmark", label: "Checkmark", tags: ["checkmark"], path: "assets/packs/fluent/checkmark.svg" }, { id: "chevron", label: "Chevron", tags: ["chevron"], path: "assets/packs/fluent/chevron.svg" }, { id: "close-all", label: "Close all", tags: ["close", "all"], path: "assets/packs/fluent/close-all.svg" }, { id: "close", label: "Close", tags: ["close"], path: "assets/packs/fluent/close.svg" }, { id: "color", label: "Color", tags: ["color"], path: "assets/packs/fluent/color.svg" }, { id: "container-tab", label: "Container tab", tags: ["container", "tab"], path: "assets/packs/fluent/container-tab.svg" }, { id: "customize", label: "Customize", tags: ["customize"], path: "assets/packs/fluent/customize.svg" }, { id: "desktop-notification-blocked", label: "Desktop notification blocked", tags: ["desktop", "notification", "blocked"], path: "assets/packs/fluent/desktop-notification-blocked.svg" }, { id: "desktop-notification", label: "Desktop notification", tags: ["desktop", "notification"], path: "assets/packs/fluent/desktop-notification.svg" }, { id: "downloads", label: "Downloads", tags: ["downloads"], path: "assets/packs/fluent/downloads.svg" }, { id: "duplicate-tab", label: "Duplicate tab", tags: ["duplicate", "tab"], path: "assets/packs/fluent/duplicate-tab.svg" }, { id: "edit-copy", label: "Edit copy", tags: ["edit", "copy"], path: "assets/packs/fluent/edit-copy.svg" }, { id: "edit-cut", label: "Edit cut", tags: ["edit", "cut"], path: "assets/packs/fluent/edit-cut.svg" }, { id: "edit-delete", label: "Edit delete", tags: ["edit", "delete"], path: "assets/packs/fluent/edit-delete.svg" }, { id: "edit-paste", label: "Edit paste", tags: ["edit", "paste"], path: "assets/packs/fluent/edit-paste.svg" }, { id: "edit-redo", label: "Edit redo", tags: ["edit", "redo"], path: "assets/packs/fluent/edit-redo.svg" }, { id: "edit-select-all", label: "Edit select all", tags: ["edit", "select", "all"], path: "assets/packs/fluent/edit-select-all.svg" }, { id: "edit-undo", label: "Edit undo", tags: ["edit", "undo"], path: "assets/packs/fluent/edit-undo.svg" }, { id: "edit", label: "Edit", tags: ["edit"], path: "assets/packs/fluent/edit.svg" }, { id: "essential-add", label: "Essential add", tags: ["essential", "add"], path: "assets/packs/fluent/essential-add.svg" }, { id: "essential-remove", label: "Essential remove", tags: ["essential", "remove"], path: "assets/packs/fluent/essential-remove.svg" }, { id: "ext-link", label: "Ext link", tags: ["ext", "link"], path: "assets/packs/fluent/ext-link.svg" }, { id: "extension-blocked", label: "Extension blocked", tags: ["extension", "blocked"], path: "assets/packs/fluent/extension-blocked.svg" }, { id: "extension", label: "Extension", tags: ["extension"], path: "assets/packs/fluent/extension.svg" }, { id: "firefox-logo", label: "Firefox logo", tags: ["firefox", "logo"], path: "assets/packs/fluent/firefox-logo.svg" }, { id: "firefox", label: "Firefox", tags: ["firefox"], path: "assets/packs/fluent/firefox.svg" }, { id: "folder-add", label: "Folder add", tags: ["folder", "add"], path: "assets/packs/fluent/folder-add.svg" }, { id: "folder-open", label: "Folder open", tags: ["folder", "open"], path: "assets/packs/fluent/folder-open.svg" }, { id: "folder-unpack", label: "Folder unpack", tags: ["folder", "unpack"], path: "assets/packs/fluent/folder-unpack.svg" }, { id: "folder_sync_convert", label: "Folder sync convert", tags: ["folder", "sync", "convert"], path: "assets/packs/fluent/folder_sync_convert.svg" }, { id: "forget", label: "Forget", tags: ["forget"], path: "assets/packs/fluent/forget.svg" }, { id: "fullscreen-exit", label: "Fullscreen exit", tags: ["fullscreen", "exit"], path: "assets/packs/fluent/fullscreen-exit.svg" }, { id: "fullscreen", label: "Fullscreen", tags: ["fullscreen"], path: "assets/packs/fluent/fullscreen.svg" }, { id: "geo-blocked", label: "Geo blocked", tags: ["geo", "blocked"], path: "assets/packs/fluent/geo-blocked.svg" }, { id: "geo", label: "Geo", tags: ["geo"], path: "assets/packs/fluent/geo.svg" }, { id: "help", label: "Help", tags: ["help"], path: "assets/packs/fluent/help.svg" }, { id: "hide", label: "Hide", tags: ["hide"], path: "assets/packs/fluent/hide.svg" }, { id: "history", label: "History", tags: ["history"], path: "assets/packs/fluent/history.svg" }, { id: "home", label: "Home", tags: ["home"], path: "assets/packs/fluent/home.svg" }, { id: "image-copy", label: "Image copy", tags: ["image", "copy"], path: "assets/packs/fluent/image-copy.svg" }, { id: "image-open", label: "Image open", tags: ["image", "open"], path: "assets/packs/fluent/image-open.svg" }, { id: "image-save", label: "Image save", tags: ["image", "save"], path: "assets/packs/fluent/image-save.svg" }, { id: "info", label: "Info", tags: ["info"], path: "assets/packs/fluent/info.svg" }, { id: "inspect", label: "Inspect", tags: ["inspect"], path: "assets/packs/fluent/inspect.svg" }, { id: "library", label: "Library", tags: ["library"], path: "assets/packs/fluent/library.svg" }, { id: "link", label: "Link", tags: ["link"], path: "assets/packs/fluent/link.svg" }, { id: "mail", label: "Mail", tags: ["mail"], path: "assets/packs/fluent/mail.svg" }, { id: "manage", label: "Manage", tags: ["manage"], path: "assets/packs/fluent/manage.svg" }, { id: "media-loop", label: "Media loop", tags: ["media", "loop"], path: "assets/packs/fluent/media-loop.svg" }, { id: "media-mute", label: "Media mute", tags: ["media", "mute"], path: "assets/packs/fluent/media-mute.svg" }, { id: "media-pause", label: "Media pause", tags: ["media", "pause"], path: "assets/packs/fluent/media-pause.svg" }, { id: "media-pip", label: "Media pip", tags: ["media", "pip"], path: "assets/packs/fluent/media-pip.svg" }, { id: "media-play", label: "Media play", tags: ["media", "play"], path: "assets/packs/fluent/media-play.svg" }, { id: "media-speed", label: "Media speed", tags: ["media", "speed"], path: "assets/packs/fluent/media-speed.svg" }, { id: "media-unmute", label: "Media unmute", tags: ["media", "unmute"], path: "assets/packs/fluent/media-unmute.svg" }, { id: "menu-bar", label: "Menu bar", tags: ["menu", "bar"], path: "assets/packs/fluent/menu-bar.svg" }, { id: "menu", label: "Menu", tags: ["menu"], path: "assets/packs/fluent/menu.svg" }, { id: "microphone-blocked", label: "Microphone blocked", tags: ["microphone", "blocked"], path: "assets/packs/fluent/microphone-blocked.svg" }, { id: "microphone", label: "Microphone", tags: ["microphone"], path: "assets/packs/fluent/microphone.svg" }, { id: "midi-blocked", label: "Midi blocked", tags: ["midi", "blocked"], path: "assets/packs/fluent/midi-blocked.svg" }, { id: "midi", label: "Midi", tags: ["midi"], path: "assets/packs/fluent/midi.svg" }, { id: "move-tab", label: "Move tab", tags: ["move", "tab"], path: "assets/packs/fluent/move-tab.svg" }, { id: "new-tab-image", label: "New tab image", tags: ["new", "tab", "image"], path: "assets/packs/fluent/new-tab-image.svg" }, { id: "new-tab", label: "New tab", tags: ["new", "tab"], path: "assets/packs/fluent/new-tab.svg" }, { id: "open", label: "Open", tags: ["open"], path: "assets/packs/fluent/open.svg" }, { id: "page-portrait", label: "Page portrait", tags: ["page", "portrait"], path: "assets/packs/fluent/page-portrait.svg" }, { id: "passwords", label: "Passwords", tags: ["passwords"], path: "assets/packs/fluent/passwords.svg" }, { id: "paste-and-go", label: "Paste and go", tags: ["paste", "and", "go"], path: "assets/packs/fluent/paste-and-go.svg" }, { id: "permissions-fill", label: "Permissions fill", tags: ["permissions", "fill"], path: "assets/packs/fluent/permissions-fill.svg" }, { id: "permissions", label: "Permissions", tags: ["permissions"], path: "assets/packs/fluent/permissions.svg" }, { id: "persistent-storage-blocked", label: "Persistent storage blocked", tags: ["persistent", "storage", "blocked"], path: "assets/packs/fluent/persistent-storage-blocked.svg" }, { id: "persistent-storage", label: "Persistent storage", tags: ["persistent", "storage"], path: "assets/packs/fluent/persistent-storage.svg" }, { id: "pin", label: "Pin", tags: ["pin"], path: "assets/packs/fluent/pin.svg" }, { id: "plus", label: "Plus", tags: ["plus"], path: "assets/packs/fluent/plus.svg" }, { id: "pocket-outline", label: "Pocket outline", tags: ["pocket", "outline"], path: "assets/packs/fluent/pocket-outline.svg" }, { id: "popup", label: "Popup", tags: ["popup"], path: "assets/packs/fluent/popup.svg" }, { id: "print", label: "Print", tags: ["print"], path: "assets/packs/fluent/print.svg" }, { id: "private-window", label: "Private window", tags: ["private", "window"], path: "assets/packs/fluent/private-window.svg" }, { id: "privateBrowsing", label: "Private browsing", tags: ["private", "browsing"], path: "assets/packs/fluent/privateBrowsing.svg" }, { id: "reader-mode", label: "Reader mode", tags: ["reader", "mode"], path: "assets/packs/fluent/reader-mode.svg" }, { id: "reload-to-stop", label: "Reload to stop", tags: ["reload", "to", "stop"], path: "assets/packs/fluent/reload-to-stop.svg" }, { id: "reload", label: "Reload", tags: ["reload"], path: "assets/packs/fluent/reload.svg" }, { id: "report", label: "Report", tags: ["report"], path: "assets/packs/fluent/report.svg" }, { id: "save", label: "Save", tags: ["save"], path: "assets/packs/fluent/save.svg" }, { id: "screen-blocked", label: "Screen blocked", tags: ["screen", "blocked"], path: "assets/packs/fluent/screen-blocked.svg" }, { id: "screen", label: "Screen", tags: ["screen"], path: "assets/packs/fluent/screen.svg" }, { id: "screenshot", label: "Screenshot", tags: ["screenshot"], path: "assets/packs/fluent/screenshot.svg" }, { id: "search-add", label: "Search add", tags: ["search", "add"], path: "assets/packs/fluent/search-add.svg" }, { id: "search-glass", label: "Search glass", tags: ["search", "glass"], path: "assets/packs/fluent/search-glass.svg" }, { id: "search-page", label: "Search page", tags: ["search", "page"], path: "assets/packs/fluent/search-page.svg" }, { id: "security-broken", label: "Security broken", tags: ["security", "broken"], path: "assets/packs/fluent/security-broken.svg" }, { id: "security-warning", label: "Security warning", tags: ["security", "warning"], path: "assets/packs/fluent/security-warning.svg" }, { id: "security", label: "Security", tags: ["security"], path: "assets/packs/fluent/security.svg" }, { id: "send-to-device", label: "Send to device", tags: ["send", "to", "device"], path: "assets/packs/fluent/send-to-device.svg" }, { id: "settings", label: "Settings", tags: ["settings"], path: "assets/packs/fluent/settings.svg" }, { id: "share", label: "Share", tags: ["share"], path: "assets/packs/fluent/share.svg" }, { id: "sidebar-right", label: "Sidebar right", tags: ["sidebar", "right"], path: "assets/packs/fluent/sidebar-right.svg" }, { id: "sidebar", label: "Sidebar", tags: ["sidebar"], path: "assets/packs/fluent/sidebar.svg" }, { id: "sort", label: "Sort", tags: ["sort"], path: "assets/packs/fluent/sort.svg" }, { id: "source-code", label: "Source code", tags: ["source", "code"], path: "assets/packs/fluent/source-code.svg" }, { id: "spell-check", label: "Spell check", tags: ["spell", "check"], path: "assets/packs/fluent/spell-check.svg" }, { id: "split", label: "Split", tags: ["split"], path: "assets/packs/fluent/split.svg" }, { id: "stop-to-reload", label: "Stop to reload", tags: ["stop", "to", "reload"], path: "assets/packs/fluent/stop-to-reload.svg" }, { id: "tab-right", label: "Tab right", tags: ["tab", "right"], path: "assets/packs/fluent/tab-right.svg" }, { id: "tab", label: "Tab", tags: ["tab"], path: "assets/packs/fluent/tab.svg" }, { id: "tool-profiler", label: "Tool profiler", tags: ["tool", "profiler"], path: "assets/packs/fluent/tool-profiler.svg" }, { id: "tracking-protection", label: "Tracking protection", tags: ["tracking", "protection"], path: "assets/packs/fluent/tracking-protection.svg" }, { id: "translations", label: "Translations", tags: ["translations"], path: "assets/packs/fluent/translations.svg" }, { id: "unloadTab", label: "Unload tab", tags: ["unload", "tab"], path: "assets/packs/fluent/unloadTab.svg" }, { id: "unpin", label: "Unpin", tags: ["unpin"], path: "assets/packs/fluent/unpin.svg" }, { id: "video-open", label: "Video open", tags: ["video", "open"], path: "assets/packs/fluent/video-open.svg" }, { id: "video-save", label: "Video save", tags: ["video", "save"], path: "assets/packs/fluent/video-save.svg" }, { id: "window", label: "Window", tags: ["window"], path: "assets/packs/fluent/window.svg" }, { id: "xr-blocked", label: "Xr blocked", tags: ["xr", "blocked"], path: "assets/packs/fluent/xr-blocked.svg" }, { id: "xr", label: "Xr", tags: ["xr"], path: "assets/packs/fluent/xr.svg" }, { id: "zoom-control", label: "Zoom control", tags: ["zoom", "control"], path: "assets/packs/fluent/zoom-control.svg" }, { id: "zoom-out", label: "Zoom out", tags: ["zoom", "out"], path: "assets/packs/fluent/zoom-out.svg" }, { id: "qr-code", label: "QR code", tags: ["qr", "code"], path: "assets/packs/fluent/qr-code.svg" }, { id: "comment", label: "Comment", tags: ["comment"], path: "assets/packs/fluent/comment.svg" }, { id: "highlight", label: "Highlight", tags: ["highlight"], path: "assets/packs/fluent/highlight.svg" }] }, { id: "zen", label: "ZenUI", icons: [{ id: "accessibility", label: "Accessibility", tags: ["accessibility"], browserPath: "chrome://browser/skin/preferences/category-accessibility.svg" }, { id: "add-to-dictionary", label: "Add to dictionary", tags: ["add", "to", "dictionary"], browserPath: "chrome://browser/skin/zen-icons/spell-check.svg" }, { id: "arrow-down", label: "Arrow down", tags: ["arrow", "down"], browserPath: "chrome://browser/skin/zen-icons/arrow-down.svg" }, { id: "arrow-left", label: "Arrow left", tags: ["arrow", "left"], browserPath: "chrome://browser/skin/zen-icons/arrow-left.svg" }, { id: "arrow-right", label: "Arrow right", tags: ["arrow", "right"], browserPath: "chrome://browser/skin/zen-icons/arrow-right.svg" }, { id: "arrow-up", label: "Arrow up", tags: ["arrow", "up"], browserPath: "chrome://browser/skin/zen-icons/arrow-up.svg" }, { id: "audio-save", label: "Audio save", tags: ["audio", "save"], browserPath: "chrome://browser/skin/zen-icons/downloads.svg" }, { id: "autoplay-media-blocked", label: "Autoplay media blocked", tags: ["autoplay", "media", "blocked"], browserPath: "chrome://browser/skin/zen-icons/autoplay-media-blocked.svg" }, { id: "autoplay-media-fill", label: "Autoplay media fill", tags: ["autoplay", "media", "fill"], browserPath: "chrome://browser/skin/zen-icons/autoplay-media-fill.svg" }, { id: "autoplay-media", label: "Autoplay media", tags: ["autoplay", "media"], browserPath: "chrome://browser/skin/zen-icons/autoplay-media.svg" }, { id: "back", label: "Back", tags: ["back"], browserPath: "chrome://browser/skin/zen-icons/back.svg" }, { id: "bookmark-hollow", label: "Bookmark hollow", tags: ["bookmark", "hollow"], browserPath: "chrome://browser/skin/zen-icons/bookmark-hollow.svg" }, { id: "bookmark-star-on-tray", label: "Bookmark star on tray", tags: ["bookmark", "star", "on", "tray"], browserPath: "chrome://browser/skin/zen-icons/bookmark-star-on-tray.svg" }, { id: "bookmark", label: "Bookmark", tags: ["bookmark"], browserPath: "chrome://browser/skin/zen-icons/bookmark.svg" }, { id: "camera-blocked", label: "Camera blocked", tags: ["camera", "blocked"], browserPath: "chrome://browser/skin/zen-icons/camera-blocked.svg" }, { id: "camera-fill", label: "Camera fill", tags: ["camera", "fill"], browserPath: "chrome://browser/skin/zen-icons/camera-fill.svg" }, { id: "camera", label: "Camera", tags: ["camera"], browserPath: "chrome://browser/skin/zen-icons/camera.svg" }, { id: "canvas", label: "Canvas", tags: ["canvas"], browserPath: "chrome://browser/skin/zen-icons/canvas.svg" }, { id: "checkmark", label: "Checkmark", tags: ["checkmark"], browserPath: "chrome://browser/skin/zen-icons/selectable/checkbox.svg" }, { id: "chevron", label: "Chevron", tags: ["chevron"], browserPath: "chrome://browser/skin/zen-icons/chevron.svg" }, { id: "close-all", label: "Close all", tags: ["close", "all"], browserPath: "chrome://browser/skin/zen-icons/close.svg" }, { id: "close", label: "Close", tags: ["close"], browserPath: "chrome://browser/skin/zen-icons/close.svg" }, { id: "container-tab", label: "Container tab", tags: ["container", "tab"], browserPath: "chrome://browser/skin/zen-icons/container-tab.svg" }, { id: "cookies-fill", label: "Cookies fill", tags: ["cookies", "fill"], browserPath: "chrome://browser/skin/zen-icons/cookies-fill.svg" }, { id: "customize", label: "Customize", tags: ["customize"], browserPath: "chrome://browser/skin/zen-icons/customize.svg" }, { id: "dart-down", label: "Dart down", tags: ["dart", "down"], browserPath: "chrome://browser/skin/zen-icons/dart-down.svg" }, { id: "desktop-notification-blocked", label: "Desktop notification blocked", tags: ["desktop", "notification", "blocked"], browserPath: "chrome://browser/skin/zen-icons/desktop-notification-blocked.svg" }, { id: "desktop-notification-fill", label: "Desktop notification fill", tags: ["desktop", "notification", "fill"], browserPath: "chrome://browser/skin/zen-icons/desktop-notification-fill.svg" }, { id: "desktop-notification", label: "Desktop notification", tags: ["desktop", "notification"], browserPath: "chrome://browser/skin/zen-icons/desktop-notification.svg" }, { id: "developer", label: "Developer", tags: ["developer"], browserPath: "chrome://browser/skin/zen-icons/developer.svg" }, { id: "downloads", label: "Downloads", tags: ["downloads"], browserPath: "chrome://browser/skin/zen-icons/downloads.svg" }, { id: "duplicate-tab", label: "Duplicate tab", tags: ["duplicate", "tab"], browserPath: "chrome://browser/skin/zen-icons/duplicate-tab.svg" }, { id: "edit-copy", label: "Edit copy", tags: ["edit", "copy"], browserPath: "chrome://browser/skin/zen-icons/edit-copy.svg" }, { id: "edit-cut", label: "Edit cut", tags: ["edit", "cut"], browserPath: "chrome://browser/skin/zen-icons/edit-cut.svg" }, { id: "edit-delete", label: "Edit delete", tags: ["edit", "delete"], browserPath: "chrome://browser/skin/zen-icons/edit-delete.svg" }, { id: "edit-paste", label: "Edit paste", tags: ["edit", "paste"], browserPath: "chrome://browser/skin/zen-icons/edit-paste.svg" }, { id: "edit-redo", label: "Edit redo", tags: ["edit", "redo"], browserPath: "chrome://browser/skin/zen-icons/forward.svg" }, { id: "edit-select-all", label: "Edit select all", tags: ["edit", "select", "all"], browserPath: "chrome://browser/skin/zen-icons/selectable/checkbox.svg" }, { id: "edit-theme", label: "Edit theme", tags: ["edit", "theme"], browserPath: "chrome://browser/skin/zen-icons/edit-theme.svg" }, { id: "edit-undo", label: "Edit undo", tags: ["edit", "undo"], browserPath: "chrome://browser/skin/zen-icons/u-turn-to-left.svg" }, { id: "edit", label: "Edit", tags: ["edit"], browserPath: "chrome://browser/skin/zen-icons/edit-theme.svg" }, { id: "essential-add", label: "Essential add", tags: ["essential", "add"], browserPath: "chrome://browser/skin/zen-icons/essential-add.svg" }, { id: "essential-remove", label: "Essential remove", tags: ["essential", "remove"], browserPath: "chrome://browser/skin/zen-icons/essential-remove.svg" }, { id: "expand-sidebar", label: "Expand sidebar", tags: ["expand", "sidebar"], browserPath: "chrome://browser/skin/zen-icons/expand-sidebar.svg" }, { id: "ext-link", label: "Ext link", tags: ["ext", "link"], browserPath: "chrome://browser/skin/zen-icons/open.svg" }, { id: "extension-blocked", label: "Extension blocked", tags: ["extension", "blocked"], browserPath: "chrome://browser/skin/zen-icons/extension-blocked.svg" }, { id: "extension-fill", label: "Extension fill", tags: ["extension", "fill"], browserPath: "chrome://browser/skin/zen-icons/extension-fill.svg" }, { id: "extension", label: "Extension", tags: ["extension"], browserPath: "chrome://browser/skin/zen-icons/extension.svg" }, { id: "folder", label: "Folder", tags: ["folder"], browserPath: "chrome://browser/skin/zen-icons/folder.svg" }, { id: "forget", label: "Forget", tags: ["forget"], browserPath: "chrome://browser/skin/zen-icons/forget.svg" }, { id: "forward", label: "Forward", tags: ["forward"], browserPath: "chrome://browser/skin/zen-icons/forward.svg" }, { id: "fullscreen-exit", label: "Fullscreen exit", tags: ["fullscreen", "exit"], browserPath: "chrome://browser/skin/zen-icons/fullscreen-exit.svg" }, { id: "fullscreen", label: "Fullscreen", tags: ["fullscreen"], browserPath: "chrome://browser/skin/zen-icons/fullscreen.svg" }, { id: "geo-blocked", label: "Geo blocked", tags: ["geo", "blocked"], browserPath: "chrome://browser/skin/zen-icons/geo-blocked.svg" }, { id: "geo-fill", label: "Geo fill", tags: ["geo", "fill"], browserPath: "chrome://browser/skin/zen-icons/geo-fill.svg" }, { id: "geo", label: "Geo", tags: ["geo"], browserPath: "chrome://browser/skin/zen-icons/geo.svg" }, { id: "help", label: "Help", tags: ["help"], browserPath: "chrome://browser/skin/zen-icons/help.svg" }, { id: "history", label: "History", tags: ["history"], browserPath: "chrome://browser/skin/zen-icons/history.svg" }, { id: "home", label: "Home", tags: ["home"], browserPath: "chrome://browser/skin/zen-icons/home.svg" }, { id: "image-copy", label: "Image copy", tags: ["image", "copy"], browserPath: "chrome://browser/skin/zen-icons/edit-copy.svg" }, { id: "image-open", label: "Image open", tags: ["image", "open"], browserPath: "chrome://browser/skin/zen-icons/selectable/image.svg" }, { id: "image-save", label: "Image save", tags: ["image", "save"], browserPath: "chrome://browser/skin/zen-icons/save.svg" }, { id: "info", label: "Info", tags: ["info"], browserPath: "chrome://browser/skin/zen-icons/info.svg" }, { id: "inspect", label: "Inspect", tags: ["inspect"], browserPath: "chrome://browser/skin/zen-icons/developer.svg" }, { id: "library", label: "Library", tags: ["library"], browserPath: "chrome://browser/skin/zen-icons/library.svg" }, { id: "link", label: "Link", tags: ["link"], browserPath: "chrome://browser/skin/zen-icons/link.svg" }, { id: "mail", label: "Mail", tags: ["mail"], browserPath: "chrome://browser/skin/zen-icons/mail.svg" }, { id: "manage", label: "Manage", tags: ["manage"], browserPath: "chrome://browser/skin/zen-icons/manage.svg" }, { id: "media-loop", label: "Media loop", tags: ["media", "loop"], browserPath: "chrome://browser/skin/zen-icons/arrow-rotate-anticlockwise.svg" }, { id: "media-mute", label: "Media mute", tags: ["media", "mute"], browserPath: "chrome://browser/skin/zen-icons/media-mute.svg" }, { id: "media-next", label: "Media next", tags: ["media", "next"], browserPath: "chrome://browser/skin/zen-icons/media-next.svg" }, { id: "media-pause", label: "Media pause", tags: ["media", "pause"], browserPath: "chrome://browser/skin/zen-icons/media-pause.svg" }, { id: "media-pip", label: "Media pip", tags: ["media", "pip"], browserPath: "chrome://browser/skin/zen-icons/window.svg" }, { id: "media-play", label: "Media play", tags: ["media", "play"], browserPath: "chrome://browser/skin/zen-icons/media-play.svg" }, { id: "media-previous", label: "Media previous", tags: ["media", "previous"], browserPath: "chrome://browser/skin/zen-icons/media-previous.svg" }, { id: "media-speed", label: "Media speed", tags: ["media", "speed"], browserPath: "chrome://browser/skin/zen-icons/selectable/time.svg" }, { id: "media-unmute", label: "Media unmute", tags: ["media", "unmute"], browserPath: "chrome://browser/skin/zen-icons/media-unmute.svg" }, { id: "menu-bar", label: "Menu bar", tags: ["menu", "bar"], browserPath: "chrome://browser/skin/zen-icons/menu.svg" }, { id: "menu", label: "Menu", tags: ["menu"], browserPath: "chrome://browser/skin/zen-icons/menu.svg" }, { id: "microphone-blocked-fill", label: "Microphone blocked fill", tags: ["microphone", "blocked", "fill"], browserPath: "chrome://browser/skin/zen-icons/microphone-blocked-fill.svg" }, { id: "microphone-blocked", label: "Microphone blocked", tags: ["microphone", "blocked"], browserPath: "chrome://browser/skin/zen-icons/microphone-blocked.svg" }, { id: "microphone-fill", label: "Microphone fill", tags: ["microphone", "fill"], browserPath: "chrome://browser/skin/zen-icons/microphone-fill.svg" }, { id: "microphone", label: "Microphone", tags: ["microphone"], browserPath: "chrome://browser/skin/zen-icons/microphone.svg" }, { id: "midi", label: "Midi", tags: ["midi"], browserPath: "chrome://browser/skin/zen-icons/midi.svg" }, { id: "move-tab", label: "Move tab", tags: ["move", "tab"], browserPath: "chrome://browser/skin/zen-icons/arrow-corner-down-right.svg" }, { id: "new-tab-image", label: "New tab image", tags: ["new", "tab", "image"], browserPath: "chrome://browser/skin/zen-icons/new-tab-image.svg" }, { id: "open", label: "Open", tags: ["open"], browserPath: "chrome://browser/skin/zen-icons/open.svg" }, { id: "page-portrait", label: "Page portrait", tags: ["page", "portrait"], browserPath: "chrome://browser/skin/zen-icons/page-portrait.svg" }, { id: "palette", label: "Palette", tags: ["palette"], browserPath: "chrome://browser/skin/zen-icons/palette.svg" }, { id: "passwords", label: "Passwords", tags: ["passwords"], browserPath: "chrome://browser/skin/zen-icons/passwords.svg" }, { id: "paste-and-go", label: "Paste and go", tags: ["paste", "and", "go"], browserPath: "chrome://browser/skin/zen-icons/edit-paste.svg" }, { id: "permissions-fill", label: "Permissions fill", tags: ["permissions", "fill"], browserPath: "chrome://browser/skin/zen-icons/permissions-fill.svg" }, { id: "permissions", label: "Permissions", tags: ["permissions"], browserPath: "chrome://browser/skin/zen-icons/permissions.svg" }, { id: "persistent-storage-blocked", label: "Persistent storage blocked", tags: ["persistent", "storage", "blocked"], browserPath: "chrome://browser/skin/zen-icons/persistent-storage-blocked.svg" }, { id: "persistent-storage-fill", label: "Persistent storage fill", tags: ["persistent", "storage", "fill"], browserPath: "chrome://browser/skin/zen-icons/persistent-storage-fill.svg" }, { id: "persistent-storage", label: "Persistent storage", tags: ["persistent", "storage"], browserPath: "chrome://browser/skin/zen-icons/persistent-storage.svg" }, { id: "pin", label: "Pin", tags: ["pin"], browserPath: "chrome://browser/skin/zen-icons/pin.svg" }, { id: "plus", label: "Plus", tags: ["plus"], browserPath: "chrome://browser/skin/zen-icons/plus.svg" }, { id: "popup-fill", label: "Popup fill", tags: ["popup", "fill"], browserPath: "chrome://browser/skin/zen-icons/popup-fill.svg" }, { id: "popup", label: "Popup", tags: ["popup"], browserPath: "chrome://browser/skin/zen-icons/popup.svg" }, { id: "print", label: "Print", tags: ["print"], browserPath: "chrome://browser/skin/zen-icons/print.svg" }, { id: "private-window", label: "Private window", tags: ["private", "window"], browserPath: "chrome://browser/skin/zen-icons/private-window.svg" }, { id: "privateBrowsing", label: "Private browsing", tags: ["private", "browsing"], browserPath: "chrome://browser/skin/zen-icons/privateBrowsing.svg" }, { id: "reader-mode", label: "Reader mode", tags: ["reader", "mode"], browserPath: "chrome://browser/skin/zen-icons/reader-mode.svg" }, { id: "reload", label: "Reload", tags: ["reload"], browserPath: "chrome://browser/skin/zen-icons/reload.svg" }, { id: "remove-tab", label: "Remove tab", tags: ["remove", "tab"], browserPath: "chrome://browser/skin/zen-icons/close.svg" }, { id: "report", label: "Report", tags: ["report"], browserPath: "chrome://browser/skin/zen-icons/security-warning.svg" }, { id: "save", label: "Save", tags: ["save"], browserPath: "chrome://browser/skin/zen-icons/save.svg" }, { id: "screen-blocked", label: "Screen blocked", tags: ["screen", "blocked"], browserPath: "chrome://browser/skin/zen-icons/screen-blocked.svg" }, { id: "screen", label: "Screen", tags: ["screen"], browserPath: "chrome://browser/skin/zen-icons/screen.svg" }, { id: "screenshot", label: "Screenshot", tags: ["screenshot"], browserPath: "chrome://browser/skin/zen-icons/screenshot.svg" }, { id: "search-add", label: "Search add", tags: ["search", "add"], browserPath: "chrome://browser/skin/zen-icons/search-glass.svg" }, { id: "search-glass", label: "Search glass", tags: ["search", "glass"], browserPath: "chrome://browser/skin/zen-icons/search-glass.svg" }, { id: "search-page", label: "Search page", tags: ["search", "page"], browserPath: "chrome://browser/skin/zen-icons/search-page.svg" }, { id: "security-broken", label: "Security broken", tags: ["security", "broken"], browserPath: "chrome://browser/skin/zen-icons/security-broken.svg" }, { id: "security-warning", label: "Security warning", tags: ["security", "warning"], browserPath: "chrome://browser/skin/zen-icons/security-warning.svg" }, { id: "security", label: "Security", tags: ["security"], browserPath: "chrome://browser/skin/zen-icons/security.svg" }, { id: "send-to-device", label: "Send to device", tags: ["send", "to", "device"], browserPath: "chrome://browser/skin/zen-icons/send-to-device.svg" }, { id: "settings-fill", label: "Settings fill", tags: ["settings", "fill"], browserPath: "chrome://browser/skin/zen-icons/settings-fill.svg" }, { id: "settings", label: "Settings", tags: ["settings"], browserPath: "chrome://browser/skin/zen-icons/settings.svg" }, { id: "share", label: "Share", tags: ["share"], browserPath: "chrome://browser/skin/zen-icons/share.svg" }, { id: "sidebar-right", label: "Sidebar right", tags: ["sidebar", "right"], browserPath: "chrome://browser/skin/zen-icons/sidebar-right.svg" }, { id: "sidebar", label: "Sidebar", tags: ["sidebar"], browserPath: "chrome://browser/skin/zen-icons/sidebar.svg" }, { id: "sidebars-right", label: "Sidebars right", tags: ["sidebars", "right"], browserPath: "chrome://browser/skin/zen-icons/sidebars-right.svg" }, { id: "source-code", label: "Source code", tags: ["source", "code"], browserPath: "chrome://browser/skin/zen-icons/brackets-curly.svg" }, { id: "spell-check", label: "Spell check", tags: ["spell", "check"], browserPath: "chrome://browser/skin/zen-icons/spell-check.svg" }, { id: "split", label: "Split", tags: ["split"], browserPath: "chrome://browser/skin/zen-icons/split.svg" }, { id: "tab-audio-blocked-small", label: "Tab audio blocked small", tags: ["tab", "audio", "blocked", "small"], browserPath: "chrome://browser/skin/zen-icons/tab-audio-blocked-small.svg" }, { id: "tab-audio-muted-small", label: "Tab audio muted small", tags: ["tab", "audio", "muted", "small"], browserPath: "chrome://browser/skin/zen-icons/tab-audio-muted-small.svg" }, { id: "tab-audio-playing-small", label: "Tab audio playing small", tags: ["tab", "audio", "playing", "small"], browserPath: "chrome://browser/skin/zen-icons/tab-audio-playing-small.svg" }, { id: "tab", label: "Tab", tags: ["tab"], browserPath: "chrome://browser/skin/zen-icons/tab.svg" }, { id: "tool-profiler", label: "Tool profiler", tags: ["tool", "profiler"], browserPath: "chrome://browser/skin/zen-icons/tool-profiler.svg" }, { id: "tracking-protection-fill", label: "Tracking protection fill", tags: ["tracking", "protection", "fill"], browserPath: "chrome://browser/skin/zen-icons/tracking-protection-fill.svg" }, { id: "tracking-protection", label: "Tracking protection", tags: ["tracking", "protection"], browserPath: "chrome://browser/skin/zen-icons/tracking-protection.svg" }, { id: "translations", label: "Translations", tags: ["translations"], browserPath: "chrome://browser/skin/zen-icons/translations.svg" }, { id: "trash", label: "Trash", tags: ["trash"], browserPath: "chrome://browser/skin/zen-icons/trash.svg" }, { id: "unpin", label: "Unpin", tags: ["unpin"], browserPath: "chrome://browser/skin/zen-icons/unpin.svg" }, { id: "video-blocked-fill", label: "Video blocked fill", tags: ["video", "blocked", "fill"], browserPath: "chrome://browser/skin/zen-icons/video-blocked-fill.svg" }, { id: "video-fill", label: "Video fill", tags: ["video", "fill"], browserPath: "chrome://browser/skin/zen-icons/video-fill.svg" }, { id: "video-open", label: "Video open", tags: ["video", "open"], browserPath: "chrome://browser/skin/zen-icons/selectable/video.svg" }, { id: "video-save", label: "Video save", tags: ["video", "save"], browserPath: "chrome://browser/skin/zen-icons/save.svg" }, { id: "window", label: "Window", tags: ["window"], browserPath: "chrome://browser/skin/zen-icons/window.svg" }, { id: "xr-blocked", label: "Xr blocked", tags: ["xr", "blocked"], browserPath: "chrome://browser/skin/zen-icons/xr-blocked.svg" }, { id: "xr-fill", label: "Xr fill", tags: ["xr", "fill"], browserPath: "chrome://browser/skin/zen-icons/xr-fill.svg" }, { id: "xr", label: "Xr", tags: ["xr"], browserPath: "chrome://browser/skin/zen-icons/xr.svg" }, { id: "zoom-control", label: "Zoom control", tags: ["zoom", "control"], browserPath: "chrome://browser/skin/zen-icons/plus.svg" }, { id: "zoom-out", label: "Zoom out", tags: ["zoom", "out"], browserPath: "chrome://browser/skin/zen-icons/zoom-out.svg" }, { id: "qr-code", label: "QR code", tags: ["qr", "code"], browserPath: "chrome://browser/content/sharing/qr-code.svg" }, { id: "comment", label: "Comment", tags: ["comment"], browserPath: "chrome://browser/skin/zen-icons/selectable/chat.svg" }, { id: "highlight", label: "Highlight", tags: ["highlight"], browserPath: "chrome://browser/skin/zen-icons/paintbrush.svg" }, { id: "unloadTab", label: "Unloadtab", tags: ["unloadTab"], browserPath: "chrome://browser/skin/zen-icons/selectable/moon.svg" }, { id: "AI-chat", label: "Ai chat", tags: ["AI", "chat"], browserPath: "chrome://browser/skin/zen-icons/sparkles.svg" }, { id: "AI-summarize", label: "Ai summarize", tags: ["AI", "summarize"], browserPath: "chrome://browser/skin/zen-icons/sparkles.svg" }, { id: "sort", label: "Sort", tags: ["sort"], browserPath: "chrome://browser/skin/zen-icons/circle-bars-filter.svg" }] }], mappings: { fluent: { byId: { "node-menu-scrollnodeintoview": "arrow-down", cMenu_findAgain: "arrow-down", "se-menu-gotoLine": "arrow-right", "spell-check-enabled": "spell-check", "context-video-pictureinpicture": "media-pip", "context-media-loop": "media-loop", "request-list-context-resend-only": "media-loop", "request-list-context-edit-resend": "media-loop", "context-savepage": "save", "context-selectall": "edit-select-all", context_selectAllTabs: "edit-select-all", "toolbar-context-selectAllTabs": "edit-select-all", "context-undo": "edit-undo", context_undoCloseTab: "edit-undo", "toolbar-context-undoCloseTab": "edit-undo", context_unloadTab: "unloadTab", context_zenUnloadWorkspace: "unloadTab", context_zenFolderUnloadAll: "unloadTab", context_zenUnloadAllOtherWorkspace: "unloadTab", viewColumns: "menu-bar", "toggle_toolbar-menubar": "menu-bar", "context-redo": "edit-redo", "context-copy": "edit-copy", placesContext_copy: "edit-copy", "context-copyurl": "edit-copy", "console-menu-copy": "edit-copy", "console-menu-copy-object": "edit-copy", "console-menu-export-clipboard": "edit-copy", "node-menu-copy-source-url": "edit-copy", "node-menu-copy-to-clipboard": "edit-copy", "variable-view-popup-copy": "edit-copy", "context-paste": "edit-paste", placesContext_paste_group: "edit-paste", placesContext_paste: "edit-paste", "context-paste-no-formatting": "edit-paste", "context-cut": "edit-cut", placesContext_cut: "edit-cut", placesContext_open: "ext-link", "context-openlinkincurrent": "ext-link", "context-zenOpenLinkInGlance": "ext-link", placesContext_showInFolder: "folder-open", viewSort: "sort", "context-delete": "edit-delete", pageActionContextMenuRemoveExtension: "edit-delete", placesContext_removeTag: "edit-delete", "node-menu-delete": "edit-delete", "storage-table-popup-delete": "edit-delete", "storage-table-popup-delete-all-from": "edit-delete", "storage-table-popup-delete-all": "edit-delete", "storage-table-popup-delete-all-session-cookies": "edit-delete", "storage-tree-popup-delete-all": "edit-delete", "storage-tree-popup-delete-all-session-cookies": "edit-delete", "paste-and-go": "paste-and-go", "context-print-selection": "print", "context-take-screenshot": "screenshot", "node-menu-screenshotnode": "screenshot", frame: "info", "context-ask-chat": "AI-chat", context_askChat: "AI-chat", "context-previewlink": "AI-summarize", "context-viewsource": "source-code", "context-inspect-a11y": "accessibility", "context-inspect": "inspect", "request-list-context-use-as-fetch": "inspect", "context-searchselect": "search-glass", "context-visual-search": "search-glass", "context-searchselect-private": "search-glass", "context-add-engine": "search-add", "context-translate-selection": "translations", "context-viewimage": "image-open", "context-viewimageinfo": "info", "context-saveimage": "image-save", "context-video-saveimage": "image-save", "context-savevideo": "video-save", "context-viewvideo": "video-open", "context-saveaudio": "audio-save", "context-copyimage-contents": "image-copy", "context-copyimage": "link", "context-copyvideourl": "link", "context-copylink": "link", "context-copy-link-to-highlight": "link", "context-copy-clean-link-to-highlight": "link", "context-stripOnShareLink": "link", "context-pdfjs-copy": "link", "context-viewframesource": "source-code", "context-viewpartialsource-selection": "source-code", "context-sendimage": "mail", "context-sendvideo": "mail", "context-sendaudio": "mail", "context-setDesktopBackground": "customize", "toolbar-context-customize": "customize", "toolbar-context-customize-sidebar": "customize", "context-reloadimage": "reload", context_reloadTab: "reload", context_reloadSelectedTabs: "reload", "toolbar-context-reloadSelectedTab": "reload", "toolbar-context-reloadSelectedTabs": "reload", "context-sendlinktodevice": "send-to-device", context_sendTabToDevice: "send-to-device", "context-sendpagetodevice": "send-to-device", "context-openlinkintab": "tab", "context-openlinkincontainertab": "tab", "context-openlinknewtab": "tab", "request-list-context-newtab": "tab", context_openANewTab: "new-tab-image", "toolbar-context-openANewTab": "new-tab-image", context_moveTabToGroup: "TabGroup-add", context_moveTabToNewGroup: "TabGroup-add", context_moveTabToSplitView: "split", context_moveSplitViewToNewGroup: "TabGroup-add", context_ungroupTab: "TabGroup-remove", context_zenMoveToFolder: "folder-open", "context-openlinkinusercontext-menu": "container-tab", context_reopenInContainer: "container-tab", "context-openlink": "window", "context-openlinkprivate": "private-window", "context-savelink": "downloads", "request-list-context-save-as-har": "downloads", "request-list-context-save-all-as-har": "downloads", "request-list-context-save-response-as": "downloads", "spell-add-to-dictionary": "add-to-dictionary", "spell-add-dictionaries": "add-to-dictionary", "spell-dictionaries": "add-to-dictionary", "fill-login": "passwords", "manage-saved-logins": "passwords", "sidebar-switcher-megalist": "passwords", "fill-login-generated-password": "passwords", "context-media-play": "media-play", context_playTab: "media-play", context_playSelectedTabs: "media-play", "context-media-pause": "media-pause", "context-media-mute": "media-mute", context_toggleMuteTab: "media-unmute", context_toggleMuteSelectedTabs: "media-unmute", "context-media-unmute": "media-unmute", "context-media-playbackrate": "media-speed", "request-list-context-perf": "media-speed", "context-video-fullscreen": "fullscreen", "context-leave-dom-fullscreen": "fullscreen-exit", "context-media-hidecontrols": "permissions", "context-media-showcontrols": "permissions", context_pinTab: "pin", context_pinSelectedTabs: "pin", context_unpinTab: "unpin", context_unpinSelectedTabs: "unpin", context_duplicateTab: "duplicate-tab", context_duplicateTabs: "duplicate-tab", context_bookmarkTab: "bookmark-hollow", context_bookmarkSelectedTabs: "bookmark-hollow", toggle_PersonalToolbar: "bookmark-hollow", "context-bookmarklink": "bookmark-hollow", "toolbar-context-bookmarkSelectedTab": "bookmark-hollow", "toolbar-context-bookmarkSelectedTabs": "bookmark-hollow", placesContext_createBookmark: "bookmark-hollow", "node-menu-edithtml": "edit", context_addNote: "edit", context_editNote: "edit", BMB_bookmarksShowAllTop: "manage", BMB_bookmarksShowAll: "manage", pageActionContextMenuManageExtension: "manage", BMB_viewBookmarksSidebar: "sidebar", BMB_searchBookmarks: "search-page", "se-menu-find": "search-page", "PanelUI-historyMore": "manage", newbookmark: "plus", newfolder: "plus", newseparator: "plus", "node-menu-add": "plus", "context_zen-add-domain-to-routing": "plus", "context-savelinktopocket": "pocket-outline", "context-pocket": "pocket-outline", context_moveTabOptions: "move-tab", context_reverseSplitView: "move-tab", context_zenShareWorkspace: "share", context_zenShareFolder: "share", context_zenShareSplitView: "share", context_closeTab: "close", context_closeDuplicateTabs: "close", orgClose: "close", "sidebar-menu-close": "close", context_closeTabOptions: "close-all", "sidebar-switcher-bookmarks": "bookmark-star-on-tray", "sidebar-switcher-history": "history", "sidebar-switcher-tabs": "send-to-device", "zen-toolbar-context-tabs-right": "tab-right", "sidebar-reverse-position": "tab-right", "context_zen-add-essential": "essential-add", "context_zen-edit-pinned-page": "essential-add", "context_zen-remove-essential": "essential-remove", "context-zen-change-workspace-tab": "move-tab", context_separateSplitView: "split", context_zenSplitTabs: "split", "context-zenSplitLink": "split", zenToolbarThemePicker: "customize", "zen-context-menu-compact-mode": "sidebar", "zen-context-menu-compact-mode-toggle": "sidebar", "context_zen-reset-pinned-tab": "reload", "context_zen-replace-pinned-url-with-current": "reload", "zen-context-menu-new-folder": "folder-add", "zen-context-menu-new-folder-toolbar": "folder-add", "zen-panel-ui-live-folder-create": "folder-add", context_zenEditWorkspace: "edit", "context_zen-edit-tab-title": "edit", context_zenEditWorkspaceIcon: "image-save", "context_zen-edit-tab-icon": "image-save", context_zenChangeWorkspaceTheme: "customize", context_zenWorkspacesOpenInContainerTab: "container-tab", context_zenReorderWorkspaces: "sort", context_zenDeleteWorkspace: "edit-delete", context_zenFolderRename: "edit", context_zenFolderChangeIcon: "image-save", context_zenFolderNewSubfolder: "folder-add", context_zenFolderUnpack: "folder-unpack", context_zenChangeFolderSpace: "move-tab", context_zenFolderToSpace: "folder_sync_convert", "convert-folder-to-group": "folder_sync_convert", context_zenFolderDelete: "edit-delete", "zen-boost-edit-rename": "edit", "zen-boost-edit-reset": "media-loop", "zen-boost-load": "edit-undo", "zen-boost-save": "edit-redo", "zen-boost-edit-delete": "edit-delete", context_zenSpaceRoutingSettings: "settings", "cmi-show-more-menu": "menu-bar", "cmi-show-more-menu-tab": "menu-bar", "quicktabs-context-menuitem": "ext-link", "quicktabs-tab-context-menuitem": "ext-link", "quicksearch-context-menuitem": "search-glass", context_renameTab: "edit", "context-back": "arrow-left", "context-forward": "arrow-right", "context-reload": "reload", "context-stop": "close", "better-zen-folders-move-space": "move-tab", context_moveTabToGroupNewGroup: "TabGroup-add", context_moveTabToSavedGroup: "history", context_ungroupSplitView: "TabGroup-remove", context_askChatSummarize: "AI-summarize", context_createAITab: "AI-chat", context_moveToStart: "arrow-up", context_moveToEnd: "arrow-down", context_fullscreenAutohide: "fullscreen", context_fullscreenExit: "fullscreen-exit", "context-bookmarkpage": "bookmark-hollow", "context-viewsource-goToLine": "search-page", "spell-undo-add-to-dictionary": "edit-undo", "context-viewimagedesc": "info", "use-relay-mask": "mail", "context-pdfjs-comment-selection": "comment", "context-pdfjs-highlight-selection": "highlight", "context-reveal-password": "passwords", "context-use-mini-window": "popup", "context-create-aitab": "AI-chat", "context-showonlythisframe": "window", "context-viewframeinfo": "info", "context-media-eme-learnmore": "help", "placesContext_openBookmarkContainer:tabs": "tab", "placesContext_openBookmarkLinks:tabs": "tab", "placesContext_show_bookmark:info": "edit", placesContext_deleteBookmark: "edit-delete", "placesContext_sortBy:name": "sort", "placesContext_new:folder": "folder-add", placesContext_showAllBookmarks: "library", context_zenLiveFolderOptions: "settings", "better-zen-folders-sticky-folder": "pin", context_zenManageWorkspaces: "manage", "toolbar-context-manage-extension": "extension", "toolbar-context-report-extension": "report", "toolbar-context-toggle-vertical-tabs": "sidebar", "toolbar-context-move-to-panel": "pin", "toolbar-context-autohide-downloads-button": "downloads", "toolbar-context-always-open-downloads-panel": "downloads", "toolbar-context-always-show-extensions-button": "extension", "toolbar-context-pin-to-toolbar": "pin", "toolbar-context-full-screen-autohide": "fullscreen", "toolbar-context-full-screen-exit": "fullscreen-exit", "zen-toolbar-context-set-profile": "container-tab", "edit-contextmenu-undo": "edit-undo", "edit-contextmenu-redo": "edit-redo", "edit-contextmenu-cut": "edit-cut", "edit-contextmenu-copy": "edit-copy", "edit-contextmenu-paste": "edit-paste", "edit-contextmenu-delete": "edit-delete", "edit-contextmenu-select-all": "edit-select-all", "strip-on-share": "link", "unified-extensions-context-menu-move-widget-up": "arrow-up", "unified-extensions-context-menu-move-widget-down": "arrow-down", "unified-extensions-context-menu-manage-extension": "extension", "unified-extensions-context-menu-remove-extension": "edit-delete", "unified-extensions-context-menu-report-extension": "report", context_zenClearSiteData: "forget", context_zenOpenGetAddons: "plus", context_zenOpenSiteSettings: "settings", "open-tab-group-context-menu_moveToThisWindow": "move-tab", "open-tab-group-context-menu_moveToNewWindow": "window", "open-tab-group-context-menu_share": "share", "open-tab-group-context-menu_delete": "edit-delete", "saved-tab-group-context-menu_openInThisWindow": "open", "saved-tab-group-context-menu_openInNewWindow": "window", "saved-tab-group-context-menu_delete": "edit-delete", context_HidePictureInPictureToggle: "hide" }, byL10n: { "library-media-turn-off": "unloadTab", "library-media-menu-copy": "edit-copy", "library-downloads-menu-copy": "edit-copy", "library-media-menu-open": "ext-link", "library-downloads-menu-open": "ext-link", "library-downloads-menu-trash": "edit-delete", "zen-boost-edit-delete": "edit-delete", "library-downloads-clear-all": "edit-delete", "library-history-clear": "edit-delete", "library-downloads-menu-delete": "edit-delete", "downloads-cmd-delete-file": "edit-delete", "downloads-cmd-remove-from-history": "forget", "downloads-cmd-clear-list": "close-all", "downloads-cmd-clear-downloads": "close-all", "downloads-cmd-copy-download-link": "link", "library-downloads-menu-hide": "hide", "library-boosts-menu-edit": "edit", "library-open-legacy": "manage", "zen-boost-save": "share", "text-action-undo": "edit-undo", "text-action-redo": "edit-redo", "text-action-cut": "edit-cut", "text-action-copy": "edit-copy", "text-action-paste": "edit-paste", "text-action-delete": "edit-delete", "text-action-select-all": "edit-select-all", "downloads-cmd-show-menuitem-2": "folder-open", "zen-panel-ui-workspaces-create": "plus", "user-context-new-tab": "new-tab-image", "user-context-add-container": "container-tab", "user-context-manage-containers": "manage", "tab-context-share-url": "share", "menu-share-copy-links": "link", "menu-file-share-qrcode3": "qr-code", "menu-share-windows": "share", "user-context-add-container2": "container-tab", "user-context-manage-containers2": "manage", "urlbar-input-dismiss-autofill": "close", "urlbar-input-remove-from-history": "forget", "clear-search-history": "forget", "downloads-cmd-pause": "media-pause", "downloads-cmd-resume": "media-play", "downloads-cmd-unblock": "checkmark", "downloads-cmd-use-system-default": "open", "downloads-cmd-go-to-download-page": "ext-link", "zen-site-data-manage-addons": "extension", "library-history-menu-open": "ext-link", "library-history-menu-forget": "edit-delete", "places-forget-domain-data": "forget", "library-downloads-menu-retry": "reload", "library-downloads-menu-clear-preview": "close", "picture-in-picture-move-toggle-left": "arrow-left", "picture-in-picture-move-toggle-right": "arrow-right" } }, zen: { byId: { viewSort: "move-tab", "context-zen-change-workspace-tab": "move-tab", context_moveTabToSplitView: "container-tab", context_separateSplitView: "split", context_zenSplitTabs: "split", "context-zenSplitLink": "split", "context-previewlink": "open", "context-zenOpenLinkInGlance": "open", context_zenOpenWorkspace: "manage", context_zenOpenWorkspacePanel: "manage", zenToolbarThemePicker: "edit-theme", "context-video-pictureinpicture": "media-pip", "context-media-loop": "media-loop", "request-list-context-resend-only": "media-loop", "request-list-context-edit-resend": "media-loop", "context-savepage": "save", "context-selectall": "edit-select-all", context_selectAllTabs: "edit-select-all", "toolbar-context-selectAllTabs": "edit-select-all", "context-add-engine": "search-add", "context-undo": "edit-undo", context_undoCloseTab: "edit-undo", "toolbar-context-undoCloseTab": "edit-undo", "toggle_toolbar-menubar": "menu-bar", "context-redo": "edit-redo", "node-menu-scrollnodeintoview": "edit-redo", cMenu_findAgain: "edit-redo", "se-menu-gotoLine": "edit-redo", "context-copy": "edit-copy", placesContext_copy: "edit-copy", "context-copyurl": "edit-copy", "console-menu-copy": "edit-copy", "console-menu-copy-object": "edit-copy", "console-menu-export-clipboard": "edit-copy", "node-menu-copy-source-url": "edit-copy", "node-menu-copy-to-clipboard": "edit-copy", "variable-view-popup-copy": "edit-copy", "context-paste": "edit-paste", placesContext_paste_group: "edit-paste", placesContext_paste: "edit-paste", "context-paste-no-formatting": "edit-paste", "context-cut": "edit-cut", placesContext_cut: "edit-cut", "context-delete": "edit-delete", pageActionContextMenuRemoveExtension: "edit-delete", context_zenDeleteWebPanel: "edit-delete", context_zenDeleteWorkspace: "edit-delete", placesContext_removeTag: "edit-delete", "node-menu-delete": "edit-delete", "storage-table-popup-delete": "edit-delete", "storage-table-popup-delete-all-from": "edit-delete", "storage-table-popup-delete-all": "edit-delete", "storage-table-popup-delete-all-session-cookies": "edit-delete", "storage-tree-popup-delete-all": "edit-delete", "storage-tree-popup-delete-all-session-cookies": "edit-delete", "paste-and-go": "paste-and-go", "context-print-selection": "print", "spell-check-enabled": "spell-check", "context-take-screenshot": "screenshot", "node-menu-screenshotnode": "screenshot", frame: "info", "context-viewsource": "source-code", "context-inspect-a11y": "accessibility", "context-inspect": "inspect", "request-list-context-use-as-fetch": "inspect", "context-searchselect": "search-glass", "context-visual-search": "search-glass", "context-searchselect-private": "search-glass", "context-viewimage": "image-open", "context-viewimageinfo": "info", "context-saveimage": "image-save", "context-video-saveimage": "image-save", "context-savevideo": "video-save", "context-viewvideo": "video-open", "context-saveaudio": "audio-save", "context-copyimage-contents": "image-copy", "context-copyimage": "link", "context-copyvideourl": "link", "context-copylink": "link", "context-copy-link-to-highlight": "link", "context-copy-clean-link-to-highlight": "link", "context-stripOnShareLink": "link", context_zenOpenNewTabWebPanel: "link", "context-pdfjs-copy": "link", "context-openlinkincurrent": "ext-link", "context-translate-selection": "translations", "appMenu-translate-button": "translations", "context-viewframesource": "source-code", "context-viewpartialsource-selection": "source-code", "context-sendimage": "mail", "context-sendvideo": "mail", "context-sendaudio": "mail", "context-setDesktopBackground": "customize", "context-reloadimage": "reload", context_reloadTab: "reload", context_reloadSelectedTabs: "reload", "toolbar-context-reloadSelectedTab": "reload", "toolbar-context-reloadSelectedTabs": "reload", "context_zen-reset-pinned-tab": "reload", "context-sendlinktodevice": "send-to-device", context_sendTabToDevice: "send-to-device", "context-sendpagetodevice": "send-to-device", "sidebar-switcher-tabs": "send-to-device", "context-openlinkintab": "tab", "context-openlinkincontainertab": "tab", context_zenWebPanelContextInContainer: "tab", "context-openlinknewtab": "tab", "request-list-context-newtab": "tab", context_openANewTab: "new-tab-image", "toolbar-context-openANewTab": "new-tab-image", "context-openlinkinusercontext-menu": "container-tab", "context-openlink": "window", "context-openlinkprivate": "private-window", "context-savelink": "downloads", "request-list-context-save-as-har": "downloads", "request-list-context-save-all-as-har": "downloads", "request-list-context-save-response-as": "downloads", "spell-add-to-dictionary": "add-to-dictionary", "spell-add-dictionaries": "add-to-dictionary", "spell-dictionaries": "add-to-dictionary", "fill-login": "passwords", "manage-saved-logins": "passwords", "sidebar-switcher-megalist": "passwords", "fill-login-generated-password": "passwords", "context-media-play": "media-play", context_playTab: "media-play", context_playSelectedTabs: "media-play", "context-media-pause": "media-pause", "context-media-mute": "media-mute", context_toggleMuteTab: "media-unmute", context_toggleMuteSelectedTabs: "media-unmute", context_zenToggleMuteWebPanel: "media-unmute", "context-media-unmute": "media-unmute", "context-media-playbackrate": "media-speed", "request-list-context-perf": "media-speed", "context-video-fullscreen": "fullscreen", "context-leave-dom-fullscreen": "fullscreen-exit", "context-media-hidecontrols": "permissions", "context-media-showcontrols": "permissions", context_pinTab: "pin", context_unpinTab: "pin", context_pinSelectedTabs: "pin", context_unpinSelectedTabs: "pin", "context_zen-replace-pinned-url-with-current": "pin", "context_zen-add-essential": "essential-add", "context_zen-edit-pinned-page": "essential-add", "context_zen-remove-essential": "essential-remove", context_duplicateTab: "duplicate-tab", context_duplicateTabs: "duplicate-tab", "node-menu-duplicatenode": "duplicate-tab", "zen-context-menu-compact-mode": "sidebar", "zen-context-menu-compact-mode-toggle": "sidebar", context_bookmarkTab: "bookmark-hollow", context_bookmarkSelectedTabs: "bookmark-hollow", toggle_PersonalToolbar: "bookmark-hollow", "context-bookmarklink": "bookmark-hollow", "toolbar-context-bookmarkSelectedTab": "bookmark-hollow", "toolbar-context-bookmarkSelectedTabs": "bookmark-hollow", placesContext_createBookmark: "bookmark-hollow", "sidebar-switcher-bookmarks": "bookmark-star-on-tray", "sidebar-switcher-history": "history", "node-menu-edithtml": "edit", context_addNote: "edit", context_editNote: "edit", BMB_bookmarksShowAllTop: "manage", BMB_bookmarksShowAll: "manage", pageActionContextMenuManageExtension: "manage", BMB_searchBookmarks: "search-page", "se-menu-find": "search-page", newbookmark: "plus", newfolder: "plus", newseparator: "plus", "node-menu-add": "plus", "context_zen-add-domain-to-routing": "plus", context_moveTabOptions: "move-tab", context_reverseSplitView: "move-tab", context_ungroupTab: "remove-tab", context_zenMoveToFolder: "folder", context_zenShareWorkspace: "share", context_zenShareFolder: "share", context_zenShareSplitView: "share", context_moveTabToGroup: "container-tab", context_moveTabToNewGroup: "container-tab", context_moveSplitViewToNewGroup: "container-tab", context_reopenInContainer: "container-tab", context_closeTab: "close", context_closeDuplicateTabs: "close", orgClose: "close", "sidebar-menu-close": "close", context_closeTabOptions: "close-all", placesContext_open: "ext-link", context_zenEditWorkspace: "edit", "context_zen-edit-tab-title": "edit", context_zenEditWorkspaceIcon: "canvas", "context_zen-edit-tab-icon": "canvas", context_zenChangeWorkspaceTheme: "customize", context_zenWorkspacesOpenInContainerTab: "container-tab", context_zenReorderWorkspaces: "move-tab", context_zenFolderRename: "edit", context_zenFolderChangeIcon: "canvas", "zen-context-menu-new-folder": "folder", "zen-context-menu-new-folder-toolbar": "folder", "zen-panel-ui-live-folder-create": "folder", context_zenFolderNewSubfolder: "folder", placesContext_showInFolder: "folder", context_zenFolderUnpack: "close-all", context_zenChangeFolderSpace: "move-tab", context_zenFolderToSpace: "edit-redo", "convert-folder-to-group": "edit-redo", context_zenFolderDelete: "edit-delete", "zen-boost-edit-rename": "edit", "zen-boost-edit-reset": "media-loop", "zen-boost-load": "edit-undo", "zen-boost-save": "edit-redo", "zen-boost-edit-delete": "edit-delete", viewColumns: "menu", "cmi-show-more-menu": "menu", "cmi-show-more-menu-tab": "menu", "quicktabs-context-menuitem": "ext-link", "quicktabs-tab-context-menuitem": "ext-link", "quicksearch-context-menuitem": "search-glass", context_renameTab: "edit", "context-back": "arrow-left", "context-forward": "arrow-right", "context-reload": "reload", "context-stop": "close", "better-zen-folders-move-space": "move-tab", context_unloadTab: "unloadTab", context_zenUnloadWorkspace: "unloadTab", context_zenFolderUnloadAll: "unloadTab", context_zenUnloadAllOtherWorkspace: "unloadTab", context_askChat: "AI-chat", "context-ask-chat": "AI-chat", "toolbar-context-customize": "customize", "toolbar-context-customize-sidebar": "customize", "zen-toolbar-context-tabs-right": "sidebar-right", "sidebar-reverse-position": "sidebar-right", BMB_viewBookmarksSidebar: "sidebar", "PanelUI-historyMore": "manage", context_zenSpaceRoutingSettings: "settings", context_moveTabToGroupNewGroup: "plus", context_moveTabToSavedGroup: "history", context_ungroupSplitView: "remove-tab", context_askChatSummarize: "AI-summarize", context_createAITab: "AI-chat", context_moveToStart: "arrow-up", context_moveToEnd: "arrow-down", context_fullscreenAutohide: "fullscreen", context_fullscreenExit: "fullscreen-exit", "context-bookmarkpage": "bookmark-hollow", "context-viewsource-goToLine": "search-page", "spell-undo-add-to-dictionary": "edit-undo", "context-viewimagedesc": "info", "use-relay-mask": "mail", "context-pdfjs-comment-selection": "comment", "context-pdfjs-highlight-selection": "highlight", "context-reveal-password": "passwords", "context-use-mini-window": "popup", "context-create-aitab": "AI-chat", "context-showonlythisframe": "window", "context-viewframeinfo": "info", "context-media-eme-learnmore": "help", "placesContext_openBookmarkContainer:tabs": "tab", "placesContext_openBookmarkLinks:tabs": "tab", "placesContext_show_bookmark:info": "edit", placesContext_deleteBookmark: "edit-delete", "placesContext_sortBy:name": "sort", "placesContext_new:folder": "folder", placesContext_showAllBookmarks: "library", context_zenLiveFolderOptions: "settings", "better-zen-folders-sticky-folder": "pin", context_zenManageWorkspaces: "manage", "toolbar-context-manage-extension": "extension", "toolbar-context-report-extension": "report", "toolbar-context-toggle-vertical-tabs": "sidebar", "toolbar-context-move-to-panel": "pin", "toolbar-context-autohide-downloads-button": "downloads", "toolbar-context-always-open-downloads-panel": "downloads", "toolbar-context-always-show-extensions-button": "extension", "toolbar-context-pin-to-toolbar": "pin", "toolbar-context-full-screen-autohide": "fullscreen", "toolbar-context-full-screen-exit": "fullscreen-exit", "zen-toolbar-context-set-profile": "container-tab", "edit-contextmenu-undo": "edit-undo", "edit-contextmenu-redo": "edit-redo", "edit-contextmenu-cut": "edit-cut", "edit-contextmenu-copy": "edit-copy", "edit-contextmenu-paste": "edit-paste", "edit-contextmenu-delete": "edit-delete", "edit-contextmenu-select-all": "edit-select-all", "strip-on-share": "link", "unified-extensions-context-menu-move-widget-up": "arrow-up", "unified-extensions-context-menu-move-widget-down": "arrow-down", "unified-extensions-context-menu-manage-extension": "extension", "unified-extensions-context-menu-remove-extension": "edit-delete", "unified-extensions-context-menu-report-extension": "report", context_zenClearSiteData: "forget", context_zenOpenGetAddons: "plus", context_zenOpenSiteSettings: "settings", "open-tab-group-context-menu_moveToThisWindow": "move-tab", "open-tab-group-context-menu_moveToNewWindow": "window", "open-tab-group-context-menu_share": "share", "open-tab-group-context-menu_delete": "edit-delete", "saved-tab-group-context-menu_openInThisWindow": "open", "saved-tab-group-context-menu_openInNewWindow": "window", "saved-tab-group-context-menu_delete": "edit-delete" }, byL10n: { "text-action-select-all": "edit-select-all", "text-action-undo": "edit-undo", "text-action-redo": "edit-redo", "text-action-copy": "edit-copy", "library-media-menu-copy": "edit-copy", "library-downloads-menu-copy": "edit-copy", "text-action-paste": "edit-paste", "text-action-cut": "edit-cut", "text-action-delete": "edit-delete", "library-downloads-menu-trash": "edit-delete", "zen-boost-edit-delete": "edit-delete", "library-downloads-clear-all": "edit-delete", "library-history-clear": "edit-delete", "library-downloads-menu-delete": "edit-delete", "downloads-cmd-delete-file": "edit-delete", "downloads-cmd-remove-from-history": "forget", "downloads-cmd-clear-list": "close-all", "downloads-cmd-clear-downloads": "close-all", "downloads-cmd-copy-download-link": "link", "library-media-menu-open": "ext-link", "library-downloads-menu-open": "ext-link", "library-boosts-menu-edit": "edit", "library-open-legacy": "manage", "zen-boost-save": "share", "zen-panel-ui-workspaces-create": "plus", "downloads-cmd-show-menuitem-2": "folder", "user-context-new-tab": "tab", "user-context-add-container": "container-tab", "user-context-manage-containers": "manage", "tab-context-share-url": "share", "menu-share-copy-links": "link", "menu-file-share-qrcode3": "qr-code", "menu-share-windows": "share", "user-context-add-container2": "container-tab", "user-context-manage-containers2": "manage", "urlbar-input-dismiss-autofill": "close", "urlbar-input-remove-from-history": "forget", "clear-search-history": "forget", "downloads-cmd-pause": "media-pause", "downloads-cmd-resume": "media-play", "downloads-cmd-unblock": "checkmark", "downloads-cmd-use-system-default": "open", "downloads-cmd-go-to-download-page": "ext-link", "zen-site-data-manage-addons": "extension", "library-history-menu-open": "ext-link", "library-history-menu-forget": "edit-delete", "places-forget-domain-data": "forget", "library-downloads-menu-retry": "reload", "library-downloads-menu-clear-preview": "close", "picture-in-picture-move-toggle-left": "arrow-left", "picture-in-picture-move-toggle-right": "arrow-right" } } } };

  // project:src/icon-catalog.mjs
  var DEFAULT_ICON_BASE = "chrome://sine/content/context-menu-editor/";
  function createIconCatalog(baseURL = DEFAULT_ICON_BASE) {
    const base = String(baseURL).replace(/\/?$/u, "/");
    const localFluent = new Map(catalog_default.packs.find((pack) => pack.id === "fluent").icons.map((icon) => [icon.id, base + icon.path]));
    const entries = Object.freeze(catalog_default.packs.flatMap((pack) => pack.icons.map((icon) => {
      if (icon.browserPath && !/^chrome:\/\/browser\/(?:skin|content\/sharing)\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.svg$/u.test(icon.browserPath)) throw new Error("Invalid built-in browser icon reference.");
      return Object.freeze({
        pack: pack.id,
        id: icon.id,
        label: icon.label,
        src: icon.browserPath || base + icon.path,
        ...icon.browserPath ? { fallbackSrc: localFluent.get(icon.id) || localFluent.get("info") } : {},
        tags: Object.freeze([...icon.tags])
      });
    })));
    const byChoice = new Map(entries.map((entry) => [`${entry.pack}:${entry.id}`, entry]));
    return Object.freeze({
      entries,
      find(pack, id2) {
        return byChoice.get(`${pack}:${id2}`) || null;
      },
      mapped(pack, nativeId, l10nId) {
        const mapping = catalog_default.mappings[pack];
        if (!mapping) return null;
        const id2 = typeof nativeId === "string" && Object.hasOwn(mapping.byId, nativeId) ? mapping.byId[nativeId] : typeof l10nId === "string" && Object.hasOwn(mapping.byL10n, l10nId) ? mapping.byL10n[l10nId] : null;
        return id2 ? byChoice.get(`${pack}:${id2}`) || null : null;
      }
    });
  }

  // project:src/icons.mjs
  var LOCAL_LIMIT = 5 * 1024 * 1024;
  var URL_LIMIT = 256 * 1024;
  var MAX_DIMENSION = 4096;
  var DEADLINE = 8e3;
  var PNG_PREFIX = "data:image/png;base64,";
  var SVG_NS = "http://www.w3.org/2000/svg";
  var IMAGE_SCHEMES = /^(?:chrome:|resource:|moz-extension:|https?:|data:image\/)/iu;
  var FAMILIES = [
    ["edit-copy", /\bcopy\b/u],
    ["edit-cut", /\bcut\b/u],
    ["edit-paste", /\bpaste\b/u],
    ["edit-undo", /\bundo\b/u],
    ["edit-redo", /\bredo\b/u],
    ["edit-delete", /\b(?:delete|remove|trash)\b/u],
    ["save", /\b(?:save|download|export)\b/u],
    ["translations", /\b(?:translate|translation|translations)\b/u],
    ["spell-check", /\b(?:define|definition|dictionary|spell)\b/u],
    ["search-glass", /\b(?:search|find)\b/u],
    ["print", /\bprint\b/u],
    ["bookmark", /\bbookmark\b/u],
    ["share", /\bshare\b/u],
    ["open", /\bopen\b/u],
    ["settings", /\b(?:settings|configure|preferences)\b/u],
    ["edit", /\b(?:edit|rename)\b/u],
    ["close", /\bclose\b/u],
    ["hide", /\bhide\b/u],
    ["reload", /\b(?:reload|refresh)\b/u],
    ["pin", /\bpin\b/u],
    ["unpin", /\bunpin\b/u],
    ["help", /\bhelp\b/u]
  ];
  function textIcon(value, window2) {
    if (typeof value !== "string" || value.length > 64) throw new Error("Use 1–8 short Unicode symbols.");
    const text = value.trim();
    if (!text || /[\p{Cc}\p{Cs}\p{Zl}\p{Zp}]/u.test(text)) throw new Error("Use 1–8 short Unicode symbols.");
    const Segmenter = window2.Intl?.Segmenter || Intl.Segmenter;
    const count = [...new Segmenter(void 0, { granularity: "grapheme" }).segment(text)].length;
    if (count < 1 || count > 8) throw new Error("Use 1–8 short Unicode symbols.");
    return { kind: "text", text };
  }
  var pngVerdicts = /* @__PURE__ */ new Map();
  function normalizedPNG(data, window2) {
    if (typeof data !== "string") return false;
    if (pngVerdicts.has(data)) return pngVerdicts.get(data);
    const verdict = checkPNG(data, window2);
    if (pngVerdicts.size >= 256) pngVerdicts.delete(pngVerdicts.keys().next().value);
    pngVerdicts.set(data, verdict);
    return verdict;
  }
  function checkPNG(data, window2) {
    if (typeof data !== "string" || data.length > 8192 || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/u.test(data)) return false;
    let bytes2;
    try {
      bytes2 = window2.atob(data.slice(PNG_PREFIX.length));
    } catch {
      return false;
    }
    return bytes2.length >= 24 && bytes2.slice(0, 8) === "PNG\r\n\n" && bytes2.slice(12, 16) === "IHDR" && readString32(bytes2, 16) === 32 && readString32(bytes2, 20) === 32;
  }
  function readString32(bytes2, offset) {
    return bytes2.charCodeAt(offset) * 16777216 + bytes2.charCodeAt(offset + 1) * 65536 + bytes2.charCodeAt(offset + 2) * 256 + bytes2.charCodeAt(offset + 3);
  }
  function dimensions(width, height) {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw new Error("This image has invalid dimensions.");
    if (width > MAX_DIMENSION || height > MAX_DIMENSION) throw new Error("Use an image no larger than 4096 pixels per side.");
  }
  function httpsURL(value, window2) {
    let url;
    try {
      if (typeof value !== "string" || value.length > 4096) throw new Error();
      url = new window2.URL(value.trim());
    } catch {
      throw new Error("Use a valid HTTPS image link.");
    }
    if (url.protocol !== "https:") throw new Error("Use an HTTPS image link.");
    if (url.username || url.password) throw new Error("Use an image link without credentials.");
    return url.href;
  }
  function semanticIcon(descriptor) {
    const words = [descriptor.nativeId, descriptor.key, descriptor.label].filter((value) => typeof value === "string").map((value) => value.replace(/([a-z])([A-Z])/gu, "$1 $2").replace(/[_:\-.]/gu, " ").toLowerCase()).join(" ");
    const matches = FAMILIES.filter(([, pattern]) => pattern.test(words));
    return matches.length === 1 ? matches[0][0] : null;
  }
  function createIconService(window2, { baseURL = DEFAULT_ICON_BASE, fetch: fetchOption } = {}) {
    const catalog = createIconCatalog(baseURL);
    const fetchImage = fetchOption || window2.fetch?.bind(window2);
    const abortError = () => new window2.DOMException("Icon import cancelled.", "AbortError");
    const check = (signal) => {
      if (signal.aborted) throw signal.reason || abortError();
    };
    function asset(entry, source) {
      return entry ? { type: "image", src: entry.src, monochrome: true, source, ...entry.fallbackSrc ? { fallbackSrc: entry.fallbackSrc } : {} } : null;
    }
    function resolve(descriptor = {}, record = {}, options = {}) {
      if (record.iconOwner) {
        if (record.showIcon !== false && typeof descriptor.iconURL === "string" && descriptor.iconURL.length <= LOCAL_LIMIT && IMAGE_SCHEMES.test(descriptor.iconURL)) return { type: "image", src: descriptor.iconURL, monochrome: false, source: "owner" };
        return null;
      }
      if (options.showIcons === false || record.showIcon === false || descriptor.kind === "separator" || record.kind === "separator") return null;
      const icon = record.icon;
      if (icon?.kind === "asset") {
        const selected = catalog.find(icon.pack, icon.id);
        if (selected) return asset(selected, "custom");
      } else if (icon?.kind === "image" && normalizedPNG(icon.data, window2)) {
        return { type: "image", src: icon.data, monochrome: false, source: "custom" };
      } else if (icon?.kind === "text") {
        try {
          return { type: "text", text: textIcon(icon.text, window2).text, source: "custom" };
        } catch {
        }
      }
      const pack = options.iconPack === "zen" ? "zen" : "fluent";
      const exact = catalog.mapped(pack, descriptor.nativeId, descriptor.l10nId);
      if (exact) return asset(exact, "builtin");
      if (typeof descriptor.iconURL === "string" && descriptor.iconURL.length <= LOCAL_LIMIT && IMAGE_SCHEMES.test(descriptor.iconURL)) {
        return { type: "image", src: descriptor.iconURL, monochrome: options.monochromeExtensions === true, source: "owner" };
      }
      const family = semanticIcon(descriptor);
      if (family) {
        const entry = catalog.find(pack, family);
        if (entry) return asset(entry, "semantic");
      }
      const container = ["submenu", "native-menu"].includes(record.kind || descriptor.kind);
      return asset(catalog.find(pack, container ? "menu" : "info"), "fallback");
    }
    async function bounded(work, callerSignal) {
      if (callerSignal?.aborted) throw abortError();
      const controller = new window2.AbortController();
      let timer, rejectAbort;
      const aborted = new Promise((_, reject) => {
        rejectAbort = reject;
      });
      const onAbort = () => rejectAbort(controller.signal.reason || abortError());
      const cancel = () => controller.abort(abortError());
      controller.signal.addEventListener("abort", onAbort, { once: true });
      callerSignal?.addEventListener("abort", cancel, { once: true });
      timer = window2.setTimeout(() => controller.abort(new Error("Image took too long. Try a smaller image.")), DEADLINE);
      try {
        return await Promise.race([Promise.resolve().then(() => {
          check(controller.signal);
          return work(controller.signal);
        }), aborted]);
      } finally {
        window2.clearTimeout(timer);
        callerSignal?.removeEventListener("abort", cancel);
        controller.signal.removeEventListener("abort", onAbort);
      }
    }
    function readBlob(blob, signal) {
      check(signal);
      if (!blob || typeof blob.size !== "number" || blob.size <= 0) throw new Error("Choose an image file.");
      if (blob.size > LOCAL_LIMIT) throw new Error("Use an image no larger than 5 MiB.");
      return new Promise((resolve2, reject) => {
        const reader = new window2.FileReader();
        const cleanup = () => {
          signal.removeEventListener("abort", cancel);
          reader.onload = reader.onerror = reader.onabort = null;
        };
        const cancel = () => {
          reader.abort();
          cleanup();
          reject(signal.reason || abortError());
        };
        reader.onload = () => {
          const bytes2 = new Uint8Array(reader.result);
          cleanup();
          resolve2(bytes2);
        };
        reader.onerror = () => {
          cleanup();
          reject(new Error("Could not read this image."));
        };
        reader.onabort = () => {
          cleanup();
          reject(signal.reason || abortError());
        };
        signal.addEventListener("abort", cancel, { once: true });
        try {
          reader.readAsArrayBuffer(blob);
        } catch {
          cleanup();
          reject(new Error("Choose an image file."));
        }
      });
    }
    async function readURL(value, signal) {
      const url = httpsURL(value, window2);
      if (!fetchImage) throw new Error("Image links are unavailable here. Choose a file.");
      let response;
      try {
        response = await fetchImage(url, { credentials: "omit", referrerPolicy: "no-referrer", redirect: "error", signal });
      } catch (error) {
        check(signal);
        throw new Error("Could not load this image link.");
      }
      check(signal);
      if (response.redirected || response.url && response.url !== url) throw new Error("Use a direct image link without redirects.");
      if (!response.ok) throw new Error("Could not load this image link.");
      const declared = Number(response.headers?.get("content-length"));
      if (Number.isFinite(declared) && declared > URL_LIMIT) {
        response.body?.cancel()?.catch?.(() => {
        });
        throw new Error("Use an image link no larger than 256 KiB.");
      }
      if (!response.body?.getReader) throw new Error("Could not read this image link safely. Choose a file.");
      const reader = response.body.getReader(), chunks = [];
      let total = 0, complete = false;
      const cancel = () => {
        reader.cancel().catch(() => {
        });
      };
      signal.addEventListener("abort", cancel, { once: true });
      try {
        while (true) {
          check(signal);
          const { value: chunk, done } = await reader.read();
          check(signal);
          if (done) {
            complete = true;
            break;
          }
          total += chunk.byteLength;
          if (total > URL_LIMIT) throw new Error("Use an image link no larger than 256 KiB.");
          chunks.push(chunk);
        }
        if (!total) throw new Error("This image link is empty.");
        const bytes2 = new Uint8Array(total);
        let offset = 0;
        for (const chunk of chunks) {
          bytes2.set(chunk, offset);
          offset += chunk.byteLength;
        }
        return bytes2;
      } finally {
        signal.removeEventListener("abort", cancel);
        if (!complete) cancel();
        reader.releaseLock();
      }
    }
    function pasteBytes(value) {
      const match = /^data:(image\/(?:png|jpeg|gif|webp|svg\+xml))(;base64)?,([\s\S]*)$/iu.exec(value);
      if (!match) throw new Error("Paste an image or a short Unicode symbol.");
      if (match[3].length > Math.ceil(LOCAL_LIMIT / 3) * 4) throw new Error("Use an image no larger than 5 MiB.");
      let bytes2;
      try {
        if (match[2]) {
          if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(match[3])) throw new Error();
          const raw = window2.atob(match[3]);
          bytes2 = Uint8Array.from(raw, (c) => c.charCodeAt(0));
        } else bytes2 = new TextEncoder().encode(decodeURIComponent(match[3]));
      } catch {
        throw new Error("This pasted image is invalid.");
      }
      if (bytes2.byteLength > LOCAL_LIMIT) throw new Error("Use an image no larger than 5 MiB.");
      return bytes2;
    }
    function validateSVG(text) {
      if (/<!DOCTYPE|<!ENTITY/iu.test(text)) throw new Error("Use an SVG without active or external content.");
      const doc = new window2.DOMParser().parseFromString(text, "image/svg+xml"), root = doc.documentElement;
      if (root.localName !== "svg" || root.namespaceURI !== SVG_NS || doc.querySelector("parsererror")) throw new Error("This SVG image is invalid.");
      const forbidden = /* @__PURE__ */ new Set(["script", "foreignobject", "image", "iframe", "object", "embed", "audio", "video", "animate", "animatemotion", "animatetransform", "set", "mpath"]);
      for (const element of [root, ...root.querySelectorAll("*")]) {
        if (element.namespaceURI !== SVG_NS || forbidden.has(element.localName.toLowerCase())) throw new Error("Use an SVG without active or external content.");
        for (const attr of element.attributes) {
          const name = attr.localName.toLowerCase(), value = attr.value.trim();
          if (name.startsWith("on") || name === "base" || value.includes("\\") || (name === "href" || name === "src") && !/^#[A-Za-z0-9_.:-]+$/u.test(value)) throw new Error("Use an SVG without active or external content.");
          validateLocalURLs(value);
          if (name === "style" && /[\\@]|(?:expression|javascript)\s*[:(]/iu.test(value)) throw new Error("Use an SVG without active styles.");
        }
        if (element.localName === "style") {
          const css = element.textContent;
          if (/[\\@]|(?:expression|javascript)\s*[:(]/iu.test(css)) throw new Error("Use an SVG without active or external styles.");
          validateLocalURLs(css);
        }
      }
      const instructions = doc.createTreeWalker(doc, window2.NodeFilter.SHOW_PROCESSING_INSTRUCTION);
      if (instructions.nextNode()) throw new Error("Use an SVG without external styles.");
      for (const name of ["width", "height"]) {
        const value = root.getAttribute(name);
        if (value && /^[+\d.]+(?:px)?$/u.test(value) && Number.parseFloat(value) > MAX_DIMENSION) throw new Error("Use an image no larger than 4096 pixels per side.");
      }
    }
    function validateLocalURLs(value) {
      const opening = /url\s*\(/giu;
      let match;
      while (match = opening.exec(value)) {
        const local = /^\s*(?:"#[A-Za-z0-9_.:-]+"|'#[A-Za-z0-9_.:-]+'|#[A-Za-z0-9_.:-]+)\s*\)/u.exec(value.slice(opening.lastIndex));
        if (!local) throw new Error("Use an SVG with only local fragment image links. External or malformed links are unsupported.");
        opening.lastIndex += local[0].length;
      }
    }
    function jpegDimensions(bytes2, view) {
      let offset = 2;
      while (offset < bytes2.byteLength) {
        if (bytes2[offset++] !== 255) break;
        while (bytes2[offset] === 255) offset++;
        const marker = bytes2[offset++];
        if (marker === 217 || marker === 218) break;
        if (marker === 1 || marker >= 208 && marker <= 215) continue;
        if (offset + 2 > bytes2.byteLength) break;
        const length = view.getUint16(offset);
        if (length < 2 || offset + length > bytes2.byteLength) break;
        if ([192, 193, 194, 195, 197, 198, 199, 201, 202, 203, 205, 206, 207].includes(marker) && length >= 8) {
          dimensions(view.getUint16(offset + 5), view.getUint16(offset + 3));
          return;
        }
        offset += length;
      }
    }
    function webpDimensions(bytes2, view) {
      let offset = 12;
      while (offset + 8 <= bytes2.byteLength) {
        const kind = String.fromCharCode(...bytes2.slice(offset, offset + 4)), length = view.getUint32(offset + 4, true), payload = offset + 8;
        if (payload + length > bytes2.byteLength) break;
        if (kind === "VP8X" && length >= 10) {
          const read24 = (at) => bytes2[at] + (bytes2[at + 1] << 8) + (bytes2[at + 2] << 16);
          dimensions(read24(payload + 4) + 1, read24(payload + 7) + 1);
          return;
        }
        if (kind === "VP8L" && length >= 5 && bytes2[payload] === 47) {
          const bits = view.getUint32(payload + 1, true);
          dimensions((bits & 16383) + 1, (bits >>> 14 & 16383) + 1);
          return;
        }
        if (kind === "VP8 " && length >= 10 && bytes2[payload + 3] === 157 && bytes2[payload + 4] === 1 && bytes2[payload + 5] === 42) {
          dimensions(view.getUint16(payload + 6, true) & 16383, view.getUint16(payload + 8, true) & 16383);
          return;
        }
        offset = payload + length + length % 2;
      }
    }
    function sniff(bytes2) {
      if (!bytes2.byteLength) throw new Error("Choose an image with content.");
      const view = new DataView(bytes2.buffer, bytes2.byteOffset, bytes2.byteLength);
      if (bytes2.byteLength >= 24 && bytes2[0] === 137 && String.fromCharCode(...bytes2.slice(1, 8)) === "PNG\r\n\n") {
        if (String.fromCharCode(...bytes2.slice(12, 16)) !== "IHDR") throw new Error("This PNG image is invalid.");
        dimensions(view.getUint32(16), view.getUint32(20));
        return "image/png";
      }
      if (bytes2.byteLength >= 10 && /GIF8[79]a/u.test(String.fromCharCode(...bytes2.slice(0, 6)))) {
        dimensions(view.getUint16(6, true), view.getUint16(8, true));
        return "image/gif";
      }
      if (bytes2.byteLength >= 3 && bytes2[0] === 255 && bytes2[1] === 216 && bytes2[2] === 255) {
        jpegDimensions(bytes2, view);
        return "image/jpeg";
      }
      if (bytes2.byteLength >= 12 && String.fromCharCode(...bytes2.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes2.slice(8, 12)) === "WEBP") {
        webpDimensions(bytes2, view);
        return "image/webp";
      }
      let text;
      try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(bytes2).replace(/^\uFEFF/u, "").trim();
      } catch {
        throw new Error("Use a PNG, JPEG, GIF, WebP or safe SVG image.");
      }
      if (/^(?:<\?xml[\s\S]*?\?>\s*)?(?:<!--[\s\S]*?-->\s*)*(?:<svg\b|<!DOCTYPE)/iu.test(text)) {
        validateSVG(text);
        return "image/svg+xml";
      }
      throw new Error("Use a PNG, JPEG, GIF, WebP or safe SVG image.");
    }
    function normalize(bytes2, signal) {
      check(signal);
      const mime = sniff(bytes2);
      if (!window2.URL.createObjectURL) throw new Error("Image decoding is unavailable here.");
      const url = window2.URL.createObjectURL(new window2.Blob([bytes2], { type: mime })), image = new window2.Image();
      return new Promise((resolve2, reject) => {
        const cleanup = () => {
          signal.removeEventListener("abort", cancel);
          image.onload = image.onerror = null;
          image.src = "";
          window2.URL.revokeObjectURL(url);
        };
        const fail2 = (error) => {
          cleanup();
          reject(error);
        };
        const cancel = () => fail2(signal.reason || abortError());
        signal.addEventListener("abort", cancel, { once: true });
        image.onerror = () => fail2(new Error("Could not decode this image."));
        image.onload = () => {
          try {
            check(signal);
            dimensions(image.naturalWidth, image.naturalHeight);
            const canvas = window2.document.createElement("canvas");
            canvas.width = canvas.height = 32;
            const context = canvas.getContext("2d");
            if (!context) throw new Error("Image decoding is unavailable here.");
            context.clearRect(0, 0, 32, 32);
            const scale = Math.min(32 / image.naturalWidth, 32 / image.naturalHeight), width = image.naturalWidth * scale, height = image.naturalHeight * scale;
            context.drawImage(image, (32 - width) / 2, (32 - height) / 2, width, height);
            const data = canvas.toDataURL("image/png");
            if (!normalizedPNG(data, window2)) throw new Error("Could not create a small PNG icon.");
            cleanup();
            resolve2({ kind: "image", data });
          } catch (error) {
            fail2(error);
          }
        };
        try {
          image.src = url;
        } catch {
          fail2(new Error("Could not decode this image."));
        }
      });
    }
    return Object.freeze({
      catalog: () => catalog.entries,
      resolve,
      importFile: (file, signal) => bounded(async (inner) => normalize(await readBlob(file, inner), inner), signal),
      importURL: (url, signal) => bounded(async (inner) => normalize(await readURL(url, inner), inner), signal),
      importPaste: (value, signal) => bounded(async (inner) => {
        if (value && typeof value === "object" && typeof value.size === "number") return normalize(await readBlob(value, inner), inner);
        if (typeof value !== "string") throw new Error("Paste an image or a short Unicode symbol.");
        const text = value.trim();
        if (/^data:/iu.test(text)) return normalize(pasteBytes(text), inner);
        if (/^[a-z][a-z0-9+.-]*:\/\//iu.test(text)) return normalize(await readURL(text, inner), inner);
        return textIcon(text, window2);
      }, signal)
    });
  }

  // project:src/registry.mjs
  var ROOTS = Object.freeze([
    { id: "contentAreaContextMenu", label: "Page menu" },
    { id: "tabContextMenu", label: "Tab menu" },
    { id: "placesContext", label: "Bookmarks menu" },
    { id: "zenFolderActions", label: "Folder menu" },
    { id: "zenWorkspaceMoreActions", label: "Space menu" },
    { id: "toolbar-context-menu", label: "Toolbar menu" }
  ]);
  var isHidden = (node) => Boolean(node && ((node.hasAttribute("hidden") ? node.getAttribute("hidden") !== "false" : node.hidden === true) || node.getAttribute("collapsed") === "true"));
  var owned = (node) => node.closest?.("[data-cme-owned]");
  var transient = (node) => node.matches?.(".spell-suggestion, .spell-suggestion-item, .bookmark-item, [data-cme-transient]") || /^(?:spell-suggestion-|spell-add-to-dictionary-|webext-context-menu-(?:.*-)?\d+$)/.test(node.id) || /-menuitem-\d+$/.test(node.id);
  var AI_IDS = /* @__PURE__ */ new Set(["context_askChat", "context-ask-chat", "context-ask-chatgpt", "context-genai"]);
  var SHARE_ANCHORS = ["context_moveTabOptions", "context_shareSelectedTabs"];
  var NATIVE_SHARE_KEY = "native:tab-context-share-url";
  var isTransient = (node) => Boolean(transient(node));
  var digest = (value) => {
    let a = 2166136261, b = 5381;
    for (const char of value) {
      const code = char.codePointAt(0);
      a = Math.imul(a ^ code, 16777619);
      b = Math.imul(b, 33) ^ code;
    }
    return (a >>> 0).toString(36) + (b >>> 0).toString(36);
  };
  function discoverRoot(root, { resolveSource = () => null } = {}) {
    const styles = /* @__PURE__ */ new Map(), style = (node) => {
      if (!styles.has(node)) styles.set(node, node?.ownerDocument?.defaultView?.getComputedStyle(node));
      return styles.get(node);
    };
    const unavailable = (node) => node && (isHidden(node) || node.style?.display === "none" || !node.hasAttribute("hidden") && style(node)?.display === "none" || ["hidden", "collapse"].includes(node.style?.visibility));
    const artwork = (node) => {
      const direct = node.getAttribute("image");
      if (direct) return direct;
      const status = ["checkbox", "radio"].includes(node.getAttribute("type"));
      const slot = status ? null : [...node.children].find((child) => child.matches?.("img.menu-icon,.menu-iconic-icon") && !child.closest("[data-cme-owned]"));
      const image = slot && (slot.getAttribute("src") || slot.getAttribute("srcset"));
      if (image) return image;
      const css = style(node)?.listStyleImage || (!status && slot ? style(slot)?.listStyleImage : null);
      return css?.match(/^url\(["']?(.*?)["']?\)$/)?.[1] || null;
    };
    const items = [], nodes = /* @__PURE__ */ new Map(), meta = /* @__PURE__ */ new Map();
    const all = [...root.querySelectorAll("menuitem,menu,menuseparator,menugroup")].filter((n) => !owned(n));
    const counts = /* @__PURE__ */ new Map();
    for (const n of all) if (n.id) counts.set(n.id, (counts.get(n.id) || 0) + 1);
    const stable = (n) => n?.id && counts.get(n.id) === 1 && !transient(n);
    const sources = new Map(all.map((node) => [node, resolveSource(node)])), signatures = /* @__PURE__ */ new Map(), anonymous = /* @__PURE__ */ new Map(), identities = /* @__PURE__ */ new Map();
    const nativeShareKey = NATIVE_SHARE_KEY;
    const nativeShares = root.id === "tabContextMenu" ? all.filter((node) => {
      const source = sources.get(node);
      return !node.id && !transient(node) && node.parentElement === root && node.localName === "menu" && node.classList.contains("share-tab-url-item") && node.getAttribute("data-l10n-id") === "tab-context-share-url" && (!source || ["unknown", "browser"].includes(source.kind));
    }) : [];
    const anchoredShare = () => {
      const anchored = nativeShares.filter((node) => SHARE_ANCHORS.includes(node.previousElementSibling?.id));
      return anchored.length === 1 ? anchored[0] : null;
    };
    const nativeShare = nativeShares.length === 1 ? nativeShares[0] : nativeShares.length > 1 ? anchoredShare() : null;
    if (nativeShare && !counts.has(nativeShareKey)) {
      identities.set(nativeShare, nativeShareKey);
      sources.set(nativeShare, { kind: "browser", name: "Zen Browser", via: "browser" });
    }
    function identity(node) {
      if (identities.has(node)) return identities.get(node);
      if (stable(node)) {
        identities.set(node, node.id);
        return node.id;
      }
      const source = sources.get(node), label = node.getAttribute("label")?.trim();
      if (node.id || transient(node) || !["menu", "menuitem"].includes(node.localName) || source?.kind !== "mod" || !source.id || !label || label.length > 256) return null;
      const parent = node.parentElement?.closest("menu,menugroup"), parentKey = parent ? identity(parent) : root.id;
      if (!parentKey) return null;
      const signature = JSON.stringify([source.id, parentKey, node.localName, label]), key = `mod:${source.id}:${digest(signature)}`;
      if (key.length > 512) return null;
      const existing = signatures.get(key);
      signatures.set(key, existing === void 0 || existing === signature ? signature : null);
      anonymous.set(key, (anonymous.get(key) || 0) + 1);
      identities.set(node, key);
      return key;
    }
    for (const node of all) identity(node);
    const protectedNodes = /* @__PURE__ */ new Set(), dependencyGroups = /* @__PURE__ */ new Map();
    for (const n of all) if (AI_IDS.has(n.id)) {
      protectedNodes.add(n);
      dependencyGroups.set(n, [n]);
      if (n.nextElementSibling) {
        protectedNodes.add(n.nextElementSibling);
        dependencyGroups.get(n).push(n.nextElementSibling);
      }
    }
    function walk(container, parentKey = null, boundary = null, inherited = null, groupLocked = false) {
      for (const node of container.children) {
        if (owned(node)) continue;
        const tag = node.localName;
        if (tag === "menupopup") {
          walk(node, parentKey, boundary, inherited, groupLocked);
          continue;
        }
        if (!["menu", "menuitem", "menuseparator", "menugroup"].includes(tag)) continue;
        if (node.id === "context-navigation" && tag === "menugroup") {
          walk(node, parentKey, boundary, node, groupLocked);
          continue;
        }
        const key = identities.get(node);
        if (anonymous.has(key) && (anonymous.get(key) !== 1 || !signatures.get(key))) continue;
        if (!key || key.length > 512) continue;
        const locked = groupLocked || tag === "menugroup" || protectedNodes.has(node);
        const kind = tag === "menuseparator" ? "separator" : tag === "menu" || tag === "menugroup" ? "native-menu" : "command";
        const restriction = protectedNodes.has(node) ? "This owner-managed action and its adjacent separator must stay together." : groupLocked || tag === "menugroup" ? "This owner-managed group requires a movement adapter." : boundary ? "Keep this command inside its native submenu to preserve command handling." : "";
        const dependencyGroup = [...dependencyGroups].find(([, members]) => members.includes(node))?.[0].id;
        items.push({ key, kind, label: node.getAttribute("label") || node.getAttribute("aria-label") || (kind === "separator" ? "Separator" : key), parentKey, nativeId: node.id || null, l10nId: node.getAttribute("data-l10n-id") || null, iconURL: artwork(node), available: !unavailable(node) && !unavailable(inherited), boundary, locked, restriction, ...dependencyGroup ? { dependencyGroup } : {} });
        const source = sources.get(node);
        if (source) items[items.length - 1].source = source;
        if (anonymous.has(key)) items[items.length - 1].identity = "mod-label";
        nodes.set(key, node);
        meta.set(key, { navigation: inherited, protected: protectedNodes.has(node) });
        if (kind === "native-menu") walk(node, key, key, inherited, locked);
      }
    }
    walk(root);
    const byNode = new Map(items.map((item) => [nodes.get(item.key), item]));
    return { items, nodes, byNode, meta, protectedNodes, dependencyGroups };
  }

  // project:src/decorated-menus.mjs
  var id = (...ids) => ids.map((value) => ({ id: value }));
  var byClass = (className, l10nId) => ({ className, l10nId });
  var byAnonid = (anonid, l10nId) => ({ anonid, l10nId });
  var byCommand = (command, l10nId) => ({ command, l10nId });
  var byAction = (action, l10nId) => ({ action, l10nId });
  var bare = (...l10nIds) => l10nIds.map((l10nId) => ({ bare: true, l10nId }));
  var DOWNLOAD_STACK = "zen-library-download-stack";
  var DECORATED_MENUS = new Map([
    // Address bar, search field and every other text field in the browser window
    // (toolkit EditContextMenu; the address bar adds Paste & Go, Copy Clean Link
    // and the autofill rows).
    ["textbox-contextmenu", [
      ...id(
        "edit-contextmenu-undo",
        "edit-contextmenu-redo",
        "edit-contextmenu-cut",
        "edit-contextmenu-copy",
        "edit-contextmenu-paste",
        "paste-and-go",
        "strip-on-share",
        "edit-contextmenu-delete",
        "edit-contextmenu-select-all"
      ),
      byAnonid("urlbar-input-dismiss-autofill", "urlbar-input-dismiss-autofill"),
      byAnonid("urlbar-input-remove-from-history", "urlbar-input-remove-from-history"),
      byAnonid("clear-search-history", "clear-search-history")
    ]],
    // Zen Library: a download, a history entry, a media file and a boost.
    [".zen-library-downloads-menu", [
      byAction("open", "library-downloads-menu-open"),
      byAction("show", "downloads-cmd-show-menuitem-2"),
      byAction("copy", "library-downloads-menu-copy"),
      byAction("copy-link", "downloads-cmd-copy-download-link"),
      byAction("unblock", "downloads-cmd-unblock"),
      byAction("hide", "library-downloads-menu-hide"),
      byAction("delete", "library-downloads-menu-delete")
    ]],
    [".zen-library-history-menu", [
      byAction("open", "library-history-menu-open"),
      byAction("forget", "library-history-menu-forget"),
      byAction("forget-site", "places-forget-domain-data")
    ]],
    [".zen-library-media-menu", [
      byAction("open", "library-media-menu-open"),
      byAction("show", "downloads-cmd-show-menuitem-2"),
      byAction("copy", "library-media-menu-copy")
    ]],
    [".zen-library-boosts-menu", [
      byAction("edit", "library-boosts-menu-edit"),
      byAction("export", "zen-boost-save"),
      byAction("delete", "zen-boost-edit-delete")
    ]],
    // A download in the library button's stack (ZenLibraryWidget).
    [DOWNLOAD_STACK, bare(
      "downloads-cmd-pause",
      "downloads-cmd-resume",
      "library-downloads-menu-retry",
      "downloads-cmd-show-menuitem-2",
      "downloads-cmd-go-to-download-page",
      "downloads-cmd-copy-download-link",
      "downloads-cmd-delete-file",
      "downloads-cmd-remove-from-history",
      "library-downloads-menu-clear-preview"
    )],
    // A download in Firefox's downloads panel (when the downloads button is on a toolbar).
    ["downloadsContextMenu", [
      byClass("downloadPauseMenuItem", "downloads-cmd-pause"),
      byClass("downloadResumeMenuItem", "downloads-cmd-resume"),
      byClass("downloadUnblockMenuItem", "downloads-cmd-unblock"),
      byClass("downloadUseSystemDefaultMenuItem", "downloads-cmd-use-system-default"),
      byClass("downloadShowMenuItem", "downloads-cmd-show-menuitem-2"),
      byClass("downloadOpenReferrerMenuItem", "downloads-cmd-go-to-download-page"),
      byClass("downloadCopyLocationMenuItem", "downloads-cmd-copy-download-link"),
      byClass("downloadDeleteFileMenuItem", "downloads-cmd-delete-file"),
      byClass("downloadRemoveFromHistoryMenuItem", "downloads-cmd-remove-from-history"),
      byCommand("downloadsCmd_clearList", "downloads-cmd-clear-list"),
      byCommand("downloadsCmd_clearDownloads", "downloads-cmd-clear-downloads")
    ]],
    // An extension in the extensions panel or Zen's site panel.
    ["unified-extensions-context-menu", id(
      "unified-extensions-context-menu-move-widget-up",
      "unified-extensions-context-menu-move-widget-down",
      "unified-extensions-context-menu-manage-extension",
      "unified-extensions-context-menu-remove-extension",
      "unified-extensions-context-menu-report-extension"
    )],
    // An extension's page action button in the address bar.
    ["pageActionContextMenu", id("pageActionContextMenuManageExtension", "pageActionContextMenuRemoveExtension")],
    // The "…" button in Zen's site panel (click or right-click).
    ["zenSiteDataActions", [
      ...id("context_zenClearSiteData", "context_zenOpenGetAddons", "context_zenOpenSiteSettings"),
      byCommand("Tools:Addons", "zen-site-data-manage-addons")
    ]],
    // Firefox's tab group list (open and saved groups).
    ["open-tab-group-context-menu", id(
      "open-tab-group-context-menu_moveToThisWindow",
      "open-tab-group-context-menu_moveToNewWindow",
      "open-tab-group-context-menu_share",
      "open-tab-group-context-menu_delete"
    )],
    ["saved-tab-group-context-menu", id(
      "saved-tab-group-context-menu_openInThisWindow",
      "saved-tab-group-context-menu_openInNewWindow",
      "saved-tab-group-context-menu_delete"
    )],
    // The Picture-in-Picture toggle on a video. Move follows its left/right label.
    ["pictureInPictureToggleContextMenu", id("context_HidePictureInPictureToggle", "context_MovePictureInPictureToggle")]
  ].map(([menuKey, rows]) => [menuKey, Object.freeze(rows.map(Object.freeze))]));
  var CLASS_MENUS = new Set([...DECORATED_MENUS.keys()].filter((key) => key.startsWith(".")).map((key) => key.slice(1)));
  var l10nIdOf = (node) => node.getAttribute("data-l10n-id") || node.getAttribute("data-lazy-l10n-id") || null;
  function decoratedMenuKey(popup) {
    if (popup?.localName !== "menupopup") return null;
    if (popup.id) return DECORATED_MENUS.has(popup.id) && !popup.id.startsWith(".") && popup.id !== DOWNLOAD_STACK ? popup.id : null;
    for (const name of popup.classList) if (CLASS_MENUS.has(name)) return "." + name;
    return !popup.hasAttribute("class") && popup.parentElement?.id === "mainPopupSet" ? DOWNLOAD_STACK : null;
  }
  function decoratedRow(menuKey, node) {
    const rows = DECORATED_MENUS.get(menuKey);
    if (!rows || !["menu", "menuitem"].includes(node?.localName)) return null;
    if (node.id) return rows.find((row) => row.id === node.id) || null;
    const l10nId = l10nIdOf(node);
    if (!l10nId) return null;
    return rows.find((row) => !row.id && row.l10nId === l10nId && (row.className ? node.classList.contains(row.className) : row.anonid ? node.getAttribute("anonid") === row.anonid : row.command ? node.getAttribute("command") === row.command : row.action ? node.getAttribute("data-action") === row.action : row.bare ? !["class", "anonid", "command", "data-action"].some((name) => node.hasAttribute(name)) : false)) || null;
  }

  // project:src/owner-settings.mjs
  var BROWSER_NAMESPACES = [
    "zen.",
    "browser.",
    "layout.",
    "extensions.",
    "ui.",
    "widget.",
    "network.",
    "privacy.",
    "toolkit.",
    "devtools.",
    "dom.",
    "gfx.",
    "general.",
    "media.",
    "places.",
    "security.",
    "services.",
    "sidebar.",
    "font.",
    "intl.",
    "accessibility.",
    "app.",
    "datareporting.",
    "identity.",
    "signon.",
    "print.",
    "permissions.",
    "javascript.",
    "image.",
    "apz.",
    "mousewheel.",
    "full-screen-api.",
    "findbar.",
    "editor.",
    "content.",
    "nglayout.",
    "pdfjs.",
    "webgl.",
    "svg.",
    "sine.",
    "extension.context-menu-editor."
  ];
  var isBrowserPreference = (name) => BROWSER_NAMESPACES.some((prefix) => name.startsWith(prefix));
  function settingFields(property) {
    const words = property.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[._-]/g, " ").toLowerCase();
    if (/\b(icon|icons|iconset|image|images|artwork)\b/.test(words)) return ["icon"];
    if (/\b(name|names|label|labels|title|titles|scope)\b/.test(words)) return ["name"];
    if (/\b(order|position|positions|arrangement|layout)\b/.test(words)) return ["placement"];
    if (/\b(hidden|hide|visible|visibility|show|enabled)\b/.test(words)) return ["visibility"];
    return [];
  }
  function changedOwnerPlacement(before, after) {
    const prior = new Map(before.map((item) => [item.key, item]));
    const groups = /* @__PURE__ */ new Map(), stationary = /* @__PURE__ */ new Map(), crossedAnchors = /* @__PURE__ */ new Set();
    for (const item of after) {
      const peers = groups.get(item.parentKey) || [];
      peers.push(item.key);
      groups.set(item.parentKey, peers);
    }
    for (const [parent, peers] of groups) {
      const old = before.find((item) => item.parentKey === parent)?.peers || before.filter((item) => item.parentKey === parent).map((item) => item.key);
      const positions = new Map(old.map((key, index) => [key, index]));
      const common = new Set(peers.filter((key) => positions.has(key)));
      const isAnchor = (key) => common.has(key) && !prior.has(key);
      for (const key of peers) {
        if (!prior.has(key) || !positions.has(key)) continue;
        const oldAnchors = old.slice(0, positions.get(key)).filter(isAnchor);
        const newAnchors = peers.slice(0, peers.indexOf(key)).filter(isAnchor);
        if (JSON.stringify(oldAnchors) !== JSON.stringify(newAnchors)) crossedAnchors.add(key);
      }
      const keys = peers.filter((key) => positions.has(key) && prior.has(key) && !crossedAnchors.has(key));
      const tails = [], tailRows = [], parents = [];
      for (let index = 0; index < keys.length; index++) {
        const value = positions.get(keys[index]);
        let left = 0, right = tails.length;
        while (left < right) {
          const middle = left + right >> 1;
          if (tails[middle] < value) left = middle + 1;
          else right = middle;
        }
        parents[index] = left ? tailRows[left - 1] : -1;
        tails[left] = value;
        tailRows[left] = index;
      }
      const stable = /* @__PURE__ */ new Set();
      for (let index = tailRows.at(-1); index !== void 0 && index >= 0; index = parents[index]) stable.add(keys[index]);
      stationary.set(parent, stable);
    }
    return after.filter((item) => prior.has(item.key) && (prior.get(item.key).parentKey !== item.parentKey || crossedAnchors.has(item.key) || !stationary.get(item.parentKey)?.has(item.key))).map(({ key, parentKey }) => ({ key, parentKey }));
  }
  function eligibleMod(mod) {
    return mod?.id !== "context-menu-editor" && typeof mod?.preferences === "string" && /^[\w.-]+$/.test(mod.id) && /^[\w./-]+\.json$/.test(mod.preferences) && !mod.preferences.split("/").includes("..");
  }
  function createOwnerSettingsObserver(window2, { prefs, loadMods, onChange }) {
    let disposed = false, pending = null;
    let bindings = /* @__PURE__ */ new Map();
    const observed = /* @__PURE__ */ new Set();
    const observer = { observe(_subject, _topic, property) {
      if (disposed || typeof property !== "string") return;
      for (const owner of bindings.get(property) || []) {
        if (owner.fields.length) onChange(owner.id, owner.fields);
      }
    } };
    async function declaredPreferences(mod) {
      try {
        const response = await window2.fetch(`chrome://sine/content/${mod.id}/${mod.preferences}`);
        const text = await response.text();
        if (text.length > 256 * 1024) return [];
        const entries = JSON.parse(text);
        if (!Array.isArray(entries)) return [];
        return entries.map((entry) => entry?.property).filter((property) => typeof property === "string" && property && property.length <= 256 && !isBrowserPreference(property));
      } catch {
        return [];
      }
    }
    async function load() {
      try {
        const mods = Object.values(await loadMods() || {}).filter(eligibleMod);
        const declared = await Promise.all(mods.map(async (mod) => [mod.id, await declaredPreferences(mod)]));
        if (disposed) return;
        const next = /* @__PURE__ */ new Map();
        for (const [id2, properties] of declared) {
          for (const property of properties) {
            const owners = next.get(property) || [];
            if (!owners.some((owner) => owner.id === id2)) owners.push({ id: id2, fields: settingFields(property) });
            next.set(property, owners);
          }
        }
        bindings = next;
        const wanted = new Set([...next].filter(([, owners]) => owners.some((owner) => owner.fields.length)).map(([name]) => name));
        for (const name of [...observed]) {
          if (!wanted.has(name)) {
            prefs.removeObserver(name, observer);
            observed.delete(name);
          }
        }
        for (const name of wanted) {
          if (!observed.has(name)) {
            prefs.addObserver(name, observer);
            observed.add(name);
          }
        }
      } catch {
      }
    }
    async function refresh() {
      if (disposed) return;
      if (pending) return pending;
      pending = load();
      try {
        await pending;
      } finally {
        pending = null;
      }
    }
    void refresh();
    return {
      refresh,
      observedPreferences: () => [...observed],
      destroy() {
        if (disposed) return;
        disposed = true;
        for (const name of observed) prefs.removeObserver(name, observer);
        observed.clear();
        bindings.clear();
      }
    };
  }
  function applyOwnerChanges(state, rootId, descriptors, { patches = [], placement = [] }) {
    let next = mergeInventory(state, rootId, descriptors);
    for (const { key, patch } of patches) {
      if (next.roots[rootId].records[key]) next = updateItem(next, rootId, key, patch);
    }
    if (placement.length) {
      next = validateState(next);
      const root = next.roots[rootId], moving = new Set(placement.map((item) => item.key));
      root.children = root.children.filter((key) => !moving.has(key));
      for (const record of Object.values(root.records)) {
        if (record.children) record.children = record.children.filter((key) => !moving.has(key));
      }
      for (const { key, parentKey } of placement) {
        const target = parentKey === null ? root.children : root.records[parentKey]?.children;
        if (!target) throw Error("The owner submenu is unavailable.");
        const peers = descriptors.filter((item) => item.parentKey === parentKey).map((item) => item.key);
        const index = peers.indexOf(key);
        const before = peers.slice(index + 1).find((candidate) => target.includes(candidate));
        const after = peers.slice(0, index).reverse().find((candidate) => target.includes(candidate));
        target.splice(after ? target.indexOf(after) + 1 : before ? target.indexOf(before) : target.length, 0, key);
      }
    }
    return validatePlacement(next, rootId, descriptors);
  }

  // project:src/icon-view.mjs
  function appendFittedSymbol(window2, target, text, size) {
    const symbol = window2.document.createElementNS("http://www.w3.org/1999/xhtml", "span");
    symbol.className = "cme-symbol";
    symbol.setAttribute("aria-hidden", "true");
    symbol.dataset.cmeSymbolSize = String(size);
    symbol.style.cssText = `display:inline-block;position:relative;flex-shrink:0;width:${size}px;height:${size}px`;
    const glyph = window2.document.createElementNS("http://www.w3.org/1999/xhtml", "span");
    glyph.className = "cme-symbol-glyph";
    glyph.textContent = text;
    glyph.style.cssText = "display:block;position:absolute;left:50%;top:50%;white-space:pre;width:max-content;max-width:none;transform-origin:center";
    symbol.append(glyph);
    target.append(symbol);
    fitSymbol(window2, symbol);
    return symbol;
  }
  function fitSymbol(window2, symbol) {
    const target = symbol.parentElement, size = Number(symbol.dataset.cmeSymbolSize), glyph = symbol.querySelector(".cme-symbol-glyph");
    if (!target || !size || !glyph) return;
    glyph.style.transform = "translate(-50%,-50%)";
    const bounds = glyph.getBoundingClientRect(), style = window2.getComputedStyle(target);
    const width = Math.min(size, target.clientWidth - (parseFloat(style.paddingLeft) || 0) - (parseFloat(style.paddingRight) || 0) || size), height = Math.min(size, target.clientHeight - (parseFloat(style.paddingTop) || 0) - (parseFloat(style.paddingBottom) || 0) || size);
    symbol.style.width = `${width}px`;
    symbol.style.height = `${height}px`;
    const measuredWidth = glyph.offsetWidth || bounds.width, measuredHeight = glyph.offsetHeight || bounds.height;
    if (measuredWidth > 0 && measuredHeight > 0) glyph.style.transform = `translate(-50%,-50%) scale(${Math.min(1, width / (measuredWidth + 0.5), height / (measuredHeight + 0.5))})`;
  }

  // project:src/controller.mjs
  var HTML = "http://www.w3.org/1999/xhtml";
  var ROW_TAGS = ["menu", "menuitem", "menuseparator", "menugroup"];
  var REMEMBERED_LIMIT = 200;
  var bool = (node, name) => node.getAttribute(name) === "true" || node[name] === true;
  var presentation = "label.menu-text,label.menu-accel,img.menu-icon";
  function derivedPresentation(record) {
    const target = record.target.nodeType === 1 ? record.target : record.target.parentElement;
    if (target?.closest?.(presentation)) {
      const ownImage = record.type === "attributes" && ["src", "srcset", "style"].includes(record.attributeName) && target.matches?.("img.menu-icon,.menu-iconic-icon");
      return !ownImage;
    }
    const changed = [...record.addedNodes || [], ...record.removedNodes || []];
    return record.type === "childList" && changed.length > 0 && changed.every((node) => node.nodeType === 3 || node.matches?.(presentation));
  }
  function ignorableRecord(c, record) {
    if (record.type !== "attributes") return derivedPresentation(record);
    const name = record.attributeName, target = record.target;
    if (name === "style" && c.owned.has(target.closest?.(".cme-symbol")?.parentElement)) return true;
    if (["_moz-menuactive", "open"].includes(name) && ["menu", "menuitem", "menupopup"].includes(target.localName)) return true;
    if (name === "hasbeenopened" && target.localName === "menupopup") return true;
    return derivedPresentation(record);
  }
  function createMenuController(window2, {
    getState,
    resolveIcon = () => null,
    resolveSource = () => null,
    onInventory = () => {
    },
    onOwnerChange = () => {
    },
    classifyPopup = () => "foreign",
    isNativeRow = () => false
  }) {
    const document2 = window2.document, contexts = /* @__PURE__ */ new Map(), retired = /* @__PURE__ */ new Map(), pendingOpenings = /* @__PURE__ */ new WeakMap(), listeners = /* @__PURE__ */ new Set();
    const decorated = /* @__PURE__ */ new Map(), decorationEpochs = /* @__PURE__ */ new WeakMap();
    let destroyed = false, inventory = [], trigger = null;
    let unowned = /* @__PURE__ */ new WeakSet(), syncQueued = false, rootObserver = null;
    function notify() {
      inventory = [...contexts.values()].map((c) => {
        const absent = [...c.remembered.values()].filter((item) => !c.scan.nodes.has(item.key));
        return { id: c.root.id, label: c.label, items: [...c.scan.items, ...absent.map((item) => ({ ...item, available: false, remembered: true }))] };
      });
      onInventory(inventory);
      for (const fn of listeners) fn(inventory);
    }
    function trimRemembered(c) {
      let excess = [...c.remembered.keys()].filter((key) => !c.scan.nodes.has(key)).length - REMEMBERED_LIMIT;
      if (excess <= 0) return;
      const records = getState()?.roots?.[c.root.id]?.records || {};
      for (const key of [...c.remembered.keys()]) {
        if (excess <= 0) break;
        if (c.scan.nodes.has(key) || recordHasEdits(records[key])) continue;
        c.remembered.delete(key);
        excess--;
      }
    }
    function stopOwnerWindow(pending) {
      if (pending.timer === void 0) return;
      window2.clearTimeout(pending.timer);
      delete pending.timer;
    }
    function settleOwnerWindow(c, id2, pending) {
      if (pending.timer !== void 0) return;
      pending.timer = window2.setTimeout(() => {
        if (c.pendingOwners.get(id2) === pending) c.pendingOwners.delete(id2);
        delete pending.timer;
      }, 2e3);
    }
    function clearOwnerSettingsChanges() {
      for (const c of [...contexts.values(), ...retired.values()]) {
        for (const pending of c.pendingOwners.values()) stopOwnerWindow(pending);
        c.pendingOwners.clear();
      }
    }
    function ownerChanges(c) {
      const patches = [], placementKeys = /* @__PURE__ */ new Set();
      for (const [id2, pending] of c.pendingOwners) {
        if (c.open) settleOwnerWindow(c, id2, pending);
        const patchCount = patches.length, placementCount = placementKeys.size;
        const after = c.scan.items.filter((item) => item.source?.kind === "mod" && item.source.id === id2), before = pending.before;
        for (const item of after) {
          const prior = before.get(item.key);
          if (!prior) continue;
          const patch = {}, fields = pending.remaining.get(item.key) || /* @__PURE__ */ new Set();
          if (fields.has("name") && item.label !== prior.label) {
            patch.name = null;
            fields.delete("name");
          }
          if (fields.has("icon") && item.iconURL !== prior.iconURL) {
            patch.icon = null;
            patch.showIcon = Boolean(item.iconURL);
            patch.iconOwner = true;
            fields.delete("icon");
          }
          if (fields.has("visibility") && item.available !== prior.available) {
            patch.hidden = !item.available;
            patch.removed = false;
            fields.delete("visibility");
          }
          if (Object.keys(patch).length) patches.push({ key: item.key, patch });
        }
        if ([...pending.remaining.values()].some((fields) => fields.has("placement"))) {
          for (const item of changedOwnerPlacement([...before.values()], c.scan.items)) {
            if (!pending.remaining.get(item.key)?.has("placement")) continue;
            placementKeys.add(item.key);
            pending.remaining.get(item.key).delete("placement");
          }
        }
        if ([...pending.remaining.values()].every((fields) => !fields.size)) {
          stopOwnerWindow(pending);
          c.pendingOwners.delete(id2);
        } else if (patches.length > patchCount || placementKeys.size > placementCount) settleOwnerWindow(c, id2, pending);
      }
      const placement = c.scan.items.filter((item) => placementKeys.has(item.key)).map(({ key, parentKey }) => ({ key, parentKey }));
      if (patches.length || placement.length) onOwnerChange(c.root.id, c.scan.items, { patches, placement });
      const peers = /* @__PURE__ */ new Map();
      for (const item of c.scan.items) {
        const group = peers.get(item.parentKey) || [];
        group.push(item.key);
        peers.set(item.parentKey, group);
      }
      const currentOwners = /* @__PURE__ */ new Map();
      for (const item of c.scan.items) {
        if (item.source?.kind === "mod") {
          let owner = currentOwners.get(item.source.id);
          if (!owner) currentOwners.set(item.source.id, owner = /* @__PURE__ */ new Map());
          owner.set(item.key, { ...item, peers: peers.get(item.parentKey) });
        }
        if (item.identity === "mod-label") {
          c.remembered.delete(item.key);
          c.remembered.set(item.key, { ...item });
        }
      }
      trimRemembered(c);
      for (const [id2, current] of currentOwners) {
        for (const [key, item] of c.lastOwners.get(id2) || []) if (!current.has(key)) current.set(key, item);
        c.lastOwners.set(id2, current);
      }
    }
    function noteOwnerSettingsChange(id2, fields) {
      const recorded = { name: ["label"], icon: ["iconURL"], visibility: ["available"], placement: ["parentKey", "peers"] };
      for (const c of [...contexts.values(), ...retired.values()]) {
        const before = c.lastOwners.get(id2);
        if (!before?.size) continue;
        const pending = c.pendingOwners.get(id2) || { before: /* @__PURE__ */ new Map(), remaining: /* @__PURE__ */ new Map() };
        for (const [key, item] of before) {
          const prior = pending.before.get(key) || { ...item }, remaining = pending.remaining.get(key) || /* @__PURE__ */ new Set();
          for (const field of fields) {
            remaining.add(field);
            for (const property of recorded[field] || []) prior[property] = item[property];
          }
          pending.before.set(key, prior);
          pending.remaining.set(key, remaining);
        }
        stopOwnerWindow(pending);
        c.pendingOwners.set(id2, pending);
        if (c.open) settleOwnerWindow(c, id2, pending);
      }
    }
    function adoptForeign(c, records) {
      for (const record of records) {
        if (record.type === "attributes") {
          c.attrs.get(record.target)?.delete(record.attributeName);
          if (record.attributeName === "style") {
            const previous = document2.createElementNS(HTML, "span");
            previous.setAttribute("style", record.oldValue || "");
            for (const [name] of c.styles.get(record.target) || []) {
              if (previous.style.getPropertyValue(name) !== record.target.style.getPropertyValue(name)) c.styles.get(record.target).delete(name);
            }
          }
        }
        if (record.type === "childList") {
          for (const n of record.removedNodes) {
            const move2 = c.moves.get(n);
            if (move2) move2.foreign = true;
          }
          const order = c.sourceOrders?.get(record.target);
          const added = order ? [...record.addedNodes].filter((n) => !order.includes(n) && !c.owned.has(n)) : [];
          if (added.length) {
            const next = order.indexOf(record.nextSibling), previous = order.indexOf(record.previousSibling);
            const index = !record.nextSibling ? order.length : !record.previousSibling ? 0 : next >= 0 ? next : previous >= 0 ? previous + 1 : order.length;
            order.splice(index, 0, ...added);
          }
        }
      }
    }
    function pause(c) {
      adoptForeign(c, c.observer.takeRecords());
      c.observer.disconnect();
    }
    function observe(c) {
      if (!destroyed && c.root.isConnected) c.observer.observe(c.root, { childList: true, subtree: true, attributes: true, attributeOldValue: true });
    }
    function withPaused(c, fn) {
      pause(c);
      try {
        return fn();
      } finally {
        observe(c);
      }
    }
    const descriptorOf = (c, node) => c.scan.byNode.get(node);
    function attr(c, node, name, value) {
      const old = node.getAttribute(name), next = value === null ? null : String(value);
      if (old === next) return;
      let fields = c.attrs.get(node);
      if (!fields) c.attrs.set(node, fields = /* @__PURE__ */ new Map());
      if (!fields.has(name)) fields.set(name, { before: old, applied: next });
      else fields.get(name).applied = next;
      if (next === null) node.removeAttribute(name);
      else node.setAttribute(name, next);
    }
    function style(c, node, name, value) {
      const before = node.style.getPropertyValue(name), priority = node.style.getPropertyPriority(name);
      if (before === value) return;
      let fields = c.styles.get(node);
      if (!fields) c.styles.set(node, fields = /* @__PURE__ */ new Map());
      fields.set(name, { before, priority, applied: value });
      node.style.setProperty(name, value);
    }
    function revertWrites(c) {
      for (const [node, fields] of c.attrs) for (const [name, record] of fields) {
        if (node.getAttribute(name) !== record.applied) continue;
        if (record.before === null) node.removeAttribute(name);
        else node.setAttribute(name, record.before);
      }
      for (const [node, fields] of c.styles) for (const [name, record] of fields) {
        if (node.style.getPropertyValue(name) !== record.applied) continue;
        if (record.before) node.style.setProperty(name, record.before, record.priority);
        else node.style.removeProperty(name);
      }
    }
    function restore(c, keepMenus = false) {
      pause(c);
      const retained = /* @__PURE__ */ new Set();
      if (keepMenus) for (const [key, container] of c.menus) {
        if (c.root.contains(container.menu) && container.popup.parentNode === container.menu) {
          retained.add(container.menu);
          retained.add(container.popup);
        } else c.menus.delete(key);
      }
      revertWrites(c);
      for (const [node] of [...c.positions || []].reverse()) {
        const move2 = c.moves.get(node);
        if (!move2 || move2.foreign || node.parentNode !== move2.appliedParent) continue;
        const siblings = c.sourceOrders.get(move2.parent) || [], index = siblings.indexOf(node);
        const anchor = siblings.slice(index + 1).find((sibling) => sibling.parentNode === move2.parent && !c.moves.get(sibling)?.foreign) || null;
        if (node.parentNode !== move2.parent || node.nextSibling !== anchor) move2.parent.insertBefore(node, anchor);
      }
      for (const container of c.owned) {
        if (!container.isConnected || !["menu", "menupopup"].includes(container.localName)) continue;
        for (const child of [...container.children]) {
          if (c.owned.has(child)) continue;
          if (container.localName !== "menupopup" && ![...ROW_TAGS, "menupopup"].includes(child.localName)) continue;
          const top = container.closest("[data-cme-owned]");
          c.root.insertBefore(child, top?.parentNode === c.root ? top : null);
        }
      }
      for (const node of c.owned) if (!retained.has(node)) node.remove();
      c.attrs.clear();
      c.styles.clear();
      c.moves.clear();
      c.owned = retained;
      if (!keepMenus) c.menus.clear();
      c.positions = null;
      c.sourceOrders = null;
    }
    function move(c, node, parent, before = null) {
      if (!c.moves.has(node)) c.moves.set(node, { ...c.positions?.get(node) || { parent: node.parentNode, next: node.nextSibling }, appliedParent: parent, foreign: false });
      else c.moves.get(node).appliedParent = parent;
      parent.insertBefore(node, before);
    }
    function make(c, tag) {
      const n = document2.createXULElement(tag);
      n.setAttribute("data-cme-owned", "true");
      c.owned.add(n);
      return n;
    }
    function rename(c, node, descriptor, record) {
      if (record.name === void 0 || descriptor.kind === "separator") return;
      attr(c, node, "data-l10n-id", null);
      attr(c, node, "label", record.name);
    }
    function accessKeys(c, container, records) {
      const children = [...container.children].filter((node) => !isHidden(node));
      for (const node of children) {
        const fields = c.attrs.get(node), field = fields?.get("accesskey");
        if (field && node.getAttribute("accesskey") === field.applied) {
          if (field.before === null) node.removeAttribute("accesskey");
          else node.setAttribute("accesskey", field.before);
          fields.delete("accesskey");
        }
        const descriptor = descriptorOf(c, node), name = descriptor && records[descriptor.key]?.name, access = node.getAttribute("accesskey");
        if (name !== void 0 && access && !name.toLocaleLowerCase().includes(access.toLocaleLowerCase())) attr(c, node, "accesskey", null);
      }
      const counts = /* @__PURE__ */ new Map();
      for (const node of children) {
        const key = node.getAttribute("accesskey")?.toLocaleLowerCase();
        if (key) counts.set(key, (counts.get(key) || 0) + 1);
      }
      for (const node of children) {
        const descriptor = descriptorOf(c, node), key = node.getAttribute("accesskey")?.toLocaleLowerCase();
        if (descriptor && records[descriptor.key]?.name !== void 0 && counts.get(key) > 1) attr(c, node, "accesskey", null);
      }
    }
    function decorate(c, node, descriptor, record, options) {
      attr(c, node, "data-cme-item", "true");
      rename(c, node, descriptor, record);
      const preferClean = options.preferCleanLinks && c.root.id === "contentAreaContextMenu";
      const cleanLinkHides = preferClean && (descriptor.key === "context-copylink" && c.cleanLinkAvailable || descriptor.key === "context-stripOnShareLink" && bool(node, "disabled"));
      if (record.hidden || record.removed || options.hideUnavailable && bool(node, "disabled") || !descriptor.available || cleanLinkHides) attr(c, node, "hidden", "true");
      if (descriptor.kind === "separator") return;
      if (record.iconOwner) {
        attr(c, node, "data-cme-icons", "owner");
        return;
      }
      const iconsOff = options.showIcons === false || record.showIcon === false;
      attr(c, node, "data-cme-icons", iconsOff ? "off" : "on");
      if (iconsOff) return;
      const icon = resolveIcon(descriptor, record, options);
      if (icon?.source === "fallback" && ["checkbox", "radio"].includes(node.getAttribute("type"))) return;
      if (icon) prependIcon(c, node, icon, options);
    }
    function prependIcon(c, node, icon, options) {
      const deco = document2.createElementNS(HTML, "span");
      deco.className = "cme-decoration";
      deco.setAttribute("data-cme-icon", "true");
      deco.setAttribute("aria-hidden", "true");
      if (icon.type === "text") deco.textContent = icon.text;
      else if (icon.type === "image") {
        const image = document2.createElementNS(HTML, "img");
        image.setAttribute("src", icon.src);
        image.setAttribute("alt", "");
        if (icon.monochrome) image.setAttribute("data-cme-monochrome", "true");
        if (icon.fallbackSrc) image.addEventListener("error", () => {
          if (destroyed || !deco.isConnected) return;
          c.fallbackWrites.set(image, icon.fallbackSrc);
          image.setAttribute("src", icon.fallbackSrc);
        }, { once: true });
        deco.append(image);
      } else return;
      c.owned.add(deco);
      node.prepend(deco);
      if (icon.type === "text") {
        deco.textContent = "";
        appendFittedSymbol(window2, deco, icon.text, options.iconSize || 16);
      }
    }
    function decorateAnonymousRows(c, popup, options) {
      if (!popup || popup.closest("[data-cme-owned]")) return;
      for (const node of popup.children) {
        if (!["menu", "menuitem"].includes(node.localName) || node.id || c.scan.byNode.has(node) || node.hasAttribute("data-cme-item")) continue;
        const l10nId = node.getAttribute("data-l10n-id");
        if (!l10nId || node.classList.contains("share-tab-url-item") || isTransient(node) || resolveSource(node)?.kind === "mod") continue;
        const descriptor = { kind: node.localName === "menu" ? "native-menu" : "command", nativeId: null, l10nId, label: node.getAttribute("label") || "" };
        const icon = resolveIcon(descriptor, {}, { ...options, showIcons: true });
        if (icon?.source !== "builtin") continue;
        const off = options.showIcons === false;
        attr(c, node, "data-cme-item", "true");
        attr(c, node, "data-cme-icons", off ? "off" : "on");
        if (!off) prependIcon(c, node, icon, options);
      }
    }
    function releaseDecorated(popup) {
      const d = decorated.get(popup);
      if (!d) return;
      decorated.delete(popup);
      revertWrites(d);
      if (!d.hadStyle && popup.getAttribute("style") === "") popup.removeAttribute("style");
      for (const node of d.owned) node.remove();
    }
    function decorateUnmanaged(popup, menuKey, event) {
      const options = { ...getState()?.options };
      if (options.enabled === false || options.showIcons === false || shiftBypass(event, null)) return;
      const rows = [];
      for (const node of popup.children) {
        const row = decoratedRow(menuKey, node);
        if (!row || ["checkbox", "radio"].includes(node.getAttribute("type")) || node.getAttribute("image") || node.classList.contains("menuitem-iconic") || node.hasAttribute("data-cme-owned") || node.hasAttribute("data-cme-item") || node.querySelector(":scope > .cme-decoration") || resolveSource(node)?.kind === "mod") continue;
        const icon = resolveIcon({ kind: node.localName === "menu" ? "native-menu" : "command", nativeId: node.id || null, l10nId: l10nIdOf(node), label: node.getAttribute("label") || "" }, {}, options);
        if (icon?.source === "builtin" && icon.type === "image") rows.push([node, icon]);
      }
      if (!rows.length) return;
      const d = { root: popup, attrs: /* @__PURE__ */ new Map(), styles: /* @__PURE__ */ new Map(), owned: /* @__PURE__ */ new Set(), fallbackWrites: /* @__PURE__ */ new WeakMap(), hadStyle: popup.hasAttribute("style") };
      decorated.set(popup, d);
      attr(d, popup, "data-cme-decorated", menuKey);
      style(d, popup, "--cme-icon-size", `${options.iconSize ?? 16}px`);
      style(d, popup, "--cme-icon-gap", `${options.iconGap ?? 8}px`);
      style(d, popup, "--cme-icon-align", options.iconAlignment || "center");
      for (const [node, icon] of rows) {
        attr(d, node, "data-cme-item", "true");
        attr(d, node, "data-cme-icons", "on");
        prependIcon(d, node, icon, options);
      }
    }
    function queueDecoration(event) {
      const popup = event.target, menuKey = decoratedMenuKey(popup);
      if (!menuKey || popup.parentElement?.closest("menupopup,menu") || popup.closest("[data-cme-owned]")) return;
      releaseDecorated(popup);
      const epoch = (decorationEpochs.get(popup) || 0) + 1;
      decorationEpochs.set(popup, epoch);
      window2.queueMicrotask(() => {
        if (destroyed || decorationEpochs.get(popup) !== epoch || event.defaultPrevented || !popup.isConnected) return;
        if (contexts.get(popup.id)?.root === popup) return;
        decorateUnmanaged(popup, menuKey, event);
      });
    }
    function apply(c) {
      const initial = getState();
      const state = initial?.roots?.[c.root.id]?.legacyHiddenIds?.length ? mergeInventory(initial, c.root.id, c.scan.items) : initial;
      const options = { ...state?.options, hideUnavailable: state?.roots?.[c.root.id]?.hideUnavailable ?? state?.options?.hideUnavailable };
      if (options.enabled === false || c.bypass) {
        restore(c);
        return;
      }
      const saved = state?.roots?.[c.root.id] || { children: [], records: {} }, records = saved.records || {};
      const descriptors = new Map(c.scan.items.map((d) => [d.key, d]));
      const parents = new Map(c.scan.items.map((item) => [item.key, item.parentKey]));
      for (const key of saved.children || []) parents.set(key, null);
      for (const [key, record] of Object.entries(records)) for (const child of record.children || []) parents.set(child, key);
      function usable(key, seen2 = /* @__PURE__ */ new Set()) {
        if (seen2.has(key)) return false;
        seen2.add(key);
        const record = records[key], descriptor = descriptors.get(key), node = c.scan.nodes.get(key);
        if (record?.hidden || record?.removed) return false;
        if (descriptor ? !descriptor.available || !node || bool(node, "disabled") : record?.kind !== "submenu") return false;
        const parent = parents.get(key);
        return parent == null || usable(parent, seen2);
      }
      c.cleanLinkAvailable = usable("context-stripOnShareLink");
      attr(c, c.root, "data-cme-root", c.root.id);
      attr(c, c.root, "data-cme-rounded", String(options.rounded !== false));
      attr(c, c.root, "data-cme-hover", String(options.hoverShade !== false));
      attr(c, c.root, "data-cme-separators", options.showSeparators === false ? "off" : "on");
      style(c, c.root, "--cme-icon-size", `${options.iconSize ?? 16}px`);
      style(c, c.root, "--cme-icon-gap", `${options.iconGap ?? 8}px`);
      style(c, c.root, "--cme-row-spacing", `${options.rowSpacing ?? 2}px`);
      style(c, c.root, "--cme-icon-align", options.iconAlignment || "center");
      style(c, c.root, "--cme-separator-opacity", String(options.separatorOpacity ?? 0.5));
      const seen = /* @__PURE__ */ new Set(), usedMenus = /* @__PURE__ */ new Set(), containers = /* @__PURE__ */ new Set([c.root]), desired = /* @__PURE__ */ new Map(), baseline = /* @__PURE__ */ new Map();
      for (const parent of [c.root, ...c.root.querySelectorAll("menupopup,menugroup")]) baseline.set(parent, [...parent.children]);
      const all = [...c.root.querySelectorAll("*")];
      c.sourceOrders = new Map([c.root, ...all].map((parent) => [parent, [...parent.childNodes]]));
      c.positions = new Map(all.map((node) => [node, { parent: node.parentNode, next: node.nextSibling }]));
      const queue = (parent, node) => {
        if (!desired.has(parent)) desired.set(parent, []);
        desired.get(parent).push(node);
      };
      function placeSubmenu(key, record, parent, boundary) {
        let held = c.menus.get(key);
        if (!held) {
          const menu2 = make(c, "menu"), popup2 = make(c, "menupopup");
          popup2.setAttribute("needsgutter", "true");
          menu2.append(popup2);
          held = { menu: menu2, popup: popup2 };
          c.menus.set(key, held);
        }
        const { menu, popup } = held;
        usedMenus.add(key);
        menu.setAttribute("label", record.name || "Submenu");
        if (menu.parentNode !== parent) parent.append(menu);
        queue(parent, menu);
        containers.add(popup);
        decorate(c, menu, { key, kind: "submenu", label: record.name || "Submenu", available: true }, record, options);
        place(record.children || [], popup, boundary);
        if (![...popup.children].some((n) => n.localName !== "menuseparator" && !isHidden(n))) attr(c, menu, "hidden", "true");
      }
      function place(keys, parent, boundary = null) {
        for (const key of keys) {
          if (seen.has(key)) continue;
          seen.add(key);
          const record = records[key] || {}, descriptor = descriptors.get(key), node = c.scan.nodes.get(key);
          if (!descriptor) {
            if (record.kind === "submenu") placeSubmenu(key, record, parent, boundary);
            else if (record.kind === "separator" && record.owned) {
              const separator = make(c, "menuseparator");
              parent.append(separator);
              queue(parent, separator);
              decorate(c, separator, { key, kind: "separator", available: true }, record, options);
            }
            continue;
          }
          if (descriptor.boundary !== boundary) continue;
          if (descriptor.locked) {
            if (node.parentNode === parent) queue(parent, node);
            continue;
          }
          queue(parent, node);
          if (node.parentNode !== parent) move(c, node, parent);
          decorate(c, node, descriptor, record, options);
          if (c.scan.meta.get(key)?.navigation) {
            attr(c, node, "data-cme-navigation", "true");
            if (!node.getAttribute("label")) {
              attr(c, node, "data-l10n-id", null);
              attr(c, node, "label", node.getAttribute("aria-label") || node.getAttribute("tooltiptext") || descriptor.label);
            }
          }
          if (descriptor.kind === "native-menu") {
            const popup = [...node.children].find((n) => n.localName === "menupopup");
            if (popup) {
              containers.add(popup);
              const children = c.scan.items.filter((d) => d.parentKey === key).map((d) => d.key);
              place([...record.children || [], ...children], popup, key);
            }
          }
        }
      }
      place([...saved.children || [], ...c.scan.items.filter((d) => d.parentKey === null).map((d) => d.key)], c.root);
      for (const [key, held] of c.menus) {
        if (usedMenus.has(key)) continue;
        held.menu.remove();
        c.owned.delete(held.menu);
        c.owned.delete(held.popup);
        c.menus.delete(key);
      }
      const assigned = new Set([...desired.values()].flat());
      for (const [parent, planned] of desired) {
        const original = baseline.get(parent) || [];
        for (let i = 0; i < original.length; i++) {
          const node = original[i];
          if (assigned.has(node) || node.parentNode !== parent) continue;
          let previous = null, next = null;
          for (let j = i - 1; j >= 0 && !previous; j--) if (planned.includes(original[j])) previous = original[j];
          for (let j = i + 1; j < original.length && !next; j++) if (planned.includes(original[j])) next = original[j];
          const index = previous ? planned.indexOf(previous) + 1 : next ? planned.indexOf(next) : planned.length;
          planned.splice(index, 0, node);
        }
        for (const [head, members] of c.scan.dependencyGroups) {
          if (!planned.includes(head)) continue;
          for (const member of members.slice(1)) {
            const index = planned.indexOf(member);
            if (index >= 0) planned.splice(index, 1);
            if (member.parentNode === parent) planned.splice(planned.indexOf(head) + 1, 0, member);
          }
        }
        let cursor = parent.firstElementChild;
        for (const node of planned) {
          if (node !== cursor) move(c, node, parent, cursor);
          cursor = node.nextElementSibling;
        }
      }
      for (const { navigation } of c.scan.meta.values()) if (navigation && !navigation.children.length) attr(c, navigation, "hidden", "true");
      for (const descriptor of c.scan.items) {
        if (descriptor.locked) decorate(c, c.scan.nodes.get(descriptor.key), descriptor, records[descriptor.key] || {}, options);
      }
      for (const container of containers) {
        const children = [...container.children].filter((n) => !isHidden(n));
        let priorSeparator = true;
        for (let i = 0; i < children.length; i++) {
          const node = children[i], separator = node.localName === "menuseparator", descriptor = descriptorOf(c, node);
          const redundant = separator && (priorSeparator || i === children.length - 1);
          if (redundant && !descriptor?.locked && !c.scan.protectedNodes.has(node)) attr(c, node, "hidden", "true");
          else priorSeparator = separator;
        }
        accessKeys(c, container, records);
      }
      for (const popup of [c.root, ...c.root.querySelectorAll("menupopup")]) decorateAnonymousRows(c, popup, options);
    }
    function reconcile(c) {
      if (destroyed || !c.root.isConnected) return;
      restore(c, c.open);
      try {
        c.scan = discoverRoot(c.root, { resolveSource });
        ownerChanges(c);
        if (c.open) apply(c);
        else restore(c);
      } catch (error) {
        restore(c);
        window2.console?.warn?.("Context Menu Editor kept the owner menu after an error.", error);
      } finally {
        observe(c);
        notify();
      }
    }
    function ownerOnlySubmenuChange(c, record) {
      const popup = record.target.closest?.("menupopup");
      if (!popup || popup === c.root) return false;
      if (descriptorOf(c, popup.parentElement)?.kind !== "native-menu") return false;
      const selector = ROW_TAGS.join(",");
      const ownerOnly = (node) => {
        if (node.nodeType !== 1) return true;
        if (node.matches("style,link,script") || node.querySelector("style,link,script")) return false;
        const rows = [...node.querySelectorAll(selector)];
        if (node.matches(selector)) rows.unshift(node);
        return rows.every((row) => !row.id && !c.scan.byNode.has(row) && resolveSource(row)?.kind !== "mod");
      };
      if (record.target !== popup) {
        const row = record.target.closest?.(selector);
        if (!row || !ownerOnly(row)) return false;
      }
      if (record.type === "attributes") return record.target !== popup && ownerOnly(record.target);
      const changed = [...record.addedNodes || [], ...record.removedNodes || []];
      return record.type === "childList" && changed.length > 0 && changed.every(ownerOnly);
    }
    function onRootMutations(c, records) {
      const fallbackTargets = new Set(records.filter((record) => record.type === "attributes" && record.attributeName === "src" && c.fallbackWrites.has(record.target) && record.target.getAttribute("src") === c.fallbackWrites.get(record.target)).map((record) => record.target));
      records = records.filter((record) => !(record.type === "attributes" && record.attributeName === "src" && fallbackTargets.has(record.target)));
      for (const target of fallbackTargets) c.fallbackWrites.delete(target);
      records = records.filter((record) => !ignorableRecord(c, record));
      if (!records.length) return;
      adoptForeign(c, records);
      if (c.open) {
        const ownerOnly = records.filter((record) => ownerOnlySubmenuChange(c, record));
        if (ownerOnly.length) {
          records = records.filter((record) => !ownerOnly.includes(record));
          const state = getState();
          if (state?.options?.enabled !== false && !c.bypass) {
            const saved = state?.roots?.[c.root.id]?.records || {};
            const options = { ...state?.options };
            withPaused(c, () => {
              for (const popup of new Set(ownerOnly.map((record) => record.target.closest("menupopup")))) {
                decorateAnonymousRows(c, popup, options);
                accessKeys(c, popup, saved);
              }
            });
          }
        }
      }
      if (!records.length) return;
      const labelsOnly = records.every((record) => record.type === "attributes" && ["label", "accesskey"].includes(record.attributeName));
      if (c.open && !c.scheduled && labelsOnly && c.reconciliations < 24) {
        c.reconciliations++;
        withPaused(c, () => {
          const targets = new Set(records.map((record) => record.target));
          for (const node of targets) {
            const descriptor = descriptorOf(c, node);
            if (descriptor && records.some((record) => record.target === node && record.attributeName === "label")) {
              descriptor.label = node.getAttribute("label") || node.getAttribute("aria-label") || descriptor.key;
            }
          }
          ownerChanges(c);
          const state = getState(), active = state?.options?.enabled !== false && !c.bypass, saved = state?.roots?.[c.root.id]?.records || {};
          if (!active) return;
          for (const node of targets) {
            const descriptor = descriptorOf(c, node);
            if (descriptor) rename(c, node, descriptor, saved[descriptor.key] || {});
          }
          for (const parent of new Set(records.map((record) => record.target.parentElement).filter(Boolean))) accessKeys(c, parent, saved);
        });
        notify();
        return;
      }
      if (c.scheduled) return;
      c.scheduled = true;
      window2.queueMicrotask(() => {
        c.scheduled = false;
        if (c.open && ++c.reconciliations > 24) c.open = false;
        reconcile(c);
      });
    }
    function attach(root, label, previous) {
      const c = {
        root,
        label,
        scan: discoverRoot(root, { resolveSource }),
        attrs: /* @__PURE__ */ new Map(),
        styles: /* @__PURE__ */ new Map(),
        moves: /* @__PURE__ */ new Map(),
        owned: /* @__PURE__ */ new Set(),
        menus: /* @__PURE__ */ new Map(),
        fallbackWrites: /* @__PURE__ */ new WeakMap(),
        open: false,
        bypass: false,
        epoch: 0,
        scheduled: false,
        reconciliations: 0,
        lastOwners: previous?.lastOwners || /* @__PURE__ */ new Map(),
        pendingOwners: previous?.pendingOwners || /* @__PURE__ */ new Map(),
        remembered: previous?.remembered || /* @__PURE__ */ new Map()
      };
      ownerChanges(c);
      c.observer = new window2.MutationObserver((records) => onRootMutations(c, records));
      contexts.set(root.id, c);
      observe(c);
    }
    const trackedRoot = (node) => contexts.get(node.id)?.root === node;
    function noteSubtree(target) {
      let inside = false;
      for (let popup = target?.nodeType === 1 ? target.closest("menupopup") : null; popup; popup = popup.parentElement?.closest("menupopup")) {
        if (trackedRoot(popup)) inside = true;
        else unowned.delete(popup);
      }
      return inside;
    }
    function staleRoots() {
      for (const [id2, c] of contexts) if (document2.getElementById(id2) !== c.root) return true;
      for (const spec of ROOTS) if (!contexts.has(spec.id) && document2.getElementById(spec.id)) return true;
      for (const id2 of retired.keys()) if (document2.getElementById(id2)?.localName === "menupopup") return true;
      return false;
    }
    function rootRecord(record) {
      if (noteSubtree(record.target)) return false;
      for (const n of record.addedNodes) {
        if (n.nodeType !== 1 || n.hasAttribute("data-cme-owned")) continue;
        if (n.localName === "menupopup" || n.firstElementChild && n.querySelector("menupopup")) return true;
      }
      return false;
    }
    function queueSync() {
      if (syncQueued || destroyed) return;
      syncQueued = true;
      window2.queueMicrotask(() => {
        syncQueued = false;
        sync();
      });
    }
    function popupOwner(root) {
      const kind = classifyPopup(root);
      if (kind === "pending") return void 0;
      if (kind === "native") {
        const added = discoverRoot(root, { resolveSource }).items.find((item) => item.source?.kind === "mod" && !isNativeRow(item.nativeId));
        return added?.source || null;
      }
      const source = resolveSource(root);
      if (source?.kind === "mod") return source;
      return discoverRoot(root, { resolveSource }).items.find((item) => item.source?.kind === "mod")?.source || null;
    }
    function sync(force = false) {
      if (destroyed) return;
      for (const record of rootObserver?.takeRecords() || []) noteSubtree(record.target);
      if (force) unowned = /* @__PURE__ */ new WeakSet();
      let changed = force;
      const specs = new Map(ROOTS.map((spec) => [spec.id, spec]));
      for (const root of document2.querySelectorAll("menupopup[id]")) {
        if (specs.has(root.id) || trackedRoot(root) || unowned.has(root)) continue;
        if (root.parentElement?.closest("menupopup,menu") || root.closest("[data-cme-owned]")) continue;
        const owner = popupOwner(root);
        if (owner) specs.set(root.id, { id: root.id, label: root.getAttribute("label") || `${owner.name} menu` });
        else if (owner === null) unowned.add(root);
      }
      for (const [id2, c] of contexts) if (!specs.has(id2) && c.root.isConnected) specs.set(id2, { id: id2, label: c.label });
      for (const [id2, c] of contexts) {
        if (document2.getElementById(id2) === c.root) continue;
        restore(c);
        c.observer.disconnect();
        contexts.delete(id2);
        retired.set(id2, { label: c.label, lastOwners: c.lastOwners, pendingOwners: c.pendingOwners, remembered: c.remembered });
        changed = true;
      }
      for (const [id2, c] of retired) if (document2.getElementById(id2)?.localName === "menupopup") specs.set(id2, { id: id2, label: c.label });
      for (const spec of specs.values()) {
        const root = document2.getElementById(spec.id), old = contexts.get(spec.id);
        if (old?.root === root || !root) continue;
        attach(root, spec.label, retired.get(spec.id));
        retired.delete(spec.id);
        changed = true;
      }
      if (changed) notify();
    }
    function shiftBypass(event, recent) {
      if (!getState()?.options?.shiftBypass) return false;
      return Boolean(event.shiftKey || event.triggerEvent?.shiftKey || event.target?.triggerEvent?.shiftKey || recent?.shiftKey);
    }
    function onFirstShow(event) {
      const root = event.target;
      if (root?.localName !== "menupopup" || !root.id || root.parentElement?.closest("menupopup,menu") || root.closest("[data-cme-owned]")) return;
      const epoch = (pendingOpenings.get(root) || 0) + 1;
      pendingOpenings.set(root, epoch);
      window2.queueMicrotask(() => {
        if (destroyed || pendingOpenings.get(root) !== epoch || event.defaultPrevented || !root.isConnected) return;
        unowned.delete(root);
        sync();
        const late = contexts.get(root.id);
        if (!late || late.root !== root || late.open) return;
        late.open = true;
        const recent = trigger && window2.performance.now() - trigger.time < 1500 ? trigger : null;
        late.bypass = Boolean(getState()?.options?.shiftBypass && (event.shiftKey || recent?.shiftKey));
        trigger = null;
        late.reconciliations = 0;
        reconcile(late);
      });
    }
    const onShow = (event) => {
      let c = contexts.get(event.target?.id);
      if (c && c.root !== event.target) {
        sync();
        c = contexts.get(event.target?.id);
      }
      if (!c) {
        onFirstShow(event);
        queueDecoration(event);
        return;
      }
      if (c.root !== event.target) return;
      c.epoch++;
      c.reconciliations = 0;
      const epoch = c.epoch;
      restore(c);
      c.open = false;
      const recentTrigger = trigger?.rootId === c.root.id && window2.performance.now() - trigger.time < 1500 ? trigger : null;
      c.bypass = shiftBypass(event, recentTrigger);
      trigger = null;
      window2.queueMicrotask(() => {
        if (destroyed || c.epoch !== epoch || event.defaultPrevented || !c.root.isConnected) {
          observe(c);
          return;
        }
        c.open = true;
        reconcile(c);
      });
    };
    const onHide = (event) => {
      if (event.target) pendingOpenings.set(event.target, (pendingOpenings.get(event.target) || 0) + 1);
      if (decorationEpochs.has(event.target) && (event.type === "popuphiding" || !["open", "showing"].includes(event.target.state))) {
        decorationEpochs.set(event.target, decorationEpochs.get(event.target) + 1);
        releaseDecorated(event.target);
      }
      const c = contexts.get(event.target?.id);
      if (!c || c.root !== event.target) return;
      c.epoch++;
      c.open = false;
      restore(c);
      observe(c);
    };
    const onShown = (event) => {
      const popup = event.target;
      if (popup?.localName !== "menupopup" || !popup.closest("[data-cme-root]")) return;
      popup.querySelectorAll(".cme-decoration > .cme-symbol").forEach((symbol) => fitSymbol(window2, symbol));
    };
    const onContext = (event) => {
      const target = event.target, explicit = target.closest?.("[context]")?.getAttribute("context");
      const rootId = contexts.has(explicit) ? explicit : target.closest?.("tab,.tabbrowser-tab") ? "tabContextMenu" : "contentAreaContextMenu";
      trigger = { rootId, shiftKey: event.shiftKey, time: window2.performance.now() };
    };
    const windowListeners = [["contextmenu", onContext], ["popupshowing", onShow], ["popupshown", onShown], ["popuphiding", onHide], ["popuphidden", onHide]];
    for (const [type, listener] of windowListeners) window2.addEventListener(type, listener, true);
    rootObserver = new window2.MutationObserver((records) => {
      let relevant = false;
      for (const record of records) if (rootRecord(record)) relevant = true;
      if (relevant || !syncQueued && staleRoots()) queueSync();
    });
    rootObserver.observe(document2, { childList: true, subtree: true });
    sync(true);
    const destroy = () => {
      if (destroyed) return;
      destroyed = true;
      rootObserver.disconnect();
      clearOwnerSettingsChanges();
      for (const c of contexts.values()) {
        c.epoch++;
        c.open = false;
        restore(c);
        c.observer.disconnect();
      }
      for (const popup of [...decorated.keys()]) releaseDecorated(popup);
      contexts.clear();
      retired.clear();
      listeners.clear();
      for (const [type, listener] of windowListeners) window2.removeEventListener(type, listener, true);
      window2.removeEventListener("unload", destroy);
    };
    window2.addEventListener("unload", destroy, { once: true });
    return {
      getInventory: () => inventory,
      noteOwnerSettingsChange,
      clearOwnerSettingsChanges,
      refresh() {
        sync(true);
        for (const c of contexts.values()) reconcile(c);
      },
      subscribe(fn) {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
      /** Read-only state for diagnostics and native tests; no DOM or settings access. */
      diagnostics: () => [...contexts.values()].map((c) => ({
        id: c.root.id,
        open: c.open,
        reconciliations: c.reconciliations,
        items: c.scan.items.length,
        remembered: c.remembered.size,
        keys: c.scan.items.map((item) => item.key)
      })),
      destroy
    };
  }

  // project:src/settings-ui.mjs
  var HTML2 = "http://www.w3.org/1999/xhtml";
  var DRAG_TYPE = "application/x-context-menu-editor";
  function createSettingsUI(window2, { store, registry, icons }) {
    const document2 = window2.document;
    const node = (tag, text, attributes = {}) => {
      const el = document2.createElementNS(HTML2, tag);
      if (text !== void 0 && text !== null) el.textContent = text;
      for (const [key, value] of Object.entries(attributes)) el.setAttribute(key, String(value));
      return el;
    };
    const element = node("div", null, { class: "cme-settings", "data-cme-settings": "" });
    function iconImage(src, fallbackSrc) {
      const image = node("img", null, { src, alt: "" });
      if (fallbackSrc) image.addEventListener("error", () => {
        image.src = fallbackSrc;
      }, { once: true });
      return image;
    }
    const status = node("p", "", { class: "cme-status", role: "status", "aria-live": "polite", "data-cme-status": "" });
    const ownerToken = window2.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    status.id = `cme-${ownerToken}-status`;
    const expanded = /* @__PURE__ */ new Set();
    let currentRoot = "", inventory = [], view, expectedRaw, readError, revision = 0;
    let destroyed = false, draft = null, tree = null, query = "", matchIndex = 0, selected = null;
    let dragged = null, autoscroll = null, scrollDirection = 0, statusMessage = "", sequence = 0;
    let inventoryFingerprint = "", inventoryDeferred = false, deferredRefresh = null;
    let popover = null, findOpen = false;
    const fitSymbols = () => element.querySelectorAll(".cme-symbol").forEach((symbol) => fitSymbol(window2, symbol));
    const symbolResize = typeof window2.ResizeObserver === "function" ? new window2.ResizeObserver(fitSymbols) : null;
    symbolResize?.observe(element);
    function announce(message) {
      statusMessage = message;
      status.textContent = message;
      const feedback = popover?.element.querySelector("[data-cme-feedback]");
      if (feedback) feedback.textContent = message;
    }
    function button(text, handler, attrs = {}) {
      const result = node("button", text, { type: "button", ...attrs });
      result.addEventListener("click", handler);
      return result;
    }
    function rootInfo() {
      return inventory.find((root) => root.id === currentRoot);
    }
    function descriptors() {
      return rootInfo()?.items || [];
    }
    function records() {
      return view?.roots[currentRoot]?.records || {};
    }
    function labelFor(key) {
      const record = records()[key], descriptor = descriptors().find((item) => item.key === key);
      const raw = descriptor?.label, label = raw === key ? raw.replace(/^context[-_]?(?:viewsource[-_])?/i, "").replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ") : raw;
      return record?.name || (label ? label[0].toLocaleUpperCase() + label.slice(1) : "") || (record?.kind === "separator" ? "Separator" : record?.kind === "submenu" ? "Submenu" : "Unavailable command");
    }
    function parentOf(key) {
      const root = view?.roots[currentRoot];
      if (!root) return null;
      for (const [parent, record] of Object.entries(root.records)) if (record.children?.includes(key)) return parent;
      return null;
    }
    function childrenOf(parent) {
      return parent === null ? view.roots[currentRoot].children : records()[parent]?.children || [];
    }
    function cancelDraft() {
      if (!draft) return;
      draft.controller?.abort();
      const editor = draft.element;
      draft = null;
      if (popover?.element === editor) closePopover(false);
      else editor.remove();
    }
    function rowFor(key) {
      return [...element.querySelectorAll("[data-cme-key]")].find((row) => row.dataset.cmeKey === key);
    }
    function closePopover(restore = true) {
      const old = popover;
      if (!old) return;
      popover = null;
      if (draft?.element === old.element) {
        draft.controller?.abort();
        draft = null;
        flushDeferredInventory();
      }
      old.trigger?.setAttribute("aria-expanded", "false");
      if (typeof old.element.hidePopover === "function") old.element.hidePopover();
      old.element.remove();
      if (restore && old.trigger?.isConnected) old.trigger.focus();
      flushDeferredInventory();
    }
    function positionPopover() {
      if (!popover) return;
      const { element: panel, trigger } = popover, bounds = trigger.getBoundingClientRect();
      const width = Math.max(0, Math.min(popover.width, window2.innerWidth - 24)), height = window2.innerHeight - 24;
      panel.style.width = `${width}px`;
      panel.style.maxHeight = `${height}px`;
      const measured = panel.getBoundingClientRect(), below = window2.innerHeight - bounds.bottom - 12;
      const top = measured.height <= below ? bounds.bottom + 5 : Math.max(12, bounds.top - measured.height - 5);
      panel.style.left = `${Math.max(12, Math.min(bounds.left, window2.innerWidth - width - 12))}px`;
      panel.style.top = `${Math.min(top, Math.max(12, window2.innerHeight - measured.height - 12))}px`;
    }
    function openPopover(kind, trigger, title, { key = null, width = 330, panel = null } = {}) {
      closePopover(false);
      const popup = panel || node("div");
      popup.classList.add("cme-popover");
      popup.setAttribute("data-cme-popover", kind);
      popup.setAttribute("popover", "manual");
      popup.setAttribute("role", "dialog");
      if (key) popup.dataset.popoverKey = key;
      popup.setAttribute("aria-label", title);
      popup.id = `cme-${ownerToken}-popup`;
      const heading = node("div", null, { class: "cme-popover-heading" });
      heading.append(node("h3", title), button("×", () => closePopover(), { "aria-label": "Close panel", class: "cme-close" }));
      popup.prepend(heading);
      trigger?.setAttribute("aria-expanded", "true");
      trigger?.setAttribute("aria-controls", popup.id);
      popover = { kind, key, element: popup, trigger, width };
      element.append(popup);
      if (typeof popup.showPopover === "function") popup.showPopover();
      positionPopover();
      return popup;
    }
    function focusPopover() {
      (popover?.element.querySelector("button:not(:disabled):not(.cme-close),input:not(:disabled),select:not(:disabled)") || popover?.element.querySelector(".cme-close"))?.focus();
      positionPopover();
    }
    function outsidePointer(event) {
      if (popover && !popover.element.contains(event.target) && !popover.trigger?.contains(event.target)) closePopover(false);
    }
    function popupKey(event) {
      if (!popover) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closePopover();
        return;
      }
      if (!popover.element.contains(event.target)) return;
      if (["actions", "add", "move", "removed"].includes(popover.kind) && ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) && event.target.localName !== "select") {
        const controls = [...popover.element.querySelectorAll("button:not(:disabled):not(.cme-close),select:not(:disabled)")];
        let index = controls.indexOf(document2.activeElement);
        index = event.key === "Home" ? 0 : event.key === "End" ? controls.length - 1 : (index + (event.key === "ArrowUp" ? -1 : 1) + controls.length) % controls.length;
        event.preventDefault();
        controls[index]?.focus();
      }
    }
    document2.addEventListener("pointerdown", outsidePointer, true);
    document2.addEventListener("keydown", popupKey, true);
    window2.addEventListener("resize", positionPopover);
    document2.addEventListener("scroll", positionPopover, true);
    function editedKeys() {
      const keys = draft ? [draft.key] : [];
      for (const input of element.querySelectorAll('[data-action="name"]')) {
        keys.push(input.closest("[data-cme-key]").dataset.cmeKey);
      }
      return keys;
    }
    function sameIdentity(key, nextInventory) {
      const nextRoot = nextInventory.find((root) => root.id === currentRoot);
      if (!nextRoot) return false;
      const record = records()[key];
      if (record?.kind === "submenu" || record?.kind === "separator" && record.owned) return true;
      const before = descriptors().find((item) => item.key === key), after = nextRoot.items.find((item) => item.key === key);
      if (!before) return !after || after.kind === record?.kind;
      return Boolean(after && before.kind === after.kind && before.nativeId === after.nativeId);
    }
    function flushDeferredInventory() {
      if (!inventoryDeferred || deferredRefresh !== null || destroyed) return;
      deferredRefresh = window2.setTimeout(() => {
        deferredRefresh = null;
        if (inventoryDeferred) refresh();
      }, 0);
    }
    function stopScroll() {
      if (autoscroll !== null) window2.clearInterval(autoscroll);
      autoscroll = null;
      scrollDirection = 0;
    }
    function clearDrag() {
      stopScroll();
      dragged = null;
      element.classList.remove("cme-dragging");
      element.querySelectorAll(".cme-drop-active").forEach((el) => el.classList.remove("cme-drop-active"));
    }
    function capturedFocus() {
      const active = document2.activeElement;
      if (!element.contains(active)) return null;
      return { id: active.dataset?.focus, start: active.selectionStart, end: active.selectionEnd };
    }
    function restoreFocus(focus, fallbackKey) {
      const target = focus?.id ? [...element.querySelectorAll("[data-focus]")].find((el) => el.dataset.focus === focus.id) : null;
      const fallback = fallbackKey ? rowFor(fallbackKey)?.querySelector('[data-action="label"]') : null;
      const control = target || fallback;
      control?.focus();
      if (target && typeof focus.start === "number" && target.setSelectionRange) {
        try {
          target.setSelectionRange(focus.start, focus.end);
        } catch {
        }
      }
    }
    function commit(transform, message, fallbackKey) {
      if (destroyed) return false;
      if (readError) {
        announce("Reset saved settings before making changes.");
        return false;
      }
      const focus = capturedFocus(), raw = expectedRaw, reopen = ["appearance", "options", "removed"].includes(popover?.kind) ? popover.kind : null, moreOpen = popover?.element.querySelector(".cme-appearance-more")?.open;
      try {
        inventory = registry.getInventory() || [];
        let merged = view;
        for (const root of inventory) merged = mergeInventory(merged, root.id, root.items);
        let next = transform(merged);
        for (const root of inventory) next = validatePlacement(next, root.id, root.items);
        next = pruneUnsavedAbsentRows(next, store.read().state, merged, inventory);
        store.save(next, raw);
        refresh(true);
        if (reopen) {
          openTopPanel(reopen);
          const more = popover?.element.querySelector(".cme-appearance-more");
          if (more) more.open = Boolean(moreOpen);
          positionPopover();
        }
        announce(message);
        restoreFocus(focus, fallbackKey);
        return true;
      } catch (error) {
        refresh(true);
        announce(error.message || "Could not save this change.");
        return false;
      }
    }
    function itemChange(key, patch, message = "Item updated.") {
      return commit((state) => updateItem(state, currentRoot, key, patch), message, key);
    }
    function optionControl(parent, key, label, help, kind = "checkbox", values) {
      const group = node("div", null, { class: "cme-setting" }), title = node("label", label);
      const id2 = `cme-${ownerToken}-${key}`;
      title.htmlFor = id2;
      let control;
      if (kind === "select") {
        control = node("select");
        for (const [value, text] of values) control.append(node("option", text, { value }));
        control.value = String(view.options[key]);
      } else {
        control = node("input", null, { type: kind });
        if (kind === "checkbox") control.checked = Boolean(key === "hideUnavailable" ? view.roots[currentRoot]?.hideUnavailable ?? view.options[key] : view.options[key]);
        else {
          control.value = String(view.options[key]);
          control.min = values[0];
          control.max = values[1];
          control.step = values[2] || 1;
        }
      }
      control.id = id2;
      control.dataset.option = key;
      control.dataset.focus = `option:${key}`;
      control.setAttribute("aria-describedby", `${id2}-help`);
      control.addEventListener("change", () => {
        const value = kind === "checkbox" ? control.checked : kind === "number" ? Number(control.value) : control.value;
        commit((state) => {
          if (key === "hideUnavailable") return { ...state, roots: { ...state.roots, [currentRoot]: { ...state.roots[currentRoot], hideUnavailable: value } } };
          const next = { ...state, options: { ...state.options, [key]: value } };
          if (["showIcons", "iconPack", "iconSize", "iconAlignment", "iconGap", "monochromeExtensions"].includes(key)) {
            next.roots = Object.fromEntries(Object.entries(state.roots).map(([id3, root]) => [id3, { ...root, records: Object.fromEntries(Object.entries(root.records).map(([item, record]) => {
              const copy = { ...record };
              delete copy.iconOwner;
              return [item, copy];
            })) }]));
          }
          return next;
        }, `${label} updated.`);
      });
      group.append(title, control, node("p", help, { class: "cme-help", id: `${id2}-help` }));
      parent.append(group);
      return control;
    }
    function move(key, parent, index) {
      if (parent !== null) {
        expanded.add(parent);
        for (const ancestor of ancestorKeys(parent)) expanded.add(ancestor);
      }
      return commit((state) => moveItem(state, currentRoot, key, parent, index, descriptors()), `${labelFor(key)} moved.`, key);
    }
    function keyboardMove(key, offset) {
      const parent = parentOf(key), peers = childrenOf(parent), index = peers.indexOf(key);
      if (index + offset < 0 || index + offset >= peers.length) return;
      move(key, parent, index + offset);
    }
    function ancestorKeys(key) {
      const result = [], seen = /* @__PURE__ */ new Set();
      for (let parent = parentOf(key); parent !== null && !seen.has(parent); parent = parentOf(parent)) {
        seen.add(parent);
        result.push(parent);
      }
      return result;
    }
    function applyFind(scroll = true) {
      const search = query.trim().toLocaleLowerCase(), rows = [...element.querySelectorAll("[data-cme-key]")];
      const matches = rows.filter((row) => {
        const key = row.dataset.cmeKey, source = descriptors().find((item) => item.key === key)?.source?.name || "";
        return search && `${labelFor(key)} ${source}`.toLocaleLowerCase().includes(search);
      });
      rows.forEach((row) => row.classList.toggle("cme-match", matches.includes(row)));
      for (const row of matches) for (const key of ancestorKeys(row.dataset.cmeKey)) expanded.add(key);
      updateExpanded();
      matchIndex = matches.length ? (matchIndex % matches.length + matches.length) % matches.length : 0;
      rows.forEach((row) => row.classList.toggle("cme-current-match", row === matches[matchIndex]));
      const count = element.querySelector("[data-cme-find-count]");
      if (count) count.textContent = search ? `${matches.length ? matchIndex + 1 : 0} of ${matches.length}` : "";
      if (scroll) matches[matchIndex]?.scrollIntoView?.({ block: "nearest" });
    }
    function updateExpanded() {
      for (const row of element.querySelectorAll("[data-cme-key]")) {
        row.hidden = ancestorKeys(row.dataset.cmeKey).some((key) => !expanded.has(key));
        const toggle = row.querySelector('[data-action="expand"]');
        if (toggle) {
          const open = expanded.has(row.dataset.cmeKey);
          toggle.textContent = open ? "▾" : "▸";
          toggle.setAttribute("aria-expanded", String(open));
        }
        const inside = row.querySelector('[data-drop="inside"]');
        if (inside) inside.hidden = !expanded.has(row.dataset.cmeKey);
      }
      fitSymbols();
    }
    function decorateIcon(target, descriptor, record) {
      target.replaceChildren();
      try {
        const resolved = icons.resolve(descriptor, { ...record, showIcon: true }, { ...view.options, showIcons: true });
        if (resolved?.type === "image") target.append(iconImage(resolved.src, resolved.fallbackSrc));
        else appendFittedSymbol(window2, target, resolved?.text || "◇", target.classList.contains("cme-icon-preview") ? 32 : 17);
      } catch {
        target.append(node("span", "◇", { "aria-hidden": "true" }));
      }
    }
    function dragStart(event, key) {
      if (!event.dataTransfer) return;
      closePopover(false);
      cancelDraft();
      element.classList.add("cme-dragging");
      dragged = { token: ownerToken, revision, root: currentRoot, key, raw: expectedRaw };
      event.dataTransfer.setData(DRAG_TYPE, JSON.stringify(dragged));
      event.dataTransfer.effectAllowed = "move";
      selected = key;
    }
    function validDrop(event) {
      try {
        const value = JSON.parse(event.dataTransfer?.getData(DRAG_TYPE) || "{}");
        return dragged && value.token === ownerToken && value.revision === revision && value.root === currentRoot && value.key === dragged.key && value.raw === expectedRaw ? value : null;
      } catch {
        return null;
      }
    }
    function dropTarget(row, key, edge) {
      const area = node("div", edge === "inside" ? "Move inside" : "", { class: `cme-drop cme-drop-${edge}`, "data-drop": edge });
      area.addEventListener("dragover", (event) => {
        if (!dragged || dragged.revision !== revision || dragged.root !== currentRoot) return;
        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = "move";
        element.querySelectorAll(".cme-drop-active").forEach((el) => el.classList.remove("cme-drop-active"));
        area.classList.add("cme-drop-active");
      });
      area.addEventListener("dragleave", () => area.classList.remove("cme-drop-active"));
      area.addEventListener("drop", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const data = validDrop(event);
        clearDrag();
        if (!data) {
          announce("This drag is out of date. Try again.");
          return;
        }
        if (data.key === key) return;
        const parent = edge === "inside" ? key : parentOf(key);
        const peers = childrenOf(parent);
        let index = edge === "inside" ? peers.length : peers.indexOf(key) + (edge === "after" ? 1 : 0);
        if (parentOf(data.key) === parent && peers.indexOf(data.key) < index) index--;
        move(data.key, parent, index);
      });
      row.append(area);
    }
    function renderRows(parent = null, depth = 0) {
      const root = view.roots[currentRoot];
      if (!root) return;
      for (const key of childrenOf(parent)) {
        const record = root.records[key];
        if (!record || record.removed) continue;
        const descriptor = descriptors().find((item) => item.key === key), label = labelFor(key);
        const row = node("div", null, { class: `cme-row cme-kind-${record.kind}`, "data-cme-key": key, "data-parent": parent || "" });
        row.style.setProperty("--cme-depth", depth);
        row.addEventListener("focusin", () => {
          selected = key;
          updateAddControls();
        });
        dropTarget(row, key, "before");
        const main = node("div", null, { class: "cme-row-main" });
        const actionButton = (text, action, callback, aria = `${text} ${label}`) => button(text, callback, { "data-action": action, "data-focus": `${key}:${action}`, "aria-label": aria });
        const drag = actionButton("⠿", "drag", () => {
        }, `Drag ${label}`);
        drag.draggable = !descriptor?.locked;
        drag.disabled = Boolean(descriptor?.locked);
        drag.title = descriptor?.restriction || "Drag to move";
        drag.addEventListener("dragstart", (event) => dragStart(event, key));
        drag.addEventListener("dragend", clearDrag);
        main.append(drag);
        const enabled = node("input", null, { type: "checkbox", "data-action": "enabled", "data-focus": `${key}:enabled`, "aria-label": `Enable ${label}` });
        enabled.checked = !record.hidden;
        enabled.addEventListener("change", () => itemChange(key, { hidden: !enabled.checked }, `${label} ${enabled.checked ? "enabled" : "disabled"}.`));
        main.append(enabled);
        if (record.kind !== "separator") {
          const icon = actionButton("", "icon", () => openIconEditor(key), `Edit icon for ${label}`);
          icon.setAttribute("aria-haspopup", "dialog");
          icon.setAttribute("aria-expanded", "false");
          icon.classList.add("cme-icon-button");
          icon.classList.toggle("cme-icon-muted", record.showIcon === false || !view.options.showIcons && !record.iconOwner);
          decorateIcon(icon, descriptor, record);
          main.append(icon);
        } else main.append(node("span", "—", { class: "cme-separator-preview", "aria-hidden": "true" }));
        const name = actionButton(label, "label", () => beginRename(key), `Rename ${label}`);
        name.classList.add("cme-name");
        name.dataset.focus = `${key}:name`;
        name.title = "Click to rename";
        name.addEventListener("keydown", (event) => {
          if (event.key === "F2") {
            event.preventDefault();
            beginRename(key);
          }
        });
        main.append(name);
        const badges = node("span", null, { class: "cme-badges" });
        const source = descriptor?.source, custom = record.kind === "submenu" || record.kind === "separator" && record.owned;
        const sourceName = custom ? "Custom" : source?.kind === "artwork" ? `Icon: ${source.name}` : source?.name || "Source unknown";
        const tag = node("span", sourceName, { class: "cme-source", "data-cme-source": custom ? "custom" : source?.id || source?.kind || "unknown", "aria-label": `Source: ${sourceName}`, title: sourceName });
        tag.hidden = custom || source?.kind === "browser";
        badges.append(tag);
        const unavailable = !descriptor && !custom ? "Not currently available" : descriptor?.available === false ? "Unavailable here" : "";
        if (unavailable) badges.append(node("span", unavailable, { class: "cme-sr-only" }));
        row.title = unavailable;
        main.append(badges);
        if (record.children) {
          const toggle = actionButton("▸", "expand", () => {
            expanded.has(key) ? expanded.delete(key) : expanded.add(key);
            updateExpanded();
          }, `Expand ${label}`);
          toggle.setAttribute("aria-expanded", String(expanded.has(key)));
          main.append(toggle);
        } else main.append(node("span", "", { class: "cme-expand-placeholder", "aria-hidden": "true" }));
        main.append(actionButton("⋯", "more", (event) => openActions(key, event.currentTarget), `Options for ${label}`));
        main.lastChild.setAttribute("aria-haspopup", "dialog");
        main.lastChild.setAttribute("aria-expanded", "false");
        row.classList.toggle("cme-item-hidden", Boolean(record.hidden));
        row.append(main);
        if (record.kind === "submenu") dropTarget(row, key, "inside");
        dropTarget(row, key, "after");
        tree.append(row);
        if (record.children) renderRows(key, depth + 1);
      }
    }
    function beginRename(key) {
      closePopover(false);
      const row = rowFor(key);
      if (!row) return;
      const existing = row.querySelector('[data-action="name"]');
      if (existing) {
        existing.focus();
        existing.select();
        return;
      }
      const label = row.querySelector('[data-action="label"]'), value = labelFor(key);
      const input = node("input", null, { type: "text", class: "cme-name", "data-action": "name", "data-focus": `${key}:name`, "aria-label": `Name for ${value}`, "aria-describedby": status.id, maxlength: 256 });
      input.value = value;
      input.dataset.savedName = value;
      function finish(focus = false) {
        input.value = input.dataset.savedName;
        if (input.isConnected) {
          input.replaceWith(label);
          if (focus) label.focus();
        }
        flushDeferredInventory();
      }
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          const value2 = input.value.trim() || (records()[key]?.kind === "submenu" ? "New submenu" : null);
          itemChange(key, { name: value2 }, "Name saved.");
        }
        if (event.key === "Escape") {
          event.preventDefault();
          finish(true);
        }
      });
      input.addEventListener("blur", () => finish());
      label.replaceWith(input);
      input.focus();
      input.select();
      announce("Enter to save · Escape to cancel.");
    }
    function openActions(key, trigger = rowFor(key)?.querySelector('[data-action="more"]')) {
      const record = records()[key], label = labelFor(key), descriptor = descriptors().find((item) => item.key === key);
      if (!record || !trigger) return;
      selected = key;
      const panel = openPopover("actions", trigger, label, { key }), peers = childrenOf(parentOf(key));
      const action = (text, id2, callback, disabled = false) => {
        const control = button(text, callback, { "data-action": id2 });
        control.disabled = disabled;
        panel.append(control);
      };
      action("Rename", "rename", () => beginRename(key));
      if (record.kind !== "separator") action("Change icon…", "change-icon", () => openIconEditor(key));
      action("Move up", "up", () => keyboardMove(key, -1), descriptor?.locked || peers.indexOf(key) === 0);
      action("Move down", "down", () => keyboardMove(key, 1), descriptor?.locked || peers.indexOf(key) === peers.length - 1);
      action("Move to…", "move", () => openMove(key, trigger), descriptor?.locked);
      action("Reset name", "reset-name", () => itemChange(key, { name: record.kind === "submenu" ? "New submenu" : null }, "Name reset."));
      action("Item details…", "details", () => {
        const details = openPopover("details", trigger, label, { key });
        const custom = record.kind === "submenu" || record.kind === "separator" && record.owned, source = descriptor?.source;
        details.append(node("p", `Source: ${custom ? "Custom" : source?.kind === "artwork" ? `Icon: ${source.name}` : source?.name || "Source unknown"}`), node("code", descriptor?.nativeId || key));
        if (descriptor?.identity === "mod-label") details.append(node("p", "Matched by mod and original label. If its mod changes the label, it appears as a new item.", { class: "cme-help" }));
        if (descriptor?.restriction || descriptor?.locked) details.append(node("p", descriptor.restriction || "This item stays in its original group.", { class: "cme-help" }));
        focusPopover();
      });
      action("Remove", "remove", () => {
        const fallback = [...element.querySelectorAll("[data-cme-key]")].find((other) => other.dataset.cmeKey !== key && !other.hidden)?.dataset.cmeKey;
        commit((state) => removeItem(state, currentRoot, key), `${label} removed.`, fallback);
      });
      if (descriptor?.restriction || descriptor?.locked) panel.append(node("p", descriptor.restriction || "This item stays in its original group.", { class: "cme-help" }));
      focusPopover();
    }
    function openMove(key, trigger) {
      const panel = openPopover("move", trigger, `Move ${labelFor(key)}`, { key });
      const destinations = node("select", null, { "data-action": "move-to", "aria-label": "Destination submenu" });
      destinations.append(node("option", "Choose a destination…", { value: "" }), node("option", "Menu root", { value: "@root" }));
      for (const [candidate, container] of Object.entries(records())) if (container.kind === "submenu" && !container.removed && candidate !== key && !ancestorKeys(candidate).includes(key)) destinations.append(node("option", labelFor(candidate), { value: candidate }));
      destinations.addEventListener("change", () => {
        if (!destinations.value) return;
        const target = destinations.value === "@root" ? null : destinations.value;
        move(key, target, childrenOf(target).length - (parentOf(key) === target ? 1 : 0));
      });
      const parent = parentOf(key), toParent = button("Move to parent", () => {
        if (parent === null) return;
        const next = parentOf(parent);
        move(key, next, childrenOf(next).indexOf(parent) + 1);
      }, { "data-action": "move-parent" });
      toParent.disabled = parent === null;
      panel.append(node("p", "Choose a custom submenu or return to the main menu.", { class: "cme-help" }), destinations, toParent);
      focusPopover();
    }
    function addContext() {
      const parent = selected && records()[selected]?.children ? selected : selected ? parentOf(selected) : null;
      let blocked;
      for (const key of parent === null ? [] : [parent, ...ancestorKeys(parent)]) {
        const descriptor = descriptors().find((item) => item.key === key);
        if (records()[key]?.kind === "native-menu" && descriptor?.locked) {
          blocked = descriptor.restriction || "This group keeps its native children.";
          break;
        }
      }
      return { parent, blocked };
    }
    function updateAddControls() {
      const { blocked } = addContext();
      for (const button2 of element.querySelectorAll("[data-cme-add]")) {
        button2.disabled = !view.roots[currentRoot] || Boolean(blocked);
        button2.title = blocked || "";
      }
      const help = element.querySelector("[data-cme-add-help]");
      if (help) {
        help.textContent = blocked || "Add after the selected item, or inside its submenu.";
      }
    }
    function add2(kind) {
      const { parent, blocked } = addContext();
      if (blocked) {
        announce(blocked);
        return;
      }
      const peers = childrenOf(parent), index = selected && peers.includes(selected) ? peers.indexOf(selected) + 1 : peers.length;
      const key = `custom-${kind}-${window2.crypto?.randomUUID?.() || `${Date.now()}-${++sequence}`}`;
      const success = commit((state) => kind === "submenu" ? addSubmenu(state, currentRoot, "New submenu", parent, index, key) : addSeparator(state, currentRoot, parent, index, key), `${kind === "submenu" ? "Submenu" : "Separator"} added.`, key);
      if (success) {
        expanded.add(key);
        for (const ancestor of ancestorKeys(key)) expanded.add(ancestor);
        updateExpanded();
        selected = key;
        if (kind === "submenu") beginRename(key);
        else rowFor(key)?.querySelector('[data-action="label"]')?.focus();
      }
    }
    function openIconEditor(key) {
      cancelDraft();
      const row = [...element.querySelectorAll("[data-cme-key]")].find((el) => el.dataset.cmeKey === key);
      if (!row) return;
      const record = records()[key], label = labelFor(key), editor = node("div", null, { class: "cme-icon-editor", "data-icon-editor": "", role: "group", "aria-label": `Icon for ${label}` });
      draft = { key, raw: expectedRaw, revision, value: record.icon, show: record.showIcon !== false, element: editor, controller: null, pending: false, valid: true };
      const local = draft;
      editor.append(node("p", record.iconOwner ? "This icon follows its mod. Save here to change it again." : view.options.showIcons ? "Choose an icon, then save." : "Choose an icon, then save. Icons are off in Appearance.", { class: "cme-help" }));
      const preview = node("div", null, { class: "cme-icon-preview", "aria-label": "Icon preview" });
      const draw = () => {
        preview.replaceChildren();
        const value = local.value;
        if (value?.kind === "text") appendFittedSymbol(window2, preview, value.text, 32);
        else if (value?.kind === "image") preview.append(iconImage(value.data));
        else if (value?.kind === "asset") {
          const asset = icons.catalog().find((item) => item.pack === value.pack && item.id === value.id);
          if (asset) preview.append(iconImage(asset.src, asset.fallbackSrc));
        } else decorateIcon(preview, descriptors().find((item) => item.key === key), { ...record, icon: void 0 });
      };
      const draftButton = (text2, action, callback) => button(text2, callback, { "data-icon-action": action, "aria-label": `${text2} icon for ${label}` });
      const automatic = draftButton("Automatic", "automatic", () => {
        local.controller?.abort();
        local.pending = false;
        local.value = void 0;
        local.valid = true;
        local.error = "";
        draw();
        announce("Suggested icon selected. Choose Save icon.");
      });
      const reset2 = draftButton("Reset icon", "reset", () => {
        local.controller?.abort();
        local.pending = false;
        local.value = void 0;
        local.show = true;
        show.checked = true;
        local.valid = true;
        local.error = "";
        draw();
        announce("Suggested icon selected. Choose Save icon.");
      });
      automatic.title = "Use the suggested icon; keep visibility.";
      reset2.title = "Use the suggested icon and show it.";
      const show = node("input", null, { type: "checkbox", "data-icon-show": "", "aria-label": `Show icon for ${label}` });
      show.checked = local.show;
      show.addEventListener("change", () => {
        local.show = show.checked;
      });
      const showLabel = node("label", "Show this icon");
      showLabel.prepend(show);
      const previewBar = node("div", null, { class: "cme-icon-preview-bar" });
      previewBar.append(preview, showLabel, automatic, reset2);
      editor.append(previewBar);
      const tabs = node("div", null, { role: "tablist", "aria-label": "Icon source", class: "cme-icon-tabs" }), panels = {};
      const selectTab = (id2) => {
        for (const [name, panel] of Object.entries(panels)) {
          panel.hidden = name !== id2;
          const tab = tabs.querySelector(`[data-icon-tab="${name}"]`);
          tab.setAttribute("aria-selected", String(name === id2));
          tab.tabIndex = name === id2 ? 0 : -1;
        }
        positionPopover();
      };
      for (const [id2, title] of [["built-in", "Built-in"], ["image", "Image"], ["symbol", "Symbol"]]) {
        const tab = button(title, () => selectTab(id2), { role: "tab", "data-icon-tab": id2, id: `cme-${ownerToken}-tab-${id2}`, "aria-controls": `cme-${ownerToken}-panel-${id2}` });
        tab.addEventListener("keydown", (event) => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
          event.preventDefault();
          const choices = [...tabs.children], index = choices.indexOf(tab), next = choices[event.key === "Home" ? 0 : event.key === "End" ? 2 : (index + (event.key === "ArrowLeft" ? -1 : 1) + 3) % 3];
          next.click();
          next.focus();
        });
        tabs.append(tab);
        panels[id2] = node("div", null, { role: "tabpanel", "data-icon-panel": id2, id: `cme-${ownerToken}-panel-${id2}`, "aria-labelledby": tab.id });
      }
      editor.append(tabs, ...Object.values(panels));
      const gallery = node("div", null, { class: "cme-gallery" });
      const gallerySearch = node("input", null, { type: "search", placeholder: "Find an icon", "aria-label": "Find a built-in icon" }), galleryItems = node("div", null, { class: "cme-gallery-items" });
      const packFilter = node("select", null, { "aria-label": "Built-in icon pack" });
      packFilter.append(node("option", "All packs", { value: "" }), node("option", "FluentUI", { value: "fluent" }), node("option", "ZenUI", { value: "zen" }));
      const renderGallery = () => {
        galleryItems.replaceChildren();
        const search = gallerySearch.value.toLocaleLowerCase();
        for (const asset of icons.catalog().filter((asset2) => (!packFilter.value || asset2.pack === packFilter.value) && `${asset2.label} ${(asset2.tags || []).join(" ")}`.toLocaleLowerCase().includes(search))) {
          const pick = button("", () => {
            local.controller?.abort();
            local.pending = false;
            local.value = { kind: "asset", pack: asset.pack, id: asset.id };
            local.valid = true;
            local.error = "";
            draw();
            announce("Icon ready. Choose Save icon.");
          }, { "data-icon-asset": asset.id, "aria-label": `${asset.label} (${asset.pack})`, title: asset.label });
          pick.append(iconImage(asset.src, asset.fallbackSrc), node("span", asset.label));
          galleryItems.append(pick);
        }
      };
      gallerySearch.addEventListener("input", renderGallery);
      packFilter.addEventListener("change", renderGallery);
      gallery.append(gallerySearch, packFilter, galleryItems);
      panels["built-in"].append(gallery);
      renderGallery();
      async function importValue(method, value) {
        if (destroyed || draft !== local) return;
        local.controller?.abort();
        const controller = new window2.AbortController();
        local.controller = controller;
        local.pending = true;
        local.valid = true;
        announce("Loading icon…");
        try {
          const result = await icons[method](value, controller.signal);
          if (destroyed || draft !== local || controller.signal.aborted || local.controller !== controller) return;
          if (local.raw !== store.read().raw || local.revision !== revision) {
            cancelDraft();
            refresh(true);
            announce("Settings changed. Open the icon editor again.");
            return;
          }
          local.value = result;
          local.pending = false;
          draw();
          announce("Icon ready. Choose Save icon.");
        } catch (error) {
          if (destroyed || draft !== local || controller.signal.aborted || local.controller !== controller) return;
          local.pending = false;
          local.valid = false;
          local.error = error.message || "Could not load this image.";
          announce(local.error);
        }
      }
      const file = node("input", null, { type: "file", accept: "image/*", "data-icon-file": "", "aria-label": `Choose image file for ${label}` });
      file.addEventListener("change", () => {
        if (file.files?.[0]) importValue("importFile", file.files[0]);
      });
      const fileLabel = node("label", "Choose file");
      fileLabel.append(file);
      panels.image.append(fileLabel);
      const url = node("input", null, { type: "url", placeholder: "https://…", "data-icon-url": "", "aria-label": `Image link for ${label}` });
      const urlLabel = node("label", "Image link");
      urlLabel.append(url);
      panels.image.append(urlLabel, draftButton("Load image", "load", () => importValue("importURL", url.value)));
      const paste = draftButton("Paste", "paste", async () => {
        try {
          if (window2.navigator.clipboard?.read) {
            const clipboard = await window2.navigator.clipboard.read();
            const image = clipboard.find((item) => item.types.some((type) => type.startsWith("image/")));
            if (image) {
              const type = image.types.find((type2) => type2.startsWith("image/"));
              return importValue("importPaste", await image.getType(type));
            }
            const text2 = clipboard.find((item) => item.types.includes("text/plain"));
            if (text2) return importValue("importPaste", await (await text2.getType("text/plain")).text());
          }
          if (window2.navigator.clipboard?.readText) return importValue("importPaste", await window2.navigator.clipboard.readText());
          announce("Paste an image or text into this icon editor.");
        } catch (error) {
          announce(error.message || "Clipboard access was unavailable. Paste into this editor.");
        }
      });
      const pasteTarget = node("div", "Click here and paste an image, link or symbol.", { tabindex: 0, contenteditable: "plaintext-only", role: "textbox", "aria-multiline": "false", "data-icon-paste-target": "", class: "cme-paste-target", "aria-label": "Paste an image, link or symbol" });
      panels.image.append(paste, pasteTarget);
      editor.addEventListener("paste", (event) => {
        if (!pasteTarget.contains(event.target) && event.target.closest?.("input,textarea,[contenteditable]")) return;
        const clipboard = event.clipboardData;
        if (!clipboard) return;
        const image = [...clipboard.items || []].find((item) => item.kind === "file" && item.type.startsWith("image/"));
        const value = image?.getAsFile?.() || clipboard.getData("text/plain");
        if (!value) return;
        event.preventDefault();
        importValue("importPaste", value);
      });
      const text = node("input", null, { type: "text", "data-icon-text": "", "aria-label": `Unicode symbol for ${label}`, maxlength: 64 });
      text.value = local.value?.kind === "text" ? local.value.text : "";
      text.addEventListener("input", () => {
        local.controller?.abort();
        local.pending = false;
        try {
          local.value = textIcon(text.value, window2);
          local.valid = true;
          local.error = "";
          draw();
          announce("Symbol ready. Choose Save icon.");
        } catch (error) {
          local.valid = false;
          local.error = error.message;
          announce(local.error);
        }
      });
      const symbolLabel = node("label", "Symbol or emoji");
      symbolLabel.append(text);
      panels.symbol.append(symbolLabel, node("p", "Use 1–8 symbols. They resize to fit.", { class: "cme-help" }));
      selectTab(local.value?.kind === "text" ? "symbol" : local.value?.kind === "image" ? "image" : "built-in");
      const footer = node("div", null, { class: "cme-popover-footer" });
      footer.append(draftButton("Save icon", "save", () => {
        if (local.pending) {
          announce("Wait for this icon to finish loading.");
          return;
        }
        if (!local.valid) {
          announce(local.error || "Choose an icon before saving.");
          return;
        }
        if (draft !== local || local.raw !== store.read().raw || local.revision !== revision) {
          cancelDraft();
          refresh();
          announce("Settings changed. Open the icon editor again.");
          return;
        }
        commit((state) => updateItem(state, currentRoot, key, { icon: local.value || null, showIcon: local.show }), "Icon saved.", key);
      }), draftButton("Cancel", "cancel", () => closePopover()));
      editor.append(node("p", "", { class: "cme-help", "data-cme-feedback": "" }), footer);
      openPopover("icon", row.querySelector('[data-action="icon"]'), `Icon for ${label}`, { key, width: 400, panel: editor });
      draw();
      automatic.focus();
      positionPopover();
    }
    function openTopPanel(kind) {
      const trigger = element.querySelector(`[data-cme-toolbar="${kind === "removed" ? "options" : kind}"]`);
      if (!trigger) return;
      if (popover?.kind === kind) {
        closePopover();
        return;
      }
      const panel = openPopover(kind, trigger, { add: "Add to this menu", appearance: "Appearance", options: "Menu options", removed: "Removed items" }[kind], { width: kind === "appearance" ? 360 : 320 });
      if (kind === "add") {
        panel.append(button("Add submenu", () => add2("submenu"), { "data-cme-add": "submenu" }), button("Add separator", () => add2("separator"), { "data-cme-add": "separator" }), node("p", "", { class: "cme-help", "data-cme-add-help": "" }));
        updateAddControls();
      } else if (kind === "appearance") {
        panel.append(node("p", "Applies to all menus.", { class: "cme-help" }));
        optionControl(panel, "showIcons", "Show icons", "Display artwork beside menu items.");
        optionControl(panel, "iconPack", "Automatic icon pack", "Used for items without a custom icon.", "select", [["fluent", "FluentUI"], ["zen", "ZenUI"]]);
        optionControl(panel, "iconSize", "Icon size", "Artwork size in pixels.", "number", [12, 24]);
        optionControl(panel, "iconAlignment", "Icon alignment", "Position within the icon column.", "select", [["left", "Left"], ["center", "Center"], ["right", "Right"]]);
        optionControl(panel, "iconGap", "Icon spacing", "Gap between icon and text, in pixels.", "number", [0, 16]);
        const more = node("details", null, { class: "cme-appearance-more" });
        more.append(node("summary", "Spacing and style"));
        more.addEventListener("toggle", positionPopover);
        optionControl(more, "rowSpacing", "Row spacing", "Extra vertical space, in pixels.", "number", [0, 8]);
        optionControl(more, "rounded", "Rounded corners", "Round menu item corners.");
        optionControl(more, "hoverShade", "Hover shading", "Shade the item under the pointer.");
        optionControl(more, "showSeparators", "Show separators", "Display enabled separators between items.");
        optionControl(more, "separatorOpacity", "Separator strength", "0 is invisible; 1 is solid.", "number", [0, 1, 0.05]);
        optionControl(more, "monochromeExtensions", "Monochrome extension icons", "Show extension artwork in one color.");
        panel.append(more);
      } else if (kind === "options") {
        panel.append(node("p", "Unavailable commands and restore actions affect this menu. Other switches apply to all menus.", { class: "cme-help" }));
        optionControl(panel, "enabled", "Enable customization", "Use your saved arrangement.");
        optionControl(panel, "hideUnavailable", "Hide unavailable commands", "Hide disabled commands in this menu.");
        optionControl(panel, "preferCleanLinks", "Prefer clean links", "On page menus, use Copy Clean Link when available.");
        optionControl(panel, "shiftBypass", "Shift shows the original menu", "Hold Shift when you right-click.");
        panel.append(button("Restore removed items…", () => openTopPanel("removed"), { "data-cme-restore-removed": "" }));
        const order = button("Restore original order", () => commit((state) => restoreOriginalOrder(state, currentRoot, descriptors()), "Original order restored."), { "data-cme-restore-order": "" });
        const reset2 = button("Reset this menu", () => commit((state) => resetRoot(state, currentRoot), "Menu reset."), { "data-cme-reset-menu": "" });
        order.disabled = reset2.disabled = !view.roots[currentRoot];
        panel.append(order, reset2);
      } else {
        const tombstones = Object.entries(records()).filter(([, record]) => record.removed);
        for (const [key] of tombstones) panel.append(button(`Restore ${labelFor(key)}`, () => commit((state) => restoreItem(state, currentRoot, key), "Item restored.", key), { "data-restore": key }));
        if (!tombstones.length) panel.append(node("p", "No removed items.", { class: "cme-help" }));
      }
      focusPopover();
    }
    function render() {
      element.replaceChildren();
      if (readError) {
        element.append(node("p", "Saved settings could not be read. Your original data is preserved.", { class: "cme-error" }), button("Reset saved settings", () => {
          try {
            store.resetInvalid(expectedRaw);
            refresh();
            announce("Saved settings reset.");
          } catch (error) {
            announce(error.message);
          }
        }));
      }
      const toolbar = node("div", null, { class: "cme-toolbar", "aria-label": "Menu editor controls", role: "group" });
      element.append(toolbar);
      const menuChoice = node("select", null, { "aria-label": "Menu", "data-cme-menu": "", "data-focus": "menu" });
      for (const root of inventory) menuChoice.append(node("option", root.label, { value: root.id }));
      menuChoice.value = currentRoot;
      menuChoice.addEventListener("change", () => {
        currentRoot = menuChoice.value;
        selected = null;
        query = "";
        findOpen = false;
        matchIndex = 0;
        refresh(true);
      });
      toolbar.append(menuChoice);
      for (const [id2, title] of [["add", "Add"], ["appearance", "Appearance"], ["find", "⌕"], ["options", "⋯"]]) {
        const control = button(title, () => {
          if (id2 === "find") {
            findOpen = !findOpen;
            const bar = element.querySelector(".cme-find");
            bar.hidden = !findOpen;
            control.setAttribute("aria-expanded", String(findOpen));
            if (findOpen) bar.querySelector("input").focus();
            else {
              query = "";
              bar.querySelector("input").value = "";
              applyFind(false);
            }
            return;
          }
          openTopPanel(id2);
        }, { "data-cme-toolbar": id2, "data-focus": `toolbar:${id2}`, "aria-label": id2 === "find" ? "Find an item" : id2 === "options" ? "Menu options" : title, "aria-expanded": String(id2 === "find" && findOpen) });
        if (id2 !== "find") control.setAttribute("aria-haspopup", "dialog");
        toolbar.append(control);
      }
      const findbar = node("div", null, { class: "cme-find" }), find = node("input", null, { type: "search", placeholder: "Find in this menu", "aria-label": "Find in this menu", "data-cme-find": "", "data-focus": "find" });
      find.value = query;
      find.addEventListener("input", () => {
        query = find.value;
        matchIndex = 0;
        applyFind();
      });
      findbar.hidden = !findOpen;
      find.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          element.querySelector('[data-cme-toolbar="find"]').click();
          element.querySelector('[data-cme-toolbar="find"]').focus();
        }
        if (event.key === "Enter") {
          event.preventDefault();
          matchIndex += event.shiftKey ? -1 : 1;
          applyFind();
        }
      });
      findbar.append(find, button("↑", () => {
        matchIndex--;
        applyFind();
      }, { "aria-label": "Previous match" }), button("↓", () => {
        matchIndex++;
        applyFind();
      }, { "aria-label": "Next match" }), node("span", "", { "data-cme-find-count": "", "aria-live": "polite" }));
      element.append(findbar);
      tree = node("div", null, { class: "cme-tree", "data-cme-tree": "", "aria-label": "Editable menu items" });
      tree.addEventListener("dragover", (event) => {
        if (!dragged) return;
        const bounds = tree.getBoundingClientRect(), direction = event.clientY < bounds.top + 32 ? -1 : event.clientY > bounds.bottom - 32 ? 1 : 0;
        if (direction === scrollDirection) return;
        stopScroll();
        scrollDirection = direction;
        if (direction) autoscroll = window2.setInterval(() => {
          tree.scrollTop += direction * 12;
        }, 40);
      }, true);
      tree.addEventListener("dragleave", (event) => {
        if (!tree.contains(event.relatedTarget)) stopScroll();
      });
      tree.addEventListener("drop", stopScroll);
      element.append(tree);
      renderRows();
      if (!inventory.length) tree.append(node("p", "Open a supported browser menu to discover its items.", { class: "cme-help" }));
      const footer = node("div", null, { class: "cme-footer" });
      footer.append(button("Undo", () => {
        try {
          store.undo();
          refresh(true);
          announce("Last change undone.");
        } catch (error) {
          announce(error.message || "Could not undo.");
        }
      }, { "data-cme-undo": "", "data-focus": "undo" }), node("span", "Drag to move · Click a name or icon to edit", { class: "cme-help" }));
      element.append(footer);
      status.textContent = statusMessage;
      element.append(status);
      updateExpanded();
      applyFind(false);
      if (readError) element.querySelectorAll("input,select,button").forEach((control) => {
        if (control.textContent !== "Reset saved settings") control.disabled = true;
      });
      fitSymbols();
    }
    function refresh(force = false) {
      if (destroyed) return;
      const focus = capturedFocus(), saved = store.read();
      const nextInventory = registry.getInventory() || [], fingerprint = JSON.stringify(nextInventory);
      if (force !== true && view && saved.raw === expectedRaw && saved.error === readError) {
        if (fingerprint === inventoryFingerprint) {
          inventoryDeferred = false;
          return;
        }
        const edits = editedKeys();
        if (popover && (!popover.key || sameIdentity(popover.key, nextInventory))) {
          inventoryDeferred = true;
          return;
        }
        if (edits.length && edits.every((key) => sameIdentity(key, nextInventory))) {
          inventoryDeferred = true;
          return;
        }
      }
      expectedRaw = saved.raw;
      readError = saved.error;
      inventory = nextInventory;
      inventoryFingerprint = fingerprint;
      inventoryDeferred = false;
      let next = saved.state || createState();
      for (const root of inventory) next = mergeInventory(next, root.id, root.items);
      view = next;
      if (!inventory.some((root) => root.id === currentRoot)) currentRoot = inventory[0]?.id || "";
      revision++;
      cancelDraft();
      closePopover(false);
      clearDrag();
      render();
      restoreFocus(focus);
    }
    function reset() {
      cancelDraft();
      closePopover(false);
      clearDrag();
      query = "";
      findOpen = false;
      matchIndex = 0;
      selected = null;
      expanded.clear();
      refresh(true);
    }
    const unsubscribeStore = store.subscribe(refresh), unsubscribeInventory = registry.subscribe(refresh);
    refresh();
    return { element, refresh, reset, destroy() {
      if (destroyed) return;
      destroyed = true;
      cancelDraft();
      closePopover(false);
      clearDrag();
      symbolResize?.disconnect();
      if (deferredRefresh !== null) window2.clearTimeout(deferredRefresh);
      document2.removeEventListener("pointerdown", outsidePointer, true);
      document2.removeEventListener("keydown", popupKey, true);
      window2.removeEventListener("resize", positionPopover);
      document2.removeEventListener("scroll", positionPopover, true);
      unsubscribeStore?.();
      unsubscribeInventory?.();
      element.remove();
    } };
  }

  // project:src/sine-settings.mjs
  function createSineSettingsBridge(window2, { store, registry, icons, createUI = createSettingsUI }) {
    const { document: document2 } = window2;
    let disposed = false, controls = null, container = null, dialog = null, button = null;
    const reset = () => controls?.reset();
    function unmount() {
      dialog?.removeEventListener("close", reset);
      button?.removeEventListener("click", reset);
      controls?.destroy();
      controls = container = dialog = button = null;
    }
    function mount() {
      if (disposed) return;
      const next = document2.querySelector('[mod-id="context-menu-editor"] .sineItemPreferenceDialogContent');
      if (next === container && controls?.element.isConnected) {
        if (container.lastElementChild !== controls.element) container.append(controls.element);
        return;
      }
      unmount();
      if (!next) return;
      container = next;
      controls = createUI(window2, { store, registry, icons });
      container.append(controls.element);
      dialog = container.closest("dialog");
      dialog?.addEventListener("close", reset);
      button = container.closest("[mod-id]")?.querySelector(".sineItemConfigureButton");
      button?.addEventListener("click", reset);
    }
    const observer = new window2.MutationObserver(mount);
    observer.observe(document2.documentElement, { childList: true, subtree: true });
    mount();
    return { refresh() {
      controls?.refresh();
    }, destroy() {
      if (disposed) return;
      disposed = true;
      observer.disconnect();
      unmount();
    } };
  }

  // project:src/sources.mjs
  var XUL = "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";
  var MENU_TAGS = /* @__PURE__ */ new Set(["menu", "menuitem", "menupopup", "menuseparator", "menugroup"]);
  var EVENTS = /* @__PURE__ */ new Set(["command", "click", "popupshowing"]);
  var UNKNOWN = Object.freeze({ kind: "unknown", name: "Source unknown" });
  var BROWSER = Object.freeze({ kind: "browser", name: "Zen Browser", via: "browser" });
  var BUILT_IN_ROOTS = ["contentAreaContextMenu", "tabContextMenu", "placesContext", "zenFolderActions", "zenWorkspaceMoreActions", "toolbar-context-menu"];
  var OWN_PREFIX = "chrome://sine/content/context-menu-editor/";
  var MOD_FRAME = /^chrome:\/\/sine\/content\/([\w.-]+)\//;
  var TRANSPARENT_PREFIXES = ["chrome://userscripts/content/", "self-hosted"];
  var HOOK = "__contextMenuEditorCreationHook";
  var OWN_FILE = (() => {
    try {
      return String(new Error().stack || "").split("\n").map((line) => frameURL(line)).find(Boolean) || null;
    } catch {
      return null;
    }
  })();
  function browserMarkupIds(window2, markup) {
    const inert = markup.split(XUL).join("urn:context-menu-editor:inert-xul");
    const parsed = new window2.DOMParser().parseFromString(inert, "application/xml");
    const rows = /* @__PURE__ */ new Set(), popups = /* @__PURE__ */ new Set(), popupRows = /* @__PURE__ */ new Set();
    function visit(document2) {
      for (const rootId of BUILT_IN_ROOTS) {
        const root = document2.querySelector(`[id="${rootId}"]`);
        for (const item of root?.querySelectorAll("[id]") || []) rows.add(item.id);
      }
      for (const popup of document2.querySelectorAll("menupopup")) {
        if (popup.id) popups.add(popup.id);
        for (const item of popup.querySelectorAll("[id]")) popupRows.add(item.id);
      }
      for (const template of document2.querySelectorAll("template")) if (template.content) visit(template.content);
    }
    visit(parsed);
    return { rows, popups, popupRows };
  }
  function frameURL(line) {
    let text = line.trim();
    if (!text) return null;
    if (text.startsWith("at ")) {
      const inner = text.match(/\(([^()]*)\)$/);
      text = inner ? inner[1] : text.slice(3);
    } else {
      const at = text.lastIndexOf("@");
      if (at < 0) return null;
      text = text.slice(at + 1);
    }
    text = text.split(" ")[0].replace(/:\d+(?::\d+)?$/, "");
    return text || null;
  }
  function createSourceTracker(window2, {
    initialMods = {},
    loadMods,
    listenerInfo = () => [],
    functionLocation = () => null,
    builtInIds = /* @__PURE__ */ new Set(),
    onChange = () => {
    }
  } = {}) {
    const document2 = window2.document;
    let mods = /* @__PURE__ */ new Map(), creation = /* @__PURE__ */ new WeakMap(), disposed = false, pending = null, lastRefresh = 0, nativeIds = builtInIds, uncatalogued = false;
    function setMods(value) {
      const next = /* @__PURE__ */ new Map();
      for (const mod of Object.values(value || {})) {
        if (!mod || typeof mod.id !== "string" || !/^[\w.-]{1,256}$/.test(mod.id) || typeof mod.name !== "string") continue;
        next.set(mod.id, { id: mod.id, name: mod.name.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, 120) || mod.id });
      }
      mods = next;
    }
    function identify(value, via) {
      if (typeof value !== "string") return null;
      for (const match of value.matchAll(/chrome:\/\/sine\/content\/([\w.-]+)\//g)) {
        const mod = mods.get(match[1]);
        if (mod && mod.id !== "context-menu-editor") return { kind: "mod", ...mod, via };
        if (!mod && match[1] !== "context-menu-editor") uncatalogued = true;
      }
      return null;
    }
    async function refresh() {
      if (disposed || !loadMods || pending) return pending;
      lastRefresh = Date.now();
      pending = Promise.resolve().then(loadMods).then((value) => {
        if (disposed) return;
        const before = JSON.stringify([...mods]);
        setMods(value);
        if (JSON.stringify([...mods]) !== before) onChange();
      }).catch(() => {
      }).finally(() => {
        pending = null;
      });
      return pending;
    }
    function capture(node) {
      if (disposed || !MENU_TAGS.has(node?.localName)) return;
      creation.set(node, new window2.Error());
    }
    function creationURI(node) {
      const value = creation.get(node);
      if (!value || typeof value !== "object") return value;
      let stack = "";
      try {
        stack = String(value.stack || "");
      } catch {
      }
      let uri = null;
      const urls = stack.split("\n").map(frameURL).filter(Boolean);
      const own = urls.indexOf(OWN_FILE);
      for (const url of own >= 0 ? urls.slice(own) : urls) {
        if (url === OWN_FILE || url.startsWith(OWN_PREFIX) || TRANSPARENT_PREFIXES.some((prefix) => url.startsWith(prefix))) continue;
        uri = MOD_FRAME.test(url) ? url : null;
        break;
      }
      creation.set(node, uri);
      return uri;
    }
    const hook = installCreationHook(document2);
    hook.capture = capture;
    function handlerSource(node) {
      const candidates = [node, ...[...node.children || []].filter((child) => child.localName === "menupopup")];
      for (const target of candidates) {
        let entries;
        try {
          entries = listenerInfo(target) || [];
        } catch {
          continue;
        }
        for (const entry of entries) {
          if (!EVENTS.has(entry.type)) continue;
          try {
            let handler = entry.listenerObject;
            if (typeof handler !== "function") {
              let object2 = handler;
              handler = null;
              for (let depth = 0; object2 && depth < 12; depth++, object2 = Object.getPrototypeOf(object2)) {
                const descriptor = Object.getOwnPropertyDescriptor(object2, "handleEvent");
                if (descriptor) {
                  handler = descriptor.value;
                  break;
                }
              }
            }
            if (typeof handler !== "function") continue;
            const location2 = functionLocation(handler);
            const source = identify(location2?.filename || location2?.source, "handler");
            if (source) return source;
          } catch {
          }
        }
      }
      return null;
    }
    function resolve(node) {
      if (disposed || !node) return UNKNOWN;
      uncatalogued = false;
      const direct = handlerSource(node) || identify(creationURI(node), "creation");
      if (direct) return direct;
      const artwork = identify(node.getAttribute("image"), "artwork");
      if (uncatalogued && Date.now() - lastRefresh > 2e3) void refresh();
      if (nativeIds.has(node.id)) return BROWSER;
      return artwork ? { ...artwork, kind: "artwork" } : UNKNOWN;
    }
    setMods(initialMods);
    const ready = refresh() || Promise.resolve();
    return {
      resolve,
      setMods,
      refresh,
      ready,
      setBrowserIds(ids) {
        if (!disposed) {
          nativeIds = new Set(ids);
          onChange();
        }
      },
      destroy() {
        if (disposed) return;
        disposed = true;
        if (hook.capture === capture) hook.capture = null;
        releaseCreationHook(document2, hook);
        creation = /* @__PURE__ */ new WeakMap();
        mods.clear();
      }
    };
  }
  function installCreationHook(document2) {
    let hook = document2[HOOK];
    if (!hook) {
      hook = { capture: null, wrappers: /* @__PURE__ */ new Map() };
      try {
        Object.defineProperty(document2, HOOK, { value: hook, configurable: true });
      } catch {
      }
    }
    const wrap = (name, accept) => {
      if (hook.wrappers.has(name)) return;
      const original = document2[name], descriptor = Object.getOwnPropertyDescriptor(document2, name);
      if (typeof original !== "function") return;
      const wrapped = function(...args) {
        const node = Reflect.apply(original, this, args);
        if (hook.capture && accept(args)) hook.capture(node);
        return node;
      };
      try {
        Object.defineProperty(document2, name, { value: wrapped, writable: true, configurable: true });
      } catch {
        return;
      }
      hook.wrappers.set(name, { wrapped, descriptor });
    };
    wrap("createXULElement", (args) => MENU_TAGS.has(args[0]));
    wrap("createElementNS", (args) => args[0] === XUL && MENU_TAGS.has(args[1]));
    return hook;
  }
  function releaseCreationHook(document2, hook) {
    for (const [name, { wrapped, descriptor }] of [...hook.wrappers]) {
      if (document2[name] !== wrapped) continue;
      if (descriptor) Object.defineProperty(document2, name, descriptor);
      else delete document2[name];
      hook.wrappers.delete(name);
    }
    if (!hook.wrappers.size && document2[HOOK] === hook) {
      try {
        delete document2[HOOK];
      } catch {
      }
    }
  }

  // project:src/legacy.mjs
  var PAGE = "contentAreaContextMenu";
  var TAB = "tabContextMenu";
  var HIDDEN = {
    bookmark: { [PAGE]: ["context-bookmarklink"], [TAB]: ["context_bookmarkSelectedTabs", "context_bookmarkTab"] },
    mutetab: { [TAB]: ["context_toggleMuteTab", "context_toggleMuteSelectedTabs", "context_playTab", "context_playSelectedTabs"] },
    newtab: { [TAB]: ["context_openANewTab"] },
    movetaboptions: { [TAB]: ["context_moveTabOptions"] },
    newcontainer: { [PAGE]: ["context-openlinkinusercontext-menu"], [TAB]: ["context_reopenInContainer"] },
    sendtodevice: { [PAGE]: ["context-sendpagetodevice", "context-sendlinktodevice", "context-sep-sendlinktodevice"], [TAB]: ["context_sendTabToDevice"] },
    closetab: { [TAB]: ["context_closeTab", "context_closeDuplicateTabs"] },
    closemultiple: { [TAB]: ["context_closeTabOptions"] },
    search: { [PAGE]: ["context-searchselect"] },
    searchinpriv: { [PAGE]: ["context-searchselect-private"] },
    translate: { [PAGE]: ["context-translate-selection", "frame-sep"] },
    askchatbot: { [PAGE]: ["context-ask-chat"] },
    printselection: { [PAGE]: ["context-print-selection"] },
    image: { [PAGE]: ["context-sendimage", "context-sep-setbackground", "context-setDesktopBackground", "context-sep-sharing", "context-viewimageinfo"] },
    audiovideo: { [PAGE]: ["context-copyvideourl", "context-copyaudiourl", "context-sendvideo", "context-sendaudio", "context-sep-sharing"] },
    checkspelling: { [PAGE]: ["spell-separator", "spell-check-enabled", "spell-add-dictionaries-main", "spell-dictionaries", "context-sep-bidi", "context-bidi-text-direction-toggle", "context-bidi-page-direction-toggle"] },
    screenshot: { [PAGE]: ["context-take-screenshot", "context-sep-screenshots", "frame-sep"] },
    frame: { [PAGE]: ["frame-sep", "frame"] },
    selectalltext: { [PAGE]: ["context-selectall", "context-sep-selectall"] },
    selectalltabs: { [TAB]: ["context_selectAllTabs", "context_selectedAllTabs"] },
    reloadtab: { [TAB]: ["context_reloadTab", "context_reloadSelectedTabs"] },
    duplicatetab: { [TAB]: ["context_duplicateTab", "context_duplicateTabs"] },
    inspect: { [PAGE]: ["context-viewsource", "context-inspect-a11y", "context-inspect", "inspect-separator", "context-media-eme-separator", "context-viewpartialsource-selection"] },
    savelink: { [PAGE]: ["context-savepage", "context-savelink"] },
    pin: { [TAB]: ["context_pinTab", "context_unpinTab", "context_pinSelectedTabs", "context_unpinSelectedTabs", "context_zen-add-essential", "context_zen-remove-essential"] },
    navigation: { [PAGE]: ["context-back", "context-forward", "context-reload", "context-stop", "context-bookmarkpage", "context-sep-navigation"] }
  };
  function initializeLegacySettings(prefs) {
    let before;
    try {
      before = prefs.getStringPref(SETTINGS_PREF, "");
    } catch {
      return { imported: false, reason: "unreadable" };
    }
    if (before !== "") return { imported: false, reason: "existing" };
    const state = createState();
    let found = 0;
    const read = (name, type, valid = () => true) => {
      try {
        if (!prefs.prefHasUserValue?.(name)) return void 0;
        const value = prefs[type === "boolean" ? "getBoolPref" : type === "number" ? "getIntPref" : "getStringPref"](name);
        if (typeof value !== type || !valid(value)) return void 0;
        found++;
        return value;
      } catch {
        return void 0;
      }
    };
    const root = (id2) => state.roots[id2] ??= { children: [], records: {} };
    for (const [preference, menus] of Object.entries(HIDDEN)) if (read("uc.hidecontext." + preference, "boolean") === true) {
      for (const [id2, ids] of Object.entries(menus)) {
        const menu = root(id2);
        menu.legacyHiddenIds = [.../* @__PURE__ */ new Set([...menu.legacyHiddenIds || [], ...ids])];
      }
    }
    const separators = read("uc.hidecontext.separators", "boolean");
    if (separators !== void 0) state.options.showSeparators = !separators;
    const cleanLinks = read("uc.hidecontext.copylink", "boolean");
    if (cleanLinks !== void 0) state.options.preferCleanLinks = cleanLinks;
    const restoreIcons = read("uc.fixcontext.restoreicons", "boolean");
    if (restoreIcons === true) state.options.iconPack = "zen";
    const pack = read("cmi-Switch-Icon-Package", "number", (value) => Number.isInteger(value) && [0, 1, 2].includes(value));
    if (pack !== void 0) {
      state.options.showIcons = pack !== 0;
      state.options.iconPack = pack === 2 ? "zen" : "fluent";
    }
    if (read("uc.hidecontext.icons", "boolean") === true) state.options.showIcons = false;
    const opacity = read("cmi-menuseparator-opacity", "string", (value) => /^(?:0(?:\.\d+)?|1(?:\.0+)?)$/u.test(value.trim()));
    if (opacity !== void 0) state.options.separatorOpacity = Number(opacity);
    const gray = read("cmi-Grayscale-Extensions-Icons", "boolean");
    if (gray !== void 0) state.options.monochromeExtensions = gray;
    const betterMenu = read("cmi-Disable-Better-Context-Menu", "boolean");
    if (betterMenu !== void 0) {
      state.options.rounded = !betterMenu;
      state.options.hoverShade = !betterMenu;
    }
    if (read("cmi-Disable-BCM-Gradient-Effect", "boolean") === true) state.options.hoverShade = false;
    for (const [id2, suffix] of [[PAGE, "ContentAreaContextMenu"], [TAB, "TabContextMenu"]]) {
      const hidden = read("cmi-Hide-Inactive-Items-" + suffix, "boolean");
      if (hidden !== void 0) root(id2).hideUnavailable = hidden;
    }
    if (!found) return { imported: false, reason: "none" };
    const encoded = serializeState(state);
    if (prefs.getStringPref(SETTINGS_PREF, "") !== before) return { imported: false, reason: "changed" };
    prefs.setStringPref(SETTINGS_PREF, encoded);
    return { imported: true };
  }

  // project:src/entry.mjs
  var TOPIC = "context-menu-editor-inventory";
  var OWNER_WRITE_TOPIC = "context-menu-editor-owner-write";
  var BASE = "chrome://sine/content/context-menu-editor/";
  var VERSION = true ? "0.2.3" : "dev";
  var loadSineMods = async () => ChromeUtils.importESModule("chrome://userscripts/content/core/utils.sys.mjs").default.getMods();
  function sharedMarkup(services, build) {
    try {
      const windows = services.wm?.getEnumerator("navigator:browser");
      while (windows?.hasMoreElements()) {
        const markup = windows.getNext().__contextMenuEditor?.browserMarkup;
        if (markup?.build === build) return markup;
      }
    } catch {
    }
    return null;
  }
  async function loadMarkup(window2, services) {
    const build = `${services.appinfo?.appBuildID || ""}:${services.appinfo?.version || ""}`;
    const shared = sharedMarkup(services, build);
    if (shared) return shared;
    const response = await window2.fetch("chrome://browser/content/browser.xhtml");
    const text = await response.text();
    if (text.length > 2 * 1024 * 1024) return null;
    return { build, ...browserMarkupIds(window2, text) };
  }
  function startContextMenuEditor(window2, { Services: services } = {}) {
    services ??= typeof Services !== "undefined" ? Services : globalThis.Services;
    if (!services?.prefs) throw new Error("Context Menu Editor needs the browser preference service.");
    try {
      initializeLegacySettings(services.prefs);
    } catch (problem) {
      window2.console?.warn?.("Context Menu Editor could not import previous settings.", problem);
    }
    window2.__contextMenuEditor?.unload();
    let disposed = false, offStore = () => {
    }, controller = null, bridge = null, sources = null, ownerSettings = null;
    let ownerWrite = false, ownerRaw = null, markup = null, markupState = "pending", stylesheet = null;
    const store = createStore(services.prefs, { onError: (problem) => window2.console?.warn?.("Context Menu Editor could not refresh settings.", problem) });
    const browserWindow = () => window2.browsingContext?.topChromeWindow || (/^chrome:/.test(window2.location.href) ? window2 : services.wm?.getMostRecentWindow("navigator:browser"));
    const icons = createIconService(window2, { baseURL: BASE, fetch: (...args) => browserWindow().fetch(...args) });
    const ownerWriteObserver = { observe(_subject, _topic, data) {
      ownerRaw = data;
    } };
    const owner = {
      get disposed() {
        return disposed;
      },
      get controller() {
        return controller;
      },
      get browserMarkup() {
        return markup;
      },
      store,
      /** Read-only provenance for diagnostics and native tests. */
      resolveSource: (node) => sources?.resolve(node) || null,
      unload() {
        if (disposed) return;
        disposed = true;
        offStore();
        ownerSettings?.destroy();
        bridge?.destroy();
        controller?.destroy();
        sources?.destroy();
        store.destroy();
        stylesheet?.remove();
        services.obs?.removeObserver(ownerWriteObserver, OWNER_WRITE_TOPIC);
        window2.removeEventListener("unload", owner.unload);
        if (window2.__contextMenuEditor === owner) delete window2.__contextMenuEditor;
        services.obs?.notifyObservers(null, TOPIC);
      }
    };
    window2.__contextMenuEditor = owner;
    window2.addEventListener("unload", owner.unload, { once: true });
    window2.addUnloadListener?.(owner.unload);
    try {
      if (/^about:(preferences|settings)(?:[?#]|$)/.test(window2.location.href)) startSettingsPage();
      else startBrowserWindow();
    } catch (problem) {
      owner.unload();
      throw problem;
    }
    return owner;
    function linkStylesheet() {
      stylesheet = window2.document.createElementNS("http://www.w3.org/1999/xhtml", "link");
      stylesheet.rel = "stylesheet";
      stylesheet.href = `${BASE}style.css?v=${VERSION}`;
      stylesheet.setAttribute("data-cme-stylesheet", "true");
      window2.document.documentElement.append(stylesheet);
    }
    function startSettingsPage() {
      linkStylesheet();
      const registry = {
        getInventory: () => browserWindow()?.__contextMenuEditor?.controller?.getInventory() || [],
        subscribe(listener) {
          const observer = { observe() {
            listener();
          } };
          services.obs?.addObserver(observer, TOPIC);
          return () => services.obs?.removeObserver(observer, TOPIC);
        }
      };
      bridge = createSineSettingsBridge(window2, { store, registry, icons });
    }
    function startBrowserWindow() {
      linkStylesheet();
      let listenerService;
      try {
        listenerService = Cc["@mozilla.org/eventlistenerservice;1"].getService(Ci.nsIEventListenerService);
      } catch {
      }
      let started = false;
      const refreshAll = () => {
        if (disposed || !started) return;
        controller?.refresh();
        void ownerSettings?.refresh();
      };
      sources = createSourceTracker(window2, {
        loadMods: loadSineMods,
        listenerInfo: (node) => listenerService?.getListenerInfoFor(node) || [],
        functionLocation: (fn) => Cu.getFunctionSourceLocation(fn),
        onChange: refreshAll
      });
      const markupLoaded = (async () => {
        if (typeof ChromeUtils === "undefined" || typeof window2.fetch !== "function") {
          markupState = "unavailable";
          return;
        }
        try {
          markup = await loadMarkup(window2, services);
          if (disposed) return;
          markupState = markup ? "ready" : "unavailable";
          if (markup) sources.setBrowserIds(markup.rows);
        } catch {
          markupState = "unavailable";
        }
      })();
      const getState = () => {
        const result = store.read();
        if (!result.error) return result.state;
        const fallback = createState();
        fallback.options.enabled = false;
        return fallback;
      };
      controller = createMenuController(window2, {
        getState,
        resolveIcon: (...args) => icons.resolve(...args),
        resolveSource: (node) => sources.resolve(node),
        // A popup from browser.xhtml is adopted only for rows a mod added to it,
        // never because a mod merely listens on it (B6).
        classifyPopup: (root) => markupState === "pending" ? "pending" : markup?.popups.has(root.id) ? "native" : "foreign",
        isNativeRow: (id2) => Boolean(id2 && markup?.popupRows.has(id2)),
        onOwnerChange: (rootId, items, changes) => {
          const before = store.read();
          if (before.error) return;
          const next = applyOwnerChanges(before.state, rootId, items, changes);
          ownerWrite = true;
          try {
            services.obs?.notifyObservers(null, OWNER_WRITE_TOPIC, serializeState(next));
            store.save(next, before.raw);
          } finally {
            ownerWrite = false;
          }
        },
        onInventory: () => services.obs?.notifyObservers(null, TOPIC)
      });
      services.obs?.addObserver(ownerWriteObserver, OWNER_WRITE_TOPIC);
      offStore = store.subscribe(() => {
        if (ownerWrite) {
          ownerRaw = null;
          return;
        }
        const fromOwner = ownerRaw !== null && store.read().raw === ownerRaw;
        ownerRaw = null;
        if (!fromOwner) controller.clearOwnerSettingsChanges();
        controller.refresh();
      });
      ownerSettings = createOwnerSettingsObserver(window2, {
        prefs: services.prefs,
        loadMods: loadSineMods,
        onChange: (id2, fields) => {
          controller.noteOwnerSettingsChange(id2, fields);
          window2.queueMicrotask(() => {
            if (!disposed) controller.refresh();
          });
        }
      });
      void Promise.allSettled([sources.ready, markupLoaded]).then(() => {
        started = true;
        refreshAll();
      });
    }
  }
  if (typeof window !== "undefined") {
    const start = () => {
      try {
        startContextMenuEditor(window);
      } catch (problem) {
        window.console?.error?.("Context Menu Editor could not start.", problem);
      }
    };
    if (document.readyState === "complete") start();
    else window.addEventListener("load", start, { once: true });
  }
})();
