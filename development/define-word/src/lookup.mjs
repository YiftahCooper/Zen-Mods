import {normalizeTerm} from './normalize.mjs';
function suggestionsFor(candidates,term){
  const suggestions=[],seen=new Set();
  for(const candidate of candidates){
    const word=normalizeTerm(candidate?.word);
    const identity=word.query?.toLocaleLowerCase('en');
    if(word.status||word.language!==term.language||candidate.language!==term.language||seen.has(identity))continue;
    seen.add(identity);suggestions.push({word:word.query,language:term.language});if(suggestions.length===8)break;
  }
  return suggestions;
}
export function createLookupService({providers,credentials,fetch=globalThis.fetch,parseDocument,timers=globalThis,log=globalThis.console}) {
  async function run({term,providerId,signal},operation) {
    if(term?.status)return term;
    const provider=providers.get(providerId);
    if(!provider || !term?.language || provider.language!==term.language)return {status:'unsupported'};
    if(signal?.aborted)return {status:'cancelled'};
    if(operation==='suggest'&&typeof provider.suggest!=='function')return {status:'unsupported-suggestions'};
    const abort=new AbortController();let timedOut=false,finishAbort,timer,prompted=false;
    const stopped=new Promise(resolve=>finishAbort=resolve);
    const stop=()=>{abort.abort();finishAbort({status:timedOut?'timeout':'cancelled'});};
    signal?.addEventListener('abort',stop,{once:true});
    const arm=()=>{timer=timers.setTimeout(()=>{timedOut=true;stop();},10000);};arm();
    async function request(){
      let key;
      // Only a lookup the user started may ask once to unlock a locked primary
      // password; the deadline pauses while the user answers that prompt (0.3.6).
      const onUnlockPrompt=operation==='lookup'?()=>{if(abort.signal.aborted)return false;timers.clearTimeout(timer);prompted=true;}:undefined;
      if(provider.keyRequired){try{key=await credentials?.get(providerId,{onUnlockPrompt});}catch{return {status:'credential-unavailable'};}finally{if(prompted&&!abort.signal.aborted)arm();}if(!key)return {status:'missing-key'};}
      if(abort.signal.aborted)return {status:'cancelled'};
      const options={query:term.query,signal:abort.signal,key,fetch,parseDocument};
      if(operation==='suggest'){
        const candidates=await provider.suggest(options);
        if(!Array.isArray(candidates))return {status:'unavailable'};
        return {status:'ok',suggestions:suggestionsFor(candidates,term)};
      }
      // A provider whose lookup response also carries spelling suggestions
      // answers both with this one credential read and request. Suggestions
      // describe the requested spelling, as a separate suggest request did.
      const shared=typeof provider.lookupWithSuggestions==='function';let candidates;
      async function define(request){
        if(!shared)return provider.lookup(request);
        const result=await provider.lookupWithSuggestions(request);
        if(candidates===undefined)candidates=result?.suggestions??null;
        return result?.definition||null;
      }
      let definition=await define(options),normalizedRetry=false;
      const fallback=term.language==='he'?term.withoutNiqqud:term.query?.toLowerCase();
      if(provider.supportsFallback!==false && !definition && fallback && fallback!==term.query && !abort.signal.aborted){normalizedRetry=true;definition=await define({...options,query:fallback});}
      const outcome=definition?{status:'ok',definition,normalizedRetry}:{status:'no-result'};
      if(shared)outcome.suggestions=Array.isArray(candidates)?{status:'ok',suggestions:suggestionsFor(candidates,term)}:{status:'unavailable'};
      return outcome;
    }
    try {return await Promise.race([request().catch(error=>{
      const status=['rate-limit','cancelled','unauthorized','access-denied'].includes(error?.code)?error.code:'unavailable';
      // Keep the user-facing outcome, but show unexpected failures (parser or
      // network errors; not HTTP statuses, aborts or timeouts) in the Browser
      // Console. Log the error only, never the key-bearing request URL (0.3.6).
      if(status==='unavailable'&&!abort.signal.aborted&&error?.status===undefined)log?.warn?.(`[Define Word] ${providerId} ${operation} failed:`,error?.cause??error);
      return {status};}),stopped]);}
    finally {timers.clearTimeout(timer);signal?.removeEventListener('abort',stop);}
  }
  return {lookup:options=>run(options,'lookup'),suggest:options=>run(options,'suggest')};
}
