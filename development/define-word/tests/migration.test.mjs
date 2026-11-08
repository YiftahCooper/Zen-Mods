import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
const read=path=>readFile(new URL('../'+path,import.meta.url),'utf8');

test('collection package keeps its identity and directs installs and updates to the mod folder',async()=>{
  const theme=JSON.parse(await read('theme.json'));
  assert.equal(theme.id,'define-word');
  assert.equal(theme.homepage,'https://github.com/YiftahCooper/Zen-Mods/tree/main/define-word');
  assert.equal(theme.readme,'https://raw.githubusercontent.com/YiftahCooper/Zen-Mods/main/define-word/README.md');
  assert.equal(theme.version,JSON.parse(await read('package.json')).version);
  assert(new Date(theme.updatedAt)>new Date('2026-09-29T20:24:37Z'));
  const prefs=JSON.parse(await read('preferences.json'));
  for(const p of prefs)if(p.property)assert(p.property.startsWith('extension.define-word.'));
});

test('all bundled chrome resources resolve inside the extracted mod folder',async()=>{
  const source=await read('define-word.uc.js');
  const selection=await read('src/selection.sys.mjs');
  const paths=[...source.matchAll(/chrome:\/\/sine\/content\/define-word\/([^'"`\s)]+)/g),...selection.matchAll(/chrome:\/\/sine\/content\/define-word\/([^'"`\s)]+)/g)].map(m=>m[1]);
  assert(paths.length>=4);
  paths.push(...[...selection.matchAll(/\$\{BASE\}(actors\/[^`]+)/g)].map(m=>m[1]));
  assert.equal(new Set(paths).size,6);
  for(const path of new Set(paths))await access(new URL('../'+path,import.meta.url));
  assert(!source.includes('chrome://sine/content/define-word/define-word/'));
});
