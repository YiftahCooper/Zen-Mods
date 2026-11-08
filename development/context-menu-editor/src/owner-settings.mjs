import {mergeInventory,updateItem,validatePlacement,validateState} from './model.mjs';

// Preferences in these namespaces belong to Zen, Firefox or the platform. They
// are never attributed to a mod, even when a mod's preferences.json lists one:
// Zen writing such a preference must not look like that mod changing its menu.
const BROWSER_NAMESPACES = [
 'zen.', 'browser.', 'layout.', 'extensions.', 'ui.', 'widget.', 'network.', 'privacy.', 'toolkit.',
 'devtools.', 'dom.', 'gfx.', 'general.', 'media.', 'places.', 'security.', 'services.', 'sidebar.',
 'font.', 'intl.', 'accessibility.', 'app.', 'datareporting.', 'identity.', 'signon.', 'print.',
 'permissions.', 'javascript.', 'image.', 'apz.', 'mousewheel.', 'full-screen-api.', 'findbar.',
 'editor.', 'content.', 'nglayout.', 'pdfjs.', 'webgl.', 'svg.', 'sine.', 'extension.context-menu-editor.',
];
export const isBrowserPreference = name => BROWSER_NAMESPACES.some(prefix => name.startsWith(prefix));

/** Hints limit which presentation fields a setting can yield. Only explicit
 * words count. A setting named only after state, settings, config, a menu or a
 * context yields nothing (0.1.6 mapped those to every field), so a dynamic label
 * changing later never revokes an edit. */
export function settingFields(property) {
 const words = property.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[._-]/g, ' ').toLowerCase();
 if (/\b(icon|icons|iconset|image|images|artwork)\b/.test(words)) return ['icon'];
 if (/\b(name|names|label|labels|title|titles|scope)\b/.test(words)) return ['name'];
 if (/\b(order|position|positions|arrangement|layout)\b/.test(words)) return ['placement'];
 if (/\b(hidden|hide|visible|visibility|show|enabled)\b/.test(words)) return ['visibility'];
 return [];
}

/** Minimal order changes leave unaffected editor nesting in place. A longest
 * increasing subsequence identifies rows whose original relative order stayed. */
export function changedOwnerPlacement(before, after) {
 const prior = new Map(before.map(item => [item.key, item]));
 const groups = new Map(), stationary = new Map(), crossedAnchors = new Set();
 for (const item of after) {
  const peers = groups.get(item.parentKey) || [];
  peers.push(item.key);
  groups.set(item.parentKey, peers);
 }
 for (const [parent, peers] of groups) {
  const old = before.find(item => item.parentKey === parent)?.peers ||
   before.filter(item => item.parentKey === parent).map(item => item.key);
  const positions = new Map(old.map((key, index) => [key, index]));
  // Other owners' and native rows are fixed anchors. An unconstrained LIS can
  // otherwise keep the moved owner row and incorrectly call the anchor moved.
  const common = new Set(peers.filter(key => positions.has(key)));
  const isAnchor = key => common.has(key) && !prior.has(key);
  for (const key of peers) {
   if (!prior.has(key) || !positions.has(key)) continue;
   const oldAnchors = old.slice(0, positions.get(key)).filter(isAnchor);
   const newAnchors = peers.slice(0, peers.indexOf(key)).filter(isAnchor);
   if (JSON.stringify(oldAnchors) !== JSON.stringify(newAnchors)) crossedAnchors.add(key);
  }
  const keys = peers.filter(key => positions.has(key) && prior.has(key) && !crossedAnchors.has(key));
  const tails = [], tailRows = [], parents = [];
  for (let index = 0; index < keys.length; index++) {
   const value = positions.get(keys[index]);
   let left = 0, right = tails.length;
   while (left < right) {
    const middle = (left + right) >> 1;
    if (tails[middle] < value) left = middle + 1; else right = middle;
   }
   parents[index] = left ? tailRows[left - 1] : -1;
   tails[left] = value;
   tailRows[left] = index;
  }
  const stable = new Set();
  for (let index = tailRows.at(-1); index !== undefined && index >= 0; index = parents[index]) stable.add(keys[index]);
  stationary.set(parent, stable);
 }
 return after.filter(item => prior.has(item.key) && (
  prior.get(item.key).parentKey !== item.parentKey ||
  crossedAnchors.has(item.key) ||
  !stationary.get(item.parentKey)?.has(item.key)
 )).map(({key, parentKey}) => ({key, parentKey}));
}

