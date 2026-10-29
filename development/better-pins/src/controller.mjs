import {BASELINE_KEY,chooseInitialPin,ownMethod,restoreOwned} from './state.mjs';
import {FolderPinIntentStore,FolderPinPolicy,FolderPinLifecycle,FolderPinOriginHooks,FolderPinNativeHooks,createBrowserFolderPinAdapters,isValidUrlPinRecovery,FOLDER_PIN_INTENT_KEY} from './pin-engine.mjs';
import {Zones,rootOf,areaOf} from './zones.mjs';
import {Presentation} from './presentation.mjs';
import {installTerminology} from './terminology.mjs';
import {ZoneControls} from './controls.mjs';
import {installSettingsLabels} from './settings.mjs';
export function parseBaseline(raw) {
  try { const v=JSON.parse(raw);return v?.schema===1&&isValidUrlPinRecovery({explicit:true,baseline:v.baseline})?v.baseline:null; }catch{return null;}
}
export function adoptionChoice(records,baselines,nativeChoices,folder,nativeBaselines=[]){
  if(records.some(r=>r.status==='invalid'))throw Error('Unsupported saved URL-pin intent in a synchronised window');
  const known=new Set(records.filter(r=>r.status==='known').map(r=>r.explicit));
  if(known.size>1)throw Error('Conflicting URL-pin choices across windows');
  const saved=baselines.filter(raw=>raw!=='').map(raw=>{const value=parseBaseline(raw);if(!value)throw Error('Unsupported saved baseline in a synchronised window');return value;});
  if(new Set(saved.map(v=>JSON.stringify(v))).size>1)throw Error('Conflicting saved baselines across windows');
  if(!known.size&&!folder&&new Set(nativeChoices).size>1)throw Error('Conflicting native placement during first adoption');
  const explicit=known.size?[...known][0]:chooseInitialPin({nativePinned:nativeChoices[0],folder});
  if(explicit&&!saved.length&&nativeBaselines.length){
    if(nativeBaselines.some(b=>!isValidUrlPinRecovery({explicit:true,baseline:b}))||new Set(nativeBaselines.map(b=>JSON.stringify(b))).size!==1)throw Error('Conflicting or unavailable native reset baselines during adoption');
  }
  return {explicit,baseline:saved[0]??null};
}
// Existing BZF exposes its manager list before starting it. Lease only that
// known capability, leaving its preferences, Sticky and recovery managers intact.
export class BzfLease {
  constructor(host){this.host=host;this.entries=[];this.active=false;}
  attach(controller){
    if(!controller)return;
    const managers=controller.adapters?.managers??controller.managers;
    const runtime=managers?.find(m=>m.constructor?.name==='FolderPinRuntime');
    if(!runtime||typeof runtime.disable!=='function'||typeof runtime.enable!=='function')throw Error('Incompatible Better Zen Folders pin capability');
    if(this.entries.some(e=>e.owner===runtime))return;
    const entry=ownMethod(runtime,'enable',(args,native)=>this.active?Promise.resolve({ok:false,reason:'owned-by-better-pins'}):native());
    this.entries.push(entry);
    runtime.disable();
  }
  start(){
    this.descriptor=Object.getOwnPropertyDescriptor(this.host,'__betterZenFoldersController');
    if(this.descriptor&&(!this.descriptor.configurable||!('value'in this.descriptor)))throw Error('Cannot coordinate Folder runtime load order');
    let value=this.host.__betterZenFoldersController;
    this.getter=()=>value;
    this.setter=next=>{if(this.active)this.attach(next);value=next;};
    Object.defineProperty(this.host,'__betterZenFoldersController',{configurable:true,get:this.getter,set:this.setter});
    this.active=true;this.attach(value);
  }
  destroy(){
    this.active=false;
    const d=Object.getOwnPropertyDescriptor(this.host,'__betterZenFoldersController');
    if(this.getter&&d?.get===this.getter&&d?.set===this.setter){
      const current=this.host.__betterZenFoldersController;
      if(this.descriptor)Object.defineProperty(this.host,'__betterZenFoldersController','value'in this.descriptor?{...this.descriptor,value:current}:this.descriptor);
      else{delete this.host.__betterZenFoldersController;if(current!==undefined)Object.defineProperty(this.host,'__betterZenFoldersController',{value:current,writable:true,configurable:true,enumerable:true});}
    }
    for(const entry of this.entries.reverse())if(restoreOwned(entry)&&entry.owner.active&&entry.owner.preferences?.get('folderUrlPinsEnabled'))void entry.owner.enable();
    this.entries=[];
  }
}
export class BetterPinsController {
  constructor(host){this.host=host;this.owned=[];this.active=false;this.destroyed=false;this.boundDestroy=()=>this.destroy();}
  reportError(error){this.host.console?.error('Better Pins:',error);this.presentation?.status(String(error));}
  supported(tab){return this.adapters?.classify(tab)==='regular-folder';}
  supportedTree(node){
    if(node?.ownerDocument!==this.host.document||!node.isConnected||node.isLiveFolder)return false;
    if(node.localName==='tab')return this.supported(node);
    if(!['zen-folder','tab-group'].includes(node.localName))return false;
    if(node.querySelector?.('zen-folder[is-live-folder]'))return false;
    return [...(node.tabs??[])].every(t=>t.hasAttribute('zen-empty-tab')||this.supported(t));
  }
  pref(key,fallback){return this.host.Services.prefs.getBoolPref('better-pins.'+key,fallback);}
  stringPref(key,fallback){return this.host.Services.prefs.getStringPref('better-pins.'+key,fallback);}
  async start(){
    const h=this.host;
    if(h.gZenWorkspaces?.privateWindowOrDisabled||h.gZenPinnedTabManager?.enabled===false)throw Error('Better Pins candidate requires a normal synchronised Space window');
    this.adapters=createBrowserFolderPinAdapters(h);
    if(!await this.adapters.ready)throw Error('Zen tab restoration did not become ready');
    if(this.destroyed)return {ok:false,reason:'cancelled'};
    const prefs=h.Services.prefs,key='zen.pinned-tab-manager.restore-pinned-tabs-to-pinned-url';
    if(prefs.getIntPref('better-pins.consent-version',0)!==1||prefs.getBoolPref(key,false)){
      const prompt=h.Services.prompt;
      const accepted=prompt.confirmEx(h,'Better Pins — Experimental Candidate',
        'This candidate separates URL pins from upper/lower placement. Use a disposable test profile. Existing saved Better Zen Folders choices are kept. Other existing folder tabs start without a URL pin; existing root pins retain their saved URL.\n\nTabs must resume their last page: enabling turns OFF Zen’s automatic startup reset. Manual Reset remains available. Clean disable moves affected lower folder trees back upstairs; saved data is retained, but missing-mod and downgrade recovery are not release-verified. Clear is unavailable until a cleanup policy is chosen.\n\nEnable this test candidate?',
        prompt.BUTTON_POS_0*prompt.BUTTON_TITLE_IS_STRING+prompt.BUTTON_POS_1*prompt.BUTTON_TITLE_IS_STRING+prompt.BUTTON_POS_1_DEFAULT,'Enable Candidate','Not Now',null,null,{value:false})===0;
      if(!accepted)return {ok:false,reason:'declined'};
      prefs.setBoolPref(key,false);prefs.setIntPref('better-pins.consent-version',1);
    }
    this.lease=new BzfLease(h);this.lease.start();
    this.abort=new h.AbortController();
    this.configureAdapters();
    this.store=new FolderPinIntentStore(this.adapters);
    this.policy=new FolderPinPolicy(this.adapters,this.store);this.policy.start(this.abort.signal);
    this.lifecycle=new FolderPinLifecycle(this.adapters,this.store,this.policy);this.lifecycle.start();
    this.origins=new FolderPinOriginHooks(h,this.lifecycle,this.adapters,{get:()=>false});
    this.hooks=new FolderPinNativeHooks(h,this.policy,this.adapters,result=>{if(!result.ok)this.presentation?.status(`Action not completed: ${result.reason}`);this.presentation?.refresh();});
    this.hooks.start(this.abort.signal);if(!this.hooks.active)throw Error('Native pin command protection unavailable');
    this.origins.start(this.abort.signal);
    this.active=true;
    // BZF's New Tab in Folder transaction uses this capability to hand over
    // the exact created tab; no BZF URL-pin handlers remain active.
    h.__betterZenFoldersFolderPins=this;
    let unresolved=0;
    for(const tab of h.gZenWorkspaces.allStoredTabs){
      if(!this.supported(tab))continue;
      try{
        const targets=this.adapters.getIntentTargets(tab),records=targets.map(t=>this.store.read(t));
        const choice=adoptionChoice(records,targets.map(t=>h.SessionStore.getCustomTabValue(t,BASELINE_KEY)??''),targets.map(t=>t.pinned),!!tab.closest('zen-folder'),targets.map(t=>this.adapters.getSavedBaseline(t)));
        if(choice.baseline)this.adapters.setSavedBaseline(tab,choice.baseline);
        if(records.some(r=>r.status==='missing'))this.store.write(tab,choice.explicit);
        if(this.store.read(tab).explicit){
          const baseline=this.adapters.getSavedBaseline(tab);
          if(!isValidUrlPinRecovery({explicit:true,baseline}))throw Error('Existing URL pin has no recoverable baseline');
          this.persistBaseline(tab,baseline);
        }
      }catch(error){unresolved++;this.adapters.coordinator.uncertain.add(tab.id);this.reportError(error);}
    }
    this.zones=new Zones(this);this.zones.start();
    this.presentation=new Presentation(this);this.presentation.start();
    this.controls=new ZoneControls(this);this.controls.start();
    this.releaseTerminology=installTerminology(h);
    this.owned.push(ownMethod(h.gZenWorkspaces,'closeAllUnpinnedTabs',()=>{this.presentation.status('Clear is unavailable in this candidate until its cleanup policy is chosen. Close individual tabs or folders explicitly.');return false;}));
    this.onStartup={observe:()=>{if(prefs.getBoolPref(key,false)){this.presentation.status('Automatic startup reset was enabled. Better Pins actions are unavailable until it is turned off.');this.presentation.refresh();}}};
    prefs.addObserver(key,this.onStartup);
    h.document.documentElement.setAttribute('better-pins-active','true');this.zones.layout();
    this.result={ok:true,unresolved};return this.result;
  }
  configureAdapters(){
    const a=this.adapters,h=this.host;
    const capture=a.captureBaseline,restore=a.restoreBaseline;
    const withPersisted=snapshot=>{snapshot.persisted=snapshot.map(entry=>({tab:entry.tab,raw:h.SessionStore.getCustomTabValue(entry.tab,BASELINE_KEY)??''}));return snapshot;};
    a.captureBaseline=tab=>withPersisted(capture(tab));
    a.restoreBaseline=(tab,previous,next)=>{
      if(previous.persisted&&next.persisted){
        if(previous.persisted.length!==next.persisted.length||next.persisted.some((entry,i)=>entry.tab!==previous.persisted[i].tab||h.SessionStore.getCustomTabValue(entry.tab,BASELINE_KEY)!==entry.raw))return false;
      }
      if(!restore(tab,previous,next))return false;
      if(previous.persisted&&next.persisted)for(const entry of previous.persisted){h.SessionStore.setCustomTabValue(entry.tab,BASELINE_KEY,entry.raw);if(h.SessionStore.getCustomTabValue(entry.tab,BASELINE_KEY)!==entry.raw)return false;}
      return true;
    };
    a.creationPinDefault=tab=>chooseInitialPin({origin:'new',zone:this.creationDestination??areaOf(tab),folder:!!tab.closest('zen-folder'),pinRoots:this.pref('pin-new-upper-tabs',false),pinFolders:this.pref('pin-new-upper-folder-tabs',false),pinLowerRoots:this.pref('pin-new-lower-tabs',false),pinLowerFolders:this.pref('pin-new-lower-folder-tabs',false)});
    const write=a.writeBaseline;
    a.writeBaseline=async(tab,url)=>{const previous=a.captureBaseline(tab);const next=await write(tab,url);try{next.persisted=this.persistBaseline(tab,a.getSavedBaseline(tab));return next;}catch(e){if(!restore(tab,previous,next))throw new AggregateError([e],'Baseline persistence rollback failed');throw e;}};
    const clear=a.clearDuplicateState;
    a.clearDuplicateState=tab=>{clear(tab);for(const t of a.getIntentTargets(tab))h.SessionStore.setCustomTabValue(t,BASELINE_KEY,'');};
    // Explicit navigation works for lower roots too. It never changes native
    // membership or replaces the entire SessionStore history on an unpin.
    a.resetToBaseline=async tab=>{
      const baseline=a.getSavedBaseline(tab);
      if(!isValidUrlPinRecovery({explicit:true,baseline}))throw Error('No saved URL');
      const uri=h.Services.io.newURI(baseline.entry.url);
      if(['javascript','chrome','resource'].includes(uri.scheme))throw Error('Unsafe saved reset URL');
      h.gBrowser.selectedTab=tab;
      tab.linkedBrowser.loadURI(uri,{triggeringPrincipal:h.Services.scriptSecurityManager.getSystemPrincipal()});
    };
    // Origin/adoption recovery must never couple intent back to area membership.
    a.setRootPlacement=()=>{};
  }
  persistBaseline(tab,baseline){
    const a=this.adapters,h=this.host,targets=a.getIntentTargets(tab),raw=JSON.stringify({schema:1,baseline});
    const previous=targets.map(t=>[t,h.SessionStore.getCustomTabValue(t,BASELINE_KEY)]),attempted=[];
    try{for(const [t,old]of previous){attempted.push([t,old]);h.SessionStore.setCustomTabValue(t,BASELINE_KEY,raw);if(h.SessionStore.getCustomTabValue(t,BASELINE_KEY)!==raw)throw Error('Saved baseline verification failed');}return targets.map(tab=>({tab,raw}));}
    catch(error){
      const failures=[];
      for(const[t,old]of attempted.reverse())try{const current=h.SessionStore.getCustomTabValue(t,BASELINE_KEY)??'';if(current!==raw&&current!==(old??''))throw Error('Baseline rollback lost ownership');h.SessionStore.setCustomTabValue(t,BASELINE_KEY,old??'');if(h.SessionStore.getCustomTabValue(t,BASELINE_KEY)!==(old??''))throw Error('Baseline rollback did not persist');}catch(e){failures.push(e);}
      if(failures.length)throw new AggregateError([error,...failures],'Independent baseline rollback uncertain');throw error;
    }
  }
  async newTab(zone){
    this.creationDestination=zone;
    let tab;
    try{tab=this.host.gBrowser.addTab('about:blank',{triggeringPrincipal:this.host.Services.scriptSecurityManager.getSystemPrincipal()});if(zone==='upper')this.host.gBrowser.pinTab(tab);}
    finally{this.creationDestination=null;}
    this.host.gBrowser.selectedTab=tab;await this.origins.flush();
    const space=this.zones.space(tab),container=zone==='upper'?space.pinnedTabsContainer:space.tabsContainer;
    const before=this.stringPref('new-'+zone+'-position','bottom')==='top'?this.zones.roots(container).find(t=>t!==tab):null;
    const result=await this.zones.move(tab,zone,before);if(!result.ok)return result;
    this.host.gURLBar?.focus();return tab;
  }
  destroy(){
    if(this.destroyed)return;this.destroyed=true;
    this.active=false;this.controls?.destroy();this.abort?.abort();this.origins?.destroy();this.hooks?.destroy();this.lifecycle?.destroy();this.policy?.destroy();
    for(const entry of this.owned.reverse())restoreOwned(entry);this.owned=[];
    this.presentation?.destroy();this.zones?.destroy();
    this.releaseTerminology?.();
    if(this.onStartup)this.host.Services.prefs.removeObserver('zen.pinned-tab-manager.restore-pinned-tabs-to-pinned-url',this.onStartup);
    this.host.document.documentElement.removeAttribute('better-pins-active');
    this.lease?.destroy();if(this.host.__betterPinsController===this)delete this.host.__betterPinsController;
    if(this.host.__betterZenFoldersFolderPins===this)delete this.host.__betterZenFoldersFolderPins;
  }
}
export async function bootstrap(host){
  if(/^about:(preferences|settings)/.test(host.location?.href??'')){
    const release=installTerminology(host),releaseLabels=installSettingsLabels(host);host.addUnloadListener?.(()=>{release();releaseLabels();});return;
  }
  if(host.location?.href!=='chrome://browser/content/browser.xhtml')return;
  host.__betterPinsController?.destroy();
  const c=new BetterPinsController(host);host.__betterPinsController=c;
  host.addUnloadListener?.(c.boundDestroy);
  try{const result=await c.start();if(!result?.ok)c.destroy();return result;}catch(error){c.reportError(error);c.destroy();host.Services.prompt.alert(host,'Better Pins',`Candidate could not activate: ${error.message}`);return {ok:false,reason:String(error)};}
}
