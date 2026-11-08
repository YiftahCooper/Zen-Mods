import test from 'node:test';
import assert from 'node:assert/strict';
import * as model from '../src/model.mjs';

import { createState, validateState, parseState, serializeState, mergeInventory, moveItem,
  updateItem, addSubmenu, addSeparator, removeItem, restoreItem, resetRoot, flattenRoot,
  restoreOriginalOrder } from '../src/model.mjs';

const item = (key, kind = 'command', parentKey = null, extra = {}) => ({
  key, kind, label: `Live ${key}`, parentKey, nativeId: key, iconURL: '',
  available: true, boundary: parentKey, locked: false, restriction: '', ...extra,
});
const inventory = [item('copy'), item('paste'), item('tools', 'native-menu'),
  item('translate', 'command', 'tools'), item('native-line', 'separator')];
const fixture = () => mergeInventory(createState(), 'content', inventory);
const freeze = value => { Object.freeze(value); for (const child of Object.values(value)) {
  if (child && typeof child === 'object') freeze(child);
} return value; };

test('fresh state round-trips without roots and validates all appearance defaults', () => {
  const state = createState();
  assert.equal(state.version, 1);
  assert.deepEqual(state.roots, {});
  assert.deepEqual(parseState(serializeState(state)), state);
  assert.equal(state.options.iconSize, 16);
  assert.equal(state.options.iconGap, 8);
  assert.equal(state.options.iconAlignment, 'center');
  assert.equal(state.options.rowSpacing, 2);
});

test('discovery appends within original popup without saving dynamic labels or availability', () => {
  const state = freeze(fixture());
  assert.deepEqual(state.roots.content.children, ['copy', 'paste', 'tools', 'native-line']);
  assert.deepEqual(state.roots.content.records.tools.children, ['translate']);
  assert.equal('label' in state.roots.content.records.copy, false);
  assert.equal('available' in state.roots.content.records.copy, false);
  const next = mergeInventory(state, 'content', [item('new', 'command', 'tools'), ...inventory]);
  assert.deepEqual(next.roots.content.records.tools.children, ['translate', 'new']);
  assert.deepEqual(state.roots.content.records.tools.children, ['translate']);
});

test('duplicate inventory identities are excluded rather than receiving an override', () => {
  const state = mergeInventory(createState(), 'content', [item('duplicate'), item('duplicate'), item('safe')]);
  assert.deepEqual(state.roots.content.children, ['safe']);
});

test('moving commands into nested custom submenus retains one immutable placement', () => {
  const original = freeze(fixture());
  let state = addSubmenu(original, 'content', 'More', null, 1, 'user:submenu:more');
  state = addSubmenu(state, 'content', 'Nested', 'user:submenu:more', 0, 'user:submenu:nested');
  state = moveItem(state, 'content', 'copy', 'user:submenu:nested', 0, inventory);
  assert.deepEqual(state.roots.content.children, ['user:submenu:more', 'paste', 'tools', 'native-line']);
  assert.deepEqual(state.roots.content.records['user:submenu:nested'].children, ['copy']);
  assert.deepEqual(original.roots.content.children, ['copy', 'paste', 'tools', 'native-line']);
  assert.deepEqual(flattenRoot(state, 'content').map(row => [row.key, row.parentKey, row.depth]), [
    ['user:submenu:more', null, 0], ['user:submenu:nested', 'user:submenu:more', 1],
    ['copy', 'user:submenu:nested', 2], ['paste', null, 0], ['tools', null, 0],
    ['translate', 'tools', 1], ['native-line', null, 0],
  ]);
});

test('same-parent move index addresses the final list rather than leaving an off-by-one', () => {
  assert.deepEqual(moveItem(fixture(), 'content', 'copy', null, 3, inventory).roots.content.children,
    ['paste', 'tools', 'native-line', 'copy']);
});

test('disable and re-enable preserve the exact saved slot and descendant choices', () => {
  let state = addSubmenu(fixture(), 'content', 'More', null, 1, 'user:submenu:more');
  state = moveItem(state, 'content', 'paste', 'user:submenu:more', 0, inventory);
  const before = serializeState(state);
  const disabled = updateItem(state, 'content', 'user:submenu:more', { hidden: true });
  assert.deepEqual(disabled.roots.content.children, state.roots.content.children);
  assert.equal(disabled.roots.content.records.paste.hidden, false);
  assert.equal(serializeState(updateItem(disabled, 'content', 'user:submenu:more', { hidden: false })), before);
});

