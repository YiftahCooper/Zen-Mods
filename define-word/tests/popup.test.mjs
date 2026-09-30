import test from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';
import {createPopup} from '../src/popup.mjs';
test('compact popup renders text safely, applies RTL, and closes with Escape',()=>{
  const dom=new JSDOM('<button id="origin">origin</button>'),w=dom.window;let closed=0;
  w.document.createXULElement=tag=>{const n=w.document.createElement(tag);n.openPopup=()=>{};n.hidePopup=()=>{};return n;};
  w.gBrowser={selectedBrowser:w.document.body};w.document.getElementById('origin').focus();
  const popup=createPopup(w,{onClose(){closed++;},onLanguageChange(){},onProviderChange(){},onSettings(){}});
  popup.show(null);popup.render({term:{original:'שלום',language:'he'},providerId:'wiktionary-he',providers:[{id:'wiktionary-he',label:'ויקימילון',language:'he'}],outcome:{status:'ok',definition:{headword:'שלום',language:'he',senses:[{text:'<img src=x onerror=bad()>',examples:['example']}],sourceUrl:'javascript:bad()',attribution:{label:'Source',url:'javascript:bad()'}}}});
  assert.equal(w.document.querySelector('[data-result]').dir,'rtl');assert.equal(w.document.querySelectorAll('img,iframe,browser').length,0);assert(w.document.getElementById('define-word-panel').textContent.includes('<img src=x'));assert.equal(w.document.querySelector('[data-source]').hidden,true);
  w.document.getElementById('define-word-panel').dispatchEvent(new w.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert.equal(closed,1);
  popup.destroy();assert.equal(w.document.getElementById('define-word-panel'),null);dom.window.close();
});
test('Merriam-Webster results include the unmodified local brand image at an approved size',()=>{
  const dom=new JSDOM(''),w=dom.window;w.document.createXULElement=t=>{const n=w.document.createElement(t);n.openPopup=()=>{};n.hidePopup=()=>{};return n;};
  const popup=createPopup(w,{onClose(){}});popup.render({term:{original:'word',language:'en'},providerId:'mw-collegiate',providers:[],outcome:{status:'ok',definition:{headword:'word',language:'en',senses:[],sourceUrl:'https://www.merriam-webster.com/dictionary/word',attribution:{label:"Merriam-Webster's Collegiate® Dictionary",url:'https://www.merriam-webster.com/dictionary/word',brand:'merriam-webster'}}}});
  const logo=w.document.querySelector('img');assert(logo);assert.equal(logo.width,50);assert.equal(logo.height,50);assert.equal(logo.getAttribute('src'),'chrome://sine/content/define-word/assets/merriam-webster.png');popup.destroy();dom.window.close();
});

test('automatic dismissal preserves new focus while explicit close restores the invoking focus',()=>{
  const dom=new JSDOM('<button id="old">old</button><button id="next">next</button>'),w=dom.window;
  w.document.createXULElement=tag=>{const n=w.document.createElement(tag);n.openPopup=()=>{};n.hidePopup=()=>n.dispatchEvent(new w.Event('popuphidden'));return n;};w.gBrowser={selectedBrowser:w.document.body};
  const old=w.document.getElementById('old'),next=w.document.getElementById('next');let dismissed=0;const popup=createPopup(w,{onClose(){dismissed++;}});
  old.focus();popup.show();next.focus();popup.close({restoreFocus:false});assert.equal(w.document.activeElement,next);
  old.focus();popup.show();next.focus();w.document.getElementById('define-word-panel').dispatchEvent(new w.Event('popuphidden'));assert.equal(w.document.activeElement,next);assert.equal(dismissed,1);
  old.focus();popup.show();popup.close({restoreFocus:true});assert.equal(w.document.activeElement,old);popup.destroy();dom.window.close();
});

test('niqqud retry keeps the original selected word and labels the different dictionary headword',()=>{
  const dom=new JSDOM(''),w=dom.window;w.document.createXULElement=t=>{const n=w.document.createElement(t);n.openPopup=()=>{};n.hidePopup=()=>{};return n;};
  const popup=createPopup(w,{onClose(){}});popup.render({term:{original:'שָׁלוֹם',language:'he'},providerId:'wiktionary-he',providers:[],outcome:{status:'ok',normalizedRetry:true,definition:{headword:'שלום',language:'he',senses:[],sourceUrl:'https://he.wiktionary.org/wiki/שלום',attribution:{label:'ויקימילון',url:'https://he.wiktionary.org/wiki/שלום'}}}});
  assert.equal(w.document.querySelector('h2').textContent,'שָׁלוֹם');assert.match(w.document.querySelector('[data-headword]').textContent,/שלום/);popup.destroy();dom.window.close();
});

test('missing Hebrew entry names the dictionary without suggesting a nonexistent alternative',()=>{
  const dom=new JSDOM(''),w=dom.window;w.document.createXULElement=t=>{const n=w.document.createElement(t);n.openPopup=()=>{};n.hidePopup=()=>{};return n;};
  const popup=createPopup(w,{onClose(){}});popup.render({term:{original:'מדריך',language:'he'},providerId:'wiktionary-he',providers:[{id:'wiktionary-he',label:'ויקימילון'}],outcome:{status:'no-result'}});
  const text=w.document.querySelector('[data-result]').textContent;assert(text.includes('ויקימילון'));assert(!text.includes('Try another dictionary'));assert(text.includes('מדריך'));popup.destroy();dom.window.close();
});
