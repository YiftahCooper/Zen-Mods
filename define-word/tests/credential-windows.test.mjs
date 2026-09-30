import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {JSDOM} from 'jsdom';
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('removing a shared key in window B cancels window A and rejects its late response',async t=>{
  const source=await readFile(new URL('../define-word.uc.js',import.meta.url),'utf8');
  const topics=new Map(),requests=[];let logins=[{password:'fixture-only-key'}];
  const obs={addObserver(o,topic){if(!topics.has(topic))topics.set(topic,new Set());topics.get(topic).add(o);},removeObserver(o,topic){topics.get(topic)?.delete(o);},notifyObservers(subject,topic,data){for(const o of topics.get(topic)||[])o.observe(subject,topic,data);}};
  const prefs={getStringPref:(k,d)=>k.endsWith('.english')?'mw-collegiate':d,addObserver(){},removeObserver(){}};
  const services={prefs,obs,logins:{isLoggedIn:true,findLogins:()=>logins,removeLogin:()=>{logins=[];}}};
  function makeWindow(settings=false){
    const markup=settings?'<section mod-id="define-word"><button class="sineItemConfigureButton">Configure</button><dialog><div class="sineItemPreferenceDialogContent"></div></dialog></section>':'<div id="mainPopupSet"></div><div id="contentAreaContextMenu"></div><div id="browser"></div>';
    const dom=new JSDOM(markup,{runScripts:'outside-only',url:settings?'about:preferences#sineMods':'https://example.invalid'}),w=dom.window;
    t.after(()=>{w.__defineWord?.unload();dom.window.close();});
    Object.defineProperty(w.document,'readyState',{value:'complete'});
    w.document.createXULElement=tag=>{const n=w.document.createElement(tag);n.openPopup=()=>{};n.hidePopup=()=>n.dispatchEvent(new w.Event('popuphidden'));return n;};
    w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};
    w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
    w.Services=services;w.TextDecoder=TextDecoder;w.browsingContext={topChromeWindow:w};
    w.ChromeUtils={importESModule:()=>({acquireSelectionService:()=>({capture:async()=>({rawText:'word',contextId:1,innerWindowId:1}),isCurrent:()=>true,release(){}})})};
    const progress=new Set();w.gBrowser={selectedBrowser:w.document.getElementById('browser'),tabContainer:new w.EventTarget(),addTabsProgressListener:l=>progress.add(l),removeTabsProgressListener:l=>progress.delete(l)};
    w.gContextMenu={selectionInfo:{text:'word'},frameBrowsingContext:{}};
    w.fetch=(url,options)=>new Promise(resolve=>requests.push({url,options,resolve}));
    if(settings)delete w.gBrowser;
    w.eval(source);return w;
  }
  const a=makeWindow(),b=makeWindow(true);
  a.document.getElementById('define-word-menu').dispatchEvent(new a.Event('command'));await tick();
  assert.equal(requests.length,1);
  b.eval(source);assert.equal(b.document.querySelectorAll('[data-define-word-settings]').length,1);
  [...b.document.querySelectorAll('[data-define-word-settings] button')].find(n=>n.textContent==='Remove key').click();await tick();
  assert.equal(logins.length,0);assert(requests[0].options.signal.aborted,'other window must cancel after the shared key is removed');
  requests[0].resolve(new Response(JSON.stringify([{hwi:{hw:'word'},fl:'noun',shortdef:['STALE DEFINITION']}])));await tick();await tick();
  assert(!a.document.getElementById('define-word-panel').textContent.includes('STALE DEFINITION'));
  a.__defineWord.unload();b.__defineWord.unload();assert.equal([...topics.values()].reduce((n,set)=>n+set.size,0),0);
});
