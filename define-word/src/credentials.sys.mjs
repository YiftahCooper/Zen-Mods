const ORIGIN='https://define-word.invalid';
const allowed=new Set(['mw-collegiate','mw-learners']);
export function createCredentials(manager,createLogin){
  function check(provider){if(!allowed.has(provider))throw new Error('Unsupported credential provider');if(!manager.isLoggedIn)throw new Error('credential-unavailable');}
  function find(provider){check(provider);return manager.findLogins(ORIGIN,null,`define-word:${provider}`);}
  return {
    async get(provider){try{return find(provider)[0]?.password||null;}catch{throw new Error('credential-unavailable');}},
    async set(provider,key){
      check(provider);if(typeof key!=='string'||!key.trim()||key.length>512)throw new Error('Enter a valid API key.');
      try {const existing=find(provider);const login=createLogin({origin:ORIGIN,formActionOrigin:null,httpRealm:`define-word:${provider}`,username:'api-key',password:key.trim(),usernameField:'',passwordField:''});if(existing.length)manager.modifyLogin(existing[0],login);else await manager.addLoginAsync(login);}
      catch{throw new Error('credential-unavailable');}
    },
    async remove(provider){try{for(const login of find(provider))manager.removeLogin(login);}catch{throw new Error('credential-unavailable');}},
  };
}
