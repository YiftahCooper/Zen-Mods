import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  BZF_FOLDER_COLOR_ATTRIBUTE,
  BZF_FOLDER_COLOR_EVENT,
  applyFolderIconPresentation,
  connectFolderColorBridge,
  createFolderIconPresentation,
  isRecolorableFolderIconSource,
  normalizeProjectedFolderColor,
  selectDefaultFolderIcon,
} from "../../src/zen-icons-sine/folder-presentation.mjs";

function makeFolder(projectedColor = null, projectedVariable = null) {
  const attributes = new Map();
  const properties = new Map();
  if (projectedColor !== null) {
    attributes.set(BZF_FOLDER_COLOR_ATTRIBUTE, projectedColor);
  }
  if (projectedVariable !== null) {
    properties.set("--better-zen-folders-custom-color", projectedVariable);
  }
  const folder = {
    style: {
      getPropertyValue(name) {
        return properties.get(name) ?? "";
      },
      setProperty(name, value) {
        properties.set(name, value);
      },
      removeProperty(name) {
        properties.delete(name);
      },
    },
    getAttribute(name) {
      return attributes.get(name) ?? null;
    },
    toggleAttribute(name, enabled) {
      if (enabled) attributes.set(name, "");
      else attributes.delete(name);
    },
    matches(selector) {
      return selector === "zen-folder";
    },
    closest(selector) {
      return selector === "zen-folder" ? folder : null;
    },
  };
  return { folder, attributes, properties };
}

test("normalizes only six-digit Better Zen Folders colours", () => {
  assert.equal(normalizeProjectedFolderColor(" #A1B2C3 "), "#a1b2c3");
  assert.equal(normalizeProjectedFolderColor("#abc"), null);
  assert.equal(normalizeProjectedFolderColor("red"), null);
  assert.equal(normalizeProjectedFolderColor(null), null);
});

test("recolours only known monochrome Zen and Lucide sources", () => {
  assert.equal(
    isRecolorableFolderIconSource(
      "chrome://browser/skin/zen-icons/selectable/folder.svg",
    ),
    true,
  );
  assert.equal(
    isRecolorableFolderIconSource(
      "chrome://sine/content/zen-icons-local/lucide/football.svg",
    ),
    true,
  );
  assert.equal(
    isRecolorableFolderIconSource(
      "file:///profile/chrome/sine-mods/zen-icons-local/lucide/football.svg",
    ),
    true,
  );
  assert.equal(
    isRecolorableFolderIconSource(
      "file:///profile/zen-icon-packs/Sports/ball.png",
    ),
    false,
  );
});

test("fits monochrome icons inside a coloured outline in black", () => {
  assert.deepEqual(
    createFolderIconPresentation({
      showFolderShape: true,
      source: "chrome://sine/content/zen-icons-local/lucide/football.svg",
      projectedColor: "#4f46e5",
    }),
    {
      folderShapeColor: "#4f46e5",
      hasInnerIcon: true,
      enlargeInnerIcon: false,
      innerIconColor: "#000000",
    },
  );
});

test("enlarges and colours monochrome icons without the outline", () => {
  assert.deepEqual(
    createFolderIconPresentation({
      showFolderShape: false,
      source: "chrome://sine/content/zen-icons-local/lucide/football.svg",
      projectedColor: "#4F46E5",
    }),
    {
      folderShapeColor: "#4f46e5",
      hasInnerIcon: true,
      enlargeInnerIcon: true,
      innerIconColor: "#4f46e5",
    },
  );
});

test("preserves custom raster paint while enlarging it", () => {
  assert.deepEqual(
    createFolderIconPresentation({
      showFolderShape: false,
      source: "file:///profile/zen-icon-packs/Sports/football.jpg",
      projectedColor: "#4f46e5",
    }),
    {
      folderShapeColor: "#4f46e5",
      hasInnerIcon: true,
      enlargeInnerIcon: true,
      innerIconColor: null,
    },
  );
});

test("works without Better Zen Folders", () => {
  assert.deepEqual(
    createFolderIconPresentation({
      showFolderShape: false,
      source: "chrome://sine/content/zen-icons-local/lucide/football.svg",
      projectedColor: null,
    }),
    {
      folderShapeColor: null,
      hasInnerIcon: true,
      enlargeInnerIcon: true,
      innerIconColor: null,
    },
  );
});

