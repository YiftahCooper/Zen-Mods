import test from 'node:test';import assert from 'node:assert/strict';
import {readSettings,saveSettings} from '../src/settings.mjs';
const store=()=>{const values=new Map();return {values,getStringPref:(k,d)=>values.get(k)??d,setStringPref:(k,v)=>values.set(k,v)};};
test('settings default to working public dictionaries and reject a language mismatch',()=>{
  const p=store(),s=readSettings(p);assert.equal(s.englishProvider,'wiktionary-en');assert.equal(s.hebrewProvider,'academy-he');
  assert.throws(()=>saveSettings(p,{...s,englishProvider:'wiktionary-he'}));assert.equal(p.values.size,0);
  saveSettings(p,{...s,shortcut:null});assert.equal(readSettings(p).shortcut,null);
  assert(![...p.values.keys()].some(k=>/key|credential/i.test(k)));
});
test('Hebrew fallback uses Academy while preserving a previously selected valid dictionary',()=>{
  const p=store();p.values.set('extension.define-word.hebrew','wiktionary-he');assert.equal(readSettings(p).hebrewProvider,'wiktionary-he');
  p.values.set('extension.define-word.hebrew','lexicala-he');assert.equal(readSettings(p).hebrewProvider,'lexicala-he');
  p.values.set('extension.define-word.hebrew','not-a-provider');assert.equal(readSettings(p).hebrewProvider,'academy-he');
});
test('popup font preference accepts supported sizes and safely defaults invalid values',()=>{const p=store();assert.equal(readSettings(p).textSize,14);p.values.set('extension.define-word.text-size','20');assert.equal(readSettings(p).textSize,20);p.values.set('extension.define-word.text-size','1000');assert.equal(readSettings(p).textSize,14);});
test('popup font preference supports typed sizes throughout its bounds without rewriting malformed stored data',()=>{
  const p=store();
  for(const [raw,want] of [['10',10],['13',13],['15.5',15.5],['32',32],['9.9',14],['32.1',14],['',14],['NaN',14],['Infinity',14],['12px',14]]){
    p.values.set('extension.define-word.text-size',raw);assert.equal(readSettings(p).textSize,want,raw);assert.equal(p.values.get('extension.define-word.text-size'),raw);
  }
});
