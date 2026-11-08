import test from 'node:test';
import assert from 'node:assert/strict';
import { createPickerModel } from '../../src/zen-icons-sine/picker-model.mjs';
import { createIconRecord } from '../../src/zen/common/emojis/ZenIconRegistry.mjs';
import { Element, fixture, tick } from './runtime-fixture.mjs';

const records = [
  createIconRecord({id:'dog',provider:'emoji',name:'Dog',source:'🐶',kind:'emoji',categories:['Animals']}),
  createIconRecord({id:'paw',provider:'zen',name:'Paw',source:'chrome://paw.svg',kind:'svg',categories:['Animals']}),
  createIconRecord({id:'job',provider:'lucide',name:'Job',source:'chrome://job.svg',kind:'svg',categories:['Work']}),
];

test('saved provider defaults apply on opening, while temporary overrides do not change defaults', () => {
  const options={disabledProviders:['emoji']};
  const model=createPickerModel(records,options);
  assert.deepEqual(model.snapshot().enabledProviders,['zen','lucide']);
  model.setProviderEnabled('emoji',true);
  assert.ok(model.snapshot().groups[0].records.some(r=>r.provider==='emoji'));
  assert.deepEqual(createPickerModel(records,options).snapshot().enabledProviders,['zen','lucide']);
});

test('hidden categories remain navigable and can be temporarily shown without erasing defaults', () => {
  const model=createPickerModel(records,{disabledCategories:['animals']});
  assert.deepEqual(model.snapshot().groups.map(g=>g.category),['Work']);
  assert.deepEqual(model.snapshot().availableCategories,['Animals','Work']);
  model.navigateCategory('Animals');
  assert.deepEqual(model.snapshot().groups.map(g=>g.category),['Animals','Work']);
  model.setCategoryEnabled('Animals',false);
  assert.deepEqual(model.snapshot().groups.map(g=>g.category),['Work']);
});

test('later custom catalog discovery honors saved disabled providers and categories', () => {
  const model=createPickerModel(records,{disabledProviders:['custom'],disabledCategories:['Private']});
  model.updateRecords([...records,createIconRecord({id:'x',provider:'custom',name:'X',kind:'image',source:'file:///x.png',categories:['Private']})]);
  assert.equal(model.snapshot().enabledProviders.includes('custom'),false);
  model.setProviderEnabled('custom',true);
  assert.equal(model.snapshot().groups.some(g=>g.category==='Private'),false);
});

test('space placeholder opts out of Zen global squircle geometry', async () => {
  const f=await fixture(); await tick();
  try {
    const view=f.mod.namespace.createPickerView({document:f.document,panel:f.panel,
      model:createPickerModel(records,{defaultKind:'space'}),bridge:{selectCustom(){}},getOptions:()=>({}),getFolder:()=>null});
    const preview=f.document.querySelector('.zen-icons-default-placeholder');
    assert.ok(preview.classList.contains('no-squircles'));
    view.destroy();
  } finally { f.dispose(); }
});

test('tab reset is a labelled action outside Default, which contains only the native square', async () => {
  const f=await fixture(); await tick();
  try {
    const tab=new Element('tab'); const icon=new Element('image');tab.append(icon);f.document.documentElement.append(tab);
    f.browser.gZenEmojiPicker.open(icon,{emojiAsSVG:true});
    const reset=f.document.querySelector('.zen-icons-reset-tab-icon');
    assert.ok(reset,'website reset must be an explicit text button');
    assert.equal(reset.getAttribute('aria-label'),'Reset Icon');
    assert.equal(reset.querySelector('.zen-icons-reset-label')?.textContent,'Reset Icon');
    const resetIcon=reset.querySelector('.zen-icons-reset-symbol');
    assert.ok(resetIcon,'Reset must include its reset symbol');
    assert.equal(resetIcon.getAttribute('aria-hidden'),'true');
    assert.match(resetIcon.style.listStyleImage,/\/rotate-ccw\.svg/);
    const section=f.document.querySelector('.zen-icons-default-section');
    assert.equal(section.contains(reset),false);
    assert.equal(reset.parentNode,section.parentNode);
    assert.ok(section.parentNode.children.indexOf(reset)<section.parentNode.children.indexOf(section),'Reset must appear above Default');
    assert.equal(section.querySelectorAll('button').length,1);
    const blank=section.querySelector('.zen-icons-default-choice');
    assert.match(blank.title,/default tab/i);
    assert.equal(blank.children.length,1,'Default must be an image-only tile without a text label or parentheses');
    assert.ok(blank.children[0].classList.contains('zen-icons-native-tab-placeholder'));
    assert.equal(blank.getAttribute('aria-label'),'Default Tab Icon');
    assert.match(blank.getAttribute('aria-description'),/no website/);
    assert.equal(reset.querySelectorAll('img').length,0,'reset must not use the ambiguous globe');
  } finally { f.dispose(); }
});

