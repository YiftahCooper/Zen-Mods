import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";
import { performance } from "node:perf_hooks";
import { buildCustomIconCatalog } from "../../src/zen/common/emojis/ZenCustomIconPacks.mjs";
import { createPickerModel } from "../../src/zen-icons-sine/picker-model.mjs";
import { findFolderForAnchor } from "../../src/zen-icons-sine/folder-anchor.mjs";
import { createSelectionBridge } from "../../src/zen-icons-sine/selection-bridge.mjs";
const root = path.resolve(import.meta.dirname, "../..");

export const tick = () => new Promise((resolve) => setImmediate(resolve));

export class Element {
  constructor(tag) {
    this.tag = tag;
    this.children = [];
    this.parentNode = null;
    this.attributes = new Map();
    this.dataset = {};
    this.listeners = new Map();
    this.properties = new Map();
    this.hidden = false;
    this.state = "closed";
    this.style = {
      setProperty: (n, v) => this.properties.set(n, String(v)),
      removeProperty: (n) => this.properties.delete(n),
      getPropertyValue: (n) => this.properties.get(n) || "",
    };
    this.className = "";
    this.classList = {
      add: (...v) =>
        (this.className = [
          ...new Set([...this.className.split(" "), ...v]),
        ].join(" ")),
      contains: (v) => this.className.split(" ").includes(v),
    };
  }
  get nodeType() {
    return this.tag === "#text" ? 3 : this.tag === "#fragment" ? 11 : 1;
  }
  get localName() {
    return this.tag;
  }
  setAttribute(k, v) {
    this.attributes.set(k, String(v));
  }
  getAttribute(k) {
    return this.attributes.get(k) ?? null;
  }
  removeAttribute(k) {
    this.attributes.delete(k);
  }
  hasAttribute(k) {
    return this.attributes.has(k);
  }
  toggleAttribute(k, v) {
    v ? this.setAttribute(k, "") : this.removeAttribute(k);
  }
  set src(v) {
    this.setAttribute("src", v);
  }
  get src() {
    return this.getAttribute("src");
  }
  append(...nodes) {
    for (const n of nodes) {
      if (n.tag === "#fragment") {
        this.append(...[...n.children]);
        continue;
      }
      n.remove();
      this.children.push(n);
      n.parentNode = this;
    }
  }
  appendChild(n) {
    this.append(n);
    return n;
  }
  replaceChildren(...nodes) {
    for (const n of [...this.children]) n.remove();
    this.append(...nodes);
  }
  remove() {
    if (this.parentNode)
      this.parentNode.children = this.parentNode.children.filter(
        (n) => n !== this,
      );
    this.parentNode = null;
  }
  addEventListener(t, fn) {
    if (!this.listeners.has(t)) this.listeners.set(t, new Set());
    this.listeners.get(t).add(fn);
  }
  removeEventListener(t, fn) {
    this.listeners.get(t)?.delete(fn);
  }
  fire(t) {
    for (const fn of [...(this.listeners.get(t) || [])])
      fn({ target: this, preventDefault() {}, stopPropagation() {} });
  }
  matches(s) {
    return s.split(",").some((raw) => {
      const q = raw.trim();
      return q.startsWith(".")
        ? this.classList.contains(q.slice(1))
        : q === this.tag;
    });
  }
  querySelectorAll(s) {
    return this.children.flatMap((n) => [
      ...(n.matches(s) ? [n] : []),
      ...n.querySelectorAll(s),
    ]);
  }
  querySelector(s) {
    return this.querySelectorAll(s)[0] ?? null;
  }
  closest(s) {
    return this.matches(s) ? this : (this.parentNode?.closest(s) ?? null);
  }
  contains(n) {
    return n === this || this.children.some((c) => c.contains(n));
  }
  hidePopup() {
    this.state = "closed";
    this.fire("popuphidden");
  }
  focus() {}
  scrollIntoView() {}
  getBoundingClientRect() {
    return { width: 340 };
  }
}

