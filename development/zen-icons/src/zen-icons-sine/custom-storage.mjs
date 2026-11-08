import {CUSTOM_ICON_DIRECTORY_NAME} from '../zen/common/emojis/ZenCustomIconPacks.mjs';

export const CUSTOM_CONTENT_PREFIX='chrome://zen-icons-custom/content/';
export const LEGACY_CUSTOM_CONTENT_PREFIX='chrome://sine/content/zen-icons-local/custom/';

export function customStoragePaths(profileDir,join){
  return {
    root:join(profileDir,CUSTOM_ICON_DIRECTORY_NAME),
    legacy:join(profileDir,'chrome','sine-mods','zen-icons-local','custom'),
  };
}

function segments(value){
  try{
    const parts=value.split('/').map(decodeURIComponent);
    return parts.length&&parts.every(p=>p&&p!=='.'&&p!=='..'&&!/[\\/:\x00-\x1f]/.test(p))?parts:null;
  }catch{return null;}
}

export function customSourceParts(value){
  const source=String(value??'').split('#',1)[0];
  for(const prefix of [CUSTOM_CONTENT_PREFIX,LEGACY_CUSTOM_CONTENT_PREFIX]){
    if(source.startsWith(prefix))return segments(source.slice(prefix.length));
  }
  if(source.startsWith('file:')){
    const match=source.match(/\/(?:chrome\/sine-mods\/zen-icons-local\/custom|zen-icon-packs)\/(.+)$/i);
    if(match)return segments(match[1]);
  }
  return null;
}

export function canonicalCustomSource(source,{profileDir,joinPath,toFileURL}){
  if(String(source).startsWith('file:')){
    const {root,legacy}=customStoragePaths(profileDir,joinPath);
    const value=String(source).split('#',1)[0];
    const windows=/^file:\/\/\/[a-z]:\//i.test(value);
    const prefix=[root,legacy].map(p=>toFileURL(p).replace(/\/$/,'')+'/').find(prefix=>{
      return windows?value.toLowerCase().startsWith(prefix.toLowerCase()):value.startsWith(prefix);
    });
    if(!prefix)return null;
    const parts=segments(value.slice(prefix.length));if(!parts)return null;
    return toFileURL(joinPath(profileDir,CUSTOM_ICON_DIRECTORY_NAME,...parts));
  }
  const parts=customSourceParts(source);
  if(!parts)return null;
  return CUSTOM_CONTENT_PREFIX+parts.map(encodeURIComponent).join('/')+'#zen-icon.svg';
}

export function legacyArtworkManifest(text,legacyRoot,persistentRoot){
  let value;
  try{value=JSON.parse(text);}catch{return text;}
  let changed=false;
  for(const definition of Object.values(value?.$categories||{})){
    if(!definition||typeof definition.icon!=='string')continue;
    const normalized=definition.icon.replaceAll('\\','/'),prefix=legacyRoot.replaceAll('\\','/')+'/';
    const within=/^[a-z]:\//i.test(prefix)?normalized.toLowerCase().startsWith(prefix.toLowerCase()):normalized.startsWith(prefix);
    if(within){
      const tail=normalized.slice(prefix.length);
      if(tail.split('/').every(p=>p&&p!=='.'&&p!=='..')){
        definition.icon=persistentRoot.replaceAll('\\','/')+'/'+tail;changed=true;
      }
    }
  }
  return changed?JSON.stringify(value,null,2):text;
}

