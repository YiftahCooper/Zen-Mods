import test from 'node:test';
import assert from 'node:assert/strict';
import * as api from '../scripts/better-zen-folders.uc.mjs';
import {DropNode, makeFolderEndDropFixture} from './folder-end-drop.fixture.mjs';
import {installNativeDropReplay} from './folder-end-drop.native.fixture.mjs';

function fixture(kind = 'tab', position = 'top', replay = false) {
  const f = makeFolderEndDropFixture(api, {install:false});
  installNativeDropReplay(f);
  const {host, child:folder, own, last} = f;
  const sentinel = own(new DropNode('tab', 'empty'));
  sentinel.setAttribute('zen-empty-tab', 'true'); sentinel.setAttribute('pinned', 'true');
  folder.groupContainer.insertBefore(sentinel, last);
  const item = kind === 'folder' ? f.addFolder('incoming', f.pins, 20, 10) : f.source;
  const source = kind === 'folder' ? item.labelElement : item;
  source.container = f.tabContainer;
  source._dragData = {movingTabs:[source], dropElement:sentinel, dropBefore:true,
    translateX:0, translateY:0, tabWidth:180, tabHeight:30};
  const native = f.tabContainer.tabDragAndDrop;
  let calls = 0;
  const original = native.handle_drop;
  native.handle_drop = replay ? function(event) { calls++; return original.call(this,event); }
    : function(event) {
      calls++;
      if (!event.reject) {
        for (const incoming of event.nativeItems ?? [item]) {
          incoming.setAttribute('pinned','true');
          folder.groupContainer.insertBefore(incoming, event.nativeBottom ? null : last);
        }
      }
      delete source._dragData;
      return 'native-result';
    };
  host.console = {warn:message => {throw Error(message);}};
  const values = {movedTabPosition:kind === 'tab' ? position : 'bottom',
    movedFolderPosition:kind === 'folder' ? position : 'bottom'};
  const manager = new api.FolderHeaderDropPlacementManager(host, {get:key => values[key]});
  manager.start();
  const event = {target:folder.labelElement, defaultPrevented:false,
    dataTransfer:{types:['application/x-moz-tabbrowser-tab'], dropEffect:'move',
      mozTypesAt:()=>['application/x-moz-tabbrowser-tab'], mozGetDataAt:()=>source},
    stopPropagation(){}};
  return {...f, folder, item, source, sentinel, native, manager, event, values,
    drop:()=>native.handle_drop(event), calls:()=>calls,
    order:()=>folder.groupContainer.children.map(node=>node.id)};
}

for (const kind of ['tab','folder']) for (const position of ['top','bottom']) {
  test(`header drop places ${kind} at ${position} using its independent preference`,()=>{
    const f=fixture(kind,position); const collapsed=f.folder.collapsed;
    assert.equal(f.drop(),'native-result');
    assert.deepEqual(f.order(),position==='top'?['empty',f.item.id,'last']:['empty','last',f.item.id]);
    assert.equal(f.calls(),1); assert.equal(f.folder.collapsed,collapsed); f.manager.destroy();
  });
}

for (const kind of ['tab','folder']) test(`Top moves an incoming ${kind} back from native bottom placement`,()=>{
  const f=fixture(kind,'top'); f.event.nativeBottom=true;
  f.drop(); assert.deepEqual(f.order(),['empty',f.item.id,'last']); f.manager.destroy();
});

test('native quick header drop preserves a collapsed destination',()=>{
  const f=fixture('tab','bottom',true); f.folder.collapsed=true;
  f.drop(); assert.deepEqual(f.order(),['empty','last','source']);
  assert.equal(f.folder.collapsed,true); f.manager.destroy();
});

for (const position of ['top','bottom']) test(`native group-label drop places a whole folder at ${position}`,()=>{
  const f=fixture('folder',position,true);
  f.native._setIsDraggingTabGroup=()=>{};f.native._expandGroupOnDrop=()=>{};
  const tab=f.own(new DropNode('tab','folder-tab'));tab.setAttribute('pinned','true');
  f.item.groupContainer.appendChild(tab);
  f.drop();assert.deepEqual(f.order(),position==='top'?['empty','incoming','last']:['empty','last','incoming']);
  assert.equal(tab.parentElement,f.item.groupContainer);f.manager.destroy();
});

for (const rtl of [false,true]) test(`multi-tab header drop preserves native visual order (RTL=${rtl})`,()=>{
  const f=fixture('tab','bottom');
  const second=f.own(new DropNode('tab','second'));f.normal.appendChild(second);
  const visual=[f.item,second];
  f.source._dragData.movingTabs=rtl?[...visual].reverse():[...visual];
  const nativeArray=f.source._dragData.movingTabs;
  f.native._rtlMode=rtl;f.event.nativeItems=visual;
  f.drop();assert.deepEqual(f.order(),['empty','last','source','second']);
  assert.deepEqual(nativeArray,rtl?[second,f.item]:visual);f.manager.destroy();
});

test('mixed incoming and existing selection places incoming tabs without moving existing peers',()=>{
  const f=fixture('tab','bottom',true);
  const tail=f.own(new DropNode('tab','tail'));tail.setAttribute('pinned','true');
  f.folder.groupContainer.appendChild(tail);
  f.source._dragData.movingTabs=[f.source,f.last];
  f.drop();assert.deepEqual(f.order(),['empty','last','tail','source']);f.manager.destroy();
});

for (const scenario of ['between','chooser','copy','foreign','rejected','cancelled','outer-edge','already-inside','live','new-group']) {
  test(`header policy leaves ${scenario} drop alone`,()=>{
    const f=fixture('tab','bottom');
    if(scenario==='between') f.event.target=f.last;
    if(scenario==='chooser') f.event.target=f.root;
    if(scenario==='copy') f.event.dataTransfer.dropEffect='copy';
    if(scenario==='foreign') f.source.documentGlobal={};
    if(scenario==='rejected') f.event.reject=true;
    if(scenario==='cancelled') f.event.defaultPrevented=true;
    if(scenario==='outer-edge') f.source._dragData.dropElement=f.folder;
    if(scenario==='already-inside') f.folder.groupContainer.appendChild(f.item);
    if(scenario==='live') f.folder.isLiveFolder=true;
    if(scenario==='new-group') f.source._dragData.shouldCreateGroupOnDrop=true;
    f.drop(); assert.equal(f.calls(),1);
    assert.deepEqual(f.order(),scenario==='rejected'?['empty','last']:['empty',f.item.id,'last']);
    f.manager.destroy();
  });
}

test('current native drop and before/after receivers place a tab at the bottom after header drop',()=>{
  const f=fixture('tab','bottom',true);
  f.drop(); assert.deepEqual(f.order(),['empty','last','source']);
  assert.equal(f.calls(),1); f.manager.destroy();
});

test('destroy restores only the owned wrapper and abort prevents activation',()=>{
  const f=fixture(); const wrapper=f.native.handle_drop;
  f.manager.destroy(); assert.notEqual(f.native.handle_drop,wrapper);
  f.manager.start(); const replacement=()=>{}; f.native.handle_drop=replacement;
  f.manager.destroy(); assert.equal(f.native.handle_drop,replacement);
  const abort=new AbortController(); abort.abort(); f.manager.start(abort.signal);
  assert.equal(f.native.handle_drop,replacement);
});

test('teardown is safe when native drag support is absent',()=>{
  const manager=new api.FolderHeaderDropPlacementManager({},{});
  manager.start(); manager.destroy(); manager.destroy();
});
