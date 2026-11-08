import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createPopup} from '../src/popup.mjs';

function fixture(saved=null){
  const dom=new JSDOM('<div id="page"></div>'),w=dom.window,opened=[],moved=[],writes=[];
  Object.defineProperties(w,{innerWidth:{value:1000,writable:true},innerHeight:{value:800,writable:true},mozInnerScreenX:{value:100},mozInnerScreenY:{value:200}});
  w.gBrowser={selectedBrowser:w.document.querySelector('#page')};
  w.gBrowser.selectedBrowser.getBoundingClientRect=()=>({x:0,y:60,left:0,top:60,width:1000,height:740});
  let screenX=100,screenY=260;
  w.document.createXULElement=tag=>{const n=w.document.createElement(tag);
    n.openPopup=()=>opened.push('fallback');n.openPopupAtScreen=(x,y)=>{opened.push({x,y});screenX=x;screenY=y;n.dispatchEvent(new w.Event('popupshown'));};
    n.moveTo=(x,y)=>{moved.push({x,y});screenX=x;screenY=y;};n.sizeTo=()=>{};
    n.hidePopup=()=>n.dispatchEvent(new w.Event('popuphidden'));
    n.getOuterScreenRect=()=>({x:screenX,y:screenY,width:parseFloat(w.document.querySelector('.dw-shell')?.style.width)||480,height:parseFloat(w.document.querySelector('.dw-shell')?.style.height)||300});
    return n;};
  const popup=createPopup(w,{onClose(){popup.close();},readSize:()=>saved,onSizeChange:s=>{saved=s;writes.push(s);}});
  const shell=w.document.querySelector('.dw-shell'),panel=w.document.querySelector('panel');
  shell.getBoundingClientRect=()=>({x:screenX-100,y:screenY-200,left:screenX-100,top:screenY-200,width:parseFloat(shell.style.width)||480,height:parseFloat(shell.style.height)||300});
  panel.getBoundingClientRect=shell.getBoundingClientRect;
  const pointer=(target,type,x,y,pointerId)=>{const event=new w.MouseEvent(type,{button:0,bubbles:true,cancelable:true,clientX:x-100,clientY:y-200,screenX:x,screenY:y});if(pointerId!==undefined)Object.defineProperty(event,'pointerId',{value:pointerId});target.dispatchEvent(event);};
  return {dom,w,popup,shell,panel,opened,moved,writes,pointer,close(){popup.destroy();dom.window.close();}};
}

test('popup opens centered below selection and flips above near the bottom',t=>{
  const h=fixture();t.after(()=>h.close());h.popup.show({x:580,y:400,width:40,height:20});
  assert.deepEqual(h.moved.at(-1)||h.opened.at(-1),{x:360,y:428});
  h.popup.close();h.popup.show({x:1030,y:930,width:40,height:20});
  assert.deepEqual(h.moved.at(-1)||h.opened.at(-1),{x:608,y:622});
});
test('large remembered size is constrained to space beside the selection vertically',t=>{
  const h=fixture({width:640,height:700});t.after(()=>h.close());h.popup.show({x:580,y:600,width:40,height:20});
  const rect=h.panel.getOuterScreenRect();
  assert(rect.y+rect.height<=592||rect.y>=628,'popup must not cover selected word');
});
test('header drag moves only popup, ignores controls, clamps, and ends on dismissal',t=>{
  const h=fixture();t.after(()=>h.close());h.popup.show({x:580,y:400,width:40,height:20});
  const header=h.w.document.querySelector('.dw-bar');h.pointer(header,'pointerdown',400,450);h.pointer(h.w,'pointermove',500,500);
  assert.deepEqual(h.moved.at(-1),{x:460,y:478});h.pointer(h.w,'pointerup',500,500);
  const count=h.moved.length;h.pointer(header.querySelector('select'),'pointerdown',500,500);h.pointer(h.w,'pointermove',700,700);assert.equal(h.moved.length,count);
  h.pointer(header,'pointerdown',500,500);h.popup.close();h.pointer(h.w,'pointermove',900,900);assert.equal(h.moved.length,count);
});
test('remembered size restores in a fresh popup; resizing saves and Home clears it',t=>{
  const h=fixture({width:640,height:400});t.after(()=>h.close());h.popup.show({x:580,y:400,width:40,height:20});
  assert.equal(h.shell.style.width,'640px');assert.equal(h.shell.style.height,'400px');
  const handle=h.w.document.querySelector('[data-resize]');assert.equal(handle.textContent,'');
  handle.dispatchEvent(new h.w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));assert.equal(h.writes.at(-1).width,660);
  handle.dispatchEvent(new h.w.KeyboardEvent('keydown',{key:'Home',bubbles:true}));assert.equal(h.writes.at(-1),null);
});