test('removed commands stay tombstoned across owner absence, reappearance and restore', () => {
  const removed = removeItem(updateItem(fixture(), 'content', 'copy', { name: 'Copy clean', hidden: true }), 'content', 'copy');
  const missing = mergeInventory(removed, 'content', [item('paste')]);
  const returned = mergeInventory(missing, 'content', inventory);
  assert.equal(returned.roots.content.records.copy.removed, true);
  assert.equal(returned.roots.content.records.copy.name, 'Copy clean');
  assert.deepEqual(returned.roots.content.children, ['copy', 'paste', 'tools', 'native-line']);
  const restored = restoreItem(returned, 'content', 'copy');
  assert.equal(restored.roots.content.records.copy.removed, false);
  assert.equal(restored.roots.content.records.copy.hidden, true);
});

test('removing a custom submenu ungroups children in place without losing overrides', () => {
  let state = addSubmenu(fixture(), 'content', 'More', null, 1, 'user:submenu:more');
  state = moveItem(state, 'content', 'copy', 'user:submenu:more', 0, inventory);
  state = moveItem(state, 'content', 'paste', 'user:submenu:more', 1, inventory);
  state = updateItem(state, 'content', 'paste', { hidden: true, name: 'Paste plain' });
  const next = removeItem(freeze(state), 'content', 'user:submenu:more');
  assert.deepEqual(next.roots.content.children, ['copy', 'paste', 'tools', 'native-line']);
  assert.equal(next.roots.content.records.paste.name, 'Paste plain');
  assert.equal(next.roots.content.records.paste.hidden, true);
  assert.equal('user:submenu:more' in next.roots.content.records, false);
});

test('custom separator removal deletes it while native separators retain removal records', () => {
  const custom = addSeparator(fixture(), 'content', null, 1, 'user:separator:line');
  const next = removeItem(custom, 'content', 'user:separator:line');
  assert.equal('user:separator:line' in next.roots.content.records, false);
  assert.equal(removeItem(next, 'content', 'native-line').roots.content.records['native-line'].removed, true);
});

test('native submenu boundaries and locked commands reject unsafe moves without changing input', () => {
  const state = freeze(fixture());
  const before = serializeState(state);
  assert.throws(() => moveItem(state, 'content', 'translate', null, 0, inventory), /native|owner|submenu|boundary/i);
  assert.throws(() => moveItem(state, 'content', 'copy', 'tools', 0, inventory), /native|owner|submenu|boundary/i);
  assert.throws(() => moveItem(state, 'content', 'copy', null, 1,
    inventory.map(d => d.key === 'copy' ? { ...d, locked: true, restriction: 'This group needs an adapter.' } : d)), /adapter/);
  assert.equal(serializeState(state), before);
});

test('a boundary child can enter a custom submenu inside its native owner', () => {
  const state = addSubmenu(fixture(), 'content', 'Languages', 'tools', 1, 'user:submenu:languages');
  const next = moveItem(state, 'content', 'translate', 'user:submenu:languages', 0, inventory);
  assert.deepEqual(next.roots.content.records.tools.children, ['user:submenu:languages']);
  assert.deepEqual(next.roots.content.records['user:submenu:languages'].children, ['translate']);
});

test('moving a custom container cannot smuggle its native child out of the owner boundary', () => {
  let state = addSubmenu(fixture(), 'content', 'Languages', 'tools', 1, 'languages');
  state = moveItem(state, 'content', 'translate', 'languages', 0, inventory);
  const before = serializeState(state);
  assert.throws(() => moveItem(freeze(state), 'content', 'languages', null, 0, inventory), /native|owner|submenu/i);
  assert.equal(serializeState(state), before);
});

test('native menus move as whole subtrees without extracting their delegated children', () => {
  const state = addSubmenu(fixture(), 'content', 'More', null, 0, 'more');
  const next = moveItem(freeze(state), 'content', 'tools', 'more', 0, inventory);
  assert.deepEqual(next.roots.content.records.more.children, ['tools']);
  assert.deepEqual(next.roots.content.records.tools.children, ['translate']);
});

test('cycles, missing parents, invalid indexes and cross-root references are refused', () => {
  let state = addSubmenu(fixture(), 'content', 'More', null, 0, 'user:submenu:more');
  state = addSubmenu(state, 'content', 'Nested', 'user:submenu:more', 0, 'user:submenu:nested');
  state = mergeInventory(state, 'tabs', [item('close')]);
  assert.throws(() => moveItem(state, 'content', 'user:submenu:more', 'user:submenu:nested', 0, inventory), /cycle|itself|inside/i);
  assert.throws(() => moveItem(state, 'content', 'copy', 'close', 0, inventory), /parent|submenu|menu/i);
  assert.throws(() => moveItem(state, 'content', 'copy', null, -1, inventory), /position|index/i);
  assert.throws(() => moveItem(state, 'content', 'close', null, 0, inventory), /item|root|menu/i);
});

