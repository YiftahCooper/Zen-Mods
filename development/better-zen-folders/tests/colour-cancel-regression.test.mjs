import test from "node:test";
import assert from "node:assert/strict";
// Exercise BZF's public projection contract; no copied companion or ignored files.
import {
  FolderColorManager, createBrowserFolderColorAdapters,
  createBrowserFolderColorMenuAdapters,
} from "../scripts/better-zen-folders.uc.mjs";

class Node extends EventTarget {
  constructor(name) {
    super();
    this.localName = name;
    this.children = [];
    this.attrs = new Map();
    this.props = new Map();
    this.isConnected = true;
    this.style = {
      setProperty: (key, value) => this.props.set(key, String(value)),
      getPropertyValue: key => this.props.get(key) ?? "",
      removeProperty: key => this.props.delete(key),
    };
  }
  setAttribute(key, value) { this.attrs.set(key, String(value)); }
  getAttribute(key) { return this.attrs.get(key) ?? null; }
  removeAttribute(key) { this.attrs.delete(key); }
  toggleAttribute(key, on) { on ? this.setAttribute(key, "") : this.removeAttribute(key); }
  appendChild(node) { this.children.push(node); node.parentElement = this; return node; }
  remove() {
    if (this.parentElement)
      this.parentElement.children = this.parentElement.children.filter(node => node !== this);
    this.parentElement = null;
  }
  querySelector() { return null; }
  openPopup() {}
  hidePopup() { this.dispatchEvent(new Event("popuphidden")); }
  click() { this.dispatchEvent(new Event("click")); }
}
const descendants = node => node.children.flatMap(child => [child, ...descendants(child)]);

function fixture({ initial = "#22c55e", native = true, rejectWrite = false } = {}) {
  const folder = new Node("zen-folder");
  folder.id = "colour-investigation";
  folder.isZenFolder = true;
  const popupSet = new Node("popupset");
  const callbacks = [];
  const timers = [];
  const frames = new Map();
  let frameId = 0;
  const writes = [];
  const events = [];
  const initialArguments = [];
  const observers = new Set();
  let raw = initial === null ? "" : JSON.stringify({
    version: 1, entries: [{ id: folder.id, color: initial, updatedAt: 1 }],
  });
  let promptAccepted = false;
  const document = {
    documentElement: popupSet,
    getElementById: id => id === "mainPopupSet" ? popupSet : null,
    querySelectorAll: () => [folder],
    createXULElement: name => new Node(name),
    createElementNS: (_namespace, name) => new Node(name),
  };
  const host = {
    document, browsingContext: {}, CustomEvent,
    setTimeout: callback => timers.push(callback),
    requestAnimationFrame: callback => { frames.set(++frameId, callback); return frameId; },
    cancelAnimationFrame: id => frames.delete(id),
    Services: {
      prefs: {
        getStringPref: () => raw,
        setStringPref: (key, value) => {
          if (rejectWrite) throw Error("synthetic preference write rejection");
          raw = value;
          writes.push(value);
          for (const observer of observers) observer.observe(null, "nsPref:changed", key);
        },
        addObserver: (_key, observer) => observers.add(observer),
        removeObserver: (_key, observer) => observers.delete(observer),
      },
      prompt: { prompt: (_win, _title, _label, value) => {
        value.value = "#006020";
        return promptAccepted;
      } },
    },
  };
  if (native) {
    host.Ci = { nsIColorPicker: {} };
    host.Cc = { "@mozilla.org/colorpicker;1": { createInstance: () => ({
      init: (_context, _title, value) => initialArguments.push(value),
      open: callback => callbacks.push(callback),
    }) } };
  }
  folder.addEventListener("BetterZenFolderColorChanged", event => {
    events.push(event.detail.color);
  });
  const manager = new FolderColorManager(createBrowserFolderColorAdapters(host));
  manager.start();
  const menu = createBrowserFolderColorMenuAdapters(host);
  const openPanel = (actions = {}) => {
    assert.equal(menu.openPicker(folder, manager.getColor(folder), {
      read: () => manager.getColor(folder),
      apply: color => manager.setColor(folder, color),
      reset: () => manager.clearColor(folder),
      ...actions,
    }), true);
  };
  const command = action => descendants(popupSet).find(node =>
    node.getAttribute("data-better-zen-folders-colour-action") === action);
  const open = (actions = {}) => {
    openPanel(actions);
    descendants(popupSet).find(node =>
      node.getAttribute("data-better-zen-folders-colour-action") === "custom").click();
    return callbacks.at(-1);
  };
  const snapshot = () => ({
    raw, stored: manager.getColor(folder),
    attributes: [...folder.attrs], properties: [...folder.props],
    writes: [...writes], events: [...events],
  });
  return { folder, host, menu, manager, open, openPanel, command, snapshot, writes, events,
    copyStatus: () => descendants(popupSet).find(node =>
      node.getAttribute("data-better-zen-folders-colour-copy-status") === "true"),
    initialArguments, callbacks, frames, timers,
    setRaw: value => { raw = value; },
    frame: timestamp => {
      const pending = [...frames.values()]; frames.clear();
      for (const callback of pending) callback(timestamp);
    },
    flush: () => { while (timers.length) timers.shift()(); },
    acceptPrompt: () => { promptAccepted = true; },
  };
}

