import assert from "node:assert/strict";
import test from "node:test";

import {
  CUSTOM_ICON_SOURCE_PREFIX,
  customIconSourceAvailability,
  DEFAULT_ICON_FALLBACK,
  resolveCustomImageDisplaySource,
} from "../../src/zen-icons-sine/custom-image-fallback.mjs";

const CUSTOM = `${CUSTOM_ICON_SOURCE_PREFIX}Pack/icon.png#zen-icon.svg`;

test("missing custom images use a safe native fallback", () => {
  assert.equal(
    resolveCustomImageDisplaySource(CUSTOM, new Set()),
    DEFAULT_ICON_FALLBACK,
  );
});

test("folder-safe custom file URLs participate in missing-file detection", () => {
  const local =
    "file:///profile/chrome/sine-mods/zen-icons-local/custom/Pack/icon.png";

  assert.equal(customIconSourceAvailability(local, new Set([local])), true);
  assert.equal(customIconSourceAvailability(local, new Set()), false);
});

test('external persistent artwork participates in missing-file detection',()=>{
  for(const source of ['chrome://zen-icons-custom/content/Pack/icon.png#zen-icon.svg','file:///profile/zen-icon-packs/Pack/icon.png']){
    assert.equal(customIconSourceAvailability(source,new Set([source])),true);
    assert.equal(customIconSourceAvailability(source,new Set()),false);
  }
});

test("native and Lucide sources are not classified as missing custom files", () => {
  assert.equal(
    customIconSourceAvailability(
      "file:///profile/chrome/sine-mods/zen-icons-local/lucide/dog.svg",
      new Set(),
    ),
    null,
  );
  assert.equal(
    customIconSourceAvailability(
      "chrome://browser/skin/zen-icons/selectable/star.svg",
      new Set(),
    ),
    null,
  );
});

test("restoring a custom file restores its stable source", () => {
  assert.equal(
    resolveCustomImageDisplaySource(CUSTOM, new Set([CUSTOM])),
    CUSTOM,
  );
});

test("non-custom image sources are unchanged", () => {
  const native = "chrome://browser/skin/zen-icons/selectable/star.svg";
  assert.equal(resolveCustomImageDisplaySource(native, new Set()), native);
});
