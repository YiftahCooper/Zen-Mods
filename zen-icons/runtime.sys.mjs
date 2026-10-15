import { ZEN_BUILT_IN_ICONS } from "./modules/src/zen/common/emojis/ZenBuiltInIcons.mjs";
import { createIconRecord } from "./modules/src/zen/common/emojis/ZenIconRegistry.mjs";
import { LUCIDE_ICONS } from "./modules/src/zen/common/emojis/ZenLucideIcons.mjs";
import { scanCustomIconPacks } from "./modules/src/zen/common/emojis/ZenCustomIconPacks.mjs";
import {
  readFolderShapeState,
  setFolderShapeState,
} from "./modules/src/zen-icons-sine/folder-shape-state.mjs";
import { reconcileNativeIcons } from "./modules/src/zen-icons-sine/native-reconciler.mjs";
import { createPickerModel } from "./modules/src/zen-icons-sine/picker-model.mjs";
import { createSelectionBridge } from "./modules/src/zen-icons-sine/selection-bridge.mjs";
import { BLANK_TAB_ICON, createTabIconController } from "./modules/src/zen-icons-sine/tab-default.mjs";
import { readPickerDefaults, writePickerDefaults } from "./modules/src/zen-icons-sine/picker-defaults.mjs";
import { categoryDisplayName } from "./modules/src/zen/common/emojis/ZenIconCategories.mjs";
import {connectIconSettings} from './modules/src/zen-icons-sine/settings.mjs';
import {connectIconGestures} from './modules/src/zen-icons-sine/icon-gestures.mjs';
import { folderSelectionValueForRecord } from "./modules/src/zen-icons-sine/folder-icon-source.mjs";
import { findFolderForAnchor } from "./modules/src/zen-icons-sine/folder-anchor.mjs";
import { writeFolderIcon } from "./modules/src/zen-icons-sine/folder-icon-writer.mjs";
import {customStoragePaths,ensureCustomStorage,CUSTOM_CONTENT_PREFIX,canonicalCustomSource,customSourceParts} from './modules/src/zen-icons-sine/custom-storage.mjs';
import {
  BZF_FOLDER_COLOR_ATTRIBUTE,
  applyFolderIconPresentation,
  connectFolderColorBridge,
  selectDefaultFolderIcon,
} from "./modules/src/zen-icons-sine/folder-presentation.mjs";
import {
  DEFAULT_ICON_FALLBACK,
  customIconSourceAvailability,
  resolveCustomImageDisplaySource,
} from "./modules/src/zen-icons-sine/custom-image-fallback.mjs";

const PREFIX = "[Zen Icons]";
const PANEL_ID = "PanelUI-zen-emojis-picker";
const ROOT_ID = "zen-icons-sine-root";
const FILTER_PANEL_ID = "zen-icons-sine-filter-panel";
const XHTML = "http://www.w3.org/1999/xhtml";
const FOLDER_SHAPE_PREF = "zen.icons.folder-shapes";
const INITIAL_RECORD_BATCH = 30;

const PROVIDER_LABELS = Object.freeze({
  emoji: "Emojis",
  zen: "Zen Icons",
  lucide: "Lucide",
  custom: "Custom Icons",
});

function loadEmojiRecords() {
  const scope = {};
  Services.scriptloader.loadSubScript(
    "chrome://sine/content/zen-icons-local/ZenEmojisData.min.mjs",
    scope,
  );
  return scope.ZenEmojisData.map((emoji) =>
    createIconRecord({
      id: `u-${[...emoji.emoji]
        .map((character) => character.codePointAt(0).toString(16))
        .join("-")}`,
      provider: "emoji",
      name: emoji.name || emoji.tags.at(-1) || emoji.emoji,
      aliases: emoji.tags,
      tags: emoji.tags,
      categories: [emoji.category || "Other"],
      source: emoji.emoji,
      kind: "emoji",
      order: emoji.order,
    }),
  );
}

function html(document, tag, className = "") {
  const element = document.createElementNS(XHTML, tag);
  if (className) {
    element.className = className;
  }
  if (tag === "button" || tag === "input") {
    element.setAttribute("closemenu", "none");
  }
  return element;
}

function categoryArtwork(document, icon, sources = []) {
  const container=html(document,'span','zen-icons-category-icon');
  container.setAttribute('aria-hidden','true');
  let index=0;
  const next=()=>{
    container.replaceChildren();
    if(index>=sources.length){container.textContent=icon;return;}
    const image=html(document,'img','zen-icons-category-artwork');
    image.alt='';
    image.addEventListener('error',next,{once:true});
    image.src=sources[index++];
    container.append(image);
  };
  next();
  return container;
}

function customRootPath() {
  return customStoragePaths(PathUtils.profileDir,PathUtils.join).root;
}

function updatePickerWidth(document, panel, anchor) {
  const sidebar =
    anchor?.closest?.("#navigator-toolbox") ??
    document.getElementById("navigator-toolbox");
  const width = Math.round(sidebar?.getBoundingClientRect().width ?? 0);
  if (width > 0) {
    panel.style.setProperty("--zen-icons-picker-width", `${width}px`);
    panel.setAttribute("width", String(width));
  }
}

function customSourceFor(filePath) {
  const relative = filePath
    .slice(customRootPath().length + 1)
    .replaceAll("\\", "/")
    .split("/")
    .map(encodeURIComponent)
    .join("/");
  // Zen currently identifies image-backed Space icons by an `.svg` suffix.
  // The fragment is not sent to the file request, so the original raster
  // image is loaded while the stored value remains compatible with Zen.
  return `${CUSTOM_CONTENT_PREFIX}${relative}#zen-icon.svg`;
}

