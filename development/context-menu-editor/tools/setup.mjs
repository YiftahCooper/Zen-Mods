import {mkdir,copyFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url),destination=new URL('.backup-scratch/deps/',root);
await mkdir(destination,{recursive:true});
await copyFile(new URL('package.json',root),new URL('package.json',destination));
await copyFile(new URL('package-lock.json',root),new URL('package-lock.json',destination));
// No trailing separator: on Windows a final backslash before a closing quote
// would escape the quote when npm.cmd hands the arguments to Node.
const folder=url=>fileURLToPath(url).replace(/[\\/]+$/,'');
const args=['ci','--include=dev','--ignore-scripts','--no-audit','--no-fund','--prefix',folder(destination),'--cache',folder(new URL('.backup-scratch/npm-cache/',root))];
const options={cwd:fileURLToPath(root),stdio:'inherit'};
// `npm run setup` provides npm's own JavaScript entry point; running it with
// this Node avoids shell quoting entirely. Otherwise Windows needs cmd.exe for
// npm.cmd, with the whole command line passed verbatim so cmd sees plain quotes.
const npmCli=process.env.npm_execpath;
const result=npmCli&&/\.[cm]?js$/i.test(npmCli)
 ?spawnSync(process.execPath,[npmCli,...args],options)
 :process.platform==='win32'
  ?spawnSync(process.env.ComSpec||'cmd.exe',['/d','/s','/c','"npm '+args.map(value=>'"'+value.replaceAll('"','')+'"').join(' ')+'"'],{...options,windowsVerbatimArguments:true})
  :spawnSync('npm',args,options);
if(result.error)throw result.error;
process.exitCode=result.status??1;
