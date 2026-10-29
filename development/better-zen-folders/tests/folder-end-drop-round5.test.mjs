import test from 'node:test';
import assert from 'node:assert/strict';
import * as current from '../scripts/better-zen-folders.uc.mjs';
import { makeFolderEndDropFixture } from './folder-end-drop.fixture.mjs';
import { installNativeDropReplay } from './folder-end-drop.native.fixture.mjs';

// Opt-in immutable baseline replay, without replacing the working source.
const api = process.env.BZF_END_DROP_BASELINE
  ? await import('../artifacts/releases/20260921T152454Z-v0.3.6-round2-890c0fbf/package/scripts/better-zen-folders.uc.mjs')
  : current;

function start(t) {
  const f = makeFolderEndDropFixture(api);
  t.after(() => f.manager.destroy());
  f.emit('dragstart');
  f.reveal();
  return f;
}

// Literal boundaries: footer x=[10,260), y=[230,318); 28px rows,
// 2px gaps split at y=259 and 289. Reject outside and foreign receivers.
for (const [x, y, index] of [
  [10, 230, 0], [11, 245, 0], [259.9, 258.9, 0],
  [10, 259, 1], [11, 275, 1], [259.9, 288.9, 1],
  [10, 289, 2], [259.9, 317.9, 2],
  [9.9, 245, null], [260, 245, null], [100, 229.9, null], [100, 318, null],
]) {
  test(`expanded footer activation at (${x}, ${y}) selects ${index}`, t => {
    const f = start(t);
    const hit = f.adapters.hitTest(f.manager.footer, {
      target: f.manager.footer.element, clientX: x, clientY: y,
    });
    assert.equal(hit?.element.getAttribute('data-bzf-folder-end-row') ?? null, index === null ? null : String(index));
  });
}

for (const [y, index, group] of [[245, 0, 'child'], [259, 1, 'parent'], [289, 2, null]]) {
  test(`footer gutter/gap ${index} previews and executes captured native drop once`, t => {
    const f = makeFolderEndDropFixture(api);
    t.after(() => f.manager.destroy());
    const replay = installNativeDropReplay(f);
    f.emit('dragstart');
    f.reveal();
    const footer = f.manager.footer.element;
    const point = { clientX: 11, clientY: y };
    const over = f.emit('dragover', footer, point);
    assert.equal(f.rows()[index].hasAttribute('data-bzf-drop-active'), true);
    const hover = f.manager.composeHoverAdapters({ getTargetFolder: () => null, getRelatedTargetFolder: () => null });
    assert.equal(hover.getTargetFolder({ target: footer, ...point })?.id ?? null, group ? f[group].id : null);
    assert.equal(over.prevented, 1); assert.equal(over.stopped, 1);
    const drop = f.emit('drop', footer, point);
    f.flush();
    assert.equal(replay.log.filter(item => item === 'native-drop').length, 1);
    assert.equal(replay.log.filter(item => item === 'pin').length, 1);
    assert.equal(f.source.group, group ? f[group] : null);
    assert.equal(f.source.pinned, true);
    assert.equal(drop.prevented, 0); assert.equal(drop.stopped, 1);
    assert.equal(f.rows().length, 0); assert.equal(f.pending(), 0);
  });
}

test('expanded activation delegates foreign receivers and clipped points; Escape cleans gutter preview', t => {
  const f = start(t), footer = f.manager.footer.element;
  for (const target of [f.last, f.normal, f.separator, f.pins, f.tabContainer]) {
    assert.equal(f.adapters.hitTest(f.manager.footer, { target, clientX: 11, clientY: 275 }), null);
  }
  f.tabContainer.rect.height = 270;
  assert.equal(f.adapters.hitTest(f.manager.footer, { target: footer, clientX: 11, clientY: 275 }), null);
  f.emit('dragover', footer, { clientX: 11, clientY: 245 });
  assert.equal(f.rows()[0].hasAttribute('data-bzf-drop-active'), true);
  f.emit('keydown', f.source, { key: 'Escape' }); f.flush();
  assert.equal(f.rows().length, 0); assert.equal(f.pending(), 0);
  assert.equal(f.source._dragData.dropElement, f.last);
  assert.equal(f.host.gZenPinnedTabManager._dragIndicator.style.getPropertyValue('top'), '230px');
});
