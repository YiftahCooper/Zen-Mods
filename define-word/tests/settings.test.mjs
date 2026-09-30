import test from 'node:test';import assert from 'node:assert/strict';
import {readSettings,saveSettings} from '../src/settings.mjs';
const store=()=>{const values=new Map();return {values,getStringPref:(k,d)=>values.get(k)??d,setStringPref:(k,v)=>values.set(k,v)};};
test('settings default to working public dictionaries and reject a language mismatch',()=>{
  const p=store(),s=readSettings(p);assert.equal(s.englishProvider,'wiktionary-en');assert.equal(s.hebrewProvider,'wiktionary-he');
  assert.throws(()=>saveSettings(p,{...s,englishProvider:'wiktionary-he'}));assert.equal(p.values.size,0);
  saveSettings(p,{...s,shortcut:null});assert.equal(readSettings(p).shortcut,null);
  assert(![...p.values.keys()].some(k=>/key|credential/i.test(k)));
});
