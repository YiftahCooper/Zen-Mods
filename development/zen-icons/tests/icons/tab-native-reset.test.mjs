import test from 'node:test';
import assert from 'node:assert/strict';
import { createTabIconController } from '../../src/zen-icons-sine/tab-default.mjs';
import { Element, fixture, tick } from './runtime-fixture.mjs';

function page(documentURI, href) {
  return { documentURI, querySelectorAll(selector) {
    assert.equal(selector, 'link[rel~="icon"]');
    return [{ href }];
  } };
}

for (const url of ['about:preferences', 'about:settings#zenLooksAndFeel']) {
  test(`Reset Icon restores ${url} artwork without a remembered or Places favicon`, async () => {
    const images = [];
    const f = await fixture({ imports: {
      'resource://gre/modules/PlacesUtils.sys.mjs': { PlacesUtils: { favicons: { getFaviconForPage: async () => null } } },
      'resource:///modules/sessionstore/TabStateCache.sys.mjs': { TabStateCache: { update: (_, data) => images.push(data.image) } },
    } });
    await tick();
    try {
      const tab = new Element('tab');
      const anchor = new Element('image');
      tab.append(anchor);
      f.document.documentElement.append(tab);
      tab.zenStaticIcon = 'chrome://custom.svg';
      tab.permanentKey = {};
      tab.linkedBrowser = {
        currentURI: { spec: url },
        mIconURL: tab.zenStaticIcon,
        contentDocument: page(url.split('#')[0], 'chrome://global/skin/icons/settings.svg'),
      };
      f.browser.gBrowser = { setIcon(t, value) { t.linkedBrowser.mIconURL = t.zenStaticIcon || value; } };
      f.browser.gZenEmojiPicker.open(anchor, { emojiAsSVG: true, onSelect(value) {
        if (value) tab.zenStaticIcon = value;
        else delete tab.zenStaticIcon;
        f.browser.gBrowser.setIcon(tab, value);
      } });

      f.document.querySelector('.zen-icons-reset-tab-icon').fire('click');
      await tick();

      assert.equal(tab.zenStaticIcon, undefined);
      assert.equal(tab.linkedBrowser.mIconURL, 'chrome://global/skin/icons/settings.svg');
      assert.deepEqual(images, ['chrome://global/skin/icons/settings.svg']);
    } finally { f.dispose(); }
  });
}

test('reset uses current about-page artwork instead of an older remembered image', async () => {
  const tab = { linkedBrowser: {
    currentURI: { spec: 'about:preferences' },
    mIconURL: 'chrome://old-settings.svg',
    contentDocument: page('about:preferences', 'resource://current-settings.svg'),
  } };
  const saved = [];
  const controller = createTabIconController({
    lookupFavicon: async () => 'data:image/png;base64,b2xk',
    setIcon: (t, image) => { t.linkedBrowser.mIconURL = image; },
    persistImage: (_, image) => saved.push(image),
  });
  controller.remember(tab);
  tab.zenStaticIcon = 'chrome://custom.svg';
  await controller.restore(tab, () => { delete tab.zenStaticIcon; tab.linkedBrowser.mIconURL = null; });
  assert.equal(tab.linkedBrowser.mIconURL, 'resource://current-settings.svg');
  assert.deepEqual(saved, ['resource://current-settings.svg']);
});

for (const scenario of ['stale-document', 'remote-image', 'inaccessible-document', 'website']) {
  test(`reset preserves cached fallback for ${scenario}`, async () => {
    const browser = {
      currentURI: { spec: scenario === 'website' ? 'https://example.test/' : 'about:settings' },
      mIconURL: 'chrome://custom.svg',
      contentDocument: page(scenario === 'website' ? 'https://example.test/' : scenario === 'stale-document' ? 'about:preferences' : 'about:settings',
        scenario === 'remote-image' ? 'https://example.test/favicon.svg' : 'chrome://wrong.svg'),
    };
    if (scenario === 'inaccessible-document') Object.defineProperty(browser, 'contentDocument', { get() { throw Error('unavailable'); } });
    const tab = { linkedBrowser: browser, zenStaticIcon: 'chrome://custom.svg' };
    const controller = createTabIconController({
      lookupFavicon: async () => 'data:image/png;base64,c2l0ZQ==',
      setIcon: (t, image) => { t.linkedBrowser.mIconURL = image; },
      persistImage() {},
    });
    await controller.restore(tab, () => { delete tab.zenStaticIcon; browser.mIconURL = null; });
    assert.equal(browser.mIconURL, 'data:image/png;base64,c2l0ZQ==');
  });
}
