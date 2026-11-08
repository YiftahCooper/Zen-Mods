import assert from "node:assert/strict";
import test from "node:test";

import { createSelectionBridge } from "../../src/zen-icons-sine/selection-bridge.mjs";

test("passes native selections through the original picker contract", async () => {
  let options;
  const originalOpen = (_anchor, nextOptions) => {
    options = nextOptions;
    return Promise.resolve("native:value");
  };
  const selected = [];
  const bridge = createSelectionBridge(originalOpen, { hidePopup() {} });

  const promise = bridge.open(
    {},
    { onSelect: (value) => selected.push(value) },
  );
  options.onSelect("native:value");

  assert.equal(await promise, "native:value");
  assert.deepEqual(selected, ["native:value"]);
});

test("settles the caller with a custom value while swallowing native close rejection", async () => {
  let rejectNative;
  let hidden = false;
  const selected = [];
  const originalOpen = () =>
    new Promise((_resolve, reject) => {
      rejectNative = reject;
    });
  const bridge = createSelectionBridge(originalOpen, {
    hidePopup() {
      hidden = true;
    },
  });

  const promise = bridge.open(
    {},
    { onSelect: (value) => selected.push(value) },
  );
  assert.equal(bridge.selectCustom("custom:Sports:football.png"), true);
  rejectNative(new Error("Emoji picker closed without selection"));

  assert.equal(await promise, "custom:Sports:football.png");
  assert.deepEqual(selected, ["custom:Sports:football.png"]);
  assert.equal(hidden, true);
});

test("runs a folder updater after preserving the picker caller callback", async () => {
  let rejectNative;
  const selected = [];
  const updated = [];
  const bridge = createSelectionBridge(
    () =>
      new Promise((_resolve, reject) => {
        rejectNative = reject;
      }),
    { hidePopup() {} },
  );

  const promise = bridge.open(
    {},
    { onSelect: (value) => selected.push(value) },
  );
  bridge.selectCustom("file:///profile/chrome/football.svg", {
    afterSelect: (value) => updated.push(value),
  });
  rejectNative(new Error("Emoji picker closed without selection"));

  assert.equal(await promise, "file:///profile/chrome/football.svg");
  assert.deepEqual(selected, ["file:///profile/chrome/football.svg"]);
  assert.deepEqual(updated, ["file:///profile/chrome/football.svg"]);
});

test("returns null and exposes no selection when the native picker is already open", () => {
  const bridge = createSelectionBridge(() => null, { hidePopup() {} });

  assert.equal(bridge.open({}, {}), null);
  assert.equal(bridge.selectCustom("custom:pack:file.png"), false);
});

test("still invokes an explicit live caller when the native promise ended early", async () => {
  let hidden = false;
  const selected = [];
  const bridge = createSelectionBridge(
    () => Promise.resolve("native-ended"),
    {
      hidePopup() {
        hidden = true;
      },
    },
  );

  assert.equal(await bridge.open({}, {}), "native-ended");
  await Promise.resolve();
  assert.equal(
    bridge.selectCustom("chrome://sine/icon.svg", {
      onSelect: (value) => selected.push(value),
    }),
    false,
  );
  assert.deepEqual(selected, ["chrome://sine/icon.svg"]);
  assert.equal(hidden, true);
});
