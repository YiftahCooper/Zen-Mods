import test from "node:test";
import assert from "node:assert/strict";
import {
  FolderColorMenuManager,
  createBrowserFolderColorMenuAdapters,
} from "../scripts/better-zen-folders.uc.mjs";
import { FakeElement } from "./fakes.mjs";

// Native IDs, element kinds and image -> srcset inheritance inspected in
// Zen 1.22.2b / 20260915091052 browser.xhtml and toolkit/elements/menu.js.
const nativeCommands = [
  ["context_zenFolderRename", "menuitem"],
  ["context_zenFolderChangeIcon", "menuitem"],
  ["context_zenFolderUnloadAll", "menuitem"],
  ["context_zenFolderNewSubfolder", "menuitem"],
  ["context_zenChangeFolderSpace", "menu"],
  ["context_zenFolderToSpace", "menuitem"],
  ["context_zenShareFolder", "menuitem"],
  ["context_zenFolderUnpack", "menuitem"],
  ["context_zenFolderDelete", "menuitem"],
];

function element(name, id) {
  const node = new FakeElement(name);
  node.setAttribute("id", id);
  node.id = id;
  node.classList.remove = (...names) => names.forEach(value => node._classes.delete(value));
  node.styleValues = new Map();
  node.style = {
    setProperty: (key, value) => node.styleValues.set(key, String(value)),
    getPropertyValue: key => node.styleValues.get(key) ?? "",
    removeProperty: key => node.styleValues.delete(key),
  };
  return node;
}

function fixture(enabled = "mod") {
  const menu = element("menupopup", "zenFolderActions");
  const nodes = new Map([[menu.id, menu]]);
  for (const [id, kind] of [...nativeCommands,
    ["better-zen-folders-sticky-folder", "menuitem"], ["unknown-command", "menuitem"]]) {
    const item = element(kind, id);
    item.slot = element("img", `${id}-slot`);
    item.appendChild(item.slot);
    item.querySelector = selector => selector.includes(".menu-icon") ? item.slot : null;
    const setAttribute = item.setAttribute.bind(item);
    const removeAttribute = item.removeAttribute.bind(item);
    item.setAttribute = (key, value) => {
      setAttribute(key, value);
      if (key === "image") item.slot.setAttribute("srcset", value);
    };
    item.removeAttribute = key => {
      removeAttribute(key);
      if (key === "image") item.slot.removeAttribute("srcset");
    };
    menu.appendChild(item);
    nodes.set(id, item);
  }
  const folder = { id: "fixture", isZenFolder: true };
  let subscriber;
  const preferences = {
    get: name => name === "commandIconMode" ? enabled : undefined,
    subscribe: (name, callback) => {
      assert.equal(name, "commandIconMode");
      subscriber = callback;
      return () => { subscriber = null; };
    },
  };
  const document = {
    popupNode: folder,
    getElementById: id => nodes.get(id) ?? menu.children.find(node => node.getAttribute("id") === id),
    createXULElement: name => element(name, ""),
  };
  const host = {
    document,
    getComputedStyle: (node, pseudo) => ({
      getPropertyValue: key => node.styleValues.get(`${pseudo ?? ""}|${key}`)
        ?? node.styleValues.get(key) ?? "",
    }),
  };
  // Gecko uses menu::after for the trailing submenu arrow, not a command icon.
  nodes.get("context_zenChangeFolderSpace").styleValues.set("::after|content", '""');
  nodes.get("context_zenChangeFolderSpace").styleValues.set("::after|background-image", 'url("menu-arrow.svg")');
  const adapters = createBrowserFolderColorMenuAdapters(host, preferences);
  const manager = new FolderColorMenuManager(adapters, { getColor: () => null });
  return {
    host, menu, nodes, manager,
    show: () => manager.onPopupShowing({ target: menu }),
    setIcons: value => { enabled = value; subscriber?.(value); },
  };
}

// Round4 explicitly withdrew the nine native fallbacks. Every mode must leave
// native commands byte-for-byte alone, including external icon channels.
for (const mode of ["off", "mod", "compatibility"]) {
  test(`native commands remain untouched in ${mode} mode`, () => {
    const f = fixture(mode);
    const item = f.nodes.get("context_zenFolderChangeIcon");
    item.setAttribute("image", "external.svg");
    item.style.setProperty("--menu-image", 'url("cmi.svg")');
    const snapshot = () => nativeCommands.map(([id]) => {
      const node = f.nodes.get(id);
      return {attributes:[...node.attributes], classes:[...node._classes],
        styles:[...node.styleValues], slot:[...node.slot.attributes]};
    });
    const before = snapshot();
    f.manager.start(); f.show();
    assert.deepEqual(snapshot(), before);
    f.setIcons("off"); f.manager.destroy();
    assert.deepEqual(snapshot(), before);
  });
}
