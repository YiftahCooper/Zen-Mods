import test from 'node:test';
import assert from 'node:assert/strict';
import {makeDOM} from './dom.mjs';
import {createMenuController} from '../src/controller.mjs';
import {createIconService} from '../src/icons.mjs';
import {createState} from '../src/model.mjs';

const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const BASE='https://preview.invalid/mod/';

function open(t,html,options={}){
 const dom=makeDOM(html),w=dom.window,root=w.document.querySelector('menupopup[id]');
 const icons=createIconService(w,{baseURL:BASE});
 let state=createState();state={...state,options:{...state.options,...options}};
 const controller=createMenuController(w,{getState:()=>state,resolveIcon:(...args)=>icons.resolve(...args)});
 t.after(()=>{controller.destroy();dom.window.close();});
 root.dispatchEvent(new w.Event('popupshowing',{bubbles:true}));
 const src=id=>w.document.getElementById(id).querySelector(':scope > .cme-decoration img')?.getAttribute('src')||null;
 return tick().then(()=>({w,root,controller,src,close(){root.dispatchEvent(new w.Event('popuphiding',{bubbles:true}));}}));
}

test('the toolbar menu is decorated as a built-in menu and restored on close',async t=>{
 const m=await open(t,'<menupopup id="toolbar-context-menu">'+
  '<menuitem id="zen-context-menu-new-folder-toolbar" label="New Folder"></menuitem>'+
  '<menu id="zen-panel-ui-live-folder-create" label="Live Folder"><menupopup>'+
  '<menuitem data-l10n-id="zen-live-folder-type-rss" image="chrome://browser/skin/zen-icons/selectable/logo-rss.svg" label="RSS Feed"></menuitem></menupopup></menu>'+
  '<menuitem id="zen-toolbar-context-tabs-right" type="checkbox" label="Tabs on the right"></menuitem>'+
  '<menuitem id="toolbar-context-customize" label="Customize Toolbar…"></menuitem></menupopup>',{iconPack:'zen'});
 assert.equal(m.root.getAttribute('data-cme-root'),'toolbar-context-menu');
 assert.equal(m.src('zen-context-menu-new-folder-toolbar'),'chrome://browser/skin/zen-icons/folder.svg');
 assert.equal(m.src('zen-panel-ui-live-folder-create'),'chrome://browser/skin/zen-icons/folder.svg');
 assert.equal(m.src('zen-toolbar-context-tabs-right'),'chrome://browser/skin/zen-icons/sidebar-right.svg');
 assert.equal(m.src('toolbar-context-customize'),'chrome://browser/skin/zen-icons/customize.svg');
 // An ID-less row with its own artwork and no exact mapping keeps its own icon.
 const rss=m.root.querySelector('[data-l10n-id="zen-live-folder-type-rss"]');
 assert.equal(rss.hasAttribute('data-cme-item'),false);assert.equal(rss.querySelector('.cme-decoration'),null);
 m.close();
 assert.equal(m.root.querySelector('.cme-decoration,[data-cme-item]'),null);
 assert.equal(m.root.hasAttribute('data-cme-root'),false);
});

test('check and radio rows get real glyphs but no generic placeholder beside their state',async t=>{
 const m=await open(t,'<menupopup id="contentAreaContextMenu">'+
  '<menuitem id="context-reveal-password" type="checkbox" label="Reveal Password"></menuitem>'+
  '<menuitem id="cme-test-unknown-check" type="checkbox" label="Zzz qwerty"></menuitem>'+
  '<menuitem id="context-media-playbackrate-150x" type="radio" label="1.5×"></menuitem>'+
  '<menuitem id="cme-test-unknown-command" label="Zzz qwerty"></menuitem></menupopup>');
 assert.equal(m.src('context-reveal-password'),`${BASE}assets/packs/fluent/passwords.svg`);
 assert.equal(m.src('cme-test-unknown-check'),null);
 assert.equal(m.src('context-media-playbackrate-150x'),null);
 for(const id of ['cme-test-unknown-check','context-media-playbackrate-150x'])assert.equal(m.w.document.getElementById(id).getAttribute('data-cme-icons'),'on');
 // A plain command still gets the generic placeholder so the icon column stays aligned.
 assert.equal(m.src('cme-test-unknown-command'),`${BASE}assets/packs/fluent/info.svg`);
 m.close();
});
