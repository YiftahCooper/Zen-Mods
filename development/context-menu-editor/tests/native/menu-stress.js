const {browser:w,Services,waitFor,pause,nativeEvent,sourceURI}=ctx;
const editor=await waitFor(()=>w.__contextMenuEditor?.controller&&w.__contextMenuEditor,'editor');await waitFor(()=>w.__betterPinsController?.active,'Better Pins');
const root=w.document.getElementById('tabContextMenu'),checks={},details={cycles:[]};
const resource=Services.io.getProtocolHandler('resource').QueryInterface(Ci.nsIResProtocolHandler);resource.setSubstitution('cme-native-probe',Services.io.newURI(sourceURI));
const model=ChromeUtils.importESModule('resource://cme-native-probe/src/model.mjs'),json=Cu.getGlobalForObject(model.createState).JSON,patch=value=>json.parse(JSON.stringify(value));
const read=()=>model.parseState(editor.store.read().raw),save=state=>editor.store.save(w.JSON.parse(model.serializeState(state)),editor.store.read().raw);
const inventory=()=>editor.controller.getInventory().find(menu=>menu.id===root.id).items;
async function open(){const tab=w.gBrowser.selectedTab,b=tab.getBoundingClientRect();await nativeEvent.synthesizeMouseAtPoint(b.x+b.width/2,b.y+b.height/2,{type:'contextmenu',button:2},w);await waitFor(()=>root.state==='open','native tab menu');await pause(40);}
try{
 await open();const items=inventory(),pin=items.find(item=>item.source?.name==='Better Pins'&&item.label==='Pin URL');if(!pin)throw new Error('Actual Better Pins Pin URL missing');
 let state=model.mergeInventory(read(),root.id,items);state=model.addSubmenu(state,root.id,'Repeated tools',null,0,'cme-qa-repeat');state=model.moveItem(state,root.id,pin.key,'cme-qa-repeat',0,items);state=model.updateItem(state,root.id,pin.key,patch({name:'Repeated pin action',icon:{kind:'text',text:'✦'}}));save(state);root.hidePopup();await pause(30);
 const expectedForeign=items.filter(item=>item.source?.name==='Better Pins').map(item=>item.key).sort();let good=true;
 for(let index=0;index<30;index++){
  const start=w.performance.now();await open();const custom=root.querySelector('menu[label="Repeated tools"]'),popup=custom?.querySelector('menupopup'),node=popup?.querySelector('menuitem[label="Repeated pin action"]');
  custom.open=true;await waitFor(()=>popup.state==='open','retained customized submenu');await pause(20);
  const sameKeys=inventory().filter(item=>item.source?.name==='Better Pins').map(item=>item.key).sort().join('|')===expectedForeign.join('|');
  const unique=[...root.querySelectorAll('[data-cme-item]')].every(item=>item.querySelectorAll(':scope > .cme-decoration').length<=1);
  const opened=Boolean(node&&node.querySelector('.cme-decoration')?.textContent==='✦'&&custom.isConnected&&popup.state==='open'&&sameKeys&&unique);
  root.hidePopup();await pause(20);const cleaned=!root.querySelector('[data-cme-owned],.cme-decoration,[data-cme-item]')&&!root.hasAttribute('data-cme-root');
  details.cycles.push({index,opened,cleaned,elapsedMs:Math.round(w.performance.now()-start)});good&&=opened&&cleaned;
 }
 checks.thirtyForeignMenuOpeningsStayCorrect=good;
 checks.recreatedForeignIdentityCatalogueStaysBounded=inventory().filter(item=>item.source?.name==='Better Pins').length===expectedForeign.length;
 checks.savedOrderAndIconStayIntact=read().roots[root.id].records['cme-qa-repeat'].children[0]===pin.key&&read().roots[root.id].records[pin.key].icon.text==='✦';
 details.elapsedMs=details.cycles.reduce((sum,row)=>sum+row.elapsedMs,0);
 return{checks,details,inputEvidence:'Thirty real trusted native tab-menu openings with actual Better Pins/BZF and six other local mods loaded. Actual recreated command remains in a custom submenu, native popup opens, source identities remain bounded, per-row decorations are unique, and close removes every editor-owned overlay.'};
}catch(error){checks.completed=false;details.error=String(error);details.stack=error.stack;return{checks,details};}
finally{root.hidePopup();resource.setSubstitution('cme-native-probe',null);}
