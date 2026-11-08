const RECEIPT_NAME = "zen-icons-live-test.json";

function sleep(window, milliseconds) {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

async function waitFor(window, predicate, description, timeout = 20000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = predicate();
    if (value) {
      return value;
    }
    await sleep(window, 100);
  }
  throw new Error(`Timed out waiting for ${description}`);
}

function resultButtons(root) {
  return [...root.querySelectorAll(".zen-icons-result")];
}

function folderIconValue(folder) {
  return (
    folder.userIconValue ||
    folder.iconURL ||
    folder
      .querySelector(".tab-group-folder-icon svg .icon image")
      ?.getAttribute("href") ||
    ""
  );
}

async function openPicker(window, anchor, options = {}) {
  const startedAt = window.performance.now();
  const panel = window.document.getElementById("PanelUI-zen-emojis-picker");
  const shown = new Promise((resolve) => {
    panel.addEventListener("popupshown", resolve, { once: true });
  });
  let selected = null;
  const promise = window.gZenEmojiPicker.open(anchor, {
    closeOnSelect: false,
    ...options,
    onSelect(value) {
      selected = value;
      options.onSelect?.(value);
    },
  });
  const root = await waitFor(
    window,
    () => window.document.getElementById("zen-icons-sine-root"),
    "the enhanced picker",
  );
  const rootReadyLatencyMs = window.performance.now() - startedAt;
  await shown;
  const openLatencyMs = window.performance.now() - startedAt;
  await waitFor(
    window,
    () =>
      window.document.getElementById("PanelUI-zen-emojis-picker")?.state ===
      "open",
    "the picker popup to finish opening",
  );
  return {
    promise,
    root,
    openLatencyMs,
    rootReadyLatencyMs,
    selected: () => selected,
  };
}

async function observePickerOpen(window, open, fallbackAnchor = null) {
  const startedAt = window.performance.now();
  const panel = window.document.getElementById("PanelUI-zen-emojis-picker");
  const shown = new Promise((resolve) => {
    panel.addEventListener("popupshown", resolve, { once: true });
  });
  open();
  await sleep(window, 250);
  if (
    fallbackAnchor &&
    panel.state === "closed" &&
    !window.document.getElementById("zen-icons-sine-root")
  ) {
    panel.openPopup(fallbackAnchor, "after_start", 0, 0, false, false);
  }
  const root = await waitFor(
    window,
    () => window.document.getElementById("zen-icons-sine-root"),
    "the enhanced picker",
  );
  const rootReadyLatencyMs = window.performance.now() - startedAt;
  await shown;
  const openLatencyMs = window.performance.now() - startedAt;
  return { root, openLatencyMs, rootReadyLatencyMs };
}

function rectanglesOverlap(first, second) {
  return !(
    first.right <= second.left ||
    first.left >= second.right ||
    first.bottom <= second.top ||
    first.top >= second.bottom
  );
}

function observeSvgImageLoad(window, image, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(
      () => reject(new Error("folder SVG image did not finish loading")),
      timeout,
    );
    const finish = (result) => {
      window.clearTimeout(timer);
      resolve(result);
    };
    image.addEventListener("load", () => finish("loaded"), { once: true });
    image.addEventListener(
      "error",
      () => reject(new Error("folder SVG image emitted an error")),
      { once: true },
    );
  });
}

function isAlphabetical(values) {
  const sorted = [...values].sort((left, right) =>
    left.localeCompare(right, "en", { sensitivity: "base", numeric: true }),
  );
  return values.every((value, index) => value === sorted[index]);
}

