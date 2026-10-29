// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
//
// Unmodified animation-method excerpt from installed Zen 1.22.2b:
// browser/omni.ja chrome/browser/content/browser/zen-components/ZenFolders.mjs
// Source stamp e74571eead515d37edd0914739f744bcb5258c51.
// The surrounding shell replaces only unrelated platform/icon/indent services.
class NativeFolderAnimationFixture {
  #animationCount = 0;
  async on_TabGroupCollapse(event) {
    const group = event.target;
    if (!group.isZenFolder) return;
    await this.animateCollapse(group);
  }
  async on_TabGroupExpand(event) {
    const group = event.target;
    if (!group.isZenFolder) return;
    await this.animateExpand(group);
  }
  cancelPopupTimer() {}
  updateFolderIcon() { return []; }
  setFolderIndentation() {}
  styleCleanup(items) {
    items.forEach(item => {
      item.style.removeProperty('opacity');
      item.style.removeProperty('height');
      item.style.removeProperty('min-height');
    });
  }
  #normalizeGroupItems(items) {
    return items
      .filter(item => !item.hasAttribute("zen-empty-tab"))
      .map(item => {
        if (gBrowser.isTabGroup(item)) {
          item = item.firstChild;
        } else if (gBrowser.isTabGroupLabel(item)) {
          if (item?.group?.hasAttribute("split-view-group")) {
            item = item.group;
          } else {
            item = item.parentElement;
          }
        }
        return item;
      });
  }

  #shouldTabBeActive(tab, contextGroup) {
    if (tab.multiselected || tab.selected) {
      return true;
    }
    // See https://github.com/zen-browser/desktop/issues/12509.
    // We can't just blindly check for the tab's active state
    // because it would mean that all tabs in a collapsed group that
    // are active means they should be active for contextGroup as well,
    // even if they are active because of another group they belong to.
    return tab.hasAttribute("folder-active") && contextGroup === tab.group;
  }

  #collectGroupItems(group, opts = {}) {
    const {
      selectedTabs = [],
      splitViewIds = new Set(),
      activeFoldersIds = new Set(),
    } = opts;
    const folders = new Map();
    return group.childGroupsAndTabs
      .filter(item => !item.hasAttribute("zen-empty-tab"))
      .map(item => {
        const isSplitView = item.group?.hasAttribute?.("split-view-group");
        const itemGroup = isSplitView ? item.group.group : item.group;
        if (!folders.has(itemGroup?.id)) {
          folders.set(itemGroup?.id, itemGroup?.activeGroups[0]);
        }
        const lastActiveFolder = folders.get(itemGroup?.id);
        const activeFolderId = lastActiveFolder?.id;
        const splitViewId = isSplitView ? item?.group?.id : null;

        if (this.#shouldTabBeActive(item, group)) {
          selectedTabs.push(item);
          if (splitViewId) {
            splitViewIds.add(splitViewId);
          }
          if (activeFolderId) {
            activeFoldersIds.add(activeFolderId);
          }
        }

        if (gBrowser.isTabGroupLabel(item)) {
          if (isSplitView) {
            item = item.group;
          } else {
            item = item.parentElement;
          }
        }

        return { item, splitViewId, activeFolderId };
      });
  }

  #createAnimation(items, targetState, opts, callback = () => {}) {
    items = Array.isArray(items) ? items : [items];
    return items.map(item =>
      this.#animateItem(item, targetState, opts).then(callback)
    );
  }

  /**
   * Animates an element to the given target state. An array value is a
   * [from, to] pair, "auto" endpoints are resolved by measuring and an
   * empty string animates back to the element's natural value. The final
   * values are left applied as inline styles.
   *
   * @param {Element} item - The element to animate.
   * @param {object} targetState - Property to value (or [from, to]) map.
   * @param {object} opts - The animation options.
   * @param {number} opts.duration - The duration in seconds.
   * @param {string} opts.ease - The easing name.
   * @returns {Promise} Resolves when the animation has finished.
   */
  async #animateItem(item, targetState, { duration = 0.18, ease } = {}) {
    const computed = window.getComputedStyle(item);
    const toCssValue = (prop, value) =>
      typeof value === "number" && prop !== "opacity"
        ? `${value}px`
        : String(value);
    const measure = prop => {
      const value = computed[prop];
      if (value === "auto") {
        return `${item.getBoundingClientRect()[prop] ?? 0}px`;
      }
      return value;
    };
    const from = {};
    const to = {};
    const finalStyles = new Map();
    for (const [prop, value] of Object.entries(targetState)) {
      let [start, end] = Array.isArray(value) ? value : [undefined, value];
      const cssProp = prop.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`);
      if (start === undefined || start === "auto") {
        start = measure(prop);
      } else {
        start = toCssValue(prop, start);
      }
      if (end === "" || end === "auto") {
        // Resolve the natural value by clearing any inline override.
        item.style.removeProperty(cssProp);
        end = measure(prop);
        finalStyles.set(cssProp, null);
      } else {
        end = toCssValue(prop, end);
        finalStyles.set(cssProp, end);
      }
      from[prop] = start;
      to[prop] = end;
    }
    const animation = item.animate([from, to], {
      duration: duration * 1000,
      easing: ease === "easeInOut" ? "ease-in-out" : "ease",
    });
    try {
      await animation.finished;
    } catch (e) {
      // The animation was cancelled, leave the element as-is.
      return;
    }
    for (const [cssProp, value] of finalStyles) {
      if (value === null) {
        item.style.removeProperty(cssProp);
      } else {
        item.style.setProperty(cssProp, value);
      }
    }
  }

  #calculateHeightShift(tabsContainer, selectedTabs) {
    let heightShift = 0;
    if (selectedTabs.length) {
      return heightShift;
    }
    heightShift +=
      window.windowUtils.getBoundsWithoutFlushing(tabsContainer).height;
    if (tabsContainer.separatorElement) {
      heightShift -= window.windowUtils.getBoundsWithoutFlushing(
        tabsContainer.separatorElement
      ).height;
    }

    return heightShift;
  }

  get #folderAnimationDuration() {
    return this._dontAnimateFolder ? 0 : 0.18;
  }

  get #folderRevealDuration() {
    return this._dontAnimateFolder ? 0 : 0.22;
  }

  async animateCollapse(group) {
    this.cancelPopupTimer();

    const animations = [];
    const selectedTabs = [];
    const splitViewIds = new Set();
    const activeFoldersIds = new Set();
    const itemsToHide = [];

    const tabsContainer = group.groupContainer;
    const groupStart = group.groupStartElement;

    const groupItems = this.#collectGroupItems(group, {
      selectedTabs,
      splitViewIds,
      activeFoldersIds,
    });
    if (selectedTabs.length) {
      tabsContainer.removeAttribute("hidden");
    }
    const collapsedHeight = this.#calculateHeightShift(
      tabsContainer,
      selectedTabs
    );

    if (selectedTabs.length) {
      for (let i = 0; i < groupItems.length; i++) {
        const { item, splitViewId, activeFolderId } = groupItems[i];

        // Skip selected items
        if (selectedTabs.includes(item)) {
          continue;
        }

        // Skip items from selected split-view groups
        if (splitViewId && splitViewIds.has(splitViewId)) {
          continue;
        }

        // Skip items from selected active groups
        if (activeFolderId && activeFoldersIds.has(activeFolderId)) {
          // If item is tab-group-label-container we should hide it.
          // Other items between tab-group-labe-container and folder-active tab should be visible cuz they are hidden by margin-top
          if (
            item.parentElement.id !== activeFolderId &&
            !item.hasAttribute("folder-active")
          ) {
            continue;
          }
        }

        if (!itemsToHide.includes(item)) {
          itemsToHide.push(item);
        }
      }

      group.setAttribute("has-active", "true");
      group.activeTabs = selectedTabs;

      selectedTabs.forEach(tab => {
        this.setFolderIndentation([tab], group, /* for collapse = */ true);
      });
    }

    let duration = this.#folderAnimationDuration;

    animations.push(
      ...this.#createAnimation(
        itemsToHide,
        { opacity: [1, 0], height: ["auto", 0] },
        { duration, ease: "easeInOut" }
      ),
      ...this.updateFolderIcon(group),
      ...this.#createAnimation(
        groupStart,
        {
          marginTop: -(
            collapsedHeight +
            4 * (selectedTabs.length === 0 ? 1 : 0)
          ),
        },
        { duration, ease: "easeInOut" }
      )
    );

    gBrowser.tabContainer._invalidateCachedVisibleTabs();
    this.#animationCount += 1;
    await Promise.all(animations);
    if (this.#animationCount) {
      this.#animationCount -= 1;
      return;
    }
    // Prevent hiding if we spam the group animations
    if (!selectedTabs.length && !this.#animationCount) {
      tabsContainer.setAttribute("hidden", true);
    }

    this.styleCleanup(itemsToHide);
  }

  async animateExpand(group) {
    this.cancelPopupTimer();

    const animations = [];
    const itemsToHide = [];

    const tabsContainer = group.groupContainer;
    tabsContainer.removeAttribute("hidden");
    tabsContainer.style.overflowY = "hidden";

    const groupStart = group.groupStartElement;
    const itemsToShow = this.#normalizeGroupItems(group.childGroupsAndTabs);
    const activeFolders = group.childActiveGroups;

    for (const folder of activeFolders) {
      const splitViewIds = new Set();
      const selectedTabs = folder.activeTabs;

      const activeFoldersIds = new Set();
      const activeFolderItems = this.#collectGroupItems(folder, {
        splitViewIds,
        activeFoldersIds,
      });

      if (selectedTabs.length) {
        for (let i = 0; i < activeFolderItems.length; i++) {
          const { item, splitViewId, activeFolderId } = activeFolderItems[i];

          // Skip selected items
          if (selectedTabs.includes(item)) {
            continue;
          }

          // Skip items from selected split-view groups
          if (splitViewId && splitViewIds.has(splitViewId)) {
            continue;
          }

          if (activeFolderId && activeFoldersIds.has(activeFolderId)) {
            const parentFolder = item.parentElement;
            if (
              gBrowser.isTabGroup(parentFolder) &&
              parentFolder.id !== activeFolderId &&
              item.hasAttribute("folder-active")
            ) {
              continue;
            }
          }

          if (!itemsToHide.includes(item)) {
            itemsToHide.push(item);
          }
        }
      }
    }

    const afterMarginTop = () => {
      tabsContainer.style.overflowY = "";
      if (group.hasAttribute("has-active")) {
        const activeTabs = group.activeTabs;
        const folders = new Map();
        group.removeAttribute("has-active");
        for (let tab of activeTabs) {
          const tabGroup = tab?.group?.hasAttribute("split-view-group")
            ? tab?.group?.group
            : tab?.group;
          if (!folders.has(tabGroup?.id)) {
            folders.set(tabGroup?.id, tabGroup?.activeGroups?.at(-1));
          }
          let activeGroup = folders.get(tabGroup?.id);
          if (activeGroup) {
            this.setFolderIndentation(
              [tab],
              activeGroup,
              /* for collapse = */ true
            );
          } else {
            // Since the folder is now expanded, we should remove active attribute
            // to the tab that was previously visible
            tab.removeAttribute("folder-active");
            if (tab.group?.hasAttribute("split-view-group")) {
              tab.group.style.removeProperty("--zen-folder-indent");
            } else {
              tab.style.removeProperty("--zen-folder-indent");
            }
          }
        }
        folders.clear();
      }
      // Folder has been expanded and has no active tabs
      group.activeTabs = [];
    };

    let duration = this.#folderAnimationDuration;

    animations.push(
      ...this.#createAnimation(
        itemsToShow,
        { opacity: "", height: "" },
        { duration, ease: "easeInOut" }
      ),
      ...this.#createAnimation(
        itemsToHide,
        { opacity: 0, height: 0 },
        { duration, ease: "easeInOut" }
      ),
      ...this.updateFolderIcon(group),
      ...this.#createAnimation(
        groupStart,
        {
          marginTop: 0,
        },
        { duration, ease: "easeInOut" },
        afterMarginTop
      )
    );

    this.#animationCount += 1;
    await Promise.all(animations);
    this.#animationCount -= 1;

    // Cleanup
    this.styleCleanup(itemsToShow);
    this.styleCleanup(itemsToHide);
  }


}
window.gZenFolders = new NativeFolderAnimationFixture();
