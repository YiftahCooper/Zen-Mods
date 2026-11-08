import test from 'node:test';
import assert from 'node:assert/strict';
import {makeDOM} from './dom.mjs';
import {createMenuController} from '../src/controller.mjs';
const wait=()=>new Promise(r=>setTimeout(r,0));
test('a late source-owned standalone context menu is discovered, customized on first opening and released on unload',async()=>{
 const dom=makeDOM('<div id="mainPopupSet"></div>'),w=dom.window;
 const state={options:{enabled:true},roots:{'foreign-popup':{children:['foreign-action'],records:{'foreign-action':{name:'My action'}}}}};
 const controller=createMenuController(w,{getState:()=>state,resolveSource:node=>node.closest?.('#foreign-popup')?{kind:'mod',id:'unfamiliar',name:'Unfamiliar Tools'}:null});
 const popup=w.document.createXULElement('menupopup');popup.id='foreign-popup';const item=w.document.createXULElement('menuitem');item.id='foreign-action';item.setAttribute('label','Owner action');popup.append(item);w.document.getElementById('mainPopupSet').append(popup);
 popup.dispatchEvent(new w.Event('popupshowing',{bubbles:true,cancelable:true}));await wait();
 assert.equal(controller.getInventory().find(root=>root.id==='foreign-popup')?.items.length,1);assert.equal(item.getAttribute('label'),'My action');
 controller.destroy();assert.equal(item.getAttribute('label'),'Owner action');dom.window.close();
});
test('a discovered root replaced by an empty same-ID popup attaches before lazy owner children appear',async()=>{
 const dom=makeDOM('<menupopup id="foreign-popup"><menuitem id="a" label="Owner"></menuitem></menupopup>'),w=dom.window;
 const state={options:{enabled:true},roots:{'foreign-popup':{children:['a'],records:{a:{name:'Mine'}}}}};
 const controller=createMenuController(w,{getState:()=>state,resolveSource:node=>node.localName==='menuitem'?{kind:'mod',id:'foreign',name:'Foreign'}:null});
 const old=w.document.getElementById('foreign-popup'),root=w.document.createXULElement('menupopup');root.id=old.id;old.replaceWith(root);await wait();
 const item=w.document.createXULElement('menuitem');item.id='a';item.setAttribute('label','New owner');root.addEventListener('popupshowing',()=>root.append(item),{once:true});root.dispatchEvent(new w.Event('popupshowing',{bubbles:true}));await wait();
 assert.equal(item.getAttribute('label'),'Mine');assert.equal(controller.getInventory().find(menu=>menu.id===root.id).items[0].label,'New owner');controller.destroy();assert.equal(item.getAttribute('label'),'New owner');dom.window.close();
});
function setup(markup='<menuitem id="a" label="Owner A" accesskey="A"></menuitem><menuitem id="b" label="Owner B"></menuitem>',records={a:{kind:'command',name:'Custom'},b:{kind:'command'},custom:{kind:'submenu',name:'More',children:['a']}},children=['custom','b']){
 const dom=makeDOM(`<menupopup id="contentAreaContextMenu">${markup}</menupopup>`),w=dom.window,root=w.document.getElementById('contentAreaContextMenu');
 const state={version:1,options:{enabled:true,showIcons:true,iconSize:20,iconAlignment:'right',iconGap:12,rowSpacing:3},roots:{contentAreaContextMenu:{children,records}}};
 const ctl=createMenuController(w,{getState:()=>state,resolveIcon:()=>({type:'text',text:'★',source:'explicit'})});
 const event=(name,target=root,init={})=>target.dispatchEvent(new w.Event(name,{bubbles:true,cancelable:true,...init}));
 return {dom,w,root,state,ctl,event};
}
test('original node dispatch retains modifiers and nested events never restore root; close restores before owner cleanup',async()=>{
 const f=setup(),a=f.w.document.getElementById('a');let direct,delegated,cleanup;
 a.addEventListener('command',e=>direct=e.ctrlKey);f.root.addEventListener('command',e=>delegated=e.target);
 f.root.addEventListener('popuphiding',()=>{cleanup=a.parentElement===f.root});
 f.event('popupshowing');await wait();assert.notEqual(a.parentElement,f.root);assert.equal(a.getAttribute('label'),'Custom');
 a.dispatchEvent(new f.w.MouseEvent('command',{bubbles:true,ctrlKey:true}));assert.equal(direct,true);assert.equal(delegated,a);
 f.event('popupshowing',a.parentElement);f.event('popuphiding',a.parentElement);await wait();assert.notEqual(a.parentElement,f.root);
 f.event('popuphiding');assert.equal(cleanup,true);assert.equal(a.getAttribute('label'),'Owner A');assert.equal(a.getAttribute('accesskey'),'A');
 assert.deepEqual([...f.root.children].map(x=>x.id),['a','b']);f.ctl.destroy();f.dom.window.close();
});

