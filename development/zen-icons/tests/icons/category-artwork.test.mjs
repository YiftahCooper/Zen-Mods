import test from 'node:test';
import assert from 'node:assert/strict';
import {buildCustomIconCatalog, scanCustomIconPacks} from '../../src/zen/common/emojis/ZenCustomIconPacks.mjs';
import {createPickerModel} from '../../src/zen-icons-sine/picker-model.mjs';
import {fixture,tick} from './runtime-fixture.mjs';
const module=await import('../../src/zen/common/emojis/ZenCategoryArtwork.mjs').catch(()=>({}));
const png=new Uint8Array([137,80,78,71,13,10,26,10,0]);
const jpg=new Uint8Array([255,216,255,224,0]);
const base='C:/profile/custom';
async function load({files=[],manifests=new Map(),images=new Map(),linked=()=>false}={}) {
  assert.equal(typeof module.resolveCategoryArtwork,'function');
  const reads=[];
  const result=await module.resolveCategoryArtwork({files,manifests,basePath:base,
    pathUtils:{join:(...p)=>p.join('/')},isSymlinkFor:linked,
    ioUtils:{stat:async p=>({type:'regular',size:images.get(p)?.length||0}),
      read:async(p,options)=>{reads.push(p);assert.ok(options.maxBytes<=5*1024*1024+1);return images.get(p);}}});
  return {...result,reads};
}

test('folder artwork wins over JSON local image while keeping both fallbacks in order',async()=>{
  const files=[{relativePath:'Pack/Test/Category Icon.png',size:9}];
  const manifests=new Map([['Pack',{$categories:{' test ':{icon:'C:/Pictures/test.jpg'}}}]]);
  const result=await load({files,manifests,images:new Map([[base+'/Pack/Test/Category Icon.png',png],['C:/Pictures/test.jpg',jpg]])});
  assert.deepEqual(result.images.get('test').map(s=>s.split(';')[0]),['data:image/png','data:image/jpeg']);
});

test('relative artwork resolves within its pack and category image conflicts are deterministic',async()=>{
  const files=['A/Test/Category Icon.png','Z/TEST/Category Icon.jpg'].map(relativePath=>({relativePath,size:9}));
  const manifests=new Map([['A',{$categories:{Test:{icon:'art/icon.png'}}}]]);
  const images=new Map([[base+'/A/Test/Category Icon.png',png],[base+'/Z/TEST/Category Icon.jpg',jpg],[base+'/A/art/icon.png',png]]);
  const a=await load({files,manifests,images}),b=await load({files:[...files].reverse(),manifests,images});
  assert.deepEqual(a.images,b.images);
  assert.match(a.images.get('test')[0],/^data:image\/jpeg/);
  assert.ok(a.warnings.some(w=>/conflict/i.test(w)));
});

test('remote, traversal, device and SVG paths never reach the file reader',async()=>{
  for(const icon of ['https://host/x.png','file://host/x.png','../x.png','\\\\host\\x.png','C:/x.png:stream','C:/x.svg','C:/../x.png']) {
    const result=await load({manifests:new Map([['Pack',{$categories:{Test:{icon}}}]])});
    assert.deepEqual(result.reads,[],icon); assert.equal(result.images.size,0,icon);
  }
});

