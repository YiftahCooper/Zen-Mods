const {browser:w,Services,pause,waitFor,rect,nativeEvent,sourceURI}=ctx;
const owner=await waitFor(()=>w.__contextMenuEditor?.controller&&w.__contextMenuEditor,'Sine candidate owner');
const root=w.document.getElementById('tabContextMenu');
if(!root)throw new Error('Native tab context menu missing');
const resource=Services.io.getProtocolHandler('resource').QueryInterface(Ci.nsIResProtocolHandler);
resource.setSubstitution('cme-native-probe',Services.io.newURI(sourceURI));
const model=ChromeUtils.importESModule('resource://cme-native-probe/src/model.mjs');
// The browser window and imported module have distinct Object prototypes.
// Transfer JSON at that boundary, as persisted settings do in the real UI.
const modelJSON=Cu.getGlobalForObject(model.createState).JSON;
const patch=value=>modelJSON.parse(JSON.stringify(value));
const save=(state,before=owner.store.read())=>owner.store.save(w.JSON.parse(model.serializeState(state)),before.raw);
const nativeBaseline=[...root.children];
// Zen may lazily insert a native container menu on the first opening. Require
// every original node in its original relative order while allowing that row.
const restoredNativeOrder=()=>{
 const originals=[...root.children].filter(node=>nativeBaseline.includes(node));
 return originals.length===nativeBaseline.length&&originals.every((node,index)=>node===nativeBaseline[index]);
};
const hits=[],fixtures=[];
function item(id,label,type){
 const node=w.document.createXULElement('menuitem');node.id=id;node.setAttribute('label',label);
 if(type){node.setAttribute('type',type);node.setAttribute('checked','true');}
 root.append(node);fixtures.push(node);return node;
}
const first=item('cme-fixture-copy-message','Copy message');
const second=item('cme-fixture-translate','Translate phrase');
const checked=item('cme-fixture-check','Check option','checkbox');
first.addEventListener('command',event=>hits.push({route:'direct',id:event.target.id,trusted:event.isTrusted}));
const delegated=event=>{if(event.target===second)hits.push({route:'root',id:event.target.id,trusted:event.isTrusted});};
root.addEventListener('command',delegated);
// Zen 1.24 starts a fresh profile on its hidden placeholder tab (zen-empty-tab,
// display:none), which has no bounds to right-click. Use a real tab instead.
async function visibleTab(){let tab=w.gBrowser.selectedTab;if(tab.hasAttribute('zen-empty-tab')||!(tab.getBoundingClientRect().width>0)){tab=w.gBrowser.addTab('about:blank#cme-native-tab',{triggeringPrincipal:Services.scriptSecurityManager.getSystemPrincipal()});w.gBrowser.selectedTab=tab;}await waitFor(()=>{const r=tab.getBoundingClientRect();return r.width>0&&r.height>0;},'visible native tab');return tab;}
async function show(){
 const tab=await visibleTab(),r=tab.getBoundingClientRect();
 if(r.width<=0||r.height<=0)throw new Error('Selected native tab has no visible bounds');
 await nativeEvent.synthesizeMouseAtPoint(r.x+r.width/2,r.y+r.height/2,{type:'contextmenu',button:2},w);
 await waitFor(()=>root.state==='open','native tab popup');await pause(200);
}
const records=[],checks={};
try{
 await pause(100);owner.controller.refresh();
 let inventory=owner.controller.getInventory().find(menu=>menu.id===root.id);
 checks.genericLateDiscovery=[first,second,checked].every(node=>inventory.items.some(d=>d.key===node.id));
 let state=model.mergeInventory(model.parseState(owner.store.read().raw),root.id,inventory.items);
 state=model.addSubmenu(state,root.id,'My tools',null,0,'cme-custom-tools');
 state=model.moveItem(state,root.id,first.id,'cme-custom-tools',0,inventory.items);
 state=model.moveItem(state,root.id,second.id,'cme-custom-tools',1,inventory.items);
 state=model.addSeparator(state,root.id,'cme-custom-tools',1,'cme-custom-line');
 state=model.moveItem(state,root.id,checked.id,'cme-custom-tools',3,inventory.items);
 state=model.updateItem(state,root.id,first.id,patch({name:'Copy my message',icon:{kind:'text',text:'★★★★★★★★'}}));
 state=model.updateItem(state,root.id,'cme-custom-tools',patch({icon:{kind:'asset',pack:'zen',id:'menu'}}));
 save(state);
 await show();
 const custom=root.querySelector('menu[data-cme-owned]'),popup=custom?.querySelector('menupopup');
 if(!custom||!popup)throw new Error('Custom native submenu missing');
 custom.open=true;await waitFor(()=>popup.state==='open','custom native popup');await pause(100);
 checks.originalIdentityInCustomSubmenu=popup?.children[0]===first&&popup?.children[2]===second;
 checks.customSeparator=popup?.children[1]?.localName==='menuseparator';
 checks.nativeNameAndUnicode=first.getAttribute('label')==='Copy my message'&&first.querySelector('.cme-decoration')?.textContent==='★★★★★★★★';
 checks.nativeCheckedRetained=checked.getAttribute('checked')==='true'&&checked.getAttribute('type')==='checkbox';
 const deco=first.querySelector('.cme-decoration'),nativeIcon=checked.querySelector(':scope > .menu-icon, .menu-iconic-icon');
 const decorationBounds=rect(deco),checkBounds=rect(nativeIcon);
 const symbolBounds=rect(deco.querySelector('.cme-symbol-glyph'));
 checks.nativeLongSymbolFitsIcon=symbolBounds.width>0&&symbolBounds.width<=decorationBounds.width+0.5&&symbolBounds.height<=decorationBounds.height+0.5;
 checks.nativeLongSymbolInsideSlot=symbolBounds.left>=decorationBounds.left-0.5&&symbolBounds.right<=decorationBounds.right+0.5&&symbolBounds.top>=decorationBounds.top-0.5&&symbolBounds.bottom<=decorationBounds.bottom+0.5;
 checks.nativeDecorationVisible=Boolean(decorationBounds?.width>0&&decorationBounds.height>0&&decorationBounds.height<=24&&w.getComputedStyle(deco).visibility==='visible');
 checks.nativeCheckedSlotVisible=Boolean(checkBounds?.width>0&&checkBounds.height>0&&w.getComputedStyle(nativeIcon).visibility==='visible'&&w.getComputedStyle(nativeIcon).display!=='none');
 checks.customPopupHasStatusGutter=popup.getAttribute('needsgutter')==='true';
 const firstBounds=rect(first);
 await nativeEvent.synthesizeMouseAtPoint(firstBounds.x+firstBounds.width/2,firstBounds.y+firstBounds.height/2,{type:'mousemove'},w);await pause(100);
 checks.activeCustomPopupRetained=popup.isConnected&&popup.state==='open'&&first.parentElement===popup&&custom.parentElement===root;
 checks.symbolFittingRetainsDecoration=first.querySelector('.cme-decoration')===deco;
 records.push({stage:'open',rootState:root.state,custom:rect(custom),item:rect(first),decoration:rect(deco),checked:rect(checked),
  decorationStyle:deco?{display:w.getComputedStyle(deco).display,width:w.getComputedStyle(deco).width,height:w.getComputedStyle(deco).height}:null,
  checkSlot:nativeIcon?{bounds:rect(nativeIcon),visibility:w.getComputedStyle(nativeIcon).visibility,display:w.getComputedStyle(nativeIcon).display,content:w.getComputedStyle(nativeIcon).content}:null,
  customChildren:[...popup?.children||[]].map(node=>({id:node.id,label:node.getAttribute('label'),kind:node.localName}))});
 // Native API dispatch on the original XUL nodes, not a forwarding clone.
 first.doCommand();second.doCommand();
 checks.directAndDelegatedCommands=hits.some(hit=>hit.route==='direct')&&hits.some(hit=>hit.route==='root');
 root.hidePopup();await pause(100);
 checks.closeRestoresOriginalOrder=restoredNativeOrder();
 records.push({stage:'closed',originalCount:nativeBaseline.length,restoredOriginalCount:[...root.children].filter(node=>nativeBaseline.includes(node)).length,
  lateOwnerRows:[...root.children].filter(node=>!nativeBaseline.includes(node)&&!fixtures.includes(node)).map(node=>({id:node.id,kind:node.localName}))});
 checks.closeRemovesOwnedNodes=!root.querySelector('[data-cme-owned],.cme-decoration');
 checks.closeRestoresName=first.getAttribute('label')==='Copy message';
 for(const alignment of ['left','right']){
  const next=model.parseState(owner.store.read().raw);next.options.iconAlignment=alignment;save(next);
  await show();const alignedMenu=root.querySelector('menu[data-cme-owned]'),alignedPopup=alignedMenu.querySelector('menupopup');
  alignedMenu.open=true;await waitFor(()=>alignedPopup.state==='open',`${alignment} aligned submenu`);await pause(100);
  const slot=rect(first.querySelector('.cme-decoration')),glyph=rect(first.querySelector('.cme-symbol-glyph'));
  checks[`nativeLongSymbol${alignment==='left'?'Left':'Right'}Fit`]=glyph.width>0&&glyph.left>=slot.left-0.5&&glyph.right<=slot.right+0.5&&glyph.top>=slot.top-0.5&&glyph.bottom<=slot.bottom+0.5;
  root.hidePopup();await pause(50);
 }
 // A different node with the same stable ID inherits customization.
 const replacement=w.document.createXULElement('menuitem');replacement.id=first.id;replacement.setAttribute('label','Copy replacement');
 first.replaceWith(replacement);fixtures.push(replacement);await pause(100);
 await show();checks.replacementReusesSavedOverrides=replacement.getAttribute('label')==='Copy my message'&&replacement.parentElement?.parentElement?.getAttribute('label')==='My tools';
 root.hidePopup();await pause(100);
 const beforeDisable=owner.store.read();let hidden=model.updateItem(model.parseState(beforeDisable.raw),root.id,replacement.id,patch({hidden:true}));save(hidden,beforeDisable);
 await show();checks.disabledStaysInSavedPosition=replacement.hidden===true&&replacement.parentElement?.children[0]===replacement;
 root.hidePopup();await pause(100);
 const beforeEnable=owner.store.read();save(model.updateItem(model.parseState(beforeEnable.raw),root.id,replacement.id,patch({hidden:false})),beforeEnable);
 await show();checks.reenabledReturnsSamePosition=replacement.hidden===false&&replacement.parentElement?.children[0]===replacement;
 owner.unload();await pause(100);
 checks.unloadWhileOpenRestoresOrder=restoredNativeOrder();
 checks.unloadRemovesOwnedContainers=!root.querySelector('[data-cme-owned],.cme-decoration');
 root.hidePopup();
 return{checks,hits,records,inventoryCounts:inventory.items.length,
  app:{version:Services.appinfo.version,buildID:Services.appinfo.appBuildID},
  inputEvidence:'Gecko trusted contextmenu opening; XUL doCommand original-node command dispatch. Hardware input and command modifiers are separate qualification.'};
}finally{
 root.hidePopup();root.removeEventListener('command',delegated);for(const node of fixtures)node.remove();resource.setSubstitution('cme-native-probe',null);
}
