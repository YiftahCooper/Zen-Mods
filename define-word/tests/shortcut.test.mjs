import test from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';
import {createShortcut} from '../src/shortcut.mjs';
const binding={code:'KeyD',ctrl:true,alt:true,shift:false,meta:false};
test('physical key works with Hebrew layout but never consumes AltGraph or composition',()=>{
  const dom=new JSDOM(''),w=dom.window;let invoked=0;const key=createShortcut(w,{binding,onInvoke:()=>invoked++,onConflict(){}});
  w.dispatchEvent(new w.KeyboardEvent('keydown',{code:'KeyD',key:'ג',ctrlKey:true,altKey:true,cancelable:true}));assert.equal(invoked,1);
  const event=new w.KeyboardEvent('keydown',{code:'KeyD',ctrlKey:true,altKey:true});event.getModifierState=name=>name==='AltGraph';w.dispatchEvent(event);assert.equal(invoked,1);
  w.dispatchEvent(new w.KeyboardEvent('keydown',{code:'KeyD',ctrlKey:true,altKey:true,isComposing:true}));assert.equal(invoked,1);key.destroy();dom.window.close();
});
test('changing or disabling shortcut releases old binding',()=>{
  const dom=new JSDOM(''),w=dom.window;let count=0;const key=createShortcut(w,{binding,onInvoke:()=>count++,onConflict(){}});
  key.update({...binding,code:'KeyF'});w.dispatchEvent(new w.KeyboardEvent('keydown',{code:'KeyD',ctrlKey:true,altKey:true}));assert.equal(count,0);
  w.dispatchEvent(new w.KeyboardEvent('keydown',{code:'KeyF',ctrlKey:true,altKey:true}));assert.equal(count,1);key.update(null);w.dispatchEvent(new w.KeyboardEvent('keydown',{code:'KeyF',ctrlKey:true,altKey:true}));assert.equal(count,1);key.destroy();dom.window.close();
});
test('native shortcut conflict leaves mod shortcut inactive',()=>{
  const dom=new JSDOM('<key id="existing" key="d" modifiers="control,alt"></key>'),w=dom.window;let count=0,conflict;
  const key=createShortcut(w,{binding,onInvoke:()=>count++,onConflict:v=>conflict=v});w.dispatchEvent(new w.KeyboardEvent('keydown',{code:'KeyD',ctrlKey:true,altKey:true}));assert.equal(count,0);assert.match(conflict,/existing/);key.destroy();dom.window.close();
});
