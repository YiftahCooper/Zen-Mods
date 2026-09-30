import {createSettingsControls} from './settings.mjs';

// Sine's built-in preference types cannot securely store API keys or record keys.
// Keep those controls inside this mod's existing Configure dialog.
export function createSineSettingsBridge(window,options){
  const {document}=window;
  let controls,container,dialog,disposed=false;
  const style=document.createElementNS('http://www.w3.org/1999/xhtml','link');
  style.rel='stylesheet';style.href='chrome://sine/content/define-word/style.css';
  document.documentElement.append(style);
  const reset=()=>controls?.reset();
  function unmount(){dialog?.removeEventListener('close',reset);controls?.destroy();controls=container=dialog=null;}
  function mount(){
    if(disposed)return;
    const next=document.querySelector('[mod-id="define-word"] .sineItemPreferenceDialogContent');
    if(next===container&&controls?.element.isConnected)return;
    unmount();if(!next)return;
    container=next;controls=createSettingsControls(window,options);container.append(controls.element);
    dialog=container.closest('dialog');dialog?.addEventListener('close',reset);
    if(new URL(window.location.href).searchParams.get('defineWordSettings')==='1'&&!document.documentElement.hasAttribute('data-define-word-settings-shown')){
      document.documentElement.setAttribute('data-define-word-settings-shown','');
      container.closest('[mod-id]')?.querySelector('.sineItemConfigureButton')?.click();
    }
  }
  const observer=new window.MutationObserver(mount);observer.observe(document.documentElement,{childList:true,subtree:true});mount();
  return {destroy(){if(disposed)return;disposed=true;observer.disconnect();unmount();style.remove();}};
}
