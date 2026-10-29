import test from "node:test";
import assert from "node:assert/strict";

import {
  MoveToFolderMenuDecorator,
  createBrowserMoveToFolderMenuAdapters,
} from "../scripts/better-zen-folders.uc.mjs";

class FakeEventTarget {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
  }
  removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener); }
  emit(type, event = {}) {
    event.type = type;
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

function makeItem(folder, { image = null, iconic = false, iconSlot = null } = {}) {
  const attributes = new Map();
  if (image) attributes.set("image", image);
  const classes = new Set(iconic ? ["menuitem-iconic"] : []);
  const styleProperties = new Map();
  return {
    _group: folder,
    attributes,
    classes,
    styleProperties,
    classList: {
      add: (...names) => names.forEach(name => classes.add(name)),
      remove: (...names) => names.forEach(name => classes.delete(name)),
      contains: name => classes.has(name),
    },
    hasAttribute: name => attributes.has(name),
    getAttribute: name => attributes.get(name) ?? null,
    setAttribute: (name, value) => attributes.set(name, String(value)),
    removeAttribute: name => attributes.delete(name),
    querySelector: selector => selector.includes("menu-iconic-left")
      ? iconSlot
      : null,
    style: {
      getPropertyValue: name => styleProperties.get(name) ?? "",
      getPropertyPriority: () => "",
      setProperty: (name, value) => styleProperties.set(name, value),
      removeProperty: name => styleProperties.delete(name),
    },
  };
}

function makeVisualNode(name, computed = {}, children = []) {
  const classes = new Set();
  const styleProperties = new Map();
  const node = {
    name,
    computed,
    children,
    parentNode: null,
    classList: {
      add: (...names) => names.forEach(value => classes.add(value)),
      contains: value => classes.has(value),
    },
    style: {
      getPropertyValue: property => styleProperties.get(property) ?? "",
      getPropertyPriority: () => "",
      setProperty: (property, value) => styleProperties.set(property, value),
    },
    querySelectorAll: selector => selector === "*"
      ? node.children.flatMap(child => [child, ...child.querySelectorAll("*")])
      : [],
    cloneNode: deep => {
      const clone = makeVisualNode(
        name,
        computed,
        deep ? node.children.map(child => child.cloneNode(true)) : [],
      );
      clone.clonedFrom = node;
      return clone;
    },
    remove() {
      node.parentNode?.removeChild?.(node);
    },
  };
  for (const child of children) child.parentNode = node;
  return node;
}

function makeIconSlot() {
  const slot = {
    children: [],
    appendChild(node) {
      node.parentNode = slot;
      slot.children.push(node);
      return node;
    },
    removeChild(node) {
      const index = slot.children.indexOf(node);
      if (index >= 0) slot.children.splice(index, 1);
      node.parentNode = null;
    },
  };
  return slot;
}

// Gecko 155's native menuitem fragment has an HTML img as a direct child.
function makeCurrentMenuItem(folder) {
  const item = Object.assign(makeItem(folder, { image: "native.svg", iconic: true }), makeIconSlot());
  const image = makeVisualNode("img");
  const label = makeVisualNode("label");
  item.appendChild(image);
  item.appendChild(label);
  item.querySelector = selector => selector === ":scope > .menu-icon" ? image : null;
  item.insertBefore = (node, before) => {
    node.parentNode = item;
    item.children.splice(item.children.indexOf(before), 0, node);
    return node;
  };
  return { item, image, label };
}

for (const custom of [false, true]) {
  test(`current native menu clones ${custom ? "cold-restored custom" : "default"} folder presentation`, () => {
    const sourceSvg = makeVisualNode("svg", {}, [makeVisualNode("back", {
      fill: "rgb(255, 0, 0)", opacity: custom ? "0" : "1",
    }), makeVisualNode("image", { fill: "rgb(255, 0, 0)" })]);
    const folder = {
      iconURL: custom ? "custom.svg" : null,
      getAttribute: () => null, // No transient Zen Icons selection marker on restart.
      querySelector: selector => selector.includes("tab-group-folder-icon") ? sourceSvg : null,
    };
    const { item, image, label } = makeCurrentMenuItem(folder);
    const adapters = createBrowserMoveToFolderMenuAdapters({
      getComputedStyle: node => ({ getPropertyValue: name => node.computed[name] ?? "" }),
    });
    adapters.decorateItem(item, folder, "#ff0000");
    assert.equal(item.children.length, 3);
    const clone = item.children[0];
    assert.equal(clone.clonedFrom, sourceSvg);
    assert.equal(item.children[1], image);
    assert.equal(item.children[2], label);
    assert.equal(clone.children[0].style.getPropertyValue("opacity"), custom ? "0" : "1");
    assert.equal(clone.children[1].style.getPropertyValue("fill"), "rgb(255, 0, 0)");
    adapters.decorateItem(item, folder, "#ff0000");
    assert.equal(item.children.length, 3, "redecoration must not duplicate the SVG");
    item.setAttribute("image", "externally-updated.svg");
    adapters.clearItem(item);
    assert.deepEqual(item.children, [image, label]);
    assert.equal(item.getAttribute("image"), "externally-updated.svg");
  });
}

test("menu fallback never borrows a nested child's icon through an unscoped native getter", () => {
  const folder = {
    iconURL: null,
    getAttribute: () => null,
    querySelector: () => null, // This parent's direct icon is not initialized.
    icon: { querySelector: () => ({ getAttribute: () => "nested-child.svg" }) },
  };
  const item = makeItem(folder);
  createBrowserMoveToFolderMenuAdapters({}).decorateItem(item, folder, null);
  assert.equal(item.getAttribute("image"), "chrome://browser/skin/zen-icons/folder.svg");
});

test("a missing direct SVG also excludes Zen's descendant-based iconURL getter", () => {
  const folder = {
    querySelector: () => null,
    get iconURL() { return "nested-child-via-native-url.svg"; },
  };
  const item = makeItem(folder);
  createBrowserMoveToFolderMenuAdapters({}).decorateItem(item, folder, null);
  assert.equal(item.getAttribute("image"), "chrome://browser/skin/zen-icons/folder.svg");
});

test("direct visible SVG source takes precedence over an older compatibility projection", () => {
  const image = { getAttribute: name => name === "href" ? "current-parent.svg" : null };
  const svg = { querySelector: selector => selector === ".icon image" ? image : null };
  const folder = {
    iconURL: "native-default.svg",
    getAttribute: () => "old-projection.svg",
    querySelector: selector => selector.includes("tab-group-folder-icon") ? svg : null,
  };
  const item = makeItem(folder);
  createBrowserMoveToFolderMenuAdapters({}).decorateItem(item, folder, null);
  assert.equal(item.getAttribute("image"), "current-parent.svg");
});

function makePreferenceFixture(enabled = true) {
  let subscriber = null;
  return {
    preferences: {
      get: name => name === "decorateMoveToFolderMenu" ? enabled : undefined,
      subscribe: (name, callback) => {
        assert.equal(name, "decorateMoveToFolderMenu");
        subscriber = callback;
        return () => { subscriber = null; };
      },
    },
    set(value) { enabled = value; subscriber?.(value); },
  };
}

test("native Move to Folder items gain visible icons and folder colours without replacement", () => {
  const menu = new FakeEventTarget();
  const folderA = { id: "a", isZenFolder: true, iconURL: "chrome://icons/a.svg" };
  const folderB = { id: "b", isZenFolder: true, iconURL: null };
  const itemA = makeItem(folderA, { image: folderA.iconURL });
  const itemB = makeItem(folderB);
  const items = [itemA, itemB];
  const decorated = [];
  const cleared = [];
  const preference = makePreferenceFixture(true);
  const manager = new MoveToFolderMenuDecorator({
    ...preference,
    menuTarget: () => menu,
    listNativeItems: () => items,
    getItemFolder: item => item._group,
    getFolderDisplayColor: (folder, custom) => custom ?? `default-${folder.id}`,
    decorateItem: (item, folder, color) => decorated.push({ item, folder, color }),
    clearItem: item => cleared.push(item),
  }, {
    getColor: folder => folder === folderA ? "#123456" : null,
  });
  manager.start(new AbortController().signal);

  menu.emit("popupshowing", {});

  assert.deepEqual(decorated, [
    { item: itemA, folder: folderA, color: "#123456" },
    { item: itemB, folder: folderB, color: "default-b" },
  ]);
  assert.equal(items[0], itemA);
  assert.equal(items[1], itemB);

  menu.emit("popuphidden", {});
  assert.deepEqual(cleared, [itemA, itemB]);
});

test("Move to Folder decoration preference updates immediately and teardown is owned", () => {
  const menu = new FakeEventTarget();
  const folder = { id: "folder", isZenFolder: true };
  const item = makeItem(folder);
  const preference = makePreferenceFixture(true);
  let decorations = 0;
  let clears = 0;
  const controller = new AbortController();
  const manager = new MoveToFolderMenuDecorator({
    ...preference,
    menuTarget: () => menu,
    listNativeItems: () => [item],
    getItemFolder: current => current._group,
    getFolderDisplayColor: (_folder, custom) => custom,
    decorateItem: () => { decorations++; },
    clearItem: () => { clears++; },
  }, { getColor: () => "#abcdef" });
  manager.start(controller.signal);

  menu.emit("popupshowing", {});
  assert.equal(decorations, 1);
  preference.set(false);
  assert.equal(clears, 1);
  menu.emit("popupshowing", {});
  assert.equal(decorations, 1);

  preference.set(true);
  menu.emit("popupshowing", {});
  assert.equal(decorations, 2);
  controller.abort();
  assert.equal(clears, 3, "plain-mode projection is also cleaned up");
  assert.equal(manager.destroyed, true);
});

test("browser Move to Folder adapter adds and removes only its own presentation", () => {
  const menu = {
    querySelectorAll: selector => selector === ".context-zen-move-to-folder-item"
      ? [nativeImageItem, compatibilityItem, liveSvgItem, fallbackItem]
      : [],
  };
  const folderA = {
    id: "a",
    isZenFolder: true,
    iconURL: "chrome://browser/skin/zen-icons/folder.svg",
    getAttribute: name => name === "data-zen-icons-icon-source"
      ? "chrome://icons/a-compatibility.svg"
      : null,
  };
  const folderCompatibility = {
    id: "compatibility",
    isZenFolder: true,
    iconURL: null,
    getAttribute: name => name === "data-zen-icons-icon-source"
      ? "chrome://icons/compatibility.svg"
      : null,
    icon: {
      querySelector: () => ({ getAttribute: () => "chrome://icons/ignored-live.svg" }),
    },
  };
  const folderLiveSvg = {
    id: "live-svg",
    isZenFolder: true,
    iconURL: null,
    getAttribute: () => null,
    icon: {
      querySelector: selector => selector === "svg .icon image"
        ? { getAttribute: name => name === "href" ? "chrome://icons/live.svg" : null }
        : null,
    },
  };
  const folderB = { id: "b", isZenFolder: true, iconURL: null };
  const nativeImageItem = makeItem(folderA, { image: folderA.iconURL, iconic: true });
  const compatibilityItem = makeItem(folderCompatibility);
  const liveSvgItem = makeItem(folderLiveSvg);
  const fallbackItem = makeItem(folderB);
  const adapters = createBrowserMoveToFolderMenuAdapters({
    document: { getElementById: id => id === "context_zenMoveToFolder" ? menu : null },
    getComputedStyle: () => ({
      getPropertyValue: property => property === "--better-zen-folders-folder-color"
        ? "rgb(1, 2, 3)"
        : "",
    }),
  }, { getColor: folder => folder === folderA ? "#123456" : null });

  assert.deepEqual(
    adapters.listNativeItems(),
    [nativeImageItem, compatibilityItem, liveSvgItem, fallbackItem],
  );
  adapters.decorateItem(nativeImageItem, folderA, "#123456");
  adapters.decorateItem(compatibilityItem, folderCompatibility, null);
  adapters.decorateItem(liveSvgItem, folderLiveSvg, null);
  adapters.decorateItem(fallbackItem, folderB, "rgb(1, 2, 3)");

  assert.equal(nativeImageItem.classList.contains("menuitem-iconic"), true);
  assert.equal(
    nativeImageItem.getAttribute("image"),
    "chrome://icons/a-compatibility.svg",
  );
  assert.equal(
    compatibilityItem.getAttribute("image"),
    "chrome://icons/compatibility.svg",
  );
  assert.equal(liveSvgItem.getAttribute("image"), "chrome://icons/live.svg");
  assert.equal(fallbackItem.classList.contains("menuitem-iconic"), true);
  assert.equal(fallbackItem.getAttribute("image"), "chrome://browser/skin/zen-icons/folder.svg");
  assert.equal(fallbackItem.getAttribute("data-better-zen-folders-menu-color"), "rgb(1, 2, 3)");

  adapters.clearItem(nativeImageItem);
  adapters.clearItem(compatibilityItem);
  adapters.clearItem(liveSvgItem);
  adapters.clearItem(fallbackItem);

  assert.equal(nativeImageItem.classList.contains("menuitem-iconic"), true);
  assert.equal(nativeImageItem.getAttribute("image"), folderA.iconURL);
  assert.equal(compatibilityItem.hasAttribute("image"), false);
  assert.equal(liveSvgItem.hasAttribute("image"), false);
  assert.equal(fallbackItem.classList.contains("menuitem-iconic"), false);
  assert.equal(fallbackItem.hasAttribute("image"), false);
  assert.equal(fallbackItem.hasAttribute("data-better-zen-folders-menu-color"), false);
});

test("browser adapter snapshots a custom folder's live SVG and cleans it up", () => {
  const sourceBack = makeVisualNode("back", {
    opacity: "1",
    fill: "rgb(34, 197, 94)",
    stroke: "rgb(0, 0, 0)",
  });
  const sourceImage = makeVisualNode("image", {
    opacity: "1",
    fill: "rgb(0, 0, 0)",
    stroke: "rgb(0, 0, 0)",
  });
  const sourceIcon = makeVisualNode("icon", {
    opacity: "1",
    transform: "matrix(1, 0, 0, 1, 0, 0)",
  }, [sourceImage]);
  const sourceSvg = makeVisualNode("svg", {}, [sourceBack, sourceIcon]);
  const iconSlot = makeIconSlot();
  const defaultSource = "chrome://browser/skin/zen-icons/folder.svg";
  const customSource = "chrome://icons/custom-football.svg";
  const folder = {
    id: "custom",
    isZenFolder: true,
    iconURL: defaultSource,
    getAttribute: name => name === "data-zen-icons-icon-source"
      ? customSource
      : null,
    querySelector: selector => selector.includes("tab-group-folder-icon")
      ? sourceSvg
      : null,
  };
  const item = makeItem(folder, { image: defaultSource, iconic: true, iconSlot });
  const adapters = createBrowserMoveToFolderMenuAdapters({
    document: { getElementById: () => null },
    getComputedStyle: node => ({
      getPropertyValue: property => node?.computed?.[property] ?? "",
      getPropertyPriority: () => "",
    }),
  });

  adapters.decorateItem(item, folder, "#22c55e");

  assert.equal(item.getAttribute("image"), customSource);
  assert.equal(
    item.classList.contains("better-zen-folders-has-live-folder-icon"),
    true,
  );
  assert.equal(iconSlot.children.length, 1);
  const clone = iconSlot.children[0];
  assert.equal(clone.clonedFrom, sourceSvg);
  assert.equal(
    clone.classList.contains("better-zen-folders-menu-live-folder-icon"),
    true,
  );
  const [cloneBack, cloneIcon, cloneImage] = clone.querySelectorAll("*");
  assert.equal(cloneBack.style.getPropertyValue("fill"), "rgb(34, 197, 94)");
  assert.equal(cloneBack.style.getPropertyValue("stroke"), "rgb(0, 0, 0)");
  assert.equal(cloneIcon.style.getPropertyValue("opacity"), "1");
  assert.equal(cloneImage.style.getPropertyValue("fill"), "rgb(0, 0, 0)");

  adapters.clearItem(item);

  assert.equal(iconSlot.children.length, 0);
  assert.equal(
    item.classList.contains("better-zen-folders-has-live-folder-icon"),
    false,
  );
  assert.equal(item.getAttribute("image"), defaultSource);

  sourceBack.computed.opacity = "0";
  sourceImage.computed.fill = "rgb(34, 197, 94)";
  sourceImage.computed.stroke = "rgb(34, 197, 94)";
  sourceIcon.computed.transform = "matrix(1.36, 0, 0, 1.36, 0, 0)";
  adapters.decorateItem(item, folder, "#22c55e");

  const [hiddenBack, enlargedIcon, colouredImage] =
    iconSlot.children[0].querySelectorAll("*");
  assert.equal(hiddenBack.style.getPropertyValue("opacity"), "0");
  assert.equal(
    enlargedIcon.style.getPropertyValue("transform"),
    "matrix(1.36, 0, 0, 1.36, 0, 0)",
  );
  assert.equal(colouredImage.style.getPropertyValue("fill"), "rgb(34, 197, 94)");

  adapters.clearItem(item);
  assert.equal(iconSlot.children.length, 0);
});

test('a folder menu snapshot uses the settled CSS transition target without changing the source animation',()=>{
 let cancelled=0,finished=0;
 const sourceBack=makeVisualNode('back',{opacity:'.00698145',transform:'matrix(1, 0, 0, 1, 2, 0)'});
 sourceBack.getAnimations=()=>[
  {transitionProperty:'opacity',effect:{target:sourceBack,getKeyframes:()=>[{opacity:'1',offset:0},{opacity:'0',offset:1}]},cancel(){cancelled++;},finish(){finished++;}},
  {transitionProperty:'transform',effect:{target:sourceBack,getKeyframes:()=>[{transform:'none',offset:0},{transform:'matrix(.85, 0, .25, .85, -4, 2)',offset:1}]}},
 ];
 const sourceSvg=makeVisualNode('svg',{},[sourceBack]),folder={getAttribute:()=>null,
  querySelector:selector=>selector.includes('tab-group-folder-icon')?sourceSvg:null};
 const {item}=makeCurrentMenuItem(folder);
 createBrowserMoveToFolderMenuAdapters({getComputedStyle:node=>({getPropertyValue:key=>node.computed[key]??''})})
  .decorateItem(item,folder,'#ff8000');
 const clone=item.children[0].children[0];
 assert.equal(clone.style.getPropertyValue('opacity'),'0');
 assert.equal(clone.style.getPropertyValue('transform'),'matrix(.85, 0, .25, .85, -4, 2)');
 assert.equal(sourceBack.computed.opacity,'.00698145');assert.equal(cancelled,0);assert.equal(finished,0);
});