// Break caught: a sampled preview or unchanged completion reaches persistence.
for (const initial of ["#22c55e", "#808080", "#000000", "#ffffff", null]) {
  test(`repeated native Cancel preserves ledger and public projection: ${initial}`, () => {
    const f = fixture({ initial });
    const before = f.snapshot();
    for (let i = 0; i < 20; i++) {
      const callback = f.open();
      callback.update("#006020");
      assert.deepEqual(f.snapshot(), before, "preview must have no side effects");
      callback.done(initial ?? "#808080");
      f.flush();
      assert.deepEqual(f.snapshot(), before);
    }
    assert.equal(f.initialArguments[0], initial ?? "#808080");
  });
}

test("empty and malformed completions cannot reach the real ledger or projection", () => {
  const f = fixture();
  const before = f.snapshot();
  for (const returned of ["", null, "#fff", "red", "#123456;opacity:.5"]) {
    const callback = f.open();
    callback.update("#006020");
    callback.done(returned);
    f.flush();
    assert.deepEqual(f.snapshot(), before);
  }
});

// Break caught: acceptance becomes inert, double-writes, or loses canonical colour.
test("changed completion persists and projects exactly once; later callbacks cannot replace it", () => {
  const f = fixture();
  const callback = f.open();
  callback.update("#006020");
  callback.done("#AbCdEf");
  callback.done("#123456");
  f.flush();
  assert.equal(f.manager.getColor(f.folder), "#abcdef");
  assert.equal(f.folder.getAttribute("data-better-zen-folders-color"), "#abcdef");
  for (const key of ["--better-zen-folders-custom-color",
    "--better-zen-folders-folder-color"]) {
    assert.equal(f.folder.style.getPropertyValue(key), "#abcdef");
  }
  assert.equal(f.writes.length, 1);
  assert.deepEqual(f.events, ["#abcdef"]);
});

test("teardown invalidates a pending completion before any persistence or paint change", () => {
  const f = fixture();
  const before = f.snapshot();
  const callback = f.open();
  f.menu.removeOwnedUi(null);
  callback.done("#006020");
  f.flush();
  assert.deepEqual(f.snapshot(), before);
});

test("explicit fallback Cancel remains inert even with a changed returned prompt value", () => {
  const f = fixture({ native: false });
  const before = f.snapshot();
  f.open();
  assert.deepEqual(f.snapshot(), before);
  f.acceptPrompt();
  f.open();
  assert.equal(f.manager.getColor(f.folder), "#006020");
  assert.equal(f.writes.length, 1);
});

test("diagnostics report rejected persistence without claiming applied", () => {
  const f = fixture({ rejectWrite: true });
  const before = f.snapshot();
  f.open().done("#006020");
  f.flush();
  assert.deepEqual(f.snapshot(), before);
  const records = f.host.__betterZenFoldersColourDiagnostics;
  assert.equal(records.some(record => record.phase === "applied"), false);
  const outcome = records.find(record => record.phase === "apply-rejected");
  assert.equal(outcome?.applyResult, false);
  assert.equal(outcome?.persistedColor, "#22c55e");
  assert.equal(outcome?.persistenceReadStatus, "read");
});

// Characterization: the callback API carries no separate OK/Cancel boolean.
// Supplying a dark changed completion is a conditional input, NOT a native trace.
test("a changed dark completion is indistinguishable from an accepted selection", () => {
  const f = fixture();
  const callback = f.open();
  callback.update("#006020");
  callback.done("#006020");
  assert.equal(f.manager.getColor(f.folder), "#006020");
  assert.equal(f.writes.length, 1);
});

