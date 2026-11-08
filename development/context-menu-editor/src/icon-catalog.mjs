import data from '../assets/catalog.json' with {type:'json'};

export const DEFAULT_ICON_BASE = 'chrome://sine/content/context-menu-editor/';

/** Catalog entries are immutable presentation data; the imported JSON owns IDs. */
export function createIconCatalog(baseURL = DEFAULT_ICON_BASE) {
  const base = String(baseURL).replace(/\/?$/u, '/');
  const localFluent = new Map(data.packs.find(pack=>pack.id==='fluent').icons.map(icon=>[icon.id,base+icon.path]));
  const entries = Object.freeze(data.packs.flatMap(pack => pack.icons.map(icon => {
    // Browser artwork only: skin icons, plus the share panel's QR glyph, which
    // Firefox ships under content/sharing rather than skin.
    if(icon.browserPath && !/^chrome:\/\/browser\/(?:skin|content\/sharing)\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.svg$/u.test(icon.browserPath))throw new Error('Invalid built-in browser icon reference.');
    return Object.freeze({
      pack:pack.id, id:icon.id, label:icon.label, src:icon.browserPath || base + icon.path,
      ...(icon.browserPath ? {fallbackSrc:localFluent.get(icon.id) || localFluent.get('info')} : {}),
      tags:Object.freeze([...icon.tags]),
    });
  })));
  const byChoice = new Map(entries.map(entry => [`${entry.pack}:${entry.id}`, entry]));
  return Object.freeze({
    entries,
    find(pack, id) { return byChoice.get(`${pack}:${id}`) || null; },
    mapped(pack, nativeId, l10nId) {
      const mapping = data.mappings[pack];
      if (!mapping) return null;
      const id = typeof nativeId === 'string' && Object.hasOwn(mapping.byId, nativeId)
        ? mapping.byId[nativeId]
        : typeof l10nId === 'string' && Object.hasOwn(mapping.byL10n, l10nId)
          ? mapping.byL10n[l10nId] : null;
      return id ? byChoice.get(`${pack}:${id}`) || null : null;
    },
  });
}
