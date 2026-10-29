// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
//
// Unmodified preview-method excerpt from installed Zen 1.22.2b:
// browser/omni.ja chrome/browser/content/browser/zen-components/ZenFolders.mjs
// Source stamp e74571eead515d37edd0914739f744bcb5258c51.
// Native source lines 830-1037: openTabsPopup and its three private helpers.
// The surrounding shell only supplies the test panel and exposes this fixture.
class NativeFolderPreviewFixture {
  #popup;
  constructor(panel) { this.#popup = panel; }
  openTabsPopup(event) {
    event.stopPropagation();
    if (
      document.documentElement.getAttribute("zen-renaming-tab") ||
      gURLBar.focused
    ) {
      return;
    }

    const activeGroup = event.target.parentElement;
    if (
      activeGroup.tabs.filter(tab =>
        this.#shouldAppearOnTabSearch(tab, activeGroup)
      ).length === 0
    ) {
      // If the group has no tabs, we don't show the popup
      return;
    }
    document.getElementById("zen-folder-tabs-search-no-results").hidden = true;
    this.#populateTabsList(activeGroup);

    const search = this.#popup.querySelector("#zen-folder-tabs-list-search");
    document.l10n.setArgs(search, {
      "folder-name": activeGroup.name,
    });
    const tabsList = this.#popup.querySelector("#zen-folder-tabs-list");

    const onSearchInput = () => {
      const query = search.value.toLowerCase();
      let foundTabs = 0;
      for (const item of tabsList.children) {
        const found = item.getAttribute("data-label").includes(query);
        item.hidden = !found;
        if (found) {
          foundTabs++;
        }
      }
      document.getElementById("zen-folder-tabs-search-no-results").hidden =
        foundTabs > 0;
    };
    search.addEventListener("input", onSearchInput);

    const onKeyDown = event => {
      // Arrow down and up to navigate through the list
      if (
        event.key === "ArrowDown" ||
        event.key === "ArrowUp" ||
        event.key === "Tab"
      ) {
        event.preventDefault();
        let isUp =
          event.key === "ArrowUp" || (event.key === "Tab" && event.shiftKey);
        const items = Array.from(tabsList.children).filter(
          item => !item.hidden
        );
        if (items.length === 0) {
          return;
        }
        let index = items.indexOf(
          tabsList.querySelector(".folders-tabs-list-item[selected]")
        );
        if (!isUp) {
          index = (index + 1) % items.length;
        } else {
          index = (index - 1 + items.length) % items.length;
        }
        items.forEach(item => item.removeAttribute("selected"));
        const targetItem = items[index];
        targetItem.setAttribute("selected", "true");
        targetItem.scrollIntoView({ block: "start", behavior: "smooth" });
      } else if (event.key === "Enter") {
        // Enter to select the currently highlighted item
        const highlightedItem = tabsList.querySelector(
          ".folders-tabs-list-item[selected]"
        );
        if (highlightedItem) {
          highlightedItem.click();
        }
      }
    };
    document.addEventListener("keydown", onKeyDown);

    const target = event.target;
    target.setAttribute("open", true);

    const handlePopupHidden = event => {
      if (event.target !== this.#popup) {
        return;
      }
      search.value = "";
      target.removeAttribute("open");
      search.removeEventListener("input", onSearchInput);
      document.removeEventListener("keydown", onKeyDown);
    };

    this.#popup.addEventListener(
      "popupshown",
      () => {
        search.focus();
        search.select();
      },
      { once: true }
    );

    this.#popup.addEventListener("popuphidden", handlePopupHidden, {
      once: true,
    });
    this.#popup.openPopup(target, this.#searchPopupOptions);
  }

  get #searchPopupOptions() {
    const isRightSide = gZenVerticalTabsManager._prefsRightSide;
    const position = isRightSide ? "topleft topright" : "topright topleft";
    let size = Math.min(
      this.#popup.querySelector("#zen-folder-tabs-list").children.length,
      6
    );
    size *= 48;
    return {
      position,
      x: isRightSide ? -10 : 10,
      y: size / -2,
    };
  }

  #shouldAppearOnTabSearch(tab, group) {
    // Note that tab.visible and tab.hidden act in different ways.
    // We don't want to show already visible tabs in the search results.
    // That's why we need to do the active tab search, tab.hidden doesn't
    // account for the visibility of the tab itself, it's just a literal
    // representation of the `hidden` attribute.
    const tabIsInActiveGroup = group.activeTabs.includes(tab);
    return (
      !tabIsInActiveGroup && !(tab.hidden || tab.hasAttribute("zen-empty-tab"))
    );
  }

  #populateTabsList(group) {
    const tabsList = this.#popup.querySelector("#zen-folder-tabs-list");
    tabsList.replaceChildren();

    for (const tab of group.tabs) {
      if (!this.#shouldAppearOnTabSearch(tab, group)) {
        continue;
      }

      const item = document.createElement("div");
      item.className = "folders-tabs-list-item";

      const content = document.createElement("div");
      content.className = "folders-tabs-list-item-content";

      const icon = document.createElement("img");
      icon.className = "folders-tabs-list-item-icon";

      let tabURL = tab.linkedBrowser?.currentURI?.spec || "";
      try {
        // Get the hostname from the URL
        const url = new URL(tabURL);
        tabURL = url.hostname || tabURL;
      } catch {
        // We don't need to do anything if the URL is invalid. e.g. about:blank
      }
      let tabLabel = tab.label || "";
      let iconURL =
        gBrowser.getIcon(tab) || PlacesUtils.favicons.defaultFavicon.spec;

      icon.src = iconURL;

      const labelsContainer = document.createElement("div");
      labelsContainer.className = "folders-tabs-list-item-labels";

      const mainLabel = document.createElement("div");
      mainLabel.className = "folders-tabs-list-item-label";
      mainLabel.textContent = tabLabel;

      const secondaryLabel = document.createElement("div");
      secondaryLabel.className = "tab-list-item-secondary-label";
      secondaryLabel.textContent = `${formatRelativeTime(tab.lastAccessed)} • ${tab.group.label}`;

      labelsContainer.append(mainLabel, secondaryLabel);
      content.append(icon, labelsContainer);
      item.append(content);

      if (tab.selected) {
        item.setAttribute("selected", "true");
      }

      item.setAttribute(
        "data-label",
        `${tabLabel.toLowerCase()} ${tabURL.toLowerCase()}`
      );

      item.addEventListener("click", () => {
        gBrowser.selectedTab = tab;
      });

      item.addEventListener("mouseenter", () => {
        for (const sibling of tabsList.children) {
          sibling.removeAttribute("selected");
        }
        item.setAttribute("selected", "true");
      });

      tabsList.appendChild(item);
    }
  }

}
window.NativeFolderPreviewFixture = NativeFolderPreviewFixture;