test("raw callback strings retain whitespace, case, empty and malformed values", () => {
  const f = fixture();
  for (const [raw, normalized] of [["  #AbCdEf  ", null], ["#AbCdEf", "#abcdef"], ["", null], ["#bad-value", null]]) {
    const callback = f.open();
    callback.update(raw);
    callback.done(raw);
    const records = f.host.__betterZenFoldersColourDiagnostics;
    const completion = records.findLast(record => record.phase === "completion");
    const preview = records.findLast(record => record.phase === "preview");
    assert.equal(completion.returnedColorRaw, raw);
    assert.equal(preview.returnedColorRaw, raw);
    assert.equal(completion.returnedColor, normalized);
  }
});

test("persisted read is independent of the cached manager value", () => {
  const f = fixture();
  const callback = f.open();
  f.setRaw(JSON.stringify({ version: 1, entries: [
    { id: f.folder.id, color: "#654321", updatedAt: 1 },
  ] }));
  callback.done("#22c55e");
  const completion = f.host.__betterZenFoldersColourDiagnostics.find(r => r.phase === "completion");
  assert.equal(completion.storedColor, "#22c55e");
  assert.equal(completion.persistedColor, "#654321");
  assert.equal(completion.persistenceReadStatus, "read");
});

test("successful native and prompt applies report post-apply persistence", () => {
  for (const native of [true, false]) {
    const f = fixture({ native });
    f.acceptPrompt();
    const callback = f.open();
    callback?.done("#006020");
    const outcome = f.host.__betterZenFoldersColourDiagnostics.find(r => r.phase === "applied");
    assert.equal(outcome?.applyResult, true);
    assert.equal(outcome?.persistedColor, "#006020");
    assert.equal(outcome?.storedColor, "#006020");
    assert.equal(outcome?.projectedColor, "#006020");
    assert.equal(f.frames.size, 1);
  }
});

test("frame sampling reads fresh computed values for every direct SVG paint descendant", () => {
  const f = fixture();
  const svg = new Node("svg");
  const nodes = [new Node("rect"), new Node("rect"), new Node("path"), new Node("g")];
  nodes.forEach((node, index) => node.setAttribute("class", ["front", "front", "back", "icon"][index]));
  f.folder.querySelector = () => svg;
  svg.querySelectorAll = selector => nodes.filter(node =>
    selector.split(",").map(part => part.trim()).includes(`.${node.getAttribute("class")}`));
  let fill = "rgb(34, 197, 94)";
  f.host.getComputedStyle = node => ({ getPropertyValue: key => {
    if (key === "fill") return fill;
    if (key === "fill-opacity") return node === nodes[1] ? "0.1" : "1";
    if (key === "filter") return "contrast(1.25)";
    if (key === "opacity") return "1";
    return "";
  } });
  f.open().done("#22c55e");
  const records = f.host.__betterZenFoldersColourDiagnostics;
  assert.equal(f.timers.length, 0, "a timer must not masquerade as a rendered frame");
  assert.equal(f.frames.size, 1);
  assert.equal(records.some(r => r.phase === "animation-frame"), false);
  fill = "rgb(0, 96, 32)";
  f.frame(123.5);
  const frame = records.at(-1);
  assert.equal(frame.phase, "animation-frame");
  assert.equal(frame.frameTime, 123.5);
  assert.equal(frame.descendantPaint.length, 4);
  assert.equal(frame.descendantPaint[0].fill, "rgb(0, 96, 32)");
  assert.equal(frame.descendantPaint[1].fillOpacity, "0.1");
  assert.equal(frame.descendantPaint[2].filter, "contrast(1.25)");
  assert.equal(frame.iconFilter, "contrast(1.25)");
});

test("teardown cancels queued diagnostic frames", () => {
  const f = fixture();
  f.open().done("#22c55e");
  assert.equal(f.frames.size, 1);
  const count = f.host.__betterZenFoldersColourDiagnostics.length;
  f.menu.removeOwnedUi(null);
  assert.equal(f.frames.size, 0);
  f.frame(1);
  assert.equal(f.host.__betterZenFoldersColourDiagnostics.length, count);
});

test("unavailable frame API and unreadable persistence are reported as unknown", () => {
  const f = fixture();
  delete f.host.requestAnimationFrame;
  const callback = f.open();
  f.host.Services.prefs.getStringPref = () => { throw Error("read denied"); };
  callback.done("#22c55e");
  const record = f.host.__betterZenFoldersColourDiagnostics.at(-1);
  assert.equal(record.phase, "unchanged");
  assert.equal(record.frameSampling, "unavailable");
  assert.equal(record.persistenceReadStatus, "error");
  assert.equal(record.persistedColor, null);
  assert.equal(f.timers.length, 0);
});

test("diagnostic style failures cannot prevent accepting a valid colour", () => {
  const f = fixture();
  f.host.getComputedStyle = () => { throw Error("detached style"); };
  f.open().done("#123456");
  assert.equal(f.manager.getColor(f.folder), "#123456");
  assert.equal(f.writes.length, 1);
});

