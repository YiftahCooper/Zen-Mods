/** Right-click menus this editor does not manage (0.2.3). Their browser rows get
 * presentation-only glyphs: no editor identity, settings entry, placement,
 * label or visibility change. A row is named by its stable ID, or else by its
 * exact localization ID plus one exact owner marker (class, anonid, command or
 * data-action). Check and radio rows, lists of the user's own items
 * (extensions, search engines, spaces) and rows with their own artwork are
 * deliberately absent. Markup and IDs were read from Zen 1.24.1b (Gecko 159)
 * omni.ja.
 *
 * A menu is keyed by its ID; Zen Library menus have none and are keyed by
 * their exact class (".class"). The library button's download stack builds a
 * bare popup in #mainPopupSet on every opening, keyed as DOWNLOAD_STACK. */
const id = (...ids) => ids.map(value => ({id:value}));
const byClass = (className, l10nId) => ({className, l10nId});
const byAnonid = (anonid, l10nId) => ({anonid, l10nId});
const byCommand = (command, l10nId) => ({command, l10nId});
const byAction = (action, l10nId) => ({action, l10nId});
// Rows with nothing but their localization ID (and the label Fluent derives from it).
const bare = (...l10nIds) => l10nIds.map(l10nId => ({bare:true, l10nId}));
export const DOWNLOAD_STACK = 'zen-library-download-stack';

export const DECORATED_MENUS = new Map([
 // Address bar, search field and every other text field in the browser window
 // (toolkit EditContextMenu; the address bar adds Paste & Go, Copy Clean Link
 // and the autofill rows).
 ['textbox-contextmenu', [
  ...id('edit-contextmenu-undo','edit-contextmenu-redo','edit-contextmenu-cut','edit-contextmenu-copy',
   'edit-contextmenu-paste','paste-and-go','strip-on-share','edit-contextmenu-delete','edit-contextmenu-select-all'),
  byAnonid('urlbar-input-dismiss-autofill','urlbar-input-dismiss-autofill'),
  byAnonid('urlbar-input-remove-from-history','urlbar-input-remove-from-history'),
  byAnonid('clear-search-history','clear-search-history'),
 ]],
 // Zen Library: a download, a history entry, a media file and a boost.
 ['.zen-library-downloads-menu', [byAction('open','library-downloads-menu-open'),
  byAction('show','downloads-cmd-show-menuitem-2'),byAction('copy','library-downloads-menu-copy'),
  byAction('copy-link','downloads-cmd-copy-download-link'),byAction('unblock','downloads-cmd-unblock'),
  byAction('hide','library-downloads-menu-hide'),byAction('delete','library-downloads-menu-delete')]],
 ['.zen-library-history-menu', [byAction('open','library-history-menu-open'),
  byAction('forget','library-history-menu-forget'),byAction('forget-site','places-forget-domain-data')]],
 ['.zen-library-media-menu', [byAction('open','library-media-menu-open'),
  byAction('show','downloads-cmd-show-menuitem-2'),byAction('copy','library-media-menu-copy')]],
 ['.zen-library-boosts-menu', [byAction('edit','library-boosts-menu-edit'),
  byAction('export','zen-boost-save'),byAction('delete','zen-boost-edit-delete')]],
 // A download in the library button's stack (ZenLibraryWidget).
 [DOWNLOAD_STACK, bare('downloads-cmd-pause','downloads-cmd-resume','library-downloads-menu-retry',
  'downloads-cmd-show-menuitem-2','downloads-cmd-go-to-download-page','downloads-cmd-copy-download-link',
  'downloads-cmd-delete-file','downloads-cmd-remove-from-history','library-downloads-menu-clear-preview')],
 // A download in Firefox's downloads panel (when the downloads button is on a toolbar).
 ['downloadsContextMenu', [
  byClass('downloadPauseMenuItem','downloads-cmd-pause'),
  byClass('downloadResumeMenuItem','downloads-cmd-resume'),
  byClass('downloadUnblockMenuItem','downloads-cmd-unblock'),
  byClass('downloadUseSystemDefaultMenuItem','downloads-cmd-use-system-default'),
  byClass('downloadShowMenuItem','downloads-cmd-show-menuitem-2'),
  byClass('downloadOpenReferrerMenuItem','downloads-cmd-go-to-download-page'),
  byClass('downloadCopyLocationMenuItem','downloads-cmd-copy-download-link'),
  byClass('downloadDeleteFileMenuItem','downloads-cmd-delete-file'),
  byClass('downloadRemoveFromHistoryMenuItem','downloads-cmd-remove-from-history'),
  byCommand('downloadsCmd_clearList','downloads-cmd-clear-list'),
  byCommand('downloadsCmd_clearDownloads','downloads-cmd-clear-downloads'),
 ]],
 // An extension in the extensions panel or Zen's site panel.
 ['unified-extensions-context-menu', id('unified-extensions-context-menu-move-widget-up',
  'unified-extensions-context-menu-move-widget-down','unified-extensions-context-menu-manage-extension',
  'unified-extensions-context-menu-remove-extension','unified-extensions-context-menu-report-extension')],
 // An extension's page action button in the address bar.
 ['pageActionContextMenu', id('pageActionContextMenuManageExtension','pageActionContextMenuRemoveExtension')],
 // The "…" button in Zen's site panel (click or right-click).
 ['zenSiteDataActions', [...id('context_zenClearSiteData','context_zenOpenGetAddons','context_zenOpenSiteSettings'),
  byCommand('Tools:Addons','zen-site-data-manage-addons')]],
 // Firefox's tab group list (open and saved groups).
 ['open-tab-group-context-menu', id('open-tab-group-context-menu_moveToThisWindow',
  'open-tab-group-context-menu_moveToNewWindow','open-tab-group-context-menu_share','open-tab-group-context-menu_delete')],
 ['saved-tab-group-context-menu', id('saved-tab-group-context-menu_openInThisWindow',
  'saved-tab-group-context-menu_openInNewWindow','saved-tab-group-context-menu_delete')],
 // The Picture-in-Picture toggle on a video. Move follows its left/right label.
 ['pictureInPictureToggleContextMenu', id('context_HidePictureInPictureToggle','context_MovePictureInPictureToggle')],
].map(([menuKey, rows]) => [menuKey, Object.freeze(rows.map(Object.freeze))]));
const CLASS_MENUS = new Set([...DECORATED_MENUS.keys()].filter(key => key.startsWith('.')).map(key => key.slice(1)));

