import test from 'node:test';
import assert from 'node:assert/strict';
import {makeDOM} from './dom.mjs';
import {createMenuController} from '../src/controller.mjs';
import {createIconService} from '../src/icons.mjs';
import {createState} from '../src/model.mjs';
import {DECORATED_MENUS,DOWNLOAD_STACK,decoratedMenuKey,decoratedRow} from '../src/decorated-menus.mjs';

const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const BASE='https://preview.invalid/mod/';
const FLUENT=id=>`${BASE}assets/packs/fluent/${id}.svg`;

// Trimmed from Zen 1.24.1b omni.ja: toolkit editMenuOverlay.js plus the rows the
// address bar adds (UrlbarInputBase.mjs) and one site search engine row.
const TEXTBOX='<menupopup id="textbox-contextmenu" class="textbox-contextmenu">'+
 '<menuitem id="edit-contextmenu-undo" data-l10n-id="text-action-undo" command="cmd_undo"></menuitem>'+
 '<menuitem id="edit-contextmenu-redo" data-l10n-id="text-action-redo" command="cmd_redo"></menuitem><menuseparator></menuseparator>'+
 '<menuitem id="edit-contextmenu-cut" data-l10n-id="text-action-cut"></menuitem>'+
 '<menuitem id="edit-contextmenu-copy" data-l10n-id="text-action-copy"></menuitem>'+
 '<menuitem id="strip-on-share" anonid="strip-on-share" data-l10n-id="text-action-copy-clean-link"></menuitem>'+
 '<menuitem id="edit-contextmenu-paste" data-l10n-id="text-action-paste"></menuitem>'+
 '<menuitem id="paste-and-go" anonid="paste-and-go" label="Paste &amp; Go"></menuitem>'+
 '<menuitem id="edit-contextmenu-delete" data-l10n-id="text-action-delete"></menuitem>'+
 '<menuitem id="edit-contextmenu-select-all" data-l10n-id="text-action-select-all"></menuitem>'+
 '<menuitem id="edit-contextmenu-reveal-password" data-l10n-id="text-action-reveal-password" type="checkbox"></menuitem>'+
 '<menuseparator anonid="urlbar-input-autofill-dismiss-separator"></menuseparator>'+
 '<menuitem anonid="urlbar-input-dismiss-autofill" data-l10n-id="urlbar-input-dismiss-autofill"></menuitem>'+
 '<menuitem anonid="urlbar-input-remove-from-history" data-l10n-id="urlbar-input-remove-from-history"></menuitem>'+
 '<menuseparator anonid="add-engine-separator" class="menuseparator-add-engine"></menuseparator>'+
 '<menuitem class="menuitem-iconic context-menu-add-engine" label="Add “Example”" image="https://example.invalid/favicon.ico"></menuitem>'+
 '</menupopup>';
// Trimmed from browser.xhtml (downloadsContextMenu).
const DOWNLOADS='<menupopup id="downloadsContextMenu" class="download-state">'+
 '<menuitem command="downloadsCmd_pauseResume" class="downloadPauseMenuItem" data-l10n-id="downloads-cmd-pause"></menuitem>'+
 '<menuitem command="downloadsCmd_pauseResume" class="downloadResumeMenuItem" data-l10n-id="downloads-cmd-resume"></menuitem>'+
 '<menuitem command="downloadsCmd_unblock" class="downloadUnblockMenuItem" data-l10n-id="downloads-cmd-unblock"></menuitem>'+
 '<menuitem command="downloadsCmd_openInSystemViewer" class="downloadUseSystemDefaultMenuItem" data-l10n-id="downloads-cmd-use-system-default"></menuitem>'+
 '<menuitem command="downloadsCmd_alwaysOpenInSystemViewer" type="checkbox" class="downloadAlwaysUseSystemDefaultMenuItem" data-l10n-id="downloads-cmd-always-use-system-default"></menuitem>'+
 '<menuitem command="downloadsCmd_alwaysOpenSimilarFiles" type="checkbox" class="downloadAlwaysOpenSimilarFilesMenuItem" data-l10n-id="downloads-cmd-always-open-similar-files"></menuitem>'+
 '<menuitem command="downloadsCmd_show" class="downloadShowMenuItem" data-l10n-id="downloads-cmd-show-menuitem-2"></menuitem>'+
 '<menuseparator class="downloadCommandsSeparator"></menuseparator>'+
 '<menuitem command="downloadsCmd_openReferrer" class="downloadOpenReferrerMenuItem" data-l10n-id="downloads-cmd-go-to-download-page"></menuitem>'+
 '<menuitem command="downloadsCmd_copyLocation" class="downloadCopyLocationMenuItem" data-l10n-id="downloads-cmd-copy-download-link"></menuitem>'+
 '<menuseparator class="downloadLinksSeparator"></menuseparator>'+
 '<menuitem command="downloadsCmd_deleteFile" class="downloadDeleteFileMenuItem" data-l10n-id="downloads-cmd-delete-file"></menuitem>'+
 '<menuitem command="cmd_delete" class="downloadRemoveFromHistoryMenuItem" data-l10n-id="downloads-cmd-remove-from-history"></menuitem>'+
 '<menuitem command="downloadsCmd_clearList" data-l10n-id="downloads-cmd-clear-list"></menuitem>'+
 '<menuitem command="downloadsCmd_clearDownloads" hidden="true" data-l10n-id="downloads-cmd-clear-downloads"></menuitem>'+
 '</menupopup>';

