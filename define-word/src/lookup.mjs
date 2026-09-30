export function createLookupService({providers,credentials,fetch=globalThis.fetch,parseDocument,timers=globalThis}) {
  return {async lookup({term,providerId,signal}) {
    if(term?.status)return term;
    const provider=providers.get(providerId);
    if(!provider || !term?.language || provider.language!==term.language)return {status:'unsupported'};
    if(signal?.aborted)return {status:'cancelled'};
    const abort=new AbortController();let timedOut=false,finishAbort;
    const stopped=new Promise(resolve=>finishAbort=resolve);
    const stop=()=>{abort.abort();finishAbort({status:timedOut?'timeout':'cancelled'});};
    signal?.addEventListener('abort',stop,{once:true});
    const timer=timers.setTimeout(()=>{timedOut=true;stop();},10000);
    async function request(){
      let key;
      if(provider.keyRequired){try{key=await credentials?.get(providerId);}catch{return {status:'credential-unavailable'};}if(!key)return {status:'missing-key'};}
      if(abort.signal.aborted)return {status:'cancelled'};
      const options={query:term.query,signal:abort.signal,key,fetch,parseDocument};
      let definition=await provider.lookup(options),normalizedRetry=false;
      if(!definition && term.language==='he' && term.withoutNiqqud && !abort.signal.aborted){normalizedRetry=true;definition=await provider.lookup({...options,query:term.withoutNiqqud});}
      return definition?{status:'ok',definition,normalizedRetry}:{status:'no-result'};
    }
    try {return await Promise.race([request().catch(error=>({status:['rate-limit','cancelled'].includes(error.code)?error.code:'unavailable'})),stopped]);}
    finally {timers.clearTimeout(timer);signal?.removeEventListener('abort',stop);}
  }};
}
