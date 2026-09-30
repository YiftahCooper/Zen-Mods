import test from 'node:test';import assert from 'node:assert/strict';
import {createLookupService} from '../src/lookup.mjs';
const term={original:'שָׁלוֹם',query:'שָׁלוֹם',language:'he',withoutNiqqud:'שלום'};
const definition={headword:'שלום',language:'he',senses:[{text:'ברכה',examples:[]}],sourceUrl:'https://he.wiktionary.org/wiki/שלום',attribution:{label:'ויקימילון'}};
test('Hebrew no-result retries only once without niqqud and labels the result',async()=>{
  const calls=[];const service=createLookupService({providers:new Map([['he',{language:'he',lookup:async o=>{calls.push(o.query);return calls.length===1?null:definition;}}]])});
  const r=await service.lookup({term,providerId:'he'});assert.equal(r.status,'ok');assert.equal(r.normalizedRetry,true);assert.deepEqual(calls,['שָׁלוֹם','שלום']);
});
test('mismatched language and missing keys make no network request',async()=>{
  let called=false;const service=createLookupService({providers:new Map([['en',{language:'en',keyRequired:true,lookup:()=>{called=true;}}]]),credentials:{get:async()=>null}});
  assert.equal((await service.lookup({term,providerId:'en'})).status,'unsupported');
  assert.equal((await service.lookup({term:{...term,language:'en'},providerId:'en'})).status,'missing-key');assert.equal(called,false);
});
test('locked credential storage is reported without exposing internal errors',async()=>{
  const service=createLookupService({providers:new Map([['en',{language:'en',keyRequired:true}]]),credentials:{get:async()=>{throw Error('key-secret');}}});
  assert.deepEqual(await service.lookup({term:{...term,language:'en'},providerId:'en'}),{status:'credential-unavailable'});
});
test('timeout wins even if a provider ignores abort',async()=>{
  let timeout,delay;const service=createLookupService({providers:new Map([['he',{language:'he',lookup:()=>new Promise(()=>{})}]]),timers:{setTimeout(f,ms){timeout=f;delay=ms;return 1;},clearTimeout(){}}});
  const pending=service.lookup({term,providerId:'he'});await Promise.resolve();timeout();assert.equal(delay,10000);assert.equal((await pending).status,'timeout');
});
test('caller abort wins even if a provider ignores abort',async()=>{
  const controller=new AbortController();const service=createLookupService({providers:new Map([['he',{language:'he',lookup:()=>new Promise(()=>{})}]] )});
  const pending=service.lookup({term,providerId:'he',signal:controller.signal});controller.abort();assert.equal((await pending).status,'cancelled');
});
