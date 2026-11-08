import {failure,requestJson,text} from './http.mjs';
const unpointed=value=>text(value).normalize('NFD').replace(/[\u0591-\u05bd\u05bf\u05c1\u05c2\u05c4\u05c5\u05c7]/gu,'');
const displayWord=value=>text(value).replace(/_פועל$/u,'');
function rows(data){
  if(!Array.isArray(data))throw failure('unavailable');
  return data.filter(row=>row&&/[א-ת]/u.test(displayWord(row.keyword))).slice(0,100).sort((a,b)=>(Number.isFinite(b.score)?b.score:0)-(Number.isFinite(a.score)?a.score:0)||(Number.isFinite(a.order)?a.order:100)-(Number.isFinite(b.order)?b.order:100));
}
function candidates(entries,except=''){return [...new Set(entries.map(row=>displayWord(row.keyword)))].filter(word=>word&&word!==except).slice(0,8).map(word=>({word,language:'he'}));}
function sourceMatches(row,query){
  const wanted=unpointed(query);
  if([row.keyword,row.keywordWithoutNikud,row.ktiv_male,row.menukad].some(value=>unpointed(displayWord(value))===wanted))return true;
  // Only explicit source inflection mappings qualify; autocomplete prefixes do not.
  const title=text(row.title),separator=title.indexOf(' > ');
  if(separator<0)return false;
  const form=title.slice(0,separator);
  return unpointed(form.replace(/\s*\([^)]*\)\s*$/u,''))===wanted||[...form.matchAll(/\(([^)]+)\)/gu)].some(match=>unpointed(match[1])===wanted);
}
function definitionText(html,parseDocument){
  const document=parseDocument(html);document.querySelectorAll('script,style,iframe,object,template').forEach(node=>node.remove());return text(document.body.textContent);
}
export function parseAcademyHebrew(data,query,parseDocument){
  const entries=rows(data),defined=entries.map(row=>({row,senses:(Array.isArray(row.hagdarot)?row.hagdarot:[]).filter(value=>typeof value==='string').flatMap(value=>value.split('|')).map(value=>definitionText(value,parseDocument)).filter(Boolean).slice(0,20).map(value=>({partOfSpeech:/Poal/u.test(row.ItemTypeName||'')?'פועל':'',text:value,examples:[]}))})).filter(entry=>entry.senses.length&&sourceMatches(entry.row,query));
  const selected=defined.find(entry=>displayWord(entry.row.keyword).normalize('NFC')===text(query).normalize('NFC'))||defined[0];
  if(!selected)return null;
  const headword=displayWord(selected.row.keyword),sourceUrl=`https://hebrew-academy.org.il/דף-מילה/${encodeURIComponent(selected.row.keyword)}/`;
  return {headword,language:'he',senses:selected.senses,matches:candidates(entries,headword),sourceUrl,attribution:{label:'האקדמיה ללשון העברית · מילון ההווה',url:sourceUrl}};
}
// The public search endpoint accepts unpointed spelling, even for vocalized
// entries. Keep the original query for exact homograph selection in the parser.
async function search(options){return requestJson(`https://kalanit.hebrew-academy.org.il/api/Ac/?${new URLSearchParams({SearchString:unpointed(options.query)})}`,options);}
export const academyHebrew={id:'academy-he',label:'האקדמיה ללשון העברית',language:'he',keyRequired:false,supportsFallback:false,suggestionsLabel:'Dictionary entries',async suggest(options){const data=await search(options);return data===null?[]:candidates(rows(data));},async lookup(options){const data=await search(options);return data===null?null:parseAcademyHebrew(data,options.query,options.parseDocument);}};
