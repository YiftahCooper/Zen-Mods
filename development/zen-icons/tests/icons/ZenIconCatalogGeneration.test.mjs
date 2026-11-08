/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

import assert from "node:assert/strict";
import test from "node:test";

import { ZEN_BUILT_IN_ICONS } from "../../src/zen/common/emojis/ZenBuiltInIcons.mjs";
import { LUCIDE_ICONS } from "../../src/zen/common/emojis/ZenLucideIcons.mjs";
import {
  buildLucideCatalog,
  categoryForLucideIcon,
  transformLucideSvg,
} from "../../scripts/generate_zen_icon_catalog.mjs";

const zenPhone = {
  id: "zen:call",
  name: "Phone call",
  aliases: ["phone"],
  lucideEquivalentIds: ["phone"],
};

test("excludes Lucide concepts claimed by canonical Zen icons", () => {
  const records = buildLucideCatalog({
    tags: {
      phone: ["telephone", "call"],
      dog: ["animal", "pet"],
    },
    zenIcons: [zenPhone],
    sourceFor: (id) => `lucide/${id}.svg`,
  });

  assert.deepEqual(
    records.map((record) => record.id),
    ["lucide:dog"],
  );
  assert.deepEqual(records[0].categories, ["Animals"]);
});

test("generated Zen and Lucide providers contain no canonical duplicates", () => {
  const lucideIds = new Set(LUCIDE_ICONS.map((record) => record.id));
  for (const zenIcon of ZEN_BUILT_IN_ICONS) {
    for (const equivalent of zenIcon.lucideEquivalentIds ?? []) {
      assert.ok(
        !lucideIds.has(`lucide:${equivalent}`),
        `${zenIcon.id} remains canonical over lucide:${equivalent}`,
      );
    }
  }
  const combinedIds = [
    ...ZEN_BUILT_IN_ICONS.map((record) => record.id),
    ...LUCIDE_ICONS.map((record) => record.id),
  ];
  assert.equal(new Set(combinedIds).size, combinedIds.length);
});

test("rejects unreviewed name or alias collisions", () => {
  assert.throws(
    () =>
      buildLucideCatalog({
        tags: { phone: ["telephone"] },
        zenIcons: [{ ...zenPhone, lucideEquivalentIds: [] }],
        sourceFor: (id) => `lucide/${id}.svg`,
      }),
    /Unreviewed Lucide collision.*phone/i,
  );
});

test("rejects one Lucide identifier claimed by multiple Zen records", () => {
  assert.throws(
    () =>
      buildLucideCatalog({
        tags: { phone: ["telephone"] },
        zenIcons: [zenPhone, { ...zenPhone, id: "zen:second-phone" }],
        sourceFor: (id) => `lucide/${id}.svg`,
      }),
    /claimed by multiple Zen icons.*phone/i,
  );
});

test("maps useful Lucide concepts into stable semantic categories", () => {
  assert.equal(categoryForLucideIcon("dog", ["animal", "pet"]), "Animals");
  assert.equal(categoryForLucideIcon("flag", ["country", "nation"]), "Flags");
  assert.equal(
    categoryForLucideIcon("cloud-rain", ["weather", "rain"]),
    "Weather",
  );
  assert.equal(categoryForLucideIcon("braces", ["code"]), "Development");
  assert.equal(categoryForLucideIcon("unclassified", []), "Other");
});

test("converts Lucide color hooks for Firefox privileged UI", () => {
  const source = '<svg stroke="currentColor" fill="currentColor"></svg>';
  const transformed = transformLucideSvg(source);
  assert.ok(
    transformed.startsWith(
      "<!--\n   - This Source Code Form is subject to the terms of the Mozilla Public",
    ),
  );
  assert.ok(
    transformed.endsWith(
      '<svg stroke="context-stroke" fill="context-fill"></svg>',
    ),
  );
});
