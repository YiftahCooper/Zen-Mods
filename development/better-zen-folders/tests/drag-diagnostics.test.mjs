import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import * as api from '../scripts/better-zen-folders.uc.mjs';
import {DropNode,makeFolderEndDropFixture} from './folder-end-drop.fixture.mjs';

function preferences(enabled=true) {
  const values={dragDiagnosticsEnabled:enabled,dragDestinationDelayMs:300,commandIconMode:'mod'};
  const listeners=new Map();
  return {get:key=>values[key],subscribe(key,fn){const set=listeners.get(key)??new Set();set.add(fn);listeners.set(key,set);return()=>set.delete(fn);},
    set(key,value){values[key]=value;for(const fn of listeners.get(key)??[])fn(value);},
    count:()=>[...listeners.values()].reduce((n,set)=>n+set.size,0)};
}
function setup(t,enabled=true) {
  const f=makeFolderEndDropFixture(api,{install:false}),prefs=preferences(enabled);
  const adapters=api.createBrowserFolderEndDropAdapters(f.host,{projection:f.projection},prefs);
  f.manager=new api.FolderEndDropManager(adapters);f.manager.start();
  Object.assign(f,{prefs,adapters,recorder:adapters.diagnostics});
  t.after(()=>f.manager.destroy());return f;
}
const enter=f=>f.emit('dragover',f.last,{clientX:11,clientY:225});
const entries=f=>f.recorder.snapshot().entries;
const containsReasons=(entry,want)=>want.every(reason=>entry.reasons.includes(reason));

test('opt-in recorder bounds primitive records, counts truncation, and returns detached snapshots',()=>{
  const prefs=preferences(),r=new api.DragDiagnosticRecorder({preferences:prefs,capacity:3,now:()=>5});r.start();
  for(let i=0;i<5;i++)r.record('capture',{x:i,reasons:['outside_viewport']});
  const snapshot=r.snapshot();assert.equal(snapshot.entries.length,3);assert.equal(snapshot.truncated,2);
  snapshot.entries[0].reasons.push('mutated');snapshot.entries[0].x=900;
  assert.equal(r.snapshot().entries[0].x,2);assert.deepEqual(r.snapshot().entries[0].reasons,['outside_viewport']);
  r.destroy();assert.equal(prefs.count(),0);assert.equal(r.snapshot().entries.length,0);
});
test('recorder drops arbitrary fields, raw strings, errors, node objects and non-finite numbers',()=>{
  const r=new api.DragDiagnosticRecorder({preferences:preferences()});r.start();
  const privateNode={title:'PRIVATE_TITLE',url:'https://private.invalid',id:'PRIVATE_ID'};
  const token=r.token(privateNode);assert.equal(typeof token,'number');assert.equal(r.token(privateNode),token);
  r.record('capture',{source:token,target:privateNode,x:Infinity,phase:'PRIVATE_TITLE',reasons:['outside_viewport','PRIVATE_TITLE'],
    url:'https://private.invalid',error:new Error('C:/private/profile'),dataTransfer:privateNode});
  r.record('PRIVATE_TITLE',{x:1});
  const out=JSON.stringify(r.snapshot());assert.doesNotMatch(out,/PRIVATE|https:|profile|Infinity/);
  assert.equal(r.snapshot().entries.length,1);r.destroy();
});
test('disabled recorder does no sampling, opt-in resets and disable clears across attempts',()=>{
  const prefs=preferences(false);let clocks=0;
  const r=new api.DragDiagnosticRecorder({preferences:prefs,now:()=>++clocks});r.start();
  r.record('capture',{x:1});assert.equal(r.token({}),null);assert.equal(clocks,0);assert.equal(r.snapshot().entries.length,0);
  prefs.set('dragDiagnosticsEnabled',true);r.record('capture',{x:2});assert.ok(r.snapshot().entries.length);
  prefs.set('dragDiagnosticsEnabled',false);assert.equal(r.snapshot().entries.length,0);
  prefs.set('dragDiagnosticsEnabled',true);assert.equal(r.snapshot().entries.length,0);r.destroy();
});
test('one attempt retains independent transfer, target, geometry and suspension failures together',t=>{
  const f=setup(t);f.emit('dragstart');enter(f);f.advance(100);
  // The blank separator is a valid surface (geometry can still be outside).
  // Use the regular area to exercise an independently invalid target too.
  f.emit('dragover',f.normal,{clientX:999,clientY:999,dataTransfer:{types:[],dropEffect:'copy',mozItemCount:1}});
  const records=entries(f);assert.ok(records.some(e=>containsReasons(e,['outside_viewport','outside_trigger','target_outside_root'])));
  assert.ok(records.some(e=>e.type==='acceptance'&&e.reasons.includes('mime_missing')));
  assert.ok(records.some(e=>e.type==='suspend'));assert.ok(records.some(e=>e.type==='dwell-cancel'));
  assert.equal(new Set(records.filter(e=>e.attempt>0).map(e=>e.attempt)).size,1);
});
test('capture, post-native, timer and several attempts survive native end and cleanup',t=>{
  const f=setup(t);
  for(let i=0;i<2;i++){f.emit('dragstart');enter(f);f.advance(300);f.emit('dragend');}
  const records=entries(f);assert.ok(records.some(e=>e.type==='capture'));assert.ok(records.some(e=>e.type==='postnative'));
  assert.ok(records.some(e=>e.type==='dwell-start'));assert.ok(records.some(e=>e.type==='dwell-expiry'));
  assert.equal(records.filter(e=>e.type==='chooser-show').length,2);assert.equal(records.filter(e=>e.type==='dragend').length,2);
  assert.deepEqual([...new Set(records.filter(e=>e.attempt>0).map(e=>e.attempt))],[1,2]);
  const capture=records.find(e=>e.type==='capture'&&e.eventType==='dragover');
  assert.ok(records.some(e=>e.type==='postnative'&&e.event===capture.event));
});
test('post-native eligible hover resumes a capture-suspended drag and waits the full configured delay',t=>{
  const f=setup(t);f.emit('dragstart');f.last.rect.top=240;
  f.prefs.set('dragDestinationDelayMs',600);
  const event={type:'dragover',target:f.last,clientX:11,clientY:225,dataTransfer:{types:['application/x-moz-tabbrowser-tab'],dropEffect:'move',mozItemCount:1,mozGetDataAt:()=>f.source}};
  f.manager.beforeDragOver(event);assert.equal(f.manager.suspended,true);
  f.last.rect.top=200;event.defaultPrevented=true;f.manager.afterNativeDragOver(event);
  f.advance(599);assert.equal(f.rows().length,0);
  f.advance(1);assert.equal(f.rows().length,3);
  assert.ok(entries(f).some(e=>e.type==='dwell-start'&&!e.suspended));
  f.emit('dragend');f.emit('dragstart');enter(f);f.advance(600);assert.equal(f.rows().length,3);
});

