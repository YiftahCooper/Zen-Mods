import test from 'node:test';
import assert from 'node:assert/strict';
import * as api from '../scripts/better-zen-folders.uc.mjs';
import { DropNode, makeFolderEndDropFixture } from './folder-end-drop.fixture.mjs';
import { installNativeDropReplay } from './folder-end-drop.native.fixture.mjs';

function setup(t, delay = 300) {
  const f = makeFolderEndDropFixture(api, { destinationDelay: delay });
  const guard = new api.CollapsedFolderDragGuard(f.manager.composeHoverAdapters(api.createBrowserCollapsedFolderDragGuardAdapters(f.host)));
  guard.start(); t.after(() => { guard.destroy(); f.manager.destroy(); });
  return Object.assign(f, {guard});
}
const enter = f => f.emit('dragover', f.last, {clientX: 11, clientY: 225});
const rows = f => f.rows().map(row => row.textContent);

for (const delay of [0, 17, 300, 2147483647]) {
  test(`destination dwell ${delay} starts on full-width local strip, not dragstart or repeated movement`, t => {
    const f = setup(t, delay); f.emit('dragstart'); assert.equal(f.rows().length, 0);
    f.advance(1000); assert.equal(f.rows().length, 0);
    enter(f);
    if (delay) { f.advance(delay - 1); assert.equal(f.rows().length, 0); enter(f); f.advance(1); }
    else f.advance(0);
    assert.deepEqual(rows(f), ['End of Child','After Child in Parent','After Parent in Pinned Tabs']);
  });
}
test('adapter without preferences defaults to a 300ms dwell', t => {
  const f = setup(t); f.manager.destroy();
  f.manager = new api.FolderEndDropManager(api.createBrowserFolderEndDropAdapters(f.host, {projection: f.projection}));
  f.manager.start(); f.emit('dragstart'); assert.equal(f.rows().length, 0);
  enter(f); f.advance(299); assert.equal(f.rows().length, 0); f.advance(1); assert.equal(f.rows().length, 3);
});
test('quick crossing cancels dwell, quick drop stays native, and re-entry requires a full delay', t => {
  const f = setup(t); f.emit('dragstart'); enter(f); f.advance(299);
  f.emit('dragover', f.normal); f.advance(500); assert.equal(f.rows().length, 0);
  enter(f); f.advance(299); assert.equal(f.rows().length, 0); f.advance(1); assert.equal(f.rows().length, 3);
  f.emit('dragover', f.normal); assert.equal(f.rows().length, 0);
  enter(f); f.advance(100); f.emit('drop', f.last); f.advance(500);
  assert.equal(f.rows().length, 0); assert.equal(f.nativeCalls.filter(x=>x.type==='drop').length, 1);
  assert.equal(f.nativeCalls.find(x=>x.type==='drop').anchor.id, 'last');
});
test('choices persist between trigger and rows, but true leave hides them and re-arms', t => {
  const f = setup(t); f.emit('dragstart'); enter(f); f.advance(300);
  const choice = f.rows()[1]; assert.ok(choice);
  f.emit('dragleave', f.last, {relatedTarget: choice, clientX: 100, clientY: 275});
  f.emit('dragover', choice); assert.equal(f.rows().length, 3);
  f.emit('dragleave', choice, {relatedTarget: f.last, clientX: 11, clientY: 225});
  enter(f); assert.equal(f.rows().length, 3);
  f.emit('dragleave', f.last, {relatedTarget: f.normal, clientX: 100, clientY: 350});
  assert.equal(f.rows().length, 0); enter(f); f.advance(299); assert.equal(f.rows().length, 0);
  f.advance(1); assert.equal(f.rows().length, 3);
});
test('internal blur preserves both sessions; window blur suspends and requires a new validated dwell', t => {
  const f = setup(t); f.emit('dragstart'); enter(f); f.advance(100);
  f.emit('blur', f.source, {relatedTarget:f.last}); f.advance(200);
  assert.equal(f.rows().length, 3); assert.equal(f.guard.activeDrag, true);
  f.emit('blur', f.host); assert.equal(f.rows().length, 0); assert.equal(f.guard.activeDrag, true);
  enter(f); f.advance(299); assert.equal(f.rows().length, 0); f.advance(1); assert.equal(f.rows().length, 3);
});
test('copy at start records a candidate; move resumes with dwell; copy cancels an active dwell', t => {
  const f = setup(t); f.emit('dragstart', f.source, {dataTransfer:{types:[],dropEffect:'copy'}});
  assert.equal(f.manager.source === f.source, true); assert.equal(f.rows().length, 0);
  enter(f); f.advance(200);
  f.emit('dragover', f.last, {dataTransfer:{types:['application/x-moz-tabbrowser-tab'],dropEffect:'copy'}});
  f.advance(500); assert.equal(f.rows().length, 0);
  enter(f); f.advance(299); assert.equal(f.rows().length, 0); f.advance(1); assert.equal(f.rows().length, 3);
});
for (const terminal of ['dragend','keydown','pointerdown','destroy','replaced-data']) {
  test(`${terminal} cannot resurrect a completed or replaced session`, t => {
    const f = setup(t); f.emit('dragstart'); enter(f); f.advance(299);
    if (terminal==='destroy') f.manager.destroy();
    else if (terminal==='replaced-data') f.source._dragData = {...f.source._dragData};
    else f.emit(terminal, f.source, {key:'Escape'});
    f.advance(1000); enter(f); f.advance(1000); assert.equal(f.rows().length, 0);
  });
}
test('local root choices remain available with ordinary pins following and insert at that boundary', t => {
  const f = setup(t); const replay=installNativeDropReplay(f);
  const tail=f.own(new DropNode('tab','ordinary-tail')); tail.setAttribute('pinned','true');
  tail.rect={top:350,left:10,width:250,height:30}; f.pins.insertBefore(tail,f.separator);
  f.emit('dragstart'); enter(f); f.advance(300); assert.equal(f.rows().length,3);
  assert.equal(f.pins.children.indexOf(f.manager.footer.element),f.pins.children.indexOf(f.parent)+1);
  assert.equal(f.pins.children.indexOf(f.manager.footer.element)+1,f.pins.children.indexOf(tail));
  f.emit('drop',f.rows()[2]); f.advance(0);
  assert.equal(replay.log.filter(x=>x==='native-drop').length,1);
  assert.equal(f.source.parentElement===f.pins,true);
  assert.equal(f.pins.children.indexOf(f.source),f.pins.children.indexOf(f.parent)+1);
  assert.equal(f.pins.children.indexOf(tail),f.pins.children.indexOf(f.source)+1);
});
test('root drop followed by a different dragged tab repeats local dwell despite ordinary tail', t => {
  const f=setup(t); installNativeDropReplay(f); f.emit('dragstart'); enter(f); f.advance(300);
  f.emit('drop',f.rows()[2]); f.advance(0);
  // Next native gesture boundary: Last is now dragged, Source remains root tail.
  f.last._dragData={movingTabs:[f.last],movingTabsSet:new Set([f.last]),fromTabList:false};
  const dt={types:['application/x-moz-tabbrowser-tab'],mozItemCount:1,dropEffect:'move',
    mozTypesAt:()=>['application/x-moz-tabbrowser-tab'],mozGetDataAt:()=>f.last};
  f.emit('dragstart',f.last,{dataTransfer:dt}); assert.equal(f.rows().length,0);
  // Empty inner folder has no anchor until its native placeholder exists.
  const empty=f.own(new DropNode('tab','placeholder')); empty.setAttribute('zen-empty-tab','true');
  f.child.groupContainer.appendChild(empty);
  f.emit('dragover',f.child.labelContainerElement,{dataTransfer:dt,clientX:11,clientY:115});
  f.advance(299); assert.equal(f.rows().length,0); f.advance(1); assert.equal(f.rows().length,3);
});
test('changing local candidate cancels the first dwell and places choices after the second root', t => {
  const f=setup(t); const other=f.addFolder('Other',f.pins,300,10);
  const tab=f.own(new DropNode('tab','other-last')); tab.rect={top:330,left:24,width:236,height:30};other.groupContainer.appendChild(tab);
  f.emit('dragstart'); enter(f); f.advance(299);
  f.emit('dragover',tab,{clientX:11,clientY:355}); f.advance(299); assert.equal(f.rows().length,0);
  f.advance(1); assert.deepEqual(rows(f),['End of Other','After Other in Pinned Tabs']);
  assert.equal(f.pins.children.indexOf(f.manager.footer.element),f.pins.children.indexOf(other)+1);
});
test('chooser trigger dwell does not start folder expansion; native header hover still uses its own timer', t=>{
  const f=setup(t); f.parent.collapsed=true; f.projection.set(f.child,{visible:false});
  f.child.setAttribute('data-bzf-visibility','hidden');
  f.emit('dragstart'); f.emit('dragover',f.parent.labelContainerElement,{clientX:11,clientY:85});
  f.advance(299); assert.equal(f.rows().length,0); assert.equal(f.parent.collapsed,true);
  f.advance(1); assert.equal(f.rows().length,2); assert.equal(f.parent.collapsed,true);
  f.advance(1000); assert.equal(f.parent.collapsed,true);
  // Leave the end strip and hover the native header's upper portion instead.
  f.emit('dragover',f.parent.labelContainerElement,{clientX:25,clientY:65});
  assert.equal(f.rows().length,0); f.advance(499); assert.equal(f.parent.collapsed,true);
  f.advance(1); assert.equal(f.parent.collapsed,false);
});

