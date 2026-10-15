const ICON_SOURCE_ATTRIBUTE = "data-zen-icons-icon-source";
const DIRECT_ICON_CONTAINER_SELECTOR =
  ":scope > .tab-group-label-container > .tab-group-folder-icon";
const DIRECT_ICON_IMAGE_SELECTOR = `${DIRECT_ICON_CONTAINER_SELECTOR} svg .icon image`;

function directIconContainer(folder) {
  return folder?.querySelector?.(DIRECT_ICON_CONTAINER_SELECTOR) ?? null;
}

function projectLiveIconSource(folder, source) {
  if (source) {
    folder?.setAttribute?.(ICON_SOURCE_ATTRIBUTE, source);
  } else {
    folder?.removeAttribute?.(ICON_SOURCE_ATTRIBUTE);
  }
  try {
    folder.iconURL = source || null;
  } catch {
    // Some installed Zen folder elements expose iconURL as read-only.
  }
}

export function writeFolderIcon({ document, folder, value }) {
  const manager = document.defaultView.gZenFolders;
  const ownedContainer = directIconContainer(folder);
  const fallback = ownedContainer ? null : folder?.icon;
  const fallbackOwner = fallback?.closest?.("zen-folder, tab-group");
  const iconContainer =
    ownedContainer ??
    (!fallbackOwner || fallbackOwner === folder ? fallback : null);
  const legacyImage = folder?.querySelector?.(
    ".tab-group-folder-icon svg .icon image",
  );
  const image =
    folder?.querySelector?.(DIRECT_ICON_IMAGE_SELECTOR) ??
    iconContainer?.querySelector?.("svg .icon image") ??
    (legacyImage?.closest?.("zen-folder, tab-group") === folder
      ? legacyImage
      : null);
  const source = value
    ? (document.defaultView.gZenEmojiPicker?.resolveIconSource?.(value) ??
      value)
    : "";
  if (
    typeof manager?.setFolderUserIcon === "function" &&
    typeof iconContainer?.querySelector === "function" &&
    (!ownedContainer || folder?.icon === ownedContainer)
  ) {
    try {
      manager.setFolderUserIcon(folder, value);
      if (image?.getAttribute("href") === source) {
        projectLiveIconSource(folder, source);
        return { applied: true, mode: "native", source };
      }
    } catch {
      // Installed Zen versions do not all expose the same folder element API.
    }
  }

  if (value) {
    folder?.setAttribute?.("zen-user-icon", value);
  } else {
    folder?.removeAttribute?.("zen-user-icon");
  }
  projectLiveIconSource(folder, source);
  image?.setAttribute("href", source);
  image?.style?.setProperty("opacity", source ? "1" : "0");
  return {
    applied: Boolean(image),
    mode: "compatibility",
    source,
  };
}