test('post-native hover does not resume an outside, rejected or cancelled drag',t=>{
  for(const reason of ['outside','rejected','cancelled']) {
    const f=setup(t);f.emit('dragstart');f.last.rect.top=240;
    const event={type:'dragover',target:f.last,clientX:11,clientY:225,dataTransfer:{types:['application/x-moz-tabbrowser-tab'],dropEffect:'move',mozItemCount:1,mozGetDataAt:()=>f.source}};
    f.manager.beforeDragOver(event);
    if(reason!=='outside')f.last.rect.top=200;
    event.defaultPrevented=reason!=='rejected';
    if(reason==='cancelled')f.emit('dragend');
    f.manager.afterNativeDragOver(event);f.advance(1000);assert.equal(f.rows().length,0,reason);
  }
});
test('geometry movement and disconnected transfer expiry are independently visible in same attempt',t=>{
  const f=setup(t);f.emit('dragstart');const event=enter(f);event.dataTransfer.types=[];
  f.advance(100);f.last.rect.top+=40;f.advance(200);assert.equal(f.rows().length,0);
  assert.ok(entries(f).some(e=>e.type==='dwell-expiry'&&e.reasons.includes('outside_trigger')));
  // Geometry failure short-circuits native acceptance: do not invent a payload observation.
  assert.ok(entries(f).some(e=>e.type==='dwell-expiry'&&e.endTop===240));
  f.last.rect.top=200;enter(f).dataTransfer.types=[];f.advance(300);
  assert.ok(entries(f).some(e=>e.type==='acceptance'&&e.reasons.includes('mime_missing')));
});
test('diagnostic on/off preserves native DataTransfer reads, decisions, pending timers and drop routing',t=>{
  const run=enabled=>{
    const f=setup(t,enabled);let payloadReads=0,nativeReads=0;
    const native=f.tabContainer.tabDragAndDrop,original=native.getDropEffectForTabDrag;
    native.getDropEffectForTabDrag=event=>{nativeReads++;return original(event);};
    const transfer={types:['application/x-moz-tabbrowser-tab'],dropEffect:'move',mozItemCount:1,mozGetDataAt:()=>{payloadReads++;return f.source;}};
    f.emit('dragstart',f.source,{dataTransfer:transfer});f.emit('dragover',f.last,{clientX:11,clientY:225,dataTransfer:transfer});f.advance(300);
    const count=f.rows().length;f.emit('drop',f.rows()[2],{dataTransfer:transfer});f.advance(1);
    return {payloadReads,nativeReads,count,pending:f.pending(),parent:f.source.parentElement.id,calls:f.nativeCalls.map(c=>c.type)};
  };
  assert.deepEqual(run(true),run(false));
});
test('throwing diagnostic sampling cannot alter drag reveal or native cleanup',t=>{
  const f=setup(t);f.recorder.record=()=>{throw new Error('PRIVATE_ERROR');};
  f.adapters.diagnosticState=()=>{throw new Error('PRIVATE_ERROR');};
  assert.doesNotThrow(()=>{f.emit('dragstart');enter(f);f.advance(300);});assert.equal(f.rows().length,3);
  assert.doesNotThrow(()=>f.emit('dragend'));assert.equal(f.rows().length,0);
});

