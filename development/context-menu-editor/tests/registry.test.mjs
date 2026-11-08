import test from 'node:test';
import assert from 'node:assert/strict';
import {makeDOM} from './dom.mjs';
import {discoverRoot} from '../src/registry.mjs';
import {createState,mergeInventory,serializeState,updateItem} from '../src/model.mjs';
import {createSourceTracker} from '../src/sources.mjs';
import {createIconService} from '../src/icons.mjs';
import {createMenuController} from '../src/controller.mjs';

const nativeShareMarkup='<menu class="extra share-tab-url-item" data-l10n-id="tab-context-share-url" label="Share"><menupopup></menupopup></menu>';

test('the ID-less native Share submenu is inventoried, editable and decorated across localized openings',async()=>{
 const dom=makeDOM(`<menupopup id="tabContextMenu"><menuitem id="context_pinTab" label="Pin Tab"></menuitem>${nativeShareMarkup}<menuitem id="context_undoCloseTab" label="Reopen Closed Tab"></menuitem></menupopup>`);
 const root=dom.window.document.getElementById('tabContextMenu'),menu=root.querySelector('menu');
 const tracker=createSourceTracker(dom.window,{builtInIds:new Set(['context_pinTab','context_undoCloseTab'])});
 let controller;
 try{
  assert.equal(tracker.resolve(menu).kind,'unknown','source tracker alone has no static browser ID for this dynamic node');
  const scan=discoverRoot(root,{resolveSource:tracker.resolve}),item=scan.items.find(item=>scan.nodes.get(item.key)===menu);
  assert.ok(item,'the browser-created Share submenu must be included without inventing a DOM ID');
  assert.equal(item.nativeId,null);assert.equal(item.kind,'native-menu');assert.equal(item.locked,false);assert.equal(item.boundary,null);
  assert.deepEqual(item.source,{kind:'browser',name:'Zen Browser',via:'browser'});
  assert.equal(menu.hasAttribute('id'),false);
  menu.setAttribute('label','Teilen');
  assert.equal(discoverRoot(root,{resolveSource:tracker.resolve}).items.find(item=>item.l10nId==='tab-context-share-url').key,item.key);
  let state=mergeInventory(createState(),'tabContextMenu',scan.items);
  const icons=createIconService(dom.window);
  controller=createMenuController(dom.window,{getState:()=>state,resolveIcon:icons.resolve,resolveSource:tracker.resolve});
  root.dispatchEvent(new dom.window.Event('popupshowing',{bubbles:true}));
  await new Promise(resolve=>dom.window.setTimeout(resolve,0));
  assert.match(menu.querySelector('[data-cme-icon] img')?.getAttribute('src')||'',/\/share\.svg$/,'automatic artwork must work with a localized label');
  root.dispatchEvent(new dom.window.Event('popuphiding',{bubbles:true}));
  state=updateItem(state,'tabContextMenu',item.key,{name:'Sharing',icon:{kind:'text',text:'↗'}});
  root.dispatchEvent(new dom.window.Event('popupshowing',{bubbles:true}));
  await new Promise(resolve=>dom.window.setTimeout(resolve,0));
  assert.equal(menu.getAttribute('label'),'Sharing');assert.equal(menu.querySelector('[data-cme-icon]')?.textContent,'↗');
  root.dispatchEvent(new dom.window.Event('popuphiding',{bubbles:true}));
  assert.equal(menu.getAttribute('label'),'Teilen');assert.equal(menu.querySelector('[data-cme-icon]'),null);assert.equal(menu.parentElement,root);
 }finally{controller?.destroy();tracker.destroy();dom.window.close();}
});

test('native Share recognition excludes ambiguous or mismatched anonymous nodes',()=>{
 const fixtures=[
  ['duplicate native menus','tabContextMenu',nativeShareMarkup+nativeShareMarkup],
  ['other root','contentAreaContextMenu',nativeShareMarkup],
  ['other kind','tabContextMenu','<menuitem class="share-tab-url-item" data-l10n-id="tab-context-share-url" label="Share"></menuitem>'],
  ['other localization','tabContextMenu','<menu class="share-tab-url-item" data-l10n-id="menu-file-share-url" label="Share"><menupopup></menupopup></menu>'],
  ['other class','tabContextMenu','<menu class="other-share" data-l10n-id="tab-context-share-url" label="Share"><menupopup></menupopup></menu>'],
  ['transient row','tabContextMenu',nativeShareMarkup.replace('extra share-tab-url-item','spell-suggestion share-tab-url-item')],
  ['nested row','tabContextMenu',`<menu id="native-parent"><menupopup>${nativeShareMarkup}</menupopup></menu>`],
  ['identity collision','tabContextMenu',`<menuitem id="native:tab-context-share-url" label="Other action"></menuitem>${nativeShareMarkup}`],
 ];
 for(const [name,rootId,markup]of fixtures){
  const dom=makeDOM(`<menupopup id="${rootId}">${markup}</menupopup>`);
  try{assert.equal(discoverRoot(dom.window.document.getElementById(rootId)).items.some(item=>item.nativeId===null),false,name);}
  finally{dom.window.close();}
 }
});

