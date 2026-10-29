// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at https://mozilla.org/MPL/2.0/.
//
// Verbatim native session fields and new-tab/close methods from Zen 1.22.2b,
// build 20260915091052, source e74571eead515d37edd0914739f744bcb5258c51.
// browser/omni.ja chrome/browser/content/browser/ZenUIManager.mjs:494-741.
// Whole entry SHA-256: 3ce07ab0e6c76d39ca6c190670b11badbdbda6aa5a385f6577b6dd08d2cd3cc4.
// Only the enclosing factory supplies browser/platform globals for the test.
export function createNativeNewTabManager({
  window, document, gBrowser, gURLBar, gZenVerticalTabsManager,
  setTimeout, clearTimeout, CustomEvent, console,
}) {
  return {
    newtabButtons: [],
    urlbarWaitToClear: 10000,
  _lastTab: null,

  _urlbarSessionCounter: 0,
  _urlbarOwner: null,

  _isOwner(closeSeq) {
    return this._urlbarOwner === closeSeq;
  },

  // Check if browser elements are in a valid state for tab operations
  _validateBrowserState() {
    // Check if browser window is still open
    if (window.closed) {
      return false;
    }

    // Check if gBrowser is available
    if (!gBrowser || !gBrowser.tabContainer) {
      return false;
    }

    // Check if URL bar is available
    if (!gURLBar) {
      return false;
    }

    return true;
  },

  handleNewTab(
    werePassedURL,
    searchClipboard,
    where,
    overridePreferance = false,
    closeToken = {}
  ) {
    // Keep this here. It's better to make sure every
    // call has a different token rather then forgetting
    // to increment it in one of the early returns.
    const closeSeq = ++this._urlbarSessionCounter;
    closeToken.id = closeSeq;

    // Validate browser state first
    if (!this._validateBrowserState()) {
      console.warn("Browser state invalid for new tab operation");
      return false;
    }

    if (this.testingEnabled && !overridePreferance) {
      return false;
    }

    if (document.documentElement.hasAttribute("zen-welcome-stage")) {
      return false;
    }

    const shouldOpenURLBar =
      overridePreferance ||
      (gZenVerticalTabsManager._canReplaceNewTab &&
        !werePassedURL &&
        !searchClipboard &&
        where === "tab");

    if (!shouldOpenURLBar) {
      return false;
    }

    // Close the new tab popup on cmd/ctrl + t
    if (!overridePreferance && gURLBar.hasAttribute("zen-newtab")) {
      // The _zenHandleUrlbarClose holds a token in it's closure.
      // Call that instead.
      if (gURLBar._zenHandleUrlbarClose) {
        gURLBar._zenHandleUrlbarClose();
      } else {
        this.handleUrlbarClose(closeSeq);
      }
      return true;
    }

    // Clear any existing timeout
    if (this._clearTimeout) {
      clearTimeout(this._clearTimeout);
      this._clearTimeout = null;
    }

    // Store the current tab
    this._lastTab = gBrowser.selectedTab;
    if (!this._lastTab) {
      console.warn("No selected tab found when creating new tab");
      return false;
    }

    // Set visual state with proper validation
    if (this._lastTab && !this._lastTab.closing) {
      this._lastTab._visuallySelected = false;
    }

    // Store URL bar state
    this._prevUrlbarLabel = gURLBar._untrimmedValue || "";

    // Set up URL bar for new tab
    gURLBar._zenHandleUrlbarClose = (onSwitch, onElementPicked) =>
      this.handleUrlbarClose(closeSeq, onSwitch, onElementPicked);
    this._urlbarOwner = closeSeq;
    gURLBar.setAttribute("zen-newtab", true);

    // Update newtab buttons
    for (const button of this.newtabButtons) {
      button.setAttribute("in-urlbar", true);
    }

    // Open location command
    try {
      gURLBar.search(this._lastSearch || "");
      document.getElementById("Browser:OpenLocation").doCommand();
    } catch (e) {
      console.error("Error opening location in new tab:", e);
      this.handleUrlbarClose(closeSeq, false, false);
      return false;
    }
    return true;
  },

  /**
   * Check whether the closeToken given by handleNewTab
   * corresponds to a close event.
   *
   * @param {object} closeToken - Token previously passed to handleNewTab.
   * @param {CustomEvent} event - A ZenURLBarClosed event.
   * @returns {boolean}
   */
  matchesCloseToken(closeToken, event) {
    return (
      typeof closeToken?.id === "number" &&
      event?.detail?.closeSeq === closeToken.id
    );
  },

  clearUrlbarData() {
    this._prevUrlbarLabel = null;
    this._lastSearch = "";
  },

  handleUrlbarClose(closeSeq, onSwitch = false, onElementPicked = false) {
    // Validate browser state first
    if (!this._validateBrowserState()) {
      console.warn("Browser state invalid for URL bar close operation");
      return;
    }

    // Reset URL bar state
    if (gURLBar._zenHandleUrlbarClose) {
      gURLBar._zenHandleUrlbarClose = null;
    }

    const isFocusedBefore = gURLBar.focused;
    setTimeout(() => {
      /* If someone else opened the url bar in the meantime don't be
       * stingy and leave it open for them.*/
      if (this._isOwner(closeSeq)) {
        // We use this attribute on Tabbrowser::addTab
        gURLBar.removeAttribute("zen-newtab");

        // Safely restore tab visual state with proper validation
        if (
          this._lastTab &&
          !this._lastTab.closing &&
          this._lastTab.documentGlobal &&
          !this._lastTab.documentGlobal.closed &&
          gBrowser.selectedTab === this._lastTab
        ) {
          this._lastTab._visuallySelected = true;
          this._lastTab = null;
        }

        // Reset newtab buttons
        for (const button of this.newtabButtons) {
          button.removeAttribute("in-urlbar");
        }

        // Handle search data
        if (onSwitch) {
          this.clearUrlbarData();
        } else {
          this._lastSearch = gURLBar._untrimmedValue || "";

          if (this._clearTimeout) {
            clearTimeout(this._clearTimeout);
          }

          this._clearTimeout = setTimeout(() => {
            this.clearUrlbarData();
          }, this.urlbarWaitToClear);
        }

        // Safely restore URL bar state with proper validation
        if (this._prevUrlbarLabel) {
          gURLBar.setURI({
            uri: this._prevUrlbarLabel,
            dueToTabSwitch: onSwitch,
            isSameDocument: !onSwitch,
          });
        }

        gURLBar.handleRevert();
      }

      if (isFocusedBefore) {
        setTimeout(() => {
          window.dispatchEvent(
            new CustomEvent("ZenURLBarClosed", {
              detail: { onSwitch, onElementPicked, closeSeq },
            })
          );

          if (!this._isOwner(closeSeq)) {
            return;
          }
          this._urlbarOwner = null;

          gURLBar.view.close({ elementPicked: onElementPicked });
          gURLBar.updateTextOverflow();

          if (onElementPicked && onSwitch) {
            gURLBar.setURI({ dueToTabSwitch: onSwitch });
          }

          // Ensure tab and browser are valid before updating state
          const selectedTab = gBrowser.selectedTab;
          if (
            selectedTab &&
            selectedTab.linkedBrowser &&
            !selectedTab.closing &&
            onSwitch
          ) {
            const browserState = gURLBar.getBrowserState(
              selectedTab.linkedBrowser
            );
            if (browserState) {
              browserState.urlbarFocused = false;
            }
          }
        }, 0);
      } else if (this._isOwner(closeSeq)) {
        this._urlbarOwner = null;
      }
    }, 0);
  },
  };
}

