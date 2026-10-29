const {setTimeout}=ChromeUtils.importESModule('resource://gre/modules/Timer.sys.mjs');
export async function run(){
 const receipt={checks:[],screenshots:[]};const pause=ms=>new Promise(r=>setTimeout(r,ms));
 const check=(name,passed)=>{receipt.checks.push({name,passed:!!passed});if(!passed)throw Error(name);};
 try{
  const win=Services.wm.getMostRecentWindow('navigator:browser');
  const page=PathUtils.join(PathUtils.profileDir,'glance-example.html');
  await IOUtils.writeUTF8(page,'<!doctype html><meta charset="utf-8"><title>Reading in Glance</title><style>html{background:#f6f5f1;color:#24312d;font:18px/1.65 Arial,sans-serif}body{max-width:560px;margin:90px auto;padding:0 35px}h1{font:600 38px/1.2 Arial,sans-serif;margin:16px 0 28px}p{margin:0 0 22px}small{font-size:13px;letter-spacing:.12em;color:#66736d}hr{border:0;border-top:1px solid #d8ddd7;margin:32px 0}</style><small>ZEN BROWSER</small><h1>Reading in Glance</h1><p>Open a link, take a quick look, and return to the page you were reading.</p><hr><p>The buttons beside this panel let you close it, expand it, open a split view, or copy its link.</p><p>With Glance Controls, you choose where those buttons sit and which ones appear.</p>');
  const file=Cc['@mozilla.org/file/local;1'].createInstance(Ci.nsIFile);file.initWithPath(page);
  await win.gZenGlanceManager.openGlance({url:Services.io.newFileURI(file).spec,triggeringPrincipal:Services.scriptSecurityManager.getSystemPrincipal(),clientX:300,clientY:200,width:100,height:30});
  await pause(2200);
  const group=win.document.querySelector('.zen-glance-sidebar-container');check('native Glance is open',group);
  for(const setting of [{side:'left',percent:'50',scale:'1',order:'close,expand,split,copy',split:true,name:'left-centred.png'},{side:'right',percent:'70',scale:'0.8',order:'copy,close,expand,split',split:false,name:'right-compact.png'}]){
   for(const key of ['side','percent','scale','order'])Services.prefs.setStringPref('glance.position.'+key,setting[key]);
   Services.prefs.setBoolPref('glance.position.show.split',setting.split);
   await win.SineAPI.manager.rebuildMods(false,false);await pause(500);
   const visible=[...group.children].filter(x=>x.getBoundingClientRect().height>0);check(setting.name+' visible buttons',visible.length===(setting.split?4:3));
   const p=group.parentElement.getBoundingClientRect(),b=group.getBoundingClientRect();
   check(setting.name+' correct side',setting.side==='left'?Math.abs(b.right-p.left)<1:Math.abs(b.left-p.right)<1);
   const l=Math.max(0,Math.min(p.left,b.left)-18),t=Math.max(0,p.top-12),r=Math.min(win.innerWidth,Math.max(p.right,b.right)+18),bottom=Math.min(win.innerHeight,p.bottom+12);
   const bitmap=await win.browsingContext.currentWindowGlobal.drawSnapshot(new win.DOMRect(l,t,r-l,bottom-t),1,'white');
   const canvas=win.document.createElementNS('http://www.w3.org/1999/xhtml','canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;canvas.getContext('2d').drawImage(bitmap,0,0);
   const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));await IOUtils.write(PathUtils.join(PathUtils.profileDir,setting.name),new Uint8Array(await blob.arrayBuffer()));bitmap.close();receipt.screenshots.push(setting.name);
  }
  receipt.passed=true;
 }catch(e){receipt.passed=false;receipt.error=String(e)+'\n'+e.stack;}
 await IOUtils.writeJSON(PathUtils.join(PathUtils.profileDir,'position-result.json'),receipt);Services.startup.quit(Ci.nsIAppStartup.eForceQuit);
}
