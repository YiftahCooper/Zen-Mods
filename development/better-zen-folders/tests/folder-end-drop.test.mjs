import test from 'node:test';
import assert from 'node:assert/strict';
import * as api from '../scripts/better-zen-folders.uc.mjs';
import { DropNode, makeFolderEndDropFixture } from './folder-end-drop.fixture.mjs';
import { installNativeDropReplay } from './folder-end-drop.native.fixture.mjs';

function start(f) {
  f.emit('dragstart');
  f.reveal();
  assert.equal(f.rows().length, 3, 'zero-delay entry exposes three distinct footer destinations');
  return f.rows();
}

test('collapsed Parent with projected Child receives three labeled drag-only rows before the separator', () => {
  const f = makeFolderEndDropFixture(api);
  assert.equal(f.rows().length, 0);
  const rows = start(f);
  assert.deepEqual(rows.map(row => row.textContent), ['End of Child', 'After Child in Parent', 'After Parent in Pinned Tabs']);
  assert.equal(rows[0].parentElement.parentElement, f.pins);
  assert.ok(rows.every(row => row.namespaceURI === 'http://www.w3.org/1999/xhtml'));
  assert.equal(f.pins.children.at(-1), f.separator);
  assert.deepEqual(f.child.allItems, [f.last]);
  assert.equal(f.parent.collapsed, true);
  assert.ok(rows[0].getBoundingClientRect().bottom < rows[1].getBoundingClientRect().top);
  assert.ok(rows[1].getBoundingClientRect().bottom < rows[2].getBoundingClientRect().top);
  f.manager.destroy(); assert.equal(f.rows().length, 0);
});

for (const [index, key, group] of [[0, 'last', 'child'], [1, 'child', 'parent'], [2, 'parent', null]]) {
  test(`dispatched footer drop ${index} executes captured native acceptance, drop, pin routing and movement bodies`, () => {
    const f = makeFolderEndDropFixture(api); const replay = installNativeDropReplay(f);
    const rows = start(f); f.emit('dragover', rows[index]);
    const event = f.emit('drop', rows[index]); f.flush();
    assert.equal(replay.log.filter(entry => entry === 'native-drop').length, 1);
    assert.equal(replay.log.filter(entry => entry === 'pin').length, 1);
    assert.ok(replay.log.includes('notify'));
    assert.equal(f.nativeCalls.find(call => call.type === 'drop').anchor, f[key]);
    assert.equal(f.source.pinned, true); assert.equal(f.source.group, group ? f[group] : null);
    assert.equal(f.source.parentElement.children.indexOf(f.source), f[key].parentElement.children.indexOf(f[key]) + 1);
    assert.equal(f.source._dragData, undefined, 'native consumed its own drag data');
    assert.equal(event.stopped, 1); assert.equal(event.prevented, 0);
    assert.equal(f.rows().length, 0); f.manager.destroy();
  });
}

for (const [index, anchor, group] of [[0, 'last', 'child'], [1, 'child', 'parent'], [2, 'parent', null]]) {
  test(`footer destination ${index} reaches native once with the correct raw anchor`, () => {
    const f = makeFolderEndDropFixture(api); const rows = start(f);
    const data = f.source._dragData;
    const over = f.emit('dragover', rows[index]);
    assert.equal(over.prevented, 1); assert.equal(over.stopped, 1, 'only native suppresses propagation');
    assert.equal(data.dropElement, f.last, 'preview does not leave a custom native destination');
    f.emit('drop', rows[index]);
    const drops = f.nativeCalls.filter(call => call.type === 'drop');
    assert.equal(drops.length, 1); assert.equal(drops[0].anchor, f[anchor]); assert.equal(drops[0].before, false);
    assert.equal(drops[0].targetConnected, true); assert.equal(drops[0].pinnedAncestry, true);
    assert.equal(drops[0].preventedBeforeNative, false);
    assert.equal(f.source.group, group ? f[group] : null);
    assert.equal(f.source.pinned, true);
    f.emit('dragend'); f.flush(); assert.equal(f.rows().length, 0);
  });
}

