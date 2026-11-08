// Reviewed body for tools/native-sine-probe.py. Never attaches to an existing Zen.
const {browser:w,Services,waitFor,pause,rect,nativeEvent}=ctx;
await waitFor(()=>w.__contextMenuEditor?.controller,'editor runtime');
w.gBrowser.selectedTab=w.gBrowser.addTab('about:preferences',{triggeringPrincipal:Services.scriptSecurityManager.getSystemPrincipal()});
const p=await waitFor(()=>{const page=w.gBrowser.selectedBrowser.contentWindow;return page?.document.querySelector('[mod-id="context-menu-editor"] [data-cme-settings]')&&page;},'Sine editor');
p.document.getElementById('category-sine-mods').activate();
const card=p.document.querySelector('[mod-id="context-menu-editor"]'),dialog=card.querySelector('dialog');
card.querySelector('.sineItemConfigureButton').click();await waitFor(()=>dialog.open,'Configure open');await pause(500);
const settings=card.querySelector('[data-cme-settings]'),pref='extension.context-menu-editor.settings',checks={},details={events:[],drags:[]};
const row=key=>[...settings.querySelectorAll('[data-cme-key]')].find(element=>element.dataset.cmeKey===key);
const tree=()=>settings.querySelector('[data-cme-tree]'),popup=()=>settings.querySelector('[data-cme-popover]');
const raw=()=>Services.prefs.getStringPref(pref,''),state=()=>JSON.parse(raw()),root=()=>state().roots.contentAreaContextMenu;
const key=name=>nativeEvent.sendSingleKey({key:name,code:name,location:0,printable:false},p);
const events=details.events;
const record=event=>{
 const entry={type:event.type,trusted:event.isTrusted,key:event.target.closest?.('[data-cme-key]')?.dataset.cmeKey||null,
  action:event.target.dataset?.action||null,drop:event.target.dataset?.drop||null,x:event.clientX??null,y:event.clientY??null};
 if(event.type==='keydown')entry.keyValue=event.key;
 if(event.dataTransfer)entry.types=[...event.dataTransfer.types];
 if(events.length<400)events.push(entry);
};
for(const type of ['pointerdown','click','keydown','input','dragstart','dragenter','dragover','drop','dragend'])settings.addEventListener(type,record,true);
const utils={window:p,parent:p,_EU_Ci:Ci,_EU_Cc:Cc};
Services.scriptloader.loadSubScript('chrome://remote/content/external/EventUtils.js',utils);
async function click(element){
 if(!element)throw new Error('Missing pointer target');element.scrollIntoView({block:'nearest'});await pause(40);
 const bounds=rect(element),x=bounds.x+bounds.width/2,y=bounds.y+bounds.height/2;
 const hit=p.document.elementFromPoint(x,y);
 if(!element.contains(hit))throw new Error('Pointer target obscured: '+element.outerHTML);
 await nativeEvent.synthesizeMouseAtPoint(x,y,{button:0},p);await pause(40);
}
async function addGroup(name){
 // Setup uses the real UI. Focusing a known root item chooses a sibling insertion.
 row('context-inspect').querySelector('[data-action="more"]').focus();
 await click(settings.querySelector('[data-cme-toolbar="add"]'));
 await click(popup().querySelector('[data-cme-add="submenu"]'));
 const input=settings.querySelector('[data-action="name"]'),id=input.closest('[data-cme-key]').dataset.cmeKey;
 nativeEvent.sendKeys(name,p);key('Enter');await pause(60);
 if(root().records[id].name!==name)throw new Error('Trusted keyboard setup did not save '+name);
 return id;
}
async function beginDrag(sourceKey){
 const source=row(sourceKey).querySelector('[data-action="drag"]');source.scrollIntoView({block:'center'});await pause(60);
 const bounds=rect(source),x=bounds.x+bounds.width/2,y=bounds.y+bounds.height/2,start=events.length;
 await nativeEvent.synthesizeMouseAtPoint(x,y,{type:'mousemove',buttons:0},p);
 await nativeEvent.synthesizeMouseAtPoint(x,y,{type:'mousedown',button:0,buttons:1},p);
 await nativeEvent.synthesizeMouseAtPoint(x+12,y+8,{type:'mousemove',button:0,buttons:1},p);await pause(60);
 const session=p.windowUtils.dragSession;
 if(!session||!settings.classList.contains('cme-dragging'))throw new Error('Gecko did not start a pointer drag session for '+sourceKey);
 // The real dragstart listener, rather than the test, supplied this payload.
 const payload=JSON.parse(session.dataTransfer.getData('application/x-context-menu-editor'));
 if(payload.key!==sourceKey)throw new Error('Native drag payload has the wrong source');
 return{source,sourceKey,session,start,payload};
}
function dragAt(drag,x,y,type='dragover'){
 const hit=p.document.elementFromPoint(x,y);if(!hit)throw new Error('No native hit target for drag');
 // Gecko's WebDriver helper routes dragover through this same PresShell API.
 // Explicit coordinates avoid its element-center fallback while measuring scrolling.
 const event=utils.createDragEventObject(type,hit,p,drag.session.dataTransfer,{clientX:x,clientY:y});
 const result=utils.sendDragEvent(event,hit,p);
 return{hit,result,x,y,drop:hit.dataset?.drop||null,targetKey:hit.closest('[data-cme-key]')?.dataset.cmeKey||null};
}
async function finishDrag(drag){
 try{if(p.windowUtils.dragSession)drag.session.endDragSession(true,0);}catch{}
 const bounds=rect(tree());await nativeEvent.synthesizeMouseAtPoint(bounds.left+10,bounds.top+10,{type:'mouseup',button:0,buttons:0},p);await pause(70);
}
function dropPoint(targetKey,edge){
 const target=row(targetKey).querySelector(`[data-drop="${edge}"]`),bounds=rect(target);
 // Before/after zones overlap the next row. The interior of the requested zone
 // is hit-tested so the test never sends a drop to an obscured DOM element.
 for(const ratio of edge==='after'?[0.03,0.1,0.25,0.5,0.75,0.95]:[0.5,0.75,0.95,0.1]){
  const x=bounds.left+bounds.width/2,y=bounds.top+bounds.height*ratio;
  if(p.document.elementFromPoint(x,y)===target)return{x,y};
 }
 throw new Error('No hit-testable '+edge+' drop target for '+targetKey);
}
async function dropOn(sourceKey,targetKey,edge){
 const drag=await beginDrag(sourceKey);
 try{
  row(targetKey).scrollIntoView({block:'nearest'});await pause(60);
  const point=dropPoint(targetKey,edge),over=dragAt(drag,point.x,point.y);await pause(40);
  const active=over.hit.classList.contains('cme-drop-active');
  const before=raw();dragAt(drag,point.x,point.y,'drop');await pause(60);
  const relevant=events.slice(drag.start);
  details.drags.push({sourceKey,targetKey,edge,point,hitKey:over.targetKey,hitEdge:over.drop,active,changed:raw()!==before,
   trustedStart:relevant.some(event=>event.type==='dragstart'&&event.trusted),trustedOver:relevant.some(event=>event.type==='dragover'&&event.trusted),trustedDrop:relevant.some(event=>event.type==='drop'&&event.trusted)});
 }finally{await finishDrag(drag);}
}

