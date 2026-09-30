import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {parseFreeDictionary} from '../src/providers/free-dictionary.mjs';
import {parseEnglishWiktionary,parseHebrewWiktionary} from '../src/providers/wiktionary.mjs';
import {parseMerriamWebster} from '../src/providers/merriam-webster.mjs';
import {providers} from '../src/providers/registry.mjs';
import {requestJson} from '../src/providers/http.mjs';
const doc=html=>new JSDOM(html).window.document;
test('free parser produces senses and license attribution without accepting script URLs',()=>{
  const result=parseFreeDictionary([{word:'hello',license:{name:'CC BY-SA 3.0',url:'https://creativecommons.org/licenses/by-sa/3.0/'},sourceUrls:['javascript:alert(1)'],meanings:[{partOfSpeech:'noun',definitions:[{definition:'A greeting.',example:'Hello, Jo.'}]}]}]);
  assert.equal(result.senses[0].text,'A greeting.');assert.equal(result.attribution.licenseLabel,'CC BY-SA 3.0');assert(result.sourceUrl.startsWith('https://'));
  assert.equal(parseFreeDictionary({title:'No Definitions Found'}),null);
});
test('English Wiktionary reads only the English language and separates examples',()=>{
  const d=doc('<h2><span id="English">English</span></h2><h3>Noun</h3><ol><li>A device.<dl><dd>A sample use.</dd></dl><sup>1</sup></li></ol><h2 id="French">French</h2><ol><li>Foreign sense.</li></ol>');
  const r=parseEnglishWiktionary(d,'computer');assert.equal(r.language,'en');assert.deepEqual(r.senses.map(x=>x.text),['A device.']);assert.deepEqual(r.senses[0].examples,['A sample use.']);
});
test('Hebrew parser extracts definitions and ignores a later translation list',()=>{
  const d=doc('<h2>שָׁלוֹם</h2><p>שם עצם</p><ol><li>ברכה בעת פגישה.</li></ol><h3>תרגום</h3><ol><li>English translation</li></ol>');
  const r=parseHebrewWiktionary(d,'שלום');assert.equal(r.language,'he');assert.deepEqual(r.senses.map(x=>x.text),['ברכה בעת פגישה.']);
});
test('Merriam-Webster suggestions are not definitions and tokens become plain text',()=>{
  assert.equal(parseMerriamWebster(['word','ward'],'word','mw-collegiate'),null);
  const r=parseMerriamWebster([{meta:{id:'word'},hwi:{hw:'word'},fl:'noun',shortdef:['a {it}unit{/it} of speech']}],'word','mw-collegiate');
  assert.equal(r.senses[0].text,'a unit of speech');assert.equal(r.senses[0].partOfSpeech,'noun');
});
test('provider request is encoded, cookie-free, referrer-free and redirect rejecting',async()=>{
  let url,options;
  await providers.get('free-en').lookup({query:'a&b',signal:new AbortController().signal,fetch:async(u,o)=>{url=u;options=o;return new Response('[]');}});
  assert.equal(url,'https://api.dictionaryapi.dev/api/v2/entries/en/a%26b');assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');assert.equal(options.referrerPolicy,'no-referrer');
});
test('HTTP errors and oversized or malformed responses stay bounded',async()=>{
  for(const [response,code] of [[new Response('',{status:429}),'rate-limit'],[new Response('not json'),'unavailable'],[new Response('x'.repeat(1048577)),'unavailable']]) {
    await assert.rejects(requestJson('https://example.invalid',{fetch:async()=>response}),e=>e.code===code);
  }
});