export async function run() {
  const receiptPath = PathUtils.join(PathUtils.profileDir, RECEIPT_NAME);
  let browserWindow = null;
  try {
    browserWindow = Services.wm.getMostRecentWindow("navigator:browser");
    if (!browserWindow?.gBrowser) {
      browserWindow = await new Promise((resolve) => {
        const observer = (subject, topic) => {
          if (topic === "browser-delayed-startup-finished") {
            Services.obs.removeObserver(observer, topic);
            resolve(subject);
          }
        };
        Services.obs.addObserver(observer, "browser-delayed-startup-finished");
      });
    }

    await waitFor(
      browserWindow,
      () =>
        browserWindow.document
          .getElementById("PanelUI-zen-emojis-picker")
          ?.hasAttribute("zen-icons-enhanced"),
      "Zen Icons runtime initialization",
    );

    const document = browserWindow.document;
    const sidebarCandidates = [
      "#navigator-toolbox",
      "#zen-sidebar",
      "#tabbrowser-tabs",
      "#vertical-tabs",
      "#zen-sidebar-top-buttons-customization-target",
    ].map((selector) => {
      const element = document.querySelector(selector);
      const rect = element?.getBoundingClientRect();
      return {
        selector,
        found: Boolean(element),
        width: rect?.width ?? 0,
        height: rect?.height ?? 0,
      };
    });
    const folderTab = browserWindow.gBrowser.addTab("about:blank", {
      skipAnimation: true,
      triggeringPrincipal: Services.scriptSecurityManager.getSystemPrincipal(),
    });
    const folder = await browserWindow.gZenFolders.createFolder([folderTab], {
      renameFolder: false,
      label: "Zen Icons live test",
      insertBefore: folderTab,
    });
    folder.style.cssText =
      "position: fixed; inset: 20px auto auto 20px; width: 180px; height: 40px; z-index: 2147483647;";
    folder.icon.style.cssText =
      "display: block; width: 32px; height: 32px; pointer-events: auto;";
    if (!folder.icon.querySelector("svg .icon image")) {
      throw new Error(
        "The real Zen test folder did not initialize its icon SVG",
      );
    }

    const toolbox = document.getElementById("navigator-toolbox");
    toolbox.style.setProperty("width", "420px", "important");
    toolbox.style.setProperty("min-width", "420px", "important");
    toolbox.style.setProperty("max-width", "420px", "important");
    await sleep(browserWindow, 100);

    const realFolderPicker = await observePickerOpen(
      browserWindow,
      () => browserWindow.gZenFolders.changeFolderUserIcon(folder),
      folder.icon,
    );
    const realFolderSearch =
      realFolderPicker.root.querySelector(".zen-icons-search");
    realFolderSearch.value = "sports wide";
    realFolderSearch.dispatchEvent(
      new browserWindow.Event("input", { bubbles: true }),
    );
    await sleep(browserWindow, 150);
    const realFolderCustomButton = resultButtons(realFolderPicker.root).find(
      (button) => button.dataset.provider === "custom",
    );
    if (!realFolderCustomButton) {
      const rendered = resultButtons(realFolderPicker.root).map((button) => ({
        provider: button.dataset.provider ?? "default",
        title: button.title,
      }));
      const grids = [
        ...realFolderPicker.root.querySelectorAll(".zen-icons-grid"),
      ].map((grid) => ({
        category: grid.parentElement?.dataset.category,
        busy: grid.getAttribute("aria-busy"),
        populated: grid.dataset.populated,
        count: grid.childElementCount,
      }));
      throw new Error(
        `The real folder picker did not render the custom icon: ${JSON.stringify({ rendered, grids })}`,
      );
    }
    const realFolderSvgImage = folder.icon.querySelector("svg .icon image");
    const realFolderImageLoaded = observeSvgImageLoad(
      browserWindow,
      realFolderSvgImage,
    );
    const { folderSelectionValueForRecord } = ChromeUtils.importESModule(
      "chrome://sine/content/zen-icons-local/modules/src/zen-icons-sine/folder-icon-source.mjs",
    );
    const realFolderResultImage =
      realFolderCustomButton.querySelector("img,image");
    const realFolderSelection = folderSelectionValueForRecord(
      {
        id: realFolderCustomButton.dataset.iconId,
        provider: realFolderCustomButton.dataset.provider,
        source:
          realFolderResultImage.getAttribute("src") ||
          realFolderResultImage.dataset.source,
      },
      {
        profileDir: PathUtils.profileDir,
        joinPath: PathUtils.join,
        toFileURL(filePath) {
          const file = Cc["@mozilla.org/file/local;1"].createInstance(
            Ci.nsIFile,
          );
          file.initWithPath(filePath);
          return Services.io.newFileURI(file).spec;
        },
      },
    );
    realFolderCustomButton.click();
    await waitFor(
      browserWindow,
      () => folderIconValue(folder) === realFolderSelection,
      "Zen's folder model to adopt the folder-safe icon value",
    );
    await realFolderImageLoaded;
    const realFolderImageRect = realFolderSvgImage.getBoundingClientRect();
    const realFolderImageOpacity =
      browserWindow.getComputedStyle(realFolderSvgImage).opacity;
    const configuredFolderImageWidth = Number(
      realFolderSvgImage.getAttribute("width"),
    );
    const configuredFolderImageHeight = Number(
      realFolderSvgImage.getAttribute("height"),
    );
    const realFolderImageVisible =
      realFolderSvgImage.style.opacity !== "0" &&
      Number(realFolderImageOpacity) > 0 &&
      Number(
        browserWindow.getComputedStyle(realFolderSvgImage.parentElement)
          .opacity,
      ) > 0 &&
      realFolderImageRect.width > 0 &&
      realFolderImageRect.height > 0 &&
      configuredFolderImageWidth > 0 &&
      configuredFolderImageHeight > 0;
    if (!realFolderImageVisible) {
      throw new Error(
        `The selected folder icon loaded but was configured as hidden: ${JSON.stringify({ opacity: realFolderImageOpacity, inlineOpacity: realFolderSvgImage.style.opacity, width: configuredFolderImageWidth, height: configuredFolderImageHeight, href: folderIconValue(folder) })}`,
      );
    }
    document.getElementById("PanelUI-zen-emojis-picker").hidePopup();
    await waitFor(
      browserWindow,
      () => !document.getElementById("zen-icons-sine-root"),
      "the real folder picker to close",
    );
    await sleep(browserWindow, 250);

    const folderHarness = document.createXULElement("vbox");
    folderHarness.style.cssText =
      "position: fixed; inset: 80px auto auto 20px; width: 40px; height: 40px; z-index: 2147483647;";
    const folderHarnessAnchor = document.createXULElement("toolbarbutton");
    folderHarness.append(folderHarnessAnchor);
    folder.append(folderHarness);
    const first = await openPicker(browserWindow, folderHarnessAnchor, {
      onlyIcons: true,
    });
    const panel = document.getElementById("PanelUI-zen-emojis-picker");
    const sidebarWidth = document
      .getElementById("navigator-toolbox")
      .getBoundingClientRect().width;
    const panelWidth = panel.getBoundingClientRect().width;
    const rootWidth = first.root.getBoundingClientRect().width;
    const nativePanelWidth = parseFloat(
      browserWindow.getComputedStyle(panel).getPropertyValue("--panel-width"),
    );
    const initialGroupHeaders = [
      ...first.root.querySelectorAll(".zen-icons-group-header"),
    ];
    const mainCategoryOrder = [
      ...first.root.querySelectorAll(".zen-icons-group"),
    ].map((group) => group.dataset.category);
    const decoratedMainCategories = initialGroupHeaders.every(
      (header) =>
        header.querySelector(".zen-icons-category-icon") &&
        header.textContent.includes(header.parentElement.dataset.category),
    );
    const defaultChoice = first.root.querySelector(".zen-icons-default-choice");
    const defaultChoicePinned =
      defaultChoice &&
      defaultChoice.compareDocumentPosition(
        first.root.querySelector(".zen-icons-group"),
      ) & browserWindow.Node.DOCUMENT_POSITION_FOLLOWING;
    const nativeHeaderHidden =
      browserWindow.getComputedStyle(
        document.getElementById("PanelUI-zen-picker-header"),
      ).display === "none";
    const allGroupsInitiallyExpanded = initialGroupHeaders.every(
      (header) => header.getAttribute("aria-expanded") === "true",
    );
    const toggledHeader = initialGroupHeaders[1];
    toggledHeader.click();
    const categoryCanCollapse =
      toggledHeader.getAttribute("aria-expanded") === "false" &&
      toggledHeader.nextElementSibling.hidden;
    toggledHeader.click();
    const categoryCanReopen =
      toggledHeader.getAttribute("aria-expanded") === "true" &&
      !toggledHeader.nextElementSibling.hidden;
    const firstResultStyle = browserWindow.getComputedStyle(
      first.root.querySelector(".zen-icons-result"),
    );
    const iconOnlyButtons =
      parseFloat(firstResultStyle.borderTopWidth) === 0 &&
      firstResultStyle.backgroundColor === "rgba(0, 0, 0, 0)" &&
      firstResultStyle.appearance === "none";
    const search = first.root.querySelector(".zen-icons-search");
    search.value = "gridiron";
    search.dispatchEvent(new browserWindow.Event("input", { bubbles: true }));
    await sleep(browserWindow, 150);
    const tagMatches = resultButtons(first.root).map((button) => ({
      provider: button.dataset.provider,
      title: button.title,
    }));

    const filterButton = first.root.querySelector(".zen-icons-filter-button");
    filterButton.dispatchEvent(
      new browserWindow.MouseEvent("click", { bubbles: true }),
    );
    const filterPanel = await waitFor(
      browserWindow,
      () => {
        const candidate = document.getElementById(
          "zen-icons-sine-filter-panel",
        );
        return candidate?.state === "open" ? candidate : null;
      },
      "the separate filter popup",
      3000,
    ).catch((error) => {
      const candidate = document.getElementById("zen-icons-sine-filter-panel");
      throw new Error(
        `${error.message}; exists=${Boolean(candidate)} state=${candidate?.state} connected=${candidate?.isConnected} parent=${candidate?.parentElement?.localName}#${candidate?.parentElement?.id} anchor=${filterButton.localName}`,
      );
    });
    const filterMenu = filterPanel.querySelector(".zen-icons-filter-menu");
    const separateFilterPopup = !first.root.contains(filterMenu);
    const filterPopupWidth = filterPanel.getBoundingClientRect().width;
    const filterOverlapsPicker = rectanglesOverlap(
      filterPanel.getBoundingClientRect(),
      panel.getBoundingClientRect(),
    );
    const filterFits =
      filterPopupWidth >= 320 &&
      filterMenu.scrollWidth <= filterMenu.clientWidth;
    const folderProviderLabels = [
      ...filterPanel.querySelectorAll(".zen-icons-provider-option"),
    ].map((label) => label.textContent.trim());
    const categoryCount = filterPanel.querySelectorAll(
      ".zen-icons-category-link",
    ).length;
    const filterCategoryOrder = [
      ...filterPanel.querySelectorAll(".zen-icons-category-link"),
    ].map((button) => button.dataset.category);
    const decoratedFilterCategories = [
      ...filterPanel.querySelectorAll(".zen-icons-category-link"),
    ].every(
      (button) =>
        button.querySelector(".zen-icons-category-icon") &&
        button.textContent.includes(button.dataset.category),
    );
    const filterIsIconOnly =
      filterButton.getAttribute("aria-label") === "Filter icons" &&
      !filterButton.getAttribute("label") &&
      !filterButton.textContent.trim();
    const toolbarStyle = browserWindow.getComputedStyle(
      first.root.querySelector(".zen-icons-toolbar"),
    );
    const coherentSearchToolbar =
      toolbarStyle.backgroundColor === "rgba(0, 0, 0, 0)" &&
      filterButton.getBoundingClientRect().width <=
        filterButton.getBoundingClientRect().height + 4;
    const providerCheckbox = filterPanel.querySelector(
      ".zen-icons-provider-option input",
    );
    providerCheckbox.checked = false;
    providerCheckbox.dispatchEvent(
      new browserWindow.Event("change", { bubbles: true }),
    );
    const filterStaysOpenForProviders = filterPanel.state === "open";
    providerCheckbox.checked = true;
    providerCheckbox.dispatchEvent(
      new browserWindow.Event("change", { bubbles: true }),
    );
    const folderToggle = filterPanel.querySelector(
      ".zen-icons-folder-shape input",
    );
    if (!folderToggle) {
      throw new Error("The per-folder shape toggle was not rendered");
    }
    folderToggle.checked = false;
    folderToggle.dispatchEvent(
      new browserWindow.Event("change", { bubbles: true }),
    );
    const folderShapeHidden =
      folder.hasAttribute("zen-hide-folder-shape") ||
      folder.hasAttribute("zen-icons-hide-folder-shape");
    const categoryFilterSection = filterPanel.querySelectorAll(
      ".zen-icons-filter-section",
    )[1];
    const folderControlBeforeCategories = Boolean(
      filterPanel
        .querySelector(".zen-icons-folder-shape")
        ?.compareDocumentPosition(categoryFilterSection) &
      browserWindow.Node.DOCUMENT_POSITION_FOLLOWING,
    );
    filterPanel.querySelector(".zen-icons-category-link").click();
    await waitFor(
      browserWindow,
      () => filterPanel.state === "closed",
      "the filter popup to close after category navigation",
    );

    search.value = "sports wide";
    search.dispatchEvent(new browserWindow.Event("input", { bubbles: true }));
    await sleep(browserWindow, 150);
    const customButton = resultButtons(first.root).find(
      (button) => button.dataset.provider === "custom",
    );
    if (!customButton) {
      throw new Error("The custom raster test icon was not searchable");
    }
    const customImage = customButton.querySelector("img");
    const customDisplaySource = customImage?.getAttribute("src") ?? "";
    const usesRasterSource =
      customImage?.src.includes("sports-wide.png") ?? false;
    const containScaling =
      browserWindow.getComputedStyle(customImage).objectFit === "contain";
    customButton.click();
    const customSelection = await first.promise.catch(() => null);
    if (
      !String(customSelection).startsWith("chrome://sine/content/") &&
      !String(customSelection).startsWith("file:")
    ) {
      throw new Error(
        `Custom icon selection did not reach Zen's picker callback: ${customSelection}`,
      );
    }
    await waitFor(
      browserWindow,
      () => !document.getElementById("zen-icons-sine-root"),
      "the folder picker to close",
    );
    await sleep(browserWindow, 250);

    const normalHost = document.createXULElement("vbox");
    normalHost.style.cssText =
      "position: fixed; inset: 80px auto auto 20px; width: 40px; height: 40px; z-index: 2147483647;";
    const normalAnchor = document.createXULElement("toolbarbutton");
    normalHost.append(normalAnchor);
    document.documentElement.append(normalHost);
    const normal = await openPicker(browserWindow, normalAnchor, {
      emojiAsSVG: true,
    });
    normal.root
      .querySelector(".zen-icons-filter-button")
      .dispatchEvent(new browserWindow.MouseEvent("click", { bubbles: true }));
    const normalFilterPanel = await waitFor(
      browserWindow,
      () => {
        const candidate = document.getElementById(
          "zen-icons-sine-filter-panel",
        );
        return candidate?.state === "open" ? candidate : null;
      },
      "the normal picker's filter popup",
      3000,
    );
    const providerLabels = [
      ...normalFilterPanel.querySelectorAll(".zen-icons-provider-option"),
    ].map((label) => label.textContent.trim());
    normalFilterPanel.hidePopup();
    const normalSearch = normal.root.querySelector(".zen-icons-search");
    normalSearch.value = "dog";
    normalSearch.dispatchEvent(
      new browserWindow.Event("input", { bubbles: true }),
    );
    await sleep(browserWindow, 150);
    const emojiTagMatches = resultButtons(normal.root).map((button) => ({
      provider: button.dataset.provider,
      title: button.title,
    }));
    if (!emojiTagMatches.some((match) => match.provider === "emoji")) {
      throw new Error("The normal picker did not return an emoji tag match");
    }
    const emojiButton = resultButtons(normal.root).find(
      (button) => button.dataset.provider === "emoji",
    );
    const emojiFontSize = parseFloat(
      browserWindow.getComputedStyle(emojiButton).fontSize,
    );
    const emojiButtonRect = emojiButton.getBoundingClientRect();
    const emojiRange = document.createRange();
    emojiRange.selectNodeContents(emojiButton);
    const emojiGlyphRect = emojiRange.getBoundingClientRect();
    const emojiHoverGeometry = {
      buttonWidth: emojiButtonRect.width,
      buttonHeight: emojiButtonRect.height,
      glyphWidth: emojiGlyphRect.width,
      glyphHeight: emojiGlyphRect.height,
      centerOffsetX: Math.abs(
        emojiButtonRect.left +
          emojiButtonRect.width / 2 -
          (emojiGlyphRect.left + emojiGlyphRect.width / 2),
      ),
      centerOffsetY: Math.abs(
        emojiButtonRect.top +
          emojiButtonRect.height / 2 -
          (emojiGlyphRect.top + emojiGlyphRect.height / 2),
      ),
      padding: browserWindow.getComputedStyle(emojiButton).padding,
    };
    const lucideDogButton = resultButtons(normal.root).find(
      (button) =>
        button.dataset.provider === "lucide" &&
        button.title.startsWith("Dog —"),
    );
    const lucideDogImage = lucideDogButton?.querySelector(
      ".zen-icons-result-image",
    );
    if (!lucideDogImage) {
      throw new Error("The Lucide dog result was not rendered");
    }
    const lucideImageStyle = browserWindow.getComputedStyle(lucideDogImage);
    const lucideButtonStyle = browserWindow.getComputedStyle(lucideDogButton);
    const lucideRect = lucideDogImage.getBoundingClientRect();
    const lucideDiagnostics = {
      imageNode: lucideDogImage.localName,
      imageColor: lucideImageStyle.color,
      imageFill: lucideImageStyle.fill,
      imageStroke: lucideImageStyle.stroke,
      imageContext: lucideImageStyle.getPropertyValue(
        "-moz-context-properties",
      ),
      listStyleImage: lucideImageStyle.listStyleImage,
      width: lucideRect.width,
      height: lucideRect.height,
      buttonColor: lucideButtonStyle.color,
      buttonFill: lucideButtonStyle.fill,
      buttonStroke: lucideButtonStyle.stroke,
      source: lucideDogImage.getAttribute("src"),
    };
    const lucideDogRenderable =
      lucideDiagnostics.imageNode === "image" &&
      lucideDiagnostics.listStyleImage.includes("/lucide/dog.svg") &&
      lucideDiagnostics.imageContext.includes("stroke") &&
      lucideDiagnostics.imageStroke !== "none" &&
      lucideDiagnostics.width > 0 &&
      lucideDiagnostics.height > 0;
    const missingImage = document.createElement("img");
    missingImage.src = customDisplaySource.replace(
      "sports-wide.png",
      "missing.png",
    );
    normalHost.append(missingImage);
    await waitFor(
      browserWindow,
      () => missingImage.src.includes("selectable/image.svg"),
      "the missing custom-image fallback",
    );
    emojiButton.click();
    const emojiSelection = await normal.promise.catch(() => null);
    if (!String(emojiSelection).startsWith("data:image/svg+xml;base64,")) {
      throw new Error(
        `Emoji-as-SVG selection was not preserved: ${emojiSelection}`,
      );
    }
    const presentationFailures = [];
    if (Math.abs(panelWidth - sidebarWidth) > 4 || rootWidth > sidebarWidth) {
      presentationFailures.push(
        `picker width ${panelWidth}/${rootWidth} did not match sidebar ${sidebarWidth}`,
      );
    }
    if (
      Math.abs(nativePanelWidth - sidebarWidth) > 4 ||
      Math.abs(panelWidth - rootWidth) > 4
    ) {
      presentationFailures.push(
        `native inner width ${nativePanelWidth}/${rootWidth} left a remainder inside panel ${panelWidth}`,
      );
    }
    if (!iconOnlyButtons) {
      presentationFailures.push("icon buttons retained a tile appearance");
    }
    if (!isAlphabetical(mainCategoryOrder)) {
      presentationFailures.push("main categories were not alphabetical");
    }
    if (!isAlphabetical(filterCategoryOrder)) {
      presentationFailures.push("filter categories were not alphabetical");
    }
    if (!decoratedMainCategories || !decoratedFilterCategories) {
      presentationFailures.push("category headings did not include icons");
    }
    if (!defaultChoicePinned) {
      presentationFailures.push("the default icon was not pinned first");
    }
    if (!nativeHeaderHidden) {
      presentationFailures.push(
        "the redundant native trash header remained visible",
      );
    }
    if (!filterIsIconOnly || !coherentSearchToolbar) {
      presentationFailures.push(
        "the search field retained the text filter toolbar",
      );
    }
    if (!allGroupsInitiallyExpanded) {
      presentationFailures.push("not all category groups started expanded");
    }
    if (!categoryCanCollapse || !categoryCanReopen) {
      presentationFailures.push("category groups could not close and reopen");
    }
    if (!filterFits) {
      presentationFailures.push("filter controls overflowed horizontally");
    }
    if (!separateFilterPopup || !filterStaysOpenForProviders) {
      presentationFailures.push(
        "filter controls did not use a persistent separate popup",
      );
    }
    if (filterPanel.getAttribute("level") !== "top") {
      presentationFailures.push("filter popup was obscured by the icon picker");
    }
    if (!folderControlBeforeCategories) {
      presentationFailures.push(
        "folder outline control was buried below categories",
      );
    }
    if (!folderShapeHidden) {
      presentationFailures.push(
        "folder outline toggle did not update Zen's folder",
      );
    }
    if (emojiFontSize < 22 || emojiFontSize > 24) {
      presentationFailures.push(
        `emoji preview was not balanced at ${emojiFontSize}px`,
      );
    }
    if (
      emojiHoverGeometry.centerOffsetX > 1.5 ||
      emojiHoverGeometry.centerOffsetY > 1.5 ||
      emojiHoverGeometry.glyphWidth > emojiHoverGeometry.buttonWidth ||
      emojiHoverGeometry.glyphHeight > emojiHoverGeometry.buttonHeight ||
      emojiHoverGeometry.padding !== "0px"
    ) {
      presentationFailures.push(
        `emoji hover geometry was offset: ${JSON.stringify(emojiHoverGeometry)}`,
      );
    }
    if (first.openLatencyMs > 750 || normal.openLatencyMs > 750) {
      presentationFailures.push(
        `picker opened too slowly at ${first.openLatencyMs}/${normal.openLatencyMs}ms`,
      );
    }
    if (!lucideDogRenderable) {
      presentationFailures.push(
        `Lucide preview was not renderable: ${JSON.stringify(lucideDiagnostics)}`,
      );
    }
    if (presentationFailures.length) {
      throw new Error(presentationFailures.join("; "));
    }
    const folderPersisted = browserWindow.gZenFolders
      .storeDataForSessionStore()
      .some(
        (stored) =>
          stored.id === folder.id &&
          (stored.userIcon === realFolderSelection ||
            stored.icon === realFolderSelection),
      );
    if (!folderPersisted)
      throw new Error(
        "Selected folder icon was not serialized for session restore",
      );
    await IOUtils.writeJSON(receiptPath, {
      result: "passed",
      zenVersion: Services.appinfo.version,
      enhancedPicker: true,
      tagSearch: {
        query: "gridiron",
        matches: tagMatches,
        emojiQuery: "dog",
        emojiMatches: emojiTagMatches,
      },
      providers: providerLabels,
      categoryCount,
      customIcon: {
        searchable: true,
        selection: customSelection,
        usesRasterSource,
        containScaling,
        missingFileFallback: true,
      },
      folder: {
        providers: folderProviderLabels,
        emojiExcluded: !folderProviderLabels.includes("Emojis"),
        shapeToggleRendered: true,
        shapeHidden: folderShapeHidden,
        iconLoaded: true,
        iconVisible: realFolderImageVisible,
        iconGeometry: {
          configuredWidth: configuredFolderImageWidth,
          configuredHeight: configuredFolderImageHeight,
          layoutWidth: realFolderImageRect.width,
          layoutHeight: realFolderImageRect.height,
          computedOpacity: realFolderImageOpacity,
          inlineOpacity: realFolderSvgImage.style.opacity,
        },
        persisted: folderPersisted,
      },
      sidebarCandidates,
      presentation: {
        sidebarWidth,
        panelWidth,
        rootWidth,
        nativePanelWidth,
        separateFilterPopup,
        filterPopupWidth,
        filterStaysOpenForProviders,
        filterOverlapsPicker,
        filterLevel: filterPanel.getAttribute("level"),
        filterClosesForCategory: true,
        emojiFontSize,
        emojiHoverGeometry,
        emojiAsSvgSelection: true,
        folderRootReadyLatencyMs: first.rootReadyLatencyMs,
        normalRootReadyLatencyMs: normal.rootReadyLatencyMs,
        folderOpenLatencyMs: first.openLatencyMs,
        normalOpenLatencyMs: normal.openLatencyMs,
        iconOnlyButtons,
        allGroupsInitiallyExpanded,
        categoryCanCollapse,
        categoryCanReopen,
        mainCategoryOrder,
        filterCategoryOrder,
        decoratedMainCategories,
        decoratedFilterCategories,
        defaultChoicePinned: Boolean(defaultChoicePinned),
        nativeHeaderHidden,
        filterIsIconOnly,
        coherentSearchToolbar,
        filterFits,
        lucideDogRenderable,
        lucideDiagnostics,
      },
    });
  } catch (error) {
    await IOUtils.writeJSON(receiptPath, {
      result: "failed",
      errorName: error?.name ?? "Error",
      errorMessage: String(error?.message ?? error),
      stack: String(error?.stack ?? ""),
    });
  } finally {
    browserWindow?.setTimeout(
      () => Services.startup.quit(Ci.nsIAppStartup.eForceQuit),
      250,
    );
  }
}
