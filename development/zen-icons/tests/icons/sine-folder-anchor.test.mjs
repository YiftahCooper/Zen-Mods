import assert from "node:assert/strict";
import test from "node:test";

import { findFolderForAnchor } from "../../src/zen-icons-sine/folder-anchor.mjs";

test("uses a folder ancestor when Zen supplies a normal descendant anchor", () => {
  const folder = { id: "folder-1" };
  const anchor = {
    closest: (selector) => (selector.includes("tab,") ? null : folder),
  };
  folder.icon = anchor;
  const document = { querySelectorAll: () => [folder] };

  assert.equal(findFolderForAnchor(document, anchor), folder);
});

test("matches Zen's detached internal icon node back to its owning folder", () => {
  const anchor = { closest: () => null };
  const folder = { id: "folder-1", icon: anchor };
  const document = { querySelectorAll: () => [folder] };

  assert.equal(findFolderForAnchor(document, anchor), folder);
});

test("matches the detached icon used by legacy tab-group folders", () => {
  const anchor = { closest: () => null };
  const folder = { id: "legacy-folder-1", icon: anchor };
  const document = {
    querySelectorAll(selector) {
      return selector.includes("tab-group") ? [folder] : [];
    },
  };

  assert.equal(findFolderForAnchor(document, anchor), folder);
});

test("does not misclassify a Space picker anchor as a folder", () => {
  const anchor = { closest: () => null };
  const folder = { id: "folder-1", icon: {} };
  const document = { querySelectorAll: () => [folder] };

  assert.equal(findFolderForAnchor(document, anchor), null);
});

test("nested anchors resolve to the folder that directly owns the icon", () => {
  const childIcon = { contains: (candidate) => candidate === childIcon };
  const parentIcon = { contains: () => false };
  const parent = {
    // Mirrors Zen's unscoped getter returning the first nested icon.
    icon: childIcon,
    querySelector: (selector) =>
      selector.startsWith(":scope >") ? parentIcon : childIcon,
  };
  const child = {
    icon: childIcon,
    querySelector: (selector) =>
      selector.startsWith(":scope >") ? childIcon : null,
  };
  const document = { querySelectorAll: () => [parent, child] };

  assert.equal(findFolderForAnchor(document, childIcon), child);
});
