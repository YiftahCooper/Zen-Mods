import {categoryKey} from '../zen/common/emojis/ZenIconCategories.mjs';
const PROVIDERS = { emoji: 'Emojis', zen: 'Zen Icons', lucide: 'Lucide', custom: 'Custom Icons' };
const CONTEXTS = { tab: 'Tabs', folder: 'Folders', space: 'Spaces' };
function prefix(kind) {
  if (!Object.hasOwn(CONTEXTS, kind)) throw new Error('Unknown icon picker context');
  return `zen-icons.${kind}.`;
}
function categories(value) {
  let names = value;
  if (typeof value === 'string' && value.trim().startsWith('[')) {
    try { names=JSON.parse(value); } catch { names=value; }
  }
  if (!Array.isArray(names)) names=String(names || '').split(/[,\n]/);
  return [...new Set(names.filter(s=>typeof s==='string').map(categoryKey).filter(Boolean))];
}
export function readPickerDefaults(prefs, kind) {
  const root=prefix(kind);
  const disabledProviders=Object.keys(PROVIDERS).filter(provider=>{
    try { return prefs.getBoolPref(root+'show-'+provider,true) === false; } catch { return false; }
  });
  let hidden='';
  try { hidden=prefs.getStringPref(root+'hidden-categories',''); } catch { /* Invalid pref type. */ }
  return {disabledProviders,disabledCategories:categories(hidden)};
}
export function writePickerDefaults(prefs,kind,state) {
  const root=prefix(kind);
  for(const provider of state.availableProviders) {
    if (state.onlyIcons && provider === 'emoji') continue;
    if (Object.hasOwn(PROVIDERS,provider)) prefs.setBoolPref(root+'show-'+provider,state.enabledProviders.includes(provider));
  }
  const names=categories(state.hiddenCategoryNames);
  prefs.setStringPref(root+'hidden-categories',names.some(n=>/[,\n]/.test(n) || n.startsWith('[')) ? JSON.stringify(names) : names.join(', '));
}
export function createSinePreferences() {
  return [
    {type:'separator',id:'zen-icons-behaviour-heading',label:'Icon Behaviour',size:'18px'},
    {type:'checkbox',property:'zen-icons.double-click-icons',label:'Double-Click an Icon to Open the Picker',defaultValue:false},
    {type:'checkbox',property:'zen-icons.tab.use-space-colour',label:'Use Space Colour for Default Tab Icons',defaultValue:true},
    ...Object.entries(CONTEXTS).flatMap(([kind,label])=>[
    {type:'separator',id:`zen-icons-${kind}-heading`,label:`${label}: Picker Defaults`,size:'18px'},
    ...Object.entries(PROVIDERS).map(([provider,name])=>({type:'checkbox',property:prefix(kind)+'show-'+provider,label:`Show ${name} by Default`,defaultValue:true})),
    {type:'string',property:prefix(kind)+'hidden-categories',label:'Hidden Categories',defaultValue:'',placeholder:'Comma-separated names, e.g. Animals, Flags; or use Filter → Save as Defaults'},
  ])];
}