// Trimmed from Zen 1.24.1b omni.ja moz-src/zen/library (the sections' menus have no ID).
const LIBRARY_DOWNLOADS='<menupopup class="zen-library-downloads-menu">'+
 '<menuitem data-action="open" data-l10n-id="library-downloads-menu-open"></menuitem><menuitem data-action="show" data-l10n-id="downloads-cmd-show-menuitem-2"></menuitem><menuseparator></menuseparator>'+
 '<menuitem data-action="copy" data-l10n-id="library-downloads-menu-copy"></menuitem><menuitem data-action="copy-link" data-l10n-id="downloads-cmd-copy-download-link"></menuitem><menuseparator></menuseparator>'+
 '<menuitem data-action="unblock" data-l10n-id="downloads-cmd-unblock"></menuitem><menuitem data-action="hide" data-l10n-id="library-downloads-menu-hide"></menuitem>'+
 '<menuitem data-action="delete" data-l10n-id="library-downloads-menu-delete"></menuitem></menupopup>';
const LIBRARY_HISTORY='<menupopup class="zen-library-history-menu"><menuitem data-action="open" data-l10n-id="library-history-menu-open"></menuitem><menuseparator></menuseparator>'+
 '<menuitem data-action="forget" data-l10n-id="library-history-menu-forget"></menuitem><menuitem data-action="forget-site" data-l10n-id="places-forget-domain-data"></menuitem></menupopup>';
const LIBRARY_BOOSTS='<menupopup class="zen-library-boosts-menu"><menuitem data-action="edit" data-l10n-id="library-boosts-menu-edit"></menuitem>'+
 '<menuitem data-action="export" data-l10n-id="zen-boost-save"></menuitem><menuseparator></menuseparator><menuitem data-action="delete" data-l10n-id="zen-boost-edit-delete"></menuitem></menupopup>';
const LIBRARY_MEDIA='<menupopup class="zen-library-media-menu"><menuitem data-action="open" data-l10n-id="library-media-menu-open"></menuitem>'+
 '<menuitem data-action="show" data-l10n-id="downloads-cmd-show-menuitem-2"></menuitem><menuseparator></menuseparator><menuitem data-action="copy" data-l10n-id="library-media-menu-copy"></menuitem></menupopup>';
// ZenLibraryWidget builds this bare popup in #mainPopupSet for each opening (a finished download).
const STACK='<menupopup><menuitem data-l10n-id="library-downloads-menu-retry"></menuitem><menuitem data-l10n-id="downloads-cmd-show-menuitem-2"></menuitem>'+
 '<menuitem data-l10n-id="downloads-cmd-go-to-download-page"></menuitem><menuitem data-l10n-id="downloads-cmd-copy-download-link"></menuitem><menuseparator></menuseparator>'+
 '<menuitem data-l10n-id="downloads-cmd-delete-file"></menuitem><menuitem data-l10n-id="downloads-cmd-remove-from-history"></menuitem>'+
 '<menuitem data-l10n-id="library-downloads-menu-clear-preview"></menuitem></menupopup>';

