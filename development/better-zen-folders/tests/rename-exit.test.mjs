import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";

const modulePath = process.env.BZF_PLAYWRIGHT_MODULE;
const skip = modulePath ? false : "set BZF_PLAYWRIGHT_MODULE for isolated native rename event tests";
const source = await readFile(new URL("../scripts/better-zen-folders.uc.mjs", import.meta.url), "utf8");
let browser;
before(async () => {
  if (modulePath) browser = await createRequire(import.meta.url)(modulePath).chromium.launch({ headless: true });
});
after(async () => { await browser?.close(); });

// Verbatim methods from the installed Zen 1.22.2b, build 20260915091052:
// C:/Program Files/Zen Browser/browser/omni.ja
// chrome/browser/content/browser/ZenUIManager.mjs:1650-1795.
// Whole entry SHA-256: 3ce07ab0e6c76d39ca6c190670b11badbdbda6aa5a385f6577b6dd08d2cd3cc4.
// This installed build uses gZenVerticalTabsManager, not ZenEditableLabel.
// Only surrounding platform services and XUL fragment creation are adapted below.
function nativeRenameFixture() { return {
  async renameTabKeydown(event) {
    event.stopPropagation();
    if (event.key === "Enter") {
      const isTab = !!event.target.closest(".tabbrowser-tab");
      let label = isTab
        ? this._tabEdited.querySelector(".tab-label-container-editing")
        : this._tabEdited;
      let input = document.getElementById("tab-label-input");
      let newName = input.value.replace(/\s+/g, " ").trim();
      const hasChanged = input.value !== input._originalValue && newName;

      document.documentElement.removeAttribute("zen-renaming-tab");
      input.remove();
      if (!isTab) {
        await this._tabEdited.onRenameFinished(newName);
      } else {
        // Check if name is blank, reset if so
        // Always remove, so we can always rename and if it's empty,
        // it will reset to the original name anyway
        if (hasChanged || (this._tabEdited.zenStaticLabel && newName)) {
          this._tabEdited.zenStaticLabel = newName;
          gBrowser._setTabLabel(this._tabEdited, newName, {
            _zenChangeLabelFlag: true,
          });
          gZenUIManager.showToast("zen-tabs-renamed");
        } else {
          delete this._tabEdited.zenStaticLabel;
          gBrowser.setTabTitle(this._tabEdited);
        }

        gZenUIManager.motion.animate(
          this._tabEdited,
          {
            scale: [1, 0.98, 1],
          },
          {
            duration: 0.25,
          }
        );
      }

      const editorContainer = this._tabEdited.querySelector(
        ".tab-editor-container"
      );
      if (editorContainer) {
        editorContainer.remove();
      }
      label.classList.remove("tab-label-container-editing");

      this._tabEdited = null;
    } else if (event.key === "Escape") {
      event.target.blur();
    }
  },

  renameTabStart(event) {
    let target = event.target;
    if (event.target.id === "context_zen-edit-tab-title") {
      target = TabContextMenu.contextTab;
    }
    const isTab = !!target.closest(".tabbrowser-tab");
    if (
      this._tabEdited ||
      ((!Services.prefs.getBoolPref("zen.tabs.rename-tabs") ||
        (Services.prefs.getBoolPref("browser.tabs.closeTabByDblclick") &&
          event.type === "dblclick")) &&
        isTab) ||
      !gZenVerticalTabsManager._prefsSidebarExpanded
    ) {
      return;
    }
    if (
      isTab &&
      !target.closest(".tab-label-container") &&
      event.type === "dblclick"
    ) {
      return;
    }
    this._tabEdited =
      target.closest(".tabbrowser-tab") ||
      target.closest(".zen-current-workspace-indicator-name") ||
      (event.explicit && target.closest(".tab-group-label"));
    if (
      !this._tabEdited ||
      (this._tabEdited.hasAttribute("zen-essential") && isTab)
    ) {
      this._tabEdited = null;
      return;
    }
    gZenFolders.cancelPopupTimer();
    event.stopPropagation?.();
    document.documentElement.setAttribute("zen-renaming-tab", "true");
    const label = isTab
      ? this._tabEdited.querySelector(".tab-label-container")
      : this._tabEdited;
    label.classList.add("tab-label-container-editing");

    if (isTab) {
      const container = window.MozXULElement.parseXULToFragment(`
        <vbox class="tab-label-container tab-editor-container" flex="1" align="start" pack="center"></vbox>
      `);
      label.after(container);
    }
    const input = document.createElement("input");
    const content = isTab ? this._tabEdited.label : this._tabEdited.textContent;
    input.id = "tab-label-input";
    input._originalValue = content;
    input.value = content;
    input.addEventListener("keydown", this.renameTabKeydown.bind(this));

    if (isTab) {
      const containerHtml = this._tabEdited.querySelector(
        ".tab-editor-container"
      );
      containerHtml.appendChild(input);
    } else {
      this._tabEdited.after(input);
    }
    input.focus();
    input.setSelectionRange(0, input.value.length, "backward");
    input.scrollLeft = 0;

    input.addEventListener("blur", this._renameTabHalt);
  },

  renameTabHalt(event) {
    if (document.activeElement === event.target || !this._tabEdited) {
      return;
    }
    document.documentElement.removeAttribute("zen-renaming-tab");
    const editorContainer = this._tabEdited.querySelector(
      ".tab-editor-container"
    );
    let input = document.getElementById("tab-label-input");
    input.remove();
    if (editorContainer) {
      editorContainer.remove();
    }
    const isTab = !!this._tabEdited.closest(".tabbrowser-tab");
    const label = isTab
      ? this._tabEdited.querySelector(".tab-label-container-editing")
      : this._tabEdited;
    label.classList.remove("tab-label-container-editing");

    this._tabEdited = null;
  },
}; }
const nativeRenameSource = `(${nativeRenameFixture.toString()})()`;

