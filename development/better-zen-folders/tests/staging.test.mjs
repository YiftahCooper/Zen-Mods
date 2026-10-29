import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir, mkdtemp, writeFile, readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
const pwsh=process.env.BZF_PWSH || 'pwsh';

for (const lockedFile of ['parent.lock','chrome/sine-mods/mods.json']) {
  test(`staging preserves the prior generation when ${lockedFile} is locked`,
    {skip:process.platform!=='win32'}, async()=>{
      const root=fileURLToPath(new URL('../',import.meta.url));
      const base=path.join(root,'artifacts','staging-tests');
      await mkdir(base,{recursive:true});
      const profile=await mkdtemp(path.join(base,'profile-'));
      const id='5b0aa51f-cea7-4de5-8344-3e86e77fb88d';
      const mods=path.join(profile,'chrome','sine-mods');
      const installed=path.join(mods,id);
      await mkdir(path.join(installed,'scripts'),{recursive:true});
      const files=['chrome.css','preferences.json','theme.json','scripts/better-zen-folders.uc.mjs'];
      for(const file of files) await writeFile(path.join(installed,file),'predecessor');
      const registry=JSON.stringify({[id]:{id,version:'0.1.0',enabled:true},other:{keep:'yes'}});
      await writeFile(path.join(mods,'mods.json'),registry);
      await writeFile(path.join(profile,'parent.lock'),'');
      const quote=value=>"'"+value.replaceAll("'","''")+"'";
      const command=`$ErrorActionPreference='Stop'; $guard=[IO.File]::Open(${quote(path.join(profile,lockedFile))},'Open','Read','Read'); try { & ${quote(path.join(root,'scripts','stage-test-profile.ps1'))} -ProfilePath ${quote(profile)} } catch { Write-Output $_.Exception.Message; exit 17 } finally { $guard.Dispose() }`;
      const result=spawnSync(pwsh,['-NoLogo','-NoProfile','-Command',command],{encoding:'utf8'});
      assert.equal(result.status,17,result.stdout+result.stderr);
      assert.match(result.stdout,/used by another process|being used|access/i);
      assert.equal(await readFile(path.join(mods,'mods.json'),'utf8'),registry);
      for(const file of files) assert.equal(await readFile(path.join(installed,file),'utf8'),'predecessor');
    });
}

test('guarded staging registers BZF settings without overwriting another mod or local enablement',
  {skip:process.platform!=='win32'}, async()=>{
    const root=fileURLToPath(new URL('../',import.meta.url));
    const base=path.join(root,'artifacts','staging-tests');
    await mkdir(base,{recursive:true});
    const profile=await mkdtemp(path.join(base,'profile-'));
    const id='5b0aa51f-cea7-4de5-8344-3e86e77fb88d';
    const mods=path.join(profile,'chrome','sine-mods');
    const installed=path.join(mods,id);
    await mkdir(path.join(installed,'scripts'),{recursive:true});
    const inventory=['chrome.css','preferences.json','theme.json','scripts/better-zen-folders.uc.mjs'];
    for(const file of inventory) await writeFile(path.join(installed,file),'predecessor');
    const other={id:'zen-icons-local',preferences:'preferences.json',enabled:true,unknown:{keep:42}};
    await writeFile(path.join(mods,'mods.json'),JSON.stringify({[id]:{id,version:'0.1.0',enabled:false,'no-updates':true,custom:'keep'},'zen-icons-local':other}));
    await writeFile(path.join(profile,'parent.lock'),'');
    const result=spawnSync(pwsh,[
      '-NoLogo','-NoProfile','-File',path.join(root,'scripts','stage-test-profile.ps1'),'-ProfilePath',profile,
    ],{encoding:'utf8'});
    assert.equal(result.status,0,result.stderr||result.stdout);
    const registry=JSON.parse(await readFile(path.join(mods,'mods.json'),'utf8'));
    assert.deepEqual(registry['zen-icons-local'],other);
    assert.equal(registry[id].enabled,false);
    assert.equal(registry[id].custom,'keep');
    assert.equal(registry[id].preferences,'preferences.json');
    assert.equal(registry[id].version,JSON.parse(await readFile(path.join(root,'theme.json'),'utf8')).version);
    for(const file of inventory) assert.deepEqual(await readFile(path.join(installed,file)),await readFile(path.join(root,file)));
    const receipt=JSON.parse(result.stdout.trim());
    assert.equal(receipt.status,'installed-hash-verified');
    for(const file of inventory) assert.equal(await readFile(path.join(receipt.backup,file),'utf8'),'predecessor');
  });
