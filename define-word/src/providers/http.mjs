export function failure(code) {return Object.assign(new Error(code),{code});}
export async function requestJson(url,{fetch,signal}) {
  try {
    const response=await fetch(url,{signal,credentials:'omit',redirect:'error',referrerPolicy:'no-referrer',headers:{Accept:'application/json'}});
    if(response.status===404)return null;
    if(response.status===429)throw failure('rate-limit');
    if(!response.ok || Number(response.headers.get('content-length'))>1048576)throw failure('unavailable');
    const reader=response.body.getReader(),chunks=[];let bytes=0;
    try {while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.byteLength;if(bytes>1048576)throw failure('unavailable');chunks.push(value);}}
    finally {await reader.cancel().catch(()=>{});reader.releaseLock();}
    const buffer=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){buffer.set(chunk,offset);offset+=chunk.byteLength;}
    return JSON.parse(new TextDecoder().decode(buffer));
  } catch(error) {if(signal?.aborted)throw failure('cancelled');throw failure(error.code==='rate-limit'?'rate-limit':'unavailable');}
}
export function safeUrl(value,hosts) {
  try {const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&hosts.includes(u.hostname)?u.href:null;}catch{return null;}
}
export const text=value=>typeof value==='string'?value.replace(/\s+/g,' ').trim().slice(0,4000):'';
