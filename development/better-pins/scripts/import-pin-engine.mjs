// Maintainer-only extraction. Build never reads or changes another mod.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
const source=readFileSync(new URL('../../Better Zen Folders Sine Mod/.worktrees/better-zen-folders-implementation/scripts/better-zen-folders.uc.mjs',import.meta.url),'utf8');
const cut=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
let text=cut('export const FOLDER_PIN_INTENT_KEY','/** Consent is independent');
// Broaden only the browser adapter's supported scope; native structural flags
// remain intact. Pure policy/lifecycle transactions retain their tested guards.
text=text.replace('if (!folder) return "root";','if (!folder) return "regular-folder";');
text=text.replace('return tab.pinned && isRegularFolder(folder) ? "regular-folder" : "unsupported";','return isRegularFolder(folder) ? "regular-folder" : "unsupported";');
text=text.replaceAll('source?.ownerDocument?.defaultView?.__betterZenFoldersFolderPins','source?.ownerDocument?.defaultView?.__betterPinsController');
// Read creation defaults from the actual destination, not a global folder flag.
text=text.replace('const pinNew = this.preferences?.get?.("pinNewFolderTabUrls") === true;','const pinNew = this.adapters.creationPinDefault(tab);');
text=text.replaceAll('"Better Zen Folders URL pins"','"Better Pins URL pins"');
const helpers=[
  'const STICKY_TAB_KEY="betterZenFolders.stickyTab.v1";\nconst RESTORE_KEY="betterZenFolders.restore.v1";\n',
  cut('function browserFolderAncestors(folder)', 'function browserContextFolder'),
  cut('function browserSynchronizedWindows(host)', 'function browserFolderIdOccupied'),
  cut('export function isRegularFolder(folder)', 'const DRAG_DIAGNOSTIC_TYPES'),
  'const isPlainObject=v=>!!v&&typeof v==="object"&&!Array.isArray(v)&&(Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null);\nconst hasOnlyFields=(v,keys)=>Object.keys(v).every(k=>keys.includes(k));\nconst isNonEmptyString=v=>typeof v==="string"&&v.length>0;\n',
  cut('export function isValidUrlPinRecovery(value)', 'function applyRestoredUrlPin'),
];
mkdirSync(new URL('../src/',import.meta.url),{recursive:true});
writeFileSync(new URL('../src/pin-engine.mjs',import.meta.url),`// Attributed BZF transaction component. See docs/pin-engine-provenance.json.\n${helpers.join('\n')}\n${text}`);
writeFileSync(new URL('../docs/pin-engine-provenance.json',import.meta.url),JSON.stringify({source:'Better Zen Folders/scripts/better-zen-folders.uc.mjs',sha256:createHash('sha256').update(source).digest('hex'),extracted:['intent store','unpin grace','lifecycle/origin/recovery','policy','browser adapters','native hooks','validation helpers'],adaptations:['ordinary root scope broadened','adoption discovers Better Pins owner','creation defaults use destination','diagnostic name'],sourceEdited:false},null,2)+'\n');
