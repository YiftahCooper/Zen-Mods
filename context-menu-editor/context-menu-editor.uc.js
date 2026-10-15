// Context Menu Editor 0.1.4 — generated from src/entry.mjs.
// Run node build.mjs; native qualification is reported separately.
(() => {
  // project:src/model.mjs
  var MAX_STATE_BYTES = 512 * 1024;
  var MAX_RECORDS = 1e4;
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
  function validateState(value) {
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
      if ("legacyHiddenIds" in root && (!Array.isArray(root.legacyHiddenIds) || root.legacyHiddenIds.length > 512 || new Set(root.legacyHiddenIds).size !== root.legacyHiddenIds.length || root.legacyHiddenIds.some((id) => !validKey(id) || !/^[a-zA-Z][a-zA-Z0-9_-]{0,127}$/u.test(id)))) fail("Invalid legacy menu identities.");
      for (const [key, record] of Object.entries(root.records)) {
        keyCheck(key);
        if (++count > MAX_RECORDS) fail("Too many saved menu items.");
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
    if (bytes(JSON.stringify(state)) > MAX_STATE_BYTES) fail("Saved settings are too large.");
    return state;
  }
  function parseState(raw) {
    if (raw === null || raw === void 0 || raw === "") return createState();
    if (typeof raw !== "string") fail("Could not read saved settings.");
    if (bytes(raw) > MAX_STATE_BYTES) fail("Saved settings are too large.");
    let value;
    try {
      value = JSON.parse(raw);
    } catch {
      fail("Saved settings are not valid JSON.");
    }
    return validateState(value);
  }
  function serializeState(state) {
    return JSON.stringify(validateState(state));
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
          root.legacyHiddenIds = root.legacyHiddenIds.filter((id) => id !== key);
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
  function createStore(prefs, { onError = () => {
  } } = {}) {
    let disposed = false, lastUndo = null;
    const listeners = /* @__PURE__ */ new Set();
    const raw = () => prefs.getStringPref(SETTINGS_PREF, "");
    const read = () => {
      const value = raw();
      try {
        return { state: parseState(value), raw: value, error: null };
      } catch (problem) {
        return { state: createState(), raw: value, error: problem.message };
      }
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
      }
    };
  }

  // project:assets/catalog.json
  var catalog_default = {
    revision: "71750239d6fd114800989d91f2567cd4c47635e9",
    archiveSha256: "fe56ff77df086c56dca51977334d293e3715cd01fae6b389e6a5bd60a3fa0b0f",
    packs: [
      {
        id: "fluent",
        label: "FluentUI",
        icons: [
          {
            id: "AI-chat",
            label: "Ai chat",
            tags: [
              "ai",
              "chat"
            ],
            path: "assets/packs/fluent/AI-chat.svg",
            sha256: "5115e6a02fb9730149bbfc8e7704d25a6ce439cc4de319ed16f244225a8a728d",
            originalSha256: "bb77c748965d2371529ab2e104ea27e5e83f38427123a896c541b23f03b20bab"
          },
          {
            id: "AI-summarize",
            label: "Ai summarize",
            tags: [
              "ai",
              "summarize"
            ],
            path: "assets/packs/fluent/AI-summarize.svg",
            sha256: "502f7a59388997ade090b343918062c7be6ad9a8c128705e0161edd6dc426ee0",
            originalSha256: "f685b22601df9b87712f7fcaa73d994777db01ae2e2eae4cf4cc3cf304bf5c12"
          },
          {
            id: "TabGroup-add",
            label: "Tab group add",
            tags: [
              "tab",
              "group",
              "add"
            ],
            path: "assets/packs/fluent/TabGroup-add.svg",
            sha256: "4c133330b842d33a435c01128a5f0834c5d3237431f0b122352c190d0349b346",
            originalSha256: "54b64410b363c8077ab78d3a6307bdf90825f39f543c351e5838a9dc56ddb6db"
          },
          {
            id: "TabGroup-remove",
            label: "Tab group remove",
            tags: [
              "tab",
              "group",
              "remove"
            ],
            path: "assets/packs/fluent/TabGroup-remove.svg",
            sha256: "e587167508d07134b0e07e4062b3e91b718aeffb8da9cfda324d85bf1f091957",
            originalSha256: "fac4f250fa9e7ac1053ff5b8446d15c821c13447632f2ff05f0706aad5284fd6"
          },
          {
            id: "accessibility",
            label: "Accessibility",
            tags: [
              "accessibility"
            ],
            path: "assets/packs/fluent/accessibility.svg",
            sha256: "4661dafbb9ac8648fe36580dc327156a10d6e74fee714a8ecaa7589ec8e08e96",
            originalSha256: "a48334900551ae1a25af4346b7f3b3729e3a9593789e4889cece7f3f4f040331"
          },
          {
            id: "add-to-dictionary",
            label: "Add to dictionary",
            tags: [
              "add",
              "to",
              "dictionary"
            ],
            path: "assets/packs/fluent/add-to-dictionary.svg",
            sha256: "0a94637c8539d829cf4fb4ed458acd138f22712b560a870ea7cda40b90e946c7",
            originalSha256: "a62d2c6f15182e1f036687b15e4cede40fb1d1a1bdf19f30f94b27c6b215cea5"
          },
          {
            id: "arrow-down",
            label: "Arrow down",
            tags: [
              "arrow",
              "down"
            ],
            path: "assets/packs/fluent/arrow-down.svg",
            sha256: "8e8fc63c6caa2cdf9223c0025195d341059a7ff17ed8c377c81abcfca8fa3120",
            originalSha256: "4cebbfa2e12186dfbd3cd2812003866182aecde226bc707456ac1b212b5be283"
          },
          {
            id: "arrow-left",
            label: "Arrow left",
            tags: [
              "arrow",
              "left"
            ],
            path: "assets/packs/fluent/arrow-left.svg",
            sha256: "2c4f1e4a859fa280bb9038e76adfe125ed67ca01836fc9fe6710b0e4584713a6",
            originalSha256: "9eb680deb49047cc0cb565843fcd755dd882cc2f21a88803ece41a9d6a7bdf3b"
          },
          {
            id: "arrow-right",
            label: "Arrow right",
            tags: [
              "arrow",
              "right"
            ],
            path: "assets/packs/fluent/arrow-right.svg",
            sha256: "4475378f87d795b5882652dc80bf5bcc0639446f5572542a916be8c59d6999e5",
            originalSha256: "2ade83c957517888c560a252684bab1f36bcb1212bbaed4704725aa9500e77a1"
          },
          {
            id: "arrow-up",
            label: "Arrow up",
            tags: [
              "arrow",
              "up"
            ],
            path: "assets/packs/fluent/arrow-up.svg",
            sha256: "5b188d351bd2224595c9b1b180e70769fc2a9d9039caec2cb744c4d983a66955",
            originalSha256: "094dc5eb4cccd31ed2c061c587a042e58f1871487dc266190b0eb77b55f812ae"
          },
          {
            id: "ask-chat",
            label: "Ask chat",
            tags: [
              "ask",
              "chat"
            ],
            path: "assets/packs/fluent/ask-chat.svg",
            sha256: "4d87e26da00d5025eb38653dfc3f03552d0e8b3375c2513dcf23c801909dd62b",
            originalSha256: "e147c9ced5c97f8f611041ccce745a186e59bb1cb9691dd15e168d37ebf1d383"
          },
          {
            id: "audio-save",
            label: "Audio save",
            tags: [
              "audio",
              "save"
            ],
            path: "assets/packs/fluent/audio-save.svg",
            sha256: "75ff420a04395b88c601da3f55eed187fbb7655d023b65e7eb3546611cb985b4",
            originalSha256: "5191d40dba3045a6fcc353d247af5ca6b8cbf1a58e4f5ec72080ea1091f179c9"
          },
          {
            id: "autoplay-media-blocked",
            label: "Autoplay media blocked",
            tags: [
              "autoplay",
              "media",
              "blocked"
            ],
            path: "assets/packs/fluent/autoplay-media-blocked.svg",
            sha256: "2897dd017f5b5f083cc95b2410ddb8d48694d26ce57719754feeb99e8cdd14b9",
            originalSha256: "0ea3e4458f5c62812e86f856ec67512e6826f156db7649a04dcf8b903b2ed635"
          },
          {
            id: "autoplay-media",
            label: "Autoplay media",
            tags: [
              "autoplay",
              "media"
            ],
            path: "assets/packs/fluent/autoplay-media.svg",
            sha256: "77e1e94f78a77ef1409ddad098e216284a12fd695bbf788265ab2ca9cae9957d",
            originalSha256: "bb81e1a19ab8295bb793afbf56dcd381e69f39891940ddc559ef0a3e07bff1ff"
          },
          {
            id: "bookmark-hollow",
            label: "Bookmark hollow",
            tags: [
              "bookmark",
              "hollow"
            ],
            path: "assets/packs/fluent/bookmark-hollow.svg",
            sha256: "cf6b64ad5a40734d922494476cf1a00b06316e8c73aa7c3fdce122a03e504b3f",
            originalSha256: "71eb7c921ffc861b8a0fc8f5147a38f7ab47cd91d5aa2f7632940c99d487cf91"
          },
          {
            id: "bookmark-star-on-tray",
            label: "Bookmark star on tray",
            tags: [
              "bookmark",
              "star",
              "on",
              "tray"
            ],
            path: "assets/packs/fluent/bookmark-star-on-tray.svg",
            sha256: "d01ab35df3a56aed14a5182928bbd9a7e75e9ecb1c9b62d952b930caf99f4205",
            originalSha256: "bf292b2ac30da4971aa8b3f157dc368414a88deb5e602c11b3ea4dbc959292e1"
          },
          {
            id: "bookmark",
            label: "Bookmark",
            tags: [
              "bookmark"
            ],
            path: "assets/packs/fluent/bookmark.svg",
            sha256: "7bb3a36421e9c1fb5db99978b0bc32514837610c4605b156119fd3f563ef68ea",
            originalSha256: "e34c4b834652cea48e51b8549caadee0fe3eb581f81eecc1c8b2425d4ca77be4"
          },
          {
            id: "camera-blocked",
            label: "Camera blocked",
            tags: [
              "camera",
              "blocked"
            ],
            path: "assets/packs/fluent/camera-blocked.svg",
            sha256: "3192ddab764683527aca6ee529415188d34e203f779b2fd15297878e5b0671c6",
            originalSha256: "1d192802606c8d062782b4f55c0568bb5b498d29598f5707bcf3699e8cde9cd6"
          },
          {
            id: "camera",
            label: "Camera",
            tags: [
              "camera"
            ],
            path: "assets/packs/fluent/camera.svg",
            sha256: "28b3cd3b1fb77db9938ba23bcd31eadf2e0834277cabf2b52eebccd754817c78",
            originalSha256: "b032c934383db3a39ed637346fa5dfff58947a1b3efbb6d1bafdb71bfaa1a635"
          },
          {
            id: "canvas-blocked",
            label: "Canvas blocked",
            tags: [
              "canvas",
              "blocked"
            ],
            path: "assets/packs/fluent/canvas-blocked.svg",
            sha256: "e1ee687a852be7a9bd31d7b18318fa6f11795a7cc4416f8dfdc0e7c10f0bd585",
            originalSha256: "9b88fdb8e087900bc48e4d43512b40fde050fba3b5ce24cd3a3fd4210bbdb224"
          },
          {
            id: "canvas",
            label: "Canvas",
            tags: [
              "canvas"
            ],
            path: "assets/packs/fluent/canvas.svg",
            sha256: "607b65885dd77cb732bccb6af5f4581f708dc9034f458dfe2f8da883b194fcc5",
            originalSha256: "a61fa4fe2f1a252acd18efcd8292b58b1d33a908e1d3c910a846399b8a456bed"
          },
          {
            id: "checkmark",
            label: "Checkmark",
            tags: [
              "checkmark"
            ],
            path: "assets/packs/fluent/checkmark.svg",
            sha256: "a10bcf547daaeb43df5fabd93cb473053bbaa48e78eccf4feea37dbb7edcf164",
            originalSha256: "2e8eadea213b47c424dfea3cb965ca70b7da698dea978412be6261f3b5e40914"
          },
          {
            id: "chevron",
            label: "Chevron",
            tags: [
              "chevron"
            ],
            path: "assets/packs/fluent/chevron.svg",
            sha256: "9d5d00302758721a4a159a4cdad4edbef873fc7258e41eb2a56dbfe0c6357963",
            originalSha256: "e514d64e52e9b66dbb566d72436c178539d66b31365cc1db7464f39ff93ac192"
          },
          {
            id: "close-all",
            label: "Close all",
            tags: [
              "close",
              "all"
            ],
            path: "assets/packs/fluent/close-all.svg",
            sha256: "70eac5b17fb428183968fcaaf915262236890cf95b2491c4b99f4738200c1736",
            originalSha256: "5909384133c3549050a968f229665cbc5bc0247e010d6b5719f7d50dd33b2ed4"
          },
          {
            id: "close",
            label: "Close",
            tags: [
              "close"
            ],
            path: "assets/packs/fluent/close.svg",
            sha256: "34c15f4ed3434afe502a568e35a1fe4d802fcf5d73d3170476c31d8aa6e70471",
            originalSha256: "9cd8bb02da4a44a8ce898dcd24cc3a354867f0d8748c33aa7d8086f6b9e4e40f"
          },
          {
            id: "color",
            label: "Color",
            tags: [
              "color"
            ],
            path: "assets/packs/fluent/color.svg",
            sha256: "6244f62e745fd372336fded1895a70876bbc5b5974d543e1d3428ab329529643",
            originalSha256: "967edfab49916699cddf9d4f153614afaf947e2e01038f1b3363f203e5143abb"
          },
          {
            id: "container-tab",
            label: "Container tab",
            tags: [
              "container",
              "tab"
            ],
            path: "assets/packs/fluent/container-tab.svg",
            sha256: "1f809122e9ff18e776a55fab700f2c1eacccb3d66f048920182f4ee53e4c5c05",
            originalSha256: "b026ddbc1e5da38183672d780fe7cc2fc1a61b7e50a8931a431a0438c34a40a1"
          },
          {
            id: "customize",
            label: "Customize",
            tags: [
              "customize"
            ],
            path: "assets/packs/fluent/customize.svg",
            sha256: "d6b9141d7838f34ee0b26d216c83e2f4391c500b8000ee24a6ff1873548a8f8a",
            originalSha256: "0bec396787ba9b4dbef413b730bd74fa1bddd046e7072aa87038f017bcea7dcf"
          },
          {
            id: "desktop-notification-blocked",
            label: "Desktop notification blocked",
            tags: [
              "desktop",
              "notification",
              "blocked"
            ],
            path: "assets/packs/fluent/desktop-notification-blocked.svg",
            sha256: "2578686dffd73eea1825e8c6ab99a3a7901f1a1e8e5f2f641317c984c747d93b",
            originalSha256: "db12bc10f5d6a8a4c52c2fdb90725024bfc5459522fdee753dc9862f697a417d"
          },
          {
            id: "desktop-notification",
            label: "Desktop notification",
            tags: [
              "desktop",
              "notification"
            ],
            path: "assets/packs/fluent/desktop-notification.svg",
            sha256: "201cfcb643acb7278b0de51252eb65dc4a49be8257a6487822c7f30782da158e",
            originalSha256: "f79e253c4813d4748e9dafd126493163d249e4962522f4f68ff75fd112949584"
          },
          {
            id: "downloads",
            label: "Downloads",
            tags: [
              "downloads"
            ],
            path: "assets/packs/fluent/downloads.svg",
            sha256: "a47e363b55f5495d20185656cc76f4c9b3fefb48df5abd20010968f1b01c57b1",
            originalSha256: "b2e0ac378c5e17bc3651b99ff3e4f5c4771e4195c0e6c129495241b38debe576"
          },
          {
            id: "duplicate-tab",
            label: "Duplicate tab",
            tags: [
              "duplicate",
              "tab"
            ],
            path: "assets/packs/fluent/duplicate-tab.svg",
            sha256: "56977e72f9aa7941718f0a094f9577dd9072ec1bcb82eb582db82aabeafa286f",
            originalSha256: "c4ababa015249cf2660dfd3d8a56b4a1f90ea6152f9a8f87055a027ac2155259"
          },
          {
            id: "edit-copy",
            label: "Edit copy",
            tags: [
              "edit",
              "copy"
            ],
            path: "assets/packs/fluent/edit-copy.svg",
            sha256: "f40dd251a7bce57f2b42ff92bfe73370f95991dcda61b234ad1fffe89515481d",
            originalSha256: "ff0c933742a52e1dc4db8e4bf61fc9dd5b1c51d98aaf94ce73b04787f1ba64a0"
          },
          {
            id: "edit-cut",
            label: "Edit cut",
            tags: [
              "edit",
              "cut"
            ],
            path: "assets/packs/fluent/edit-cut.svg",
            sha256: "d2dd07a416c0d0f166f59d95311591cae2870f7ba93956440157756d5e2d3e25",
            originalSha256: "b6df66bed3e73188ba0a5dd9c566200a0f0edfe863538c2f279a0685e64d42d9"
          },
          {
            id: "edit-delete",
            label: "Edit delete",
            tags: [
              "edit",
              "delete"
            ],
            path: "assets/packs/fluent/edit-delete.svg",
            sha256: "284a0a51ddfc5dbbc5c0b23da18ac735ef954e860304b2a17a9e943dbb176a4d",
            originalSha256: "db083332458c1d8362c74c5d22166cb57cafadf159174fa500bbbfd36d40e2f3"
          },
          {
            id: "edit-paste",
            label: "Edit paste",
            tags: [
              "edit",
              "paste"
            ],
            path: "assets/packs/fluent/edit-paste.svg",
            sha256: "4c60793baeee3c3620fd560888f338c99576f6a15979e4d7fcbb85ede31bda41",
            originalSha256: "073d24abd1323980f09bd5747533b463f82516be6540075b7b0995b4cb2f4938"
          },
          {
            id: "edit-redo",
            label: "Edit redo",
            tags: [
              "edit",
              "redo"
            ],
            path: "assets/packs/fluent/edit-redo.svg",
            sha256: "fad5ed5965132bb26709be3f2eeda5c74d40c2f20da4083a7efb8c0800f751ac",
            originalSha256: "4d7663e7fc3d409fc7a3bbbeca29d980937f3f92f66b937425177a15d7a1701d"
          },
          {
            id: "edit-select-all",
            label: "Edit select all",
            tags: [
              "edit",
              "select",
              "all"
            ],
            path: "assets/packs/fluent/edit-select-all.svg",
            sha256: "c04d127635af4cdf30f1473f81368b90b24b01a0ef14b4cb385e24058c8fa2ac",
            originalSha256: "50fbec3d07813f191fbd9b2db541d00a17c0797467b5331dab15b6e04ca73d70"
          },
          {
            id: "edit-undo",
            label: "Edit undo",
            tags: [
              "edit",
              "undo"
            ],
            path: "assets/packs/fluent/edit-undo.svg",
            sha256: "181fc34850d3f0912299f8b7e1f1addb556b631c1509b315ec399a454a732533",
            originalSha256: "cc7eb4831ec700d75c3d427d0be7a9edb4ec53ca98947053804bfd312f44d170"
          },
          {
            id: "edit",
            label: "Edit",
            tags: [
              "edit"
            ],
            path: "assets/packs/fluent/edit.svg",
            sha256: "95e8f4efbc836b7f61a9120f5cde8d3874b07e3f4ab66f6ac98aab4c8e515ca5",
            originalSha256: "13251b7055785f00be71307510c7becd0ae4a54999a445c8d69b25d37899e1cc"
          },
          {
            id: "essential-add",
            label: "Essential add",
            tags: [
              "essential",
              "add"
            ],
            path: "assets/packs/fluent/essential-add.svg",
            sha256: "a880826520f9f26db94b9736164d34d121e37ebc69f6ded113d64633eac11e25",
            originalSha256: "1ead7a8fd9a3a5dc131fa110ec4ed78a5ff4ed85605ea4030a27ef7323933d7b"
          },
          {
            id: "essential-remove",
            label: "Essential remove",
            tags: [
              "essential",
              "remove"
            ],
            path: "assets/packs/fluent/essential-remove.svg",
            sha256: "b60206987613701ae6adf84f3c834346c0547145305bd64cd7db8f6f52563e50",
            originalSha256: "b5f0ed994f918a3e2611b691654d89e0092a1ce0e3b6c1613f440da7fa55366a"
          },
          {
            id: "ext-link",
            label: "Ext link",
            tags: [
              "ext",
              "link"
            ],
            path: "assets/packs/fluent/ext-link.svg",
            sha256: "9a40db4c96cb1606b680e527a2137e887581b00800e25762e3e842e937d285b4",
            originalSha256: "0792316e6b4b5ab15b07fdf8e8f34b50fd85ea3c80546bea9394ed1c5d705655"
          },
          {
            id: "extension-blocked",
            label: "Extension blocked",
            tags: [
              "extension",
              "blocked"
            ],
            path: "assets/packs/fluent/extension-blocked.svg",
            sha256: "80f3ce971da015f1b4c0677a859680344c9df0dc44bbb759d13c016eb5a1d707",
            originalSha256: "0f9b10930246bc4054dd37ae78ec6d8f37ea1185403fd3738f8c3737942a9e1c"
          },
          {
            id: "extension",
            label: "Extension",
            tags: [
              "extension"
            ],
            path: "assets/packs/fluent/extension.svg",
            sha256: "6984607dc30e499f60d94b261d7451a7933125866b9b46be1a53a9951a91d3ee",
            originalSha256: "126917b186fc66248a7015c9fb8b1390f5a9b8a85d08e2639f230d6c2bc9b1e5"
          },
          {
            id: "firefox-logo",
            label: "Firefox logo",
            tags: [
              "firefox",
              "logo"
            ],
            path: "assets/packs/fluent/firefox-logo.svg",
            sha256: "0935b695ea8d8dbd56683894d00416cd98be281983f2ea3fef7193a03f94659a",
            originalSha256: "0935b695ea8d8dbd56683894d00416cd98be281983f2ea3fef7193a03f94659a"
          },
          {
            id: "firefox",
            label: "Firefox",
            tags: [
              "firefox"
            ],
            path: "assets/packs/fluent/firefox.svg",
            sha256: "4d12988bdc382e43960bb30db45457c8f7b836edb2ea68c8f09865abc0bfbecc",
            originalSha256: "e5b189abd913de69dd29d813346a5d1b23e0ee87079683e58ab829a8fc5dd6e9"
          },
          {
            id: "folder-add",
            label: "Folder add",
            tags: [
              "folder",
              "add"
            ],
            path: "assets/packs/fluent/folder-add.svg",
            sha256: "6f4f7618b58f95a7299326df3d4635c187a779060ce8c39f1e6bb5c7d025389c",
            originalSha256: "c230581bf7a29629ea7e2d32791b50b8680d2915f897bea1ae3cca27cf797f38"
          },
          {
            id: "folder-open",
            label: "Folder open",
            tags: [
              "folder",
              "open"
            ],
            path: "assets/packs/fluent/folder-open.svg",
            sha256: "a4793be4087e24f4b9e4adb235eb2e711c6cf6ed373d66f17172d2fa8102a7e7",
            originalSha256: "a82449f939ab2347d897fef9f2bbbf6acf56fec6ae18d8ed2811a2a547a44471"
          },
          {
            id: "folder-unpack",
            label: "Folder unpack",
            tags: [
              "folder",
              "unpack"
            ],
            path: "assets/packs/fluent/folder-unpack.svg",
            sha256: "882dd756fb637ad00c7122b956f846de8a04adfbed462ec05c718b8a73185576",
            originalSha256: "d0125a1e05d68130f8eaccd7dc7cec8a3a1eb505e964a1418cb267719340f490"
          },
          {
            id: "folder_sync_convert",
            label: "Folder sync convert",
            tags: [
              "folder",
              "sync",
              "convert"
            ],
            path: "assets/packs/fluent/folder_sync_convert.svg",
            sha256: "4e17d77e4b1c2fd61f9d65bef339844cb3ddac3e35513830fafbae8dd7f6bc35",
            originalSha256: "4c65e788beda85da04df76c871b8fdc0f76510fc2eab007f5ae811869513e8ac"
          },
          {
            id: "forget",
            label: "Forget",
            tags: [
              "forget"
            ],
            path: "assets/packs/fluent/forget.svg",
            sha256: "f627c348639d11d1bdee2b5c30850e59399422fe8a522666ab9398760eacb700",
            originalSha256: "13510757ffedc044997a87ce1b96dab7bac77be428d2c02a6840cc366c006203"
          },
          {
            id: "fullscreen-exit",
            label: "Fullscreen exit",
            tags: [
              "fullscreen",
              "exit"
            ],
            path: "assets/packs/fluent/fullscreen-exit.svg",
            sha256: "7e5ef1ffb8ef5ba724ac28bc41e9a3e331034cf43deaec467845098ab8118b6c",
            originalSha256: "b8e15e2d1205cb26704adf211633c741162f42b54fcc6e5442ff3786ee5ca9a3"
          },
          {
            id: "fullscreen",
            label: "Fullscreen",
            tags: [
              "fullscreen"
            ],
            path: "assets/packs/fluent/fullscreen.svg",
            sha256: "ae8d628e9a4aba2215970185e2c848eb22d1ae85a86a89b931d4b6a036edceee",
            originalSha256: "0d4a66b79666868fd76608338c7f15d24e583a36d145f32a20f9313bc4896c35"
          },
          {
            id: "geo-blocked",
            label: "Geo blocked",
            tags: [
              "geo",
              "blocked"
            ],
            path: "assets/packs/fluent/geo-blocked.svg",
            sha256: "10e30654e5af82fd21baeb552192b6711032f04d3a57569dc3afa675fec84a33",
            originalSha256: "f027d43bab5ee2a7f0ab80f1cc515b91ab4a9e75aa2c9363cddfa4b5e2cab0a4"
          },
          {
            id: "geo",
            label: "Geo",
            tags: [
              "geo"
            ],
            path: "assets/packs/fluent/geo.svg",
            sha256: "a7a98826d9493351b4992dcff4f8c29743c4041805c81961b8bbf7d7f74be8c2",
            originalSha256: "c862bd18091d544ba8f139cc419e04e81babcb15d34087df98a47d6bd098f726"
          },
          {
            id: "help",
            label: "Help",
            tags: [
              "help"
            ],
            path: "assets/packs/fluent/help.svg",
            sha256: "f3f126bf4de4b8a4ac5814dd14a0c0ae4350c07f5103ab73bc1d7b037ef3ffdc",
            originalSha256: "1a9ed2e97e46a28cc8b896e103d7fee7e8af7a988b3e1d77a79326088ecbf0b0"
          },
          {
            id: "hide",
            label: "Hide",
            tags: [
              "hide"
            ],
            path: "assets/packs/fluent/hide.svg",
            sha256: "32e73937115b5fedb54c3c91ac9a926824339cdaea14d0eafee9aabb8645cd37",
            originalSha256: "cf2cca612d53400d975b2d0e9ee6aff20663a0e7c598d397636da4652528c1f9"
          },
          {
            id: "history",
            label: "History",
            tags: [
              "history"
            ],
            path: "assets/packs/fluent/history.svg",
            sha256: "ca6af3455c27cfcd30aecbb1448b0de21730c8dd83c25dc9a83b8298b02c0f78",
            originalSha256: "e9845a362da904007359fdb48e00282507db4bbae2acab662e32089cfe438c2a"
          },
          {
            id: "home",
            label: "Home",
            tags: [
              "home"
            ],
            path: "assets/packs/fluent/home.svg",
            sha256: "564ad21200ca7e9998e811828aa24bab4d1d74f4d4acda3d1b7f21574cb7f500",
            originalSha256: "60b815c3e11fe988a9e0f0c41a3d919dd495a39d138d53f8dfefafe874337576"
          },
          {
            id: "image-copy",
            label: "Image copy",
            tags: [
              "image",
              "copy"
            ],
            path: "assets/packs/fluent/image-copy.svg",
            sha256: "dbaa6abfdf2f95086b7d519c8082e27dc2a107348ed1f1cb3e6d0f11c7236bb8",
            originalSha256: "74e491d5ad3d339fdf3804e0ed6fc62ec84d20be39ab77b7b003332341a48202"
          },
          {
            id: "image-open",
            label: "Image open",
            tags: [
              "image",
              "open"
            ],
            path: "assets/packs/fluent/image-open.svg",
            sha256: "29dda75918b7f8ff22801a414a5cab50651a780436b8bca1d10a10c9e3a856f1",
            originalSha256: "99eab6a111c2ded0ba4a1419a97011b362c4ac1a5fd3adba64c9b91d2949207f"
          },
          {
            id: "image-save",
            label: "Image save",
            tags: [
              "image",
              "save"
            ],
            path: "assets/packs/fluent/image-save.svg",
            sha256: "33f64cffacf7159cfa86e1a1748cb4d0990c83f9215a5f8f3fdfbb3cad5c4538",
            originalSha256: "6a59f9412e30f49ba02985450223e41e1a7f2f05d832229358c46756c7eca1ce"
          },
          {
            id: "info",
            label: "Info",
            tags: [
              "info"
            ],
            path: "assets/packs/fluent/info.svg",
            sha256: "08407ac1ba4449301a79716b3ed3e6de1f6fa4954a70e1b90f76b303d70188c1",
            originalSha256: "4d92c3eec8cbcc635f30e123affd7ca7c5122adbc3dccbe67437d7932317234d"
          },
          {
            id: "inspect",
            label: "Inspect",
            tags: [
              "inspect"
            ],
            path: "assets/packs/fluent/inspect.svg",
            sha256: "44b8993231397a07a7acaa3e9787c10513c896f1bc896f7200f291bd81aed32f",
            originalSha256: "e169b9f5e30ec2f52df2ebb77dd518dd84e8feb9069cc7f4b212890e794d9132"
          },
          {
            id: "library",
            label: "Library",
            tags: [
              "library"
            ],
            path: "assets/packs/fluent/library.svg",
            sha256: "ef5af00330dc59d75cea9102829fc472d984ad6ec9f3c413631338aaa647148e",
            originalSha256: "cec97ec8430c8001bde70dbb2307af8930e33d718bd72c87cde0bf05f6429729"
          },
          {
            id: "link",
            label: "Link",
            tags: [
              "link"
            ],
            path: "assets/packs/fluent/link.svg",
            sha256: "9ef1a6ab37870135f07fb7fe8e27f350c131283c5427c6b1b619fd51b12584bc",
            originalSha256: "97f5b92d4020e230f7d7d7aed009cd57806b6f52c5d7f5a902f50b0d7166a3fe"
          },
          {
            id: "mail",
            label: "Mail",
            tags: [
              "mail"
            ],
            path: "assets/packs/fluent/mail.svg",
            sha256: "cddfb08a0b94d48b10267a504980e823574523030613f94a4e5a0e2dc0a2c9c3",
            originalSha256: "4f43b42f922ac7947ab7c6f7ca21557b435dd4bc2fb9237613a89ae035ebc417"
          },
          {
            id: "manage",
            label: "Manage",
            tags: [
              "manage"
            ],
            path: "assets/packs/fluent/manage.svg",
            sha256: "5d3e257360a2758c9adf1d5dd7c845367c025c63a97a9badbb3f94faecba222d",
            originalSha256: "3963e1e17a35041e6c2e119349dc9176f2675576feeb20eac355924dc9b351e8"
          },
          {
            id: "media-loop",
            label: "Media loop",
            tags: [
              "media",
              "loop"
            ],
            path: "assets/packs/fluent/media-loop.svg",
            sha256: "33012fd60bbb7c7902fec7cd9da84358fc553c8eae7d247fe52d6e307facea43",
            originalSha256: "8638b7de329db30f6160eed434ddf828403bc6c5a1a7771481c526475af922bc"
          },
          {
            id: "media-mute",
            label: "Media mute",
            tags: [
              "media",
              "mute"
            ],
            path: "assets/packs/fluent/media-mute.svg",
            sha256: "36e4d30e72eb37e7931827b96d28c6f25f5dc7e9b63a9c3da81792dc10a3efd3",
            originalSha256: "fea6876677b028bf86de4e86fc577f0e79ac5a461ba1080039e55ec622a04f1c"
          },
          {
            id: "media-pause",
            label: "Media pause",
            tags: [
              "media",
              "pause"
            ],
            path: "assets/packs/fluent/media-pause.svg",
            sha256: "8b0441d12d8ce6ca87f382526a8ad19b2274cf398797bbc55599ca08748b1561",
            originalSha256: "cd573a6ed1179ba68fb76738139292c288318e131bd0998d95e97ee48816ee6e"
          },
          {
            id: "media-pip",
            label: "Media pip",
            tags: [
              "media",
              "pip"
            ],
            path: "assets/packs/fluent/media-pip.svg",
            sha256: "b92b8cabac922101d78235b9b1cd6c0edca1d7d606b3250ae3179cab9492e1d8",
            originalSha256: "cbca8c4a9ea21d047183722d042d7fa75eb96ccacf6209d8a196e825b754c276"
          },
          {
            id: "media-play",
            label: "Media play",
            tags: [
              "media",
              "play"
            ],
            path: "assets/packs/fluent/media-play.svg",
            sha256: "e5d38bb970e9f48e8702b644f31c718507c3e5f14021da6d8927245193118c13",
            originalSha256: "ae6e1ff6bab77c2a2b2f335791afc56d1461509564814ba6e0d7ee59f70e19f5"
          },
          {
            id: "media-speed",
            label: "Media speed",
            tags: [
              "media",
              "speed"
            ],
            path: "assets/packs/fluent/media-speed.svg",
            sha256: "237abf801ca8a8ca2beb9ae47fe002f94c60a0e18551b2d16739947342b44fcb",
            originalSha256: "69e2d792e0d97ef61df11f0150827ce3928b76cd22d2256aa506f5c02f327ab5"
          },
          {
            id: "media-unmute",
            label: "Media unmute",
            tags: [
              "media",
              "unmute"
            ],
            path: "assets/packs/fluent/media-unmute.svg",
            sha256: "c07fcb25d7c2d7baae588ec9c3cabd50bb83335f88092f06d1ead609262a6e5d",
            originalSha256: "b721abff91062619da2f909375ad3fcafcf8d0871bee0007b58c5137911006a5"
          },
          {
            id: "menu-bar",
            label: "Menu bar",
            tags: [
              "menu",
              "bar"
            ],
            path: "assets/packs/fluent/menu-bar.svg",
            sha256: "5e2ff63b95fb44b6a67d1e7e28cd3e7beafddbddb558a24192f563a6a749ad68",
            originalSha256: "fdd5d792dec632d93eb6b29cc3f607cbf8b5cbe69ee1ce1c9cb3eb381f50f86a"
          },
          {
            id: "menu",
            label: "Menu",
            tags: [
              "menu"
            ],
            path: "assets/packs/fluent/menu.svg",
            sha256: "68f59aeeac74c37089fce31becc9999414757f8d98fa6ebc278051e545f8dd42",
            originalSha256: "9887294817499ac016abff8f4de2e0384f0493dee21af91a385b867df70730d4"
          },
          {
            id: "microphone-blocked",
            label: "Microphone blocked",
            tags: [
              "microphone",
              "blocked"
            ],
            path: "assets/packs/fluent/microphone-blocked.svg",
            sha256: "dd8d9dabf7de2c9a46add7983e17b55ec5af13cd7d058ee50c91100bac6268fd",
            originalSha256: "f7f7bf295783869ae3a2b03c6ab5302b0da9305b5e6eaba2ae064cbdbb3062d1"
          },
          {
            id: "microphone",
            label: "Microphone",
            tags: [
              "microphone"
            ],
            path: "assets/packs/fluent/microphone.svg",
            sha256: "3e260467db87dc8cb38151cdf1b64bbaed6c57c05db6650777e1845b1d18e410",
            originalSha256: "7d0244b5d3bb60692baa4792f41c102c2582f1e4c47a381d7ad53eb722ff35e9"
          },
          {
            id: "midi-blocked",
            label: "Midi blocked",
            tags: [
              "midi",
              "blocked"
            ],
            path: "assets/packs/fluent/midi-blocked.svg",
            sha256: "b3914debbbc304f28f9efc14c684acd3dc87bb98d804559c8739567ccaa2efda",
            originalSha256: "f012983ce903c0f95a96de430b1bf9a430dbb81274d52012ebcd432a214e9b5f"
          },
          {
            id: "midi",
            label: "Midi",
            tags: [
              "midi"
            ],
            path: "assets/packs/fluent/midi.svg",
            sha256: "7a3f80f12c4d4a1be06d48563c6313665d6a857b35f71a2b856e9675ba898ffd",
            originalSha256: "401a41217fc340e52dfbd0c9d8e0a67f428bd8bd1b18a89af99567b91de39011"
          },
          {
            id: "move-tab",
            label: "Move tab",
            tags: [
              "move",
              "tab"
            ],
            path: "assets/packs/fluent/move-tab.svg",
            sha256: "d94aab8620e1af049472fd4dd7f31052633a4a63a08c69b3942ebf79ef9bc229",
            originalSha256: "7ab105e99fb4a031c05ba433386aa909d13be8f19fedd83f852689a8c5270906"
          },
          {
            id: "new-tab-image",
            label: "New tab image",
            tags: [
              "new",
              "tab",
              "image"
            ],
            path: "assets/packs/fluent/new-tab-image.svg",
            sha256: "bd703f3341224718b7df992e1b74cbce007ecee1c30076edc0db103a095fe7a9",
            originalSha256: "a845de15f16686750203df66143d28dbc4f5632f4260d99f119803cd0ca633e9"
          },
          {
            id: "new-tab",
            label: "New tab",
            tags: [
              "new",
              "tab"
            ],
            path: "assets/packs/fluent/new-tab.svg",
            sha256: "7ead3c2262529fefa15652760a426a026341eb27f01d69ebcfa59cfb5c29f30e",
            originalSha256: "35dcaba80704311716a5161847709e66257e710bf6affb584fcd359c9a58d5d0"
          },
          {
            id: "open",
            label: "Open",
            tags: [
              "open"
            ],
            path: "assets/packs/fluent/open.svg",
            sha256: "4bb47872afb4a49d69fae25f9456244f0e3b94525731ca66ee4b4f337186e257",
            originalSha256: "e3afd2d7ac9e9df8f88f9af154cb13d33e4e2c476239252e6c94a9a1cc25aefe"
          },
          {
            id: "page-portrait",
            label: "Page portrait",
            tags: [
              "page",
              "portrait"
            ],
            path: "assets/packs/fluent/page-portrait.svg",
            sha256: "44496991994a8a1a4a1d0a49a2b80cb7a2cfb12bcdcf77c13ab44303bd42efa3",
            originalSha256: "fc6d71b52e634094900a365e29c21dc4c266a53ee720d03419758bdf7cff7872"
          },
          {
            id: "passwords",
            label: "Passwords",
            tags: [
              "passwords"
            ],
            path: "assets/packs/fluent/passwords.svg",
            sha256: "0b7bf010ce981db7f22cf108c40b7de318556c7415ceb672186aa9cc457e70fa",
            originalSha256: "f1a869b75c8bba7cdb15016dd54bb0e70eae6715af60f810802b533f46e26acf"
          },
          {
            id: "paste-and-go",
            label: "Paste and go",
            tags: [
              "paste",
              "and",
              "go"
            ],
            path: "assets/packs/fluent/paste-and-go.svg",
            sha256: "ea64f9404c1be9ed02017c156145079488a446827df9d47423e4dbcb98e54f00",
            originalSha256: "dc681daa95761889ae2a85bbbc65ae16140be77573acefaa237989bff287109f"
          },
          {
            id: "permissions-fill",
            label: "Permissions fill",
            tags: [
              "permissions",
              "fill"
            ],
            path: "assets/packs/fluent/permissions-fill.svg",
            sha256: "fb15ceec0e4e24b8530f69188156cd06cb1b6da9a29b68e5de17752145af9107",
            originalSha256: "c08ddece37bda240991c7f80c6b36ff6ee02c08d3e2117ccbd82ad8253317892"
          },
          {
            id: "permissions",
            label: "Permissions",
            tags: [
              "permissions"
            ],
            path: "assets/packs/fluent/permissions.svg",
            sha256: "cd13854d4cc9fb47452f2cc0af42a1f16c219d8243be8c4a6b796c87c65556ca",
            originalSha256: "34026a206fbff56eccc2350fdc36045f683a50b78d151439c4e5679a43eed04e"
          },
          {
            id: "persistent-storage-blocked",
            label: "Persistent storage blocked",
            tags: [
              "persistent",
              "storage",
              "blocked"
            ],
            path: "assets/packs/fluent/persistent-storage-blocked.svg",
            sha256: "d73cf845dbe66faf7fa57cb4fa90c974d573817f2614a8b8353527a8baffd8d4",
            originalSha256: "07d335e147ce3c29c119174b168fad8b411ba6c41341f7d4e5bd3b74b3cf964c"
          },
          {
            id: "persistent-storage",
            label: "Persistent storage",
            tags: [
              "persistent",
              "storage"
            ],
            path: "assets/packs/fluent/persistent-storage.svg",
            sha256: "d3e07970f16ce2613f114dbf9384444f20791f5c6cf28c01dbb59f08d0e54ac3",
            originalSha256: "cd645ab48d86feb951ec648ac408caea112306ac3c8ce986c97971bb870393c7"
          },
          {
            id: "pin",
            label: "Pin",
            tags: [
              "pin"
            ],
            path: "assets/packs/fluent/pin.svg",
            sha256: "8cb61d97b7f5845cccdbf10b7c148a54869d8a796132afe0ad173504ffb79e9b",
            originalSha256: "066260a73417776370dab2d11d65ed8caffe74a42abeb009e633e20de6611530"
          },
          {
            id: "plus",
            label: "Plus",
            tags: [
              "plus"
            ],
            path: "assets/packs/fluent/plus.svg",
            sha256: "3860ea7039525c9f2ec3c28d53c3aa009342fbc24a2c1c1917a9078780c05b61",
            originalSha256: "41b9632a93a34df2870d3bfacb83e44d291aa471f073b77dcebd67d49f1a9b4e"
          },
          {
            id: "pocket-outline",
            label: "Pocket outline",
            tags: [
              "pocket",
              "outline"
            ],
            path: "assets/packs/fluent/pocket-outline.svg",
            sha256: "2a5fb5ae08e6f46a089e50fa870a8260f553d8519571980e160c3309f28fb90b",
            originalSha256: "56ac2207c8ac5c969a942248d78f3be95efc17a345fa4617005deb97162baabf"
          },
          {
            id: "popup",
            label: "Popup",
            tags: [
              "popup"
            ],
            path: "assets/packs/fluent/popup.svg",
            sha256: "fdcc2426516f715b3a00c29280d1d34a5d751e8d4c40adba69465cbc267a4987",
            originalSha256: "1dd4971ac6ea98433d3ca4cbbb7081f8b3446a25d287c669f4963651d682b218"
          },
          {
            id: "print",
            label: "Print",
            tags: [
              "print"
            ],
            path: "assets/packs/fluent/print.svg",
            sha256: "ad1b82839db1388743dd77c12442c93870c4a2a0487d7a5c253c24a0ff77f94c",
            originalSha256: "ecdf8e92a61691832fdaec075f26e37ee4dbda5650ae620a5ef399ecd38f5cf4"
          },
          {
            id: "private-window",
            label: "Private window",
            tags: [
              "private",
              "window"
            ],
            path: "assets/packs/fluent/private-window.svg",
            sha256: "08849d6fa3d132449db065a2b9ea3331e11fdcd91a34b507d16fb06d461244e7",
            originalSha256: "369ef94590e3c66c32d6aca92655b78ae3f8bfbeb039e5d8493bd0d93dd6203f"
          },
          {
            id: "privateBrowsing",
            label: "Private browsing",
            tags: [
              "private",
              "browsing"
            ],
            path: "assets/packs/fluent/privateBrowsing.svg",
            sha256: "5fe913db217a4a617a95a970b496125e78358eb1fbab3a2cf83b24cb4fc3f026",
            originalSha256: "360e9d042cb4c436449d01f2e479345666e21102eaebd2c7ad60cf48820860b2"
          },
          {
            id: "reader-mode",
            label: "Reader mode",
            tags: [
              "reader",
              "mode"
            ],
            path: "assets/packs/fluent/reader-mode.svg",
            sha256: "7f73fa748bbda305a646f9ce64b4880dc8a893d92c04a2b0b859696910fd8a32",
            originalSha256: "acefeebbc1b5044c7d3d2807d1ba88766fe9d98f7092299568b218432bc1c167"
          },
          {
            id: "reload-to-stop",
            label: "Reload to stop",
            tags: [
              "reload",
              "to",
              "stop"
            ],
            path: "assets/packs/fluent/reload-to-stop.svg",
            sha256: "b450278283813082e7746c86b6d2ad25f767092a4d221a9d408efe9a0e850933",
            originalSha256: "89dc5905edc325094d21a39fd9a48d2f1d22afad34083caa05ad6f4a14eff807"
          },
          {
            id: "reload",
            label: "Reload",
            tags: [
              "reload"
            ],
            path: "assets/packs/fluent/reload.svg",
            sha256: "9cb3ed0b96760ae341e97c372c116d12b06bab93ec584cc10099a81896de990c",
            originalSha256: "6c26ff2147a62842af120409f613bbcfda7c37bd942efc373bfc64dd1cd6bc7f"
          },
          {
            id: "report",
            label: "Report",
            tags: [
              "report"
            ],
            path: "assets/packs/fluent/report.svg",
            sha256: "de302587a42833fe3dbd37b5f99797f9f05fa0e1023179b89ea6d1b16f0a571a",
            originalSha256: "d77ee78e5fa3b1d4f83672e857b97d6adb2030a2f76d9463760dd15601715757"
          },
          {
            id: "save",
            label: "Save",
            tags: [
              "save"
            ],
            path: "assets/packs/fluent/save.svg",
            sha256: "fc847c23d232020f39dc5073f9211aa7f28e56b0cf2655b9c5ece52f0a59fade",
            originalSha256: "cd809071f04a54964aa1658bb7559b962574557d2e1287b6269420d763c968a2"
          },
          {
            id: "screen-blocked",
            label: "Screen blocked",
            tags: [
              "screen",
              "blocked"
            ],
            path: "assets/packs/fluent/screen-blocked.svg",
            sha256: "14d075bb3c92affe6d3800d46c4af2d87f5c7f43bc5472bbb9c5ee2e5425a8da",
            originalSha256: "def72a1ea329212a869b2c8cebb4cd27f6fc1e9d1020f96d6aa5d555d644fcec"
          },
          {
            id: "screen",
            label: "Screen",
            tags: [
              "screen"
            ],
            path: "assets/packs/fluent/screen.svg",
            sha256: "20e863dfc31c35ebfb7b7bbadb9794689581820c7ff7b43352c2e0d1c18232dc",
            originalSha256: "250c525390a90ea8551afe17feba65066c54557bb4aafbc07fdb50be591ffb8f"
          },
          {
            id: "screenshot",
            label: "Screenshot",
            tags: [
              "screenshot"
            ],
            path: "assets/packs/fluent/screenshot.svg",
            sha256: "5fa101d8c1be383d1c11e93854eecc63fe8827d41e13d321771551605ca6e290",
            originalSha256: "bee733e3e9afbdb3107112c6c19bda450cd9cdf61a1d7c9a0348a78c7c6f4498"
          },
          {
            id: "search-add",
            label: "Search add",
            tags: [
              "search",
              "add"
            ],
            path: "assets/packs/fluent/search-add.svg",
            sha256: "9f2e99d2bffe9fff3aa2c7da987636b9458074202ba0f8081f8792ac8455abc0",
            originalSha256: "96d1d3714de5d8ae947bd867c491b95343cd43ef2506f931ef3dc4869d371ef7"
          },
          {
            id: "search-glass",
            label: "Search glass",
            tags: [
              "search",
              "glass"
            ],
            path: "assets/packs/fluent/search-glass.svg",
            sha256: "8ebf75dbba1a4a3a7ac5a5b69c9d0772cae42c57b8c3e037d48602250a880a2d",
            originalSha256: "689050c6ce63a3a47029cceabdd5a44bd8336c05642eb5b71e14fd08f6b617bd"
          },
          {
            id: "search-page",
            label: "Search page",
            tags: [
              "search",
              "page"
            ],
            path: "assets/packs/fluent/search-page.svg",
            sha256: "c84daf264239778c827c3d6b16f0f941d1b0f51cd7f85f8f9d1927985415ccac",
            originalSha256: "1242b117c453a6436b5955c7e88b34c802c1ebfc7163096316cd817014020856"
          },
          {
            id: "security-broken",
            label: "Security broken",
            tags: [
              "security",
              "broken"
            ],
            path: "assets/packs/fluent/security-broken.svg",
            sha256: "9dac83c20b38643575e89671daed84d1a83888489e4cd2e97244aad050181ea4",
            originalSha256: "e3418bf647e6655c312b06875a5ef42e7dc8fbef55cc1957dd7632d4cce7f4b9"
          },
          {
            id: "security-warning",
            label: "Security warning",
            tags: [
              "security",
              "warning"
            ],
            path: "assets/packs/fluent/security-warning.svg",
            sha256: "a1a485ee7dc78d20567ee70617cc70c730dc0b195d83eac848a7107576e2c103",
            originalSha256: "a2c9b54c0cdfa6cf7385c0d6f283ed19e1e30d65fa010f1411ebc47d0b3db1df"
          },
          {
            id: "security",
            label: "Security",
            tags: [
              "security"
            ],
            path: "assets/packs/fluent/security.svg",
            sha256: "1dc4a8e28cce8f5d69a3511d50176d7fafb1f668f2cd4c5adb8388fe2f26700d",
            originalSha256: "e690ab01443fa229ec0297363d5c56b5cda3a1a1f02ca0b475cb8716084e413f"
          },
          {
            id: "send-to-device",
            label: "Send to device",
            tags: [
              "send",
              "to",
              "device"
            ],
            path: "assets/packs/fluent/send-to-device.svg",
            sha256: "c7f4ba816c9dc926769ac663cd640bf1addda3e9274b7c571480d17738d5f582",
            originalSha256: "71f582c1de1250099a14a38053ccd25b8fa8384abb303ad2ed256fde3f96b699"
          },
          {
            id: "settings",
            label: "Settings",
            tags: [
              "settings"
            ],
            path: "assets/packs/fluent/settings.svg",
            sha256: "6cc01defc2098a2714927c88bc1967b513811481bdf3e513e46a9ebc06df7fc4",
            originalSha256: "531dfd68ffa68396569f227572ff9660abd3f7f1d8bfd82b9b588304927668f8"
          },
          {
            id: "share",
            label: "Share",
            tags: [
              "share"
            ],
            path: "assets/packs/fluent/share.svg",
            sha256: "8058704cb323f641e57587fafb2db3202a1cd4115263fea8daba07728f35239b",
            originalSha256: "4377642faab90f454defae48d0422347653eac05747777eb1638a53a7d33580c"
          },
          {
            id: "sidebar-right",
            label: "Sidebar right",
            tags: [
              "sidebar",
              "right"
            ],
            path: "assets/packs/fluent/sidebar-right.svg",
            sha256: "8012dfcf20edf0c6c1b57486ee78a1c9b58b924fad3b8e7eac7888e8ad6ef26d",
            originalSha256: "c29f1d1100e91253fc68c8629ac412403e7751e06042c3141f4f7c8261ce4aca"
          },
          {
            id: "sidebar",
            label: "Sidebar",
            tags: [
              "sidebar"
            ],
            path: "assets/packs/fluent/sidebar.svg",
            sha256: "0f9ca8c7bef39c3caa7d35191c4d133dcb1a82176ec40b6a6158e1f56f3eadbb",
            originalSha256: "8e0cd8744fc5ed032caf68799fb71875c4f32bcac2a2af5628d71c28d2b0e6fc"
          },
          {
            id: "sort",
            label: "Sort",
            tags: [
              "sort"
            ],
            path: "assets/packs/fluent/sort.svg",
            sha256: "f2b662b7a99b9cbca37741d7f34c97a60fc82c37d8fcc262b9bc1fcb8d040a21",
            originalSha256: "90dc937c5249bad77a08c0d94bd5b8f76b875a89633d784cc50157aff5960142"
          },
          {
            id: "source-code",
            label: "Source code",
            tags: [
              "source",
              "code"
            ],
            path: "assets/packs/fluent/source-code.svg",
            sha256: "9984d35700d7b6898f79781bc125ec826e0139e7ab64092aa95c63119bdcb87a",
            originalSha256: "7e4c1e4d6c53cfaa75b44aa0c090a9649010522aeaf0170e915140934f5350c8"
          },
          {
            id: "spell-check",
            label: "Spell check",
            tags: [
              "spell",
              "check"
            ],
            path: "assets/packs/fluent/spell-check.svg",
            sha256: "1a302274cbee0e4f99be8c7a5538c017fed15f8a1bbf195818092bdea3ca2a1e",
            originalSha256: "1a302274cbee0e4f99be8c7a5538c017fed15f8a1bbf195818092bdea3ca2a1e"
          },
          {
            id: "split",
            label: "Split",
            tags: [
              "split"
            ],
            path: "assets/packs/fluent/split.svg",
            sha256: "cc97e64caec3ac40c24183d55f06f18ade3232645c7c023e4f429f2d90397f50",
            originalSha256: "2460872d559093bab522cbc6061da567a26b34bd8940f58bf2c7750fc1a09b12"
          },
          {
            id: "stop-to-reload",
            label: "Stop to reload",
            tags: [
              "stop",
              "to",
              "reload"
            ],
            path: "assets/packs/fluent/stop-to-reload.svg",
            sha256: "97de7e97694c311910f354bacaa8210dab3d50e0e83e28614de4fc9428dc6e9d",
            originalSha256: "1ff11d7770309ddfec292775a9ea40489591a71844689b700e87e0c513d2a411"
          },
          {
            id: "tab-right",
            label: "Tab right",
            tags: [
              "tab",
              "right"
            ],
            path: "assets/packs/fluent/tab-right.svg",
            sha256: "4096fdf8f2a0110b01bd3399db4ca8872e9ce70fa65d0f2819630baef9ec8cea",
            originalSha256: "3b2d685047ad90f4e0a8230a18ca9d3a1f090c09f2b5f111f7d8c09adc41e91f"
          },
          {
            id: "tab",
            label: "Tab",
            tags: [
              "tab"
            ],
            path: "assets/packs/fluent/tab.svg",
            sha256: "6ad434f35adadf868f040b4cde4fe1e671f642129aafdb4a3630430f8f8b0788",
            originalSha256: "2ad6d9679d1ee14c79d8ee1498bdbe01e2c75b581173fac03f2ee799008e8f6b"
          },
          {
            id: "tool-profiler",
            label: "Tool profiler",
            tags: [
              "tool",
              "profiler"
            ],
            path: "assets/packs/fluent/tool-profiler.svg",
            sha256: "c104167b581113e7c49e177a55cdc0296ab2a1a157987462c11a2e367bedb0c0",
            originalSha256: "c3de3278e36b9a09c44027f74f5e3f4ed2c1ecc11a8f2dedf1634a4cdef1ca5d"
          },
          {
            id: "tracking-protection",
            label: "Tracking protection",
            tags: [
              "tracking",
              "protection"
            ],
            path: "assets/packs/fluent/tracking-protection.svg",
            sha256: "ee0df87076c1078836ddaa62e046d164b4b4b28fa51dd194eba3754e107f302c",
            originalSha256: "9ea874356b3c5b213cfd0d1b6ea53cda3d23ecd334de166b69f1cef67bfb6f7b"
          },
          {
            id: "translations",
            label: "Translations",
            tags: [
              "translations"
            ],
            path: "assets/packs/fluent/translations.svg",
            sha256: "7e5765dcfaedf8b4ce532be4b46b2c7ac7bcd7b787c47da9ab8c4c985ad9daef",
            originalSha256: "3f522e025d1d20c479b5180183a5d97c24378cd1a3e265eac47de43dd857d336"
          },
          {
            id: "unloadTab",
            label: "Unload tab",
            tags: [
              "unload",
              "tab"
            ],
            path: "assets/packs/fluent/unloadTab.svg",
            sha256: "af9d250d4a845fae67f2b6f3f5e7e7c93140720c688d901b4a05b625190d00d3",
            originalSha256: "eb3a9b564396d8896d0f82e5d797be54e6872ffb07de949632131f70a7f5d3b9"
          },
          {
            id: "unpin",
            label: "Unpin",
            tags: [
              "unpin"
            ],
            path: "assets/packs/fluent/unpin.svg",
            sha256: "66fb64943eb4c12da440fd32248874098bbd3785a564fc8edfc3c44856b303da",
            originalSha256: "d3279af93cc2c12a8e15597f433bb931335bd9388a1a2d53fd5e27edebb63e6b"
          },
          {
            id: "video-open",
            label: "Video open",
            tags: [
              "video",
              "open"
            ],
            path: "assets/packs/fluent/video-open.svg",
            sha256: "4f8b757699081fcdced3e49739f940cb173bac7c34b254f578c635619d723ae1",
            originalSha256: "3a33727b91d8a3525e97ea993f52093ddd13636f0eae462630c3beb93f49d960"
          },
          {
            id: "video-save",
            label: "Video save",
            tags: [
              "video",
              "save"
            ],
            path: "assets/packs/fluent/video-save.svg",
            sha256: "b8cd3c87edfe0accc8eb41456dcb074d0b4ea1c532a927bec0ae8236c5641ecf",
            originalSha256: "844ed6e4c6807fd126a4cf2a3d8f8c0bad4d7da837798c5c183adb324b6845da"
          },
          {
            id: "window",
            label: "Window",
            tags: [
              "window"
            ],
            path: "assets/packs/fluent/window.svg",
            sha256: "5fc46aa1756ac00197d057f53b6c1b498470d4bfebb18351e931e7f0155ec5b3",
            originalSha256: "56a9ecaa5904e834fb5b0fd752a45ff2c15d553daac65d594f975af708b7cfc8"
          },
          {
            id: "xr-blocked",
            label: "Xr blocked",
            tags: [
              "xr",
              "blocked"
            ],
            path: "assets/packs/fluent/xr-blocked.svg",
            sha256: "8bd22d1e6399398b74803e2425b0ef3967ee4b200a420280e20366bcabe1e2a8",
            originalSha256: "7cc63eeec4bfe4e5a635e833d8a9a926d3b9b93aef8000f87b97059983181e2a"
          },
          {
            id: "xr",
            label: "Xr",
            tags: [
              "xr"
            ],
            path: "assets/packs/fluent/xr.svg",
            sha256: "de0bde65ffa3b0d0d500ea4e28158623e75e786f2f716817342edb7cdb2f7824",
            originalSha256: "162740af03a776737ee058446d65afc12a11b78ca66e096481a4b0d127609a2e"
          },
          {
            id: "zoom-control",
            label: "Zoom control",
            tags: [
              "zoom",
              "control"
            ],
            path: "assets/packs/fluent/zoom-control.svg",
            sha256: "4c52b78907d610a72a498f940b1fbe740288cf7822783256dca654db639d90f0",
            originalSha256: "3b56bcc4550250fdd66d5173f4a61b888e22db7fc9f7a3495f3ccc935b688ed7"
          },
          {
            id: "zoom-out",
            label: "Zoom out",
            tags: [
              "zoom",
              "out"
            ],
            path: "assets/packs/fluent/zoom-out.svg",
            sha256: "8ae5bda8be89522f4c4fd82213fe0c2c207f0814beff056156084a8fb0e8cd22",
            originalSha256: "8e16c69c224d4195f3524ec4ea47aa5e2e102d2c2b94b3e2febf3c0499a60a33"
          }
        ]
      },
      {
        id: "zen",
        label: "ZenUI",
        icons: [
          {
            id: "accessibility",
            label: "Accessibility",
            tags: [
              "accessibility"
            ],
            browserPath: "chrome://browser/skin/preferences/category-accessibility.svg"
          },
          {
            id: "add-to-dictionary",
            label: "Add to dictionary",
            tags: [
              "add",
              "to",
              "dictionary"
            ],
            browserPath: "chrome://browser/skin/zen-icons/spell-check.svg"
          },
          {
            id: "arrow-down",
            label: "Arrow down",
            tags: [
              "arrow",
              "down"
            ],
            browserPath: "chrome://browser/skin/zen-icons/arrow-down.svg"
          },
          {
            id: "arrow-left",
            label: "Arrow left",
            tags: [
              "arrow",
              "left"
            ],
            browserPath: "chrome://browser/skin/zen-icons/arrow-left.svg"
          },
          {
            id: "arrow-right",
            label: "Arrow right",
            tags: [
              "arrow",
              "right"
            ],
            browserPath: "chrome://browser/skin/zen-icons/arrow-right.svg"
          },
          {
            id: "arrow-up",
            label: "Arrow up",
            tags: [
              "arrow",
              "up"
            ],
            browserPath: "chrome://browser/skin/zen-icons/arrow-up.svg"
          },
          {
            id: "audio-save",
            label: "Audio save",
            tags: [
              "audio",
              "save"
            ],
            browserPath: "chrome://browser/skin/zen-icons/downloads.svg"
          },
          {
            id: "autoplay-media-blocked",
            label: "Autoplay media blocked",
            tags: [
              "autoplay",
              "media",
              "blocked"
            ],
            browserPath: "chrome://browser/skin/zen-icons/autoplay-media-blocked.svg"
          },
          {
            id: "autoplay-media-fill",
            label: "Autoplay media fill",
            tags: [
              "autoplay",
              "media",
              "fill"
            ],
            browserPath: "chrome://browser/skin/zen-icons/autoplay-media-fill.svg"
          },
          {
            id: "autoplay-media",
            label: "Autoplay media",
            tags: [
              "autoplay",
              "media"
            ],
            browserPath: "chrome://browser/skin/zen-icons/autoplay-media.svg"
          },
          {
            id: "back",
            label: "Back",
            tags: [
              "back"
            ],
            browserPath: "chrome://browser/skin/zen-icons/back.svg"
          },
          {
            id: "bookmark-hollow",
            label: "Bookmark hollow",
            tags: [
              "bookmark",
              "hollow"
            ],
            browserPath: "chrome://browser/skin/zen-icons/bookmark-hollow.svg"
          },
          {
            id: "bookmark-star-on-tray",
            label: "Bookmark star on tray",
            tags: [
              "bookmark",
              "star",
              "on",
              "tray"
            ],
            browserPath: "chrome://browser/skin/zen-icons/bookmark-star-on-tray.svg"
          },
          {
            id: "bookmark",
            label: "Bookmark",
            tags: [
              "bookmark"
            ],
            browserPath: "chrome://browser/skin/zen-icons/bookmark.svg"
          },
          {
            id: "camera-blocked",
            label: "Camera blocked",
            tags: [
              "camera",
              "blocked"
            ],
            browserPath: "chrome://browser/skin/zen-icons/camera-blocked.svg"
          },
          {
            id: "camera-fill",
            label: "Camera fill",
            tags: [
              "camera",
              "fill"
            ],
            browserPath: "chrome://browser/skin/zen-icons/camera-fill.svg"
          },
          {
            id: "camera",
            label: "Camera",
            tags: [
              "camera"
            ],
            browserPath: "chrome://browser/skin/zen-icons/camera.svg"
          },
          {
            id: "canvas",
            label: "Canvas",
            tags: [
              "canvas"
            ],
            browserPath: "chrome://browser/skin/zen-icons/canvas.svg"
          },
          {
            id: "checkmark",
            label: "Checkmark",
            tags: [
              "checkmark"
            ],
            browserPath: "chrome://browser/skin/zen-icons/selectable/checkbox.svg"
          },
          {
            id: "chevron",
            label: "Chevron",
            tags: [
              "chevron"
            ],
            browserPath: "chrome://browser/skin/zen-icons/chevron.svg"
          },
          {
            id: "close-all",
            label: "Close all",
            tags: [
              "close",
              "all"
            ],
            browserPath: "chrome://browser/skin/zen-icons/close.svg"
          },
          {
            id: "close",
            label: "Close",
            tags: [
              "close"
            ],
            browserPath: "chrome://browser/skin/zen-icons/close.svg"
          },
          {
            id: "container-tab",
            label: "Container tab",
            tags: [
              "container",
              "tab"
            ],
            browserPath: "chrome://browser/skin/zen-icons/container-tab.svg"
          },
          {
            id: "cookies-fill",
            label: "Cookies fill",
            tags: [
              "cookies",
              "fill"
            ],
            browserPath: "chrome://browser/skin/zen-icons/cookies-fill.svg"
          },
          {
            id: "customize",
            label: "Customize",
            tags: [
              "customize"
            ],
            browserPath: "chrome://browser/skin/zen-icons/customize.svg"
          },
          {
            id: "dart-down",
            label: "Dart down",
            tags: [
              "dart",
              "down"
            ],
            browserPath: "chrome://browser/skin/zen-icons/dart-down.svg"
          },
          {
            id: "desktop-notification-blocked",
            label: "Desktop notification blocked",
            tags: [
              "desktop",
              "notification",
              "blocked"
            ],
            browserPath: "chrome://browser/skin/zen-icons/desktop-notification-blocked.svg"
          },
          {
            id: "desktop-notification-fill",
            label: "Desktop notification fill",
            tags: [
              "desktop",
              "notification",
              "fill"
            ],
            browserPath: "chrome://browser/skin/zen-icons/desktop-notification-fill.svg"
          },
          {
            id: "desktop-notification",
            label: "Desktop notification",
            tags: [
              "desktop",
              "notification"
            ],
            browserPath: "chrome://browser/skin/zen-icons/desktop-notification.svg"
          },
          {
            id: "developer",
            label: "Developer",
            tags: [
              "developer"
            ],
            browserPath: "chrome://browser/skin/zen-icons/developer.svg"
          },
          {
            id: "downloads",
            label: "Downloads",
            tags: [
              "downloads"
            ],
            browserPath: "chrome://browser/skin/zen-icons/downloads.svg"
          },
          {
            id: "duplicate-tab",
            label: "Duplicate tab",
            tags: [
              "duplicate",
              "tab"
            ],
            browserPath: "chrome://browser/skin/zen-icons/duplicate-tab.svg"
          },
          {
            id: "edit-copy",
            label: "Edit copy",
            tags: [
              "edit",
              "copy"
            ],
            browserPath: "chrome://browser/skin/zen-icons/edit-copy.svg"
          },
          {
            id: "edit-cut",
            label: "Edit cut",
            tags: [
              "edit",
              "cut"
            ],
            browserPath: "chrome://browser/skin/zen-icons/edit-cut.svg"
          },
          {
            id: "edit-delete",
            label: "Edit delete",
            tags: [
              "edit",
              "delete"
            ],
            browserPath: "chrome://browser/skin/zen-icons/edit-delete.svg"
          },
          {
            id: "edit-paste",
            label: "Edit paste",
            tags: [
              "edit",
              "paste"
            ],
            browserPath: "chrome://browser/skin/zen-icons/edit-paste.svg"
          },
          {
            id: "edit-redo",
            label: "Edit redo",
            tags: [
              "edit",
              "redo"
            ],
            browserPath: "chrome://browser/skin/zen-icons/forward.svg"
          },
          {
            id: "edit-select-all",
            label: "Edit select all",
            tags: [
              "edit",
              "select",
              "all"
            ],
            browserPath: "chrome://browser/skin/zen-icons/selectable/checkbox.svg"
          },
          {
            id: "edit-theme",
            label: "Edit theme",
            tags: [
              "edit",
              "theme"
            ],
            browserPath: "chrome://browser/skin/zen-icons/edit-theme.svg"
          },
          {
            id: "edit-undo",
            label: "Edit undo",
            tags: [
              "edit",
              "undo"
            ],
            browserPath: "chrome://browser/skin/zen-icons/u-turn-to-left.svg"
          },
          {
            id: "edit",
            label: "Edit",
            tags: [
              "edit"
            ],
            browserPath: "chrome://browser/skin/zen-icons/edit-theme.svg"
          },
          {
            id: "essential-add",
            label: "Essential add",
            tags: [
              "essential",
              "add"
            ],
            browserPath: "chrome://browser/skin/zen-icons/essential-add.svg"
          },
          {
            id: "essential-remove",
            label: "Essential remove",
            tags: [
              "essential",
              "remove"
            ],
            browserPath: "chrome://browser/skin/zen-icons/essential-remove.svg"
          },
          {
            id: "expand-sidebar",
            label: "Expand sidebar",
            tags: [
              "expand",
              "sidebar"
            ],
            browserPath: "chrome://browser/skin/zen-icons/expand-sidebar.svg"
          },
          {
            id: "ext-link",
            label: "Ext link",
            tags: [
              "ext",
              "link"
            ],
            browserPath: "chrome://browser/skin/zen-icons/open.svg"
          },
          {
            id: "extension-blocked",
            label: "Extension blocked",
            tags: [
              "extension",
              "blocked"
            ],
            browserPath: "chrome://browser/skin/zen-icons/extension-blocked.svg"
          },
          {
            id: "extension-fill",
            label: "Extension fill",
            tags: [
              "extension",
              "fill"
            ],
            browserPath: "chrome://browser/skin/zen-icons/extension-fill.svg"
          },
          {
            id: "extension",
            label: "Extension",
            tags: [
              "extension"
            ],
            browserPath: "chrome://browser/skin/zen-icons/extension.svg"
          },
          {
            id: "folder",
            label: "Folder",
            tags: [
              "folder"
            ],
            browserPath: "chrome://browser/skin/zen-icons/folder.svg"
          },
          {
            id: "forget",
            label: "Forget",
            tags: [
              "forget"
            ],
            browserPath: "chrome://browser/skin/zen-icons/forget.svg"
          },
          {
            id: "forward",
            label: "Forward",
            tags: [
              "forward"
            ],
            browserPath: "chrome://browser/skin/zen-icons/forward.svg"
          },
          {
            id: "fullscreen-exit",
            label: "Fullscreen exit",
            tags: [
              "fullscreen",
              "exit"
            ],
            browserPath: "chrome://browser/skin/zen-icons/fullscreen-exit.svg"
          },
          {
            id: "fullscreen",
            label: "Fullscreen",
            tags: [
              "fullscreen"
            ],
            browserPath: "chrome://browser/skin/zen-icons/fullscreen.svg"
          },
          {
            id: "geo-blocked",
            label: "Geo blocked",
            tags: [
              "geo",
              "blocked"
            ],
            browserPath: "chrome://browser/skin/zen-icons/geo-blocked.svg"
          },
          {
            id: "geo-fill",
            label: "Geo fill",
            tags: [
              "geo",
              "fill"
            ],
            browserPath: "chrome://browser/skin/zen-icons/geo-fill.svg"
          },
          {
            id: "geo",
            label: "Geo",
            tags: [
              "geo"
            ],
            browserPath: "chrome://browser/skin/zen-icons/geo.svg"
          },
          {
            id: "help",
            label: "Help",
            tags: [
              "help"
            ],
            browserPath: "chrome://browser/skin/zen-icons/help.svg"
          },
          {
            id: "history",
            label: "History",
            tags: [
              "history"
            ],
            browserPath: "chrome://browser/skin/zen-icons/history.svg"
          },
          {
            id: "home",
            label: "Home",
            tags: [
              "home"
            ],
            browserPath: "chrome://browser/skin/zen-icons/home.svg"
          },
          {
            id: "image-copy",
            label: "Image copy",
            tags: [
              "image",
              "copy"
            ],
            browserPath: "chrome://browser/skin/zen-icons/edit-copy.svg"
          },
          {
            id: "image-open",
            label: "Image open",
            tags: [
              "image",
              "open"
            ],
            browserPath: "chrome://browser/skin/zen-icons/selectable/image.svg"
          },
          {
            id: "image-save",
            label: "Image save",
            tags: [
              "image",
              "save"
            ],
            browserPath: "chrome://browser/skin/zen-icons/save.svg"
          },
          {
            id: "info",
            label: "Info",
            tags: [
              "info"
            ],
            browserPath: "chrome://browser/skin/zen-icons/info.svg"
          },
          {
            id: "inspect",
            label: "Inspect",
            tags: [
              "inspect"
            ],
            browserPath: "chrome://browser/skin/zen-icons/developer.svg"
          },
          {
            id: "library",
            label: "Library",
            tags: [
              "library"
            ],
            browserPath: "chrome://browser/skin/zen-icons/library.svg"
          },
          {
            id: "link",
            label: "Link",
            tags: [
              "link"
            ],
            browserPath: "chrome://browser/skin/zen-icons/link.svg"
          },
          {
            id: "mail",
            label: "Mail",
            tags: [
              "mail"
            ],
            browserPath: "chrome://browser/skin/zen-icons/mail.svg"
          },
          {
            id: "manage",
            label: "Manage",
            tags: [
              "manage"
            ],
            browserPath: "chrome://browser/skin/zen-icons/manage.svg"
          },
          {
            id: "media-loop",
            label: "Media loop",
            tags: [
              "media",
              "loop"
            ],
            browserPath: "chrome://browser/skin/zen-icons/arrow-rotate-anticlockwise.svg"
          },
          {
            id: "media-mute",
            label: "Media mute",
            tags: [
              "media",
              "mute"
            ],
            browserPath: "chrome://browser/skin/zen-icons/media-mute.svg"
          },
          {
            id: "media-next",
            label: "Media next",
            tags: [
              "media",
              "next"
            ],
            browserPath: "chrome://browser/skin/zen-icons/media-next.svg"
          },
          {
            id: "media-pause",
            label: "Media pause",
            tags: [
              "media",
              "pause"
            ],
            browserPath: "chrome://browser/skin/zen-icons/media-pause.svg"
          },
          {
            id: "media-pip",
            label: "Media pip",
            tags: [
              "media",
              "pip"
            ],
            browserPath: "chrome://browser/skin/zen-icons/window.svg"
          },
          {
            id: "media-play",
            label: "Media play",
            tags: [
              "media",
              "play"
            ],
            browserPath: "chrome://browser/skin/zen-icons/media-play.svg"
          },
          {
            id: "media-previous",
            label: "Media previous",
            tags: [
              "media",
              "previous"
            ],
            browserPath: "chrome://browser/skin/zen-icons/media-previous.svg"
          },
          {
            id: "media-speed",
            label: "Media speed",
            tags: [
              "media",
              "speed"
            ],
            browserPath: "chrome://browser/skin/zen-icons/selectable/time.svg"
          },
          {
            id: "media-unmute",
            label: "Media unmute",
            tags: [
              "media",
              "unmute"
            ],
            browserPath: "chrome://browser/skin/zen-icons/media-unmute.svg"
          },
          {
            id: "menu-bar",
            label: "Menu bar",
            tags: [
              "menu",
              "bar"
            ],
            browserPath: "chrome://browser/skin/zen-icons/menu.svg"
          },
          {
            id: "menu",
            label: "Menu",
            tags: [
              "menu"
            ],
            browserPath: "chrome://browser/skin/zen-icons/menu.svg"
          },
          {
            id: "microphone-blocked-fill",
            label: "Microphone blocked fill",
            tags: [
              "microphone",
              "blocked",
              "fill"
            ],
            browserPath: "chrome://browser/skin/zen-icons/microphone-blocked-fill.svg"
          },
          {
            id: "microphone-blocked",
            label: "Microphone blocked",
            tags: [
              "microphone",
              "blocked"
            ],
            browserPath: "chrome://browser/skin/zen-icons/microphone-blocked.svg"
          },
          {
            id: "microphone-fill",
            label: "Microphone fill",
            tags: [
              "microphone",
              "fill"
            ],
            browserPath: "chrome://browser/skin/zen-icons/microphone-fill.svg"
          },
          {
            id: "microphone",
            label: "Microphone",
            tags: [
              "microphone"
            ],
            browserPath: "chrome://browser/skin/zen-icons/microphone.svg"
          },
          {
            id: "midi",
            label: "Midi",
            tags: [
              "midi"
            ],
            browserPath: "chrome://browser/skin/zen-icons/midi.svg"
          },
          {
            id: "move-tab",
            label: "Move tab",
            tags: [
              "move",
              "tab"
            ],
            browserPath: "chrome://browser/skin/zen-icons/arrow-corner-down-right.svg"
          },
          {
            id: "new-tab-image",
            label: "New tab image",
            tags: [
              "new",
              "tab",
              "image"
            ],
            browserPath: "chrome://browser/skin/zen-icons/new-tab-image.svg"
          },
          {
            id: "open",
            label: "Open",
            tags: [
              "open"
            ],
            browserPath: "chrome://browser/skin/zen-icons/open.svg"
          },
          {
            id: "page-portrait",
            label: "Page portrait",
            tags: [
              "page",
              "portrait"
            ],
            browserPath: "chrome://browser/skin/zen-icons/page-portrait.svg"
          },
          {
            id: "palette",
            label: "Palette",
            tags: [
              "palette"
            ],
            browserPath: "chrome://browser/skin/zen-icons/palette.svg"
          },
          {
            id: "passwords",
            label: "Passwords",
            tags: [
              "passwords"
            ],
            browserPath: "chrome://browser/skin/zen-icons/passwords.svg"
          },
          {
            id: "paste-and-go",
            label: "Paste and go",
            tags: [
              "paste",
              "and",
              "go"
            ],
            browserPath: "chrome://browser/skin/zen-icons/edit-paste.svg"
          },
          {
            id: "permissions-fill",
            label: "Permissions fill",
            tags: [
              "permissions",
              "fill"
            ],
            browserPath: "chrome://browser/skin/zen-icons/permissions-fill.svg"
          },
          {
            id: "permissions",
            label: "Permissions",
            tags: [
              "permissions"
            ],
            browserPath: "chrome://browser/skin/zen-icons/permissions.svg"
          },
          {
            id: "persistent-storage-blocked",
            label: "Persistent storage blocked",
            tags: [
              "persistent",
              "storage",
              "blocked"
            ],
            browserPath: "chrome://browser/skin/zen-icons/persistent-storage-blocked.svg"
          },
          {
            id: "persistent-storage-fill",
            label: "Persistent storage fill",
            tags: [
              "persistent",
              "storage",
              "fill"
            ],
            browserPath: "chrome://browser/skin/zen-icons/persistent-storage-fill.svg"
          },
          {
            id: "persistent-storage",
            label: "Persistent storage",
            tags: [
              "persistent",
              "storage"
            ],
            browserPath: "chrome://browser/skin/zen-icons/persistent-storage.svg"
          },
          {
            id: "pin",
            label: "Pin",
            tags: [
              "pin"
            ],
            browserPath: "chrome://browser/skin/zen-icons/pin.svg"
          },
          {
            id: "plus",
            label: "Plus",
            tags: [
              "plus"
            ],
            browserPath: "chrome://browser/skin/zen-icons/plus.svg"
          },
          {
            id: "popup-fill",
            label: "Popup fill",
            tags: [
              "popup",
              "fill"
            ],
            browserPath: "chrome://browser/skin/zen-icons/popup-fill.svg"
          },
          {
            id: "popup",
            label: "Popup",
            tags: [
              "popup"
            ],
            browserPath: "chrome://browser/skin/zen-icons/popup.svg"
          },
          {
            id: "print",
            label: "Print",
            tags: [
              "print"
            ],
            browserPath: "chrome://browser/skin/zen-icons/print.svg"
          },
          {
            id: "private-window",
            label: "Private window",
            tags: [
              "private",
              "window"
            ],
            browserPath: "chrome://browser/skin/zen-icons/private-window.svg"
          },
          {
            id: "privateBrowsing",
            label: "Private browsing",
            tags: [
              "private",
              "browsing"
            ],
            browserPath: "chrome://browser/skin/zen-icons/privateBrowsing.svg"
          },
          {
            id: "reader-mode",
            label: "Reader mode",
            tags: [
              "reader",
              "mode"
            ],
            browserPath: "chrome://browser/skin/zen-icons/reader-mode.svg"
          },
          {
            id: "reload",
            label: "Reload",
            tags: [
              "reload"
            ],
            browserPath: "chrome://browser/skin/zen-icons/reload.svg"
          },
          {
            id: "remove-tab",
            label: "Remove tab",
            tags: [
              "remove",
              "tab"
            ],
            browserPath: "chrome://browser/skin/zen-icons/close.svg"
          },
          {
            id: "report",
            label: "Report",
            tags: [
              "report"
            ],
            browserPath: "chrome://browser/skin/zen-icons/security-warning.svg"
          },
          {
            id: "save",
            label: "Save",
            tags: [
              "save"
            ],
            browserPath: "chrome://browser/skin/zen-icons/save.svg"
          },
          {
            id: "screen-blocked",
            label: "Screen blocked",
            tags: [
              "screen",
              "blocked"
            ],
            browserPath: "chrome://browser/skin/zen-icons/screen-blocked.svg"
          },
          {
            id: "screen",
            label: "Screen",
            tags: [
              "screen"
            ],
            browserPath: "chrome://browser/skin/zen-icons/screen.svg"
          },
          {
            id: "screenshot",
            label: "Screenshot",
            tags: [
              "screenshot"
            ],
            browserPath: "chrome://browser/skin/zen-icons/screenshot.svg"
          },
          {
            id: "search-add",
            label: "Search add",
            tags: [
              "search",
              "add"
            ],
            browserPath: "chrome://browser/skin/zen-icons/search-glass.svg"
          },
          {
            id: "search-glass",
            label: "Search glass",
            tags: [
              "search",
              "glass"
            ],
            browserPath: "chrome://browser/skin/zen-icons/search-glass.svg"
          },
          {
            id: "search-page",
            label: "Search page",
            tags: [
              "search",
              "page"
            ],
            browserPath: "chrome://browser/skin/zen-icons/search-page.svg"
          },
          {
            id: "security-broken",
            label: "Security broken",
            tags: [
              "security",
              "broken"
            ],
            browserPath: "chrome://browser/skin/zen-icons/security-broken.svg"
          },
          {
            id: "security-warning",
            label: "Security warning",
            tags: [
              "security",
              "warning"
            ],
            browserPath: "chrome://browser/skin/zen-icons/security-warning.svg"
          },
          {
            id: "security",
            label: "Security",
            tags: [
              "security"
            ],
            browserPath: "chrome://browser/skin/zen-icons/security.svg"
          },
          {
            id: "send-to-device",
            label: "Send to device",
            tags: [
              "send",
              "to",
              "device"
            ],
            browserPath: "chrome://browser/skin/zen-icons/send-to-device.svg"
          },
          {
            id: "settings-fill",
            label: "Settings fill",
            tags: [
              "settings",
              "fill"
            ],
            browserPath: "chrome://browser/skin/zen-icons/settings-fill.svg"
          },
          {
            id: "settings",
            label: "Settings",
            tags: [
              "settings"
            ],
            browserPath: "chrome://browser/skin/zen-icons/settings.svg"
          },
          {
            id: "share",
            label: "Share",
            tags: [
              "share"
            ],
            browserPath: "chrome://browser/skin/zen-icons/share.svg"
          },
          {
            id: "sidebar-right",
            label: "Sidebar right",
            tags: [
              "sidebar",
              "right"
            ],
            browserPath: "chrome://browser/skin/zen-icons/sidebar-right.svg"
          },
          {
            id: "sidebar",
            label: "Sidebar",
            tags: [
              "sidebar"
            ],
            browserPath: "chrome://browser/skin/zen-icons/sidebar.svg"
          },
          {
            id: "sidebars-right",
            label: "Sidebars right",
            tags: [
              "sidebars",
              "right"
            ],
            browserPath: "chrome://browser/skin/zen-icons/sidebars-right.svg"
          },
          {
            id: "source-code",
            label: "Source code",
            tags: [
              "source",
              "code"
            ],
            browserPath: "chrome://browser/skin/zen-icons/brackets-curly.svg"
          },
          {
            id: "spell-check",
            label: "Spell check",
            tags: [
              "spell",
              "check"
            ],
            browserPath: "chrome://browser/skin/zen-icons/spell-check.svg"
          },
          {
            id: "split",
            label: "Split",
            tags: [
              "split"
            ],
            browserPath: "chrome://browser/skin/zen-icons/split.svg"
          },
          {
            id: "tab-audio-blocked-small",
            label: "Tab audio blocked small",
            tags: [
              "tab",
              "audio",
              "blocked",
              "small"
            ],
            browserPath: "chrome://browser/skin/zen-icons/tab-audio-blocked-small.svg"
          },
          {
            id: "tab-audio-muted-small",
            label: "Tab audio muted small",
            tags: [
              "tab",
              "audio",
              "muted",
              "small"
            ],
            browserPath: "chrome://browser/skin/zen-icons/tab-audio-muted-small.svg"
          },
          {
            id: "tab-audio-playing-small",
            label: "Tab audio playing small",
            tags: [
              "tab",
              "audio",
              "playing",
              "small"
            ],
            browserPath: "chrome://browser/skin/zen-icons/tab-audio-playing-small.svg"
          },
          {
            id: "tab",
            label: "Tab",
            tags: [
              "tab"
            ],
            browserPath: "chrome://browser/skin/zen-icons/tab.svg"
          },
          {
            id: "tool-profiler",
            label: "Tool profiler",
            tags: [
              "tool",
              "profiler"
            ],
            browserPath: "chrome://browser/skin/zen-icons/tool-profiler.svg"
          },
          {
            id: "tracking-protection-fill",
            label: "Tracking protection fill",
            tags: [
              "tracking",
              "protection",
              "fill"
            ],
            browserPath: "chrome://browser/skin/zen-icons/tracking-protection-fill.svg"
          },
          {
            id: "tracking-protection",
            label: "Tracking protection",
            tags: [
              "tracking",
              "protection"
            ],
            browserPath: "chrome://browser/skin/zen-icons/tracking-protection.svg"
          },
          {
            id: "translations",
            label: "Translations",
            tags: [
              "translations"
            ],
            browserPath: "chrome://browser/skin/zen-icons/translations.svg"
          },
          {
            id: "trash",
            label: "Trash",
            tags: [
              "trash"
            ],
            browserPath: "chrome://browser/skin/zen-icons/trash.svg"
          },
          {
            id: "unpin",
            label: "Unpin",
            tags: [
              "unpin"
            ],
            browserPath: "chrome://browser/skin/zen-icons/unpin.svg"
          },
          {
            id: "video-blocked-fill",
            label: "Video blocked fill",
            tags: [
              "video",
              "blocked",
              "fill"
            ],
            browserPath: "chrome://browser/skin/zen-icons/video-blocked-fill.svg"
          },
          {
            id: "video-fill",
            label: "Video fill",
            tags: [
              "video",
              "fill"
            ],
            browserPath: "chrome://browser/skin/zen-icons/video-fill.svg"
          },
          {
            id: "video-open",
            label: "Video open",
            tags: [
              "video",
              "open"
            ],
            browserPath: "chrome://browser/skin/zen-icons/selectable/video.svg"
          },
          {
            id: "video-save",
            label: "Video save",
            tags: [
              "video",
              "save"
            ],
            browserPath: "chrome://browser/skin/zen-icons/save.svg"
          },
          {
            id: "window",
            label: "Window",
            tags: [
              "window"
            ],
            browserPath: "chrome://browser/skin/zen-icons/window.svg"
          },
          {
            id: "xr-blocked",
            label: "Xr blocked",
            tags: [
              "xr",
              "blocked"
            ],
            browserPath: "chrome://browser/skin/zen-icons/xr-blocked.svg"
          },
          {
            id: "xr-fill",
            label: "Xr fill",
            tags: [
              "xr",
              "fill"
            ],
            browserPath: "chrome://browser/skin/zen-icons/xr-fill.svg"
          },
          {
            id: "xr",
            label: "Xr",
            tags: [
              "xr"
            ],
            browserPath: "chrome://browser/skin/zen-icons/xr.svg"
          },
          {
            id: "zoom-control",
            label: "Zoom control",
            tags: [
              "zoom",
              "control"
            ],
            browserPath: "chrome://browser/skin/zen-icons/plus.svg"
          },
          {
            id: "zoom-out",
            label: "Zoom out",
            tags: [
              "zoom",
              "out"
            ],
            browserPath: "chrome://browser/skin/zen-icons/zoom-out.svg"
          }
        ]
      }
    ],
    mappings: {
      fluent: {
        byId: {
          "node-menu-scrollnodeintoview": "arrow-down",
          cMenu_findAgain: "arrow-down",
          "se-menu-gotoLine": "arrow-right",
          "spell-check-enabled": "spell-check",
          "context-video-pictureinpicture": "media-pip",
          "context-media-loop": "media-loop",
          "request-list-context-resend-only": "media-loop",
          "request-list-context-edit-resend": "media-loop",
          "context-savepage": "save",
          "context-selectall": "edit-select-all",
          context_selectAllTabs: "edit-select-all",
          "toolbar-context-selectAllTabs": "edit-select-all",
          "context-undo": "edit-undo",
          context_undoCloseTab: "edit-undo",
          "toolbar-context-undoCloseTab": "edit-undo",
          context_unloadTab: "unloadTab",
          context_zenUnloadWorkspace: "unloadTab",
          context_zenFolderUnloadAll: "unloadTab",
          context_zenUnloadAllOtherWorkspace: "unloadTab",
          viewColumns: "menu-bar",
          "toggle_toolbar-menubar": "menu-bar",
          "context-redo": "edit-redo",
          "context-copy": "edit-copy",
          placesContext_copy: "edit-copy",
          "context-copyurl": "edit-copy",
          "console-menu-copy": "edit-copy",
          "console-menu-copy-object": "edit-copy",
          "console-menu-export-clipboard": "edit-copy",
          "node-menu-copy-source-url": "edit-copy",
          "node-menu-copy-to-clipboard": "edit-copy",
          "variable-view-popup-copy": "edit-copy",
          "context-paste": "edit-paste",
          placesContext_paste_group: "edit-paste",
          placesContext_paste: "edit-paste",
          "context-paste-no-formatting": "edit-paste",
          "context-cut": "edit-cut",
          placesContext_cut: "edit-cut",
          placesContext_open: "ext-link",
          "context-openlinkincurrent": "ext-link",
          "context-zenOpenLinkInGlance": "ext-link",
          placesContext_showInFolder: "folder-open",
          viewSort: "sort",
          "context-delete": "edit-delete",
          pageActionContextMenuRemoveExtension: "edit-delete",
          placesContext_removeTag: "edit-delete",
          "node-menu-delete": "edit-delete",
          "storage-table-popup-delete": "edit-delete",
          "storage-table-popup-delete-all-from": "edit-delete",
          "storage-table-popup-delete-all": "edit-delete",
          "storage-table-popup-delete-all-session-cookies": "edit-delete",
          "storage-tree-popup-delete-all": "edit-delete",
          "storage-tree-popup-delete-all-session-cookies": "edit-delete",
          "paste-and-go": "paste-and-go",
          "context-print-selection": "print",
          "context-take-screenshot": "screenshot",
          "node-menu-screenshotnode": "screenshot",
          frame: "info",
          "context-ask-chat": "AI-chat",
          context_askChat: "AI-chat",
          "context-previewlink": "AI-summarize",
          "context-viewsource": "source-code",
          "context-inspect-a11y": "accessibility",
          "context-inspect": "inspect",
          "request-list-context-use-as-fetch": "inspect",
          "context-searchselect": "search-glass",
          "context-visual-search": "search-glass",
          "context-searchselect-private": "search-glass",
          "context-add-engine": "search-add",
          "context-translate-selection": "translations",
          "context-viewimage": "image-open",
          "context-viewimageinfo": "info",
          "context-saveimage": "image-save",
          "context-video-saveimage": "image-save",
          "context-savevideo": "video-save",
          "context-viewvideo": "video-open",
          "context-saveaudio": "audio-save",
          "context-copyimage-contents": "image-copy",
          "context-copyimage": "link",
          "context-copyvideourl": "link",
          "context-copylink": "link",
          "context-copy-link-to-highlight": "link",
          "context-copy-clean-link-to-highlight": "link",
          "context-stripOnShareLink": "link",
          "context-pdfjs-copy": "link",
          "context-viewframesource": "source-code",
          "context-viewpartialsource-selection": "source-code",
          "context-sendimage": "mail",
          "context-sendvideo": "mail",
          "context-sendaudio": "mail",
          "context-setDesktopBackground": "customize",
          "toolbar-context-customize": "customize",
          "toolbar-context-customize-sidebar": "customize",
          "context-reloadimage": "reload",
          context_reloadTab: "reload",
          context_reloadSelectedTabs: "reload",
          "toolbar-context-reloadSelectedTab": "reload",
          "toolbar-context-reloadSelectedTabs": "reload",
          "context-sendlinktodevice": "send-to-device",
          context_sendTabToDevice: "send-to-device",
          "context-sendpagetodevice": "send-to-device",
          "context-openlinkintab": "tab",
          "context-openlinkincontainertab": "tab",
          "context-openlinknewtab": "tab",
          "request-list-context-newtab": "tab",
          context_openANewTab: "new-tab-image",
          "toolbar-context-openANewTab": "new-tab-image",
          context_moveTabToGroup: "TabGroup-add",
          context_moveTabToNewGroup: "TabGroup-add",
          context_moveTabToSplitView: "split",
          context_moveSplitViewToNewGroup: "TabGroup-add",
          context_ungroupTab: "TabGroup-remove",
          context_zenMoveToFolder: "folder-open",
          "better-zen-folders-move-space": "move-tab",
          "context-openlinkinusercontext-menu": "container-tab",
          context_reopenInContainer: "container-tab",
          "context-openlink": "window",
          "context-openlinkprivate": "private-window",
          "context-savelink": "downloads",
          "request-list-context-save-as-har": "downloads",
          "request-list-context-save-all-as-har": "downloads",
          "request-list-context-save-response-as": "downloads",
          "spell-add-to-dictionary": "add-to-dictionary",
          "spell-add-dictionaries": "add-to-dictionary",
          "spell-dictionaries": "add-to-dictionary",
          "fill-login": "passwords",
          "manage-saved-logins": "passwords",
          "sidebar-switcher-megalist": "passwords",
          "fill-login-generated-password": "passwords",
          "context-media-play": "media-play",
          context_playTab: "media-play",
          context_playSelectedTabs: "media-play",
          "context-media-pause": "media-pause",
          "context-media-mute": "media-mute",
          context_toggleMuteTab: "media-unmute",
          context_toggleMuteSelectedTabs: "media-unmute",
          "context-media-unmute": "media-unmute",
          "context-media-playbackrate": "media-speed",
          "request-list-context-perf": "media-speed",
          "context-video-fullscreen": "fullscreen",
          "context-leave-dom-fullscreen": "fullscreen-exit",
          "context-media-hidecontrols": "permissions",
          "context-media-showcontrols": "permissions",
          context_pinTab: "pin",
          context_pinSelectedTabs: "pin",
          context_unpinTab: "unpin",
          context_unpinSelectedTabs: "unpin",
          context_duplicateTab: "duplicate-tab",
          context_duplicateTabs: "duplicate-tab",
          context_bookmarkTab: "bookmark-hollow",
          context_bookmarkSelectedTabs: "bookmark-hollow",
          toggle_PersonalToolbar: "bookmark-hollow",
          "context-bookmarklink": "bookmark-hollow",
          "toolbar-context-bookmarkSelectedTab": "bookmark-hollow",
          "toolbar-context-bookmarkSelectedTabs": "bookmark-hollow",
          placesContext_createBookmark: "bookmark-hollow",
          "node-menu-edithtml": "edit",
          context_addNote: "edit",
          context_editNote: "edit",
          BMB_bookmarksShowAllTop: "manage",
          BMB_bookmarksShowAll: "manage",
          pageActionContextMenuManageExtension: "manage",
          BMB_viewBookmarksSidebar: "sidebar",
          BMB_searchBookmarks: "search-page",
          "se-menu-find": "search-page",
          "PanelUI-historyMore": "manage",
          newbookmark: "plus",
          newfolder: "plus",
          newseparator: "plus",
          "node-menu-add": "plus",
          "context_zen-add-domain-to-routing": "plus",
          "context-savelinktopocket": "pocket-outline",
          "context-pocket": "pocket-outline",
          context_moveTabOptions: "move-tab",
          context_reverseSplitView: "move-tab",
          context_zenShareWorkspace: "share",
          context_zenShareFolder: "share",
          context_zenShareSplitView: "share",
          context_closeTab: "close",
          context_closeDuplicateTabs: "close",
          orgClose: "close",
          "sidebar-menu-close": "close",
          context_closeTabOptions: "close-all",
          "sidebar-switcher-bookmarks": "bookmark-star-on-tray",
          "sidebar-switcher-history": "history",
          "sidebar-switcher-tabs": "send-to-device",
          "zen-toolbar-context-tabs-right": "tab-right",
          "sidebar-reverse-position": "tab-right",
          "context_zen-add-essential": "essential-add",
          "context_zen-edit-pinned-page": "essential-add",
          "context_zen-remove-essential": "essential-remove",
          "context-zen-change-workspace-tab": "move-tab",
          context_separateSplitView: "split",
          context_zenSplitTabs: "split",
          "context-zenSplitLink": "split",
          zenToolbarThemePicker: "customize",
          "zen-context-menu-compact-mode": "sidebar",
          "zen-context-menu-compact-mode-toggle": "sidebar",
          "context_zen-reset-pinned-tab": "reload",
          "context_zen-replace-pinned-url-with-current": "reload",
          "zen-context-menu-new-folder": "folder-add",
          "zen-context-menu-new-folder-toolbar": "folder-add",
          "zen-panel-ui-live-folder-create": "folder-add",
          context_zenEditWorkspace: "edit",
          "context_zen-edit-tab-title": "edit",
          context_zenEditWorkspaceIcon: "image-save",
          "context_zen-edit-tab-icon": "image-save",
          context_zenChangeWorkspaceTheme: "customize",
          context_zenWorkspacesOpenInContainerTab: "container-tab",
          context_zenReorderWorkspaces: "sort",
          context_zenDeleteWorkspace: "edit-delete",
          context_zenFolderRename: "edit",
          context_zenFolderChangeIcon: "image-save",
          context_zenFolderNewSubfolder: "folder-add",
          context_zenFolderUnpack: "folder-unpack",
          context_zenChangeFolderSpace: "move-tab",
          context_zenFolderToSpace: "folder_sync_convert",
          "convert-folder-to-group": "folder_sync_convert",
          context_zenFolderDelete: "edit-delete",
          "zen-boost-edit-rename": "edit",
          "zen-boost-edit-reset": "media-loop",
          "zen-boost-load": "edit-undo",
          "zen-boost-save": "edit-redo",
          "zen-boost-edit-delete": "edit-delete",
          context_zenSpaceRoutingSettings: "settings",
          "cmi-show-more-menu": "menu-bar",
          "cmi-show-more-menu-tab": "menu-bar",
          "quicktabs-context-menuitem": "ext-link",
          "quicktabs-tab-context-menuitem": "ext-link",
          "quicksearch-context-menuitem": "search-glass",
          context_renameTab: "edit",
          "context-back": "arrow-left",
          "context-forward": "arrow-right",
          "context-reload": "reload",
          "context-stop": "close"
        },
        byL10n: {
          "library-media-turn-off": "unloadTab",
          "library-media-menu-copy": "edit-copy",
          "library-downloads-menu-copy": "edit-copy",
          "library-media-menu-open": "ext-link",
          "library-downloads-menu-open": "ext-link",
          "library-downloads-menu-trash": "edit-delete",
          "zen-boost-edit-delete": "edit-delete",
          "library-downloads-clear-all": "edit-delete",
          "library-history-clear": "edit-delete",
          "library-downloads-menu-delete": "edit-delete",
          "downloads-cmd-delete-file": "edit-delete",
          "downloads-cmd-remove-from-history": "edit-delete",
          "downloads-cmd-clear-list": "edit-delete",
          "downloads-cmd-clear-downloads": "edit-delete",
          "downloads-cmd-copy-download-link": "link",
          "library-downloads-menu-hide": "hide",
          "library-boosts-menu-edit": "edit",
          "library-open-legacy": "manage",
          "zen-boost-save": "share",
          "text-action-undo": "edit-undo",
          "text-action-redo": "edit-redo",
          "text-action-cut": "edit-cut",
          "text-action-copy": "edit-copy",
          "text-action-paste": "edit-paste",
          "text-action-delete": "edit-delete",
          "text-action-select-all": "edit-select-all",
          "downloads-cmd-show-menuitem-2": "folder-add",
          "zen-panel-ui-workspaces-create": "plus",
          "user-context-new-tab": "new-tab-image",
          "user-context-add-container": "container-tab",
          "user-context-manage-containers": "manage"
        }
      },
      zen: {
        byId: {
          viewSort: "move-tab",
          "context-zen-change-workspace-tab": "move-tab",
          context_moveTabToSplitView: "container-tab",
          context_separateSplitView: "split",
          context_zenSplitTabs: "split",
          "context-zenSplitLink": "split",
          "context-previewlink": "open",
          "context-zenOpenLinkInGlance": "open",
          context_zenOpenWorkspace: "manage",
          context_zenOpenWorkspacePanel: "manage",
          zenToolbarThemePicker: "edit-theme",
          "context-video-pictureinpicture": "media-pip",
          "context-media-loop": "media-loop",
          "request-list-context-resend-only": "media-loop",
          "request-list-context-edit-resend": "media-loop",
          "context-savepage": "save",
          "context-selectall": "edit-select-all",
          context_selectAllTabs: "edit-select-all",
          "toolbar-context-selectAllTabs": "edit-select-all",
          "context-add-engine": "search-add",
          "context-undo": "edit-undo",
          context_undoCloseTab: "edit-undo",
          "toolbar-context-undoCloseTab": "edit-undo",
          "toggle_toolbar-menubar": "menu-bar",
          "context-redo": "edit-redo",
          "node-menu-scrollnodeintoview": "edit-redo",
          cMenu_findAgain: "edit-redo",
          "se-menu-gotoLine": "edit-redo",
          "context-copy": "edit-copy",
          placesContext_copy: "edit-copy",
          "context-copyurl": "edit-copy",
          "console-menu-copy": "edit-copy",
          "console-menu-copy-object": "edit-copy",
          "console-menu-export-clipboard": "edit-copy",
          "node-menu-copy-source-url": "edit-copy",
          "node-menu-copy-to-clipboard": "edit-copy",
          "variable-view-popup-copy": "edit-copy",
          "context-paste": "edit-paste",
          placesContext_paste_group: "edit-paste",
          placesContext_paste: "edit-paste",
          "context-paste-no-formatting": "edit-paste",
          "context-cut": "edit-cut",
          placesContext_cut: "edit-cut",
          "context-delete": "edit-delete",
          pageActionContextMenuRemoveExtension: "edit-delete",
          context_zenDeleteWebPanel: "edit-delete",
          context_zenDeleteWorkspace: "edit-delete",
          placesContext_removeTag: "edit-delete",
          "node-menu-delete": "edit-delete",
          "storage-table-popup-delete": "edit-delete",
          "storage-table-popup-delete-all-from": "edit-delete",
          "storage-table-popup-delete-all": "edit-delete",
          "storage-table-popup-delete-all-session-cookies": "edit-delete",
          "storage-tree-popup-delete-all": "edit-delete",
          "storage-tree-popup-delete-all-session-cookies": "edit-delete",
          "paste-and-go": "paste-and-go",
          "context-print-selection": "print",
          "spell-check-enabled": "spell-check",
          "context-take-screenshot": "screenshot",
          "node-menu-screenshotnode": "screenshot",
          frame: "info",
          "context-viewsource": "source-code",
          "context-inspect-a11y": "accessibility",
          "context-inspect": "inspect",
          "request-list-context-use-as-fetch": "inspect",
          "context-searchselect": "search-glass",
          "context-visual-search": "search-glass",
          "context-searchselect-private": "search-glass",
          "context-viewimage": "image-open",
          "context-viewimageinfo": "info",
          "context-saveimage": "image-save",
          "context-video-saveimage": "image-save",
          "context-savevideo": "video-save",
          "context-viewvideo": "video-open",
          "context-saveaudio": "audio-save",
          "context-copyimage-contents": "image-copy",
          "context-copyimage": "link",
          "context-copyvideourl": "link",
          "context-copylink": "link",
          "context-copy-link-to-highlight": "link",
          "context-copy-clean-link-to-highlight": "link",
          "context-stripOnShareLink": "link",
          context_zenOpenNewTabWebPanel: "link",
          "context-pdfjs-copy": "link",
          "context-openlinkincurrent": "ext-link",
          "context-translate-selection": "translations",
          "appMenu-translate-button": "translations",
          "context-viewframesource": "source-code",
          "context-viewpartialsource-selection": "source-code",
          "context-sendimage": "mail",
          "context-sendvideo": "mail",
          "context-sendaudio": "mail",
          "context-setDesktopBackground": "customize",
          "context-reloadimage": "reload",
          context_reloadTab: "reload",
          context_reloadSelectedTabs: "reload",
          "toolbar-context-reloadSelectedTab": "reload",
          "toolbar-context-reloadSelectedTabs": "reload",
          "context_zen-reset-pinned-tab": "reload",
          "context-sendlinktodevice": "send-to-device",
          context_sendTabToDevice: "send-to-device",
          "context-sendpagetodevice": "send-to-device",
          "sidebar-switcher-tabs": "send-to-device",
          "context-openlinkintab": "tab",
          "context-openlinkincontainertab": "tab",
          context_zenWebPanelContextInContainer: "tab",
          "context-openlinknewtab": "tab",
          "request-list-context-newtab": "tab",
          context_openANewTab: "new-tab-image",
          "toolbar-context-openANewTab": "new-tab-image",
          "context-openlinkinusercontext-menu": "container-tab",
          "context-openlink": "window",
          "context-openlinkprivate": "private-window",
          "context-savelink": "downloads",
          "request-list-context-save-as-har": "downloads",
          "request-list-context-save-all-as-har": "downloads",
          "request-list-context-save-response-as": "downloads",
          "spell-add-to-dictionary": "add-to-dictionary",
          "spell-add-dictionaries": "add-to-dictionary",
          "spell-dictionaries": "add-to-dictionary",
          "fill-login": "passwords",
          "manage-saved-logins": "passwords",
          "sidebar-switcher-megalist": "passwords",
          "fill-login-generated-password": "passwords",
          "context-media-play": "media-play",
          context_playTab: "media-play",
          context_playSelectedTabs: "media-play",
          "context-media-pause": "media-pause",
          "context-media-mute": "media-mute",
          context_toggleMuteTab: "media-unmute",
          context_toggleMuteSelectedTabs: "media-unmute",
          context_zenToggleMuteWebPanel: "media-unmute",
          "context-media-unmute": "media-unmute",
          "context-media-playbackrate": "media-speed",
          "request-list-context-perf": "media-speed",
          "context-video-fullscreen": "fullscreen",
          "context-leave-dom-fullscreen": "fullscreen-exit",
          "context-media-hidecontrols": "permissions",
          "context-media-showcontrols": "permissions",
          context_pinTab: "pin",
          context_unpinTab: "pin",
          context_pinSelectedTabs: "pin",
          context_unpinSelectedTabs: "pin",
          "context_zen-replace-pinned-url-with-current": "pin",
          "context_zen-add-essential": "essential-add",
          "context_zen-edit-pinned-page": "essential-add",
          "context_zen-remove-essential": "essential-remove",
          context_duplicateTab: "duplicate-tab",
          context_duplicateTabs: "duplicate-tab",
          "node-menu-duplicatenode": "duplicate-tab",
          "zen-context-menu-compact-mode": "sidebar",
          "zen-context-menu-compact-mode-toggle": "sidebar",
          context_bookmarkTab: "bookmark-hollow",
          context_bookmarkSelectedTabs: "bookmark-hollow",
          toggle_PersonalToolbar: "bookmark-hollow",
          "context-bookmarklink": "bookmark-hollow",
          "toolbar-context-bookmarkSelectedTab": "bookmark-hollow",
          "toolbar-context-bookmarkSelectedTabs": "bookmark-hollow",
          placesContext_createBookmark: "bookmark-hollow",
          "sidebar-switcher-bookmarks": "bookmark-star-on-tray",
          "sidebar-switcher-history": "history",
          "node-menu-edithtml": "edit",
          context_addNote: "edit",
          context_editNote: "edit",
          BMB_bookmarksShowAllTop: "manage",
          BMB_bookmarksShowAll: "manage",
          pageActionContextMenuManageExtension: "manage",
          BMB_searchBookmarks: "search-page",
          "se-menu-find": "search-page",
          newbookmark: "plus",
          newfolder: "plus",
          newseparator: "plus",
          "node-menu-add": "plus",
          "context_zen-add-domain-to-routing": "plus",
          context_moveTabOptions: "move-tab",
          context_reverseSplitView: "move-tab",
          context_ungroupTab: "remove-tab",
          context_zenMoveToFolder: "folder",
          "better-zen-folders-move-space": "move-tab",
          context_zenShareWorkspace: "share",
          context_zenShareFolder: "share",
          context_zenShareSplitView: "share",
          context_moveTabToGroup: "container-tab",
          context_moveTabToNewGroup: "container-tab",
          context_moveSplitViewToNewGroup: "container-tab",
          context_reopenInContainer: "container-tab",
          context_closeTab: "close",
          context_closeDuplicateTabs: "close",
          orgClose: "close",
          "sidebar-menu-close": "close",
          context_closeTabOptions: "close-all",
          placesContext_open: "ext-link",
          context_zenEditWorkspace: "edit",
          "context_zen-edit-tab-title": "edit",
          context_zenEditWorkspaceIcon: "canvas",
          "context_zen-edit-tab-icon": "canvas",
          context_zenChangeWorkspaceTheme: "customize",
          context_zenWorkspacesOpenInContainerTab: "container-tab",
          context_zenReorderWorkspaces: "move-tab",
          context_zenFolderRename: "edit",
          context_zenFolderChangeIcon: "canvas",
          "zen-context-menu-new-folder": "folder",
          "zen-context-menu-new-folder-toolbar": "folder",
          "zen-panel-ui-live-folder-create": "folder",
          context_zenFolderNewSubfolder: "folder",
          placesContext_showInFolder: "folder",
          context_zenFolderUnpack: "close-all",
          context_zenChangeFolderSpace: "move-tab",
          context_zenFolderToSpace: "edit-redo",
          "convert-folder-to-group": "edit-redo",
          context_zenFolderDelete: "edit-delete",
          "zen-boost-edit-rename": "edit",
          "zen-boost-edit-reset": "media-loop",
          "zen-boost-load": "edit-undo",
          "zen-boost-save": "edit-redo",
          "zen-boost-edit-delete": "edit-delete",
          viewColumns: "menu",
          "cmi-show-more-menu": "menu",
          "cmi-show-more-menu-tab": "menu",
          "quicktabs-context-menuitem": "ext-link",
          "quicktabs-tab-context-menuitem": "ext-link",
          "quicksearch-context-menuitem": "search-glass",
          context_renameTab: "edit",
          "context-back": "arrow-left",
          "context-forward": "arrow-right",
          "context-reload": "reload",
          "context-stop": "close"
        },
        byL10n: {
          "text-action-select-all": "edit-select-all",
          "text-action-undo": "edit-undo",
          "text-action-redo": "edit-redo",
          "text-action-copy": "edit-copy",
          "library-media-menu-copy": "edit-copy",
          "library-downloads-menu-copy": "edit-copy",
          "text-action-paste": "edit-paste",
          "text-action-cut": "edit-cut",
          "text-action-delete": "edit-delete",
          "library-downloads-menu-trash": "edit-delete",
          "zen-boost-edit-delete": "edit-delete",
          "library-downloads-clear-all": "edit-delete",
          "library-history-clear": "edit-delete",
          "library-downloads-menu-delete": "edit-delete",
          "downloads-cmd-delete-file": "edit-delete",
          "downloads-cmd-remove-from-history": "edit-delete",
          "downloads-cmd-clear-list": "edit-delete",
          "downloads-cmd-clear-downloads": "edit-delete",
          "downloads-cmd-copy-download-link": "link",
          "library-media-menu-open": "ext-link",
          "library-downloads-menu-open": "ext-link",
          "library-boosts-menu-edit": "edit",
          "library-open-legacy": "manage",
          "zen-boost-save": "share",
          "zen-panel-ui-workspaces-create": "plus",
          "downloads-cmd-show-menuitem-2": "folder",
          "user-context-new-tab": "tab",
          "user-context-add-container": "container-tab",
          "user-context-manage-containers": "manage"
        }
      }
    },
    unresolvedReferences: [
      {
        pack: "fluent",
        requested: "edit-theme",
        replacement: "color"
      },
      {
        pack: "zen",
        requested: "pocket-outline",
        replacement: null
      }
    ],
    zenBrowserReference: {
      version: "1.23.2b",
      buildID: "20261009073723",
      sourceStamp: "185e856f68a451dc71988e988bc080c56452ea66"
    },
    transformation: "Fluent SVG context-fill/context-stroke replaced by #667b91; contextual opacity replaced by 1. Zen artwork referenced from the installed browser, not copied."
  };

  // project:src/icon-catalog.mjs
  var DEFAULT_ICON_BASE = "chrome://sine/content/context-menu-editor/";
  function createIconCatalog(baseURL = DEFAULT_ICON_BASE) {
    const base = String(baseURL).replace(/\/?$/u, "/");
    const localFluent = new Map(catalog_default.packs.find((pack) => pack.id === "fluent").icons.map((icon) => [icon.id, base + icon.path]));
    const entries = Object.freeze(catalog_default.packs.flatMap((pack) => pack.icons.map((icon) => {
      if (icon.browserPath && !/^chrome:\/\/browser\/skin\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.svg$/u.test(icon.browserPath)) throw new Error("Invalid built-in browser icon reference.");
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
      find(pack, id) {
        return byChoice.get(`${pack}:${id}`) || null;
      },
      mapped(pack, nativeId, l10nId) {
        const mapping = catalog_default.mappings[pack];
        if (!mapping) return null;
        const id = typeof nativeId === "string" && Object.hasOwn(mapping.byId, nativeId) ? mapping.byId[nativeId] : typeof l10nId === "string" && Object.hasOwn(mapping.byL10n, l10nId) ? mapping.byL10n[l10nId] : null;
        return id ? byChoice.get(`${pack}:${id}`) || null : null;
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
  function normalizedPNG(data, window2) {
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
      const exact = catalog.mapped(pack, descriptor.nativeId, descriptor.l10nId || descriptor.l10n);
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
    { id: "zenFolderActions", label: "Folder menu" }
  ]);
  var isHidden = (node) => Boolean(node && ((node.hasAttribute("hidden") ? node.getAttribute("hidden") !== "false" : node.hidden === true) || node.getAttribute("collapsed") === "true"));
  var owned = (node) => node.closest?.("[data-cme-owned]");
  var transient = (node) => node.matches?.(".spell-suggestion, .spell-suggestion-item, .bookmark-item, [data-cme-transient]") || /^(?:spell-suggestion-|spell-add-to-dictionary-|webext-context-menu-(?:.*-)?\d+$)/.test(node.id) || /-menuitem-\d+$/.test(node.id);
  var AI_IDS = /* @__PURE__ */ new Set(["context_askChat", "context-ask-chat", "context-ask-chatgpt", "context-genai"]);
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
    const nativeShareKey = "native:tab-context-share-url";
    const nativeShares = root.id === "tabContextMenu" ? all.filter((node) => {
      const source = sources.get(node);
      return !node.id && !transient(node) && node.parentElement === root && node.localName === "menu" && node.classList.contains("share-tab-url-item") && node.getAttribute("data-l10n-id") === "tab-context-share-url" && (!source || ["unknown", "browser"].includes(source.kind));
    }) : [];
    if (nativeShares.length === 1 && !counts.has(nativeShareKey)) {
      const node = nativeShares[0];
      identities.set(node, nativeShareKey);
      sources.set(node, { kind: "browser", name: "Zen Browser", via: "browser" });
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
    return { items, nodes, meta, protectedNodes, dependencyGroups };
  }

  // project:src/owner-settings.mjs
  function settingFields(property) {
    const words = property.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[._-]/g, " ").toLowerCase();
    if (/\b(icon|icons|iconset|image|artwork)\b/.test(words)) return ["icon"];
    if (/\b(name|label|title|scope)\b/.test(words)) return ["name"];
    if (/\b(order|position|arrangement|layout)\b/.test(words)) return ["placement"];
    if (/\b(hidden|hide|visible|visibility|show|enabled)\b/.test(words)) return ["visibility"];
    return /\b(menu|context|state|settings|config)\b/.test(words) ? ["name", "icon", "visibility", "placement"] : [];
  }
  function changedOwnerPlacement(before, after) {
    const prior = new Map(before.map((item) => [item.key, item])), groups = /* @__PURE__ */ new Map(), stationary = /* @__PURE__ */ new Map(), crossedAnchors = /* @__PURE__ */ new Set();
    for (const item of after) {
      const peers = groups.get(item.parentKey) || [];
      peers.push(item.key);
      groups.set(item.parentKey, peers);
    }
    for (const [parent, peers] of groups) {
      const old = before.find((item) => item.parentKey === parent)?.peers || before.filter((item) => item.parentKey === parent).map((item) => item.key), positions = new Map(old.map((key, index) => [key, index]));
      const common = new Set(peers.filter((key) => positions.has(key))), isAnchor = (key) => common.has(key) && !prior.has(key);
      for (const key of peers) if (prior.has(key) && positions.has(key)) {
        const oldAnchors = old.slice(0, positions.get(key)).filter(isAnchor), newAnchors = peers.slice(0, peers.indexOf(key)).filter(isAnchor);
        if (JSON.stringify(oldAnchors) !== JSON.stringify(newAnchors)) crossedAnchors.add(key);
      }
      const keys = peers.filter((key) => positions.has(key) && prior.has(key) && !crossedAnchors.has(key)), tails = [], tailRows = [], parents = [];
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
  function createOwnerSettingsObserver(window2, { prefs, loadMods, onChange }) {
    let disposed = false, bindings = /* @__PURE__ */ new Map(), prefixes = /* @__PURE__ */ new Map(), pending = null;
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
    async function load() {
      try {
        const mods = await loadMods(), next = /* @__PURE__ */ new Map(), families = /* @__PURE__ */ new Map();
        await Promise.all(Object.values(mods || {}).filter((mod) => mod?.id !== "context-menu-editor" && typeof mod?.preferences === "string" && /^[\w.-]+$/.test(mod.id) && /^[\w./-]+\.json$/.test(mod.preferences) && !mod.preferences.split("/").includes("..")).map(async (mod) => {
          try {
            const response = await window2.fetch(`chrome://sine/content/${mod.id}/${mod.preferences}`), text = await response.text();
            if (text.length > 256 * 1024) return;
            const entries = JSON.parse(text);
            if (!Array.isArray(entries)) return;
            for (const entry of entries) {
              const property = entry?.property;
              if (typeof property !== "string" || !property || property.length > 256) continue;
              const owners = next.get(property) || [];
              if (!owners.some((owner) => owner.id === mod.id)) owners.push({ id: mod.id, fields: settingFields(property) });
              next.set(property, owners);
              const prefix = property.slice(0, property.lastIndexOf(".") + 1);
              if (prefix.split(".").filter(Boolean).length >= 2) {
                const group = families.get(prefix) || [];
                group.push(mod.id);
                families.set(prefix, group);
              }
            }
          } catch {
          }
        }));
        if (disposed) return;
        prefixes = /* @__PURE__ */ new Map();
        for (const [prefix, ids] of families) if (ids.length >= 2 && new Set(ids).size === 1) prefixes.set(prefix, ids[0]);
        bindings = next;
      } catch {
      }
    }
    const observer = { observe(_subject, _topic, property) {
      if (disposed || typeof property !== "string" || property.startsWith("extension.context-menu-editor.")) return;
      let owners = bindings.get(property);
      if (!owners) {
        const ids = new Set([...prefixes].filter(([prefix]) => property.startsWith(prefix)).map(([, id]) => id));
        if (ids.size === 1) owners = [{ id: [...ids][0], fields: settingFields(property) }];
      }
      for (const owner of owners || []) if (owner.fields.length) onChange(owner.id, owner.fields);
    } };
    prefs.addObserver("", observer);
    void refresh();
    return { refresh, destroy() {
      if (disposed) return;
      disposed = true;
      prefs.removeObserver("", observer);
      bindings.clear();
      prefixes.clear();
    } };
  }
  function applyOwnerChanges(state, rootId, descriptors, { patches = [], placement = [] }) {
    let next = mergeInventory(state, rootId, descriptors);
    for (const { key, patch } of patches) if (next.roots[rootId].records[key]) next = updateItem(next, rootId, key, patch);
    if (placement.length) {
      next = validateState(next);
      const root = next.roots[rootId], moving = new Set(placement.map((item) => item.key));
      root.children = root.children.filter((key) => !moving.has(key));
      for (const record of Object.values(root.records)) if (record.children) record.children = record.children.filter((key) => !moving.has(key));
      for (const { key, parentKey } of placement) {
        const target = parentKey === null ? root.children : root.records[parentKey]?.children;
        if (!target) throw Error("The owner submenu is unavailable.");
        const peers = descriptors.filter((item) => item.parentKey === parentKey).map((item) => item.key), index = peers.indexOf(key);
        const before = peers.slice(index + 1).find((candidate) => target.includes(candidate)), after = peers.slice(0, index).reverse().find((candidate) => target.includes(candidate));
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
  var bool = (node, name) => node.getAttribute(name) === "true" || node[name] === true;
  var presentation = "label.menu-text,label.menu-accel,img.menu-icon";
  function derivedPresentation(record) {
    const target = record.target.nodeType === 1 ? record.target : record.target.parentElement;
    if (target?.closest?.(presentation)) return !(record.type === "attributes" && ["src", "srcset", "style"].includes(record.attributeName) && target.matches?.("img.menu-icon,.menu-iconic-icon"));
    const changed = [...record.addedNodes || [], ...record.removedNodes || []];
    return record.type === "childList" && changed.length > 0 && changed.every((node) => node.nodeType === 3 || node.matches?.(presentation));
  }
  function createMenuController(window2, { getState, resolveIcon = () => null, resolveSource = () => null, onInventory = () => {
  }, onOwnerChange = () => {
  } }) {
    const document2 = window2.document, contexts = /* @__PURE__ */ new Map(), retired = /* @__PURE__ */ new Map(), pendingOpenings = /* @__PURE__ */ new WeakMap(), listeners = /* @__PURE__ */ new Set();
    let destroyed = false, inventory = [], trigger = null;
    const notify = () => {
      inventory = [...contexts.values()].map((c) => ({ id: c.root.id, label: c.label, items: [...c.scan.items, ...[...c.remembered.values()].filter((item) => !c.scan.nodes.has(item.key)).map((item) => ({ ...item, available: false }))] }));
      onInventory(inventory);
      for (const fn of listeners) fn(inventory);
    };
    function stopOwnerWindow(pending) {
      if (pending.timer !== void 0) {
        window2.clearTimeout(pending.timer);
        delete pending.timer;
      }
    }
    function settleOwnerWindow(c, id, pending) {
      if (pending.timer !== void 0) return;
      pending.timer = window2.setTimeout(() => {
        if (c.pendingOwners.get(id) === pending) c.pendingOwners.delete(id);
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
      for (const [id, pending] of c.pendingOwners) {
        if (c.open) settleOwnerWindow(c, id, pending);
        const patchCount = patches.length, placementCount = placementKeys.size;
        const after = c.scan.items.filter((item) => item.source?.kind === "mod" && item.source.id === id), before = pending.before;
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
          for (const item of changedOwnerPlacement([...before.values()], c.scan.items)) if (pending.remaining.get(item.key)?.has("placement")) {
            placementKeys.add(item.key);
            pending.remaining.get(item.key).delete("placement");
          }
        }
        if ([...pending.remaining.values()].every((fields) => !fields.size)) {
          stopOwnerWindow(pending);
          c.pendingOwners.delete(id);
        } else if (patches.length > patchCount || placementKeys.size > placementCount) settleOwnerWindow(c, id, pending);
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
        if (item.identity === "mod-label") c.remembered.set(item.key, { ...item });
      }
      for (const [id, current] of currentOwners) {
        for (const [key, item] of c.lastOwners.get(id) || []) if (!current.has(key)) current.set(key, item);
        c.lastOwners.set(id, current);
      }
    }
    function noteOwnerSettingsChange(id, fields) {
      for (const c of [...contexts.values(), ...retired.values()]) {
        const before = c.lastOwners.get(id);
        if (!before?.size) continue;
        const pending = c.pendingOwners.get(id) || { before: /* @__PURE__ */ new Map(), remaining: /* @__PURE__ */ new Map() };
        for (const [key, item] of before) {
          const prior = pending.before.get(key) || { ...item }, remaining = pending.remaining.get(key) || /* @__PURE__ */ new Set();
          for (const field of fields) {
            remaining.add(field);
            for (const property of { name: ["label"], icon: ["iconURL"], visibility: ["available"], placement: ["parentKey", "peers"] }[field] || []) prior[property] = item[property];
          }
          pending.before.set(key, prior);
          pending.remaining.set(key, remaining);
        }
        stopOwnerWindow(pending);
        c.pendingOwners.set(id, pending);
        if (c.open) settleOwnerWindow(c, id, pending);
      }
    }
    function adoptForeign(c, records) {
      for (const record of records) {
        if (record.type === "attributes") {
          c.attrs.get(record.target)?.delete(record.attributeName);
          if (record.attributeName === "style") {
            const previous = document2.createElementNS(HTML, "span");
            previous.setAttribute("style", record.oldValue || "");
            for (const [name] of c.styles.get(record.target) || []) if (previous.style.getPropertyValue(name) !== record.target.style.getPropertyValue(name)) c.styles.get(record.target).delete(name);
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
    function restore(c, keepMenus = false) {
      pause(c);
      const retained = /* @__PURE__ */ new Set();
      if (keepMenus) for (const [key, container] of c.menus) {
        if (c.root.contains(container.menu) && container.popup.parentNode === container.menu) {
          retained.add(container.menu);
          retained.add(container.popup);
        } else c.menus.delete(key);
      }
      for (const [node, fields] of c.attrs) for (const [name, record] of fields) if (node.getAttribute(name) === record.applied) {
        if (record.before === null) node.removeAttribute(name);
        else node.setAttribute(name, record.before);
      }
      for (const [node, fields] of c.styles) for (const [name, record] of fields) if (node.style.getPropertyValue(name) === record.applied) {
        if (record.before) node.style.setProperty(name, record.before, record.priority);
        else node.style.removeProperty(name);
      }
      for (const [node] of [...c.positions || []].reverse()) {
        const move2 = c.moves.get(node);
        if (!move2 || move2.foreign || node.parentNode !== move2.appliedParent) continue;
        const siblings = c.sourceOrders.get(move2.parent) || [], index = siblings.indexOf(node);
        const anchor = siblings.slice(index + 1).find((sibling) => sibling.parentNode === move2.parent && !c.moves.get(sibling)?.foreign) || null;
        if (node.parentNode !== move2.parent || node.nextSibling !== anchor) move2.parent.insertBefore(node, anchor);
      }
      for (const container of c.owned) if (container.isConnected && ["menu", "menupopup"].includes(container.localName)) {
        for (const child of [...container.children]) if (!c.owned.has(child) && (container.localName === "menupopup" || ["menu", "menuitem", "menuseparator", "menugroup", "menupopup"].includes(child.localName))) c.root.insertBefore(child, container.closest("[data-cme-owned]")?.parentNode === c.root ? container.closest("[data-cme-owned]") : null);
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
      if (record.name !== void 0 && descriptor.kind !== "separator") {
        attr(c, node, "data-l10n-id", null);
        attr(c, node, "label", record.name);
      }
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
        const descriptor = c.scan.items.find((item) => c.scan.nodes.get(item.key) === node), name = descriptor && records[descriptor.key]?.name, access = node.getAttribute("accesskey");
        if (name !== void 0 && access && !name.toLocaleLowerCase().includes(access.toLocaleLowerCase())) attr(c, node, "accesskey", null);
      }
      const counts = /* @__PURE__ */ new Map();
      for (const node of children) {
        const key = node.getAttribute("accesskey")?.toLocaleLowerCase();
        if (key) counts.set(key, (counts.get(key) || 0) + 1);
      }
      for (const node of children) {
        const descriptor = c.scan.items.find((item) => c.scan.nodes.get(item.key) === node), key = node.getAttribute("accesskey")?.toLocaleLowerCase();
        if (descriptor && records[descriptor.key]?.name !== void 0 && counts.get(key) > 1) attr(c, node, "accesskey", null);
      }
    }
    function decorate(c, node, descriptor, record, options) {
      attr(c, node, "data-cme-item", "true");
      rename(c, node, descriptor, record);
      const preferClean = options.preferCleanLinks && c.root.id === "contentAreaContextMenu";
      if (record.hidden || record.removed || options.hideUnavailable && bool(node, "disabled") || !descriptor.available || preferClean && (descriptor.key === "context-copylink" && c.cleanLinkAvailable || descriptor.key === "context-stripOnShareLink" && bool(node, "disabled"))) attr(c, node, "hidden", "true");
      if (descriptor.kind === "separator") return;
      if (record.iconOwner) {
        attr(c, node, "data-cme-icons", "owner");
        return;
      }
      attr(c, node, "data-cme-icons", options.showIcons === false || record.showIcon === false ? "off" : "on");
      if (options.showIcons === false || record.showIcon === false) return;
      const icon = resolveIcon(descriptor, record, options);
      if (!icon) return;
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
    function apply(c) {
      const initial = getState(), state = initial?.roots?.[c.root.id]?.legacyHiddenIds?.length ? mergeInventory(initial, c.root.id, c.scan.items) : initial;
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
      c.sourceOrders = new Map([c.root, ...c.root.querySelectorAll("*")].map((parent) => [parent, [...parent.childNodes]]));
      c.positions = new Map([...c.root.querySelectorAll("*")].map((node) => [node, { parent: node.parentNode, next: node.nextSibling }]));
      const queue = (parent, node) => {
        if (!desired.has(parent)) desired.set(parent, []);
        desired.get(parent).push(node);
      };
      function place(keys, parent, boundary = null) {
        for (const key of keys) {
          if (seen.has(key)) continue;
          seen.add(key);
          const record = records[key] || {}, descriptor = descriptors.get(key);
          let node = c.scan.nodes.get(key);
          if (!descriptor) {
            if (record.kind === "submenu") {
              let held = c.menus.get(key);
              if (!held) {
                node = make(c, "menu");
                const popup2 = make(c, "menupopup");
                popup2.setAttribute("needsgutter", "true");
                node.append(popup2);
                held = { menu: node, popup: popup2 };
                c.menus.set(key, held);
              }
              node = held.menu;
              const popup = held.popup;
              usedMenus.add(key);
              node.setAttribute("label", record.name || "Submenu");
              if (node.parentNode !== parent) parent.append(node);
              queue(parent, node);
              containers.add(popup);
              decorate(c, node, { key, kind: "submenu", label: record.name || "Submenu", available: true }, record, options);
              place(record.children || [], popup, boundary);
              if (![...popup.children].some((n) => n.localName !== "menuseparator" && !isHidden(n))) attr(c, node, "hidden", "true");
            } else if (record.kind === "separator" && record.owned) {
              node = make(c, "menuseparator");
              parent.append(node);
              queue(parent, node);
              decorate(c, node, { key, kind: "separator", available: true }, record, options);
            }
            continue;
          }
          if (descriptor.boundary !== boundary) {
            continue;
          }
          if (descriptor.locked) {
            if (node.parentNode === parent) queue(parent, node);
            continue;
          }
          queue(parent, node);
          if (node.parentNode !== parent) move(c, node, parent);
          decorate(c, node, descriptor, record, options);
          const navigation = c.scan.meta.get(key)?.navigation;
          if (navigation) {
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
      for (const [key, held] of c.menus) if (!usedMenus.has(key)) {
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
          const previous = original.slice(0, i).reverse().find((n) => planned.includes(n));
          const next = original.slice(i + 1).find((n) => planned.includes(n));
          planned.splice(previous ? planned.indexOf(previous) + 1 : next ? planned.indexOf(next) : planned.length, 0, node);
        }
        for (const [head, members] of c.scan.dependencyGroups) if (planned.includes(head)) {
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
      for (const descriptor of c.scan.items) if (descriptor.locked) decorate(c, c.scan.nodes.get(descriptor.key), descriptor, records[descriptor.key] || {}, options);
      for (const container of containers) {
        const children = [...container.children].filter((n) => !isHidden(n));
        let priorSeparator = true;
        for (let i = 0; i < children.length; i++) {
          const node = children[i], sep = node.localName === "menuseparator", descriptor = c.scan.items.find((d) => c.scan.nodes.get(d.key) === node);
          if (sep && (priorSeparator || i === children.length - 1) && !descriptor?.locked && !c.scan.protectedNodes.has(node)) attr(c, node, "hidden", "true");
          else priorSeparator = sep;
        }
        accessKeys(c, container, records);
      }
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
      const parent = c.scan.items.find((item) => c.scan.nodes.get(item.key) === popup.parentElement);
      if (parent?.kind !== "native-menu") return false;
      const tracked = new Set(c.scan.nodes.values());
      const ownerOnly = (node) => {
        if (node.nodeType !== 1) return true;
        if (node.matches("style,link,script") || node.querySelector("style,link,script")) return false;
        const selector = "menu,menuitem,menuseparator,menugroup", rows = [...node.querySelectorAll(selector)];
        if (node.matches(selector)) rows.unshift(node);
        return rows.every((row) => !row.id && !tracked.has(row) && resolveSource(row)?.kind !== "mod");
      };
      if (record.target !== popup) {
        const row = record.target.closest?.("menu,menuitem,menuseparator,menugroup");
        if (!row || !ownerOnly(row)) return false;
      }
      if (record.type === "attributes") return record.target !== popup && ownerOnly(record.target);
      const changed = [...record.addedNodes || [], ...record.removedNodes || []];
      return record.type === "childList" && changed.length > 0 && changed.every(ownerOnly);
    }
    function attach(root, label, previous) {
      const c = { root, label, scan: discoverRoot(root, { resolveSource }), attrs: /* @__PURE__ */ new Map(), styles: /* @__PURE__ */ new Map(), moves: /* @__PURE__ */ new Map(), owned: /* @__PURE__ */ new Set(), menus: /* @__PURE__ */ new Map(), fallbackWrites: /* @__PURE__ */ new WeakMap(), open: false, bypass: false, epoch: 0, scheduled: false, reconciliations: 0, lastOwners: previous?.lastOwners || /* @__PURE__ */ new Map(), pendingOwners: previous?.pendingOwners || /* @__PURE__ */ new Map(), remembered: previous?.remembered || /* @__PURE__ */ new Map() };
      ownerChanges(c);
      c.observer = new window2.MutationObserver((records) => {
        records = records.filter((record) => !(record.type === "attributes" && record.attributeName === "style" && c.owned.has(record.target.closest?.(".cme-symbol")?.parentElement)));
        const fallbackTargets = new Set(records.filter((record) => record.type === "attributes" && record.attributeName === "src" && c.fallbackWrites.has(record.target) && record.target.getAttribute("src") === c.fallbackWrites.get(record.target)).map((record) => record.target));
        records = records.filter((record) => !(record.type === "attributes" && record.attributeName === "src" && fallbackTargets.has(record.target)));
        for (const target of fallbackTargets) c.fallbackWrites.delete(target);
        records = records.filter((record) => !(record.type === "attributes" && ["_moz-menuactive", "open"].includes(record.attributeName) && ["menu", "menuitem", "menupopup"].includes(record.target.localName)));
        records = records.filter((record) => !(record.type === "attributes" && record.attributeName === "hasbeenopened" && record.target.localName === "menupopup"));
        records = records.filter((record) => !derivedPresentation(record));
        if (!records.length) return;
        adoptForeign(c, records);
        if (c.open) {
          const ownerOnly = records.filter((record) => ownerOnlySubmenuChange(c, record));
          if (ownerOnly.length) {
            records = records.filter((record) => !ownerOnly.includes(record));
            const state = getState();
            if (state?.options?.enabled !== false && !c.bypass) {
              pause(c);
              const saved = state?.roots?.[c.root.id]?.records || {};
              for (const popup of new Set(ownerOnly.map((record) => record.target.closest("menupopup")))) accessKeys(c, popup, saved);
              observe(c);
            }
          }
        }
        if (!records.length) return;
        if (c.open && !c.scheduled && records.every((record) => record.type === "attributes" && ["label", "accesskey"].includes(record.attributeName)) && c.reconciliations < 24) {
          c.reconciliations++;
          pause(c);
          for (const node of new Set(records.map((record) => record.target))) {
            const descriptor = c.scan.items.find((item) => c.scan.nodes.get(item.key) === node);
            if (!descriptor) continue;
            if (records.some((record) => record.target === node && record.attributeName === "label")) descriptor.label = node.getAttribute("label") || node.getAttribute("aria-label") || descriptor.key;
          }
          ownerChanges(c);
          const state = getState(), active = state?.options?.enabled !== false && !c.bypass, saved = state?.roots?.[c.root.id]?.records || {};
          for (const node of new Set(records.map((record) => record.target))) {
            const descriptor = c.scan.items.find((item) => c.scan.nodes.get(item.key) === node);
            if (!descriptor) continue;
            if (active) rename(c, node, descriptor, saved[descriptor.key] || {});
          }
          if (active) for (const parent of new Set(records.map((record) => record.target.parentElement).filter(Boolean))) accessKeys(c, parent, saved);
          observe(c);
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
      });
      contexts.set(root.id, c);
      observe(c);
    }
    function sync() {
      if (destroyed) return;
      const specs = new Map(ROOTS.map((spec) => [spec.id, spec]));
      for (const root of document2.querySelectorAll("menupopup[id]")) {
        if (specs.has(root.id) || root.parentElement?.closest("menupopup,menu") || root.closest("[data-cme-owned]")) continue;
        const source = resolveSource(root), owner = source?.kind === "mod" ? source : discoverRoot(root, { resolveSource }).items.find((item) => item.source?.kind === "mod")?.source;
        if (owner) specs.set(root.id, { id: root.id, label: root.getAttribute("label") || `${owner.name} menu` });
      }
      for (const [id, c] of contexts) if (!specs.has(id) && c.root.isConnected) specs.set(id, { id, label: c.label });
      for (const [id, c] of contexts) if (document2.getElementById(id) !== c.root) {
        restore(c);
        c.observer.disconnect();
        contexts.delete(id);
        retired.set(id, { label: c.label, lastOwners: c.lastOwners, pendingOwners: c.pendingOwners, remembered: c.remembered });
      }
      for (const [id, c] of retired) if (document2.getElementById(id)?.localName === "menupopup") specs.set(id, { id, label: c.label });
      for (const spec of specs.values()) {
        const root = document2.getElementById(spec.id), old = contexts.get(spec.id);
        if (old?.root === root) continue;
        if (root) {
          attach(root, spec.label, retired.get(spec.id));
          retired.delete(spec.id);
        }
      }
      notify();
    }
    const onShow = (event) => {
      let c = contexts.get(event.target?.id);
      if (c && c.root !== event.target) {
        sync();
        c = contexts.get(event.target?.id);
      }
      if (!c) {
        const root = event.target;
        if (root?.localName !== "menupopup" || !root.id || root.parentElement?.closest("menupopup,menu") || root.closest("[data-cme-owned]")) return;
        const epoch2 = (pendingOpenings.get(root) || 0) + 1;
        pendingOpenings.set(root, epoch2);
        window2.queueMicrotask(() => {
          if (destroyed || pendingOpenings.get(root) !== epoch2 || event.defaultPrevented || !root.isConnected) return;
          sync();
          const late = contexts.get(root.id);
          if (!late || late.root !== root || late.open) return;
          late.open = true;
          late.bypass = Boolean(getState()?.options?.shiftBypass && (event.shiftKey || trigger?.shiftKey && window2.performance.now() - trigger.time < 1500));
          trigger = null;
          late.reconciliations = 0;
          reconcile(late);
        });
        return;
      }
      if (c.root !== event.target) return;
      c.epoch++;
      c.reconciliations = 0;
      const epoch = c.epoch;
      restore(c);
      c.open = false;
      const recentTrigger = trigger?.rootId === c.root.id && window2.performance.now() - trigger.time < 1500 ? trigger : null;
      c.bypass = Boolean(getState()?.options?.shiftBypass && (event.shiftKey || event.triggerEvent?.shiftKey || c.root.triggerEvent?.shiftKey || recentTrigger?.shiftKey));
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
    window2.addEventListener("contextmenu", onContext, true);
    window2.addEventListener("popupshowing", onShow, true);
    window2.addEventListener("popupshown", onShown, true);
    window2.addEventListener("popuphiding", onHide, true);
    window2.addEventListener("popuphidden", onHide, true);
    const rootObserver = new window2.MutationObserver((records) => {
      if (records.some((r) => [...r.addedNodes, ...r.removedNodes].some((n) => n.nodeType === 1 && (n.localName === "menupopup" || n.querySelector?.("menupopup") || ROOTS.some((s) => n.id === s.id))))) sync();
    });
    rootObserver.observe(document2, { childList: true, subtree: true });
    sync();
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
      contexts.clear();
      retired.clear();
      listeners.clear();
      window2.removeEventListener("contextmenu", onContext, true);
      window2.removeEventListener("popupshowing", onShow, true);
      window2.removeEventListener("popupshown", onShown, true);
      window2.removeEventListener("popuphiding", onHide, true);
      window2.removeEventListener("popuphidden", onHide, true);
      window2.removeEventListener("unload", destroy);
    };
    window2.addEventListener("unload", destroy, { once: true });
    return { getInventory: () => inventory, noteOwnerSettingsChange, clearOwnerSettingsChanges, refresh() {
      sync();
      for (const c of contexts.values()) reconcile(c);
    }, subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    }, destroy };
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
      const id = `cme-${ownerToken}-${key}`;
      title.htmlFor = id;
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
      control.id = id;
      control.dataset.option = key;
      control.dataset.focus = `option:${key}`;
      control.setAttribute("aria-describedby", `${id}-help`);
      control.addEventListener("change", () => {
        const value = kind === "checkbox" ? control.checked : kind === "number" ? Number(control.value) : control.value;
        commit((state) => {
          if (key === "hideUnavailable") return { ...state, roots: { ...state.roots, [currentRoot]: { ...state.roots[currentRoot], hideUnavailable: value } } };
          const next = { ...state, options: { ...state.options, [key]: value } };
          if (["showIcons", "iconPack", "iconSize", "iconAlignment", "iconGap", "monochromeExtensions"].includes(key)) {
            next.roots = Object.fromEntries(Object.entries(state.roots).map(([id2, root]) => [id2, { ...root, records: Object.fromEntries(Object.entries(root.records).map(([item, record]) => {
              const copy = { ...record };
              delete copy.iconOwner;
              return [item, copy];
            })) }]));
          }
          return next;
        }, `${label} updated.`);
      });
      group.append(title, control, node("p", help, { class: "cme-help", id: `${id}-help` }));
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
      const action = (text, id, callback, disabled = false) => {
        const control = button(text, callback, { "data-action": id });
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
      const selectTab = (id) => {
        for (const [name, panel] of Object.entries(panels)) {
          panel.hidden = name !== id;
          const tab = tabs.querySelector(`[data-icon-tab="${name}"]`);
          tab.setAttribute("aria-selected", String(name === id));
          tab.tabIndex = name === id ? 0 : -1;
        }
        positionPopover();
      };
      for (const [id, title] of [["built-in", "Built-in"], ["image", "Image"], ["symbol", "Symbol"]]) {
        const tab = button(title, () => selectTab(id), { role: "tab", "data-icon-tab": id, id: `cme-${ownerToken}-tab-${id}`, "aria-controls": `cme-${ownerToken}-panel-${id}` });
        tab.addEventListener("keydown", (event) => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
          event.preventDefault();
          const choices = [...tabs.children], index = choices.indexOf(tab), next = choices[event.key === "Home" ? 0 : event.key === "End" ? 2 : (index + (event.key === "ArrowLeft" ? -1 : 1) + 3) % 3];
          next.click();
          next.focus();
        });
        tabs.append(tab);
        panels[id] = node("div", null, { role: "tabpanel", "data-icon-panel": id, id: `cme-${ownerToken}-panel-${id}`, "aria-labelledby": tab.id });
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
      for (const [id, title] of [["add", "Add"], ["appearance", "Appearance"], ["find", "⌕"], ["options", "⋯"]]) {
        const control = button(title, () => {
          if (id === "find") {
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
          openTopPanel(id);
        }, { "data-cme-toolbar": id, "data-focus": `toolbar:${id}`, "aria-label": id === "find" ? "Find an item" : id === "options" ? "Menu options" : title, "aria-expanded": String(id === "find" && findOpen) });
        if (id !== "find") control.setAttribute("aria-haspopup", "dialog");
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
      const params = new URL(window2.location.href).searchParams;
      if (params.get("contextMenuEditorSettings") === "1" && !document2.documentElement.hasAttribute("data-cme-settings-opened")) {
        document2.documentElement.setAttribute("data-cme-settings-opened", "true");
        button?.click();
      }
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
  function browserMenuIds(window2, markup) {
    const inert = markup.split(XUL).join("urn:context-menu-editor:inert-xul");
    const parsed = new window2.DOMParser().parseFromString(inert, "application/xml"), ids = /* @__PURE__ */ new Set();
    function visit(document2) {
      for (const rootId of ["contentAreaContextMenu", "tabContextMenu", "placesContext", "zenFolderActions"]) {
        const root = document2.querySelector(`[id="${rootId}"]`);
        for (const item of root?.querySelectorAll("[id]") || []) ids.add(item.id);
      }
      for (const template of document2.querySelectorAll("template")) if (template.content) visit(template.content);
    }
    visit(parsed);
    return ids;
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
    const document2 = window2.document, restorers = [];
    let mods = /* @__PURE__ */ new Map(), creation = /* @__PURE__ */ new WeakMap(), disposed = false, pending = null, lastRefresh = 0, nativeIds = builtInIds, uncatalogued = false;
    function setMods(value) {
      const next = /* @__PURE__ */ new Map();
      for (const mod of Object.values(value || {})) if (mod && typeof mod.id === "string" && /^[\w.-]{1,256}$/.test(mod.id) && typeof mod.name === "string") {
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
      const stack = String(new window2.Error().stack || "");
      const uri = stack.match(/chrome:\/\/sine\/content\/[\w.-]+\/[^\s)]+/g)?.find((value) => !value.startsWith("chrome://sine/content/context-menu-editor/"));
      if (uri) creation.set(node, uri);
    }
    function wrap(name, accept) {
      const original = document2[name], descriptor = Object.getOwnPropertyDescriptor(document2, name);
      if (typeof original !== "function") return;
      const wrapped = function(...args) {
        const node = Reflect.apply(original, this, args);
        if (accept(args)) capture(node);
        return node;
      };
      try {
        Object.defineProperty(document2, name, { value: wrapped, writable: true, configurable: true });
      } catch {
        return;
      }
      restorers.push(() => {
        if (document2[name] !== wrapped) return;
        if (descriptor) Object.defineProperty(document2, name, descriptor);
        else delete document2[name];
      });
    }
    setMods(initialMods);
    wrap("createXULElement", (args) => MENU_TAGS.has(args[0]));
    wrap("createElementNS", (args) => args[0] === XUL && MENU_TAGS.has(args[1]));
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
            const location2 = functionLocation(handler), source = identify(location2?.filename || location2?.source, "handler");
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
      const direct = handlerSource(node) || identify(creation.get(node), "creation");
      if (direct) return direct;
      const artwork = identify(node.getAttribute("image"), "artwork");
      if (uncatalogued && Date.now() - lastRefresh > 2e3) void refresh();
      if (nativeIds.has(node.id)) return BROWSER;
      return artwork ? { ...artwork, kind: "artwork" } : UNKNOWN;
    }
    void refresh();
    return { resolve, setMods, refresh, setBrowserIds(ids) {
      if (!disposed) {
        nativeIds = new Set(ids);
        onChange();
      }
    }, destroy() {
      if (disposed) return;
      disposed = true;
      for (const restore of restorers.reverse()) restore();
      creation = /* @__PURE__ */ new WeakMap();
      mods.clear();
    } };
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
    const root = (id) => state.roots[id] ??= { children: [], records: {} };
    for (const [preference, menus] of Object.entries(HIDDEN)) if (read("uc.hidecontext." + preference, "boolean") === true) {
      for (const [id, ids] of Object.entries(menus)) {
        const menu = root(id);
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
    for (const [id, suffix] of [[PAGE, "ContentAreaContextMenu"], [TAB, "TabContextMenu"]]) {
      const hidden = read("cmi-Hide-Inactive-Items-" + suffix, "boolean");
      if (hidden !== void 0) root(id).hideUnavailable = hidden;
    }
    if (!found) return { imported: false, reason: "none" };
    const encoded = serializeState(state);
    if (prefs.getStringPref(SETTINGS_PREF, "") !== before) return { imported: false, reason: "changed" };
    prefs.setStringPref(SETTINGS_PREF, encoded);
    return { imported: true };
  }

  // project:src/entry.mjs
  var TOPIC = "context-menu-editor-inventory";
  var BASE = "chrome://sine/content/context-menu-editor/";
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
    }, offRegistry = () => {
    }, controller = null, bridge = null, sources = null, ownerSettings = null, ownerWrite = false;
    const store = createStore(services.prefs, { onError: (problem) => window2.console?.warn?.("Context Menu Editor could not refresh settings.", problem) });
    const browserWindow = () => window2.browsingContext?.topChromeWindow || (/^chrome:/.test(window2.location.href) ? window2 : services.wm?.getMostRecentWindow("navigator:browser"));
    const icons = createIconService(window2, { baseURL: BASE, fetch: (...args) => browserWindow().fetch(...args) });
    const stylesheet = window2.document.createElementNS("http://www.w3.org/1999/xhtml", "link");
    stylesheet.rel = "stylesheet";
    stylesheet.href = BASE + "style.css?v=0.1.4";
    stylesheet.setAttribute("data-cme-stylesheet", "true");
    window2.document.documentElement.append(stylesheet);
    const owner = {
      get disposed() {
        return disposed;
      },
      get controller() {
        return controller;
      },
      store,
      unload() {
        if (disposed) return;
        disposed = true;
        offStore();
        offRegistry();
        ownerSettings?.destroy();
        bridge?.destroy();
        controller?.destroy();
        sources?.destroy();
        store.destroy();
        stylesheet.remove();
        window2.removeEventListener("unload", owner.unload);
        if (window2.__contextMenuEditor === owner) delete window2.__contextMenuEditor;
        services.obs?.notifyObservers(null, TOPIC);
      }
    };
    window2.__contextMenuEditor = owner;
    window2.addEventListener("unload", owner.unload, { once: true });
    window2.addUnloadListener?.(owner.unload);
    try {
      const location2 = window2.location.href;
      if (/^about:(preferences|settings)(?:[?#]|$)/.test(location2)) {
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
      } else {
        let listenerService;
        try {
          listenerService = Cc["@mozilla.org/eventlistenerservice;1"].getService(Ci.nsIEventListenerService);
        } catch {
        }
        sources = createSourceTracker(window2, {
          loadMods: async () => ChromeUtils.importESModule("chrome://userscripts/content/core/utils.sys.mjs").default.getMods(),
          listenerInfo: (node) => listenerService?.getListenerInfoFor(node) || [],
          functionLocation: (fn) => Cu.getFunctionSourceLocation(fn),
          onChange: () => {
            if (!disposed) {
              controller?.refresh();
              void ownerSettings?.refresh();
            }
          }
        });
        if (typeof ChromeUtils !== "undefined" && typeof window2.fetch === "function") void (async () => {
          try {
            const response = await window2.fetch("chrome://browser/content/browser.xhtml");
            const markup = await response.text();
            if (markup.length > 2 * 1024 * 1024) return;
            const ids = browserMenuIds(window2, markup);
            if (!disposed && ids.size) sources.setBrowserIds(ids);
          } catch {
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
          onOwnerChange: (rootId, items, changes) => {
            const before = store.read();
            if (before.error) return;
            const next = applyOwnerChanges(before.state, rootId, items, changes);
            ownerWrite = true;
            try {
              store.save(next, before.raw);
            } finally {
              ownerWrite = false;
            }
          },
          onInventory: () => services.obs?.notifyObservers(null, TOPIC)
        });
        offStore = store.subscribe(() => {
          if (!ownerWrite) {
            controller.clearOwnerSettingsChanges();
            controller.refresh();
          }
        });
        ownerSettings = createOwnerSettingsObserver(window2, {
          prefs: services.prefs,
          loadMods: async () => ChromeUtils.importESModule("chrome://userscripts/content/core/utils.sys.mjs").default.getMods(),
          onChange: (id, fields) => {
            controller.noteOwnerSettingsChange(id, fields);
            window2.queueMicrotask(() => {
              if (!disposed) controller.refresh();
            });
          }
        });
        controller.refresh();
      }
    } catch (problem) {
      owner.unload();
      throw problem;
    }
    return owner;
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
