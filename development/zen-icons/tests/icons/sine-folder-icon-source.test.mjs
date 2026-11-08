import assert from "node:assert/strict";
import test from "node:test";

import { folderSelectionValueForRecord } from "../../src/zen-icons-sine/folder-icon-source.mjs";

const environment = {
  profileDir: "/profile",
  joinPath: (...parts) => parts.join("/"),
  toFileURL: (filePath) => `file://${filePath}`,
};

test("converts Sine Lucide sources to a folder-renderable local file URL", () => {
  assert.equal(
    folderSelectionValueForRecord(
      {
        id: "lucide:briefcase",
        provider: "lucide",
        source:
          "chrome://sine/content/zen-icons-local/lucide/briefcase.svg",
      },
      environment,
    ),
    "file:///profile/chrome/sine-mods/zen-icons-local/lucide/briefcase.svg",
  );
});

test("migrates legacy custom sources to the persistent root without the SVG fragment", () => {
  assert.equal(
    folderSelectionValueForRecord(
      {
        id: "custom:My%20Icons:Sports/football.png",
        provider: "custom",
        source:
          "chrome://sine/content/zen-icons-local/custom/My%20Icons/Sports/football.png#zen-icon.svg",
      },
      environment,
    ),
    "file:///profile/zen-icon-packs/My Icons/Sports/football.png",
  );
});

test('persistent chrome artwork maps to the same external file for native folders',()=>{
  assert.equal(folderSelectionValueForRecord({provider:'custom',source:'chrome://zen-icons-custom/content/Pack/icon.png#zen-icon.svg'},environment),'file:///profile/zen-icon-packs/Pack/icon.png');
});

test("uses portable custom IDs when Zen supports resolving them", () => {
  assert.equal(
    folderSelectionValueForRecord(
      {
        id: "custom:My%20Icons:Sports/football.png",
        provider: "custom",
        source:
          "chrome://sine/content/zen-icons-local/custom/My%20Icons/Sports/football.png#zen-icon.svg",
      },
      { ...environment, supportsCustomIconIds: true },
    ),
    "custom:My%20Icons:Sports/football.png",
  );
});

test("leaves Zen's native icon sources unchanged", () => {
  assert.equal(
    folderSelectionValueForRecord(
      {
        id: "zen:folder.svg",
        provider: "zen",
        source: "chrome://browser/skin/zen-icons/selectable/folder.svg",
      },
      environment,
    ),
    "chrome://browser/skin/zen-icons/selectable/folder.svg",
  );
});
