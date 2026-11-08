import test from 'node:test';
import assert from 'node:assert/strict';
import {makeDOM} from './dom.mjs';
import {createState, mergeInventory, serializeState, addSubmenu, moveItem} from '../src/model.mjs';
import {createSettingsUI} from '../src/settings-ui.mjs';
import {createIconService} from '../src/icons.mjs';
import {createMenuController} from '../src/controller.mjs';

const items = [
  {key:'copy',kind:'command',label:'Copy',parentKey:null,available:true},
  {key:'paste',kind:'command',label:'Paste',parentKey:null,available:true},
  {key:'owner',kind:'native-menu',label:'Owner menu',parentKey:null,available:true},
  {key:'child',kind:'command',label:'Copy selection',parentKey:'owner',boundary:'owner',available:true},
];
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAJklEQVRYR+3OMQEAAAgDINc/9K3hHFQgE1nSgwYNGjRo0KBBgwYNGjToHwuIEwE/kMkAAAAASUVORK5CYII=';
function fixture({initial, imports={}, realIcons=false}={}) {
  const dom=makeDOM(); let state=initial || createState(), raw=serializeState(state), saves=0;
  const listeners=new Set(), inventoryListeners=new Set();
  const store={
    read:()=>({state,raw,error:null}),
    save(next,expected){if(expected!==raw)throw Error('Settings changed in another window.'); state=next;raw=serializeState(next);saves++;for(const fn of listeners)fn();},
    subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);}, undo(){}, resetInvalid(){},
  };
  let liveInventory=[{id:'content',label:'Page menu',items}];
  const registry={getInventory:()=>liveInventory,subscribe(fn){inventoryListeners.add(fn);return()=>inventoryListeners.delete(fn);}};
  const icons={...(realIcons?createIconService(dom.window):{catalog:()=>[{pack:'fluent',id:'copy',label:'Copy artwork',src:PNG,tags:['copy']}],resolve:()=>({type:'text',text:'◇'}),importURL:async()=>({kind:'image',data:PNG}),importFile:async()=>({kind:'image',data:PNG}),importPaste:async()=>({kind:'text',text:'★'})}),...imports};
  const ui=createSettingsUI(dom.window,{store,registry,icons});dom.window.document.body.append(ui.element);
  const el=ui.element;
  return {dom,ui,el,store,icons,get state(){return state;},get saves(){return saves;},listeners,inventoryListeners,
    notifyInventory(next=liveInventory){liveInventory=next;for(const fn of inventoryListeners)fn(next);},
    external(next,notify=true){state=next;raw=serializeState(next);if(notify)for(const fn of listeners)fn();}};
}
function row(f,key){return f.el.querySelector(`[data-cme-key="${key}"]`);}
function action(f,key,name){
  let control=row(f,key).querySelector(`[data-action="${name}"]`);if(control)return control;
  if(name==='name'){row(f,key).querySelector('[data-action="label"]').click();return row(f,key).querySelector('[data-action="name"]');}
  let popup=f.el.querySelector(`[data-cme-popover="actions"]`);
  if(popup?.dataset.popoverKey!==key||!popup?.querySelector(`[data-action="${name}"]`)){row(f,key).querySelector('[data-action="more"]').click();popup=f.el.querySelector('[data-cme-popover="actions"]');}
  if(['move-to','move-parent'].includes(name)){popup.querySelector('[data-action="move"]').click();popup=f.el.querySelector('[data-cme-popover="move"]');}
  return popup.querySelector(`[data-action="${name}"]`);
}
function addButton(f,kind){if(!f.el.querySelector('[data-cme-popover="add"]'))f.el.querySelector('[data-cme-toolbar="add"]').click();return f.el.querySelector(`[data-cme-add="${kind}"]`);}
function menuOption(f,name){if(!f.el.querySelector('[data-cme-popover="options"]'))f.el.querySelector('[data-cme-toolbar="options"]').click();return [...f.el.querySelectorAll('button')].find(b=>b.textContent===name);}
function fire(f,el,type='change'){el.dispatchEvent(new f.dom.window.Event(type,{bubbles:true,cancelable:true}));}
function key(f,el,value){el.dispatchEvent(new f.dom.window.KeyboardEvent('keydown',{key:value,bubbles:true}));}
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
function transfer(){const data=new Map();return {setData:(k,v)=>data.set(k,v),getData:k=>data.get(k)||'',effectAllowed:'',dropEffect:''};}
function drag(f,target,type,data,extra={}){const e=new f.dom.window.Event(type,{bubbles:true,cancelable:true});Object.defineProperty(e,'dataTransfer',{value:data});Object.assign(e,extra);target.dispatchEvent(e);return e;}

test('opening shows a compact menu without permanent name fields or action panels and does not save',()=>{
  const f=fixture();assert.equal(f.saves,0);assert.equal(f.state.roots.content,undefined);
  assert.equal(f.el.querySelectorAll('[data-cme-tree]').length,1);assert.ok(row(f,'copy'));
  assert.equal(row(f,'copy').querySelector('input[type="text"]'),null);
  assert.equal(row(f,'copy').querySelector('[data-action="remove"]'),null);
  assert.equal(f.el.querySelector('[data-cme-popover]'),null);
  row(f,'copy').querySelector('[data-action="label"]').click();
  const name=row(f,'copy').querySelector('[data-action="name"]');name.value='My copy';key(f,name,'Enter');
  assert.equal(f.state.roots.content.records.copy.name,'My copy');
  assert.equal(row(f,'copy').querySelector('input[type="text"]'),null);
  f.ui.destroy();assert.equal(f.listeners.size,0);assert.equal(f.inventoryListeners.size,0);
});

