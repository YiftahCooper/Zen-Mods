/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const GENERIC_CATEGORY_ICON = "🗂️";

export function cleanCategoryName(value) {
  return String(value ?? '').normalize('NFC').trim().replace(/\s+/gu, ' ');
}

export function categoryKey(value) {
  return cleanCategoryName(value).toLocaleLowerCase('en-US');
}

export function canonicalCategoryName(value, names = []) {
  const name = cleanCategoryName(value) || 'Other';
  const key = categoryKey(name);
  return [...Object.keys(BUILT_IN_CATEGORY_METADATA), 'Default', ...names]
    .find(candidate => categoryKey(candidate) === key) || name;
}

export function categoryDisplayName(value, names = []) {
  if(categoryKey(value)!=='default')return cleanCategoryName(value);
  let label='Default (Custom)', suffix=2;
  while(names.some(name=>categoryKey(name)===categoryKey(label)))label=`Default (Custom ${suffix++})`;
  return label;
}

export const BUILT_IN_CATEGORY_METADATA = Object.freeze({
  Accessibility: { icon: "♿", aliases: [] },
  Activities: { icon: "🎯", aliases: [] },
  Animals: { icon: "🐶", aliases: ["creatures"] },
  Buildings: { icon: "🏢", aliases: [] },
  Communication: { icon: "📨", aliases: [] },
  Components: { icon: "🧩", aliases: [] },
  Connectivity: { icon: "📶", aliases: ["network"] },
  Design: { icon: "🎨", aliases: [] },
  Development: { icon: "💻", aliases: ["coding"] },
  Devices: { icon: "📱", aliases: [] },
  Education: { icon: "🎓", aliases: [] },
  Entertainment: { icon: "🎭", aliases: [] },
  Events: { icon: "📅", aliases: [] },
  Files: { icon: "📁", aliases: [] },
  Finance: { icon: "💰", aliases: ["money"] },
  Flags: { icon: "🚩", aliases: [] },
  "Food & Drink": { icon: "🍽️", aliases: ["food", "drink"] },
  Home: { icon: "🏠", aliases: [] },
  Layout: { icon: "🧱", aliases: [] },
  Math: { icon: "🧮", aliases: ["mathematics"] },
  Media: { icon: "🎬", aliases: [] },
  Medical: { icon: "🩺", aliases: ["health"] },
  Nature: { icon: "🌿", aliases: [] },
  Notifications: { icon: "🔔", aliases: ["alerts"] },
  Objects: { icon: "🧰", aliases: [] },
  Other: { icon: "✨", aliases: [] },
  People: { icon: "👥", aliases: [] },
  Photography: { icon: "📷", aliases: ["photos"] },
  Productivity: { icon: "✅", aliases: [] },
  Reading: { icon: "📚", aliases: ["books"] },
  Science: { icon: "🔬", aliases: [] },
  Security: { icon: "🔒", aliases: [] },
  Shapes: { icon: "🔷", aliases: [] },
  Shopping: { icon: "🛒", aliases: [] },
  "Smileys & Emotion": { icon: "😀", aliases: ["smileys", "emotions"] },
  Sports: { icon: "🏅", aliases: ["sport", "athletics"] },
  Symbols: { icon: "🔣", aliases: [] },
  Text: { icon: "🔤", aliases: [] },
  Time: { icon: "⏰", aliases: [] },
  Tools: { icon: "🛠️", aliases: [] },
  Transportation: { icon: "🚆", aliases: ["transport"] },
  Travel: { icon: "🧳", aliases: [] },
  "Travel & Places": { icon: "🗺️", aliases: ["places"] },
  Weather: { icon: "☀️", aliases: [] },
  Work: { icon: "💼", aliases: ["jobs"] },
});

function cleanAliases(value) {
  return Array.isArray(value)
    ? [
        ...new Set(
          value
            .filter((alias) => typeof alias === "string")
            .map((alias) => alias.trim())
            .filter(Boolean),
        ),
      ]
    : [];
}

export function normalizeCategoryMetadata(source) {
  if (!source || typeof source !== "object" || Array.isArray(source)) {
    return {};
  }
  const normalized = {};
  for (const [rawName, rawMetadata] of Object.entries(source)) {
    const name = canonicalCategoryName(rawName, Object.keys(normalized));
    if (!cleanCategoryName(rawName) || !rawMetadata || typeof rawMetadata !== "object") {
      continue;
    }
    const icon =
      typeof rawMetadata.icon === "string" && rawMetadata.icon.trim() && !/[/\\:]|\.(png|jpe?g|webp|avif|ico|svg|gif)$/i.test(rawMetadata.icon)
        ? rawMetadata.icon.trim()
        : BUILT_IN_CATEGORY_METADATA[name]?.icon || GENERIC_CATEGORY_ICON;
    const imageSources=Array.isArray(rawMetadata.imageSources) ? rawMetadata.imageSources.filter(value=>typeof value==='string' && value.length<=7*1024*1024 && /^data:image\/(?:png|jpeg|webp|avif|x-icon);base64,[a-z0-9+/=]+$/i.test(value)) : [];
    normalized[name] = {
      icon,
      aliases: cleanAliases(rawMetadata.aliases),
      ...(imageSources.length ? {imageSources} : {}),
    };
  }
  return normalized;
}

export function mergeCategoryMetadata(...sources) {
  const merged = normalizeCategoryMetadata(BUILT_IN_CATEGORY_METADATA);
  for (const source of sources) for (const [name, value] of Object.entries(normalizeCategoryMetadata(source))) {
    const canonical = canonicalCategoryName(name, Object.keys(merged));
    merged[canonical] = {...value, aliases: [...new Set([...(merged[canonical]?.aliases || []), ...value.aliases])]};
  }
  return merged;
}

export function categoryPresentation(
  rawName,
  metadata = BUILT_IN_CATEGORY_METADATA,
) {
  const name = canonicalCategoryName(rawName, Object.keys(metadata));
  const definition = normalizeCategoryMetadata(metadata)[name] ?? {
    icon: GENERIC_CATEGORY_ICON,
    aliases: [],
  };
  return {
    name,
    icon: definition.icon,
    label: `${definition.icon} ${categoryDisplayName(name)}`,
    aliases: definition.aliases,
    ...(definition.imageSources?.length ? {imageSources:definition.imageSources} : {}),
  };
}

function comparable(value) {
  return categoryKey(value);
}

export function resolveCategoryName(value, metadata) {
  const exact = Object.keys(metadata ?? {}).find(name => categoryKey(name) === categoryKey(value));
  if (exact) return exact;
  if (categoryKey(value) === 'default (custom)') return 'Default';
  const wanted = comparable(value);
  for (const name of Object.keys(metadata ?? {})) {
    const presentation = categoryPresentation(name, metadata);
    if (
      [presentation.name, presentation.label, ...presentation.aliases].some(
        (candidate) => comparable(candidate) === wanted,
      )
    ) {
      return presentation.name;
    }
  }
  return canonicalCategoryName(value, Object.keys(metadata ?? {}));
}

export function compareCategoryNames(left, right) {
  return String(left).localeCompare(String(right), "en", {
    sensitivity: "base",
    numeric: true,
  });
}
