import test from 'node:test';
import assert from 'node:assert/strict';
import {createIconRecord, groupIconRecords} from '../../src/zen/common/emojis/ZenIconRegistry.mjs';
import {createPickerModel} from '../../src/zen-icons-sine/picker-model.mjs';
const record=(id,category)=>createIconRecord({id,provider:'custom',name:id,source:`file:///${id}.png`,kind:'raster',categories:[category]});

test('spacing and case variants merge but different spellings and punctuation stay separate',()=>{
  const groups=groupIconRecords([' test ','TEST','Test',' test  group ','Test Group','Test-Group'].map((c,i)=>record(String(i),c)));
  assert.deepEqual(groups.map(g=>g.records.length).sort(),[1,2,3]);
});

test('native category casing wins and saved filter variants address the same category',()=>{
  const model=createPickerModel([record('a',' animals '),record('b','ANIMALS'),record('c','Research  Lab')],{
    categoryMetadata:{' animals ':{icon:'🐈',aliases:['kitties']}},disabledCategories:['  ANIMALS  ']});
  assert.deepEqual(model.snapshot().availableCategories,['Animals','Research Lab']);
  assert.deepEqual(model.snapshot().groups.map(g=>g.category),['Research Lab']);
  model.navigateCategory(' animals ');
  assert.equal(model.snapshot().navigationTarget,'Animals');
  model.setQuery('kitties');
  assert.equal(model.snapshot().groups[0].records.length,2);
  assert.equal(model.snapshot().groups[0].categoryIcon,'🐈');
});

test('Default custom category has distinct display label without rewriting persisted icon IDs',()=>{
  const records=[record('a',' default '),record('b','DEFAULT')];
  const model=createPickerModel(records);
  const state=model.snapshot();
  assert.equal(state.groups.length,1);
  assert.equal(state.groups[0].categoryName,'Default (Custom)');
  assert.deepEqual(state.groups[0].records.map(r=>r.id),['custom:a','custom:b']);
  model.setCategoryEnabled(' Default (Custom) ',false);
  assert.equal(model.snapshot().groups.length,0);
  model.navigateCategory('DEFAULT');
  assert.equal(model.snapshot().groups.length,1);
});

test('filtering a punctuation-distinct custom category never hides its neighbour',()=>{
  const model=createPickerModel([record('a','Test Group'),record('b','Test-Group')],{
    categoryMetadata:{'Test Group':{icon:'🧪'}},
  });
  model.setCategoryEnabled('Test-Group',false);
  assert.deepEqual(model.snapshot().groups.map(g=>g.category),['Test Group']);
});

test('a literal Default (Custom) folder keeps its own identity beside the reserved Default category',()=>{
  const model=createPickerModel([record('a','Default'),record('b','Default (Custom)')]);
  const groups=model.snapshot().groups;
  assert.equal(new Set(groups.map(g=>g.categoryName)).size,2);
  model.setCategoryEnabled('Default (Custom)',false);
  assert.deepEqual(model.snapshot().groups.map(g=>g.category),['Default']);
});
