import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { fixture, tick, Element, all } from "./runtime-fixture.mjs";
import { createPickerModel } from "../../src/zen-icons-sine/picker-model.mjs";

const LEGACY = "chrome://sine/content/zen-icons-local/custom/Pack/first.png#zen-icon.svg";
const CANONICAL = "chrome://zen-icons-custom/content/Pack/first.png#zen-icon.svg";
const MISSING = "chrome://zen-icons-custom/content/Pack/missing.png#zen-icon.svg";
const FALLBACK = "chrome://browser/skin/zen-icons/selectable/image.svg";

const attributeRecord = (target, attributeName) => ({ type: "attributes", target, attributeName });
const childListRecord = (target, addedNodes = [], removedNodes = []) => ({
  type: "childList", target, addedNodes, removedNodes,
});

function makeTabs(f, count, { inFolder = false } = {}) {
  const container = new Element("arrowscrollbox");
  (inFolder ? f.folder : f.document.documentElement).append(container);
  const tabs = [];
  for (let index = 0; index < count; index++) {
    const tab = new Element("tab");
    const icon = new Element("image");
    icon.className = "tab-icon-image";
    const label = new Element("label");
    tab.append(icon, label);
    container.append(tab);
    tabs.push(tab);
  }
  return tabs;
}

// Counts document-wide scans (the signature of a full pass) and gBrowser.tabs
// reads (the signature of the tab migration sweep).
function instrument(f) {
  const scans = [];
  const querySelectorAll = f.document.querySelectorAll.bind(f.document);
  f.document.querySelectorAll = (selector) => {
    scans.push(selector);
    return querySelectorAll(selector);
  };
  let folderLookups = 0;
  const folderQuery = f.folder.querySelector;
  f.folder.querySelector = (selector) => {
    folderLookups += 1;
    return folderQuery(selector);
  };
  return { scans, folderLookups: () => folderLookups };
}

function tabbedBrowser(tabs, counter) {
  return {
    get tabs() {
      counter.reads += 1;
      return tabs;
    },
    setIcon(tab, value) {
      tab.querySelector("image")?.setAttribute("src", tab.zenStaticIcon || value);
    },
  };
}

test("favicon src churn on 300 tabs causes no full pass, no tab sweep and no frame", async () => {
  const counter = { reads: 0 };
  const tabs = [];
  const f = await fixture({ onBeforeInit: ({ browser }) => { browser.gBrowser = tabbedBrowser(tabs, counter); } });
  await tick(); await tick();
  try {
    tabs.push(...makeTabs(f, 300));
    const { scans, folderLookups } = instrument(f);
    const reads = counter.reads, frames = f.frames.length, lookups = folderLookups();
    for (let round = 0; round < 3; round++) {
      const records = tabs.map((tab, index) => {
        const icon = tab.querySelector("image");
        icon.setAttribute("src", `data:image/png;base64,${round}${index}`);
        return attributeRecord(icon, "src");
      });
      f.mutate(records);
    }
    assert.deepEqual(scans, [], "favicon updates must not scan the document");
    assert.equal(counter.reads, reads, "favicon updates must not iterate gBrowser.tabs");
    assert.equal(f.frames.length, frames, "favicon updates must not schedule folder work");
    assert.equal(folderLookups() - lookups, 0);
  } finally { f.dispose(); }
});

test("unrelated chrome DOM changes and tab title text changes do not trigger a full pass", async () => {
  const f = await fixture();
  await tick(); await tick();
  try {
    const tabs = makeTabs(f, 20, { inFolder: true });
    const { scans, folderLookups } = instrument(f);
    const frames = f.frames.length, lookups = folderLookups();
    const popup = new Element("vbox");
    const row = new Element("div");
    row.append(new Element("span"));
    popup.append(row);
    f.document.documentElement.append(popup);
    const title = f.document.createTextNode("Loading…");
    f.mutate([
      childListRecord(popup, [row]),
      childListRecord(f.document.documentElement, [popup]),
      ...tabs.map((tab) => childListRecord(tab.querySelector("label"), [title], [])),
    ]);
    assert.deepEqual(scans, []);
    assert.equal(f.frames.length, frames, "text-only folder changes and foreign rows schedule nothing");
    assert.equal(folderLookups() - lookups, 0);
  } finally { f.dispose(); }
});

