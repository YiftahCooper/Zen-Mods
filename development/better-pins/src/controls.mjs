import {areaOf,rootOf} from './zones.mjs';
import {ownMethod,restoreOwned} from './state.mjs';
export function folderCreationZone(tabs,trigger){return areaOf(tabs.includes(trigger)?trigger:tabs[0]);}
export function insertionTarget(roots,dragged,y){return roots.find(n=>n!==dragged&&y<n.getBoundingClientRect().top+n.getBoundingClientRect().height/2)??null;}
export function zoneMenuLabel(zone){return zone==='upper'?'Switch to Lower Zone':'Switch to Upper Zone';}
export class ZoneControls {
 constructor(c){this.c=c;this.h=c.host;this.buttons=new Map();this.hooks=[];this.collapsers=new Map();}
 start(){
  this.active=true;
  this.hooks.push(ownMethod(this.h.gZenFolders,'createFolder',([tabs=[],options={}],native)=>{
   if(!this.active||options.isLiveFolder)return native();
   const zone=folderCreationZone(tabs,options.insertBefore??this.h.TabContextMenu?.contextTab);
   const source=tabs.includes(options.insertBefore??this.h.TabContextMenu?.contextTab)?options.insertBefore??this.h.TabContextMenu.contextTab:tabs[0];
   const sourceRoot=rootOf(source),sourceSpace=this.c.zones.space(sourceRoot),selectedRoots=new Set(tabs.map(rootOf));
   const sourceContainer=zone==='lower'?sourceSpace?.tabsContainer:sourceSpace?.pinnedTabsContainer;
   const roots=sourceContainer?this.c.zones.roots(sourceContainer):[];
   const before=roots.slice(roots.indexOf(sourceRoot)+1).find(n=>!selectedRoots.has(n))??null;
   const folder=native();
   if(zone&&folder&&areaOf(folder)!==zone&&!folder.parentElement?.closest('zen-folder')){
    const space=this.c.zones.space(folder),parent=folder.parentNode,next=folder.nextSibling;
    try {this.c.zones.place(folder,zone==='lower'?space.tabsContainer:space.pinnedTabsContainer,before);this.c.zones.save();if(zone==='lower')this.c.zones.fallback.add(folder);}
    catch(error){parent.insertBefore(folder,next?.parentNode===parent?next:null);this.c.reportError(error);}
   }
   return folder;
  }));
  this.nativeButtons=new Map();
  this.command=this.h.document.createXULElement('command');this.command.id='better-pins-new-lower-command';
  this.command.addEventListener('command',e=>{if(!this.active)return;e.preventDefault();e.stopPropagation();void this.c.presentation.run(()=>this.c.newTab('lower'));});
  this.h.document.documentElement.appendChild(this.command);
  this.onPrefs={observe:()=>this.refresh()};
  this.h.Services.prefs.addObserver('better-pins.',this.onPrefs);
  this.h.Services.prefs.addObserver('btrnewtab.',this.onPrefs);
  this.refresh();
 }
 refresh(){
  if(!this.active)return;
  for(const button of this.h.document.querySelectorAll('#tabs-newtab-button,#vertical-tabs-newtab-button'))if(!this.nativeButtons.has(button)){this.nativeButtons.set(button,button.getAttribute('command'));button.setAttribute('command',this.command.id);}
  for(const space of this.c.zones.spaces()){
   const collapsible=space.collapsiblePins;
   if(collapsible&&!this.collapsers.has(collapsible)){
    const entry=ownMethod(collapsible,'toggle',(args,native)=>!this.active||this.c.pref('banner-collapse',true)?native():undefined);this.collapsers.set(collapsible,entry);
   }
   if(!this.c.pref('banner-collapse',true)&&collapsible?.collapsed)collapsible.collapsed=false;
   let button=this.buttons.get(space);
   if(!button){
    button=this.h.document.createElementNS('http://www.w3.org/1999/xhtml','button');
    button.type='button';button.className='better-pins-new-tab';button.title='New tab in upper zone';button.setAttribute('aria-label','New tab in upper zone');
    button.innerHTML='<span aria-hidden="true">+</span><span>New tab in upper zone</span>';
    button.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();void this.c.presentation.run(()=>this.c.newTab('upper'));});
    this.buttons.set(space,button);
   }
   button.hidden=!this.c.pref('show-upper-new-tab',true);
   const top=this.c.stringPref('upper-button-position','bottom')==='top';
   const anchor=top?space.pinnedTabsContainer:this.c.zones.dividers.get(space);
   if(button.nextSibling!==anchor)anchor.before(button);
   const inherit=this.c.pref('inherit-new-tab-style',true),prefs=this.h.Services.prefs;
   button.toggleAttribute('animate-plus',inherit&&prefs.getBoolPref('btrnewtab.plusanim',true));
   const radius=inherit&&prefs.getBoolPref('btrnewtab.enable-border-radius',false)?prefs.getStringPref('btrnewtab.border-radius','8px'):'8px';
   button.style.borderRadius=/^\d+(\.\d+)?(px|rem|em|%)$/.test(radius)?radius:'8px';
   const style=this.h.getComputedStyle(button);
   space.style.setProperty('--better-pins-button-height',button.hidden?'0px':Math.ceil((button.getBoundingClientRect().height||32)+(parseFloat(style.marginTop)||0)+(parseFloat(style.marginBottom)||0))+'px');
  }
  this.c.zones.layout();
 }
 destroy(){this.active=false;for(const [b,value]of this.nativeButtons??[])if(b.getAttribute('command')===this.command.id){if(value===null)b.removeAttribute('command');else b.setAttribute('command',value);}this.command?.remove();for(const branch of ['better-pins.','btrnewtab.'])this.h.Services.prefs.removeObserver(branch,this.onPrefs);for(const entry of [...this.hooks,...this.collapsers.values()].reverse())restoreOwned(entry);for(const [space,b]of this.buttons){b.remove();space.style.removeProperty('--better-pins-button-height');}this.buttons.clear();}
}