test('remembered short dimensions restore without enforcing an untouched resize minimum',t=>{
  const h=fixture({width:500,height:160});t.after(()=>h.close());h.popup.show({x:580,y:400,width:40,height:20});
  assert.equal(h.shell.style.width,'500px');assert.equal(h.shell.style.height,'160px');
});
test('invalid saved dimensions are ignored and new selections reset dragged position',t=>{
  const h=fixture({width:Infinity,height:-20});t.after(()=>h.close());h.popup.show({x:580,y:400,width:40,height:20});assert.equal(h.shell.style.width,'');
  h.pointer(h.w.document.querySelector('.dw-bar'),'pointerdown',400,450);h.pointer(h.w,'pointermove',500,500);h.pointer(h.w,'pointerup',500,500);
  h.popup.close();h.popup.show({x:580,y:400,width:40,height:20});assert.deepEqual(h.moved.at(-1)||h.opened.at(-1),{x:360,y:428});
});

test('header supports native mouse events when pointer events are not delivered',t=>{
  const h=fixture();t.after(()=>h.close());h.popup.show({x:580,y:400,width:40,height:20});
  const header=h.w.document.querySelector('.dw-bar');h.pointer(header,'mousedown',400,450);h.pointer(h.w,'mousemove',500,500);
  assert.deepEqual(h.moved.at(-1),{x:460,y:478});h.pointer(h.w,'mouseup',500,500);
});

test('all edges and corners resize with opposite edges fixed and save dimensions',t=>{
  const h=fixture();t.after(()=>h.close());h.popup.show({x:580,y:400,width:40,height:20});
  assert.equal(h.w.document.querySelectorAll('[data-resize-edge]').length,8);
  const nw=h.w.document.querySelector('[data-resize-edge="nw"]');
  h.pointer(nw,'pointerdown',360,428);h.pointer(h.w,'pointermove',320,398);h.pointer(h.w,'pointerup',320,398);
  assert.deepEqual(h.writes.at(-1),{width:520,height:330});
  assert.deepEqual(h.moved.at(-1),{x:320,y:398});
});

test('every resize direction changes only its intended dimensions and leaves header movement usable',()=>{
  for(const edge of ['n','s','e','w','ne','nw','se','sw']){
    const h=fixture();try{
      h.popup.show({x:580,y:400,width:40,height:20});
      const target=h.w.document.querySelector(`[data-resize-edge="${edge}"]`);
      h.pointer(target,'mousedown',500,500);h.pointer(h.w,'mousemove',520,510);h.pointer(h.w,'mouseup',520,510);
      assert.deepEqual(h.writes.at(-1),{width:480+(edge.includes('e')?20:edge.includes('w')?-20:0),height:300+(edge.includes('s')?10:edge.includes('n')?-10:0)},edge);
      const before=h.moved.at(-1);h.pointer(h.w.document.querySelector('.dw-bar'),'mousedown',500,500);h.pointer(h.w,'mousemove',510,510);h.pointer(h.w,'mouseup',510,510);
      assert.deepEqual(h.moved.at(-1),{x:before.x+10,y:before.y+10});
    }finally{h.close();}
  }
});

test('all resize edges stop at viewport boundaries and preserve their opposite edge',()=>{
  const cases=[
    {edge:'e',dx:5000,dy:0,width:728,height:300,x:360,y:428},
    {edge:'w',dx:-5000,dy:0,width:728,height:300,x:112,y:428},
    {edge:'n',dx:0,dy:-5000,width:480,height:516,x:360,y:212},
    {edge:'s',dx:0,dy:5000,width:480,height:560,x:360,y:428},
    {edge:'ne',dx:5000,dy:-5000,width:728,height:516,x:360,y:212},
    {edge:'nw',dx:-5000,dy:-5000,width:728,height:516,x:112,y:212},
    {edge:'se',dx:5000,dy:5000,width:728,height:560,x:360,y:428},
    {edge:'sw',dx:-5000,dy:5000,width:728,height:560,x:112,y:428},
  ];
  for(const c of cases){const h=fixture();try{
    h.popup.show({x:580,y:400,width:40,height:20});
    h.pointer(h.w.document.querySelector(`[data-resize-edge="${c.edge}"]`),'mousedown',500,500);
    h.pointer(h.w,'mousemove',500+c.dx,500+c.dy);h.pointer(h.w,'mouseup',500+c.dx,500+c.dy);
    assert.deepEqual(h.writes.at(-1),{width:c.width,height:c.height},c.edge);
    assert.deepEqual(h.moved.at(-1),{x:c.x,y:c.y},c.edge);
  }finally{h.close();}}
});

