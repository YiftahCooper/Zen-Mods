/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { createIconRecord } from "./ZenIconRegistry.mjs";
import { normalizeCategoryMetadata, categoryKey, canonicalCategoryName, categoryPresentation } from "./ZenIconCategories.mjs";
import {isCategoryArtworkFile, resolveCategoryArtwork} from './ZenCategoryArtwork.mjs';

export const CUSTOM_ICON_DIRECTORY_NAME = "zen-icon-packs";
export const MAX_CUSTOM_ICON_BYTES = 5 * 1024 * 1024;
export const MAX_CUSTOM_MANIFEST_BYTES = 1024 * 1024;
export const SUPPORTED_CUSTOM_ICON_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".avif",
  ".ico",
]);

function normalizedSegments(relativePath) {
  const normalized = String(relativePath ?? "").replaceAll("\\", "/");
  const segments = normalized.split("/").filter(Boolean);
  if (
    normalized.startsWith("/") ||
    /^[a-z]:/i.test(normalized) ||
    segments.some((segment) => segment === "." || segment === "..")
  ) {
    return null;
  }
  return segments;
}

function extensionOf(filename) {
  const dot = filename.lastIndexOf(".");
  return dot < 0 ? "" : filename.slice(dot).toLocaleLowerCase("en-US");
}

function humanizeFilename(filename) {
  const extension = extensionOf(filename);
  return filename
    .slice(0, extension ? -extension.length : undefined)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((word) =>
      /^[A-Z0-9]{2,}$/.test(word)
        ? word
        : word[0].toUpperCase() + word.slice(1).toLocaleLowerCase("en-US"),
    )
    .join(" ");
}

function stringList(value) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === "string" && item.trim())
    : [];
}