test("own image fallback writes do not retrigger image processing", async () => {
  const f = await fixture();
  await tick(); await tick();
  try {
    const { scans } = instrument(f);
    f.img.setAttribute("src", MISSING);
    f.mutate([attributeRecord(f.img, "src")]);
    assert.equal(f.img.getAttribute("src"), FALLBACK, "an unavailable custom image shows the fallback");
    assert.equal(f.img.listeners.get("error")?.size, 1);
    let closestCalls = 0;
    const closest = f.img.closest.bind(f.img);
    f.img.closest = (selector) => { closestCalls += 1; return closest(selector); };
    // The record produced by our own fallback write.
    f.mutate([attributeRecord(f.img, "src")]);
    assert.equal(closestCalls, 0, "own write is recognised before any processing");
    assert.equal(f.img.listeners.get("error")?.size, 1);
    assert.deepEqual(scans, []);
    // A foreign change is still honoured immediately.
    f.img.setAttribute("src", "https://example.test/icon.png");
    f.mutate([attributeRecord(f.img, "src")]);
    assert.equal(f.img.getAttribute("src"), "https://example.test/icon.png");
    assert.equal(f.img.listeners.get("error")?.size ?? 0, 0);
  } finally { f.dispose(); }
});

test("own canonicalising folder href write does not queue another folder refresh", async () => {
  const f = await fixture();
  f.folder.append(f.innerImage);
  f.innerImage.setAttribute("href", LEGACY);
  await tick(); await tick();
  try {
    assert.equal(f.innerImage.getAttribute("href"), CANONICAL, "startup pass migrates the legacy folder value");
    const frames = f.frames.length;
    f.mutate([attributeRecord(f.innerImage, "href")]);
    assert.equal(f.frames.length, frames, "own href write is ignored");
    f.innerImage.setAttribute("href", "chrome://browser/skin/zen-icons/selectable/book.svg");
    f.mutate([attributeRecord(f.innerImage, "href")]);
    assert.equal(f.frames.length, frames + 1, "a foreign href change is processed");
  } finally { f.dispose(); }
});

test("bursts of folder records coalesce into one frame that refreshes each folder once", async () => {
  const f = await fixture();
  await tick(); await tick();
  try {
    f.refresh();
    const { scans, folderLookups } = instrument(f);
    const frames = f.frames.length;
    f.folder.setAttribute("data-better-zen-folders-color", "#3366ff");
    const child = new Element("tab");
    f.folder.append(child);
    f.mutate([
      attributeRecord(f.folder, "data-better-zen-folders-color"),
      attributeRecord(f.folder, "data-better-zen-folders-color"),
      childListRecord(f.folder, [child]),
    ]);
    f.mutate([attributeRecord(f.folder, "data-better-zen-folders-color")]);
    assert.equal(f.frames.length, frames + 1, "one frame for the whole burst");
    assert.equal(f.folder.properties.get("--zen-folder-behind-bgcolor"), "#ffcc00", "paint waits for the frame");
    const lookups = folderLookups();
    f.frames.at(-1)();
    assert.equal(f.folder.properties.get("--zen-folder-behind-bgcolor"), "#3366ff");
    assert.ok(folderLookups() - lookups <= 3, "the folder is refreshed once, not once per record");
    assert.deepEqual(scans, [], "an incremental batch never scans the document");
  } finally { f.dispose(); }
});

