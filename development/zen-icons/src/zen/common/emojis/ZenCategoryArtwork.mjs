import {categoryKey, cleanCategoryName} from './ZenIconCategories.mjs';

const LIMIT = 5 * 1024 * 1024;
const EXTENSION = /\.(png|jpe?g|webp|avif|ico)$/i;
const order = (a,b) => a.localeCompare(b,'en',{sensitivity:'base'}) || a.localeCompare(b,'en');

export function isCategoryArtworkFile(value) {
  return /^category icon\.(png|jpe?g|webp|avif|ico)$/i.test(cleanCategoryName(String(value).replaceAll('\\','/').split('/').at(-1)));
}

export function isArtworkPath(value) {
  return typeof value === 'string' && (EXTENSION.test(value.trim()) || /[/\\:]|\.(svg|gif)$/i.test(value));
}

function localPath(value, packRoot, pathUtils) {
  if (typeof value !== 'string') return null;
  const path = value.trim().replaceAll('\\','/');
  if (!EXTENSION.test(path) || path.startsWith('//') || /[\x00-\x1f]/.test(path)) return null;
  const absolute = /^[a-z]:\//i.test(path) || path.startsWith('/');
  const tail = /^[a-z]:\//i.test(path) ? path.slice(3) : path;
  if (tail.includes(':') || tail.split('/').some(p=>p==='..' || p==='.' || /[. ]$/.test(p))) return null;
  return absolute ? path : pathUtils.join(packRoot,...path.split('/'));
}

function mime(bytes) {
  const at=(start,text)=>[...text].every((c,i)=>bytes[start+i]===c.charCodeAt(0));
  if ([137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b)) return 'image/png';
  if (bytes[0]===255 && bytes[1]===216 && bytes[2]===255) return 'image/jpeg';
  if (at(0,'RIFF') && at(8,'WEBP')) return 'image/webp';
  if (bytes[0]===0 && bytes[1]===0 && bytes[2]===1 && bytes[3]===0 && bytes.length>=6) return 'image/x-icon';
  if (at(4,'ftyp') && [8,16,20,24,28].some(i=>at(i,'avif') || at(i,'avis'))) return 'image/avif';
  return null;
}

function base64(bytes) {
  const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const chunks=[];
  let text='';
  for(let i=0;i<bytes.length;i+=3) {
    const bits=(bytes[i]<<16)|((bytes[i+1]||0)<<8)|(bytes[i+2]||0);
    text+=alphabet[(bits>>>18)&63]+alphabet[(bits>>>12)&63]+(i+1<bytes.length?alphabet[(bits>>>6)&63]:'=')+(i+2<bytes.length?alphabet[bits&63]:'=');
    if(text.length>=8192){chunks.push(text);text='';}
  }
  return chunks.join('')+text;
}

// Read only bounded local raster bytes. Data URLs snapshot the checked bytes,
// so subsequent file replacement cannot redirect the privileged image loader.
export async function resolveCategoryArtwork({files,manifests,basePath,ioUtils,pathUtils,isSymlinkFor}) {
  const warnings=[], images=new Map(), cache=new Map(), jsonChoices=new Map(), folderChoices=new Map();
  async function source(path) {
    if (!path) return null;
    if (cache.has(path)) return cache.get(path);
    let result=null;
    try {
      for(let ancestor=path;ancestor && !/^(?:[a-z]:\/?|\/)$/i.test(ancestor);) {
        if(isSymlinkFor(ancestor)) throw Error('linked image path');
        const parent=ancestor.replace(/[\\/][^\\/]+$/,'');
        if(parent===ancestor) break;
        ancestor=parent;
      }
      const stat=await ioUtils.stat(path);
      if(stat.type!=='regular' || !Number.isFinite(stat.size) || stat.size<=0 || stat.size>LIMIT) throw Error('invalid size or file type');
      const bytes=await ioUtils.read(path,{maxBytes:LIMIT+1});
      const type=bytes?.length<=LIMIT && mime(bytes);
      if(!type) throw Error('not a supported raster image');
      result=`data:${type};base64,${base64(bytes)}`;
    } catch {
      warnings.push(`Unable to use category image: ${path}`);
    }
    cache.set(path,result);
    return result;
  }
  for(const [pack,manifest] of [...manifests].sort(([a],[b])=>order(a,b))) {
    for(const [name,definition] of Object.entries(manifest?.$categories || {})) {
      if(!definition || typeof definition!=='object') continue;
      jsonChoices.set(categoryKey(name),{value:definition.icon,root:pathUtils.join(basePath,pack)});
    }
  }
  for(const file of [...files].sort((a,b)=>order(a.relativePath,b.relativePath))) {
    const parts=file.relativePath.replaceAll('\\','/').split('/');
    if(parts.length!==3 || !isCategoryArtworkFile(file.relativePath) || file.isSymlink || parts.some(p=>!p || p==='.' || p==='..' || /:/.test(p))) continue;
    const key=categoryKey(parts[1]);
    const choices=folderChoices.get(key)||[];
    if(choices.length) warnings.push(`Conflicting category artwork for ${cleanCategoryName(parts[1])}; later alphabetic pack/path wins.`);
    choices.unshift(pathUtils.join(basePath,...parts));
    folderChoices.set(key,choices);
  }
  for(const key of new Set([...jsonChoices.keys(),...folderChoices.keys()])) {
    const paths=[...(folderChoices.get(key)||[])];
    const json=jsonChoices.get(key);
    if(json && isArtworkPath(json.value)) {
      const path=localPath(json.value,json.root,pathUtils);
      if(path) paths.push(path);
      else warnings.push(`Unsupported category image path for ${key}`);
    }
    const candidates=[];
    for(const path of paths) {const image=await source(path);if(image && !candidates.includes(image)) candidates.push(image);}
    if(candidates.length) images.set(key,candidates);
  }
  return {images,warnings};
}
