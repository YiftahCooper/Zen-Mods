import test from 'node:test';
import assert from 'node:assert/strict';
import {fixture,tick} from './runtime-fixture.mjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {customStoragePaths,canonicalCustomSource,ensureCustomStorage,legacyArtworkManifest} from '../../src/zen-icons-sine/custom-storage.mjs';

async function storage(run){
  const parent=path.resolve(import.meta.dirname,'../../.backup-scratch/storage-tests');
  await fs.mkdir(parent,{recursive:true});
  const profileDir=await fs.mkdtemp(path.join(parent,'profile-'));
  const paths=customStoragePaths(profileDir,path.join);
  const ioUtils={
    exists:async p=>{try{await fs.access(p);return true;}catch{return false;}},
    makeDirectory:(p)=>fs.mkdir(p,{recursive:true}),
    getChildren:async p=>(await fs.readdir(p)).map(name=>path.join(p,name)),
    stat:async p=>{const s=await fs.lstat(p);return {type:s.isDirectory()?'directory':s.isFile()?'regular':'other',size:s.size,lastModified:s.mtimeMs};},
    read:async(p,{offset=0,maxBytes}={})=>{const data=await fs.readFile(p);return new Uint8Array(data.subarray(offset,maxBytes===undefined?undefined:offset+maxBytes));},
    readUTF8:p=>fs.readFile(p,'utf8'),
    readJSON:async p=>JSON.parse(await fs.readFile(p,'utf8')),
    copy:(a,b)=>fs.copyFile(a,b,1),
    move:async(a,b)=>{try{await fs.access(b);throw Error('destination exists');}catch(error){if(error.code!=='ENOENT')throw error;}await fs.rename(a,b);},
    remove:p=>fs.unlink(p),
    write:(p,bytes)=>fs.writeFile(p,bytes,{flag:'wx'}),
    writeJSON:(p,v)=>fs.writeFile(p,JSON.stringify(v),{flag:'wx'}),
    computeHexDigest:async p=>createHash('sha256').update(await fs.readFile(p)).digest('hex'),
  };
  const options={profileDir,pathUtils:{join:path.join,parent:path.dirname,filename:path.basename},ioUtils,isSymlinkFor:()=>false};
  const write=async(p,data)=>{await fs.mkdir(path.dirname(p),{recursive:true});await fs.writeFile(p,data);};
  try{await run({paths,profileDir,options,write});}finally{assert.ok(profileDir.startsWith(parent+path.sep));await fs.rm(profileDir,{recursive:true,force:true});}
}

test('custom artwork is created outside the replaceable Sine mod directory',async()=>{
  const f=await fixture();
  try{
    await tick();await tick();
    assert.ok(f.createdDirectories.includes('C:/audit/profile/zen-icon-packs'),
      `Expected persistent profile userdata, got ${JSON.stringify(f.createdDirectories)}`);
  }finally{f.dispose();}
});

test('one-time migration preserves legacy bytes, filenames, tags and category paths',()=>storage(async({paths,options,write})=>{
  await write(path.join(paths.legacy,'Pack','Animals','fish.png'),'fish');
  const manifest={$categories:{Animals:{icon:path.join(paths.legacy,'Pack','Animals','Category Icon.png')}},'Animals/fish.png':{tags:['aquatic']}};
  const json=JSON.stringify(manifest);await write(path.join(paths.legacy,'Pack','icons.json'),json);
  await ensureCustomStorage(options);
  assert.equal(await fs.readFile(path.join(paths.root,'Pack','Animals','fish.png'),'utf8'),'fish');
  assert.equal(await fs.readFile(path.join(paths.legacy,'Pack','icons.json'),'utf8'),json);
  const copied=JSON.parse(await fs.readFile(path.join(paths.root,'Pack','icons.json'),'utf8'));
  assert.equal(copied.$categories.Animals.icon,path.join(paths.root,'Pack','Animals','Category Icon.png').replaceAll('\\','/'));
  assert.deepEqual(copied['Animals/fish.png'].tags,['aquatic']);
}));

test('completed migration never resurrects deliberately deleted external artwork',()=>storage(async({paths,options,write})=>{
  await write(path.join(paths.legacy,'Pack','icon.png'),'original');await ensureCustomStorage(options);
  await fs.unlink(path.join(paths.root,'Pack','icon.png'));await ensureCustomStorage(options);
  assert.equal(await options.ioUtils.exists(path.join(paths.root,'Pack','icon.png')),false);
}));

test('conflicts do not overwrite either directory and do not commit migration',()=>storage(async({paths,options,write})=>{
  const relative=['Pack','icon.png'];await write(path.join(paths.legacy,...relative),'legacy');await write(path.join(paths.root,...relative),'mine');
  await assert.rejects(ensureCustomStorage(options),/conflict/i);
  assert.equal(await fs.readFile(path.join(paths.root,...relative),'utf8'),'mine');
  assert.equal(await fs.readFile(path.join(paths.legacy,...relative),'utf8'),'legacy');
  assert.equal(await options.ioUtils.exists(path.join(paths.root,'.zen-icons-migrated-v1.json')),false);
}));

