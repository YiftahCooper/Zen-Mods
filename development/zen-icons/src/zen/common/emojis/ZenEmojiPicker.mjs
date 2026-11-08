// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

import { ZEN_BUILT_IN_ICONS } from "chrome://browser/content/zen-components/ZenBuiltInIcons.mjs";
import { nsZenDOMOperatedFeature } from "chrome://browser/content/zen-components/ZenCommonUtils.mjs";
import {
  CUSTOM_ICON_DIRECTORY_NAME,
  customIconValueToRelativePath,
  openCustomIconFolder,
  scanCustomIconPacks,
} from "chrome://browser/content/zen-components/ZenCustomIconPacks.mjs";
import {
  createIconRecord,
  groupIconRecords,
} from "chrome://browser/content/zen-components/ZenIconRegistry.mjs";
import { LUCIDE_ICONS } from "chrome://browser/content/zen-components/ZenLucideIcons.mjs";

const PROVIDERS = ["emoji", "zen", "lucide", "custom"];
const PROVIDER_L10N = {
  emoji: "zen-icons-picker-provider-emoji",
  zen: "zen-icons-picker-provider-zen",
  lucide: "zen-icons-picker-provider-lucide",
  custom: "zen-icons-picker-provider-custom",
};

class nsZenEmojiPicker extends nsZenDOMOperatedFeature {
  #panel;
  #filterPanel;
  #anchor;
  #activePage = "emoji";
  #onlyIcons = false;
  #emojiAsSVG = false;
  #closeOnSelect = true;
  #onSelect = null;
  #onFolderShapeChange = null;
  #hasSelection = false;
  #lastSelectedEmoji = null;
  #enabledProviders = new Set(PROVIDERS);
  #collapsedCategories = { emoji: new Set(), icons: new Set() };
  #collapseStateInitialized = { emoji: false, icons: false };
  #customRecords = [];
  #customSources = new Map();
  #scanGeneration = 0;

  #currentPromise = null;
  #currentPromiseResolve = null;
  #currentPromiseReject = null;

