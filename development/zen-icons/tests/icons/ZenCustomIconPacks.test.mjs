/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCustomIconCatalog,
  parseCustomIconManifest,
  scanCustomIconPacks,
} from "../../src/zen/common/emojis/ZenCustomIconPacks.mjs";

test("infers pack, category, name, and tags from a friendly path", () => {
  const { records, skipped } = buildCustomIconCatalog({
    files: [
      {
        relativePath: "My Icons/Sports/AmericanFootball-NFL.jpg",
        size: 1234,
        source:
          "file:///profile/zen-icon-packs/My%20Icons/Sports/AmericanFootball-NFL.jpg",
      },
    ],
  });

  assert.equal(skipped.length, 0);
  assert.equal(records.length, 1);
  assert.equal(
    records[0].id,
    "custom:My%20Icons:Sports/AmericanFootball-NFL.jpg",
  );
  assert.equal(records[0].pack, "My Icons");
  assert.equal(records[0].name, "American Football NFL");
  assert.deepEqual(records[0].categories, ["Sports"]);
  for (const token of [
    "american",
    "football",
    "nfl",
    "sports",
    "my",
    "icons",
  ]) {
    assert.ok(records[0].searchTokens.includes(token), `includes ${token}`);
  }
});

test("optional manifest adds metadata and can replace only the display name", () => {
  const manifests = new Map([
    [
      "My Icons",
      parseCustomIconManifest(
        JSON.stringify({
          "Sports/football.png": {
            name: "American football",
            tags: ["NFL", "gridiron"],
            categories: ["Games"],
          },
        }),
      ),
    ],
  ]);
  const { records } = buildCustomIconCatalog({
    files: [
      {
        relativePath: "My Icons/Sports/football.png",
        size: 100,
        source: "file:///football.png",
      },
    ],
    manifests,
  });

  assert.equal(records[0].name, "American football");
  assert.deepEqual(records[0].categories, ["Sports", "Games"]);
  assert.ok(records[0].tags.includes("nfl"));
  assert.ok(records[0].tags.includes("gridiron"));
});

test("manifest category metadata keeps a plain key and adds a display icon and aliases", () => {
  const manifests = new Map([
    [
      "My Icons",
      parseCustomIconManifest(
        JSON.stringify({
          $categories: {
            Sports: { icon: "🏅", aliases: ["sport", "athletics"] },
          },
          "Sports/football.png": { tags: ["gridiron"] },
        }),
      ),
    ],
  ]);
  const catalog = buildCustomIconCatalog({
    files: [
      {
        relativePath: "My Icons/Sports/football.png",
        size: 100,
        source: "file:///football.png",
      },
    ],
    manifests,
  });

  assert.deepEqual(catalog.categoryMetadata, {
    Sports: { icon: "🏅", aliases: ["sport", "athletics"] },
  });
  assert.deepEqual(catalog.records[0].categories, ["Sports"]);
});

test("malformed manifests are optional and do not hide images", () => {
  assert.equal(parseCustomIconManifest("not json"), null);
  const { records } = buildCustomIconCatalog({
    files: [
      {
        relativePath: "Pack/Animals/dog-pet.png",
        size: 100,
        source: "file:///dog-pet.png",
      },
    ],
    manifests: new Map([["Pack", null]]),
  });
  assert.equal(records[0].name, "Dog Pet");
  assert.deepEqual(records[0].categories, ["Animals"]);
});

test("skips unsafe, unsupported, empty, and oversized entries", () => {
  const { records, skipped } = buildCustomIconCatalog({
    files: [
      { relativePath: "Pack/good.webp", size: 100, source: "file:///good" },
      { relativePath: "../secret.png", size: 100, source: "file:///secret" },
      { relativePath: "Pack/vector.svg", size: 100, source: "file:///vector" },
      { relativePath: "Pack/empty.png", size: 0, source: "file:///empty" },
      {
        relativePath: "Pack/large.avif",
        size: 5 * 1024 * 1024 + 1,
        source: "file:///large",
      },
      {
        relativePath: "Pack/link.jpeg",
        size: 100,
        source: "file:///link",
        isSymlink: true,
      },
    ],
  });

  assert.deepEqual(
    records.map((record) => record.name),
    ["Good"],
  );
  assert.equal(skipped.length, 5);
});

