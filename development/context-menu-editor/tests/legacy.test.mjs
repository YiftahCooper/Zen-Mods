import test from 'node:test';
import assert from 'node:assert/strict';
import {createState,parseState,serializeState,mergeInventory,updateItem,resetRoot,validateState} from '../src/model.mjs';
import {createMenuController} from '../src/controller.mjs';
import {makeDOM} from './dom.mjs';

let api;
try{api=await import('../src/legacy.mjs');}catch{}
const OWN='extension.context-menu-editor.settings';
function preferences(values={}){
 const data=new Map(Object.entries(values)),writes=[];
 const typed=(key,fallback,type)=>{if(!data.has(key))return fallback;const value=data.get(key);if(typeof value!==type)throw Error('Wrong preference type');return value;};
 return {data,writes,prefHasUserValue:key=>data.has(key),getStringPref:(key,fallback='')=>typed(key,fallback,'string'),getBoolPref:(key,fallback=false)=>typed(key,fallback,'boolean'),getIntPref:(key,fallback=0)=>typed(key,fallback,'number'),setStringPref(key,value){writes.push(key);data.set(key,value);}};
}
function initialize(p){assert.equal(typeof api?.initializeLegacySettings,'function','The one-time legacy importer must exist.');return api.initializeLegacySettings(p);}
const item=(key,kind='command')=>({key,kind,label:key,parentKey:null,available:true});
const wait=()=>new Promise(resolve=>setTimeout(resolve,0));

test('profiles without explicit legacy settings retain normal defaults without a preference write',()=>{
 const p=preferences();initialize(p);assert.equal(p.data.has(OWN),false);assert.deepEqual(p.writes,[]);assert.equal(createState().options.iconPack,'fluent');assert.equal(createState().options.hideUnavailable,false);assert.equal(createState().options.showSeparators,true);assert.equal(createState().options.preferCleanLinks,false);
});

test('import writes only the editor preference and translates supported per-profile choices',()=>{
 const source={'cmi-Switch-Icon-Package':2,'cmi-menuseparator-opacity':'0.6','cmi-Grayscale-Extensions-Icons':true,'cmi-Hide-Inactive-Items-ContentAreaContextMenu':true,'cmi-Hide-Inactive-Items-TabContextMenu':false,'uc.hidecontext.separators':true,'uc.hidecontext.copylink':true,'uc.hidecontext.reloadtab':true,'uc.hidecontext.mutetab':false,'cmi-zenui-text-leftmargin':'12px','unrelated.private.setting':'private'};
 const p=preferences(source);initialize(p);const state=parseState(p.data.get(OWN));
 assert.equal(state.options.iconPack,'zen');assert.equal(state.options.showIcons,true);assert.equal(state.options.separatorOpacity,0.6);assert.equal(state.options.monochromeExtensions,true);assert.equal(state.options.showSeparators,false);assert.equal(state.options.preferCleanLinks,true);
 assert.equal(state.options.iconGap,8,'Legacy offsets must not be guessed as the new icon gap');assert.equal(state.options.hideUnavailable,false,'Keep the public global default');assert.equal(state.roots.contentAreaContextMenu.hideUnavailable,true);assert.equal(state.roots.tabContextMenu.hideUnavailable,false);assert.equal(state.roots.placesContext,undefined);
 assert.ok(state.roots.tabContextMenu.legacyHiddenIds.includes('context_reloadTab'));assert.equal(state.roots.tabContextMenu.legacyHiddenIds.includes('context_toggleMuteTab'),false);
 assert.deepEqual(p.writes,[OWN]);for(const [key,value]of Object.entries(source))assert.equal(p.data.get(key),value);assert.doesNotMatch(p.data.get(OWN),/private|cmi-zenui-text-leftmargin/);
});

test('existing editor data, including empty normalized settings and corrupt data, is never replaced',()=>{
 for(const saved of [serializeState(createState()),'{broken','user data']){
  const p=preferences({[OWN]:saved,'uc.hidecontext.reloadtab':true});initialize(p);assert.equal(p.data.get(OWN),saved);assert.deepEqual(p.writes,[]);
 }
 const p=preferences({[OWN]:42,'uc.hidecontext.reloadtab':true});initialize(p);assert.equal(p.data.get(OWN),42);assert.deepEqual(p.writes,[]);
});

test('later editor choices survive reinitialization after legacy preferences change or disappear',()=>{
 const p=preferences({'cmi-Switch-Icon-Package':2,'uc.hidecontext.reloadtab':true});initialize(p);
 let state=mergeInventory(parseState(p.data.get(OWN)),'tabContextMenu',[item('context_reloadTab')]);state=updateItem(state,'tabContextMenu','context_reloadTab',{hidden:false,name:'My reload'});state.options.iconPack='fluent';p.setStringPref(OWN,serializeState(state));
 const saved=p.data.get(OWN),writes=p.writes.length;p.data.set('cmi-Switch-Icon-Package',0);p.data.delete('uc.hidecontext.reloadtab');initialize(p);assert.equal(p.data.get(OWN),saved);assert.equal(p.writes.length,writes);
});