test('folder menu exposes opt-in copy only for regular folders, copies only on command, and honours icon modes',t=>{
  const f=setup(t),menu=f.own(new DropNode('menupopup','zenFolderActions'));f.root.appendChild(menu);
  f.host.document.getElementById=id=>id==='zenFolderActions'?menu:null;
  const originalStyle=f.host.getComputedStyle;
  f.host.getComputedStyle=node=>node.localName==='menuitem'?{getPropertyValue:()=>''}:originalStyle(node);
  const copies=[];f.host.Cc={'@mozilla.org/widget/clipboardhelper;1':{getService:()=>({copyString:text=>copies.push(text)})}};
  f.host.Ci={nsIClipboardHelper:{}};
  const m=new api.DragDiagnosticsMenuManager(f.host,f.prefs,f.recorder);m.start();t.after(()=>m.destroy());
  f.emit('dragstart');enter(f);menu.triggerNode=f.parent;
  const show=()=>menu.fire({target:menu,type:'popupshowing'},false);show();
  const item=menu.children.find(n=>n.id==='better-zen-folders-copy-drag-diagnostics');assert.ok(item);assert.equal(item.hidden,false);
  assert.equal(item.getAttribute('label'),'Copy Drag Diagnostics');assert.equal(copies.length,0);
  assert.equal(item.getAttribute('data-better-zen-folders-command-icon-mode'),'mod');
  f.prefs.set('commandIconMode','compatibility');assert.equal(item.getAttribute('data-better-zen-folders-command-icon-mode'),'compatibility');
  f.prefs.set('commandIconMode','off');assert.equal(item.getAttribute('image'),null);
  const command=()=>item.fire({target:item,type:'command',preventDefault(){},stopPropagation(){}},false);
  command();assert.equal(copies.length,1);assert.ok(JSON.parse(copies[0]).entries.length);
  f.parent.isLiveFolder=true;show();command();assert.equal(copies.length,1);assert.equal(item.hidden,true);
  f.prefs.set('dragDiagnosticsEnabled',false);assert.equal(item.isConnected,false);
  m.destroy();assert.equal(menu.listeners.get('popupshowing')?.length??0,0);
});
test('clipboard failure is contained without fallback writes or raw error disclosure',t=>{
  const f=setup(t),menu=f.own(new DropNode('menupopup','zenFolderActions'));f.root.appendChild(menu);menu.triggerNode=f.parent;
  f.host.document.getElementById=()=>menu;let fallback=0;
  f.host.Cc={'@mozilla.org/widget/clipboardhelper;1':{getService:()=>({copyString(){throw new Error('PRIVATE_CLIPBOARD_ERROR');}})}};
  f.host.Ci={nsIClipboardHelper:{}};f.host.navigator={clipboard:{writeText:()=>fallback++}};
  const m=new api.DragDiagnosticsMenuManager(f.host,f.prefs,f.recorder);m.start();t.after(()=>m.destroy());
  menu.fire({target:menu,type:'popupshowing'},false);const item=menu.children[0];
  assert.doesNotThrow(()=>item.fire({target:item,type:'command',preventDefault(){},stopPropagation(){}},false));
  assert.equal(fallback,0);assert.doesNotMatch(JSON.stringify(f.recorder.snapshot()),/PRIVATE_CLIPBOARD_ERROR/);
});