test('new dwell reads changed preference; changing it does not retime the running dwell', t=>{
  const f=setup(t); let delay=300; f.preferences.get=()=>delay;
  f.emit('dragstart'); enter(f); f.advance(100); delay=25;
  enter(f); f.advance(199); assert.equal(f.rows().length,0); f.advance(1); assert.equal(f.rows().length,3);
  f.emit('dragover',f.normal); enter(f); f.advance(24); assert.equal(f.rows().length,0);
  f.advance(1); assert.equal(f.rows().length,3);
});
test('movement outside tab container hides visible choices without relying on native bubble dispatch', t=>{
  const f=setup(t); f.emit('dragstart'); enter(f); f.advance(300);
  f.emit('dragover',f.root,{clientX:500,clientY:500}); assert.equal(f.rows().length,0);
  enter(f); f.advance(299); assert.equal(f.rows().length,0); f.advance(1); assert.equal(f.rows().length,3);
});
test('unrelated row and clipped or outside coordinates cannot sustain chooser by target ancestry alone', t=>{
  const f=setup(t); f.emit('dragstart'); enter(f); f.advance(300);
  f.emit('dragover',f.manager.footer.element,{clientX:500,clientY:500}); assert.equal(f.rows().length,0);
  // Blank divider is now an approved trigger; its actual controls are not.
  const clear = f.separator.appendChild(f.own(new DropNode('toolbarbutton')));
  for (const target of [f.normal,clear,f.tabContainer]) {
    f.emit('dragover',target,{clientX:11,clientY:225});f.advance(300);assert.equal(f.rows().length,0);
  }
  f.tabContainer.rect.height=210; enter(f);f.advance(300);assert.equal(f.rows().length,0);
});
test('copy/window suspension cannot adopt a different native drag-data identity in either manager', t=>{
  const f=setup(t); f.emit('dragstart'); const data=f.source._dragData; enter(f);f.advance(100);
  f.emit('blur',f.host); assert.equal(f.source._dragData===data,true);
  f.source._dragData={...data}; enter(f);f.advance(1000);
  assert.equal(f.rows().length,0);assert.equal(f.manager.source,null);assert.equal(f.guard.activeDrag,false);
});