// Copies only once; after commit, user deletions in the authoritative directory
// must never be resurrected by the untouched legacy originals.
export async function ensureCustomStorage({profileDir,pathUtils,ioUtils,isSymlinkFor}){
  const paths=customStoragePaths(profileDir,pathUtils.join);
  const safe=path=>{
    for(let p=path;p&&!/^(?:[a-z]:[\\/]*|[\\/]+)$/i.test(p);){
      if(isSymlinkFor(p))throw Error('Linked custom artwork path refused');
      const parent=p.replace(/[\\/][^\\/]+$/,'');if(parent===p)break;p=parent;
    }
  };
  safe(paths.root);safe(paths.legacy);
  await ioUtils.makeDirectory(paths.root,{ignoreExisting:true});
  const marker=pathUtils.join(paths.root,'.zen-icons-migrated-v1.json');safe(marker);
  if(await ioUtils.exists(marker)){
    if((await ioUtils.readJSON(marker)).schema===1)return paths;
    throw Error('Unrecognized custom artwork migration marker; existing files were not changed');
  }
  const snapshot=async()=>{
    const files=[],directories=[];
    if(!await ioUtils.exists(paths.legacy))return {files,directories};
    const visit=async(dir,relative=[],depth=0)=>{
      if(depth>32)throw Error('Legacy custom artwork tree is too deep');
      safe(dir);
      for(const file of (await ioUtils.getChildren(dir)).sort()){
        safe(file);
        const name=pathUtils.filename(file),parts=[...relative,name],stat=await ioUtils.stat(file);
        if(stat.type==='directory'){directories.push(parts);await visit(file,parts,depth+1);}
        else if(stat.type==='regular')files.push({file,parts,size:stat.size,lastModified:stat.lastModified});
        else throw Error('Unsupported legacy artwork file type');
      }
    };
    await visit(paths.legacy);
    return {files,directories};
  };
  const before=await snapshot();
  const createdTargets=[];
  try{
  for(const parts of before.directories){const dir=pathUtils.join(paths.root,...parts);safe(dir);await ioUtils.makeDirectory(dir,{ignoreExisting:true});}
  for(const {file,parts,size,lastModified} of before.files){
    const target=pathUtils.join(paths.root,...parts);safe(target);
    let expected=null;
    if(size<=1024*1024&&parts.length===2&&parts[1].toLowerCase()==='icons.json'){
      const original=await ioUtils.readUTF8(file);
      const updated=legacyArtworkManifest(original,paths.legacy,paths.root);
      if(updated!==original)expected=new TextEncoder().encode(updated);
    }
    if(await ioUtils.exists(target)){
      const stat=await ioUtils.stat(target),length=expected?.length??size;
      if(stat.type!=='regular'||stat.size!==length)throw Error('Custom artwork migration file conflict: '+parts.join('/'));
      // Compare in bounded chunks, including unrelated user files in the tree.
      for(let offset=0;offset<length;offset+=1024*1024){
        const actual=await ioUtils.read(target,{offset,maxBytes:1024*1024});
        const original=expected?expected.subarray(offset,offset+1024*1024):await ioUtils.read(file,{offset,maxBytes:1024*1024});
        if(actual.length!==original.length||actual.some((b,i)=>b!==original[i]))throw Error('Custom artwork migration file conflict: '+parts.join('/'));
      }
      continue;
    }
    await ioUtils.makeDirectory(pathUtils.parent(target),{ignoreExisting:true});safe(target);
    const pending=target+'.zen-icons-copy-'+Date.now()+'-'+Math.random().toString(36).slice(2);
    safe(pending);
    let created=false;
    try{
      if(expected)await ioUtils.write(pending,expected,{mode:'create'});
      else await ioUtils.copy(file,pending,{noOverwrite:true});
      created=true;
      const after=await ioUtils.stat(file);
      if(after.size!==size||after.lastModified!==lastModified)throw Error('Legacy artwork changed during migration');
      const digest=await ioUtils.computeHexDigest(pending,'sha256');
      safe(target);await ioUtils.move(pending,target,{noOverwrite:true});
      createdTargets.push({target,digest});
    }catch(error){
      // Never remove a pre-existing file when an exclusive create/copy failed.
      // An interrupted partial copy has an unsupported suffix and is ignored.
      try{if(created&&await ioUtils.exists(pending))await ioUtils.remove(pending);}catch{}
      throw error;
    }
  }
  if(JSON.stringify(await snapshot())!==JSON.stringify(before))throw Error('Legacy artwork tree changed during migration; retry after editing finishes');
  safe(marker);
  const pendingMarker=marker+'.pending-'+Date.now()+'-'+Math.random().toString(36).slice(2);safe(pendingMarker);
  await ioUtils.writeJSON(pendingMarker,{schema:1},{mode:'create',flush:true});
  await ioUtils.move(pendingMarker,marker,{noOverwrite:true});
  return paths;
  }catch(error){
    // Roll back only files this call created and whose bytes are still ours.
    // Pre-existing artwork and independent user edits are never overwritten.
    for(const {target,digest} of createdTargets.reverse()){
      try{
        safe(target);
        if(await ioUtils.exists(target)&&(await ioUtils.stat(target)).type==='regular'&&await ioUtils.computeHexDigest(target,'sha256')===digest)await ioUtils.remove(target);
      }catch{}
    }
    throw error;
  }
}
