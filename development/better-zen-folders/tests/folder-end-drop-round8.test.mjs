import test from 'node:test';
import assert from 'node:assert/strict';
import * as api from '../scripts/better-zen-folders.uc.mjs';
import {DropNode, makeFolderEndDropFixture} from './folder-end-drop.fixture.mjs';
import {installNativeDropReplay} from './folder-end-drop.native.fixture.mjs';

function setup(t, delay = 300) {
  const f = makeFolderEndDropFixture(api, {destinationDelay: delay});
  t.after(() => f.manager.destroy());
  return f;
}
function textNode(parent) {
  // Native drag targets can be non-Elements; no closest()/matches() method.
  return {nodeType: 3, parentNode: parent, parentElement: parent};
}
const hover = (f, target = f.last, y = 225) => f.emit('dragover', target, {clientX: 100, clientY: y});

test('dragging tab label text acquires the actual tab and starts the chooser dwell', t => {
  const f = setup(t);
  const label = f.source.appendChild(f.own(new DropNode('label')));
  f.emit('dragstart', textNode(label));
  assert.equal(f.manager.source === f.source, true);
  hover(f); f.advance(299); assert.equal(f.rows().length, 0);
  f.advance(1); assert.equal(f.rows().length, 3);
});

test('text source recovery still refuses a mismatched native tab payload', t => {
  const f = setup(t);
  const dt = {types: ['application/x-moz-tabbrowser-tab'], mozItemCount: 1,
    dropEffect: 'move', mozGetDataAt: () => f.last};
  f.emit('dragstart', textNode(f.source), {dataTransfer: dt});
  hover(f); f.advance(300);
  assert.equal(f.manager.source, null); assert.equal(f.rows().length, 0);
});

for (const kind of ['folder-label', 'outside-tabs', 'foreign-tab', 'multiselect', 'other-workspace']) {
  test(`source recovery does not adopt an ineligible ${kind} drag`, t => {
    const f = setup(t);
    let target = textNode(f.source);
    if (kind === 'folder-label') target = textNode(f.child.labelElement);
    if (kind === 'outside-tabs') target = textNode(f.root);
    if (kind === 'foreign-tab') f.source.documentGlobal = {};
    if (kind === 'multiselect') f.source.multiselected = true;
    if (kind === 'other-workspace') f.source.setAttribute('zen-workspace-id', 'inactive');
    f.emit('dragstart', target); hover(f); f.advance(300);
    assert.equal(f.manager.source, null); assert.equal(f.rows().length, 0);
  });
}

for (const kind of ['separator', 'separator-child', 'separator-text']) {
  test(`blank ${kind} within the boundary starts a full configurable dwell`, t => {
    const f = setup(t, 425);
    f.separator.rect = {top:230,left:10,width:250,height:15};
    const line = f.separator.appendChild(f.own(new DropNode('spacer')));
    const target = kind === 'separator' ? f.separator : kind === 'separator-child' ? line : textNode(line);
    f.emit('dragstart', textNode(f.source));
    hover(f, target, 234); f.advance(424); assert.equal(f.rows().length, 0);
    f.advance(1); assert.equal(f.rows().length, 3);
  });
}

test('crossing between the folder, text, divider and blank child keeps the same dwell', t => {
  const f = setup(t), line = f.separator.appendChild(f.own(new DropNode('spacer')));
  f.emit('dragstart'); hover(f); f.advance(100);
  f.emit('dragleave', f.last, {relatedTarget:f.separator,clientX:100,clientY:234});
  hover(f, f.separator, 234); f.advance(100);
  hover(f, textNode(line), 234); f.advance(99); assert.equal(f.rows().length, 0);
  hover(f, f.last, 225); f.advance(1); assert.equal(f.rows().length, 3);
});

test('focusable tab-container ancestors do not make the blank divider a control', t => {
  const f = setup(t); f.tabContainer.setAttribute('tabindex', '-1');
  f.emit('dragstart'); hover(f, f.separator, 234); f.advance(300);
  assert.equal(f.rows().length, 3);
});

for (const tag of ['button', 'toolbarbutton', 'moz-button', 'input']) {
  test(`divider ${tag} and its label remain native controls`, t => {
    const f = setup(t), control = f.separator.appendChild(f.own(new DropNode(tag)));
    const label = control.appendChild(f.own(new DropNode('label')));
    f.emit('dragstart'); hover(f); f.advance(200);
    hover(f, label, 234); f.advance(500); assert.equal(f.rows().length, 0);
    hover(f, textNode(label), 234); f.advance(500); assert.equal(f.rows().length, 0);
  });
}

test('leaving the strip resets divider dwell and every subsequent drag can rearm it', t => {
  const f = setup(t);
  for (let attempt = 0; attempt < 3; attempt++) {
    f.emit('dragstart', textNode(f.source)); hover(f, f.separator, 234); f.advance(200);
    hover(f, f.separator, 239); f.advance(300); assert.equal(f.rows().length, 0);
    hover(f, f.separator, 234); f.advance(299); assert.equal(f.rows().length, 0);
    f.advance(1); assert.equal(f.rows().length, 3);
    f.emit('dragend'); assert.equal(f.rows().length, 0);
  }
});

test('quick divider drop never creates a chooser or substitutes native destination', t => {
  const f = setup(t); installNativeDropReplay(f);
  f.emit('dragstart', textNode(f.source)); hover(f, f.separator, 234); f.advance(299);
  const anchor = f.source._dragData.dropElement;
  f.emit('drop', f.separator, {clientX:100,clientY:234}); f.advance(500);
  assert.equal(f.rows().length, 0);
  assert.equal(f.nativeCalls.filter(c => c.type === 'drop').length, 1);
  assert.equal(f.nativeCalls.find(c => c.type === 'drop').anchor, anchor);
});

for (const index of [0, 1, 2]) {
  test(`divider entry still routes choice ${index} through the native receiver exactly once`, t => {
    const f = setup(t), replay = installNativeDropReplay(f);
    f.emit('dragstart', textNode(f.source)); hover(f, f.separator, 234); f.advance(300);
    assert.equal(f.rows().length, 3);
    f.emit('drop', f.rows()[index]); f.advance(0);
    assert.equal(replay.log.filter(x => x === 'native-drop').length, 1);
    assert.equal(f.source.parentElement === [f.child.groupContainer, f.parent.groupContainer, f.pins][index], true);
  });
}
