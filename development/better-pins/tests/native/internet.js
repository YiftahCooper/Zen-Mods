const done=arguments[arguments.length-1];
(async()=>{
 const control=new AbortController(),timer=setTimeout(()=>control.abort(),15000);
 try{
  const response=await fetch('https://example.com/',{credentials:'omit',signal:control.signal});await response.arrayBuffer();
  return {results:[{name:'fresh-profile-direct-https-request-succeeds',pass:response.ok&&Services.prefs.getIntPref('network.proxy.type')===0,detail:{status:response.status,proxyType:Services.prefs.getIntPref('network.proxy.type')}}]};
 }finally{clearTimeout(timer);}
})().then(done,e=>done({error:String(e),stack:e.stack}));
