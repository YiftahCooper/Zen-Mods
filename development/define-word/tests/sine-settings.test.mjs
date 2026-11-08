import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {readFileSync} from 'node:fs';
import {createSineSettingsBridge} from '../src/sine-settings.mjs';
const tick=()=>new Promise(r=>setImmediate(r));
function fixture(){
  const dom=new JSDOM('<main></main>',{url:'https://example.invalid'}),window=dom.window;
  const values=new Map(),keys=new Map(),changes=[];
  const prefs={getStringPref:(k,d)=>values.get(k)??d,getBoolPref:(k,d)=>values.get(k)??d,setStringPref:(k,v)=>values.set(k,v)};
  const credentials={get:async id=>keys.get(id),set:async(id,key)=>keys.set(id,key),remove:async id=>keys.delete(id)};
  const options={prefs,credentials,browserWindow:()=>window,onCredentialsChanged:id=>changes.push(id)};
  function addCard(){window.document.querySelector('main').innerHTML='<section mod-id="define-word"><button class="sineItemConfigureButton">Configure</button><dialog class="sineItemPreferenceDialog"><div class="sineItemPreferenceDialogTopBar"><h3>Define Word</h3><button>Close</button></div><div class="sineItemPreferenceDialogContent"></div></dialog></section>';}
  return {dom,window,values,keys,changes,options,addCard};
}
test('Sine Configure autosaves masked keys on change, keeps values, and conceals revealed keys on close',async t=>{
  const h=fixture();t.after(()=>h.dom.window.close());const bridge=createSineSettingsBridge(h.window,h.options);t.after(()=>bridge.destroy());h.addCard();await tick();
  const root=h.window.document.querySelector('[data-define-word-settings]');assert(root);assert.equal(root.querySelectorAll('input[type=password]').length,3);
  const buttons=[...root.querySelectorAll('button')];assert(buttons.some(b=>b.textContent==='Record shortcut'));assert(buttons.some(b=>b.textContent==='Save shortcut'));
  assert(!buttons.some(b=>/^(Save|Remove) key$/.test(b.textContent)));
  const input=root.querySelector('input[type=password]');input.value='synthetic-test-key';input.dispatchEvent(new h.window.Event('change'));await tick();assert.equal(h.keys.get('mw-collegiate'),'synthetic-test-key');assert.equal(input.value,'synthetic-test-key');assert.deepEqual(h.changes,['mw-collegiate']);assert(![...h.values.values()].includes('synthetic-test-key'));
  const reveal=root.querySelector('button[aria-label^="Show"]');reveal.click();assert.equal(input.type,'text');assert.equal(reveal.getAttribute('aria-pressed'),'true');h.window.document.querySelector('dialog').dispatchEvent(new h.window.Event('close'));assert.equal(input.type,'password');
  h.addCard();await tick();assert.equal(h.window.document.querySelectorAll('[data-define-word-settings]').length,1);bridge.destroy();assert.equal(h.window.document.querySelectorAll('[data-define-word-settings]').length,0);
});
test('shortcut editing saves only the shortcut and checks conflicts in browser chrome',async t=>{
  const h=fixture();t.after(()=>h.dom.window.close());h.addCard();const bridge=createSineSettingsBridge(h.window,h.options);t.after(()=>bridge.destroy());
  await tick();
  const root=h.window.document.querySelector('[data-define-word-settings]'),buttons=[...root.querySelectorAll('button')];buttons.find(b=>b.textContent==='Record shortcut').click();
  const field=root.querySelector('input[readonly]');field.dispatchEvent(new h.window.KeyboardEvent('keydown',{key:'י',code:'KeyH',ctrlKey:true,altKey:true,bubbles:true}));
  buttons.find(b=>b.textContent==='Save shortcut').click();assert.equal(JSON.parse(h.values.get('extension.define-word.shortcut')).code,'KeyH');assert.equal(h.values.size,1);
});

test('settings navigation opens the Sine dialog once without rewriting an about URL',t=>{
  const h=fixture();t.after(()=>h.dom.window.close());h.dom.reconfigure({url:'about:preferences?defineWordSettings=1#sineMods'});h.addCard();let opened=0;
  h.window.document.querySelector('.sineItemConfigureButton').addEventListener('click',()=>opened++);
  h.window.history.replaceState=()=>{throw Error('Do not rewrite privileged about URLs');};
  const bridge=createSineSettingsBridge(h.window,h.options);t.after(()=>bridge.destroy());assert.equal(opened,1);
});

