import test from 'node:test';
import assert from 'node:assert/strict';
import * as api from '../scripts/better-zen-folders.uc.mjs';

const tab = (id, flags={}) => ({id,...flags});
const folder = (id, collapsed, children, flags={}) => ({id,folder:true,collapsed,children,...flags});
const adapters = {
  isFolder: node => !!node.folder,
  children: node => node.children ?? [],
  isCollapsed: node => node.collapsed,
  isSticky: node => !!node.sticky,
  isSelected: node => !!node.selected || !!node.tabs?.some(t=>t.selected),
  isExposed: node => !!node.exposed,
};
function project(roots, policy='hide') {
  assert.equal(typeof api.projectFolderVisibility,'function');
  return api.projectFolderVisibility(roots,adapters,policy);
}
const shown = result => [...result].filter(([,v])=>v.visible).map(([n])=>n.id);

test('Sticky leaves keep their exact order and selected children are independent',()=>{
  const items=[tab('1'),tab('2'),tab('3',{sticky:true}),tab('4',{sticky:true}),tab('5',{selected:true})];
  const root=folder('root',true,items);
  assert.deepEqual(shown(project([root])),['root','3','4','5']);
  assert.deepEqual(root.children.map(t=>t.id),['1','2','3','4','5']);
  root.collapsed=false;
  assert.deepEqual(shown(project([root])),['root','1','2','3','4','5']);
});

for(const policy of ['hide','expanded','all']) test(`Sticky paths survive ${policy} policy without making ancestors Sticky`,()=>{
  const leaf=folder('leaf',true,[tab('ordinary'),tab('sticky',{sticky:true})]);
  const root=folder('root',true,[tab('outside'),leaf]);
  const result=project([root],policy);
  assert.deepEqual(shown(result),['root','leaf','sticky']);
  assert.equal(result.get(leaf).sticky,false);
  assert.equal(root.collapsed,true);assert.equal(leaf.collapsed,true);
});

test('collapsed parent hides ordinary child folders without changing their state',()=>{
  const a=folder('closed',true,[tab('a')]), b=folder('open',false,[tab('b')]);
  const root=folder('root',true,[a,b]);
  assert.deepEqual(shown(project([root])),['root']);
  assert.deepEqual(shown(project([root],'expanded')),['root','open','b']);
  assert.deepEqual(shown(project([root],'all')),['root','closed','open','b']);
  root.collapsed=false;
  assert.deepEqual(shown(project([root])),['root','closed','open','b']);
  assert.equal(a.collapsed,true);assert.equal(b.collapsed,false);
});

test('path-only expanded child filters siblings until explicitly exposed',()=>{
  const leaf=folder('leaf',false,[tab('normal'),tab('sticky',{sticky:true})]);
  const root=folder('root',true,[leaf,tab('sibling')]);
  let result=project([root]);
  assert.deepEqual(shown(result),['root','leaf','sticky']);
  assert.equal(result.get(leaf).pathOnly,true);
  leaf.exposed=true;
  result=project([root]);
  assert.deepEqual(shown(result),['root','leaf','normal','sticky']);
  assert.equal(result.get(leaf).pathOnly,false);
  assert.equal(root.collapsed,true);
});

test('Sticky folder exposes its normal expanded contents but does not make them Sticky',()=>{
  const child=folder('child',false,[tab('normal')],{sticky:true});
  const root=folder('root',true,[child]);
  let result=project([root]);
  assert.deepEqual(shown(result),['root','child','normal']);
  assert.equal(result.get(child.children[0]).sticky,false);
  child.collapsed=true;
  assert.deepEqual(shown(project([root])),['root','child']);
});

test('deep path exposes no unrelated siblings or remembered expanded descendants',()=>{
  const deep=folder('deep',true,[tab('kept',{sticky:true}),tab('hidden')]);
  const branch=folder('branch',false,[tab('hidden2'),deep,folder('other',false,[tab('hidden3')])]);
  const root=folder('root',true,[branch]);
  assert.deepEqual(shown(project([root])),['root','branch','deep','kept']);
  assert.equal(branch.collapsed,false);
});

test('a selected split row has one visibility entry, not duplicate children',()=>{
  const split=tab('split',{tabs:[tab('a'),tab('b',{selected:true})]});
  assert.deepEqual(shown(project([folder('root',true,[split])])),['root','split']);
});

test('cycle guard fails safely instead of infinite recursion',()=>{
  const root=folder('root',true,[]);root.children.push(root);
  assert.throws(()=>project([root]),/cycle|tree/i);
});
