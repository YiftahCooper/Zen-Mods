import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,copyFileSync} from 'node:fs';
import {join,resolve,sep,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const hash=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
function inside(root,name){const path=resolve(root,name);if(!path.startsWith(resolve(root)+sep))throw Error('Manifest path escapes package');return path;}
function verified(dir){const identity=JSON.parse(readFileSync(join(dir,'identity.json'),'utf8'));for(const [name,digest]of Object.entries(identity.files)){if(hash(inside(dir,name))!==digest)throw Error('Input hash mismatch: '+name);}return identity;}
export function prepareReviewProfile({base,packageDir,runtimeDir,allowInternet=false}){
 const packageIdentity=verified(packageDir),runtimeIdentity=verified(runtimeDir);
 mkdirSync(base,{recursive:true});const profile=mkdtempSync(join(resolve(base),'profile-'));
 const receipt={stage:'preparing',profile,created:new Date().toISOString(),packageIdentity,runtimeIdentity,network:allowInternet?'direct Internet access; separate review profile':'dead loopback proxy; local synthetic pages only'};
 const receiptPath=join(profile,'review-profile.json');writeFileSync(receiptPath,JSON.stringify(receipt,null,2));
 const copy=(source,target,identity)=>{for(const [name,digest]of Object.entries(identity.files)){const dest=inside(target,name);mkdirSync(dirname(dest),{recursive:true});copyFileSync(inside(source,name),dest);if(hash(dest)!==digest)throw Error('Installed hash mismatch: '+name);}};
 const chrome=join(profile,'chrome');copy(runtimeDir,chrome,runtimeIdentity);
 const mod=join(chrome,'sine-mods','better-pins');copy(packageDir,mod,packageIdentity);
 const theme=JSON.parse(readFileSync(join(mod,'theme.json'),'utf8'));
 writeFileSync(join(chrome,'sine-mods','mods.json'),JSON.stringify({'better-pins':{...theme,id:'better-pins',origin:'local',enabled:true,'no-updates':true}}));
 writeFileSync(join(profile,'start.html'),'<!doctype html><meta charset="utf-8"><title>Better Pins candidate</title><style>body{font:18px system-ui;max-width:700px;margin:60px auto;padding:24px;line-height:1.6}a{color:#365bc7}</style><h1>Better Pins test profile</h1><p>This is a new, separate profile with synthetic pages. Your existing Zen profiles are untouched.</p><ol><li>Right-click a tab for Pin URL and the zone commands.</li><li>Pin this page, open <a href="page-b.html">Page B</a>, then use Reset to Pinned URL.</li><li>Create a native folder, then use its menu to move the whole tree.</li><li>Drag the divider or focus it and use the arrow keys.</li></ol><p>Close this window when finished. This launcher creates a new profile each time. '+(allowInternet?'Internet browsing is enabled in this separate review profile.':'Internet browsing is blocked in this automated fixture.')+'</p>');
 writeFileSync(join(profile,'page-b.html'),'<!doctype html><meta charset="utf-8"><title>Page B</title><h1>Page B</h1><p>Use Reset to Pinned URL to return to your saved page, or Unpin URL to keep this page and placement.</p><a href="start.html">Back to test guide</a>');
 const prefs={'browser.shell.checkDefaultBrowser':false,'browser.startup.page':1,'browser.startup.homepage':pathToFileURL(join(profile,'start.html')).href,'browser.aboutwelcome.enabled':false,'zen.welcome-screen.seen':true,'browser.startup.homepage_override.mstone':'ignore','sine.allow-unsafe-js':true,'sine.auto-updates':false,'sine.engine.auto-update':false,'better-pins.consent-version':1,'zen.pinned-tab-manager.restore-pinned-tabs-to-pinned-url':false,...(allowInternet?{'network.proxy.type':0}:{'network.proxy.type':1,'network.proxy.http':'127.0.0.1','network.proxy.http_port':9,'network.proxy.ssl':'127.0.0.1','network.proxy.ssl_port':9}),'datareporting.policy.dataSubmissionEnabled':false,'toolkit.telemetry.enabled':false};
 writeFileSync(join(profile,'user.js'),Object.entries(prefs).map(([k,v])=>`user_pref(${JSON.stringify(k)},${JSON.stringify(v)});`).join('\n'));
 receipt.stage='prepared';writeFileSync(receiptPath,JSON.stringify(receipt,null,2));return receipt;
}
