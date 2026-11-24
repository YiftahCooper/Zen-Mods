import test from 'node:test';import assert from 'node:assert/strict';
import {createLookupService} from '../src/lookup.mjs';
import {providers} from '../src/providers/registry.mjs';
const term={original:'שָׁלוֹם',query:'שָׁלוֹם',language:'he',withoutNiqqud:'שלום'};
const definition={headword:'שלום',language:'he',senses:[{text:'ברכה',examples:[]}],sourceUrl:'https://he.wiktionary.org/wiki/שלום',attribution:{label:'ויקימילון'}};

test('quota-limited providers can disable automatic fallback and preserve authentication outcomes',async()=>{
  let calls=0;const provider={language:'he',supportsFallback:false,lookup:async()=>{calls++;return null;}};
  const service=createLookupService({providers:new Map([['limited',provider]])});
  assert.equal((await service.lookup({term,providerId:'limited'})).status,'no-result');assert.equal(calls,1);
  for(const code of ['unauthorized','access-denied']){provider.lookup=async()=>{throw Object.assign(new Error('sensitive provider body'),{code});};assert.deepEqual(await service.lookup({term,providerId:'limited'}),{status:code});}
});
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
test('English fallback tries lowercase only after the exact spelling has no definition',async()=>{
  const calls=[];const service=createLookupService({providers:new Map([['en',{language:'en',lookup:async({query})=>{calls.push(query);return query==='browser'?{headword:'browser'}:query==='May'?{headword:'May'}:null;}}]])});
  const result=await service.lookup({term:{query:'Browser',language:'en'},providerId:'en'});
  assert.equal(result.status,'ok');assert.equal(result.definition.headword,'browser');assert.equal(result.normalizedRetry,true);assert.deepEqual(calls,['Browser','browser']);
  calls.length=0;assert.equal((await service.lookup({term:{query:'May',language:'en'},providerId:'en'})).definition.headword,'May');assert.deepEqual(calls,['May']);
});
test('a non-Error provider rejection becomes a terminal unavailable outcome',async()=>{
  for(const rejected of [null,undefined,'bad']){
    const service=createLookupService({providers:new Map([['he',{language:'he',lookup:()=>Promise.reject(rejected)}]])});
    assert.deepEqual(await service.lookup({term,providerId:'he'}),{status:'unavailable'});
  }
});
test('credential retrieval and stalled response bodies share the full request deadline',async()=>{
  for(const credentials of [{get:()=>new Promise(()=>{})},null]){
    let timeout;const service=createLookupService({providers,credentials,timers:{setTimeout(f){timeout=f;return 1;},clearTimeout(){}},fetch:async()=>new Response(new ReadableStream({start(){}}))});
    const pending=service.lookup({term:{query:'Browser',language:'en'},providerId:credentials?'mw-collegiate':'free-en'});
    await Promise.resolve();timeout();assert.equal((await pending).status,'timeout');
  }
});
test('suggestions stay in the selected provider and are bounded, unique, language-checked words',async()=>{
  const service=createLookupService({providers:new Map([['en',{language:'en',suggest:async()=>[{word:'browser',language:'en'},{word:'browser',language:'en'},{word:'בית',language:'he'},...Array.from({length:12},(_,i)=>({word:`word${i}`,language:'en'}))]}],['free',{language:'en',lookup(){throw Error('must not query')}}]])});
  const result=await service.suggest({term:{query:'bro',language:'en'},providerId:'en'});
  assert.equal(result.status,'ok');assert.equal(result.suggestions.length,8);assert.deepEqual(result.suggestions[0],{word:'browser',language:'en'});assert(result.suggestions.every(s=>s.language==='en'));
  assert.deepEqual(await service.suggest({term:{query:'bro',language:'en'},providerId:'free'}),{status:'unsupported-suggestions'});
});
test('suggestions share credential failures, cancellation and deadline behavior',async()=>{
  let timeout;const service=createLookupService({providers,credentials:{get:()=>new Promise(()=>{})},timers:{setTimeout(f){timeout=f;return 1;},clearTimeout(){}}});
  const pending=service.suggest({term:{query:'bro',language:'en'},providerId:'mw-collegiate'});timeout();assert.equal((await pending).status,'timeout');
  const controller=new AbortController();controller.abort();assert.equal((await service.suggest({term:{query:'bro',language:'en'},providerId:'wiktionary-en',signal:controller.signal})).status,'cancelled');
});