test('default tab tile stays pinned and selectable when searching default or an unrelated term',async()=>{
  const f=await fixture();await tick();
  try{
    const tab=new Element('tab');const icon=new Element('image');tab.append(icon);f.document.documentElement.append(tab);
    const selections=[];
    f.browser.gZenEmojiPicker.open(icon,{emojiAsSVG:true,closeOnSelect:false,onSelect:value=>selections.push(value)});
    const search=f.document.querySelector('.zen-icons-search');
    for(const query of ['default','zz-no-matching-icons']){
      search.value=query;search.fire('input');
      const section=f.document.querySelector('.zen-icons-default-section');
      const choice=section.querySelector('.zen-icons-default-choice');
      assert.equal(section.hidden,false);assert.equal(choice.hidden,false);
      assert.equal(section.querySelectorAll('button').length,1);
      choice.fire('click');
    }
    assert.deepEqual(selections,['chrome://sine/content/zen-icons-local/blank-tab.svg','chrome://sine/content/zen-icons-local/blank-tab.svg']);
  }finally{f.dispose();}
});

test('built-in picker action labels use title case while search stays sentence case',async()=>{
  const f=await fixture();await tick();
  try{
    const tab=new Element('tab');const icon=new Element('image');tab.append(icon);f.document.documentElement.append(tab);
    f.browser.gZenEmojiPicker.open(icon,{emojiAsSVG:true});
    assert.equal(f.document.querySelector('.zen-icons-open-custom-folder').textContent,'Open Custom Icons Folder');
    assert.equal(f.document.querySelector('.zen-icons-save-defaults').textContent,'Save as Defaults for Tabs');
    assert.equal(f.document.querySelector('.zen-icons-filter-button').getAttribute('aria-label'),'Filter Icons');
    assert.equal(f.document.querySelector('.zen-icons-search').placeholder,'Search icons and tags');
  }finally{f.dispose();}
});

test('runtime reads the correct context defaults, and saves only on the explicit button', async () => {
  const f=await fixture({emojis:[{emoji:'🐶',name:'Dog',tags:['dog'],category:'Animals'}]});await tick();
  try {
    f.preferences.set('zen-icons.tab.show-emoji',false);
    const tab=new Element('tab');const icon=new Element('image');tab.append(icon);f.document.documentElement.append(tab);
    f.browser.gZenEmojiPicker.open(icon,{emojiAsSVG:true});
    const checkbox=()=>f.document.querySelectorAll('input').find(n=>n.dataset.provider==='emoji');
    assert.equal(checkbox().checked,false);
    checkbox().checked=true;checkbox().fire('change');
    assert.equal(f.preferences.get('zen-icons.tab.show-emoji'),false);
    f.document.querySelector('.zen-icons-save-defaults').fire('click');
    assert.equal(f.preferences.get('zen-icons.tab.show-emoji'),true);
    assert.equal(f.preferences.has('zen-icons.folder.show-emoji'),false);
    assert.equal(f.preferences.has('zen-icons.space.show-emoji'),false);
  }finally{f.dispose();}
});

test('Reset icon restores website favicon; Default square persists without becoming a reset',async()=>{
  const cache=[];
  const f=await fixture({imports:{
    'resource://gre/modules/PlacesUtils.sys.mjs':{PlacesUtils:{favicons:{getFaviconForPage:async uri=>{assert.equal(uri.spec,'https://example.test/');return {dataURI:{spec:'data:image/png;base64,c2l0ZQ=='}};}}}},
    'resource:///modules/sessionstore/TabStateCache.sys.mjs':{TabStateCache:{update:(key,data)=>cache.push(data.image)}},
  }});await tick();
  try {
    const tab=new Element('tab');const icon=new Element('image');tab.append(icon);f.document.documentElement.append(tab);
    tab.zenStaticIcon='chrome://custom.svg';tab.permanentKey={};
    tab.linkedBrowser={currentURI:{spec:'https://example.test/'},mIconURL:'chrome://custom.svg'};
    f.browser.gBrowser={setIcon(t,v){t.linkedBrowser.mIconURL=t.zenStaticIcon||v;}};
    f.browser.gZenEmojiPicker.open(icon,{emojiAsSVG:true,closeOnSelect:false,onSelect(value){
      if(value)tab.zenStaticIcon=value;else delete tab.zenStaticIcon;
      f.browser.gBrowser.setIcon(tab,value);cache.push(value||null);
    }});
    const reset=f.document.querySelector('.zen-icons-reset-tab-icon');
    assert.ok(reset,'reset action missing');
    reset.fire('click');await tick();
    assert.equal(tab.zenStaticIcon,undefined);assert.equal(tab.linkedBrowser.mIconURL,'data:image/png;base64,c2l0ZQ==');
    assert.deepEqual(cache,[null,'data:image/png;base64,c2l0ZQ==']);
    f.document.querySelector('.zen-icons-default-choice').fire('click');
    assert.equal(tab.zenStaticIcon,'chrome://sine/content/zen-icons-local/blank-tab.svg');
    reset.fire('click');await tick();
    assert.equal(tab.zenStaticIcon,undefined);
    assert.equal(tab.linkedBrowser.mIconURL,'data:image/png;base64,c2l0ZQ==');
  }finally{f.dispose();}
});
