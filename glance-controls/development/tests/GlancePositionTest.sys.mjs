const { setTimeout } = ChromeUtils.importESModule('resource://gre/modules/Timer.sys.mjs');
const SIDE = 'glance.position.side';
const POSITION = 'glance.position.percent';
export async function run() {
  const receipt = { version: Services.appinfo.version, checks: [] };
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  let registrar, clipboardFactory, clipboardCID;
  try {
    let win;
    for (let i = 0; i < 150; i++) {
      win = Services.wm.getMostRecentWindow('navigator:browser');
      if (win?.gBrowserInit?.delayedStartupFinished && win?.SineAPI) break;
      await pause(100);
    }
    if (!win?.SineAPI) throw new Error('Sine initialization timed out');
    const deferred = PathUtils.join(PathUtils.profileDir, 'deferred-mods.json');
    if (await IOUtils.exists(deferred)) {
      await pause(300);
      const added = await IOUtils.readJSON(deferred);
      added['glance-button-position'].enabled = false;
      await IOUtils.writeJSON(win.SineAPI.utils.modsDataFile, added);
      await win.SineAPI.manager.toggleTheme(added, 'glance-button-position');
      await pause(300);
      receipt.hotInstall = true;
    }
    Services.prefs.clearUserPref(SIDE);
    Services.prefs.clearUserPref(POSITION);
    await win.SineAPI.manager.rebuildMods();
    const parentBrowser = win.gBrowser.selectedBrowser;
    await win.gZenGlanceManager.openGlance({ url: 'about:blank#glance-first',
      triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
      clientX: 300, clientY: 200, width: 100, height: 30 });
    await pause(1200);
    const buttons = win.document.querySelector('.zen-glance-sidebar-container');
    if (!buttons) throw new Error('Native Glance buttons missing');
    const copy = buttons.querySelector('.glance-position-copy-url');
    receipt.checks.push({name: 'fourth native-style copy button', passed:
      buttons.querySelectorAll('toolbarbutton').length === 4 && !!copy &&
      buttons.lastElementChild === copy && copy.classList.contains('toolbarbutton-1')});
    if (!copy) throw new Error('Copy URL button is missing');
    // Replace only the OS clipboard boundary so testing never changes the
    // user's clipboard. The real button handler and browser URI are exercised.
    const copied = [];
    let clipboardFails = false;
    const clipboard = {
      QueryInterface: ChromeUtils.generateQI(['nsIClipboardHelper']),
      copyString(value) {
        if (clipboardFails) throw new Error('Test clipboard failure');
        copied.push(value);
      }
    };
    clipboardFactory = {
      QueryInterface: ChromeUtils.generateQI(['nsIFactory']),
      createInstance(iid) { return clipboard.QueryInterface(iid); }
    };
    registrar = Components.manager.QueryInterface(Ci.nsIComponentRegistrar);
    clipboardCID = Services.uuid.generateUUID();
    registrar.registerFactory(clipboardCID, 'Test-only clipboard boundary',
      '@mozilla.org/widget/clipboardhelper;1', clipboardFactory);
    copy.doCommand();
    receipt.checks.push({name: 'copy targets Glance, not parent', passed:
      copied.at(-1) === 'about:blank#glance-first' && parentBrowser.currentURI.spec === 'about:blank'});
    receipt.checks.push({name: 'success feedback', passed: copy.getAttribute('tooltiptext') === 'Copied'});
    const glanceBrowser = win.gZenGlanceManager.browserWrapper.querySelector('browser');
    glanceBrowser.loadURI(Services.io.newURI('about:blank#glance-second'), {
      triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal()
    });
    for (let i = 0; i < 50 && glanceBrowser.currentURI.spec !== 'about:blank#glance-second'; i++) await pause(100);
    copy.doCommand();
    receipt.checks.push({name: 'copy follows native Glance navigation', passed: copied.at(-1) === 'about:blank#glance-second'});
    clipboardFails = true;
    copy.doCommand();
    receipt.checks.push({name: 'clipboard failure is not reported as success', passed:
      copy.getAttribute('tooltiptext') === 'Could not copy URL' &&
      copy.getAttribute('aria-label') === 'Could not copy URL' && copied.length === 2});
    clipboardFails = false;
    await pause(1600);
    receipt.checks.push({name: 'feedback resets', passed: copy.getAttribute('tooltiptext') === 'Copy URL'});
    const originalCommand = buttons.firstElementChild.getAttribute('command');
    receipt.checks.push({name: 'native commands and styling preserved', passed:
      originalCommand === 'cmd_zenGlanceClose' &&
      win.getComputedStyle(copy).backgroundColor === win.getComputedStyle(buttons.children[1]).backgroundColor &&
      win.getComputedStyle(copy).width === win.getComputedStyle(buttons.children[1]).width &&
      win.getComputedStyle(copy).listStyleImage.includes('/link.svg')});
    const check = (name, side, fraction, native = false) => {
      const b = buttons.getBoundingClientRect(), p = buttons.parentElement.getBoundingClientRect();
      const expectedTop = native ? p.top + 15 : p.top + Math.max(15,
        Math.min(p.height - b.height - 15, p.height * fraction - b.height / 2));
      const sideOK = side === 'left' ? Math.abs(b.right - p.left) < 1 : Math.abs(b.left - p.right) < 1;
      const topOK = Math.abs(b.top - expectedTop) < 1;
      receipt.checks.push({ name, side, fraction, actualTop: b.top, expectedTop,
        sideOK, topOK, visible: b.top >= p.top && b.bottom <= p.bottom,
        passed: sideOK && topOK && b.top >= p.top && b.bottom <= p.bottom });
    };
    check('default preferences', 'left', 0);
    for (const rightSidebar of [false, true]) {
      win.document.documentElement.setAttribute('zen-right-side', String(rightSidebar));
      for (const side of ['left', 'right']) {
        Services.prefs.setStringPref(SIDE, side);
        for (const [value, fraction] of [['0', 0], ['25', .25], ['50', .5], ['75', .75], ['100', 1], ['37.5', .375], ['-20', 0], ['150', 1], ['nonsense', 0], ['', 0]]) {
          Services.prefs.setStringPref(POSITION, value);
          await win.SineAPI.manager.rebuildMods(false, false);
          await pause(150);
          check(`sidebar=${rightSidebar}, value=${JSON.stringify(value)}`, side, fraction);
        }
      }
    }
    // Missing visibility rules leave holes or put the wrong buttons on screen.
    const keys = ['close', 'expand', 'split', 'copy'];
    Services.prefs.setStringPref(POSITION, '37.5');
    for (let mask = 0; mask < 16; mask++) {
      keys.forEach((key, i) => Services.prefs.setBoolPref(`glance.position.show.${key}`, !!(mask & (1 << i))));
      await win.SineAPI.manager.rebuildMods(false, false);
      await pause(100);
      const visible = [...buttons.children].filter(b => b.getBoundingClientRect().height > 0);
      const wanted = [...buttons.children].filter((b, i) => mask & (1 << i));
      const rects = visible.map(b => b.getBoundingClientRect());
      receipt.checks.push({name: `visibility combination ${mask}`, passed:
        visible.length === wanted.length && visible.every((b, i) => b === wanted[i]) &&
        rects.every((r, i) => !i || (Math.abs(r.left - rects[0].left) < 1 &&
          Math.abs(r.top - rects[i - 1].bottom - 12) < 1))});
      if (mask) check(`remaining stack centred: ${mask}`, 'right', .375);
    }
    // Independent ratios catch scaling the glyph without its hit target, or vice versa.
    const baseButton = copy.getBoundingClientRect().width;
    const baseIcon = copy.querySelector('image').getBoundingClientRect().width;
    for (const [value, ratio] of [['0.7', .7], ['1.2', 1.2], ['1', 1], ['', 1], ['invalid', 1], ['0', .25], ['-1', .25], ['20', 3]]) {
      Services.prefs.setStringPref('glance.position.scale', value);
      await win.SineAPI.manager.rebuildMods(false, false);
      await pause(100);
      receipt.checks.push({name: `button and icon scale ${JSON.stringify(value)}`, passed:
        [...buttons.children].every(b => Math.abs(b.getBoundingClientRect().width - baseButton * ratio) < 1 &&
          Math.abs(b.getBoundingClientRect().height - baseButton * ratio) < 1 &&
          Math.abs(b.querySelector('image').getBoundingClientRect().width - baseIcon * ratio) < 1)});
      check(`scaled stack centre ${value}`, 'right', .375);
    }
    Services.prefs.clearUserPref('glance.position.scale');
    for (const side of ['left', 'right']) {
      Services.prefs.setStringPref(SIDE, side);
      for (const scale of ['0.7', '1.2']) {
        Services.prefs.setStringPref('glance.position.scale', scale);
        for (const onlyCopy of [false, true]) {
          keys.slice(0, 3).forEach(key => Services.prefs.setBoolPref(`glance.position.show.${key}`, !onlyCopy));
          for (const position of ['0', '100']) {
            Services.prefs.setStringPref(POSITION, position);
            await win.SineAPI.manager.rebuildMods(false, false);
            await pause(80);
            check(`edge: ${side}, size=${scale}, copyOnly=${onlyCopy}, position=${position}`, side, Number(position) / 100);
          }
        }
      }
    }
    keys.forEach(key => Services.prefs.setBoolPref(`glance.position.show.${key}`, true));
    Services.prefs.clearUserPref('glance.position.scale');
    // Resize the native Glance container to cover a smaller available height.
    buttons.parentElement.style.setProperty('height', '300px', 'important');
    for (const value of ['0', '50', '100']) {
      Services.prefs.setStringPref(POSITION, value);
      await win.SineAPI.manager.rebuildMods(false, false);
      await pause(30);
      check(`small Glance height ${value}`, 'right', Number(value) / 100);
    }
    // Exercise Sine's real settings controls, including their change handlers.
    const mods = await win.SineAPI.utils.getMods();
    const mod = mods['glance-button-position'];
    if (mod) {
      const prefs = await win.SineAPI.utils.getModPreferences(mod);
      const panel = win.document.createXULElement('vbox');
      win.document.body.append(panel);
      for (const pref of prefs) {
        panel.append(win.SineAPI.manager.preferences.parsePref(pref, win.SineAPI.manager, win));
      }
      const sideControl = panel.querySelector('menulist');
      const percentControl = panel.querySelector('input');
      if (!sideControl || !percentControl) throw new Error('Native Sine controls missing');
      sideControl.setAttribute('value', 'left');
      sideControl.dispatchEvent(new win.Event('command', { bubbles: true }));
      percentControl.value = '63.25';
      percentControl.dispatchEvent(new win.Event('change', { bubbles: true }));
      await pause(300);
      check('Sine settings controls: Left, 63.25', 'left', .6325);
      sideControl.setAttribute('value', 'right');
      sideControl.dispatchEvent(new win.Event('command', { bubbles: true }));
      percentControl.value = '12.8';
      percentControl.dispatchEvent(new win.Event('change', { bubbles: true }));
      await pause(300);
      check('Sine settings controls: Right, 12.8', 'right', .128);
      const toggles = panel.querySelectorAll('.sineItemPreferenceCheckbox');
      receipt.checks.push({name: 'four visibility controls in Sine', passed: toggles.length === 4});
      for (let i = 0; i < toggles.length; i++) {
        toggles[i].click();
        await pause(100);
        receipt.checks.push({name: `Sine toggle hides ${keys[i]}`, passed:
          buttons.children[i].getBoundingClientRect().height === 0 &&
          [...buttons.children].filter(b => b.getBoundingClientRect().height > 0).length === 3});
        toggles[i].click();
        await pause(100);
      }
      const sizeControl = panel.querySelectorAll('input')[1];
      if (!sizeControl) throw new Error('Sine size control missing');
      sizeControl.value = '0.7';
      sizeControl.dispatchEvent(new win.Event('change', { bubbles: true }));
      await pause(200);
      receipt.checks.push({name: 'Sine size control scales the visible buttons', passed:
        Math.abs(copy.getBoundingClientRect().width - baseButton * .7) < 1});
      check('Sine size and visibility preserve centre', 'right', .128);
      panel.remove();
      mods[mod.id].enabled = false;
      await IOUtils.writeJSON(win.SineAPI.utils.modsDataFile, mods);
      await win.SineAPI.manager.rebuildMods();
      await pause(100);
      check('disable restores native right-sidebar layout', 'left', 0, true);
      receipt.checks.push({name: 'disable removes live and template copy buttons', passed:
        !win.document.querySelector('.glance-position-copy-url') &&
        !win.document.getElementById('zen-glance-sidebar-template').content.querySelector('.glance-position-copy-url') &&
        !buttons.hasAttribute('glance-position-measured') && !buttons.style.getPropertyValue('--glance-half-height')});
      mods[mod.id].enabled = true;
      await IOUtils.writeJSON(win.SineAPI.utils.modsDataFile, mods);
      await win.SineAPI.manager.rebuildMods();
      await pause(200);
      await win.SineAPI.manager.rebuildMods();
      await pause(200);
      receipt.checks.push({name: 're-enable and repeated reload do not duplicate buttons', passed:
        buttons.querySelectorAll('.glance-position-copy-url').length === 1 &&
        buttons.querySelectorAll('toolbarbutton').length === 4});
      const writesBefore = copied.length;
      buttons.querySelector('.glance-position-copy-url').doCommand();
      receipt.checks.push({name: 'reloaded handler copies exactly once', passed:
        copied.length === writesBefore + 1 && copied.at(-1) === 'about:blank#glance-second'});
      await win.gZenGlanceManager.closeGlance({onTabClose:true, skipPermitUnload:true});
      await pause(500);
      await win.gZenGlanceManager.openGlance({url:'about:blank#glance-reopened',
        triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
        clientX:300,clientY:200,width:100,height:30});
      await pause(700);
      const reopened = win.document.querySelector('.zen-glance-sidebar-container');
      const reopenedCopy = reopened?.querySelector('.glance-position-copy-url');
      reopenedCopy?.doCommand();
      receipt.checks.push({name: 'reopened Glance has one working fourth button', passed:
        reopened?.querySelectorAll('toolbarbutton').length === 4 && copied.at(-1) === 'about:blank#glance-reopened'});
    }
    receipt.bridge = {element: win.document.getElementById('theme-Glance-Button-Position')?.outerHTML,
      value: win.getComputedStyle(win.document.documentElement).getPropertyValue('--glance-position-percent')};
    receipt.passed = receipt.checks.every(c => c.passed);
  } catch (error) {
    receipt.error = String(error) + '\n' + error.stack;
    receipt.passed = false;
  } finally {
    if (clipboardCID) registrar.unregisterFactory(clipboardCID, clipboardFactory);
  }
  await IOUtils.writeJSON(PathUtils.join(PathUtils.profileDir, 'position-result.json'), receipt);
  Services.startup.quit(Ci.nsIAppStartup.eForceQuit);
}
