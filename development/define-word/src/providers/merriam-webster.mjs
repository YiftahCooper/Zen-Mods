import {requestJson,text} from './http.mjs';
function tokens(value){return text(value).replace(/\{(?:d_link|a_link|i_link|dxt|et_link|mat|sx)\|([^|}]+)[^}]*\}/g,'$1').replace(/\{bc\}/g,': ').replace(/\{[^}]*\}/g,'').trim();}
const headwordOf=entry=>(text(entry?.hwi?.hw).replace(/\*/g,'')||text(entry?.meta?.id).replace(/:\d+$/,'')).normalize('NFC');
function senseOf(value,partOfSpeech){
  if(!value||typeof value!=='object')return null;
  const dt=Array.isArray(value.dt)?value.dt:[];
  let definition=dt.filter(item=>Array.isArray(item)&&item[0]==='text').map(item=>tokens(item[1])).filter(Boolean).join(' ');
  let examples=dt.filter(item=>Array.isArray(item)&&item[0]==='vis'&&Array.isArray(item[1])).flatMap(item=>item[1].map(example=>tokens(example?.t))).filter(Boolean);
  const divided=senseOf(value.sdsense,partOfSpeech);
  if(divided){definition=[definition,[tokens(value.sdsense.sd),divided.text].filter(Boolean).join(' ')].filter(Boolean).join('; ');examples.push(...divided.examples);}
  return definition?{partOfSpeech,text:definition,examples:examples.slice(0,3)}:null;
}
export function parseMerriamWebster(data,query,providerId){
  if(!Array.isArray(data))return null;
  const entries=[];
  for(const entry of data){
    if(!entry || typeof entry!=='object' || !Array.isArray(entry.shortdef))continue;
    const headword=headwordOf(entry);if(!headword)continue;
    const collected=[];
    function walk(value){
      if(!Array.isArray(value))return;
      if(value[0]==='sense'||value[0]==='bs'){
        const sense=senseOf(value[0]==='bs'?value[1]?.sense:value[1],text(entry.fl));
        if(sense)collected.push(sense);
      }else value.forEach(walk);
    }
    for(const def of entry.def||[])walk(def.sseq);
    const senses=collected.length?collected:entry.shortdef.filter(x=>tokens(x)).map(x=>({partOfSpeech:text(entry.fl),text:tokens(x),examples:[]}));
    if(senses.length)entries.push({headword,senses});
  }
  if(!entries.length)return null;
  const wanted=text(query).normalize('NFC');
  const selected=entries.find(entry=>entry.headword===wanted)||entries.find(entry=>entry.headword.toLowerCase()===wanted.toLowerCase())||entries[0];
  // Homographs share a spelling; related phrases and case-distinct lemmas do
  // not. Keep their meanings separate and offer their real headwords as matches.
  const senses=entries.filter(entry=>entry.headword===selected.headword).flatMap(entry=>entry.senses).slice(0,20);
  const matches=[...new Set(entries.map(entry=>entry.headword))].filter(word=>word!==selected.headword).slice(0,8).map(word=>({word,language:'en'}));
  const learners=providerId==='mw-learners',sourceUrl=`https://www.merriam-webster.com/${learners?'learner/':''}dictionary/${encodeURIComponent(selected.headword)}`;
  return {headword:selected.headword,language:'en',senses,matches,sourceUrl,attribution:{label:learners?"Merriam-Webster's Learner's Dictionary":"Merriam-Webster's Collegiate® Dictionary",url:sourceUrl,brand:'merriam-webster'}};
}
function suggestionsOf(data){
  if(!Array.isArray(data))return [];
  // Misspellings return strings; valid queries return entry objects. In the
  // latter case offer the actual headwords, never their definition text.
  const words=data.map(item=>typeof item==='string'?text(item):headwordOf(item));
  return [...new Set(words.filter(Boolean))].slice(0,8).map(word=>({word,language:'en'}));
}
export function merriamWebster(kind){const id=`mw-${kind}`;
  const request=options=>requestJson(`https://www.dictionaryapi.com/api/v3/references/${kind}/json/${encodeURIComponent(options.query)}?key=${encodeURIComponent(options.key)}`,options);
  return {id,label:kind==='learners'?"Merriam-Webster Learner's":'Merriam-Webster Collegiate',language:'en',keyRequired:true,suggestionsLabel:'Matching words',
    async suggest(options){return suggestionsOf(await request(options));},
    async lookup(options){return parseMerriamWebster(await request(options),options.query,id);},
    // Definitions and spelling suggestions share one endpoint. An explicit
    // lookup derives both from one keyed request instead of spending two.
    async lookupWithSuggestions(options){const data=await request(options);return {definition:parseMerriamWebster(data,options.query,id),suggestions:suggestionsOf(data)};},
  };}