test('interrupted copy never leaves a partial authoritative image and retry succeeds',()=>storage(async({paths,options,write})=>{
  await write(path.join(paths.legacy,'Pack','icon.png'),'complete');const copy=options.ioUtils.copy;
  options.ioUtils.copy=async(a,b)=>{await fs.writeFile(b,'partial');throw Error('simulated interruption');};
  await assert.rejects(ensureCustomStorage(options),/interruption/);
  assert.equal(await options.ioUtils.exists(path.join(paths.root,'Pack','icon.png')),false);
  options.ioUtils.copy=copy;await ensureCustomStorage(options);
  assert.equal(await fs.readFile(path.join(paths.root,'Pack','icon.png'),'utf8'),'complete');
}));

test('a changing legacy tree cannot be marked fully migrated',()=>storage(async({paths,options,write})=>{
  await write(path.join(paths.legacy,'Pack','first.png'),'first');const copy=options.ioUtils.copy;let added=false;
  options.ioUtils.copy=async(a,b)=>{await copy(a,b);if(!added){added=true;await write(path.join(paths.legacy,'Pack','late.png'),'late');}};
  await assert.rejects(ensureCustomStorage(options),/changed/i);
  assert.equal(await options.ioUtils.exists(path.join(paths.root,'.zen-icons-migrated-v1.json')),false);
  await ensureCustomStorage(options);assert.equal(await fs.readFile(path.join(paths.root,'Pack','late.png'),'utf8'),'late');
}));

test('changed existing legacy file during copy can be retried without a false user conflict',()=>storage(async({paths,options,write})=>{
  const file=path.join(paths.legacy,'Pack','icon.png');await write(file,'original');const copy=options.ioUtils.copy;let changed=false;
  options.ioUtils.copy=async(a,b)=>{await copy(a,b);if(!changed){changed=true;await write(file,'edited-complete');}};
  await assert.rejects(ensureCustomStorage(options),/changed/i);
  await ensureCustomStorage(options);
  assert.equal(await fs.readFile(path.join(paths.root,'Pack','icon.png'),'utf8'),'edited-complete');
}));

test('failed migration never cleans up a destination changed independently by the user',()=>storage(async({paths,options,write})=>{
  const source=path.join(paths.legacy,'Pack','first.png'),target=path.join(paths.root,'Pack','first.png');
  await write(source,'source');await write(path.join(paths.legacy,'Pack','second.png'),'second');const copy=options.ioUtils.copy;let n=0;
  options.ioUtils.copy=async(a,b)=>{await copy(a,b);if(++n===2){await fs.writeFile(target,'user edit');await write(source,'source changed');}};
  await assert.rejects(ensureCustomStorage(options),/changed/i);
  assert.equal(await fs.readFile(target,'utf8'),'user edit');
}));

test('linked migration entries are refused before copying',()=>storage(async({paths,options,write})=>{
  const file=path.join(paths.legacy,'Pack','icon.png');await write(file,'data');options.isSymlinkFor=p=>p===file;
  await assert.rejects(ensureCustomStorage(options),/Linked/);
  assert.equal(await options.ioUtils.exists(path.join(paths.root,'Pack','icon.png')),false);
}));

test('URL migration is restricted to this profile and rejects traversal',()=>{
  const profileDir='C:/profile',options={profileDir,joinPath:path.posix.join,toFileURL:p=>'file:///'+p};
  assert.equal(canonicalCustomSource('chrome://sine/content/zen-icons-local/custom/My%20Pack/a.png#zen-icon.svg',options),'chrome://zen-icons-custom/content/My%20Pack/a.png#zen-icon.svg');
  assert.equal(canonicalCustomSource('file:///C:/profile/chrome/sine-mods/zen-icons-local/custom/Pack/a.png',options),'file:///C:/profile/zen-icon-packs/Pack/a.png');
  assert.equal(canonicalCustomSource('file:///C:/other/zen-icon-packs/Pack/a.png',options),null);
  assert.equal(canonicalCustomSource('file:///c:/PROFILE/CHROME/sine-mods/zen-icons-local/custom/Pack/a.png',options),'file:///C:/profile/zen-icon-packs/Pack/a.png');
  assert.equal(canonicalCustomSource('chrome://sine/content/zen-icons-local/custom/Pack/%2e%2e/a.png',options),null);
  assert.equal(canonicalCustomSource('file:///C:/zen-icon-packs/profile/chrome/sine-mods/zen-icons-local/custom/Pack/a.png',{...options,profileDir:'C:/zen-icon-packs/profile'}),'file:///C:/zen-icon-packs/profile/zen-icon-packs/Pack/a.png');
});

test('Windows absolute category-artwork migration ignores path prefix case',()=>{
  const json=JSON.stringify({$categories:{Animals:{icon:'c:/profile/CHROME/sine-mods/zen-icons-local/custom/Pack/Animals/Category Icon.png'}}});
  const updated=JSON.parse(legacyArtworkManifest(json,'C:/Profile/chrome/sine-mods/zen-icons-local/custom','C:/Profile/zen-icon-packs'));
  assert.equal(updated.$categories.Animals.icon,'C:/Profile/zen-icon-packs/Pack/Animals/Category Icon.png');
});

test('failed storage preparation does not rewrite saved native choices',async()=>{
  const source='chrome://sine/content/zen-icons-local/custom/Pack/first.png#zen-icon.svg';
  const tab={zenStaticIcon:source,permanentKey:{}};
  const f=await fixture({linkedRoot:true,imports:{'resource:///modules/sessionstore/TabStateCache.sys.mjs':{TabStateCache:{update(){}}}},onBeforeInit:({browser})=>{
    browser.gBrowser={tabs:[tab],setIcon(){}};
  }});
  try{await tick();await tick();assert.equal(tab.zenStaticIcon,source);}finally{f.dispose();}
});