test('fitting symbols when a child popup is shown never rebuilds its active menu',async()=>{
 const f=setup();f.event('popupshowing');await wait();
 const a=f.w.document.getElementById('a'),popup=a.parentElement,decoration=a.querySelector('.cme-decoration'),removals=[];
 for(const glyph of popup.querySelectorAll('.cme-symbol-glyph'))glyph.getBoundingClientRect=()=>({width:80,height:20});
 const observer=new f.w.MutationObserver(records=>{for(const record of records)for(const node of record.removedNodes)if(node===a||node===popup)removals.push(node);});
 observer.observe(f.root,{subtree:true,childList:true});
 try{
  f.event('popupshown',popup);await wait();await wait();
  assert.equal(a.querySelector('.cme-decoration'),decoration,'fitting must retain the live icon node');
  assert.deepEqual(removals,[],'fitting must not remove an active command or popup');
 }finally{observer.disconnect();f.ctl.destroy();f.dom.window.close();}
});
test('late owner writes survive reconciliation and destroy, including same-value suppression writes',async()=>{
 const f=setup();f.state.roots.contentAreaContextMenu.records.a.hidden=true;f.event('popupshowing');await wait();const a=f.w.document.getElementById('a');
 a.setAttribute('label','New owner');a.setAttribute('image','owner.png');a.setAttribute('hidden','true');await wait();assert.equal(a.getAttribute('label'),'Custom');
 f.ctl.destroy();assert.equal(a.getAttribute('label'),'New owner');assert.equal(a.getAttribute('image'),'owner.png');assert.equal(a.getAttribute('hidden'),'true');f.dom.window.close();
});
test('replacement and removed nodes do not resurrect; late stable IDs are inventoried',async()=>{
 const f=setup();f.event('popupshowing');await wait();const old=f.w.document.getElementById('a');old.remove();const fresh=f.w.document.createElement('menuitem');fresh.id='a';fresh.setAttribute('label','Replacement');f.root.append(fresh);await wait();assert.equal(fresh.getAttribute('label'),'Custom');assert.equal(old.isConnected,false);
 const late=f.w.document.createElement('menuitem');late.id='unfamiliar';f.root.append(late);await wait();assert.ok(f.ctl.getInventory()[0].items.some(x=>x.key==='unfamiliar'));
 f.ctl.destroy();assert.equal(old.isConnected,false);assert.equal(fresh.getAttribute('label'),'Replacement');f.dom.window.close();
});
test('navigation suppression survives flattening; check and disabled state retain independent decoration',async()=>{
 const f=setup('<menugroup id="context-navigation" hidden="true"><menuitem id="context-back" label="Back" checked="true" type="checkbox" disabled="true"></menuitem></menugroup>',{'context-back':{kind:'command'}},['context-back']);
 f.event('popupshowing');await wait();const item=f.w.document.getElementById('context-back');assert.equal(item.parentElement,f.root);assert.equal(item.getAttribute('hidden'),'true');assert.equal(item.getAttribute('checked'),'true');assert.equal(item.getAttribute('disabled'),'true');
 const icon=item.querySelector('[data-cme-icon]');assert.equal(icon.namespaceURI,'http://www.w3.org/1999/xhtml');assert.equal(f.root.style.getPropertyValue('--cme-icon-size'),'20px');assert.equal(item.hasAttribute('image'),false);
 f.ctl.destroy();assert.equal(item.parentElement.id,'context-navigation');assert.equal(item.hasAttribute('hidden'),false);f.dom.window.close();
});
test('canceled opening and destroy before opening microtask leave native topology intact',async()=>{
 const f=setup();f.root.addEventListener('popupshowing',e=>e.preventDefault());f.event('popupshowing');await wait();assert.equal(f.w.document.getElementById('a').parentElement,f.root);f.ctl.destroy();f.dom.window.close();
 const g=setup();g.event('popupshowing');g.ctl.destroy();await wait();assert.equal(g.w.document.getElementById('a').parentElement,g.root);g.dom.window.close();
});
test('native delegated child stays under native popup, while native container itself can move',async()=>{
 const f=setup('<menu id="native" label="Native"><menupopup id="inner"><menuitem id="child"></menuitem></menupopup></menu>',{native:{kind:'native-menu',children:['child']},child:{kind:'command'},custom:{kind:'submenu',name:'More',children:['native']}},['custom']);
 f.event('popupshowing');await wait();const child=f.w.document.getElementById('child');assert.equal(child.parentElement.id,'inner');assert.notEqual(f.w.document.getElementById('native').parentElement,f.root);f.ctl.destroy();f.dom.window.close();
});

