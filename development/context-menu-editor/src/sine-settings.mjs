import {createSettingsUI} from './settings-ui.mjs';

/** Use Sine's existing Configure dialog; never change another mod's card. */
export function createSineSettingsBridge(window,{store,registry,icons,createUI=createSettingsUI}){
 const {document}=window;
 let disposed=false,controls=null,container=null,dialog=null,button=null;
 const reset=()=>controls?.reset();
 function unmount(){
  dialog?.removeEventListener('close',reset);button?.removeEventListener('click',reset);
  controls?.destroy();controls=container=dialog=button=null;
 }
 function mount(){
  if(disposed)return;
  const next=document.querySelector('[mod-id="context-menu-editor"] .sineItemPreferenceDialogContent');
  if(next===container&&controls?.element.isConnected){
   if(container.lastElementChild!==controls.element)container.append(controls.element);
   return;
  }
  unmount();if(!next)return;
  container=next;controls=createUI(window,{store,registry,icons});container.append(controls.element);
  dialog=container.closest('dialog');dialog?.addEventListener('close',reset);
  button=container.closest('[mod-id]')?.querySelector('.sineItemConfigureButton');button?.addEventListener('click',reset);
  const params=new URL(window.location.href).searchParams;
  if(params.get('contextMenuEditorSettings')==='1'&&!document.documentElement.hasAttribute('data-cme-settings-opened')){
   document.documentElement.setAttribute('data-cme-settings-opened','true');button?.click();
  }
 }
 const observer=new window.MutationObserver(mount);
 observer.observe(document.documentElement,{childList:true,subtree:true});mount();
 return {refresh(){controls?.refresh();},destroy(){if(disposed)return;disposed=true;observer.disconnect();unmount();}};
}
