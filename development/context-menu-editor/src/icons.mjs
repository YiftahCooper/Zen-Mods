import {createIconCatalog, DEFAULT_ICON_BASE} from './icon-catalog.mjs';

const LOCAL_LIMIT = 5 * 1024 * 1024;
const URL_LIMIT = 256 * 1024;
const MAX_DIMENSION = 4096;
const DEADLINE = 8000;
const PNG_PREFIX = 'data:image/png;base64,';
const SVG_NS = 'http://www.w3.org/2000/svg';
const IMAGE_SCHEMES = /^(?:chrome:|resource:|moz-extension:|https?:|data:image\/)/iu;
const FAMILIES = [
  ['edit-copy', /\bcopy\b/u], ['edit-cut', /\bcut\b/u], ['edit-paste', /\bpaste\b/u],
  ['edit-undo', /\bundo\b/u], ['edit-redo', /\bredo\b/u],
  ['edit-delete', /\b(?:delete|remove|trash)\b/u], ['save', /\b(?:save|download|export)\b/u],
  ['translations', /\b(?:translate|translation|translations)\b/u],
  ['spell-check', /\b(?:define|definition|dictionary|spell)\b/u],
  ['search-glass', /\b(?:search|find)\b/u], ['print', /\bprint\b/u],
  ['bookmark', /\bbookmark\b/u], ['share', /\bshare\b/u], ['open', /\bopen\b/u],
  ['settings', /\b(?:settings|configure|preferences)\b/u], ['edit', /\b(?:edit|rename)\b/u],
  ['close', /\bclose\b/u], ['hide', /\bhide\b/u], ['reload', /\b(?:reload|refresh)\b/u],
  ['pin', /\bpin\b/u], ['unpin', /\bunpin\b/u], ['help', /\bhelp\b/u],
];

export function textIcon(value, window) {
  if (typeof value !== 'string' || value.length > 64) throw new Error('Use 1–8 short Unicode symbols.');
  const text = value.trim();
  if (!text || /[\p{Cc}\p{Cs}\p{Zl}\p{Zp}]/u.test(text)) throw new Error('Use 1–8 short Unicode symbols.');
  const Segmenter = window.Intl?.Segmenter || Intl.Segmenter;
  const count = [...new Segmenter(undefined,{granularity:'grapheme'}).segment(text)].length;
  if (count < 1 || count > 8) throw new Error('Use 1–8 short Unicode symbols.');
  return {kind:'text',text};
}
// Saved custom icons are revalidated on every menu opening. The verdict depends
// only on the data string, so a small bounded cache avoids repeated decoding.
const pngVerdicts = new Map();
function normalizedPNG(data, window) {
  if (typeof data !== 'string') return false;
  if (pngVerdicts.has(data)) return pngVerdicts.get(data);
  const verdict = checkPNG(data, window);
  if (pngVerdicts.size >= 256) pngVerdicts.delete(pngVerdicts.keys().next().value);
  pngVerdicts.set(data, verdict);
  return verdict;
}
function checkPNG(data, window) {
  if (typeof data !== 'string' || data.length > 8192 || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/u.test(data)) return false;
  let bytes;
  try { bytes = window.atob(data.slice(PNG_PREFIX.length)); } catch { return false; }
  return bytes.length >= 24 && bytes.slice(0,8) === '\x89PNG\r\n\x1a\n' && bytes.slice(12,16) === 'IHDR' &&
    readString32(bytes,16) === 32 && readString32(bytes,20) === 32;
}
function readString32(bytes, offset) {
  return bytes.charCodeAt(offset)*0x1000000 + bytes.charCodeAt(offset+1)*0x10000 + bytes.charCodeAt(offset+2)*0x100 + bytes.charCodeAt(offset+3);
}
function dimensions(width, height) {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) throw new Error('This image has invalid dimensions.');
  if (width > MAX_DIMENSION || height > MAX_DIMENSION) throw new Error('Use an image no larger than 4096 pixels per side.');
}
function httpsURL(value, window) {
  let url;
  try {
    if (typeof value !== 'string' || value.length > 4096) throw new Error();
    url = new window.URL(value.trim());
  } catch { throw new Error('Use a valid HTTPS image link.'); }
  if (url.protocol !== 'https:') throw new Error('Use an HTTPS image link.');
  if (url.username || url.password) throw new Error('Use an image link without credentials.');
  return url.href;
}
function semanticIcon(descriptor) {
  const words = [descriptor.nativeId, descriptor.key, descriptor.label].filter(value => typeof value === 'string')
    .map(value => value.replace(/([a-z])([A-Z])/gu,'$1 $2').replace(/[_:\-.]/gu,' ').toLowerCase()).join(' ');
  const matches = FAMILIES.filter(([,pattern]) => pattern.test(words));
  return matches.length === 1 ? matches[0][0] : null;
}

