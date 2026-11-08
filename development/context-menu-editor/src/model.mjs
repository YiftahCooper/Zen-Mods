// Durable customization only. Live labels, eligibility and owner nodes stay in inventory.
// Saved settings up to READ_LIMITS always load, so a large existing state never
// disables customization. Writes aim for WRITE_LIMITS: when a save would exceed
// them, unedited remembered mod rows are dropped first, oldest first (B4).
const READ_LIMITS = Object.freeze({ bytes: 1024 * 1024, records: 40000 });
const WRITE_LIMITS = Object.freeze({ bytes: 512 * 1024, records: 10000 });
const MAX_DEPTH = 64;
const KINDS = new Set(['command', 'native-menu', 'submenu', 'separator']);
const CONTAINERS = new Set(['native-menu', 'submenu']);
const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const LIVE_FIELDS = new Set(['label', 'nativeId', 'iconURL', 'available', 'boundary', 'locked', 'restriction', 'dependencyGroup', 'parentKey', 'node', 'source', 'identity']);
const DEFAULT_OPTIONS = Object.freeze({ enabled: true, showIcons: true, iconPack: 'fluent',
  iconSize: 16, iconAlignment: 'center', iconGap: 8, rowSpacing: 2, rounded: true,
  hoverShade: true, separatorOpacity: 0.5, monochromeExtensions: false,
  hideUnavailable: false, shiftBypass: true, showSeparators: true, preferCleanLinks: false });

function fail(message) { throw new Error(message); }
function object(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
}
function validKey(key) {
  return typeof key === 'string' && key.length > 0 && key.length <= 512 &&
    !FORBIDDEN_KEYS.has(key) && !/[\u0000-\u001f\u007f]/u.test(key);
}
function keyCheck(key) { if (!validKey(key)) fail('Invalid menu item key.'); }
function bytes(value) { return new TextEncoder().encode(value).length; }
function jsonCopy(value, seen = new Set(), depth = 0) {
  if (depth > MAX_DEPTH + 12) fail('Settings hierarchy is too deep.');
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (!Array.isArray(value) && !object(value)) fail('Settings contain an invalid value.');
  if (seen.has(value)) fail('Settings contain a cycle.');
  seen.add(value);
  const result = Array.isArray(value) ? [] : {};
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key)) fail('Settings contain an invalid key.');
    result[key] = jsonCopy(child, seen, depth + 1);
  }
  seen.delete(value);
  return result;
}
function boundedText(value, max, message) {
  if (typeof value !== 'string' || value.length > max || !value.trim() || /[\u0000-\u001f\u007f]/u.test(value)) fail(message);
}
function validateIcon(icon) {
  if (!object(icon)) fail('Invalid icon choice.');
  if (icon.kind === 'asset') {
    if (!['fluent', 'zen'].includes(icon.pack) || typeof icon.id !== 'string' ||
      !/^[a-zA-Z0-9_-]{1,128}$/u.test(icon.id)) fail('Invalid built-in icon choice.');
  } else if (icon.kind === 'text') {
    boundedText(icon.text, 64, 'Use a short text icon.');
  } else if (icon.kind === 'image') {
    if (typeof icon.data !== 'string' || icon.data.length > 8192 ||
      !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/u.test(icon.data)) fail('Use a normalized PNG icon.');
    let raw;
    try { raw = atob(icon.data.slice(22)); } catch { fail('Invalid PNG icon.'); }
    const signature = [137, 80, 78, 71, 13, 10, 26, 10];
    if (raw.length < 33 || signature.some((n, i) => raw.charCodeAt(i) !== n) ||
      raw.slice(12, 16) !== 'IHDR') fail('Invalid PNG icon.');
    const read32 = offset => ((raw.charCodeAt(offset) * 0x1000000) +
      (raw.charCodeAt(offset + 1) << 16) + (raw.charCodeAt(offset + 2) << 8) + raw.charCodeAt(offset + 3));
    if (read32(16) !== 32 || read32(20) !== 32) fail('Use a normalized 32 pixel PNG icon.');
  } else fail('Invalid icon choice.');
}

export function createState() { return { version: 1, options: { ...DEFAULT_OPTIONS }, roots: {} }; }

