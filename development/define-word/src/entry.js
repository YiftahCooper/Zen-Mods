import {providers} from './providers/registry.mjs';
import {createLookupService} from './lookup.mjs';
import {createController} from './controller.mjs';
import {readSettings,PREF} from './settings.mjs';
import {createSineSettingsBridge} from './sine-settings.mjs';
import {createCredentials} from './credentials.sys.mjs';
import {createShortcut} from './shortcut.mjs';
import {VERSION} from './version.mjs';

window.__defineWord?.unload();
const CREDENTIAL_TOPIC='define-word-credentials-changed';
// Only these prefs change live window state. Dictionary choices and the popup
// size are read when used, so their writes need no window-wide refresh.
const SHORTCUT_PREF=`${PREF}shortcut`,OBSERVED_PREFS=[SHORTCUT_PREF,`${PREF}show-icon`,`${PREF}text-size`];
let controller,shortcut,settingsBridge,observer,credentialObserver,disposed=false;
// selection.sys.mjs reads version to tell whether older code still runs here.
const owner={version:VERSION,unload(){
  if(disposed)return;disposed=true;
  window.removeEventListener('load',start);window.removeEventListener('unload',owner.unload);
  if(observer)for(const name of OBSERVED_PREFS)Services.prefs.removeObserver(name,observer);
  if(credentialObserver)Services.obs.removeObserver(credentialObserver,CREDENTIAL_TOPIC);
  shortcut?.destroy();controller?.destroy();settingsBridge?.destroy();
  if(window.__defineWord===owner)delete window.__defineWord;
}};
window.__defineWord=owner;
window.addEventListener('unload',owner.unload,{once:true});
window.addUnloadListener?.(owner.unload);
function start(){
  if(disposed||controller||settingsBridge)return;
  let selection;
  try {
    const credentials=createCredentials(Services.logins,fields=>{
      const login=Cc['@mozilla.org/login-manager/loginInfo;1'].createInstance(Ci.nsILoginInfo);
      login.init(fields.origin,fields.formActionOrigin,fields.httpRealm,fields.username,fields.password,fields.usernameField,fields.passwordField);return login;
    });
    if(/^about:(preferences|settings)(?:[?#]|$)/.test(window.location.href)){
      settingsBridge=createSineSettingsBridge(window,{prefs:Services.prefs,credentials,
        browserWindow:()=>window.browsingContext?.topChromeWindow||Services.wm.getMostRecentWindow('navigator:browser'),
        onCredentialsChanged:id=>Services.obs.notifyObservers(null,CREDENTIAL_TOPIC,id)});
      return;
    }
    const {acquireSelectionService}=ChromeUtils.importESModule(`chrome://sine/content/define-word/src/selection.sys.mjs?v=${VERSION}`);
    selection=acquireSelectionService();
    const lookup=createLookupService({providers,credentials,fetch:window.fetch.bind(window),timers:window,
      parseDocument:html=>new window.DOMParser().parseFromString('<meta http-equiv="Content-Security-Policy" content="default-src \'none\'">'+html,'text/html')});
    controller=createController(window,{providers,selection,lookup,settings:()=>readSettings(Services.prefs),
      saveProvider(language,id){Services.prefs.setStringPref(`${PREF}${language==='he'?'hebrew':'english'}`,id);},
      loadPopupSize(){try{return JSON.parse(Services.prefs.getStringPref(`${PREF}popup-size`,''));}catch{return null;}},
      savePopupSize(size){Services.prefs.setStringPref(`${PREF}popup-size`,size?JSON.stringify(size):'');},
    });
    shortcut=createShortcut(window,{binding:readSettings(Services.prefs).shortcut,onInvoke:()=>{void controller.define();},onConflict:()=>{}});
    observer={observe(_subject,_topic,name){const settings=readSettings(Services.prefs);if(name===SHORTCUT_PREF)shortcut.update(settings.shortcut);else controller.updateAppearance(settings);}};
    for(const name of OBSERVED_PREFS)Services.prefs.addObserver(name,observer);
    credentialObserver={observe(_subject,_topic,id){controller.credentialsChanged(id);}};
    Services.obs.addObserver(credentialObserver,CREDENTIAL_TOPIC);
  }catch{
    if(!controller)selection?.release();owner.unload();console.error('[Define Word] Could not initialize browser integration.');
  }
}
if(document.readyState==='complete')start();else window.addEventListener('load',start,{once:true});
