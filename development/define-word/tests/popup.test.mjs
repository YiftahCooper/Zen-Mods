import test from 'node:test';import assert from 'node:assert/strict';import {JSDOM} from 'jsdom';
import {createPopup} from '../src/popup.mjs';

function queryFixture(t){
  const dom=new JSDOM(''),w=dom.window,searches=[],changes=[],inputs=[];
  w.document.createXULElement=tag=>w.document.createElement(tag);
  const popup=createPopup(w,{onSearch:value=>searches.push(value),onProviderChange:(id,value)=>changes.push({id,value}),onQueryInput:value=>inputs.push(value)});
  t.after(()=>{popup.destroy();dom.window.close();});
  const state={term:{original:'may',language:'en'},providerId:'mw-collegiate',providers:[{id:'mw-collegiate',language:'en',label:'Merriam-Webster'},{id:'free-en',language:'en',label:'Free Dictionary'}]};
  popup.render({...state,outcome:{status:'loading'}});popup.render({...state,outcome:{status:'no-result'}});
  return {w,popup,searches,changes,inputs,input:w.document.querySelector('[role=combobox]'),provider:w.document.querySelector('select'),submit(){w.document.querySelector('form').dispatchEvent(new w.Event('submit',{cancelable:true}));},change(){const provider=w.document.querySelector('select');provider.value='free-en';provider.dispatchEvent(new w.Event('change'));}};
}

test('Search preserves original case beneath an unedited title-cased input',t=>{
  const h=queryFixture(t);assert.equal(h.input.value,'May');h.submit();
  assert.deepEqual(h.searches,['may'],'visual title casing must not change the modal verb into the month');
});

test('dictionary changes preserve original case beneath an unedited title-cased input',t=>{
  const h=queryFixture(t);assert.equal(h.input.value,'May');h.change();
  assert.deepEqual(h.changes,[{id:'free-en',value:'may'}]);
});

test('an input event makes user-edited case authoritative for Search and dictionary changes',t=>{
  const h=queryFixture(t);h.input.value='May';h.input.dispatchEvent(new h.w.Event('input'));
  h.submit();h.change();
  assert.deepEqual(h.inputs,['May']);assert.deepEqual(h.searches,['May']);assert.deepEqual(h.changes,[{id:'free-en',value:'May'}]);
});

test('suggestion selection preserves the chosen spelling for later Search and dictionary changes',t=>{
  const h=queryFixture(t);
  for(const word of ['may','May','NASA']){
    h.popup.renderSuggestions({label:'Matching words',outcome:{status:'ok',suggestions:[{word,language:'en'}]}});
    h.w.document.querySelector('[role=option]').click();assert.equal(h.searches.at(-1),word);
    h.submit();assert.equal(h.searches.at(-1),word);h.change();assert.deepEqual(h.changes.at(-1),{id:'free-en',value:word});
  }
});

test('suggestions deduplicate case variants and title-case display without altering provider queries or niqqud',()=>{
  const dom=new JSDOM(''),w=dom.window,queries=[];
  w.document.createXULElement=t=>w.document.createElement(t);
  const popup=createPopup(w,{onSearch:q=>queries.push(q)});
  popup.renderSuggestions({label:'Matches',outcome:{status:'ok',suggestions:[{word:'define',language:'en'},{word:'Define',language:'en'},{word:'DEFINE',language:'en'},{word:'web browser',language:'en'},{word:'שָׁלוֹם',language:'he'}]}});
  const options=[...w.document.querySelectorAll('[role=option]')];
  assert.deepEqual(options.map(n=>n.textContent),['Define','Web Browser','שָׁלוֹם']);
  options[0].click();assert.deepEqual(queries,['define']);
  assert(![...w.document.querySelectorAll('button')].some(n=>/settings/i.test(n.textContent)));
  popup.destroy();dom.window.close();
});

test('English result has one title-cased heading without redundant lowercase-entry explanation',()=>{
  const dom=new JSDOM(''),w=dom.window;w.document.createXULElement=t=>w.document.createElement(t);
  const popup=createPopup(w,{});
  popup.render({term:{original:'DEFINE',language:'en'},providers:[],outcome:{status:'ok',normalizedRetry:true,definition:{headword:'define',language:'en',senses:[],attribution:{label:'Dictionary',url:'https://en.wiktionary.org/wiki/define'}}}});
  assert.equal(w.document.querySelector('h2').textContent,'Define');
  assert(w.document.querySelector('[data-headword]').hidden);
  assert(!w.document.querySelector('[data-result]').textContent.includes('lowercase'));
  popup.destroy();dom.window.close();
});
test('editable bilingual search is prefilled, submits Enter, and supports keyboard suggestions',()=>{
  const dom=new JSDOM(''),w=dom.window;w.document.createXULElement=t=>{const n=w.document.createElement(t);n.openPopup=()=>{};n.hidePopup=()=>{};return n;};const queries=[];
  const popup=createPopup(w,{onClose(){},onQueryInput:q=>queries.push(['input',q]),onSearch:q=>queries.push(['search',q])});
  popup.render({term:{original:'Browser',language:'en'},providerId:'wiktionary-en',providers:[{id:'wiktionary-en',language:'en',label:'Wiktionary'}],textSize:20,outcome:{status:'loading'}});
  const input=w.document.querySelector('[role=combobox]');assert(input);assert.equal(input.value,'Browser');input.value='בית';input.dispatchEvent(new w.Event('input'));assert.deepEqual(queries.at(-1),['input','בית']);
  w.document.querySelector('form').dispatchEvent(new w.Event('submit',{cancelable:true}));assert.deepEqual(queries.at(-1),['search','בית']);
  popup.renderSuggestions({outcome:{status:'ok',suggestions:[{word:'בית',language:'he'},{word:'ביתה',language:'he'}]},label:'Search suggestions'});input.dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));assert(input.hasAttribute('aria-activedescendant'));input.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));assert.deepEqual(queries.at(-1),['search','בית']);assert.equal(input.getAttribute('aria-expanded'),'false');
  assert.equal(w.document.querySelector('.dw-shell').style.getPropertyValue('--dw-text-size'),'20px');assert.equal(w.document.querySelector('[data-source]').textContent,'View dictionary entry');assert(w.document.querySelector('.dw-bar select'));
  popup.renderSuggestions({outcome:{status:'ok',suggestions:[{word:'one',language:'en'},{word:'two',language:'en'},{word:'three',language:'en'}]},label:'Search suggestions'});input.dispatchEvent(new w.KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true}));input.dispatchEvent(new w.KeyboardEvent('keydown',{key:'Enter',bubbles:true}));assert.deepEqual(queries.at(-1),['search','three']);
  popup.destroy();dom.window.close();
});
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