test('settings deep link waits for its Configure button when Sine builds the card in stages',async t=>{
  const h=fixture();t.after(()=>h.dom.window.close());h.dom.reconfigure({url:'about:preferences?defineWordSettings=1#sineMods'});h.addCard();h.window.document.querySelector('.sineItemConfigureButton').remove();
  const bridge=createSineSettingsBridge(h.window,h.options);t.after(()=>bridge.destroy());let opened=0;
  const button=h.window.document.createElement('button');button.className='sineItemConfigureButton';button.addEventListener('click',()=>opened++);h.window.document.querySelector('[mod-id]').prepend(button);await tick();
  assert.equal(opened,1);h.window.document.querySelector('[mod-id]').append(h.window.document.createElement('p'));await tick();assert.equal(opened,1);
});

test('Lexicala key autosaves on blur and clearing it removes only its saved credential',async t=>{
  const h=fixture();t.after(()=>h.dom.window.close());h.addCard();const bridge=createSineSettingsBridge(h.window,h.options);t.after(()=>bridge.destroy());
  await tick();
  const label=[...h.window.document.querySelectorAll('label')].find(n=>n.textContent.includes('Lexicala'));assert(label,'Lexicala must have its own key field');
  const input=label.querySelector('input');assert.equal(input.type,'password');input.value='lexicala-fixture-only';
  input.dispatchEvent(new h.window.Event('blur'));await tick();
  assert.equal(h.keys.get('lexicala-he'),'lexicala-fixture-only');assert.equal(input.value,'lexicala-fixture-only');assert(![...h.values.values()].includes('lexicala-fixture-only'));assert.deepEqual(h.changes,['lexicala-he']);
  input.value='';input.dispatchEvent(new h.window.Event('change'));await tick();assert(!h.keys.has('lexicala-he'));
});

test('loading existing credentials cannot clear them and saved values return when Configure reopens',async t=>{
  const h=fixture();t.after(()=>h.dom.window.close());h.keys.set('mw-collegiate','fixture-existing');h.addCard();
  let resolve;h.options.credentials.get=id=>id==='mw-collegiate'?new Promise(r=>{resolve=r;}):Promise.resolve(null);
  const bridge=createSineSettingsBridge(h.window,h.options);t.after(()=>bridge.destroy());
  const input=h.window.document.querySelector('input[type=password]');assert(input.disabled);input.dispatchEvent(new h.window.Event('blur'));await tick();assert.equal(h.keys.get('mw-collegiate'),'fixture-existing');assert.equal(h.changes.length,0);
  resolve('fixture-existing');await tick();assert.equal(input.value,'fixture-existing');assert(!input.disabled);
  h.options.credentials.get=async id=>h.keys.get(id);h.keys.set('mw-collegiate','fixture-external-update');h.window.document.querySelector('dialog').setAttribute('open','');await tick();assert.equal(input.value,'fixture-external-update');
});

test('autosave serializes edits, deduplicates change plus blur, and does not overwrite newer input',async t=>{
  const h=fixture();t.after(()=>h.dom.window.close());h.addCard();let release,writes=0;
  h.options.credentials.set=async(id,key)=>{writes++;if(writes===1)await new Promise(r=>{release=r;});h.keys.set(id,key);};
  const bridge=createSineSettingsBridge(h.window,h.options);t.after(()=>bridge.destroy());await tick();
  const input=h.window.document.querySelector('input[type=password]');input.value='fixture-first';input.dispatchEvent(new h.window.Event('change'));input.dispatchEvent(new h.window.Event('blur'));await tick();assert.equal(writes,1);
  input.value='fixture-second';input.dispatchEvent(new h.window.Event('input'));input.dispatchEvent(new h.window.Event('change'));await tick();assert.equal(writes,1);release();await tick();assert.equal(writes,2);assert.equal(h.keys.get('mw-collegiate'),'fixture-second');assert.equal(input.value,'fixture-second');
});

test('returning to the key already being saved receives completion feedback without another write',async t=>{
  const h=fixture();t.after(()=>h.dom.window.close());h.addCard();let release,writes=0;h.options.credentials.set=async(id,key)=>{writes++;await new Promise(resolve=>{release=resolve;});h.keys.set(id,key);};
  const bridge=createSineSettingsBridge(h.window,h.options);t.after(()=>bridge.destroy());await tick();const input=h.window.document.querySelector('input[type=password]');
  input.value='fixture-A';input.dispatchEvent(new h.window.Event('input'));input.dispatchEvent(new h.window.Event('change'));await tick();
  input.value='fixture-B';input.dispatchEvent(new h.window.Event('input'));input.value='fixture-A';input.dispatchEvent(new h.window.Event('input'));input.dispatchEvent(new h.window.Event('blur'));release();await tick();
  assert.equal(writes,1);assert.equal(input.value,'fixture-A');assert.equal(h.keys.get('mw-collegiate'),'fixture-A');assert.equal(h.window.document.querySelector('[data-key-status]').textContent,'Key saved.');
});