// Trusted key input and pointer clicks exercise real focus/default behavior.
const A=await addGroup('Pointer A'),B=await addGroup('Pointer B'),C=await addGroup('Pointer C');
checks.trustedKeyboardTypesAndSaves=events.some(event=>event.type==='input'&&event.trusted)&&[A,B,C].every(id=>root().records[id].name.startsWith('Pointer '));
let label=row(A).querySelector('[data-action="label"]');label.focus();key('F2');
checks.trustedF2StartsRename=p.document.activeElement===row(A).querySelector('[data-action="name"]');
nativeEvent.sendKeys('Discarded draft',p);key('Escape');await pause(40);
checks.trustedEscapeCancelsRename=root().records[A].name==='Pointer A'&&p.document.activeElement===row(A).querySelector('[data-action="label"]');
await click(row(A).querySelector('[data-action="more"]'));
const firstAction=popup().querySelector('[data-action="rename"]');checks.pointerClickOpensFocusedActions=p.document.activeElement===firstAction;
key('End');checks.trustedEndMovesToLastAction=p.document.activeElement===popup().querySelector('[data-action="remove"]');
key('Home');key('ArrowDown');checks.trustedArrowNavigatesActions=p.document.activeElement===popup().querySelector('[data-action="change-icon"]');
key('Escape');checks.trustedEscapeReturnsTrigger=p.document.activeElement===row(A).querySelector('[data-action="more"]')&&!popup()&&dialog.open;

// New groups start C, B, A, after the same original root item.
await dropOn(A,C,'before');checks.beforeDropPersistsRootOrder=root().children.indexOf(A)+1===root().children.indexOf(C);
await dropOn(A,B,'after');checks.afterDropPersistsRootOrder=root().children.indexOf(B)+1===root().children.indexOf(A);
await dropOn(A,B,'inside');checks.insideDropPersistsParent=root().records[B].children.includes(A)&&!root().children.includes(A)&&row(A).dataset.parent===B&&!row(A).hidden;
checks.allDropsUseTrustedGeckoEvents=details.drags.length===3&&details.drags.every(drag=>drag.active&&drag.changed&&drag.trustedStart&&drag.trustedOver&&drag.trustedDrop&&drag.hitEdge===drag.edge&&drag.hitKey===drag.targetKey);
checks.completedDropClearsIndicators=!settings.classList.contains('cme-dragging')&&!settings.querySelector('.cme-drop-active');
await click(row(C).querySelector('[data-action="more"]'));key('Home');key('ArrowDown');key('ArrowDown');key('ArrowDown');
const moveDownFocused=p.document.activeElement===popup().querySelector('[data-action="down"]');key('Enter');await pause(50);
checks.trustedEnterActivatesMoveAction=moveDownFocused&&root().children.indexOf(B)+1===root().children.indexOf(C);
if(popup())key('Escape');

