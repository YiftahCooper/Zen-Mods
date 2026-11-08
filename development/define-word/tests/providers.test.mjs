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

test('Merriam-Webster selects the requested headword and keeps related entries out of its senses',()=>{
  // Synthetic entry content with the documented v3 headword/homograph shape.
  const entries=[
    {meta:{id:'common sense'},hwi:{hw:'common sense'},fl:'noun',shortdef:['sound judgment']},
    {meta:{id:'sense:1'},hwi:{hw:'sense'},fl:'noun',shortdef:['a meaning']},
    {meta:{id:'sense:2'},hwi:{hw:'sense'},fl:'verb',shortdef:['to perceive']},
    {meta:{id:'sense organ'},hwi:{hw:'sense or*gan'},fl:'noun',shortdef:['a sensory organ']},
  ];
  for(const id of ['mw-collegiate','mw-learners']){
    const result=parseMerriamWebster(entries,'SENSE',id);
    assert.equal(result.headword,'sense');
    assert.deepEqual(result.senses.map(s=>s.text),['a meaning','to perceive']);
    assert.deepEqual(result.matches,[{word:'common sense',language:'en'},{word:'sense organ',language:'en'}]);
    assert.equal(new URL(result.sourceUrl).pathname.endsWith('/dictionary/sense'),true);
  }
});

test('Merriam-Webster keeps case-distinct lemmas separate and prefers the exact spelling',()=>{
  const entries=[
    {meta:{id:'may'},hwi:{hw:'may'},fl:'verb',shortdef:['expresses possibility']},
    {meta:{id:'May'},hwi:{hw:'May'},fl:'noun',shortdef:['the fifth month']},
  ];
  const result=parseMerriamWebster(entries,'May','mw-collegiate');
  assert.equal(result.headword,'May');assert.deepEqual(result.senses.map(s=>s.text),['the fifth month']);
});

test('Merriam-Webster preserves binding and divided senses instead of dropping their meanings',()=>{
  // Shapes from dictionaryapi.com/products/json; all lexical content is synthetic.
  const data=[{meta:{id:'test'},hwi:{hw:'test'},fl:'noun',shortdef:['summary only'],def:[{sseq:[[
    ['bs',{sense:{dt:[['text','{bc}a general meaning']]}}],
    ['sense',{dt:[['text','{bc}the primary meaning'],['vis',[{t:'A primary example.'}]]],sdsense:{sd:'specifically',dt:[['text','{bc}the narrower meaning'],['vis',[{t:'A narrow example.'}]]]}}],
    ['pseq',[[ 'sense',{dt:[['text','{bc}a nested meaning']]}]]],
  ]]}]}];
  const result=parseMerriamWebster(data,'test','mw-collegiate');
  assert.deepEqual(result.senses.map(s=>s.text),[': a general meaning',': the primary meaning; specifically : the narrower meaning',': a nested meaning']);
  assert.deepEqual(result.senses[1].examples,['A primary example.','A narrow example.']);
});

test('Merriam-Webster retains displayed cross-reference words when removing provider tokens',()=>{
  const data=[{meta:{id:'word'},hwi:{hw:'word'},fl:'noun',shortdef:['see {dxt|browser||} and {et_link|root|root:1}, more at {mat|family|family:1}']}];
  assert.equal(parseMerriamWebster(data,'word','mw-collegiate').senses[0].text,'see browser and root, more at family');
});
test('provider request is encoded, cookie-free, referrer-free and redirect rejecting',async()=>{
  let url,options;
  await providers.get('free-en').lookup({query:'a&b',signal:new AbortController().signal,fetch:async(u,o)=>{url=u;options=o;return new Response('[]');}});
  assert.equal(url,'https://api.dictionaryapi.dev/api/v2/entries/en/a%26b');assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');assert.equal(options.referrerPolicy,'no-referrer');
});

test('Free Dictionary API uses its case-insensitive lookup route while preserving the original query',async()=>{
  let requested;
  const result=await providers.get('free-en').lookup({query:'Account',signal:new AbortController().signal,fetch:async url=>{
    requested=url;
    // The provider's lowercase route can be cached when the capitalized route
    // cannot reach its origin. Lexical matching on the server is lowercase.
    return Response.json([{meanings:[{partOfSpeech:'noun',definitions:[{definition:'A synthetic record.'}]}]}]);
  }});
  assert.equal(requested,'https://api.dictionaryapi.dev/api/v2/entries/en/account');
  assert.equal(result.headword,'Account','the display fallback retains the user query');
  assert.equal(result.senses[0].text,'A synthetic record.');
});
test('HTTP errors and oversized or malformed responses stay bounded',async()=>{
  for(const [response,code] of [[new Response('',{status:429}),'rate-limit'],[new Response('not json'),'unavailable'],[new Response('x'.repeat(1048577)),'unavailable']]) {
    await assert.rejects(requestJson('https://en.wiktionary.org/w/api.php',{fetch:async()=>response}),e=>e.code===code);
  }
});
test('Wiktionary suggestions combine title matches and search, with confirmed Hebrew base candidates',async()=>{
  let requested;
  const result=await providers.get('wiktionary-he').suggest({query:'הבית',fetch:async url=>{requested=new URL(url);return Response.json({batchcomplete:true,query:{prefixsearch:[{ns:0,title:'הבית הלבן'}],search:[{ns:0,title:'בית'},{ns:0,title:'הבית הלבן'},{ns:4,title:'ויקימילון:בית'}],pages:[{ns:0,title:'בית',pageid:10}]}});}});
  assert.equal(requested.hostname,'he.wiktionary.org');assert.equal(requested.searchParams.get('list'),'prefixsearch|search');assert.equal(requested.searchParams.get('titles'),'בית');
  assert.deepEqual(result,[{word:'בית',language:'he'},{word:'הבית הלבן',language:'he'}]);
});
test('Wiktionary missing base candidates are never invented, and API errors remain failures',async()=>{
  const provider=providers.get('wiktionary-he');
  assert.deepEqual(await provider.suggest({query:'הלאקיים',fetch:async()=>Response.json({query:{prefixsearch:[],search:[],pages:[{ns:0,title:'לאקיים',missing:true}]}})}),[]);
  await assert.rejects(provider.suggest({query:'בית',fetch:async()=>Response.json({error:{code:'ratelimited'}})}),e=>e.code==='rate-limit');
});
test('MW suggestions use its selected dictionary and offer returned headwords for valid queries',async()=>{
  let requested;const provider=providers.get('mw-learners');
  assert.deepEqual(await provider.suggest({query:'browsr',key:'fake key',fetch:async url=>{requested=new URL(url);return Response.json(['browser','brow','browser']);}}),[{word:'browser',language:'en'},{word:'brow',language:'en'}]);
  assert.equal(requested.pathname,'/api/v3/references/learners/json/browsr');assert.equal(requested.searchParams.get('key'),'fake key');
  assert.deepEqual(await provider.suggest({query:'browser',key:'fake',fetch:async()=>Response.json([{meta:{id:'browser'},shortdef:['definition']}])}),[{word:'browser',language:'en'}]);
  assert.equal(typeof providers.get('free-en').suggest,'undefined');
});

