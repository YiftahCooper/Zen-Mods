import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseBaseline, BzfLease, BetterPinsController,adoptionChoice} from '../src/controller.mjs';
import {FolderPinPolicy} from '../src/pin-engine.mjs';
import {BASELINE_KEY} from '../src/state.mjs';
test('baseline validation refuses corrupt and future metadata',()=>{
 assert.equal(parseBaseline('{'),null);assert.equal(parseBaseline('{"schema":2}'),null);
 assert.deepEqual(parseBaseline('{"schema":1,"baseline":{"entry":{"url":"https://example.org","title":"A"}}}'),{entry:{url:'https://example.org',title:'A'}});
});
test('adoption preflights every mirrored record and preserves a peer choice',()=>{
 assert.throws(()=>adoptionChoice([{status:'missing'},{status:'invalid'}],['',''],[true,true],true));
 assert.throws(()=>adoptionChoice([{status:'known',explicit:false},{status:'known',explicit:true}],['',''],[true,true],true));
 assert.throws(()=>adoptionChoice([{status:'missing'}],['{"schema":2}'],[true],true));
 assert.equal(adoptionChoice([{status:'missing'},{status:'known',explicit:true}],['',''],[true,true],true).explicit,true);
 assert.throws(()=>adoptionChoice([{status:'known',explicit:true},{status:'known',explicit:true}],['',''],[true,true],true,[{entry:{url:'A'}},{entry:{url:'B'}}]));
});
test('only compatible BZF pin runtime is suspended and restored, preferences untouched',async()=>{
 let disabled=0,enabled=0;
 const runtime={constructor:{name:'FolderPinRuntime'},active:true,disable(){disabled++;},enable(){enabled++;},preferences:{get(){return true;}}};
 const host={__betterZenFoldersController:{managers:[runtime]},console};
 const lease=new BzfLease(host);lease.start();
 assert.equal(disabled,1);await runtime.enable();assert.equal(enabled,0);
 lease.destroy();assert.equal(enabled,1);assert.equal(host.__betterZenFoldersController.managers[0],runtime);
});
test('BZF loaded later is suspended before its controller starts',()=>{
 const host={console};const lease=new BzfLease(host);lease.start();let calls=0;
 const runtime={constructor:{name:'FolderPinRuntime'},disable(){calls++;},enable(){throw Error('must not activate');},active:false,preferences:{get(){return true;}}};
 host.__betterZenFoldersController={managers:[runtime]};
 assert.equal(calls,1);runtime.enable();lease.destroy();
});
test('failed update rolls independent saved baseline back as well as native baseline',async()=>{
 const tab={id:'one',baseline:{entry:{url:'https://example.org/A'}}};
 const initial=JSON.stringify({schema:1,baseline:tab.baseline});let raw=initial;
 const host={SessionStore:{getCustomTabValue:()=>raw,setCustomTabValue:(t,k,v)=>{raw=v;}},console:{error(){}}};
 const c=new BetterPinsController(host);
 const a=c.adapters={getIntentTargets:()=>[tab],getId:t=>t.id,classify:()=> 'regular-folder',getLocation:()=>null,
   getStartupResetEnabled:()=>false,isRestorationReady:()=>true,
   captureBaseline:()=>[{tab,owner:tab.baseline,value:structuredClone(tab.baseline)}],
   getSavedBaseline:()=>tab.baseline,
   ownsBaseline:(t,next)=>tab.baseline===next[0].owner,
   restoreBaseline:(t,prev,next)=>{if(tab.baseline!==next[0].owner)return false;tab.baseline=prev[0].value;return true;},
   async writeBaseline(){tab.baseline={entry:{url:'https://example.org/B'}};return [{tab,owner:tab.baseline,value:structuredClone(tab.baseline)}];},
   setCurrentAsBaseline:t=>a.writeBaseline(t),clearDuplicateState(){},reportError(){},
 };
 c.configureAdapters();
 const store={read:()=>({status:'known',explicit:true}),write(){throw Error('intent save failed');}};
 const p=new FolderPinPolicy(a,store);p.start();
 assert.equal((await p.update(tab)).ok,false);
 assert.equal(tab.baseline.entry.url,'https://example.org/A');
 assert.equal(raw,initial,'failed action must not reappear after restart');
});
