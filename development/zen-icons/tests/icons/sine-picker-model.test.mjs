import assert from "node:assert/strict";
import test from "node:test";

import { createIconRecord } from "../../src/zen/common/emojis/ZenIconRegistry.mjs";
import { createPickerModel } from "../../src/zen-icons-sine/picker-model.mjs";

const RECORDS = [
  createIconRecord({
    id: "dog",
    provider: "emoji",
    name: "Dog",
    tags: ["pet", "canine"],
    categories: ["Animals"],
    source: "🐕",
    kind: "emoji",
  }),
  createIconRecord({
    id: "paw",
    provider: "zen",
    name: "Paw",
    tags: ["pet", "animal"],
    categories: ["Animals"],
    source: "chrome://browser/skin/zen-icons/selectable/paw.svg",
    kind: "svg",
  }),
  createIconRecord({
    id: "briefcase",
    provider: "lucide",
    name: "Briefcase",
    tags: ["job", "office"],
    categories: ["Work"],
    source: "chrome://sine/content/zen-icons-local/lucide/briefcase.svg",
    kind: "svg",
  }),
];

test("enables every available provider by default", () => {
  const model = createPickerModel(RECORDS);
  assert.deepEqual(model.snapshot().enabledProviders, [
    "emoji",
    "zen",
    "lucide",
  ]);
});

test("folder mode excludes emoji without disabling icon providers", () => {
  const model = createPickerModel(RECORDS, { onlyIcons: true });
  const state = model.snapshot();

  assert.deepEqual(state.enabledProviders, ["zen", "lucide"]);
  assert.equal(
    state.groups
      .flatMap((group) => group.records)
      .some((record) => record.provider === "emoji"),
    false,
  );
});

test("provider filtering and inclusive tag search combine", () => {
  const model = createPickerModel(RECORDS);
  model.setQuery("pet");
  model.setProviderEnabled("emoji", false);

  assert.deepEqual(
    model
      .snapshot()
      .groups.flatMap((group) => group.records)
      .map((record) => record.id),
    ["zen:paw"],
  );
});

test("category navigation clears search and keeps provider filters", () => {
  const model = createPickerModel(RECORDS);
  model.setQuery("office");
  model.setProviderEnabled("emoji", false);
  model.navigateCategory("Animals");

  const state = model.snapshot();
  assert.equal(state.query, "");
  assert.equal(state.navigationTarget, "Animals");
  assert.deepEqual(state.enabledProviders, ["zen", "lucide"]);
  assert.ok(state.groups.some((group) => group.category === "Animals"));
  assert.ok(state.groups.some((group) => group.category === "Work"));
});

test("category shortcuts remain available when search or provider filters hide them", () => {
  const model = createPickerModel(RECORDS);
  model.setQuery("office");
  model.setProviderEnabled("emoji", false);
  model.setProviderEnabled("zen", false);

  assert.deepEqual(model.snapshot().availableCategories, ["Animals", "Work"]);
});

test("sorts category navigation and groups alphabetically by canonical name", () => {
  const records = [RECORDS[2], RECORDS[0], RECORDS[1]];
  const model = createPickerModel(records);
  const state = model.snapshot();

  assert.deepEqual(state.availableCategories, ["Animals", "Work"]);
  assert.deepEqual(
    state.groups.map((group) => group.category),
    ["Animals", "Work"],
  );
});

test("decorates categories while keeping plain names as navigation keys", () => {
  const model = createPickerModel(RECORDS, {
    categoryMetadata: {
      Animals: { icon: "🐾", aliases: ["creatures"] },
      Work: { icon: "💼", aliases: ["jobs"] },
    },
  });

  let state = model.snapshot();
  assert.deepEqual(
    state.groups.map(({ category, categoryLabel }) => ({
      category,
      categoryLabel,
    })),
    [
      { category: "Animals", categoryLabel: "🐾 Animals" },
      { category: "Work", categoryLabel: "💼 Work" },
    ],
  );

  model.navigateCategory("🐾 Animals");
  state = model.snapshot();
  assert.equal(state.navigationTarget, "Animals");
});

test("pins a context-appropriate default choice ahead of categories", () => {
  const folder = createPickerModel(RECORDS, {
    onlyIcons: true,
    defaultKind: "folder",
  }).snapshot();
  const space = createPickerModel(RECORDS, {
    defaultKind: "space",
  }).snapshot();

  assert.deepEqual(folder.defaultChoice, {
    kind: "folder",
    label: "Default Folder Icon",
    value: null,
  });
  assert.deepEqual(space.defaultChoice, {
    kind: "space",
    label: "Default Space Icon",
    value: null,
  });
});