async function run(callback) {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  try {
    await page.setContent(`<div id="tabs">
      <tab id="selected" class="tabbrowser-tab"><span class="tab-label-container">Selected</span></tab>
      <tab id="tab" class="tabbrowser-tab"><span class="tab-label-container">Original</span></tab>
      <zen-folder id="parent"><div class="tab-group-label-container"><span class="tab-group-label">Parent</span></div>
        <zen-folder id="folder"><div class="tab-group-label-container"><span class="tab-group-label">Original</span></div></zen-folder>
      </zen-folder>
    </div><button id="outside">Outside sidebar</button><input id="unrelated">
    <span id="workspace" class="zen-current-workspace-indicator-name">Workspace</span>
    <button id="context_zen-edit-tab-title">Rename Tab</button>`);
    await page.evaluate(async ({ source, nativeRenameSource }) => {
      const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
      window.api = await import(url);
      URL.revokeObjectURL(url);
      window.commits = [];
      window.outerEnters = 0;
      window.addEventListener("keydown", event => { if (event.key === "Enter") outerEnters++; });
      window.Services = { prefs: { getBoolPref: name => name !== "browser.tabs.closeTabByDblclick" } };
      window.gZenUIManager = { showToast() {}, motion: { animate() {} } };
      window.gZenFolders = { cancelPopupTimer() {} };
      window.MozXULElement = { parseXULToFragment(markup) {
        const template = document.createElement("template");
        template.innerHTML = markup;
        return template.content;
      } };
      window.gBrowser = {
        tabContainer: document.getElementById("tabs"),
        selectedTab: document.getElementById("selected"),
        _setTabLabel(tab, name, options) {
          if (options._zenChangeLabelFlag !== true) throw new Error("native persistence flag missing");
          tab.label = name;
          commits.push([tab.id, name]);
        },
        setTabTitle(tab) { tab.label = "Page Title"; commits.push([tab.id, "Page Title"]); },
      };
      for (const tab of document.querySelectorAll("tab")) {
        tab.label = tab.textContent;
        tab.zenStaticLabel = tab.label;
      }
      for (const folder of document.querySelectorAll("zen-folder")) {
        folder.isZenFolder = true;
        folder.labelElement = folder.querySelector(":scope > .tab-group-label-container > .tab-group-label");
        Object.defineProperty(folder, "name", {
          get: () => folder.labelElement.textContent,
          set: value => { folder.labelElement.textContent = value; },
        });
        // ZenFolder.mjs:81-87, native callback including the persistence event.
        folder.labelElement.onRenameFinished = newLabel => {
          folder.name = newLabel.trim() || "Folder";
          const event = new CustomEvent("ZenFolderRenamed", { bubbles: true });
          folder.dispatchEvent(event);
        };
        folder.addEventListener("ZenFolderRenamed", event => {
          if (event.target === folder) commits.push([folder.id, folder.name]);
        });
      }
      window.gZenVerticalTabsManager = (0, eval)(nativeRenameSource);
      gZenVerticalTabsManager._prefsSidebarExpanded = true;
      gZenVerticalTabsManager._renameTabHalt = gZenVerticalTabsManager.renameTabHalt.bind(gZenVerticalTabsManager);
      const values = new Map();
      const subscribers = new Map();
      window.preferences = {
        get: name => values.has(name) ? values.get(name) : api.PREFERENCE_DEFINITIONS[name]?.defaultValue,
        subscribe(name, callback) {
          if (!subscribers.has(name)) subscribers.set(name, new Set());
          subscribers.get(name).add(callback);
          return () => subscribers.get(name).delete(callback);
        },
        set(name, value) {
          values.set(name, value);
          for (const callback of subscribers.get(name) ?? []) callback(value);
        },
      };
      window.startManager = () => {
        window.controller = new AbortController();
        window.manager = new api.FolderDoubleClickRenameManager(
          api.createBrowserFolderDoubleClickRenameAdapters(window, preferences),
        );
        manager.start(controller.signal);
      };
      startManager();
      window.begin = (kind, value = "  Saved   Name  ") => {
        const target = document.getElementById(kind);
        if (kind === "tab") {
          window.TabContextMenu = { contextTab: target };
          gZenVerticalTabsManager.renameTabStart({ target: document.getElementById("context_zen-edit-tab-title") });
        } else {
          gZenVerticalTabsManager.renameTabStart({ target: target.labelElement ?? target, explicit: true });
        }
        const input = document.getElementById("tab-label-input");
        input.value = value;
        return input;
      };
      window.state = () => ({
        tab: document.getElementById("tab").label,
        selected: gBrowser.selectedTab.label,
        folder: document.getElementById("folder").name,
        parent: document.getElementById("parent").name,
        commits: [...commits],
        input: !!document.getElementById("tab-label-input"),
        editing: !!gZenVerticalTabsManager._tabEdited,
        marked: document.documentElement.hasAttribute("zen-renaming-tab"),
        outerEnters,
      });
    }, { source, nativeRenameSource });
    await callback(page);
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 0)));
    assert.deepEqual(errors, [], "native event path must not hide handler errors");
  } catch (error) {
    if (errors.length) error.message += `\nNative handler errors: ${errors.join("; ")}`;
    throw error;
  } finally {
    await page.close();
  }
}