for (const index of [0,1,2]) {
  test(`chooser row ${index} never expands collapsed folders while keeping semantic native drop`, t=>{
    const f=setup(t); const replay=installNativeDropReplay(f); f.child.collapsed=true;
    f.emit('dragstart');enter(f);f.advance(300);
    const choice=f.rows()[index]; const labels=rows(f);
    f.emit('dragover',choice);f.advance(1500);
    assert.equal(f.child.collapsed,true);assert.equal(f.parent.collapsed,true);assert.deepEqual(rows(f),labels);
    f.emit('drop',choice);f.advance(0);
    assert.equal(replay.log.filter(x=>x==='native-drop').length,1);
    assert.equal(f.source.group?.id??null,[f.child.id,f.parent.id,null][index]);
  });
}
test('already drag-opened ancestor stays open across trigger and every chooser row, then recollapses on true leave', t=>{
  const f=setup(t); f.emit('dragstart');
  f.emit('dragover',f.parent.labelContainerElement,{clientX:25,clientY:65});f.advance(500);
  assert.equal(f.parent.collapsed,false);
  enter(f);f.advance(300);
  for(const choice of f.rows()) {f.emit('dragover',choice);f.advance(1000);assert.equal(f.parent.collapsed,false);}
  f.emit('dragover',f.normal);f.advance(499);assert.equal(f.parent.collapsed,false);
  f.advance(1);assert.equal(f.parent.collapsed,true);
});
test('native premature expansion in the chooser trigger is guarded without scheduling a hover expansion', t=>{
  const f=setup(t); f.projection.set(f.child,{visible:false}); f.child.setAttribute('data-bzf-visibility','hidden');
  f.emit('dragstart');f.emit('dragover',f.parent.labelContainerElement,{clientX:11,clientY:85});
  f.parent.collapsed=false; f.emit('TabGroupExpand',f.parent);
  assert.equal(f.parent.collapsed,true);f.advance(1500);
  assert.equal(f.parent.collapsed,true);assert.equal(f.rows().length,2);
});
test('pointerdown cancels both managers including the independent native-header hover timer', t=>{
  const f=setup(t); f.emit('dragstart');
  f.emit('dragover',f.parent.labelContainerElement,{clientX:25,clientY:65});f.advance(100);
  f.emit('pointerdown',f.source);f.advance(1000);
  assert.equal(f.parent.collapsed,true);assert.equal(f.guard.activeDrag,false);assert.equal(f.guard.hoverTimer,null);
  assert.equal(f.manager.source,null);
  f.emit('dragover',f.parent.labelContainerElement,{clientX:25,clientY:65});f.advance(1000);
  assert.equal(f.parent.collapsed,true);
});
test('native multi-tab hover uses initiating source identity even when it is not the first moving member', t=>{
  const f=setup(t); f.source.multiselected=true;
  f.source._dragData={movingTabs:[f.last,f.source],movingTabsSet:new Set([f.last,f.source])};
  const data=f.source._dragData;assert.equal(f.last._dragData,undefined);
  f.emit('dragstart');f.emit('dragover',f.parent.labelContainerElement,{clientX:25,clientY:65});
  f.advance(499);assert.equal(f.parent.collapsed,true);f.advance(1);assert.equal(f.parent.collapsed,false);
  assert.equal(f.rows().length,0);assert.equal(f.manager.source,null);assert.equal(f.guard.activeDrag,true);
  f.emit('blur',f.host);assert.equal(f.parent.collapsed,true);assert.equal(f.source._dragData===data,true);
  f.emit('dragover',f.parent.labelContainerElement,{clientX:25,clientY:65});f.advance(500);
  assert.equal(f.parent.collapsed,false);
  f.emit('blur',f.host);f.source._dragData={...data};
  f.emit('dragover',f.parent.labelContainerElement,{clientX:25,clientY:65});f.advance(500);
  assert.equal(f.parent.collapsed,true);assert.equal(f.guard.activeDrag,false);assert.equal(f.rows().length,0);
});

