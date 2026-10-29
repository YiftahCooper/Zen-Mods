import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseAreaState, chooseInitialPin, clampRatio, restoreOwned} from '../src/state.mjs';
test('unknown and malformed records are refused instead of migrated',()=>{
  assert.equal(parseAreaState('{'),null);
  assert.equal(parseAreaState('{"schema":2,"spaces":{}}'),null);
  assert.deepEqual(parseAreaState(''),{schema:1,spaces:{}});
  assert.equal(parseAreaState('{"schema":1,"spaces":{"s":{"upper":["a"],"lower":["a"]}}}'),null);
});
test('creation defaults are once-only; known choices defeat placement and defaults',()=>{
  assert.equal(chooseInitialPin({known:true,zone:'lower',folder:true}),true);
  assert.equal(chooseInitialPin({known:false,zone:'upper',folder:false}),false);
  assert.equal(chooseInitialPin({origin:'duplicate',known:true,zone:'upper'}),false);
  assert.equal(chooseInitialPin({origin:'new',zone:'upper',folder:false}),false);
  assert.equal(chooseInitialPin({origin:'new',zone:'upper',folder:false,pinRoots:true}),true);
  assert.equal(chooseInitialPin({origin:'new',zone:'upper',folder:true}),false);
  assert.equal(chooseInitialPin({origin:'new',zone:'lower',folder:true,pinFolders:true}),false);
  assert.equal(chooseInitialPin({origin:'new',zone:'upper',folder:true,pinFolders:true}),true);
});
test('small sidebar allocates both zones and clamps divider',()=>{
  assert.equal(clampRatio(0,600),.12);
  assert.equal(clampRatio(1,600),.88);
  assert.equal(clampRatio(.1,100),.5);
  assert.equal(clampRatio(NaN,600),.5);
});
test('teardown preserves a later writer',()=>{
  const a=()=>1,b=()=>2,c=()=>3, owner={method:a};
  const descriptor=Object.getOwnPropertyDescriptor(owner,'method');
  owner.method=b;restoreOwned({owner,name:'method',wrapper:b,descriptor});assert.equal(owner.method,a);
  owner.method=c;restoreOwned({owner,name:'method',wrapper:b,descriptor});assert.equal(owner.method,c);
});