test('unchanged native event noise keeps earlier attempts, counted coalescing and paired endpoint tokens',t=>{
  const f=setup(t);f.emit('dragstart');enter(f);f.advance(300);f.emit('dragend');
  f.emit('dragstart');
  for(let i=0;i<10000;i++)enter(f);
  const snapshot=f.recorder.snapshot();
  assert.equal(snapshot.capacity,8192);
  assert.equal(snapshot.diagnosticBuild,JSON.parse(readFileSync(new URL('../theme.json',import.meta.url),'utf8')).version);
  assert.equal(snapshot.configuredDelays.dragDestinationDelayMs,300);
  assert.ok(snapshot.entries.some(e=>e.attempt===1&&e.type==='dragend'));
  assert.ok(snapshot.entries.length<100);assert.ok(snapshot.entries.some(e=>e.repeatCount>100));
  const capture=snapshot.entries.findLast(e=>e.type==='capture'&&e.attempt===2);
  const post=snapshot.entries.findLast(e=>e.type==='postnative'&&e.attempt===2);
  assert.equal(capture.lastEvent,post.lastEvent);
  // First capture precedes layout discovery, so its state differs from later captures.
  for(const type of ['capture','postnative'])assert.equal(snapshot.entries.filter(e=>e.attempt===2&&e.type===type).reduce((n,e)=>n+e.repeatCount,0),10000);
  const clone=snapshot.droppedEvents;clone.capture=999;assert.notEqual(f.recorder.snapshot().droppedEvents.capture,999);
});

test('minutes of failed-hover suspension noise retain a previous attempt and changed failure states',t=>{
  const f=setup(t);f.emit('dragstart');enter(f);f.advance(300);f.emit('dragend');f.emit('dragstart');
  for(let i=0;i<20000;i++) {
    f.emit('dragover',f.separator,{clientX:999,clientY:999});f.advance(10);
  }
  let snapshot=f.recorder.snapshot();
  assert.ok(snapshot.entries.some(e=>e.attempt===1&&e.type==='dragend'));
  assert.equal(snapshot.truncated,0);assert.ok(snapshot.entries.length<100);
  assert.ok(snapshot.entries.some(e=>e.type==='suspend'&&e.repeatCount>19000));
  f.emit('dragover',f.last,{clientX:999,clientY:225});
  snapshot=f.recorder.snapshot();
  const last=snapshot.entries.findLast(e=>e.type==='capture');
  assert.equal(last.y,225);assert.ok(last.reasons.includes('outside_trigger'));
  assert.ok(snapshot.entries.some(e=>e.type==='capture'&&e.y===999));
});

test('real EventTarget capture/postnative evidence distinguishes missing delivery across separate attempts without guessing cause',t=>{
  const f=makeFolderEndDropFixture(api,{install:false}),prefs=preferences();
  const root=new EventTarget(),tabs=new EventTarget();let immediate=true;
  tabs.addEventListener('dragstart',e=>e.stopPropagation());
  tabs.addEventListener('dragover',e=>{e.preventDefault();if(immediate)e.stopImmediatePropagation();else e.stopPropagation();});
  const adapters=api.createBrowserFolderEndDropAdapters(f.host,{projection:f.projection},prefs);
  const manager=new api.FolderEndDropManager({...adapters,eventTarget:()=>root,dragStartTarget:()=>tabs});manager.start();t.after(()=>manager.destroy());
  const dispatch=(type,target=f.last)=>{
    const e=new Event(type,{cancelable:true});
    for(const [key,value] of Object.entries({target,clientX:11,clientY:225,dataTransfer:{types:['application/x-moz-tabbrowser-tab'],dropEffect:'move',mozItemCount:1,mozGetDataAt:()=>f.source}}))Object.defineProperty(e,key,{value});
    root.dispatchEvent(e);tabs.dispatchEvent(e);return e;
  };
  f.emit('dragstart');dispatch('dragstart',f.source);const blocked=dispatch('dragover');f.advance(300);assert.equal(f.rows().length,0);
  dispatch('dragend');immediate=false;dispatch('dragstart',f.source);const delivered=dispatch('dragover');f.advance(300);assert.equal(f.rows().length,3);
  const records=adapters.diagnostics.snapshot().entries,first=adapters.diagnostics.token(blocked),second=adapters.diagnostics.token(delivered);
  assert.ok(records.some(e=>e.type==='capture'&&e.event===first));assert.equal(records.some(e=>e.type==='postnative'&&e.event===first),false);
  assert.ok(records.some(e=>e.type==='postnative'&&e.event===second));
  assert.deepEqual([...new Set(records.filter(e=>e.attempt>0).map(e=>e.attempt))],[1,2]);
  assert.doesNotMatch(JSON.stringify(records),/stopImmediatePropagation|native_blocked/);
});
