// Attributed BZF regression snapshot; same source revision as pin-engine provenance.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as api from '../src/pin-engine.mjs';
function fixture(){
 const timers=new Map(),tab={id:'one',folder:'f',explicit:true,baseline:'A',current:'B'},updates=[];let count=0,commits=0;
 const policy={blocked:()=>null,unpin:async t=>{commits++;t.explicit=false;return {ok:true};}};
 const a={getId:t=>t.id,getLocation:t=>t.folder,isConnected:t=>!t.closed,captureBaseline:t=>t.baseline,
  ownsBaseline:(t,b)=>t.baseline===b,setTimer:(fn,ms)=>{timers.set(++count,{fn,ms});return count;},clearTimer:id=>timers.delete(id)};
 const store={read:t=>({status:'known',explicit:t.explicit})};
 const grace=new api.FolderPinUnpinGrace(a,store,policy,t=>updates.push(t));
 return {timers,tab,policy,a,grace,updates,commits:()=>commits,expire:async()=>{const t=[...timers.values()][0];timers.clear();await t.fn();}};
}
test('zero grace unpins immediately without navigation or baseline change',async()=>{
 const f=fixture();assert.deepEqual(await f.grace.toggle(f.tab,0),{ok:true});assert.equal(f.commits(),1);
 assert.equal(f.tab.current,'B');assert.equal(f.tab.baseline,'A');assert.equal(f.timers.size,0);
});
test('nonzero grace keeps the original pin until expiry; a second activation cancels without repinning',async()=>{
 const f=fixture();await f.grace.toggle(f.tab,500);assert.equal(f.tab.explicit,true);assert.equal(f.commits(),0);assert.equal(f.grace.pending.has(f.tab),true);
 assert.deepEqual(await f.grace.toggle(f.tab,500),{ok:true,reason:'cancelled'});assert.equal(f.timers.size,0);assert.equal(f.tab.baseline,'A');assert.equal(f.tab.explicit,true);
 await f.grace.toggle(f.tab,500);await f.expire();assert.equal(f.tab.explicit,false);assert.equal(f.commits(),1);
});
test('moves, changed baseline, identity, close, explicit cancel and teardown cannot commit stale timers',async()=>{
 for(const change of [f=>f.tab.folder='other',f=>f.tab.baseline='C',f=>f.tab.id='other',f=>f.tab.closed=true,f=>f.grace.cancel(f.tab),f=>f.grace.destroy()]){
  const f=fixture();await f.grace.toggle(f.tab,500);const callback=[...f.timers.values()][0].fn;change(f);await callback();assert.equal(f.commits(),0);
 }
});
test('refused persistence is not painted as unpinned and permits retry',async()=>{
 const f=fixture();f.policy.unpin=async()=>({ok:false,reason:'failed'});
 await f.grace.toggle(f.tab,500);await f.expire();assert.equal(f.tab.explicit,true);assert.equal(f.grace.pending.size,0);
 await f.grace.toggle(f.tab,500);assert.equal(f.timers.size,1);
});

test('delayed completion reports its outcome rather than leaving accessible status pending',async()=>{
 const f=fixture(),settled=[];f.grace.onSettled=result=>settled.push(result);
 f.policy.unpin=async()=>({ok:false,reason:'failed'});await f.grace.toggle(f.tab,500);await f.expire();
 assert.deepEqual(settled,[{ok:false,reason:'failed'}]);
});
