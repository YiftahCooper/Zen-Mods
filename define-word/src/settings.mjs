import {providers} from './providers/registry.mjs';
import {DEFAULT_BINDING,validateBinding,bindingLabel,findConflict} from './shortcut.mjs';
export const PREF='extension.define-word.';
export function readSettings(prefs){
  const english=prefs.getStringPref(`${PREF}english`,'wiktionary-en'),hebrew=prefs.getStringPref(`${PREF}hebrew`,'wiktionary-he');
  let shortcut;try{const raw=prefs.getStringPref(`${PREF}shortcut`,JSON.stringify(DEFAULT_BINDING));shortcut=raw.trim()?validateBinding(JSON.parse(raw)):null;}catch{shortcut=null;}
  return {englishProvider:providers.get(english)?.language==='en'?english:'wiktionary-en',hebrewProvider:providers.get(hebrew)?.language==='he'?hebrew:'wiktionary-he',shortcut,showIcon:prefs.getBoolPref?.(`${PREF}show-icon`,true)??true};
}
export function saveSettings(prefs,settings){
  if(providers.get(settings.englishProvider)?.language!=='en'||providers.get(settings.hebrewProvider)?.language!=='he')throw new Error('Choose a dictionary for the selected language.');
  const binding=validateBinding(settings.shortcut);
  prefs.setStringPref(`${PREF}english`,settings.englishProvider);prefs.setStringPref(`${PREF}hebrew`,settings.hebrewProvider);prefs.setStringPref(`${PREF}shortcut`,JSON.stringify(binding));
}
export function createSettingsControls(window,{prefs,credentials,onCredentialsChanged,browserWindow=()=>window}){
  const {document}=window;
  const el=(tag,value)=>{const n=document.createElementNS('http://www.w3.org/1999/xhtml',tag);if(value!==undefined)n.textContent=value;return n;};
  const root=el('section');root.dataset.defineWordSettings='';root.className='dw-settings';
  let binding=readSettings(prefs).shortcut,recording=false,disposed=false;
  const error=el('p');error.setAttribute('role','status');error.setAttribute('aria-live','polite');
  root.append(el('h3','Keyboard shortcut'),el('p','Choose Record shortcut, press your key combination, then Save shortcut. This invokes Define for the selected word.'));
  const label=el('label','Current shortcut'),field=el('input');field.readOnly=true;field.value=bindingLabel(binding);label.append(field);root.append(label);
  const actions=el('div');actions.className='dw-actions';
  const record=el('button','Record shortcut'),disable=el('button','Disable shortcut'),save=el('button','Save shortcut');
  for(const button of [record,disable,save])button.type='button';actions.append(record,disable,save);root.append(actions);
  record.addEventListener('click',()=>{recording=true;field.value='Press a shortcut…';field.focus();});
  field.addEventListener('keydown',event=>{
    if(!recording)return;event.preventDefault();event.stopPropagation();
    if(event.key==='Escape'){recording=false;field.value=bindingLabel(binding);return;}
    if(event.isComposing||event.getModifierState?.('AltGraph'))return;
    try{const next=validateBinding({code:event.code,ctrl:event.ctrlKey,alt:event.altKey,shift:event.shiftKey,meta:event.metaKey});const problem=findConflict(browserWindow(),next);if(problem)throw new Error(problem);binding=next;recording=false;field.value=bindingLabel(binding);error.textContent='';}catch(problem){error.textContent=problem.message;}
  });
  disable.addEventListener('click',()=>{binding=null;recording=false;field.value='Disabled';});
  save.addEventListener('click',()=>{try{if(recording)throw new Error('Finish recording the shortcut first.');const problem=findConflict(browserWindow(),binding);if(problem)throw new Error(problem);prefs.setStringPref(`${PREF}shortcut`,JSON.stringify(validateBinding(binding)));error.textContent='Shortcut saved.';}catch(problem){error.textContent=problem.message;}});
  root.append(el('h3','Dictionary API keys'),el('p','Wiktionary and Free Dictionary API do not need keys. The two Merriam-Webster dictionaries each need their own key. Keys are saved in Firefox credential storage.'));
  const inputs=[];
  for(const id of ['mw-collegiate','mw-learners']){
    const row=el('label',providers.get(id).label+' API key'),input=el('input');input.type='password';input.autocomplete='off';input.maxLength=512;input.placeholder='Enter a key to save or replace it';row.append(input);root.append(row);inputs.push(input);
    const buttons=el('div');buttons.className='dw-actions';const set=el('button','Save key'),remove=el('button','Remove key');set.type=remove.type='button';buttons.append(set,remove);root.append(buttons);
    async function change(action){set.disabled=remove.disabled=true;try{await action();input.value='';onCredentialsChanged?.(id);if(!disposed)error.textContent='Dictionary key updated.';}catch{if(!disposed)error.textContent='Could not update the key. Check the value and unlock Firefox credential storage, then try again.';}finally{set.disabled=remove.disabled=false;}}
    set.addEventListener('click',()=>{const key=input.value;input.value='';void change(()=>credentials.set(id,key));});remove.addEventListener('click',()=>change(()=>credentials.remove(id)));
  }
  const info=el('button','Get a Merriam-Webster API key');info.type='button';info.addEventListener('click',()=>browserWindow().openTrustedLinkIn('https://dictionaryapi.com/','tab'));root.append(info,error);
  function reset(){for(const input of inputs)input.value='';recording=false;binding=readSettings(prefs).shortcut;field.value=bindingLabel(binding);const conflict=findConflict(browserWindow(),binding);error.textContent=conflict?`Shortcut inactive. ${conflict}`:'';}
  reset();
  return {element:root,reset,destroy(){disposed=true;for(const input of inputs)input.value='';recording=false;root.remove();}};
}
