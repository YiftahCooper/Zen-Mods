import test from 'node:test';
import assert from 'node:assert/strict';
import * as api from '../scripts/better-zen-folders.uc.mjs';
import {DropNode,makeFolderEndDropFixture} from './folder-end-drop.fixture.mjs';
import {installNativeDropReplay} from './folder-end-drop.native.fixture.mjs';

function setup(t){
 const f=makeFolderEndDropFixture(api,{destinationDelay:300});t.after(()=>f.manager.destroy());
 const grand=f.addFolder('Grand',f.child.groupContainer,120,38);
 const great=f.addFolder('Great',grand.groupContainer,150,52);great.groupContainer.appendChild(f.last);
 const following=f.own(new DropNode('tab','following'));following.setAttribute('pinned','true');
 following.setAttribute('zen-workspace-id','active');following.rect={top:250,left:24,width:236,height:30};f.parent.groupContainer.appendChild(following);
 return Object.assign(f,{grand,great,following});
}
const labels=['End of Great','After Great in Grand','After Grand in Child','After Child in Parent','After Parent in Pinned Tabs'];
const enter=f=>f.emit('dragover',f.last,{clientX:11,clientY:225});

test('an internal branch ending exposes every ancestor despite a later ordinary tab in the outer folder',t=>{
 const f=setup(t);f.emit('dragstart');enter(f);f.advance(299);assert.equal(f.rows().length,0);
 f.advance(1);assert.deepEqual(f.rows().map(r=>r.textContent),labels);
 assert.equal(f.manager.layout.root,f.child,'boundary identity is the branch ending here, not the whole outer folder');
 assert.deepEqual(f.manager.layout.intents.map(i=>i.folder?.id??null),['Great','Grand','Child','Parent',null]);
 assert.equal(f.following.parentElement,f.parent.groupContainer);
});

for(const choice of [0,1,2,3,4])test(`native drop uses the requested depth at an internal boundary: choice ${choice}`,t=>{
 const f=setup(t),replay=installNativeDropReplay(f);f.emit('dragstart');enter(f);f.advance(300);
 assert.deepEqual(f.rows().map(r=>r.textContent),labels);
 f.emit('drop',f.rows()[choice]);f.advance(0);
 assert.equal(replay.log.filter(x=>x==='native-drop').length,1);
 assert.equal(f.source.parentElement,[f.great.groupContainer,f.grand.groupContainer,f.child.groupContainer,f.parent.groupContainer,f.pins][choice]);
 assert.equal(f.following.parentElement,f.parent.groupContainer);
 if(choice===3)assert.ok(f.parent.groupContainer.children.indexOf(f.source)<f.parent.groupContainer.children.indexOf(f.following));
});

test('two internal endings in one outer folder have independent dwell identities',t=>{
 const f=setup(t),other=f.addFolder('Other branch',f.parent.groupContainer,290,24);
 const end=f.own(new DropNode('tab','other-end'));end.rect={top:320,left:38,width:222,height:30};other.groupContainer.appendChild(end);
 f.emit('dragstart');enter(f);f.advance(250);
 f.emit('dragover',end,{clientX:11,clientY:345});f.advance(299);assert.equal(f.rows().length,0);
 f.advance(1);assert.deepEqual(f.rows().map(r=>r.textContent),['End of Other branch','After Other branch in Parent','After Parent in Pinned Tabs']);
});

test('destination colours belong to the receiving folder, not the folder being placed after',t=>{
 const f=setup(t);const colors=new Map([[f.parent,'#e76565'],[f.child,'#51c67c'],[f.grand,'#3ebcd2'],[f.great,'#9b79ea']]);
 const nativeStyle=f.host.getComputedStyle;f.host.getComputedStyle=node=>({...nativeStyle(node),getPropertyValue:name=>name==='--better-zen-folders-folder-color'?(colors.get(node)??''):'14px'});
 f.emit('dragstart');enter(f);f.advance(300);
 assert.deepEqual(f.rows().map(r=>r.style.getPropertyValue('--bzf-drop-colour')),['#9b79ea','#3ebcd2','#51c67c','#e76565','']);
 assert.equal(f.manager.footer.element.getAttribute('data-bzf-drop-colours'),'true');
 const get=f.preferences.get;f.preferences.get=name=>name==='colourCodeDragDestinations'?false:get(name);f.manager.refresh();
 assert.equal(f.manager.footer.element.getAttribute('data-bzf-drop-colours'),'false');
 assert.deepEqual(f.rows().map(r=>r.textContent),labels);
});

test('diagnostics recognise the enclosing-container gutter as a valid internal trigger surface',t=>{
 const f=setup(t);f.emit('dragstart');
 const pointer={target:f.parent.groupContainer,clientX:11,clientY:225};
 const layout=f.adapters.findLayout(f.source,pointer);assert.ok(layout);
 const state=f.adapters.diagnosticState(f.source,pointer,layout,null);
 assert.equal(state.inRoot,true);assert.ok(!state.reasons.includes('target_outside_root'));
});