for (const zenFolder of [true, false]) test(`native ${zenFolder ? 'folder' : 'group'} label keeps header guard independent of tab membership`, t=>{
  const f=setup(t), dragged=f.addFolder('Dragged',f.pins,320,10), label=dragged.labelElement;
  dragged.isZenFolder=zenFolder;installNativeDropReplay(f);
  label._dragData={movingTabs:[label],movingTabsSet:new Set([label]),fromTabList:false};
  const dataTransfer={types:['application/x-moz-tabbrowser-tab'],mozItemCount:1,dropEffect:'move',
    mozTypesAt:()=>['application/x-moz-tabbrowser-tab'],mozGetDataAt:()=>label};
  assert.equal(f.tabContainer.tabDragAndDrop.getDropEffectForTabDrag({dataTransfer}),'move');
  f.emit('dragstart',label,{dataTransfer});
  assert.deepEqual(f.guard.draggedItems,[]);assert.equal(f.manager.source,null);
  f.emit('dragover',f.parent.labelContainerElement,{dataTransfer,clientX:25,clientY:65});
  f.parent.collapsed=false;f.emit('TabGroupExpand',f.parent);assert.equal(f.parent.collapsed,true);
  f.advance(499);assert.equal(f.parent.collapsed,true);f.advance(1);assert.equal(f.parent.collapsed,false);
  assert.equal(f.rows().length,0);
});

test('label payload owns the same session across copy and blur; foreign payload and replaced data cannot borrow it', t=>{
  const f=setup(t), dragged=f.addFolder('Dragged',f.pins,320,10), label=dragged.labelElement;
  installNativeDropReplay(f);
  const descendant=label.appendChild(new DropNode('span'));
  const data=label._dragData={movingTabs:[label],movingTabsSet:new Set([label]),fromTabList:false};
  const dataTransfer={types:['application/x-moz-tabbrowser-tab'],mozItemCount:1,dropEffect:'copy',
    mozTypesAt:()=>['application/x-moz-tabbrowser-tab'],mozGetDataAt:()=>label};
  f.emit('dragstart',descendant,{dataTransfer});
  const over=transfer=>f.emit('dragover',f.parent.labelContainerElement,{dataTransfer:transfer,clientX:25,clientY:65});
  over(dataTransfer);f.advance(500);assert.equal(f.parent.collapsed,true);
  dataTransfer.dropEffect='move';over(dataTransfer);f.advance(499);assert.equal(f.parent.collapsed,true);
  f.advance(1);assert.equal(f.parent.collapsed,false);
  f.emit('blur',f.host);assert.equal(f.parent.collapsed,true);assert.equal(label._dragData,data);
  over({...dataTransfer,mozGetDataAt:()=>f.source});f.advance(500);assert.equal(f.parent.collapsed,true);
  over(dataTransfer);f.advance(500);assert.equal(f.parent.collapsed,false);
  f.emit('blur',f.host);label._dragData={...data};over(dataTransfer);f.advance(500);
  assert.equal(f.parent.collapsed,true);assert.equal(f.guard.activeDrag,false);assert.equal(f.rows().length,0);
});
