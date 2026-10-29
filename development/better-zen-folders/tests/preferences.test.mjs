import test from "node:test";
import assert from "node:assert/strict";

import {
  BetterZenFoldersPreferences,
  FolderNameSizePreferenceProjection,
  PREFERENCE_BRANCH,
  PREFERENCE_DEFINITIONS,
  createBrowserPreferenceAdapters,
  parseNumericSetting,
} from "../scripts/better-zen-folders.uc.mjs";
import { makePreferenceFixture } from "./fakes.mjs";

const PROPERTY = Object.freeze({
  folderUrlPinsEnabled: "better-zen-folders.folder-url-pins-enabled",
  showRootPinBadge: "better-zen-folders.show-root-pin-badge",
  showEmptyFolderActiveIndicator: "better-zen-folders.show-empty-folder-active-indicator",
  pinNewFolderTabUrls: "better-zen-folders.pin-new-folder-tab-urls",
  urlUnpinGraceSeconds: "better-zen-folders.url-unpin-grace-seconds",
  stickyTabsEnabled: "better-zen-folders.sticky-tabs-enabled",
  stickyFoldersEnabled: "better-zen-folders.sticky-folders-enabled",
  stickyMarker: "better-zen-folders.sticky-marker",
  stickyRemovalDelaySeconds: "better-zen-folders.sticky-removal-delay-seconds",
  previewSubfolders: "better-zen-folders.preview-subfolders",
  subfolderCollapsePolicy: "better-zen-folders.subfolder-collapse-policy",
  folderStateChevron: "better-zen-folders.folder-state-chevron",
  showFolderUnloadButton: "better-zen-folders.show-folder-unload-button",
  dragDiagnosticsEnabled: "better-zen-folders.drag-diagnostics-enabled",
  dragRecollapseDelayMs: "better-zen-folders.drag-recollapse-delay-ms",
  newTabButtonVisibility: "better-zen-folders.new-tab-button-visibility",
  newTabPosition: "better-zen-folders.new-tab-position",
  movedTabPosition: "better-zen-folders.moved-tab-position",
  movedFolderPosition: "better-zen-folders.moved-folder-position",
  subfolderPosition: "better-zen-folders.subfolder-position",
  dragHoverDelayMs: "better-zen-folders.drag-hover-delay-ms",
  dragDestinationDelayMs: "better-zen-folders.drag-destination-delay-ms",
  colourCodeDragDestinations: "better-zen-folders.colour-code-drag-destinations",
  middleClickDelete: "better-zen-folders.middle-click-delete",
  deleteEmptyRegularFolders: "better-zen-folders.delete-empty-regular-folders",
  decorateMoveToFolderMenu: "better-zen-folders.decorate-move-to-folder-menu",
  showFolderColourMenuIcon: "better-zen-folders.show-folder-colour-menu-icon",
  commandIconMode: "better-zen-folders.command-icon-mode",
  doubleClickRename: "better-zen-folders.double-click-rename",
  renameEscapeAction: "better-zen-folders.rename-escape-action",
  folderTitleClickDelayMs: "better-zen-folders.folder-title-click-delay-ms",
  showHierarchyGuides: "better-zen-folders.show-hierarchy-guides",
  folderNameSize: "better-zen-folders.folder-name-size",
  menuIconSizePercent: "better-zen-folders.menu-icon-size-percent",
  customPaletteEnabled: "better-zen-folders.custom-palette-enabled",
  useSpaceColour: "better-zen-folders.use-space-colour",
  ...Object.fromEntries(Array.from({length:8},(_,i)=>[`palette${i+1}`,`better-zen-folders.palette-${i+1}`])),
});

test('folder URL defaults and grace are independent of Sticky and preserve fractional delays',()=>{
 const f=makePreferenceFixture(),{preferences:p}=startPreferences(f);
 assert.equal(p.get('folderUrlPinsEnabled'),true);assert.equal(p.get('pinNewFolderTabUrls'),false);
 assert.equal(p.get('urlUnpinGraceSeconds'),'0');assert.equal(p.get('stickyRemovalDelaySeconds'),'0.5');
 for(const value of ['0.125','0','2']){f.set(PROPERTY.urlUnpinGraceSeconds,value);f.notify(PROPERTY.urlUnpinGraceSeconds);assert.equal(p.get('urlUnpinGraceSeconds'),value);}
 for(const value of ['-1','2147483.648','bad']){f.set(PROPERTY.urlUnpinGraceSeconds,value);f.notify(PROPERTY.urlUnpinGraceSeconds);assert.equal(p.get('urlUnpinGraceSeconds'),'2');}
 p.destroy();
});

