import test from 'node:test';
import assert from 'node:assert/strict';
import {makeDOM} from './dom.mjs';
import {createState,mergeInventory,updateItem,moveItem,addSubmenu} from '../src/model.mjs';
import {createMenuController} from '../src/controller.mjs';
import {applyOwnerChanges,createOwnerSettingsObserver,settingFields} from '../src/owner-settings.mjs';
import {createIconService} from '../src/icons.mjs';
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
test('owner changes can arrive after opening and in separate async name and icon updates',async()=>{
 const dom=makeDOM('<menupopup id="contentAreaContextMenu"><menuitem id="a" label="Owner" image="first.svg"></menuitem></menupopup>'),w=dom.window,root=w.document.getElementById('contentAreaContextMenu'),item=w.document.getElementById('a');let state=createState();
 const controller=createMenuController(w,{getState:()=>state,resolveSource:()=>({kind:'mod',id:'foreign',name:'Foreign'}),onOwnerChange:(id,items,changes)=>{state=applyOwnerChanges(state,id,items,changes);}});
 state=mergeInventory(state,root.id,controller.getInventory()[0].items);state=updateItem(state,root.id,'a',{name:'Mine',icon:{kind:'text',text:'★'}});
 controller.noteOwnerSettingsChange('foreign',['name','icon']);root.dispatchEvent(new w.Event('popupshowing',{bubbles:true}));await tick();
 item.setAttribute('label','Owner new');await tick();assert.equal(state.roots[root.id].records.a.name,undefined);
 item.setAttribute('image','second.svg');await tick();assert.equal(state.roots[root.id].records.a.icon,undefined);assert.equal(state.roots[root.id].records.a.iconOwner,true);controller.destroy();dom.window.close();
});
test('unconsumed owner fields expire after settling and cannot revoke a later routine label',async()=>{
 const dom=makeDOM('<menupopup id="contentAreaContextMenu"><menuitem id="a" label="Owner" image="first.svg"></menuitem></menupopup>'),w=dom.window,root=w.document.getElementById('contentAreaContextMenu'),item=w.document.getElementById('a');let state=createState(),writes=0;
 const controller=createMenuController(w,{getState:()=>state,resolveSource:()=>({kind:'mod',id:'foreign',name:'Foreign'}),onOwnerChange:(id,items,changes)=>{state=applyOwnerChanges(state,id,items,changes);writes++;}});
 state=mergeInventory(state,root.id,controller.getInventory()[0].items);state=updateItem(state,root.id,'a',{name:'Mine',icon:{kind:'text',text:'★'}});
 controller.noteOwnerSettingsChange('foreign',['name','icon']);root.dispatchEvent(new w.Event('popupshowing',{bubbles:true}));await tick();item.setAttribute('image','second.svg');await tick();await new Promise(resolve=>setTimeout(resolve,2100));item.setAttribute('label','Routine later label');await tick();
 assert.equal(state.roots[root.id].records.a.name,'Mine');assert.equal(writes,1);controller.destroy();dom.window.close();
});
test('a pending owner effect survives removing and recreating its whole native root',async()=>{
 const dom=makeDOM('<menupopup id="foreign-popup"><menuitem id="a" label="Owner" image="first.svg"></menuitem></menupopup>'),w=dom.window;let state=createState();
 const source=node=>node.localName==='menuitem'?{kind:'mod',id:'foreign',name:'Foreign'}:null;
 const controller=createMenuController(w,{getState:()=>state,resolveSource:source,onOwnerChange:(id,items,changes)=>{state=applyOwnerChanges(state,id,items,changes);}});
 const old=w.document.getElementById('foreign-popup');state=mergeInventory(state,old.id,controller.getInventory()[0].items);state=updateItem(state,old.id,'a',{icon:{kind:'text',text:'★'}});controller.noteOwnerSettingsChange('foreign',['icon']);old.remove();await tick();
 const root=w.document.createXULElement('menupopup');root.id='foreign-popup';w.document.body.append(root);await tick();const item=w.document.createXULElement('menuitem');item.id='a';item.setAttribute('label','Owner');item.setAttribute('image','second.svg');root.append(item);root.dispatchEvent(new w.Event('popupshowing',{bubbles:true}));await tick();
 assert.equal(state.roots[root.id].records.a.icon,undefined);assert.equal(state.roots[root.id].records.a.iconOwner,true);controller.destroy();dom.window.close();
});
test('a later owner icon choice can supersede the global icon switch and an editor icon edit takes it back',async()=>{
 const dom=makeDOM('<menupopup id="contentAreaContextMenu"><menuitem id="foreign" class="menuitem-iconic" label="Owner" image="first.svg"></menuitem></menupopup>'),w=dom.window,root=w.document.getElementById('contentAreaContextMenu'),item=w.document.getElementById('foreign');
 const descriptors=[{key:'foreign',kind:'command',parentKey:null}],icons=createIconService(w);let state=mergeInventory(createState(),root.id,descriptors);state.options.showIcons=false;
 state=applyOwnerChanges(state,root.id,descriptors,{patches:[{key:'foreign',patch:{icon:null,showIcon:true,iconOwner:true}}]});
 const controller=createMenuController(w,{getState:()=>state,resolveIcon:(...args)=>icons.resolve(...args)});root.dispatchEvent(new w.Event('popupshowing',{bubbles:true}));await tick();
 assert.equal(item.getAttribute('data-cme-icons'),'owner');assert.equal(item.querySelector(':scope > .cme-decoration'),null);assert.equal(item.getAttribute('image'),'first.svg');
 state=updateItem(state,root.id,'foreign',{icon:{kind:'text',text:'★'},showIcon:true});state.options.showIcons=true;controller.refresh();
 assert.equal(state.roots[root.id].records.foreign.iconOwner,undefined);assert.equal(item.querySelector(':scope > .cme-decoration').textContent,'★');controller.destroy();dom.window.close();
});
test('owner preference changes yield only changed fields, retain unrelated edits and can be overwritten again',async()=>{
 const dom=makeDOM('<menupopup id="contentAreaContextMenu"><menuitem id="foreign" label="Owner" image="first.svg"></menuitem><menuitem id="other" label="Other"></menuitem></menupopup>'),w=dom.window,root=w.document.getElementById('contentAreaContextMenu'),foreign=w.document.getElementById('foreign');
 let state=createState(),writes=0;
 const controller=createMenuController(w,{getState:()=>state,resolveSource:node=>node===foreign?{kind:'mod',id:'unfamiliar',name:'Unfamiliar Tools'}:null,onOwnerChange:(id,inventory,changes)=>{state=applyOwnerChanges(state,id,inventory,changes);writes++;}});
 const inventory=controller.getInventory()[0].items;state=mergeInventory(state,root.id,inventory);state=updateItem(state,root.id,'foreign',{name:'Mine',icon:{kind:'text',text:'★'}});state=moveItem(state,root.id,'foreign',null,1,inventory);
 const show=()=>root.dispatchEvent(new w.Event('popupshowing',{bubbles:true,cancelable:true})),hide=()=>root.dispatchEvent(new w.Event('popuphidden',{bubbles:true}));
 show();await tick();foreign.setAttribute('label','Routine dynamic label');await tick();assert.equal(foreign.getAttribute('label'),'Mine');assert.equal(writes,0);
 controller.noteOwnerSettingsChange('unfamiliar',['icon']);foreign.removeAttribute('image');await tick();
 assert.equal(state.roots[root.id].records.foreign.icon,undefined);assert.equal(state.roots[root.id].records.foreign.showIcon,false);assert.equal(state.roots[root.id].records.foreign.name,'Mine');assert.deepEqual(state.roots[root.id].children,['other','foreign']);
 controller.noteOwnerSettingsChange('unfamiliar',['name']);foreign.setAttribute('label','New owner name');await tick();assert.equal(state.roots[root.id].records.foreign.name,undefined);assert.equal(foreign.getAttribute('label'),'New owner name');
 hide();show();await tick();assert.equal(foreign.getAttribute('label'),'New owner name');
 state=updateItem(state,root.id,'foreign',{name:'Mine again',showIcon:true});controller.refresh();assert.equal(foreign.getAttribute('label'),'Mine again');assert.equal(state.roots[root.id].records.foreign.showIcon,true);
 controller.destroy();dom.window.close();
});
test('owner order changes rebase its rows while retaining another mod and a custom submenu',()=>{
 const descriptors=[{key:'b',kind:'command',parentKey:null},{key:'a',kind:'command',parentKey:null},{key:'other',kind:'command',parentKey:null}];
 let state=mergeInventory(createState(),'menu',descriptors);state=addSubmenu(state,'menu','Tools',null,0,'custom-tools');state=updateItem(state,'menu','other',{name:'Keep me'});
 const next=applyOwnerChanges(state,'menu',descriptors,{placement:descriptors.slice(0,2)});
 assert.deepEqual(next.roots.menu.children,['custom-tools','b','a','other']);assert.equal(next.roots.menu.records.other.name,'Keep me');
});
test('an owner swapping two rows keeps an unchanged row nested in an editor submenu',async()=>{
 const dom=makeDOM('<menupopup id="contentAreaContextMenu"><menuitem id="a"></menuitem><menuitem id="b"></menuitem><menuitem id="c"></menuitem><menuitem id="d"></menuitem></menupopup>'),w=dom.window,root=w.document.getElementById('contentAreaContextMenu');let state=createState();
 const controller=createMenuController(w,{getState:()=>state,resolveSource:()=>({kind:'mod',id:'foreign',name:'Foreign'}),onOwnerChange:(id,items,changes)=>{state=applyOwnerChanges(state,id,items,changes);}});
 const descriptors=controller.getInventory()[0].items;state=mergeInventory(state,root.id,descriptors);state=addSubmenu(state,root.id,'Tools',null,0,'custom-tools');state=moveItem(state,root.id,'d','custom-tools',0,descriptors);
 controller.noteOwnerSettingsChange('foreign',['placement']);root.insertBefore(w.document.getElementById('b'),w.document.getElementById('a'));await tick();
 assert.deepEqual(state.roots[root.id].children,['custom-tools','b','a','c']);assert.deepEqual(state.roots[root.id].records['custom-tools'].children,['d']);controller.destroy();dom.window.close();
});
test('a single owner command moving across a native sibling yields its placement',async()=>{
 const dom=makeDOM('<menupopup id="contentAreaContextMenu"><menuitem id="a"></menuitem><menuitem id="native"></menuitem></menupopup>'),w=dom.window,root=w.document.getElementById('contentAreaContextMenu'),item=w.document.getElementById('a');let state=createState();
 const controller=createMenuController(w,{getState:()=>state,resolveSource:node=>node===item?{kind:'mod',id:'foreign',name:'Foreign'}:null,onOwnerChange:(id,items,changes)=>{state=applyOwnerChanges(state,id,items,changes);}});
 state=mergeInventory(state,root.id,controller.getInventory()[0].items);controller.noteOwnerSettingsChange('foreign',['placement']);root.append(item);await tick();assert.deepEqual(state.roots[root.id].children,['native','a']);controller.destroy();dom.window.close();
});
function preferenceService(){
 const observers=new Map();
 return {
  observers,
  addObserver(name,observer){assert.notEqual(name,'','no global preference observer');if(!observers.has(name))observers.set(name,new Set());observers.get(name).add(observer);},
  removeObserver(name,observer){observers.get(name)?.delete(observer);if(!observers.get(name)?.size)observers.delete(name);},
  // Gecko branch observers also fire for longer names that share the prefix.
  write(name){for(const [domain,set]of observers)if(name.startsWith(domain))for(const observer of set)observer.observe(null,'nsPref:changed',name);},
 };
}
const declaring=(...properties)=>async()=>({text:async()=>JSON.stringify(properties.map(property=>({type:'checkbox',property})))});
test('a mod owns exactly the preference names it declares, each observed on its own and removed on unload',async()=>{
 const dom=makeDOM(),prefs=preferenceService(),changes=[];
 dom.window.fetch=async url=>{assert.equal(url,'chrome://sine/content/unfamiliar/preferences.json');return declaring('arbitrary.family.menu-icons','arbitrary.family.dictionary','arbitrary.family.show-labels')();};
 const owner=createOwnerSettingsObserver(dom.window,{prefs,loadMods:async()=>({unfamiliar:{id:'unfamiliar',preferences:'preferences.json'}}),onChange:(...args)=>changes.push(args)});await owner.refresh();
 // A declared name with no presentation hint cannot yield a change, so it is not observed.
 assert.deepEqual([...prefs.observers.keys()].sort(),['arbitrary.family.menu-icons','arbitrary.family.show-labels']);
 for(const name of ['arbitrary.family.menu-icons','arbitrary.family.dictionary','arbitrary.family.state','arbitrary.family.menu-icons.extra','unfamiliar.menu-icons','extension.context-menu-editor.settings'])prefs.write(name);
 assert.deepEqual(changes,[['unfamiliar',['icon']]]);
 owner.destroy();assert.equal(prefs.observers.size,0);prefs.write('arbitrary.family.menu-icons');assert.equal(changes.length,1);dom.window.close();
});
test('Zen and browser preferences are never a mod change, while an exactly declared uc.tabs name is',async()=>{
 const dom=makeDOM(),prefs=preferenceService(),changes=[];
 // A SuperPins-like mod declaring many zen.workspaces.* and uc.tabs.* names.
 dom.window.fetch=declaring('zen.workspaces.show-icons','zen.workspaces.hide-default','zen.workspaces.menu-order','browser.tabs.show-labels','layout.css.icon-size','extensions.downloads.show','uc.tabs.show-pin-icons','uc.tabs.pin-label');
 const owner=createOwnerSettingsObserver(dom.window,{prefs,loadMods:async()=>({superpins:{id:'superpins',preferences:'preferences.json'}}),onChange:(...args)=>changes.push(args)});await owner.refresh();
 assert.deepEqual([...prefs.observers.keys()].sort(),['uc.tabs.pin-label','uc.tabs.show-pin-icons']);
 // Zen writes its own workspace and tab preferences; none of them belongs to the mod.
 for(const name of ['zen.workspaces.show-icons','zen.workspaces.show-workspace-indicator','zen.workspaces.menu-order','browser.tabs.show-labels','uc.tabs.undeclared-label','uc.tabs.order'])prefs.write(name);
 assert.deepEqual(changes,[]);
 prefs.write('uc.tabs.show-pin-icons');prefs.write('uc.tabs.pin-label');
 assert.deepEqual(changes,[['superpins',['icon']],['superpins',['name']]]);owner.destroy();dom.window.close();
});
test('repeated prefixes no longer create an inferred family of undeclared settings',async()=>{
 const dom=makeDOM(),prefs=preferenceService(),changes=[];
 dom.window.fetch=declaring('mod.owner.menu-icons','mod.owner.enabled','mod.owner.panel.icon-size','mod.owner.panel.color');
 const owner=createOwnerSettingsObserver(dom.window,{prefs,loadMods:async()=>({owner:{id:'owner',preferences:'preferences.json'}}),onChange:(...args)=>changes.push(args)});await owner.refresh();
 for(const name of ['mod.owner.panel.state','mod.owner.panel.menu-order','mod.owner.state','mod.owner.settings'])prefs.write(name);
 assert.deepEqual(changes,[]);prefs.write('mod.owner.panel.icon-size');assert.deepEqual(changes,[['owner',['icon']]]);owner.destroy();dom.window.close();
});
test('declared names that later disappear stop being observed after a refresh',async()=>{
 const dom=makeDOM(),prefs=preferenceService();let declared=['mod.a.menu-icons','mod.a.show-items'];
 dom.window.fetch=async()=>({text:async()=>JSON.stringify(declared.map(property=>({property})))});
 const owner=createOwnerSettingsObserver(dom.window,{prefs,loadMods:async()=>({a:{id:'a',preferences:'preferences.json'}}),onChange:()=>{}});await owner.refresh();
 assert.deepEqual([...prefs.observers.keys()].sort(),['mod.a.menu-icons','mod.a.show-items']);
 declared=['mod.a.show-items'];await owner.refresh();assert.deepEqual([...prefs.observers.keys()],['mod.a.show-items']);owner.destroy();assert.equal(prefs.observers.size,0);dom.window.close();
});
test('setting hints are explicit; generic state, settings, config and menu names yield no field',()=>{
 for(const [name,fields]of [['m.menu-icons',['icon']],['m.itemLabels',['name']],['m.menu-order',['placement']],['m.show-items',['visibility']],['m.enabled',['visibility']],
  ['m.state',[]],['m.settings',[]],['m.config',[]],['m.context-menu',[]],['m.menu',[]]])assert.deepEqual(settingFields(name),fields,name);
});
test('a preference explicitly shared by two mods notifies both proven owners',async()=>{
 const dom=makeDOM(),prefs=preferenceService(),changes=[];
 dom.window.fetch=declaring('shared.menu.name');
 const observerOwner=createOwnerSettingsObserver(dom.window,{prefs,loadMods:async()=>({a:{id:'owner-a',preferences:'preferences.json'},b:{id:'owner-b',preferences:'preferences.json'}}),onChange:id=>changes.push(id)});
 await observerOwner.refresh();prefs.write('shared.menu.name');assert.deepEqual(changes.sort(),['owner-a','owner-b']);observerOwner.destroy();dom.window.close();
});
