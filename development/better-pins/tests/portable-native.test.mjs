import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

async function sourceSubstitutions(file) {
  const substitutions = new Map();
  const roots = {
    'bp.test.source-root': 'file:///D:/relocated%20checkout/better-pins/',
    'bp.test.bzf-root': 'file:///D:/relocated%20checkout/better-pins/.backup-scratch/companions/better-zen-folders/',
  };
  await new Promise(resolve => {
    vm.runInNewContext(readFileSync(new URL(`native/${file}`, import.meta.url), 'utf8'), {
      arguments: [resolve],
      setTimeout,
      Services: {
        prefs: {getStringPref: key => roots[key]},
        scriptSecurityManager: {getSystemPrincipal: () => ({})},
        io: {
          newURI: value => value,
          getProtocolHandler: () => ({QueryInterface() {return this;}, setSubstitution: (key, value) => substitutions.set(key, value)}),
        },
      },
      Ci: {nsIResProtocolHandler: {}},
      ChromeUtils: {importESModule() {throw Error('stop after recording the real source substitutions');}},
    });
  });
  return substitutions;
}

test('native candidate probe follows a relocated checkout containing spaces', async () => {
  const roots = await sourceSubstitutions('candidate.js');
  assert.equal(roots.get('better-pins-test'), 'file:///D:/relocated%20checkout/better-pins/');
});

test('native lifecycle probe resolves its retained BZF fixture without a sibling worktree', async () => {
  const roots = await sourceSubstitutions('lifecycle.js');
  assert.equal(roots.get('bp-life'), 'file:///D:/relocated%20checkout/better-pins/');
  assert.equal(roots.get('bp-bzf'), 'file:///D:/relocated%20checkout/better-pins/.backup-scratch/companions/better-zen-folders/');
});