test('a source-qualified anonymous mod retains its identity even with native Share attributes',()=>{
 const dom=makeDOM(`<menupopup id="tabContextMenu">${nativeShareMarkup}</menupopup>`),source={kind:'mod',id:'other-share-mod',name:'Other Share Mod',via:'creation'};
 try{
  const item=discoverRoot(dom.window.document.getElementById('tabContextMenu'),{resolveSource:()=>source}).items[0];
  assert.equal(item.identity,'mod-label');assert.match(item.key,/^mod:other-share-mod:/);assert.deepEqual(item.source,source);
 }finally{dom.window.close();}
});

test('unresolved foreign artwork cannot acquire native Share provenance',()=>{
 const dom=makeDOM(`<menupopup id="tabContextMenu">${nativeShareMarkup}</menupopup>`);
 try{
  const source={kind:'artwork',id:'other-share-mod',name:'Other Share Mod',via:'artwork'};
  assert.deepEqual(discoverRoot(dom.window.document.getElementById('tabContextMenu'),{resolveSource:()=>source}).items,[]);
 }finally{dom.window.close();}
});

test('source-qualified anonymous mod commands and submenus keep identities across recreation without merging duplicates',()=>{
 const dom=makeDOM('<menupopup id="tabContextMenu"><menuitem label="Reset URL"></menuitem><menu label="Zones"><menupopup><menuitem label="Upper zone"></menuitem></menupopup></menu><menuitem label="Duplicate"></menuitem><menuitem label="Duplicate"></menuitem></menupopup>');
 const root=dom.window.document.getElementById('tabContextMenu'),source={kind:'mod',id:'unfamiliar-mod',name:'Unfamiliar Mod',via:'creation'},options={resolveSource:()=>source};
 const first=discoverRoot(root,options);assert.equal(first.items.length,3);assert.equal(first.items[1].kind,'native-menu');assert.equal(first.items[2].boundary,first.items[1].key);
 const markup=root.innerHTML;root.replaceChildren();root.innerHTML=markup;
 assert.deepEqual(discoverRoot(root,options).items.map(item=>item.key),first.items.map(item=>item.key));
 assert.equal(first.items[0].nativeId,null);assert.equal(first.items[0].identity,'mod-label');dom.window.close();
});
test('owner artwork in CSS or a direct native image slot and CSS display eligibility are inventoried',()=>{
 const dom=makeDOM('<style>#css {list-style-image:url("https://example.invalid/icon.png");display:none}</style><menupopup id="contentAreaContextMenu"><menuitem id="css" label="CSS"></menuitem><menuitem id="slot" label="Slot"><img class="menu-icon" src="https://example.invalid/direct.png"></menuitem></menupopup>');
 const items=discoverRoot(dom.window.document.getElementById('contentAreaContextMenu')).items;
 assert.equal(items.find(item=>item.key==='css').iconURL,'https://example.invalid/icon.png');assert.equal(items.find(item=>item.key==='css').available,false);assert.equal(items.find(item=>item.key==='slot').iconURL,'https://example.invalid/direct.png');dom.window.close();
});
test('a direct image replacement is recognized before its previous decoded image finishes switching',()=>{
 const dom=makeDOM('<menupopup id="contentAreaContextMenu"><menuitem id="slot"><img class="menu-icon" src="https://example.invalid/new.png"></menuitem></menupopup>');
 const image=dom.window.document.querySelector('img');Object.defineProperty(image,'currentSrc',{value:'https://example.invalid/old.png'});
 assert.equal(discoverRoot(dom.window.document.getElementById('contentAreaContextMenu')).items[0].iconURL,'https://example.invalid/new.png');dom.window.close();
});

test('foreign submenus and their children expose live source metadata without saving it',()=>{
 const dom=makeDOM('<menupopup id="contentAreaContextMenu"><menu id="third-party-menu" label="Tools"><menupopup><menuitem id="third-party-command" label="Action"></menuitem></menupopup></menu></menupopup>');
 const origin={kind:'mod',id:'other-mod',name:'Other Mod',via:'handler'};
 const {items}=discoverRoot(dom.window.document.getElementById('contentAreaContextMenu'),{resolveSource:()=>origin});
 assert.equal(items[0].kind,'native-menu');assert.deepEqual(items[0].source,origin);assert.equal(items[1].source.name,'Other Mod');
 assert.equal(items[1].boundary,'third-party-menu');
 const raw=serializeState(mergeInventory(createState(),'contentAreaContextMenu',items));assert.equal(raw.includes('Other Mod'),false);assert.equal(raw.includes('source'),false);dom.window.close();
});

