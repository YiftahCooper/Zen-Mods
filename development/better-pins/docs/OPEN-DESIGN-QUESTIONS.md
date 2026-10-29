# Better Pins design choices during testing

This guide describes candidate 4. It records choices to evaluate, not approval to change them. Clear remains hidden.

## Three unresolved release policies

**Clear.** Bulk Close would reduce clutter but needs a definition of eligible tabs, zones and folders. Bulk Unload would free memory without shortening the list. Bulk Reset would change pages and serves a different purpose. Keeping separate explicit actions is also a valid outcome. Observe which repeated task actually needs a bulk operation before choosing its scope or destructive default.

**Adopting an existing profile.** Known BZF URL choices are preserved. Existing native root pins retain their reset destinations. Other ambiguous native folder tabs initialise as ordinary after acknowledgement. A simple acknowledgement is fast; a preview or per-tab review is clearer but could become tedious. Native structural pinning must not automatically become evidence of intentional saved URLs. The disposable launcher is not a demonstration of real-profile adoption.

**Disabling or removing the mod.** Clean disable returns affected lower folder trees to native upper placement, retains metadata and leaves automatic startup reset off. Native usability, exact later restoration and respecting edits made while the mod was absent can conflict. Restoration must not resurrect closed tabs or undo newer choices. Missing-code and downgrade tests cover bounded synthetic histories, not every possible removal or migration.

## Implemented choices to judge in use

| Choice | Current candidate | Consideration while testing |
| --- | --- | --- |
| Automatic saved URLs | Four independent switches for upper/lower tabs outside/inside folders; all default off. | Automatic saving is convenient for reusable destinations and intrusive for temporary browsing. Changes affect new tabs only. |
| Upper New Tab button | Optional; defaults on, above the divider. It can instead sit below the Space banner. | Which position is easiest to reach and least likely to be confused with the lower button? |
| New-tab insertion | Each zone independently adds at its beginning or end; defaults to end. | Beginning exposes new work; end preserves established positions. Button position is a separate setting. |
| Other creation routes | Zone insertion settings apply to the buttons and zone menu actions. | Links, bookmarks and shortcuts are not all overridden. Distinguish a desired extension from a failed existing action. |
| New Tab appearance | Optional reuse of saved plus-animation and roundness preferences, without a dependency. | This is limited integration. A full merger or special fork is a possible later expansion, not an agreed requirement. |
| Close and Unload | Close removes the entry. Unload retains the current URL and organisation. Optional folder-row Unload defaults off. | A visible folder button saves steps but adds another nearby control with a different consequence. |
| Saved-URL control | Unpin is immediate and preserves page and position. Reset is explicit. | Labels and icons should make the action predictable before clicking. |
| Folder-zone commands | A child tab's Zones command moves the whole outer containing tree. | Coherent trees are predictable, but invoking the command on a child may move more than expected. Distinguish whole-tree movement, nesting, extraction and subtree movement. |
| Creating folders | Preserve a single source tab's zone and position. Mixed selections follow the initiating tab when available, otherwise the first supplied tab. | Is the destination predictable without another dialog? |
| Layout | Independent scrolling and a remembered divider proportion. | Judge long lists, small windows and compact layouts. Shared scrolling was deliberately rejected. |
| Space banner | Collapse defaults on; it can be disabled. Disabling expands a collapsed upper zone. | Useful temporary space versus accidental collapse. |
| Menus | Zone actions in one submenu, only the opposite move destination, optional icons default on. | Compactness versus an extra step; explicit destination wording versus a shorter generic Switch Zones label. |
| Windows | Respect Zen's pinned-only versus all-tabs sync setting. | Pinned-only mode excludes loose lower roots. A uniform cross-window policy would be a separate future choice. |
| Scope | Private/unsynchronised windows, Essentials and live-provider folders retain native semantics. | Record the context before classifying a difference as a defect. |
| Settings language | Saved URLs, New Tab buttons, Layout and controls, Right-click menus; dependent controls hidden. | Distinguish saved URL from upper placement, insertion order from button placement, Close from Unload, and new-tab defaults from existing state. Prefer clearer wording to extra switches. |

## Agreed foundations and defect reports

Placement, saved URL and loaded/unloaded state are independent. Navigation stays ordinary. Moving an existing tab preserves its URL choice and baseline. Duplicates start ordinary and do not inherit Sticky. BZF Sticky remains a separate feature.

Unexpected navigation, lost state, wrong placement, broken controls and failed supported drops are defects. A confusing but consistent workflow can be design feedback. Physical drag acceptance still needs observation; passing Gecko event dispatch does not prove an OS mouse release completed the drop.

Useful notes need only four parts: **I was trying to... / I expected... / What happened... / My preference, if I have one...** No decision is required merely because it appears in this guide.
