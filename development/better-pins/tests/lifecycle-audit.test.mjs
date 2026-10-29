import {test} from 'node:test';
import assert from 'node:assert/strict';
import {BzfLease} from '../src/controller.mjs';
import {Zones} from '../src/zones.mjs';

function runtime() {
  return {constructor:{name:'FolderPinRuntime'},active:true,disabled:0,enabled:0,
    disable(){this.disabled++;},enable(){this.enabled++;},preferences:{get(){return true;}}};
}

test('an existing BZF controller accessor is refused without suspending or replacing its owner',()=>{
 const owner=runtime(),controller={managers:[owner]},host={};
 const descriptor={configurable:true,enumerable:true,get:()=>controller,set(){}};
 Object.defineProperty(host,'__betterZenFoldersController',descriptor);
 const lease=new BzfLease(host);assert.throws(()=>lease.start(),/coordinate/);lease.destroy();
 assert.equal(owner.disabled,0);assert.deepEqual(Object.getOwnPropertyDescriptor(host,'__betterZenFoldersController'),descriptor);
});

test('an unwrappable BZF controller property is rejected before suspending its runtime',()=>{
  const owner=runtime(),host={};
  Object.defineProperty(host,'__betterZenFoldersController',{value:{managers:[owner]},configurable:false});
  const enable=owner.enable,lease=new BzfLease(host);
  assert.throws(()=>lease.start(),/coordinate/);
  assert.equal(owner.disabled,0,'failed compatibility preflight must leave BZF running');
  assert.doesNotThrow(()=>lease.destroy(),'teardown must also be safe before the property wrapper exists');
  assert.equal(owner.enable,enable);
});

test('an unwrappable BZF enable method is rejected before suspending its runtime',()=>{
  const owner=runtime(),host={__betterZenFoldersController:{managers:[owner]}};
  Object.defineProperty(owner,'enable',{value:owner.enable,writable:false,configurable:false});
  const lease=new BzfLease(host);
  assert.throws(()=>lease.start());
  assert.equal(owner.disabled,0);
  assert.doesNotThrow(()=>lease.destroy());
});

test('BZF lease teardown restores the original controller property flags',()=>{
  const owner=runtime(),controller={managers:[owner]},host={};
  Object.defineProperty(host,'__betterZenFoldersController',{value:controller,writable:false,configurable:true,enumerable:false});
  const descriptor=Object.getOwnPropertyDescriptor(host,'__betterZenFoldersController');
  const lease=new BzfLease(host);lease.start();lease.destroy();
  assert.deepEqual(Object.getOwnPropertyDescriptor(host,'__betterZenFoldersController'),descriptor);
  assert.equal(owner.enabled,1);
});

test('BZF lease teardown leaves later controller and enable method owners intact',()=>{
  const owner=runtime(),host={__betterZenFoldersController:{managers:[owner]}};
  const lease=new BzfLease(host);lease.start();
  const laterController={later:true},laterEnable=()=>({later:true});
  Object.defineProperty(host,'__betterZenFoldersController',{value:laterController,configurable:true,writable:true});
  owner.enable=laterEnable;
  lease.destroy();
  assert.equal(host.__betterZenFoldersController,laterController);
  assert.equal(owner.enable,laterEnable);
  assert.equal(owner.enabled,0);
});

test('a later BZF enable wrapper can delegate through an inactive lease',()=>{
  const owner=runtime(),host={__betterZenFoldersController:{managers:[owner]}};
  const lease=new BzfLease(host);lease.start();
  const leasedEnable=owner.enable,laterEnable=function(){return leasedEnable.call(this);};
  owner.enable=laterEnable;lease.destroy();
  owner.enable();
  assert.equal(owner.enable,laterEnable);
  assert.equal(owner.enabled,1,'an unowned wrapper retained by a later writer must become inert');
});

function node(localName,id='') {
  return {localName,id,children:[],isConnected:true,tabs:[],inserted:[],
    hasAttribute(){return false;},classList:{contains(){return false;}},
    getAttribute(name){return name==='id'?this.id:null;},
    insertBefore(child,before){
      if(child.parentNode)child.parentNode.children.splice(child.parentNode.children.indexOf(child),1);
      const index=before?this.children.indexOf(before):this.children.length;
      assert.ok(index>=0);
      this.children.splice(index,0,child);child.parentNode=this;this.inserted.push(child);
    }};
}

test('zone projection places saved supported roots before newcomers without moving unsupported roots',()=>{
  const space=node('zen-workspace','space'),upper=node('div'),lower=node('div');
  space.pinnedTabsContainer=upper;space.tabsContainer=lower;
  const roots=new Map();
  for(const id of ['a','new-one','b','new-two','protected']){const root=node('zen-folder',id);roots.set(id,root);upper.insertBefore(root,null);}
  for(const id of ['moved','untouched']){const root=node('zen-folder',id);roots.set(id,root);lower.insertBefore(root,null);}
  upper.inserted=[];lower.inserted=[];
  const zones=new Zones({host:{document:{querySelectorAll:()=>[space]}},supportedTree:root=>root.id!=='protected'});
  zones.state={schema:1,spaces:{space:{upper:['b','protected','absent','a','moved'],lower:[]}}};
  for(let pass=0;pass<2;pass++){
    zones.project();
    assert.deepEqual(upper.children.map(root=>root.id),['b','a','moved','new-one','new-two','protected']);
    assert.deepEqual(lower.children.map(root=>root.id),['untouched']);
  }
  assert.equal(roots.get('protected').parentNode,upper);
  assert.ok(upper.inserted.every(root=>['a','b','moved'].includes(root.id)),'projection must move only supported saved identities');
});