const settleCopy = () => new Promise(resolve => setImmediate(resolve));

function installNativeClipboard(f, copyString) {
  const clipboardInterface = {};
  f.host.Ci = { ...f.host.Ci, nsIClipboardHelper: clipboardInterface };
  f.host.Cc = { ...f.host.Cc, "@mozilla.org/widget/clipboardhelper;1": {
    getService: iface => {
      assert.equal(iface, clipboardInterface);
      return { copyString };
    },
  } };
}

test("diagnostic copy is hidden and disabled until a trace exists on a later panel opening", async () => {
  const f = fixture();
  const copied = [];
  installNativeClipboard(f, text => copied.push(text));
  f.openPanel();
  assert.equal(f.command("copy-diagnostic"), undefined, "the pristine panel only has its normal colour actions");
  assert.equal(f.host.__betterZenFoldersColourDiagnostics, undefined);
  f.open().done("#22c55e");
  f.openPanel();
  const button = f.command("copy-diagnostic");
  assert.ok(button, "a later panel opening offers the captured trace");
  f.host.__betterZenFoldersColourDiagnostics.length = 0;
  f.openPanel();
  assert.equal(button.hidden, true);
  assert.equal(button.disabled, true);
  assert.equal(button.style.getPropertyValue("display"), "none", "authored flex styling must not defeat hidden");
  button.click();
  await settleCopy();
  assert.equal(copied.length, 0);
  assert.equal(f.copyStatus().hidden, true);
  assert.equal(f.host.__betterZenFoldersColourDiagnostics.length, 0);
});

test("after Cancel an explicit native copy exports the trace without changing colour or panel actions", async () => {
  const f = fixture();
  f.folder.name = "PRIVATE FOLDER NAME";
  const before = f.snapshot();
  const copied = [];
  installNativeClipboard(f, text => copied.push(text));
  f.open().done("#22c55e");
  assert.equal(copied.length, 0, "capturing a trace never exports automatically");
  f.openPanel();
  const button = f.command("copy-diagnostic");
  assert.ok(button, "copy is offered after a trace exists");
  assert.equal(button.hidden, false);
  assert.equal(button.disabled, false);
  assert.equal(button.textContent, "Copy Colour Diagnostic");
  button.click();
  await settleCopy();
  assert.equal(copied.length, 1);
  const records = JSON.parse(copied[0]);
  assert.deepEqual(records.map(record => record.phase), ["pre-panel", "open", "completion", "unchanged", "copy"]);
  assert.equal(records.find(record => record.phase === "completion").returnedColorRaw, "#22c55e");
  assert.equal(copied[0].includes(f.folder.id), false);
  assert.equal(copied[0].includes(f.folder.name), false);
  assert.match(f.copyStatus().textContent, /copied/i);
  assert.deepEqual(f.snapshot(), before);
  assert.equal(f.writes.length, 0, "Cancel and diagnostic copy must not persist colour");
  assert.equal(f.events.length, 0, "diagnostic capture must not emit a colour-change event");
  assert.equal(f.command("reset").disabled, false);
  f.command("reset").click();
  assert.equal(f.manager.getColor(f.folder), null, "copy must not clear the active panel target");
});

test("native clipboard rejection reports failure without falling through to another writer", async () => {
  const f = fixture();
  let fallbackCalls = 0;
  installNativeClipboard(f, () => { throw Error("clipboard refused"); });
  f.host.navigator = { clipboard: { writeText: () => { fallbackCalls++; } } };
  f.open().done("#22c55e");
  f.openPanel();
  const button = f.command("copy-diagnostic");
  assert.ok(button);
  button.click();
  await settleCopy();
  assert.match(f.copyStatus().textContent, /could not copy/i);
  assert.doesNotMatch(f.copyStatus().textContent, /copied/i);
  assert.equal(button.disabled, false, "a failed copy can be retried explicitly");
  assert.equal(fallbackCalls, 0);
  assert.equal(f.writes.length, 0);
});

test("supported async clipboard reports success only after resolution and failure on rejection", async () => {
  const f = fixture();
  let resolveCopy, rejectCopy, calls = 0;
  f.host.navigator = { clipboard: { writeText: () => {
    calls++;
    return new Promise((resolve, reject) => { resolveCopy = resolve; rejectCopy = reject; });
  } } };
  f.open().done("#22c55e");
  f.openPanel();
  const button = f.command("copy-diagnostic");
  assert.ok(button);
  button.click();
  assert.equal(button.disabled, true);
  assert.doesNotMatch(f.copyStatus().textContent, /copied/i);
  button.click();
  assert.equal(calls, 1, "no duplicate exports while a copy is pending");
  rejectCopy(Error("permission denied"));
  await settleCopy();
  assert.match(f.copyStatus().textContent, /could not copy/i);
  assert.equal(button.disabled, false);
  button.click();
  resolveCopy();
  await settleCopy();
  assert.match(f.copyStatus().textContent, /copied/i);
  assert.equal(f.writes.length, 0);
});

