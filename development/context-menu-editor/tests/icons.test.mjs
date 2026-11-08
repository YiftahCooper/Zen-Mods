import test from 'node:test';
import assert from 'node:assert/strict';
import {makeDOM} from './dom.mjs';
import {createIconService} from '../src/icons.mjs';

// Decoding/canvas are platform boundaries: jsdom provides no image decoder.
// The actual service reads, sniffs, bounds, cancels and normalizes these inputs.
const PNG32 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAGUlEQVRYhe3BMQEAAADCoPVPbQ0PoAAAAOBvAjAAAfkG7AAAAABJRU5ErkJggg==';
const PNG = Uint8Array.from(Buffer.from(PNG32.split(',')[1], 'base64'));
function platform({width=64,height=32,load='success',timeoutScale=1}={}) {
  const dom=makeDOM(), window=dom.window, draws=[], urls=new Set();let created=0,cleared=0;
  window.URL.createObjectURL=()=>{const url=`blob:test/${++created}`;urls.add(url);return url;};
  window.URL.revokeObjectURL=url=>urls.delete(url);
  window.Image=class {
    naturalWidth=width;naturalHeight=height;
    set src(value) {this.value=value;if(!value){cleared++;return;}if(load==='hang')return;queueMicrotask(()=>{if(this.value!==value)return;if(load==='error')this.onerror?.();else this.onload?.();});}
    get src(){return this.value;}
  };
  const create=window.document.createElement.bind(window.document);
  window.document.createElement=name=>{
    const node=create(name);if(name==='canvas') {
      node.getContext=()=>({clearRect(){},drawImage(...args){draws.push(args.slice(1));}});
      node.toDataURL=()=>PNG32;
    }return node;
  };
  if(timeoutScale!==1){const timer=window.setTimeout.bind(window);window.setTimeout=(fn,delay)=>timer(fn,delay*timeoutScale);}
  return {window,dom,draws,urls,get created(){return created;},get cleared(){return cleared;}};
}
function asset(result,id,pack='fluent') {
  assert.equal(result.type,'image');
  if(pack==='zen')assert.equal(result.src,`chrome://browser/skin/zen-icons/${id}.svg`);
  else assert.match(result.src,new RegExp(`/assets/packs/${pack}/${id}\\.svg$`));
}