test('generic inventory keeps native boundaries and excludes unstable or duplicate identities',()=>{
 const dom=makeDOM('<menupopup id="contentAreaContextMenu"><menuitem id="new-mod" label="Unknown"></menuitem><menu id="native"><menupopup><menuitem id="nested"></menuitem></menupopup></menu><menuitem label="Selected text"></menuitem><menuitem id="duplicate"></menuitem><menuitem id="duplicate"></menuitem></menupopup>');
 const {items,nodes}=discoverRoot(dom.window.document.getElementById('contentAreaContextMenu'));
 assert.deepEqual(items.map(x=>x.key),['new-mod','native','nested']);
 assert.equal(items.find(x=>x.key==='nested').boundary,'native');
 assert.equal(nodes.get('new-mod').id,'new-mod'); dom.window.close();
});
test('anonymous separator rows have no persistent identity even between stable neighbors',()=>{
 const dom=makeDOM('<menupopup id="tabContextMenu"><menuitem id="a"></menuitem><menuseparator></menuseparator><menuitem id="b"></menuitem><menuseparator id="native-separator"></menuseparator></menupopup>');const root=dom.window.document.getElementById('tabContextMenu'),sep=root.children[1];assert.deepEqual(discoverRoot(root).items.map(i=>i.key),['a','b','native-separator']);const extra=dom.window.document.createElement('menuitem');extra.id='new';root.insertBefore(extra,sep);assert.equal(discoverRoot(root).items.some(i=>i.kind==='separator'&&!i.nativeId),false);assert.equal(sep.parentElement,root);dom.window.close();
});test('navigation inherits group availability while AI adjacency and unknown groups are restricted',()=>{
 const dom=makeDOM('<menupopup id="contentAreaContextMenu"><menugroup id="context-navigation" hidden="true"><menuitem id="context-back"></menuitem></menugroup><menu id="context-ask-chat"><menupopup></menupopup></menu><menuseparator id="ai-separator"></menuseparator><menugroup id="foreign-group"><menuitem id="foreign-child"></menuitem></menugroup></menupopup>');
 const items=discoverRoot(dom.window.document.getElementById('contentAreaContextMenu')).items;
 assert.equal(items.find(x=>x.key==='context-back').available,false);
 assert.equal(items.find(x=>x.key==='context-back').locked,false);
 assert.equal(items.find(x=>x.key==='context-ask-chat').locked,true);
 assert.equal(items.find(x=>x.key==='ai-separator').locked,true);
 assert.equal(items.find(x=>x.key==='foreign-child').locked,true);dom.window.close();
});

test('explicit false hidden attributes mean available and numeric generated extension rows stay transient',()=>{
 const dom=makeDOM('<menupopup id="contentAreaContextMenu"><menugroup id="context-navigation" hidden="false"><menuitem id="context-back" hidden="false"></menuitem></menugroup><menuitem id="webext-context-menu-example-addon-41" label="Temporary"></menuitem></menupopup>');
 const items=discoverRoot(dom.window.document.getElementById('contentAreaContextMenu')).items;assert.equal(items[0].available,true);assert.equal(items.some(i=>i.nativeId==='webext-context-menu-example-addon-41'),false);dom.window.close();
});
test('extension numeric menuitem IDs have no invented durability and localization metadata stays live',()=>{
 const dom=makeDOM('<menupopup id="contentAreaContextMenu"><menuitem id="addon_example-menuitem-123"></menuitem><menuitem id="addon_example-menuitem-copy" data-l10n-id="main-context-menu-copy"></menuitem></menupopup>');const items=discoverRoot(dom.window.document.getElementById('contentAreaContextMenu')).items;assert.deepEqual(items.map(i=>i.key),['addon_example-menuitem-copy']);assert.equal(items[0].l10nId,'main-context-menu-copy');dom.window.close();
});
test('installed Zen AI pair identity protects next-sibling dependency without locking independent summarize',()=>{
 const dom=makeDOM('<menupopup id="tabContextMenu"><menu id="context_askChat"><menupopup></menupopup></menu><menuseparator id="context_aiSeparator"></menuseparator><menuitem id="context_askChatSummarize"></menuitem></menupopup>');const items=discoverRoot(dom.window.document.getElementById('tabContextMenu')).items;assert.equal(items.find(i=>i.key==='context_askChat').locked,true);assert.equal(items.find(i=>i.key==='context_aiSeparator').locked,true);assert.equal(items.find(i=>i.key==='context_askChatSummarize').locked,false);dom.window.close();
});

