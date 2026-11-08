import test from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buildSineMod } from "../../scripts/build_sine_mod.mjs";
import {scratchDirectory} from './scratch.mjs';
import { createPickerModel } from "../../src/zen-icons-sine/picker-model.mjs";
import { createIconRecord } from "../../src/zen/common/emojis/ZenIconRegistry.mjs";
import { Element, fixture, tick } from "./runtime-fixture.mjs";

const dog = createIconRecord({ id: "dog", provider: "lucide", name: "Dog", kind: "svg",
  source: "chrome://sine/content/zen-icons-local/lucide/dog.svg", categories: ["Animals"] });
const smile = createIconRecord({ id: "smile", provider: "emoji", name: "Smile", kind: "emoji",
  source: "😀", categories: ["Smileys"] });

async function selection(record, { options = {}, folder = false, nativeButton = false } = {}) {
  const f = await fixture();
  await tick();
  let selected;
  try {
    if (nativeButton) {
      const button = new Element("toolbarbutton");
      button.setAttribute("label", record.source);
      button.click = () => {}; // Hidden XUL buttons must not be selection dependencies.
      f.document.getElementById("PanelUI-zen-emojis-picker-list").append(button);
    }
    const view = f.mod.namespace.createPickerView({ document: f.document, panel: f.panel,
      model: createPickerModel([record]), bridge: { selectCustom(v) { selected = v; } },
      getOptions: () => options, getFolder: () => folder ? f.folder : null });
    f.document.querySelectorAll(".zen-icons-result").find(n => n.dataset.iconId === record.id).fire("click");
    view.destroy();
    return selected;
  } finally { f.dispose(); }
}

test("tab and space Lucide selections use image-safe paint rather than picker-only context stroke", async () => {
  assert.equal(await selection(dog), "chrome://sine/content/zen-icons-local/display-lucide/dog.svg");
  assert.equal(await selection(dog, { options: { emojiAsSVG: true } }), "chrome://sine/content/zen-icons-local/display-lucide/dog.svg");
});

test("emoji selection is delivered even if a matching hidden native button exists", async () => {
  assert.equal(await selection(smile, { nativeButton: true }), "😀");
});

test("tab and folder emojis are image values, while space emojis remain text", async () => {
  const tab = await selection(smile, { options: { emojiAsSVG: true } });
  const folder = await selection(smile, { folder: true });
  for (const value of [tab, folder]) {
    assert.match(value, /^data:image\/svg\+xml;base64,/);
    assert.match(Buffer.from(value.split(",")[1], "base64").toString(), /😀/);
  }
  assert.equal(await selection(smile), "😀");
});

test("space Default uses its circle preview without a keyboard-space icon", async () => {
  const f = await fixture();
  await tick();
  try {
    for (const [kind, shape] of [["space", "circle"]]) {
      const model = createPickerModel([dog], { defaultKind: kind });
      assert.equal(model.snapshot().defaultChoice.label, "Default Space Icon");
      const view = f.mod.namespace.createPickerView({ document: f.document, panel: f.panel,
        model, bridge: { selectCustom() {} }, getOptions: () => ({}), getFolder: () => null });
      const preview = f.document.querySelectorAll(".zen-icons-default-choice")[0].children[0];
      assert.equal(preview.dataset.defaultShape, shape);
      view.destroy();
    }
  } finally { f.dispose(); }
});

test("runtime identifies tab callers and allows colourful emoji images for folder callers", async () => {
  const f = await fixture();
  await tick();
  try {
    const tab = new Element("tab"); const icon = new Element("image");
    tab.append(icon); f.folder.append(tab);
    f.browser.gZenEmojiPicker.open(icon, { emojiAsSVG: true });
    assert.equal(f.document.querySelectorAll(".zen-icons-default-choice")[0].dataset.defaultKind, "tab");
  } finally { f.dispose(); }
  const g = await fixture({ emojis: [{ emoji: "😀", name: "Smile", tags: ["smile"], category: "Smileys" }] });
  await tick();
  try {
    g.browser.gZenEmojiPicker.open(g.folder, { onlySvgIcons: true });
    g.panel.state = "open";
    g.panel.fire("popupshown");
    for (let i = 0; i < g.frames.length && i < 300; i++) g.frames[i]();
    const emojiButton = g.document.querySelectorAll(".zen-icons-result").find(n => n.dataset.provider === "emoji");
    assert.ok(emojiButton, "folder caller receives emoji choices converted into image values");
  } finally { g.dispose(); }
});

test("packaged display SVG paints without external context and supports both colour schemes", async () => {
  const outputDirectory = await scratchDirectory('round1-');
  await buildSineMod({ outputDirectory });
  const display = await readFile(path.join(outputDirectory, "display-lucide/dog.svg"), "utf8");
  assert.doesNotMatch(display, /context-(?:fill|stroke)/);
  assert.match(display, /stroke="currentColor"/);
  assert.match(display, /prefers-color-scheme:\s*dark/);
  const folder = await readFile(path.join(outputDirectory, "lucide/dog.svg"), "utf8");
  assert.match(folder, /stroke="context-stroke"/);
  const inventory = JSON.parse(await readFile(path.join(outputDirectory, "package-inventory.json"), "utf8"));
  assert.ok(inventory.files["display-lucide/dog.svg"]);
});