/** User imports never change a record; callers save the returned value explicitly. */
export function createIconService(window, {baseURL = DEFAULT_ICON_BASE, fetch:fetchOption} = {}) {
  const catalog = createIconCatalog(baseURL);
  const fetchImage = fetchOption || window.fetch?.bind(window);
  const abortError = () => new window.DOMException('Icon import cancelled.','AbortError');
  const check = signal => { if (signal.aborted) throw signal.reason || abortError(); };

  function asset(entry, source) {
    return entry ? {type:'image',src:entry.src,monochrome:true,source,...(entry.fallbackSrc ? {fallbackSrc:entry.fallbackSrc} : {})} : null;
  }
  function resolve(descriptor = {}, record = {}, options = {}) {
    if(record.iconOwner){
      if(record.showIcon!==false&&typeof descriptor.iconURL==='string'&&descriptor.iconURL.length<=LOCAL_LIMIT&&IMAGE_SCHEMES.test(descriptor.iconURL))return {type:'image',src:descriptor.iconURL,monochrome:false,source:'owner'};
      return null;
    }
    if (options.showIcons === false || record.showIcon === false || descriptor.kind === 'separator' || record.kind === 'separator') return null;
    const icon = record.icon;
    if (icon?.kind === 'asset') {
      const selected = catalog.find(icon.pack,icon.id);
      if (selected) return asset(selected,'custom');
    } else if (icon?.kind === 'image' && normalizedPNG(icon.data,window)) {
      return {type:'image',src:icon.data,monochrome:false,source:'custom'};
    } else if (icon?.kind === 'text') {
      try { return {type:'text',text:textIcon(icon.text,window).text,source:'custom'}; } catch { /* Invalid saved choices fall back safely. */ }
    }
    const pack = options.iconPack === 'zen' ? 'zen' : 'fluent';
    const exact = catalog.mapped(pack,descriptor.nativeId,descriptor.l10nId || descriptor.l10n);
    if (exact) return asset(exact,'builtin');
    if (typeof descriptor.iconURL === 'string' && descriptor.iconURL.length <= LOCAL_LIMIT && IMAGE_SCHEMES.test(descriptor.iconURL)) {
      return {type:'image',src:descriptor.iconURL,monochrome:options.monochromeExtensions === true,source:'owner'};
    }
    const family = semanticIcon(descriptor);
    if (family) {
      const entry = catalog.find(pack,family);
      if (entry) return asset(entry,'semantic');
    }
    const container = ['submenu','native-menu'].includes(record.kind || descriptor.kind);
    return asset(catalog.find(pack,container ? 'menu' : 'info'),'fallback');
  }

  // One deadline encloses reading, streaming and image decoding. The internal
  // signal also releases each browser resource when the caller cancels.
  async function bounded(work, callerSignal) {
    if (callerSignal?.aborted) throw abortError();
    const controller = new window.AbortController();
    let timer, rejectAbort;
    const aborted = new Promise((_,reject) => { rejectAbort = reject; });
    const onAbort = () => rejectAbort(controller.signal.reason || abortError());
    const cancel = () => controller.abort(abortError());
    controller.signal.addEventListener('abort',onAbort,{once:true});
    callerSignal?.addEventListener('abort',cancel,{once:true});
    timer = window.setTimeout(() => controller.abort(new Error('Image took too long. Try a smaller image.')),DEADLINE);
    try {
      return await Promise.race([Promise.resolve().then(() => { check(controller.signal); return work(controller.signal); }),aborted]);
    } finally {
      window.clearTimeout(timer);
      callerSignal?.removeEventListener('abort',cancel);
      controller.signal.removeEventListener('abort',onAbort);
    }
  }
  function readBlob(blob, signal) {
    check(signal);
    if (!blob || typeof blob.size !== 'number' || blob.size <= 0) throw new Error('Choose an image file.');
    if (blob.size > LOCAL_LIMIT) throw new Error('Use an image no larger than 5 MiB.');
    // FileReader supports File/Blob from the same browser realm and can stop an
    // in-flight read. No image source is allocated before bytes are inspected.
    return new Promise((resolve,reject) => {
      const reader = new window.FileReader();
      const cleanup = () => { signal.removeEventListener('abort',cancel);reader.onload=reader.onerror=reader.onabort=null; };
      const cancel = () => { reader.abort();cleanup();reject(signal.reason || abortError()); };
      reader.onload = () => {const bytes=new Uint8Array(reader.result);cleanup();resolve(bytes);};
      reader.onerror = () => {cleanup();reject(new Error('Could not read this image.'));};
      reader.onabort = () => {cleanup();reject(signal.reason || abortError());};
      signal.addEventListener('abort',cancel,{once:true});
      try { reader.readAsArrayBuffer(blob); } catch { cleanup();reject(new Error('Choose an image file.')); }
    });
  }
  async function readURL(value, signal) {
    const url = httpsURL(value,window);
    if (!fetchImage) throw new Error('Image links are unavailable here. Choose a file.');
    let response;
    try { response = await fetchImage(url,{credentials:'omit',referrerPolicy:'no-referrer',redirect:'error',signal}); }
    catch (error) {check(signal);throw new Error('Could not load this image link.');}
    check(signal);
    if (response.redirected || (response.url && response.url !== url)) throw new Error('Use a direct image link without redirects.');
    if (!response.ok) throw new Error('Could not load this image link.');
    const declared = Number(response.headers?.get('content-length'));
    if (Number.isFinite(declared) && declared > URL_LIMIT) { response.body?.cancel()?.catch?.(()=>{});throw new Error('Use an image link no larger than 256 KiB.'); }
    if (!response.body?.getReader) throw new Error('Could not read this image link safely. Choose a file.');
    const reader = response.body.getReader(), chunks = [];
    let total = 0, complete = false;
    const cancel = () => { reader.cancel().catch(()=>{}); };
    signal.addEventListener('abort',cancel,{once:true});
    try {
      while (true) {
        check(signal);
        const {value:chunk,done} = await reader.read();
        check(signal);
        if (done) {complete=true;break;}
        total += chunk.byteLength;
        if (total > URL_LIMIT) throw new Error('Use an image link no larger than 256 KiB.');
        chunks.push(chunk);
      }
      if (!total) throw new Error('This image link is empty.');
      const bytes = new Uint8Array(total);let offset=0;
      for (const chunk of chunks) {bytes.set(chunk,offset);offset+=chunk.byteLength;}
      return bytes;
    } finally {
      signal.removeEventListener('abort',cancel);
      if (!complete) cancel();
      reader.releaseLock();
    }
  }
  function pasteBytes(value) {
    const match = /^data:(image\/(?:png|jpeg|gif|webp|svg\+xml))(;base64)?,([\s\S]*)$/iu.exec(value);
    if (!match) throw new Error('Paste an image or a short Unicode symbol.');
    if (match[3].length > Math.ceil(LOCAL_LIMIT/3)*4) throw new Error('Use an image no larger than 5 MiB.');
    let bytes;
    try {
      if (match[2]) {
        if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(match[3])) throw new Error();
        const raw = window.atob(match[3]);bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));
      } else bytes = new TextEncoder().encode(decodeURIComponent(match[3]));
    } catch { throw new Error('This pasted image is invalid.'); }
    if (bytes.byteLength > LOCAL_LIMIT) throw new Error('Use an image no larger than 5 MiB.');
    return bytes;
  }
  function validateSVG(text) {
    if (/<!DOCTYPE|<!ENTITY/iu.test(text)) throw new Error('Use an SVG without active or external content.');
    const doc = new window.DOMParser().parseFromString(text,'image/svg+xml'), root=doc.documentElement;
    if (root.localName !== 'svg' || root.namespaceURI !== SVG_NS || doc.querySelector('parsererror')) throw new Error('This SVG image is invalid.');
    const forbidden = new Set(['script','foreignobject','image','iframe','object','embed','audio','video','animate','animatemotion','animatetransform','set','mpath']);
    for (const element of [root,...root.querySelectorAll('*')]) {
      if (element.namespaceURI !== SVG_NS || forbidden.has(element.localName.toLowerCase())) throw new Error('Use an SVG without active or external content.');
      for (const attr of element.attributes) {
        const name=attr.localName.toLowerCase(), value=attr.value.trim();
        if (name.startsWith('on') || name==='base' || value.includes('\\') || ((name==='href' || name==='src') && !/^#[A-Za-z0-9_.:-]+$/u.test(value))) throw new Error('Use an SVG without active or external content.');
        validateLocalURLs(value);
        if (name==='style' && /[\\@]|(?:expression|javascript)\s*[:(]/iu.test(value)) throw new Error('Use an SVG without active styles.');
      }
      if (element.localName==='style') {
        // CSS escapes and imports make URL checking unreliable. Imported
        // artwork can use presentation attributes or plain local styles.
        const css=element.textContent;
        if (/[\\@]|(?:expression|javascript)\s*[:(]/iu.test(css)) throw new Error('Use an SVG without active or external styles.');
        validateLocalURLs(css);
      }
    }
    const instructions=doc.createTreeWalker(doc,window.NodeFilter.SHOW_PROCESSING_INSTRUCTION);
    if(instructions.nextNode())throw new Error('Use an SVG without external styles.');
    for(const name of ['width','height']){
      const value=root.getAttribute(name);
      if(value && /^[+\d.]+(?:px)?$/u.test(value) && Number.parseFloat(value)>MAX_DIMENSION)throw new Error('Use an image no larger than 4096 pixels per side.');
    }
  }
  function validateLocalURLs(value) {
    const opening=/url\s*\(/giu;
    let match;
    while((match=opening.exec(value))){
      // Fixed quote alternatives cannot backtrack into an unquoted branch.
      // Require a complete local fragment and closing parenthesis for each
      // URL, including later URLs in the same attribute or style declaration.
      const local=/^\s*(?:"#[A-Za-z0-9_.:-]+"|'#[A-Za-z0-9_.:-]+'|#[A-Za-z0-9_.:-]+)\s*\)/u.exec(value.slice(opening.lastIndex));
      if(!local)throw new Error('Use an SVG with only local fragment image links. External or malformed links are unsupported.');
      opening.lastIndex+=local[0].length;
    }
  }
  function jpegDimensions(bytes,view) {
    let offset=2;
    while(offset<bytes.byteLength){
      if(bytes[offset++]!==255)break;
      while(bytes[offset]===255)offset++;
      const marker=bytes[offset++];
      if(marker===217 || marker===218)break;
      if(marker===1 || (marker>=208 && marker<=215))continue;
      if(offset+2>bytes.byteLength)break;
      const length=view.getUint16(offset);
      if(length<2 || offset+length>bytes.byteLength)break;
      if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker) && length>=8){
        dimensions(view.getUint16(offset+5),view.getUint16(offset+3));return;
      }
      offset+=length;
    }
    // The browser still validates truncated or unrecognized files. This scan
    // rejects known excessive dimensions before invoking its raster decoder.
  }
  function webpDimensions(bytes,view) {
    let offset=12;
    while(offset+8<=bytes.byteLength){
      const kind=String.fromCharCode(...bytes.slice(offset,offset+4)), length=view.getUint32(offset+4,true), payload=offset+8;
      if(payload+length>bytes.byteLength)break;
      if(kind==='VP8X' && length>=10){
        const read24=at=>bytes[at]+(bytes[at+1]<<8)+(bytes[at+2]<<16);
        dimensions(read24(payload+4)+1,read24(payload+7)+1);return;
      }
      if(kind==='VP8L' && length>=5 && bytes[payload]===0x2f){
        const bits=view.getUint32(payload+1,true);dimensions((bits&0x3fff)+1,((bits>>>14)&0x3fff)+1);return;
      }
      if(kind==='VP8 ' && length>=10 && bytes[payload+3]===0x9d && bytes[payload+4]===1 && bytes[payload+5]===0x2a){
        dimensions(view.getUint16(payload+6,true)&0x3fff,view.getUint16(payload+8,true)&0x3fff);return;
      }
      offset=payload+length+(length%2);
    }
  }
  function sniff(bytes) {
    if (!bytes.byteLength) throw new Error('Choose an image with content.');
    const view = new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    if (bytes.byteLength>=24 && bytes[0]===137 && String.fromCharCode(...bytes.slice(1,8))==='PNG\r\n\x1a\n') {
      if (String.fromCharCode(...bytes.slice(12,16))!=='IHDR') throw new Error('This PNG image is invalid.');
      dimensions(view.getUint32(16),view.getUint32(20));return 'image/png';
    }
    if (bytes.byteLength>=10 && /GIF8[79]a/u.test(String.fromCharCode(...bytes.slice(0,6)))) {dimensions(view.getUint16(6,true),view.getUint16(8,true));return 'image/gif';}
    if (bytes.byteLength>=3 && bytes[0]===255 && bytes[1]===216 && bytes[2]===255) {jpegDimensions(bytes,view);return 'image/jpeg';}
    if (bytes.byteLength>=12 && String.fromCharCode(...bytes.slice(0,4))==='RIFF' && String.fromCharCode(...bytes.slice(8,12))==='WEBP') {webpDimensions(bytes,view);return 'image/webp';}
    let text;
    try { text=new TextDecoder('utf-8',{fatal:true}).decode(bytes).replace(/^\uFEFF/u,'').trim(); } catch { throw new Error('Use a PNG, JPEG, GIF, WebP or safe SVG image.'); }
    if (/^(?:<\?xml[\s\S]*?\?>\s*)?(?:<!--[\s\S]*?-->\s*)*(?:<svg\b|<!DOCTYPE)/iu.test(text)) {validateSVG(text);return 'image/svg+xml';}
    throw new Error('Use a PNG, JPEG, GIF, WebP or safe SVG image.');
  }
  function normalize(bytes, signal) {
    check(signal);
    const mime = sniff(bytes);
    if (!window.URL.createObjectURL) throw new Error('Image decoding is unavailable here.');
    const url = window.URL.createObjectURL(new window.Blob([bytes],{type:mime})), image = new window.Image();
    return new Promise((resolve,reject) => {
      const cleanup = () => {signal.removeEventListener('abort',cancel);image.onload=image.onerror=null;image.src='';window.URL.revokeObjectURL(url);};
      const fail = error => {cleanup();reject(error);};
      const cancel = () => fail(signal.reason || abortError());
      signal.addEventListener('abort',cancel,{once:true});
      image.onerror = () => fail(new Error('Could not decode this image.'));
      image.onload = () => {
        try {
          check(signal);dimensions(image.naturalWidth,image.naturalHeight);
          const canvas=window.document.createElement('canvas');canvas.width=canvas.height=32;
          const context=canvas.getContext('2d');if(!context)throw new Error('Image decoding is unavailable here.');
          context.clearRect(0,0,32,32);
          const scale=Math.min(32/image.naturalWidth,32/image.naturalHeight), width=image.naturalWidth*scale, height=image.naturalHeight*scale;
          context.drawImage(image,(32-width)/2,(32-height)/2,width,height);
          const data=canvas.toDataURL('image/png');
          if(!normalizedPNG(data,window))throw new Error('Could not create a small PNG icon.');
          cleanup();resolve({kind:'image',data});
        } catch (error) {fail(error);}
      };
      try {image.src=url;} catch {fail(new Error('Could not decode this image.'));}
    });
  }

  return Object.freeze({
    catalog:() => catalog.entries,
    resolve,
    importFile:(file,signal) => bounded(async inner => normalize(await readBlob(file,inner),inner),signal),
    importURL:(url,signal) => bounded(async inner => normalize(await readURL(url,inner),inner),signal),
    importPaste:(value,signal) => bounded(async inner => {
      if (value && typeof value === 'object' && typeof value.size === 'number') return normalize(await readBlob(value,inner),inner);
      if (typeof value !== 'string') throw new Error('Paste an image or a short Unicode symbol.');
      const text=value.trim();
      if (/^data:/iu.test(text)) return normalize(pasteBytes(text),inner);
      if (/^[a-z][a-z0-9+.-]*:\/\//iu.test(text)) return normalize(await readURL(text,inner),inner);
      return textIcon(text,window);
    },signal),
  });
}