test("removed and inserted folders and images are handled without a full pass", async () => {
  const f = await fixture();
  await tick(); await tick();
  try {
    f.img.setAttribute("src", MISSING);
    f.refresh();
    assert.equal(f.img.listeners.get("error")?.size, 1);
    const { scans } = instrument(f);
    f.img.remove();
    f.folder.remove();
    f.mutate([childListRecord(f.document.documentElement, [], [f.img, f.folder])]);
    f.frames.at(-1)();
    assert.equal(f.img.listeners.get("error")?.size ?? 0, 0, "detached image releases its listener");
    assert.equal(f.folder.properties.size, 0, "detached folder releases owned paint");
    const box = new Element("hbox");
    const image = new Element("img");
    image.setAttribute("src", MISSING);
    box.append(image);
    f.document.documentElement.append(box);
    f.mutate([childListRecord(f.document.documentElement, [box])]);
    assert.equal(image.getAttribute("src"), FALLBACK, "inserted custom image is handled synchronously");
    assert.equal(image.listeners.get("error")?.size, 1);
    assert.deepEqual(scans, []);
  } finally { f.dispose(); }
});

test("legacy tab migration sweeps tabs once; later legacy tabs are migrated individually", async () => {
  const counter = { reads: 0 };
  const cache = [];
  const tabs = [];
  const f = await fixture({
    imports: { "resource:///modules/sessionstore/TabStateCache.sys.mjs": { TabStateCache: { update: (_, data) => cache.push(data.image) } } },
    onBeforeInit: ({ browser }) => { browser.gBrowser = tabbedBrowser(tabs, counter); },
  });
  try {
    tabs.push(...makeTabs(f, 300));
    tabs[7].zenStaticIcon = LEGACY;
    tabs[7].permanentKey = {};
    await tick(); await tick();
    assert.equal(tabs[7].zenStaticIcon, CANONICAL);
    assert.deepEqual(cache, [CANONICAL]);
    assert.equal(counter.reads, 1, "initial sweep reads the tab list once");
    f.refresh(); f.refresh();
    assert.equal(counter.reads, 1, "later full passes do not re-sweep tabs");
    // A restored tab arrives with a legacy value.
    const [late] = makeTabs(f, 1);
    late.zenStaticIcon = LEGACY; late.permanentKey = {};
    f.mutate([childListRecord(late.parentNode, [late])]);
    assert.equal(late.zenStaticIcon, CANONICAL);
    // An existing tab receives a legacy value later and displays it.
    tabs[42].zenStaticIcon = LEGACY; tabs[42].permanentKey = {};
    f.browser.gBrowser.setIcon(tabs[42], LEGACY);
    f.mutate([attributeRecord(tabs[42].querySelector("image"), "src")]);
    assert.equal(tabs[42].zenStaticIcon, CANONICAL);
    assert.equal(tabs[42].querySelector("image").getAttribute("src"), CANONICAL);
    assert.equal(counter.reads, 1, "late migrations never sweep all tabs");
    assert.deepEqual(cache, [CANONICAL, CANONICAL, CANONICAL]);
  } finally { f.dispose(); }
});

test("emoji data and base records are built once per process across windows", async () => {
  const f = await fixture({ emojis: [{ emoji: "🐶", name: "Dog", tags: ["dog"], category: "Animals" }] });
  await tick();
  try {
    assert.equal(f.subScriptLoads(), 1);
    const document = new Element("document");
    document.documentElement = new Element("window");
    document.append(document.documentElement);
    const panel = new Element("panel");
    panel.id = "PanelUI-zen-emojis-picker";
    document.documentElement.append(panel);
    document.getElementById = (id) => all(document).find((n) => n.id === id) || null;
    const second = { ...f.browser, document, gZenEmojiPicker: { getSVGURL: (n) => n, open() {} } };
    document.defaultView = second;
    const dispose = f.mod.namespace.initializeZenIcons(second);
    try {
      assert.equal(panel.getAttribute("zen-icons-enhanced"), "true");
      assert.equal(f.subScriptLoads(), 1, "second window reuses the shared catalogue");
    } finally { dispose(); }
  } finally { f.dispose(); }
});

