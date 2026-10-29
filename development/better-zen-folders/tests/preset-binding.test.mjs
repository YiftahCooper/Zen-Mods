import test from 'node:test';
import assert from 'node:assert/strict';
import {FolderColorManager,FolderColorMenuManager,FOLDER_COLOR_LEDGER_PREF,createBrowserFolderColorAdapters,createBrowserRestoreAdapters} from '../scripts/better-zen-folders.uc.mjs';
import {makePresetBindingFixture} from './preset-binding.fixture.mjs';

test('a folder explicitly assigned a preset follows later edits without rewriting its fallback hex',t=>{
 const f=makePresetBindingFixture(t),folder=f.add('linked'),manager=f.start();
 manager.setColor(folder,'#51c67c');manager.setPresetColor?.(folder,4);
 const before=f.get(FOLDER_COLOR_LEDGER_PREF);
 f.change('palette-4','#aaddbb');f.change('custom-palette-enabled',true);
 assert.equal(manager.getColor(folder),'#aaddbb');
 assert.equal(folder.getAttribute('data-better-zen-folders-color'),'#aaddbb');
 assert.equal(f.get(FOLDER_COLOR_LEDGER_PREF),before,'legacy fallback stays independently readable');
 assert.equal(manager.getPresetIndex(folder),4);
 assert.deepEqual(f.events.at(-1),{folder,color:'#aaddbb'});
});

test('custom and legacy colours are never linked by matching a preset hex',t=>{
 const f=makePresetBindingFixture(t),custom=f.add('custom'),legacy=f.add('legacy');
 f.set(FOLDER_COLOR_LEDGER_PREF,JSON.stringify({version:1,entries:[{id:'legacy',color:'#51c67c',updatedAt:1}]}));
 const manager=f.start();manager.setColor(custom,'#51c67c');
 f.change('custom-palette-enabled',true);f.change('palette-4','#aaddbb');
 assert.equal(manager.getColor(custom),'#51c67c');assert.equal(manager.getColor(legacy),'#51c67c');
 assert.equal(manager.getPresetIndex(custom),null);assert.equal(manager.getPresetIndex(legacy),null);
});

test('choosing a custom colour equal to the currently resolved preset detaches it',t=>{
 const f=makePresetBindingFixture(t),folder=f.add('linked'),manager=f.start();
 manager.setPresetColor(folder,4);f.change('custom-palette-enabled',true);f.change('palette-4','#aaddbb');
 assert.equal(manager.setColor(folder,'#aaddbb'),true);assert.equal(manager.getPresetIndex(folder),null);
 f.change('palette-4','#bbddaa');assert.equal(manager.getColor(folder),'#aaddbb');
});

test('Reset removes both the colour and its preset association',t=>{
 const f=makePresetBindingFixture(t),folder=f.add('linked'),manager=f.start();manager.setPresetColor(folder,4);
 assert.equal(manager.clearColor(folder),true);f.change('custom-palette-enabled',true);f.change('palette-4','#aaddbb');
 assert.equal(manager.getColor(folder),null);assert.equal(manager.getPresetIndex(folder),null);
 assert.equal(folder.getAttribute('data-better-zen-folders-color'),null);
});

test('bindings survive a new manager lifetime while the old-format fallback remains readable',t=>{
 const f=makePresetBindingFixture(t),folder=f.add('linked'),manager=f.start();manager.setPresetColor(folder,4);
 f.change('custom-palette-enabled',true);f.change('palette-4','#aaddbb');manager.destroy();
 const reloaded=f.start();assert.equal(reloaded.getPresetIndex(folder),4);assert.equal(reloaded.getColor(folder),'#aaddbb');
 const raw=JSON.parse(f.get(FOLDER_COLOR_LEDGER_PREF));assert.equal(raw.version,1);
 assert.deepEqual(Object.keys(raw.entries[0]).sort(),['color','id','updatedAt']);assert.equal(raw.entries[0].color,'#51c67c');
 const legacy=createBrowserFolderColorAdapters(f.host);delete legacy.readBindings;delete legacy.writeBindings;
 const legacyManager=new FolderColorManager(legacy);legacyManager.start();
 try{assert.equal(legacyManager.getColor(folder),'#51c67c');}finally{legacyManager.destroy();}
});

test('preset enablement and per-swatch Reset affect only followers of that slot',t=>{
 const f=makePresetBindingFixture(t),a=f.add('a'),b=f.add('b'),manager=f.start();manager.setPresetColor(a,4);manager.setPresetColor(b,6);
 f.change('palette-4','#aaddbb');f.change('palette-6','#aaccee');f.change('custom-palette-enabled',true);
 assert.equal(manager.getColor(a),'#aaddbb');assert.equal(manager.getColor(b),'#aaccee');
 f.change('palette-4','#51c67c');assert.equal(manager.getColor(a),'#51c67c');assert.equal(manager.getColor(b),'#aaccee');
 f.change('custom-palette-enabled',false);assert.equal(manager.getColor(b),'#5f95eb');
 f.change('custom-palette-enabled',true);assert.equal(manager.getColor(b),'#aaccee');
});

