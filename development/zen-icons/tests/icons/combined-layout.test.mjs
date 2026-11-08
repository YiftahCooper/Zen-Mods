import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
const playwright=process.env.ZEN_ICONS_PLAYWRIGHT_MODULE;
const bzf=process.env.ZEN_ICONS_BZF_ROOT;
const css=await readFile(new URL('../../sine/zen-icons/chrome.css',import.meta.url),'utf8');
const gestures=await readFile(new URL('../../src/zen-icons-sine/icon-gestures.mjs',import.meta.url),'utf8');
const settings=await readFile(new URL('../../src/zen-icons-sine/settings.mjs',import.meta.url),'utf8');
const skip=playwright?false:'Set ZEN_ICONS_PLAYWRIGHT_MODULE for isolated headless layout';
async function page(run) {
  const browser=await createRequire(import.meta.url)(playwright).chromium.launch({headless:true});
  try{const p=await browser.newPage();await p.route('**/*',r=>r.abort());await run(p);}finally{await browser.close();}
}
test('neutral tab placeholders stay independent of Space colour while enabled previews follow it',{skip},()=>page(async p=>{
  await p.setContent('<img class="tab-icon-image" src="chrome://sine/content/zen-icons-local/blank-tab.svg"><div id="zen-icons-sine-root"><span class="zen-icons-native-tab-placeholder"></span></div>');
  await p.addStyleTag({content:css});
  for(const scheme of ['light','dark']) {
    const colours=[];
    for(const accent of ['#ff0000','#00ff00'])colours.push(await p.evaluate(({scheme,accent})=>{
      const root=document.documentElement;root.style.colorScheme=scheme;root.style.setProperty('--zen-primary-color',accent);
      root.setAttribute('zen-icons-neutral-tab-default','');
      return [...document.querySelectorAll('.tab-icon-image,.zen-icons-native-tab-placeholder')].map(n=>getComputedStyle(n).backgroundColor);
    },{scheme,accent}));
    assert.equal(colours[0][0],colours[0][1]);assert.deepEqual(colours[0],colours[1]);
  }
}));
test('Sine defaults refresh rendered controls without replacing a focused text draft',{skip},()=>page(async p=>{
  await p.setContent('<div id="zen-icons-tab-heading"><label class="separator-label">Tabs</label></div><div id="zen-icons-tab-show-emoji"><checkbox></checkbox></div><div id="zen-icons-tab-hidden-categories"><input value="draft"></div>');
  const result=await p.evaluate(async source=>{
    const url=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));const api=await import(url);URL.revokeObjectURL(url);
    const doc={documentURI:'about:preferences#sineMods',getElementById:id=>document.getElementById(id),get activeElement(){return document.activeElement;}};
    const input=document.querySelector('input');input.focus();
    api.syncIconSettingsDocument(doc,{getBoolPref:()=>false,getStringPref:()=>'animals'});
    const focused=input.value;input.blur();api.syncIconSettingsDocument(doc,{getBoolPref:()=>false,getStringPref:()=>'animals'});
    const checked=document.querySelector('checkbox').checked;
    api.syncIconSettingsDocument(doc,{getBoolPref:()=>true,getStringPref:()=>'animals'});
    // Sine applyCheckbox uses getAttribute truthiness, not hasAttribute.
    const nextSineClickEnables=!document.getElementById('zen-icons-tab-show-emoji').getAttribute('checked');
    return {focused,unfocused:input.value,checked,nextSineClickEnables,font:document.querySelector('label').style.fontSize};
  },settings);
  assert.deepEqual(result,{focused:'draft',unfocused:'animals',checked:false,nextSineClickEnables:false,font:'18px'});
}));

test('real DOM resolver distinguishes nested folders, tabs, both Space icons and competing controls',{skip},()=>page(async p=>{
  await p.setContent(`<zen-workspace id="space-a"><span class="zen-current-workspace-indicator-icon"><img id="header-icon"></span>
    <zen-folder id="folder-a"><div class="tab-group-folder-icon"><svg><path id="folder-icon"></path></svg></div>
      <tab id="tab-a"><span class="tab-reset-pin-button"><img id="reset-icon"></span><div class="tab-icon-stack"><img id="tab-icon" class="tab-icon-image"><button class="better-zen-folders-sticky-underline" id="sticky"></button></div>
      <button class="better-zen-folders-url-pin"><svg id="pin"></svg></button></tab></zen-folder></zen-workspace>
    <toolbarbutton zen-workspace-id="space-b"><img id="switcher-icon" class="zen-workspace-icon"></toolbarbutton>`);
  const result=await p.evaluate(async source=>{
    const url=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));const api=await import(url);URL.revokeObjectURL(url);
    return Object.fromEntries(['header-icon','folder-icon','tab-icon','reset-icon','sticky','pin','switcher-icon'].map(id=>{
      const target=api.resolveIconTarget(document.getElementById(id));return [id,target?{kind:target.kind,item:typeof target.item==='string'?target.item:target.item.id,reset:Boolean(target.reset)}:null];
    }));
  },gestures);
  assert.deepEqual(result,{'header-icon':{kind:'space',item:'space-a',reset:false},'folder-icon':{kind:'folder',item:'folder-a',reset:false},
    'tab-icon':{kind:'tab',item:'tab-a',reset:false},'reset-icon':{kind:'tab',item:'tab-a',reset:true},sticky:null,pin:null,'switcher-icon':{kind:'space',item:'space-b',reset:false}});
}));