export function parseCustomIconManifest(text) {
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function customIconId(pack, relativeWithinPack) {
  const encodedPack = encodeURIComponent(pack);
  const encodedPath = relativeWithinPack
    .split("/")
    .map(encodeURIComponent)
    .join("/");
  return `custom:${encodedPack}:${encodedPath}`;
}

export function buildCustomIconCatalog({ files, manifests = new Map(), categoryImageSources = new Map() }) {
  const records = [];
  const skipped = [];
  const categoryMetadata = {};

  for (const [, manifest] of [...manifests].sort(([left], [right]) =>
    left.localeCompare(right, "en", { sensitivity: "base" }) || left.localeCompare(right,'en'),
  )) {
    for(const [rawName,definition] of Object.entries(normalizeCategoryMetadata(manifest?.$categories))) {
      const name=canonicalCategoryName(rawName,Object.keys(categoryMetadata));
      Object.defineProperty(categoryMetadata,name,{enumerable:true,configurable:true,writable:true,value:{
        ...definition,aliases:[...new Set([...(categoryMetadata[name]?.aliases || []),...definition.aliases])],
      }});
    }
  }

  for (const file of files) {
    if (isCategoryArtworkFile(file.relativePath)) continue;
    const segments = normalizedSegments(file.relativePath);
    const extension = segments?.length ? extensionOf(segments.at(-1)) : "";
    if (
      !segments ||
      segments.length < 2 ||
      file.isSymlink ||
      !SUPPORTED_CUSTOM_ICON_EXTENSIONS.has(extension) ||
      !Number.isFinite(file.size) ||
      file.size <= 0 ||
      file.size > MAX_CUSTOM_ICON_BYTES
    ) {
      skipped.push({ path: file.relativePath, reason: "invalid" });
      continue;
    }

    const pack = segments[0];
    const filename = segments.at(-1);
    const relativeWithinPack = segments.slice(1).join("/");
    const inferredCategories = segments.slice(1, -1);
    const manifest = manifests.get(pack);
    const metadata =
      manifest?.[relativeWithinPack] &&
      typeof manifest[relativeWithinPack] === "object" &&
      !Array.isArray(manifest[relativeWithinPack])
        ? manifest[relativeWithinPack]
        : {};
    const inferredName = humanizeFilename(filename) || filename;
    const categories = [
      ...new Set([...inferredCategories, ...stringList(metadata.categories)]),
    ];

    try {
      records.push(
        createIconRecord({
          id: customIconId(pack, relativeWithinPack),
          provider: "custom",
          name:
            typeof metadata.name === "string" && metadata.name.trim()
              ? metadata.name.trim()
              : inferredName,
          aliases: [],
          tags: [
            pack,
            ...inferredCategories,
            inferredName,
            ...stringList(metadata.tags),
          ],
          categories: categories.length ? categories : ["Other"],
          source: file.source,
          kind: "raster",
          pack,
          path: relativeWithinPack,
          order: records.length,
        }),
      );
    } catch {
      skipped.push({ path: file.relativePath, reason: "invalid-record" });
    }
  }

  for(const [key,imageSources] of categoryImageSources) {
    const name=canonicalCategoryName(key,[...Object.keys(categoryMetadata),...records.flatMap(r=>r.categories)]);
    categoryMetadata[name]={...(categoryMetadata[name] || {icon:categoryPresentation(name).icon,aliases:[]}),imageSources};
  }
  return { records, skipped, categoryMetadata };
}

export function customIconValueToRelativePath(value) {
  const match = /^custom:([^:]+):(.+)$/.exec(String(value ?? ""));
  if (!match) {
    return null;
  }
  try {
    const pack = decodeURIComponent(match[1]);
    const relativeWithinPack = match[2]
      .split("/")
      .map(decodeURIComponent)
      .join("/");
    return (
      normalizedSegments(`${pack}/${relativeWithinPack}`)?.join("/") ?? null
    );
  } catch {
    return null;
  }
}

function relativePathFromBase(basePath, filePath) {
  if (
    !filePath.startsWith(`${basePath}\\`) &&
    !filePath.startsWith(`${basePath}/`)
  ) {
    return null;
  }
  return filePath.slice(basePath.length + 1).replaceAll("\\", "/");
}

export async function scanCustomIconPacks({
  profileDir = globalThis.PathUtils?.profileDir,
  rootDirectory = null,
  ioUtils = globalThis.IOUtils,
  pathUtils = globalThis.PathUtils,
  sourceFor = (filePath) => {
    const file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
    file.initWithPath(filePath);
    return Services.io.newFileURI(file).spec;
  },
  isSymlinkFor = (filePath) => {
    const file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
    file.initWithPath(filePath);
    return file.exists() && file.isSymlink();
  },
} = {}) {
  const basePath =
    rootDirectory ?? pathUtils.join(profileDir, CUSTOM_ICON_DIRECTORY_NAME);
  const files = [];
  const manifestFiles = [];
  const scanSkipped = [];
  const warnings = [];

  // A linked root/ancestor escapes containment just as a linked child does.
  for (let ancestor = basePath; ancestor; ) {
    // Stop at volume roots: nsIFile rejects drive-relative paths such as C:.
    if (
      /^[a-z]:[\\/]*$/i.test(ancestor) ||
      /^[\\/]+$/.test(ancestor) ||
      /^\\\\[^\\]+\\[^\\]+[\\/]*$/.test(ancestor)
    )
      break;
    if (isSymlinkFor(ancestor)) {
      return {
        basePath,
        records: [],
        skipped: [],
        categoryMetadata: {},
        warnings: ["Linked custom icon directory is not supported."],
      };
    }
    const parent = ancestor.replace(/[\\/][^\\/]+[\\/]*$/, "");
    if (!parent || parent === ancestor) break;
    ancestor = parent;
  }
  await ioUtils.makeDirectory(basePath, { ignoreExisting: true });

  async function visit(directory, depth = 0) {
    if (depth > 12) {
      return;
    }
    let children;
    try {
      children = await ioUtils.getChildren(directory);
    } catch {
      warnings.push(`Unable to read custom icon directory: ${directory}`);
      return;
    }
    for (const child of children) {
      try {
        if (isSymlinkFor(child)) {
          continue;
        }
        const stat = await ioUtils.stat(child);
        if (stat.type === "directory") {
          await visit(child, depth + 1);
        } else if (stat.type === "regular") {
          const relativePath = relativePathFromBase(basePath, child);
          if (!relativePath) {
            continue;
          }
          if (/^[^/]+\/icons\.json$/i.test(relativePath)) {
            if (stat.size > MAX_CUSTOM_MANIFEST_BYTES)
              warnings.push(
                `Ignoring oversized custom icon manifest: ${relativePath}`,
              );
            else manifestFiles.push({ path: child, relativePath });
          } else if (/\/icons\.json$/i.test(relativePath)) {
            warnings.push(`Ignoring nested icons.json: ${relativePath}. Put the pack directly inside the Custom Icons Folder.`);
          } else {
            files.push({
              relativePath,
              size: stat.size,
              source: sourceFor(child),
            });
          }
        }
      } catch {
        scanSkipped.push({
          path: relativePathFromBase(basePath, child) ?? child,
          reason: "unreadable",
        });
      }
    }
  }

  await visit(basePath);
  const manifests = new Map();
  for (const manifestFile of manifestFiles) {
    const pack = manifestFile.relativePath.split("/")[0];
    let manifest = null;
    try {
      manifest = parseCustomIconManifest(
        await ioUtils.readUTF8(manifestFile.path),
      );
    } catch {
      // Filename/folder inference remains available without a manifest.
    }
    manifests.set(pack, manifest);
    if (!manifest) {
      warnings.push(`Ignoring malformed custom icon manifest for ${pack}`);
    }
  }

  const artwork=await resolveCategoryArtwork({files,manifests,basePath,ioUtils,pathUtils,isSymlinkFor});
  warnings.push(...artwork.warnings);
  const catalog = buildCustomIconCatalog({ files, manifests, categoryImageSources:artwork.images });
  return {
    basePath,
    warnings,
    records: catalog.records,
    categoryMetadata: catalog.categoryMetadata,
    skipped: [...catalog.skipped, ...scanSkipped],
  };
}

export async function openCustomIconFolder({
  profileDir = globalThis.PathUtils.profileDir,
  ioUtils = globalThis.IOUtils,
  pathUtils = globalThis.PathUtils,
} = {}) {
  const directory = pathUtils.join(profileDir, CUSTOM_ICON_DIRECTORY_NAME);
  await ioUtils.makeDirectory(directory, { ignoreExisting: true });
  const file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
  file.initWithPath(directory);
  file.launch();
}