let storageReady=null;
async function loadCustomCatalog() {
  storageReady??=ensureCustomStorage({profileDir:PathUtils.profileDir,pathUtils:PathUtils,ioUtils:IOUtils,isSymlinkFor:path=>{
    const file=Cc['@mozilla.org/file/local;1'].createInstance(Ci.nsIFile);file.initWithPath(path);return file.exists()&&file.isSymlink();
  }}).catch(error=>{storageReady=null;throw error;});
  await storageReady;
  const result = await scanCustomIconPacks({
    rootDirectory: customRootPath(),
    sourceFor: customSourceFor,
  });
  for (const warning of result.warnings) {
    console.warn(`${PREFIX} ${warning}`);
  }
  return {
    records: result.records,
    categoryMetadata: result.categoryMetadata,
    storagePrepared:true,
  };
}

function openCustomFolder() {
  const file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
  file.initWithPath(customRootPath());
  file.launch();
}

function folderId(folder) {
  return folder?.id || folder?.getAttribute("id") || null;
}

function hasNativeFolderShape(folder) {
  return Boolean(folder && "showFolderShape" in folder);
}

function readFolderShape(folder) {
  if (hasNativeFolderShape(folder)) {
    return folder.showFolderShape;
  }
  const id = folderId(folder);
  return id
    ? readFolderShapeState(
        Services.prefs.getStringPref(FOLDER_SHAPE_PREF, ""),
        id,
      )
    : true;
}

function applyFolderShape(folder, availableCustomSources = null) {
  if (!folder?.matches?.("zen-folder, tab-group")) {
    return;
  }
  const image = folder.querySelector(
    ":scope > .tab-group-label-container > .tab-group-folder-icon svg .icon image",
  );
  const source = image?.getAttribute("href") || "";
  const customAvailability = customIconSourceAvailability(
    source,
    availableCustomSources,
  );
  const unavailable = customAvailability === false;
  folder.toggleAttribute("zen-icons-custom-unavailable", unavailable);
  folder.toggleAttribute(
    "zen-icons-hide-folder-shape",
    !hasNativeFolderShape(folder) && !readFolderShape(folder) && !unavailable,
  );
  applyFolderIconPresentation({
    folder,
    showFolderShape: readFolderShape(folder),
    source,
    unavailable,
  });
}

function writeFolderShape(folder, showFolderShape) {
  if (hasNativeFolderShape(folder)) {
    folder.showFolderShape = showFolderShape;
    return;
  }
  const id = folderId(folder);
  if (!id) {
    return;
  }
  Services.prefs.setStringPref(
    FOLDER_SHAPE_PREF,
    setFolderShapeState(
      Services.prefs.getStringPref(FOLDER_SHAPE_PREF, ""),
      id,
      showFolderShape,
    ),
  );
  applyFolderShape(folder);
}

function updateFolderIcon(document, folder, value) {
  const result = writeFolderIcon({ document, folder, value });
  folder?.dispatchEvent?.(
    new document.defaultView.CustomEvent("TabGroupUpdate", { bubbles: true }),
  );
  return result;
}

function fileURLForPath(filePath) {
  const file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
  file.initWithPath(filePath);
  return Services.io.newFileURI(file).spec;
}