function eligibleMod(mod) {
 return mod?.id !== 'context-menu-editor' && typeof mod?.preferences === 'string' &&
  /^[\w.-]+$/.test(mod.id) && /^[\w./-]+\.json$/.test(mod.preferences) &&
  !mod.preferences.split('/').includes('..');
}

/** Observe only the exact preference names an installed Sine mod declares in
 * its own preferences.json. No pref values, selections, credentials or handler
 * code are collected or persisted. Each declared name gets its own observer. */
export function createOwnerSettingsObserver(window, {prefs, loadMods, onChange}) {
 let disposed = false, pending = null;
 let bindings = new Map(); // preference name -> [{id, fields}]
 const observed = new Set();
 const observer = {observe(_subject, _topic, property) {
  // A branch observer also fires for longer names with the same prefix.
  if (disposed || typeof property !== 'string') return;
  for (const owner of bindings.get(property) || []) {
   if (owner.fields.length) onChange(owner.id, owner.fields);
  }
 }};

 async function declaredPreferences(mod) {
  try {
   const response = await window.fetch(`chrome://sine/content/${mod.id}/${mod.preferences}`);
   const text = await response.text();
   if (text.length > 256 * 1024) return [];
   const entries = JSON.parse(text);
   if (!Array.isArray(entries)) return [];
   return entries.map(entry => entry?.property)
    .filter(property => typeof property === 'string' && property && property.length <= 256 && !isBrowserPreference(property));
  } catch {
   return []; // Missing settings metadata grants no ownership authority.
  }
 }

 async function load() {
  try {
   const mods = Object.values(await loadMods() || {}).filter(eligibleMod);
   const declared = await Promise.all(mods.map(async mod => [mod.id, await declaredPreferences(mod)]));
   if (disposed) return;
   const next = new Map();
   for (const [id, properties] of declared) {
    for (const property of properties) {
     const owners = next.get(property) || [];
     if (!owners.some(owner => owner.id === id)) owners.push({id, fields: settingFields(property)});
     next.set(property, owners);
    }
   }
   bindings = next;
   // Observe exactly the declared names that can yield a field.
   const wanted = new Set([...next].filter(([, owners]) => owners.some(owner => owner.fields.length)).map(([name]) => name));
   for (const name of [...observed]) {
    if (!wanted.has(name)) { prefs.removeObserver(name, observer); observed.delete(name); }
   }
   for (const name of wanted) {
    if (!observed.has(name)) { prefs.addObserver(name, observer); observed.add(name); }
   }
  } catch { /* Discovery remains available if settings metadata cannot be read. */ }
 }

 async function refresh() {
  if (disposed) return;
  if (pending) return pending;
  pending = load();
  try { await pending; } finally { pending = null; }
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
  },
 };
}

/** Persist only the fields actually changed by the owner after its setting was
 * edited. All other item edits, custom groups and other mods stay in place. */
export function applyOwnerChanges(state, rootId, descriptors, {patches = [], placement = []}) {
 let next = mergeInventory(state, rootId, descriptors);
 for (const {key, patch} of patches) {
  if (next.roots[rootId].records[key]) next = updateItem(next, rootId, key, patch);
 }
 if (placement.length) {
  next = validateState(next);
  const root = next.roots[rootId], moving = new Set(placement.map(item => item.key));
  root.children = root.children.filter(key => !moving.has(key));
  for (const record of Object.values(root.records)) {
   if (record.children) record.children = record.children.filter(key => !moving.has(key));
  }
  for (const {key, parentKey} of placement) {
   const target = parentKey === null ? root.children : root.records[parentKey]?.children;
   if (!target) throw Error('The owner submenu is unavailable.');
   const peers = descriptors.filter(item => item.parentKey === parentKey).map(item => item.key);
   const index = peers.indexOf(key);
   const before = peers.slice(index + 1).find(candidate => target.includes(candidate));
   const after = peers.slice(0, index).reverse().find(candidate => target.includes(candidate));
   target.splice(after ? target.indexOf(after) + 1 : before ? target.indexOf(before) : target.length, 0, key);
  }
 }
 return validatePlacement(next, rootId, descriptors);
}
