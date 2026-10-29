import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {FolderColorManager, createBrowserFolderColorAdapters,
  createBrowserFolderColorMenuAdapters} from '../scripts/better-zen-folders.uc.mjs';

// DOM, native dialog, clock and clipboard are boundaries; colour logic is real.
class Node extends EventTarget {
  constructor(localName) {
    super(); Object.assign(this, {localName, children: [], attrs: new Map(), props: new Map(),
      isConnected: true, rect: {x: 10, y: 20, width: 28, height: 28}, animations: []});
    this.style = {setProperty: (k,v) => this.props.set(k,String(v)),
      getPropertyValue: k => this.props.get(k) ?? '', removeProperty: k => this.props.delete(k)};
  }
  setAttribute(k,v) { this.attrs.set(k,String(v)); }
  getAttribute(k) { return this.attrs.get(k) ?? null; }
  removeAttribute(k) { this.attrs.delete(k); }
  toggleAttribute(k,on) { on ? this.setAttribute(k,'') : this.removeAttribute(k); }
  appendChild(n) { this.children.push(n); n.parentElement=this; return n; }
  remove() { if(this.parentElement) this.parentElement.children=this.parentElement.children.filter(n=>n!==this); this.parentElement=null; }
  contains(n) { return n===this || all(this).includes(n); }
  getBoundingClientRect() { return {...this.rect}; }
  getAnimations() { return this.animations; }
  querySelectorAll(selector) {
    if(selector.includes('.front')) return all(this).filter(n=>['front','back','icon','dots'].includes(n.getAttribute('class')));
    if(selector.includes('linearGradient')) return all(this).filter(n=>['linearGradient','radialGradient'].includes(n.localName));
    if(selector==='stop') return all(this).filter(n=>n.localName==='stop');
    return [];
  }
  querySelector(selector) { return selector.includes('svg') ? all(this).find(n=>n.localName==='svg') : null; }
  openPopup() { this.onOpen?.(); }
  hidePopup() { this.dispatchEvent(new Event('popuphidden')); }
  click() { this.dispatchEvent(new Event('click')); }
}
const all = n => n.children.flatMap(c=>[c,...all(c)]);
function fixture() {
  const root=new Node('window'), folder=root.appendChild(new Node('zen-folder'));
  folder.id='PRIVATE-FOLDER-ID'; folder.name='PRIVATE TITLE'; folder.isZenFolder=true;
  const row=folder.appendChild(new Node('hbox')), svg=row.appendChild(new Node('svg'));
  svg.setAttribute('state','open');
  const front=svg.appendChild(new Node('rect')); front.setAttribute('class','front');
  front.props.set('fill','url("chrome://browser/content/browser.xhtml#PRIVATE-GRADIENT")');
  const gradient=svg.appendChild(new Node('linearGradient')); gradient.id='PRIVATE-GRADIENT';
  gradient.setAttribute('x1','14'); gradient.setAttribute('gradientUnits','userSpaceOnUse');
  const stop=gradient.appendChild(new Node('stop')); stop.setAttribute('offset','0');
  stop.props.set('stop-color','rgb(255, 255, 255)'); stop.props.set('stop-opacity','1');
  const duplicate=root.appendChild(new Node('linearGradient')); duplicate.id=gradient.id;
  const timers=new Map(), cancelled=[], frames=new Map(), callbacks=[], writes=[], events=[], copies=[];
  let serial=0, now=0, focused=true, raw=JSON.stringify({version:1,entries:[{id:folder.id,color:'#06b6d4',updatedAt:1}]});
  const host=new EventTarget();
  const document={documentElement:root, documentURI:'chrome://browser/content/browser.xhtml',
    hasFocus:()=>focused, getElementById:id=>id==='mainPopupSet'?root:all(root).find(n=>n.id===id),
    querySelectorAll:selector=>selector.includes('Gradient')?root.querySelectorAll(selector):[folder],
    createXULElement:name=>new Node(name), createElementNS:(_ns,name)=>new Node(name)};
  Object.assign(host,{document,CustomEvent,browsingContext:{},
    getComputedStyle:(node,pseudo)=>({getPropertyValue:key=>pseudo ? (node.before?.[key]??'') : (node.props.get(key)??'')}),
    setTimeout:(fn,delay)=>{timers.set(++serial,{fn,at:now+delay});return serial;},
    clearTimeout:id=>{if(timers.has(id))cancelled.push(timers.get(id).fn);timers.delete(id);},
    requestAnimationFrame:fn=>{frames.set(++serial,fn);return serial;},cancelAnimationFrame:id=>frames.delete(id),
    Services:{appinfo:{appBuildID:'20260915091052'},prefs:{getStringPref:()=>raw,
      setStringPref:(_key,value)=>{raw=value;writes.push(value);},addObserver(){},removeObserver(){}}},
    Ci:{nsIColorPicker:{}}, Cc:{'@mozilla.org/colorpicker;1':{createInstance:()=>({
      init(){},open:cb=>callbacks.push(cb)})}},
    navigator:{clipboard:{writeText:async text=>copies.push(JSON.parse(text))}}});
  folder.addEventListener('BetterZenFolderColorChanged',e=>events.push(e.detail.color));
  const manager=new FolderColorManager(createBrowserFolderColorAdapters(host)); manager.start();
  const menu=createBrowserFolderColorMenuAdapters(host);
  const command=name=>all(root).find(n=>n.getAttribute('data-better-zen-folders-colour-action')===name);
  const panel=()=>all(root).find(n=>n.localName==='panel');
  const openPanel=(target=folder)=>menu.openPicker(target,manager.getColor(target),{
    read:()=>manager.getColor(target),apply:color=>manager.setColor(target,color),reset:()=>manager.clearColor(target)});
  const open=()=>{openPanel();command('custom').click();return callbacks.at(-1);};
  const advance=ms=>{const end=now+ms;for(;;){const next=[...timers].filter(([,v])=>v.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];
    if(!next)break;timers.delete(next[0]);now=next[1].at;next[1].fn();}now=end;};
  return {host,folder,row,svg,front,gradient,stop,root,menu,manager,command,panel,openPanel,open,
    writes,events,copies,timers,cancelled,frames,advance,
    focus(value){focused=value;host.dispatchEvent(new Event(value?'focus':'blur'));},
    records:()=>host.__betterZenFoldersColourDiagnostics??[],
    async copy(target=folder){openPanel(target);command('copy-diagnostic').click();await new Promise(r=>setImmediate(r));return copies.at(-1);},
    snapshot:()=>({raw,color:manager.getColor(folder),props:[...folder.props],attrs:[...folder.attrs],writes:[...writes],events:[...events]})};
}

