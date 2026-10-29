const { setTimeout } = ChromeUtils.importESModule('resource://gre/modules/Timer.sys.mjs');
export async function run() {
  const receipt = { checks: [] };
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const check = (name, passed) => {
    receipt.checks.push({name, passed: !!passed});
    if (!passed) throw new Error(name);
  };
  try {
    let win;
    for (let i = 0; i < 100; i++) {
      win = Services.wm.getMostRecentWindow('navigator:browser');
      if (win?.gBrowserInit?.delayedStartupFinished && win?.SineAPI) break;
      await pause(100);
    }
    Services.prefs.setBoolPref('glance.position.show.split', false);
    const tab = win.gBrowser.addTab('about:preferences#sineMods', {
      triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal()
    });
    let doc;
    for (let i = 0; i < 100; i++) {
      doc = tab.linkedBrowser.contentDocument;
      if (doc?.querySelector('[mod-id="glance-button-position"] .sineItemConfigureButton')) break;
      await pause(100);
    }
    check('real Sine settings page loads', doc?.querySelector('[mod-id="glance-button-position"] .sineItemConfigureButton'));
    const settingsWindow = doc.defaultView;
    const openSettings = async () => {
      doc.querySelector('[mod-id="glance-button-position"] .sineItemConfigureButton').click();
      await pause(150);
      return doc.querySelector('[mod-id="glance-button-position"] dialog');
    };
    let dialog = await openSettings();
    const list = () => doc.getElementById('glance-button-order-list');
    check('four consolidated rows appear in the actual settings dialog', list()?.querySelectorAll('[data-button]').length === 4);
    check('only four visibility checkboxes remain', dialog.querySelectorAll('.sineItemPreferenceCheckbox').length === 4);
    const row = key => list().querySelector(`[data-button="${key}"]`);
    const rowOrder = () => [...list().querySelectorAll('[data-button]')].map(r => r.dataset.button).join(',');
    check('existing hidden preference is preserved', !row('split').querySelector('checkbox').checked);
    check('default order and boundary arrows', rowOrder() === 'close,expand,split,copy' &&
      row('close').querySelector('[data-direction="-1"]').disabled && row('copy').querySelector('[data-direction="1"]').disabled);
    const positionInput = doc.getElementById('glance-position-percent').querySelector('input');
    positionInput.value = '50';
    positionInput.dispatchEvent(new settingsWindow.Event('change', {bubbles:true}));
    await pause(100);
    await win.gZenGlanceManager.openGlance({url:'about:blank#order',
      triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
      clientX:300,clientY:200,width:100,height:30});
    await pause(800);
    const group = () => win.document.querySelector('.zen-glance-sidebar-container');
    const ids = {cmd_zenGlanceClose:'close', cmd_zenGlanceExpand:'expand', cmd_zenGlanceSplit:'split'};
    const actualOrder = () => [...group().children].map(b => ids[b.getAttribute('command')] || 'copy').join(',');
    for (let i = 0; i < 3; i++) {
      row('copy').querySelector('[data-direction="-1"]').click();
      await pause(80);
    }
    check('arrows save and apply order to existing Glance', rowOrder() === 'copy,close,expand,split' &&
      Services.prefs.getStringPref('glance.position.order') === 'copy,close,expand,split' && actualOrder() === rowOrder());
    row('copy').querySelector('[data-direction="1"]').click();
    await pause(80);
    check('down arrow swaps adjacent rows', rowOrder() === 'close,copy,expand,split' && actualOrder() === rowOrder());
    row('copy').querySelector('.sineItemPreferenceCheckbox').click();
    await pause(100);
    check('inline checkbox hides the correct reordered button', !Services.prefs.getBoolPref('glance.position.show.copy') &&
      group().querySelector('.glance-position-copy-url').getBoundingClientRect().height === 0);
    const visible = [...group().children].filter(b => b.getBoundingClientRect().height > 0);
    const top = visible[0].getBoundingClientRect(), bottom = visible.at(-1).getBoundingClientRect();
    const panel = group().parentElement.getBoundingClientRect();
    check('visible reordered stack stays centred', Math.abs((top.top + bottom.bottom) / 2 - (panel.top + panel.bottom) / 2) < 1);
    row('copy').querySelector('.sineItemPreferenceCheckbox').click();
    await pause(100);
    check('inline checkbox re-enables in its saved position', group().querySelector('.glance-position-copy-url').getBoundingClientRect().height > 0 && actualOrder() === 'close,copy,expand,split');
    dialog.close();
    dialog = await openSettings();
    check('reopening dialog retains one list and saved order', doc.querySelectorAll('#glance-button-order-list').length === 1 && rowOrder() === 'close,copy,expand,split');
    dialog.close();
    await win.SineAPI.manager.loadMods(settingsWindow);
    await pause(250);
    dialog = await openSettings();
    check('Sine rebuild retains one consolidated list', doc.querySelectorAll('#glance-button-order-list').length === 1 &&
      dialog.querySelectorAll('.sineItemPreferenceCheckbox').length === 4 && rowOrder() === 'close,copy,expand,split');
    await win.SineAPI.manager.rebuildMods();
    await pause(300);
    check('script reload does not duplicate controls or lose order', doc.querySelectorAll('#glance-button-order-list').length === 1 && actualOrder() === 'close,copy,expand,split');
    Services.prefs.setStringPref('glance.position.order', 'copy,copy,bogus,split');
    await pause(100);
    check('invalid saved order preserves every button exactly once', actualOrder() === 'copy,split,close,expand' && rowOrder() === actualOrder());
    await win.gZenGlanceManager.closeGlance({onTabClose:true,skipPermitUnload:true});
    await pause(300);
    await win.gZenGlanceManager.openGlance({url:'about:blank#reordered',
      triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
      clientX:300,clientY:200,width:100,height:30});
    await pause(700);
    check('new Glance inherits the saved order', actualOrder() === 'copy,split,close,expand');
    const mods = await win.SineAPI.utils.getMods();
    mods['glance-button-position'].enabled = false;
    await IOUtils.writeJSON(win.SineAPI.utils.modsDataFile, mods);
    await win.SineAPI.manager.rebuildMods();
    await pause(150);
    check('disable removes custom UI and restores native order', !list() && actualOrder() === 'close,expand,split' &&
      dialog.querySelectorAll('.sineItemPreferenceCheckbox').length === 4);
    mods['glance-button-position'].enabled = true;
    await IOUtils.writeJSON(win.SineAPI.utils.modsDataFile, mods);
    await win.SineAPI.manager.rebuildMods();
    await pause(200);
    check('re-enable restores saved order and one settings list', actualOrder() === 'copy,split,close,expand' &&
      doc.querySelectorAll('#glance-button-order-list').length === 1);
    await win.gZenGlanceManager.closeGlance({onTabClose:true,skipPermitUnload:true});
    win.gBrowser.selectedTab = tab;
    dialog.close();
    const category = doc.getElementById('category-sine-mods');
    category.shadowRoot.querySelector('button').click();
    await pause(200);
    dialog = await openSettings();
    await IOUtils.writeJSON(PathUtils.join(PathUtils.profileDir, 'order-progress.json'), {stage:'before screenshot', checks:receipt.checks});
    const bitmap = await Promise.race([
      win.browsingContext.currentWindowGlobal.drawSnapshot(
        new win.DOMRect(0, 0, win.innerWidth, win.innerHeight), 1, 'white'),
      pause(5000).then(() => { throw new Error('Snapshot renderer timed out'); })
    ]);
    const canvas = win.document.createElementNS('http://www.w3.org/1999/xhtml', 'canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext('2d').drawImage(bitmap, 0, 0);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    await IOUtils.write(PathUtils.join(PathUtils.profileDir, 'button-settings.png'), new Uint8Array(await blob.arrayBuffer()));
    bitmap.close();
    const rows = [...list().querySelectorAll('[data-button]')];
    receipt.layout = rows.map(r => ({row:r.getBoundingClientRect().toJSON(),checkbox:r.querySelector('checkbox').getBoundingClientRect().toJSON(),arrow:r.querySelector('button').getBoundingClientRect().toJSON()}));
    check('checkbox and arrows align on each visible row', rows.every(r => {
      const checkbox = r.querySelector('checkbox').getBoundingClientRect();
      const arrow = r.querySelector('button').getBoundingClientRect();
      return checkbox.height > 0 && Math.abs((checkbox.top + checkbox.bottom - arrow.top - arrow.bottom) / 2) < 2;
    }));
    check('every move button has an accessible action label', rows.every(r => [...r.querySelectorAll('button')].every(b => b.getAttribute('aria-label')?.startsWith('Move '))));
    row('copy').querySelector('[data-direction="1"]').click();
    row('copy').querySelector('[data-direction="-1"]').click();
    check('focus stays on the moved row at the boundary', doc.activeElement === row('copy').querySelector('[data-direction="1"]'));
    receipt.passed = true;
  } catch (error) {
    receipt.error = String(error) + '\n' + error.stack;
    receipt.passed = false;
  }
  await IOUtils.writeJSON(PathUtils.join(PathUtils.profileDir, 'position-result.json'), receipt);
  Services.startup.quit(Ci.nsIAppStartup.eForceQuit);
}