test('same-hex writes from a legacy writer invalidate a stale association by revision',t=>{
 const f=makePresetBindingFixture(t),folder=f.add('linked'),manager=f.start();manager.setPresetColor(folder,4);
 const raw=JSON.parse(f.get(FOLDER_COLOR_LEDGER_PREF));raw.entries[0].updatedAt+=10;
 f.set(FOLDER_COLOR_LEDGER_PREF,JSON.stringify(raw));f.notify(FOLDER_COLOR_LEDGER_PREF);
 f.change('custom-palette-enabled',true);f.change('palette-4','#aaddbb');
 assert.equal(manager.getPresetIndex(folder),null);assert.equal(manager.getColor(folder),'#51c67c');
});

test('two live window managers observe preset selection, palette edits and custom detachment',t=>{
 const f=makePresetBindingFixture(t),folder=f.add('linked'),a=f.start(),b=f.start();a.setPresetColor(folder,4);
 f.change('custom-palette-enabled',true);f.change('palette-4','#aaddbb');
 assert.equal(b.getColor(folder),'#aaddbb');assert.equal(b.getPresetIndex(folder),4);
 b.setColor(folder,'#123456');assert.equal(a.getPresetIndex(folder),null);assert.equal(a.getColor(folder),'#123456');
 f.change('palette-4','#ffbbbb');assert.equal(a.getColor(folder),'#123456');assert.equal(b.getColor(folder),'#123456');
});

test('an intervening custom save is reconciled before a later unrelated save',t=>{
 const f=makePresetBindingFixture(t),x=f.add('x'),y=f.add('y'),a=f.start(),b=f.start();
 a.setColor(x,'#123456');
 const dispatch=b.adapters.dispatchColorChanged;let intervened=false;
 b.adapters.dispatchColorChanged=(folder,color)=>{
  dispatch(folder,color);
  if(!intervened){intervened=true;assert.equal(b.setColor(x,'#222222'),true);}
 };
 a.setPresetColor(x,4);
 assert.equal(a.getColor(x),'#222222');assert.equal(a.getPresetIndex(x),null);
 assert.equal(b.getColor(x),'#222222');
 assert.equal(a.setColor(y,'#abcdef'),true);
 assert.equal(a.getColor(x),'#222222');assert.equal(b.getColor(x),'#222222');
 assert.equal(JSON.parse(f.get(FOLDER_COLOR_LEDGER_PREF)).entries.find(e=>e.id==='x').color,'#222222');
});

test('failed preset compensation preserves a successful intervening save',t=>{
 const f=makePresetBindingFixture(t),x=f.add('x'),y=f.add('y'),a=f.start(),b=f.start();
 a.setColor(x,'#123456');a.setColor(y,'#abcdef');
 const dispatch=b.adapters.dispatchColorChanged;let intervened=false;
 b.adapters.dispatchColorChanged=(folder,color)=>{
  dispatch(folder,color);
  if(!intervened){intervened=true;assert.equal(b.setColor(x,'#222222'),true);}
 };
 a.adapters.writeBindings=()=>{throw Error('synthetic association failure');};
 assert.equal(a.setPresetColor(x,4),false);
 for(const manager of [a,b]){
  assert.equal(manager.getColor(x),'#222222');assert.equal(manager.getPresetIndex(x),null);
  assert.equal(manager.getColor(y),'#abcdef');
 }
 assert.equal(JSON.parse(f.get(FOLDER_COLOR_LEDGER_PREF)).entries.find(e=>e.id==='x').color,'#222222');
});

test('compensation after an association-write exception preserves another folder save',t=>{
 const f=makePresetBindingFixture(t),x=f.add('x'),y=f.add('y'),a=f.start(),b=f.start();
 a.setColor(x,'#123456');a.setColor(y,'#abcdef');
 const write=a.adapters.writeBindings;let intervened=false;
 a.adapters.writeBindings=value=>{
  write(value);
  if(!intervened){intervened=true;assert.equal(b.setPresetColor(y,6),true);
   throw Error('synthetic failure after storage notified another writer');}
 };
 assert.equal(a.setPresetColor(x,4),false);
 for(const manager of [a,b]){
  assert.equal(manager.getColor(y),'#5f95eb');assert.equal(manager.getPresetIndex(y),6);
 }
 assert.equal(JSON.parse(f.get(FOLDER_COLOR_LEDGER_PREF)).entries.find(e=>e.id==='y').color,'#5f95eb');
});