test('baseline precedes panel opening; export identifies invocation and diagnostic build', async()=>{
  const f=fixture(); f.openPanel();
  f.panel().onOpen=()=>f.row.props.set('opacity','0.5');
  f.openPanel(); f.command('custom').click();
  const rows=await f.copy();
  assert.equal(rows[0].phase,'pre-panel');
  assert.equal(rows[0].ancestorPaint.find(n=>n.element==='hbox').opacity,'');
  assert.equal(rows[1].ancestorPaint.find(n=>n.element==='hbox').opacity,'0.5');
  assert.ok(Number.isInteger(rows[0].diagnosticId));
  assert.equal(rows[1].diagnosticId,rows[0].diagnosticId);
  const manifest=JSON.parse(await readFile(new URL('../theme.json',import.meta.url),'utf8'));
  assert.equal(rows[0].diagnosticBuild.split(' / ')[0],manifest.version);
  assert.equal(rows[0].linkedPreset,null);
  assert.equal(rows[0].browserBuild,'20260915091052');
});

test('settled capture waits 400ms, reads late changes, and never writes colour',()=>{
  const f=fixture(), before=f.snapshot(); const cb=f.open(); cb.update('#008040'); cb.done('#06b6d4');
  f.advance(399); assert.equal(f.records().some(r=>r.phase==='settled'),false);
  f.stop.props.set('stop-color','rgb(0, 0, 0)'); f.row.props.set('filter','brightness(0.8)');
  f.advance(1); const row=f.records().at(-1);
  assert.equal(row.phase,'settled'); assert.equal(row.settleStatus,'sampled');
  assert.equal(row.gradientResources[0].stops[0].color,'rgb(0, 0, 0)');
  assert.equal(row.ancestorPaint.find(n=>n.element==='hbox').filter,'brightness(0.8)');
  assert.deepEqual(f.snapshot(),before);
});

test('unfocused completion waits for focus return plus 400ms',()=>{
  const f=fixture(), cb=f.open(); f.focus(false); cb.done('#06b6d4'); f.advance(500);
  assert.equal(f.records().some(r=>r.phase==='settled'),false);
  f.focus(true); f.advance(399); assert.equal(f.records().some(r=>r.phase==='settled'),false);
  f.advance(1); assert.equal(f.records().at(-1).settleStatus,'sampled'); assert.equal(f.timers.size,0);
});