function open(t,html,{options={},resolveSource,classifyPopup,isNativeRow,set='set'}={}){
 const dom=makeDOM(`<!doctype html><html><body><div id="${set}">${html}</div></body></html>`),w=dom.window,doc=w.document;
 const icons=createIconService(w,{baseURL:BASE});
 let state=createState();state={...state,options:{...state.options,...options}};
 const controller=createMenuController(w,{getState:()=>state,resolveIcon:(...args)=>icons.resolve(...args),
  ...resolveSource?{resolveSource}:{},...classifyPopup?{classifyPopup}:{},...isNativeRow?{isNativeRow}:{}});
 t.after(()=>{controller.destroy();dom.window.close();});
 const popup=doc.querySelector(`#${set} > menupopup`);
 const src=node=>node.querySelector(':scope > .cme-decoration img')?.getAttribute('src')||null;
 const rows=()=>[...popup.children].filter(node=>node.localName==='menuitem');
 return {w,doc,popup,controller,src,rows,icons,
  async show(target=popup){target.dispatchEvent(new w.Event('popupshowing',{bubbles:true,cancelable:true}));await tick();},
  hide(target=popup,type='popuphiding'){target.dispatchEvent(new w.Event(type,{bubbles:true}));}};
}
const untouched=popup=>popup.querySelector('.cme-decoration,[data-cme-item],[data-cme-icons]')===null&&!popup.hasAttribute('data-cme-decorated')&&!popup.hasAttribute('style');

test('every listed row has an exact glyph in both packs (the Zen pack has no hide glyph)',()=>{
 const dom=makeDOM(),icons=createIconService(dom.window,{baseURL:BASE});
 for(const [menu,rows]of DECORATED_MENUS)for(const row of rows){
  for(const iconPack of ['fluent','zen']){
   const descriptor={kind:'command',nativeId:row.id||null,l10nId:row.l10nId||null,label:'Localized'};
   if(row.id==='context_MovePictureInPictureToggle'){
    // The Move row's glyph follows the side its localized label names.
    for(const [l10nId,glyph]of [['picture-in-picture-move-toggle-left','arrow-left'],['picture-in-picture-move-toggle-right','arrow-right']]){
     const icon=icons.resolve({...descriptor,l10nId},{},{iconPack});
     assert.equal(icon.source,'builtin');assert.equal(icon.src,icons.catalog().find(entry=>entry.pack===iconPack&&entry.id===glyph).src);
    }
    continue;
   }
   const icon=icons.resolve(descriptor,{},{iconPack});
   if(iconPack==='zen'&&(row.id==='context_HidePictureInPictureToggle'||row.l10nId==='library-downloads-menu-hide')){assert.notEqual(icon.source,'builtin');continue;}
   assert.equal(icon?.source,'builtin',`${menu} ${row.id||row.l10nId} ${iconPack}`);
  }
 }
 dom.window.close();
});

test('the address bar and text field menu gets exact glyphs and is restored on close',async t=>{
 const m=await open(t,TEXTBOX);await m.show();
 const byId=id=>m.doc.getElementById(id),anon=id=>m.popup.querySelector(`[anonid="${id}"]`);
 const expected={'edit-contextmenu-undo':'edit-undo','edit-contextmenu-redo':'edit-redo','edit-contextmenu-cut':'edit-cut',
  'edit-contextmenu-copy':'edit-copy','strip-on-share':'link','edit-contextmenu-paste':'edit-paste','paste-and-go':'paste-and-go',
  'edit-contextmenu-delete':'edit-delete','edit-contextmenu-select-all':'edit-select-all'};
 for(const [id,glyph]of Object.entries(expected))assert.equal(m.src(byId(id)),FLUENT(glyph),id);
 assert.equal(m.src(anon('urlbar-input-dismiss-autofill')),FLUENT('close'));
 assert.equal(m.src(anon('urlbar-input-remove-from-history')),FLUENT('forget'));
 // Skip rules: a check row keeps its native state slot; a site's search engine keeps its own artwork.
 assert.equal(byId('edit-contextmenu-reveal-password').querySelector('.cme-decoration'),null);
 assert.equal(byId('edit-contextmenu-reveal-password').hasAttribute('data-cme-item'),false);
 const engine=m.popup.querySelector('.context-menu-add-engine');
 assert.equal(engine.querySelector('.cme-decoration'),null);assert.equal(engine.hasAttribute('data-cme-item'),false);
 assert.equal(m.popup.getAttribute('data-cme-decorated'),'textbox-contextmenu');
 assert.equal(m.popup.hasAttribute('data-cme-root'),false,'not an editor-managed menu');
 assert.equal(m.popup.style.getPropertyValue('--cme-icon-size'),'16px');
 assert.equal(m.controller.getInventory().some(menu=>menu.id==='textbox-contextmenu'),false,'no settings entry');
 m.hide();
 assert.ok(untouched(m.popup));
 // The next opening decorates again, once.
 await m.show();
 assert.equal(m.popup.querySelectorAll('.cme-decoration').length,11);
 m.hide();assert.ok(untouched(m.popup));
});

