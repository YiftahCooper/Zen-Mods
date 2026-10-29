// Copy only the reviewed diagnostic transport, never any existing profile.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
let source=readFileSync(new URL('../../Better Zen Folders Sine Mod/.worktrees/better-zen-folders-implementation/tmp/two-area-spike/driver.mjs',import.meta.url),'utf8');
source=source.replace("const root=fileURLToPath(new URL('.',import.meta.url));","const root=fileURLToPath(new URL('../../artifacts/native/',import.meta.url));");
source=source.replaceAll('BZF_SPIKE_PROFILE','BP_TEST_PROFILE');
source=source.replace("'sine.allow-unsafe-js':true", "'better-pins.consent-version':1,'zen.pinned-tab-manager.restore-pinned-tabs-to-pinned-url':false,'sine.allow-unsafe-js':true");
source=source.replace("'bzf.spike.rename-mode':", "'bp.test.mode':process.env.BP_TEST_MODE || 'after','bzf.spike.rename-mode':");
source=source.replace("'bzf.spike.rename-mode':", "'bp.test.combined':process.env.BP_TEST_COMBINED === '1','bzf.spike.rename-mode':");
source=source.replace("const actual=session.capabilities?.['moz:profile'];if(actual&&resolve(actual)!==resolve(profile))", "const actual=session.capabilities?.['moz:profile'];if(!actual||resolve(actual)!==resolve(profile))");
source=source.replace("results.steps.push({file,result});", "results.steps.push({file,result});const value=result.value??result;if(value.error||value.results?.some(t=>!t.pass))process.exitCode=1;");
source=source.replace('console.log(JSON.stringify(results,null,2));',`if(process.env.BP_TEST_SCREENSHOT==='1'){
 const position=await execute('return window.__bpPointerPosition;');const p=position.value??position;
 if(p){await command('WebDriver:PerformActions',{actions:[{type:'pointer',id:'bp-mouse',parameters:{pointerType:'mouse'},actions:[{type:'pointerMove',duration:0,x:p.x,y:p.y},{type:'pointerDown',button:0},{type:'pointerMove',duration:250,x:p.x,y:p.y+45},{type:'pointerUp',button:0}]}]});
 const check=await execute('return {before:window.__bpPointerBefore,after:Services.prefs.getIntPref("better-pins.upper-percent",50)};');results.pointer=check.value??check;if(results.pointer.after<=results.pointer.before)process.exitCode=1;}
 const shot=await command('WebDriver:TakeScreenshot',{full:true});const png=shot.value??shot;writeFileSync(join(root,'screenshot-'+receiptId+'.png'),Buffer.from(png,'base64'));results.screenshot='screenshot-'+receiptId+'.png';} console.log(JSON.stringify(results,null,2));`);
mkdirSync(new URL('../tests/native/',import.meta.url),{recursive:true});
writeFileSync(new URL('../tests/native/driver.mjs',import.meta.url),source);