test('image decorations never leak HTML image children during repeated refresh or unload',async()=>{
 const f=setup();f.ctl.destroy();const ctl=createMenuController(f.w,{getState:()=>f.state,resolveIcon:()=>({type:'image',src:'data:image/png;base64,AA==',monochrome:true})});
 f.event('popupshowing');await wait();ctl.refresh();await wait();ctl.destroy();assert.equal(f.root.querySelector('img,span,[data-cme-owned]'),null);assert.deepEqual([...f.root.children].map(n=>n.id),['a','b']);f.dom.window.close();
});

test('missing browser artwork uses the owned fallback without a menu reconciliation loop',async()=>{
 const f=setup();f.ctl.destroy();const fallback='data:image/png;base64,AA==';
 const ctl=createMenuController(f.w,{getState:()=>f.state,resolveIcon:()=>({type:'image',src:'chrome://browser/skin/removed.svg',fallbackSrc:fallback})});
 f.event('popupshowing');await wait();const a=f.w.document.getElementById('a'),image=a.querySelector('img');
 image.dispatchEvent(new f.w.Event('error'));await wait();await wait();
 assert.equal(a.querySelector('img'),image);assert.equal(image.getAttribute('src'),fallback);
 assert.equal(a.getAttribute('label'),'Custom');assert.notEqual(a.parentElement,f.root);
 ctl.destroy();assert.equal(f.root.querySelector('img'),null);f.dom.window.close();
});

test('image fallback preserves reconciliation for owner writes queued earlier in the same event',async()=>{
 const f=setup();f.ctl.destroy();f.state.roots.contentAreaContextMenu.records.a.hidden=true;
 const ctl=createMenuController(f.w,{getState:()=>f.state,resolveIcon:()=>({type:'image',src:'chrome://browser/skin/removed.svg',fallbackSrc:'data:image/png;base64,AA=='})});
 f.event('popupshowing');await wait();const a=f.w.document.getElementById('a');
 f.root.addEventListener('error',()=>{a.removeAttribute('hidden');a.setAttribute('label','Owner updated');},{capture:true,once:true});
 a.querySelector('img').dispatchEvent(new f.w.Event('error'));await wait();await wait();
 assert.equal(a.getAttribute('hidden'),'true');assert.equal(a.getAttribute('label'),'Custom');
 ctl.destroy();assert.equal(a.hasAttribute('hidden'),false);assert.equal(a.getAttribute('label'),'Owner updated');f.dom.window.close();
});

