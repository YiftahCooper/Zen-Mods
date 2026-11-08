import {CUSTOM_CONTENT_PREFIX,customSourceParts} from './custom-storage.mjs';
export const CUSTOM_ICON_SOURCE_PREFIX = CUSTOM_CONTENT_PREFIX;

export const DEFAULT_ICON_FALLBACK =
  "chrome://browser/skin/zen-icons/selectable/image.svg";

export function customIconSourceAvailability(source, availableSources) {
  const value = String(source ?? "");
  const isCustom = Boolean(customSourceParts(value));
  if (!isCustom) {
    return null;
  }
  return availableSources instanceof Set ? availableSources.has(value) : true;
}

export function resolveCustomImageDisplaySource(
  storedSource,
  availableCustomSources,
) {
  const source = String(storedSource ?? "");
  if (!customSourceParts(source)) {
    return source;
  }
  return availableCustomSources?.has(source) ? source : DEFAULT_ICON_FALLBACK;
}