export const l10nIdOf = node => node.getAttribute('data-l10n-id') || node.getAttribute('data-lazy-l10n-id') || null;

/** The DECORATED_MENUS key of a top-level popup, or null. Cheap: one map lookup,
 * a class check, then the bare-popup test. */
export function decoratedMenuKey(popup) {
 if (popup?.localName !== 'menupopup') return null;
 if (popup.id) return DECORATED_MENUS.has(popup.id) && !popup.id.startsWith('.') && popup.id !== DOWNLOAD_STACK ? popup.id : null;
 for (const name of popup.classList) if (CLASS_MENUS.has(name)) return '.' + name;
 return !popup.hasAttribute('class') && popup.parentElement?.id === 'mainPopupSet' ? DOWNLOAD_STACK : null;
}

/** The exact row specification this direct child of a decorated menu matches, or null. */
export function decoratedRow(menuKey, node) {
 const rows = DECORATED_MENUS.get(menuKey);
 if (!rows || !['menu','menuitem'].includes(node?.localName)) return null;
 if (node.id) return rows.find(row => row.id === node.id) || null;
 const l10nId = l10nIdOf(node);
 if (!l10nId) return null;
 return rows.find(row => !row.id && row.l10nId === l10nId && (
  row.className ? node.classList.contains(row.className) :
  row.anonid ? node.getAttribute('anonid') === row.anonid :
  row.command ? node.getAttribute('command') === row.command :
  row.action ? node.getAttribute('data-action') === row.action :
  row.bare ? !['class','anonid','command','data-action'].some(name => node.hasAttribute(name)) : false)) || null;
}