test('linked ancestors and disguised SVG bytes are refused; Unicode is not a path',async()=>{
  const manifests=new Map([['Pack',{$categories:{Test:{icon:'C:/Pictures/x.png'},Science:{icon:'🧪'}}}]]);
  const images=new Map([['C:/Pictures/x.png',new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>')]]);
  const linked=await load({manifests,images,linked:p=>p==='C:/Pictures'});
  assert.deepEqual(linked.reads,[]);assert.equal(linked.images.size,0);
  const disguised=await load({manifests,images});
  assert.deepEqual(disguised.reads,['C:/Pictures/x.png']);assert.equal(disguised.images.size,0);
});

test('oversized images are rejected before reading',async()=>{
  const result=await load({manifests:new Map([['Pack',{$categories:{Test:{icon:'C:/large.png'}}}]]),images:new Map([['C:/large.png',{length:5*1024*1024+1}]])});
  assert.deepEqual(result.reads,[]);assert.equal(result.images.size,0);
});

test('category artwork is not a selectable tile and survives catalog/model metadata flow',()=>{
  const catalog=buildCustomIconCatalog({files:['Pack/Test/Category Icon.png','Pack/Test/fish.png'].map(relativePath=>({relativePath,size:9,source:'file:///'+relativePath})),
    categoryImageSources:new Map([['test',['data:image/png;base64,iVBORw0KGgoA']]])});
  assert.equal(catalog.records.length,1);
  assert.equal(catalog.records[0].name,'Fish');
  assert.deepEqual(createPickerModel(catalog.records,{categoryMetadata:catalog.categoryMetadata}).snapshot().groups[0].categoryImages,['data:image/png;base64,iVBORw0KGgoA']);
});

test('folder artwork survives merging novel category metadata from differently cased packs',()=>{
  const catalog=buildCustomIconCatalog({
    files:[{relativePath:'A/Research/fish.png',size:9,source:'file:///fish.png'}],
    manifests:new Map([['A',{$categories:{Research:{icon:'🧪',aliases:['experiments']}}}],['Z',{$categories:{' research ':{icon:'🔬',aliases:['labs']}}}]]),
    categoryImageSources:new Map([['research',['data:image/png;base64,iVBORw0KGgoA']]]),
  });
  const model=createPickerModel(catalog.records,{categoryMetadata:catalog.categoryMetadata});
  assert.deepEqual(model.snapshot().groups[0].categoryImages,['data:image/png;base64,iVBORw0KGgoA']);
  for(const query of ['experiments','labs']){model.setQuery(query);assert.equal(model.snapshot().groups[0]?.records.length,1);}
});

test('nested manifests warn rather than silently changing the pack rules',async()=>{
  const result=await scanCustomIconPacks({rootDirectory:'C:/custom',pathUtils:{join:(...p)=>p.join('/')},isSymlinkFor:()=>false,sourceFor:p=>'file:///'+p,
    ioUtils:{makeDirectory:async()=>{},getChildren:async p=>({'C:/custom':['C:/custom/Wrapper'],'C:/custom/Wrapper':['C:/custom/Wrapper/Pack'],'C:/custom/Wrapper/Pack':['C:/custom/Wrapper/Pack/icons.json','C:/custom/Wrapper/Pack/fish.png']}[p]||[]),
      stat:async p=>({type:/\.(json|png)$/.test(p)?'regular':'directory',size:9}),readUTF8:async()=>{throw Error('nested manifest should not be loaded');}}});
  assert.equal(result.records.length,1);assert.ok(result.warnings.some(w=>/nested.*icons\.json/i.test(w)));
});

test('picker and filter artwork fall through rejected images to Unicode decoration',async()=>{
  const f=await fixture();await tick();
  try {
    const catalog=buildCustomIconCatalog({files:[{relativePath:'Pack/Test/fish.png',size:9,source:'file:///fish.png'}],manifests:new Map([['Pack',{$categories:{Test:{icon:'🧪'}}}]]),categoryImageSources:new Map([['test',['data:image/png;base64,iVBORw0KGgoA']]])});
    const view=f.mod.namespace.createPickerView({document:f.document,panel:f.panel,model:createPickerModel(catalog.records,{categoryMetadata:catalog.categoryMetadata}),bridge:{selectCustom(){}},getOptions:()=>({}),getFolder:()=>null});
    const images=f.document.querySelectorAll('.zen-icons-category-artwork');
    assert.equal(images.length,2);
    for(const image of images){const parent=image.parentNode;image.fire('error');assert.equal(parent.textContent,'🧪');}
    view.destroy();
  }finally{f.dispose();}
});