test("numeric fields accept ordinary decimal notation but reject units, non-finite and fractional timers", () => {
  assert.equal(parseNumericSetting("folderNameSize", ".5"), 0.5);
  assert.equal(parseNumericSetting("menuIconSizePercent", "1.2e2"), 120);
  assert.equal(parseNumericSetting("dragHoverDelayMs", "1e3"), 1000);
  for (const value of ["", "0x10", "14px", "NaN", "Infinity", "1e999"])
    assert.equal(parseNumericSetting("folderNameSize", value), null);
  assert.equal(parseNumericSetting("folderTitleClickDelayMs", "0.5"), null);
});

test('Sticky removal seconds retain fractional input and reject timer overflow', () => {
  const fixture=makePreferenceFixture();
  const prefs=new BetterZenFoldersPreferences(createBrowserPreferenceAdapters(fixture.host));prefs.start();
  assert.equal(prefs.get('stickyRemovalDelaySeconds'),'0.5');
  for(const value of ['0','0.125','2']) {
    fixture.set(PROPERTY.stickyRemovalDelaySeconds,value);fixture.notify(PROPERTY.stickyRemovalDelaySeconds);
    assert.equal(prefs.get('stickyRemovalDelaySeconds'),value);
  }
  for(const value of ['-1','2147483.648','Infinity','0.5 seconds','']) {
    fixture.set(PROPERTY.stickyRemovalDelaySeconds,value);fixture.notify(PROPERTY.stickyRemovalDelaySeconds);
    assert.equal(prefs.get('stickyRemovalDelaySeconds'),'2');
  }
  prefs.destroy();
});

function startPreferences(fixture, controller = new AbortController()) {
  const preferences = new BetterZenFoldersPreferences(createBrowserPreferenceAdapters(fixture.host));
  preferences.start(controller.signal);
  return { preferences, controller };
}

for (const saved of [undefined, true, false]) {
  test(`empty-icon dots default off and preserve a saved ${String(saved)} choice`, () => {
    const fixture = makePreferenceFixture();
    if (saved !== undefined) fixture.set(PROPERTY.showEmptyFolderActiveIndicator, saved);
    const { preferences } = startPreferences(fixture);
    assert.equal(preferences.get("showEmptyFolderActiveIndicator"), saved ?? false);
    assert.equal(fixture.get(PROPERTY.showEmptyFolderActiveIndicator), saved, "startup must not replace a saved choice");
    for (const enabled of [true, false]) {
      fixture.set(PROPERTY.showEmptyFolderActiveIndicator, enabled);
      fixture.notify(PROPERTY.showEmptyFolderActiveIndicator);
      assert.equal(preferences.get("showEmptyFolderActiveIndicator"), enabled);
    }
    preferences.destroy();
  });
}

test("documented defaults are available through the typed preference service", () => {
  const fixture = makePreferenceFixture();
  const { preferences } = startPreferences(fixture);

  assert.equal(PREFERENCE_BRANCH, "better-zen-folders.");
  assert.deepEqual(Object.keys(PREFERENCE_DEFINITIONS), Object.keys(PROPERTY));
  assert.equal(Object.isFrozen(PREFERENCE_DEFINITIONS), true);
  assert.equal(preferences.get("stickyTabsEnabled"), true);
  assert.equal(preferences.get("stickyFoldersEnabled"), true);
  assert.equal(preferences.get("newTabButtonVisibility"), "hover");
  assert.equal(preferences.get("newTabPosition"), "bottom");
  assert.equal(preferences.get("subfolderPosition"), "bottom");
  assert.equal(preferences.get("dragHoverDelayMs"), 500);
  assert.equal(preferences.get("dragDestinationDelayMs"), 300);
  assert.equal(preferences.get("dragRecollapseDelayMs"), 500);
  assert.equal(preferences.get("subfolderCollapsePolicy"), "hide");
  assert.equal(preferences.get("folderStateChevron"), "outline-free");
  assert.equal(preferences.get("showFolderUnloadButton"), false);
  assert.equal(preferences.get("dragDiagnosticsEnabled"), false);
  assert.equal(preferences.get("middleClickDelete"), true);
  assert.equal(preferences.get("deleteEmptyRegularFolders"), true);
  assert.equal(preferences.get("decorateMoveToFolderMenu"), true);
  assert.equal(preferences.get("showFolderColourMenuIcon"), true);
  assert.equal(preferences.get("doubleClickRename"), true);
  assert.equal(preferences.get("renameEscapeAction"), "save");
  assert.equal(preferences.get("folderTitleClickDelayMs"), 300);
  assert.equal(preferences.get("showHierarchyGuides"), true);
  assert.equal(preferences.get("folderNameSize"), "14");
});

