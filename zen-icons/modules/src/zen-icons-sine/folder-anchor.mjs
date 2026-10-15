const FOLDER_SELECTOR = "zen-folder, tab-group";
const DIRECT_ICON_SELECTOR =
  ":scope > .tab-group-label-container > .tab-group-folder-icon";

export function findFolderForAnchor(document, anchor) {
  if (!anchor || anchor.closest?.("tab, .tabbrowser-tab")) return null;
  for (const folder of document?.querySelectorAll?.(FOLDER_SELECTOR) ?? []) {
    const icon = folder?.querySelector?.(DIRECT_ICON_SELECTOR) ?? folder.icon;
    const owner = icon?.closest?.(FOLDER_SELECTOR);
    if (owner && owner !== folder) continue;
    if (
      folder === anchor ||
      icon === anchor ||
      icon?.contains?.(anchor) ||
      (icon?.parentNode === anchor &&
        anchor.closest?.(FOLDER_SELECTOR) === folder)
    ) {
      return folder;
    }
  }
  return null;
}
