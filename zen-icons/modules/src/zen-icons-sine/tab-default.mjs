// Keep this persisted identifier compatible with earlier selections. The
// stylesheet replaces its artwork with Zen's native CSS no-website placeholder.
// A local chrome URI also avoids tabbrowser's data-SVG remote-image rewriting.
export const BLANK_TAB_ICON = 'chrome://sine/content/zen-icons-local/blank-tab.svg';

function localImage(value) {
  return typeof value === 'string' && /^(?:data:image\/|chrome:|resource:|about:)/.test(value) ? value : null;
}

function currentPageImage(browser, url) {
  if (!url?.startsWith('about:')) return null;
  try {
    const document = browser.contentDocument;
    if (!document || document.documentURI?.split('#')[0] !== url.split('#')[0]) return null;
    // Built-in pages (including Settings) declare their own local artwork,
    // which need not exist in Places or our pre-selection image cache.
    for (const link of document.querySelectorAll('link[rel~="icon"]')) {
      const image = localImage(link.href);
      if (image) return image;
    }
  } catch { /* Remote or unavailable document: retain the cache fallbacks. */ }
  return null;
}

// Ephemeral native-image cache only. Zen remains the owner of persisted tab
// overrides. Never fetch a guessed /favicon.ico or reload the user's page.
export function createTabIconController({ lookupFavicon, setIcon, persistImage, isActive = () => true }) {
  const remembered = new WeakMap();
  const generations = new WeakMap();
  const changed = tab => generations.set(tab, (generations.get(tab) || 0) + 1);
  return {
    changed,
    remember(tab) {
      if (!tab || tab.zenStaticIcon) return;
      const icon = localImage(tab.linkedBrowser?.mIconURL);
      if (icon) remembered.set(tab, { url: tab.linkedBrowser.currentURI?.spec, icon });
    },
    preview(tab) {
      const saved = remembered.get(tab);
      return saved && saved.url === tab?.linkedBrowser?.currentURI?.spec ? saved.icon : null;
    },
    async restore(tab, clearOverride) {
      changed(tab);
      const generation = generations.get(tab);
      const browser = tab.linkedBrowser;
      const uri = browser?.currentURI;
      const url = uri?.spec;
      clearOverride();
      const resetImage = browser?.mIconURL;
      const saved = remembered.get(tab);
      let image = currentPageImage(browser, url) || (saved && saved.url === url ? saved.icon : null);
      if (!image && uri) {
        try { image = localImage(await lookupFavicon(uri)); } catch { /* No cached favicon. */ }
      }
      if (!image || !isActive() || tab.closing || tab.isConnected === false ||
          generations.get(tab) !== generation || tab.zenStaticIcon ||
          tab.linkedBrowser !== browser || browser.currentURI?.spec !== url || browser.mIconURL !== resetImage) return;
      setIcon(tab, image);
      persistImage(tab, image);
      remembered.set(tab, { url, icon: image });
    },
  };
}
