import {requestJson,failure,text} from './http.mjs';
import {normalizeTerm} from '../normalize.mjs';
const parts=/^(noun|verb|adjective|adverb|pronoun|preposition|conjunction|interjection|determiner|article|numeral|proper noun|participle|phrase|proverb|contraction|prefix|suffix|symbol|letter)(?:\s+\d+)?$/i;
function plain(node){const copy=node.cloneNode(true);copy.querySelectorAll('script,style,link,sup,table,dl,ul,ol,.mw-editsection').forEach(n=>n.remove());return text(copy.textContent);}
function parse(document,query,language){
  const senses=[];let active=false,part='';
  for(const node of document.querySelectorAll('h2,h3,h4,h5,ol')){
    if(node.closest('table,nav'))continue;
    const heading=plain(node);
    if(node.localName==='h2') {active=language==='en'?heading==='English':/\p{Script=Hebrew}/u.test(heading)&&! /^(ראו גם|הערות|קישורים)/u.test(heading);part='';continue;}
    if(/^h[345]$/.test(node.localName)){if(language==='he')active=false;else part=parts.test(heading)?heading:'';continue;}
    if(!active || (language==='en'&&!part) || node.parentElement.closest('ol,li,dl,ul'))continue;
    for(const item of node.children){
      if(item.localName!=='li')continue;
      const definition=plain(item);if(!definition)continue;
      const exampleNodes=language==='en'?[...item.querySelectorAll('.e-example,.e-quotation')]:[...item.querySelectorAll(':scope > dl > dd > ul > li')];
      const fallback=exampleNodes.length?exampleNodes:[...item.querySelectorAll(':scope > dl > dd')].filter(n=>!n.querySelector('.nyms'));
      const examples=fallback.slice(0,3).map(plain).filter(Boolean);
      senses.push({partOfSpeech:part,text:definition,examples});
    }
  }
  if(!senses.length)return null;
  const sourceUrl=`https://${language}.wiktionary.org/wiki/${encodeURIComponent(query)}`;
  return {headword:query,language,senses:senses.slice(0,20),sourceUrl,attribution:{label:language==='he'?'ויקימילון':'Wiktionary',url:sourceUrl,licenseLabel:'CC BY-SA 4.0 · adapted excerpt',licenseUrl:'https://creativecommons.org/licenses/by-sa/4.0/'}};
}
export const parseEnglishWiktionary=(document,query)=>parse(document,query,'en');
export const parseHebrewWiktionary=(document,query)=>parse(document,query,'he');
async function englishSuggestions(options){
  const query=options.query;
  const filter=' incategory:English_lemmas';
  const params=new URLSearchParams({action:'query',list:'prefixsearch|search',pssearch:query,psnamespace:'0',pslimit:'16',srsearch:`intitle:${query}${filter}`,srnamespace:'0',srlimit:'8',srprop:'',srinfo:'suggestion',format:'json',formatversion:'2'});
  const data=await requestJson(`https://en.wiktionary.org/w/api.php?${params}`,options);
  if(data?.error?.code==='ratelimited')throw failure('rate-limit');
  if(!data?.query||data.error)throw failure('unavailable');
  const suggestion=text(data.query.searchinfo?.suggestion);
  const correction=suggestion.startsWith('intitle:')&&suggestion.endsWith(filter)?suggestion.slice(8,-filter.length):'';
  const matches=[...(data.query.prefixsearch||[]),...(data.query.search||[])].filter(p=>p.ns===0).map(p=>text(p.title));
  const words=[...new Set([correction,query,...matches])].filter(word=>{
    const normalized=normalizeTerm(word);
    return word&&!normalized.status&&normalized.language==='en'&&!/[|:#<>]/.test(word);
  }).slice(0,26);
  if(!words.length)return [];
  // en.wiktionary.org contains words in every language. Script alone does not
  // establish English: verify each candidate's lexical category in one batch.
  const categories=['Category:English lemmas','Category:English non-lemma forms'];
  const verification=new URLSearchParams({action:'query',prop:'categories',titles:words.join('|'),clcategories:categories.join('|'),cllimit:'max',format:'json',formatversion:'2'});
  const checked=await requestJson(`https://en.wiktionary.org/w/api.php?${verification}`,options);
  if(checked?.error?.code==='ratelimited')throw failure('rate-limit');
  if(!Array.isArray(checked?.query?.pages)||checked.error)throw failure('unavailable');
  const english=new Set(checked.query.pages.filter(p=>p.ns===0&&!p.missing&&!p.invalid&&p.categories?.some(c=>categories.includes(c.title))).map(p=>p.title));
  return words.filter(word=>english.has(word)).slice(0,8).map(word=>({word,language:'en'}));
}
export function wiktionary(language){return {id:`wiktionary-${language}`,label:language==='he'?'ויקימילון':'Wiktionary',language,keyRequired:false,suggestionsLabel:language==='en'?'English headword suggestions':'Search suggestions',async suggest(options){
  if(language==='en')return englishSuggestions(options);
  const query=options.query.replace(/[\u0591-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7]/g,'');
  const params=new URLSearchParams({action:'query',list:'prefixsearch|search',pssearch:query,psnamespace:'0',pslimit:'8',srsearch:query,srnamespace:'0',srlimit:'8',srprop:'',format:'json',formatversion:'2'});
  // A leading he can be a definite article. Offer an existing base page as a
  // candidate only; never substitute it silently for the requested definition.
  if(language==='he'&&/^ה[\p{Script=Hebrew}]{2,}$/u.test(query))params.set('titles',query.slice(1));
  const data=await requestJson(`https://${language}.wiktionary.org/w/api.php?${params}`,options);
  if(data?.error?.code==='ratelimited')throw failure('rate-limit');
  if(!data?.query||data.error)throw failure('unavailable');
  const matches=[...(data.query.pages||[]).filter(p=>!p.missing&&!p.invalid),...(data.query.prefixsearch||[]),...(data.query.search||[])];
  const words=[...new Set(matches.filter(p=>p.ns===0).map(p=>text(p.title)).filter(Boolean))];
  return words.slice(0,8).map(word=>({word,language}));
},async lookup(options){
  const url=`https://${language}.wiktionary.org/w/api.php?action=parse&page=${encodeURIComponent(options.query)}&prop=text&format=json&formatversion=2&redirects=1`;
  const data=await requestJson(url,options);
  if(!data || data.error?.code==='missingtitle')return null;
  if(data.error || typeof data.parse?.text!=='string')throw failure('unavailable');
  return parse(options.parseDocument(data.parse.text),data.parse.title||options.query,language);
}};}
