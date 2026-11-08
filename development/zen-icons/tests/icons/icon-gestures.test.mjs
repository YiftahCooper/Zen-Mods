import test from 'node:test';
import assert from 'node:assert/strict';
import {Element} from './runtime-fixture.mjs';
const module=await import('../../src/zen-icons-sine/icon-gestures.mjs').catch(()=>({}));
function fixture() {
  assert.equal(typeof module.connectIconGestures,'function');
  const root=new Element('window'), tab=new Element('tab'), image=new Element('img'), reset=new Element('box');
  image.className='tab-icon-image';reset.className='tab-reset-pin-button';root.append(tab);tab.append(image,reset);
  tab.isConnected=true;tab.linkedBrowser={currentURI:{spec:'https://example.invalid/current'}};
  const listeners=new Map(),timers=new Map(),opened=[],resets=[];let active=true,id=0;
  let progress;
  const host={document:{documentElement:root},gBrowser:{selectedTab:null,addTabsProgressListener:p=>progress=p,removeTabsProgressListener:()=>progress=null},addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name),
    setTimeout:fn=>{timers.set(++id,fn);return id;},clearTimeout:key=>timers.delete(key)};
  const stop=module.connectIconGestures({host,isEnabled:()=>active,resolveTarget:node=>node===image||node===reset?{kind:'tab',item:tab,anchor:image,reset:node===reset}:null,
    openPicker:target=>opened.push(target.item),resetTab:item=>resets.push(item)});
  const fire=(type,target,detail=1,extra={})=>{const e={type,target,button:0,detail,preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;},...extra};listeners.get(type)?.(e);return e;};
  const flush=()=>{for(const fn of timers.values())fn();timers.clear();};
  return {host,tab,image,reset,opened,resets,fire,flush,stop,timers,listeners,navigate:()=>progress?.onStateChange(tab.linkedBrowser,{isTopLevel:true},{},0x20001),disable:()=>active=false};
}
test('a reset-overlay double click opens the picker once without resetting the URL',()=>{
  const f=fixture();
  assert.equal(f.fire('click',f.reset).prevented,true);
  f.fire('click',f.reset,2);f.fire('dblclick',f.reset,2);f.flush();
  assert.deepEqual(f.opened,[f.tab]);assert.deepEqual(f.resets,[]);f.stop();
});
test('ordinary icon selection remains immediate and double click cannot reach native close',()=>{
  const f=fixture();assert.equal(f.fire('click',f.image).prevented,undefined);
  const double=f.fire('dblclick',f.image,2);assert.equal(double.stopped,true);assert.deepEqual(f.opened,[f.tab]);f.stop();
});
test('a single reset click retains its native action after the double-click interval',()=>{
  const f=fixture();f.fire('click',f.reset);
  assert.equal(f.host.gBrowser.selectedTab,f.tab,'select the background tab immediately, before the URL reset timer');
  assert.deepEqual(f.resets,[]);f.flush();assert.deepEqual(f.resets,[f.tab]);f.stop();
});
for(const reason of ['navigate','move','close','disable','destroy','drag'])test(`a deferred reset is cancelled by ${reason}`,()=>{
  const f=fixture();f.fire('click',f.reset);
  if(reason==='navigate')f.tab.linkedBrowser.currentURI.spec='https://example.invalid/changed';
  if(reason==='move')f.fire('TabMove',f.tab);
  if(reason==='close')f.tab.isConnected=false;
  if(reason==='disable')f.disable();
  if(reason==='destroy')f.stop();
  if(reason==='drag')f.fire('dragstart',f.reset);
  f.flush();assert.deepEqual(f.resets,[]);f.stop();
});
test('URL-pin badges, Sticky controls, modified clicks and disabled gestures pass through',()=>{
  const f=fixture();const badge=new Element('button');badge.className='better-zen-folders-url-pin';
  assert.equal(f.fire('dblclick',badge,2).prevented,undefined);
  assert.equal(f.fire('click',f.reset,1,{ctrlKey:true}).prevented,undefined);
  f.disable();assert.equal(f.fire('dblclick',f.image,2).prevented,undefined);
  assert.deepEqual(f.opened,[]);f.stop();assert.equal(f.listeners.size,0);
});

test('a same-URL reload cancels deferred reset even when the final address is unchanged',()=>{
  const f=fixture();f.fire('click',f.reset);f.navigate();f.flush();assert.deepEqual(f.resets,[]);f.stop();
});