test('absent owners keep overrides and unsafe absent-item moves are refused', () => {
  const state = updateItem(fixture(), 'content', 'translate', { name: 'My translation', showIcon: false });
  const next = mergeInventory(state, 'content', [item('copy')]);
  assert.equal(next.roots.content.records.translate.name, 'My translation');
  assert.equal(next.roots.content.records.translate.showIcon, false);
  assert.throws(() => moveItem(next, 'content', 'translate', null, 0, [item('copy')]), /available|owner|discover/i);
});

test('name and icon reset remove overrides without storing live defaults', () => {
  const edited = updateItem(fixture(), 'content', 'copy', { name: 'Mine', icon: { kind: 'text', text: '✂️' } });
  const reset = updateItem(edited, 'content', 'copy', { name: null, icon: null });
  assert.equal('name' in reset.roots.content.records.copy, false);
  assert.equal('icon' in reset.roots.content.records.copy, false);
  assert.throws(() => updateItem(reset, 'content', 'copy', { children: [] }), /edit|field|property/i);
});

test('malformed hierarchy and prototype keys cannot enter persistent state', () => {
  const duplicate = fixture(); duplicate.roots.content.children.push('copy');
  assert.throws(() => validateState(duplicate), /once|duplicate|placement/i);
  const orphan = fixture(); orphan.roots.content.children = orphan.roots.content.children.filter(k => k !== 'paste');
  assert.throws(() => validateState(orphan), /placement|placed|hierarchy/i);
  const missing = fixture(); missing.roots.content.children.push('unknown');
  assert.throws(() => validateState(missing), /missing|unknown|item/i);
  const cyclic = fixture(); cyclic.roots.content.children = ['copy', 'paste', 'native-line'];
  cyclic.roots.content.records.tools.children.push('tools');
  assert.throws(() => validateState(cyclic), /cycle|placement|placed|hierarchy/i);
  assert.throws(() => parseState('{"version":1,"options":{},"roots":{"__proto__":{}}}'), /key|invalid|menu/i);
  assert.throws(() => parseState('{'), /read|valid|JSON|settings/i);
  assert.throws(() => parseState('{"version":2,"options":{},"roots":{}}'), /version/);
});

test('style option ranges reject unbounded values while safe future fields round-trip', () => {
  for (const [key, value] of [['iconSize', 25], ['iconGap', -1], ['rowSpacing', 9],
    ['iconAlignment', 'outside'], ['separatorOpacity', 2], ['enabled', 'true']]) {
    const state = createState(); state.options[key] = value;
    assert.throws(() => validateState(state), /option|size|spacing|alignment|opacity|invalid/i);
  }
  const state = fixture(); state.options.futureOption = { selected: 'safe' };
  assert.deepEqual(parseState(serializeState(state)).options.futureOption, { selected: 'safe' });
  state.options.futureOption = 'x'.repeat(1024 * 1024);
  assert.throws(() => validateState(state), /large|size|limit/i);
  // Between the write and read limits a state loads, but a save with nothing
  // safely droppable is refused rather than deleting an edit.
  state.options.futureOption = 'x'.repeat(512 * 1024);
  assert.equal(validateState(state).options.futureOption.length, 512 * 1024);
  assert.throws(() => serializeState(state), /large|size|limit/i);
});

test('only self-contained bounded icon choices are accepted', () => {
  for (const icon of [{ kind: 'image', data: 'https://example.com/icon.png' },
    { kind: 'image', data: 'data:image/svg+xml;base64,PHN2Zz4=' },
    { kind: 'asset', pack: '../other', id: '../escape' },
    { kind: 'text', text: 'x'.repeat(65) }, { kind: 'script', text: 'alert(1)' }]) {
    assert.throws(() => updateItem(fixture(), 'content', 'copy', { icon }), /icon|image|artwork/i);
  }
  assert.equal(updateItem(fixture(), 'content', 'copy', { icon: { kind: 'asset', pack: 'fluent', id: 'copy' } }).roots.content.records.copy.icon.id, 'copy');
  assert.throws(() => parseState(' '.repeat(1024 * 1024 + 1)), /large|size|limit/i);
});

