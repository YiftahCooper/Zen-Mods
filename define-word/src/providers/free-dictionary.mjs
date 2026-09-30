import {requestJson,safeUrl,text} from './http.mjs';
export function parseFreeDictionary(data,query='') {
  if(!Array.isArray(data))return null;
  const senses=[];let sourceUrl,license;
  for(const entry of data){
    if(!entry || typeof entry!=='object')continue;
    sourceUrl ||= entry.sourceUrls?.map(u=>safeUrl(u,['en.wiktionary.org','dictionaryapi.dev'])).find(Boolean);
    license ||= entry.license;
    for(const meaning of entry.meanings||[])for(const item of meaning.definitions||[])if(text(item.definition))senses.push({partOfSpeech:text(meaning.partOfSpeech),text:text(item.definition),examples:item.example?[text(item.example)]:[]});
  }
  if(!senses.length)return null;
  return {headword:text(data[0]?.word)||query,language:'en',senses:senses.slice(0,20),sourceUrl:sourceUrl||'https://dictionaryapi.dev/',attribution:{label:'Free Dictionary API',url:'https://dictionaryapi.dev/',licenseLabel:text(license?.name),licenseUrl:safeUrl(license?.url,['creativecommons.org'])}};
}
export const freeDictionary={id:'free-en',label:'Free Dictionary API',language:'en',keyRequired:false,async lookup(options){return parseFreeDictionary(await requestJson(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(options.query)}`,options),options.query);}};