// The long original menu gives a real scrollable list; no fake dimensions.
tree().scrollTop=0;const beforeScrollRaw=raw(),drag=await beginDrag('context-back');
try{
 const bounds=rect(tree());tree().scrollTop=0;
 const x=bounds.left+bounds.width*.65,bottom=bounds.bottom-15,middle=bounds.top+bounds.height/2;
 const down=dragAt(drag,x,bottom);await pause(320);
 const downTop=tree().scrollTop;
 checks.dragNearBottomAutoscrolls=downTop>=36;
 dragAt(drag,x,middle);const stoppedTop=tree().scrollTop;await pause(180);
 checks.dragAwayFromEdgeStopsAutoscroll=tree().scrollTop===stoppedTop;
 const up=dragAt(drag,x,bounds.top+15);await pause(220);const upTop=tree().scrollTop;
 checks.dragNearTopAutoscrolls=upTop<stoppedTop;
 details.autoscroll={bounds,downHit:{key:down.targetKey,drop:down.drop},downTop,stoppedTop,upHit:{key:up.targetKey,drop:up.drop},upTop};
}finally{await finishDrag(drag);}
const stoppedAfterEnd=tree().scrollTop;await pause(160);
checks.dragEndClearsAutoscroll=tree().scrollTop===stoppedAfterEnd&&!settings.classList.contains('cme-dragging');
checks.dragWithoutDropDoesNotPersist=raw()===beforeScrollRaw;
// Regression: insertion lines stop dragover propagation. Edge scrolling must
// continue while a held drag is over these accepted drop hotspots as well.
const edgeDrag=await beginDrag('context-back');details.insertionLineScroll=[];
try{
 const bounds=rect(tree()),x=bounds.left+bounds.width*.65;
 for(const direction of [-1,1]){
  tree().scrollTop=240;await pause(30);
  const y=direction<0?bounds.top+16:bounds.bottom-16;
  const candidates=[...settings.querySelectorAll('[data-drop="before"]')].filter(element=>{
   const r=rect(element);return r.height>0&&(direction<0?r.top>bounds.top+5&&r.top<bounds.top+100:r.top>bounds.bottom-100&&r.top<bounds.bottom-5);
  });
  const candidate=direction<0?candidates[0]:candidates.at(-1);
  if(!candidate)throw new Error('No visible edge insertion line');
  const c=rect(candidate);tree().scrollTop+=c.top+c.height/2-y;await pause(30);
  const before=tree().scrollTop,over=dragAt(edgeDrag,x,y);await pause(360);const after=tree().scrollTop;
  checks[direction<0?'insertionLineNearTopAutoscrolls':'insertionLineNearBottomAutoscrolls']=over.drop==='before'&&(after-before)*direction>=48;
  details.insertionLineScroll.push({direction,drop:over.drop,targetKey:over.targetKey,before,after,heldMs:360});
  dragAt(edgeDrag,x,bounds.top+bounds.height/2);await pause(30);
 }
 tree().scrollTop=240;await pause(30);const movingStart=tree().scrollTop;
 for(let index=0;index<25;index++){dragAt(edgeDrag,x+index%2,bounds.top+16);await pause(10);}
 const movingEnd=tree().scrollTop;checks.continuousEdgeMovementScrolls=movingEnd<movingStart;details.continuousEdgeMovement={before:movingStart,after:movingEnd,events:25,intervalMs:10};
}finally{await finishDrag(edgeDrag);}
details.savedOrder=root().children.filter(id=>[A,B,C].includes(id));details.nestedChildren=root().records[B].children;
details.nativeHelperLimit='Installed Gecko EventUtils.js routes WebDriver dragover via dispatchDOMEventViaPresShellForTesting. Its mouseup helper ends a drag session without sending drop (documented FIXME). This probe starts drag via trusted mouse movement and completes hit-tested trusted dragover/drop with the installed Gecko helpers and real session DataTransfer. It does not prove OS/hardware mouse drop or physical acceptance.';
return{checks,details,inputEvidence:'Fresh headless Zen: trusted Gecko pointer down/click/dragstart, actual drag session and application payload; trusted native keyboard/default actions; PresShell-routed hit-tested dragover/drop and real layout/autoscroll. No everyday-profile or hardware acceptance.'};
