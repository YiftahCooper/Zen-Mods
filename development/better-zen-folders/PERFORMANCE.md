# Runtime performance inventory

Scope: browser-window runtime (`better-zen-folders.uc.mjs`) as of **0.3.27**.
Method: static reading of every observer, listener, timer, frame loop and
SessionStore write, plus Node regressions in `tests/performance-observers.test.mjs`.
Costs below are reasoned. Reconcile counts were later measured natively in a disposable
Zen 1.24.1b profile with ~300 tabs (synthetic, headless; see CURRENT-STATUS.md); no
Firefox Profiler trace of an everyday session exists.
"T" is the number of tabs in the window (the reported session has about 296),
"F" the number of folders, "P" the projected rows (pins and folder contents of
the active Space).

## Why the tab strip is the hot path

Gecko replaces the text node inside `.tab-label` whenever a title changes, and
Fluent/sound/throbber labels do the same. A `subtree: true, childList: true`
observer on `gBrowser.tabContainer` therefore receives records continuously while
background tabs load or retitle themselves. Before 0.3.27 nine such observers ran
their full reconcile for every batch, and two also reacted to the `label`/`image`
attributes that change on every page load.

## Inventory

| Source | Trigger | Frequency | Work per trigger | Scales with | 0.3.27 |
| --- | --- | --- | --- | --- | --- |
| `StickyFolderVisibilityManager` observer (attrs: collapsed, selected, hidden, pinned, id, href …) | tab-strip childList + listed attributes | every title change before; now structure/selection only | full projection, attribute ledger, decorations, geometry reads, `ariaFocusableItems` rebuild | P, F | records filtered; coalesced by existing `setTimeout(0)` |
| Sticky window capture listeners (TabSelect, TabOpen, TabClose, TabMove, SSTabRestoring/Restored, group events, click/key/pointer/drag) | events | per tab event; keys and pointer for every input | toggle isolation (cheap); tab events schedule one projection pass | P | `keypress` no longer schedules a pass (it did for every keystroke, including keys typed into web pages) |
| Sticky `refresh()` geometry | each projection pass | per pass | underline centring read **per folder between writes** (one forced reflow per folder), then focusable rows and motion heights | F, P | all reads batched after writes: one flush per pass; unchanged centres and labels not rewritten |
| `StickyProjectionMotion` rAF loop | folder collapse/expand/selection animation | 180 ms per gesture | per-frame height writes on changed rows only | changed rows | unchanged |
| `FolderPinPresentation` observer + 9 capture events | tab-strip childList, id/pinned/essential, tab events | every title change before | O(T) classification; for each folder tab `refreshNativePresentation` (mirror lookup, custom value parse, and for URL pins `SessionStore.getTabState`) | T, folder tabs | text/owned records filtered; button labels written only when changed |
| `FolderPinRootIntegration` observer + capture listeners | tab-strip childList, pinned/essential | every title change before | O(T) when the root badge preference is on, else O(badges) | T | filtered |
| `RestoreMetadataSynchronizer` observer (attrs incl. `label`, `image`, `muted`) + 12 events | tab-strip childList/attributes, events | every page load and title change before | full pass: one custom value read per tab, a validated record build + JSON per folder tab | T | text/owned records ignored; label/image/muted/sublabel changes re-serialise only the changed tabs; a never-stored value is no longer "cleared"; a URL-pin intent change (`BetterZenFoldersUrlPinChanged`) re-serialises that tab, since its owned badge no longer triggers a pass |
| `FolderColorManager` observer (attr `id`) | tab-strip childList | every title change before | `querySelectorAll('zen-folder')`, attribute + two style writes per folder | F | filtered; unchanged projection performs no write |
| `FolderIconIntegrityManager` observer | tab-strip childList | every title change before | `querySelector` per folder | F | filtered |
| `FolderButtonManager` observer | tab-strip childList | every title change before | per-folder row queries, attribute write | F | filtered |
| `FolderUnloadManager` observer | tab-strip childList | every title change before | `querySelectorAll('zen-folder')`, ownership checks | F | filtered |
| `EmptyRegularFolderManager` observer | tab-strip childList | only while a close/ungroup candidate exists | candidate check | candidates | filtered |
| `FolderEndDropManager` watch (observer + window capture `scroll`/`resize`) | only during a tab drag | per drag frame | arms one deferred refresh | rows in drag chain | text records ignored; scroll/resize listeners passive |
| Drag listeners (`CollapsedFolderDragGuard`, `FolderEndDropManager`) | dragover etc. | per drag event while dragging | layout reads for trigger/chooser rows | chain length | unchanged (interaction-scoped) |
| `FolderPinNativeHooks` wrappers (`onLocationChange`, `pinHasChangedUrl`) | native top-level navigation | per navigation | classification; folder tabs re-derive pin presentation | 1 tab | unchanged |
| `waitForCreation` observer + tabs progress listener | one pinned-folder transaction | transient | id/location checks | 1 tab | unchanged |
| New-tab transaction `gURLBar` observer, `TabOpen` | one folder-plus dialogue | transient | session check | 1 | unchanged |
| Preview managers (`popupshowing`, `TabAttrModified`, `SSTabRestored`) | preview popup | only while the popup is open | regroup preview rows | folder size | unchanged |
| Menu managers (`popupshowing`/`command`) | context menus | per menu open | decoration, a few style reads | menu size | unchanged |
| Settings window document observers | about:preferences | only in Settings | settings UI refresh | settings DOM | unchanged |
| Colour diagnostics rAF / 2 s timer | opt-in diagnostics only | transient | one frame sample | 1 | unchanged |

### SessionStore writes

Every `setCustomTabValue`/`setCustomWindowValue` makes SessionStore schedule a
re-serialisation of the whole session. The only periodic writer is the restore
metadata synchronizer; it already compared the new record with the stored one and
writes nothing when unchanged. All other writers (`StickyStateStore.set`,
`FolderPinIntentStore.write`, duplicate cleanup, restore/rollback transactions,
close capture) run only for an explicit user action, a native close or a restore,
and already read before writing where a rollback depends on it.

## Remaining known costs (not changed)

- A Sticky pass still runs on each tab selection and tab open/close; it is O(P)
  with one layout flush.
- A `FolderPinPresentation` pass still calls `getTabState` for each explicitly
  URL-pinned folder tab on each structural change or tab event. Caching that
  derivation needs proof of every native writer of `zen-pinned-changed`, so it is
  left for a natively profiled change.
- Each structural batch still reaches every observer separately. A shared hub
  would save only the per-observer record allocation; the reconciles are distinct work.

## Native check required

A DOM surrogate cannot prove Gecko's record shapes or layout cost. See
CURRENT-STATUS.md for the checklist.
