import test from 'node:test';
import assert from 'node:assert/strict';
import {setBzfCommandIcon, BetterZenFoldersPreferences, createBrowserPreferenceAdapters,
  FolderColorMenuManager, createBrowserFolderColorMenuAdapters} from '../scripts/better-zen-folders.uc.mjs';
import {FakeElement, makePreferenceFixture} from './fakes.mjs';

const property = 'better-zen-folders.command-icon-mode';
const legacy = 'better-zen-folders.show-folder-colour-menu-icon';
const modeAttribute = 'data-better-zen-folders-command-icon-mode';
const fallback = '--better-zen-folders-command-image';
function node(id = 'better-zen-folders-folder-colour') {
  const item = new FakeElement('menuitem'); item.id = id;
  item.classList.remove = (...names) => names.forEach(name => item._classes.delete(name));
  const styles = new Map();
  item.style = {getPropertyValue: key => styles.get(key)?.value ?? '',
    getPropertyPriority: key => styles.get(key)?.priority ?? '',
    setProperty: (key,value,priority='') => styles.set(key,{value,priority}),
    removeProperty: key => styles.delete(key)};
  return item;
}

// Break caught: legacy false becomes enabled, or a stored new mode is ignored.
for (const [old, current, want] of [[false,undefined,'off'],[true,undefined,'mod'],
  [undefined,undefined,'mod'],[false,'compatibility','compatibility'],[false,'mod','mod'],[true,'off','off']]) {
  test(`icon mode migration ${old}/${current} -> ${want}`, () => {
    const f = makePreferenceFixture();
    if (old !== undefined) f.set(legacy,old);
    if (current !== undefined) f.set(property,current);
    const p = new BetterZenFoldersPreferences(createBrowserPreferenceAdapters(f.host)); p.start();
    assert.equal(p.get('commandIconMode'),want);
    if (old !== undefined) assert.equal(f.get(property),want);
    const changes=[];p.subscribe('commandIconMode',value=>changes.push(value));
    f.set(property,'compatibility');f.notify(property);
    f.set(property,'off');f.notify(property);
    assert.equal(p.get('commandIconMode'),'off');
    assert.equal(changes.at(-1),'off');p.destroy();
  });
}

test('BZF icon modes switch painting channels and release their own changes', () => {
  const item=node(); item.style.setProperty(fallback,'original','important');
  for (const mode of ['mod','compatibility','off','mod','off']) {
    setBzfCommandIcon(item,'bzf.svg',mode);
    assert.equal(item.getAttribute('image'),mode === 'mod' ? 'bzf.svg' : null);
    assert.equal(item.classList.contains('menuitem-iconic'),mode === 'mod');
    assert.equal(item.getAttribute(modeAttribute),mode === 'off' ? null : mode);
    assert.equal(item.style.getPropertyValue('--menu-image'),'');
    assert.equal(item.style.getPropertyValue(fallback),mode === 'compatibility' ? 'url("bzf.svg")' : 'original');
  }
  assert.equal(item.style.getPropertyPriority(fallback),'important');
});

test('legacy Off migrates even when Sine registers a default-branch Mod Icons value', () => {
  const f=makePreferenceFixture();f.set(legacy,false);f.set(property,'mod');
  const userValues=new Set([legacy]);
  f.host.Services.prefs.prefHasUserValue=key=>userValues.has(key);
  const write=f.host.Services.prefs.setStringPref;
  f.host.Services.prefs.setStringPref=(key,value)=>{userValues.add(key);write(key,value);};
  const p=new BetterZenFoldersPreferences(createBrowserPreferenceAdapters(f.host));p.start();
  assert.equal(p.get('commandIconMode'),'off');assert.equal(f.get(property),'off');
  f.set(property,'compatibility');f.notify(property);
  f.set(legacy,true);f.notify(legacy);
  assert.equal(p.get('commandIconMode'),'compatibility');p.destroy();
});

