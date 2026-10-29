export const AREA_KEY = 'better-pins.areas.v1';
export const BASELINE_KEY = 'better-pins.baseline.v1';
export function parseAreaState(raw) {
  if (!raw) return {schema:1,spaces:{}};
  try {
    const state=JSON.parse(raw);
    if (state?.schema!==1 || !state.spaces || Array.isArray(state.spaces) || typeof state.spaces!=='object') return null;
    for (const zones of Object.values(state.spaces)) {
      if (!zones || !Array.isArray(zones.upper) || !Array.isArray(zones.lower)) return null;
      const ids=[...zones.upper,...zones.lower];
      if (ids.some(id=>typeof id!=='string'||!id) || new Set(ids).size!==ids.length) return null;
    }
    return state;
  } catch { return null; }
}
export function chooseInitialPin({known,origin,zone,folder=false,pinRoots=false,pinFolders=false,pinLowerRoots=false,pinLowerFolders=false,nativePinned=false}) {
  if (origin==='duplicate') return false;
  if (typeof known==='boolean') return known;
  if (origin==='new') return zone==='upper' ? (folder ? pinFolders : pinRoots) : zone==='lower' && (folder ? pinLowerFolders : pinLowerRoots);
  return !folder && nativePinned;
}
export function clampRatio(value,height,min=72) {
  const floor=Math.min(.5,min/Math.max(1,height));
  return Math.max(floor,Math.min(1-floor,Number.isFinite(value)?value:.5));
}
export function restoreOwned({owner,name,wrapper,descriptor}) {
  if (owner[name]!==wrapper) return false;
  if (descriptor) Object.defineProperty(owner,name,descriptor);else delete owner[name];
  return true;
}
export function ownMethod(owner,name,route) {
  const original=owner?.[name];
  if(typeof original!=='function') throw Error(`Missing capability: ${name}`);
  const descriptor=Object.getOwnPropertyDescriptor(owner,name);
  const wrapper=function(...args){return route.call(this,args,(...replacement)=>Reflect.apply(original,this,replacement.length?replacement:args));};
  Object.defineProperty(owner,name,{value:wrapper,writable:true,configurable:true});
  return {owner,name,wrapper,descriptor};
}
