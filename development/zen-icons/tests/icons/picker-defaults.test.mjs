import test from 'node:test';
import assert from 'node:assert/strict';
const module=await import('../../src/zen-icons-sine/picker-defaults.mjs').catch(()=>({}));
function fixture(){
  assert.equal(typeof module.readPickerDefaults,'function','persistent defaults adapter exists');
  const values=new Map();
  const prefs={getBoolPref:(k,d)=>values.has(k)?values.get(k):d,getStringPref:(k,d)=>values.has(k)?values.get(k):d,setBoolPref:(k,v)=>values.set(k,v),setStringPref:(k,v)=>values.set(k,v)};
  return {values,prefs};
}
test('saved provider and category defaults stay independent for folders, tabs and spaces',()=>{
  const {prefs}=fixture();
  module.writePickerDefaults(prefs,'folder',{availableProviders:['emoji','zen','lucide','custom'],enabledProviders:['zen','lucide','custom'],hiddenCategoryNames:['animals','private']});
  assert.deepEqual(module.readPickerDefaults(prefs,'folder'),{disabledProviders:['emoji'],disabledCategories:['animals','private']});
  for(const kind of ['tab','space'])assert.deepEqual(module.readPickerDefaults(prefs,kind),{disabledProviders:[],disabledCategories:[]});
});
test('Sine text settings normalize category lists; malformed prefs fall back safely',()=>{
  const {prefs,values}=fixture();values.set('zen-icons.tab.hidden-categories',' Animals, Work\n ANIMALS, ');
  assert.deepEqual(module.readPickerDefaults(prefs,'tab').disabledCategories,['animals','work']);
  assert.deepEqual(module.readPickerDefaults({getBoolPref(){throw Error('type');},getStringPref(){throw Error('type');}},'space'),{disabledProviders:[],disabledCategories:[]});
});
test('saving an open picker does not reset an unavailable custom provider preference',()=>{
  const {prefs,values}=fixture();values.set('zen-icons.tab.show-custom',false);
  module.writePickerDefaults(prefs,'tab',{availableProviders:['emoji'],enabledProviders:['emoji'],hiddenCategoryNames:[]});
  assert.deepEqual(module.readPickerDefaults(prefs,'tab').disabledProviders,['custom']);
});
test('saving an image-only caller does not persist its forced emoji exclusion',()=>{
  const {prefs}=fixture();
  module.writePickerDefaults(prefs,'space',{onlyIcons:true,availableProviders:['emoji','zen'],enabledProviders:['zen'],hiddenCategoryNames:[]});
  assert.deepEqual(module.readPickerDefaults(prefs,'space').disabledProviders,[]);
});
test('saved custom category names containing commas survive a preferences round trip',()=>{
  const {prefs}=fixture();
  module.writePickerDefaults(prefs,'folder',{availableProviders:[],enabledProviders:[],hiddenCategoryNames:['work, personal']});
  assert.deepEqual(module.readPickerDefaults(prefs,'folder').disabledCategories,['work, personal']);
});
test('a JSON-looking category name is not mistaken for serialized preferences',()=>{
  const {prefs}=fixture();
  module.writePickerDefaults(prefs,'tab',{availableProviders:[],enabledProviders:[],hiddenCategoryNames:['["foo"]']});
  assert.deepEqual(module.readPickerDefaults(prefs,'tab').disabledCategories,['["foo"]']);
});

test('saved whitespace variants address the same category after reopening',()=>{
  const {prefs}=fixture();
  module.writePickerDefaults(prefs,'tab',{availableProviders:[],enabledProviders:[],hiddenCategoryNames:[' Research  Lab ','research lab']});
  assert.deepEqual(module.readPickerDefaults(prefs,'tab').disabledCategories,['research lab']);
});