test("default folders expose no selected inner icon", () => {
  assert.deepEqual(
    createFolderIconPresentation({
      showFolderShape: true,
      source: "",
      projectedColor: "#4f46e5",
    }),
    {
      folderShapeColor: "#4f46e5",
      hasInnerIcon: false,
      enlargeInnerIcon: false,
      innerIconColor: null,
    },
  );
});

test("default folder selection restores outline before clearing icon", () => {
  const calls = [];
  const result = selectDefaultFolderIcon({
    isFolderPicker: true,
    setShowFolderShape: value => calls.push(["shape", value]),
    selectValue: value => {
      calls.push(["select", value]);
      return "selected";
    },
  });
  assert.equal(result, "selected");
  assert.deepEqual(calls, [
    ["shape", true],
    ["select", null],
  ]);
});

test("space default selection leaves folder shape untouched", () => {
  const calls = [];
  selectDefaultFolderIcon({
    isFolderPicker: false,
    setShowFolderShape: value => calls.push(["shape", value]),
    selectValue: value => calls.push(["select", value]),
  });
  assert.deepEqual(calls, [["select", null]]);
});

test("applies and clears presentation state on the real folder boundary", () => {
  const { folder, attributes, properties } = makeFolder("#4F46E5");
  applyFolderIconPresentation({
    folder,
    showFolderShape: false,
    source: "chrome://sine/content/zen-icons-local/lucide/football.svg",
    unavailable: false,
  });
  assert.equal(attributes.has("zen-icons-has-inner-icon"), true);
  assert.equal(attributes.has("zen-icons-enlarge-inner-icon"), true);
  assert.equal(attributes.has("zen-icons-recolor-inner-icon"), true);
  assert.equal(properties.get("--zen-icons-inner-icon-color"), "#4f46e5");
  assert.equal(properties.get("--zen-folder-behind-bgcolor"), "#4f46e5");
  assert.equal(properties.get("--zen-folder-front-bgcolor"), "#4f46e5");
  assert.equal(properties.get("--zen-folder-stroke"), "#000000");

  applyFolderIconPresentation({
    folder,
    showFolderShape: true,
    source: "file:///profile/zen-icon-packs/Sports/football.png",
    unavailable: false,
  });
  assert.equal(attributes.has("zen-icons-has-inner-icon"), true);
  assert.equal(attributes.has("zen-icons-enlarge-inner-icon"), false);
  assert.equal(attributes.has("zen-icons-recolor-inner-icon"), false);
  assert.equal(properties.has("--zen-icons-inner-icon-color"), false);
  assert.equal(properties.get("--zen-folder-behind-bgcolor"), "#4f46e5");
  assert.equal(properties.get("--zen-folder-front-bgcolor"), "#4f46e5");
  assert.equal(properties.get("--zen-folder-stroke"), "#000000");

  attributes.delete(BZF_FOLDER_COLOR_ATTRIBUTE);
  applyFolderIconPresentation({
    folder,
    showFolderShape: true,
    source: "",
    unavailable: false,
  });
  assert.equal(attributes.has("zen-icons-has-inner-icon"), false);
  assert.equal(properties.has("--zen-folder-behind-bgcolor"), false);
  assert.equal(properties.has("--zen-folder-front-bgcolor"), false);
  assert.equal(properties.has("--zen-folder-stroke"), false);
});

test("uses Better Zen Folders' canonical colour variable before its compatibility attribute", () => {
  const { folder, properties } = makeFolder("#112233", "#A1B2C3");
  const result = applyFolderIconPresentation({
    folder,
    showFolderShape: false,
    source: "chrome://sine/content/zen-icons-local/lucide/football.svg",
    unavailable: false,
  });

  assert.equal(result.innerIconColor, "#a1b2c3");
  assert.equal(properties.get("--zen-icons-inner-icon-color"), "#a1b2c3");
  assert.equal(result.folderShapeColor, "#a1b2c3");
  assert.equal(properties.get("--zen-folder-behind-bgcolor"), "#a1b2c3");
  assert.equal(properties.get("--zen-folder-front-bgcolor"), "#a1b2c3");
  assert.equal(properties.get("--zen-folder-stroke"), "#000000");
});

