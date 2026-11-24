export function failure(code) {return Object.assign(new Error(code),{code});}
async function request(url,{fetch,signal,key,lexicalaKey},format) {
  try {
    const target=new URL(url);
    const lexicala=target.hostname==='lexicala1.p.rapidapi.com';
    const headers={Accept:format==='json'?'application/json':'text/html'};
    if(lexicala||lexicalaKey!==undefined){
      // A dedicated credential channel: never forward this key to other hosts or routes.
      if(!safeUrl(url,['lexicala1.p.rapidapi.com'])||target.port||target.pathname!=='/search'||target.hash)throw failure('unavailable');
      if(typeof lexicalaKey!=='string'||!lexicalaKey.trim())throw failure('missing-key');
      if(lexicalaKey.length>4096||/[\x00-\x20\x7f]/.test(lexicalaKey))throw failure('unavailable');
      headers['X-RapidAPI-Key']=lexicalaKey;headers['X-RapidAPI-Host']='lexicala1.p.rapidapi.com';
    }else if(!safeUrl(url,['api.dictionaryapi.dev','en.wiktionary.org','he.wiktionary.org','www.dictionaryapi.com','kalanit.hebrew-academy.org.il','milog.co.il'])||target.port)throw failure('unavailable');
    if(target.hostname==='kalanit.hebrew-academy.org.il'&&(target.pathname!=='/api/Ac/'||format!=='json'))throw failure('unavailable');
    if(format==='html'&&target.hostname!=='milog.co.il')throw failure('unavailable');
    const init={signal,credentials:'omit',redirect:'error',referrerPolicy:'no-referrer',headers};
    // Merriam-Webster requires its key in the URL query. Keep keyed responses
    // out of the HTTP cache so none is stored under a key-bearing URL (0.3.6).
    if(key!==undefined||lexicala||lexicalaKey!==undefined)init.cache='no-store';
    const response=await fetch(url,init);
    if(response.status===404)return null;
    if(response.status===401)throw failure('unauthorized');
    if(response.status===403)throw failure('access-denied');
    if(response.status===429)throw failure('rate-limit');
    if(!response.ok)throw Object.assign(failure('unavailable'),{status:response.status});// An HTTP status, not a parse error (0.3.6).
    if(Number(response.headers.get('content-length'))>1048576)throw failure('unavailable');
    const reader=response.body.getReader(),chunks=[];let bytes=0;
    try {while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>1048576)throw failure('unavailable');chunks.push(value);}}
    finally {await reader.cancel().catch(()=>{});reader.releaseLock();}
    const buffer=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){buffer.set(chunk,offset);offset+=chunk.byteLength;}
    const body=new TextDecoder().decode(buffer);
    return format==='json'?JSON.parse(body):body;
  } catch(error) {if(signal?.aborted)throw failure('cancelled');
    // Our own failures carry a string code. Keep anything else (a network or
    // JSON parse error) as the cause so the lookup can log it (0.3.6).
    if(typeof error?.code==='string')throw error;throw Object.assign(failure('unavailable'),{cause:error});}
}
export const requestJson=(url,options)=>request(url,options,'json');
export const requestHtml=(url,options)=>request(url,options,'html');
export function safeUrl(value,hosts) {
  try {const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&hosts.includes(u.hostname)?u.href:null;}catch{return null;}
}
export const text=value=>typeof value==='string'?value.replace(/\s+/g,' ').trim().slice(0,4000):'';
