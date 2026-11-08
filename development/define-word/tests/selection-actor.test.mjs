import test from 'node:test';
import assert from 'node:assert/strict';

// Gecko owns actor construction and coordinate conversion; exercise the real
// actor with explicit boundary doubles, without claiming native layout proof.
globalThis.JSWindowActorChild=class {};
globalThis.JSWindowActorParent=class {};
const {ACTOR_NAME}=await import('../src/selection.sys.mjs');
const childModule=await import('../actors/DefineWordChild.sys.mjs');
const parentModule=await import('../actors/DefineWordParent.sys.mjs');
const DefineWordChild=childModule[`${ACTOR_NAME}Child`];

test('registered actor identity resolves the exact Gecko parent and child exports',()=>{
  assert.equal(typeof DefineWordChild,'function');
  assert.equal(typeof parentModule[`${ACTOR_NAME}Parent`],'function');
});

function fixture(element=null) {
  const actor=new DefineWordChild();
  actor.document={activeElement:element};actor.browsingContext={id:2};actor.manager={innerWindowId:20};
  actor.contentWindow={
    getSelection:()=>({toString:()=> 'word',rangeCount:1,isCollapsed:false,getRangeAt:()=>({getBoundingClientRect:()=>({x:12,y:24,width:32,height:16})})}),
    windowUtils:{toScreenRectInCSSUnits(x,y,width,height){assert.deepEqual([x,y,width,height],[12,24,32,16]);return {x:-100,y:300,width:48,height:24};}},
  };
  return actor;
}

test('selection anchor uses Gecko conversion of range client bounds',async()=>{
  const result=await fixture().receiveMessage({name:'DefineWord:GetSelection'});
  assert.equal(result.rawText,'word');assert.deepEqual(result.anchor,{x:-100,y:300,width:48,height:24});
});

test('text control selection uses control bounds and still excludes passwords',async()=>{
  const element={localName:'input',type:'text',value:'a word here',selectionStart:2,selectionEnd:6,getBoundingClientRect:()=>({x:12,y:24,width:32,height:16})};
  for(const localName of ['input','textarea']) {
    const result=await fixture({...element,localName}).receiveMessage({name:'DefineWord:GetSelection'});
    assert.equal(result.rawText,'word');assert.deepEqual(result.anchor,{x:-100,y:300,width:48,height:24});
  }
  assert.equal(await fixture({...element,type:'password'}).receiveMessage({name:'DefineWord:GetSelection'}),null);
});

test('missing or failed geometry leaves usable selected text intact',async()=>{
  for(const mutate of [actor=>delete actor.contentWindow.windowUtils,actor=>actor.contentWindow.windowUtils.toScreenRectInCSSUnits=()=>{throw new Error('gone');},actor=>actor.contentWindow.getSelection=()=>({toString:()=> 'word',rangeCount:0})]) {
    const actor=fixture();mutate(actor);
    const result=await actor.receiveMessage({name:'DefineWord:GetSelection'});
    assert.equal(result.rawText,'word');assert.equal(result.anchor,null);
  }
});
