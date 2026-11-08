import {createState,serializeState} from './model.mjs';
import {SETTINGS_PREF} from './store.mjs';

// Preference/command identities from Zen Context Menu. Never infer old nth-child
// targets: their meaning changes with the installed browser and other mods.
const PAGE='contentAreaContextMenu',TAB='tabContextMenu';
const HIDDEN={
 bookmark:{[PAGE]:['context-bookmarklink'],[TAB]:['context_bookmarkSelectedTabs','context_bookmarkTab']},
 mutetab:{[TAB]:['context_toggleMuteTab','context_toggleMuteSelectedTabs','context_playTab','context_playSelectedTabs']},
 newtab:{[TAB]:['context_openANewTab']},
 movetaboptions:{[TAB]:['context_moveTabOptions']},
 newcontainer:{[PAGE]:['context-openlinkinusercontext-menu'],[TAB]:['context_reopenInContainer']},
 sendtodevice:{[PAGE]:['context-sendpagetodevice','context-sendlinktodevice','context-sep-sendlinktodevice'],[TAB]:['context_sendTabToDevice']},
 closetab:{[TAB]:['context_closeTab','context_closeDuplicateTabs']},
 closemultiple:{[TAB]:['context_closeTabOptions']},
 search:{[PAGE]:['context-searchselect']},
 searchinpriv:{[PAGE]:['context-searchselect-private']},
 translate:{[PAGE]:['context-translate-selection','frame-sep']},
 askchatbot:{[PAGE]:['context-ask-chat']},
 printselection:{[PAGE]:['context-print-selection']},
 image:{[PAGE]:['context-sendimage','context-sep-setbackground','context-setDesktopBackground','context-sep-sharing','context-viewimageinfo']},
 audiovideo:{[PAGE]:['context-copyvideourl','context-copyaudiourl','context-sendvideo','context-sendaudio','context-sep-sharing']},
 checkspelling:{[PAGE]:['spell-separator','spell-check-enabled','spell-add-dictionaries-main','spell-dictionaries','context-sep-bidi','context-bidi-text-direction-toggle','context-bidi-page-direction-toggle']},
 screenshot:{[PAGE]:['context-take-screenshot','context-sep-screenshots','frame-sep']},
 frame:{[PAGE]:['frame-sep','frame']},
 selectalltext:{[PAGE]:['context-selectall','context-sep-selectall']},
 selectalltabs:{[TAB]:['context_selectAllTabs','context_selectedAllTabs']},
 reloadtab:{[TAB]:['context_reloadTab','context_reloadSelectedTabs']},
 duplicatetab:{[TAB]:['context_duplicateTab','context_duplicateTabs']},
 inspect:{[PAGE]:['context-viewsource','context-inspect-a11y','context-inspect','inspect-separator','context-media-eme-separator','context-viewpartialsource-selection']},
 savelink:{[PAGE]:['context-savepage','context-savelink']},
 pin:{[TAB]:['context_pinTab','context_unpinTab','context_pinSelectedTabs','context_unpinSelectedTabs','context_zen-add-essential','context_zen-remove-essential']},
 navigation:{[PAGE]:['context-back','context-forward','context-reload','context-stop','context-bookmarkpage','context-sep-navigation']},
};

/** Import explicit legacy values once. Existing editor bytes always win. */
export function initializeLegacySettings(prefs){
 let before;
 try{before=prefs.getStringPref(SETTINGS_PREF,'');}catch{return {imported:false,reason:'unreadable'};}
 if(before!=='')return {imported:false,reason:'existing'};
 const state=createState();let found=0;
 const read=(name,type,valid=()=>true)=>{
  try{
   if(!prefs.prefHasUserValue?.(name))return undefined;
   const value=prefs[type==='boolean'?'getBoolPref':type==='number'?'getIntPref':'getStringPref'](name);
   if(typeof value!==type||!valid(value))return undefined;
   found++;return value;
  }catch{return undefined;}
 };
 const root=id=>state.roots[id]??=( {children:[],records:{}} );
 for(const [preference,menus]of Object.entries(HIDDEN))if(read('uc.hidecontext.'+preference,'boolean')===true){
  for(const [id,ids]of Object.entries(menus)){const menu=root(id);menu.legacyHiddenIds=[...new Set([...(menu.legacyHiddenIds||[]),...ids])];}
 }
 const separators=read('uc.hidecontext.separators','boolean');if(separators!==undefined)state.options.showSeparators=!separators;
 const cleanLinks=read('uc.hidecontext.copylink','boolean');if(cleanLinks!==undefined)state.options.preferCleanLinks=cleanLinks;
 const restoreIcons=read('uc.fixcontext.restoreicons','boolean');if(restoreIcons===true)state.options.iconPack='zen';
 const pack=read('cmi-Switch-Icon-Package','number',value=>Number.isInteger(value)&&[0,1,2].includes(value));
 if(pack!==undefined){state.options.showIcons=pack!==0;state.options.iconPack=pack===2?'zen':'fluent';}
 if(read('uc.hidecontext.icons','boolean')===true)state.options.showIcons=false;
 const opacity=read('cmi-menuseparator-opacity','string',value=>/^(?:0(?:\.\d+)?|1(?:\.0+)?)$/u.test(value.trim()));
 if(opacity!==undefined)state.options.separatorOpacity=Number(opacity);
 const gray=read('cmi-Grayscale-Extensions-Icons','boolean');if(gray!==undefined)state.options.monochromeExtensions=gray;
 const betterMenu=read('cmi-Disable-Better-Context-Menu','boolean');if(betterMenu!==undefined){state.options.rounded=!betterMenu;state.options.hoverShade=!betterMenu;}
 if(read('cmi-Disable-BCM-Gradient-Effect','boolean')===true)state.options.hoverShade=false;
 for(const [id,suffix]of [[PAGE,'ContentAreaContextMenu'],[TAB,'TabContextMenu']]){
  const hidden=read('cmi-Hide-Inactive-Items-'+suffix,'boolean');if(hidden!==undefined)root(id).hideUnavailable=hidden;
 }
 // Old checkmark/extension offsets, unrelated toolbar settings, obsolete flags,
 // CSS selectors and folding scripts have no equivalent in this menu model.
 // They stay with their owner; no personal values or arbitrary CSS are copied.
 if(!found)return {imported:false,reason:'none'};
 const encoded=serializeState(state);
 if(prefs.getStringPref(SETTINGS_PREF,'')!==before)return {imported:false,reason:'changed'};
 prefs.setStringPref(SETTINGS_PREF,encoded);
 return {imported:true};
}
