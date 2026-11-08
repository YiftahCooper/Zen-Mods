import test from 'node:test';
import assert from 'node:assert/strict';
import { createSelectionService, ACTOR_NAME } from '../src/selection.sys.mjs';

function fixture() {
  const registrations = new Set();
  const api = {registerWindowActor(name) {assert(!registrations.has(name)); registrations.add(name);},unregisterWindowActor(name) {registrations.delete(name);}};
  const top = {id:1}; top.top=top;
  const frame={id:2,top};
  for(const context of [top,frame]) context.currentWindowGlobal={innerWindowId:context.id*10,getActor(name){assert.equal(name,ACTOR_NAME);return {sendQuery:async message=>{assert.equal(message,'DefineWord:GetSelection');return {rawText:context.id===2?'שלום':'old',contextId:context.id,innerWindowId:context.id*10,anchor:null};}};}};
  const window={gBrowser:{selectedBrowser:{browsingContext:top}},setTimeout,clearTimeout};
  const services={focus:{focusedContentBrowsingContext:frame}};
  const service=createSelectionService({chrome:api,services});
  return {service,window,top,frame,registrations,services};
}
test('context menu uses its invoking frame instead of focused unrelated selection',async()=>{
  const h=fixture(),owner=h.service.acquire(); h.services.focus.focusedContentBrowsingContext=h.top;
  const value=await owner.capture(h.window,{frameBrowsingContext:h.frame,selectionInfo:{text:'מחשב'},onPassword:false});
  assert.equal(value.rawText,'מחשב'); assert.equal(value.contextId,2); assert.deepEqual(Object.keys(value).sort(),['anchor','contextId','innerWindowId','rawText']);owner.release();
});

test('shortcut and matching context menu retain a validated screen CSS anchor',async()=>{
  const h=fixture(),owner=h.service.acquire();
  h.frame.currentWindowGlobal.getActor=()=>({sendQuery:async()=>({rawText:'שלום',contextId:2,innerWindowId:20,anchor:{x:-120,y:210,width:50,height:18,extra:'discard'}})});
  for(const menu of [undefined,{frameBrowsingContext:h.frame,selectionInfo:{text:'שלום'}}]) {
    const value=await owner.capture(h.window,menu);
    assert.deepEqual(value.anchor,{x:-120,y:210,width:50,height:18});
  }
  owner.release();
});

test('context menu keeps cached text when geometry is stale, mismatched, unavailable, or malformed',async()=>{
  const h=fixture(),owner=h.service.acquire(),menu={frameBrowsingContext:h.frame,selectionInfo:{text:'cached'}};
  const base={rawText:'cached',contextId:2,innerWindowId:20,anchor:{x:10,y:20,width:50,height:18}};
  for(const reply of [null,{...base,rawText:'other'},{...base,innerWindowId:21},{...base,contextId:3},{...base,anchor:{x:Infinity,y:0,width:1,height:1}}]) {
    h.frame.currentWindowGlobal.getActor=()=>({sendQuery:async()=>reply});
    const value=await owner.capture(h.window,menu);
    assert.equal(value.rawText,'cached');assert.equal(value.anchor,null);
  }
  h.frame.currentWindowGlobal.getActor=()=>{throw new Error('actor unavailable');};
  assert.equal((await owner.capture(h.window,menu)).rawText,'cached');owner.release();
});

test('context menu geometry query times out without losing cached text',async()=>{
  const h=fixture(),owner=h.service.acquire();let expire,cleared=false;
  h.window.setTimeout=callback=>{expire=callback;return 7;};h.window.clearTimeout=id=>{assert.equal(id,7);cleared=true;};
  h.frame.currentWindowGlobal.getActor=()=>({sendQuery:()=>new Promise(()=>{})});
  const pending=owner.capture(h.window,{frameBrowsingContext:h.frame,selectionInfo:{text:'cached'}});
  assert.equal(typeof expire,'function');expire();
  const value=await pending;assert.equal(value.rawText,'cached');assert.equal(value.anchor,null);assert(cleared);owner.release();
});

test('context menu retains invocation point when actor geometry is unavailable',async()=>{
  const h=fixture(),owner=h.service.acquire();
  h.frame.currentWindowGlobal.getActor=()=>{throw new Error('old actor');};
  const value=await owner.capture(h.window,{frameBrowsingContext:h.frame,selectionInfo:{text:'cached'},anchor:{x:700,y:400,width:1,height:1}});
  assert.deepEqual(value.anchor,{x:700,y:400,width:1,height:1});owner.release();
});

test('navigation or owner release while context-menu geometry is pending invalidates capture',async()=>{
  for(const invalidate of [h=>h.frame.currentWindowGlobal={},h=>h.top.currentWindowGlobal={},h=>h.window.gBrowser.selectedBrowser={},(_h,owner)=>owner.release()]) {
    const h=fixture(),owner=h.service.acquire();let resolve;
    h.frame.currentWindowGlobal.getActor=()=>({sendQuery:()=>new Promise(r=>resolve=r)});
    const pending=owner.capture(h.window,{frameBrowsingContext:h.frame,selectionInfo:{text:'cached'}});
    invalidate(h,owner);resolve({rawText:'cached',contextId:2,innerWindowId:20,anchor:{x:10,y:20,width:50,height:18}});
    assert.equal(await pending,null);owner.release();
  }
});

