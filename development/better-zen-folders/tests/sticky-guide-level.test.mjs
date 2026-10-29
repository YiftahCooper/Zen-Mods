import test from 'node:test';
import assert from 'node:assert/strict';
import {StickyFolderVisibilityManager} from '../scripts/better-zen-folders.uc.mjs';

// DOM boundary double; production refresh, projection, attribute ledger and
// destroy all run. No rendering or native Zen lifecycle is claimed here.
function fixture(count=8) {
  const folders=Array.from({length:count},(_,index)=>{
    const attributes=new Map();
    return {id:`folder-${index}`,localName:'zen-folder',isZenFolder:true,isConnected:true,
      collapsed:false,group:null,allItems:[],
      getAttribute:name=>attributes.get(name)??null,
      hasAttribute:name=>attributes.has(name),
      setAttribute:(name,value)=>attributes.set(name,String(value)),
      removeAttribute:name=>attributes.delete(name),
      getBoundingClientRect:()=>({height:40}),contains:()=>false};
  });
  function move(folder,parent) {
    if(folder.group)folder.group.allItems=folder.group.allItems.filter(item=>item!==folder);
    folder.group=parent;if(parent)parent.allItems.push(folder);
  }
  for(let index=1;index<count;index++)move(folders[index],folders[index-1]);
  const errors=[];
  const host={document:{querySelectorAll:()=>folders.filter(folder=>folder.isConnected)},
    gBrowser:{tabContainer:{},isTab:()=>false,isSplitViewWrapper:()=>false},
    removeEventListener(){},console:{error:(_,error)=>errors.push(error.message)}};
  const manager=new StickyFolderVisibilityManager(host,{get:()=>false});
  manager.started=true;manager.events=[];
  return {folders,manager,move,errors,levels:()=>folders.map(folder=>folder.getAttribute('data-bzf-guide-level'))};
}

test('guide levels follow actual ancestors through wraparound and subtree reparenting',()=>{
  const {folders,manager,move,errors,levels}=fixture();
  try {
    manager.refresh();assert.deepEqual(levels(),['0','1','2','3','0','1','2','3']);
    move(folders[3],null);manager.refresh();
    assert.deepEqual(levels(),['0','1','2','0','1','2','3','0']);
    move(folders[3],folders[1]);manager.refresh();
    assert.deepEqual(levels(),['0','1','2','2','3','0','1','2']);
    assert.deepEqual(errors,[]);
  }finally{manager.destroy();}
});

test('guide level ledger restores prior attributes and removes owned attributes on destroy',()=>{
  const {folders,manager,move,errors,levels}=fixture(3);
  folders[1].setAttribute('data-bzf-guide-level','prior-value');
  manager.refresh();assert.deepEqual(levels(),['0','1','2']);
  move(folders[1],null);manager.refresh();assert.deepEqual(levels(),['0','0','1']);
  manager.destroy();manager.destroy();
  assert.deepEqual(levels(),[null,'prior-value',null]);
  assert.equal(manager.records.size,0);assert.deepEqual(errors,[]);
});

test('guide cleanup preserves a later external writer and restores disconnected folders',()=>{
  const {folders,manager,errors,levels}=fixture(3);
  folders[1].setAttribute('data-bzf-guide-level','prior-value');
  manager.refresh();assert.deepEqual(levels(),['0','1','2']);
  folders[0].setAttribute('data-bzf-guide-level','external-value');
  folders[1].isConnected=false;folders[2].isConnected=false;folders[0].allItems=[];
  manager.destroy();
  assert.deepEqual(levels(),['external-value','prior-value',null]);assert.deepEqual(errors,[]);
});

for(const selfCycle of [false,true])test(`guide ancestor traversal terminates on ${selfCycle?'self':'two-folder'} cycle`,()=>{
  const {folders,manager,errors}=fixture(2);
  const child=folders[1],peer={isZenFolder:true,group:child};
  let reads=0;
  // Bound the fixture getter so a missing production guard fails, never hangs.
  Object.defineProperty(child,'group',{get(){
    if(++reads>16)throw Error('ancestor traversal failed to terminate');
    return selfCycle?child:peer;
  }});
  try {
    manager.refresh();
    assert.equal(child.getAttribute('data-bzf-guide-level'),selfCycle?'0':'1');
    assert.deepEqual(errors,[]);
  }finally{manager.destroy();}
});
