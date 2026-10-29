import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';

const modulePath = process.env.BZF_PLAYWRIGHT_MODULE;
const skip = modulePath ? false : 'requires isolated Chromium';
const source = await readFile(new URL('../scripts/better-zen-folders.uc.mjs', import.meta.url), 'utf8');
const preferences = JSON.parse(await readFile(new URL('../preferences.json', import.meta.url), 'utf8'));
let browser;
before(async () => { if (modulePath) browser = await createRequire(import.meta.url)(modulePath).chromium.launch({headless:true}); });
after(async () => { await browser?.close(); });

// Break caught: the selected label changes Sine's content-sized dialog width.
// Replays Sine 2.3.4.1c dialog/row rules and the installed native menulist's
// label-box, semibold label, margins, and dropmarker in an HTML shadow host.
// Chromium cannot instantiate Gecko's XUL control; no live XUL proof is claimed.
test('command selector has stable width before selection, wraps at narrow widths and survives Sine rebuilds', {skip}, async () => {
  const page = await browser.newPage();
  try {
    await page.route('**/*', route => route.abort());
    const pref = preferences.find(item => item.property === 'better-zen-folders.command-icon-mode');
    await page.setContent(`<style>
      body {margin:0;font:14px Arial} dialog {width:max-content;min-width:60vw;max-width:96vw;box-sizing:border-box;padding:20px;overflow-x:hidden}
      .sineItemPreferenceDialogContent {width:max-content;min-width:100%;max-width:calc(96vw - 40px)}
      hbox {display:flex;align-items:center;justify-content:space-between;width:100%;padding:0 5px}
      .sineItemPreferenceLabel {margin-right:10px;white-space:nowrap}
      menulist {display:flex;align-items:center;height:34.833px;padding:8px 15px;border:1px solid gray;margin:4px 2px}
    </style><dialog><div class="sineItemPreferenceDialogContent"></div></dialog>
    <div id="unrelated"><menulist style="width:9em">Other setting</menulist></div>`);
    await page.evaluate(async ({source,pref}) => {
      const api = await import(URL.createObjectURL(new Blob([source], {type:'text/javascript'})));
      window.writes = 0;
      window.rebuild = () => {
        const row = document.createElement('hbox'); row.id = 'better-zen-folders-command-icon-mode';
        const help = document.createElement('label'); help.className = 'sineItemPreferenceLabel';
        help.textContent = pref.label;
        const menu = document.createElement('menulist');
        const shell = document.createElement('div'); shell.style.cssText = 'display:flex;flex:1;min-width:0';
        const shadow = shell.attachShadow({mode:'open'});
        shadow.innerHTML = `<style>:host{font:inherit} #label-box{display:flex;flex:1;min-width:0;font-weight:600} label{margin:0 4px;overflow:hidden;white-space:nowrap} #highlightable-label{display:none} .arrow{width:12px;flex:none}</style><div id="label-box"><label id="label"></label><label id="highlightable-label"></label></div><span class="arrow">⌄</span>`;
        menu.append(shell); row.append(help, menu);
        menu.addEventListener('command', () => window.writes++);
        document.querySelector('.sineItemPreferenceDialogContent').replaceChildren(row);
        window.choose = text => {menu.setAttribute('label',text);shadow.getElementById('label').textContent=text;};
        window.choose(pref.options[0].label);
      };
      window.rebuild();
      window.stop = api.installNumericSettingsUi(window, {get:()=>undefined});
      document.querySelector('dialog').showModal();
    }, {source,pref});
    for (const width of [1200, 520, 320, 1200]) {
      await page.setViewportSize({width,height:800});
      const widths = [];
      for (const option of pref.options) {
        widths.push(await page.evaluate(label => {
          window.choose(label);
          const dialog = document.querySelector('dialog'), row = document.getElementById('better-zen-folders-command-icon-mode');
          const menu = row.querySelector('menulist');
          return {dialog:dialog.getBoundingClientRect().width, control:menu.getBoundingClientRect().width,
            overflow:dialog.scrollWidth > dialog.clientWidth + 1,
            scrollWidth:dialog.scrollWidth,clientWidth:dialog.clientWidth,rowWidth:row.getBoundingClientRect().width,
            fits:menu.getBoundingClientRect().right <= dialog.getBoundingClientRect().right,
            textFits:menu.firstChild.shadowRoot.getElementById('label').scrollWidth <= menu.firstChild.shadowRoot.getElementById('label').clientWidth};
        }, option.label));
      }
      assert.equal(new Set(widths.map(item => item.control)).size,1,`${width}: selected label must not resize control`);
      assert.equal(new Set(widths.map(item => item.dialog)).size,1,`${width}: selected label must not resize dialog`);
      assert.ok(widths.every(item => !item.overflow && item.fits),`${width}: no clipped horizontal overflow ${JSON.stringify(widths)}`);
      if(width===1200) assert.ok(widths.every(item=>item.textFits),'24em accommodates all three labels');
      await page.evaluate(()=>window.rebuild());
    }
    const cleanup = await page.evaluate(() => {
      const unrelated = document.querySelector('#unrelated menulist').style.cssText;
      const row = document.getElementById('better-zen-folders-command-icon-mode');
      const before = getComputedStyle(row).flexWrap;
      window.stop();window.stop();
      return {before,after:getComputedStyle(row).flexWrap,unrelated,writes:window.writes};
    });
    assert.equal(cleanup.before,'wrap');assert.equal(cleanup.after,'nowrap');
    assert.equal(cleanup.unrelated,'width: 9em;');assert.equal(cleanup.writes,0);
  } finally {await page.close();}
});

