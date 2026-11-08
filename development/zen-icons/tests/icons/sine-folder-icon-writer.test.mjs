import assert from "node:assert/strict";
import test from "node:test";

import { writeFolderIcon } from "../../src/zen-icons-sine/folder-icon-writer.mjs";

function imageElement(initialHref = "") {
  const attributes = new Map([["href", initialHref]]);
  const styles = new Map();
  return {
    getAttribute(name) {
      return attributes.get(name) ?? "";
    },
    setAttribute(name, value) {
      attributes.set(name, String(value));
    },
    style: {
      setProperty(name, value) {
        styles.set(name, String(value));
      },
      getPropertyValue(name) {
        return styles.get(name) ?? "";
      },
    },
  };
}

test("writes the visible SVG directly for a legacy folder even when the modern manager exists", () => {
  const image = imageElement();
  let nativeCalls = 0;
  const folder = {
    querySelector(selector) {
      return selector === ".tab-group-folder-icon svg .icon image"
        ? image
        : null;
    },
    setAttribute(name, value) {
      this[name] = String(value);
    },
    removeAttribute(name) {
      delete this[name];
    },
    dispatchEvent() {},
  };
  const document = {
    defaultView: {
      gZenFolders: {
        setFolderUserIcon() {
          nativeCalls += 1;
          throw new TypeError("group.icon is undefined");
        },
      },
      gZenEmojiPicker: {
        resolveIconSource(value) {
          return value;
        },
      },
      CustomEvent: class {},
    },
  };

  image.closest = () => folder;
  const result = writeFolderIcon({
    document,
    folder,
    value: "file:///profile/chrome/football.svg",
  });

  assert.equal(nativeCalls, 0);
  assert.equal(
    image.getAttribute("href"),
    "file:///profile/chrome/football.svg",
  );
  assert.equal(image.style.getPropertyValue("opacity"), "1");
  assert.equal(folder["zen-user-icon"], "file:///profile/chrome/football.svg");
  assert.equal(folder.iconURL, "file:///profile/chrome/football.svg");
  assert.equal(
    folder["data-zen-icons-icon-source"],
    "file:///profile/chrome/football.svg",
  );
  assert.deepEqual(result, {
    applied: true,
    mode: "compatibility",
    source: "file:///profile/chrome/football.svg",
  });
});

test("default selection clears every live icon projection", () => {
  const image = imageElement("file:///profile/chrome/football.svg");
  const folder = {
    iconURL: "file:///profile/chrome/football.svg",
    "zen-user-icon": "file:///profile/chrome/football.svg",
    "data-zen-icons-icon-source": "file:///profile/chrome/football.svg",
    querySelector() {
      return image;
    },
    setAttribute(name, value) {
      this[name] = String(value);
    },
    removeAttribute(name) {
      delete this[name];
    },
  };
  const document = {
    defaultView: {
      gZenFolders: null,
      gZenEmojiPicker: null,
    },
  };

  const result = writeFolderIcon({ document, folder, value: null });

  assert.equal(image.getAttribute("href"), "");
  assert.equal(image.style.getPropertyValue("opacity"), "0");
  assert.equal(folder.iconURL, null);
  assert.equal("zen-user-icon" in folder, false);
  assert.equal("data-zen-icons-icon-source" in folder, false);
  assert.deepEqual(result, {
    applied: true,
    mode: "compatibility",
    source: "",
  });
});

test("falls back when Zen's native setter returns without displaying the selected icon", () => {
  const image = imageElement();
  let nativeCalls = 0;
  const iconContainer = {
    querySelector() {
      return image;
    },
  };
  const folder = {
    icon: iconContainer,
    querySelector(selector) {
      if (
        selector ===
        ":scope > .tab-group-label-container > .tab-group-folder-icon"
      )
        return null;
      return selector.endsWith("svg .icon image") ? image : null;
    },
    setAttribute(name, value) {
      this[name] = String(value);
    },
    removeAttribute(name) {
      delete this[name];
    },
  };
  const document = {
    defaultView: {
      gZenFolders: {
        setFolderUserIcon() {
          nativeCalls += 1;
        },
      },
      gZenEmojiPicker: {
        resolveIconSource(value) {
          return value;
        },
      },
    },
  };

  const result = writeFolderIcon({
    document,
    folder,
    value: "chrome://browser/skin/zen-icons/selectable/football.svg",
  });

  assert.equal(nativeCalls, 1);
  assert.equal(
    image.getAttribute("href"),
    "chrome://browser/skin/zen-icons/selectable/football.svg",
  );
  assert.equal(image.style.getPropertyValue("opacity"), "1");
  assert.equal(
    folder["zen-user-icon"],
    "chrome://browser/skin/zen-icons/selectable/football.svg",
  );
  assert.deepEqual(result, {
    applied: true,
    mode: "compatibility",
    source: "chrome://browser/skin/zen-icons/selectable/football.svg",
  });
});

test("native selection exposes the resolved live source for menu presentation", () => {
  const image = imageElement();
  const folder = {
    iconURL: null,
    icon: {
      querySelector() {
        return image;
      },
    },
    setAttribute(name, value) {
      this[name] = String(value);
    },
    removeAttribute(name) {
      delete this[name];
    },
  };
  const document = {
    defaultView: {
      gZenFolders: {
        setFolderUserIcon(_folder, value) {
          image.setAttribute("href", value);
        },
      },
      gZenEmojiPicker: {
        resolveIconSource(value) {
          return value;
        },
      },
    },
  };

  const result = writeFolderIcon({
    document,
    folder,
    value: "chrome://browser/skin/zen-icons/selectable/work.svg",
  });

  assert.equal(result.mode, "native");
  assert.equal(
    folder["data-zen-icons-icon-source"],
    "chrome://browser/skin/zen-icons/selectable/work.svg",
  );
  assert.equal(
    folder.iconURL,
    "chrome://browser/skin/zen-icons/selectable/work.svg",
  );
});

test("nested folders write only to their own direct icon image", () => {
  const parentImage = imageElement();
  const childImage = imageElement("chrome://child.svg");
  const childIconContainer = {
    querySelector() {
      return childImage;
    },
  };
  const folder = {
    // Zen's current getter uses an unscoped descendant lookup, so during
    // nested-folder transitions it can resolve a child's icon.
    icon: childIconContainer,
    querySelector(selector) {
      if (
        selector ===
        ":scope > .tab-group-label-container > .tab-group-folder-icon svg .icon image"
      ) {
        return parentImage;
      }
      if (selector === ".tab-group-folder-icon svg .icon image") {
        return childImage;
      }
      return null;
    },
    setAttribute(name, value) {
      this[name] = String(value);
    },
    removeAttribute(name) {
      delete this[name];
    },
  };
  const document = {
    defaultView: {
      gZenFolders: null,
      gZenEmojiPicker: { resolveIconSource: (value) => value },
    },
  };

  const result = writeFolderIcon({
    document,
    folder,
    value: "chrome://parent.svg",
  });

  assert.equal(result.applied, true);
  assert.equal(parentImage.getAttribute("href"), "chrome://parent.svg");
  assert.equal(childImage.getAttribute("href"), "chrome://child.svg");
});