export async function fixture({
  blocked = false,
  failObserve = false,
  linkedRoot = false,
  onBeforeInit = null,
  emojis = [],
  imports = {},
} = {}) {
  const document = new Element("document");
  document.documentElement = new Element("window");
  document.append(document.documentElement);
  document.createElementNS = (_, tag) => new Element(tag);
  document.createXULElement = (tag) => new Element(tag);
  document.createTextNode = (t) =>
    Object.assign(new Element("#text"), { textContent: t });
  document.createDocumentFragment = () => new Element("#fragment");
  document.getElementById = (id) =>
    [document.documentElement, ...document.querySelectorAll("*")].find(
      (n) => n.id === id,
    ) ||
    all(document).find((n) => n.id === id) ||
    null;
  const panel = new Element("panel");
  panel.id = "PanelUI-zen-emojis-picker";
  document.documentElement.append(panel);
  const svgList = new Element("div");
  svgList.id = "PanelUI-zen-emojis-picker-svgs";
  panel.append(svgList);
  const emojiList = new Element("div");
  emojiList.id = "PanelUI-zen-emojis-picker-list";
  panel.append(emojiList);
  const popupset = new Element("popupset");
  popupset.id = "mainPopupSet";
  document.documentElement.append(popupset);
  const img = new Element("img");
  document.documentElement.append(img);
  const folder = new Element("zen-folder");
  folder.id = "folder-a";
  const innerImage = new Element("image");
  innerImage.setAttribute(
    "href",
    "chrome://browser/skin/zen-icons/selectable/american-football.svg",
  );
  folder.querySelector = (selector) =>
    selector.endsWith("image") ? innerImage : null;
  folder.setAttribute("data-better-zen-folders-color", "#ffcc00");
  document.documentElement.append(folder);
  const frames = [];
  const timers = new Map();
  let timerId = 0;
  const observations = [];
  let observerCallback;
  const files = [];
  let release;
  const barrier = blocked
    ? new Promise((r) => (release = r))
    : Promise.resolve();
  const browser = {
    document,
    CSS: { escape: (v) => v },
    console: { info() {}, warn() {}, error() {} },
    requestAnimationFrame: (f) => {
      frames.push(f);
      return frames.length;
    },
    cancelAnimationFrame() {},
    setTimeout: (f) => {
      timers.set(++timerId, f);
      return timerId;
    },
    clearTimeout: (id) => timers.delete(id),
    getComputedStyle: (el) => el.style,
    btoa: (value) => Buffer.from(value, "binary").toString("base64"),
    addEventListener() {},
    removeEventListener() {},
    MutationObserver: class {
      constructor(fn) {
        observerCallback = fn;
      }
      observe(target, options) {
        if (failObserve) throw Error("fixture observer initialization failure");
        observations.push({ target, options });
      }
      disconnect() {}
    },
    setInterval() {
      throw Error("unexpected init retry");
    },
    clearInterval() {},
  };
  document.defaultView = browser;
  browser.gZenEmojiPicker = {
    getSVGURL: (n) => `chrome://browser/skin/zen-icons/selectable/${n}`,
    open() {
      panel.state = "showing";
      panel.fire("popupshowing");
      return new Promise(() => {});
    },
  };
  const preferences = new Map();
  const createdDirectories = [];
  const globals = {
    console: browser.console,
    TextEncoder,
    URL,
    ChromeUtils: { importESModule: uri => {
      if (!(uri in imports)) throw Error(`Unconfigured external module: ${uri}`);
      return imports[uri];
    } },
    PathUtils: { profileDir: "C:/audit/profile", join: (...p) => p.join("/"),parent:p=>p.slice(0,p.lastIndexOf('/')),filename:p=>p.split('/').at(-1) },
    IOUtils: {
      exists:async()=>false,
      writeJSON:async()=>{},
      move:async()=>{},
      makeDirectory: async (path) => createdDirectories.push(path),
      getChildren: async (dir) => {
        await barrier;
        const base = "C:/audit/profile/zen-icon-packs";
        if (dir === base) return files.length ? [base + "/Pack"] : [];
        return files.map((f) => base + "/Pack/" + f);
      },
      stat: async (p) => ({
        type: p.endsWith("/Pack") ? "directory" : "regular",
        size: 100,
      }),
      readUTF8: async () => "{}",
    },
    Cc: {
      "@mozilla.org/file/local;1": {
        createInstance: () => ({
          initWithPath(p) {
            this.path = p;
          },
          exists: () => true,
          isSymlink() {
            return linkedRoot && this.path.endsWith("/zen-icon-packs");
          },
        }),
      },
    },
    Ci: { nsIFile: {} },
    Services: {
      prefs: {
        getStringPref: (key, fallback = "{}") => preferences.get(key) ?? fallback,
        setStringPref: (key, value) => preferences.set(key, value),
        getBoolPref: (key, fallback = true) => preferences.get(key) ?? fallback,
        setBoolPref: (key, value) => preferences.set(key, value),
      },
      io: { newFileURI: (f) => ({ spec: "file:///" + f.path }) },
      scriptloader: {
        loadSubScript(_, scope) {
          scope.ZenEmojisData = emojis;
        },
      },
    },
  };
  const loadSubScript = globals.Services.scriptloader.loadSubScript;
  let subScriptLoads = 0;
  globals.Services.scriptloader.loadSubScript = (...args) => {
    subScriptLoads += 1;
    return loadSubScript(...args);
  };
  const context = vm.createContext(globals);
  const cache = new Map();
  async function moduleFor(file) {
    if (cache.has(file)) return cache.get(file);
    const loading = (async () => {
    let code = await fs.readFile(file, "utf8");
    if (file.endsWith("runtime.sys.mjs"))
      code += "\nexport {createPickerView, applyFolderShape};";
    const mod = new vm.SourceTextModule(code, { context, identifier: file });
    await mod.link(async (specifier, ref) => {
      const effective = specifier.replace("./modules/", "../../");
      return moduleFor(path.resolve(path.dirname(ref.identifier), effective));
    });
    return mod;
    })();
    cache.set(file, loading);
    return loading;
  }
  // All runtime dependencies are prelinked through one promise per path.
  const mod = await moduleFor(
    path.join(root, "src/zen-icons-sine/runtime.sys.mjs"),
  );
  await mod.evaluate();
  onBeforeInit?.({
    browser,
    preferences,
    panel,
    originalOpen: browser.gZenEmojiPicker.open,
  });
  const dispose = mod.namespace.initializeZenIcons(browser);
  return {
    document,
    panel,
    svgList,
    img,
    folder,
    innerImage,
    frames,
    files,
    createdDirectories,
    dispose,
    release,
    mod,
    browser,
    preferences,
    globals,
    timers,
    observations,
    subScriptLoads: () => subScriptLoads,
    refresh: () => observerCallback(),
    // Deliver real-shaped MutationRecords to the runtime observer.
    mutate: (records) => observerCallback(records),
    flushTimers() {
      for (const [id, fn] of [...timers]) {
        timers.delete(id);
        fn();
      }
    },
  };
}
export function all(node) {
  return node.children.flatMap((n) => [n, ...all(n)]);
}
