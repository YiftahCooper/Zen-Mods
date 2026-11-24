import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

// Sine offers an update only when theme.json's updatedAt is later than the
// installed copy's; it ignores the version. 0.2.5 kept 0.2.4's date and
// "Check for updates" found nothing.
const themePath=fileURLToPath(new URL('../theme.json',import.meta.url));
const current=JSON.parse(readFileSync(themePath,'utf8'));
let committed=null;
try{
 const root=execFileSync('git',['rev-parse','--show-toplevel'],{cwd:fileURLToPath(new URL('..',import.meta.url)),encoding:'utf8'}).trim();
 const relative=themePath.slice(root.length+1).split(String.fromCharCode(92)).join('/');
 committed=JSON.parse(execFileSync('git',['show',`HEAD:${relative}`],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']}));
}catch{/* Outside a git checkout there is nothing to compare against. */}

test('theme.json updatedAt is a valid timestamp',()=>{
 assert.ok(!Number.isNaN(Date.parse(current.updatedAt)),current.updatedAt);
});
test('a version change also moves updatedAt forward, or Sine will not offer the update',{skip:!committed&&'no committed theme.json'},()=>{
 if(committed.version===current.version)return;
 assert.ok(Date.parse(current.updatedAt)>Date.parse(committed.updatedAt),
  `version ${committed.version} -> ${current.version} needs updatedAt later than ${committed.updatedAt}`);
});