test('untrusted shortcut geometry cannot contain nonfinite, huge, negative-size, or zero-area rectangles',async()=>{
  const h=fixture(),owner=h.service.acquire();
  for(const anchor of [null,{}, {x:NaN,y:0,width:2,height:2},{x:1e9,y:0,width:2,height:2},{x:0,y:0,width:-1,height:2},{x:0,y:0,width:2,height:0},{x:0,y:'20',width:2,height:2}]) {
    h.frame.currentWindowGlobal.getActor=()=>({sendQuery:async()=>({rawText:'word',contextId:2,innerWindowId:20,anchor})});
    const value=await owner.capture(h.window);assert.equal(value.rawText,'word');assert.equal(value.anchor,null);
  }
  owner.release();
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

test('updated actor coexists with old windows retaining an earlier registration',()=>{
  const h=fixture();h.registrations.add('DefineWord');
  const owner=h.service.acquire();assert.notEqual(ACTOR_NAME,'DefineWord');assert.equal(h.registrations.size,2);
  owner.release();assert.deepEqual([...h.registrations],['DefineWord']);
});

test('captured selection validity ends on frame replacement, top navigation, or release',async()=>{
  const h=fixture(),owner=h.service.acquire();
  const first=await owner.capture(h.window);assert(owner.isCurrent(h.window,first));
  h.frame.currentWindowGlobal={...h.frame.currentWindowGlobal,innerWindowId:21};assert(!owner.isCurrent(h.window,first));
  const second=await owner.capture(h.window,{frameBrowsingContext:h.frame,selectionInfo:{text:'word'}});assert(owner.isCurrent(h.window,second));
  h.top.currentWindowGlobal={...h.top.currentWindowGlobal,innerWindowId:11};assert(!owner.isCurrent(h.window,second));
  const third=await owner.capture(h.window,{frameBrowsingContext:h.frame,selectionInfo:{text:'word'}});owner.release();assert(!owner.isCurrent(h.window,third));
});

test('selection actor remains available to isolated web and file content under Gecko actor safety enforcement',async()=>{
  // Gecko's JSActorOptions defaults safeForUntrustedWebProcess to false.
  // Model that boundary here; the native acceptance test exercises real Gecko.
  let options;
  const top={id:1};top.top=top;
  top.currentWindowGlobal={innerWindowId:10,getActor(){
    if(options?.safeForUntrustedWebProcess!==true)throw new Error('Window protocol does not match untrusted web remote type');
    return {sendQuery:async()=>({rawText:'computer',contextId:1,innerWindowId:10,anchor:{x:10,y:20,width:90,height:24}})};
  }};
  const service=createSelectionService({chrome:{registerWindowActor(_name,value){options=value;},unregisterWindowActor(){}},services:{focus:{focusedContentBrowsingContext:top}}});
  const owner=service.acquire();
  try{
    const result=await owner.capture({gBrowser:{selectedBrowser:{browsingContext:top}},setTimeout,clearTimeout});
    assert.equal(result?.rawText,'computer','native selected text must remain available when Gecko enforces actor safety');
    assert.deepEqual(result.anchor,{x:10,y:20,width:90,height:24});
  }finally{owner.release();}
});

test('earlier release actors stay while older code runs and are unregistered once none does',async()=>{
  const selection=await import('../src/selection.sys.mjs');
  const registrations=new Set(['DefineWordV031','DefineWord','DefineWordV9_9_9']),options=[];let older=true;
  const chrome={registerWindowActor(name,value){assert(!registrations.has(name));registrations.add(name);options.push(value);},unregisterWindowActor(name){if(!registrations.delete(name))throw new Error('not registered');}};
  const registered=new Set(['DefineWordV9_9_9']);
  const service=selection.createSelectionService({chrome,services:{},registered,olderCode:()=>older});
  const first=service.acquire();
  assert.deepEqual([...registrations].sort(),['DefineWord','DefineWordV031','DefineWordV9_9_9',selection.ACTOR_NAME].sort(),'a window still running older code keeps its actor');
  older=false;const second=service.acquire();
  assert.deepEqual([...registrations],[selection.ACTOR_NAME],'older actor names are unregistered once no window runs older code');
  assert.deepEqual([...registered],[selection.ACTOR_NAME]);assert.equal(options.length,1);
  first.release();second.release();assert.equal(registrations.size,0);assert.equal(registered.size,0);
});

test('older code detection reads each browser window owner version',async()=>{
  const {olderCodeRunning,VERSION}=await import('../src/selection.sys.mjs');
  const services=windows=>({wm:{getEnumerator(type){assert.equal(type,'navigator:browser');return windows[Symbol.iterator]();}}});
  assert.equal(olderCodeRunning(services([{__defineWord:{version:VERSION}},{}])),false,'current owners and windows still loading are not older code');
  assert.equal(olderCodeRunning(services([{__defineWord:{version:VERSION}},{__defineWord:{unload(){}}}])),true,'0.3.4 and earlier owners carry no version');
  assert.equal(olderCodeRunning(services([{__defineWord:{version:'0.3.4'}}])),true);
  assert.equal(olderCodeRunning({wm:{getEnumerator(){throw new Error('unavailable');}}}),true,'unknown window state keeps older actors');
});
