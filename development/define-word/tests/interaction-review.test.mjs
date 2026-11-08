import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createPopupResizer} from '../src/resize.mjs';
import {createPopup} from '../src/popup.mjs';

function constrainedContent(anchor={x:100,y:400,width:40,height:20},naturalHeight=700){
  const dom=new JSDOM('<div id="panel"><div id="shell"></div><button data-resize-edge="s"></button></div>');
  const window=dom.window,panel=window.document.querySelector('#panel'),shell=window.document.querySelector('#shell'),handle=window.document.querySelector('button');
  Object.defineProperties(window,{innerWidth:{value:1000,writable:true},innerHeight:{value:800,writable:true}});
  let open=false;const saved=[];
  // jsdom does not lay out boxes. Model the browser's ordinary height/max-height
  // constraint over 700px of natural content, instead of treating style.height
  // as the rendered size. This exposes jumps caused by releasing max-height.
  shell.getBoundingClientRect=()=>({left:100,top:20,width:parseFloat(shell.style.width)||480,height:Math.min(parseFloat(shell.style.height)||naturalHeight,parseFloat(shell.style.maxHeight)||Infinity)});
  const resizer=createPopupResizer(window,{panel,shell,handle,isOpen:()=>open,onSizeChange:size=>saved.push(size)});
  resizer.prepare(anchor);open=true;
  return {window,panel,shell,handle,saved,close(){resizer.destroy();dom.window.close();}};
}

test('automatic long content fits after the browser viewport becomes shorter',t=>{
  const h=constrainedContent();t.after(()=>h.close());
  assert.equal(h.shell.getBoundingClientRect().height,380);
  h.window.innerHeight=300;h.window.dispatchEvent(new h.window.Event('resize'));
  assert(h.shell.getBoundingClientRect().height<=268,'the automatic popup must obey the current viewport height, including its margins');
  assert.equal(h.saved.length,0,'fitting a viewport must not persist a user resize');
});

test('automatic content recalculates selection clearance when the viewport changes',t=>{
  const h=constrainedContent({x:100,y:300,width:40,height:20});t.after(()=>h.close());
  assert.equal(h.shell.getBoundingClientRect().height,460);
  h.window.innerHeight=600;h.window.dispatchEvent(new h.window.Event('resize'));
  // Above the selection: 300px minus the 12px viewport margin and 8px gap.
  assert.equal(h.shell.getBoundingClientRect().height,280,'the selected word must remain clear when neither side can fit the old height');
  assert.equal(h.saved.length,0,'automatic fitting must not become a remembered user resize');
});

test('resetting a user resize restores the initial selection clearance',t=>{
  const h=constrainedContent();t.after(()=>h.close());
  h.handle.dispatchEvent(new h.window.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}));
  assert.equal(h.shell.getBoundingClientRect().height,400);
  h.handle.dispatchEvent(new h.window.KeyboardEvent('keydown',{key:'Home',bubbles:true,cancelable:true}));
  assert.equal(h.shell.getBoundingClientRect().height,380,'reset must return long content to its safe automatic height');
  assert.equal(h.saved.at(-1),null);
});

test('grabbing an initially constrained edge preserves its visible size until the pointer moves',t=>{
  const h=constrainedContent();t.after(()=>h.close());
  h.handle.dispatchEvent(new h.window.MouseEvent('mousedown',{button:0,clientX:500,clientY:400,bubbles:true,cancelable:true}));
  assert.equal(h.shell.getBoundingClientRect().height,380,'pressing an edge must not reveal the entire natural content height');
  h.window.dispatchEvent(new h.window.MouseEvent('mousemove',{button:0,clientX:500,clientY:420,cancelable:true}));
  assert.equal(h.shell.getBoundingClientRect().height,400,'a 20px pointer movement must increase the original visible height by 20px');
  h.window.dispatchEvent(new h.window.MouseEvent('mouseup',{button:0,clientX:500,clientY:420}));
  assert.equal(h.saved.at(-1).height,400);
});

