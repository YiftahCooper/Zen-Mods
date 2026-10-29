import {readFileSync,writeFileSync} from 'node:fs';
for(const name of ['intent','policy','lifecycle','grace','hooks']){
 const source=readFileSync(new URL(`../../Better Zen Folders Sine Mod/.worktrees/better-zen-folders-implementation/tests/folder-pin-${name}.test.mjs`,import.meta.url),'utf8');
 writeFileSync(new URL(`../tests/engine-${name}.test.mjs`,import.meta.url),'// Attributed BZF regression snapshot; same source revision as pin-engine provenance.\n'+source.replaceAll('../scripts/better-zen-folders.uc.mjs','../src/pin-engine.mjs'));
}
