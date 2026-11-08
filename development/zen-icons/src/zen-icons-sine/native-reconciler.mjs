import {
  createIconRecord,
  normalizeSearchText,
} from "../zen/common/emojis/ZenIconRegistry.mjs";

const NATIVE_ICON_SOURCE =
  /^(?:chrome|resource):\/\/[\w./@+-]+\.svg(?:[?#].*)?$/i;

function filenameStem(source) {
  const withoutQuery = source.split(/[?#]/, 1)[0];
  const filename = withoutQuery.slice(withoutQuery.lastIndexOf("/") + 1);
  return filename.replace(/\.svg$/i, "");
}

function titleFromStem(stem) {
  return normalizeSearchText(stem)
    .split(" ")
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

function unknownNativeRecord(source) {
  const stem = filenameStem(source);
  const normalizedStem = normalizeSearchText(stem);
  return createIconRecord({
    id: `native-${normalizedStem.replace(/\s+/g, "-")}`,
    provider: "zen",
    name: titleFromStem(stem),
    aliases: [],
    tags: normalizedStem.split(" "),
    categories: ["Other"],
    source,
    kind: "svg",
  });
}

export function reconcileNativeIcons(catalog, liveValues) {
  const records = [...catalog];
  const knownSources = new Set(records.map((record) => record.source));
  const unknownValues = [];

  for (const value of liveValues ?? []) {
    const source = typeof value === "string" ? value.trim() : "";
    if (!NATIVE_ICON_SOURCE.test(source) || knownSources.has(source)) {
      continue;
    }
    const record = unknownNativeRecord(source);
    if (!record.name) {
      continue;
    }
    records.push(record);
    knownSources.add(source);
    unknownValues.push(source);
  }

  return { records, unknownValues };
}
