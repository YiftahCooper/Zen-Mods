import {freeDictionary} from './free-dictionary.mjs';
import {wiktionary} from './wiktionary.mjs';
import {merriamWebster} from './merriam-webster.mjs';
export const providers=new Map([freeDictionary,wiktionary('en'),wiktionary('he'),merriamWebster('collegiate'),merriamWebster('learners')].map(p=>[p.id,p]));