for (const pinned of [false, true]) for (const change of ['chain', 'invalid-layout']) {
  test(`P1 native drop keeps pinned ancestry when capture detects ${change} (source pinned=${pinned})`, () => {
    const f = makeFolderEndDropFixture(api); const replay = installNativeDropReplay(f);
    if (pinned) { f.source.setAttribute('pinned', 'true'); f.pins.insertBefore(f.source, f.separator); }
    const rows = start(f);
    // Change layout after the last dragover, without delivering the observer yet.
    f.emit('dragover', rows[2]);
    if (change === 'chain') f.projection.set(f.child, { visible: false });
    else f.child.isLiveFolder = true;
    const original = f.source._dragData.dropElement;
    const event = f.emit('drop', rows[2]);
    assert.equal(replay.log.filter(entry => entry === 'native-drop').length, 1,
      'the frozen event path still reaches native after capture');
    assert.equal(f.source.pinned, true, 'capture invalidation must never turn a pinned-section drop into unpin/no-pin');
    assert.equal(replay.log.includes('unpin'), false);
    const drop = f.nativeCalls.find(call => call.type === 'drop');
    assert.equal(drop.targetConnected, true); assert.equal(drop.pinnedAncestry, true);
    assert.equal(drop.anchor, original, 'invalid custom layout delegates without overwriting native destination');
    assert.equal(event.stopped, 1); assert.equal(event.prevented, 0);
    f.flush(); assert.equal(f.rows().length, 0); f.manager.destroy();
  });
}

for (const change of ['expand', 'recollapse']) {
  test(`P2 native drop remains available after hover ${change} changes the trailing folder chain`, () => {
    const f = makeFolderEndDropFixture(api); const replay = installNativeDropReplay(f);
    const initiallyVisible = change === 'recollapse';
    f.projection.set(f.child, { visible: initiallyVisible });
    f.emit('dragstart'); f.reveal(); assert.equal(f.rows().length, initiallyVisible ? 3 : 2);
    f.emit('dragover', f.parent.labelContainerElement);
    f.parent.collapsed = initiallyVisible;
    f.projection.set(f.child, { visible: !initiallyVisible }); f.mutate(); f.flush();
    f.reveal();
    const rows = f.rows();
    assert.equal(rows.length, initiallyVisible ? 2 : 3, 'the same active source can re-arm after a safe subsequent move');
    f.emit('drop', rows.at(-1)); f.flush();
    assert.equal(replay.log.filter(entry => entry === 'native-drop').length, 1);
    assert.equal(f.source.pinned, true); assert.equal(f.source.parentElement, f.pins);
    assert.equal(f.nativeCalls.find(call => call.type === 'drop').anchor, f.parent);
    assert.equal(f.rows().length, 0); f.manager.destroy();
  });
}

test('P2 occupied footer keeps its labels inert through expansion, then re-arms after pointer departure', () => {
  const f = makeFolderEndDropFixture(api); const replay = installNativeDropReplay(f);
  f.projection.set(f.child, { visible: false }); f.emit('dragstart'); f.reveal();
  const old = f.rows(); const labels = old.map(row => row.textContent);
  f.emit('dragover', old[0]);
  f.projection.set(f.child, { visible: true }); f.parent.collapsed = false;
  f.mutate(); f.flush();
  assert.equal(old[0].isConnected, true, 'an occupied row is not detached or replaced underneath its event target');
  assert.deepEqual(f.rows().map(row => row.textContent), labels, 'no silent change from End of Parent to End of Child');
  f.emit('dragover', old[0]);
  assert.equal(old[0].hasAttribute('data-bzf-drop-active'), false);
  const hover = f.manager.composeHoverAdapters({ getTargetFolder: () => null, getRelatedTargetFolder: () => null });
  assert.equal(hover.getTargetFolder({ target: old[0] }), null, 'retired destinations cannot drive semantic hover');
  f.emit('dragover', f.parent.labelContainerElement);
  f.reveal();
  const rows = f.rows(); assert.equal(rows.length, 3); assert.equal(old[0].isConnected, false);
  f.emit('drop', rows[0]); f.flush();
  assert.equal(replay.log.filter(entry => entry === 'native-drop').length, 1);
  assert.equal(f.source.group, f.child); assert.equal(f.source.pinned, true);
  f.manager.destroy();
});

