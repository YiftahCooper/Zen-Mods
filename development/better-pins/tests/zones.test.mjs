import {test} from 'node:test';
import assert from 'node:assert/strict';
import {rootOf, areaOf, orderedRoots} from '../src/zones.mjs';
test('nested contents move with outer folder; split views remain whole',()=>{
  const outer={localName:'zen-folder',parentElement:null};
  const inner={localName:'zen-folder',parentElement:outer};
  const tab={localName:'tab',parentElement:inner};
  assert.equal(rootOf(tab),outer);
  const split={localName:'tab-group',hasAttribute:n=>n==='split-view-group',parentElement:null};
  assert.equal(rootOf({localName:'tab',parentElement:split}),split);
});
test('area comes from container, never native pinned state',()=>{
  assert.equal(areaOf({pinned:true,closest:s=>s.includes('normal')?{}:null}),'lower');
  assert.equal(areaOf({pinned:false,closest:s=>s.includes('pinned')?{}:null}),'upper');
});
test('projection only orders currently existing roots and preserves newcomers',()=>{
  const a={id:'a'},b={id:'b'},c={id:'c'};
  assert.deepEqual(orderedRoots([a,b,c],['deleted','b','a']),[b,a,c]);
});
