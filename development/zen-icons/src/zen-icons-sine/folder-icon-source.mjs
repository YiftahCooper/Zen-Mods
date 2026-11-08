import {customSourceParts} from './custom-storage.mjs';
import {CUSTOM_ICON_DIRECTORY_NAME} from '../zen/common/emojis/ZenCustomIconPacks.mjs';
const SINE_CONTENT_PREFIX = "chrome://sine/content/zen-icons-local/";

function localRelativePath(source) {
  if (!String(source).startsWith(SINE_CONTENT_PREFIX)) {
    return null;
  }
  const withoutFragment = String(source)
    .slice(SINE_CONTENT_PREFIX.length)
    .split("#", 1)[0];
  const segments = withoutFragment.split("/").map((segment) => {
    try {
      return decodeURIComponent(segment);
    } catch {
      return null;
    }
  });
  if (
    !segments.length ||
    segments.some(
      (segment) =>
        !segment ||
        segment === "." ||
        segment === ".." ||
        segment.includes("/") ||
        segment.includes("\\"),
    )
  ) {
    return null;
  }
  return segments;
}

export function folderSelectionValueForRecord(
  record,
  {
    profileDir,
    joinPath,
    toFileURL,
    supportsCustomIconIds = false,
  },
) {
  if (record?.provider === "custom" && supportsCustomIconIds) {
    return record.id;
  }
  const customParts=customSourceParts(record?.source);
  if(customParts){
    return toFileURL(joinPath(profileDir,CUSTOM_ICON_DIRECTORY_NAME,...customParts));
  }
  const relativeSegments = localRelativePath(record?.source);
  if (!relativeSegments) {
    return record?.source ?? null;
  }
  const path = joinPath(
    profileDir,
    "chrome",
    "sine-mods",
    "zen-icons-local",
    ...relativeSegments,
  );
  return toFileURL(path);
}
