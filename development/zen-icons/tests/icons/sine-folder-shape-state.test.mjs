import assert from "node:assert/strict";
import test from "node:test";

import {
  readFolderShapeState,
  setFolderShapeState,
} from "../../src/zen-icons-sine/folder-shape-state.mjs";

test("folder shapes default on and malformed preferences are harmless", () => {
  assert.equal(readFolderShapeState("", "folder-a"), true);
  assert.equal(readFolderShapeState("not-json", "folder-a"), true);
});

test("folder shape choices are independent and serialize stably", () => {
  let value = setFolderShapeState("", "folder-a", false);
  value = setFolderShapeState(value, "folder-b", true);

  assert.equal(readFolderShapeState(value, "folder-a"), false);
  assert.equal(readFolderShapeState(value, "folder-b"), true);
  assert.deepEqual(JSON.parse(value), { "folder-a": false, "folder-b": true });
});
