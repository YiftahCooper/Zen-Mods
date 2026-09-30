import {requestJson,text} from './http.mjs';
function tokens(value){return text(value).replace(/\{(?:d_link|a_link|i_link|sx)\|([^|}]+)[^}]*\}/g,'$1').replace(/\{bc\}/g,': ').replace(/\{[^}]*\}/g,'').trim();}
export function parseMerriamWebster(data,query,providerId){
  if(!Array.isArray(data))return null;
  const senses=[];
  for(const entry of data){
    if(!entry || typeof entry!=='object' || !Array.isArray(entry.shortdef))continue;
    const collected=[];
    function walk(value){if(!Array.isArray(value))return; if(value[0]==='sense'&&value[1]?.dt){const dt=value[1].dt;const definition=dt.filter(x=>x[0]==='text').map(x=>tokens(x[1])).join(' ');const examples=dt.filter(x=>x[0]==='vis').flatMap(x=>x[1].map(e=>tokens(e.t))).filter(Boolean).slice(0,3);if(definition)collected.push({partOfSpeech:text(entry.fl),text:definition,examples});}else value.forEach(walk);}
    for(const def of entry.def||[])walk(def.sseq);
    senses.push(...(collected.length?collected:entry.shortdef.filter(x=>text(x)).map(x=>({partOfSpeech:text(entry.fl),text:tokens(x),examples:[]}))));
  }
  if(!senses.length)return null;
  const learners=providerId==='mw-learners',sourceUrl=`https://www.merriam-webster.com/${learners?'learner/':''}dictionary/${encodeURIComponent(query)}`;
  return {headword:text(data[0]?.hwi?.hw).replace(/\*/g,'')||query,language:'en',senses:senses.slice(0,20),sourceUrl,attribution:{label:learners?"Merriam-Webster's Learner's Dictionary":"Merriam-Webster's Collegiate® Dictionary",url:sourceUrl,brand:'merriam-webster'}};
}
export function merriamWebster(kind){const id=`mw-${kind}`;return {id,label:kind==='learners'?"Merriam-Webster Learner's":'Merriam-Webster Collegiate',language:'en',keyRequired:true,async lookup(options){
  return parseMerriamWebster(await requestJson(`https://www.dictionaryapi.com/api/v3/references/${kind}/json/${encodeURIComponent(options.query)}?key=${encodeURIComponent(options.key)}`,options),options.query,id);
}};}
