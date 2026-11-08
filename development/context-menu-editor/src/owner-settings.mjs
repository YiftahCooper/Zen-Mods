import {mergeInventory,updateItem,validatePlacement,validateState} from './model.mjs';

/** Hints limit which presentation fields a setting can yield. Unknown ordinary
 * settings do not revoke menu edits just because a dynamic label later changes. */
export function settingFields(property) {
 const words=property.replace(/([a-z])([A-Z])/g,'$1 $2').replace(/[._-]/g,' ').toLowerCase();
 if(/\b(icon|icons|iconset|image|artwork)\b/.test(words))return ['icon'];
 if(/\b(name|label|title|scope)\b/.test(words))return ['name'];
 if(/\b(order|position|arrangement|layout)\b/.test(words))return ['placement'];
 if(/\b(hidden|hide|visible|visibility|show|enabled)\b/.test(words))return ['visibility'];
 return /\b(menu|context|state|settings|config)\b/.test(words)?['name','icon','visibility','placement']:[];
}

/** Minimal order changes leave unaffected editor nesting in place. A longest
 * increasing subsequence identifies rows whose original relative order stayed. */
export function changedOwnerPlacement(before,after){
 const prior=new Map(before.map(item=>[item.key,item])),groups=new Map(),stationary=new Map(),crossedAnchors=new Set();
 for(const item of after){const peers=groups.get(item.parentKey)||[];peers.push(item.key);groups.set(item.parentKey,peers);}
 for(const [parent,peers]of groups){
  const old=before.find(item=>item.parentKey===parent)?.peers||before.filter(item=>item.parentKey===parent).map(item=>item.key),positions=new Map(old.map((key,index)=>[key,index]));
  // Other owners' and native rows are fixed anchors. An unconstrained LIS can
  // otherwise keep the moved owner row and incorrectly call the anchor moved.
  const common=new Set(peers.filter(key=>positions.has(key))),isAnchor=key=>common.has(key)&&!prior.has(key);
  for(const key of peers)if(prior.has(key)&&positions.has(key)){
   const oldAnchors=old.slice(0,positions.get(key)).filter(isAnchor),newAnchors=peers.slice(0,peers.indexOf(key)).filter(isAnchor);
   if(JSON.stringify(oldAnchors)!==JSON.stringify(newAnchors))crossedAnchors.add(key);
  }
  const keys=peers.filter(key=>positions.has(key)&&prior.has(key)&&!crossedAnchors.has(key)),tails=[],tailRows=[],parents=[];
  for(let index=0;index<keys.length;index++){
   const value=positions.get(keys[index]);let left=0,right=tails.length;
   while(left<right){const middle=(left+right)>>1;if(tails[middle]<value)left=middle+1;else right=middle;}
   parents[index]=left?tailRows[left-1]:-1;tails[left]=value;tailRows[left]=index;
  }
  const stable=new Set();for(let index=tailRows.at(-1);index!==undefined&&index>=0;index=parents[index])stable.add(keys[index]);stationary.set(parent,stable);
 }
 return after.filter(item=>prior.has(item.key)&&(prior.get(item.key).parentKey!==item.parentKey||crossedAnchors.has(item.key)||!stationary.get(item.parentKey)?.has(item.key))).map(({key,parentKey})=>({key,parentKey}));
}

/** Observe only settings associated with an installed Sine mod. No pref values,
 * selections, credentials or handler code are collected or persisted. */
export function createOwnerSettingsObserver(window,{prefs,loadMods,onChange}) {
 let disposed=false,bindings=new Map(),prefixes=new Map(),pending=null;
 async function refresh(){
  if(disposed)return;if(pending)return pending;
  pending=load();try{await pending;}finally{pending=null;}
 }
 async function load(){
  try{
   const mods=await loadMods(),next=new Map(),families=new Map();
   await Promise.all(Object.values(mods||{}).filter(mod=>mod?.id!=='context-menu-editor'&&typeof mod?.preferences==='string'&&/^[\w.-]+$/.test(mod.id)&&/^[\w./-]+\.json$/.test(mod.preferences)&&!mod.preferences.split('/').includes('..')).map(async mod=>{
    try{
     const response=await window.fetch(`chrome://sine/content/${mod.id}/${mod.preferences}`),text=await response.text();if(text.length>256*1024)return;
     const entries=JSON.parse(text);if(!Array.isArray(entries))return;
     for(const entry of entries){const property=entry?.property;if(typeof property!=='string'||!property||property.length>256)continue;
      const owners=next.get(property)||[];if(!owners.some(owner=>owner.id===mod.id))owners.push({id:mod.id,fields:settingFields(property)});next.set(property,owners);
      const prefix=property.slice(0,property.lastIndexOf('.')+1);
      // A shared family of declared prefs also covers custom settings panels
      // (for example a mod's JSON state), without guessing from its folder ID.
      if(prefix.split('.').filter(Boolean).length>=2){const group=families.get(prefix)||[];group.push(mod.id);families.set(prefix,group);}
     }
    }catch{/* Missing settings metadata grants no ownership authority. */}
   }));
   if(disposed)return;
   prefixes=new Map();for(const [prefix,ids]of families)if(ids.length>=2&&new Set(ids).size===1)prefixes.set(prefix,ids[0]);
   bindings=next;
  }catch{/* Discovery remains available if settings metadata cannot be read. */}
 }
 const observer={observe(_subject,_topic,property){
  if(disposed||typeof property!=='string'||property.startsWith('extension.context-menu-editor.'))return;
  let owners=bindings.get(property);
  if(!owners){const ids=new Set([...prefixes].filter(([prefix])=>property.startsWith(prefix)).map(([,id])=>id));if(ids.size===1)owners=[{id:[...ids][0],fields:settingFields(property)}];}
  for(const owner of owners||[])if(owner.fields.length)onChange(owner.id,owner.fields);
 }};
 prefs.addObserver('',observer);void refresh();
 return {refresh,destroy(){if(disposed)return;disposed=true;prefs.removeObserver('',observer);bindings.clear();prefixes.clear();}};
}

/** Persist only the fields actually changed by the owner after its setting was
 * edited. All other item edits, custom groups and other mods stay in place. */
export function applyOwnerChanges(state,rootId,descriptors,{patches=[],placement=[]}){
 let next=mergeInventory(state,rootId,descriptors);
 for(const {key,patch}of patches)if(next.roots[rootId].records[key])next=updateItem(next,rootId,key,patch);
 if(placement.length){
  next=validateState(next);const root=next.roots[rootId],moving=new Set(placement.map(item=>item.key));
  root.children=root.children.filter(key=>!moving.has(key));
  for(const record of Object.values(root.records))if(record.children)record.children=record.children.filter(key=>!moving.has(key));
  for(const {key,parentKey}of placement){
   const target=parentKey===null?root.children:root.records[parentKey]?.children;if(!target)throw Error('The owner submenu is unavailable.');
   const peers=descriptors.filter(item=>item.parentKey===parentKey).map(item=>item.key),index=peers.indexOf(key);
   const before=peers.slice(index+1).find(candidate=>target.includes(candidate)),after=peers.slice(0,index).reverse().find(candidate=>target.includes(candidate));
   target.splice(after?target.indexOf(after)+1:before?target.indexOf(before):target.length,0,key);
  }
 }
 return validatePlacement(next,rootId,descriptors);
}
