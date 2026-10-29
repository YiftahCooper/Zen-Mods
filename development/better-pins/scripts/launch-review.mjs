import {prepareReviewProfile} from './prepare-review-profile.mjs';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
const receipt=prepareReviewProfile({base:join(root,'.backup-scratch/manual'),packageDir:join(root,'artifacts/review-0.1.0-candidate.4'),runtimeDir:join(root,'artifacts/review-runtime'),allowInternet:true});
if(process.argv.includes('--prepare-only')){console.log(JSON.stringify(receipt,null,2));process.exit(0);}
// This entry point is explicitly the user's visible interactive test launcher.
const proc=spawn(process.env.BP_ZEN_BINARY||'C:/Program Files/Zen Browser/zen.exe',['-no-remote','-profile',receipt.profile],{detached:true,stdio:'ignore',windowsHide:false});
proc.once('error',error=>{console.error(error);process.exitCode=1;});
proc.once('spawn',()=>{receipt.stage='launch-requested';receipt.launcherPid=proc.pid;writeFileSync(join(receipt.profile,'review-profile.json'),JSON.stringify(receipt,null,2));console.log('Opened a new Better Pins test profile: '+receipt.profile);proc.unref();});