test("invalid Better Zen Folders colours never reach native shape paint", () => {
  const { folder, properties } = makeFolder("#abc");
  const result = applyFolderIconPresentation({
    folder,
    showFolderShape: true,
    source: "",
    unavailable: false,
  });

  assert.equal(result.folderShapeColor, null);
  assert.equal(properties.has("--zen-folder-behind-bgcolor"), false);
  assert.equal(properties.has("--zen-folder-front-bgcolor"), false);
  assert.equal(properties.has("--zen-folder-stroke"), false);
});

test("unavailable custom icons never receive presentation overrides", () => {
  const { folder, attributes, properties } = makeFolder("#4f46e5");
  applyFolderIconPresentation({
    folder,
    showFolderShape: false,
    source: "chrome://sine/content/zen-icons-local/lucide/football.svg",
    unavailable: true,
  });
  assert.equal(attributes.has("zen-icons-has-inner-icon"), false);
  assert.equal(attributes.has("zen-icons-enlarge-inner-icon"), false);
  assert.equal(attributes.has("zen-icons-recolor-inner-icon"), false);
  assert.equal(properties.has("--zen-icons-inner-icon-color"), false);
  assert.equal(properties.get("--zen-folder-behind-bgcolor"), "#4f46e5");
  assert.equal(properties.get("--zen-folder-front-bgcolor"), "#4f46e5");
  assert.equal(properties.get("--zen-folder-stroke"), "#000000");
});

test("colour bridge refreshes one folder and disconnects cleanly", () => {
  const listeners = new Map();
  const browserWindow = {
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    removeEventListener(type, listener) {
      if (listeners.get(type) === listener) listeners.delete(type);
    },
  };
  const { folder } = makeFolder();
  const refreshed = [];
  const disconnect = connectFolderColorBridge({
    browserWindow,
    refreshFolder: value => refreshed.push(value),
  });

  listeners.get(BZF_FOLDER_COLOR_EVENT)({ target: folder });
  assert.deepEqual(refreshed, [folder]);
  disconnect();
  assert.equal(listeners.has(BZF_FOLDER_COLOR_EVENT), false);
});

test("chrome CSS preserves selected inner icons through native active-folder state", async () => {
  const css = await readFile(
    new URL("../../sine/zen-icons/chrome.css", import.meta.url),
    "utf8",
  );
  assert.match(
    css,
    /\[zen-icons-has-inner-icon\][^{]*>\s*\.tab-group-label-container\s*>\s*\.tab-group-folder-icon[^{]*svg[^{]*\.icon\s*\{[^}]*opacity:\s*1\s*!important/s,
  );
  assert.match(
    css,
    /\[zen-icons-has-inner-icon\][^{]*>\s*\.tab-group-label-container\s*>\s*\.tab-group-folder-icon[^{]*svg[^{]*\.dots\s*\{[^}]*opacity:\s*0\s*!important/s,
  );
  assert.match(
    css,
    /\[zen-icons-enlarge-inner-icon\][^{]*>\s*\.tab-group-label-container\s*>\s*\.tab-group-folder-icon[^{]*svg[^{]*\.icon\s*\{[^}]*transform-origin:\s*center[^}]*transform:\s*scale\(1\.36\)/s,
  );
  assert.match(
    css,
    /\[zen-icons-recolor-inner-icon\][^{]*>\s*\.tab-group-label-container\s*>\s*\.tab-group-folder-icon[^{]*svg[^{]*\.icon\s+image\s*\{[^}]*fill:\s*var\(--zen-icons-inner-icon-color\)[^}]*stroke:\s*var\(--zen-icons-inner-icon-color\)/s,
  );
  assert.match(
    css,
    /\[zen-icons-hide-folder-shape\][^{]*>\s*\.tab-group-label-container\s*>\s*\.tab-group-folder-icon[^{]*svg[^{]*:is\(\.back, \.front, \.dots\)/s,
  );
});

test("expanded-sidebar folder SVGs retain native x placement and move down one pixel", async () => {
  const css = await readFile(
    new URL("../../sine/zen-icons/chrome.css", import.meta.url),
    "utf8",
  );
  assert.match(
    css,
    /:root\[zen-sidebar-expanded\][^{]*:is\(zen-folder, tab-group\)[^{]*>\s*\.tab-group-label-container\s*>\s*\.tab-group-folder-icon\s*>\s*svg\s*\{[^}]*transform:\s*translate\(-1px,\s*0\)\s*!important/s,
  );
});
