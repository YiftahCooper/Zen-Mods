import {test} from 'node:test';
import assert from 'node:assert/strict';
import {contextTarget,Presentation} from '../src/presentation.mjs';
test('zone drags require a native payload from the captured tree',()=>{
 const document={},folder={parentElement:null,localName:'zen-folder',ownerDocument:document};
 const child={parentElement:folder,localName:'tab',ownerDocument:document},other={parentElement:null,localName:'tab',ownerDocument:document};
 const transfer=items=>({types:['application/x-moz-tabbrowser-tab'],mozItemCount:items.length,mozGetDataAt:(_,i)=>items[i]});
 const lower={closest:s=>s==='zen-folder'?null:s.includes('normal-tabs-section')?lower:null},space={tabsContainer:lower};
 const p=new Presentation({host:{document},supportedTree:()=>true,zones:{space:()=>space}});p.drag={item:folder,space};
 const accepts=dataTransfer=>!!p.destination({target:lower,dataTransfer});
 assert.equal(accepts(transfer([folder])),true);assert.equal(accepts(transfer([child])),true);
 assert.equal(accepts(transfer([folder,other])),false);assert.equal(accepts(transfer([other])),false);
 assert.equal(accepts({...transfer([folder]),types:['text/plain']}),false);
 assert.equal(accepts(transfer([])),false);
 assert.equal(accepts({...transfer([folder]),mozGetDataAt(){throw Error('foreign data');}}),false);
});
test('a drop delegated to native handling also ends the captured zone drag',()=>{
 const p=new Presentation({host:{}});p.drag={item:{}};p.destination=()=>null;p.hideDropMarker=()=>{};
 p.onDrop({});assert.equal(p.drag,null);
});
test('a new unsupported drag cannot retain the preceding folder drag',()=>{
 const folder={localName:'zen-folder',parentElement:null},space={id:'space'};
 const p=new Presentation({host:{},supportedTree:n=>n===folder,zones:{space:()=>space}});
 let cleared=0;p.hideDropMarker=()=>cleared++;
 p.onDragStart({target:{closest:()=>folder}});assert.equal(p.drag.item,folder);
 p.onDragStart({target:{closest:()=>null}});
 assert.equal(p.drag,null);assert.equal(cleared,2);
});
test('multiselected folder children cannot start a whole-folder zone drag',()=>{
 const folder={localName:'zen-folder',parentElement:null},tab={localName:'tab',parentElement:folder,multiselected:true};
 const p=new Presentation({host:{},supportedTree:()=>true,zones:{space:()=>({})}});p.hideDropMarker=()=>{};
 p.onDragStart({target:{closest:()=>tab}});assert.equal(p.drag,null);
});
test('native folder drag starts when Gecko targets the label text node',()=>{
 const folder={localName:'zen-folder',parentElement:null},space={id:'space'};
 const text={nodeType:3,parentElement:{closest:()=>folder}};
 const p=new Presentation({host:{},supportedTree:n=>n===folder,zones:{space:()=>space}});
 p.onDragStart({target:text});
 assert.deepEqual(p.drag,{item:folder,space});
});
test('tab inside folder retains tab commands and folder header has its own target',()=>{
 const folder={isZenFolder:true};const tab={closest:()=>folder};
 assert.equal(contextTarget(tab,tab,false),tab);
 assert.equal(contextTarget(null,{closest:()=>folder},true),folder);
});
test('native toggle shortcut uses selected tab and never placement pin commands',async()=>{
 const selected={id:'selected'},stale={id:'stale'};let target,consumed=false;
 const c={host:{gBrowser:{selectedTab:selected},TabContextMenu:{contextTab:stale}},supported:()=>true,store:{read:()=>({explicit:false})},policy:{pin:async t=>{target=t;return {ok:true};}}};
 const p=new Presentation(c);p.onCommand({target:{id:'cmd_zenTogglePinTab'},preventDefault(){consumed=true;},stopImmediatePropagation(){}});
 await Promise.resolve();assert.equal(consumed,true);assert.equal(target,selected);
});