test('all resize edges respect user minimums and preserve their opposite edge',()=>{
  const cases=[
    {edge:'e',dx:-5000,dy:0,width:320,height:300,x:360,y:428},
    {edge:'w',dx:5000,dy:0,width:320,height:300,x:520,y:428},
    {edge:'n',dx:0,dy:5000,width:480,height:200,x:360,y:528},
    {edge:'s',dx:0,dy:-5000,width:480,height:200,x:360,y:428},
    {edge:'ne',dx:-5000,dy:5000,width:320,height:200,x:360,y:528},
    {edge:'nw',dx:5000,dy:5000,width:320,height:200,x:520,y:528},
    {edge:'se',dx:-5000,dy:-5000,width:320,height:200,x:360,y:428},
    {edge:'sw',dx:5000,dy:-5000,width:320,height:200,x:520,y:428},
  ];
  for(const c of cases){const h=fixture();try{
    h.popup.show({x:580,y:400,width:40,height:20});
    h.pointer(h.w.document.querySelector(`[data-resize-edge="${c.edge}"]`),'mousedown',500,500);
    h.pointer(h.w,'mousemove',500+c.dx,500+c.dy);h.pointer(h.w,'mouseup',500+c.dx,500+c.dy);
    assert.deepEqual(h.writes.at(-1),{width:c.width,height:c.height},c.edge);
    assert.deepEqual(h.moved.at(-1),{x:c.x,y:c.y},c.edge);
  }finally{h.close();}}
});

test('a foreign pointer release cannot end an active resize',t=>{
  const h=fixture();t.after(()=>h.close());h.popup.show({x:580,y:400,width:40,height:20});
  h.pointer(h.w.document.querySelector('[data-resize-edge="se"]'),'pointerdown',500,500,7);
  h.pointer(h.w,'pointermove',700,700,8);h.pointer(h.w,'pointerup',700,700,8);
  h.pointer(h.w,'pointermove',520,510,7);h.pointer(h.w,'pointerup',520,510,7);
  assert.deepEqual(h.writes.at(-1),{width:500,height:310});
});

test('a foreign pointer release cannot end an active header drag',t=>{
  const h=fixture();t.after(()=>h.close());h.popup.show({x:580,y:400,width:40,height:20});
  h.pointer(h.w.document.querySelector('.dw-bar'),'pointerdown',400,450,7);
  h.pointer(h.w,'pointermove',700,700,8);h.pointer(h.w,'pointerup',700,700,8);
  h.pointer(h.w,'pointermove',500,500,7);h.pointer(h.w,'pointerup',500,500,7);
  assert.deepEqual(h.moved.at(-1),{x:460,y:478});
});

test('placement uses the current shell when native widget bounds lag a window resize',async()=>{
  const {createPopupPositioner}=await import('../src/position.mjs');
  const dom=new JSDOM('<div id="panel" style="border:1px solid"><div id="shell"></div><header></header></div>'),w=dom.window;
  const panel=w.document.querySelector('#panel'),shell=w.document.querySelector('#shell'),header=w.document.querySelector('header'),positions=[];
  Object.defineProperties(w,{innerWidth:{value:740},innerHeight:{value:600},mozInnerScreenX:{value:4},mozInnerScreenY:{value:4}});
  // Real Gecko updates constrained HTML layout before its retained popup widget.
  shell.getBoundingClientRect=()=>({width:692,height:276});
  panel.getOuterScreenRect=()=>({x:16,y:16,width:902,height:673});
  panel.openPopupAtScreen=(x,y)=>positions.push({x,y});panel.moveTo=(x,y)=>positions.push({x,y});
  const positioner=createPopupPositioner(w,{panel,shell,header,isOpen:()=>true});
  try{
    positioner.open({x:586,y:282,width:96,height:24});
    assert.deepEqual(positions.at(-1),{x:38,y:314},'current 694×278 outer size fits below the selection');
  }finally{positioner.destroy();w.close();}
});