test('failed autosave keeps the edited key masked and permits retry without leaking exception text',async t=>{
  const h=fixture();t.after(()=>h.dom.window.close());h.addCard();let fail=true;h.options.credentials.set=async(id,key)=>{if(fail)throw Error('fixture-sensitive-error');h.keys.set(id,key);};
  const bridge=createSineSettingsBridge(h.window,h.options);t.after(()=>bridge.destroy());await tick();const input=h.window.document.querySelector('input[type=password]');input.value='fixture-key';input.dispatchEvent(new h.window.Event('change'));await tick();
  assert.equal(input.value,'fixture-key');assert.equal(input.type,'password');assert.match(h.window.document.querySelector('[data-key-status]').textContent,/Could not save/);assert(!h.window.document.body.textContent.includes('fixture-sensitive-error'));assert.equal(h.changes.length,0);
  fail=false;input.dispatchEvent(new h.window.Event('blur'));await tick();assert.equal(h.keys.get('mw-collegiate'),'fixture-key');
});

test('failed credential loading never treats an untouched empty field as a removal',async t=>{
  const h=fixture();t.after(()=>h.dom.window.close());h.keys.set('mw-collegiate','fixture-existing');h.options.credentials.get=async()=>{throw Error('fixture-sensitive-read-error');};h.addCard();
  const bridge=createSineSettingsBridge(h.window,h.options);t.after(()=>bridge.destroy());await tick();const input=h.window.document.querySelector('input[type=password]');input.dispatchEvent(new h.window.Event('blur'));await tick();
  assert.equal(h.keys.get('mw-collegiate'),'fixture-existing');assert.equal(h.changes.length,0);assert(!h.window.document.body.textContent.includes('fixture-sensitive-read-error'));
  input.value='fixture-replacement';input.dispatchEvent(new h.window.Event('input'));input.dispatchEvent(new h.window.Event('change'));await tick();assert.equal(h.keys.get('mw-collegiate'),'fixture-replacement');
});

test('late credential reads cannot repopulate destroyed controls',async t=>{
  const h=fixture();t.after(()=>h.dom.window.close());let release;h.options.credentials.get=id=>id==='mw-collegiate'?new Promise(r=>{release=r;}):Promise.resolve(null);h.addCard();
  const bridge=createSineSettingsBridge(h.window,h.options);await tick();const input=h.window.document.querySelector('input[type=password]');bridge.destroy();release('fixture-existing');await tick();assert.equal(input.value,'');assert(!input.isConnected);
});

test('a stale credential read cannot overwrite a newer Configure refresh',async t=>{
  const h=fixture();t.after(()=>h.dom.window.close());const reads=[];h.options.credentials.get=id=>id==='mw-collegiate'?new Promise(resolve=>reads.push(resolve)):Promise.resolve(null);h.addCard();
  const bridge=createSineSettingsBridge(h.window,h.options);t.after(()=>bridge.destroy());await tick();h.window.document.querySelector('dialog').setAttribute('open','');await tick();assert.equal(reads.length,2);
  reads[1]('fixture-newer');await tick();const input=h.window.document.querySelector('input[type=password]');assert.equal(input.value,'fixture-newer');reads[0]('fixture-stale');await tick();assert.equal(input.value,'fixture-newer');assert.equal(h.changes.length,0);
});

test('recorder checks the browser window keys even when preferences has no key elements',t=>{
  const h=fixture(),chrome=new JSDOM('<key id="existing-command" key="H" modifiers="control,alt"></key>');t.after(()=>{h.dom.window.close();chrome.window.close();});h.addCard();
  const bridge=createSineSettingsBridge(h.window,{...h.options,browserWindow:()=>chrome.window});t.after(()=>bridge.destroy());
  const root=h.window.document.querySelector('[data-define-word-settings]');[...root.querySelectorAll('button')].find(b=>b.textContent==='Record shortcut').click();
  root.querySelector('input[readonly]').dispatchEvent(new h.window.KeyboardEvent('keydown',{key:'h',code:'KeyH',ctrlKey:true,altKey:true,bubbles:true}));
  assert(root.textContent.includes('existing-command'));assert.equal(h.values.size,0);
});

test('settings warn when the saved shortcut is inactive due to a browser conflict',t=>{
  const h=fixture(),chrome=new JSDOM('<key id="existing-command" key="D" modifiers="control,alt"></key>');t.after(()=>{h.dom.window.close();chrome.window.close();});h.addCard();
  const bridge=createSineSettingsBridge(h.window,{...h.options,browserWindow:()=>chrome.window});t.after(()=>bridge.destroy());
  const root=h.window.document.querySelector('[data-define-word-settings]');assert.match(root.querySelector('[role=status]:not([data-key-status]):not([data-text-size-status])').textContent,/inactive.*existing-command/i);
  chrome.window.document.querySelector('key').remove();h.window.document.querySelector('dialog').dispatchEvent(new h.window.Event('close'));assert.equal(root.querySelector('[role=status]:not([data-key-status]):not([data-text-size-status])').textContent,'');
});