test('dragging over an insertion line near the list edge keeps autoscrolling',async()=>{
 const f=fixture(),tree=f.el.querySelector('[data-cme-tree]'),data=transfer();
 tree.getBoundingClientRect=()=>({top:100,bottom:500});tree.scrollTop=200;
 try{
  drag(f,row(f,'copy').querySelector('[data-action="drag"]'),'dragstart',data);
  drag(f,row(f,'paste').querySelector('[data-drop="before"]'),'dragover',data,{clientY:110});
  await new Promise(resolve=>setTimeout(resolve,140));
  assert.ok(tree.scrollTop<200,'the insertion target must not prevent sustained list scrolling');
  drag(f,row(f,'copy').querySelector('[data-action="drag"]'),'dragend',data);
  const stopped=tree.scrollTop;await new Promise(resolve=>setTimeout(resolve,80));assert.equal(tree.scrollTop,stopped,'scrolling stops when the drag ends');
 }finally{f.ui.destroy();f.dom.window.close();}
});

test('continuous drag movement at the list edge does not postpone scrolling',async()=>{
 const f=fixture(),tree=f.el.querySelector('[data-cme-tree]'),data=transfer();tree.getBoundingClientRect=()=>({top:100,bottom:500});tree.scrollTop=200;
 try{
  drag(f,row(f,'copy').querySelector('[data-action="drag"]'),'dragstart',data);
  for(let index=0;index<20;index++){
   drag(f,row(f,'paste').querySelector('[data-drop="before"]'),'dragover',data,{clientY:110+index%2});
   await new Promise(resolve=>setTimeout(resolve,10));
  }
  assert.ok(tree.scrollTop<200,'scrolling must advance while dragover events are still arriving');
 }finally{f.ui.destroy();f.dom.window.close();}
});
test('row actions open on demand, Escape returns focus, and outside clicks cancel an icon draft',()=>{
  const f=fixture(),trigger=row(f,'copy').querySelector('[data-action="more"]');trigger.click();
  let popup=f.el.querySelector('[data-cme-popover]');assert.ok(popup);assert.equal(trigger.getAttribute('aria-expanded'),'true');
  key(f,popup,'Escape');assert.equal(f.el.querySelector('[data-cme-popover]'),null);assert.equal(f.dom.window.document.activeElement,trigger);
  action(f,'copy','icon').click();popup=f.el.querySelector('[data-cme-popover]');assert.ok(popup.querySelector('[data-icon-editor]')||popup.matches('[data-icon-editor]'));
  f.dom.window.document.body.dispatchEvent(new f.dom.window.Event('pointerdown',{bubbles:true}));
  assert.equal(f.el.querySelector('[data-icon-editor]'),null);assert.equal(f.saves,0);f.ui.destroy();
});
test('appearance edits remain open for further changes and every global option is reachable',()=>{
  const f=fixture();f.el.querySelector('[data-cme-toolbar="appearance"]').click();
  for(const option of ['showIcons','iconPack','iconSize','iconAlignment','iconGap','rowSpacing','rounded','hoverShade','separatorOpacity','monochromeExtensions'])assert.ok(f.el.querySelector(`[data-option="${option}"]`),option);
  let control=f.el.querySelector('[data-option="iconSize"]');control.value='20';fire(f,control);
  assert.equal(f.state.options.iconSize,20);assert.ok(f.el.querySelector('[data-cme-popover="appearance"]'));
  control=f.el.querySelector('[data-option="iconGap"]');control.value='12';fire(f,control);assert.equal(f.state.options.iconGap,12);
  f.el.querySelector('.cme-appearance-more').open=true;control=f.el.querySelector('[data-option="rowSpacing"]');control.value='4';fire(f,control);assert.equal(f.el.querySelector('.cme-appearance-more').open,true);
  f.el.querySelector('[data-cme-toolbar="options"]').click();
  for(const option of ['enabled','hideUnavailable','shiftBypass'])assert.ok(f.el.querySelector(`[data-option="${option}"]`),option);
  assert.ok(f.el.querySelector('[data-cme-undo]'));f.ui.destroy();
});
test('an explicit global icon change reclaims previously yielded icons',()=>{
 let state=mergeInventory(createState(),'content',items);state.roots.content.records.copy.iconOwner=true;const f=fixture({initial:state});
 f.el.querySelector('[data-cme-toolbar="appearance"]').click();const input=f.el.querySelector('[data-option="showIcons"]');input.checked=false;fire(f,input);
 assert.equal(f.state.options.showIcons,false);assert.equal(f.state.roots.content.records.copy.iconOwner,undefined);f.ui.destroy();
});
test('item details receives focus and moving to a collapsed submenu reveals the moved row',()=>{
 let s=mergeInventory(createState(),'content',items);s=addSubmenu(s,'content','Tools',null,1,'custom-tools');const f=fixture({initial:s});
 action(f,'copy','details').click();assert.equal(f.dom.window.document.activeElement,f.el.querySelector('[data-cme-popover="details"] .cme-close'));
 key(f,f.dom.window.document.activeElement,'Escape');const destination=action(f,'copy','move-to');destination.value='custom-tools';fire(f,destination);
 assert.equal(row(f,'copy').hidden,false);assert.equal(f.dom.window.document.activeElement,row(f,'copy').querySelector('[data-action="label"]'));f.ui.destroy();
});
test('deferred discovery cannot close a replacement panel or a newly started rename',async()=>{
 const f=fixture();action(f,'copy','icon').click();f.notifyInventory([{id:'content',label:'Page menu',items:[...items,{key:'fresh',kind:'command',label:'Fresh',parentKey:null}]}]);
 f.el.querySelector('[data-cme-toolbar="appearance"]').click();await tick();assert.ok(f.el.querySelector('[data-cme-popover="appearance"]'));
 f.el.querySelector('[data-cme-popover] .cme-close').click();await tick();assert.ok(row(f,'fresh'));
 action(f,'copy','icon').click();f.notifyInventory([{id:'content',label:'Page menu',items:[...items,{key:'later',kind:'command',label:'Later',parentKey:null}]}]);
 row(f,'copy').querySelector('[data-action="label"]').click();const input=row(f,'copy').querySelector('[data-action="name"]');await tick();assert.equal(row(f,'copy').querySelector('[data-action="name"]'),input);
 input.value='Edited';key(f,input,'Enter');assert.equal(f.state.roots.content.records.copy.name,'Edited');assert.ok(row(f,'later'));f.ui.destroy();
});
test('icon tabs reveal one method at a time and resetting artwork does not change a renamed item',()=>{
  const f=fixture();let name=action(f,'copy','name');name.value='My copy';key(f,name,'Enter');action(f,'copy','icon').click();
  const panel=id=>f.el.querySelector(`[data-icon-panel="${id}"]`);
  assert.equal(panel('built-in').hidden,false);assert.equal(panel('image').hidden,true);assert.equal(panel('symbol').hidden,true);
  f.el.querySelector('[data-icon-tab="symbol"]').click();assert.equal(panel('symbol').hidden,false);assert.equal(panel('built-in').hidden,true);
  const text=f.el.querySelector('[data-icon-text]');text.value='★';fire(f,text,'input');f.el.querySelector('[data-icon-action="save"]').click();
  action(f,'copy','icon').click();f.el.querySelector('[data-icon-action="reset"]').click();f.el.querySelector('[data-icon-action="save"]').click();
  assert.equal(f.state.roots.content.records.copy.name,'My copy');assert.equal(f.state.roots.content.records.copy.icon,undefined);f.ui.destroy();
});
test('commands and foreign submenus show source names and find can match a source without hiding rows',()=>{
 const f=fixture();
 const source={kind:'mod',id:'unfamiliar',name:'Unfamiliar Tools',via:'handler'};
 f.notifyInventory([{id:'content',label:'Page menu',items:items.map(item=>({...item,source:item.key==='owner'||item.key==='child'?source:{kind:'unknown',name:'Source unknown'}}))}]);
 assert.equal(row(f,'owner').querySelector('[data-cme-source]').textContent,'Unfamiliar Tools');
 assert.equal(row(f,'child').querySelector('[data-cme-source]').textContent,'Unfamiliar Tools');
 assert.equal(row(f,'copy').querySelector('[data-cme-source]').textContent,'Source unknown');
 const search=f.el.querySelector('[data-cme-find]');search.value='Unfamiliar Tools';fire(f,search,'input');
 assert.equal(row(f,'owner').classList.contains('cme-match'),true);assert.equal(row(f,'child').classList.contains('cme-match'),true);
 assert.equal(f.el.querySelectorAll('[data-cme-key]').length,4);assert.equal(f.saves,0);f.ui.destroy();
});
test('checkbox retains ordering, name Enter saves, Escape cancels, reset uses live default',()=>{
  const f=fixture();const enable=action(f,'copy','enabled');enable.checked=false;fire(f,enable);
  assert.equal(f.state.roots.content.records.copy.hidden,true);assert.deepEqual(f.state.roots.content.children,['copy','paste','owner']);
  let name=action(f,'copy','name');name.value='Copy nicely';key(f,name,'Enter');assert.equal(f.state.roots.content.records.copy.name,'Copy nicely');
  name=action(f,'copy','name');name.value='Discard me';key(f,name,'Escape');assert.equal(name.value,'Copy nicely');
  action(f,'copy','reset-name').click();assert.equal(f.state.roots.content.records.copy.name,undefined);assert.equal(action(f,'copy','name').value,'Copy');
  f.ui.destroy();
});
test('remove leaves a tombstone, focuses a remaining row, and restore returns the command',()=>{
  const f=fixture();action(f,'copy','remove').click();assert.equal(row(f,'copy'),null);
  assert.equal(f.state.roots.content.records.copy.removed,true);assert.ok(f.el.contains(f.dom.window.document.activeElement));
  menuOption(f,'Restore removed items…').click();f.el.querySelector('[data-restore="copy"]').click();assert.ok(row(f,'copy'));assert.equal(f.state.roots.content.records.copy.removed,false);f.ui.destroy();
});
test('nested keyboard move preserves the subtree and parent action ungroups one command',()=>{
  let s=mergeInventory(createState(),'content',items);s=addSubmenu(s,'content','Tools',null,1,'custom-tools');
  const f=fixture({initial:s});const select=action(f,'copy','move-to');select.value='custom-tools';fire(f,select);
  assert.deepEqual(f.state.roots.content.records['custom-tools'].children,['copy']);
  assert.equal(row(f,'copy').dataset.parent,'custom-tools');action(f,'copy','move-parent').click();
  assert.ok(f.state.roots.content.children.includes('copy'));assert.deepEqual(f.state.roots.content.records['custom-tools'].children,[]);f.ui.destroy();
});
test('find expands ancestors and highlights matching names while retaining all rows and drag handles',()=>{
  const f=fixture();const find=f.el.querySelector('[data-cme-find]');find.value='copy';fire(f,find,'input');
  assert.ok(row(f,'copy').classList.contains('cme-match'));assert.ok(row(f,'child').classList.contains('cme-match'));
  assert.equal(row(f,'child').hidden,false);assert.ok(row(f,'paste'));assert.equal(action(f,'paste','drag').draggable,true);assert.equal(f.saves,0);f.ui.destroy();
});
test('drag moves after or inside a submenu and rejects a token from another editor or old revision',()=>{
  let s=mergeInventory(createState(),'content',items);s=addSubmenu(s,'content','Tools',null,2,'custom-tools');
  const f=fixture({initial:s});let dt=transfer();drag(f,action(f,'copy','drag'),'dragstart',dt);
  drag(f,row(f,'paste').querySelector('[data-drop="after"]'),'drop',dt);assert.deepEqual(f.state.roots.content.children,['paste','copy','custom-tools','owner']);
  dt=transfer();drag(f,action(f,'copy','drag'),'dragstart',dt);drag(f,row(f,'custom-tools').querySelector('[data-drop="inside"]'),'drop',dt);
  assert.deepEqual(f.state.roots.content.records['custom-tools'].children,['copy']);
  const stale=transfer();drag(f,action(f,'paste','drag'),'dragstart',stale);f.el.querySelector('[data-cme-toolbar="appearance"]').click();const input=f.el.querySelector('[data-option="showIcons"]');input.checked=false;fire(f,input);
  const before=serializeState(f.state);drag(f,row(f,'owner').querySelector('[data-drop="before"]'),'drop',stale);assert.equal(serializeState(f.state),before);
  const other=fixture({initial:f.state});dt=transfer();drag(f,action(f,'paste','drag'),'dragstart',dt);drag(other,row(other,'owner').querySelector('[data-drop="before"]'),'drop',dt);assert.equal(other.saves,0);
  f.ui.destroy();other.ui.destroy();
});
test('icon image draft loads without writing, Save commits and canceled/failing imports retain prior image',async()=>{
  const f=fixture();action(f,'copy','icon').click();const link=f.el.querySelector('[data-icon-url]');link.value='https://example.invalid/icon.png';f.el.querySelector('[data-icon-action="load"]').click();await tick();
  assert.equal(f.saves,0);f.el.querySelector('[data-icon-action="save"]').click();assert.equal(f.state.roots.content.records.copy.icon.kind,'image');
  action(f,'copy','icon').click();f.el.querySelector('[data-icon-action="automatic"]').click();f.el.querySelector('[data-icon-action="cancel"]').click();assert.equal(f.state.roots.content.records.copy.icon.kind,'image');f.ui.destroy();
  const failed=fixture({imports:{importURL:async()=>{throw Error('Could not load image.');}}});action(failed,'copy','icon').click();failed.el.querySelector('[data-icon-url]').value='https://example.invalid/fail.png';failed.el.querySelector('[data-icon-action="load"]').click();await tick();assert.equal(failed.saves,0);assert.match(failed.el.querySelector('[data-cme-status]').textContent,/Could not load/);failed.ui.destroy();
});
test('late image completion after external save or closing cannot overwrite newer settings',async()=>{
  let finish;const f=fixture({imports:{importURL:()=>new Promise(resolve=>{finish=resolve;})}});
  action(f,'copy','icon').click();f.el.querySelector('[data-icon-url]').value='https://example.invalid/image';f.el.querySelector('[data-icon-action="load"]').click();
  const changed=mergeInventory(createState(),'content',items);changed.options.iconSize=24;f.external(changed);finish({kind:'image',data:PNG});await tick();
  assert.equal(f.saves,0);assert.equal(f.state.options.iconSize,24);assert.equal(f.el.querySelector('[data-icon-editor]'),null);f.ui.destroy();
});
test('lifecycle reset cancels drafts and search without saving or resetting customization',async()=>{
  const f=fixture();const name=action(f,'copy','name');name.value='My copy';key(f,name,'Enter');
  const find=f.el.querySelector('[data-cme-find]');find.value='copy';fire(f,find,'input');action(f,'copy','icon').click();
  const before=f.saves;f.ui.reset();assert.equal(f.saves,before);assert.equal(f.state.roots.content.records.copy.name,'My copy');
  assert.equal(f.el.querySelector('[data-cme-find]').value,'');assert.equal(f.el.querySelector('[data-icon-editor]'),null);f.ui.destroy();
});
test('gallery, Unicode and pasted image draft use explicit Save and per-item Show icon',async()=>{
  const f=fixture();action(f,'copy','icon').click();f.el.querySelector('[data-icon-asset="copy"]').click();f.el.querySelector('[data-icon-action="save"]').click();assert.equal(f.state.roots.content.records.copy.icon.kind,'asset');
  action(f,'copy','icon').click();const unicode=f.el.querySelector('[data-icon-text]');unicode.value='★';fire(f,unicode,'input');const show=f.el.querySelector('[data-icon-show]');show.checked=false;fire(f,show);f.el.querySelector('[data-icon-action="save"]').click();assert.equal(f.state.roots.content.records.copy.icon.text,'★');assert.equal(f.state.roots.content.records.copy.showIcon,false);
  action(f,'copy','icon').click();const e=new f.dom.window.Event('paste',{bubbles:true,cancelable:true});Object.defineProperty(e,'clipboardData',{value:{items:[],getData:()=> '★'}});f.el.querySelector('[data-icon-editor]').dispatchEvent(e);await tick();assert.equal(f.saves,2);f.el.querySelector('[data-icon-action="save"]').click();assert.equal(f.saves,3);f.ui.destroy();
});