test('an editor save made while legacy values are being read wins the import race',()=>{
 const p=preferences({'uc.hidecontext.reloadtab':true}),get=p.getBoolPref;const chosen=createState();chosen.options.iconSize=24;const raw=serializeState(chosen);
 p.getBoolPref=(...args)=>{p.data.set(OWN,raw);return get(...args);};initialize(p);assert.equal(p.data.get(OWN),raw);assert.deepEqual(p.writes,[]);
});

test('late imported commands receive their real native kind once and explicit reenable stays enabled',()=>{
 const p=preferences({'uc.hidecontext.newcontainer':true});initialize(p);const initial=parseState(p.data.get(OWN));
 let state=mergeInventory(initial,'contentAreaContextMenu',[item('ordinary')]);assert.ok(state.roots.contentAreaContextMenu.legacyHiddenIds.includes('context-openlinkinusercontext-menu'));
 state=mergeInventory(state,'contentAreaContextMenu',[item('ordinary'),item('context-openlinkinusercontext-menu','native-menu')]);const root=state.roots.contentAreaContextMenu;
 assert.equal(root.records['context-openlinkinusercontext-menu'].hidden,true);assert.equal(root.records['context-openlinkinusercontext-menu'].kind,'native-menu');assert.equal(root.legacyHiddenIds?.includes('context-openlinkinusercontext-menu')??false,false);
 state=updateItem(state,'contentAreaContextMenu','context-openlinkinusercontext-menu',{hidden:false});state=mergeInventory(parseState(serializeState(state)),'contentAreaContextMenu',[item('ordinary'),item('context-openlinkinusercontext-menu','native-menu')]);assert.equal(state.roots.contentAreaContextMenu.records['context-openlinkinusercontext-menu'].hidden,false);
});

test('resetting an imported menu drops its pending legacy choices',()=>{
 const p=preferences({'uc.hidecontext.reloadtab':true});initialize(p);let state=resetRoot(parseState(p.data.get(OWN)),'tabContextMenu');state=mergeInventory(state,'tabContextMenu',[item('context_reloadTab')]);assert.equal(state.roots.tabContextMenu.records.context_reloadTab.hidden,false);
});

test('navigation hiding imports individual flattened buttons and keeps unrelated commands visible',()=>{
 const p=preferences({'uc.hidecontext.navigation':true});initialize(p);const state=mergeInventory(parseState(p.data.get(OWN)),'contentAreaContextMenu',['context-back','context-forward','context-reload','context-stop','context-bookmarkpage','context-copylink'].map(key=>item(key)));
 for(const id of ['context-back','context-forward','context-reload','context-stop','context-bookmarkpage'])assert.equal(state.roots.contentAreaContextMenu.records[id].hidden,true,id);assert.equal(state.roots.contentAreaContextMenu.records['context-copylink'].hidden,false);
});

