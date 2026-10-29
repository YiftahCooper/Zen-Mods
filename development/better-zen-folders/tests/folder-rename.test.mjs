import test from "node:test";
import assert from "node:assert/strict";

import {
  FOLDER_DOUBLE_CLICK_DELAY_MS,
  FolderDoubleClickRenameManager,
  createBrowserFolderDoubleClickRenameAdapters,
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

class FakeClock {
  constructor() {
    this.now = 0;
    this.timers = [];
  }
  setTimeout(callback, delay) {
    const timer = { callback, at: this.now + delay, cancelled: false };
    this.timers.push(timer);
    return timer;
  }
  clearTimeout(timer) {
    if (timer) timer.cancelled = true;
  }
  advance(milliseconds) {
    const end = this.now + milliseconds;
    while (true) {
      const next = this.timers
        .filter(timer => !timer.cancelled && timer.at <= end)
        .sort((left, right) => left.at - right.at)[0];
      if (!next) break;
      next.cancelled = true;
      this.now = next.at;
      next.callback();
    }
    this.now = end;
  }
}

function makePreferences(enabled = true, delay = 300) {
  const subscribers = new Map();
  return {
    preferences: {
      get: name => name === "doubleClickRename" ? enabled : name === "folderTitleClickDelayMs" ? delay : undefined,
      subscribe: (name, callback) => {
        subscribers.set(name, callback);
        return () => { subscribers.delete(name); };
      },
    },
    set(value) { enabled = value; subscribers.get("doubleClickRename")?.(value); },
    setDelay(value) { delay = value; subscribers.get("folderTitleClickDelayMs")?.(value); },
  };
}

test("double-clicking a folder name within 300 ms renames without any intermediate toggle", () => {
  const target = new FakeEventTarget();
  const clock = new FakeClock();
  const folder = { id: "folder", isZenFolder: true, collapsed: true, renameCalls: 0 };
  const preferences = makePreferences(true);
  let toggleCalls = 0;
  const manager = new FolderDoubleClickRenameManager({
    ...preferences,
    eventTarget: () => target,
    getLabelFolder: event => event.onLabel ? folder : null,
    setTimeout: (callback, delay) => clock.setTimeout(callback, delay),
    clearTimeout: timer => clock.clearTimeout(timer),
    toggleFolder: current => {
      toggleCalls++;
      current.collapsed = !current.collapsed;
    },
    renameFolder: current => { current.renameCalls++; },
  });
  manager.start(new AbortController().signal);

  const firstClick = {
    button: 0,
    detail: 1,
    onLabel: true,
    preventDefault() { this.preventDefaultCalled = true; },
    stopPropagation() { this.stopPropagationCalled = true; },
  };
  target.emit("click", firstClick);
  clock.advance(FOLDER_DOUBLE_CLICK_DELAY_MS - 1);
  assert.equal(folder.collapsed, true);
  assert.equal(toggleCalls, 0);

  const secondClick = {
    button: 0,
    detail: 2,
    onLabel: true,
    preventDefault() { this.preventDefaultCalled = true; },
    stopPropagation() { this.stopPropagationCalled = true; },
  };
  target.emit("click", secondClick);
  const doubleClick = {
    button: 0,
    detail: 2,
    onLabel: true,
    preventDefaultCalled: false,
    stopPropagationCalled: false,
    preventDefault() { this.preventDefaultCalled = true; },
    stopPropagation() { this.stopPropagationCalled = true; },
  };
  target.emit("dblclick", doubleClick);
  clock.advance(1);

  assert.equal(folder.collapsed, true);
  assert.equal(toggleCalls, 0);
  assert.equal(folder.renameCalls, 1);
  assert.equal(firstClick.preventDefaultCalled, true);
  assert.equal(firstClick.stopPropagationCalled, true);
  assert.equal(secondClick.preventDefaultCalled, true);
  assert.equal(secondClick.stopPropagationCalled, true);
  assert.equal(doubleClick.preventDefaultCalled, true);
  assert.equal(doubleClick.stopPropagationCalled, true);

  target.emit("click", { button: 0, detail: 1, onLabel: false });
  target.emit("dblclick", { button: 0, detail: 2, onLabel: false });
  assert.equal(folder.renameCalls, 1);
});

test("title delay setting permits immediate native click and live 500ms rename window", () => {
  const target=new FakeEventTarget(), clock=new FakeClock(), prefs=makePreferences(true,0);
  const folder={isZenFolder:true,collapsed:false}; let renames=0,toggles=0;
  const manager=new FolderDoubleClickRenameManager({...prefs,eventTarget:()=>target,
    getLabelFolder:e=>e.onLabel?folder:null,setTimeout:(cb,ms)=>clock.setTimeout(cb,ms),clearTimeout:t=>clock.clearTimeout(t),
    toggleFolder:()=>toggles++,renameFolder:()=>renames++});
  manager.start();
  const click=(detail,onLabel=true)=>({button:0,detail,onLabel,preventDefault(){this.prevented=true;},stopPropagation(){}});
  const immediate=click(1);target.emit("click",immediate);
  assert.equal(immediate.prevented,undefined);assert.equal(clock.timers.length,0);
  prefs.setDelay(500);
  const blank=click(1,false);target.emit("click",blank);assert.equal(blank.prevented,undefined);
  target.emit("click",click(1));clock.advance(450);assert.equal(toggles,0);
  target.emit("click",click(2));target.emit("dblclick",click(2));clock.advance(100);
  assert.equal(renames,1);assert.equal(toggles,0);
  target.emit("click",click(1));clock.advance(499);assert.equal(toggles,0);clock.advance(1);assert.equal(toggles,1);
  manager.destroy();
});

test("title hit testing uses rendered text rectangles instead of assuming row centre", () => {
  const folder={isZenFolder:true};const label={parentElement:{parentElement:folder},textContent:"Test",
    getBoundingClientRect:()=>({left:0,right:300,top:0,bottom:40})};folder.labelElement=label;
  const adapters=createBrowserFolderDoubleClickRenameAdapters({document:{createRange:()=>({
    selectNodeContents:node=>assert.equal(node,label),getClientRects:()=>[{left:32,right:63,top:6,bottom:20}],detach(){},
  })}});
  const target={closest:()=>label};
  assert.equal(adapters.getLabelFolder({target,clientX:45,clientY:10}),folder);
  assert.equal(adapters.getLabelFolder({target,clientX:15,clientY:10}),null);
  assert.equal(adapters.getLabelFolder({target,clientX:80,clientY:10}),null);
  assert.equal(adapters.getLabelFolder({target,clientX:45,clientY:32}),null);
});

test("one folder-name click retains native toggling after the 300 ms decision window", () => {
  const target = new FakeEventTarget();
  const clock = new FakeClock();
  const folder = { isZenFolder: true, collapsed: true };
  let toggleCalls = 0;
  const manager = new FolderDoubleClickRenameManager({
    ...makePreferences(true),
    eventTarget: () => target,
    getLabelFolder: event => event.onLabel ? folder : null,
    setTimeout: (callback, delay) => clock.setTimeout(callback, delay),
    clearTimeout: timer => clock.clearTimeout(timer),
    toggleFolder: current => {
      toggleCalls++;
      current.collapsed = !current.collapsed;
    },
    renameFolder() {},
  });
  manager.start(new AbortController().signal);

  target.emit("click", {
    button: 0,
    detail: 1,
    onLabel: true,
    preventDefault() {},
    stopPropagation() {},
  });
  clock.advance(FOLDER_DOUBLE_CLICK_DELAY_MS - 1);
  assert.equal(folder.collapsed, true);
  assert.equal(toggleCalls, 0);
  clock.advance(1);
  assert.equal(folder.collapsed, false);
  assert.equal(toggleCalls, 1);
});

test("double-click rename preference disables immediately and abort owns teardown", () => {
  const target = new FakeEventTarget();
  const clock = new FakeClock();
  const folder = { isZenFolder: true, collapsed: false };
  const preferences = makePreferences(true);
  const controller = new AbortController();
  let renameCalls = 0;
  const manager = new FolderDoubleClickRenameManager({
    ...preferences,
    eventTarget: () => target,
    getLabelFolder: event => event.onLabel ? folder : null,
    setTimeout: (callback, delay) => clock.setTimeout(callback, delay),
    clearTimeout: timer => clock.clearTimeout(timer),
    toggleFolder: current => { current.collapsed = !current.collapsed; },
    renameFolder: () => { renameCalls++; },
  });
  manager.start(controller.signal);

  preferences.set(false);
  target.emit("click", { button: 0, detail: 1, onLabel: true });
  target.emit("dblclick", { button: 0, detail: 2, onLabel: true });
  assert.equal(renameCalls, 0);

  preferences.set(true);
  target.emit("click", {
    button: 0,
    detail: 1,
    onLabel: true,
    preventDefault() {},
    stopPropagation() {},
  });
  target.emit("click", {
    button: 0,
    detail: 2,
    onLabel: true,
    preventDefault() {},
    stopPropagation() {},
  });
  target.emit("dblclick", { button: 0, detail: 2, onLabel: true });
  assert.equal(renameCalls, 1);

  controller.abort();
  assert.equal(manager.destroyed, true);
});

test("browser double-click adapter resolves only the direct folder label and calls native rename", () => {
  const folder = { isZenFolder: true, collapsed: true, renameCalls: 0, rename() { this.renameCalls++; } };
  const row = { parentElement: folder };
  const label = { parentElement: row };
  folder.labelElement = label;
  const adapters = createBrowserFolderDoubleClickRenameAdapters({
    gBrowser: { tabContainer: {} },
    console: { error() {} },
  });

  assert.equal(adapters.getLabelFolder({
    target: { closest: selector => selector === ".tab-group-label" ? label : null },
  }), folder);
  assert.equal(adapters.getLabelFolder({
    target: { closest: () => ({ parentElement: row }) },
  }), null);
  adapters.toggleFolder(folder);
  adapters.renameFolder(folder);
  assert.equal(folder.collapsed, false);
  assert.equal(folder.renameCalls, 1);
});

test("browser double-click adapter follows Zen's retargeted XUL event boundary", () => {
  const folder = { isZenFolder: true, labelElement: null };
  const row = { parentElement: folder, closest: () => null };
  const label = {
    parentElement: row,
    value: "Folder",
    closest: selector => selector === ".tab-group-label" ? label : null,
  };
  folder.labelElement = label;
  const adapters = createBrowserFolderDoubleClickRenameAdapters({
    gBrowser: { tabContainer: {} },
    console: { error() {} },
  });

  assert.equal(adapters.getLabelFolder({
    target: row,
    explicitOriginalTarget: label,
  }), folder);
  assert.equal(adapters.getLabelFolder({
    target: row,
    composedPath: () => [{ closest: () => null }, label, row],
  }), folder);
});

test("browser double-click adapter uses the first non-empty XUL label value", () => {
  const folder = { isZenFolder: true, labelElement: null };
  const row = { parentElement: folder };
  const label = {
    parentElement: row,
    value: "",
    textContent: "",
    getAttribute: name => name === "value" ? "Folder" : null,
    getBoundingClientRect: () => ({ left: 100, right: 300, top: 20, bottom: 50 }),
  };
  folder.labelElement = label;
  const canvas = {
    getContext: () => ({
      font: "",
      measureText: value => ({ width: value === "Folder" ? 48 : 0 }),
    }),
  };
  const adapters = createBrowserFolderDoubleClickRenameAdapters({
    document: { createElementNS: () => canvas },
    getComputedStyle: () => ({
      font: "16px sans-serif",
      direction: "ltr",
      paddingInlineStart: "32px",
      paddingInlineEnd: "0px",
    }),
    gBrowser: { tabContainer: {} },
    console: { error() {} },
  });

  assert.equal(adapters.getLabelFolder({
    target: { closest: selector => selector === ".tab-group-label" ? label : null },
    clientX: 140,
    clientY: 35,
  }), folder);
});

test("double-click rename manager asks the browser boundary to commit an active editor on outside pointerdown", () => {
  const target = new FakeEventTarget();
  let commits = 0;
  const manager = new FolderDoubleClickRenameManager({
    ...makePreferences(true),
    eventTarget: () => target,
    getLabelFolder: () => null,
    setTimeout: () => null,
    clearTimeout() {},
    toggleFolder() {},
    renameFolder() {},
    commitActiveRenameOnOutsidePointer: () => { commits++; },
  });
  manager.start(new AbortController().signal);

  target.emit("pointerdown", { target: { id: "outside" } });

  assert.equal(commits, 1);
});

test("browser rename adapter limits activation to the painted folder text", () => {
  const folder = {
    isZenFolder: true,
    labelElement: null,
  };
  const row = { parentElement: folder };
  const label = {
    parentElement: row,
    textContent: "Sports",
    getBoundingClientRect: () => ({ left: 100, right: 300, top: 20, bottom: 50 }),
  };
  folder.labelElement = label;
  const canvas = {
    getContext: () => ({
      font: "",
      measureText: value => ({ width: value === "Sports" ? 54 : 0 }),
    }),
  };
  const adapters = createBrowserFolderDoubleClickRenameAdapters({
    document: { createElementNS: () => canvas },
    getComputedStyle: () => ({
      font: "16px sans-serif",
      direction: "ltr",
      paddingInlineStart: "0px",
      paddingInlineEnd: "0px",
    }),
    gBrowser: { tabContainer: {} },
    console: { error() {} },
  });
  const target = { closest: selector => selector === ".tab-group-label" ? label : null };

  assert.equal(adapters.getLabelFolder({ target, clientX: 125, clientY: 35 }), folder);
  assert.equal(adapters.getLabelFolder({ target, clientX: 250, clientY: 35 }), null);
});

test("browser rename adapter commits the native editor with Enter before an outside click blurs it", () => {
  const dispatched = [];
  const folder = { isZenFolder: true };
  const label = { parentElement: { parentElement: folder }, classList: { contains: () => true } };
  folder.labelElement = label;
  const input = {
    localName: "input",
    isConnected: true,
    previousElementSibling: label,
    contains: target => target === input,
    dispatchEvent: event => dispatched.push(event),
  };
  class FakeKeyboardEvent {
    constructor(type, options) { this.type = type; Object.assign(this, options); }
  }
  const adapters = createBrowserFolderDoubleClickRenameAdapters({
    document: {
      getElementById: id => id === "tab-label-input" ? input : null,
      documentElement: { hasAttribute: name => name === "zen-renaming-tab" },
    },
    KeyboardEvent: FakeKeyboardEvent,
    gBrowser: { tabContainer: { contains: node => node === input } },
    console: { error() {} },
  });

  assert.equal(typeof adapters.commitActiveRenameOnOutsidePointer, "function");
  if (typeof adapters.commitActiveRenameOnOutsidePointer !== "function") return;
  assert.equal(
    adapters.commitActiveRenameOnOutsidePointer({ target: { id: "outside" } }),
    true,
  );
  assert.equal(dispatched.length, 1);
  assert.equal(dispatched[0].type, "keydown");
  assert.equal(dispatched[0].key, "Enter");
  assert.equal(dispatched[0].bubbles, false);
});

test("folder label hit testing leaves icon padding and vertical blank row immediate", () => {
  const folder = { isZenFolder: true };
  const label = {parentElement:{parentElement:folder}, value:"Test",
    getBoundingClientRect:()=>({left:10,right:310,top:20,bottom:60})};
  folder.labelElement=label;
  const target={closest:()=>label};
  const adapters=createBrowserFolderDoubleClickRenameAdapters({
    document:{createElementNS:()=>({getContext:()=>({measureText:()=>({width:32,
      actualBoundingBoxAscent:10,actualBoundingBoxDescent:2})})})},
    getComputedStyle:()=>({fontSize:"14px",fontFamily:"sans-serif",fontWeight:"600",
      direction:"ltr",paddingInlineStart:"32px",paddingInlineEnd:"0px"}),
  });
  assert.equal(adapters.getLabelFolder({target,clientX:50,clientY:40}),folder);
  assert.equal(adapters.getLabelFolder({target,clientX:20,clientY:40}),null);
  assert.equal(adapters.getLabelFolder({target,clientX:150,clientY:40}),null);
  assert.equal(adapters.getLabelFolder({target,clientX:50,clientY:23}),null);
  assert.equal(adapters.getLabelFolder({target,clientX:50,clientY:58}),null);
});