for (const kind of ["tab", "folder"]) {
  for (const exit of ["Escape", "blur", "Tab", "Enter", "outside pointer"]) {
    test(`${kind}: ${exit} saves through native persistence exactly once`, { skip }, () => run(async page => {
      await page.evaluate(kind => {
        preferences.set("doubleClickRename", false);
        begin(kind);
      }, kind);
      assert.equal(await page.evaluate(() => document.activeElement.id), "tab-label-input");
      if (exit === "blur") await page.locator("#outside").focus();
      else if (exit === "outside pointer") await page.locator("#outside").click();
      else await page.keyboard.press(exit);
      const result = await page.evaluate(() => state());
      assert.equal(result[kind], "Saved Name", JSON.stringify(result));
      assert.deepEqual(result.commits, [[kind, "Saved Name"]]);
      assert.equal(result.selected, "Selected");
      assert.equal(result.parent, "Parent");
      assert.equal(result.input, false);
      assert.equal(result.editing, false);
      assert.equal(result.marked, false);
      assert.equal(result.outerEnters, 0);
      if (exit === "Tab") assert.equal(await page.evaluate(() => document.activeElement.id), "outside");
    }));
  }

  test(`${kind}: Escape cancel setting changes live without changing blur saving`, { skip }, () => run(async page => {
    await page.evaluate(kind => { begin(kind); preferences.set("renameEscapeAction", "cancel"); }, kind);
    await page.keyboard.press("Escape");
    assert.deepEqual((await page.evaluate(() => state())).commits, []);
    assert.equal((await page.evaluate(kind => state()[kind], kind)), "Original");
    await page.evaluate(kind => begin(kind, "Blur Saved"), kind);
    await page.locator("#outside").focus();
    assert.deepEqual((await page.evaluate(() => state())).commits, [[kind, "Blur Saved"]]);
    await page.evaluate(kind => { begin(kind, "Escape Saved"); preferences.set("renameEscapeAction", "save"); }, kind);
    await page.keyboard.press("Escape");
    assert.deepEqual((await page.evaluate(() => state())).commits, [[kind, "Blur Saved"], [kind, "Escape Saved"]]);
  }));

  test(`${kind}: IME keys and outside blur wait for composition to finish`, { skip }, () => run(async page => {
    const during = await page.evaluate(kind => {
      const input = begin(kind, "Partial");
      input.dispatchEvent(new CompositionEvent("compositionstart", { bubbles: true }));
      const events = [
        new KeyboardEvent("keydown", { key: "Enter", isComposing: true, bubbles: true, cancelable: true }),
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
        new KeyboardEvent("keydown", { key: "Enter", keyCode: 229, bubbles: true, cancelable: true }),
      ];
      for (const event of events) input.dispatchEvent(event);
      return { ...state(), prevented: events.map(event => event.defaultPrevented) };
    }, kind);
    assert.equal(during.input, true);
    assert.deepEqual(during.commits, []);
    assert.deepEqual(during.prevented, [false, false, false]);
    await page.locator("#outside").click();
    assert.equal((await page.evaluate(() => state())).input, true);
    await page.evaluate(() => {
      const input = document.getElementById("tab-label-input");
      input.value = "日本語";
      input.dispatchEvent(new CompositionEvent("compositionend", { bubbles: true }));
    });
    assert.deepEqual((await page.evaluate(() => state())).commits, [[kind, "日本語"]]);
  }));

  test(`${kind}: blank exit retains native reset semantics`, { skip }, () => run(async page => {
    await page.evaluate(kind => begin(kind, "  "), kind);
    await page.keyboard.press("Escape");
    assert.deepEqual((await page.evaluate(() => state())).commits, [[kind, kind === "tab" ? "Page Title" : "Folder"]]);
  }));

  test(`${kind}: IME key flags protect an editor when compositionstart was not observed`, { skip }, () => run(async page => {
    const result = await page.evaluate(kind => {
      const input = begin(kind);
      const events = [
        new KeyboardEvent("keydown", { key: "Enter", isComposing: true, bubbles: true, cancelable: true }),
        new KeyboardEvent("keydown", { key: "Escape", keyCode: 229, bubbles: true, cancelable: true }),
      ];
      for (const event of events) input.dispatchEvent(event);
      return { ...state(), prevented: events.map(event => event.defaultPrevented) };
    }, kind);
    assert.equal(result.input, true);
    assert.deepEqual(result.commits, []);
    assert.deepEqual(result.prevented, [false, false]);
    await page.keyboard.press("Enter");
    assert.deepEqual((await page.evaluate(() => state())).commits, [[kind, "Saved Name"]]);
  }));
}

