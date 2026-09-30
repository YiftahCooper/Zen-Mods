import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {createSineSettingsBridge} from '../src/sine-settings.mjs';
const tick=()=>new Promise(r=>setImmediate(r));
function fixture(){
  const dom=new JSDOM('<main></main>',{url:'https://example.invalid'}),window=dom.window;
  const values=new Map(),keys=new Map(),changes=[];
  const prefs={getStringPref:(k,d)=>values.get(k)??d,getBoolPref:(k,d)=>values.get(k)??d,setStringPref:(k,v)=>values.set(k,v)};
  const credentials={get:async id=>keys.get(id),set:async(id,key)=>keys.set(id,key),remove:async id=>keys.delete(id)};
  const options={prefs,credentials,browserWindow:()=>window,onCredentialsChanged:id=>changes.push(id)};
  function addCard(){window.document.querySelector('main').innerHTML='<section mod-id="define-word"><button class="sineItemConfigureButton">Configure</button><dialog><div class="sineItemPreferenceDialogContent"></div></dialog></section>';}
  return {dom,window,values,keys,changes,options,addCard};
}
test('Sine Configure contains masked key actions and shortcut recorder without performing a lookup',async t=>{
  const h=fixture();t.after(()=>h.dom.window.close());const bridge=createSineSettingsBridge(h.window,h.options);t.after(()=>bridge.destroy());h.addCard();await tick();
  const root=h.window.document.querySelector('[data-define-word-settings]');assert(root);assert.equal(root.querySelectorAll('input[type=password]').length,2);
  const buttons=[...root.querySelectorAll('button')];assert(buttons.some(b=>b.textContent==='Record shortcut'));assert(buttons.some(b=>b.textContent==='Save shortcut'));
  const input=root.querySelector('input[type=password]');input.value='synthetic-test-key';buttons.find(b=>b.textContent==='Save key').click();await tick();assert.equal(h.keys.get('mw-collegiate'),'synthetic-test-key');assert.equal(input.value,'');assert.deepEqual(h.changes,['mw-collegiate']);assert(![...h.values.values()].includes('synthetic-test-key'));
  root.querySelector('input[type=password]').value='unsaved';h.window.document.querySelector('dialog').dispatchEvent(new h.window.Event('close'));assert.equal(input.value,'');
  h.addCard();await tick();assert.equal(h.window.document.querySelectorAll('[data-define-word-settings]').length,1);bridge.destroy();assert.equal(h.window.document.querySelectorAll('[data-define-word-settings]').length,0);
});
test('shortcut editing saves only the shortcut and checks conflicts in browser chrome',async t=>{
  const h=fixture();t.after(()=>h.dom.window.close());h.addCard();const bridge=createSineSettingsBridge(h.window,h.options);t.after(()=>bridge.destroy());
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
  const root=h.window.document.querySelector('[data-define-word-settings]');assert.match(root.querySelector('[role=status]').textContent,/inactive.*existing-command/i);
  chrome.window.document.querySelector('key').remove();h.window.document.querySelector('dialog').dispatchEvent(new h.window.Event('close'));assert.equal(root.querySelector('[role=status]').textContent,'');
});