for (const outcome of ["resolve", "reject"]) {
  test(`an async copy ${outcome} after teardown cannot update detached UI or trigger another export`, async () => {
    const f = fixture();
    let completeCopy, calls = 0;
    f.host.navigator = { clipboard: { writeText: () => {
      calls++;
      return new Promise((resolve, reject) => { completeCopy = outcome === "resolve" ? resolve : reject; });
    } } };
    f.open().done("#22c55e");
    f.openPanel();
    const button = f.command("copy-diagnostic");
    assert.ok(button);
    const status = f.copyStatus();
    button.click();
    const pendingStatus = status.textContent;
    f.menu.removeOwnedUi(null);
    completeCopy(Error("window unloaded"));
    await settleCopy();
    assert.equal(status.textContent, pendingStatus);
    button.click();
    await settleCopy();
    assert.equal(calls, 1);
    assert.equal(f.writes.length, 0);
  });
}

test("diagnostic retention and exported JSON contain at most the 200 most recent records", async () => {
  const f = fixture();
  const before = f.snapshot();
  const callback = f.open();
  for (let i = 0; i < 250; i++) callback.update(`#${i.toString(16).padStart(6, "0")}`);
  const records = f.host.__betterZenFoldersColourDiagnostics;
  assert.equal(records.length, 200, "the window-local trace is a bounded ring");
  assert.equal(records[0].returnedColorRaw, "#000032");
  assert.equal(records.at(-1).returnedColorRaw, "#0000f9");
  callback.done("#22c55e");
  let copied;
  installNativeClipboard(f, text => { copied = text; });
  f.openPanel();
  f.command("copy-diagnostic").click();
  await settleCopy();
  assert.equal(JSON.parse(copied).length, 200);
  assert.equal(JSON.parse(copied).at(-1).phase, "copy");
  assert.deepEqual(f.snapshot(), before, "preview, Cancel, eviction and fresh copy must not change colour state");
});

test("copied diagnostics exclude identities, unknown fields and URL-bearing SVG paints", async () => {
  const f = fixture();
  const callback = f.open();
  callback.done("#22c55e");
  Object.assign(f.host.__betterZenFoldersColourDiagnostics[0], {
    folderName: "PRIVATE FOLDER", folderId: "PRIVATE-ID", url: "https://private.invalid/",
    returnedColorRaw: "PRIVATE FOLDER",
    descendantPaint: [{ element: "rect", part: "front private-folder-id",
      fill: 'url("chrome://browser/content/a)b.xhtml#private-gradient")',
      opacity: "1", folderName: "PRIVATE FOLDER" }],
  });
  let copied;
  installNativeClipboard(f, text => { copied = text; });
  f.openPanel();
  const button = f.command("copy-diagnostic");
  assert.ok(button);
  button.click();
  await settleCopy();
  assert.doesNotMatch(copied, /private|chrome:\/\/|https:\/\/|folderId|folderName/i);
  const paint = JSON.parse(copied)[0].descendantPaint[0];
  assert.equal(paint.part, "front");
  assert.equal(paint.opacity, "1");
  assert.match(paint.fill, /redacted/i);
});

test("a copy completing after a new panel opening cannot replace its current feedback", async () => {
  const f = fixture();
  let resolveCopy;
  f.host.navigator = { clipboard: { writeText: () => new Promise(resolve => { resolveCopy = resolve; }) } };
  f.open().done("#22c55e");
  f.openPanel();
  f.command("copy-diagnostic").click();
  f.openPanel();
  assert.equal(f.copyStatus().hidden, true);
  resolveCopy();
  await settleCopy();
  assert.equal(f.copyStatus().textContent, "");
  assert.equal(f.command("copy-diagnostic").disabled, false);
});

test("a host without a supported clipboard reports failure and leaves colour unchanged", async () => {
  const f = fixture();
  const before = f.snapshot();
  f.open().done("#22c55e");
  f.openPanel();
  f.command("copy-diagnostic").click();
  await settleCopy();
  assert.match(f.copyStatus().textContent, /could not copy/i);
  assert.deepEqual(f.snapshot(), before);
});