for (const [index, group] of [[0, 'child'], [1, 'parent'], [2, null]]) {
  test(`P2 composed hover guard expands Parent and native destination ${index} survives in the same drag`, () => {
    const f = makeFolderEndDropFixture(api); const replay = installNativeDropReplay(f);
    f.child.collapsed = true; f.projection.set(f.child, { visible: false });
    f.child.setAttribute('data-bzf-visibility', 'hidden');
    const guard = new api.CollapsedFolderDragGuard(f.manager.composeHoverAdapters(
      api.createBrowserCollapsedFolderDragGuardAdapters(f.host),
    ));
    guard.start();
    try {
      f.emit('dragstart'); f.reveal(); assert.equal(f.rows().length, 2);
      f.emit('dragover', f.parent.labelContainerElement); f.flush();
      assert.equal(f.parent.collapsed, false, 'the actual composed guard performs hover expansion');
      // The synthetic visibility boundary explicitly projects the result that
      // production beginDragExpansion refreshes through Sticky visibility.
      f.projection.set(f.child, { visible: true }); f.child.removeAttribute('data-bzf-visibility');
      f.mutate(); f.flush(); f.reveal();
      const rows = f.rows(); assert.equal(rows.length, 3); assert.equal(guard.activeDrag, true);
      f.emit('drop', rows[index]); f.flush();
      assert.equal(replay.log.filter(entry => entry === 'native-drop').length, 1);
      assert.equal(f.source.pinned, true); assert.equal(f.source.group, group ? f[group] : null);
      assert.equal(f.rows().length, 0); assert.equal(f.pending(), 0);
    } finally { guard.destroy(); f.manager.destroy(); }
  });
}

test('release coordinates choose the destination without a preceding dragover', () => {
  const f = makeFolderEndDropFixture(api); const rows = start(f);
  f.emit('drop', rows[2]); f.flush();
  assert.equal(f.source.parentElement, f.pins);
  assert.equal(f.rows().length, 0);
});

test('copy toggle hides the footer and returns to native, then move restores it', () => {
  const f = makeFolderEndDropFixture(api); start(f);
  f.emit('dragover', f.last, { dataTransfer: { types: ['application/x-moz-tabbrowser-tab'], dropEffect: 'copy' } });
  f.mutate(); f.flush();
  assert.equal(f.rows().length, 0);
  f.emit('dragover', f.last); assert.equal(f.rows().length, 3);
  f.manager.destroy();
});

test('copy release without dragover hides unsupported destinations without claiming native drop', () => {
  const f = makeFolderEndDropFixture(api); const rows = start(f);
  const event = f.emit('drop', rows[2], { dataTransfer: { types: ['application/x-moz-tabbrowser-tab'], dropEffect: 'copy' } });
  assert.equal(event.prevented, 0); assert.equal(event.stopped, 1);
  assert.equal(f.nativeCalls.find(call => call.type === 'drop').anchor, f.last);
  f.flush(); assert.equal(f.rows().length, 0); f.manager.destroy();
});

test('unrelated folder receivers keep native precedence, even with the pointer at footer coordinates', () => {
  const f = makeFolderEndDropFixture(api);
  const other = f.addFolder('Other', f.pins, 20, 10);
  f.pins.insertBefore(other, f.parent);
  start(f); f.source._dragData.dropElement = other;
  f.emit('dragover', other.labelContainerElement, { clientY: 300 });
  f.emit('drop', other.labelContainerElement, { clientY: 300 }); f.flush();
  assert.equal(f.nativeCalls.find(call => call.type === 'drop').anchor, other);
  assert.equal(f.source.parentElement, f.pins);
});

test('a trailing ordinary native group is not ignored in favor of an earlier Zen folder root', () => {
  const f = makeFolderEndDropFixture(api);
  const group = f.own(new DropNode('tab-group', 'native-group'));
  f.host.gBrowser.isTabGroup = item => item?.localName === 'tab-group' || item?.isZenFolder;
  f.pins.insertBefore(group, f.separator); f.emit('dragstart');
  assert.equal(f.rows().length, 0); f.manager.destroy();
});

test('an indicator created for the footer is retained if native subsequently changes its geometry', () => {
  const f = makeFolderEndDropFixture(api); const rows = start(f);
  const undo = f.adapters.showPreview(f.manager.footer.rows[2]);
  const indicator = f.host.gZenPinnedTabManager._dragIndicator;
  indicator.style.setProperty('top', '777px'); undo();
  assert.equal(indicator.isConnected, true); assert.equal(f.host.gZenPinnedTabManager._dragIndicator, indicator);
  assert.equal(indicator.style.getPropertyValue('top'), '777px');
  f.manager.destroy();
});