test('a failed association write rolls back the selected colour and keeps other folders intact',t=>{
 const f=makePresetBindingFixture(t),a=f.add('a'),b=f.add('b'),manager=f.start();manager.setColor(a,'#123456');manager.setColor(b,'#abcdef');
 const before=f.get(FOLDER_COLOR_LEDGER_PREF),native=manager.adapters.writeBindings;
 manager.adapters.writeBindings=()=>{throw Error('synthetic association storage failure');};
 assert.equal(manager.setPresetColor(a,4),false);assert.equal(manager.getColor(a),'#123456');assert.equal(manager.getColor(b),'#abcdef');
 assert.equal(f.get(FOLDER_COLOR_LEDGER_PREF),before);assert.equal(manager.getPresetIndex(a),null);assert.ok(f.warnings.length);
 manager.adapters.writeBindings=native;
});

test('captured owned state restores the preset link, not just its then-current hex',t=>{
 const f=makePresetBindingFixture(t),folder=f.add('linked'),manager=f.start();manager.setPresetColor(folder,4);
 const saved=manager.captureLedgerState(folder);manager.setColor(folder,'#123456');
 assert.equal(manager.restoreLedgerState(folder,saved),true);f.change('custom-palette-enabled',true);f.change('palette-4','#aaddbb');
 assert.equal(manager.getPresetIndex(folder),4);assert.equal(manager.getColor(folder),'#aaddbb');
});

test('destroy releases palette and ledger observers while retaining stored links',t=>{
 const f=makePresetBindingFixture(t),folder=f.add('linked'),before=f.observerCount(),manager=f.start();manager.setPresetColor(folder,4);
 manager.destroy();assert.equal(f.observerCount(),before);
 f.change('custom-palette-enabled',true);f.change('palette-4','#aaddbb');assert.equal(folder.getAttribute('data-better-zen-folders-color'),null);
});

test('the Folder Colour command wires an explicit preset action rather than reducing it to a hex',t=>{
 const f=makePresetBindingFixture(t),folder=f.add('linked'),manager=f.start();manager.setColor(folder,'#51c67c');
 const menu=new EventTarget(),item={};let actions;
 const ui=new FolderColorMenuManager({menuTarget:()=>menu,ensureMenuItem:()=>item,openPicker:(_folder,_color,value)=>{actions=value;}},manager);
 ui.start();t.after(()=>ui.destroy());ui.contextFolder=folder;ui.onCommand({target:item});
 actions.applyPreset?.(4);f.change('custom-palette-enabled',true);f.change('palette-4','#aaddbb');
 assert.equal(manager.getColor(folder),'#aaddbb');assert.equal(actions.readPreset(),4);
});

test('unreadable association storage does not break ordinary custom-colour saves',t=>{
 const f=makePresetBindingFixture(t),folder=f.add('custom'),manager=f.start();
 manager.adapters.readBindings=()=>{throw Error('synthetic unreadable association');};
 assert.equal(manager.setColor(folder,'#123456'),true);assert.equal(manager.getColor(folder),'#123456');
});

test('a failed preflight read rejects preset selection without leaving an in-memory change',t=>{
 const f=makePresetBindingFixture(t),folder=f.add('custom'),manager=f.start();manager.setColor(folder,'#123456');
 manager.adapters.readBindings=()=>{throw Error('synthetic unreadable association');};
 assert.equal(manager.setPresetColor(folder,4),false);assert.equal(manager.getColor(folder),'#123456');
});

test('failed compensation reloads the persisted fallback rather than claiming an old in-memory colour',t=>{
 const f=makePresetBindingFixture(t),folder=f.add('custom'),manager=f.start();manager.setColor(folder,'#123456');
 const write=manager.adapters.writeLedger;let writes=0;
 manager.adapters.writeLedger=value=>{if(++writes>1)throw Error('synthetic rollback failure');write(value);};
 manager.adapters.writeBindings=()=>{throw Error('synthetic association save failure');};
 assert.equal(manager.setPresetColor(folder,4),false);
 assert.equal(manager.getColor(folder),JSON.parse(f.get(FOLDER_COLOR_LEDGER_PREF)).entries[0].color);
 assert.equal(manager.getPresetIndex(folder),null);assert.ok(f.warnings.some(x=>/partial/.test(x)));
});

for(const sameIdentity of [true,false])test(`folder recovery preserves a known preset association (same identity=${sameIdentity})`,t=>{
 const f=makePresetBindingFixture(t),source=f.add('original'),manager=f.start();manager.setPresetColor(source,4);
 f.change('custom-palette-enabled',true);f.change('palette-4','#aaddbb');
 f.host.gZenFolders={createFolder:(_tabs,options)=>f.add(options.id)};
 const adapters=createBrowserRestoreAdapters(f.host,null,null,manager);
 const restored=adapters.createFolder([],{id:sameIdentity?'original':'remapped'});
 adapters.setFolderColor(restored,'#51c67c','original');
 f.change('palette-4','#bbddaa');
 assert.equal(manager.getPresetIndex(restored),4);assert.equal(manager.getColor(restored),'#bbddaa');
 if(!sameIdentity)assert.equal(manager.getColor(source),'#bbddaa');
});
