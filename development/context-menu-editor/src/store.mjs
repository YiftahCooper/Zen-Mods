import {createState,parseState,serializeState} from './model.mjs';

export const SETTINGS_PREF='extension.context-menu-editor.settings';

function deepFreeze(value){
  if(value&&typeof value==='object'&&!Object.isFrozen(value)){Object.freeze(value);for(const child of Object.values(value))deepFreeze(child);}
  return value;
}

/** Preference-backed CAS store. A read/open never normalizes or writes data. */
export function createStore(prefs,{onError=()=>{}}={}) {
  let disposed=false,lastUndo=null,cached=null;
  const listeners=new Set();
  const raw=()=>prefs.getStringPref(SETTINGS_PREF,'');
  // Menu openings read settings repeatedly. Parse and validate each saved value
  // once; the shared result is deeply frozen so no caller can alter the cache.
  // Every model operation already copies its input before editing it.
  const read=()=>{
    const value=raw();
    if(cached?.raw===value)return cached;
    let result;
    try{result={state:deepFreeze(parseState(value)),raw:value,error:null};}
    catch(problem){result={state:deepFreeze(createState()),raw:value,error:problem.message};}
    return cached=Object.freeze(result);
  };
  const announce=()=>{if(!disposed)for(const listener of [...listeners])try{listener();}catch(problem){onError(problem);}};
  const observer={observe(_subject,_topic,name){if(name===SETTINGS_PREF)announce();}};
  prefs.addObserver(SETTINGS_PREF,observer);
  function guard(expected) {
    if(disposed)throw new Error('These settings are closed.');
    if(typeof expected!=='string'||raw()!==expected)throw new Error('Settings changed in another window. Reopen the editor.');
  }
  function write(value,expected,remember=true) {
    guard(expected);
    if(value===expected)return;
    prefs.setStringPref(SETTINGS_PREF,value);
    if(remember)lastUndo={before:expected,after:value};
  }
  return {
    read,
    save(next,expectedRaw){
      guard(expectedRaw);
      if(read().error)throw new Error('Reset the invalid saved settings before editing.');
      const encoded=serializeState(next);
      write(encoded,expectedRaw);
      return parseState(encoded);
    },
    subscribe(listener){if(disposed)return()=>{};listeners.add(listener);return()=>listeners.delete(listener);},
    undo(){
      if(!lastUndo)return;
      const previous=lastUndo;
      guard(previous.after);
      write(previous.before,previous.after,false);
      lastUndo=null;
    },
    resetInvalid(expectedRaw){
      guard(expectedRaw);
      if(!read().error)return;
      // Backup must succeed before replacement. A failed backup leaves the
      // invalid original untouched for recovery.
      prefs.setStringPref(SETTINGS_PREF+'.recovery',expectedRaw);
      write(serializeState(createState()),expectedRaw);
    },
    destroy(){if(disposed)return;disposed=true;prefs.removeObserver(SETTINGS_PREF,observer);listeners.clear();lastUndo=null;cached=null;}
  };
}
