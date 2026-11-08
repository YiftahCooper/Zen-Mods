import test from "node:test";
import assert from "node:assert/strict";
import { buildCustomIconCatalog } from "../../src/zen/common/emojis/ZenCustomIconPacks.mjs";
import { createPickerModel } from "../../src/zen-icons-sine/picker-model.mjs";
import { createSelectionBridge } from "../../src/zen-icons-sine/selection-bridge.mjs";
import { findFolderForAnchor } from "../../src/zen-icons-sine/folder-anchor.mjs";
import { writeFolderIcon } from "../../src/zen-icons-sine/folder-icon-writer.mjs";
import { Element, fixture, tick, all } from "./runtime-fixture.mjs";

const file = {
  relativePath: "Pack/Animals/dog.png",
  size: 100,
  source: "file:///dog.png",
};
test("malformed optional metadata and punctuation filenames do not hide valid images", () => {
  const catalog = buildCustomIconCatalog({
    files: [
      file,
      { ...file, relativePath: "Pack/__.png" },
      { ...file, source: null },
    ],
    manifests: new Map([["Pack", { "Animals/dog.png": null }]]),
  });
  assert.equal(catalog.records.length, 2);
  assert.ok(catalog.records.every((r) => r.name.trim()));
  assert.equal(catalog.skipped.length, 1);
});
test("category aliases search records but navigation lists only real sections", () => {
  const catalog = buildCustomIconCatalog({
    files: [file],
    manifests: new Map([
      [
        "Pack",
        {
          $categories: { Animals: { aliases: ["fauna audit alias"] } },
          "Animals/dog.png": { categories: ["Pets"] },
        },
      ],
    ]),
  });
  const model = createPickerModel(catalog.records, {
    categoryMetadata: catalog.categoryMetadata,
  });
  model.setQuery("fauna");
  assert.equal(model.snapshot().groups[0]?.records[0].name, "Dog");
  assert.deepEqual(model.snapshot().availableCategories, ["Animals"]);
});
test("keep-open selection delivers every callback but resolves only the final selection on close", async () => {
  let options,
    resolve,
    closes = 0;
  const values = [];
  const bridge = createSelectionBridge(
    (_, o) => {
      options = o;
      return new Promise((r) => (resolve = r));
    },
    {
      hidePopup() {
        closes++;
      },
    },
  );
  let result = "pending";
  const promise = bridge.open(null, {
    closeOnSelect: false,
    onSelect: (v) => values.push(v),
  });
  promise.then((v) => (result = v));
  options.onSelect("first");
  await tick();
  assert.equal(result, "pending");
  bridge.selectCustom("second");
  await tick();
  assert.equal(closes, 0);
  assert.equal(result, "pending");
  options.onSelect("third");
  resolve("third");
  assert.equal(await promise, "third");
  assert.deepEqual(values, ["first", "second", "third"]);
});
test("custom final choice survives native cancellation on keep-open popup close", async () => {
  let reject;
  const bridge = createSelectionBridge(
    () => new Promise((_, r) => (reject = r)),
    { hidePopup() {} },
  );
  const promise = bridge.open(null, { closeOnSelect: false });
  bridge.selectCustom("custom");
  reject(new Error("native has no selection"));
  assert.equal(await promise, "custom");
});
test("actual tab result click does not change the containing folder", async () => {
  const f = await fixture();
  await tick();
  try {
    const tab = new Element("tab"),
      icon = new Element("image");
    tab.append(icon);
    f.folder.append(tab);
    const folder = findFolderForAnchor(f.document, icon);
    const previous = f.innerImage.getAttribute("href");
    let selected;
    const view = f.mod.namespace.createPickerView({
      document: f.document,
      panel: f.panel,
      model: createPickerModel([
        {
          id: "zen:book",
          provider: "zen",
          name: "Book",
          kind: "svg",
          source: "book.svg",
          categories: ["Reading"],
          aliases: [],
          tags: [],
          searchTokens: ["book"],
          order: 0,
        },
      ]),
      bridge: createSelectionBridge(() => null, { hidePopup() {} }),
      getOptions: () => ({ onSelect: (v) => (selected = v) }),
      getFolder: () => folder,
    });
    f.document
      .querySelectorAll(".zen-icons-result")
      .find((n) => n.dataset.iconId === "zen:book")
      .fire("click");
    assert.equal(selected, "book.svg");
    assert.equal(f.innerImage.getAttribute("href"), previous);
    assert.equal(folder, null);
    view.destroy();
  } finally {
    f.dispose();
  }
});
test("cold scan after popupshown still renders all expanded sections", async () => {
  const f = await fixture({ blocked: true });
  try {
    f.browser.gZenEmojiPicker.open(null, {});
    f.panel.state = "open";
    f.panel.fire("popupshown");
    f.release();
    await tick();
    await tick();
    for (let i = 0; i < f.frames.length && i < 300; i++) f.frames[i]();
    const grids = f.document.querySelectorAll(".zen-icons-grid");
    assert.ok(grids.length > 1);
    assert.ok(grids.every((g) => g.dataset.populated === "true"));
  } finally {
    f.dispose();
  }
});
test("completed rescan updates the currently open provider list", async () => {
  const f = await fixture();
  await tick();
  try {
    f.files.push("first.png");
    f.browser.gZenEmojiPicker.open(null, {});
    f.panel.state = "open";
    f.panel.fire("popupshown");
    await tick();
    await tick();
    assert.ok(
      f.document
        .querySelectorAll("label")
        .some((n) => all(n).some((x) => x.textContent === "Custom Icons")),
    );
  } finally {
    f.dispose();
  }
});
test("reusing a custom img for a native source retires fallback ownership", async () => {
  const f = await fixture();
  await tick();
  try {
    f.img.src =
      "chrome://sine/content/zen-icons-local/custom/Pack/first.png#zen-icon.svg";
    f.refresh();
    f.img.src = "book.svg";
    f.refresh();
    assert.equal(f.img.src, "book.svg");
    assert.equal(f.img.listeners.get("error")?.size ?? 0, 0);
  } finally {
    f.dispose();
  }
});
test("unload removes owned paint and listeners without erasing canonical colour", async () => {
  const f = await fixture();
  await tick();
  f.img.src =
    "chrome://sine/content/zen-icons-local/custom/Pack/first.png#zen-icon.svg";
  f.refresh();
  f.dispose();
  assert.equal(f.folder.properties.size, 0);
  assert.equal(f.folder.hasAttribute("zen-icons-has-inner-icon"), false);
  assert.equal(
    f.folder.getAttribute("data-better-zen-folders-color"),
    "#ffcc00",
  );
  assert.equal(f.img.listeners.get("error")?.size ?? 0, 0);
});
test("pending scan cannot recreate picker or paint after unload", async () => {
  const f = await fixture({ blocked: true });
  f.browser.gZenEmojiPicker.open(null, {});
  f.panel.state = "open";
  f.panel.fire("popupshown");
  f.dispose();
  f.release();
  await tick();
  await tick();
  assert.equal(
    all(f.document).filter((n) => n.id === "zen-icons-sine-root").length,
    0,
  );
  assert.equal(f.folder.properties.size, 0);
});

