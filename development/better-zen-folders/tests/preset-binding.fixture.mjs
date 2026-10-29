import {makePreferenceFixture} from './fakes.mjs';
import {BetterZenFoldersPreferences,createBrowserPreferenceAdapters,createBrowserFolderColorAdapters,FolderColorManager} from '../scripts/better-zen-folders.uc.mjs';

export function makePresetBindingFixture(t){
 const f=makePreferenceFixture(),events=[],folders=[],managers=[];
 const nativePrefs=f.host.Services.prefs,get=nativePrefs.getStringPref,set=nativePrefs.setStringPref;
 nativePrefs.getStringPref=(key,fallback)=>f.get(key)===undefined?fallback:get(key);
 nativePrefs.setStringPref=(key,value)=>{set(key,value);f.notify(key);};
 f.host.document={querySelectorAll:()=>folders};
 f.host.CustomEvent=class{constructor(type,options){this.type=type;Object.assign(this,options);}};
 const preferences=new BetterZenFoldersPreferences(createBrowserPreferenceAdapters(f.host));preferences.start();
 const add=id=>{const attrs=new Map(),styles=new Map(),listeners=new Map();const folder={id,isZenFolder:true,isConnected:true,
  getAttribute:key=>attrs.get(key)??null,setAttribute:(key,value)=>attrs.set(key,String(value)),removeAttribute:key=>attrs.delete(key),
  style:{setProperty:(key,value)=>styles.set(key,String(value)),getPropertyValue:key=>styles.get(key)??'',removeProperty:key=>styles.delete(key)},
  addEventListener:(type,callback)=>{if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(callback);},
  removeEventListener:(type,callback)=>listeners.get(type)?.delete(callback),
  dispatchEvent:event=>{events.push({folder,color:event.detail.color});for(const callback of listeners.get(event.type)??[])callback(event);}};folders.push(folder);return folder;};
 const start=()=>{const adapters=createBrowserFolderColorAdapters(f.host),manager=new FolderColorManager(adapters,preferences);manager.start();managers.push(manager);return manager;};
 const change=(name,value)=>{f.set('better-zen-folders.'+name,value);f.notify('better-zen-folders.'+name);};
 t.after(()=>{for(const manager of managers)manager.destroy();preferences.destroy();});
 return {...f,preferences,events,folders,add,start,change};
}
