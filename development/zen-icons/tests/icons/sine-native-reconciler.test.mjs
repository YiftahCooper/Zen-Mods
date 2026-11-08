import assert from "node:assert/strict";
import test from "node:test";

import { createIconRecord } from "../../src/zen/common/emojis/ZenIconRegistry.mjs";
import { reconcileNativeIcons } from "../../src/zen-icons-sine/native-reconciler.mjs";

const KNOWN = createIconRecord({
  id: "book",
  provider: "zen",
  name: "Book",
  tags: ["read"],
  categories: ["Reading"],
  source: "chrome://browser/skin/zen-icons/selectable/book.svg",
  kind: "svg",
});

test("keeps known native values once and appends an unknown native value once", () => {
  const unknown =
    "chrome://browser/skin/zen-icons/selectable/brand-new-camera.svg";
  const result = reconcileNativeIcons(
    [KNOWN],
    [KNOWN.source, unknown, unknown],
  );

  assert.equal(
    result.records.filter((record) => record.source === KNOWN.source).length,
    1,
  );
  assert.equal(
    result.records.filter((record) => record.source === unknown).length,
    1,
  );
  assert.deepEqual(result.unknownValues, [unknown]);

  const appended = result.records.find((record) => record.source === unknown);
  assert.equal(appended.provider, "zen");
  assert.equal(appended.name, "Brand New Camera");
  assert.deepEqual(appended.categories, ["Other"]);
  assert.ok(appended.searchTokens.includes("camera"));
});

test("ignores empty and malformed live values without changing the catalog", () => {
  const result = reconcileNativeIcons([KNOWN], ["", null, "not a resource"]);

  assert.deepEqual(result.records, [KNOWN]);
  assert.deepEqual(result.unknownValues, []);
});