test('stationary pointer tracks a different footer row after scroll without replaying native events', () => {
  const f = makeFolderEndDropFixture(api); const rows = start(f);
  f.emit('dragover', rows[2], { clientX: 100 }); f.host.scrollShift = -30;
  f.emit('scroll', f.tabContainer); f.flush();
  assert.equal(rows[1].hasAttribute('data-bzf-drop-active'), true);
  assert.equal(rows[2].hasAttribute('data-bzf-drop-active'), false);
  assert.equal(f.nativeCalls.filter(call => call.type === 'over').length, 2);
  f.manager.destroy();
});

test('workspace UI notification clears old footer and a changed native indicator remains owned by native', () => {
  const f = makeFolderEndDropFixture(api); const rows = start(f);
  f.emit('dragover', rows[2]);
  const indicator = f.host.gZenPinnedTabManager._dragIndicator;
  indicator.style.setProperty('top', '777px');
  f.host.gZenWorkspaces.activeWorkspace = 'other';
  f.emit('ZenWorkspacesUIUpdate', f.root); f.flush();
  assert.equal(f.rows().length, 0); assert.equal(indicator.style.getPropertyValue('top'), '777px');
  f.manager.destroy();
});

test('empty Child uses before its native placeholder, and absent placeholders delegate to native', () => {
  const f = makeFolderEndDropFixture(api);
  f.last.setAttribute('zen-empty-tab', 'true'); const rows = start(f);
  f.emit('drop', rows[0]); f.flush();
  const drop = f.nativeCalls.find(call => call.type === 'drop');
  assert.equal(drop.before, true); assert.equal(drop.anchor, f.last); assert.equal(f.source.group, f.child);
  f.manager.destroy();
  const empty = makeFolderEndDropFixture(api); empty.last.remove(); empty.emit('dragstart');
  assert.equal(empty.rows().length, 0); empty.manager.destroy();
});

test('foreign transfer identity and multiple transfer items cannot borrow a local active drag', () => {
  for (const extra of [{ mozGetDataAt: () => ({}) }, { mozItemCount: 2 }]) {
    const f = makeFolderEndDropFixture(api); start(f);
    f.emit('dragover', f.last, { dataTransfer: { types: ['application/x-moz-tabbrowser-tab'], dropEffect: 'move', ...extra } });
    f.mutate(); f.flush(); assert.equal(f.rows().length, 0); f.manager.destroy();
  }
});

for (const mode of ['essential', 'live', 'split', 'external', 'multitab', 'tab-list', 'non-native', 'native-rejection']) {
  test(`unsupported ${mode} drag receives no footer or movement override`, () => {
    const f = makeFolderEndDropFixture(api);
    f.source._dragData = { movingTabs: [f.source], dropElement: f.last, dropBefore: false };
    if (mode === 'essential') f.source.setAttribute('zen-essential', 'true');
    if (mode === 'live') f.source.setAttribute('zen-live-folder-item-id', 'source-item');
    if (mode === 'split') f.source.splitview = {};
    if (mode === 'external') f.source.documentGlobal = {};
    if (mode === 'multitab') f.source._dragData.movingTabs.push(f.last);
    if (mode === 'tab-list') f.source._dragData.fromTabList = true;
    if (mode === 'non-native') f.host.gBrowser.isTab = () => false;
    if (mode === 'native-rejection') f.setNativeAllowed(false);
    f.emit('dragstart'); assert.equal(f.rows().length, 0);
    f.manager?.destroy();
  });
}

test('hidden trailing geometry cannot select another subtree or shift the footer destination', () => {
  const f = makeFolderEndDropFixture(api);
  const hidden = f.addFolder('Hidden', f.parent.groupContainer, 6000, 24);
  f.projection.set(hidden, { visible: false }); hidden.setAttribute('data-bzf-visibility', 'hidden');
  const rows = start(f);
  assert.equal(rows[0].textContent, 'End of Child');
  f.emit('drop', rows[1]); f.flush(); assert.equal(f.source.group, f.parent);
  assert.equal(f.parent.allItems.indexOf(f.source), f.parent.allItems.indexOf(f.child) + 1);
});

test('logical Child end follows a hidden trailing item without using its geometry', () => {
  const f = makeFolderEndDropFixture(api);
  const hidden = f.own(new DropNode('tab', 'hidden')); hidden.setAttribute('pinned', 'true'); hidden.rect.top = 9000;
  hidden.setAttribute('data-bzf-visibility', 'hidden'); f.child.groupContainer.appendChild(hidden); f.projection.set(hidden, { visible: false });
  const rows = start(f); f.emit('drop', rows[0]); f.flush();
  assert.equal(f.child.allItems.at(-1), f.source);
  assert.equal(f.nativeCalls.find(call => call.type === 'drop').anchor, hidden);
});

