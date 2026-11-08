import test from 'node:test';
import assert from 'node:assert/strict';
import {requestJson} from '../src/providers/http.mjs';

// Synthetic fixtures derived from https://api.lexicala.com/documentation/.
// They are contract tests, not captured live API responses or lexical content.
const envelope=results=>({n_results:results.length,page_number:1,results_per_page:10,n_pages:1,results});
const entry={id:'synthetic-he-1',language:'he',headword:'מדריך',pos:'noun',senses:[{id:'synthetic-sense-1',definition:'אדם המלווה ומסביר.'}]};
const adapter=async()=>{
  const module=await import('../src/providers/lexicala.mjs').catch(()=>({}));
  assert.equal(typeof module.parseLexicalaHebrew,'function','Hebrew parser must be available');
  assert.equal(typeof module.lexicalaHebrew?.lookup,'function','Hebrew provider must be available');
  return module;
};

test('Lexicala parses source Hebrew definitions and retains the returned lemma',async()=>{
  const {parseLexicalaHebrew}=await adapter();
  const result=parseLexicalaHebrew(envelope([entry]),'המדריכים');
  assert.equal(result.headword,'מדריך');assert.equal(result.language,'he');
  assert.equal(result.senses[0].text,'אדם המלווה ומסביר.');assert.equal(result.senses[0].partOfSpeech,'noun');
  assert.equal(result.attribution.url,'https://lexicala.com/');assert.match(result.attribution.label,/Lexicala/);
  assert.equal(result.sourceUrl,undefined);
});

test('Lexicala never promotes translations, missing-language or foreign definitions to Hebrew',async()=>{
  const {parseLexicalaHebrew}=await adapter();
  const mixed=[null,{...entry,language:'en'},{...entry,language:undefined},{...entry,senses:[{definition:'A guide.',translations:{he:{text:'מדריך'}}}]},{...entry,senses:[{translations:{he:{text:'מדריך'}}}]},entry];
  assert.deepEqual(parseLexicalaHebrew(envelope(mixed),'מדריך').senses.map(s=>s.text),['אדם המלווה ומסביר.']);
  assert.equal(parseLexicalaHebrew(envelope(mixed.slice(0,-1)),'מדריך'),null);
});

test('Lexicala safely rejects malformed envelopes and empty results',async()=>{
  const {parseLexicalaHebrew}=await adapter();
  for(const malformed of [undefined,null,[],{}, {results:{}},{message:'bad key'}, {error:'rate limited'}])assert.throws(()=>parseLexicalaHebrew(malformed),e=>e.code==='unavailable');
  assert.equal(parseLexicalaHebrew(envelope([])),null);
  assert.equal(parseLexicalaHebrew(envelope([{...entry,headword:undefined},{...entry,senses:{}},{...entry,senses:[null,{definition:{he:'טקסט'}}]}])),null);
});

test('Lexicala ranks exact unpointed lemma first and never mixes different lemma senses',async()=>{
  const {parseLexicalaHebrew}=await adapter();
  const result=parseLexicalaHebrew(envelope([{...entry,headword:'בית ספר'},{...entry,headword:'בַּיִת',senses:[{definition:'מבנה למגורים.'}]},{...entry,headword:'בִּית',pos:'verb',senses:[{definition:'הגדרה נוספת.'}]}]),'בית');
  assert.equal(result.headword,'בַּיִת');assert.deepEqual(result.senses.map(s=>s.text),['מבנה למגורים.']);
  assert.deepEqual(result.matches,[{word:'בית ספר',language:'he'},{word:'בִּית',language:'he'}]);
});

test('Lexicala accepts documented headword objects and bounds definitions and examples',async()=>{
  const {parseLexicalaHebrew}=await adapter();
  const definitions=Array.from({length:30},(_,i)=>({id:String(i),definition:`הגדרה ${i}`,examples:[{text:'משפט לדוגמה.'},{text:'English only.'},{translations:{he:{text:'לא דוגמה במקור'}}},{text:'שני.'},{text:'שלישי.'},{text:'רביעי.'}]}));
  const result=parseLexicalaHebrew(envelope([{...entry,headword:[{text:'מדריך',pos:'noun'}],senses:definitions}]));
  assert.equal(result.headword,'מדריך');assert.equal(result.senses.length,20);assert.equal(result.senses[0].partOfSpeech,'noun');
  assert.deepEqual(result.senses[0].examples,['משפט לדוגמה.','שני.','שלישי.']);
  const literal=parseLexicalaHebrew(envelope([{...entry,headword:{text:'מדריך'},senses:[{definition:'<img onerror="bad()"> הגדרה'}]}]));
  assert.equal(literal.senses[0].text,'<img onerror="bad()"> הגדרה');
});