test('both MW dictionaries clean syllable marks and homograph identifiers without exposing definition text',async()=>{
  for(const id of ['mw-collegiate','mw-learners']){
    const result=await providers.get(id).suggest({query:'sense',key:'fake',fetch:async()=>Response.json([
      {meta:{id:'sense:1'},hwi:{hw:'sense'},shortdef:['a meaning']},
      {meta:{id:'sense:2'},hwi:{hw:'sense'},shortdef:['to perceive']},
      {meta:{id:'sense organ'},hwi:{hw:'sense or*gan'},shortdef:['an organ']},
      {meta:{id:'common sense:1'},shortdef:['good judgment']},
      {shortdef:['no headword available']},null
    ])});
    assert.deepEqual(result,[{word:'sense',language:'en'},{word:'sense organ',language:'en'},{word:'common sense',language:'en'}]);
  }
});

test('English Wiktionary prioritizes a verified spelling correction and rejects foreign-only titles',async()=>{
  const requests=[];
  const result=await providers.get('wiktionary-en').suggest({query:'snese',fetch:async url=>{
    const p=new URL(url).searchParams;requests.push(p);
    if(p.get('prop')==='categories')return Response.json({query:{pages:[
      {ns:0,title:'sense',categories:[{ns:14,title:'Category:English lemmas'}]},
      {ns:0,title:'snese'}, {ns:0,title:'snesen'},
      {ns:0,title:'SNESes',categories:[{ns:14,title:'Category:English non-lemma forms'}]}
    ]}});
    return Response.json({query:{searchinfo:{suggestion:'intitle:sense incategory:English_lemmas'},prefixsearch:[{ns:0,title:'snese'},{ns:0,title:'snesen'},{ns:0,title:'SNESes'}],search:[]}});
  }});
  assert.deepEqual(result,[{word:'sense',language:'en'},{word:'SNESes',language:'en'}]);
  assert.equal(requests.length,2);
  assert.equal(requests[0].get('srsearch'),'intitle:snese incategory:English_lemmas');
  assert(requests[0].get('srinfo').includes('suggestion'));
  assert(requests[1].get('titles').split('|').includes('sense'));
  assert.equal(requests[1].get('clcategories'),'Category:English lemmas|Category:English non-lemma forms');
});

test('English Wiktionary preserves useful prefix order after language verification and does not invent absent corrections',async()=>{
  const result=await providers.get('wiktionary-en').suggest({query:'bro',fetch:async url=>{
    const p=new URL(url).searchParams;
    if(p.get('prop')==='categories')return Response.json({query:{pages:[
      {ns:0,title:'broken',categories:[{ns:14,title:'Category:English lemmas'}]},
      {ns:0,title:'bro',categories:[{ns:14,title:'Category:English lemmas'}]},
      {ns:0,title:'browser',categories:[{ns:14,title:'Category:English lemmas'}]},
      {ns:0,title:'brogue',missing:true,categories:[{ns:14,title:'Category:English lemmas'}]},
      {ns:0,title:'broder',categories:[{ns:14,title:'Category:Danish lemmas'}]}
    ]}});
    return Response.json({query:{prefixsearch:[{ns:0,title:'bro'},{ns:0,title:'browser'},{ns:0,title:'broder'}],search:[{ns:0,title:'broken'}],searchinfo:{suggestion:'intitle:brogue incategory:English_lemmas'}}});
  }});
  assert.deepEqual(result,[{word:'bro',language:'en'},{word:'browser',language:'en'},{word:'broken',language:'en'}]);
});
test('HTTP only permits fixed HTTPS dictionary hosts and sanitizes non-Error failures',async()=>{
  for(const url of ['http://en.wiktionary.org/w/api.php','https://example.invalid/','https://name:pass@en.wiktionary.org/','https://en.wiktionary.org:444/']){
    let fetched=false;await assert.rejects(requestJson(url,{fetch:async()=>{fetched=true;return Response.json([]);}}),e=>e.code==='unavailable');assert.equal(fetched,false);
  }
  await assert.rejects(requestJson('https://en.wiktionary.org/w/api.php',{fetch:()=>Promise.reject(null)}),e=>e.code==='unavailable');
});