test('restore original order retains overrides, tombstones and custom nested containers', () => {
  let state = addSubmenu(fixture(), 'content', 'More', null, 0, 'custom');
  state = addSeparator(state, 'content', 'custom', 0, 'custom-line');
  state = moveItem(state, 'content', 'copy', 'custom', 0, inventory);
  state = updateItem(state, 'content', 'copy', { name: 'Copy clean', hidden: true });
  state = removeItem(state, 'content', 'paste');
  state = mergeInventory(state, 'content', [item('absent')]);
  const restored = restoreOriginalOrder(freeze(state), 'content', inventory);
  assert.deepEqual(restored.roots.content.children, ['copy', 'paste', 'tools', 'native-line', 'custom', 'absent']);
  assert.deepEqual(restored.roots.content.records.custom.children, ['custom-line']);
  assert.equal(restored.roots.content.records.copy.name, 'Copy clean');
  assert.equal(restored.roots.content.records.copy.hidden, true);
  assert.equal(restored.roots.content.records.paste.removed, true);
});

test('resetting one root leaves another root and global options intact', () => {
  let state = mergeInventory(fixture(), 'tabs', [item('close')]);
  state = updateItem(state, 'content', 'copy', { hidden: true });
  const reset = resetRoot(freeze(state), 'content');
  assert.equal('content' in reset.roots, false);
  assert.deepEqual(reset.roots.tabs.children, ['close']);
  assert.deepEqual(reset.options, state.options);
});

const pairedInventory = [item('ordinary'), item('context_askChat', 'command', null,
  { dependencyGroup: 'context_askChat', locked: true }),
item('context_aiSeparator', 'separator', null, { dependencyGroup: 'context_askChat', locked: true }),
item('other-line', 'separator')];
const pairedFixture = () => mergeInventory(createState(), 'content', pairedInventory);

test('ordinary commands and separators cannot be moved between an owner-dependent pair', () => {
  const state = freeze(pairedFixture());
  const before = serializeState(state);
  assert.throws(() => moveItem(state, 'content', 'ordinary', null, 1, pairedInventory), /together|adjacent|group/i);
  assert.throws(() => moveItem(state, 'content', 'other-line', null, 2, pairedInventory), /together|adjacent|group/i);
  assert.equal(serializeState(state), before);
  assert.deepEqual(moveItem(state, 'content', 'ordinary', null, 2, pairedInventory).roots.content.children,
    ['context_askChat', 'context_aiSeparator', 'ordinary', 'other-line']);
});

test('placement validation rejects added containers or separators splitting the native pair', () => {
  const state = pairedFixture();
  const submenu = addSubmenu(state, 'content', 'More', null, 2, 'more');
  const separator = addSeparator(state, 'content', null, 2, 'custom-line');
  assert.throws(() => model.validatePlacement(submenu, 'content', pairedInventory), /together|adjacent|group/i);
  assert.throws(() => model.validatePlacement(separator, 'content', pairedInventory), /together|adjacent|group/i);
  assert.deepEqual(model.validatePlacement(addSeparator(state, 'content', null, 3, 'custom-line'), 'content', pairedInventory)
    .roots.content.children, ['ordinary', 'context_askChat', 'context_aiSeparator', 'custom-line', 'other-line']);
});

test('hidden or removed dependency members retain the protected adjacency slots', () => {
  let state = updateItem(pairedFixture(), 'content', 'context_askChat', { hidden: true });
  state = removeItem(state, 'content', 'context_aiSeparator');
  assert.deepEqual(model.validatePlacement(freeze(state), 'content', pairedInventory).roots.content.children,
    ['ordinary', 'context_askChat', 'context_aiSeparator', 'other-line']);
  assert.throws(() => moveItem(state, 'content', 'ordinary', null, 1, pairedInventory), /together|adjacent|group/i);
  assert.equal('dependencyGroup' in state.roots.content.records.context_askChat, false);
});

test('placement validation refuses reversed or separately parented dependency members', () => {
  const reversed = pairedFixture();
  reversed.roots.content.children = ['ordinary', 'context_aiSeparator', 'context_askChat', 'other-line'];
  assert.throws(() => model.validatePlacement(reversed, 'content', pairedInventory), /together|order|adjacent|group/i);
  const separated = addSubmenu(pairedFixture(), 'content', 'More', null, 4, 'more');
  separated.roots.content.children.splice(2, 1);
  separated.roots.content.records.more.children.push('context_aiSeparator');
  assert.throws(() => model.validatePlacement(separated, 'content', pairedInventory), /together|parent|group/i);
  assert.throws(() => model.validatePlacement(pairedFixture(), 'content',
    pairedInventory.map(d => d.key === 'ordinary' ? { ...d, dependencyGroup: 1 } : d)), /dependency|group|invalid/i);
});