test('gallery exposes bundled Fluent and browser-provided Zen sources with search tags',()=>{
  const p=platform(), icons=createIconService(p.window,{baseURL:'https://preview.invalid/mod/'}), catalog=icons.catalog();
  assert.equal(catalog.length,285);assert.deepEqual([...new Set(catalog.map(i=>i.pack))],['fluent','zen']);
  const copy=catalog.find(i=>i.pack==='fluent'&&i.id==='edit-copy');
  assert.equal(copy.src,'https://preview.invalid/mod/assets/packs/fluent/edit-copy.svg');assert.ok(copy.tags.includes('copy'));
  const zenCopy=catalog.find(i=>i.pack==='zen'&&i.id==='edit-copy');
  assert.equal(zenCopy.src,'chrome://browser/skin/zen-icons/edit-copy.svg');assert.equal(zenCopy.fallbackSrc,copy.src);
  const zenOnly=catalog.find(i=>i.pack==='zen'&&i.id==='dart-down');
  assert.equal(zenOnly.fallbackSrc,'https://preview.invalid/mod/assets/packs/fluent/info.svg');
  assert.equal(catalog.filter(i=>i.pack==='zen'&&i.src.startsWith('chrome://browser/skin/')).length,147);
  assert.throws(()=>catalog.push({}),TypeError);p.dom.window.close();
});
test('resolved native assets carry local fallback artwork and retain Zen aliases',()=>{
  const p=platform(), icons=createIconService(p.window,{baseURL:'https://preview.invalid/mod/'});
  const copy=icons.resolve({nativeId:'context-copy'},{},{iconPack:'zen'});
  assert.equal(copy.src,'chrome://browser/skin/zen-icons/edit-copy.svg');assert.equal(copy.fallbackSrc,'https://preview.invalid/mod/assets/packs/fluent/edit-copy.svg');
  const pinned=icons.resolve({}, {icon:{kind:'asset',pack:'zen',id:'remove-tab'}}, {iconPack:'fluent'});
  assert.equal(pinned.src,'chrome://browser/skin/zen-icons/close.svg');assert.equal(pinned.fallbackSrc,'https://preview.invalid/mod/assets/packs/fluent/info.svg');
  assert.equal(icons.resolve({nativeId:'context-copy'},{},{iconPack:'fluent'}).fallbackSrc,undefined);p.dom.window.close();
});
test('exact native and localization mappings outrank labels and owner artwork',()=>{
  const p=platform(), icons=createIconService(p.window);
  asset(icons.resolve({nativeId:'context-copy',label:'Translate',iconURL:'chrome://owner/icon.svg'}, {}, {}),'edit-copy');
  asset(icons.resolve({l10nId:'text-action-cut',label:'Save'}, {}, {}),'edit-cut');
  asset(icons.resolve({nativeId:'context-previewlink'}, {}, {iconPack:'zen'}),'open','zen');
  p.dom.window.close();
});
test('native navigation commands have recognizable icons even with localized labels',()=>{
 const p=platform(),icons=createIconService(p.window);
 for(const iconPack of ['fluent','zen'])for(const [nativeId,id] of [['context-back','arrow-left'],['context-forward','arrow-right'],['context-reload','reload'],['context-stop','close']]){
  asset(icons.resolve({nativeId,label:'Localized action'}, {}, {iconPack}),id,iconPack);
 }
 p.dom.window.close();
});
test('folder and space movement menus have action icons in both packs with localized labels',()=>{
 const p=platform(),icons=createIconService(p.window);
 for(const iconPack of ['fluent','zen'])for(const [nativeId,id] of [['context_zenMoveToFolder',iconPack==='zen'?'folder':'folder-open'],['better-zen-folders-move-space','move-tab']]){
  asset(icons.resolve({nativeId,label:'Localized action',kind:'native-menu'}, {}, {iconPack}),iconPack==='zen'&&id==='move-tab'?'arrow-corner-down-right':id,iconPack);
 }
 p.dom.window.close();
});
test('automatic pack switching preserves explicit pinned artwork',()=>{
  const p=platform(), icons=createIconService(p.window), descriptor={nativeId:'context_zenFolderChangeIcon'};
  asset(icons.resolve(descriptor,{}, {iconPack:'fluent'}),'image-save');
  asset(icons.resolve(descriptor,{}, {iconPack:'zen'}),'canvas','zen');
  const record={icon:{kind:'asset',pack:'fluent',id:'spell-check'}};
  asset(icons.resolve(descriptor,record,{iconPack:'zen'}),'spell-check');assert.equal(record.icon.pack,'fluent');p.dom.window.close();
});
test('custom PNG and Unicode take priority and disable controls return no decoration',()=>{
  const p=platform(), icons=createIconService(p.window), descriptor={nativeId:'context-copy'};
  assert.deepEqual(icons.resolve(descriptor,{icon:{kind:'image',data:PNG32}},{}),{type:'image',src:PNG32,monochrome:false,source:'custom'});
  assert.deepEqual(icons.resolve(descriptor,{icon:{kind:'text',text:'🔖'}},{}),{type:'text',text:'🔖',source:'custom'});
  assert.equal(icons.resolve(descriptor,{showIcon:false},{}),null);assert.equal(icons.resolve(descriptor,{}, {showIcons:false}),null);p.dom.window.close();
});
test('unknown mod actions retain owner artwork before semantic guesses',()=>{
  const p=platform(), icons=createIconService(p.window), descriptor={key:'mod:new-owner',label:'Copy message',iconURL:'moz-extension://owner/art.svg'};
  assert.deepEqual(icons.resolve(descriptor,{}, {monochromeExtensions:true}),{type:'image',src:'moz-extension://owner/art.svg',monochrome:true,source:'owner'});
  assert.equal(icons.resolve({...descriptor,iconURL:'javascript:alert(1)'},{},{}).source,'semantic');p.dom.window.close();
});
test('generic action semantics work for unrelated mod IDs and avoid conflicting actions',()=>{
  const p=platform(), icons=createIconService(p.window);
  for(const [descriptor,id] of [[{nativeId:'another-copy-selection'},'edit-copy'],[{label:'Save selected text'},'save'],[{label:'Translate phrase'},'translations'],[{key:'other-define-word'},'spell-check'],[{label:'Look up dictionary'},'spell-check']])asset(icons.resolve(descriptor,{},{}),id);
  for(const label of ['Copy and translate selection','Save or delete','Random feature'])asset(icons.resolve({label},{},{}),'info');
  asset(icons.resolve({kind:'submenu',label:'Copy and translate'},{kind:'submenu'},{}),'menu');p.dom.window.close();
});
test('file input is sniffed and normalized to a transparent 32px PNG with aspect preserved',async()=>{
  const p=platform({width:80,height:20}), icons=createIconService(p.window), file=new p.window.File([PNG],'wide.png',{type:'application/octet-stream'});
  assert.deepEqual(await icons.importFile(file),{kind:'image',data:PNG32});assert.deepEqual(p.draws,[[0,12,32,8]]);assert.equal(p.urls.size,0);assert.ok(p.cleared);p.dom.window.close();
});
test('oversized local files are rejected before allocating a decoder',async()=>{
  const p=platform(), icons=createIconService(p.window), file=new p.window.Blob([new Uint8Array(5*1024*1024+1)],{type:'image/png'});
  await assert.rejects(icons.importFile(file),/5 MiB/);assert.equal(p.created,0);p.dom.window.close();
});
test('MIME claims cannot turn markup or random bytes into an image',async()=>{
  const p=platform(), icons=createIconService(p.window);
  for(const input of ['<html><script>alert(1)</script></html>','not an image'])await assert.rejects(icons.importFile(new p.window.Blob([input],{type:'image/png'})),/image/i);
  assert.equal(p.created,0);p.dom.window.close();
});
test('SVG scripts, handlers, external references, entities and foreignObject never reach Image',async()=>{
  const p=platform(), icons=createIconService(p.window);
  for(const content of ['<script>alert(1)</script>','<path onload="alert(1)"/>','<use href="https://other.invalid/a.svg#x"/>','<foreignObject><div/></foreignObject>','<style>@import url(https://other.invalid/style);</style>','<animate attributeName="href" values="https://other.invalid/x"/>','<path fill="u\\72l(https://other.invalid/a.svg)"/>','<?xml-stylesheet href="https://other.invalid/a.css"?><path/>']){
    await assert.rejects(icons.importFile(new p.window.Blob([`<svg xmlns="http://www.w3.org/2000/svg">${content}</svg>`],{type:'image/svg+xml'})),/SVG|image/i);
  }
  await assert.rejects(icons.importFile(new p.window.Blob(['<!DOCTYPE svg [<!ENTITY a SYSTEM "file:///secret">]><svg xmlns="http://www.w3.org/2000/svg">&a;</svg>'],{type:'image/svg+xml'})),/SVG|image/i);
  assert.equal(p.created,0);assert.equal(p.window.document.body.children.length,0);p.dom.window.close();
});
test('plain inert SVG is decoded off DOM and normalized rather than retained',async()=>{
  const p=platform(), icons=createIconService(p.window), svg='<svg xmlns="http://www.w3.org/2000/svg" width="64" height="32"><path fill="red" d="M0 0h64v32H0z"/></svg>';
  assert.deepEqual(await icons.importFile(new p.window.Blob([svg],{type:'image/svg+xml'})),{kind:'image',data:PNG32});assert.equal(p.window.document.body.children.length,0);p.dom.window.close();
});
test('SVG local fragment URLs support matching quotes in presentation attributes and styles',async()=>{
  const p=platform(), icons=createIconService(p.window);
  const attribute=value=>value.replaceAll('&','&amp;').replaceAll('"','&quot;');
  const contents=[
    ...['url(#g)',"url('#g')",'url("#g")',"url( '#g' )"].map(value=>`<path fill="${attribute(value)}"/>`),
    `<path style="${attribute('fill:url("#g");stroke:url(\'#s\')')}"/>`,
    `<style>path {fill:url('#g');stroke:url("#s");filter:url(#f)}</style><path/>`,
  ];
  for(const content of contents){
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="32">${content}</svg>`;
    assert.deepEqual(await icons.importFile(new p.window.Blob([svg],{type:'image/svg+xml'})),{kind:'image',data:PNG32});
  }
  assert.equal(p.urls.size,0);p.dom.window.close();
});
test('SVG quoted external, mismatched and mixed URL references remain rejected before decode',async()=>{
  const p=platform(), icons=createIconService(p.window);
  const attribute=value=>value.replaceAll('&','&amp;').replaceAll('"','&quot;');
  const references=[
    'url("https://other.invalid/g.svg#g")',"url('https://other.invalid/g.svg#g')",
    'url("#g\')',"url('#g\")",'url(#g")','url("#g" "https://other.invalid/g.svg")',
    'url("#g") url("https://other.invalid/g.svg#g")','url(#g) url(',
    'url(#g) url(https://other.invalid/g.svg#g)',"url('#g') url('https://other.invalid/g.svg#g')",
  ];
  for(const value of references)for(const content of [`<path fill="${attribute(value)}"/>`,`<path style="${attribute(`fill:${value}`)}"/>`,`<style>path {fill:${value}}</style><path/>`]){
    const svg=`<svg xmlns="http://www.w3.org/2000/svg">${content}</svg>`;
    await assert.rejects(icons.importFile(new p.window.Blob([svg],{type:'image/svg+xml'})),/SVG|external/i);
  }
  assert.equal(p.created,0);p.dom.window.close();
});
test('decoded dimensions and decoder failures clean temporary URLs',async()=>{
  for(const config of [{width:4097,height:32},{width:32,height:4097},{width:0,height:32},{load:'error'}]){
    const p=platform(config), icons=createIconService(p.window);await assert.rejects(icons.importFile(new p.window.Blob([PNG])),/image|4096|decode/i);assert.equal(p.urls.size,0);assert.ok(p.cleared);p.dom.window.close();
  }
});
test('large PNG dimensions are rejected before image decoding',async()=>{
  const p=platform(), icons=createIconService(p.window), oversized=PNG.slice();new DataView(oversized.buffer).setUint32(16,4097);
  await assert.rejects(icons.importFile(new p.window.Blob([oversized])),/4096/);assert.equal(p.created,0);p.dom.window.close();
});
test('JPEG and WebP headers with excessive dimensions never allocate an image decoder',async()=>{
  const p=platform(), icons=createIconService(p.window);
  const jpeg=Uint8Array.of(255,216,255,192,0,17,8,0,32,0x10,0x01,3,1,0x11,0,2,0x11,0,3,0x11,0,255,217);
  const webp=Uint8Array.of(...Buffer.from('RIFF'),22,0,0,0,...Buffer.from('WEBPVP8X'),10,0,0,0,0,0,0,0,0,0x10,0,31,0,0);
  for(const bytes of [jpeg,webp])await assert.rejects(icons.importFile(new p.window.Blob([bytes])),/4096/);
  assert.equal(p.created,0);p.dom.window.close();
});
test('URL import uses a bounded streamed HTTPS fetch without credentials or referrer',async()=>{
  const p=platform(), calls=[], icons=createIconService(p.window,{fetch:async(url,options)=>{calls.push({url,options});return new Response(PNG,{headers:{'Content-Type':'image/png'}});}});
  assert.deepEqual(await icons.importURL('https://images.invalid/icon.png'),{kind:'image',data:PNG32});assert.equal(calls[0].options.credentials,'omit');assert.equal(calls[0].options.referrerPolicy,'no-referrer');assert.equal(calls[0].options.redirect,'error');assert.ok(calls[0].options.signal);p.dom.window.close();
});
test('insecure or credentialed URLs never trigger fetch',async()=>{
  const p=platform();let fetched=false;const icons=createIconService(p.window,{fetch:async()=>{fetched=true;}});
  for(const url of ['http://images.invalid/icon.png','https://user:secret@images.invalid/icon.png','file:///image.png','data:image/png;base64,AAAA'])await assert.rejects(icons.importURL(url),/HTTPS|credentials/i);
  assert.equal(fetched,false);p.dom.window.close();
});
test('redirect responses and unsuccessful responses are rejected',async()=>{
  for(const response of [{ok:true,redirected:true,url:'http://insecure.invalid/a'},{ok:false,status:404}]){
    const p=platform(), icons=createIconService(p.window,{fetch:async()=>response});await assert.rejects(icons.importURL('https://images.invalid/icon.png'),/redirect|load|fetch/i);assert.equal(p.created,0);p.dom.window.close();
  }
});
test('URL size limit is enforced both from Content-Length and streamed bytes',async()=>{
  for(const response of [new Response(PNG,{headers:{'Content-Length':String(256*1024+1)}}),new Response(new Uint8Array(256*1024+1))]) {
    const p=platform(), icons=createIconService(p.window,{fetch:async()=>response});await assert.rejects(icons.importURL('https://images.invalid/icon.png'),/256 KiB/);assert.equal(p.created,0);p.dom.window.close();
  }
});
test('pasting supports Unicode graphemes, image data and Blob without persisting source',async()=>{
  const p=platform(), icons=createIconService(p.window);
  assert.deepEqual(await icons.importPaste(' 👩🏽‍💻 '),{kind:'text',text:'👩🏽‍💻'});assert.deepEqual(await icons.importPaste('12345678'),{kind:'text',text:'12345678'});
  assert.deepEqual(await icons.importPaste(PNG32),{kind:'image',data:PNG32});assert.deepEqual(await icons.importPaste(new p.window.Blob([PNG])),{kind:'image',data:PNG32});
  for(const value of ['', '123456789','a\nb','\u0001','\ud800'])await assert.rejects(icons.importPaste(value),/short|symbol|text|Unicode/i);p.dom.window.close();
});
test('pasted HTTPS image links use URL policy and oversize data is bounded before decoding',async()=>{
  const p=platform(), icons=createIconService(p.window,{fetch:async()=>new Response(PNG)});
  assert.deepEqual(await icons.importPaste('https://images.invalid/i.png'),{kind:'image',data:PNG32});
  await assert.rejects(icons.importPaste(`data:image/png;base64,${'A'.repeat(Math.ceil(5*1024*1024/3)*4+4)}`),/5 MiB/);
  await assert.rejects(icons.importPaste('data:text/html;base64,PHNjcmlwdD4='),/image/i);p.dom.window.close();
});
test('cancellation during decode clears Image and revokes its object URL',async()=>{
  const p=platform({load:'hang'}), icons=createIconService(p.window), abort=new AbortController();
  const pending=icons.importFile(new p.window.Blob([PNG]),abort.signal);await new Promise(resolve=>setTimeout(resolve,10));abort.abort();
  await assert.rejects(pending,{name:'AbortError'});assert.equal(p.urls.size,0);assert.ok(p.cleared);p.dom.window.close();
});
test('pre-aborted imports allocate no decoder and leave caller choice unchanged',async()=>{
  const p=platform(), icons=createIconService(p.window), abort=new AbortController(), old={kind:'text',text:'⭐'};abort.abort();
  await assert.rejects(icons.importPaste(PNG32,abort.signal),{name:'AbortError'});assert.deepEqual(old,{kind:'text',text:'⭐'});assert.equal(p.created,0);p.dom.window.close();
});
test('one eight-second deadline covers a stalled fetch and a stalled decoder',async()=>{
  for(const phase of ['fetch','decode']) {
    const p=platform({load:phase==='decode'?'hang':'success',timeoutScale:0.002}), icons=createIconService(p.window,{fetch:async()=>phase==='fetch'?new Promise(()=>{}):new Response(PNG)});
    await assert.rejects(icons.importURL('https://images.invalid/i.png'),/too long|timed out/i);assert.equal(p.urls.size,0);p.dom.window.close();
  }
});
test('deadline cancels a stalled stream before any image resource is allocated',async()=>{
  const p=platform({timeoutScale:0.002});let canceled=false;
  const body=new ReadableStream({start(controller){controller.enqueue(PNG.slice(0,8));},cancel(){canceled=true;}});
  const icons=createIconService(p.window,{fetch:async()=>new Response(body)});
  await assert.rejects(icons.importURL('https://images.invalid/i.png'),/too long/);
  assert.equal(canceled,true);assert.equal(p.created,0);p.dom.window.close();
});
test('a response arriving after cancellation cannot start image decoding',async()=>{
  const p=platform(), abort=new AbortController();let deliver;
  const icons=createIconService(p.window,{fetch:()=>new Promise(resolve=>{deliver=resolve;})});
  const pending=icons.importURL('https://images.invalid/i.png',abort.signal);await Promise.resolve();abort.abort();
  await assert.rejects(pending,{name:'AbortError'});deliver(new Response(PNG));await Promise.resolve();await Promise.resolve();
  assert.equal(p.created,0);p.dom.window.close();
});