test('focus never returns: bounded fallback reports unknown, without a misleading settled claim',()=>{
  const f=fixture(), cb=f.open(); f.focus(false); cb.done('#06b6d4'); f.advance(2500);
  assert.equal(f.records().at(-1).settleStatus,'focus-not-returned'); assert.equal(f.timers.size,0);
  const count=f.records().length; f.focus(true); f.advance(1000); assert.equal(f.records().length,count);
});

test('running animations and unavailable focus are explicit instead of pixel-settled claims',()=>{
  const f=fixture(); f.svg.animations=[{playState:'running'}]; f.open().done('#06b6d4'); f.advance(400);
  assert.equal(f.records().at(-1).settleStatus,'animations-running');
  delete f.host.document.hasFocus; f.open().done('#06b6d4'); f.advance(400);
  assert.equal(f.records().at(-1).settleStatus,'focus-unavailable');
});

test('pending native animation is not reported as a settled sample',()=>{
  const f=fixture(); f.svg.animations=[{playState:'paused',pending:true}];
  f.open().done('#06b6d4'); f.advance(400);
  assert.equal(f.records().at(-1).settleStatus,'animations-running');
});

test('Copy samples the original invocation target, not a subsequently opened folder',async()=>{
  const f=fixture(), before=f.snapshot(); f.open().done('#06b6d4');
  f.svg.rect.x=55; f.row.before={'background-color':'rgb(1, 2, 3)'};
  const other=f.root.appendChild(new Node('zen-folder')); other.id='OTHER-PRIVATE'; other.isZenFolder=true;
  const rows=await f.copy(other), copy=rows.at(-1);
  assert.equal(copy.phase,'copy'); assert.equal(copy.outerSvg.rect.x,55);
  assert.equal(copy.diagnosticId,rows[0].diagnosticId);
  assert.equal(copy.ancestorPaint.find(n=>n.element==='hbox').before.backgroundColor,'rgb(1, 2, 3)');
  assert.deepEqual(f.snapshot(),before);
});

test('disconnected target and replaced SVG are marked on fresh copy',async()=>{
  const f=fixture(); f.open().done('#06b6d4'); f.folder.isConnected=false;
  const old=f.svg; old.remove(); f.row.appendChild(new Node('svg'));
  const rows=await f.copy(); assert.equal(rows.at(-1).targetConnected,false);
  assert.equal(rows.at(-1).svgReplaced,true);
});

test('resources retain opaque equality and gradient details but never leak URLs, titles or profile paths',async()=>{
  const f=fixture(); f.row.props.set('background-image','url("file:///C:/Users/PRIVATE/profile/private.png")');
  f.open().done('#06b6d4');
  let rows=await f.copy(), copy=rows.at(-1);
  const resource=copy.gradientResources.find(r=>r.resolution==='local-gradient');
  assert.ok(resource,'the local gradient is resolved without resolving external images');
  assert.equal(resource.matches,2);
  assert.equal(resource.insideSvg,true);
  assert.equal(resource.x1,'14');
  assert.equal(resource.stops[0].offset,'0');
  assert.equal(copy.descendantPaint[0].fill,rows[0].descendantPaint[0].fill);
  f.front.props.set('fill','url("chrome://browser/content/browser.xhtml#PRIVATE-OTHER")');
  rows=await f.copy(); assert.notEqual(rows.at(-1).descendantPaint[0].fill,copy.descendantPaint[0].fill);
  assert.doesNotMatch(JSON.stringify(rows),/PRIVATE|file:|chrome:|https?:|C:\\|profile|folderId|folderName/);
});

