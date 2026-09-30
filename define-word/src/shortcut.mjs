export const DEFAULT_BINDING={code:'KeyD',ctrl:true,alt:true,shift:false,meta:false};
export function validateBinding(value){
  if(value===null)return null;
  if(!value || !/^(Key[A-Z]|Digit[0-9]|F(?:[1-9]|1[0-2]))$/.test(value.code) || !['ctrl','alt','shift','meta'].every(k=>typeof value[k]==='boolean') || !(value.ctrl||value.alt||value.meta))throw new Error('Use Ctrl, Alt, or Meta with a letter, number, or function key.');
  return {code:value.code,ctrl:value.ctrl,alt:value.alt,shift:value.shift,meta:value.meta};
}
export function bindingLabel(binding){return binding?[binding.ctrl?'Ctrl':null,binding.alt?'Alt':null,binding.shift?'Shift':null,binding.meta?'Meta':null,binding.code.replace(/^Key|^Digit/,'')].filter(Boolean).join('+'):'Disabled';}
export function findConflict(window,binding){
  if(!binding)return '';
  const isMac=/Mac/.test(window.navigator.platform);
  for(const key of window.document.querySelectorAll('key')){
    if(key.getAttribute('disabled')==='true')continue;
    const name=key.getAttribute('key')?.toUpperCase(),code=key.getAttribute('keycode')?.replace(/^VK_/,'');
    const actual=binding.code.replace(/^Key|^Digit/,'');if(name!==actual&&code!==actual)continue;
    const mods=new Set((key.getAttribute('modifiers')||'').split(/[ ,]+/));
    const flags={ctrl:mods.has('control')||(!isMac&&mods.has('accel')),meta:mods.has('meta')||(isMac&&mods.has('accel')),alt:mods.has('alt'),shift:mods.has('shift')};
    if(['ctrl','meta','alt','shift'].every(k=>flags[k]===binding[k]))return `Shortcut is already used by ${key.id||'a browser command'}. Choose another.`;
  }return '';
}
export function createShortcut(window,{binding,onInvoke,onConflict}){
  let active=null,disposed=false;
  function update(value){active=null;if(disposed)return;try{const validated=validateBinding(value);const conflict=findConflict(window,validated);onConflict(conflict);if(!conflict)active=validated;}catch(error){onConflict(error.message);}}
  function keydown(event){
    if(!active||event.defaultPrevented||event.repeat||event.isComposing||event.getModifierState?.('AltGraph'))return;
    if(event.code!==active.code||event.ctrlKey!==active.ctrl||event.altKey!==active.alt||event.shiftKey!==active.shift||event.metaKey!==active.meta)return;
    const conflict=findConflict(window,active);if(conflict){active=null;onConflict(conflict);return;}
    event.preventDefault();event.stopPropagation();onInvoke();
  }
  window.addEventListener('keydown',keydown);update(binding);
  return {update,destroy(){disposed=true;active=null;window.removeEventListener('keydown',keydown);}};
}
