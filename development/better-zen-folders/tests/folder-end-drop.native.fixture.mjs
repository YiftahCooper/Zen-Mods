import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { DropNode } from './folder-end-drop.fixture.mjs';

// Unmodified method bodies from the identified installed archives. The JSON
// carries MPL provenance, whole-entry hashes, and source line bounds. UI/telemetry
// dependencies are stubs; native acceptance, drop, pin routing, and before/after
// receiver decisions run verbatim. No installed browser or profile is involved.
export function installNativeDropReplay(f) {
  const source = JSON.parse(readFileSync(new URL('./fixtures/zen-1.22.2b-folder-drop.json', import.meta.url), 'utf8'));
  const { host, tabContainer, pins, normal, separator } = f;
  const log = [];
  const context = vm.createContext({ window: host, console, gReduceMotion: true,
    TAB_DROP_TYPE: 'application/x-moz-tabbrowser-tab',
    isTab: node => node?.localName === 'tab',
    isTabGroupLabel: node => node?.localName === 'label',
    isSplitViewWrapper: () => false,
    PrivateBrowsingUtils: { isWindowPrivate: () => false },
    Services: { droppedLinkHandler: { canDropLink: () => false } },
    gZenWorkspaces: host.gZenWorkspaces,
  });
  host.isChromeWindow = true;
  host.windowUtils = { getBoundsWithoutFlushing: node => node.getBoundingClientRect() };
  host.document.documentElement.setAttribute('windowtype', 'navigator:browser');
  host.gZenWorkspaces.getCurrentEssentialsContainer = () => ({});
  host.gZenGlanceManager = { getTabOrGlanceParent: node => node };
  host.gZenFolders = { canDropElement: () => true };
  vm.runInContext(`
    globalThis.Receiver = class {
      #handleTabMove(element, callback) { callback(); }
      recordTabMetrics() {}
      ${source.receiver}
    };
    globalThis.NativeDrop = class {
      #dropAnimationEndTime = 0;
      ${source.accepts}
      ${source.drop}
    };
    globalThis.NativePins = { ${source.pins} };
  `, context);
  const browser = Object.assign(new context.Receiver(), host.gBrowser, {
    documentGlobal: host, isTabGroupLabel: context.isTabGroupLabel,
    isTabGroup: node => node?.isZenFolder,
    TabMetrics: { METRIC_ACTION: { MOVE: 'move' }, METRIC_SOURCE: { DRAG_AND_DROP: 'drag' },
      decomposedContext: value => value, userTriggeredContext: value => value },
    _numZenEssentials: 0,
    pinTab(tab) { log.push('pin'); tab.setAttribute('pinned', 'true'); pins.insertBefore(tab, separator); },
    unpinTab(tab) { log.push('unpin'); tab.removeAttribute('pinned'); normal.appendChild(tab); },
  });
  Object.defineProperties(browser, {
    tabs: { get: () => [...pins.tabs, ...normal.tabs] },
    tabsWithoutGlance: { get: () => browser.tabs },
    visibleTabs: { get: () => browser.tabs },
    pinnedTabCount: { get: () => pins.tabs.length },
    _numVisiblePinTabsWithoutCollapsed: { get: () => pins.tabs.length + 2 },
  });
  Object.assign(tabContainer, { pinnedTabsContainer: pins, verticalMode: true,
    isContainerVerticalPinnedGrid: () => false, _notifyBackgroundTab() { log.push('notify'); } });
  Object.defineProperty(tabContainer, 'dragAndDropElements', {
    get: () => [f.parent.labelElement, f.child.labelElement, ...pins.tabs, ...normal.tabs],
  });
  host.gBrowser = context.gBrowser = browser;
  Object.assign(host.gZenPinnedTabManager, context.NativePins, { expandedSidebarMode: true,
    removeTabContainersDragoverClass() {} });
  context.gZenPinnedTabManager = host.gZenPinnedTabManager;
  const drop = Object.assign(new context.NativeDrop(), {
    _rtlMode: false, _tabbrowserTabs: tabContainer,
    _pinnedDropIndicator: new DropNode(), _tabDropIndicator: new DropNode(), _getDropIndex: () => 0,
    _resetTabsAfterDrop() {}, finishAnimateTabMove() {}, finishMoveTogetherSelectedTabs() {},
    handle_drop_transition() { log.push('transition'); },
    _clearDragOverSplit() { log.push('clear-split'); },
  });
  tabContainer.tabDragAndDrop = drop;
  for (const tab of browser.tabs) {
    tab.container = tabContainer; tab.setAttribute('zen-workspace-id', 'active');
  }
  tabContainer.addEventListener('dragstart', () => Object.assign(f.source._dragData,
    { translateX: 0, translateY: 0, tabWidth: 180, tabHeight: 30 }));
  f.setNativeDrop(event => { log.push('native-drop'); drop.handle_drop(event); });
  return { log, source };
}