test('late native preferences precede the controls and layout resets remain scoped to this mod',async t=>{
  const h=fixture();t.after(()=>h.dom.window.close());h.addCard();const style=h.window.document.createElement('style');style.textContent='section { gap: 60px; } p { margin: 50px; } dialog { min-width:60vw; }'+readFileSync(new URL('../style.css',import.meta.url),'utf8');h.window.document.head.append(style);const bridge=createSineSettingsBridge(h.window,h.options);t.after(()=>bridge.destroy());
  const content=h.window.document.querySelector('.sineItemPreferenceDialogContent'),native=h.window.document.createElement('hbox');content.append(native);await tick();assert.equal(content.firstElementChild,native);const root=content.lastElementChild;assert(root.hasAttribute('data-define-word-settings'));assert.equal(root.tagName,'DIV');assert.equal(h.window.getComputedStyle(root).gap,'8px');assert.equal(h.window.getComputedStyle(root.querySelector('p')).margin,'0px');assert.equal(h.window.getComputedStyle(h.window.document.querySelector('dialog')).minWidth,'0');
});

test('the actual Sine Configure class stays capped despite Sine viewport and intrinsic-width rules',t=>{
  const h=fixture();t.after(()=>h.dom.window.close());h.addCard();
  const style=h.window.document.createElement('style');style.textContent='dialog { width:max-content !important; min-width:60vw; max-width:96vw; padding:20px !important; } .sineItemPreferenceDialogContent { width:max-content; min-width:100%; max-width:calc(96vw - 40px); }'+readFileSync(new URL('../style.css',import.meta.url),'utf8');h.window.document.head.append(style);
  const dialog=h.window.document.querySelector('.sineItemPreferenceDialog'),computed=h.window.getComputedStyle(dialog);assert.equal(computed.maxWidth,'800px');assert.equal(computed.minWidth,'0');assert.equal(computed.boxSizing,'border-box');
  const unrelated=h.window.document.createElement('dialog');unrelated.className='sineItemPreferenceDialog';h.window.document.body.append(unrelated);assert.equal(h.window.getComputedStyle(unrelated).minWidth,'60vw');
});

test('typed popup size saves valid values while empty and out-of-range edits preserve the saved preference',async t=>{
  const h=fixture();t.after(()=>h.dom.window.close());h.values.set('extension.define-word.text-size','20');h.addCard();
  const bridge=createSineSettingsBridge(h.window,h.options);t.after(()=>bridge.destroy());await tick();
  const input=h.window.document.querySelector('input[type=number]');assert(input,'Configure needs a typed numeric size input');assert.equal(input.value,'20');
  for(const value of ['', '9.9','32.1']){
    input.value=value;input.dispatchEvent(new h.window.Event('change'));assert.equal(h.values.get('extension.define-word.text-size'),'20');assert.equal(input.getAttribute('aria-invalid'),'true');
  }
  input.value='15.5';input.dispatchEvent(new h.window.Event('change'));assert.equal(h.values.get('extension.define-word.text-size'),'15.5');assert.equal(input.getAttribute('aria-invalid'),'false');
  h.values.set('extension.define-word.text-size','17');h.window.document.querySelector('dialog').setAttribute('open','');await tick();assert.equal(input.value,'17');
});

test('credential inputs suppress the native eye while retaining password masking and one accessible custom toggle',async t=>{
  const h=fixture();t.after(()=>h.dom.window.close());h.keys.set('mw-collegiate','synthetic-persisted-key');h.addCard();
  const style=h.window.document.createElement('style');style.textContent=readFileSync(new URL('../style.css',import.meta.url),'utf8');h.window.document.head.append(style);
  const bridge=createSineSettingsBridge(h.window,h.options);t.after(()=>bridge.destroy());await tick();
  for(const field of h.window.document.querySelectorAll('.dw-key-field')){
    const input=field.querySelector('input'),toggles=field.querySelectorAll('button');assert.equal(toggles.length,1);assert.equal(input.type,'password');assert.equal(h.window.getComputedStyle(input).appearance,'textfield');
    const toggle=toggles[0];assert.match(toggle.getAttribute('aria-label'),/^Show .* API key$/);toggle.click();assert.equal(input.type,'text');assert.equal(toggle.getAttribute('aria-pressed'),'true');toggle.click();assert.equal(input.type,'password');
  }
  assert.equal(h.window.document.querySelector('#dw-key-mw-collegiate').value,'synthetic-persisted-key');
});
