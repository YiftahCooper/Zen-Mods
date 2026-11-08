import test from 'node:test';
import assert from 'node:assert/strict';
import {createState} from '../src/model.mjs';
let api;
try { api=await import('../src/store.mjs'); } catch {}
function prefs(initial='') {
  const values=new Map([['extension.context-menu-editor.settings',initial]]),observers=new Set();let writes=0;
  return {get writes(){return writes;},values,observers,
    getStringPref(key,fallback=''){return values.get(key)??fallback;},
    setStringPref(key,value){values.set(key,value);writes++;for(const observer of observers)observer.observe(null,'nsPref:changed',key);},
    addObserver(_key,observer){observers.add(observer);},removeObserver(_key,observer){observers.delete(observer);}};
}
test('opening settings is read-only and two windows cannot overwrite a newer edit',()=>{
  assert.ok(api,'The guarded settings store must exist.');
  const p=prefs(),a=api.createStore(p),b=api.createStore(p);
  assert.equal(a.read().raw,'');assert.equal(p.writes,0);
  const old=b.read(),next=createState();next.options.iconSize=20;a.save(next,'');
  const stale=createState();stale.options.iconSize=12;
  assert.throws(()=>b.save(stale,old.raw),/changed/i);
  assert.equal(b.read().state.options.iconSize,20);
  a.destroy();b.destroy();assert.equal(p.observers.size,0);
});
test('invalid saved settings are preserved before explicit recovery',()=>{
  assert.ok(api);const p=prefs('{broken'),store=api.createStore(p);
  assert.ok(store.read().error);assert.equal(p.writes,0);
  assert.throws(()=>store.save(createState(),'{broken'),/reset|invalid/i);
  store.resetInvalid('{broken');
  assert.equal(p.values.get('extension.context-menu-editor.settings.recovery'),'{broken');
  assert.equal(store.read().error,null);store.destroy();
});
test('undo checks the latest saved value and notifications are shared',()=>{
  assert.ok(api);const p=prefs(),a=api.createStore(p),b=api.createStore(p);let seen=0;
  const off=b.subscribe(()=>seen++);
  const next=createState();next.options.showIcons=false;a.save(next,'');
  assert.equal(seen,1);a.undo();assert.equal(a.read().state.options.showIcons,true);
  a.save(next,a.read().raw);const other=createState();other.options.iconGap=12;b.save(other,b.read().raw);
  assert.throws(()=>a.undo(),/changed/i);assert.equal(a.read().state.options.iconGap,12);
  off();a.destroy();b.destroy();
});
