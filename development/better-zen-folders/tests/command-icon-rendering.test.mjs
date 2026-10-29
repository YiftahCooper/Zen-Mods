import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
const modulePath=process.env.BZF_PLAYWRIGHT_MODULE;
const skip=modulePath?false:'set BZF_PLAYWRIGHT_MODULE for isolated Chromium CSS tests';
const source=await readFile(new URL('../scripts/better-zen-folders.uc.mjs',import.meta.url),'utf8');
const css=await readFile(new URL('../chrome.css',import.meta.url),'utf8');
const cmi=JSON.parse(await readFile(new URL('./fixtures/cmi-command-icon-contract.json',import.meta.url),'utf8'));
let browser;
before(async()=>{if(modulePath) browser=await createRequire(import.meta.url)(modulePath).chromium.launch({headless:true});});
after(async()=>{await browser?.close();});

test('standalone Off preserves external native-slot CSS and checkbox state', {skip}, async()=>{
  const page=await browser.newPage();
  try {
    await page.setContent('<menuitem id="better-zen-folders-folder-colour"><img class="menu-icon"></menuitem><menuitem id="better-zen-folders-sticky-folder" type="checkbox" checked="true"><img class="menu-icon"></menuitem>');
    await page.addStyleTag({content:css});
    await page.addStyleTag({content:'.menu-icon {display:block;width:16px;height:16px;content:url("https://fixture.invalid/external.svg");}'});
    const result=await page.evaluate(async source=>{
      const api=await import(URL.createObjectURL(new Blob([source],{type:'text/javascript'})));
      const items=[...document.querySelectorAll('menuitem')];
      const read=()=>items.map(item=>({display:getComputedStyle(item.firstChild).display,
        content:getComputedStyle(item.firstChild).content,checked:item.getAttribute('checked')}));
      const before=read();
      for(const item of items) for(const mode of ['mod','compatibility','off']) api.setBzfCommandIcon(item,'bzf.svg',mode);
      return {before,after:read()};
    },source);
    assert.deepEqual(result.after,result.before);assert.equal(result.after[0].display,'block');
    assert.equal(result.after[1].checked,'true');
  } finally {await page.close();}
});

// Breaks caught: dual native/background painting, lost CMI spacing or icon,
// persistent Off suppression, and mode refresh mistaking our paint for external.
for(const pack of ['fluent','zen']) for(const bzfFirst of [false,true]) {
  test(`${pack}, BZF CSS ${bzfFirst?'first':'last'}: one paint channel, CMI spacing and external icons survive`,{skip},async()=>{
    const page=await browser.newPage();
    try {
      await page.setContent(`<div><menupopup id="menu"><menuitem id="better-zen-folders-new-tab-menu" class="sine-moved"><img class="menu-icon"><label>New Tab</label></menuitem><menuitem id="native-command"><label>Native</label></menuitem></menupopup></div>`);
      await page.addStyleTag({content:`:root {--fp-contextmenu-menuitem-padding-inline:11px;--zen-contextmenu-menuitem-padding-inline:7px;--fp-contextmenu-menuicon-margin-inline:13px;--menuitem-padding-extra:2px;}
        menuitem {display:flex;padding:3px;} .menu-icon {display:none;width:16px;height:16px;}
        menuitem:where(.menuitem-iconic,[image]) > .menu-icon {display:block;}`});
      const upstream=cmi.packs[pack].css+cmi.spacing;
      for(const content of bzfFirst?[css,upstream]:[upstream,css]) await page.addStyleTag({content});
      const result=await page.evaluate(async({source,pack})=>{
        const api=await import(URL.createObjectURL(new Blob([source],{type:'text/javascript'})));
        const item=document.getElementById('better-zen-folders-new-tab-menu');
        const slot=item.querySelector('img');
        const read=()=>({image:item.getAttribute('image'),background:getComputedStyle(item).backgroundImage,
          padding:getComputedStyle(item).paddingInlineStart,position:getComputedStyle(item).backgroundPositionX,
          slot:getComputedStyle(slot).display});
        const states=[];
        for(const mode of ['mod','mod','compatibility','compatibility','off']) {
          api.setBzfCommandIcon(item,'https://fixture.invalid/bzf.svg',mode);states.push(read());
        }
        api.setBzfCommandIcon(item,'https://fixture.invalid/bzf.svg','compatibility');
        const external=document.createElement('style');
        external.textContent='#better-zen-folders-new-tab-menu {--menu-image:url("https://fixture.invalid/cmi.svg");}';
        document.head.append(external);
        const cmiOwn=read();
        api.setBzfCommandIcon(item,null,'off');const offExternal=read();
        item.setAttribute('image','https://fixture.invalid/external.svg');
        api.setBzfCommandIcon(item,null,'off');const offNative=read();
        return {states,cmiOwn,offExternal,offNative,native:document.getElementById('native-command').getAttribute('image')};
      },{source,pack});
      for(const state of result.states.slice(0,2)) {assert.match(state.image,/bzf.svg/);assert.equal(state.background,'none');assert.equal(state.slot,'block');}
      for(const state of result.states.slice(2,4)) {assert.equal(state.image,null);assert.match(state.background,/bzf.svg/);assert.equal(state.slot,'none');assert.equal(state.padding,'26px');assert.equal(state.position,pack==='fluent'?'11px':'7px');}
      assert.equal(result.states[4].background,'none');
      assert.match(result.cmiOwn.background,/cmi.svg/);assert.match(result.offExternal.background,/cmi.svg/);
      assert.match(result.offNative.image,/external.svg/);assert.equal(result.offNative.slot,'block');assert.equal(result.native,null);
    } finally {await page.close();}
  });
}