test('semantic hover composition preserves the matched root null and native fallback', () => {
  const f = makeFolderEndDropFixture(api); const rows = start(f);
  const hover = f.manager.composeHoverAdapters({ getTargetFolder: () => f.child, getRelatedTargetFolder: () => f.child });
  assert.equal(hover.getTargetFolder({ target: rows[0] }), f.child);
  assert.equal(hover.getTargetFolder({ target: rows[1] }), f.parent);
  assert.equal(hover.getTargetFolder({ target: rows[2] }), null);
  assert.equal(hover.getRelatedTargetFolder({ relatedTarget: rows[1] }), f.parent);
  assert.equal(hover.getTargetFolder({ target: f.last }), f.child);
  f.manager.destroy();
});

test('canceled prepared drop restores its tuple and does not change membership', () => {
  const f = makeFolderEndDropFixture(api); const rows = start(f);
  const data = f.source._dragData; data.shouldCreateGroupOnDrop = true;
  f.emit('drop', rows[2], { rejectNative: true });
  assert.equal(data.dropElement, f.parent);
  f.flush(); assert.equal(data.dropElement, f.last); assert.equal(data.shouldCreateGroupOnDrop, true);
  assert.equal(f.source.parentElement, f.normal); assert.equal(f.rows().length, 0);
});

test('drop elsewhere keeps the native destination and cleans up the footer', () => {
  const f = makeFolderEndDropFixture(api); start(f);
  f.emit('drop', f.last); f.flush();
  assert.equal(f.nativeCalls.find(call => call.type === 'drop').anchor, f.last);
  assert.equal(f.rows().length, 0);
});

for (const finish of ['click', 'pointerdown', 'keydown', 'dragend', 'destroy']) {
  test(`${finish} clears footer, timers, and only the owned indicator changes`, () => {
    const f = makeFolderEndDropFixture(api); const rows = start(f);
    f.emit('dragover', rows[2]);
    if (finish === 'destroy') f.manager.destroy(); else f.emit(finish, f.source, { key: 'Escape' });
    f.flush(); assert.equal(f.rows().length, 0); assert.equal(f.pending(), 0);
    assert.equal(f.source._dragData.dropElement, f.last);
    assert.equal(f.host.gZenPinnedTabManager._dragIndicator.style.getPropertyValue('top'), '230px');
    f.manager.destroy(); assert.equal(f.host.count(), 0); assert.equal(f.tabContainer.count(), 3);
  });
}

test('native autoscroll still receives the original edge target and indicator returns on leaving footer', () => {
  const f = makeFolderEndDropFixture(api); const rows = start(f);
  f.emit('dragover', rows[2]);
  const event = f.emit('dragover', f.last, { originalTarget: 'scroll-edge' });
  assert.ok(f.nativeCalls.some(call => call.type === 'over' && call.scroll));
  assert.equal(event.stopped, 1); assert.equal(event.prevented, 1);
  assert.equal(f.host.gZenPinnedTabManager._dragIndicator.style.getPropertyValue('top'), '230px');
  f.manager.destroy();
});

test('workspace change or removed destination invalidates the footer before drop', () => {
  for (const change of ['workspace', 'removed', 'live']) {
    const f = makeFolderEndDropFixture(api); const rows = start(f); const old = f.source._dragData.dropElement;
    if (change === 'workspace') f.host.gZenWorkspaces.activeWorkspace = 'other';
    if (change === 'removed') f.child.remove();
    if (change === 'live') f.child.isLiveFolder = true;
    f.mutate(); f.flush(); assert.equal(f.rows().length, 0, change);
    assert.equal(f.source._dragData.dropElement, old); f.manager.destroy();
  }
});

test('stationary-pointer scroll refreshes visible footer rectangles and clears a no-longer-hit preview', () => {
  const f = makeFolderEndDropFixture(api); const rows = start(f);
  f.emit('dragover', rows[2]); f.host.scrollShift = 150;
  f.emit('scroll', f.tabContainer); f.flush();
  assert.equal(f.host.gZenPinnedTabManager._dragIndicator.style.getPropertyValue('top'), '230px');
  f.manager.destroy();
});