test('pasting into icon text fields preserves native editing and waits for an explicit image load',async()=>{
 const f=fixture();action(f,'copy','icon').click();
 try{
  for(const selector of ['[data-icon-url]','[data-icon-text]','.cme-gallery input']){
   const input=f.el.querySelector(selector),event=new f.dom.window.Event('paste',{bubbles:true,cancelable:true});
   Object.defineProperty(event,'clipboardData',{value:{items:[],getData:()=> 'https://example.invalid/icon.png'}});
   input.dispatchEvent(event);await tick();
   assert.equal(event.defaultPrevented,false,'ordinary input paste must remain native');
   assert.doesNotMatch(f.el.querySelector('[data-cme-status]').textContent,/Loading icon|Icon ready/,'pasting a link into a field must not import it');
  }
  assert.equal(f.saves,0);
 }finally{f.ui.destroy();f.dom.window.close();}
});

test('a valid symbol or icon choice clears prior draft validation feedback without saving',()=>{
 const f=fixture();action(f,'copy','icon').click();const input=f.el.querySelector('[data-icon-text]');
 try{
  const invalid=()=>{input.value='123456789';fire(f,input,'input');assert.match(f.el.querySelector('[data-cme-status]').textContent,/1.8/);};
  invalid();input.value='🌟';fire(f,input,'input');assert.doesNotMatch(f.el.querySelector('[data-cme-status]').textContent,/1.8/);
  for(const selector of ['[data-icon-action="automatic"]','[data-icon-action="reset"]','[data-icon-asset="copy"]']){invalid();f.el.querySelector(selector).click();assert.doesNotMatch(f.el.querySelector('[data-cme-status]').textContent,/1.8/);}
  assert.equal(f.saves,0,'correcting a draft still requires Save icon');
 }finally{f.ui.destroy();f.dom.window.close();}
});
test('add submenu and separator use the same tree; custom name reset keeps the submenu valid',()=>{
  const f=fixture();addButton(f,'submenu').click();
  const created=Object.keys(f.state.roots.content.records).find(key=>key.startsWith('custom-submenu-'));
  assert.ok(created);assert.equal(f.dom.window.document.activeElement,action(f,created,'name'));
  let name=action(f,created,'name');name.value='Tools';key(f,name,'Enter');assert.equal(f.state.roots.content.records[created].name,'Tools');
  action(f,created,'reset-name').click();assert.equal(f.state.roots.content.records[created].name,'New submenu');
  name=action(f,created,'name');name.focus();addButton(f,'separator').click();
  assert.equal(f.state.roots.content.records[created].children.length,1);assert.equal(f.el.querySelectorAll('[data-cme-tree]').length,1);f.ui.destroy();
});
test('moving to the current parent places the command at the end instead of rejecting the action',()=>{
  const f=fixture();const select=action(f,'copy','move-to');select.value='@root';fire(f,select);
  assert.deepEqual(f.state.roots.content.children,['paste','owner','copy']);assert.match(f.el.querySelector('[data-cme-status]').textContent,/moved/);f.ui.destroy();
});
test('locked commands retain personal edits while all movement controls are disabled',()=>{
  const original=items[0];items[0]={...original,locked:true,restriction:'Keep this command in its owner group.'};
  try{const f=fixture();for(const name of ['drag','up','down','move'])assert.equal(action(f,'copy',name).disabled,true,name);
    action(f,'copy','enabled').checked=false;fire(f,action(f,'copy','enabled'));assert.equal(f.state.roots.content.records.copy.hidden,true);f.ui.destroy();
  }finally{items[0]=original;}
});
test('stale save cannot overwrite a newer window even without a notification',()=>{
  const f=fixture();const fresh=createState();fresh.options.iconSize=24;f.external(fresh,false);
  const enable=action(f,'copy','enabled');enable.checked=false;fire(f,enable);
  assert.equal(f.saves,0);assert.equal(f.state.options.iconSize,24);assert.match(f.el.querySelector('[data-cme-status]').textContent,/another window/);f.ui.destroy();
});
test('cancel aborts a pending import and late completion cannot change saved artwork',async()=>{
  let complete,signal;const f=fixture({imports:{importURL:(value,abortSignal)=>{signal=abortSignal;return new Promise(resolve=>{complete=resolve;});}}});
  action(f,'copy','icon').click();f.el.querySelector('[data-icon-url]').value='https://example.invalid/image';f.el.querySelector('[data-icon-action="load"]').click();
  f.el.querySelector('[data-icon-action="cancel"]').click();assert.equal(signal.aborted,true);complete({kind:'image',data:PNG});await tick();
  assert.equal(f.saves,0);assert.equal(f.el.querySelector('[data-icon-editor]'),null);f.ui.destroy();
});
test('file selection and a direct clipboard button stage normalized icons without writing',async()=>{
  const seen=[];const f=fixture({imports:{importFile:async value=>{seen.push(value.name);return{kind:'image',data:PNG};},importPaste:async value=>{seen.push(value);return{kind:'text',text:value};}}});
  Object.defineProperty(f.dom.window.navigator,'clipboard',{value:{readText:async()=> '★'}});
  action(f,'copy','icon').click();const input=f.el.querySelector('[data-icon-file]');Object.defineProperty(input,'files',{value:[new f.dom.window.File(['art'],'art.png',{type:'image/png'})]});fire(f,input);await tick();assert.equal(f.saves,0);
  f.el.querySelector('[data-icon-action="save"]').click();assert.equal(f.state.roots.content.records.copy.icon.kind,'image');
  action(f,'copy','icon').click();f.el.querySelector('[data-icon-action="paste"]').click();await tick();assert.equal(f.saves,1);f.el.querySelector('[data-icon-action="save"]').click();assert.deepEqual(seen,['art.png','★']);assert.equal(f.state.roots.content.records.copy.icon.text,'★');f.ui.destroy();
});
test('image clipboard flavors take precedence over accompanying text and remain drafts until Save',async()=>{
  for(const route of ['button','event']){
    const seen=[],f=fixture({imports:{importPaste:async value=>{seen.push(value);return{kind:'image',data:PNG};}}});
    const image=new f.dom.window.File([Buffer.from(PNG.split(',')[1],'base64')],'clipboard.png',{type:'image/png'});
    try{
      action(f,'copy','icon').click();
      if(route==='button'){
        Object.defineProperty(f.dom.window.navigator,'clipboard',{value:{read:async()=>[
          {types:['text/plain'],getType:()=>{throw Error('Accompanying text must not replace the image.');}},
          {types:['image/png'],getType:async type=>{assert.equal(type,'image/png');return image;}},
        ]}});
        f.el.querySelector('[data-icon-action="paste"]').click();
      }else{
        const event=new f.dom.window.Event('paste',{bubbles:true,cancelable:true});
        Object.defineProperty(event,'clipboardData',{value:{items:[{kind:'string',type:'text/plain'},{kind:'file',type:'image/png',getAsFile:()=>image}],getData:()=>{throw Error('Accompanying text must not replace the image.');}}});
        f.el.querySelector('[data-icon-paste-target]').dispatchEvent(event);assert.equal(event.defaultPrevented,true);
      }
      await tick();assert.deepEqual(seen,[image],route);assert.equal(f.saves,0,route);
      assert.match(f.el.querySelector('[data-cme-status]').textContent,/Icon ready/);
      f.el.querySelector('[data-icon-action="save"]').click();assert.equal(f.saves,1,route);
      assert.deepEqual(f.state.roots.content.records.copy.icon,{kind:'image',data:PNG},route);
    }finally{f.ui.destroy();f.dom.window.close();}
  }
});

