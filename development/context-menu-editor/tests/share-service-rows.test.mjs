import test from 'node:test';
import assert from 'node:assert/strict';
import {makeDOM} from './dom.mjs';
import {createMenuController} from '../src/controller.mjs';
import {createIconService} from '../src/icons.mjs';
import {createState} from '../src/model.mjs';

const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const BASE='https://preview.invalid/mod/';
// Gecko 159 SharingUtils rows: no ID, no menuitem-iconic, no image (bug 2009747).
const ROWS=[['share-copy-link','menu-share-copy-links','Copy Link'],['share-qrcode-item','menu-file-share-qrcode3','Create QR Code'],
 ['share-windows-item','menu-share-windows','More Options']];

function fixture(t,options={}){
 const dom=makeDOM('<menupopup id="tabContextMenu"><menuitem id="context_reloadTab" label="Reload"></menuitem>'+
  '<menu id="context_moveTabOptions" label="Move"><menupopup></menupopup></menu>'+
  '<menu class="share-tab-url-item" data-l10n-id="tab-context-share-url" label="Share"><menupopup></menupopup></menu></menupopup>');
 const w=dom.window,doc=w.document,root=doc.getElementById('tabContextMenu'),share=root.querySelector('.share-tab-url-item'),popup=share.querySelector('menupopup');
 const icons=createIconService(w,{baseURL:BASE});
 let state=createState();state={...state,options:{...state.options,...options}};
 const controller=createMenuController(w,{getState:()=>state,resolveIcon:(...args)=>icons.resolve(...args)});
 // SharingUtils.populateSharePopup: drop the previous rows and rebuild them.
 const populate=()=>{
  popup.replaceChildren();
  for(const [className,l10n,label]of ROWS){
   const item=doc.createXULElement('menuitem');item.classList.add(className);item.setAttribute('data-l10n-id',l10n);item.setAttribute('label',label);
   popup.append(item);
   if(className==='share-qrcode-item')popup.append(doc.createXULElement('menuseparator'));
  }
 };
 const original=[...root.children];
 t.after(()=>{controller.destroy();dom.window.close();});
 return {w,root,share,popup,original,controller,populate,set state(value){state=value;},get state(){return state;},
  show(){root.dispatchEvent(new w.Event('popupshowing',{bubbles:true}));return tick();},
  close(){root.dispatchEvent(new w.Event('popuphiding',{bubbles:true}));},
  icons(){return [...popup.children].map(row=>row.querySelector(':scope > .cme-decoration > img')?.getAttribute('src')||null);}};
}

test('Share service rows rebuilt while the tab menu is open get their mapped icons without a reconcile',async t=>{
 const f=fixture(t);f.populate();await f.show();
 assert.deepEqual(f.icons(),[`${BASE}assets/packs/fluent/link.svg`,`${BASE}assets/packs/fluent/qr-code.svg`,null,`${BASE}assets/packs/fluent/share.svg`],
  'rows left from a previous opening are decorated by the normal pass');
 const removals=[];
 const observer=new f.w.MutationObserver(records=>{for(const record of records)for(const node of record.removedNodes)if(node===f.share||node===f.popup||f.original.includes(node))removals.push(node);});
 observer.observe(f.root,{childList:true,subtree:true});t.after(()=>observer.disconnect());
 f.populate();await tick();await tick();
 assert.deepEqual(f.icons(),[`${BASE}assets/packs/fluent/link.svg`,`${BASE}assets/packs/fluent/qr-code.svg`,null,`${BASE}assets/packs/fluent/share.svg`]);
 assert.deepEqual(removals,[],'the open Share popup and its ancestry are never reinserted');
 for(const row of f.popup.querySelectorAll('menuitem')){
  assert.equal(row.getAttribute('data-cme-item'),'true');assert.equal(row.getAttribute('data-cme-icons'),'on');
  assert.equal(row.querySelectorAll('.cme-decoration').length,1);
 }
 assert.equal(f.popup.querySelector('menuseparator').hasAttribute('data-cme-item'),false);
 assert.equal(f.controller.getInventory()[0].items.some(item=>item.l10nId?.startsWith('menu-share')||item.l10nId==='menu-file-share-qrcode3'),false,'no editor identity');
 f.close();
 assert.equal(f.root.querySelector('.cme-decoration,[data-cme-item],[data-cme-icons]'),null,'closing restores the owner rows');
 assert.deepEqual([...f.root.children],f.original);
});

test('Share service rows follow the icon pack and icon visibility options',async t=>{
 const zen=fixture(t,{iconPack:'zen'});zen.populate();await zen.show();zen.populate();await tick();await tick();
 const [link,qrcode,separator,more]=zen.icons();
 assert.equal(qrcode,'chrome://browser/content/sharing/qr-code.svg');assert.equal(separator,null);
 for(const src of [link,more])assert.match(src,/^chrome:\/\/browser\/skin\//u);
 const qr=zen.popup.querySelector('.share-qrcode-item img');
 qr.dispatchEvent(new zen.w.Event('error'));
 assert.equal(qr.getAttribute('src'),`${BASE}assets/packs/fluent/qr-code.svg`,'a missing browser resource falls back to the local glyph');
 zen.close();

 const off=fixture(t,{showIcons:false});off.populate();await off.show();off.populate();await tick();await tick();
 assert.deepEqual(off.icons(),[null,null,null,null]);
 for(const row of off.popup.querySelectorAll('menuitem'))assert.equal(row.getAttribute('data-cme-icons'),'off');
 off.close();assert.equal(off.root.querySelector('[data-cme-icons]'),null);
});

test('only the exact anonymous SharingUtils rows inside the native Share menu are decorated',async t=>{
 const f=fixture(t);await f.show();
 const doc=f.w.document,item=(attrs)=>{const n=doc.createXULElement('menuitem');for(const [k,v]of Object.entries(attrs))n.setAttribute(k,v);return n;};
 f.popup.append(
  item({class:'share-copy-link',label:'Wrong l10n','data-l10n-id':'menu-share-something-else'}),
  item({class:'share-mac-picker-item',label:'Mac','data-l10n-id':'menu-share-mac'}),
  item({'data-l10n-id':'menu-share-copy-links',label:'No class'}));
 await tick();await tick();
 assert.equal(f.popup.querySelector('.cme-decoration,[data-cme-item]'),null);
 // The same classes outside the Share menu belong to someone else.
 const move=f.root.querySelector('#context_moveTabOptions menupopup');
 move.append(item({class:'share-copy-link','data-l10n-id':'menu-share-copy-links',label:'Elsewhere'}));await tick();await tick();
 assert.equal(move.querySelector('.cme-decoration'),null);
 f.close();
});

test('a hidden Share menu leaves its rows undecorated',async t=>{
 const f=fixture(t);f.populate();
 const state=f.state;
 f.state={...state,roots:{...state.roots,tabContextMenu:{children:[],records:{'native:tab-context-share-url':{hidden:true}}}}};
 await f.show();
 assert.equal(f.share.getAttribute('hidden'),'true');
 assert.equal(f.popup.querySelector('.cme-decoration'),null);
 f.close();
});
