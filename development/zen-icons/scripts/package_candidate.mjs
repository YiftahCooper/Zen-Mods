import {mkdir,mkdtemp,readFile,writeFile,cp,readdir,rename,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {buildSineMod} from './build_sine_mod.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const scratch=path.join(root,'.backup-scratch');
await mkdir(scratch,{recursive:true});
const stage=await mkdtemp(path.join(scratch,'release-'));
const payload=path.join(stage,'payload');
await mkdir(payload);
const packageRoot=path.join(payload,'zen-icons-local');
await buildSineMod({outputDirectory:packageRoot});
const theme=JSON.parse(await readFile(path.join(packageRoot,'theme.json'),'utf8'));
const releaseRoot=path.join(root,'output','releases');
const name=`Zen-Icons-${theme.version}`;
const destination=path.join(releaseRoot,`${name}.zip`);
try{await stat(destination);throw Error(`Selected release already exists; do not overwrite: ${destination}`);}catch(error){if(error.code!=='ENOENT')throw error;}
await cp(path.join(root,'scripts','deploy_sine_mod.ps1'),path.join(payload,'deploy_sine_mod.ps1'));
await writeFile(path.join(payload,'Install.ps1'),`[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$ProfilePath)
$ErrorActionPreference='Stop'
& (Join-Path $PSScriptRoot 'deploy_sine_mod.ps1') -ProfilePath $ProfilePath -PackagePath (Join-Path $PSScriptRoot 'zen-icons-local')
`);
await writeFile(path.join(payload,'README.txt'),`Zen Icons ${theme.version}

Extract the complete ZIP. The zen-icons-local directory is the complete Sine package.
No browser profile is included. Extraction does not install or activate the mod.

For an existing Sine test profile, close that profile and run in PowerShell 7:
pwsh -NoProfile -File .\\Install.ps1 -ProfilePath 'C:\\full\\path\\to\\your\\test-profile'

The installer verifies the package, refuses a locked profile, preserves custom
icons/unrelated settings and prints an explicit backup path for rollback.
See zen-icons-local/README.md for recovery and zen-icons-local/CUSTOM-ICONS.md
for custom image packs, tags and category artwork.
`);
const quote=value=>"'"+value.replaceAll("'","''")+"'";
const archive=path.join(stage,'candidate.zip');
const extracted=path.join(stage,'extracted');
const result=spawnSync('C:\\Program Files\\PowerShell\\7\\pwsh.exe',['-NoLogo','-NoProfile','-Command',
  `Compress-Archive -Path ${quote(path.join(payload,'*'))} -DestinationPath ${quote(archive)}; if (-not $?) { exit 1 }; Expand-Archive -LiteralPath ${quote(archive)} -DestinationPath ${quote(extracted)}; if (-not $?) { exit 1 }`],{encoding:'utf8'});
if(result.status!==0)throw Error(result.stderr || result.stdout || 'Archive creation/extraction failed');
const inventory=JSON.parse(await readFile(path.join(packageRoot,'package-inventory.json'),'utf8'));
const expected=new Set([...Object.keys(inventory.files),'package-inventory.json']);
let count=0;
const hash=data=>createHash('sha256').update(data).digest('hex');
async function verify(directory,prefix='') {
  for(const entry of await readdir(directory,{withFileTypes:true})) {
    const relative=prefix+entry.name;
    if(entry.isDirectory())await verify(path.join(directory,entry.name),relative+'/');
    else {
      if(!expected.has(relative))throw Error(`Unexpected extracted package file: ${relative}`);
      const data=await readFile(path.join(directory,entry.name));
      const metadata=inventory.files[relative];
      if(metadata && (metadata.size!==data.length || metadata.sha256!==hash(data)))throw Error(`Extracted package mismatch: ${relative}`);
      if(!metadata && hash(data)!==hash(await readFile(path.join(packageRoot,relative))))throw Error('Extracted inventory changed');
      count++;
    }
  }
}
await verify(path.join(extracted,'zen-icons-local'));
if(count!==expected.size)throw Error('Extracted package incomplete');
for(const filename of ['Install.ps1','deploy_sine_mod.ps1','README.txt']) {
  if(hash(await readFile(path.join(extracted,filename)))!==hash(await readFile(path.join(payload,filename))))throw Error(`Extracted installer mismatch: ${filename}`);
}
const sha256=hash(await readFile(archive));
await mkdir(releaseRoot,{recursive:true});
await rename(archive,destination);
const receipt={version:theme.version,archive:destination,sha256,packageFileCount:count,archiveExtractionVerified:true,
  packageInventorySha256:hash(await readFile(path.join(packageRoot,'package-inventory.json')))};
await writeFile(path.join(releaseRoot,`${name}.json`),JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify(receipt,null,2));
