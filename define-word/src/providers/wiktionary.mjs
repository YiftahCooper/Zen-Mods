import {requestJson,failure,text} from './http.mjs';
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
export function wiktionary(language){return {id:`wiktionary-${language}`,label:language==='he'?'ויקימילון':'Wiktionary',language,keyRequired:false,async lookup(options){
  const url=`https://${language}.wiktionary.org/w/api.php?action=parse&page=${encodeURIComponent(options.query)}&prop=text&format=json&formatversion=2&redirects=1`;
  const data=await requestJson(url,options);
  if(!data || data.error?.code==='missingtitle')return null;
  if(data.error || typeof data.parse?.text!=='string')throw failure('unavailable');
  return parse(options.parseDocument(data.parse.text),data.parse.title||options.query,language);
}};}