test("valid stored preference values survive startup", () => {
  const fixture = makePreferenceFixture();
  fixture.set(PROPERTY.newTabButtonVisibility, "always");
  fixture.set(PROPERTY.newTabPosition, "top");
  fixture.set(PROPERTY.subfolderPosition, "top");
  fixture.set(PROPERTY.dragHoverDelayMs, 750);
  fixture.set(PROPERTY.middleClickDelete, false);
  fixture.set(PROPERTY.deleteEmptyRegularFolders, false);
  fixture.set(PROPERTY.decorateMoveToFolderMenu, false);
  fixture.set(PROPERTY.showFolderColourMenuIcon, false);
  fixture.set(PROPERTY.doubleClickRename, false);
  fixture.set(PROPERTY.renameEscapeAction, "cancel");
  fixture.set(PROPERTY.showHierarchyGuides, false);
  fixture.set(PROPERTY.folderNameSize, "15.5");

  const { preferences } = startPreferences(fixture);

  assert.equal(preferences.get("newTabButtonVisibility"), "always");
  assert.equal(preferences.get("newTabPosition"), "top");
  assert.equal(preferences.get("subfolderPosition"), "top");
  assert.equal(preferences.get("dragHoverDelayMs"), 750);
  assert.equal(preferences.get("middleClickDelete"), false);
  assert.equal(preferences.get("deleteEmptyRegularFolders"), false);
  assert.equal(preferences.get("decorateMoveToFolderMenu"), false);
  assert.equal(preferences.get("showFolderColourMenuIcon"), false);
  assert.equal(preferences.get("doubleClickRename"), false);
  assert.equal(preferences.get("renameEscapeAction"), "cancel");
  assert.equal(preferences.get("showHierarchyGuides"), false);
  assert.equal(preferences.get("folderNameSize"), "15.5");
  assert.deepEqual(fixture.writes, [{property: PROPERTY.commandIconMode, value: "off", type: fixture.types.string}]);
  assert.deepEqual(fixture.clears, []);
  assert.deepEqual(fixture.warnings, []);
});

test("destination delay is independently configurable and rejects invalid edits without losing its last value", () => {
  const fixture = makePreferenceFixture();
  fixture.set(PROPERTY.dragDestinationDelayMs, 1273);
  const { preferences } = startPreferences(fixture);
  assert.equal(preferences.get("dragDestinationDelayMs"), 1273);
  assert.equal(preferences.get("dragHoverDelayMs"), 500);
  for (const invalid of [-1, 0.5, Infinity, 2147483648]) {
    fixture.set(PROPERTY.dragDestinationDelayMs, invalid);
    fixture.notify(PROPERTY.dragDestinationDelayMs);
    assert.equal(preferences.get("dragDestinationDelayMs"), 1273);
    assert.equal(fixture.get(PROPERTY.dragDestinationDelayMs), 1273);
  }
  fixture.set(PROPERTY.dragDestinationDelayMs, 0);
  fixture.notify(PROPERTY.dragDestinationDelayMs);
  assert.equal(preferences.get("dragDestinationDelayMs"), 0);
  assert.equal(preferences.get("dragHoverDelayMs"), 500);
  assert.equal(parseNumericSetting("dragDestinationDelayMs", "2147483647"), 2147483647);
  preferences.destroy();
});