// Breaks caught: a native lazy render erases a prematurely appended decoration,
// Off leaves a glyph behind, or a decoration commandeers the checkbox image.
test('Sticky decoration survives native lazy rendering and all icon modes without changing native state', {skip}, async () => {
  const page = await browser.newPage();
  try {
    const result = await page.evaluate(async source => {
      const api = await import(URL.createObjectURL(new Blob([source], {type:'text/javascript'})));
      if (!api.setStickyMenuDecoration) return {missing:true};
      const command = document.createElement('menuitem');command.id='better-zen-folders-sticky-tab';
      command.setAttribute('type','checkbox');command.setAttribute('checked','true');
      command.setAttribute('autocheck','false');
      command.render = () => {if(command.renderedOnce)return;command.renderedOnce=true;
        command.innerHTML='<img class="menu-icon"><label class="menu-text">Sticky Tab</label><label class="menu-highlightable-text"></label><label class="menu-accel"></label>';};
      document.body.append(command);
      const states=[];
      for(const mode of ['mod','compatibility','off','mod','mod']) {
        api.setStickyMenuDecoration(command,mode,window);
        const mark=command.querySelector('.better-zen-folders-sticky-menu-mark');
        states.push({mode,count:command.querySelectorAll('.better-zen-folders-sticky-menu-mark').length,
          next:mark?.nextElementSibling?.className, previous:mark?.previousElementSibling?.className,
          aria:mark?.getAttribute('aria-hidden'),focus:mark?.getAttribute('focusable'),
          image:command.getAttribute('image'),checked:command.getAttribute('checked'),
          genericMode:command.getAttribute('data-better-zen-folders-command-icon-mode')});
      }
      const other=document.createElement('menuitem');other.id='context_zenFolderNewSubfolder';
      api.setStickyMenuDecoration(other,'mod',window);
      return {states,other:other.outerHTML};
    },source);
    assert.equal(result.missing,undefined,'production decoration helper exists');
    for(const state of result.states) {
      assert.equal(state.count,state.mode==='off'?0:1);
      assert.equal(state.checked,'true');assert.equal(state.image,null);assert.equal(state.genericMode,null);
      if(state.count) {
        assert.equal(state.next,'menu-text');assert.equal(state.previous,'menu-icon');
        assert.equal(state.aria,'true');assert.equal(state.focus,'false');
      }
    }
    assert.equal(result.other,'<menuitem id="context_zenFolderNewSubfolder"></menuitem>');
  } finally {await page.close();}
});

test('live command-icon-mode updates both existing Sticky commands and teardown releases its subscription', {skip}, async () => {
  const page = await browser.newPage();
  try {
    const result = await page.evaluate(async source => {
      const api = await import(URL.createObjectURL(new Blob([source], {type:'text/javascript'})));
      document.body.innerHTML='<menupopup id="tabContextMenu"></menupopup><menupopup id="zenFolderActions"></menupopup><div id="tabs"><zen-folder id="folder"><tab id="tab"></tab></zen-folder></div>';
      document.createXULElement = name => {
        const item=document.createElement(name);
        item.render=()=>{if(item.renderedOnce)return;item.renderedOnce=true;
          item.innerHTML='<img class="menu-icon"><label class="menu-text"></label><label class="menu-highlightable-text"></label><label class="menu-accel"></label>';};
        return item;
      };
      const folder=document.getElementById('folder'), tab=document.getElementById('tab');
      folder.isZenFolder=true;tab.group=folder;
      window.gBrowser={tabContainer:document.getElementById('tabs'),isTab:node=>node===tab};
      window.TabContextMenu={contextTab:tab};
      let writes=0;
      window.SessionStore={getCustomTabValue:()=>'',setCustomTabValue:()=>writes++,
        getCustomWindowValue:()=>'',setCustomWindowValue:()=>writes++};
      const subscriptions=new Map();let mode='mod';
      const manager=new api.StickyFolderVisibilityManager(window,{
        get:name=>name==='commandIconMode'?mode:undefined,
        subscribe:(name,callback)=>{subscriptions.set(name,callback);return()=>subscriptions.delete(name);},
      });
      // Projection requires a real browser tabstrip; persistence/menu/lifecycle
      // stay real, and these preferences must not trigger projection or writes.
      manager.refresh=()=>{};manager.start();
      const menus=['tabContextMenu','zenFolderActions'].map(id=>document.getElementById(id));
      menus[0].triggerNode=tab;menus[1].triggerNode=folder;
      for(const menu of menus) manager.showMenu({target:menu});
      const ids=['better-zen-folders-sticky-tab','better-zen-folders-sticky-folder'];
      const states=[];
      for(mode of ['mod','off','compatibility','off','mod']) {
        subscriptions.get('commandIconMode')?.(mode);
        states.push(ids.map(id=>document.getElementById(id).querySelectorAll('.better-zen-folders-sticky-menu-mark').length));
      }
      manager.destroy();
      return {states,writes,subscriptionLeft:subscriptions.has('commandIconMode'),
        commandsLeft:ids.some(id=>document.getElementById(id))};
    },source);
    assert.deepEqual(result.states,[[1,1],[0,0],[1,1],[0,0],[1,1]]);
    assert.equal(result.writes,0);assert.equal(result.subscriptionLeft,false);assert.equal(result.commandsLeft,false);
  } finally {await page.close();}
});
