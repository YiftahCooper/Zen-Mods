import test from 'node:test';import assert from 'node:assert/strict';
import {createCredentials} from '../src/credentials.sys.mjs';
test('credentials use provider-scoped login entries and update/remove only their own entries',async()=>{
  const entries=[{origin:'https://unrelated.invalid',password:'unrelated'}];
  const manager={isLoggedIn:true,findLogins(origin,form,realm){return entries.filter(x=>x.origin===origin&&x.httpRealm===realm);},addLoginAsync:async login=>entries.push(login),modifyLogin(old,next){entries.splice(entries.indexOf(old),1,next);},removeLogin(login){entries.splice(entries.indexOf(login),1);}};
  const credentials=createCredentials(manager,fields=>fields);await credentials.set('mw-collegiate','abc');await credentials.set('mw-learners','xyz');assert.equal(await credentials.get('mw-collegiate'),'abc');await credentials.set('mw-collegiate','new');assert.equal(await credentials.get('mw-collegiate'),'new');await credentials.remove('mw-collegiate');assert.equal(await credentials.get('mw-collegiate'),null);assert.equal(await credentials.get('mw-learners'),'xyz');assert.equal(entries[0].password,'unrelated');
});
test('locked credentials never downgrade storage or expose a key',async()=>{
  const credentials=createCredentials({isLoggedIn:false},()=>{throw Error('should not create');});await assert.rejects(credentials.set('mw-collegiate','secret'),/credential-unavailable/);await assert.rejects(credentials.get('mw-collegiate'),/credential-unavailable/);await assert.rejects(credentials.set('other','secret'));
});