test("unrelated text inputs and workspace rename retain native Escape and blur", { skip }, () => run(async page => {
  const unrelated = await page.evaluate(() => {
    const input = document.getElementById("unrelated");
    input.focus();
    input.value = "Unrelated";
    const event = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    input.dispatchEvent(event);
    return { prevented: event.defaultPrevented, value: input.value, focused: document.activeElement === input };
  });
  assert.deepEqual(unrelated, { prevented: false, value: "Unrelated", focused: true });
  await page.evaluate(() => begin("workspace", "Must not save"));
  await page.locator("#outside").click();
  assert.equal(await page.locator("#workspace").textContent(), "Workspace");
  assert.deepEqual((await page.evaluate(() => state())).commits, []);
}));

test("abort restores native cancellation and a fresh manager owns one set of exit listeners", { skip }, () => run(async page => {
  await page.evaluate(() => { begin("folder"); controller.abort(); manager.destroy(); });
  await page.keyboard.press("Escape");
  assert.deepEqual((await page.evaluate(() => state())).commits, []);
  await page.evaluate(() => { startManager(); manager.start(controller.signal); begin("folder"); });
  await page.keyboard.press("Escape");
  assert.deepEqual((await page.evaluate(() => state())).commits, [["folder", "Saved Name"]]);
}));

test("a lookalike input with the shared ID is not treated as a native rename editor", { skip }, () => run(async page => {
  const result = await page.evaluate(() => {
    const input = document.getElementById("unrelated");
    input.id = "tab-label-input";
    gBrowser.tabContainer.append(input);
    input.focus();
    let enters = 0;
    input.addEventListener("keydown", event => { if (event.key === "Enter") enters++; });
    const escape = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    input.dispatchEvent(escape);
    document.getElementById("outside").dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    document.getElementById("outside").focus();
    return { enters, prevented: escape.defaultPrevented, connected: input.isConnected };
  });
  assert.deepEqual(result, { enters: 0, prevented: false, connected: true });
}));
