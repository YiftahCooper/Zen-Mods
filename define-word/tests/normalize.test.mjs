import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeTerm} from '../src/normalize.mjs';
test('normalization preserves displayed text and chooses script without guessing mixed input',()=>{
  assert.equal(normalizeTerm('  שלום!  ').query,'שלום');
  assert.equal(normalizeTerm('שָׁלוֹם').withoutNiqqud,'שלום');
  assert.equal(normalizeTerm('hello').language,'en');
  assert.equal(normalizeTerm('שלום hello').language,null);
  assert.equal(normalizeTerm('日本').language,null);
  assert.equal(normalizeTerm('!').status,'empty');
});
test('length is bounded by Unicode code points before any request',()=>{
  assert.equal(normalizeTerm('a'.repeat(101)).status,'too-long');
  assert.equal(normalizeTerm('a'.repeat(100)).query.length,100);
  assert.equal(normalizeTerm('').status,'empty');
});
