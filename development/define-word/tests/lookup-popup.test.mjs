import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createController} from '../src/controller.mjs';
import {createLookupService} from '../src/lookup.mjs';
import {providers} from '../src/providers/registry.mjs';

const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('a stalled Free API request becomes a visible timeout through the real lookup, controller and popup',async t=>{
  const dom=new JSDOM('<div id="contentAreaContextMenu"></div><div id="mainPopupSet"></div>');
  const window=dom.window;
  let panelOpen=false,deadline,requested,requestSignal,respond=false;
  // JSDOM has no native XUL popup implementation; leave its content rendering
  // real and provide only the platform opening/closing surface.
  window.document.createXULElement=tag=>{
    const node=window.document.createElement(tag);
    node.openPopup=()=>{panelOpen=true;};
    node.openPopupAtScreen=()=>{panelOpen=true;};
    node.hidePopup=()=>{panelOpen=false;};
    return node;
  };
  window.gBrowser={selectedBrowser:window.document.body,tabContainer:new window.EventTarget(),addTabsProgressListener(){},removeTabsProgressListener(){}};
  const lookup=createLookupService({providers,timers:{setTimeout(callback){deadline=callback;return 1;},clearTimeout(){}},fetch:async(url,{signal})=>{
    requested=url;requestSignal=signal;
    if(respond)return Response.json([{word:'hello',meanings:[{partOfSpeech:'noun',definitions:[{definition:'A synthetic greeting.'}]}]}]);
    // Exercise the hard deadline even when the transport does not honor abort.
    return new Promise(()=>{});
  }});
  const controller=createController(window,{providers,lookup,settings:()=>({englishProvider:'free-en',textSize:14}),selection:{capture:async()=>({rawText:'hello'}),isCurrent:()=>true,release(){}}});
  t.after(()=>{controller.destroy();window.close();});
  const operation=controller.define();
  await tick();
  const result=window.document.querySelector('[data-result]');
  assert(panelOpen);
  assert.match(result.textContent,/Looking up/);
  assert.equal(requested,'https://api.dictionaryapi.dev/api/v2/entries/en/hello');
  assert.equal(typeof deadline,'function');
  deadline();
  await operation;
  assert(requestSignal.aborted);
  assert(panelOpen,'timeout stays visible for retry');
  assert.doesNotMatch(result.textContent,/Looking up/);
  assert.match(result.textContent,/too long|timed out/i);
  assert.match(result.textContent,/retry|Enter/i);
  assert.equal(window.document.querySelector('[role="combobox"]').value,'Hello');
  respond=true;
  window.document.querySelector('.dw-search').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));
  await tick();
  assert(panelOpen,'retry uses the existing popup');
  assert.equal(requestSignal.aborted,false,'retry gets a fresh request signal');
  assert.match(result.textContent,/A synthetic greeting/);
  assert.doesNotMatch(result.textContent,/Looking up|too long|timed out/i);
});

test('a Free API origin error stays an availability failure rather than claiming the word is absent',async()=>{
  const lookup=createLookupService({providers,fetch:async()=>new Response('Origin connection timed out',{status:522})});
  assert.deepEqual(await lookup.lookup({term:{original:'computer',query:'computer',language:'en'},providerId:'free-en'}),{status:'unavailable'});
});

test('a Merriam-Webster definition costs one request and still shows its matching words',async t=>{
  const dom=new JSDOM('<div id="contentAreaContextMenu"></div><div id="mainPopupSet"></div>');
  const window=dom.window;
  window.document.createXULElement=tag=>{const node=window.document.createElement(tag);node.openPopup=()=>{};node.openPopupAtScreen=()=>{};node.hidePopup=()=>{};return node;};
  window.gBrowser={selectedBrowser:window.document.body,tabContainer:new window.EventTarget(),addTabsProgressListener(){},removeTabsProgressListener(){}};
  const requests=[];let reads=0,word='sense';
  const lookup=createLookupService({providers,credentials:{get:async()=>{reads++;return 'fixture-only-key';}},fetch:async url=>{requests.push(url);
    return Response.json(url.includes('/json/snese?')?['sense','snide']:[{meta:{id:'sense:1'},hwi:{hw:'sense'},fl:'noun',shortdef:['a meaning']},{meta:{id:'common sense'},hwi:{hw:'common sense'},fl:'noun',shortdef:['good judgment']}]);}});
  const controller=createController(window,{providers,lookup,settings:()=>({englishProvider:'mw-collegiate',textSize:14}),selection:{capture:async()=>({rawText:word}),isCurrent:()=>true,release(){}}});
  t.after(()=>{controller.destroy();window.close();});
  const options=()=>[...window.document.querySelectorAll('#dw-matches [role=option]')].map(node=>node.textContent);
  await controller.define();await tick();
  assert.equal(requests.length,1,'definition and suggestions share one request');assert.equal(reads,1,'one credential read per lookup');
  assert.match(window.document.querySelector('[data-result]').textContent,/a meaning/);
  assert.deepEqual(options(),['Common Sense']);assert.match(window.document.querySelector('.dw-matches').textContent,/Matching dictionary entries/);
  word='snese';await controller.define();await tick();
  assert.equal(requests.length,2);assert.equal(reads,2);
  assert.deepEqual(options(),['Sense','Snide'],'spelling suggestions come from the lookup response');
  assert.match(window.document.querySelector('.dw-matches').textContent,/Matching words/);
});