test('download rows match by exact class and localization ID; check rows stay bare',async t=>{
 const m=await open(t,DOWNLOADS);
 const stranger=m.doc.createElement('menuitem');stranger.className='downloadPauseMenuItem';stranger.setAttribute('data-l10n-id','downloads-cmd-something-else');
 const noClass=m.doc.createElement('menuitem');noClass.setAttribute('data-l10n-id','downloads-cmd-pause');
 const wrongCommand=m.doc.createElement('menuitem');wrongCommand.setAttribute('command','someone_else');wrongCommand.setAttribute('data-l10n-id','downloads-cmd-clear-list');
 m.popup.append(stranger,noClass,wrongCommand);
 await m.show();
 const glyph=selector=>m.src(m.popup.querySelector(selector));
 assert.equal(glyph('.downloadPauseMenuItem'),FLUENT('media-pause'));
 assert.equal(glyph('.downloadResumeMenuItem'),FLUENT('media-play'));
 assert.equal(glyph('.downloadUnblockMenuItem'),FLUENT('checkmark'));
 assert.equal(glyph('.downloadUseSystemDefaultMenuItem'),FLUENT('open'));
 assert.equal(glyph('.downloadShowMenuItem'),FLUENT('folder-open'));
 assert.equal(glyph('.downloadOpenReferrerMenuItem'),FLUENT('ext-link'));
 assert.equal(glyph('.downloadCopyLocationMenuItem'),FLUENT('link'));
 assert.equal(glyph('.downloadDeleteFileMenuItem'),FLUENT('edit-delete'));
 assert.equal(glyph('.downloadRemoveFromHistoryMenuItem'),FLUENT('forget'));
 assert.equal(glyph('[command="downloadsCmd_clearList"]'),FLUENT('close-all'));
 assert.equal(glyph('[command="downloadsCmd_clearDownloads"]'),FLUENT('close-all'),'hidden rows are ready when the owner shows them');
 for(const node of [...m.popup.querySelectorAll('[type="checkbox"]'),stranger,noClass,wrongCommand]){
  assert.equal(node.querySelector('.cme-decoration'),null,node.className||node.getAttribute('data-l10n-id'));
 }
 m.hide();assert.ok(untouched(m.popup));
});

test('the Zen pack, icon size and the icon switch are respected',async t=>{
 const zen=await open(t,DOWNLOADS,{options:{iconPack:'zen',iconSize:20,iconGap:6}});await zen.show();
 assert.equal(zen.src(zen.popup.querySelector('.downloadShowMenuItem')),'chrome://browser/skin/zen-icons/folder.svg');
 assert.equal(zen.src(zen.popup.querySelector('.downloadPauseMenuItem')),'chrome://browser/skin/zen-icons/media-pause.svg');
 assert.equal(zen.popup.style.getPropertyValue('--cme-icon-size'),'20px');
 assert.equal(zen.popup.style.getPropertyValue('--cme-icon-gap'),'6px');
 zen.hide();assert.ok(untouched(zen.popup));
 for(const options of [{showIcons:false},{enabled:false}]){
  const off=await open(t,DOWNLOADS,{options});await off.show();
  assert.ok(untouched(off.popup),JSON.stringify(options));
 }
});

