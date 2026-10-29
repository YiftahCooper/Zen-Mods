import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const modulePath=process.env.BZF_PLAYWRIGHT_MODULE;
const source=await readFile(new URL('../scripts/better-zen-folders.uc.mjs',import.meta.url),'utf8');

test('folder Move to Folder menu is scoped, native-command operable, preference-aware and fully cleaned up',{skip:!modulePath},async()=>{
  const {chromium}=createRequire(import.meta.url)(modulePath),browser=await chromium.launch({headless:true});
  try {
    const page=await browser.newPage();await page.route('**/*',r=>r.abort());
    const result=await page.evaluate(async source=>{
      const url=URL.createObjectURL(new Blob([source],{type:'text/javascript'})),api=await import(url);URL.revokeObjectURL(url);
      if(!api.FolderMoveMenuManager)return {missing:true};
      document.body.innerHTML='<menupopup id="zenFolderActions"><menuitem id="context_zenChangeFolderSpace"></menuitem></menupopup><div id="pins"></div>';
      document.createXULElement=name=>document.createElement(name);
      const pins=document.getElementById('pins'),root=document.getElementById('zenFolderActions');
      const make=id=>{
        const f=document.createElement('zen-folder');f.id=f.label=id;f.isZenFolder=true;f.collapsed=true;
        f.setAttribute('zen-workspace-id','current');f.innerHTML='<div class="tab-group-label-container"></div><div class="tab-group-container"><tab pinned="true" zen-empty-tab="true"></tab></div>';
        f.groupContainer=f.lastElementChild;Object.defineProperty(f,'group',{get:()=>f.parentElement.closest('zen-folder')});
        for(const t of f.querySelectorAll('tab'))t.pinned=true;pins.appendChild(f);return f;
      };
      const moving=make('Moving'),target=make('Target');
      const first=document.createElement('tab'),last=document.createElement('tab');
      first.id='First';last.id='Last';first.pinned=last.pinned=true;target.groupContainer.append(first,last);
      const values={movedFolderPosition:'top',decorateMoveToFolderMenu:true,commandIconMode:'mod',menuIconSizePercent:'120'},listeners=new Set();
      const types={invalid:0,string:32,number:64,boolean:128};
      const entry=property=>Object.entries(api.PREFERENCE_DEFINITIONS).find(([,d])=>d.property===property);
      const prefs=new api.BetterZenFoldersPreferences({prefTypes:types,
        getPrefType:property=>{const e=entry(property);return e&&Object.hasOwn(values,e[0])?types[e[1].kind]:0;},
        read:(kind,property)=>values[entry(property)[0]],write:(kind,property,value)=>{values[entry(property)[0]]=value;},
        clearUserPref:property=>{delete values[entry(property)[0]];},
        addObserver:cb=>listeners.add(cb),removeObserver:cb=>listeners.delete(cb),warn(){}});
      prefs.start();
      const set=(n,v)=>{values[n]=v;for(const cb of listeners)cb(null,'nsPref:changed',api.PREFERENCE_DEFINITIONS[n].property);};
      let receiverCalls=0;
      const host={document,gZenWorkspaces:{activeWorkspace:'current'},gZenFolders:{canDropElement:()=>true},Services:{prefs:{getIntPref:()=>5}},
        gBrowser:{tabGroups:[moving,target],isTab:n=>n.localName==='tab',moveTabBefore:(n,t)=>{receiverCalls++;t.hasAttribute('zen-empty-tab')?t.after(n):t.before(n);},moveTabAfter:(n,t)=>{receiverCalls++;t.after(n);}},console};
      const manager=new api.FolderMoveMenuManager(host,prefs,{getColor:()=> '#80c69a'},new api.FolderPopulationRegistry());manager.start();
      const show=(menu,trigger)=>{menu.triggerNode=trigger;menu.dispatchEvent(new Event('popupshowing',{bubbles:true}));};
      show(root,moving);
      const submenu=document.getElementById('better-zen-folders-move-folder'),popup=submenu.firstElementChild;
      const command=()=>popup.querySelector('menuitem');show(popup);
      const initial={label:submenu.getAttribute('label'),hidden:submenu.hidden,icon:!!submenu.getAttribute('image'),destinations:[...popup.children].map(x=>x.getAttribute('label')),decorated:command().classList.contains('better-zen-folders-decorated-folder-item')};
      set('decorateMoveToFolderMenu',false);show(popup);const plain=command().classList.contains('better-zen-folders-plain-folder-item');
      set('commandIconMode','off');const off=submenu.getAttribute('image');
      command().dispatchEvent(new Event('command',{bubbles:true,cancelable:true}));const moved=moving.group===target;
      const top=target.groupContainer.children[1]===moving;
      show(root,moving);show(popup);set('movedFolderPosition','bottom');
      command().dispatchEvent(new Event('command',{bubbles:true,cancelable:true}));
      const bottom=target.groupContainer.lastElementChild===moving;
      show(root,moving);show(popup);target.remove();command()?.dispatchEvent(new Event('command',{bubbles:true}));
      show(root,null);const hidden=submenu.hidden;
      root.dispatchEvent(new Event('popuphidden'));manager.destroy();manager.destroy();
      prefs.destroy();
      return {initial,plain,off,moved,top,bottom,hidden,receiverCalls,nativeStillHere:!!document.getElementById('context_zenChangeFolderSpace'),ownedRemaining:!!document.getElementById('better-zen-folders-move-folder'),listeners:listeners.size};
    },source);
    assert.equal(result.missing,undefined,'Move Folder manager is installed');
    assert.deepEqual(result.initial,{label:'Move to Folder',hidden:false,icon:true,destinations:['Target'],decorated:true});
    assert.equal(result.plain,true);assert.equal(result.off,null);assert.equal(result.moved,true);assert.equal(result.hidden,true);
    assert.equal(result.top,true);assert.equal(result.bottom,true);
    assert.equal(result.receiverCalls,2,'stale destination never calls native receiver');
    assert.equal(result.nativeStillHere,true);assert.equal(result.ownedRemaining,false);assert.equal(result.listeners,0);
  }finally{await browser.close();}
});