test('Off and subsequent refresh preserve later external image and custom property writers', () => {
  const item=node();setBzfCommandIcon(item,'bzf.svg','mod');
  item.setAttribute('image','external.svg');
  item.style.setProperty('--menu-image','url("cmi.svg")','important');
  for (const mode of ['off','compatibility','mod','off']) setBzfCommandIcon(item,'bzf.svg',mode);
  assert.equal(item.getAttribute('image'),'external.svg');
  assert.equal(item.classList.contains('menuitem-iconic'),true);
  assert.equal(item.style.getPropertyValue('--menu-image'),'url("cmi.svg")');
  assert.equal(item.style.getPropertyPriority('--menu-image'),'important');
});

for (const [attribute, value] of [['srcset','external.svg 1x'],['src','external.svg']]) {
test(`releasing an inherited native image preserves a later direct-slot ${attribute} replacement`, () => {
  const item=node(), slot=node('slot');item.querySelector=()=>slot;
  const set=item.setAttribute.bind(item), remove=item.removeAttribute.bind(item);
  item.setAttribute=(key,value)=>{set(key,value);if(key==='image')slot.setAttribute('srcset',value);};
  item.removeAttribute=key=>{remove(key);if(key==='image')slot.removeAttribute('srcset');};
  setBzfCommandIcon(item,'bzf.svg','mod');slot.setAttribute(attribute,value);
  setBzfCommandIcon(item,null,'off');
  assert.equal(item.getAttribute('image'),null);assert.equal(slot.getAttribute(attribute),value);
  assert.equal(item.classList.contains('menuitem-iconic'),true);
});
}

test('functional checkboxes and unrelated native commands are never decorated', () => {
  for (const id of ['context_zenFolderNewSubfolder','context_zenFolderRename','unknown-command',
    'better-zen-folders-sticky-folder','better-zen-folders-sticky-tab']) {
    const item=node(id);item.setAttribute('type','checkbox');item.setAttribute('checked','true');
    item.setAttribute('image','external.svg');
    for(const mode of ['off','mod','compatibility']) setBzfCommandIcon(item,'bzf.svg',mode);
    assert.equal(item.getAttribute('image'),'external.svg');
    assert.equal(item.getAttribute('checked'),'true');
    assert.equal(item.getAttribute(modeAttribute),null);
  }
});

test('native folder commands stay untouched while the owned Colour command changes live', () => {
  const menu=node('zenFolderActions');
  const ids=['Rename','ChangeIcon','UnloadAll','NewSubfolder','ToSpace','Unpack','Delete'];
  const natives=[...ids.map(s=>node(`context_zenFolder${s}`)),node('context_zenChangeFolderSpace'),node('context_zenShareFolder')];
  for(const item of natives) menu.appendChild(item);
  let mode='mod',subscriber;
  const preferences={get:name=>name==='commandIconMode'?mode:true,
    subscribe:(name,callback)=>{subscriber=callback;return()=>{subscriber=null;};}};
  const host={document:{getElementById:id=>id===menu.id?menu:menu.children.find(n=>(n.id||n.getAttribute('id'))===id),
    createXULElement:()=>node(''),popupNode:{isZenFolder:true}},
    getComputedStyle:()=>({getPropertyValue:()=>''})};
  const manager=new FolderColorMenuManager(createBrowserFolderColorMenuAdapters(host,preferences),{getColor:()=>null});
  manager.start();
  const colour=manager.menuItem;
  for(mode of ['mod','compatibility','off']) {
    subscriber(mode);manager.onPopupShowing({target:menu});
    assert.equal(colour.getAttribute('image')!==null,mode==='mod');
    assert.equal(colour.getAttribute(modeAttribute),mode==='off'?null:mode);
    for(const item of natives) assert.equal(item.getAttribute('image'),null,item.id);
  }
  manager.destroy();assert.equal(subscriber,null);
});