test('native artwork, mod rows and editor-owned rows are never overwritten',async t=>{
 const isMod=node=>node.getAttribute?.('data-test-mod')==='true';
 // A mod that only listens on a browser row does not make the menu editor-managed (B6).
 const m=await open(t,TEXTBOX,{classifyPopup:()=>'native',isNativeRow:()=>true,
  resolveSource:node=>isMod(node)?{kind:'mod',id:'some-mod',name:'Some mod'}:null});
 const copy=m.doc.getElementById('edit-contextmenu-copy');copy.setAttribute('image','chrome://global/skin/icons/edit-copy.svg');
 m.doc.getElementById('edit-contextmenu-cut').setAttribute('data-test-mod','true');
 m.doc.getElementById('edit-contextmenu-paste').setAttribute('data-cme-owned','true');
 await m.show();
 assert.equal(copy.querySelector('.cme-decoration'),null);assert.equal(copy.getAttribute('image'),'chrome://global/skin/icons/edit-copy.svg');
 assert.equal(m.doc.getElementById('edit-contextmenu-cut').querySelector('.cme-decoration'),null);
 assert.equal(m.doc.getElementById('edit-contextmenu-paste').querySelector('.cme-decoration'),null);
 assert.equal(m.src(m.doc.getElementById('edit-contextmenu-undo')),FLUENT('edit-undo'));
 m.hide();
 assert.equal(copy.getAttribute('image'),'chrome://global/skin/icons/edit-copy.svg');
});

test('only the listed top-level menus are decorated',async t=>{
 // The same row IDs in another menu, or the listed ID on a nested submenu, stay plain.
 const m=await open(t,'<menupopup id="someone-elses-menu"><menuitem id="edit-contextmenu-copy" data-l10n-id="text-action-copy"></menuitem>'+
  '<menu id="nest"><menupopup id="textbox-contextmenu"><menuitem id="edit-contextmenu-undo" data-l10n-id="text-action-undo"></menuitem></menupopup></menu></menupopup>');
 await m.show();await m.show(m.doc.querySelector('#nest > menupopup'));
 assert.equal(m.doc.querySelector('.cme-decoration,[data-cme-decorated]'),null);
 assert.equal(decoratedRow('someone-elses-menu',m.doc.getElementById('edit-contextmenu-copy')),null);
});

test('a superseded popuphidden while the menu is open keeps the icons; destroy removes them',async t=>{
 const m=await open(t,TEXTBOX);await m.show();
 Object.defineProperty(m.popup,'state',{value:'open',configurable:true});
 m.hide(m.popup,'popuphidden');
 assert.equal(m.src(m.doc.getElementById('edit-contextmenu-copy')),FLUENT('edit-copy'));
 m.controller.destroy();
 assert.ok(untouched(m.popup));
});

test('a closed menu before its decoration runs stays plain',async t=>{
 const m=await open(t,TEXTBOX);
 m.popup.dispatchEvent(new m.w.Event('popupshowing',{bubbles:true}));m.hide();await tick();
 assert.ok(untouched(m.popup));
});

test('a menu that a mod made editor-managed is decorated once, by the managed overlay',async t=>{
 const m=await open(t,DOWNLOADS+'',{classifyPopup:()=>'native',isNativeRow:id=>id!=='mod-row',
  resolveSource:node=>node.id==='mod-row'?{kind:'mod',id:'some-mod',name:'Some mod'}:null});
 const mod=m.doc.createElement('menuitem');mod.id='mod-row';mod.setAttribute('label','Mod action');m.popup.append(mod);
 await m.show();await tick();
 assert.equal(m.popup.getAttribute('data-cme-root'),'downloadsContextMenu');
 assert.equal(m.popup.hasAttribute('data-cme-decorated'),false);
 for(const row of m.rows())assert.ok(row.querySelectorAll(':scope > .cme-decoration').length<=1,row.className||row.id);
 m.hide();
});