test('invalid old values cannot create invalid appearance or import arbitrary folded selectors',()=>{
 const p=preferences({'cmi-Switch-Icon-Package':9,'cmi-menuseparator-opacity':'0.5;display:none','uc.hidecontext.inspect':'true','cmi-fold_menu_item-enable':true,'cmi-fold-item-IDs':'#context-copy, body { display:none }, context-paste'});initialize(p);const state=parseState(p.data.get(OWN)||'');assert.equal(state.options.iconPack,'fluent');assert.equal(state.options.separatorOpacity,0.5);assert.equal(state.roots.contentAreaContextMenu?.legacyHiddenIds?.includes('context-inspect')??false,false);assert.doesNotMatch(JSON.stringify(state),/body|display:none|#context-copy/);
});

test('icon disable choices and full separator strength import without being lost as falsy values',()=>{
 for(const source of [{'cmi-Switch-Icon-Package':0,'cmi-menuseparator-opacity':'0'},{'cmi-Switch-Icon-Package':2,'uc.hidecontext.icons':true,'cmi-menuseparator-opacity':'1'}]){
  const p=preferences(source);initialize(p);const state=parseState(p.data.get(OWN));assert.equal(state.options.showIcons,false);assert.equal(state.options.separatorOpacity,Number(source['cmi-menuseparator-opacity']));
 }
});

test('legacy pending IDs and per-menu availability values are validated before saving',()=>{
 for(const patch of [{legacyHiddenIds:['context-copy','context-copy']},{legacyHiddenIds:['__proto__']},{legacyHiddenIds:['#context-copy']},{legacyHiddenIds:'context-copy'},{hideUnavailable:'true'}]){
  const state=createState();state.roots.contentAreaContextMenu={children:[],records:{},...patch};assert.throws(()=>validateState(state),/legacy|menu|preference|unavailable/i);
 }
});

test('clean-link preference selects the usable action and restores native nodes on close',async()=>{
 const dom=makeDOM('<menupopup id="contentAreaContextMenu"><menuitem id="context-copylink" label="Copy link"></menuitem><menuitem id="context-stripOnShareLink" label="Copy clean link" disabled="false"></menuitem></menupopup>'),w=dom.window,root=w.document.getElementById('contentAreaContextMenu');
 const state=createState();state.options.preferCleanLinks=true;const ctl=createMenuController(w,{getState:()=>state}),copy=w.document.getElementById('context-copylink'),clean=w.document.getElementById('context-stripOnShareLink');
 const open=async()=>{root.dispatchEvent(new w.Event('popupshowing',{bubbles:true}));await wait();};const close=()=>root.dispatchEvent(new w.Event('popuphiding',{bubbles:true}));
 try{
  await open();assert.equal(copy.getAttribute('hidden'),'true');assert.notEqual(clean.getAttribute('hidden'),'true');close();assert.equal(copy.hasAttribute('hidden'),false);
  clean.setAttribute('disabled','true');await open();assert.notEqual(copy.getAttribute('hidden'),'true');assert.equal(clean.getAttribute('hidden'),'true');close();
  clean.setAttribute('disabled','false');clean.setAttribute('hidden','true');await open();assert.notEqual(copy.getAttribute('hidden'),'true');close();
 }finally{ctl.destroy();dom.window.close();}
});

test('controller honors late legacy records, per-menu disabled rows and reversible separator presentation',async()=>{
 const dom=makeDOM('<menupopup id="tabContextMenu"><menuitem id="context_reloadTab" label="Reload"></menuitem><menuseparator id="sep"></menuseparator><menuitem id="ordinary" label="Disabled" disabled="true"></menuitem></menupopup>'),w=dom.window,root=w.document.getElementById('tabContextMenu');
 const state=createState();state.options.showSeparators=false;state.roots.tabContextMenu={children:[],records:{},legacyHiddenIds:['context_reloadTab'],hideUnavailable:true};const ctl=createMenuController(w,{getState:()=>state});
 try{root.dispatchEvent(new w.Event('popupshowing',{bubbles:true}));await wait();assert.equal(w.document.getElementById('context_reloadTab').getAttribute('hidden'),'true');assert.equal(w.document.getElementById('ordinary').getAttribute('hidden'),'true');assert.equal(root.getAttribute('data-cme-separators'),'off');root.dispatchEvent(new w.Event('popuphiding',{bubbles:true}));assert.equal(root.hasAttribute('data-cme-separators'),false);assert.equal(w.document.getElementById('ordinary').hasAttribute('hidden'),false);assert.ok(state.roots.tabContextMenu.legacyHiddenIds.includes('context_reloadTab'),'Native presentation must not silently write durable state');}
 finally{ctl.destroy();dom.window.close();}
});

test('clean-link preference keeps ordinary copy accessible when a saved ancestor is hidden or removed',async()=>{
 for(const flags of [{hidden:true},{removed:true},{}]){
  const dom=makeDOM('<menupopup id="contentAreaContextMenu"><menuitem id="context-copylink" label="Copy link"></menuitem><menuitem id="context-stripOnShareLink" label="Copy clean link"></menuitem></menupopup>'),w=dom.window,root=w.document.getElementById('contentAreaContextMenu');
  const state=createState();state.options.preferCleanLinks=true;
  state.roots.contentAreaContextMenu={children:['context-copylink','custom-outer'],records:{'context-copylink':{kind:'command'},'context-stripOnShareLink':{kind:'command'},'custom-outer':{kind:'submenu',name:'Outer',children:['custom-inner'],...flags},'custom-inner':{kind:'submenu',name:'Inner',children:['context-stripOnShareLink']}}};
  for(const record of Object.values(state.roots.contentAreaContextMenu.records))Object.assign(record,{hidden:false,removed:false,showIcon:true,...record});
  validateState(state);const ctl=createMenuController(w,{getState:()=>state});
  try{root.dispatchEvent(new w.Event('popupshowing',{bubbles:true}));await wait();assert.equal(w.document.getElementById('context-copylink').getAttribute('hidden')==='true',!flags.hidden&&!flags.removed,JSON.stringify(flags));}
  finally{ctl.destroy();dom.window.close();}
 }
});
