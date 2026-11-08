import {failure,requestJson,text} from './http.mjs';

const hebrewText=value=>{const valueText=text(value);return /[\u05d0-\u05ea]/u.test(valueText)?valueText:'';};
const unpointed=value=>text(value).normalize('NFD').replace(/[\u0591-\u05bd\u05bf\u05c1\u05c2\u05c4\u05c5\u05c7]/gu,'');

// Current /search uses an abridged results envelope. Only source definitions
// are read; translations, glosses and inferred meanings are never substituted.
export function parseLexicalaHebrew(data,query=''){
  if(!data||!Array.isArray(data.results)||data.error||data.message)throw failure('unavailable');
  const entries=[];
  for(const entry of data.results){
    if(!entry||entry.language!=='he'||!Array.isArray(entry.senses))continue;
    const head=Array.isArray(entry.headword)?entry.headword[0]:entry.headword;
    const headword=hebrewText(typeof head==='string'?head:head?.text);
    if(!headword)continue;
    const senses=[];
    for(const sense of entry.senses){
      const definition=hebrewText(sense?.definition);
      if(!definition)continue;
      const examples=Array.isArray(sense.examples)?sense.examples.map(example=>hebrewText(example?.text)).filter(Boolean).slice(0,3):[];
      senses.push({partOfSpeech:text(entry.pos)||text(head?.pos),text:definition,examples});
      if(senses.length===20)break;
    }
    if(senses.length)entries.push({headword,senses});
  }
  if(!entries.length)return null;
  const selected=entries.find(entry=>entry.headword.normalize('NFC')===text(query).normalize('NFC'))||entries.find(entry=>unpointed(entry.headword)===unpointed(query))||entries[0];
  // Diacritics are ignored for ranking only: differently vocalized words may
  // have distinct meanings and must not contribute senses to this headword.
  const identity=selected.headword,senses=[],matches=[],seen=new Set([identity]);
  for(const entry of entries){
    const word=entry.headword;
    if(word===identity)senses.push(...entry.senses.slice(0,20-senses.length));
    else if(!seen.has(word)&&matches.length<8){seen.add(word);matches.push({word:entry.headword,language:'he'});}
  }
  return {headword:selected.headword,language:'he',senses,matches,attribution:{label:'Lexicala · K Dictionaries',url:'https://lexicala.com/'}};
}

export const lexicalaHebrew={id:'lexicala-he',label:'Lexicala Hebrew (test)',language:'he',keyRequired:true,supportsFallback:false,suggestionsLabel:null,async lookup(options){
  const params=new URLSearchParams({source:'global',language:'he',text:options.query,morph:'true',analyzed:'true',page:'1','page-length':'10'});
  const data=await requestJson(`https://lexicala1.p.rapidapi.com/search?${params}`,{fetch:options.fetch,signal:options.signal,lexicalaKey:options.key});
  return data===null?null:parseLexicalaHebrew(data,options.query);
}};