test('Zen Library menus match by exact class, action and localization ID',async t=>{
 const expected=[
  [LIBRARY_DOWNLOADS,{open:'ext-link',show:'folder-open',copy:'edit-copy','copy-link':'link',unblock:'checkmark',hide:'hide',delete:'edit-delete'}],
  [LIBRARY_HISTORY,{open:'ext-link',forget:'edit-delete','forget-site':'forget'}],
  [LIBRARY_BOOSTS,{edit:'edit',export:'share',delete:'edit-delete'}],
  [LIBRARY_MEDIA,{open:'ext-link',show:'folder-open',copy:'edit-copy'}],
 ];
 for(const [html,glyphs]of expected){
  const m=await open(t,html,{set:'mainPopupSet'});
  // Another action with a listed localization ID stays plain.
  const stranger=m.doc.createElement('menuitem');stranger.setAttribute('data-action','someone-else');stranger.setAttribute('data-l10n-id',m.rows()[0].getAttribute('data-l10n-id'));
  m.popup.append(stranger);
  await m.show();
  const key='.'+m.popup.className;
  assert.equal(m.popup.getAttribute('data-cme-decorated'),key);
  for(const [action,glyph]of Object.entries(glyphs))assert.equal(m.src(m.popup.querySelector(`[data-action="${action}"]`)),FLUENT(glyph),key+' '+action);
  assert.equal(stranger.querySelector('.cme-decoration'),null);
  m.hide();assert.ok(untouched(m.popup),key);
 }
 // The Zen pack has no hide glyph: that row stays bare rather than get a placeholder.
 const zen=await open(t,LIBRARY_DOWNLOADS,{set:'mainPopupSet',options:{iconPack:'zen'}});await zen.show();
 assert.equal(zen.popup.querySelector('[data-action="hide"] > .cme-decoration'),null);
 assert.equal(zen.src(zen.popup.querySelector('[data-action="show"]')),'chrome://browser/skin/zen-icons/folder.svg');
 zen.hide();assert.ok(untouched(zen.popup));
});

test('the library button download stack: only a bare popup in mainPopupSet with bare rows',async t=>{
 const m=await open(t,STACK,{set:'mainPopupSet'});
 const marked=m.doc.createElement('menuitem');marked.className='someone-else';marked.setAttribute('data-l10n-id','downloads-cmd-delete-file');m.popup.append(marked);
 await m.show();
 assert.equal(m.popup.getAttribute('data-cme-decorated'),DOWNLOAD_STACK);
 const glyphs=['reload','folder-open','ext-link','link','edit-delete','forget','close'];
 assert.deepEqual(m.rows().slice(0,7).map(m.src),glyphs.map(FLUENT));
 assert.equal(marked.querySelector('.cme-decoration'),null,'a row with another owner marker stays plain');
 m.hide();assert.ok(untouched(m.popup));
 // The same bare popup anywhere else, or one with a class, is not the stack's menu.
 const elsewhere=await open(t,STACK);await elsewhere.show();assert.ok(untouched(elsewhere.popup));
 const classed=await open(t,STACK.replace('<menupopup>','<menupopup class="some-mod-menu">'),{set:'mainPopupSet'});await classed.show();assert.ok(untouched(classed.popup));
});

test('menu keys: ID first, then exact class, then the bare stack popup',()=>{
 const dom=makeDOM('<!doctype html><html><body><div id="mainPopupSet"></div><div id="other"></div></body></html>'),doc=dom.window.document;
 const popup=(attrs={},parent='mainPopupSet')=>{const node=doc.createElement('menupopup');for(const [k,v]of Object.entries(attrs))node.setAttribute(k,v);doc.getElementById(parent).append(node);return node;};
 assert.equal(decoratedMenuKey(popup({id:'textbox-contextmenu'})),'textbox-contextmenu');
 assert.equal(decoratedMenuKey(popup({id:'unlisted-menu'})),null);
 assert.equal(decoratedMenuKey(popup({id:DOWNLOAD_STACK})),null,'the stack key is never an ID');
 assert.equal(decoratedMenuKey(popup({id:'.zen-library-downloads-menu'})),null);
 assert.equal(decoratedMenuKey(popup({class:'zen-library-history-menu'})),'.zen-library-history-menu');
 assert.equal(decoratedMenuKey(popup({id:'x',class:'zen-library-history-menu'})),null,'an ID wins over the class');
 assert.equal(decoratedMenuKey(popup()),DOWNLOAD_STACK);
 assert.equal(decoratedMenuKey(popup({},'other')),null);
 assert.equal(decoratedMenuKey(popup({class:''})),null);
 assert.equal(decoratedMenuKey(doc.createElement('menu')),null);
 dom.window.close();
});
