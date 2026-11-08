/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { constants as fsConstants } from "node:fs";
import {
  access,
  mkdir,
  readFile,
  readdir,
  unlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { ZEN_BUILT_IN_ICONS } from "../src/zen/common/emojis/ZenBuiltInIcons.mjs";
import {
  createIconRecord,
  normalizeSearchText,
} from "../src/zen/common/emojis/ZenIconRegistry.mjs";

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const LUCIDE_PACKAGE_ROOT = path.join(
  PROJECT_ROOT,
  "node_modules",
  "lucide-static",
);
const OUTPUT_ASSET_DIRECTORY = path.join(
  PROJECT_ROOT,
  "src",
  "browser",
  "themes",
  "shared",
  "zen-icons",
  "common",
  "lucide",
);
const LUCIDE_LICENSE = path.join(LUCIDE_PACKAGE_ROOT, "LICENSE");
const OUTPUT_LICENSE = path.join(OUTPUT_ASSET_DIRECTORY, "LICENSE.md");
const LEGACY_OUTPUT_LICENSE = path.join(OUTPUT_ASSET_DIRECTORY, "LICENSE");
const OUTPUT_CATALOG = path.join(
  PROJECT_ROOT,
  "src",
  "zen",
  "common",
  "emojis",
  "ZenLucideIcons.mjs",
);
const OUTPUT_JAR_INCLUDE = path.join(
  PROJECT_ROOT,
  "src",
  "browser",
  "themes",
  "shared",
  "zen-icons",
  "lucide.inc.mn",
);

const CATEGORY_RULES = [
  ["Accessibility", ["accessibility", "wheelchair", "disability", "braille"]],
  [
    "Animals",
    [
      "animal",
      "bird",
      "cat",
      "dog",
      "fish",
      "paw",
      "rabbit",
      "snail",
      "turtle",
      "worm",
    ],
  ],
  ["Flags", ["flag", "country", "nation"]],
  [
    "Sports",
    [
      "sport",
      "fitness",
      "exercise",
      "dumbbell",
      "medal",
      "trophy",
      "volleyball",
    ],
  ],
  [
    "Weather",
    ["weather", "cloud", "rain", "snow", "storm", "sun", "wind", "umbrella"],
  ],
  [
    "Food & Drink",
    [
      "food",
      "drink",
      "beverage",
      "coffee",
      "restaurant",
      "utensil",
      "fruit",
      "vegetable",
    ],
  ],
  [
    "Travel",
    [
      "travel",
      "hotel",
      "luggage",
      "passport",
      "map",
      "location",
      "navigation",
      "compass",
    ],
  ],
  [
    "Transportation",
    ["transport", "vehicle", "car", "bus", "train", "plane", "ship", "bike"],
  ],
  [
    "Finance",
    [
      "finance",
      "money",
      "currency",
      "bank",
      "payment",
      "wallet",
      "credit card",
      "chart",
    ],
  ],
  [
    "Medical",
    ["medical", "health", "hospital", "medicine", "stethoscope", "pill"],
  ],
  [
    "Science",
    ["science", "laboratory", "chemistry", "atom", "microscope", "telescope"],
  ],
  [
    "Development",
    [
      "development",
      "developer",
      "programming",
      "code",
      "terminal",
      "bug",
      "database",
      "git",
    ],
  ],
  [
    "Communication",
    ["communication", "message", "chat", "phone", "mail", "email", "megaphone"],
  ],
  [
    "Media",
    ["multimedia", "audio", "video", "music", "movie", "play", "volume"],
  ],
  ["Photography", ["photography", "camera", "photo", "image", "aperture"]],
  ["Design", ["design", "paint", "palette", "brush", "pen", "pencil", "color"]],
  ["Files", ["file", "folder", "archive", "document", "clipboard", "save"]],
  ["Security", ["security", "lock", "key", "password", "shield", "privacy"]],
  ["Shopping", ["shopping", "store", "cart", "basket", "package", "barcode"]],
  ["People", ["people", "person", "user", "users", "contact", "baby"]],
  ["Home", ["home", "house", "furniture", "bed", "bath", "lamp"]],
  ["Buildings", ["building", "factory", "warehouse", "school", "church"]],
  [
    "Nature",
    ["nature", "tree", "leaf", "flower", "plant", "mountain", "water"],
  ],
  [
    "Connectivity",
    ["connectivity", "wifi", "bluetooth", "network", "antenna", "radio"],
  ],
  [
    "Devices",
    ["device", "computer", "laptop", "monitor", "smartphone", "printer"],
  ],
  ["Notifications", ["notification", "alert", "bell", "alarm", "warning"]],
  ["Time", ["time", "clock", "calendar", "timer", "history", "watch"]],
  ["Layout", ["layout", "grid", "panel", "columns", "rows", "sidebar"]],
  ["Text", ["text", "font", "typography", "formatting", "letter"]],
  ["Math", ["math", "calculator", "sigma", "percent", "divide", "equal"]],
  ["Tools", ["tool", "hammer", "wrench", "screwdriver", "settings", "cog"]],
  ["Shapes", ["shape", "circle", "square", "triangle", "diamond", "hexagon"]],
  ["Events", ["event", "party", "celebration", "gift", "ticket", "confetti"]],
];

function wordsFor(id, tags) {
  return new Set(
    [id, ...(tags ?? [])]
      .flatMap((value) => normalizeSearchText(value).split(" "))
      .filter(Boolean),
  );
}

export function categoryForLucideIcon(id, tags) {
  const normalizedHaystack = normalizeSearchText(
    [id, ...(tags ?? [])].join(" "),
  );
  const words = wordsFor(id, tags);
  for (const [category, needles] of CATEGORY_RULES) {
    if (
      needles.some((needle) => {
        const normalizedNeedle = normalizeSearchText(needle);
        return normalizedNeedle.includes(" ")
          ? normalizedHaystack.includes(normalizedNeedle)
          : words.has(normalizedNeedle);
      })
    ) {
      return category;
    }
  }
  return "Other";
}

export function transformLucideSvg(source) {
  const header = `<!--
   - This Source Code Form is subject to the terms of the Mozilla Public
   - License, v. 2.0. If a copy of the MPL was not distributed with this
   - file, You can obtain one at http://mozilla.org/MPL/2.0/.
   -->`;
  return `${header}\n${source
    .replaceAll('stroke="currentColor"', 'stroke="context-stroke"')
    .replaceAll('fill="currentColor"', 'fill="context-fill"')}`;
}

function displayName(id) {
  return id
    .split("-")
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

function collisionKeys(record) {
  return new Set(
    [record.name, ...(record.aliases ?? [])]
      .map(normalizeSearchText)
      .filter(Boolean),
  );
}

export function buildLucideCatalog({ tags, zenIcons, sourceFor }) {
  const claims = new Map();
  for (const zenIcon of zenIcons) {
    for (const lucideId of zenIcon.lucideEquivalentIds ?? []) {
      if (claims.has(lucideId)) {
        throw new Error(
          `Lucide identifier claimed by multiple Zen icons: ${lucideId}`,
        );
      }
      claims.set(lucideId, zenIcon.id);
    }
  }

  const zenCollisionKeys = new Set(
    zenIcons.flatMap((zenIcon) => [...collisionKeys(zenIcon)]),
  );
  const reviewedVariants = new Set(
    zenIcons.flatMap((zenIcon) => zenIcon.lucideAllowedIds ?? []),
  );
  const output = [];
  const unreviewedCollisions = [];
  for (const id of Object.keys(tags).sort()) {
    if (claims.has(id)) {
      continue;
    }
    const name = displayName(id);
    if (
      (!reviewedVariants.has(id) &&
        zenCollisionKeys.has(normalizeSearchText(id))) ||
      (!reviewedVariants.has(id) &&
        zenCollisionKeys.has(normalizeSearchText(name)))
    ) {
      unreviewedCollisions.push(id);
      continue;
    }
    const iconTags = tags[id] ?? [];
    output.push(
      createIconRecord({
        id,
        provider: "lucide",
        name,
        tags: iconTags,
        categories: [categoryForLucideIcon(id, iconTags)],
        source: sourceFor(id),
        kind: "svg",
        order: output.length,
      }),
    );
  }
  if (unreviewedCollisions.length) {
    throw new Error(
      `Unreviewed Lucide collision(s): ${unreviewedCollisions.join(", ")}; claim each from the matching Zen record`,
    );
  }
  return output;
}

function serializeCatalog(records) {
  return `/* This Source Code Form is subject to the terms of the Mozilla Public\n * License, v. 2.0. If a copy of the MPL was not distributed with this\n * file, You can obtain one at http://mozilla.org/MPL/2.0/. */\n\n// Generated by scripts/generate_zen_icon_catalog.mjs from lucide-static 1.33.0.\n// Do not edit by hand.\nexport const LUCIDE_ICONS = Object.freeze(${JSON.stringify(records, null, 2)});\n`;
}

function serializeJarInclude(records) {
  const lines = records.map((record) => {
    const filename = `${record.id.slice("lucide:".length)}.svg`;
    return `*  skin/classic/browser/zen-icons/lucide/${filename}  (../shared/zen-icons/common/lucide/${filename})`;
  });
  return `# Generated by scripts/generate_zen_icon_catalog.mjs. Do not edit.\n${lines.join("\n")}\n`;
}

async function exists(filePath) {
  try {
    await access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function loadCatalog() {
  const tags = JSON.parse(
    await readFile(path.join(LUCIDE_PACKAGE_ROOT, "tags.json"), "utf8"),
  );
  return buildLucideCatalog({
    tags,
    zenIcons: ZEN_BUILT_IN_ICONS,
    sourceFor: (id) => `chrome://browser/skin/zen-icons/lucide/${id}.svg`,
  });
}

async function verifySourceAssets(records) {
  for (const record of records) {
    const id = record.id.slice("lucide:".length);
    const sourcePath = path.join(LUCIDE_PACKAGE_ROOT, "icons", `${id}.svg`);
    if (!(await exists(sourcePath))) {
      throw new Error(`Missing Lucide source SVG: ${id}`);
    }
  }
}

async function generatedFilesMatch(records, catalogText, jarText) {
  if (
    !(await exists(OUTPUT_CATALOG)) ||
    !(await exists(OUTPUT_JAR_INCLUDE)) ||
    !(await exists(OUTPUT_LICENSE))
  ) {
    return false;
  }
  if (
    (await readFile(OUTPUT_CATALOG, "utf8")) !== catalogText ||
    (await readFile(OUTPUT_JAR_INCLUDE, "utf8")) !== jarText ||
    (await readFile(OUTPUT_LICENSE, "utf8")) !==
      (await readFile(LUCIDE_LICENSE, "utf8"))
  ) {
    return false;
  }
  const expected = new Set(
    records.map((record) => `${record.id.slice("lucide:".length)}.svg`),
  );
  const actual = new Set(
    (await readdir(OUTPUT_ASSET_DIRECTORY)).filter((name) =>
      name.endsWith(".svg"),
    ),
  );
  if (
    expected.size !== actual.size ||
    ![...expected].every((name) => actual.has(name))
  ) {
    return false;
  }
  for (const filename of expected) {
    const expectedSvg = transformLucideSvg(
      await readFile(path.join(LUCIDE_PACKAGE_ROOT, "icons", filename), "utf8"),
    );
    if (
      (await readFile(path.join(OUTPUT_ASSET_DIRECTORY, filename), "utf8")) !==
      expectedSvg
    ) {
      return false;
    }
  }
  return true;
}

async function writeGeneratedFiles(records, catalogText, jarText) {
  await mkdir(OUTPUT_ASSET_DIRECTORY, { recursive: true });
  const expected = new Set(
    records.map((record) => `${record.id.slice("lucide:".length)}.svg`),
  );
  for (const filename of await readdir(OUTPUT_ASSET_DIRECTORY)) {
    if (filename.endsWith(".svg") && !expected.has(filename)) {
      await unlink(path.join(OUTPUT_ASSET_DIRECTORY, filename));
    }
  }
  for (const filename of expected) {
    await writeFile(
      path.join(OUTPUT_ASSET_DIRECTORY, filename),
      transformLucideSvg(
        await readFile(
          path.join(LUCIDE_PACKAGE_ROOT, "icons", filename),
          "utf8",
        ),
      ),
      "utf8",
    );
  }
  await writeFile(OUTPUT_CATALOG, catalogText, "utf8");
  await writeFile(OUTPUT_JAR_INCLUDE, jarText, "utf8");
  await writeFile(OUTPUT_LICENSE, await readFile(LUCIDE_LICENSE, "utf8"));
  if (await exists(LEGACY_OUTPUT_LICENSE)) {
    await unlink(LEGACY_OUTPUT_LICENSE);
  }
}

async function main() {
  const records = await loadCatalog();
  await verifySourceAssets(records);
  const catalogText = serializeCatalog(records);
  const jarText = serializeJarInclude(records);
  if (process.argv.includes("--check")) {
    if (!(await generatedFilesMatch(records, catalogText, jarText))) {
      throw new Error("Generated Lucide catalog or assets are stale");
    }
    console.log(`Lucide catalog is current (${records.length} icons).`);
    return;
  }
  await writeGeneratedFiles(records, catalogText, jarText);
  console.log(`Generated ${records.length} deduplicated Lucide icons.`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
