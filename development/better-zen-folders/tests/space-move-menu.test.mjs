import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {spaceThemeMarker} from '../scripts/better-zen-folders.uc.mjs';
const source=await readFile(new URL('../scripts/better-zen-folders.uc.mjs',import.meta.url),'utf8');
const cssSource=await readFile(new URL('../chrome.css',import.meta.url),'utf8');
const modulePath=process.env.BZF_PLAYWRIGHT_MODULE;

for (const workspace of [
  {uuid:'empty',name:'',icon:''},
  {uuid:'named',name:'Alpha',icon:''},
  {uuid:'missing',name:'Beta'},
  {uuid:'failed',name:'Gamma',icon:'data:image/png;base64,invalid'},
]) test(`Space decoration uses an empty default glyph without changing saved state: ${workspace.uuid}`,{skip:!modulePath},async()=>{
  const {chromium}=createRequire(import.meta.url)(modulePath),browser=await chromium.launch({headless:true});
  try {
    const page=await browser.newPage();await page.route('**/*',route=>route.abort());
    const result=await page.evaluate(async({source,workspace})=>{
      const url=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));
      const {SpaceMoveMenuManager}=await import(url);URL.revokeObjectURL(url);
      Object.freeze(workspace);
      document.body.innerHTML='<menupopup><menuitem label="native label" command="native-move"></menuitem></menupopup>';
      const popup=document.querySelector('menupopup'),item=popup.firstElementChild;
      item.setAttribute('zen-workspace-id',workspace.uuid);
      let enabled=true;
      const manager=new SpaceMoveMenuManager({document,gZenWorkspaces:{getWorkspaceFromId:()=>workspace}},
        {get:()=>enabled});
      manager.popup=popup;manager.decorate();
      const image=item.querySelector('img');
      if(image)await new Promise(resolve=>{
        if(image.complete)resolve();else image.addEventListener('error',resolve,{once:true});
      });
      const glyph=item.querySelector('.better-zen-folders-space-icon');
      const fallback=glyph.querySelector('.better-zen-folders-space-default-icon');
      const decorated={count:glyph.children.length,tag:fallback?.localName,text:glyph.textContent,
        hidden:fallback?.getAttribute('aria-hidden'),images:glyph.querySelectorAll('img').length,
        label:item.getAttribute('label'),command:item.getAttribute('command')};
      manager.decorate(); // Reopening must not accumulate default glyphs.
      const nextImage=item.querySelector('img');
      if(nextImage)nextImage.dispatchEvent(new Event('error'));
      const repeated=item.querySelectorAll('.better-zen-folders-space-default-icon').length;
      enabled=false;manager.decorate();
      const off={children:item.children.length,nodes:manager.decorations.get(item).nodes.length};
      manager.clearDecoration();
      return {decorated,repeated,off,restored:item.getAttribute('label'),workspace};
    },{source,workspace});
    assert.deepEqual(result.decorated,{count:1,tag:'svg',text:'',hidden:'true',images:0,
      label:workspace.name,command:'native-move'});
    assert.equal(result.repeated,1);
    assert.deepEqual(result.off,{children:0,nodes:0},'decoration-off mode owns no glyph nodes');
    assert.equal(result.restored,'native label');
    assert.deepEqual(result.workspace,workspace,'decoration must not persist a fallback icon');
  }finally{await browser.close();}
});

