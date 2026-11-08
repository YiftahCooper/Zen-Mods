/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

import { ZEN_BUILT_IN_ICONS } from "../../src/zen/common/emojis/ZenBuiltInIcons.mjs";
import {
  createIconRecord,
  groupIconRecords,
  searchIconRecords,
} from "../../src/zen/common/emojis/ZenIconRegistry.mjs";

test("catalogs every current Zen picker icon once with useful metadata", async () => {
  const selectableDirectory = fileURLToPath(
    new URL(
      "../../src/browser/themes/shared/zen-icons/common/selectable/",
      import.meta.url,
    ),
  );
  const packagedSvgs = (await readdir(selectableDirectory))
    .filter((name) => name.endsWith(".svg"))
    .sort();
  const catalogFilenames = ZEN_BUILT_IN_ICONS.map((record) =>
    record.source.split("/").at(-1),
  ).sort();

  assert.equal(ZEN_BUILT_IN_ICONS.length, 86);
  assert.deepEqual(
    packagedSvgs.filter((name) => name !== "logo-github.svg"),
    catalogFilenames,
  );
  assert.equal(new Set(ZEN_BUILT_IN_ICONS.map((record) => record.id)).size, 86);
  for (const record of ZEN_BUILT_IN_ICONS) {
    assert.equal(record.provider, "zen");
    assert.ok(record.name.length > 1, `${record.id} has a readable name`);
    assert.ok(record.tags.length > 0, `${record.id} has tags`);
    assert.ok(record.categories.length > 0, `${record.id} has a category`);
  }
});

test("generated emoji data retains a semantic category", async () => {
  const emojiDataPath = fileURLToPath(
    new URL(
      "../../src/zen/common/emojis/ZenEmojisData.min.mjs",
      import.meta.url,
    ),
  );
  const context = {};
  vm.runInNewContext(await readFile(emojiDataPath, "utf8"), context);
  assert.ok(context.ZenEmojisData.length > 1000);
  for (const emoji of context.ZenEmojisData) {
    assert.equal(typeof emoji.category, "string");
    assert.ok(emoji.category.length > 0);
  }
});

test("normalizes provider icon records", () => {
  assert.deepEqual(
    createIconRecord({
      id: "american-football",
      provider: "zen",
      name: "American football",
      aliases: ["gridiron"],
      tags: ["NFL", "ball"],
      categories: ["Sports"],
      source: "chrome://example/american-football.svg",
      kind: "svg",
    }),
    {
      id: "zen:american-football",
      provider: "zen",
      name: "American football",
      aliases: ["gridiron"],
      tags: ["nfl", "ball"],
      categories: ["Sports"],
      source: "chrome://example/american-football.svg",
      kind: "svg",
      order: 0,
      searchTokens: [
        "american",
        "football",
        "gridiron",
        "nfl",
        "ball",
        "sports",
      ],
    },
  );
});

test("finds one icon through independent tags and rewards more query matches", () => {
  const football = createIconRecord({
    id: "football",
    provider: "zen",
    name: "American football",
    aliases: ["gridiron"],
    tags: ["nfl", "ball", "sport"],
    categories: ["Sports"],
    source: "football.svg",
    kind: "svg",
  });
  const footballHelmet = createIconRecord({
    id: "helmet",
    provider: "lucide",
    name: "Helmet",
    tags: ["sport", "safety"],
    categories: ["Sports"],
    source: "helmet.svg",
    kind: "svg",
  });

  for (const query of ["football", "nfl", "gridiron", "ball", "sport"]) {
    assert.equal(searchIconRecords([football], query)[0]?.id, football.id);
  }
  assert.equal(
    searchIconRecords([footballHelmet, football], "football sport")[0]?.id,
    football.id,
  );
});

test("filters providers before search and groups providers by semantic category", () => {
  const records = [
    createIconRecord({
      id: "paw",
      provider: "zen",
      name: "Paw",
      tags: ["pet"],
      categories: ["Animals"],
      source: "paw.svg",
      kind: "svg",
    }),
    createIconRecord({
      id: "dog",
      provider: "lucide",
      name: "Dog",
      tags: ["pet"],
      categories: ["Animals"],
      source: "dog.svg",
      kind: "svg",
    }),
  ];

  assert.deepEqual(
    searchIconRecords(records, "pet", { providers: new Set(["zen"]) }).map(
      (record) => record.id,
    ),
    ["zen:paw"],
  );
  assert.deepEqual(
    groupIconRecords(records).map((group) => ({
      category: group.category,
      providers: group.records.map((record) => record.provider),
    })),
    [{ category: "Animals", providers: ["zen", "lucide"] }],
  );
});

test("renders each icon in exactly one primary category", () => {
  const record = createIconRecord({
    id: "touchdown",
    provider: "custom",
    name: "Touchdown",
    tags: ["sport", "celebration"],
    categories: ["Sports", "Events"],
    source: "touchdown.png",
    kind: "raster",
  });

  const groups = groupIconRecords([record]);
  assert.deepEqual(
    groups.map((group) => group.category),
    ["Sports"],
  );
  assert.deepEqual(
    groups.flatMap((group) => group.records).map((item) => item.id),
    [record.id],
  );
  assert.equal(searchIconRecords([record], "events")[0]?.id, record.id);
});