test('case variants cannot crowd distinct words out of the suggestion limit',async()=>{
  const words=['define','Define','DEFINE','defined','definer','definite','definition','defining','definable','definitive'];
  const service=createLookupService({providers:new Map([['en',{language:'en',suggest:async()=>words.map(word=>({word,language:'en'}))}]])});
  const result=await service.suggest({term:{query:'def',language:'en'},providerId:'en'});
  assert.deepEqual(result.suggestions.map(x=>x.word),['define','defined','definer','definite','definition','defining','definable','definitive']);
});

test('a Merriam-Webster lookup derives its definition and suggestions from one keyed request',async()=>{
  for(const id of ['mw-collegiate','mw-learners']){
    const urls=[];let reads=0;
    const service=createLookupService({providers,credentials:{get:async provider=>{reads++;assert.equal(provider,id);return 'fixture-only-key';}},fetch:async url=>{urls.push(new URL(url));
      return Response.json(/\/json\/snese\?/i.test(url)?['sense','snide','sense']:[{meta:{id:'sense:1'},hwi:{hw:'sense'},fl:'noun',shortdef:['a meaning']},{meta:{id:'common sense'},hwi:{hw:'common sense'},fl:'noun',shortdef:['good judgment']}]);}});
    const found=await service.lookup({term:{original:'sense',query:'sense',language:'en'},providerId:id});
    assert.equal(found.status,'ok');assert.equal(found.definition.headword,'sense');assert.deepEqual(found.definition.matches,[{word:'common sense',language:'en'}]);
    assert.deepEqual(found.suggestions,{status:'ok',suggestions:[{word:'sense',language:'en'},{word:'common sense',language:'en'}]});
    assert.equal(urls.length,1,'one request per lookup');assert.equal(reads,1,'one credential read per lookup');
    const misspelled=await service.lookup({term:{original:'snese',query:'snese',language:'en'},providerId:id});
    assert.equal(misspelled.status,'no-result');assert.deepEqual(misspelled.suggestions.suggestions.map(s=>s.word),['sense','snide']);
    assert.equal(urls.length,2);assert.equal(reads,2);assert.equal(urls[1].pathname,`/api/v3/references/${id.slice(3)}/json/snese`);
    // Only a capitalized spelling without any entry retries lowercase, as every
    // provider with fallback does; that retry reuses the same credential read.
    urls.length=0;reads=0;await service.lookup({term:{original:'Snese',query:'Snese',language:'en'},providerId:id});
    assert.deepEqual(urls.map(u=>u.pathname.split('/').at(-1)),['Snese','snese']);assert.equal(reads,1);
  }
});