test('a horizontal edge resize preserves a short popup height',t=>{
  const h=constrainedContent(undefined,160);t.after(()=>h.close());h.handle.dataset.resizeEdge='e';
  h.handle.dispatchEvent(new h.window.MouseEvent('mousedown',{button:0,clientX:580,clientY:100,bubbles:true,cancelable:true}));
  h.window.dispatchEvent(new h.window.MouseEvent('mousemove',{button:0,clientX:600,clientY:100,cancelable:true}));
  h.window.dispatchEvent(new h.window.MouseEvent('mouseup',{button:0,clientX:600,clientY:100}));
  assert.equal(h.shell.getBoundingClientRect().width,500);
  assert.equal(h.shell.getBoundingClientRect().height,160,'resizing the east edge must not grow an untouched vertical dimension');
  assert.deepEqual(h.saved.at(-1),{width:500,height:160});
  h.window.innerHeight=900;h.window.dispatchEvent(new h.window.Event('resize'));
  assert.equal(h.shell.getBoundingClientRect().height,160,'fitting the chosen size must preserve the untouched dimension');
});

test('horizontal keyboard resize preserves a short popup height',t=>{
  const h=constrainedContent(undefined,160);t.after(()=>h.close());
  h.handle.dispatchEvent(new h.window.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true}));
  assert.deepEqual(h.saved.at(-1),{width:500,height:160});
});

test('stationary resize pointer events preserve automatic dimensions without saving',t=>{
  const h=constrainedContent(undefined,160);t.after(()=>h.close());
  h.handle.dispatchEvent(new h.window.MouseEvent('mousedown',{button:0,clientX:500,clientY:180,bubbles:true,cancelable:true}));
  h.window.dispatchEvent(new h.window.MouseEvent('mousemove',{button:0,clientX:500,clientY:180,cancelable:true}));
  h.window.dispatchEvent(new h.window.MouseEvent('mouseup',{button:0,clientX:500,clientY:180}));
  assert.equal(h.shell.getBoundingClientRect().height,160,'a move event with no pointer displacement must not change size');
  assert.equal(h.saved.length,0,'a stationary click must not replace the remembered size');
});

test('a stationary resize click preserves selection-aware automatic fitting on later viewport changes',t=>{
  const h=constrainedContent({x:100,y:300,width:40,height:20});t.after(()=>h.close());
  assert.equal(h.shell.getBoundingClientRect().height,460);
  h.handle.dispatchEvent(new h.window.MouseEvent('mousedown',{button:0,clientX:500,clientY:480,bubbles:true,cancelable:true}));
  h.window.dispatchEvent(new h.window.MouseEvent('mousemove',{button:0,clientX:500,clientY:480,cancelable:true}));
  h.window.dispatchEvent(new h.window.MouseEvent('mouseup',{button:0,clientX:500,clientY:480}));
  h.window.innerHeight=600;h.window.dispatchEvent(new h.window.Event('resize'));
  assert.equal(h.shell.getBoundingClientRect().height,280,'a stationary click must retain the automatic clearance around the selected word');
  assert.equal(h.saved.length,0);
});

test('closing a popup reopened while its input owns focus restores the original invoker',t=>{
  const dom=new JSDOM('<button id="invoker">Page command</button>'),window=dom.window;
  window.gBrowser={selectedBrowser:window.document.body};
  window.document.createXULElement=tag=>{const node=window.document.createElement(tag);node.openPopup=()=>{};node.hidePopup=()=>node.dispatchEvent(new window.Event('popuphidden'));return node;};
  const popup=createPopup(window,{});t.after(()=>{popup.destroy();dom.window.close();});
  const invoker=window.document.querySelector('#invoker');invoker.focus();popup.show();
  const query=window.document.querySelector('[role=combobox]');assert.equal(window.document.activeElement,query);
  // A repeated shortcut closes and reopens without an intermediate focus restore.
  popup.close();popup.show();popup.close({restoreFocus:true});
  assert.equal(window.document.activeElement,invoker,'explicit close must restore the page invoker, never the hidden popup input');
});
