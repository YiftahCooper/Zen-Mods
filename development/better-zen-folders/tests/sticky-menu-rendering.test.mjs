import test, {before, after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';

const modulePath = process.env.BZF_PLAYWRIGHT_MODULE;
const skip = modulePath ? false : 'set BZF_PLAYWRIGHT_MODULE for isolated Chromium menu rendering';
const source = await readFile(new URL('../scripts/better-zen-folders.uc.mjs', import.meta.url), 'utf8');
const css = await readFile(new URL('../chrome.css', import.meta.url), 'utf8');
const nativeCheck = 'data:image/svg+xml,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="m2 8 4 4 8-8" fill="none" stroke="black"/></svg>');

// Inspected Zen 1.22.2b / build 20260915091052, root omni.ja:
// chrome/toolkit/skin/classic/global/menu.css:351-421. The Windows media
// branch is explicit fixture input, not a guessed UA or production mode.
// Its chrome:// menu-check.svg resource is replaced by a local data URL.
const nativeCss = `
  menuitem { --menuitem-icon: normal; }
  .menu-text, .menu-highlightable-text { flex: 1; }
  .menu-text, .menu-accel { margin: 0; padding: 1px 0; }
  .menu-accel { margin-inline: 0.74em 0.35em; }
  menuitem:not([acceltext]) > .menu-accel,
  menuitem:not([highlightable]) > .menu-highlightable-text,
  menuitem[highlightable] > .menu-text { display: none; }
  .menu-icon {
    width: var(--icon-size); height: var(--icon-size); box-sizing: border-box;
    display: none; visibility: hidden;
    margin-top: var(--space-xxsmall); margin-inline-end: var(--space-small);
  }
  menuitem:where(.menuitem-iconic, [image]) > .menu-icon {
    display: revert; visibility: inherit;
    &:where(:not([srcset])) { content: var(--menuitem-icon); }
  }
  menuitem[checked] > .menu-icon {
    visibility: inherit; content: url("${nativeCheck}");
  }
  menupopup[needsgutter] > :is(menu, menuitem) > .menu-icon { display: revert; }
`;

// Installed context-menu-icons/CMI/FluentUI/Fluent-icons.css:7-70,126-140;
// CMI/ZenUI/Zen-icons.css:15-78,116-130. Both packages hide all checkbox
// slots and use a separate checked ::before. The unchecked background
// position differs. Preference media wrappers are selected explicitly here;
// context paint properties are Gecko-only and not needed for layer geometry.
function cmiCss(mode) {
  if (mode === 'native') return '/* CMI disabled */';
  const position = mode === 'fluent'
    ? 'var(--fp-contextmenu-menuitem-padding-inline, left 1em)'
    : 'var(--zen-contextmenu-menuitem-padding-inline)';
  return `
    menuitem:is([type="checkbox"], [type="radio"]):not([checked]) {
      background-image: var(--menu-image) !important;
      background-repeat: no-repeat !important;
      background-position: ${position} center !important;
      background-size: var(--fp-contextmenu-menuitem-icon-size, 16px) !important;
    }
    :is(menuitem[type="checkbox"], menuitem[type="radio"]) > .menu-icon,
    :is(menuitem[type="checkbox"], menuitem[type="radio"]) > .menu-iconic-left,
    :is(menuitem[type="checkbox"], menuitem[type="radio"]) > .menu-iconic {
      display: none !important; width: 0 !important; margin-inline-start: 0 !important;
      padding: 0 !important; opacity: 0 !important;
    }
    :is(menuitem[type="checkbox"], menuitem[type="radio"])[checked] {
      background-image: none !important;
      padding-inline-start: unset !important; padding-left: unset !important;
    }
    menupopup menupopup { --menu-image: initial !important; background-image: none !important; }
    menupopup > menuitem[type="checkbox"][checked]::before,
    menupopup > menuitem[type="radio"][checked]::before {
      content: "" !important; display: inline-block;
      width: var(--checkmark-width); height: var(--checkmark-height);
      margin-inline-end: var(--checkmark-margin-right); vertical-align: middle;
      background-image: url("${nativeCheck}"); background-repeat: no-repeat;
      background-size: contain; margin-inline-start: var(--checkmark-margin-left);
      position: relative; background-color: transparent;
    }
    menuitem.sine-moved, menuitem[id$="-sine-clone"], menuitem[class*="sine"] {
      background-image: var(--menu-image) !important; background-size: 16px !important;
      background-position: var(--fp-contextmenu-menuitem-padding-inline) center !important;
      background-repeat: no-repeat !important;
    }
  `;
}

