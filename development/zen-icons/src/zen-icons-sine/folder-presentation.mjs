export const BZF_FOLDER_COLOR_ATTRIBUTE =
  "data-better-zen-folders-color";
export const BZF_FOLDER_COLOR_EVENT = "BetterZenFolderColorChanged";

const BZF_FOLDER_COLOR_PROPERTY = "--better-zen-folders-custom-color";
const INNER_ICON_COLOR_PROPERTY = "--zen-icons-inner-icon-color";
const FOLDER_SHAPE_FILL_PROPERTIES = Object.freeze([
  "--zen-folder-behind-bgcolor",
  "--zen-folder-front-bgcolor",
]);
const FOLDER_SHAPE_STROKE_PROPERTY = "--zen-folder-stroke";
const COLOURED_FOLDER_STROKE = "#000000";
const SIX_DIGIT_HEX = /^#[0-9a-f]{6}$/;

export function normalizeProjectedFolderColor(value) {
  const normalized = String(value ?? "").trim().toLowerCase();
  return SIX_DIGIT_HEX.test(normalized) ? normalized : null;
}

export function isRecolorableFolderIconSource(source) {
  const value = String(source ?? "").toLowerCase();
  return (
    value.startsWith("chrome://browser/skin/zen-icons/") ||
    value.startsWith("chrome://sine/content/zen-icons-local/lucide/") ||
    /\/chrome\/sine-mods\/zen-icons-local\/lucide\/[^/]+\.svg(?:[?#].*)?$/.test(
      value,
    )
  );
}

export function createFolderIconPresentation({
  showFolderShape,
  source,
  projectedColor,
}) {
  const color = normalizeProjectedFolderColor(projectedColor);
  const recolorable = isRecolorableFolderIconSource(source);
  return {
    folderShapeColor: color,
    hasInnerIcon: Boolean(source),
    enlargeInnerIcon: !Boolean(showFolderShape) && Boolean(source),
    innerIconColor:
      color && recolorable
        ? showFolderShape
          ? "#000000"
          : color
        : null,
  };
}

export function selectDefaultFolderIcon({
  isFolderPicker,
  setShowFolderShape,
  selectValue,
}) {
  if (isFolderPicker) {
    setShowFolderShape(true);
  }
  return selectValue(null);
}

export function folderFromColorEvent(event) {
  const target = event?.target;
  if (target?.matches?.("zen-folder")) {
    return target;
  }
  return target?.closest?.("zen-folder") ?? null;
}

export function connectFolderColorBridge({ browserWindow, refreshFolder }) {
  const listener = event => {
    const folder = folderFromColorEvent(event);
    if (folder) {
      refreshFolder(folder);
    }
  };
  browserWindow.addEventListener(BZF_FOLDER_COLOR_EVENT, listener);
  return () =>
    browserWindow.removeEventListener(BZF_FOLDER_COLOR_EVENT, listener);
}

export function applyFolderIconPresentation({
  folder,
  showFolderShape,
  source,
  unavailable,
}) {
  const projectedVariable = normalizeProjectedFolderColor(
    folder.style?.getPropertyValue?.(BZF_FOLDER_COLOR_PROPERTY),
  );
  const presentation = createFolderIconPresentation({
    showFolderShape,
    source,
    projectedColor:
      projectedVariable ?? folder.getAttribute(BZF_FOLDER_COLOR_ATTRIBUTE),
  });
  const folderShapeColor = presentation.folderShapeColor;
  const hasInnerIcon = presentation.hasInnerIcon && !unavailable;
  const enlargeInnerIcon = presentation.enlargeInnerIcon && !unavailable;
  const innerIconColor = unavailable ? null : presentation.innerIconColor;
  folder.toggleAttribute("zen-icons-has-inner-icon", hasInnerIcon);
  folder.toggleAttribute("zen-icons-enlarge-inner-icon", enlargeInnerIcon);
  folder.toggleAttribute(
    "zen-icons-recolor-inner-icon",
    Boolean(innerIconColor),
  );
  if (innerIconColor) {
    folder.style.setProperty(INNER_ICON_COLOR_PROPERTY, innerIconColor);
  } else {
    folder.style.removeProperty(INNER_ICON_COLOR_PROPERTY);
  }
  for (const property of FOLDER_SHAPE_FILL_PROPERTIES) {
    if (folderShapeColor) {
      folder.style.setProperty(property, folderShapeColor);
    } else {
      folder.style.removeProperty(property);
    }
  }
  if (folderShapeColor) {
    folder.style.setProperty(
      FOLDER_SHAPE_STROKE_PROPERTY,
      COLOURED_FOLDER_STROKE,
    );
  } else {
    folder.style.removeProperty(FOLDER_SHAPE_STROKE_PROPERTY);
  }
  return {
    folderShapeColor,
    hasInnerIcon,
    enlargeInnerIcon,
    innerIconColor,
  };
}