test('same-address gradient replacement changes only its opaque resolved-node identity',async()=>{
  const f=fixture(), originalColour=f.snapshot(); f.open().done('#06b6d4');
  const resource=rows=>rows.at(-1).gradientResources.find(r=>r.resolution==='local-gradient');
  const before=resource(await f.copy());
  assert.deepEqual(resource(await f.copy()),before,'resampling the same node preserves identity');
  const replacement=new Node('linearGradient');
  replacement.id=f.gradient.id; replacement.attrs=new Map(f.gradient.attrs);
  const stop=replacement.appendChild(new Node('stop'));
  stop.attrs=new Map(f.stop.attrs); stop.props=new Map(f.stop.props);
  f.gradient.remove(); f.svg.appendChild(replacement);
  const rows=await f.copy(), after=resource(rows);
  const {resolvedNode:oldNode,...oldPaint}=before;
  const {resolvedNode:newNode,...newPaint}=after;
  assert.deepEqual(newPaint,oldPaint,'address, properties and duplicate count are deliberately identical');
  assert.equal(rows.at(-1).svgReplaced,false,'the outer SVG is unchanged');
  assert.notEqual(newNode,oldNode,'different resolved gradient objects must not produce identical diagnostics');
  assert.match(oldNode,/^node-\d+$/); assert.match(newNode,/^node-\d+$/);
  replacement.remove(); f.svg.appendChild(f.gradient);
  assert.equal(resource(await f.copy()).resolvedNode,oldNode,'returning to the original node restores its token');
  f.open().done('#06b6d4');
  assert.equal(resource(await f.copy()).resolvedNode,'node-1','tokens are local to the new operation');
  assert.deepEqual(f.snapshot(),originalColour,'diagnostics never write colour');
  assert.doesNotMatch(JSON.stringify(f.copies),/PRIVATE|file:|chrome:|https?:|profile|folderId|folderName/);
});

for(const mode of ['new-invocation','teardown','closed-window']) test(`${mode} prevents stale queued sampling and colour mutation`,()=>{
  const f=fixture(); f.open().done('#06b6d4');
  assert.ok(f.timers.size>0); const stale=[...f.timers.values()].map(t=>t.fn).concat([...f.frames.values()]);
  if(mode==='new-invocation') f.open();
  else if(mode==='teardown') f.menu.removeOwnedUi(null);
  else f.host.closed=true;
  const count=f.records().length; stale.forEach(fn=>fn(123)); f.cancelled.forEach(fn=>fn()); f.advance(3000);
  assert.equal(f.records().length,count); assert.equal(f.writes.length,0); assert.equal(f.events.length,0);
  assert.equal(f.timers.size,0);
});

test('late preview from an obsolete invocation cannot append to current diagnostics',()=>{
  const f=fixture(), old=f.open(); f.open(); const count=f.records().length;
  old.update('#008040'); assert.equal(f.records().length,count);
});

test('adapter recreation cannot reuse an invocation ID retained in the window trace',()=>{
  const f=fixture(); f.open().done('#06b6d4'); const previous=f.records().at(-1).diagnosticId;
  f.menu.removeOwnedUi(null);
  const next=createBrowserFolderColorMenuAdapters(f.host);
  next.openPicker(f.folder,'#06b6d4',{read:()=>f.manager.getColor(f.folder),apply:()=>assert.fail('no colour write')});
  f.command('custom').click();
  assert.ok(f.records().at(-1).diagnosticId>previous);
  next.removeOwnedUi(null);
});

test('paint capture failures cannot prevent a valid accepted colour',()=>{
  const f=fixture(); f.svg.getBoundingClientRect=()=>{throw Error('detached layout');};
  f.host.getComputedStyle=()=>{throw Error('unavailable');};
  f.open().done('#123456'); f.advance(400);
  assert.equal(f.manager.getColor(f.folder),'#123456'); assert.equal(f.writes.length,1);
});

test('a cancelled timer from the same invocation cannot consume the replacement timer',()=>{
  const f=fixture(); f.open().done('#06b6d4');
  const old=[...f.timers.values()].find(t=>t.at===400).fn;
  f.advance(100); f.focus(false); f.focus(true);
  old(); assert.equal(f.records().some(r=>r.phase==='settled'),false);
  f.advance(399); assert.equal(f.records().some(r=>r.phase==='settled'),false);
  f.advance(1); assert.equal(f.records().filter(r=>r.phase==='settled').length,1);
  assert.equal(f.timers.size,0);
});

test('diagnostic export allowlists nested paint data and sanitizes raw resource values',async()=>{
  const f=fixture(); f.open().done('#06b6d4');
  const first=f.records()[0];
  first.outerSvg.title='PRIVATE TITLE'; first.outerSvg.rect.profile='PRIVATE PROFILE';
  first.ancestorPaint[0].before.backgroundImage='url("file:///C:/Users/PRIVATE/my profile/a)b.png")';
  first.gradientResources[0].url='https://PRIVATE.invalid';
  first.gradientResources[0].stops[0].folderName='PRIVATE TITLE';
  const json=JSON.stringify(await f.copy());
  assert.doesNotMatch(json,/PRIVATE|file:|chrome:|https?:|profile|folderName|title/);
  assert.match(json,/redacted/);
});