test("detached images release fallback listeners without waiting for mod unload", async () => {
  const f = await fixture();
  await tick();
  try {
    f.img.src =
      "chrome://sine/content/zen-icons-local/custom/Pack/first.png#zen-icon.svg";
    f.refresh();
    f.img.remove();
    f.refresh();
    assert.equal(f.img.listeners.get("error")?.size ?? 0, 0);
    f.folder.remove();
    f.refresh();
    assert.equal(f.folder.properties.size, 0);
  } finally {
    f.dispose();
  }
});

test("outline toggle followed immediately by unload leaves no transient presentation", async () => {
  const f = await fixture();
  await tick();
  f.browser.gZenEmojiPicker.open(f.folder, {});
  f.panel.state = "open";
  f.panel.fire("popupshown");
  const checkbox = f.document
    .querySelector(".zen-icons-folder-shape")
    .querySelector("input");
  checkbox.checked = false;
  checkbox.fire("change");
  f.dispose();
  assert.equal(f.folder.hasAttribute("zen-icons-enlarge-inner-icon"), false);
  assert.equal(f.folder.hasAttribute("zen-icons-hide-folder-shape"), false);
});

test("parent missing its direct icon neither captures nor writes a child icon", () => {
  const parent = new Element("zen-folder"),
    child = new Element("zen-folder"),
    icon = new Element("div"),
    image = new Element("image");
  parent.append(child);
  child.append(icon);
  icon.append(image);
  image.setAttribute("href", "child.svg");
  parent.querySelector = () => null;
  parent.icon = icon;
  child.querySelector = () => icon;
  child.icon = icon;
  const document = {
    querySelectorAll: () => [parent, child],
    defaultView: { gZenFolders: {}, gZenEmojiPicker: {} },
  };
  assert.equal(findFolderForAnchor(document, icon), child);
  icon.querySelector = () => image;
  writeFolderIcon({ document, folder: parent, value: "parent.svg" });
  assert.equal(image.getAttribute("href"), "child.svg");
});

test("partial initialization failure restores the original picker and marker", async () => {
  let state;
  await assert.rejects(
    fixture({ failObserve: true, onBeforeInit: (value) => (state = value) }),
    /observer initialization failure/,
  );
  assert.equal(state.panel.hasAttribute("zen-icons-enhanced"), false);
  assert.equal(state.browser.gZenEmojiPicker.open, state.originalOpen);
});
test("unload never overwrites a later picker wrapper owned by another mod", async () => {
  const f = await fixture();
  await tick();
  const previous = f.browser.gZenEmojiPicker.open;
  const wrapper = (...args) => previous(...args);
  f.browser.gZenEmojiPicker.open = wrapper;
  f.dispose();
  assert.equal(f.browser.gZenEmojiPicker.open, wrapper);
});

test("folder selection paints immediately even if the caller closes the popup", async () => {
  const f = await fixture();
  await tick();
  f.innerImage.setAttribute("href", "");
  f.refresh();
  try {
    f.browser.gZenEmojiPicker.open(f.folder, { closeOnSelect: true });
    f.panel.state = "open";
    f.panel.fire("popupshown");
    const result = f.document
      .querySelectorAll(".zen-icons-result")
      .find((button) => button.dataset.iconId);
    result.fire("click");
    assert.equal(f.folder.hasAttribute("zen-icons-has-inner-icon"), true);
  } finally {
    f.dispose();
  }
});

test("runtime startup cannot bypass linked-root scanner safeguards", async () => {
  const f = await fixture({ linkedRoot: true });
  await tick();
  try {
    assert.deepEqual(f.createdDirectories, []);
  } finally {
    f.dispose();
  }
});
