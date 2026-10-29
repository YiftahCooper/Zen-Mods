import ucAPI from './utils/uc_api.sys.mjs';
const { setTimeout } = ChromeUtils.importESModule('resource://gre/modules/Timer.sys.mjs');
export async function run() {
  const receipt = { version: Services.appinfo.version, checks: [] };
  const check = (name, passed) => {
    receipt.checks.push({name, passed: !!passed});
    if (!passed) throw new Error(name);
  };
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
  const config = await IOUtils.readJSON(PathUtils.join(PathUtils.profileDir, 'migration-config.json'));
  const fresh = await IOUtils.readJSON(PathUtils.join(PathUtils.profileDir, 'new-theme.json'));
  const old = await IOUtils.readJSON(PathUtils.join(PathUtils.profileDir, 'old-theme.json'));
  const oldURL = 'https://github.com/YiftahCooper/zen-glance-button-position';
  const newURL = 'https://github.com/YiftahCooper/Zen-Mods/tree/main/glance-controls';
  const realFetch = ucAPI.fetch;
  const realUnpack = ucAPI.unpackRemoteArchive;
  let serveOld = false;
  try {
    let win;
    for (let i = 0; i < 150; i++) {
      win = Services.wm.getMostRecentWindow('navigator:browser');
      if (win?.gBrowserInit?.delayedStartupFinished && win?.SineAPI) break;
      await pause(100);
    }
    const {manager, utils} = win.SineAPI;
    // Replace only the network transport: Sine still selects, extracts, records and loads files.
    if (!config.live) {
      ucAPI.fetch = async url => {
        if (url === utils.rawURL(newURL) + 'theme.json') return structuredClone(fresh);
        if (url === utils.rawURL(oldURL) + 'theme.json') return structuredClone(serveOld ? old : fresh);
        if (url === utils.rawURL('https://github.com/YiftahCooper/Zen-Mods') + 'theme.json')
          return IOUtils.readJSON(PathUtils.join(PathUtils.profileDir, 'catalogue-theme.json'));
        throw new Error('Unexpected network request: ' + url);
      };
      ucAPI.unpackRemoteArchive = async options => {
        const filename = ['https://codeload.github.com/YiftahCooper/Zen-Mods/zip/refs/heads/main', 'https://codeload.github.com/YiftahCooper/Zen-Mods/zip/main'].includes(options.url)
          ? 'candidate.zip' : options.url === 'https://codeload.github.com/YiftahCooper/zen-glance-button-position/zip/main'
          ? 'old.zip' : null;
        if (!filename) throw new Error('Unexpected archive: ' + options.url);
        const file = Cc['@mozilla.org/file/local;1'].createInstance(Ci.nsIFile);
        file.initWithPath(PathUtils.join(PathUtils.profileDir, filename));
        return realUnpack.call(ucAPI, {...options, url: Services.io.newFileURI(file).spec});
      };
    }
    await manager.installMod(newURL, null, false);
    let mods = await utils.getMods();
    const id = 'glance-button-position';
    const modDir = utils.getModFolder(id);
    for (const script of ['button-order.uc.js', 'copy-url.uc.js'])
      check('fresh install resolves ' + script, await IOUtils.exists(PathUtils.join(modDir, script)));
    check('fresh install selects CSS and settings', mods[id].style.chrome === 'chrome.css' && mods[id].preferences === 'preferences.json');
    check('fresh install records new update source', mods[id].homepage === newURL);
    check('only selected mod is extracted', !(await IOUtils.exists(PathUtils.join(modDir, 'catalogue.css'))));

    if (!config.live) {
      // Check the root cannot accidentally enable Glance or install every mod.
      await manager.installMod('https://github.com/YiftahCooper/Zen-Mods', null, false);
      mods = await utils.getMods();
      const catalogue = mods['yiftahcooper-zen-mods-catalogue'];
      check('root selects only its inert stylesheet', catalogue.style.chrome === 'catalogue.css' && !catalogue.scripts && !catalogue.modules);
      check('root does not adopt Glance settings', catalogue.preferences === 'catalogue-preferences.json' && (await IOUtils.readJSON(PathUtils.join(utils.getModFolder(catalogue.id), catalogue.preferences))).length === 0);
      delete mods[catalogue.id];
      await IOUtils.writeJSON(utils.modsDataFile, mods);
      await IOUtils.remove(utils.getModFolder(catalogue.id), {recursive:true});
    }
    if (!config.live || config.bridge) {
      // Recreate the actual old installation, then exercise the real updater through the bridge.
      await IOUtils.remove(modDir, {recursive:true});
      await IOUtils.writeJSON(utils.modsDataFile, {});
      serveOld = true;
      if (config.live) {
        const file = Cc['@mozilla.org/file/local;1'].createInstance(Ci.nsIFile);
        file.initWithPath(PathUtils.join(PathUtils.profileDir, 'old.zip'));
        await realUnpack.call(ucAPI, {url:Services.io.newFileURI(file).spec,id,
          zipPath:PathUtils.join(utils.modsDir, 'old-fixture.zip'),extractDir:utils.modsDir,applyName:true});
        await IOUtils.writeJSON(utils.modsDataFile, {[id]:{...old,enabled:true}});
      } else {
        await manager.installMod(oldURL, null, false);
      }
      serveOld = false;
      Services.prefs.setStringPref('glance.position.side', 'right');
      Services.prefs.setStringPref('glance.position.percent', '37.5');
      Services.prefs.setStringPref('glance.position.scale', '1.2');
      Services.prefs.setStringPref('glance.position.order', 'copy,close,expand,split');
      Services.prefs.setBoolPref('glance.position.show.split', false);
      mods = await utils.getMods();
      const result = await manager.processModUpdate(mods[id], mods, null);
      mods = await utils.getMods();
      check('old installation migrates through update', result.changed && result.modHasJS && mods[id].homepage === newURL && mods[id].version === fresh.version && mods[id].name === fresh.name);
      check('migration preserves identity without duplicates', Object.keys(mods).length === 1 && mods[id].id === id);
      check('migration preserves user preferences', Services.prefs.getStringPref('glance.position.side') === 'right' && Services.prefs.getStringPref('glance.position.percent') === '37.5' && Services.prefs.getStringPref('glance.position.scale') === '1.2' && Services.prefs.getStringPref('glance.position.order') === 'copy,close,expand,split' && !Services.prefs.getBoolPref('glance.position.show.split'));
      const again = await manager.processModUpdate(mods[id], mods, null);
      check('next update uses new source and is current', !again.changed);
    }
    for (const scriptPath of Object.keys(await utils.getScripts({onlyEnabled:true})))
      check('registered script exists: ' + scriptPath, await IOUtils.exists(PathUtils.join(utils.modsDir, ...scriptPath.split('/'))));
    // Reset through normal preference writes. Clearing a string pref alone does not
    // clear Sine's already-generated CSS variable in a running window.
    Services.prefs.setStringPref('glance.position.side', 'left');
    Services.prefs.setStringPref('glance.position.percent', '0');
    Services.prefs.setStringPref('glance.position.scale', '1');
    Services.prefs.setStringPref('glance.position.order', 'close,expand,split,copy');
    for (const key of ['close','expand','split','copy']) Services.prefs.setBoolPref('glance.position.show.' + key, true);
    await manager.rebuildMods();
    await manager.loadMods();
    await pause(700);
    receipt.passed = true;
  } catch (error) {
    receipt.passed = false;
    receipt.error = String(error) + '\n' + error.stack;
  } finally {
    ucAPI.fetch = realFetch;
    ucAPI.unpackRemoteArchive = realUnpack;
  }
  await IOUtils.writeJSON(PathUtils.join(PathUtils.profileDir, 'migration-result.json'), receipt);
  if (!receipt.passed) {
    await IOUtils.writeJSON(PathUtils.join(PathUtils.profileDir, 'position-result.json'), receipt);
    Services.startup.quit(Ci.nsIAppStartup.eForceQuit);
    return;
  }
  await ChromeUtils.importESModule('chrome://userscripts/content/' + config.runtimeTest).run();
}
