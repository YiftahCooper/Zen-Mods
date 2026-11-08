import {providers} from './providers/registry.mjs';
import {DEFAULT_BINDING,validateBinding,bindingLabel,findConflict} from './shortcut.mjs';
export const PREF='extension.define-word.';
export function validTextSize(value){const size=Number(value);return Number.isFinite(size)&&size>=10&&size<=32;}
export function normalizeTextSize(value){return validTextSize(value)?Number(value):14;}
export function readSettings(prefs){
  const english=prefs.getStringPref(`${PREF}english`,'wiktionary-en'),hebrew=prefs.getStringPref(`${PREF}hebrew`,'academy-he');
  let shortcut;try{const raw=prefs.getStringPref(`${PREF}shortcut`,JSON.stringify(DEFAULT_BINDING));shortcut=raw.trim()?validateBinding(JSON.parse(raw)):null;}catch{shortcut=null;}
  const textSize=normalizeTextSize(prefs.getStringPref(`${PREF}text-size`,'14'));
  return {englishProvider:providers.get(english)?.language==='en'?english:'wiktionary-en',hebrewProvider:providers.get(hebrew)?.language==='he'?hebrew:'academy-he',shortcut,showIcon:prefs.getBoolPref?.(`${PREF}show-icon`,true)??true,textSize};
}
export function saveSettings(prefs,settings){
  if(providers.get(settings.englishProvider)?.language!=='en'||providers.get(settings.hebrewProvider)?.language!=='he')throw new Error('Choose a dictionary for the selected language.');
  const binding=validateBinding(settings.shortcut);
  prefs.setStringPref(`${PREF}english`,settings.englishProvider);prefs.setStringPref(`${PREF}hebrew`,settings.hebrewProvider);prefs.setStringPref(`${PREF}shortcut`,JSON.stringify(binding));
}
export function createSettingsControls(window,{prefs,credentials,onCredentialsChanged,browserWindow=()=>window}){
  const {document}=window;
  const el=(tag,value)=>{const n=document.createElementNS('http://www.w3.org/1999/xhtml',tag);if(value!==undefined)n.textContent=value;return n;};
  const root=el('div');root.dataset.defineWordSettings='';root.className='dw-settings';
  let binding=readSettings(prefs).shortcut,recording=false,disposed=false;
  // Sine's string control does not validate bounds. Keep this numeric control
  // in Configure and retain the existing string preference for compatibility.
  const sizeRow=el('div');sizeRow.className='dw-setting-row';
  const sizeLabel=el('label','Popup base text size (px)'),sizeInput=el('input');sizeInput.id='dw-text-size';sizeLabel.htmlFor=sizeInput.id;sizeInput.type='number';sizeInput.min='10';sizeInput.max='32';sizeInput.step='any';sizeInput.required=true;
  const sizeHelp=el('p','Enter 10–32 px. Headings, definitions, controls, and footer text scale together. Changes save when you leave the field.');sizeHelp.id='dw-text-size-help';
  const sizeStatus=el('p');sizeStatus.id='dw-text-size-status';sizeStatus.dataset.textSizeStatus='';sizeStatus.setAttribute('role','status');sizeStatus.setAttribute('aria-live','polite');sizeInput.setAttribute('aria-describedby',`${sizeHelp.id} ${sizeStatus.id}`);
  sizeLabel.append(sizeInput);sizeRow.append(sizeLabel);root.append(sizeRow,sizeHelp,sizeStatus);
  function commitTextSize(){
    if(disposed)return;
    if(!validTextSize(sizeInput.value)){sizeInput.setAttribute('aria-invalid','true');sizeStatus.textContent='Enter a number from 10 to 32 px. The saved text size has not changed.';return;}
    try{prefs.setStringPref(`${PREF}text-size`,String(Number(sizeInput.value)));sizeInput.setAttribute('aria-invalid','false');sizeStatus.textContent='Text size saved.';}
    catch{sizeInput.setAttribute('aria-invalid','true');sizeStatus.textContent='Could not save the text size. Leave the field to retry.';}
  }
  sizeInput.addEventListener('change',commitTextSize);sizeInput.addEventListener('blur',commitTextSize);
  const error=el('p');error.setAttribute('role','status');error.setAttribute('aria-live','polite');
  root.append(el('h3','Keyboard shortcut'),el('p','Record a key combination, then save it. Use it to define the selected word.'));
  const shortcutRow=el('div');shortcutRow.className='dw-setting-row';root.append(shortcutRow);
  const label=el('label','Current shortcut'),field=el('input');field.readOnly=true;field.value=bindingLabel(binding);label.append(field);shortcutRow.append(label);
  const actions=el('div');actions.className='dw-actions';
  const record=el('button','Record shortcut'),disable=el('button','Disable shortcut'),save=el('button','Save shortcut');
  for(const button of [record,disable,save])button.type='button';actions.append(record,disable,save);shortcutRow.append(actions);
  record.addEventListener('click',()=>{recording=true;field.value='Press a shortcut…';field.focus();});
  field.addEventListener('keydown',event=>{
    if(!recording)return;event.preventDefault();event.stopPropagation();
    if(event.key==='Escape'){recording=false;field.value=bindingLabel(binding);return;}
    if(event.isComposing||event.getModifierState?.('AltGraph'))return;
    try{const next=validateBinding({code:event.code,ctrl:event.ctrlKey,alt:event.altKey,shift:event.shiftKey,meta:event.metaKey});const problem=findConflict(browserWindow(),next);if(problem)throw new Error(problem);binding=next;recording=false;field.value=bindingLabel(binding);error.textContent='';}catch(problem){error.textContent=problem.message;}
  });
  disable.addEventListener('click',()=>{binding=null;recording=false;field.value='Disabled';});
  save.addEventListener('click',()=>{try{if(recording)throw new Error('Finish recording the shortcut first.');const problem=findConflict(browserWindow(),binding);if(problem)throw new Error(problem);prefs.setStringPref(`${PREF}shortcut`,JSON.stringify(validateBinding(binding)));error.textContent='Shortcut saved.';}catch(problem){error.textContent=problem.message;}});
  root.append(el('h3','Dictionary API keys'),el('p','Wiktionary and Free Dictionary API need no key. For Merriam-Webster, register below, request Collegiate and Learner’s Dictionary keys, and verify your email. Each dictionary needs its own key. Keys are saved in Firefox credential storage.'));
  const keyControls=[];
  for(const id of ['mw-collegiate','mw-learners','lexicala-he']){
    const group=el('div');group.className='dw-setting-row';root.append(group);
    const providerLabel=providers.get(id).label,row=el('label',providerLabel+' API key'),input=el('input');input.id=`dw-key-${id}`;row.htmlFor=input.id;input.type='password';input.autocomplete='off';input.maxLength=512;input.placeholder='Paste a key; clear to remove';
    const keyField=el('div');keyField.className='dw-key-field';row.append(keyField);keyField.append(input);group.append(row);
    const reveal=el('button');reveal.type='button';reveal.className='dw-key-reveal';
    const eye=document.createElementNS('http://www.w3.org/2000/svg','svg');eye.setAttribute('viewBox','0 0 24 24');eye.setAttribute('aria-hidden','true');
    for(const data of ['M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z','M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0']){const path=document.createElementNS('http://www.w3.org/2000/svg','path');path.setAttribute('d',data);eye.append(path);}reveal.append(eye);keyField.append(reveal);
    const status=el('p');status.dataset.keyStatus=id;status.id=`dw-key-status-${id}`;status.setAttribute('role','status');status.setAttribute('aria-live','polite');input.setAttribute('aria-describedby',status.id);row.append(status);
    function conceal(){input.type='password';reveal.setAttribute('aria-label',`Show ${providerLabel} API key`);reveal.setAttribute('aria-pressed','false');}
    conceal();reveal.addEventListener('click',()=>{const show=input.type==='password';input.type=show?'text':'password';reveal.setAttribute('aria-label',`${show?'Hide':'Show'} ${providerLabel} API key`);reveal.setAttribute('aria-pressed',String(show));});
    let queue=Promise.resolve(),saved='',pending,version=0,requests=0,loaded=false,edited=false;
    input.addEventListener('input',()=>{version++;edited=true;status.textContent='Changes save when you leave this field.';});
    function commit(){
      if(disposed||input.disabled||(!loaded&&!edited))return;
      const key=input.value.trim();if(key===pending||(pending===undefined&&loaded&&key===saved))return;
      version++;const request=++requests;pending=key;status.textContent='Saving…';
      const stillCurrent=()=>!disposed&&!input.disabled&&request===requests&&input.value.trim()===key;
      queue=queue.then(async()=>{
        try{if(key)await credentials.set(id,key);else await credentials.remove(id);saved=key;loaded=true;onCredentialsChanged?.(id);if(stillCurrent()){input.value=key;edited=false;status.textContent=key?'Key saved.':'Key removed.';}}
        catch{if(stillCurrent())status.textContent='Could not save the key. Check its value and unlock Firefox credential storage, then leave the field to retry.';}
        finally{if(request===requests)pending=undefined;}
      });
    }
    input.addEventListener('change',commit);input.addEventListener('blur',commit);
    async function refresh(){
      conceal();const current=++version;input.disabled=true;status.textContent='Loading saved key…';
      try{await queue;const key=await credentials.get(id);if(disposed||current!==version)return;saved=key||'';input.value=saved;loaded=true;edited=false;pending=undefined;status.textContent='';}
      catch{if(!disposed&&current===version){loaded=false;status.textContent='Could not load the saved key. Unlock Firefox credential storage and reopen Configure, or enter a replacement key.';}}
      finally{if(!disposed&&current===version)input.disabled=false;}
    }
    keyControls.push({input,refresh,conceal});
  }
  const info=el('button','Get a Merriam-Webster API key');info.type='button';info.className='dw-key-help';info.addEventListener('click',()=>browserWindow().openTrustedLinkIn('https://dictionaryapi.com/register/index','tab'));root.append(info,error);
  const lexicalaInfo=el('button','Get a Lexicala API key');lexicalaInfo.type='button';lexicalaInfo.className='dw-key-help';lexicalaInfo.addEventListener('click',()=>browserWindow().openTrustedLinkIn('https://rapidapi.com/kdictionaries/api/lexicala1','tab'));root.insertBefore(lexicalaInfo,error);
  root.insertBefore(el('p','Lexicala Hebrew is a test integration. Subscribe to Lexicala on RapidAPI, save its X-RapidAPI-Key above, then select it as your Hebrew dictionary. It searches only when you submit a word; typing uses no quota. Check the provider’s current plan limits and display terms.'),error);
  function reset(){for(const control of keyControls)void control.refresh();recording=false;const settings=readSettings(prefs);binding=settings.shortcut;sizeInput.value=String(settings.textSize);sizeInput.setAttribute('aria-invalid','false');sizeStatus.textContent='';field.value=bindingLabel(binding);const conflict=findConflict(browserWindow(),binding);error.textContent=conflict?`Shortcut inactive. ${conflict}`:'';}
  reset();
  return {element:root,reset,destroy(){disposed=true;for(const control of keyControls){control.conceal();control.input.value='';}recording=false;root.remove();}};
}