  init() {
    this.#panel = document.getElementById("PanelUI-zen-emojis-picker");
    this.#filterPanel = document.getElementById(
      "PanelUI-zen-icon-picker-filter",
    );
    this.#panel.addEventListener("popupshowing", this);
    this.#panel.addEventListener("popupshown", this);
    this.#panel.addEventListener("popuphidden", this);
    this.#panel.addEventListener("command", this);
    this.#filterPanel.addEventListener("popupshowing", this);
    this.#filterPanel.addEventListener("command", this);
    this.searchInput.addEventListener("input", this);
  }

  handleEvent(event) {
    switch (event.type) {
      case "popupshowing":
        if (event.target === this.#filterPanel) {
          this.#renderFilterPanel();
        } else {
          this.#onPopupShowing(event);
        }
        break;
      case "popupshown":
        this.#onPopupShown(event);
        break;
      case "popuphidden":
        this.#onPopupHidden(event);
        break;
      case "command":
        this.#onCommand(event);
        break;
      case "input":
        this.#renderActivePage();
        break;
    }
  }

  get #emojis() {
    if (this._emojis) {
      return this._emojis;
    }
    const lazy = {};
    Services.scriptloader.loadSubScript(
      "chrome://browser/content/zen-components/ZenEmojisData.min.mjs",
      lazy,
    );
    /* eslint-disable mozilla/valid-lazy */
    this._emojis = lazy.ZenEmojisData;
    return this._emojis;
  }

  get #emojiRecords() {
    if (this._emojiRecords) {
      return this._emojiRecords;
    }
    this._emojiRecords = this.#emojis.map((emoji) =>
      createIconRecord({
        id: `${emoji.order}-${emoji.emoji}`,
        provider: "emoji",
        name: emoji.name || emoji.tags.at(-1) || emoji.emoji,
        tags: emoji.tags,
        categories: [emoji.category || "Other"],
        source: emoji.emoji,
        kind: "emoji",
        order: emoji.order,
      }),
    );
    return this._emojiRecords;
  }

  get emojiList() {
    return document.getElementById("PanelUI-zen-emojis-picker-list");
  }

  get svgList() {
    return document.getElementById("PanelUI-zen-emojis-picker-svgs");
  }

  get searchInput() {
    return document.getElementById("PanelUI-zen-emojis-picker-search");
  }

  #recordsForPage(page = this.#activePage) {
    return page === "emoji"
      ? this.#emojiRecords
      : [...ZEN_BUILT_IN_ICONS, ...LUCIDE_ICONS, ...this.#customRecords];
  }

  #providersForPage(page = this.#activePage) {
    return page === "emoji"
      ? new Set(this.#enabledProviders.has("emoji") ? ["emoji"] : [])
      : new Set(
          ["zen", "lucide", "custom"].filter((provider) =>
            this.#enabledProviders.has(provider),
          ),
        );
  }

  #changePage(toIcons = false, { animate = true } = {}) {
    this.#activePage = toIcons ? "icons" : "emoji";
    const pages = document.getElementById("PanelUI-zen-emojis-picker-pages");
    const targetPage = toIcons
      ? pages.querySelector('[icons="true"]')
      : pages.querySelector('[emojis="true"]');
    if (animate) {
      targetPage.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
        inline: "start",
      });
    } else {
      pages.scrollLeft = toIcons ? targetPage.offsetLeft : 0;
    }
    document
      .getElementById("PanelUI-zen-emojis-picker-change-svg")
      .classList.toggle("selected", toIcons);
    document
      .getElementById("PanelUI-zen-emojis-picker-change-emojis")
      .classList.toggle("selected", !toIcons);
    this.#renderActivePage();
  }

  #onCommand(event) {
    const { id } = event.target;
    if (id === "PanelUI-zen-emojis-picker-none") {
      this.#selectValue(null, "none");
    } else if (id === "PanelUI-zen-emojis-picker-change-emojis") {
      this.#changePage(false);
    } else if (id === "PanelUI-zen-emojis-picker-change-svg") {
      this.#changePage(true);
    } else if (id === "PanelUI-zen-open-custom-icon-folder") {
      openCustomIconFolder().catch(console.error);
    } else if (id === "PanelUI-zen-folder-shape-toggle") {
      this.#hasSelection = true;
      this.#onFolderShapeChange?.(event.target.checked);
    } else if (event.target.dataset.provider) {
      const provider = event.target.dataset.provider;
      if (event.target.checked) {
        this.#enabledProviders.add(provider);
      } else {
        this.#enabledProviders.delete(provider);
      }
      this.#renderActivePage();
      this.#renderFilterPanel();
    } else if (event.target.dataset.category) {
      this.#navigateToCategory(event.target.dataset.category);
    }
  }

  #createChoice(record) {
    const item = document.createXULElement("toolbarbutton");
    item.className = `toolbarbutton-1 zen-emojis-picker-${record.kind === "emoji" ? "emoji" : "svg"}`;
    item.setAttribute(
      "label",
      record.kind === "emoji" ? record.source : record.name,
    );
    item.setAttribute("tooltiptext", record.name);
    item.setAttribute("aria-label", record.name);
    item.dataset.iconId = record.id;
    item.dataset.provider = record.provider;
    if (record.kind !== "emoji") {
      item.style.listStyleImage = `url("${record.source.replaceAll('"', "%22")}")`;
      if (record.kind === "raster") {
        item.classList.add("zen-icon-picker-raster");
      }
    }
    item.addEventListener("command", () => {
      this.#selectValue(
        record.provider === "custom" ? record.id : record.source,
        record.kind,
      );
    });
    return item;
  }

  #renderGroup(group, target, query) {
    const wrapper = document.createElement("section");
    wrapper.className = "zen-icon-picker-group";
    wrapper.dataset.category = group.category;
    const collapsed =
      !query && this.#collapsedCategories[this.#activePage].has(group.category);
    const disclosure = document.createXULElement("toolbarbutton");
    disclosure.className = "subviewbutton zen-icon-picker-group-header";
    disclosure.setAttribute(
      "label",
      `${group.category} (${group.records.length})`,
    );
    disclosure.setAttribute("aria-expanded", String(!collapsed));
    disclosure.addEventListener("command", () => {
      const state = this.#collapsedCategories[this.#activePage];
      if (state.has(group.category)) {
        state.delete(group.category);
      } else {
        state.add(group.category);
      }
      this.#renderActivePage();
    });
    wrapper.appendChild(disclosure);

    if (!collapsed) {
      const grid = document.createElement("div");
      grid.className = "zen-icon-picker-grid";
      for (const record of group.records) {
        grid.appendChild(this.#createChoice(record));
      }
      wrapper.appendChild(grid);
    }
    target.appendChild(wrapper);
  }

  #renderActivePage() {
    const target = this.#activePage === "emoji" ? this.emojiList : this.svgList;
    if (!target) {
      return;
    }
    const query = this.searchInput.value.trim();
    const groups = groupIconRecords(this.#recordsForPage(), {
      query,
      providers: this.#providersForPage(),
    });
    if (!this.#collapseStateInitialized[this.#activePage] && groups.length) {
      this.#collapsedCategories[this.#activePage] = new Set(
        groups.slice(1).map((group) => group.category),
      );
      this.#collapseStateInitialized[this.#activePage] = true;
    }
    target.replaceChildren();
    for (const group of groups) {
      this.#renderGroup(group, target, query);
    }
    if (!groups.length) {
      const empty = document.createXULElement("label");
      empty.className = "zen-icon-picker-empty";
      document.l10n.setAttributes(empty, "zen-icons-picker-empty");
      target.appendChild(empty);
    }
  }

  #renderFilterPanel() {
    const providerContainer = document.getElementById(
      "PanelUI-zen-icon-provider-filters",
    );
    const categoryContainer = document.getElementById(
      "PanelUI-zen-icon-category-jumps",
    );
    providerContainer.replaceChildren();
    for (const provider of PROVIDERS) {
      const checkbox = document.createXULElement("checkbox");
      checkbox.dataset.provider = provider;
      checkbox.checked = this.#enabledProviders.has(provider);
      checkbox.disabled = this.#onlyIcons && provider === "emoji";
      document.l10n.setAttributes(checkbox, PROVIDER_L10N[provider]);
      providerContainer.appendChild(checkbox);
    }

    categoryContainer.replaceChildren();
    const groups = groupIconRecords(this.#recordsForPage(), {
      providers: this.#providersForPage(),
    });
    for (const group of groups) {
      const jump = document.createXULElement("toolbarbutton");
      jump.className = "subviewbutton zen-icon-category-jump";
      jump.dataset.category = group.category;
      jump.setAttribute("label", group.category);
      categoryContainer.appendChild(jump);
    }
  }

  #navigateToCategory(category) {
    if (this.searchInput.value) {
      this.searchInput.value = "";
    }
    this.#collapsedCategories[this.#activePage].delete(category);
    this.#renderActivePage();
    this.#filterPanel.hidePopup();
    requestAnimationFrame(() => {
      const escaped = CSS.escape(category);
      const target = (
        this.#activePage === "emoji" ? this.emojiList : this.svgList
      ).querySelector(`[data-category="${escaped}"]`);
      target?.scrollIntoView({ block: "start", behavior: "smooth" });
    });
  }

  #clearCachedData() {
    delete this._emojis;
    delete this._emojiRecords;
    this.#customRecords = [];
    this.#customSources.clear();
  }

  #setAllowNone(allowNone) {
    this.#panel.toggleAttribute("hide-none-option", !allowNone);
  }

  async #loadCustomIcons(generation) {
    const status = document.getElementById("PanelUI-zen-custom-icon-status");
    document.l10n.setAttributes(status, "zen-icons-picker-custom-loading");
    try {
      const result = await scanCustomIconPacks();
      if (generation !== this.#scanGeneration) {
        return;
      }
      this.#customRecords = result.records;
      this.#customSources = new Map(
        result.records.map((record) => [record.id, record.source]),
      );
      for (const warning of result.warnings) {
        console.warn(warning);
      }
      document.l10n.setAttributes(status, "zen-icons-picker-custom-status", {
        count: result.records.length,
        skipped: result.skipped.length,
      });
      if (this.#activePage === "icons") {
        this.#renderActivePage();
      }
    } catch (error) {
      console.error("Failed to scan custom icon packs", error);
      document.l10n.setAttributes(status, "zen-icons-picker-custom-error");
    }
  }

  #onPopupShowing(event) {
    if (event.target !== this.#panel) {
      return;
    }
    this.searchInput.value = "";
    this.#enabledProviders = new Set(PROVIDERS);
    if (this.#onlyIcons) {
      this.#enabledProviders.delete("emoji");
    }
    this.#collapsedCategories = { emoji: new Set(), icons: new Set() };
    this.#collapseStateInitialized = { emoji: false, icons: false };
    this.#customRecords = [];
    this.#customSources.clear();
    this.#changePage(this.#onlyIcons, { animate: false });
    const generation = ++this.#scanGeneration;
    this.#loadCustomIcons(generation);
  }

  #onPopupShown(event) {
    if (event.target !== this.#panel) {
      return;
    }
    this.searchInput.focus({ preventScroll: true });
  }

  #onPopupHidden(event) {
    if (event.target !== this.#panel) {
      return;
    }
    this.#scanGeneration++;
    this.#clearCachedData();
    this.emojiList.replaceChildren();
    this.svgList.replaceChildren();

    if (!this.#hasSelection) {
      this.#currentPromiseReject?.(
        new Error("Emoji picker closed without selection"),
      );
    } else if (!this.#closeOnSelect) {
      this.#currentPromiseResolve?.(this.#lastSelectedEmoji);
    }

    this.#currentPromise = null;
    this.#currentPromiseResolve = null;
    this.#currentPromiseReject = null;
    this.#onSelect = null;
    this.#onFolderShapeChange = null;
    this.#closeOnSelect = true;
    this.#hasSelection = false;
    this.#lastSelectedEmoji = null;

    this.#anchor.removeAttribute("zen-emoji-open");
    this.#anchor.parentElement.removeAttribute("zen-emoji-open");
    this.#anchor = null;
  }

  #selectValue(value, kind) {
    let selectedValue = value;
    if (this.#emojiAsSVG && value && kind === "emoji") {
      selectedValue = `data:image/svg+xml;base64,${btoa(
        `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><text y="28" font-size="28" x="0">${unescape(
          encodeURIComponent(value),
        )}</text></svg>`,
      )}`;
    }
    this.#setAllowNone(Boolean(selectedValue));
    this.#hasSelection = true;
    this.#lastSelectedEmoji = selectedValue;
    this.#onSelect?.(selectedValue);
    if (!this.#closeOnSelect) {
      return;
    }
    this.#currentPromiseResolve?.(selectedValue);
    this.#panel.hidePopup();
  }

  open(
    anchor,
    {
      onlySvgIcons = false,
      onlyIcons = onlySvgIcons,
      emojiAsSVG = false,
      allowNone = true,
      closeOnSelect = true,
      onSelect = null,
      showFolderShape = null,
      onFolderShapeChange = null,
    } = {},
  ) {
    if (this.#currentPromise) {
      return null;
    }
    this.#onlyIcons = onlyIcons;
    this.#emojiAsSVG = emojiAsSVG;
    this.#closeOnSelect = closeOnSelect;
    this.#onSelect = onSelect;
    this.#onFolderShapeChange = onFolderShapeChange;
    this.#hasSelection = false;
    this.#lastSelectedEmoji = null;
    this.#currentPromise = new Promise((resolve, reject) => {
      this.#currentPromiseResolve = resolve;
      this.#currentPromiseReject = reject;
    });
    this.#anchor = anchor;
    this.#anchor.setAttribute("zen-emoji-open", "true");
    this.#anchor.parentElement.setAttribute("zen-emoji-open", "true");
    this.#panel.toggleAttribute("only-svg-icons", onlyIcons);
    const folderShapeRow = document.getElementById(
      "PanelUI-zen-folder-shape-row",
    );
    folderShapeRow.hidden = showFolderShape === null;
    document.getElementById("PanelUI-zen-folder-shape-toggle").checked =
      showFolderShape ?? true;
    this.#setAllowNone(allowNone);
    this.#panel.openPopup(anchor, "after_start", 0, 0, false, false);
    return this.#currentPromise;
  }

  isImageIconValue(value) {
    return Boolean(
      value &&
      (customIconValueToRelativePath(value) ||
        /^(?:chrome|resource|file|https?):/i.test(value) ||
        /^data:image\//i.test(value)),
    );
  }

  isCustomIconValue(value) {
    return Boolean(customIconValueToRelativePath(value));
  }

  resolveIconSource(value) {
    if (!value) {
      return "";
    }
    if (this.#customSources.has(value)) {
      return this.#customSources.get(value);
    }
    const relativePath = customIconValueToRelativePath(value);
    if (!relativePath) {
      return value;
    }
    const path = PathUtils.join(
      PathUtils.profileDir,
      CUSTOM_ICON_DIRECTORY_NAME,
      ...relativePath.split("/"),
    );
    const file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
    file.initWithPath(path);
    if (!file.exists() || !file.isFile()) {
      return "";
    }
    return Services.io.newFileURI(file).spec;
  }

  getSVGURL(icon) {
    return `chrome://browser/skin/zen-icons/selectable/${icon}`;
  }
}

window.gZenEmojiPicker = new nsZenEmojiPicker();
