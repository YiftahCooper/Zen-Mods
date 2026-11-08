import test from 'node:test';
import assert from 'node:assert/strict';
import {JSDOM} from 'jsdom';
import {providers} from '../src/providers/registry.mjs';
const parseDocument=html=>new JSDOM(html).window.document;
const academyRow=(keyword,plain,definition,extra={})=>({keyword,keywordWithoutNikud:plain,ktiv_male:plain,title:`${keyword} (${plain})`,hagdarot:[definition],ItemTypeName:'AcItemShem',...extra});
const academyOptions=(query,rows)=>({query,parseDocument,fetch:async()=>Response.json(rows)});
const milogEntry=(word,grammar,definition,href='https://milog.co.il/שלום/e_1')=>`<div class="sr_e"><a class="sr_e_t" href="${href}">${word} - <span>${grammar}</span></a><div class="sr_e_para"><div class="sr_e_txt">${definition}</div></div></div>`;

test('Academy lookup preserves vocalized homographs and splits source senses into plain text',async()=>{
  const provider=providers.get('academy-he');assert.ok(provider,'Academy adapter is registered');
  const result=await provider.lookup(academyOptions('מַחְשֵׁב',[
    academyRow('מְחַשֵּׁב','מחשב','עושה חישוב'),
    academyRow('מַחְשֵׁב','מחשב','<strong>מכשיר</strong> לעיבוד נתונים | כלי &amp; עזר'),
    academyRow('מַחְשָׁב','מחשב','מחשבה'),
  ]));
  assert.equal(result.headword,'מַחְשֵׁב');
  assert.deepEqual(result.senses.map(x=>x.text),['מכשיר לעיבוד נתונים','כלי & עזר']);
  assert.deepEqual(result.matches,[{word:'מְחַשֵּׁב',language:'he'},{word:'מַחְשָׁב',language:'he'}]);
  assert.match(result.sourceUrl,/^https:\/\/hebrew-academy.org.il\//);
  assert.match(result.attribution.label,/האקדמיה/);
});

test('Academy rejects prefix-only false matches and accepts explicitly mapped inflections',async()=>{
  const provider=providers.get('academy-he');assert.ok(provider,'Academy adapter is registered');
  assert.equal(await provider.lookup(academyOptions('הבית',[academyRow('הַבַּיְתָה','הביתה','אל הבית')])),null);
  const result=await provider.lookup(academyOptions('מדריכים',[
    academyRow('מַדְרִיךְ','מדריך',''),
    academyRow('מַדְרִיךְ','מדריך','מראה את הדרך',{title:'מַדְרִיכִים (מדריכים) > מַדְרִיךְ (מדריך)',ItemTypeName:'AcItemNoteBenoni'}),
  ]));
  assert.equal(result.headword,'מַדְרִיךְ');assert.equal(result.senses[0].text,'מראה את הדרך');
  assert.equal(await provider.lookup(academyOptions('אוזניות',[academyRow('אָזְנִיּוֹת','אוזניות','')])),null);
});

test('Academy suggestions retain empty-definition alternatives without inventing definitions',async()=>{
  const provider=providers.get('academy-he');assert.ok(provider,'Academy adapter is registered');
  let requested,requestOptions;
  const suggestions=await provider.suggest({query:'מחשב &',fetch:async(url,options)=>{requested=new URL(url);requestOptions=options;return Response.json([
    academyRow('מִחְשֵׁב_פועל','מחשב_פועל',''),academyRow('מַחְשֵׁב','מחשב','כלי'),academyRow('מַחְשֵׁב','מחשב','כלי'),
  ]);}});
  assert.equal(requested.hostname,'kalanit.hebrew-academy.org.il');assert.equal(requested.pathname,'/api/Ac/');assert.equal(requested.searchParams.get('SearchString'),'מחשב &');
  assert.equal(requestOptions.credentials,'omit');assert.equal(requestOptions.redirect,'error');assert.equal(requestOptions.referrerPolicy,'no-referrer');assert.equal(requestOptions.headers['X-RapidAPI-Key'],undefined);
  assert.deepEqual(suggestions,[{word:'מִחְשֵׁב',language:'he'},{word:'מַחְשֵׁב',language:'he'}]);
  await assert.rejects(provider.lookup(academyOptions('מחשב',{error:'bad'})),e=>e.code==='unavailable');
});

test('Milog separates source examples, preserves pointed headwords and ignores hostile links',async()=>{
  const provider=providers.get('milog-he');assert.ok(provider,'Milog adapter is registered');
  const html=milogEntry('שִׁלּוּם','שם עצם','תשלום')+milogEntry('שָׁלוֹם','שם עצם','ברכה<span class="sr_example">דוגמה לברכה</span><script>bad()</script>','javascript:alert(1)');
  const result=await provider.lookup({query:'שָׁלוֹם',parseDocument,fetch:async()=>new Response(html)});
  assert.equal(result.headword,'שָׁלוֹם');assert.equal(result.senses[0].text,'ברכה');assert.deepEqual(result.senses[0].examples,['דוגמה לברכה']);assert.equal(result.senses[0].partOfSpeech,'שם עצם');
  assert.deepEqual(result.matches,[{word:'שִׁלּוּם',language:'he'}]);assert.match(result.sourceUrl,/^https:\/\/milog.co.il\//);assert.equal(result.attribution.label,'מילוג');
});

test('Milog encodes explicit lookups, provides no remote autocomplete and rejects examples-only entries',async()=>{
  const provider=providers.get('milog-he');assert.ok(provider,'Milog adapter is registered');
  assert.equal(provider.suggest,undefined);let url,options;
  assert.equal(await provider.lookup({query:'בית ספר/גן',parseDocument,fetch:async(u,o)=>{url=u;options=o;return new Response(milogEntry('בית ספר','שם עצם','<span class="sr_example">רק דוגמה</span>'));}}),null);
  assert.equal(decodeURIComponent(new URL(url).pathname),'/בית_ספר_slash_גן');assert.equal(options.credentials,'omit');assert.equal(options.redirect,'error');assert.equal(options.referrerPolicy,'no-referrer');
  assert.equal(await provider.lookup({query:'בית',parseDocument,fetch:async()=>new Response('',{status:404})}),null);
  await assert.rejects(provider.lookup({query:'בית',parseDocument,fetch:async()=>new Response('x'.repeat(1048577))}),e=>e.code==='unavailable');
});

test('Academy follows source ordering for an ambiguous unpointed word',async()=>{
  const result=await providers.get('academy-he').lookup(academyOptions('מחשב',[
    academyRow('מִחְשֵׁב_פועל','מחשב_פועל','מצייד במחשבים',{order:5}),
    academyRow('מַחְשֵׁב','מחשב','כלי לעיבוד מידע',{order:1}),
  ]));
  assert.equal(result.headword,'מַחְשֵׁב');assert.equal(result.senses[0].text,'כלי לעיבוד מידע');
});

test('Milog preserves its marked definite article and separates it from grammar',async()=>{
  const html=milogEntry('<span class="sr_e_prefix_txt">ה</span>בַּיִת','שם עצם, זכר','מבנה מגורים');
  const result=await providers.get('milog-he').lookup({query:'הבית',parseDocument,fetch:async()=>new Response(html)});
  assert.ok(result);assert.equal(result.headword,'הבַּיִת');assert.equal(result.senses[0].partOfSpeech,'שם עצם, זכר');
});

test('Academy ranks relevance before source order so a lower-score spelling does not displace a direct match',async()=>{
  const result=await providers.get('academy-he').lookup(academyOptions('מחשב',[
    academyRow('מִחְשֵׁב_פועל','מחשב_פועל','מצייד במחשבים',{order:5,score:80}),
    academyRow('מַחְשֵׁב','מחשב','כלי לעיבוד מידע',{order:1,score:80}),
    academyRow('מְחֻשָּׁב','מחשב','מתוכנן',{ktiv_male:'מחושב',order:0,score:50}),
  ]));
  assert.equal(result.headword,'מַחְשֵׁב');
});

test('Academy sends an unpointed query while preserving the exact vocalized result selection',async()=>{
  // The public endpoint returns [] for a pointed SearchString, including שָׁלוֹם.
  // Its unpointed search returns distinct vocalized homographs in source order.
  const rows=[
    academyRow('שָׁלוּם','שלום','שלם שחי בשלום עם אחר',{order:0,score:80}),
    academyRow('שָׁלוֹם','שלום','ברכת פגישה ופרידה',{order:1,score:80}),
  ];
  const requested=[];
  const options={query:'שָׁלוֹם',parseDocument,fetch:async url=>{
    const query=new URL(url).searchParams.get('SearchString');requested.push(query);
    return Response.json(query==='שלום'?rows:[]);
  }};
  const provider=providers.get('academy-he'),result=await provider.lookup(options);
  assert.ok(result,'pointed selections must resolve through the plain search endpoint');
  assert.equal(result.headword,'שָׁלוֹם');assert.equal(result.senses[0].text,'ברכת פגישה ופרידה');
  assert.deepEqual(await provider.suggest(options),[{word:'שָׁלוּם',language:'he'},{word:'שָׁלוֹם',language:'he'}]);
  assert.deepEqual(requested,['שלום','שלום']);
});
