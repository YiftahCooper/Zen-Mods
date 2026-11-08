const {browser:w,Services,pause,waitFor,rect,nativeEvent,sourceURI}=ctx;
if(Cc['@mozilla.org/gfx/info;1'].getService(Ci.nsIGfxInfo).isHeadless!==true||Services.env.get('MOZ_HEADLESS')!=='1')throw new Error('This probe requires the isolated headless clipboard; no clipboard API called.');
const owner=await waitFor(()=>w.__contextMenuEditor?.controller&&w.__contextMenuEditor,'Sine editor');
const root=w.document.getElementById('contentAreaContextMenu'),contentBrowser=w.gBrowser.selectedBrowser;
if(!/^http:\/\/127\.0\.0\.1:\d+\/sample-page\.html$/.test(contentBrowser.currentURI.spec))throw new Error('Disposable HTTP fixture required');
const resource=Services.io.getProtocolHandler('resource').QueryInterface(Ci.nsIResProtocolHandler);
resource.setSubstitution('cme-native-context-matrix',Services.io.newURI(sourceURI));
const model=ChromeUtils.importESModule('resource://cme-native-context-matrix/src/model.mjs');
const modelJSON=Cu.getGlobalForObject(model.createState).JSON,patch=value=>modelJSON.parse(JSON.stringify(value));
const save=state=>owner.store.save(w.JSON.parse(model.serializeState(state)),owner.store.read().raw);
const read=()=>model.parseState(owner.store.read().raw);
const inventory=()=>owner.controller.getInventory().find(menu=>menu.id===root.id).items;
const checks={},details={baseline:[],edited:[],commands:[]},originalRaw=owner.store.read().raw;
const messageName='CME:NativeContext:'+Services.uuid.generateUUID().toString(),replyName=messageName+':reply',mm=contentBrowser.messageManager;
let sequence=0;
const pending=new Map();
const receive=message=>{const entry=pending.get(message.data.id);if(entry){pending.delete(message.data.id);entry.resolve(message.data);}};
mm.addMessageListener(replyName,receive);
const frameBody=`(function(){
 const name=${JSON.stringify(messageName)},reply=${JSON.stringify(replyName)};
 addMessageListener(name,function(message){
  const {id,action,spec}=message.data;
  try{
   const document=content.document,el=document.getElementById(spec.id);
   if(!el)throw new Error('Fixture target missing: '+spec.id);
   if(action==='prepare'){
    content.getSelection().removeAllRanges();document.activeElement?.blur();
    el.scrollIntoView({block:'center'});el.focus();
    if(spec.selection==='text'){const range=document.createRange();range.selectNodeContents(el);content.getSelection().addRange(range);}
    if(spec.selection==='input')el.setSelectionRange(0,el.value.length);
    if(spec.selection==='input-partial')el.setSelectionRange(1,3);
   }
   const box=el.getBoundingClientRect();
   sendAsyncMessage(reply,{id,ok:true,value:{id:el.id,tag:el.localName,type:el.type||null,x:box.x+Math.min(20,box.width/2),y:box.y+box.height/2,width:box.width,height:box.height,selected:content.getSelection().toString(),value:el.value??null,selectionStart:el.selectionStart??null,selectionEnd:el.selectionEnd??null,muted:el.muted??null,loop:el.loop??null,controls:el.controls??null,readyState:el.readyState??null}});
  }catch(error){sendAsyncMessage(reply,{id,ok:false,error:String(error)});}
 });
})();`;
mm.loadFrameScript('data:application/javascript,'+encodeURIComponent(frameBody),false);
async function content(action,spec){
 const id=++sequence;const response=new Promise(resolve=>pending.set(id,{resolve}));mm.sendAsyncMessage(messageName,{id,action,spec});
 const result=await Promise.race([response,pause(5000).then(()=>({ok:false,error:'Content fixture query timed out'}))]);
 if(!result.ok)throw new Error(result.error);return result.value;
}
const cases=[
 {id:'plain',flag:'plain'},{id:'selection',selection:'text',flag:'selection'},
 {id:'link',flag:'onLink'},{id:'mailto',flag:'onMailtoLink'},{id:'telephone',flag:'onTelLink'},
 {id:'image',flag:'onImage'},{id:'linked-image',flag:'onImage'},
 {id:'canvas',flag:'onCanvas'},{id:'text-input',selection:'input',flag:'onTextInput'},
 {id:'textarea',selection:'input',flag:'onTextInput'},{id:'readonly-input',selection:'input',flag:'onTextInput'},
 {id:'password',selection:'input',flag:'onPassword'},{id:'contenteditable',selection:'text',flag:'isDesignMode'},
 {id:'audio',flag:'onAudio'},{id:'video',flag:'onVideo'}
];
const targetIds=['context-copylink','context-openlinkintab','context-copyemail','context-copyphone','context-copyimage',
 'context-copyimage-contents','context-copy','context-cut','context-paste','context-selectall','context-media-play',
 'context-media-mute','context-media-unmute','context-media-loop','context-media-hidecontrols','context-media-showcontrols',
 'context-copyaudiourl','context-copyvideourl','context-viewsource'];
