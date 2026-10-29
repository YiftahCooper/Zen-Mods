# Architecture and behavior contracts

The runtime is an ES module loaded by Sine in browser and settings windows. It
exports logic classes and browser-adapter factories for tests, and bootstraps the
appropriate controller in supported windows. `supportsUnload` is part of the Sine
manifest. Instance-owned wrappers, abortable listeners and reversible projections
must release ownership without overwriting another mod's subsequent changes.

## Main areas of the runtime

| Area | Main entry points | Responsibility |
| --- | --- | --- |
| Composition | `BetterZenFoldersController`, `bootstrapBrowserWindow`, `bootstrapSettingsWindow` | Start, reconcile and retire managers; project settings into UI. |
| Visibility and Sticky | `StickyStateStore`, `StickyBranchExposure`, `StickyFolderVisibilityManager`, `StickyProjectionMotion` | Project visible paths through collapsed folders and animate only rows whose visibility changes. |
| Creation and related opens | `NewTabInFolderTransaction`, `RelatedFolderTabsManager`, `FolderPopulationRegistry` | Own one new-tab dialogue; insert into the immediate folder before first paint; retain source-folder placement for new links and expanded Glance. |
| Dragging | `CollapsedFolderDragGuard`, `FolderEndDropManager`, `FolderHeaderDropPlacementManager` | Protect pressed source nodes, expose eligible ancestor destinations, retain native ordering for explicit drops. |
| Restore | `RestoreMetadataSynchronizer`, `FolderRestoreManager`, `NativeRestoreArtifactReconciler` | Record paths and presentation; restore native membership and identity carefully; roll back partial recovery. |
| Folder URL pins | `FolderPinIntentStore`, `FolderPinLifecycle`, `FolderPinOriginHooks`, `FolderPinRecovery`, `FolderPinPolicy`, `FolderPinRuntime`, `FolderPinPresentation` | Persist explicit URL-pin intent separately from native folder membership. |
| Folder UI | `FolderButtonManager`, `FolderDoubleClickRenameManager`, `FolderPreviewHierarchyManager`, `FolderPreviewAnchorManager`, `FolderUnloadManager` | Folder controls, rename lifecycle, searchable grouped preview, pure unload. |
| Menus and paint | `FolderColorManager`, `FolderColorMenuManager`, `MoveToFolderMenuDecorator`, `FolderIconIntegrityManager`, `MovedTabsMenuManager`, `SpaceMoveMenuManager`, `FolderMoveMenuManager` | Palette, local artwork, move destinations and command decoration. |
| Preferences | `PREFERENCE_DEFINITIONS`, `BetterZenFoldersPreferences`, numeric/palette settings installers | Validate defaults/types, react to changes, adapt only this mod's settings UI. |

## Decisions that should survive future refactors

- A folder and its descendants form a native hierarchy. This mod ships ordinary
  folders in Zen's native pinned area; it does not ship the separate upper/lower
  tab-zone redesign proposed for Better Pins.
- Native `tab.pinned` also means section membership. It does not by itself prove
  that a folder tab has an explicitly saved URL. Newly created folder tabs are
  ordinary URLs by default; their pin default is configurable. Moving a tab into
  a folder preserves its URL-pin choice. An unpinned URL must remain navigable.
- URL-unpin grace defaults to zero seconds. Sticky removal delay is a separate
  setting and must not be conflated with URL pinning or memory retention.
- Close, unload and reset are distinct operations. Optional folder-row unload is
  disabled by default; pure unload preserves folder structure, expansion, URLs,
  URL pins and Sticky intent. It must not inherit native reset-and-collapse side effects.
- Sticky does not move items between tab areas or promise to retain pages in RAM.
  It exposes selected descendants/paths through collapsed branches. Temporary branch
  exposure ends at the agreed branch or containing-parent collapse boundary.
- Sticky tabs and folders have separate enable switches. Coloured underlines are
  the current default. Folded-corner triangles remain selectable; do not discard
  their implementation. Context-menu artwork follows the selected marker.
- Preview headings group descendants in actual folder order, with title, icon and
  colour. Their expansion is transient and separate from real folder collapse.
  Preview Sticky/URL-pin markers indicate state; they are not extra toggle controls.
- New tabs from folder `+` and the folder menu use New Tab Position. Moved Tab and
  Moved Folder positions are separate; header drops can use those defaults, while
  between-item drops and explicit hierarchy choices retain their requested position.
- Related links and expanded Glance stay beside their source in its immediate
  folder. Unrelated/background events must not be swept into an armed folder request.
  Folder-plus creation supplies native `pinned`/`tabGroup` during `addTab`, with
  request/session validation around synchronous callbacks. Later confirmation must
  not group again. Real native errors propagate; preparation errors use transaction handling.
- Folder colours and custom artwork retain explicit paint. Monochrome controls
  export Gecko context fill/stroke from the local foreground. Do not globally
  invert or recolour icons, undo native focus effects, or silently rewrite saved colours.
- The settings and menu surfaces must remain usable without Zen Icons. Icons owns
  icon selection/catalogue/persistent custom artwork. Folders owns folder behavior,
  its menu controls, folder colours and preview/drag destination decoration.
- Do not modify Sine as an implementation prerequisite. Internal native identifiers
  and unrelated uses of pinning remain compatible; native commands cannot be renamed
  in a way that misrepresents what they actually do.
- The Sports scrolling issue is a separate external-mod investigation. A general
  shared-scrolling override is deliberately absent from Better Zen Folders.

## Persisted state and recovery

Important runtime constants include `STICKY_TAB_KEY`, `STICKY_FOLDER_KEY`,
`FOLDER_PIN_INTENT_KEY`, `RESTORE_KEY`, `FOLDER_COLOR_LEDGER_PREF` and
`FOLDER_COLOR_BINDINGS_PREF`. Read the validators and exact current schema before
changing these formats. Native SessionStore IDs can change on restore; do not
reuse a native ID as permanent user intent. Recovery transactions retain direct-item
order and presentation, and must not overwrite a later writer during rollback.

Folder URL-pin activation has its own consent/compatibility boundary. Preserve
explicit saved choices; changing a default must not reset an existing preference.
Do not copy a tested profile as a migration strategy or enable a global native
pin policy in an everyday browser based on disposable-profile evidence.
