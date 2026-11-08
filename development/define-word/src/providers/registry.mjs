import {freeDictionary} from './free-dictionary.mjs';
import {wiktionary} from './wiktionary.mjs';
import {merriamWebster} from './merriam-webster.mjs';
import {lexicalaHebrew} from './lexicala.mjs';
import {academyHebrew} from './academy.mjs';
import {milogHebrew} from './milog.mjs';
export const providers=new Map([freeDictionary,wiktionary('en'),wiktionary('he'),merriamWebster('collegiate'),merriamWebster('learners'),lexicalaHebrew,academyHebrew,milogHebrew].map(p=>[p.id,p]));