export function validateState(value, limits = READ_LIMITS) {
  if (!object(value) || value.version !== 1) fail('Unsupported settings version.');
  const state = jsonCopy(value);
  if (!object(state.options) || !object(state.roots)) fail('Invalid menu settings.');
  // Defaults permit older version-1 data to omit an option without rewriting it on read.
  state.options = { ...DEFAULT_OPTIONS, ...state.options };
  for (const [key, defaultValue] of Object.entries(DEFAULT_OPTIONS)) {
    if (typeof defaultValue === 'boolean' && typeof state.options[key] !== 'boolean') fail('Invalid appearance option.');
  }
  for (const [key, min, max] of [['iconSize', 12, 24], ['iconGap', 0, 16], ['rowSpacing', 0, 8]]) {
    if (!Number.isInteger(state.options[key]) || state.options[key] < min || state.options[key] > max) fail('Icon size or spacing is outside its allowed range.');
  }
  if (!['left', 'center', 'right'].includes(state.options.iconAlignment)) fail('Invalid icon alignment.');
  if (!['fluent', 'zen'].includes(state.options.iconPack)) fail('Invalid icon pack option.');
  if (typeof state.options.separatorOpacity !== 'number' || state.options.separatorOpacity < 0 ||
    state.options.separatorOpacity > 1) fail('Separator opacity must be between zero and one.');
  let count = 0;
  for (const [rootId, root] of Object.entries(state.roots)) {
    keyCheck(rootId);
    if (!object(root) || !Array.isArray(root.children) || !object(root.records)) fail('Invalid menu hierarchy.');
    if ('hideUnavailable' in root && typeof root.hideUnavailable !== 'boolean') fail('Invalid unavailable-command menu option.');
    if ('legacyHiddenIds' in root && (!Array.isArray(root.legacyHiddenIds) || root.legacyHiddenIds.length > 512 ||
      new Set(root.legacyHiddenIds).size !== root.legacyHiddenIds.length ||
      root.legacyHiddenIds.some(id => !validKey(id) || !/^[a-zA-Z][a-zA-Z0-9_-]{0,127}$/u.test(id)))) fail('Invalid legacy menu identities.');
    for (const [key, record] of Object.entries(root.records)) {
      keyCheck(key);
      if (++count > limits.records) fail('Too many saved menu items.');
      if (!object(record) || !KINDS.has(record.kind)) fail('Invalid menu item.');
      for (const field of LIVE_FIELDS) if (Object.hasOwn(record, field)) fail('Live menu details cannot be saved.');
      for (const field of ['hidden', 'removed', 'showIcon']) if (typeof record[field] !== 'boolean') fail('Invalid menu item option.');
      if ('iconOwner' in record && typeof record.iconOwner !== 'boolean') fail('Invalid icon ownership.');
      if ('owned' in record && (record.kind !== 'separator' || typeof record.owned !== 'boolean')) fail('Invalid separator ownership.');
      if ('name' in record) boundedText(record.name, 256, 'Use a short menu name.');
      if ('icon' in record) validateIcon(record.icon);
      if (CONTAINERS.has(record.kind)) {
        if (!Array.isArray(record.children)) fail('A submenu needs a child list.');
        if (record.kind === 'submenu' && !record.name) fail('Give the submenu a name.');
      } else if ('children' in record) fail('Only submenus can contain menu items.');
    }
    const placed = new Set();
    const active = new Set();
    function visit(children, depth) {
      if (depth > MAX_DEPTH) fail('Menu hierarchy is too deep.');
      for (const key of children) {
        keyCheck(key);
        if (!Object.hasOwn(root.records, key)) fail('The hierarchy refers to a missing item.');
        if (active.has(key)) fail('Menu hierarchy contains a cycle.');
        if (placed.has(key)) fail('Each menu item must be placed only once.');
        placed.add(key);
        const record = root.records[key];
        if (CONTAINERS.has(record.kind)) { active.add(key); visit(record.children, depth + 1); active.delete(key); }
      }
    }
    visit(root.children, 0);
    if (placed.size !== Object.keys(root.records).length) fail('Every saved item needs a hierarchy placement.');
  }
  if (bytes(JSON.stringify(state)) > limits.bytes) fail('Saved settings are too large.');
  return state;
}

