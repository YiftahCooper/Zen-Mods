import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createPopup} from '../src/popup.mjs';
function fixture(){
  const dom=new JSDOM(''),w=dom.window,sizes=[];w.gBrowser={selectedBrowser:w.document.body};
  Object.defineProperty(w,'innerWidth',{value:1000,writable:true});Object.defineProperty(w,'innerHeight',{value:800,writable:true});
  w.document.createXULElement=t=>{const n=w.document.createElement(t);n.openPopup=()=>{};n.hidePopup=()=>n.dispatchEvent(new w.Event('popuphidden'));n.style.border='1px solid';n.sizeTo=(width,height)=>{sizes.push({width,height});n.style.width=`${width}px`;n.style.height=`${height}px`;};return n;};
  const popup=createPopup(w,{onClose(){popup.close();}}),shell=w.document.querySelector('.dw-shell'),panel=w.document.querySelector('panel');
  if(shell)shell.getBoundingClientRect=()=>({left:50,top:70,width:parseFloat(shell.style.width)||480,height:parseFloat(shell.style.height)||300});
  panel.getBoundingClientRect=()=>shell?{...shell.getBoundingClientRect(),width:shell.getBoundingClientRect().width+2,height:shell.getBoundingClientRect().height+2}:{left:50,top:70,width:482,height:302};
  const pointer=(target,type,x,y)=>target.dispatchEvent(new w.MouseEvent(type,{clientX:x,clientY:y,button:0,bubbles:true,cancelable:true}));
  popup.show();return {w,dom,popup,shell,panel,sizes,pointer,handle:w.document.querySelector('[data-resize]'),close(){popup.destroy();dom.window.close();}};
}
test('corner resize changes both dimensions, clamps to viewport, and stops on release',t=>{const h=fixture();t.after(()=>h.close());assert(h.handle);h.pointer(h.handle,'pointerdown',530,370);h.pointer(h.w,'pointermove',650,450);assert.equal(h.shell.style.width,'600px');assert.equal(h.shell.style.height,'380px');assert.equal(h.panel.getBoundingClientRect().width,602);assert.equal(h.panel.getBoundingClientRect().height,382);h.pointer(h.w,'pointermove',5000,5000);assert.equal(h.shell.style.width,'936px');assert.equal(h.shell.style.height,'716px');h.pointer(h.w,'pointerup',5000,5000);const count=h.sizes.length;h.pointer(h.w,'pointermove',550,390);assert.equal(h.sizes.length,count);});
test('resize handle supports arrows and Home reset without changing popup text size',t=>{const h=fixture();t.after(()=>h.close());assert(h.handle);h.popup.setTextSize(24);h.handle.dispatchEvent(new h.w.KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true}));assert.equal(h.shell.style.width,'500px');h.handle.dispatchEvent(new h.w.KeyboardEvent('keydown',{key:'ArrowDown',shiftKey:true,bubbles:true,cancelable:true}));assert.equal(h.shell.style.height,'350px');assert.equal(h.w.document.querySelector('.dw-shell').style.getPropertyValue('--dw-text-size'),'24px');h.handle.dispatchEvent(new h.w.KeyboardEvent('keydown',{key:'Home',bubbles:true,cancelable:true}));assert.equal(h.shell.style.width,'');assert.equal(h.shell.style.height,'');assert.equal(h.panel.style.width,'');assert.equal(h.panel.style.height,'');assert(!h.shell.hasAttribute('data-resized'));});
test('closing or destroying during drag releases resize listeners and preserves reusable size',t=>{const h=fixture();t.after(()=>h.close());assert(h.handle);h.pointer(h.handle,'pointerdown',530,370);h.pointer(h.w,'pointermove',570,400);h.popup.close();const count=h.sizes.length;h.pointer(h.w,'pointermove',700,700);assert.equal(h.sizes.length,count);h.popup.show();assert.equal(h.shell.style.width,'520px');const restoredCount=h.sizes.length;h.pointer(h.handle,'pointerdown',570,400);h.popup.destroy();h.pointer(h.w,'pointermove',700,700);assert.equal(h.sizes.length,restoredCount);});
test('a smaller browser window clamps the chosen size and removes no other UI',t=>{const h=fixture();t.after(()=>h.close());assert(h.handle);h.handle.dispatchEvent(new h.w.KeyboardEvent('keydown',{key:'ArrowRight'}));h.w.innerWidth=420;h.w.innerHeight=340;h.w.dispatchEvent(new h.w.Event('resize'));assert.equal(h.shell.style.width,'356px');assert.equal(h.shell.style.height,'256px');assert(h.panel.isConnected);});
test('window resizes do no layout work while the popup is closed, and reopening uses the current viewport',async t=>{
  const {createPopupResizer}=await import('../src/resize.mjs');
  const dom=new JSDOM('<div id="panel"><div id="shell"></div><button></button></div>'),w=dom.window;t.after(()=>dom.window.close());
  const panel=w.document.querySelector('#panel'),shell=w.document.querySelector('#shell'),handle=w.document.querySelector('button');
  Object.defineProperties(w,{innerWidth:{value:1000,writable:true},innerHeight:{value:800,writable:true}});
  let open=false,measured=0;const style=w.getComputedStyle.bind(w);
  shell.getBoundingClientRect=()=>{measured++;return {left:40,top:40,width:480,height:300};};w.getComputedStyle=node=>{measured++;return style(node);};
  const resizer=createPopupResizer(w,{panel,shell,handle,isOpen:()=>open});t.after(()=>resizer.destroy());
  resizer.prepare({y:600,height:20});open=true;assert.equal(shell.style.maxHeight,"580px");open=false;measured=0;const limit=shell.style.maxHeight;
  w.innerHeight=500;w.dispatchEvent(new w.Event('resize'));
  assert.equal(measured,0,'a closed popup must not force style or layout flushes');assert.equal(shell.style.maxHeight,limit);
  resizer.prepare({y:600,height:20});open=true;
  assert.equal(shell.style.maxHeight,'468px','reopening applies the shrunken viewport limit');
  w.innerHeight=400;w.dispatchEvent(new w.Event('resize'));assert.equal(shell.style.maxHeight,'368px','an open popup still follows window resizes');
});
