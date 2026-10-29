import test from 'node:test';
import assert from 'node:assert/strict';
import {createBrowserRestoreAdapters} from '../scripts/better-zen-folders.uc.mjs';

function fixture(){
 const parent={children:[],moves:0,insertBefore(item,target){
  this.moves++;
  if(item.parentNode)item.parentNode.children.splice(item.parentNode.children.indexOf(item),1);
  const index=target===null?this.children.length:this.children.indexOf(target);
  this.children.splice(index,0,item);item.parentNode=this;
 }};
 const item=id=>({id,parentNode:parent,get nextSibling(){const siblings=this.parentNode.children;return siblings[siblings.indexOf(this)+1]??null;}});
 const a=item('a'),b=item('b'),c=item('c');parent.children.push(a,b,c);
 return {parent,a,b,c,folder:{groupContainer:parent},adapter:createBrowserRestoreAdapters({})};
}
for(const which of ['before sibling','at end','self target'])test(`restoring a tab already ${which} never detaches its pressed drag source`,()=>{
 const f=fixture();
 f.adapter.insertDirectItem(f.folder,which==='at end'?f.c:f.a,which==='at end'?null:which==='self target'?f.a:f.b);
 assert.equal(f.parent.moves,0);assert.deepEqual(f.parent.children.map(x=>x.id),['a','b','c']);
});
test('restore placement still performs genuine before-sibling and end moves',()=>{
 const f=fixture();f.adapter.insertDirectItem(f.folder,f.c,f.a);
 assert.deepEqual(f.parent.children.map(x=>x.id),['c','a','b']);
 f.adapter.insertDirectItem(f.folder,f.c,null);
 assert.deepEqual(f.parent.children.map(x=>x.id),['a','b','c']);assert.equal(f.parent.moves,2);
});
test('restore placement still reparents a tab from a different container',()=>{
 const f=fixture(),other={children:[f.a]};f.parent.children.shift();f.a.parentNode=other;
 f.adapter.insertDirectItem(f.folder,f.a,f.b);
 assert.deepEqual(other.children,[]);assert.deepEqual(f.parent.children.map(x=>x.id),['a','b','c']);assert.equal(f.parent.moves,1);
});
