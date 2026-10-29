const done=arguments[arguments.length-1];
(async()=>{
 const wait=ms=>new Promise(r=>setTimeout(r,ms)),assert=(v,m)=>{if(!v)throw Error(m);};
 Services.io.getProtocolHandler('resource').QueryInterface(Ci.nsIResProtocolHandler).setSubstitution('bp-private',Services.io.newURI(Services.prefs.getStringPref('bp.test.source-root')));
 const api=ChromeUtils.importESModule('resource://bp-private/scripts/better-pins.uc.mjs'),win=OpenBrowserWindow({private:true});
 try{
  for(let i=0;i<160&&!win.gZenFolders;i++)await wait(25);assert(win.gZenFolders,'private window not ready');
  const nativeCreate=win.gZenFolders.createFolder,original=win.Services,descriptor=Object.getOwnPropertyDescriptor(win,'Services');let alerts=0;
  const prompt=new Proxy({},{get:(_,n)=>n==='alert'?()=>alerts++:Reflect.get(original.prompt,n)});
  Object.defineProperty(win,'Services',{configurable:true,value:new Proxy({},{get:(_,n)=>n==='prompt'?prompt:Reflect.get(original,n)})});
  try{const result=await api.bootstrap(win);assert(result?.ok===false,'private activation accepted');assert(win.gZenFolders.createFolder===nativeCreate&&!win.__betterPinsController,'private native ownership changed');assert(!win.document.querySelector('.better-pins-divider')&&!win.document.documentElement.hasAttribute('better-pins-active'),'private UI modified');assert(alerts===1,'unsupported window not reported');}
  finally{if(descriptor)Object.defineProperty(win,'Services',descriptor);else delete win.Services;}
  return {results:[{name:'private-window-refuses-activation-and-preserves-native-controls',pass:true}]};
 }finally{win.close();await wait(100);}
})().then(done,e=>done({error:String(e),stack:e.stack}));
