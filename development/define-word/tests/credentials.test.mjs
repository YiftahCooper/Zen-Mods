import test from 'node:test';import assert from 'node:assert/strict';
import {createCredentials} from '../src/credentials.sys.mjs';
test('modern Login Manager reads existing realms and awaits asynchronous update and removal',async()=>{
  const entries=[{origin:'https://define-word.invalid',formActionOrigin:null,httpRealm:'define-word:mw-collegiate',username:'api-key',password:'fixture-existing'}];
  let ready=false;
  const manager={initializationPromise:Promise.resolve().then(()=>{ready=true;}),get isLoggedIn(){return ready;},findLogins(){throw Error('removed');},
    async searchLoginsAsync(criteria){assert.deepEqual(criteria,{origin:'https://define-word.invalid',httpRealm:'define-word:mw-collegiate'});return entries.filter(e=>e.origin===criteria.origin&&e.httpRealm===criteria.httpRealm);},
    async modifyLoginAsync(old,next){await new Promise(r=>setImmediate(r));entries.splice(entries.indexOf(old),1,next);},
    async removeLoginAsync(login){await new Promise(r=>setImmediate(r));entries.splice(entries.indexOf(login),1);},async addLoginAsync(login){entries.push(login);}};
  const credentials=createCredentials(manager,fields=>fields);
  assert.equal(await credentials.get('mw-collegiate'),'fixture-existing');await credentials.set('mw-collegiate','fixture-updated');assert.equal(entries[0].password,'fixture-updated');
  await credentials.remove('mw-collegiate');assert.equal(entries.length,0);await credentials.set('mw-collegiate','fixture-new');assert.equal(await credentials.get('mw-collegiate'),'fixture-new');
});
test('modern search failures remain errors instead of falling back or overwriting stored entries',async()=>{
  const manager={isLoggedIn:true,searchLoginsAsync:async()=>{throw Error('fixture-sensitive-value');},findLogins(){assert.fail('must not retry old API');},addLoginAsync(){assert.fail('must not overwrite');}};
  const credentials=createCredentials(manager,fields=>fields);
  for(const operation of [()=>credentials.get('mw-collegiate'),()=>credentials.set('mw-collegiate','fixture'),()=>credentials.remove('mw-collegiate')])await assert.rejects(operation(),{message:'credential-unavailable'});
});
test('credentials use provider-scoped login entries and update/remove only their own entries',async()=>{
  const entries=[{origin:'https://unrelated.invalid',password:'unrelated'}];
  const manager={isLoggedIn:true,findLogins(origin,form,realm){return entries.filter(x=>x.origin===origin&&x.httpRealm===realm);},addLoginAsync:async login=>entries.push(login),modifyLogin(old,next){entries.splice(entries.indexOf(old),1,next);},removeLogin(login){entries.splice(entries.indexOf(login),1);}};
  const credentials=createCredentials(manager,fields=>fields);await credentials.set('mw-collegiate','abc');await credentials.set('mw-learners','xyz');assert.equal(await credentials.get('mw-collegiate'),'abc');await credentials.set('mw-collegiate','new');assert.equal(await credentials.get('mw-collegiate'),'new');await credentials.remove('mw-collegiate');assert.equal(await credentials.get('mw-collegiate'),null);assert.equal(await credentials.get('mw-learners'),'xyz');assert.equal(entries[0].password,'unrelated');
});
test('locked credentials never downgrade storage or expose a key',async()=>{
  const credentials=createCredentials({isLoggedIn:false},()=>{throw Error('should not create');});await assert.rejects(credentials.set('mw-collegiate','secret'),/credential-unavailable/);await assert.rejects(credentials.get('mw-collegiate'),/credential-unavailable/);await assert.rejects(credentials.set('other','secret'));
});

test('Lexicala uses its own credential realm and can be removed independently',async()=>{
  const entries=[];const manager={isLoggedIn:true,findLogins:(origin,form,realm)=>entries.filter(e=>e.origin===origin&&e.httpRealm===realm),addLoginAsync:async e=>entries.push(e),removeLogin:e=>entries.splice(entries.indexOf(e),1)};
  const credentials=createCredentials(manager,fields=>fields);await credentials.set('lexicala-he','fixture-lexicala-key');await credentials.set('mw-collegiate','fixture-mw-key');
  assert.equal(await credentials.get('lexicala-he'),'fixture-lexicala-key');assert.equal(entries[0].httpRealm,'define-word:lexicala-he');await credentials.remove('lexicala-he');assert.equal(await credentials.get('lexicala-he'),null);assert.equal(await credentials.get('mw-collegiate'),'fixture-mw-key');
});

test('recreating the mod credential service reads existing version-independent Merriam-Webster keys without rewriting them',async()=>{
  const entries=['mw-collegiate','mw-learners'].map(id=>({origin:'https://define-word.invalid',httpRealm:`define-word:${id}`,username:'api-key',password:`fixture-${id}`}));
  const manager={isLoggedIn:true,findLogins:(origin,form,realm)=>entries.filter(e=>e.origin===origin&&e.httpRealm===realm),addLoginAsync(){throw Error('update must not write');},modifyLogin(){throw Error('update must not rewrite');},removeLogin(){throw Error('update must not remove');}};
  for(let version=0;version<2;version++){
    const credentials=createCredentials(manager,()=>{throw Error('update must not recreate login');});
    for(const id of ['mw-collegiate','mw-learners'])assert.equal(await credentials.get(id),`fixture-${id}`);
  }
});
