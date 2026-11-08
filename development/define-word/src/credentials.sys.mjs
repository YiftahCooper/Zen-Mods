const ORIGIN='https://define-word.invalid';
const allowed=new Set(['mw-collegiate','mw-learners','lexicala-he']);
export function createCredentials(manager,createLogin){
  async function check(provider){if(!allowed.has(provider))throw new Error('Unsupported credential provider');await manager.initializationPromise;if(!manager.isLoggedIn)throw new Error('credential-unavailable');}
  async function find(provider){
    await check(provider);
    // The legacy method can still exist as a throwing stub in newer Firefox.
    return typeof manager.searchLoginsAsync==='function'
      ? manager.searchLoginsAsync({origin:ORIGIN,httpRealm:`define-word:${provider}`})
      : manager.findLogins(ORIGIN,null,`define-word:${provider}`);
  }
  return {
    async get(provider){try{return (await find(provider))[0]?.password||null;}catch{throw new Error('credential-unavailable');}},
    async set(provider,key){
      if(typeof key!=='string'||!key.trim()||key.length>512)throw new Error('Enter a valid API key.');
      try {const existing=await find(provider);const login=createLogin({origin:ORIGIN,formActionOrigin:null,httpRealm:`define-word:${provider}`,username:'api-key',password:key.trim(),usernameField:'',passwordField:''});if(existing.length)await (manager.modifyLoginAsync??manager.modifyLogin).call(manager,existing[0],login);else await manager.addLoginAsync(login);}
      catch{throw new Error('credential-unavailable');}
    },
    async remove(provider){try{for(const login of await find(provider))await (manager.removeLoginAsync??manager.removeLogin).call(manager,login);}catch{throw new Error('credential-unavailable');}},
  };
}
