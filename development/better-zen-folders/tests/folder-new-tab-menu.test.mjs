import test from 'node:test';
import assert from 'node:assert/strict';
import {FolderButtonManager} from '../scripts/better-zen-folders.uc.mjs';
import {FakeElement, makeFolderButtonFixture, makeRecordingNewTabTransaction} from './fakes.mjs';

function fixture(visibility = 'hover') {
  const transaction = makeRecordingNewTabTransaction();
  const f = makeFolderButtonFixture({newTabTransaction:transaction, newTabButtonVisibility:visibility, regularFolderCount:2});
  const menu = new FakeElement('menupopup'), native = new FakeElement('menuitem');
  menu.id = 'zenFolderActions'; native.id = 'context_zenFolderNewSubfolder'; menu.appendChild(native);
  let context = f.folder, icons = 'mod', iconSubscriber;
  const get = f.adapters.preferences.get;
  const subscribe = f.adapters.preferences.subscribe;
  f.adapters.preferences.get = name => name === 'commandIconMode' ? icons : get(name);
  f.adapters.preferences.subscribe = (name, callback) => name === 'commandIconMode'
    ? (iconSubscriber=callback, () => {iconSubscriber=null;}) : subscribe(name,callback);
  Object.assign(f.adapters, {
    folderMenu:() => menu, getContextFolder:() => context,
    createMenuItem:() => new FakeElement('menuitem'), menuInsertionPoint:() => native,
  });
  const manager = new FolderButtonManager(f.adapters);
  const show = () => menu.listeners.get('popupshowing')?.({target:menu});
  return {...f, manager, transaction, menu, native, show,
    command:() => menu.children.find(n => n.id === 'better-zen-folders-new-tab-menu'),
    context:value => {context=value;}, icons:value => {icons=value;iconSubscriber?.(value);}};
}

test('folder menu and hover plus use the same transaction and preserve native menu items', () => {
  const f=fixture();f.manager.start();f.show();
  const command=f.command();assert.ok(command, 'New Tab in Folder must exist in the context menu');
  assert.equal(command.getAttribute('label'),'New Tab in Folder');assert.equal(command.hidden,false);
  assert.deepEqual(f.menu.children,[command,f.native]);
  command.dispatch('command');f.ownedButtons()[0].dispatch('command');
  assert.deepEqual(f.transaction.activations,[f.folder,f.folder]);
  f.context(f.folders[1]);f.show();command.dispatch('command');
  assert.equal(f.transaction.activations.at(-1),f.folders[1]);
  f.manager.destroy();assert.deepEqual(f.menu.children,[f.native]);assert.equal(f.menu.listeners.has('popupshowing'),false);
});

test('context action survives hiding the hover button and honours decorative icon setting', () => {
  const f=fixture('hidden');f.manager.start();f.show();
  assert.equal(f.ownedButtons().length,0);
  const command=f.command();assert.ok(command);assert.ok(command.getAttribute('image'));
  f.icons('compatibility');assert.equal(command.getAttribute('image'),null);
  assert.equal(command.getAttribute('data-better-zen-folders-command-icon-mode'),'compatibility');
  f.icons('off');assert.equal(command.getAttribute('image'),null);assert.equal(command.hidden,false);
  command.dispatch('command');assert.deepEqual(f.transaction.activations,[f.folder]);f.manager.destroy();
});

test('menu rejects live, absent and disconnected folder context without retaining an old target', () => {
  const f=fixture();f.manager.start();f.show();const command=f.command();assert.ok(command);
  for(const bad of [null,{...f.folder,isLiveFolder:true},{...f.folder,isConnected:false}]) {
    f.context(bad);f.show();assert.equal(command.hidden,true);command.dispatch('command');
  }
  assert.deepEqual(f.transaction.activations,[]);f.manager.destroy();
});

test('new-tab reconciliation never mistakes the Sticky control for a plus or removes it',()=>{
  const f=fixture();const sticky=new FakeElement('button');
  sticky.setAttribute('class','better-zen-folders-sticky-toggle');
  sticky.setAttribute('data-better-zen-folders-owned','true');f.row.appendChild(sticky);
  f.manager.start();
  assert.equal(f.row.children.filter(n=>n.classList.contains('better-zen-folders-new-tab-button')).length,1);
  f.setVisibility('hidden');assert.equal(sticky.parentNode,f.row);
  f.setVisibility('hover');f.manager.destroy();assert.equal(sticky.parentNode,f.row);
});