test("search input renders the first keystroke at once and coalesces a burst", async () => {
  const f = await fixture({ emojis: [
    { emoji: "🐶", name: "Dog", tags: ["dog"], category: "Animals" },
    { emoji: "🐱", name: "Cat", tags: ["cat"], category: "Animals" },
  ] });
  await tick();
  try {
    vm.runInContext("Date.now = () => globalThis.__fakeNow;", f.globals);
    f.globals.__fakeNow = 10_000;
    f.browser.gZenEmojiPicker.open(null, {});
    const DOG = "emoji:u-1f436", CAT = "emoji:u-1f431";
    const names = () => f.document.querySelectorAll(".zen-icons-result").map((n) => n.dataset.iconId).filter(Boolean);
    const search = f.document.querySelector(".zen-icons-search");
    search.value = "dog"; search.fire("input");
    assert.ok(names().includes(DOG) && !names().includes(CAT), "first keystroke is not delayed");
    f.globals.__fakeNow += 20;
    search.value = "ca"; search.fire("input");
    search.value = "cat"; search.fire("input");
    assert.ok(names().includes(DOG) && !names().includes(CAT), "burst waits for one trailing render");
    assert.equal(f.timers.size, 1, "one pending trailing render");
    f.globals.__fakeNow += 100;
    f.flushTimers();
    assert.ok(names().includes(CAT) && !names().includes(DOG), "trailing render uses the latest value");
    search.value = "do"; search.fire("input");
    assert.equal(f.timers.size, 1);
    f.panel.hidePopup();
    assert.equal(f.timers.size, 0, "closing the picker cancels pending search work");
  } finally { f.dispose(); }
});

test("picker records keep their identity across models so the search index is reused", () => {
  const record = (id, name, category) => ({ id, provider: "zen", name, kind: "svg", source: `${id}.svg`,
    categories: [category], aliases: [], tags: [], searchTokens: [name.toLowerCase()], order: 0 });
  const records = [record("zen:a", "Alpha", "Zeta Lab"), record("zen:b", "Beta", "Animals")];
  const metadata = { "Zeta Lab": { icon: "🧪", aliases: ["quuxalias"] } };
  const first = createPickerModel(records, { categoryMetadata: metadata });
  const second = createPickerModel(records, { categoryMetadata: metadata });
  const pick = (model) => model.snapshot().groups.flatMap((g) => g.records);
  assert.equal(pick(first)[0], pick(second)[0], "reopened picker reuses derived records");
  second.updateRecords(records, metadata);
  assert.equal(pick(second)[0], pick(first)[0], "catalogue refresh reuses derived records");
  first.setQuery("quuxalias");
  assert.deepEqual(pick(first).map((r) => r.id), ["zen:a"], "category aliases remain searchable");
  const third = createPickerModel(records, { categoryMetadata: { "Zeta Lab": { icon: "🧪", aliases: ["fooalias"] } } });
  third.setQuery("fooalias");
  assert.deepEqual(pick(third).map((r) => r.id), ["zen:a"], "changed aliases produce fresh derived records");
  third.setQuery("quuxalias");
  assert.deepEqual(pick(third), []);
});

test("snapshot is memoised until model state changes", () => {
  const model = createPickerModel([{ id: "zen:a", provider: "zen", name: "Alpha", kind: "svg", source: "a.svg",
    categories: ["Work"], aliases: [], tags: [], searchTokens: ["alpha"], order: 0 }]);
  const state = model.snapshot();
  assert.equal(model.snapshot(), state);
  model.setQuery("zzz");
  assert.notEqual(model.snapshot(), state);
  assert.equal(model.snapshot().groups.length, 0);
  model.setQuery("");
  model.setProviderEnabled("zen", false);
  assert.equal(model.snapshot().groups.length, 0);
  model.setProviderEnabled("zen", true);
  model.setCategoryEnabled("Work", false);
  assert.equal(model.snapshot().groups.length, 0);
});

test("observer keeps the same attribute filter and document coverage", async () => {
  const f = await fixture();
  try {
    assert.equal(f.observations.length, 1);
    const [{ target, options }] = f.observations;
    assert.equal(target, f.document.documentElement);
    assert.deepEqual([...options.attributeFilter], ["src", "href", "data-better-zen-folders-color"]);
    assert.equal(options.childList, true);
    assert.equal(options.subtree, true);
  } finally { f.dispose(); }
});