test('unexpected provider failures reach the console with the provider id; HTTP statuses, aborts and timeouts stay quiet (0.3.6)',async()=>{
  const logged=[],log={warn:(...args)=>logged.push(args)};
  const parser=new TypeError('parser broke');
  let service=createLookupService({providers:new Map([['p1',{language:'he',lookup:async()=>{throw parser;}}]]),log});
  assert.deepEqual(await service.lookup({term,providerId:'p1'}),{status:'unavailable'},'the user still sees unavailable');
  assert.equal(logged.length,1);assert.match(logged[0][0],/p1/);assert.equal(logged[0][1],parser);
  // A malformed JSON body through the real HTTP path logs its parse error, not the URL.
  logged.length=0;service=createLookupService({providers,log,fetch:async()=>new Response('<html>not json')});
  assert.equal((await service.lookup({term:{original:'hello',query:'hello',language:'en'},providerId:'free-en'})).status,'unavailable');
  assert.equal(logged.length,1);assert.match(logged[0][0],/free-en/);assert(logged[0][1] instanceof SyntaxError);
  logged.length=0;service=createLookupService({providers,log,fetch:async()=>new Response('Origin connection timed out',{status:522})});
  assert.equal((await service.lookup({term:{original:'hello',query:'hello',language:'en'},providerId:'free-en'})).status,'unavailable');
  assert.equal(logged.length,0,'an HTTP status error is not logged');
  // Aborts and timeouts are not logged even when the provider rejects afterwards.
  let reject;service=createLookupService({providers:new Map([['p1',{language:'he',lookup:()=>new Promise((_r,j)=>reject=j)}]]),log});
  const controller=new AbortController(),cancelled=service.lookup({term,providerId:'p1',signal:controller.signal});await Promise.resolve();controller.abort();reject(new Error('aborted fetch'));
  assert.equal((await cancelled).status,'cancelled');
  let timeout;service=createLookupService({providers:new Map([['p1',{language:'he',lookup:()=>new Promise((_r,j)=>reject=j)}]]),log,timers:{setTimeout(f){timeout=f;return 1;},clearTimeout(){}}});
  const timed=service.lookup({term,providerId:'p1'});await Promise.resolve();timeout();reject(new Error('aborted fetch'));
  assert.equal((await timed).status,'timeout');await new Promise(r=>setImmediate(r));assert.equal(logged.length,0);
});

test('a user-started lookup unlocks a locked primary password once and pauses its deadline; suggestions never prompt (0.3.6)',async()=>{
  const {createCredentials}=await import('../src/credentials.sys.mjs');
  let loggedIn=false,unlocks=0,cancel=false,next=1,clearedDuringPrompt=false;const active=new Set();
  const manager={get isLoggedIn(){return loggedIn;},uiBusy:false,searchLoginsAsync:async()=>[{password:'fixture-only-key'}]};
  const credentials=createCredentials(manager,fields=>fields,async()=>{unlocks++;clearedDuringPrompt=active.size===0;if(cancel)throw new Error('cancelled');loggedIn=true;});
  const timers={setTimeout(){const id=next++;active.add(id);return id;},clearTimeout(id){active.delete(id);}};
  const urls=[];const service=createLookupService({providers,credentials,timers,fetch:async url=>{urls.push(url);return Response.json([{meta:{id:'sense:1'},hwi:{hw:'sense'},fl:'noun',shortdef:['a meaning']}]);}});
  const english={original:'sense',query:'sense',language:'en'};
  assert.deepEqual(await service.suggest({term:english,providerId:'mw-collegiate'}),{status:'credential-unavailable'});assert.equal(unlocks,0,'typing suggestions must not prompt');
  cancel=true;assert.deepEqual(await service.lookup({term:english,providerId:'mw-collegiate'}),{status:'credential-unavailable'});assert.equal(unlocks,1,'one prompt per lookup; cancel keeps the locked message');assert.equal(urls.length,0);
  cancel=false;assert.equal((await service.lookup({term:english,providerId:'mw-collegiate'})).status,'ok');assert.equal(unlocks,2);assert.equal(urls.length,1);
  assert(clearedDuringPrompt,'the ten-second deadline is paused while the prompt is open');assert.equal(active.size,0,'the re-armed deadline is cleared afterwards');
  assert.equal((await service.lookup({term:english,providerId:'mw-collegiate'})).status,'ok');assert.equal(unlocks,2,'no prompt once unlocked');
  loggedIn=false;let ready;manager.initializationPromise=new Promise(resolve=>ready=resolve);const controller=new AbortController();
  const abandoned=service.lookup({term:english,providerId:'mw-collegiate',signal:controller.signal});await Promise.resolve();controller.abort();ready();
  assert.equal((await abandoned).status,'cancelled');await new Promise(resolve=>setImmediate(resolve));assert.equal(unlocks,2,'an abandoned lookup never prompts');
});
