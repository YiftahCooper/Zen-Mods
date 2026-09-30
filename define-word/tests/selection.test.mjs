import test from 'node:test';
import assert from 'node:assert/strict';
import { createSelectionService } from '../src/selection.sys.mjs';

function fixture() {
  const registrations = new Set();
  const api = {registerWindowActor(name) {assert(!registrations.has(name)); registrations.add(name);},unregisterWindowActor(name) {registrations.delete(name);}};
  const top = {id:1}; top.top=top;
  const frame={id:2,top};
  for(const context of [top,frame]) context.currentWindowGlobal={innerWindowId:context.id*10,getActor(name){assert.equal(name,'DefineWord');return {sendQuery:async message=>{assert.equal(message,'DefineWord:GetSelection');return {rawText:context.id===2?'שלום':'old',contextId:context.id,innerWindowId:context.id*10,anchor:null};}};}};
  const window={gBrowser:{selectedBrowser:{browsingContext:top}}};
  const services={focus:{focusedContentBrowsingContext:frame}};
  const service=createSelectionService({chrome:api,services});
  return {service,window,top,frame,registrations,services};
}
test('context menu uses its invoking frame instead of focused unrelated selection',async()=>{
  const h=fixture(),owner=h.service.acquire(); h.services.focus.focusedContentBrowsingContext=h.top;
  const value=await owner.capture(h.window,{frameBrowsingContext:h.frame,selectionInfo:{text:'מחשב'},onPassword:false});
  assert.equal(value.rawText,'מחשב'); assert.equal(value.contextId,2); assert.deepEqual(Object.keys(value).sort(),['anchor','contextId','innerWindowId','rawText']);owner.release();
});
test('shortcut uses focused frame only within the selected tab',async()=>{
  const h=fixture(),owner=h.service.acquire(); assert.equal((await owner.capture(h.window)).rawText,'שלום');
  h.services.focus.focusedContentBrowsingContext={top:{id:999}};
  assert.equal(await owner.capture(h.window),null); owner.release();
});
test('password context menu never returns selected text',async()=>{
  const h=fixture(),owner=h.service.acquire(); assert.equal(await owner.capture(h.window,{onPassword:true,frameBrowsingContext:h.frame,selectionInfo:{text:'secret'}}),null);owner.release();
});
test('reply from a replaced document or released owner is discarded',async()=>{
  const h=fixture(),owner=h.service.acquire(); let resolve;
  h.frame.currentWindowGlobal.getActor=()=>({sendQuery:()=>new Promise(r=>resolve=r)});
  const pending=owner.capture(h.window); h.frame.currentWindowGlobal={innerWindowId:999};resolve({rawText:'stale',contextId:2,innerWindowId:20,anchor:null});assert.equal(await pending,null);
  owner.release();assert.equal(await owner.capture(h.window),null);
});
test('two owners release independently and registration exists once',()=>{
  const h=fixture(),a=h.service.acquire(),b=h.service.acquire(); assert.equal(h.registrations.size,1);a.release();a.release();assert.equal(h.registrations.size,1);b.release();assert.equal(h.registrations.size,0);
});

test('captured selection validity ends on frame replacement, top navigation, or release',async()=>{
  const h=fixture(),owner=h.service.acquire();
  const first=await owner.capture(h.window);assert(owner.isCurrent(h.window,first));
  h.frame.currentWindowGlobal={...h.frame.currentWindowGlobal,innerWindowId:21};assert(!owner.isCurrent(h.window,first));
  const second=await owner.capture(h.window,{frameBrowsingContext:h.frame,selectionInfo:{text:'word'}});assert(owner.isCurrent(h.window,second));
  h.top.currentWindowGlobal={...h.top.currentWindowGlobal,innerWindowId:11};assert(!owner.isCurrent(h.window,second));
  const third=await owner.capture(h.window,{frameBrowsingContext:h.frame,selectionInfo:{text:'word'}});owner.release();assert(!owner.isCurrent(h.window,third));
});