test("live scanning never follows linked files or directories", async () => {
  const base = "profile/zen-icon-packs";
  const children = new Map([
    [base, [`${base}/Pack`, `${base}/External Link`]],
    [`${base}/Pack`, [`${base}/Pack/dog.png`, `${base}/Pack/broken.png`]],
  ]);
  const visited = [];
  const result = await scanCustomIconPacks({
    profileDir: "profile",
    pathUtils: { join: (...parts) => parts.join("/") },
    ioUtils: {
      makeDirectory: async () => {},
      getChildren: async (directory) => {
        visited.push(directory);
        return children.get(directory) ?? [];
      },
      stat: async (item) => {
        if (item.endsWith("broken.png")) {
          throw new Error("unreadable");
        }
        return item.endsWith("Pack")
          ? { type: "directory", size: -1 }
          : { type: "regular", size: 100 };
      },
      readUTF8: async () => "{}",
    },
    sourceFor: (item) => `file:///${item}`,
    isSymlinkFor: (item) => item.endsWith("External Link"),
  });

  assert.deepEqual(visited, [base, `${base}/Pack`]);
  assert.deepEqual(
    result.records.map((record) => record.id),
    ["custom:Pack:dog.png"],
  );
  assert.deepEqual(result.skipped, [
    { path: "Pack/broken.png", reason: "unreadable" },
  ]);
});

test("live scanning can target Sine's dedicated custom directory", async () => {
  const root = "profile/chrome/sine-mods/zen-icons-local/custom";
  const visited = [];
  const result = await scanCustomIconPacks({
    rootDirectory: root,
    pathUtils: { join: (...parts) => parts.join("/") },
    ioUtils: {
      makeDirectory: async (directory) => visited.push(`make:${directory}`),
      getChildren: async (directory) => {
        visited.push(`read:${directory}`);
        return [];
      },
      stat: async () => ({ type: "regular", size: 1 }),
      readUTF8: async () => "{}",
    },
    isSymlinkFor: () => false,
  });

  assert.equal(result.basePath, root);
  assert.deepEqual(visited, [`make:${root}`, `read:${root}`]);
});

test("linked custom roots and ancestors are refused before creating or scanning directories", async () => {
  for (const linked of ["profile/chrome/custom", "profile/chrome"]) {
    const touched = [];
    const result = await scanCustomIconPacks({
      rootDirectory: "profile/chrome/custom",
      pathUtils: { join: (...p) => p.join("/") },
      ioUtils: {
        makeDirectory: async () => touched.push("make"),
        getChildren: async () => {
          touched.push("read");
          return [];
        },
      },
      isSymlinkFor: (p) => p === linked,
    });
    assert.deepEqual(touched, []);
    assert.equal(result.records.length, 0);
    assert.ok(result.warnings.length);
  }
});
test("oversized metadata is skipped without reading it or hiding the image", async () => {
  const base = "profile/custom";
  let manifestReads = 0;
  const result = await scanCustomIconPacks({
    rootDirectory: base,
    pathUtils: { join: (...p) => p.join("/") },
    isSymlinkFor: () => false,
    sourceFor: (p) => "file:///" + p,
    ioUtils: {
      makeDirectory: async () => {},
      getChildren: async (p) =>
        p === base
          ? [base + "/Pack"]
          : [base + "/Pack/icons.json", base + "/Pack/dog.png"],
      stat: async (p) =>
        p.endsWith("/Pack")
          ? { type: "directory" }
          : {
              type: "regular",
              size: p.endsWith(".json") ? 2 * 1024 * 1024 : 100,
            },
      readUTF8: async () => {
        manifestReads++;
        return "{}";
      },
    },
  });
  assert.equal(manifestReads, 0);
  assert.equal(result.records.length, 1);
  assert.ok(result.warnings.length);
});
