import {safeUrl} from './providers/http.mjs';
const hosts=['en.wiktionary.org','he.wiktionary.org','dictionaryapi.dev','www.merriam-webster.com','creativecommons.org'];
const messages={empty:'Select a word on the page first.',unsupported:'Choose English or Hebrew to look up this selection.','too-long':'Select a word or short phrase (up to 100 characters).',loading:'Looking up…','no-result':'No definition found in this dictionary. Try another dictionary.','missing-key':'Add your dictionary API key in Settings.','credential-unavailable':'Credential storage is unavailable or locked. Unlock it and try again.','rate-limit':'This dictionary’s request limit has been reached.',timeout:'The dictionary took too long to respond. Try again.',unavailable:'The dictionary is currently unavailable. Try again or choose another.'};
export function createPopup(window,callbacks){
  const {document}=window;
  const el=(tag,value)=>{const n=document.createElementNS('http://www.w3.org/1999/xhtml',tag);if(value!==undefined)n.textContent=value;return n;};
  const panel=document.createXULElement('panel');panel.id='define-word-panel';panel.setAttribute('type','arrow');panel.setAttribute('role','dialog');panel.setAttribute('aria-label','Word definition');panel.setAttribute('orient','vertical');
  const box=el('div');box.className='dw-card';
  const bar=el('div');bar.className='dw-bar';const title=el('strong','Define'),closeButton=el('button','Close');closeButton.type='button';bar.append(title,closeButton);
  const choices=el('div');choices.className='dw-choices';
  const langLabel=el('label','Language'),language=el('select');language.setAttribute('aria-label','Definition language');
  for(const [value,label] of [['','Choose language'],['en','English'],['he','עברית']]){const o=el('option',label);o.value=value;language.append(o);}langLabel.append(language);
  const providerLabel=el('label','Dictionary'),provider=el('select');provider.setAttribute('aria-label','Dictionary');providerLabel.append(provider);choices.append(langLabel,providerLabel);
  const result=el('div');result.dataset.result='';result.setAttribute('aria-live','polite');const word=el('h2'),headword=el('p'),status=el('p'),senses=el('ol');headword.dataset.headword='';result.append(word,headword,status,senses);
  const footer=el('div');footer.className='dw-footer';const attribution=el('div'),source=el('button','Open source'),settings=el('button','Settings');source.type=settings.type='button';source.dataset.source='';source.hidden=true;footer.append(attribution,source,settings);
  box.append(bar,choices,result,footer);panel.append(box);(document.getElementById('mainPopupSet')||document.documentElement).append(panel);
  let active=false,origin,originBrowser,sourceUrl;
  function close({restoreFocus=false}={}){if(!active)return;active=false;panel.hidePopup();if(restoreFocus&&originBrowser===window.gBrowser.selectedBrowser&&origin?.isConnected)origin.focus();}
  function link(value,label){const url=safeUrl(value,hosts);const a=el('button',label);a.type='button';a.className='dw-source-link';a.disabled=!url;if(url)a.addEventListener('click',()=>window.openTrustedLinkIn(url,'tab'));return a;}
  closeButton.addEventListener('click',()=>callbacks.onClose({restoreFocus:true}));settings.addEventListener('click',callbacks.onSettings);
  source.addEventListener('click',()=>{if(sourceUrl)window.openTrustedLinkIn(sourceUrl,'tab');});
  language.addEventListener('change',()=>{if(language.value)callbacks.onLanguageChange(language.value);});provider.addEventListener('change',()=>callbacks.onProviderChange(provider.value));
  panel.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();callbacks.onClose({restoreFocus:true});}});
  panel.addEventListener('popuphidden',event=>{if(event.target===panel&&active){active=false;callbacks.onClose({restoreFocus:false});}});
  return {
    show(){if(active)return;origin=document.activeElement;originBrowser=window.gBrowser.selectedBrowser;active=true;panel.openPopup(originBrowser,'overlap',16,16,false,false);closeButton.focus();},
    render({term,providerId,providers,outcome}){
      language.value=term.language||'';provider.replaceChildren();for(const p of providers){const option=el('option',p.label+(p.keyRequired?' · API key':''));option.value=p.id;provider.append(option);}provider.value=providerId;provider.disabled=!providers.length;
      result.dir=term.language==='he'?'rtl':'ltr';result.lang=term.language||'en';word.textContent=term.original||'Define';headword.textContent='';headword.hidden=true;senses.replaceChildren();attribution.replaceChildren();sourceUrl=null;source.hidden=true;
      status.textContent=messages[outcome.status]||'';status.dir='ltr';status.lang='en';
      if(outcome.status==='no-result'){
        const label=providers.find(p=>p.id===providerId)?.label||'This dictionary';
        status.textContent=term.language==='he'?`לא נמצא ערך עבור ״${term.original}״ ב${label}. ייתכן שהמילה או צורת הנטייה חסרה במילון.`:`No entry for “${term.original}” in ${label}.`;
        if(providers.length>1)status.textContent+=term.language==='he'?' אפשר לבחור מילון אחר.':' Choose another dictionary above.';
        status.dir=term.language==='he'?'rtl':'ltr';status.lang=term.language||'en';
      }
      if(outcome.status==='ok'){
        const d=outcome.definition;result.dir=d.language==='he'?'rtl':'ltr';result.lang=d.language;
        if(d.headword&&d.headword!==term.original){headword.hidden=false;headword.textContent=(d.language==='he'?'ערך במילון: ':'Dictionary entry: ')+d.headword;}
        status.textContent=outcome.normalizedRetry?'Result found without niqqud.':'';
        for(const sense of d.senses){const li=el('li');if(sense.partOfSpeech){const part=el('span',sense.partOfSpeech);part.className='dw-part';li.append(part);}li.append(el('p',sense.text));for(const example of sense.examples||[]){const quote=el('blockquote',example);li.append(quote);}senses.append(li);}
        if(d.attribution.brand==='merriam-webster'){
          const logo=el('img');logo.src='chrome://sine/content/define-word/assets/merriam-webster.png';logo.alt='Merriam-Webster';logo.width=logo.height=50;attribution.append(logo);
        }
        attribution.append(link(d.attribution.url,d.attribution.label));if(d.attribution.licenseLabel)attribution.append(link(d.attribution.licenseUrl,d.attribution.licenseLabel));
        sourceUrl=safeUrl(d.sourceUrl,hosts);source.hidden=!sourceUrl;
      }
    },close,destroy(){close();panel.remove();},
  };
}