if(bzf)for(const order of ['icons-first','folders-first'])for(const direction of ['ltr','rtl']) {
  test(`actual BZF pin presentation and Icons gestures keep separate targets (${order}, ${direction})`,{skip},()=>page(async p=>{
    const bzfSource=await readFile(path.join(bzf,'scripts/better-zen-folders.uc.mjs'),'utf8');
    const bzfCss=await readFile(path.join(bzf,'chrome.css'),'utf8');
    await p.setContent(`<div id="tabs" dir="${direction}"><zen-folder><tab id="t" class="tabbrowser-tab"><div class="tab-content"><div class="tab-icon-stack"><img class="tab-icon-image"><button class="better-zen-folders-sticky-underline">S</button></div><span class="tab-label-container">Page</span></div></tab></zen-folder></div>`);
    await p.addStyleTag({content:(order==='icons-first'?css+'\n'+bzfCss:bzfCss+'\n'+css)+'\nbody{font:14px sans-serif}.tab-content{display:flex;align-items:center;width:220px;height:36px}.tab-icon-stack{width:20px;height:20px;flex-shrink:0}.tab-icon-image{display:block;width:16px;height:16px}.tab-label-container{flex:1;min-width:0}'});
    await p.evaluate(async({bzfSource,gestures,order})=>{
      const load=async source=>{const url=URL.createObjectURL(new Blob([source],{type:'text/javascript'}));try{return await import(url);}finally{URL.revokeObjectURL(url);}};
      const bzf=await load(bzfSource),icons=await load(gestures);
      const tab=document.getElementById('t');tab.explicit=true;tab.linkedBrowser={currentURI:{spec:'about:blank'}};
      window.calls={open:0,unpin:0,sticky:0,close:0,reset:0};
      tab.addEventListener('dblclick',()=>calls.close++);
      tab.querySelector('.better-zen-folders-sticky-underline').addEventListener('click',()=>calls.sticky++);
      window.gBrowser={tabs:[tab],tabContainer:document.getElementById('tabs')};
      const adapters={classify:()=> 'regular-folder',getId:()=> 't',getLocation:()=>tab.parentElement,isConnected:n=>n.isConnected,
        captureBaseline:()=>1,ownsBaseline:()=>true,reportError:error=>{throw error;}};
      const store={read:n=>({status:'known',explicit:n.explicit})};
      const policy={adapters,blocked:()=>null,unpin:async n=>{calls.unpin++;n.explicit=false;return {ok:true};}};
      const pins=new bzf.FolderPinPresentation(window,{get:()=>0},store,policy);
      let disconnect;
      const startIcons=()=>{disconnect=icons.connectIconGestures({host:window,isEnabled:()=>true,openPicker:()=>calls.open++,resetTab:()=>calls.reset++});};
      if(order==='icons-first'){startIcons();pins.start();}else{pins.start();startIcons();}
      window.finish=()=>{disconnect();pins.destroy();};
    },{bzfSource,gestures,order});
    const boxes=await p.evaluate(()=>['.better-zen-folders-url-pin','.tab-icon-image','.better-zen-folders-sticky-underline'].map(s=>{const r=document.querySelector(s).getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom};}));
    for(const other of boxes.slice(1))assert.ok(boxes[0].right<=other.x||other.right<=boxes[0].x||boxes[0].bottom<=other.y||other.bottom<=boxes[0].y,'pin badge overlaps another target');
    await p.locator('.tab-icon-image').dblclick();
    assert.deepEqual(await p.evaluate(()=>calls),{open:1,unpin:0,sticky:0,close:0,reset:0});
    await p.locator('.better-zen-folders-url-pin').click();
    assert.deepEqual(await p.evaluate(()=>calls),{open:1,unpin:1,sticky:0,close:0,reset:0});
    await p.evaluate(()=>finish());
  }));
}
