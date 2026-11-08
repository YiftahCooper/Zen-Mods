import test from 'node:test';
import assert from 'node:assert/strict';
import {Element} from './runtime-fixture.mjs';
const module=await import('../../src/zen-icons-sine/settings.mjs').catch(()=>({}));

test('neutral default paint and icon gestures react to preferences and release only owned markers',()=>{
  assert.equal(typeof module.connectIconSettings,'function');
  const root=new Element('window'), values=new Map(), observers=new Set(), listeners=new Map();
  const prefs={getBoolPref:(k,d)=>values.get(k)??d,addObserver:(k,o)=>observers.add(o),removeObserver:(k,o)=>observers.delete(o)};
  const host={document:{documentElement:root},gBrowser:{browsers:[]},
    addEventListener:(k,o)=>listeners.set(k,o),removeEventListener:k=>listeners.delete(k)};
  const disconnect=module.connectIconSettings(host,prefs);
  assert.equal(root.hasAttribute('zen-icons-neutral-tab-default'),false);
  assert.equal(root.hasAttribute('zen-icons-double-click-enabled'),false);
  values.set('zen-icons.tab.use-space-colour',false);values.set('zen-icons.double-click-icons',true);
  for(const observer of observers)observer.observe();
  assert.equal(root.hasAttribute('zen-icons-neutral-tab-default'),true);
  assert.equal(root.hasAttribute('zen-icons-double-click-enabled'),true);
  disconnect();
  assert.equal(observers.size,0);assert.equal(listeners.size,0);
  assert.equal(root.hasAttribute('zen-icons-neutral-tab-default'),false);
});

test('closing a Settings document releases its observer without waiting for a preference change',()=>{
  const root=new Element('window'), listeners=new Map(), observed=[];
  const host={document:{documentElement:root},gBrowser:{browsers:[]},
    addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name),
    MutationObserver:class {constructor(){observed.push(this);}observe(){}disconnect(){this.disconnected=true;}}};
  const prefs={getBoolPref:(name,fallback)=>fallback,addObserver(){},removeObserver(){}};
  const stop=module.connectIconSettings(host,prefs);
  const doc={documentURI:'about:settings#sineMods',documentElement:root,getElementById:()=>null,defaultView:{closed:false}};
  listeners.get('DOMContentLoaded')({target:doc});assert.equal(observed.length,1);
  listeners.get('pagehide')({target:doc});assert.equal(observed[0].disconnected,true);
  stop();assert.equal(listeners.size,0);
});
