import {safeUrl} from './providers/http.mjs';
import {createPopupResizer} from './resize.mjs';
import {createPopupPositioner} from './position.mjs';
import {normalizeTextSize} from './settings.mjs';
const hosts=['en.wiktionary.org','he.wiktionary.org','dictionaryapi.dev','www.merriam-webster.com','creativecommons.org','lexicala.com','hebrew-academy.org.il','milog.co.il','www.milog.co.il'];
const wordKey=value=>String(value||'').normalize('NFC').trim().toLocaleLowerCase('en');
const displayWord=(value,language)=>language==='en'?String(value||'').toLocaleLowerCase('en').replace(/(^|[\s-])(\p{L})/gu,(_m,space,letter)=>space+letter.toLocaleUpperCase('en')):String(value||'');
const messages={empty:'Enter an English or Hebrew word.',unsupported:'Enter an English or Hebrew word.','too-long':'Enter a word or short phrase (up to 100 characters).',loading:'Looking up…','no-result':'No definition found. Try a matching word below the search field.','missing-key':'Add your dictionary API key in the mod’s Configure settings.','credential-unavailable':'Credential storage is unavailable or locked. Unlock it and try again.','unauthorized':'The dictionary rejected the API key. Check or replace it in Configure.','access-denied':'Access was denied. Check that your key has an active subscription to this dictionary.','rate-limit':'This dictionary’s request limit has been reached.',timeout:'The dictionary took too long to respond. Press Enter to retry, or choose another dictionary.',unavailable:'The dictionary is currently unavailable. Press Enter to retry, or choose another.'};
export function createPopup(window,callbacks){
  const {document}=window;
  const el=(tag,value)=>{const n=document.createElementNS('http://www.w3.org/1999/xhtml',tag);if(value!==undefined)n.textContent=value;return n;};
  const panel=document.createXULElement('panel');panel.id='define-word-panel';panel.setAttribute('type','arrow');panel.setAttribute('animate','false');panel.setAttribute('role','dialog');panel.setAttribute('aria-label','Word definition');panel.setAttribute('orient','vertical');panel.setAttribute('norestorefocus','true');
  const box=el('div');box.className='dw-card';
  const bar=el('div');bar.className='dw-bar';bar.tabIndex=0;bar.setAttribute('aria-label','Move definition popup');bar.title='Drag to move. When the header is focused, arrow keys move the popup.';const title=el('strong','Define'),closeButton=el('button','×');closeButton.type='button';closeButton.setAttribute('aria-label','Close definition');
  const provider=el('select');provider.setAttribute('aria-label','Dictionary');provider.title='Dictionary for the language you type';bar.append(title,provider,closeButton);
  const search=el('form');search.className='dw-search';const query=el('input');query.type='text';query.maxLength=100;query.dir='auto';query.autocomplete='off';query.spellcheck=false;query.placeholder='Search English or Hebrew';query.setAttribute('aria-label','Word to define in English or Hebrew');query.setAttribute('role','combobox');query.setAttribute('aria-autocomplete','list');query.setAttribute('aria-controls','dw-matches');query.setAttribute('aria-expanded','false');
  const submit=el('button','Search');submit.type='submit';search.append(query,submit);
  const matches=el('div');matches.className='dw-matches';matches.hidden=true;const matchLabel=el('p'),list=el('ul');list.id='dw-matches';list.setAttribute('role','listbox');list.setAttribute('aria-label','Matching dictionary words');matches.append(matchLabel,list);
  const result=el('div');result.dataset.result='';result.setAttribute('aria-live','polite');const word=el('h2'),headword=el('p'),status=el('p'),senses=el('ol');headword.dataset.headword='';result.append(word,headword,status,senses);
  const footer=el('div');footer.className='dw-footer';const attribution=el('div'),source=el('button','View dictionary entry');source.type='button';source.dataset.source='';source.hidden=true;footer.append(attribution,source);
  const shell=el('div');shell.className='dw-shell';
  const handles=['se','s','e','n','w','nw','ne','sw'].map(edge=>{const n=el('button');n.type='button';n.dataset.resizeEdge=edge;n.className='dw-resize-edge';n.tabIndex=edge==='se'?0:-1;n.setAttribute('aria-label','Resize definition popup');n.title='Drag any edge or corner to resize. Arrow keys resize; Shift makes larger steps. Home or double-click resets.';return n;});
  const resizeHandle=handles[0];resizeHandle.dataset.resize='';
  box.append(search,matches,result,footer);shell.append(bar,box,...handles);panel.append(shell);(document.getElementById('mainPopupSet')||document.documentElement).append(panel);
  let active=false,origin,originBrowser,sourceUrl,selected=-1,candidates=[],queryText='';
  const positioner=createPopupPositioner(window,{panel,shell,header:bar,isOpen:()=>active});
  const resizer=createPopupResizer(window,{panel,shell,handle:resizeHandle,handles,isOpen:()=>active,readSize:callbacks.readSize,onSizeChange:callbacks.onSizeChange,onPositionChange:positioner.setPosition});
  function clearMatches(){matches.hidden=true;list.replaceChildren();candidates=[];selected=-1;query.setAttribute('aria-expanded','false');query.removeAttribute('aria-activedescendant');}
  // Display casing is presentation only: "may" and "May" can name different
  // dictionary entries. Real input edits replace the underlying query text.
  function setQuery(value,language){queryText=String(value||'');query.value=displayWord(queryText,language);}
  function choose(word){setQuery(word,/\p{Script=Hebrew}/u.test(word)?'he':'en');clearMatches();callbacks.onSearch?.(word);query.focus();}
  function setTextSize(size=14){shell.style.setProperty('--dw-text-size',`${normalizeTextSize(size)}px`);}
  function chooseProviders(term,providerId,providers){provider.replaceChildren();for(const p of providers){const option=el('option',p.label+(p.keyRequired?' · API key':''));option.value=p.id;provider.append(option);}provider.value=providerId;provider.disabled=!providers.length;}
  function clearResult(){headword.textContent='';headword.hidden=true;senses.replaceChildren();attribution.replaceChildren();sourceUrl=null;source.hidden=true;}
  function close({restoreFocus=false}={}){resizer.stop();positioner.stop();if(!active)return;active=false;panel.hidePopup();if(restoreFocus&&originBrowser===window.gBrowser.selectedBrowser&&origin?.isConnected)origin.focus();}
  function link(value,label){const url=safeUrl(value,hosts);const a=el('button',label);a.type='button';a.className='dw-source-link';a.disabled=!url;if(url)a.addEventListener('click',()=>window.openTrustedLinkIn(url,'tab'));return a;}
  closeButton.addEventListener('click',()=>callbacks.onClose({restoreFocus:true}));
  source.addEventListener('click',()=>{if(sourceUrl)window.openTrustedLinkIn(sourceUrl,'tab');});
  provider.addEventListener('change',()=>callbacks.onProviderChange?.(provider.value,queryText));
  query.addEventListener('input',()=>{queryText=query.value;clearMatches();callbacks.onQueryInput?.(queryText);});
  search.addEventListener('submit',event=>{event.preventDefault();clearMatches();callbacks.onSearch?.(queryText);});
  query.addEventListener('keydown',event=>{
    if((event.key==='ArrowDown'||event.key==='ArrowUp')&&candidates.length){event.preventDefault();selected=selected<0?(event.key==='ArrowDown'?0:candidates.length-1):(selected+(event.key==='ArrowDown'?1:-1)+candidates.length)%candidates.length;for(const [index,node] of [...list.children].entries())node.setAttribute('aria-selected',String(index===selected));query.setAttribute('aria-activedescendant',list.children[selected].id);list.children[selected].scrollIntoView?.({block:'nearest'});}
    else if(event.key==='Enter'&&selected>=0){event.preventDefault();choose(candidates[selected].word);}
    else if(event.key==='Escape'&&!matches.hidden){event.preventDefault();event.stopPropagation();clearMatches();}
  });
  panel.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();callbacks.onClose({restoreFocus:true});}});
  panel.addEventListener('popuphidden',event=>{if(event.target===panel&&active){resizer.stop();positioner.stop();active=false;callbacks.onClose({restoreFocus:false});}});
  return {
    show(anchor){if(active)return;if(!panel.contains(document.activeElement)){origin=document.activeElement;originBrowser=window.gBrowser.selectedBrowser;}resizer.prepare(anchor);active=true;positioner.open(anchor);query.focus();query.select();},
    setTextSize,
    editing({term,providerId,providers}){clearResult();word.textContent='';status.textContent=term.status?messages[term.status]:'Press Enter to look up this word, or choose a suggestion.';status.dir='ltr';chooseProviders(term,providerId,providers);},
    renderSuggestions({outcome,label}){clearMatches();if(outcome.status==='unsupported-suggestions')return;matches.hidden=false;matchLabel.textContent=outcome.status==='ok'?label:outcome.status==='timeout'?'Suggestions timed out. Press Enter to retry.':outcome.status==='missing-key'?'Add an API key in Configure to use this dictionary.':'Suggestions unavailable. You can still press Enter to look up a word.';
      if(outcome.status!=='ok')return;const seen=new Set();candidates=(outcome.suggestions||[]).filter(item=>{const key=wordKey(item.word);if(!key||seen.has(key))return false;seen.add(key);return true;}).slice(0,8);if(!candidates.length){matchLabel.textContent='No matching words found.';return;}query.setAttribute('aria-expanded','true');
      for(const [index,item] of candidates.entries()){const li=el('li',displayWord(item.word,item.language));li.id=`dw-match-${index}`;li.setAttribute('role','option');li.setAttribute('aria-selected','false');li.dir=item.language==='he'?'rtl':'ltr';li.lang=item.language||'en';li.addEventListener('mousedown',event=>event.preventDefault());li.addEventListener('click',()=>choose(item.word));list.append(li);}
    },
    render({term,providerId,providers,outcome,textSize}){
      const original=String(term.original||'');if(outcome.status==='loading'||queryText!==original){setQuery(original,term.language);clearMatches();}
      setTextSize(textSize);chooseProviders(term,providerId,providers);
      result.dir=term.language==='he'?'rtl':'ltr';result.lang=term.language||'en';word.textContent=displayWord(term.original,term.language)||'Define';clearResult();
      status.textContent=messages[outcome.status]||'';status.dir='ltr';status.lang='en';
      if(outcome.status==='no-result'){
        const label=providers.find(p=>p.id===providerId)?.label||'This dictionary';
        status.textContent=term.language==='he'?`לא נמצא ערך עבור ״${term.original}״ ב${label}. נסו מילה מההצעות או חפשו את צורת הבסיס.`:`No entry for “${term.original}” in ${label}. Try a matching word or edit your search.`;
        if(providers.length>1)status.textContent+=term.language==='he'?' אפשר לבחור מילון אחר.':' Choose another dictionary above.';
        status.dir=term.language==='he'?'rtl':'ltr';status.lang=term.language||'en';
      }
      if(outcome.status==='ok'){
        const d=outcome.definition;result.dir=d.language==='he'?'rtl':'ltr';result.lang=d.language;
        if(d.headword&&wordKey(d.headword)!==wordKey(term.original)){headword.hidden=false;headword.textContent=(d.language==='he'?'ערך במילון: ':'Dictionary entry: ')+displayWord(d.headword,d.language);}
        status.textContent=outcome.normalizedRetry&&term.language==='he'?'נמצא ערך ללא ניקוד.':'';
        for(const sense of d.senses){const li=el('li');if(sense.partOfSpeech){const part=el('span',sense.partOfSpeech);part.className='dw-part';li.append(part);}li.append(el('p',sense.text));for(const example of sense.examples||[]){const quote=el('blockquote',example);li.append(quote);}senses.append(li);}
        if(d.attribution.brand==='merriam-webster'){
          const logo=el('img');logo.src='chrome://sine/content/define-word/assets/merriam-webster.png';logo.alt='Merriam-Webster';logo.width=logo.height=50;attribution.append(logo);
        }
        attribution.append(link(d.attribution.url,d.attribution.label));if(d.attribution.licenseLabel)attribution.append(link(d.attribution.licenseUrl,d.attribution.licenseLabel));
        sourceUrl=safeUrl(d.sourceUrl,hosts);source.hidden=!sourceUrl;
      }
    },close,destroy(){close();positioner.destroy();resizer.destroy();panel.remove();},
  };
}