for (const [name, entries, expected] of [
  ['solid RGB', [{c:[12,34,56]}], 'rgb(12, 34, 56)'],
  ['custom', [{c:'#ab1234',isCustom:true}], '#ab1234'],
  ['mixed gradient', [{c:'#ab1234'}, {c:[12,34,56]}], 'linear-gradient(180deg, #ab1234, rgb(12, 34, 56))'],
  ['empty', [], null], ['absent', undefined, null], ['malformed', [{c:[12,34]}], null],
  ['out of range', [{c:[12,34,999]}], null], ['unsafe CSS', [{c:'url(secret)'}], null],
]) test(`Space palette preview: ${name}`,()=>{
  const css={supports:(property,value)=>property==='color'&&/^#[a-f0-9]{6}$/i.test(value)};
  const theme={gradientColors:entries};const before=JSON.stringify(theme);
  assert.equal(spaceThemeMarker({theme},css),expected);assert.equal(JSON.stringify(theme),before);
});

test('native move menus split reversibly, refresh generations and decorate Spaces without replacing commands',{skip:!modulePath},async()=>{
  const {chromium}=createRequire(import.meta.url)(modulePath),browser=await chromium.launch({headless:true});
  try {
    const page=await browser.newPage(); await page.route('**/*',r=>r.abort());
    const result=await page.evaluate(async ({source,cssSource})=>{
      const url=URL.createObjectURL(new Blob([source],{type:'text/javascript'})),api=await import(url);URL.revokeObjectURL(url);
      if(!api.SpaceMoveMenuManager)return {missing:true};
      document.createXULElement=n=>document.createElement(n);
      document.body.innerHTML=`<menupopup id="tabContextMenu"><menu id="context_zenMoveToFolder"></menu><menuitem id="other"></menuitem><menu id="context_moveTabOptions" label="Move Tab" data-l10n-id="native"><menupopup id="moveTabOptionsMenu"><menuitem id="context_moveToStart"></menuitem><menuitem id="context_moveToEnd"></menuitem><menuitem id="context_openTabInWindow"></menuitem><menuitem id="profile-extra"></menuitem></menupopup></menu></menupopup><menupopup id="zenFolderActions"><menu id="context_zenChangeFolderSpace" label="Change Space" data-l10n-id="folder-native"><menupopup></menupopup></menu></menupopup>`;
      const style=document.createElement('style');style.textContent='menuitem{display:flex;align-items:center}.menu-icon{display:block;width:16px;height:16px}'+cssSource;document.head.appendChild(style);
      const tab=document.getElementById('tabContextMenu'),native=document.getElementById('moveTabOptionsMenu'),folder=document.querySelector('#context_zenChangeFolderSpace > menupopup');
      let rows=[{uuid:'a',name:'Alpha',icon:'🌿',theme:{gradientColors:[{c:'red',isCustom:true},{c:'blue',isCustom:true}]}},{uuid:'b',name:'Beta',icon:'data:image/png;base64,xx#zen-icon.svg',theme:{gradientColors:[{c:[0,128,0]}]}}];
      let nativeCalls=0,arranged=0,folderCalls=0; const receivers=[];
      const spaces={activeWorkspace:'current',privateWindowOrDisabled:false,getWorkspaceFromId:id=>rows.find(w=>w.uuid===id),
        updateWorkspacesChangeContextMenu(){nativeCalls++;receivers.push(this===spaces);native.querySelectorAll('.zen-workspace-context-menu-item').forEach(n=>n.remove());for(const w of rows){const n=document.createElement('menuitem');n.className='zen-workspace-context-menu-item';n.setAttribute('zen-workspace-id',w.uuid);n.setAttribute('label',w.name);n.setAttribute('command','cmd_zenChangeWorkspaceTab');native.prepend(n);}return 17;}};
      const context={contextTab:{hidden:false},_ensureMenuArranged(){arranged++;if(document.getElementById('better-zen-folders-move-space'))throw Error('owned node leaked to native arranger');if(tab.children[1].id!=='other')throw Error('native order not restored');return 23;}};
      const picker={currentOpacity:.4,useAlgo:'before',getGradientForWorkspace(){throw Error('menu must not invoke the stateful picker');}};
      const vals={decorateMoveToFolderMenu:true,commandIconMode:'mod'},subs=new Map(),preferences={get:n=>vals[n],subscribe:(n,fn)=>{subs.set(n,fn);return()=>subs.delete(n);}};
      const host={document,TabContextMenu:context,gZenWorkspaces:spaces,gZenThemePicker:picker,CSS,console};
      const original=spaces.updateWorkspacesChangeContextMenu,arranger=context._ensureMenuArranged;
      spaces.updateWorkspacesChangeContextMenu();
      const f=document.createElement('menuitem');f.className='zen-workspace-context-menu-item';f.setAttribute('zen-workspace-id','a');f.setAttribute('label','🌿  Alpha');f.setAttribute('image','original.svg');f.setAttribute('type','radio');f.setAttribute('checked','true');f.innerHTML='<img class="menu-icon"><label class="menu-text"></label>';f.addEventListener('command',()=>folderCalls++);folder.appendChild(f);
      const manager=new api.SpaceMoveMenuManager(host,preferences);manager.start();
      const show=n=>n.dispatchEvent(new Event('popupshowing',{bubbles:true}));show(tab);show(folder);
      const menu=document.getElementById('better-zen-folders-move-space'),popup=menu.firstElementChild;
      const order=[...tab.children].map(n=>n.id), first=popup.querySelector('[zen-workspace-id="a"]');
      const decorated=first.classList.contains('better-zen-folders-space-destination'),label=first.getAttribute('label'),marker=first.querySelector('.better-zen-folders-space-colour')?.style.background;
      const command=first.getAttribute('command');f.dispatchEvent(new Event('command',{bubbles:true}));
      const check=f.getAttribute('checked'),name=document.getElementById('context_zenChangeFolderSpace').getAttribute('label');
      const checkSlot=getComputedStyle(f.querySelector('.menu-icon')).display,radioArtwork=f.getAttribute('image');
      const pointer=getComputedStyle(first.querySelector('.better-zen-folders-space-icon')).pointerEvents;
      const arrResult=context._ensureMenuArranged();show(tab);
      rows=[{uuid:'a',name:'Renamed',icon:'⭐',theme:{gradientColors:[{c:'red'},{c:'blue'}]}}];const rebuild=spaces.updateWorkspacesChangeContextMenu();
      const fresh=[...popup.querySelectorAll('[zen-workspace-id]')].map(n=>[n.getAttribute('zen-workspace-id'),n.getAttribute('label')]);
      vals.decorateMoveToFolderMenu=false;subs.get('decorateMoveToFolderMenu')();const plain=!popup.querySelector('.better-zen-folders-space-colour');
      rows=[];spaces.updateWorkspacesChangeContextMenu();const empty=menu.hidden;
      const extras=[...native.children].map(n=>n.id);
      manager.destroy();manager.destroy();
      return {order,decorated,label,marker,command,check,name,folderCalls,arrResult,arranged,rebuild,fresh,plain,empty,extras,checkSlot,radioArtwork,pointer,restoredImage:f.getAttribute('image'),receiver:receivers.every(Boolean),picker:[picker.currentOpacity,picker.useAlgo],restored:spaces.updateWorkspacesChangeContextMenu===original&&context._ensureMenuArranged===arranger,owned:!!document.getElementById('better-zen-folders-move-space'),afterOrder:[...tab.children].map(n=>n.id),afterLabel:document.getElementById('context_moveTabOptions').getAttribute('data-l10n-id'),folderLabel:document.getElementById('context_zenChangeFolderSpace').getAttribute('label'),subs:subs.size};
    },{source,cssSource});
    assert.equal(result.missing,undefined,'Space move manager exists');
    assert.deepEqual(result.order,['context_zenMoveToFolder','better-zen-folders-move-space','context_moveTabOptions','other']);
    assert.equal(result.decorated,true);assert.equal(result.label,'Alpha');assert.match(result.marker,/linear-gradient/);
    assert.equal(result.command,'cmd_zenChangeWorkspaceTab');assert.equal(result.check,'true');assert.equal(result.folderCalls,1);assert.equal(result.name,'Move to Space');
    assert.notEqual(result.checkSlot,'none','native check slot is not hidden by decoration');assert.equal(result.radioArtwork,null);assert.equal(result.restoredImage,'original.svg');assert.equal(result.pointer,'none');
    assert.equal(result.arrResult,23);assert.equal(result.rebuild,17);assert.equal(result.receiver,true);assert.deepEqual(result.picker,[.4,'before']);
    assert.deepEqual(result.fresh,[['a','Renamed']]);assert.equal(result.plain,true);assert.equal(result.empty,true);
    assert.deepEqual(result.extras,['context_moveToStart','context_moveToEnd','context_openTabInWindow','profile-extra']);
    assert.equal(result.restored,true);assert.equal(result.owned,false);assert.deepEqual(result.afterOrder,['context_zenMoveToFolder','other','context_moveTabOptions']);
    assert.equal(result.afterLabel,'native');assert.equal(result.folderLabel,'Change Space');assert.equal(result.subs,0);
  }finally{await browser.close();}
});