/** Whether a saved record holds anything the user (or an owner) chose. Its
 * position is judged separately; this covers the record's own fields. */
export function recordHasEdits(record) {
  if (!object(record)) return false;
  if (record.kind === 'submenu' || (record.kind === 'separator' && record.owned)) return true;
  if (record.hidden || record.removed || record.showIcon === false || record.iconOwner) return true;
  if ('name' in record || 'icon' in record) return true;
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

/** Bring a state within the write limits without deleting any user edit. Only
 * ID-less mod rows (`mod:` keys) with no edits are dropped, in saved order
 * (oldest first). Such a row reappears at its owner's position when it returns. */
export function fitWriteLimits(value) {
  const state = validateState(value);
  if (withinWriteLimits(state)) return state;
  const candidates = [];
  for (const [rootId, root] of Object.entries(state.roots)) {
    for (const [key, record] of Object.entries(root.records)) {
      if (key.startsWith('mod:') && !recordHasEdits(record)) candidates.push([rootId, key]);
    }
  }
  const total = bytes(JSON.stringify(state)), count = recordCount(state);
  // Drop enough rows by estimate, then measure; repeat until within the limits.
  let index = 0;
  while (!withinWriteLimits(state)) {
    if (index >= candidates.length) fail('Saved settings are too large. Remove some custom icons or submenus.');
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

/** Drop rows that a save would persist only because they are remembered but
 * currently absent: not in the saved state before, no edits, and not moved by
 * this change. Present rows (including hidden native ones) keep their record. */
export function pruneUnsavedAbsentRows(state, saved, before, inventory) {
  const next = validateState(state);
  // Moved: another parent, or its former neighbours are no longer on the same sides.
  const moved = (rootId, key) => {
    const old = before?.roots?.[rootId];
    if (!old || !Object.hasOwn(old.records, key)) return false;
    const was = location(old, key), now = location(next.roots[rootId], key);
    if (was.parentKey !== now.parentKey) return true;
    const index = now.list.indexOf(key), oldIndex = was.list.indexOf(key);
    const previous = was.list[oldIndex - 1], following = was.list[oldIndex + 1];
    if (previous !== undefined && now.list.includes(previous) && now.list.indexOf(previous) > index) return true;
    return following !== undefined && now.list.includes(following) && now.list.indexOf(following) < index;
  };
  for (const { id, items } of inventory || []) {
    const root = next.roots[id];
    if (!root) continue;
    for (const item of items || []) {
      if (!item?.remembered || item.available !== false) continue;
      if (Object.hasOwn(saved?.roots?.[id]?.records || {}, item.key)) continue;
      const record = root.records[item.key];
      if (!record || recordHasEdits(record)) continue;
      if (moved(id, item.key)) continue;
      detach(root, item.key);
    }
  }
  return validateState(next);
}

export function parseState(raw) {
  if (raw === null || raw === undefined || raw === '') return createState();
  if (typeof raw !== 'string') fail('Could not read saved settings.');
  if (bytes(raw) > READ_LIMITS.bytes) fail('Saved settings are too large.');
  let value;
  try { value = JSON.parse(raw); } catch { fail('Saved settings are not valid JSON.'); }
  return validateState(value);
}
export function serializeState(state) { return JSON.stringify(fitWriteLimits(state)); }
function editable(state, rootId) {
  const next = validateState(state); keyCheck(rootId);
  if (!Object.hasOwn(next.roots, rootId)) fail('This menu is not currently available.');
  return next;
}
function newRecord(kind) {
  return { kind, hidden: false, removed: false, showIcon: true, ...(CONTAINERS.has(kind) ? { children: [] } : {}) };
}
function descriptorsByKey(descriptors) {
  if (!Array.isArray(descriptors)) fail('Invalid menu inventory.');
  const counts = new Map();
  for (const item of descriptors) {
    if (item?.dependencyGroup !== undefined && !validKey(item.dependencyGroup)) fail('Invalid dependency group in menu inventory.');
    if (item && validKey(item.key)) counts.set(item.key, (counts.get(item.key) || 0) + 1);
  }
  const result = new Map();
  for (const item of descriptors) if (item && counts.get(item.key) === 1 &&
    ['command', 'native-menu', 'separator'].includes(item.kind) &&
    (item.parentKey === null || validKey(item.parentKey))) result.set(item.key, item);
  // A child without a uniquely identified native parent cannot get a durable location.
  let changed;
  do { changed = false;
    for (const [key, item] of result) if (item.parentKey !== null &&
      (!result.has(item.parentKey) || result.get(item.parentKey).kind !== 'native-menu')) { result.delete(key); changed = true; }
  } while (changed);
  return result;
}

export function mergeInventory(state, rootId, descriptors) {
  const next = validateState(state); keyCheck(rootId);
  const items = descriptorsByKey(descriptors);
  const root = next.roots[rootId] ??= { children: [], records: {} };
  const added = [];
  for (const [key, item] of items) {
    if (Object.hasOwn(root.records, key)) {
      if (root.records[key].kind !== item.kind || root.records[key].owned) fail('A menu item identity conflicts with saved settings.');
    } else {
      root.records[key] = newRecord(item.kind);
      if(root.legacyHiddenIds?.includes(key)){root.records[key].hidden=true;root.legacyHiddenIds=root.legacyHiddenIds.filter(id=>id!==key);if(!root.legacyHiddenIds.length)delete root.legacyHiddenIds;}
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
  if (!Object.hasOwn(root.records, key)) fail('This item is not in the selected menu.');
  if (root.children.includes(key)) return { parentKey: null, list: root.children };
  for (const [parentKey, record] of Object.entries(root.records)) {
    if (CONTAINERS.has(record.kind) && record.children.includes(key)) return { parentKey, list: record.children };
  }
  fail('This item has no saved position.');
}
function childList(root, parentKey) {
  if (parentKey === null) return root.children;
  if (!Object.hasOwn(root.records, parentKey) || !CONTAINERS.has(root.records[parentKey].kind)) fail('Choose a valid parent submenu.');
  if (root.records[parentKey].removed) fail('Restore the parent submenu first.');
  return root.records[parentKey].children;
}
function insertionIndex(index, list) {
  if (index === undefined) return list.length;
  if (!Number.isInteger(index) || index < 0 || index > list.length) fail('Choose a valid insertion position.');
  return index;
}
function nativeBoundary(root, key) {
  let parentKey = location(root, key).parentKey;
  while (parentKey !== null) {
    if (root.records[parentKey].kind === 'native-menu') return parentKey;
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

// The inventory carries native structure constraints; these never become saved fields.
// Call after add/remove edits as well as moves, before saving a merged settings draft.
export function validatePlacement(state, rootId, descriptors) {
  const next = validateState(state); keyCheck(rootId);
  const items = descriptorsByKey(descriptors); const root = next.roots[rootId];
  if (!root) return next;
  const groups = new Map();
  for (const [key, descriptor] of items) {
    if (Object.hasOwn(root.records, key) && nativeBoundary(root, key) !== (descriptor.boundary ?? null)) {
      fail('Keep this item within its native owner submenu.');
    }
    if (descriptor.dependencyGroup !== undefined) {
      const members = groups.get(descriptor.dependencyGroup) ?? [];
      members.push(descriptor); groups.set(descriptor.dependencyGroup, members);
    }
  }
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    const existing = members.filter(item => Object.hasOwn(root.records, item.key));
    if (existing.length === 0) continue;
    if (existing.length !== members.length) fail('Refresh this menu before arranging its owner-managed group.');
    const first = location(root, members[0].key);
    const start = first.list.indexOf(members[0].key);
    for (let i = 0; i < members.length; i++) {
      const item = members[i]; const current = location(root, item.key);
      if (current.parentKey !== first.parentKey || current.parentKey !== item.parentKey ||
        current.list[start + i] !== item.key) {
        fail('Keep this owner-managed group together in its original order.');
      }
    }
  }
  return next;
}

export function moveItem(state, rootId, key, parentKey, index, descriptors) {
  const next = editable(state, rootId); const root = next.roots[rootId];
  const old = location(root, key); const descendants = subtree(root, key);
  if (descendants.includes(parentKey)) fail('A submenu cannot be moved inside itself.');
  const target = childList(root, parentKey); const items = descriptorsByKey(descriptors);
  for (const child of descendants) {
    const record = root.records[child];
    if (record.kind === 'submenu' || (record.kind === 'separator' && record.owned)) continue;
    const descriptor = items.get(child);
    if (!descriptor) fail('This owner is not currently available. Open its menu before moving this item.');
    if (descriptor.locked) fail(descriptor.restriction || 'This item cannot be moved until its adapter is ready.');
  }
  old.list.splice(old.list.indexOf(key), 1);
  target.splice(insertionIndex(index, target), 0, key);
  for (const child of descendants) {
    const descriptor = items.get(child);
    if (!descriptor) continue;
    if (nativeBoundary(root, child) !== (descriptor.boundary ?? null)) fail('Keep this item within its native owner submenu.');
  }
  return validatePlacement(next, rootId, descriptors);
}

export function updateItem(state, rootId, key, patch) {
  const next = editable(state, rootId); const record = next.roots[rootId].records[key];
  if (!record) fail('This item is not in the selected menu.');
  if (!object(patch)) fail('Invalid item edit.');
  if ((Object.hasOwn(patch,'icon')||Object.hasOwn(patch,'showIcon'))&&!Object.hasOwn(patch,'iconOwner'))delete record.iconOwner;
  for (const [field, value] of Object.entries(patch)) {
    if (!['name', 'icon', 'hidden', 'removed', 'showIcon', 'iconOwner'].includes(field)) fail('This field cannot be edited.');
    if ((field === 'name' || field === 'icon') && value === null) delete record[field];
    else record[field] = jsonCopy(value);
  }
  return validateState(next);
}
function add(state, rootId, record, parentKey, index, key) {
  const next = validateState(state); keyCheck(rootId); keyCheck(key);
  const root = next.roots[rootId] ??= { children: [], records: {} };
  if (Object.hasOwn(root.records, key)) fail('This menu item key is already used.');
  const list = childList(root, parentKey);
  list.splice(insertionIndex(index, list), 0, key); root.records[key] = record;
  return validateState(next);
}
export function addSubmenu(state, rootId, name, parentKey = null, index, key = `cme-menu-${crypto.randomUUID()}`) {
  return add(state, rootId, { ...newRecord('submenu'), name }, parentKey, index, key);
}
export function addSeparator(state, rootId, parentKey = null, index, key = `cme-separator-${crypto.randomUUID()}`) {
  return add(state, rootId, { ...newRecord('separator'), owned: true }, parentKey, index, key);
}
export function removeItem(state, rootId, key) {
  const next = editable(state, rootId); const root = next.roots[rootId];
  const { list } = location(root, key); const record = root.records[key];
  if (record.kind === 'submenu' || (record.kind === 'separator' && record.owned)) {
    list.splice(list.indexOf(key), 1, ...(record.children ?? [])); delete root.records[key];
  } else record.removed = true;
  return validateState(next);
}
export function restoreItem(state, rootId, key) { return updateItem(state, rootId, key, { removed: false }); }
export function resetRoot(state, rootId) {
  const next = validateState(state); keyCheck(rootId); delete next.roots[rootId]; return validateState(next);
}
export function flattenRoot(state, rootId) {
  const next = validateState(state); const root = next.roots[rootId]; const rows = [];
  if (!root) return rows;
  function visit(children, parentKey, depth) {
    for (const key of children) {
      const record = root.records[key]; rows.push({ key, record, parentKey, depth });
      if (CONTAINERS.has(record.kind)) visit(record.children, key, depth + 1);
    }
  }
  visit(root.children, null, 0); return rows;
}

export function restoreOriginalOrder(state, rootId, descriptors) {
  const next = mergeInventory(state, rootId, descriptors); const root = next.roots[rootId];
  const items = descriptorsByKey(descriptors);
  const original = flattenRoot(next, rootId);
  root.children = [];
  for (const record of Object.values(root.records)) if (CONTAINERS.has(record.kind)) record.children = [];
  // Native inventory order first; extras retain their own nesting and relative order.
  for (const [key, item] of items) {
    (item.parentKey === null ? root.children : root.records[item.parentKey].children).push(key);
  }
  for (const row of original) if (!items.has(row.key)) {
    const parent = row.parentKey;
    (parent === null ? root.children : root.records[parent].children).push(row.key);
  }
  return validateState(next);
}
