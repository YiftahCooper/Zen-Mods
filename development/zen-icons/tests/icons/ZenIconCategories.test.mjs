import assert from "node:assert/strict";
import test from "node:test";

import {
  categoryPresentation,
  mergeCategoryMetadata,
  resolveCategoryName,
} from "../../src/zen/common/emojis/ZenIconCategories.mjs";

test("bundled category metadata provides a colorful semantic heading", () => {
  assert.deepEqual(categoryPresentation("Sports"), {
    name: "Sports",
    icon: "🏅",
    label: "🏅 Sports",
    aliases: ["sport", "athletics"],
  });
});

test("plain, decorated, and alias names resolve to one canonical category", () => {
  const metadata = mergeCategoryMetadata({
    Research: { icon: "🔬", aliases: ["studies"] },
  });

  assert.equal(resolveCategoryName("Research", metadata), "Research");
  assert.equal(resolveCategoryName("🔬 Research", metadata), "Research");
  assert.equal(resolveCategoryName("studies", metadata), "Research");
});

test("unknown custom categories receive a stable generic icon", () => {
  assert.deepEqual(categoryPresentation("My Private Pack", {}), {
    name: "My Private Pack",
    icon: "🗂️",
    label: "🗂️ My Private Pack",
    aliases: [],
  });
});