let browser;
before(async () => {
  if (modulePath) browser = await createRequire(import.meta.url)(modulePath).chromium.launch({headless: true});
});
after(async () => { await browser?.close(); });

for (const kind of ['tab', 'folder']) {
  for (const mode of ['native', 'fluent', 'zen']) {
    for (const bzfFirst of [false, true]) {
    for (const direction of ['ltr', 'rtl']) {
    for (const highlightable of [false, true]) {
      test(`${kind}: ${mode}, BZF ${bzfFirst ? 'before' : 'after'} CMI, ${direction}, ${highlightable ? 'highlightable' : 'normal'} label: leading glyph and independent tick in all modes`, {skip}, async () => {
        const page = await browser.newPage();
        try {
          await page.route('**/*', route => route.abort());
          await page.setContent(`<style>
            :root { --icon-size:16px; --space-small:4px; --space-xxsmall:2px;
              --fp-contextmenu-menuitem-icon-size:19px; --fp-contextmenu-menuitem-padding-inline:10px;
              --zen-contextmenu-menuitem-padding-inline:12px;
              --checkmark-width:16px; --checkmark-height:16px;
              --checkmark-margin-right:4px; --checkmark-margin-left:0px; }
            menupopup { display:block; width:320px; --menu-image:url("${nativeCheck}"); }
            menuitem { display:flex; align-items:center; min-height:28px; padding:4px 10px; }
            menuseparator { display:block; height:1px; background:gray; }
          </style><menupopup id="${kind === 'tab' ? 'tabContextMenu' : 'zenFolderActions'}" needsgutter>
            <menuitem id="${kind === 'tab' ? 'context_zen-edit-tab-icon' : 'context_zenFolderChangeIcon'}">Change Icon</menuitem>
            <menuseparator id="appearance-separator"></menuseparator>
            <menuitem id="${kind === 'tab' ? 'context_unpinTab' : 'context_zenFolderDelete'}">Structural action</menuitem>
            <menuitem id="unrelated-check" type="checkbox" checked="true"><img class="menu-icon"><label>Other check</label></menuitem>
            <menuitem id="unrelated-icon" class="menuitem-iconic" image="${nativeCheck}"><img class="menu-icon" srcset="${nativeCheck}"><label>Other icon</label></menuitem>
          </menupopup><zen-folder id="folder"><tab id="tab"></tab></zen-folder>`);
          await page.evaluate(direction => { document.documentElement.dir = direction; }, direction);
          await page.addStyleTag({content: nativeCss});
          const cmi = await page.addStyleTag({content: cmiCss(mode)});
          const unrelatedBefore = await page.locator('#unrelated-check, #unrelated-icon').evaluateAll(items => items.map(item => {
            const icon = getComputedStyle(item.querySelector('.menu-icon'));
            return [icon.display, icon.opacity, icon.width, icon.content, getComputedStyle(item, '::before').content];
          }));
          const bzf = await page.addStyleTag({content: css});
          if (bzfFirst) await cmi.evaluate(node => node.parentNode.appendChild(node));
          const result = await page.evaluate(async ({source, kind, direction, highlightable}) => {
            const url = URL.createObjectURL(new Blob([source], {type: 'text/javascript'}));
            const {StickyFolderVisibilityManager, StickyStateStore} = await import(url);
            URL.revokeObjectURL(url);
            // menu.js inherits menuitem image -> .menu-icon srcset. Reflect
            // that real XUL contract onto HTML nodes; CSS and commands stay real.
            document.createXULElement = name => {
              const item = document.createElement(name);
              item.innerHTML = '<img loading="lazy" class="menu-icon" aria-hidden="true"><label class="menu-text"></label><label class="menu-highlightable-text"></label><label class="menu-accel"></label>';
              new MutationObserver(() => {
                const image = item.getAttribute('image');
                const icon = item.querySelector('.menu-icon');
                if (image === null) icon.removeAttribute('srcset'); else icon.setAttribute('srcset', image);
                item.querySelector('.menu-text').textContent = item.getAttribute('label');
                item.querySelector('.menu-highlightable-text').textContent = item.getAttribute('label');
              }).observe(item, {attributes: true, attributeFilter: ['image', 'label']});
              return item;
            };
            const folder = document.getElementById('folder'), tab = document.getElementById('tab');
            folder.isZenFolder = true; tab.group = folder;
            const target = kind === 'tab' ? tab : folder;
            window.gBrowser = {isTab: node => node?.localName === 'tab'};
            window.TabContextMenu = {contextTab: tab};
            let icons = 'mod', storedFolders = '', writes = 0;
            const values = new Map();
            const manager = new StickyFolderVisibilityManager(window, {get: name => name === 'commandIconMode' ? icons : undefined});
            manager.store = new StickyStateStore({
              getId: node => node.id, isFolder: node => node.isZenFolder === true,
              getTabValue: node => values.get(node) ?? '', setTabValue: (node, value) => {writes++;values.set(node, value);},
              getWindowValue: () => storedFolders, setWindowValue: value => {writes++;storedFolders = value;},
            });
            manager.refresh = () => {};
            const menu = document.querySelector('menupopup'); menu.triggerNode = target;
            manager.showMenu({target: menu});
            const command = document.getElementById(`better-zen-folders-sticky-${kind}`);
            command.toggleAttribute('highlightable', highlightable);
            // Keep the accelerator visible: a trailing glyph must fail even
            // when there is another native child at the far edge.
            command.setAttribute('acceltext', 'Ctrl+S');
            command.querySelector('.menu-accel').textContent = 'Ctrl+S';
            // Sine's moved-item rule also paints --menu-image; it must not
            // introduce a second glyph when the native slot is restored.
            command.classList.add('sine-moved');
            const states = [];
            for (const [enabled, toggle] of [['mod',false], ['compatibility',false], ['off',false],
              ['mod',true], ['compatibility',false], ['off',false], ['mod',true], ['compatibility',false], ['off',false]]) {
              icons = enabled;
              manager.showMenu({target: menu});
              if (toggle) command.dispatchEvent(new Event('command'));
              await Promise.resolve();
              const image = command.querySelector('.menu-icon');
              const slot = getComputedStyle(image), pseudo = getComputedStyle(command, '::before');
              const rect = image.getBoundingClientRect();
              const slotVisible = slot.display !== 'none' && slot.visibility !== 'hidden'
                && Number(slot.opacity) > 0 && rect.width > 0 && rect.height > 0;
              const pseudoVisible = !['none', 'normal'].includes(pseudo.content)
                && pseudo.display !== 'none' && pseudo.visibility !== 'hidden'
                && Number(pseudo.opacity) > 0 && parseFloat(pseudo.width) > 0 && parseFloat(pseudo.height) > 0;
              const mark = command.querySelector('.better-zen-folders-sticky-menu-mark');
              const markStyle = mark && getComputedStyle(mark);
              const box = node => node?.getBoundingClientRect().toJSON();
              const label = command.querySelector(highlightable ? '.menu-highlightable-text' : '.menu-text');
              const range = document.createRange(); range.selectNodeContents(label);
              states.push({checked: command.hasAttribute('checked'), slotVisible,
                slotContent: slot.content, slotWidth: rect.width, pseudoVisible,
                background: getComputedStyle(command).backgroundImage,
                image: image.getAttribute('srcset'), copies: menu.querySelectorAll(`#${command.id}`).length,
                next: command.nextElementSibling.id,
                direction, label:box(label), text:range.getBoundingClientRect().toJSON(),
                mark:box(mark), slot:box(image), accelerator:box(command.querySelector('.menu-accel')),
                marks:command.querySelectorAll('.better-zen-folders-sticky-menu-mark').length,
                markVisible:!!mark && mark.getBoundingClientRect().width > 0 && mark.getBoundingClientRect().height > 0
                  && markStyle.display !== 'none' && markStyle.visibility !== 'hidden' && Number(markStyle.opacity) > 0,
                markPath:mark?.querySelector('path')?.getAttribute('d'),
                marker:mark?.getAttribute('data-bzf-sticky-marker'),
                linecap:mark?.querySelector('path')?.getAttribute('stroke-linecap'),
                markNext:mark?.nextElementSibling?.className,
                markOpacity:markStyle?.opacity,
                genericMode:command.getAttribute('data-better-zen-folders-command-icon-mode')});
            }
            return {states,writes};
          }, {source, kind, direction, highlightable});
          const unrelatedAfter = await page.locator('#unrelated-check, #unrelated-icon').evaluateAll(items => items.map(item => {
            const icon = getComputedStyle(item.querySelector('.menu-icon'));
            return [icon.display, icon.opacity, icon.width, icon.content, getComputedStyle(item, '::before').content];
          }));
          assert.deepEqual(unrelatedAfter, unrelatedBefore, 'Sticky rules must not restyle other commands');
          assert.equal(result.writes,2,'only two user toggles write state; icon mode changes do not');
          for (const [index, state] of result.states.entries()) {
            const checked = index >= 3 && index < 6;
            const icons = ['mod','compatibility','off'][index % 3];
            const description = `${mode}, step ${index}, checked=${checked}, icons=${icons}`;
            assert.equal(state.checked, checked, description);
            assert.equal(state.slotVisible, checked && mode === 'native', `${description}: native slot`);
            assert.equal(state.pseudoVisible, checked && mode !== 'native', `${description}: CMI check`);
            assert.equal(state.background, 'none', `${description}: no second background glyph`);
            assert.equal(Number(state.slotVisible) + Number(state.pseudoVisible), checked ? 1 : 0, description);
            assert.equal(state.image, null, `${description}: no icon/checkmark swapping`);
            if (checked && mode === 'native') assert.ok(state.slotContent.includes(nativeCheck), `${description}: native state tick`);
            assert.equal(state.copies, 1, `${description}: no duplicated command`);
            assert.equal(state.next, 'appearance-separator', `${description}: appearance-block placement`);
            assert.equal(state.marks,icons === 'off' ? 0 : 1,description);
            assert.equal(state.markVisible,icons !== 'off',description);
            assert.equal(state.genericMode,null,'checkbox must not enter ordinary icon CSS channel');
            const modState = result.states[Math.floor(index/3)*3];
            assert.deepEqual(state.slot,modState.slot,`${description}: decoration leaves the native checkbox geometry alone`);
            assert.deepEqual(state.accelerator,modState.accelerator,`${description}: accelerator stays at its native edge`);
            if(icons!=='off') {
              const gap = direction === 'ltr' ? state.text.left - state.mark.right : state.mark.left - state.text.right;
              assert.ok(gap >= 3.5 && gap <= 4.5,
                `${description}: glyph must sit immediately before the label text (${direction}), gap=${gap}`);
              assert.equal(state.mark.width,12,`${description}: stable glyph width`);
              assert.equal(state.mark.height,12,`${description}: stable glyph height`);
              assert.deepEqual(state.label,modState.label,`${description}: Mod/Compatibility share placement`);
              if (state.slotVisible) assert.ok(direction === 'ltr'
                ? state.slot.right <= state.mark.left : state.mark.right <= state.slot.left,
              `${description}: native tick and decoration must not overlap`);
              assert.equal(state.marker,'underline');
              assert.match(state.markPath,/M18 88H82$/,'default artwork includes the underline');
              assert.equal(state.linecap,'round');
              assert.equal(state.markNext,'menu-text');assert.equal(state.markOpacity,'1');
            }
          }
          await bzf.dispose();
        } finally { await page.close(); }
      });
    }
    }
    }
  }
}