test('Lexicala uses one encoded search with a header-only key and no ambient credentials',async()=>{
  const {lexicalaHebrew}=await adapter();let count=0,url,options;
  const signal=new AbortController().signal;
  await lexicalaHebrew.lookup({query:'המדריכים & שלום',key:'synthetic-key',signal,fetch:async(u,o)=>{count++;url=new URL(u);options=o;return Response.json(envelope([entry]));}});
  assert.equal(count,1);assert.equal(url.origin,'https://lexicala1.p.rapidapi.com');assert.equal(url.pathname,'/search');
  assert.equal(url.searchParams.get('text'),'המדריכים & שלום');assert.equal(url.searchParams.get('language'),'he');assert.equal(url.searchParams.get('source'),'global');
  assert.equal(url.searchParams.get('morph'),'true');assert.equal(url.searchParams.get('analyzed'),'true');assert(!url.href.includes('synthetic-key'));
  assert.deepEqual(options.headers,{Accept:'application/json','X-RapidAPI-Key':'synthetic-key','X-RapidAPI-Host':'lexicala1.p.rapidapi.com'});
  assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');assert.equal(options.referrerPolicy,'no-referrer');assert.equal(options.signal,signal);
  assert.equal(lexicalaHebrew.suggest,undefined);assert.equal(lexicalaHebrew.supportsFallback,false);
});

test('Lexicala auth is bound to its exact HTTPS endpoint and validates keys before fetching',async()=>{
  for(const url of ['https://en.wiktionary.org/w/api.php','https://lexicala1.p.rapidapi.com/other','https://lexicala1.p.rapidapi.com:444/search','http://lexicala1.p.rapidapi.com/search','https://name:pass@lexicala1.p.rapidapi.com/search','https://lexicala1.p.rapidapi.com.evil.example/search']){
    let fetched=false;await assert.rejects(requestJson(url,{lexicalaKey:'synthetic-key',fetch:async()=>{fetched=true;return Response.json({});}}),e=>e.code==='unavailable');assert.equal(fetched,false);
  }
  for(const key of [undefined,'','  ','key\r\nInjected: value']){
    let fetched=false;await assert.rejects(requestJson('https://lexicala1.p.rapidapi.com/search',{lexicalaKey:key,fetch:async()=>{fetched=true;return Response.json({});}}),e=>['missing-key','unavailable'].includes(e.code));assert.equal(fetched,false);
  }
});

test('Lexicala reports auth, quota and transient errors without echoing secrets',async()=>{
  const {lexicalaHebrew}=await adapter();
  for(const [status,code] of [[401,'unauthorized'],[403,'access-denied'],[429,'rate-limit'],[503,'unavailable']]){
    let calls=0;await assert.rejects(lexicalaHebrew.lookup({query:'מדריך',key:'synthetic-key',fetch:async()=>{calls++;return new Response('synthetic-key private upstream diagnostic',{status});}}),e=>e.code===code&&!e.message.includes('synthetic-key'));assert.equal(calls,1);
  }
  await assert.rejects(lexicalaHebrew.lookup({query:'מדריך',key:'synthetic-key',fetch:async()=>{throw new Error('synthetic-key');}}),e=>e.code==='unavailable'&&!e.message.includes('synthetic-key'));
});

test('selecting a vocalized matching entry prefers its exact spelling over another pronunciation',async()=>{
  const {parseLexicalaHebrew}=await adapter();
  const data=envelope([{...entry,headword:'סֵפֶר',senses:[{definition:'הגדרה ראשונה.'}]},{...entry,headword:'סָפַר',senses:[{definition:'הגדרה שנייה.'}]}]);
  const result=parseLexicalaHebrew(data,'סָפַר');
  assert.equal(result.headword,'סָפַר');assert.deepEqual(result.senses.map(s=>s.text),['הגדרה שנייה.']);
});