test("wrongly typed values reset to the documented default and warn once", () => {
  const fixture = makePreferenceFixture();
  fixture.setRaw(PROPERTY.newTabButtonVisibility, fixture.types.int, 500);
  const { preferences } = startPreferences(fixture);

  assert.equal(preferences.get("newTabButtonVisibility"), "hover");
  assert.equal(fixture.get(PROPERTY.newTabButtonVisibility), "hover");
  assert.deepEqual(fixture.clears, [PROPERTY.newTabButtonVisibility]);
  assert.equal(fixture.warnings.length, 1);
  assert.match(fixture.warnings[0], /new-tab-button-visibility/);

  fixture.setRaw(PROPERTY.newTabButtonVisibility, fixture.types.bool, false);
  fixture.notify(PROPERTY.newTabButtonVisibility);
  assert.equal(preferences.get("newTabButtonVisibility"), "hover");
  assert.equal(fixture.warnings.length, 1);
});

test("unsupported enum values reset to the documented default and warn once", () => {
  const fixture = makePreferenceFixture();
  fixture.set(PROPERTY.newTabPosition, "middle");
  const { preferences } = startPreferences(fixture);

  assert.equal(preferences.get("newTabPosition"), "bottom");
  assert.equal(fixture.get(PROPERTY.newTabPosition), "bottom");
  assert.deepEqual(fixture.clears, [PROPERTY.newTabPosition]);
  assert.equal(fixture.warnings.length, 1);
  assert.match(fixture.warnings[0], /new-tab-position/);

  fixture.set(PROPERTY.newTabPosition, "sideways");
  fixture.notify(PROPERTY.newTabPosition);
  assert.equal(preferences.get("newTabPosition"), "bottom");
  assert.equal(fixture.warnings.length, 1);
});

test("branch notifications update the cache before notifying that property's subscribers", () => {
  const fixture = makePreferenceFixture();
  const { preferences } = startPreferences(fixture);
  const observed = [];
  preferences.subscribe("newTabButtonVisibility", value => {
    observed.push([value, preferences.get("newTabButtonVisibility")]);
  });

  fixture.set(PROPERTY.newTabButtonVisibility, "always");
  fixture.notify(PROPERTY.newTabButtonVisibility);

  assert.deepEqual(observed, [["always", "always"]]);
});

test("changing one preference does not notify unrelated subscribers", () => {
  const fixture = makePreferenceFixture();
  const { preferences } = startPreferences(fixture);
  let visibilityChanges = 0;
  let positionChanges = 0;
  preferences.subscribe("newTabButtonVisibility", () => visibilityChanges++);
  preferences.subscribe("newTabPosition", () => positionChanges++);

  fixture.set(PROPERTY.newTabButtonVisibility, "hidden");
  fixture.notify(PROPERTY.newTabButtonVisibility);

  assert.equal(visibilityChanges, 1);
  assert.equal(positionChanges, 0);
});

test("destroy removes the branch observer and clears subscribers idempotently", () => {
  const fixture = makePreferenceFixture();
  const { preferences } = startPreferences(fixture);
  let changes = 0;
  preferences.subscribe("newTabButtonVisibility", () => changes++);

  assert.equal(fixture.observerCount(), 1);
  preferences.destroy();
  preferences.destroy();
  fixture.set(PROPERTY.newTabButtonVisibility, "always");
  fixture.notify(PROPERTY.newTabButtonVisibility);

  assert.equal(fixture.observerCount(), 0);
  assert.equal(changes, 0);
  assert.equal(preferences.get("newTabButtonVisibility"), "hover");
});

test("an aborted signal prevents startup and abort after startup owns teardown", () => {
  const beforeStart = makePreferenceFixture();
  const aborted = new AbortController();
  aborted.abort();
  const blocked = new BetterZenFoldersPreferences(createBrowserPreferenceAdapters(beforeStart.host));
  blocked.start(aborted.signal);

  assert.equal(beforeStart.observerCount(), 0);

  const fixture = makePreferenceFixture();
  const { preferences, controller } = startPreferences(fixture);
  assert.equal(fixture.observerCount(), 1);
  controller.abort();
  controller.abort();

  assert.equal(fixture.observerCount(), 0);
  assert.equal(preferences.get("dragHoverDelayMs"), 500);
});