test('native hover and submenu-open attributes retain the active owned submenu and its commands',async()=>{
 const f=setup();f.event('popupshowing');await wait();
 const a=f.w.document.getElementById('a'),popup=a.parentElement,menu=popup.parentElement;
 menu.setAttribute('open','true');menu.setAttribute('_moz-menuactive','true');a.setAttribute('_moz-menuactive','true');
 await wait();await wait();
 assert.equal(a.parentElement,popup);assert.equal(popup.parentElement,menu);assert.equal(menu.isConnected,true);
 f.ctl.destroy();assert.equal(a.parentElement,f.root);f.dom.window.close();
});
test('populating owner-only native submenu rows keeps its reordered live parent in place',async()=>{
 const f=setup('<menuitem id="a"></menuitem><menu id="foreign"><menupopup id="foreign-popup"></menupopup></menu>',
  {a:{kind:'command'},foreign:{kind:'native-menu',children:[]}},['foreign','a']);
 f.event('popupshowing');await wait();
 const menu=f.w.document.getElementById('foreign'),popup=f.w.document.getElementById('foreign-popup');
 let moves=0;const insert=f.root.insertBefore.bind(f.root);f.root.insertBefore=(node,...args)=>{if(node===menu)moves++;return insert(node,...args);};
 popup.dispatchEvent(new f.w.Event('popupshowing',{bubbles:true}));
 const anonymous=f.w.document.createXULElement('menuitem');anonymous.setAttribute('label','Owner-provided action');popup.append(anonymous);
 await wait();await wait();
 assert.equal(moves,0,'Populating anonymous native service rows must not reinsert their active submenu');
 assert.equal(anonymous.parentElement,popup);anonymous.setAttribute('disabled','true');await wait();await wait();assert.equal(moves,0);
 f.event('popuphiding');assert.equal(anonymous.parentElement,popup);assert.equal(f.root.lastElementChild,menu,'Closing still restores the original parent order');
 f.ctl.destroy();f.dom.window.close();
});
test('anonymous native submenu access keys are reconciled without moving its live parent',async()=>{
 const f=setup('<menuitem id="a"></menuitem><menu id="foreign"><menupopup id="foreign-popup"><menuitem id="tracked" label="Alpha" accesskey="A"></menuitem><menuitem label="Owner" accesskey="B"></menuitem></menupopup></menu>',
  {a:{kind:'command'},foreign:{kind:'native-menu',children:['tracked']},tracked:{kind:'command',name:'Alpha Custom'}},['foreign','a']);
 f.event('popupshowing');await wait();const menu=f.w.document.getElementById('foreign'),popup=f.w.document.getElementById('foreign-popup'),tracked=f.w.document.getElementById('tracked'),anonymous=popup.lastElementChild;
 let moves=0;const insert=f.root.insertBefore.bind(f.root);f.root.insertBefore=(node,...args)=>{if(node===menu)moves++;return insert(node,...args);};
 anonymous.setAttribute('accesskey','A');await wait();await wait();assert.equal(tracked.hasAttribute('accesskey'),false);assert.equal(moves,0);
 anonymous.setAttribute('accesskey','B');await wait();await wait();assert.equal(tracked.getAttribute('accesskey'),'A');assert.equal(moves,0);
 const duplicate=f.w.document.createXULElement('menuitem');duplicate.setAttribute('label','Another native action');duplicate.setAttribute('accesskey','A');popup.append(duplicate);await wait();await wait();assert.equal(tracked.hasAttribute('accesskey'),false);assert.equal(moves,0);
 duplicate.remove();await wait();await wait();assert.equal(tracked.getAttribute('accesskey'),'A');assert.equal(moves,0);
 f.ctl.destroy();f.dom.window.close();
});
test('new stable native submenu children still enter the editor inventory',async()=>{
 const f=setup('<menu id="foreign"><menupopup id="foreign-popup"></menupopup></menu>',{foreign:{kind:'native-menu',children:[]}},['foreign']);
 f.event('popupshowing');await wait();const popup=f.w.document.getElementById('foreign-popup'),child=f.w.document.createXULElement('menuitem');child.id='new-native-action';child.setAttribute('label','New action');popup.append(child);
 await wait();await wait();assert.ok(f.ctl.getInventory().find(menu=>menu.id===f.root.id).items.some(item=>item.key===child.id));assert.equal(child.getAttribute('data-cme-item'),'true');
 f.ctl.destroy();f.dom.window.close();
});
test('opening a reordered foreign submenu never moves it while Gecko records its first opening',async()=>{
 const f=setup('<menuitem id="a"></menuitem><menu id="foreign"><menupopup id="foreign-popup"><menuitem id="child"></menuitem></menupopup></menu>',
  {a:{kind:'command'},foreign:{kind:'native-menu',children:['child']},child:{kind:'command'}},['foreign','a']);
 f.event('popupshowing');await wait();
 const menu=f.w.document.getElementById('foreign'),popup=f.w.document.getElementById('foreign-popup'),decoration=menu.querySelector('.cme-decoration');
 let moves=0;const insert=f.root.insertBefore.bind(f.root);f.root.insertBefore=(node,...rest)=>{if(node===menu)moves++;return insert(node,...rest);};
 popup.setAttribute('hasbeenopened','true');menu.setAttribute('open','true');await wait();await wait();
 assert.equal(moves,0,'An open native submenu must not be restored and moved back for widget state');
 assert.equal(menu.querySelector('.cme-decoration'),decoration);assert.equal(popup.parentElement,menu);
 f.w.document.getElementById('a').setAttribute('label','Owner refreshed elsewhere');await wait();await wait();
 assert.equal(moves,0,'A label refresh elsewhere must not move the open foreign submenu');
 assert.equal(menu.querySelector('.cme-decoration'),decoration);
 f.ctl.destroy();f.dom.window.close();
});
for(const mode of ['disabled','shift'])test(`owner label updates preserve the original menu during ${mode} openings`,async()=>{
 const f=setup();f.state.options.enabled=mode!=='disabled';f.state.options.shiftBypass=true;
 f.root.dispatchEvent(new f.w.MouseEvent('popupshowing',{bubbles:true,shiftKey:mode==='shift'}));await wait();
 const a=f.w.document.getElementById('a');assert.equal(a.getAttribute('label'),'Owner A');
 a.setAttribute('label','New owner');await wait();await wait();
 assert.equal(a.getAttribute('label'),'New owner');assert.equal(a.parentElement,f.root);assert.equal(a.hasAttribute('data-cme-item'),false);
 assert.equal(f.ctl.getInventory()[0].items.find(item=>item.key==='a').label,'New owner');
 f.ctl.destroy();f.dom.window.close();
});
test('live access-key conflicts suppress custom keys and release suppression when the conflict ends',async()=>{
 const f=setup('<menuitem id="a" label="Owner A" accesskey="A"></menuitem><menuitem id="b" label="Owner B" accesskey="B"></menuitem>',
  {a:{kind:'command',name:'Alpha Custom'},b:{kind:'command'}},['a','b']);
 f.event('popupshowing');await wait();const a=f.w.document.getElementById('a'),b=f.w.document.getElementById('b');
 b.setAttribute('accesskey','A');await wait();assert.equal(a.getAttribute('accesskey'),null);assert.equal(b.getAttribute('accesskey'),'A');
 b.setAttribute('accesskey','B');await wait();assert.equal(a.getAttribute('accesskey'),'A');assert.equal(b.getAttribute('accesskey'),'B');
 f.event('popuphiding');assert.equal(a.getAttribute('accesskey'),'A');assert.equal(b.getAttribute('accesskey'),'B');
 f.ctl.destroy();f.dom.window.close();
});
test('owner hides navigation later and reload/stop remain exclusive through fresh openings',async()=>{
 const f=setup('<menugroup id="context-navigation"><menuitem id="context-reload" label="Reload"></menuitem><menuitem id="context-stop" hidden="true" label="Stop"></menuitem></menugroup>',{},[]);
 f.event('popupshowing');await wait();const group=f.w.document.getElementById('context-navigation'),reload=f.w.document.getElementById('context-reload'),stop=f.w.document.getElementById('context-stop');assert.equal(reload.hasAttribute('hidden'),false);assert.equal(stop.getAttribute('hidden'),'true');
 group.setAttribute('hidden','true');await wait();assert.equal(reload.getAttribute('hidden'),'true');f.event('popuphiding');group.removeAttribute('hidden');reload.setAttribute('hidden','true');stop.removeAttribute('hidden');f.event('popupshowing');await wait();assert.equal(reload.getAttribute('hidden'),'true');assert.equal(stop.hasAttribute('hidden'),false);f.ctl.destroy();f.dom.window.close();
});
test('AI next sibling remains its own separator, including anonymous separators, under late owner writes',async()=>{
 const f=setup('<menu id="context-ask-chat" label="AI"><menupopup></menupopup></menu><menuseparator></menuseparator><menuitem id="a"></menuitem>',{a:{kind:'command'}},['a']);
 const ai=f.w.document.getElementById('context-ask-chat'),separator=ai.nextElementSibling;f.event('popupshowing');await wait();assert.equal(ai.nextElementSibling,separator);separator.setAttribute('hidden','true');await wait();assert.equal(ai.nextElementSibling,separator);assert.equal(separator.getAttribute('hidden'),'true');f.ctl.destroy();f.dom.window.close();
});
test('observer settles without rewriting unchanged presentation forever and late unknown roots attach',async()=>{
 const f=setup();let notifications=0;f.ctl.subscribe(()=>notifications++);f.event('popupshowing');await wait();const settled=notifications;await wait();await wait();assert.equal(notifications,settled);
 const tabs=f.w.document.createElement('menupopup');tabs.id='tabContextMenu';const item=f.w.document.createElement('menuitem');item.id='tab-new';tabs.append(item);f.w.document.body.append(tabs);await wait();assert.ok(f.ctl.getInventory().find(r=>r.id==='tabContextMenu').items.some(i=>i.key==='tab-new'));f.ctl.destroy();f.dom.window.close();
});
test('foreign styles survive without leaking owned spacing and removed native parents stay removed',async()=>{
 const f=setup();f.event('popupshowing');await wait();f.root.style.color='red';await wait();f.ctl.destroy();assert.equal(f.root.style.color,'red');assert.equal(f.root.style.getPropertyValue('--cme-icon-size'),'');f.dom.window.close();
});
test('owner moving an original node outside the root is respected on unload',async()=>{
 const f=setup();f.event('popupshowing');await wait();const a=f.w.document.getElementById('a'),elsewhere=f.w.document.createElement('menupopup');f.w.document.body.append(elsewhere);elsewhere.append(a);await wait();f.ctl.destroy();assert.equal(a.parentElement,elsewhere);assert.equal(a.getAttribute('label'),'Owner A');f.dom.window.close();
});
test('AI trailing anonymous adjacent separator is never cleaned up by this overlay',async()=>{
 const f=setup('<menuitem id="a"></menuitem><menu id="context-ask-chat"><menupopup></menupopup></menu><menuseparator></menuseparator>',{a:{kind:'command',hidden:true}},['a']);
 const ai=f.w.document.getElementById('context-ask-chat'),sep=ai.nextElementSibling;f.event('popupshowing');await wait();assert.equal(ai.nextElementSibling,sep);assert.equal(sep.hasAttribute('hidden'),false);f.ctl.destroy();f.dom.window.close();
});
test('a foreign owner repeatedly rewriting an override causes bounded fallback to the owner menu',async()=>{
 const f=setup();let writes=0;const a=f.w.document.getElementById('a');const owner=new f.w.MutationObserver(()=>{if(a.getAttribute('label')==='Custom'&&writes<100){writes++;a.setAttribute('label','Owner active');}});owner.observe(a,{attributes:true,attributeFilter:['label']});
 f.event('popupshowing');await wait();assert.ok(writes<=32,`owner rewritten ${writes} times`);assert.equal(a.getAttribute('label'),'Owner active');owner.disconnect();f.ctl.destroy();f.dom.window.close();
});
test('locked group retains topology while explicit row overrides still work',async()=>{
 const f=setup('<menugroup id="foreign-group"><menuitem id="foreign-child" label="Original"></menuitem></menugroup>',{'foreign-group':{kind:'native-menu',children:['foreign-child']},'foreign-child':{kind:'command',name:'Renamed',hidden:true}},['foreign-group']);
 f.event('popupshowing');await wait();const child=f.w.document.getElementById('foreign-child');assert.equal(child.parentElement.id,'foreign-group');assert.equal(child.getAttribute('label'),'Renamed');assert.equal(child.getAttribute('hidden'),'true');f.ctl.destroy();assert.equal(child.getAttribute('label'),'Original');assert.equal(child.hasAttribute('hidden'),false);f.dom.window.close();
});
test('Shift bypass follows the triggering contextmenu event when popupshowing has no modifiers',async()=>{
 const f=setup();f.state.options.shiftBypass=true;f.w.document.body.dispatchEvent(new f.w.MouseEvent('contextmenu',{bubbles:true,shiftKey:true}));f.event('popupshowing');await wait();assert.equal(f.w.document.getElementById('a').parentElement,f.root);assert.equal(f.w.document.getElementById('a').getAttribute('label'),'Owner A');f.event('popuphiding');f.event('popupshowing');await wait();assert.equal(f.w.document.getElementById('a').getAttribute('label'),'Custom');f.ctl.destroy();f.dom.window.close();
});
test('flattened visible navigation leaves no empty native group row and restores it on close',async()=>{
 const f=setup('<menugroup id="context-navigation"><menuitem id="context-back" label="Back"></menuitem></menugroup>',{},[]);const group=f.w.document.getElementById('context-navigation');f.event('popupshowing');await wait();assert.equal(group.getAttribute('hidden'),'true');assert.equal(f.w.document.getElementById('context-back').hasAttribute('hidden'),false);f.event('popuphiding');assert.equal(group.hasAttribute('hidden'),false);assert.equal(group.firstElementChild.id,'context-back');f.ctl.destroy();f.dom.window.close();
});
test('opening with no saved order preserves protected and untracked source rows',async()=>{
 const f=setup('<menuitem id="a"></menuitem><menu id="context_askChat"><menupopup></menupopup></menu><menuseparator id="context_aiSeparator"></menuseparator><menuitem label="Transient"></menuitem><menuitem id="b"></menuitem>',{},[]);const before=[...f.root.children];f.event('popupshowing');await wait();assert.deepEqual([...f.root.children],before);f.ctl.destroy();f.dom.window.close();
});
test('ordinary commands can occupy either side of a protected pair without splitting it',async()=>{
 const f=setup('<menuitem id="a"></menuitem><menu id="context_askChat"><menupopup></menupopup></menu><menuseparator id="context_aiSeparator"></menuseparator><menuitem id="b"></menuitem>',{},['b','context_askChat','context_aiSeparator','a']);f.event('popupshowing');await wait();assert.deepEqual([...f.root.children].map(n=>n.id),['b','context_askChat','context_aiSeparator','a']);f.ctl.destroy();assert.deepEqual([...f.root.children].map(n=>n.id),['a','context_askChat','context_aiSeparator','b']);f.dom.window.close();
});
test('malformed saved order cannot split an owner next-sibling pair',async()=>{
 const f=setup('<menuitem id="a"></menuitem><menu id="context_askChat"><menupopup></menupopup></menu><menuseparator id="context_aiSeparator"></menuseparator><menuitem id="b"></menuitem>',{},['context_askChat','a','context_aiSeparator','b']);const ai=f.w.document.getElementById('context_askChat'),sep=f.w.document.getElementById('context_aiSeparator');f.event('popupshowing');await wait();assert.equal(ai.nextElementSibling,sep);f.ctl.destroy();f.dom.window.close();
});
test('owner removal of a navigation parent also removes its temporarily flattened children',async()=>{
 const f=setup('<menugroup id="context-navigation"><menuitem id="context-back" label="Back"></menuitem></menugroup>',{},[]);const group=f.w.document.getElementById('context-navigation'),back=group.firstElementChild;f.event('popupshowing');await wait();group.remove();await wait();assert.equal(back.isConnected,false);assert.equal(back.parentElement,group);assert.equal(f.ctl.getInventory()[0].items.some(i=>i.key==='context-back'),false);f.ctl.destroy();assert.equal(back.isConnected,false);f.dom.window.close();
});
test('removing a native owner subtree restores its detached children out of owned submenus',async()=>{
 const f=setup('<menu id="native"><menupopup id="native-popup"><menuitem id="child"></menuitem></menupopup></menu>',{native:{kind:'native-menu',children:['custom']},custom:{kind:'submenu',name:'More',children:['child']},child:{kind:'command'}},['native']);const native=f.w.document.getElementById('native'),popup=f.w.document.getElementById('native-popup'),child=f.w.document.getElementById('child');f.event('popupshowing');await wait();native.remove();await wait();f.ctl.destroy();assert.equal(child.parentElement,popup);assert.equal(child.isConnected,false);assert.equal(native.querySelector('[data-cme-owned]'),null);f.dom.window.close();
});
test('all saved permutations restore the original source order on close and destroy',async()=>{
 const orders=[['a','b','c'],['a','c','b'],['b','a','c'],['b','c','a'],['c','a','b'],['c','b','a']];
 for(const order of orders)for(const closing of ['popuphiding','destroy']){
  const f=setup('<menuitem id="a"></menuitem><menuitem id="b"></menuitem><menuitem id="c"></menuitem>',{},order);f.event('popupshowing');await wait();assert.deepEqual([...f.root.children].map(n=>n.id),order);if(closing==='destroy')f.ctl.destroy();else f.event(closing);assert.deepEqual([...f.root.children].map(n=>n.id),['a','b','c'],`${order.join(',')} on ${closing}`);f.ctl.destroy();f.dom.window.close();
 }
});
test('permutation rollback uses the next surviving source anchor without reviving a removed neighbor',async()=>{
 const f=setup('<menuitem id="a"></menuitem><menuitem id="b"></menuitem><menuitem id="c"></menuitem>',{},['c','b','a']);f.event('popupshowing');await wait();const b=f.w.document.getElementById('b');b.remove();f.ctl.destroy();assert.deepEqual([...f.root.children].map(n=>n.id),['a','c']);assert.equal(b.isConnected,false);f.dom.window.close();
});
