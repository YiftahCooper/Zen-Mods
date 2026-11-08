import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url),destination=new URL('.backup-scratch/deps/',root);
await mkdir(destination,{recursive:true});
await copyFile(new URL('package.json',root),new URL('package.json',destination));
await copyFile(new URL('package-lock.json',root),new URL('package-lock.json',destination));
const args=['ci','--include=dev','--ignore-scripts','--no-audit','--no-fund','--prefix',fileURLToPath(destination),'--cache',fileURLToPath(new URL('.backup-scratch/npm-cache/',root))];
// Windows npm.cmd needs the host command processor; arguments are fixed
// absolute project paths and quoted independently.
const result=process.platform==='win32'
 ?spawnSync(process.env.ComSpec||'cmd.exe',['/d','/s','/c','npm '+args.map(value=>'"'+value.replaceAll('"','')+'"').join(' ')],{cwd:fileURLToPath(root),stdio:'inherit'})
 :spawnSync('npm',args,{cwd:fileURLToPath(root),stdio:'inherit'});
if(result.error)throw result.error;
process.exitCode=result.status??1;
