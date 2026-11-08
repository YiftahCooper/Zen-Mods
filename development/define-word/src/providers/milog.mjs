import {requestHtml,safeUrl,text} from './http.mjs';
const unpointed=value=>text(value).normalize('NFD').replace(/[\u0591-\u05bd\u05bf\u05c1\u05c2\u05c4\u05c5\u05c7]/gu,'');
const lookupUrl=query=>`https://milog.co.il/${encodeURIComponent(query.replace(/\s+/gu,'_').replace(/\//gu,'_slash_'))}`;
function plain(node,remove='script,style,iframe,object,template'){const copy=node.cloneNode(true);copy.querySelectorAll(remove).forEach(child=>child.remove());return text(copy.textContent);}
export function parseMilogHebrew(document,query){
  const entries=[];
  for(const element of [...document.querySelectorAll('.sr_e')].slice(0,100)){
    const title=element.querySelector('.sr_e_t');if(!title)continue;
    const headword=plain(title,'span:not(.sr_e_prefix_txt),script,style,iframe,object,template').replace(/\s+-\s*$/u,'').trim();if(!/[א-ת]/u.test(headword))continue;
    const grammar=title.querySelector('span:not(.sr_e_prefix_txt)');
    const partOfSpeech=grammar?plain(grammar):'';
    const senses=[];
    for(const sense of [...element.querySelectorAll('.sr_e_para .sr_e_txt')].slice(0,20)){
      const definition=plain(sense,'script,style,iframe,object,template,.sr_example');if(!definition)continue;
      const examples=[...sense.querySelectorAll('.sr_example')].slice(0,3).map(node=>plain(node)).filter(Boolean);
      senses.push({partOfSpeech,text:definition,examples});
    }
    if(senses.length)entries.push({headword,senses,sourceUrl:safeUrl(title.getAttribute('href'),['milog.co.il'])||lookupUrl(query)});
  }
  const selected=entries.find(entry=>entry.headword.normalize('NFC')===text(query).normalize('NFC'))||entries.find(entry=>unpointed(entry.headword)===unpointed(query));
  if(!selected)return null;
  const matches=[...new Set(entries.map(entry=>entry.headword))].filter(word=>word!==selected.headword).slice(0,8).map(word=>({word,language:'he'}));
  return {...selected,language:'he',matches,attribution:{label:'מילוג',url:selected.sourceUrl}};
}
// Milog has no verified autocomplete API. Fetch only on explicit lookup.
export const milogHebrew={id:'milog-he',label:'מילוג',language:'he',keyRequired:false,supportsFallback:false,suggestionsLabel:null,async lookup(options){const html=await requestHtml(lookupUrl(options.query),options);return html===null?null:parseMilogHebrew(options.parseDocument(html),options.query);}};
