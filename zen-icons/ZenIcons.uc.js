// ==UserScript==
// @name           Zen Icons
// @version        0.3.0-rc.4
// @description    Tagged and categorized icon providers for Zen's normal picker.
// @include        chrome://browser/content/browser.xhtml
// ==/UserScript==

(() => {
  const PREFIX = "[Zen Icons]";
  let cleanup = null;
  let disposed = false;

  const unload = async () => {
    disposed = true;
    try {
      await cleanup?.();
    } catch (error) {
      console.error(`${PREFIX} cleanup failed`, error);
    }
    cleanup = null;
  };

  addUnloadListener(unload);

  try {
    const { initializeZenIcons } = ChromeUtils.importESModule(
      "chrome://sine/content/zen-icons-local/runtime.sys.mjs",
    );
    if (!disposed) {
      cleanup = initializeZenIcons(window);
    }
  } catch (error) {
    console.error(`${PREFIX} initialization failed`, error);
  }
})();