function selectionValueForRecord(document, record, options) {
  // Tab/space images do not forward the picker's context-stroke. These
  // generated variants paint independently while folder assets stay maskable.
  if (record.provider === "lucide") {
    return record.source.replace("/lucide/", "/display-lucide/");
  }
  if (record.kind !== "emoji" || !options?.emojiAsSVG) {
    return record.source;
  }
  const text = record.source.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><text y="27" font-size="27" x="16" text-anchor="middle" font-family="Segoe UI Emoji, Apple Color Emoji, Noto Color Emoji, sans-serif">${text}</text></svg>`;
  const bytes = new TextEncoder().encode(svg);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return `data:image/svg+xml;base64,${document.defaultView.btoa(binary)}`;
}

function createRecordButton(document, record, onSelect) {
  const button = html(document, "button", "zen-icons-result");
  button.type = "button";
  button.title = `${record.name} — ${PROVIDER_LABELS[record.provider]}`;
  button.dataset.iconId = record.id;
  button.dataset.provider = record.provider;
  button.setAttribute("aria-label", button.title);
  if (record.kind === "emoji") {
    button.textContent = record.source;
    button.classList.add("zen-icons-result-emoji");
  } else {
    const image =
      record.provider === "lucide"
        ? document.createXULElement("image")
        : html(document, "img");
    image.classList.add("zen-icons-result-image");
    if (record.provider === "lucide") {
      image.style.listStyleImage = `url("${record.source}")`;
      image.dataset.source = record.source;
    } else {
      image.setAttribute("src", record.source);
    }
    image.setAttribute("alt", "");
    image.addEventListener("error", () => button.remove(), { once: true });
    button.append(image);
  }
  button.addEventListener("click", () => onSelect(record));
  return button;
}

function createPickerView({
  document,
  panel,
  model,
  bridge,
  getOptions,
  getFolder,
  getTab = () => null,
  tabIcons = null,
  saveDefaults = null,
  refreshFolder = applyFolderShape,
}) {
  let destroyed = false;
  const root = document.createXULElement("vbox");
  root.id = ROOT_ID;
  root.addEventListener("command", (event) => event.stopPropagation());
  const toolbar = html(document, "div", "zen-icons-toolbar");
  const search = html(document, "input", "zen-icons-search");
  search.type = "search";
  search.placeholder = "Search icons and tags";
  search.setAttribute("aria-label", "Search icons and tags");
  const filterButton = html(document, "button", "zen-icons-filter-button");
  filterButton.type = "button";
  filterButton.setAttribute("aria-label", "Filter Icons");
  filterButton.setAttribute("tooltiptext", "Filter Icons");
  filterButton.title = "Filter Icons";
  filterButton.setAttribute("closemenu", "none");
  filterButton.setAttribute("aria-expanded", "false");
  filterButton.setAttribute("aria-controls", FILTER_PANEL_ID);
  const filterIcon = document.createXULElement("image");
  filterIcon.classList.add("zen-icons-filter-icon");
  filterIcon.style.listStyleImage =
    'url("chrome://sine/content/zen-icons-local/lucide/list-filter.svg")';
  filterButton.append(filterIcon);
  toolbar.append(search, filterButton);

  const filterMenu = html(document, "div", "zen-icons-filter-menu");
  const filterPanel = document.createXULElement("panel");
  filterPanel.id = FILTER_PANEL_ID;
  filterPanel.setAttribute("type", "arrow");
  filterPanel.setAttribute("orient", "vertical");
  filterPanel.setAttribute("position", "end_before");
  filterPanel.setAttribute("level", "top");
  filterPanel.setAttribute("noautofocus", "true");
  filterPanel.setAttribute("role", "dialog");
  filterPanel.setAttribute("aria-label", "Filter Icons");
  filterPanel.addEventListener("command", (event) => event.stopPropagation());
  const providerSection = html(document, "div", "zen-icons-filter-section");
  const providerTitle = html(document, "strong");
  providerTitle.textContent = "Providers";
  providerSection.append(providerTitle);
  const categorySection = html(document, "div", "zen-icons-filter-section");
  const categoryTitle = html(document, "strong");
  categoryTitle.textContent = "Categories: Show / Go To";
  categorySection.append(categoryTitle);
  const folder = getFolder();
  const openingOptions = getOptions();
  const isFolderPicker =
    (openingOptions?.showFolderShape !== null &&
      openingOptions?.showFolderShape !== undefined) ||
    Boolean(folder);
  let shapeCheckbox = null;
  const setShowFolderShape = (showFolderShape) => {
    if (shapeCheckbox) {
      shapeCheckbox.checked = showFolderShape;
    }
    if (typeof openingOptions?.onFolderShapeChange === "function") {
      openingOptions.onFolderShapeChange(showFolderShape);
    } else {
      writeFolderShape(folder, showFolderShape);
    }
    refreshFolder(folder);
  };
  filterMenu.append(providerSection);
  if (isFolderPicker) {
    const shapeLabel = html(document, "label", "zen-icons-folder-shape");
    shapeCheckbox = html(document, "input");
    shapeCheckbox.type = "checkbox";
    shapeCheckbox.checked =
      openingOptions?.showFolderShape ?? readFolderShape(folder);
    shapeCheckbox.addEventListener("change", () => {
      setShowFolderShape(shapeCheckbox.checked);
    });
    shapeLabel.append(
      shapeCheckbox,
      document.createTextNode("Show Folder Outline"),
    );
    filterMenu.append(shapeLabel);
  }
  filterMenu.append(categorySection);
  filterPanel.append(filterMenu);
  (document.getElementById("mainPopupSet") ?? document.documentElement).append(
    filterPanel,
  );

  const customFolderButton = html(
    document,
    "button",
    "zen-icons-open-custom-folder",
  );
  customFolderButton.type = "button";
  customFolderButton.textContent = "Open Custom Icons Folder";
  customFolderButton.addEventListener("click", openCustomFolder);
  filterMenu.append(customFolderButton);
  const defaultsNote = html(document, "p", "zen-icons-defaults-note");
  defaultsNote.textContent = "Filter changes are temporary. Save to use them for future openings of this picker type.";
  const saveDefaultsButton = html(document, "button", "zen-icons-save-defaults");
  saveDefaultsButton.type = "button";
  const contextName = {tab: "Tabs", folder: "Folders", space: "Spaces"}[model.snapshot().defaultChoice.kind];
  saveDefaultsButton.textContent = `Save as Defaults for ${contextName}`;
  saveDefaultsButton.addEventListener("click", () => {
    saveDefaults?.(model.snapshot());
    defaultsNote.textContent = "Defaults saved. Other picker types are unchanged.";
  });
  defaultsNote.setAttribute("role", "status");
  if (saveDefaults) filterMenu.append(defaultsNote, saveDefaultsButton);

  const defaultSection = html(document, "section", "zen-icons-default-section");
  const defaultHeading = html(document, "div", "zen-icons-default-heading");
  defaultHeading.textContent = "Default";
  const defaultContainer = html(document, "div", "zen-icons-default-container");
  const defaultButton = html(
    document,
    "button",
    "zen-icons-result zen-icons-default-choice",
  );
  defaultButton.type = "button";
  defaultContainer.append(defaultButton);
  const isTabPicker = model.snapshot().defaultChoice.kind === "tab";
  const resetButton = html(document, "button", "zen-icons-reset-tab-icon");
  resetButton.type = "button";
  resetButton.setAttribute("aria-label", "Reset Icon");
  const resetSymbol = document.createXULElement("image");
  resetSymbol.classList.add("zen-icons-reset-symbol");
  resetSymbol.setAttribute("aria-hidden", "true");
  resetSymbol.style.listStyleImage = 'url("chrome://sine/content/zen-icons-local/lucide/rotate-ccw.svg")';
  const resetLabel = html(document, "span", "zen-icons-reset-label");
  resetLabel.textContent = "Reset Icon";
  resetButton.append(resetSymbol, resetLabel);
  resetButton.title = "Remove the custom icon and restore this tab's website icon";
  defaultSection.append(defaultHeading, defaultContainer);
  const groupsContainer = html(document, "div", "zen-icons-groups");
  root.append(toolbar);
  if (isTabPicker) root.append(resetButton);
  root.append(defaultSection, groupsContainer);
  panel.append(root);
  const collapsed = new Set();
  let deferredRenderingStarted = false;
  let renderGeneration = 0;
  let pendingRenderFrame = null;
  let queuedDeferredRender = null;

  function cancelDeferredRendering() {
    renderGeneration += 1;
    queuedDeferredRender = null;
    if (pendingRenderFrame !== null) {
      document.defaultView.cancelAnimationFrame(pendingRenderFrame);
      pendingRenderFrame = null;
    }
  }

  const selectValue = (value) => {
    const tab = getTab();
    if (tab) tabIcons?.changed(tab);
    const openingOptions = getOptions();
    const folder = getFolder();
    const callerOnSelect =
      typeof openingOptions?.onSelect === "function"
        ? openingOptions.onSelect
        : null;
    bridge.selectCustom(value, {
      onSelect: callerOnSelect,
      afterSelect: folder
        ? (selectedValue) => {
            updateFolderIcon(document, folder, selectedValue);
            refreshFolder(folder);
          }
        : null,
    });
  };

  const selectRecord = (record) => {
    const openingOptions = getOptions();
    const folder = getFolder();
    const value = folder && record.kind !== "emoji"
      ? folderSelectionValueForRecord(record, {
          profileDir: PathUtils.profileDir,
          joinPath: PathUtils.join,
          toFileURL: fileURLForPath,
        })
      : selectionValueForRecord(document, record, folder ? { emojiAsSVG: true } : openingOptions);
    // Never depend on clicks on Zen's hidden native page. It can contain stale
    // buttons or suppress commands; the bridge owns callback/promise delivery.
    selectValue(value);
  };

  resetButton.addEventListener("click", () => {
    const tab = getTab();
    if (tab && tabIcons) {
      // Capture the cancellation generation after selectValue has invalidated
      // any prior lookup. The native callback clears its persisted override.
      selectValue(null);
      void tabIcons.restore(tab, () => {}).catch(error => console.error(`${PREFIX} favicon reset failed`, error));
    }
  });
  defaultButton.addEventListener("click", () => {
    if (isTabPicker) {
      selectValue(BLANK_TAB_ICON);
      return;
    }
    selectDefaultFolderIcon({
      isFolderPicker,
      setShowFolderShape,
      selectValue,
    });
  });

  function populateGrid(
    grid,
    records,
    { append = false, complete = true } = {},
  ) {
    if (grid.dataset.populated === "true" || grid.hidden) {
      return;
    }
    if (!append) {
      grid.replaceChildren();
    }
    const fragment = document.createDocumentFragment();
    for (const record of records) {
      fragment.append(createRecordButton(document, record, selectRecord));
    }
    grid.append(fragment);
    if (complete) {
      grid.dataset.populated = "true";
      grid.removeAttribute("aria-busy");
    }
  }

  function deferGridRendering(entries, generation) {
    if (!deferredRenderingStarted) {
      queuedDeferredRender = { entries, generation };
      return;
    }
    const queue = [...entries];
    const renderNext = () => {
      pendingRenderFrame = null;
      if (generation !== renderGeneration || !queue.length) {
        return;
      }
      const { grid, records, append = false } = queue.shift();
      populateGrid(grid, records.slice(0, INITIAL_RECORD_BATCH), {
        append,
        complete: records.length <= INITIAL_RECORD_BATCH,
      });
      if (records.length > INITIAL_RECORD_BATCH && !grid.hidden)
        queue.unshift({
          grid,
          records: records.slice(INITIAL_RECORD_BATCH),
          append: true,
        });
      if (queue.length) {
        pendingRenderFrame =
          document.defaultView.requestAnimationFrame(renderNext);
      }
    };
    if (queue.length) {
      pendingRenderFrame =
        document.defaultView.requestAnimationFrame(renderNext);
    }
  }

  function render() {
    if (destroyed) return;
    const focusedProvider = document.activeElement?.dataset?.provider;
    const focusedCategory = document.activeElement?.dataset?.categoryToggle;
    cancelDeferredRendering();
    const generation = renderGeneration;
    const state = model.snapshot();
    defaultButton.title = state.defaultChoice.label;
    defaultButton.setAttribute("aria-label", state.defaultChoice.label);
    defaultButton.dataset.defaultKind = state.defaultChoice.kind;
    defaultButton.replaceChildren();
    const folder = getFolder();
    const liveFolderSvg =
      folder?.querySelector?.(
        ":scope > .tab-group-label-container > .tab-group-folder-icon svg",
      ) ?? folder?.icon?.querySelector?.("svg");
    const folderSvg =
      state.defaultChoice.kind === "folder"
        ? liveFolderSvg?.cloneNode(true)
        : null;
    if (folderSvg) {
      folderSvg.classList.add("zen-icons-default-folder-preview");
      folderSvg.setAttribute("state", "close");
      folderSvg.removeAttribute("active");
      const selectedImage = folderSvg.querySelector(".icon image");
      selectedImage?.setAttribute("href", "");
      selectedImage?.style?.setProperty("opacity", "0");
      for (const dots of folderSvg.querySelectorAll(".dots")) {
        dots.style.setProperty("opacity", "0");
      }
      const folderStyle = document.defaultView.getComputedStyle(folder);
      for (const property of [
        "--zen-folder-behind-bgcolor",
        "--zen-folder-front-bgcolor",
        "--zen-folder-stroke",
      ]) {
        const value = folderStyle.getPropertyValue(property);
        if (value) {
          folderSvg.style.setProperty(property, value);
        }
      }
      defaultButton.append(folderSvg);
    } else if (state.defaultChoice.kind === "tab") {
      const preview = html(document, "span", "zen-icons-native-tab-placeholder");
      preview.setAttribute("aria-hidden", "true");
      defaultButton.setAttribute("aria-description", "Use the theme-coloured square shown on tabs with no website icon.");
      defaultButton.append(preview);
    } else if (state.defaultChoice.kind !== "folder") {
      const preview = html(document, "span", "zen-icons-default-placeholder no-squircles");
      preview.dataset.defaultShape = "circle";
      preview.setAttribute("aria-hidden", "true");
      defaultButton.append(preview);
    } else {
      const defaultImage = document.createXULElement("image");
      defaultImage.classList.add("zen-icons-result-image");
      defaultImage.style.listStyleImage = 'url("chrome://browser/skin/zen-icons/selectable/folder.svg")';
      defaultButton.append(defaultImage);
    }
    providerSection
      .querySelectorAll("label")
      .forEach((element) => element.remove());
    for (const provider of state.availableProviders) {
      if (state.onlyIcons && provider === "emoji") {
        continue;
      }
      const label = html(document, "label", "zen-icons-provider-option");
      const checkbox = html(document, "input");
      checkbox.type = "checkbox";
      checkbox.dataset.provider = provider;
      checkbox.checked = state.enabledProviders.includes(provider);
      checkbox.addEventListener("change", () => {
        model.setProviderEnabled(provider, checkbox.checked);
        defaultsNote.textContent = "Filter changes are temporary until saved as defaults.";
        render();
      });
      label.append(
        checkbox,
        document.createTextNode(PROVIDER_LABELS[provider]),
      );
      providerSection.append(label);
    }

    categorySection.replaceChildren(categoryTitle);
    for (const category of state.availableCategories) {
      const categoryRow = html(document, "div", "zen-icons-category-option");
      const categoryToggle = html(document, "input", "zen-icons-category-toggle");
      categoryToggle.type = "checkbox";
      categoryToggle.dataset.categoryToggle = category;
      categoryToggle.setAttribute("aria-label", `Show ${categoryDisplayName(category,state.availableCategories)}`);
      categoryToggle.checked = !state.disabledCategories.includes(category);
      categoryToggle.addEventListener("change", () => {
        model.setCategoryEnabled(category, categoryToggle.checked);
        defaultsNote.textContent = "Filter changes are temporary until saved as defaults.";
        render();
      });
      const categoryButton = html(
        document,
        "button",
        "zen-icons-category-link",
      );
      categoryButton.type = "button";
      categoryButton.dataset.category = category;
      const presentation = state.categoryPresentations[category];
      const categoryIcon = categoryArtwork(document, presentation.icon, presentation.imageSources);
      categoryButton.append(categoryIcon, document.createTextNode(categoryDisplayName(category,state.availableCategories)));
      categoryButton.addEventListener("click", () => {
        model.navigateCategory(category);
        search.value = "";
        collapsed.delete(category);
        filterPanel.hidePopup();
        render();
        root
          .querySelector(
            `[data-category="${document.defaultView.CSS.escape(category)}"]`,
          )
          ?.scrollIntoView({ block: "start" });
        model.clearNavigationTarget();
      });
      categoryRow.append(categoryToggle, categoryButton);
      categorySection.append(categoryRow);
    }

    groupsContainer.replaceChildren();
    const deferredGrids = [];
    for (const [index, group] of state.groups.entries()) {
      const groupElement = html(document, "section", "zen-icons-group");
      groupElement.dataset.category = group.category;
      const header = html(document, "button", "zen-icons-group-header");
      header.type = "button";
      const categoryIcon = categoryArtwork(document, group.categoryIcon, group.categoryImages);
      header.append(
        categoryIcon,
        document.createTextNode(`${group.categoryName} (${group.records.length})`),
      );
      const isExpanded = Boolean(state.query) || !collapsed.has(group.category);
      header.setAttribute("aria-expanded", String(isExpanded));
      const grid = html(document, "div", "zen-icons-grid");
      grid.hidden = !isExpanded;
      if (isExpanded) {
        if (index === 0) {
          const firstBatch = group.records.slice(0, INITIAL_RECORD_BATCH);
          populateGrid(grid, firstBatch);
          if (firstBatch.length < group.records.length) {
            delete grid.dataset.populated;
            grid.setAttribute("aria-busy", "true");
            deferredGrids.push({
              grid,
              records: group.records.slice(INITIAL_RECORD_BATCH),
              append: true,
            });
          }
        } else {
          grid.setAttribute("aria-busy", "true");
          deferredGrids.push({ grid, records: group.records });
        }
      }
      header.addEventListener("click", () => {
        if (!grid.hidden) {
          collapsed.add(group.category);
          grid.hidden = true;
          grid.replaceChildren();
          delete grid.dataset.populated;
          grid.removeAttribute("aria-busy");
          header.setAttribute("aria-expanded", "false");
        } else {
          collapsed.delete(group.category);
          grid.hidden = false;
          populateGrid(grid, group.records);
          header.setAttribute("aria-expanded", "true");
        }
      });
      groupElement.append(header, grid);
      groupsContainer.append(groupElement);
    }
    deferGridRendering(deferredGrids, generation);
    if (focusedProvider) {
      for (const input of providerSection.querySelectorAll("input")) {
        if (input.dataset.provider === focusedProvider)
          input.focus({ preventScroll: true });
      }
    }
    if (focusedCategory) {
      for (const input of categorySection.querySelectorAll("input")) {
        if (input.dataset.categoryToggle === focusedCategory) input.focus({ preventScroll: true });
      }
    }
  }

  search.addEventListener("input", () => {
    model.setQuery(search.value);
    render();
  });
  filterButton.addEventListener("click", () => {
    if (filterPanel.state === "open" || filterPanel.state === "showing") {
      filterPanel.hidePopup();
    } else {
      filterPanel.openPopup(filterButton, "end_before", 0, 0, false, false);
    }
  });
  filterPanel.addEventListener("popupshown", () => {
    filterButton.setAttribute("aria-expanded", "true");
    // This top-level XUL panel deliberately has no automatic focus. Hand it
    // focus explicitly so Tab cannot continue through the covered picker.
    filterPanel.querySelector("input, button")?.focus({ preventScroll: true });
  });
  filterPanel.addEventListener("popuphidden", () => {
    filterButton.setAttribute("aria-expanded", "false");
    if (!destroyed && panel.state === "open") {
      filterButton.focus({ preventScroll: true });
    }
  });
  render();

  return {
    updateCatalog(nextRecords, categoryMetadata) {
      model.updateRecords(nextRecords, categoryMetadata);
      render();
    },
    startDeferredRendering() {
      deferredRenderingStarted = true;
      if (queuedDeferredRender) {
        const { entries, generation } = queuedDeferredRender;
        queuedDeferredRender = null;
        deferGridRendering(entries, generation);
      }
    },
    focus() {
      if (!getOptions()?.onlySvgIcons) {
        search.focus({ preventScroll: true });
      }
    },
    destroy() {
      destroyed = true;
      cancelDeferredRendering();
      filterPanel.hidePopup();
      filterPanel.remove();
      root.remove();
    },
  };
}

export function initializeZenIcons(browserWindow) {
  let stopped = false;
  const tabIcons = createTabIconController({
    isActive: () => !stopped,
    lookupFavicon: async uri => {
      const { PlacesUtils } = ChromeUtils.importESModule("resource://gre/modules/PlacesUtils.sys.mjs");
      const favicon = await PlacesUtils.favicons.getFaviconForPage(uri);
      return favicon?.dataURI?.spec || null;
    },
    setIcon: (tab, image) => browserWindow.gBrowser.setIcon(tab, image),
    persistImage: (tab, image) => {
      const { TabStateCache } = ChromeUtils.importESModule("resource:///modules/sessionstore/TabStateCache.sys.mjs");
      TabStateCache.update(tab.permanentKey, { image });
    },
  });
  let interval = null;
  let panel = null;
  let view = null;
  let picker = null;
  let originalOpen = null;
  let wrappedOpen = null;
  let currentOptions = null;
  let currentAnchor = null;
  let bridge = null;
  let records = null;

  let baseRecords = null;
  let customCacheReady = false;
  let customStoragePrepared = false;
  let customRecordsCache = [];
  let customCategoryMetadataCache = {};
  let customScanPromise = null;
  let customSources = new Set();
  let folderObserver = null;
  let disconnectFolderColorBridge = null;
  let disconnectSettings = null;
  let disconnectGestures = null;
  let openGeneration = 0;
  let widthBefore = null;
  let widthApplied = null;
  const imageStates = new Map();
  const folderStates = new Map();
  const canonicalSource = source => canonicalCustomSource(source,{
    profileDir:PathUtils.profileDir,joinPath:PathUtils.join,toFileURL:fileURLForPath,
  });
  const migrateNativeCustomChoices = () => {
    if(!customStoragePrepared || stopped)return;
    for(const tab of browserWindow.gBrowser?.tabs || []){
      const previous=tab.zenStaticIcon,next=canonicalSource(previous);
      if(!next || next===previous)continue;
      tab.zenStaticIcon=next;
      browserWindow.gBrowser.setIcon(tab,next);
      const {TabStateCache}=ChromeUtils.importESModule('resource:///modules/sessionstore/TabStateCache.sys.mjs');
      TabStateCache.update(tab.permanentKey,{image:next});
    }
    const spaces=browserWindow.gZenWorkspaces;
    for(const workspace of spaces?.getWorkspaces?.() || []){
      const previous=workspace.icon,next=canonicalSource(previous);
      if(!next || next===previous)continue;
      workspace.icon=next;
      Promise.resolve(spaces.saveWorkspace(workspace)).catch(error=>console.error(`${PREFIX} unable to save migrated Space artwork`,error));
    }
  };
  const paintProperties = [
    "--zen-icons-inner-icon-color",
    "--zen-folder-behind-bgcolor",
    "--zen-folder-front-bgcolor",
    "--zen-folder-stroke",
  ];
  const paintAttributes = [
    "zen-icons-custom-unavailable",
    "zen-icons-hide-folder-shape",
    "zen-icons-has-inner-icon",
    "zen-icons-enlarge-inner-icon",
    "zen-icons-recolor-inner-icon",
  ];
  const readPaint = (folder) => ({
    properties: paintProperties.map((key) => [
      key,
      folder.style.getPropertyValue(key),
      folder.style.getPropertyPriority?.(key) || "",
    ]),
    attributes: paintAttributes.map((key) => [key, folder.getAttribute(key)]),
  });
  const refreshFolder = (folder) => {
    if (stopped || !folder) return;
    if(customStoragePrepared){
      const source=folder.querySelector(':scope > .tab-group-label-container > .tab-group-folder-icon svg .icon image')?.getAttribute('href');
      const next=canonicalSource(source);
      if(next && next!==source)updateFolderIcon(browserWindow.document,folder,next);
    }
    if (!folderStates.has(folder))
      folderStates.set(folder, { before: readPaint(folder) });
    applyFolderShape(folder, customSources);
    folderStates.get(folder).after = readPaint(folder);
  };
  const releaseFolder = (folder, { before, after }) => {
    for (const [index, [key, value, priority]] of before.properties.entries()) {
      if (folder.style.getPropertyValue(key) !== after?.properties[index][1])
        continue;
      if (value) folder.style.setProperty(key, value, priority);
      else folder.style.removeProperty(key);
    }
    for (const [index, [key, value]] of before.attributes.entries()) {
      if (folder.getAttribute(key) !== after?.attributes[index][1]) continue;
      if (value === null) folder.removeAttribute(key);
      else folder.setAttribute(key, value);
    }
    folderStates.delete(folder);
  };
  const releaseImage = (image, state) => {
    image.removeEventListener("error", state.onError);
    imageStates.delete(image);
  };

  const refreshCustomImages = ({ retry = false } = {}) => {
    if (stopped) return;
    migrateNativeCustomChoices();
    for (const [image, state] of imageStates) {
      if (!browserWindow.document.documentElement.contains(image))
        releaseImage(image, state);
    }
    for (const image of browserWindow.document.querySelectorAll("img")) {
      if (image.closest?.(`#${ROOT_ID}, #${FILTER_PANEL_ID}`)) continue;
      const current = image.getAttribute("src") || "";
      let state = imageStates.get(image);
      if (state && current !== state.displayed) {
        releaseImage(image, state);
        state = null;
      }
      if (!state) {
        if (!customSourceParts(current)) continue;
        state = { source: current, displayed: current, failed: false };
        state.onError = () => {
          if (
            stopped ||
            image.getAttribute("src") !== state.displayed ||
            state.failed
          )
            return;
          state.failed = true;
          state.displayed = DEFAULT_ICON_FALLBACK;
          image.src = state.displayed;
        };
        imageStates.set(image, state);
        image.addEventListener("error", state.onError);
      }
      if (retry) state.failed = false;
      const desired = state.failed
        ? DEFAULT_ICON_FALLBACK
        : resolveCustomImageDisplaySource(state.source, customSources);
      state.displayed = desired;
      if (image.getAttribute("src") !== desired) {
        image.src = desired;
      }
    }
  };

  const refreshFolderShapes = () => {
    if (stopped) return;
    for (const [folder, state] of folderStates) {
      if (!browserWindow.document.documentElement.contains(folder))
        releaseFolder(folder, state);
    }
    for (const folder of browserWindow.document.querySelectorAll(
      "zen-folder",
    )) {
      refreshFolder(folder);
    }
    refreshCustomImages();
  };

  const refreshCustomCatalog = () => {
    if (customScanPromise) {
      return customScanPromise;
    }
    customScanPromise = loadCustomCatalog()
      .catch((error) => {
        console.error(`${PREFIX} unable to scan custom icons`, error);
        return {
          records: customRecordsCache,
          categoryMetadata: customCategoryMetadataCache,
        };
      })
      .then((catalog) => {
        if (stopped) return catalog;
        customCacheReady = true;
        customStoragePrepared = Boolean(catalog.storagePrepared);
        customRecordsCache = catalog.records;
        customCategoryMetadataCache = catalog.categoryMetadata;
        customSources = new Set();
        for (const record of customRecordsCache) {
          customSources.add(record.source);
          customSources.add(
            folderSelectionValueForRecord(record, {
              profileDir: PathUtils.profileDir,
              joinPath: PathUtils.join,
              toFileURL: fileURLForPath,
            }),
          );
        }
        for (const state of imageStates.values()) state.failed = false;
        refreshFolderShapes();
        return catalog;
      })
      .finally(() => {
        customScanPromise = null;
      });
    return customScanPromise;
  };

  const buildPickerView = (
    openingOptions,
    openingAnchor,
    customRecords,
    categoryMetadata,
  ) => {
    const openingFolder = findFolderForAnchor(
      browserWindow.document,
      openingAnchor,
    );
    const liveNativeValues = [
      ...(browserWindow.document.getElementById(
        "PanelUI-zen-emojis-picker-svgs",
      )?.children ?? []),
    ].map((button) => picker.getSVGURL(button.getAttribute("icon")));
    records = reconcileNativeIcons(
      [...baseRecords, ...customRecords],
      liveNativeValues,
    ).records;
    refreshFolder(openingFolder);
    const openingTab = openingFolder ? null : openingAnchor?.closest?.("tab, .tabbrowser-tab");
    const defaultKind = openingFolder ? "folder" : openingTab ? "tab" : "space";
    tabIcons.remember(openingTab);
    view?.destroy();
    const model = createPickerModel(records, {
      // Known folder callers can accept emojis after we convert them to an
      // image. Honour image-only filtering for unknown/native callers.
      onlyIcons: !openingFolder && Boolean(
        openingOptions?.onlyIcons || openingOptions?.onlySvgIcons,
      ),
      categoryMetadata,
      defaultKind,
      ...readPickerDefaults(Services.prefs, defaultKind),
    });
    view = createPickerView({
      document: browserWindow.document,
      panel,
      model,
      bridge,
      getOptions: () => openingOptions,
      getFolder: () => openingFolder,
      getTab: () => openingTab,
      tabIcons,
      saveDefaults: state => writePickerDefaults(Services.prefs, defaultKind, state),
      refreshFolder,
    });
  };

  const onPopupShowing = (event) => {
    if (stopped || event.target !== panel) {
      return;
    }
    const openingOptions = currentOptions;
    const openingAnchor = currentAnchor;
    const generation = ++openGeneration;
    updatePickerWidth(browserWindow.document, panel, openingAnchor);
    widthApplied = {
      attribute: panel.getAttribute("width"),
      property: panel.style.getPropertyValue("--zen-icons-picker-width"),
    };
    buildPickerView(
      openingOptions,
      openingAnchor,
      customRecordsCache,
      customCategoryMetadataCache,
    );
    const openingView = view;
    refreshCustomCatalog()
      .then(() => {
        if (
          stopped ||
          generation !== openGeneration ||
          view !== openingView ||
          !["open", "showing"].includes(panel.state)
        )
          return;
        const liveNativeValues = [
          ...(browserWindow.document.getElementById(
            "PanelUI-zen-emojis-picker-svgs",
          )?.children ?? []),
        ].map((button) => picker.getSVGURL(button.getAttribute("icon")));
        view.updateCatalog(
          reconcileNativeIcons(
            [...baseRecords, ...customRecordsCache],
            liveNativeValues,
          ).records,
          customCategoryMetadataCache,
        );
        if (panel.state === "open") view.startDeferredRendering();
      })
      .catch((error) =>
        console.error(`${PREFIX} unable to refresh picker`, error),
      );
  };
  const onPopupShown = (event) => {
    if (event.target === panel) {
      view?.startDeferredRendering();
      view?.focus();
    }
  };
  const onPopupHidden = (event) => {
    if (event.target === panel) {
      openGeneration += 1;
      view?.destroy();
      view = null;
      currentOptions = null;
      currentAnchor = null;
    }
  };

  const initialize = () => {
    if (stopped) {
      return true;
    }
    panel = browserWindow.document.getElementById(PANEL_ID);
    picker = browserWindow.gZenEmojiPicker;
    if (!panel || !picker) {
      return false;
    }
    baseRecords = [
      ...loadEmojiRecords(),
      ...ZEN_BUILT_IN_ICONS,
      ...LUCIDE_ICONS,
    ];
    records = baseRecords;
    originalOpen = picker.open;
    widthBefore = {
      attribute: panel.getAttribute("width"),
      property: panel.style.getPropertyValue("--zen-icons-picker-width"),
    };
    bridge = createSelectionBridge(originalOpen.bind(picker), panel);
    wrappedOpen = (anchor, options = {}) => {
      if (stopped) return originalOpen.call(picker, anchor, options);
      currentOptions = options;
      currentAnchor = anchor;
      // Keep Zen's hidden native picker on its smaller icon page. The enhanced
      // view supplies both emojis and icons, so building Zen's large emoji page
      // underneath it only delays the popup without adding visible content.
      const result = bridge.open(anchor, {
        ...options,
        onlyIcons: true,
        onlySvgIcons: true,
      });
      if (result === null) {
        currentOptions = null;
        currentAnchor = null;
      }
      return result;
    };
    picker.open = wrappedOpen;
    disconnectSettings = connectIconSettings(browserWindow, Services.prefs);
    disconnectGestures = connectIconGestures({
      host:browserWindow,
      isEnabled:()=>!stopped && browserWindow.document.documentElement.hasAttribute('zen-icons-double-click-enabled'),
      resetTab:tab=>browserWindow.gZenPinnedTabManager?.resetPinnedTab(tab),
      openPicker:target=>{
        if (target.kind==='folder') {
          browserWindow.gZenFolders.changeFolderUserIcon(target.item);
        } else if (target.kind==='space') {
          const manager=browserWindow.gZenWorkspaces;
          const id=target.item;
          picker.open(target.anchor,{closeOnSelect:false,allowNone:true,onSelect:async icon=>{
            const workspace=manager.getWorkspaceFromId(id);
            if(workspace) {workspace.icon=icon;await manager.saveWorkspace(workspace);}
          }});
        } else {
          const tab=target.item;
          picker.open(target.anchor,{emojiAsSVG:true,closeOnSelect:false,allowNone:Boolean(tab.zenStaticIcon),onSelect:icon=>{
            if(tab.closing || tab.isConnected===false) return;
            if(icon) tab.zenStaticIcon=icon;else delete tab.zenStaticIcon;
            browserWindow.gBrowser.setIcon(tab,icon);
            const {TabStateCache}=ChromeUtils.importESModule('resource:///modules/sessionstore/TabStateCache.sys.mjs');
            TabStateCache.update(tab.permanentKey,{image:icon || null});
          }});
        }
      },
    });
    panel.addEventListener("popupshowing", onPopupShowing);
    panel.addEventListener("popupshown", onPopupShown);
    panel.addEventListener("popuphidden", onPopupHidden);
    panel.setAttribute("zen-icons-enhanced", "true");
    folderObserver = new browserWindow.MutationObserver((mutations = []) => {
      const relevant = mutations.filter(
        (mutation) =>
          !mutation.target?.closest?.(`#${ROOT_ID}, #${FILTER_PANEL_ID}`),
      );
      if (
        !mutations.length ||
        relevant.some((mutation) => mutation.type === "childList")
      )
        refreshFolderShapes();
      else {
        for (const mutation of relevant) {
          if (mutation.attributeName === BZF_FOLDER_COLOR_ATTRIBUTE)
            refreshFolder(mutation.target);
          else if(mutation.attributeName==='href')
            refreshFolder(mutation.target.closest?.('zen-folder'));
        }
        if (relevant.some((mutation) => mutation.attributeName === "src"))
          refreshCustomImages();
      }
    });
    folderObserver.observe(browserWindow.document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["src", "href", BZF_FOLDER_COLOR_ATTRIBUTE],
    });
    disconnectFolderColorBridge = connectFolderColorBridge({
      browserWindow,
      refreshFolder,
    });
    refreshCustomCatalog();
    console.info(`${PREFIX} ready with ${records.length} catalog records`);
    return true;
  };

  const dispose = () => {
    stopped = true;
    openGeneration += 1;
    if (interval) {
      browserWindow.clearInterval(interval);
    }
    view?.destroy();
    folderObserver?.disconnect();
    disconnectFolderColorBridge?.();
    disconnectSettings?.();
    disconnectGestures?.();
    for (const [image, state] of imageStates) {
      releaseImage(image, state);
      if (image.getAttribute("src") === state.displayed)
        image.src = state.source;
    }
    for (const [folder, state] of folderStates) releaseFolder(folder, state);
    folderStates.clear();
    if (panel) {
      panel.removeEventListener("popupshowing", onPopupShowing);
      panel.removeEventListener("popupshown", onPopupShown);
      panel.removeEventListener("popuphidden", onPopupHidden);
      panel.removeAttribute("zen-icons-enhanced");
      if (
        widthApplied &&
        panel.getAttribute("width") === widthApplied.attribute
      ) {
        if (widthBefore.attribute === null) panel.removeAttribute("width");
        else panel.setAttribute("width", widthBefore.attribute);
      }
      if (
        widthApplied &&
        panel.style.getPropertyValue("--zen-icons-picker-width") ===
          widthApplied.property
      ) {
        if (widthBefore.property)
          panel.style.setProperty(
            "--zen-icons-picker-width",
            widthBefore.property,
          );
        else panel.style.removeProperty("--zen-icons-picker-width");
      }
    }
    if (picker && picker.open === wrappedOpen) {
      picker.open = originalOpen;
    }
  };
  const safeInitialize = () => {
    try {
      return initialize();
    } catch (error) {
      dispose();
      throw error;
    }
  };
  if (!safeInitialize()) {
    let attempts = 0;
    interval = browserWindow.setInterval(() => {
      if (safeInitialize() || attempts++ >= 40) {
        browserWindow.clearInterval(interval);
        interval = null;
        if (!panel && !stopped) {
          console.error(
            `${PREFIX} native picker was not found; Zen remains unchanged`,
          );
        }
      }
    }, 250);
  }

  return dispose;
}