test('unavailable-command controls read imported menu scope and preserve another menus choices',()=>{
 const initial=mergeInventory(createState(),'content',items);initial.roots.content.hideUnavailable=true;initial.roots.tabs={children:[],records:{},hideUnavailable:true};
 const f=fixture({initial});try{menuOption(f,'Hide unavailable commands');const control=f.el.querySelector('[data-option="hideUnavailable"]');assert.equal(control.checked,true);control.checked=false;fire(f,control);assert.equal(f.state.roots.content.hideUnavailable,false);assert.equal(f.state.roots.tabs.hideUnavailable,true);assert.equal(f.state.options.hideUnavailable,false);}finally{f.ui.destroy();f.dom.window.close();}
});

test('an older global unavailable-command setting remains the fallback until this menu is edited',()=>{
 const initial=createState();initial.options.hideUnavailable=true;const f=fixture({initial});try{menuOption(f,'Hide unavailable commands');const control=f.el.querySelector('[data-option="hideUnavailable"]');assert.equal(control.checked,true);control.checked=false;fire(f,control);assert.equal(f.state.roots.content.hideUnavailable,false);assert.equal(f.state.options.hideUnavailable,true);}finally{f.ui.destroy();f.dom.window.close();}
});

test('Reset this menu explicitly clears customization while original order retains it',()=>{
  const f=fixture();const name=action(f,'copy','name');name.value='My copy';key(f,name,'Enter');action(f,'copy','down').click();
  menuOption(f,'Restore original order').click();assert.deepEqual(f.state.roots.content.children,['copy','paste','owner']);assert.equal(f.state.roots.content.records.copy.name,'My copy');
  menuOption(f,'Reset this menu').click();assert.equal(f.state.roots.content,undefined);assert.equal(action(f,'copy','name').value,'Copy');f.ui.destroy();
});
test('a submenu created inside a native owner accepts that owner child without crossing its boundary',()=>{
  const f=fixture();action(f,'owner','name').focus();addButton(f,'submenu').click();
  const created=Object.keys(f.state.roots.content.records).find(key=>key.startsWith('custom-submenu-'));
  assert.ok(f.state.roots.content.records.owner.children.includes(created));
  const destination=action(f,'child','move-to');destination.value=created;fire(f,destination);
  assert.deepEqual(f.state.roots.content.records[created].children,['child']);assert.equal(row(f,'child').dataset.parent,created);f.ui.destroy();
});
test('adding inside a locked native group is disabled with a clear restriction',()=>{
  const original=items[2];items[2]={...original,locked:true,restriction:'This group keeps its native children.'};
  try{const f=fixture();action(f,'owner','name').focus();for(const label of ['Add submenu','Add separator'])assert.equal(addButton(f,label==='Add submenu'?'submenu':'separator').disabled,true);assert.match(f.el.textContent,/keeps its native children/);assert.equal(f.saves,0);f.ui.destroy();}
  finally{items[2]=original;}
});
test('adding a submenu or separator between a protected native pair preserves the prior state',()=>{
  items.push({key:'ai-head',kind:'command',label:'AI tools',parentKey:null,available:true,locked:true,dependencyGroup:'ai-head'},
    {key:'ai-divider',kind:'separator',label:'AI divider',parentKey:null,available:true,locked:true,dependencyGroup:'ai-head'});
  try{for(const label of ['Add submenu','Add separator']){const f=fixture();const before=serializeState(f.state);action(f,'ai-head','name').focus();addButton(f,label==='Add submenu'?'submenu':'separator').click();
    assert.equal(serializeState(f.state),before);assert.equal(f.saves,0);assert.match(f.el.querySelector('[data-cme-status]').textContent,/group together/);f.ui.destroy();}}
  finally{items.splice(-2);}
});
test('dragging a command between a protected native pair announces the restriction without saving',()=>{
  items.push({key:'ai-head',kind:'command',label:'AI tools',parentKey:null,available:true,locked:true,dependencyGroup:'ai-head'},
    {key:'ai-divider',kind:'separator',label:'AI divider',parentKey:null,available:true,locked:true,dependencyGroup:'ai-head'});
  try{const f=fixture();const before=serializeState(f.state),dt=transfer();drag(f,action(f,'copy','drag'),'dragstart',dt);drag(f,row(f,'ai-divider').querySelector('[data-drop="before"]'),'drop',dt);
    assert.equal(serializeState(f.state),before);assert.equal(f.saves,0);assert.match(f.el.querySelector('[data-cme-status]').textContent,/group together/);f.ui.destroy();}
  finally{items.splice(-2);}
});
test('direct Unicode uses the real icon service limits and preserves a prior choice on invalid Save',()=>{
  const f=fixture({realIcons:true});action(f,'copy','icon').click();let text=f.el.querySelector('[data-icon-text]');text.value='★';fire(f,text,'input');f.el.querySelector('[data-icon-action="save"]').click();
  assert.equal(f.icons.resolve(items[0],f.state.roots.content.records.copy,f.state.options).source,'custom');
  action(f,'copy','icon').click();text=f.el.querySelector('[data-icon-text]');text.value='123456789';fire(f,text,'input');f.el.querySelector('[data-icon-action="save"]').click();
  assert.equal(f.saves,1);assert.equal(f.state.roots.content.records.copy.icon.text,'★');assert.match(f.el.querySelector('[data-cme-status]').textContent,/Unicode|symbols/);
  assert.equal(text.maxLength,64);text.value='👨‍👩‍👧‍👦'.repeat(3);fire(f,text,'input');f.el.querySelector('[data-icon-action="save"]').click();
  assert.equal(f.state.roots.content.records.copy.icon.text,'👨‍👩‍👧‍👦'.repeat(3));assert.equal(f.icons.resolve(items[0],f.state.roots.content.records.copy,f.state.options).source,'custom');f.ui.destroy();
});
test('unchanged inventory notifications keep the icon paste target and an unfinished name intact',()=>{
  const f=fixture();action(f,'copy','icon').click();const link=f.el.querySelector('[data-icon-url]');link.value='https://example.invalid/art.png';link.focus();f.notifyInventory();
  assert.equal(f.el.querySelector('[data-icon-url]'),link);assert.equal(link.value,'https://example.invalid/art.png');assert.equal(f.dom.window.document.activeElement,link);
  f.el.querySelector('[data-icon-action="cancel"]').click();const name=action(f,'copy','name');name.focus();name.value='Work in progress';f.notifyInventory();
  assert.equal(action(f,'copy','name'),name);assert.equal(name.value,'Work in progress');assert.equal(f.saves,0);f.ui.destroy();
});
test('changed availability and discovery preserve a loading draft, whose Save merges latest inventory',async()=>{
  let finish;const f=fixture({imports:{importURL:()=>new Promise(resolve=>{finish=resolve;})}});action(f,'copy','icon').click();const link=f.el.querySelector('[data-icon-url]');link.value='https://example.invalid/art.png';f.el.querySelector('[data-icon-action="load"]').click();
  const newItems=[{...items[0],available:false},...items.slice(1),{key:'fresh',kind:'command',label:'Fresh command',parentKey:null,available:true}];
  f.notifyInventory([{id:'content',label:'Page menu',items:newItems}]);assert.equal(f.el.querySelector('[data-icon-url]'),link);assert.equal(row(f,'fresh'),null);
  finish({kind:'image',data:PNG});await tick();f.el.querySelector('[data-icon-action="save"]').click();assert.equal(f.saves,1);assert.ok(f.state.roots.content.records.fresh);assert.equal(f.state.roots.content.records.copy.icon.kind,'image');assert.ok(row(f,'fresh'));assert.match(row(f,'copy').textContent,/Unavailable here/);f.ui.destroy();
});
test('dirty name survives changed inventory and Enter saves it with newly discovered items',()=>{
  const f=fixture();const name=action(f,'copy','name');name.focus();name.value='My unfinished name';
  const newItems=[{...items[0],label:'Copy current content',available:false},...items.slice(1),{key:'fresh',kind:'command',label:'Fresh command',parentKey:null,available:true}];f.notifyInventory([{id:'content',label:'Page menu',items:newItems}]);
  assert.equal(action(f,'copy','name'),name);assert.equal(name.value,'My unfinished name');key(f,name,'Enter');assert.equal(f.state.roots.content.records.copy.name,'My unfinished name');assert.ok(f.state.roots.content.records.fresh);f.ui.destroy();
});
test('deferred inventory still enforces changed owner boundaries before a name Save',()=>{
  const f=fixture();const name=action(f,'copy','name');name.focus();name.value='My unfinished name';
  const newItems=[{...items[0],parentKey:'owner',boundary:'owner'},...items.slice(1)];f.notifyInventory([{id:'content',label:'Page menu',items:newItems}]);assert.equal(action(f,'copy','name'),name);
  key(f,name,'Enter');assert.equal(f.saves,0);assert.equal(f.state.roots.content,undefined);assert.match(f.el.querySelector('[data-cme-status]').textContent,/owner submenu/);f.ui.destroy();
});
test('cancel or blur releases deferred discovery without saving',async()=>{
  const f=fixture();action(f,'copy','icon').click();const newItems=[...items,{key:'fresh',kind:'command',label:'Fresh command',parentKey:null,available:true}];
  f.notifyInventory([{id:'content',label:'Page menu',items:newItems}]);f.el.querySelector('[data-icon-action="cancel"]').click();await tick();assert.ok(row(f,'fresh'));assert.equal(f.saves,0);
  const name=action(f,'copy','name');name.focus();name.value='Discard me';f.notifyInventory([{id:'content',label:'Page menu',items:[...newItems,{key:'later',kind:'command',label:'Later command',parentKey:null,available:true}]}]);name.blur();await tick();assert.ok(row(f,'later'));assert.equal(action(f,'copy','name').value,'Copy');assert.equal(f.saves,0);f.ui.destroy();
});
test('changing the selected menu redraws its tree even though registry data is unchanged',()=>{
  const f=fixture();f.notifyInventory([{id:'content',label:'Page menu',items},{id:'tabs',label:'Tab menu',items:[{key:'tab-copy',kind:'command',label:'Copy tab',parentKey:null,available:true}]}]);
  const select=f.el.querySelector('[data-cme-menu]');select.value='tabs';fire(f,select);assert.ok(row(f,'tab-copy'));assert.equal(row(f,'copy'),null);assert.equal(f.saves,0);f.ui.destroy();
});
test('a new container inside a collapsed native submenu becomes visible for immediate naming',()=>{
  const f=fixture();action(f,'owner','name').focus();addButton(f,'submenu').click();
  const created=Object.keys(f.state.roots.content.records).find(key=>key.startsWith('custom-submenu-'));assert.equal(row(f,created).hidden,false);assert.equal(f.dom.window.document.activeElement,action(f,created,'name'));f.ui.destroy();
});
test('actual controller popup notifications preserve a settings paste target and a dirty name',async()=>{
  const dom=makeDOM('<!doctype html><body><menupopup id="contentAreaContextMenu"><menuitem id="context-copy" label="Copy"></menuitem></menupopup></body>');
  let state=createState(),raw=serializeState(state),saves=0;const listeners=new Set();
  const store={read:()=>({state,raw,error:null}),save(next,expected){assert.equal(expected,raw);state=next;raw=serializeState(next);saves++;for(const fn of listeners)fn();},subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},undo(){},resetInvalid(){}};
  const controller=createMenuController(dom.window,{getState:()=>state}),icons=createIconService(dom.window);
  const ui=createSettingsUI(dom.window,{store,registry:controller,icons});dom.window.document.body.append(ui.element);const f={dom,ui,el:ui.element};
  action(f,'context-copy','icon').click();const link=f.el.querySelector('[data-icon-url]');link.value='https://example.invalid/art.png';link.focus();
  const popup=dom.window.document.getElementById('contentAreaContextMenu');popup.dispatchEvent(new dom.window.Event('popupshowing',{bubbles:true,cancelable:true}));await tick();
  assert.equal(f.el.querySelector('[data-icon-url]'),link);assert.equal(link.value,'https://example.invalid/art.png');assert.equal(saves,0);
  f.el.querySelector('[data-icon-action="cancel"]').click();const name=action(f,'context-copy','name');name.focus();name.value='My copy';
  popup.dispatchEvent(new dom.window.Event('popuphiding',{bubbles:true}));popup.dispatchEvent(new dom.window.Event('popupshowing',{bubbles:true,cancelable:true}));await tick();
  assert.equal(action(f,'context-copy','name'),name);assert.equal(name.value,'My copy');key(f,name,'Enter');assert.equal(state.roots.contentAreaContextMenu.records['context-copy'].name,'My copy');
  ui.destroy();controller.destroy();dom.window.close();
});
test('inventory loss of the edited native command aborts its draft rather than preserving a stale target',()=>{
  let signal;const f=fixture({imports:{importURL:(_value,currentSignal)=>{signal=currentSignal;return new Promise(()=>{});}}});action(f,'copy','icon').click();f.el.querySelector('[data-icon-url]').value='https://example.invalid/art.png';f.el.querySelector('[data-icon-action="load"]').click();
  f.notifyInventory([{id:'content',label:'Page menu',items:items.slice(1)}]);assert.equal(f.el.querySelector('[data-icon-editor]'),null);assert.equal(signal.aborted,true);assert.equal(f.saves,0);f.ui.destroy();
});
test('an unannounced raw-state change cancels an image draft when its result arrives',async()=>{
  let finish;const f=fixture({imports:{importURL:()=>new Promise(resolve=>{finish=resolve;})}});action(f,'copy','icon').click();f.el.querySelector('[data-icon-url]').value='https://example.invalid/art.png';f.el.querySelector('[data-icon-action="load"]').click();
  const changed=createState();changed.options.iconSize=24;f.external(changed,false);finish({kind:'image',data:PNG});await tick();assert.equal(f.saves,0);assert.equal(f.state.options.iconSize,24);assert.equal(f.el.querySelector('[data-icon-editor]'),null);f.ui.destroy();
});