const originals=new Map(targetIds.map(id=>[id,w.document.getElementById(id)]).filter(([,node])=>node));
function snapshot(spec,fixture){
 const context=w.gContextMenu;
 return{id:spec.id,fixture,flags:Object.fromEntries(['onLink','onMailtoLink','onTelLink','onImage','onCanvas','onTextInput','onPassword','isDesignMode','isContentSelected','onAudio','onVideo'].map(key=>[key,Boolean(context?.[key])])),
  rows:Object.fromEntries([...originals].map(([id,node])=>[id,{hidden:Boolean(node.hidden)||node.getAttribute('collapsed')==='true',disabled:Boolean(node.disabled),checked:node.getAttribute('checked'),label:node.getAttribute('label')}]))};
}
async function close(){root.hidePopup();await waitFor(()=>root.state==='closed','page popup closed',5000);await pause(40);}
async function open(spec){
 if(root.state!=='closed')await close();
 const fixture=await content('prepare',spec),bounds=contentBrowser.getBoundingClientRect();
 await nativeEvent.synthesizeMouseAtPoint(bounds.x+fixture.x,bounds.y+fixture.y,{type:'contextmenu',button:2},w);
 await waitFor(()=>root.state==='open','trusted '+spec.id+' context menu',6000);await pause(120);
 return snapshot(spec,fixture);
}
async function invoke(id,input='command'){
 const node=originals.get(id),menu=node?.parentElement?.parentElement;
 if(!node||node.hidden||node.disabled)throw new Error('Command unavailable: '+id);
 if(menu?.matches?.('menu[data-cme-owned]')){menu.open=true;await waitFor(()=>node.parentElement.state==='open','original command custom submenu',5000);}
 checks['originalCommandInCustomSubmenu:'+id]=menu?.matches?.('menu[data-cme-owned]')&&menu.getAttribute('label')==='Native context actions';
 let trusted=false;const routes=[],command=w.document.getElementById(node.getAttribute('command'));
 const handler=event=>{trusted ||=event.isTrusted;routes.push(event.target.id);};
 node.addEventListener('command',handler);command?.addEventListener('command',handler);
 if(input==='mouse'){const box=node.getBoundingClientRect();await nativeEvent.synthesizeMouseAtPoint(box.x+box.width/2,box.y+box.height/2,{button:0},w);await waitFor(()=>trusted,'trusted native mouse command '+id,5000);}else node.doCommand();
 node.removeEventListener('command',handler);command?.removeEventListener('command',handler);
 details.commands.push({id,input,trusted,routes,originalIdentity:w.document.getElementById(id)===node,parent:node.parentElement.id||node.parentElement.localName});
 checks['trustedOriginalCommand:'+id]=trusted&&w.document.getElementById(id)===node;
 await close();
}
function clipboardText(){
 const transfer=Cc['@mozilla.org/widget/transferable;1'].createInstance(Ci.nsITransferable);transfer.init(null);transfer.addDataFlavor('text/plain');
 Services.clipboard.getData(transfer,Ci.nsIClipboard.kGlobalClipboard);const data={};transfer.getTransferData('text/plain',data);
 return data.value.QueryInterface(Ci.nsISupportsString).data;
}
try{
 let state=read();state.options.enabled=false;save(state);await pause(150);
 for(const spec of cases){
  const baseline=await open(spec);details.baseline.push(baseline);
  const flag=spec.flag;checks['nativeContextRecognized:'+spec.id]=flag==='plain'?!baseline.flags.onLink&&!baseline.flags.onImage&&!baseline.flags.onTextInput:flag==='selection'?baseline.flags.isContentSelected:Boolean(baseline.flags[flag]);
  await close();
 }
 state=model.mergeInventory(read(),root.id,inventory());state.options.enabled=true;
 state=model.addSubmenu(state,root.id,'Native context actions',null,0,'cme-context-actions');
 for(const [id,node]of originals){
  const descriptor=inventory().find(row=>row.key===id);if(!descriptor)continue;
  state=model.updateItem(state,root.id,id,patch({name:'Edited '+id,icon:{kind:'text',text:'◆'}}));
  if(!descriptor.locked&&descriptor.boundary===null)state=model.moveItem(state,root.id,id,'cme-context-actions',state.roots[root.id].records['cme-context-actions'].children.length,inventory());
 }
 save(state);await pause(100);
 for(const spec of cases){
  const edited=await open(spec),baseline=details.baseline.find(row=>row.id===spec.id);details.edited.push(edited);
  checks['contextFlagsPreserved:'+spec.id]=JSON.stringify(edited.flags)===JSON.stringify(baseline.flags);
  checks['ownerVisibilityPreserved:'+spec.id]=targetIds.every(id=>!baseline.rows[id]||edited.rows[id]?.hidden===baseline.rows[id].hidden);
  checks['ownerDisabledStatePreserved:'+spec.id]=targetIds.every(id=>!baseline.rows[id]||edited.rows[id]?.disabled===baseline.rows[id].disabled);
  checks['originalNodesPreserved:'+spec.id]=[...originals].every(([id,node])=>w.document.getElementById(id)===node);
  checks['editsApplied:'+spec.id]=[...originals].filter(([id])=>!edited.rows[id].hidden).every(([id,node])=>node.getAttribute('label')==='Edited '+id&&node.querySelector('.cme-decoration')?.textContent==='◆');
  const custom=root.querySelector('menu[data-cme-owned]');
  checks['customSubmenuVisibility:'+spec.id]=Boolean(custom)&&custom.hidden===[...originals].every(([id])=>edited.rows[id].hidden);
  await close();
  checks['closeRestoresOwnerNodes:'+spec.id]=[...originals].every(([id,node])=>node.parentElement===root||inventory().find(row=>row.key===id)?.boundary!==null)&&!root.querySelector('[data-cme-owned],.cme-decoration');
 }
 // A hidden customization can suppress a native command, and clearing it must
 // still defer to the owner's context-dependent hidden state on the next open.
 save(model.updateItem(read(),root.id,'context-copylink',patch({hidden:true})));
 await open(cases.find(spec=>spec.id==='link'));checks.customHiddenSuppressesEligibleCommand=originals.get('context-copylink').hidden===true;await close();
 save(model.updateItem(read(),root.id,'context-copylink',patch({hidden:false})));
 await open(cases.find(spec=>spec.id==='plain'));checks.unhideDoesNotExposeIneligibleCommand=originals.get('context-copylink').hidden===true;await close();
 await open(cases.find(spec=>spec.id==='link'));checks.unhideRestoresEligibleCommand=originals.get('context-copylink').hidden===false;await close();
 // Dispatch the original native handlers from their new custom submenu and
 // observe the real browser/content effects rather than synthetic listeners.
 Cc['@mozilla.org/widget/clipboardhelper;1'].getService(Ci.nsIClipboardHelper).copyString('cme-context-sentinel');
 await open(cases.find(spec=>spec.id==='link'));await invoke('context-copylink','mouse');checks.copyLinkPreservesNativeEffect=clipboardText()===contentBrowser.currentURI.spec+'#opened=page-link';
 await open(cases.find(spec=>spec.id==='selection'));await invoke('context-copy');checks.copySelectionPreservesNativeEffect=clipboardText()==='Native selection fixture with meaningful copied text.';
 const partial=await open({id:'textarea',selection:'input-partial'});await invoke('context-selectall');await pause(100);
 const selected=await content('read',{id:'textarea'});checks.selectAllPreservesEditableEffect=partial.fixture.selectionStart===1&&partial.fixture.selectionEnd===3&&selected.selectionStart===0&&selected.selectionEnd===selected.value.length;
 await open(cases.find(spec=>spec.id==='audio'));const mediaBefore=await content('read',{id:'audio'});await invoke('context-media-mute');
 await pause(200);const muted=await content('read',{id:'audio'});checks.mediaMutePreservesNativeEffect=mediaBefore.muted===false&&muted.muted===true;
 await open(cases.find(spec=>spec.id==='audio'));checks.mediaConditionalMuteAfterCommand=originals.get('context-media-mute').hidden&& !originals.get('context-media-unmute').hidden;
 await invoke('context-media-unmute');await pause(150);checks.mediaUnmutePreservesNativeEffect=(await content('read',{id:'audio'})).muted===false;
 await open(cases.find(spec=>spec.id==='audio'));await invoke('context-media-loop');await pause(150);checks.mediaLoopPreservesNativeEffect=(await content('read',{id:'audio'})).loop===true;
 const tabsBefore=new Set(w.gBrowser.tabs);await open(cases.find(spec=>spec.id==='link'));await invoke('context-openlinkintab','mouse');
 const opened=await waitFor(()=>[...w.gBrowser.tabs].find(tab=>!tabsBefore.has(tab)&&tab.linkedBrowser.currentURI.spec.endsWith('#opened=page-link')),'native open link in tab',8000);
 checks.openLinkPreservesNativeEffect=Boolean(opened);w.gBrowser.removeTab(opened,{animate:false});
 return{checks,details,caseCount:cases.length,originalCommandCount:originals.size,
  inputEvidence:'Actual HTTP fixture DOM, trusted Gecko contextmenu input, owner nsContextMenu baselines, same original XUL nodes in custom submenus, native mouse activation for link copy/open, original XUL doCommand for edit/media commands, real clipboard/content/new-tab effects. No hardware input or everyday-profile acceptance.'};
}finally{
 root.hidePopup();owner.store.save(w.JSON.parse(model.serializeState(model.parseState(originalRaw))),owner.store.read().raw);
 mm.removeMessageListener(replyName,receive);resource.setSubstitution('cme-native-context-matrix',null);
}