test("free-entry timing and decimal sizes survive normalization and invalid edits preserve last valid values", () => {
  const fixture = makePreferenceFixture();
  fixture.set(PROPERTY.dragHoverDelayMs, 1273);
  fixture.set(PROPERTY.folderTitleClickDelayMs, 347);
  fixture.set(PROPERTY.folderNameSize, "14.5");
  fixture.set("better-zen-folders.menu-icon-size-percent", "123.5");
  const { preferences } = startPreferences(fixture);
  assert.equal(preferences.get("dragHoverDelayMs"), 1273);
  assert.equal(preferences.get("folderTitleClickDelayMs"), 347);
  assert.equal(preferences.get("folderNameSize"), "14.5");
  assert.equal(preferences.get("menuIconSizePercent"), "123.5");
  for (const invalid of [-1, 1.5, Infinity, 2147483648]) {
    fixture.set(PROPERTY.dragHoverDelayMs, invalid);
    fixture.notify(PROPERTY.dragHoverDelayMs);
    assert.equal(preferences.get("dragHoverDelayMs"), 1273);
    assert.equal(fixture.get(PROPERTY.dragHoverDelayMs), 1273);
  }
  for (const invalid of ["", "0", "-5", "Infinity", "14px"]) {
    fixture.set(PROPERTY.folderNameSize, invalid);
    fixture.notify(PROPERTY.folderNameSize);
    assert.equal(preferences.get("folderNameSize"), "14.5");
  }
  fixture.set(PROPERTY.dragHoverDelayMs, 0);
  fixture.notify(PROPERTY.dragHoverDelayMs);
  assert.equal(preferences.get("dragHoverDelayMs"), 0);
});

test("folder name size projection follows preferences and owns only its root attribute", () => {
  const attributes = new Map([["unrelated", "preserved"]]);
  const styles = new Map([["--better-zen-folders-folder-font-size", "17px"]]);
  let subscriber = null;
  let unsubscribed = 0;
  const root = {
    style: {
      setProperty: (name, value) => styles.set(name, value),
      getPropertyValue: name => styles.get(name) ?? "",
      getPropertyPriority: () => "",
      removeProperty: name => styles.delete(name),
    },
    setAttribute(name, value) { attributes.set(name, String(value)); },
    getAttribute(name) { return attributes.get(name) ?? null; },
    removeAttribute(name) { attributes.delete(name); },
  };
  const projection = new FolderNameSizePreferenceProjection({
    root: () => root,
    preferences: {
      get: name => name === "folderNameSize" ? "14" : null,
      subscribe(name, callback) {
        assert.equal(name, "folderNameSize");
        subscriber = callback;
        return () => { unsubscribed++; };
      },
    },
  });

  projection.start(new AbortController().signal);
  assert.equal(attributes.get("better-zen-folders-folder-name-size"), "14");
  assert.equal(styles.get("--better-zen-folders-folder-font-size"), "14px");
  subscriber("15.5");
  assert.equal(attributes.get("better-zen-folders-folder-name-size"), "15.5");
  assert.equal(styles.get("--better-zen-folders-folder-font-size"), "15.5px");

  projection.destroy();
  projection.destroy();
  assert.equal(attributes.has("better-zen-folders-folder-name-size"), false);
  assert.equal(attributes.get("unrelated"), "preserved");
  assert.equal(unsubscribed, 1);
  assert.equal(styles.get("--better-zen-folders-folder-font-size"), "17px");
});

test("legacy title presets migrate once and disabled command icons remain disabled", () => {
  for (const [before, after] of [["default","13"],["slightly-larger","14"],["larger","15"],["extra-large","16"]]) {
    const fixture=makePreferenceFixture();
    fixture.set(PROPERTY.folderNameSize,before);
    fixture.set(PROPERTY.showFolderColourMenuIcon,false);
    const {preferences}=startPreferences(fixture);
    assert.equal(preferences.get("folderNameSize"),after);
    assert.equal(fixture.get(PROPERTY.folderNameSize),after);
    assert.equal(preferences.get("showFolderColourMenuIcon"),false);
    assert.deepEqual(fixture.warnings,[]);
  }
});
