> **Historical reference.** This is a sanitised snapshot of the original
> development record. Installation statements and local evidence paths describe
> the state at their recorded dates, not this checkout or a current user profile.
> Raw profiles, recordings and original release directories are not distributed.
> Start with [Current status](CURRENT-STATUS.md) and [Testing](TESTING.md).
> Use `npm test` / `npm run test:python` through the public assembly runner; do not
> run the old direct-project commands below against this directory.

# Better Zen Folders

Better Zen Folders is a local Sine mod for Zen Browser. It makes ordinary Zen
folders more compact, adds a folder New Tab control, preserves folder metadata
for native restore, supports per-folder colours, and provides optional folder
interactions and hierarchy styling.

## Install with Sine

The minimal public package is now available in
[Zen-Mods/better-zen-folders](https://github.com/YiftahCooper/Zen-Mods/tree/main/better-zen-folders).
Its short README explains installation and use. This checkout remains the
development source; profiles, diagnostics and development history are not part
of the public package. The shared test profile has the verified candidate;
the everyday profile has not been changed by this task.

Current source candidate **0.3.26** creates tabs from the folder `+` or
**New Tab in Folder** inside the target folder from the outset, applying Top/Bottom
placement before the first frame instead of briefly showing the regular area.
Cancellation, unrelated background opens and the native dialogue remain intact.
It retains **0.3.25**, which keeps live window.open creations, including
Sine's mod-homepage buttons in Settings, beside their actual source in its immediate
folder. Native window-opening flags remain intact, and real restores remain native.
New-folder-tab URL-pin defaults apply normally. It retains the **0.3.24** repair of external
monochrome icon paint on light
and dark themes, including the folder plus, destination and preview images, and
compatibility-mode menu icons. Floating drag choices use the popup's own foreground
colour. Chosen folder colours and custom artwork are not globally recoloured.
It retains **0.3.23**, which defaults **Show … on Folders Without an Icon**
to off, while preserving explicitly saved choices. It retains the **0.3.22**
repair which clears stale active-folder dots and animates
rows which disappear when selection leaves a collapsed folder. Appearance settings
can hide the dots on folders without a chosen icon. Related-tab and Glance behavior
from **0.3.21** is retained: related link tabs and expanded Glance
previews stay in their source tab's immediate folder, including nested folders. Native
related-tab ordering and foreground/background selection are preserved. The
folder's new-tab URL-pin default still applies; unrelated and restored tabs stay
native. The 0.3.20 accordion repair is retained. Publication and native verification
are recorded separately in [verification](verification-history.md).

The previous **0.3.19** repairs unloaded-tab drag initiation: restoring
a tab now leaves it attached when it is already in the correct position. Folder
menu icons use the settled appearance rather than freezing halfway through an
animation. The 0.3.18 internal drag-destination extension and optional colour
coding are retained. See [verification](verification-history.md) for the exact package,
closed-profile installation and remaining limits; testing is not alpha acceptance.

Folders assigned a preset swatch now follow edits to that swatch in settings.
Custom colours stay independent; applying a changed **Custom Colour** or **Reset
to Default** removes the preset link. An unchanged native-picker completion is
left alone because Windows can return the initial colour on Cancel. Existing colours are not guessed from their
hex values: reselect a preset once to link an older folder. Switching custom
presets off makes linked folders use the corresponding built-in swatches;
switching them back on restores the customised palette. Individual swatch Reset
also updates that swatch's followers. A running colour popup stays in sync with
external colour/slot changes, including Reset.

The original colour-storage format is unchanged. Older builds can read a linked
folder's last explicitly saved fallback colour, not necessarily its latest live
palette colour. A custom colour saved by an older build remains custom when
upgrading again. A concurrent save is reconciled, and failure compensation does
not overwrite a successful intervening writer.

The previous **0.3.17** repair fixed live seconds settings, individual Sticky Undo, duplicate URL-pin intent,
native modified/reset indicators, and a text-node gesture interception which
could cancel tab dragging. The URL commands now share a **Pinned URL** submenu;
the native root Unpin command receives matching menu artwork. An optional
**Show Pin Badge on Top-Level Pinned Tabs** setting is off by default and retains
native placement semantics: unpinning a root tab moves it to the regular area.
Previews show independent Sticky/URL-pin status and offer **Expand Child Folders
Only**. The settings dialog is narrower and default folder colours follow the
neutral/Space setting on Zen 1.23 as well as the older retained fixtures.
Those 0.3.17 changes were installed into the closed shared test profile on 2026-10-15,
with rollback copies and installed-file verification. The accompanying Icons
update changes only Settings-icon reset, retaining its previously installed code
elsewhere. Zen was not launched; everyday-profile installation is out of scope.
See the Round 6 repair and remaining issues (historical local reference; not distributed).

Predecessor **0.3.16** adds grouped collapsed-folder previews, with child
folder headings that expand within the popup only. Search reveals matching paths;
**Subfolders in Folder Previews** selects **Start Expanded**, **Start Collapsed**,
or **Hide Subfolders**. Native eligibility is retained: tabs already exposed by
the folder, hidden tabs and placeholders are not duplicated in the preview.
Headings are shown for branches containing eligible preview tabs.
Sticky menu artwork now follows the marker setting without replacing checkmarks.
The colour popup has extra clearance to keep its shadow off the anchor icon.
See the current alpha status (historical local reference; not distributed).

Unstaged source changes on 2026-09-28 repair preview eligibility for formerly
exposed tabs, remove the obsolete corner hit area in underline mode, and add a
cancellable **0.5-second** Sticky-removal delay. Only rows which become hidden
animate away; selected or otherwise exposed rows stay visible. The new default
folder colour option is separate from manually chosen colours. These changes
are not part of the installed 0.3.16 receipt and have no live-profile acceptance.
The explicit-pinning design (historical local reference; not distributed)
has an approved implementation plan. Its Sine-only startup rule resumes the last
saved page and keeps manual Reset for explicit URL pins; native automatic startup
reset must be off, with an explicit choice if it conflicts. The current source
now includes normal Sine startup activation, a separate pin badge, scoped menu
commands, creation/move handling, and persistence/recovery integration. Native
disposable tests have verified activation, commands, moves, duplication, Undo,
restart, lazy recovery and a flushed-state forced stop. The independent review's
five findings have been repaired and rechecked; the final full source suite passes
1,236 tests. These exact source files were subsequently installed into the closed
shared test instance on 2026-09-28 with user approval, without launching Zen.
The version label remains 0.3.16; the release receipt below distinguishes this
build from the older installation. This is not alpha-release acceptance. See the
integrated verification and remaining limits (historical local reference; not distributed).

Predecessor **0.3.15** introduced coloured icon underlines for Sticky items.
**Sticky Marker** switches between **Icon Underline** (the new default) and
**Folded Corner** (the retained triangle design). Changing it does not alter
Sticky choices, row spacing, icon positions or titles.

Predecessor **0.3.14** adds compact palette rows with individual swatch
reset buttons, an explicit circular default Space graphic, corrected Sticky
marker indentation, and header-drop placement preferences. Explicit positions
between items and choices in the hierarchy chooser remain authoritative.

Predecessor **0.3.13** reorganised settings into eight named sections,
adds independent **Place Moved Tabs** placement for the context-menu action,
and lets you customise the eight preset colours with validated hex fields and
colour previews. Clicking a preview opens the native picker when available;
otherwise it focuses the hex field. In that earlier build, switching custom
presets off kept saved colours static; 0.3.19's explicit links are described above.
Empty Space icons use a
grey circle instead of an initial. Hierarchy guides repeat solid, long-dash,
short-dash and dotted patterns; Sticky corners are separated from the guide.
See the Round 11 record (historical local reference; not distributed).

The retained palette sits midway between the original vivid
presets and 0.3.11's muted shades. Existing saved/custom colours are unchanged;
choose a revised swatch to apply its new shade. The tab menu separates **Move to
Folder**, **Move to Space**, and **Move Elsewhere**, retaining native commands
and additional group/profile actions. Space destinations use their saved icons
and theme colours (a solid or gradient marker, not the window's texture or
transparency effects). The shared decoration setting controls both kinds
of destination. Folder **Change Space** is labelled **Move to Space**.
Closed, outlined sidebar artwork is modestly smaller within the unchanged row
and icon slot; the already-shorter open artwork retains its native size.
The user reports the outline-free Move to Folder glyph is now correctly placed.
See the Round 10 record (historical local reference; not distributed).
That Round 10 batch did not launch or control Zen. Later authorised native tests
use fresh disposable profiles only. Existing opt-in multi-attempt diagnostics,
optional unload control, colour handling and other features remain.

Predecessor **0.3.7** addressed the returned Round 5 review: flat, more-rounded
Sticky corners, full-width drag destinations, separate Sticky menu artwork,
stable icon-mode settings width, and isolated SVG resources in copied menu icons.
See the repair record (historical local reference; not distributed).
The user reports that 0.3.6 ordinary top-level pinned URL-bar navigation works,
and that the bottom-of-folder drag destinations substantially improve placement.
The user reports that Sticky motion/quick clicks, separate Sticky switches and
outline-free icon centering work in 0.3.5; those behaviors are retained.

The returned fillable **Quick Check - Room for Notes** records Pass for checks
1–7; check 8 has notes but no selected result. The separate videos report further
defects, so those checks are not blanket acceptance. The filled original, older
worksheets, and adverse results are preserved. No new checklist is required
before addressing the reported defects.

**Historical installation (recorded at the time):** BZF 0.3.18 is installed in `.test-profile-v2`; all four
files match the verified chooser package. The existing Icons Settings-reset
repair is unchanged. Final readback verifies 3,539 protected files unchanged,
including installed Icons/custom artwork, profile settings, sessions and Sine
engine. Other registrations, local enablement and imports were preserved. The
previous BZF package is retained and verified for rollback. Shared activation/user
acceptance is pending; the shared test instance was not launched. The exact BZF
package passed native geometry checks in a fresh synthetic headless profile.
Receipt: `artifacts/releases/20261015-v0.3.18-drag-levels-local/shared-test-installation.json`.
Routine verified updates to this project's **closed shared test profile** are
authorised; they do not need a repeated approval request. The lock, scoped backup
and verification safeguards remain mandatory. This does not authorise touching
the everyday profile or launching/controlling Zen.

**Previous installation:** the folder-URL-pins build was staged in `.test-profile-v2`.
All four installed files match the source-stable 1,236-test suite-15 receipt.
The unchanged version label is 0.3.16; exact build receipt:
`artifacts/releases/20260928T160447Z-v0.3.16-round2-ac810204/receipt.json`.
The immediately preceding package and registry are retained for rollback, alongside
older backups. All 130 checked profile/session/Sine files, Icons core files,
other mod registrations and BZF local flags were unchanged. Zen was not launched.
Neither source checks nor installed hashes establish live acceptance. No everyday
profile change or publication is in scope; fresh disposable native tests have
separate, explicit authority.

**Current colour status:** collective fading when Zen loses focus is native
behaviour and is explicitly excluded from the alpha bug list. It is unchanged.
A separate possible persistent colour-darkening defect remains open. In the
latest screenshot, the green swatch, Custom Colour chip and upper folder fill
all match `#51c67c`; the lower icon and adjacent background darken together,
consistent with the picker shadow. The added popup clearance targets that
overlap; it is not a claim that every darkening report has been resolved.
Saved colours, palette values and native window-focus effects are unchanged.
The Sports-folder scrolling conflict remains deferred to the other mods; this
candidate contains no scrolling safeguard or shared-scrolling feature.
The guarded disposable-profile installer also refreshes BZF's registry metadata:
Sine needs `preferences` in `mods.json`, not just in `theme.json`, to show settings.
It preserves other mods, existing enablement, the previous BZF package, and a
registry backup. It refuses to run while the test profile is locked and never
starts or stops Zen.

## Settings

The Sine settings use these defaults:

| Setting | Default | What it does |
| --- | --- | --- |
| **Creating and Moving** | — | — |
| New Tab Position in Folder | Bottom | Places tabs created with either the folder `+` or **New Tab in Folder** at the **Top** or **Bottom**. Available even when the `+` is hidden. |
| Place Moved Tabs | At the Bottom | Choose **At the Top** or **At the Bottom** for **Move to Folder** and drops onto a folder header. Selected tabs retain their relative order. Dropping between items or using the hierarchy chooser keeps your chosen position. Independent of new tabs and whole-folder placement. |
| New Subfolder Position | Bottom | Chooses whether Zen's existing **New Subfolder…** action inserts the subfolder at the **Top** or **Bottom** of its parent. |
| Place Moved Folders | At the Bottom | Choose **At the Top** or **At the Bottom** for **Move to Folder** and drops onto a folder header. Dropping between items keeps your chosen position. Independent of tab placement and new subfolders. |
| **URL Pins in Folders** | — | — |
| Show Pin Badge on Top-Level Pinned Tabs | Disabled | Adds a badge to native root pins. Clicking it unpins the tab and moves it to the regular area; it does not provide Better Pins' independent area/URL system. |
| Separate URL Pins in Folders | Enabled | First activation asks for consent before converting unknown old folder tabs to ordinary tabs or turning off native startup reset. Known choices and root pins are preserved. Disabling retains saved choices but restores native behaviour. |
| Pin URLs for New Folder Tabs | Disabled | Only genuinely new folder tabs receive a pinned URL automatically. Moves and restores keep their existing choice. |
| Delay Before Unpinning a URL (seconds) | 0 | 0 unpins immediately. A positive delay lets you activate the pin again to cancel without changing its saved address. Independent of Sticky removal. |
| **Sticky and Collapsing** | — | — |
| Enable Sticky Tabs | Enabled | Shows Sticky controls for folder/pinned-area tabs and keeps marked tabs visible through collapsed ancestors. Off makes their saved choices dormant, without erasing them. Selected tabs remain visible normally. |
| Enable Sticky Folders | Enabled | Shows Sticky controls for folders and keeps marked folders visible through collapsed ancestors. Off preserves saved choices. Paths to enabled Sticky Tabs still appear. |
| Sticky Marker | Icon Underline | A short, rounded line beneath the icon, using the item's Sticky colour. **Folded Corner** restores the triangle design. |
| Delay Before Removing Sticky (seconds) | 0.5 | Clicking a Sticky marker dims it during this grace period. Click again to cancel removal. Fractions are allowed; 0 removes immediately. Menu commands apply immediately. |
| Subfolders When Parent Is Collapsed | Hide Non-Sticky Subfolders | Choose **Hide Non-Sticky Subfolders**, **Show Expanded Subfolders Only**, or **Show All Subfolders**. Sticky descendants and the paths to them are always shown. Remembered child collapse states are never rewritten. |
| **Folder Previews** | — | — |
| Subfolders in Folder Previews | Start Expanded | **Start Expanded** opens every branch; **Expand Child Folders Only** opens immediate children but starts grandchildren and deeper folders closed; **Start Collapsed** shows their clickable headings first; **Hide Subfolders** excludes their contents and headings, including from search. Choices reset when the preview reopens and never change the sidebar. |
| **Folder Controls** | — | — |
| Show the New Tab Button | On Hover or Keyboard Focus | Shows the folder `+` only when its regular-folder row is hovered or focused. Choose **Always Visible** to keep it shown, or **Hidden** to remove it. |
| Double-Click a Folder Name to Rename It | Enabled | Adds a direct rename gesture while retaining Zen's context-menu rename action. |
| Folder Title Click Delay (ms) | 300 | Type a whole number of milliseconds to wait for a second click. 0 means no waiting. Only title text waits; icons and blank row space remain immediate. Available when double-click rename is enabled. |
| Escape While Renaming a Tab or Folder | Save Name | **Save Name** commits on Escape; **Cancel Changes** restores the old name. Clicking away saves. Uses Zen's native rename editor. |
| Middle-Click a Folder to Delete It | Enabled | Lets a middle-click on a direct regular-folder header use Zen's native whole-folder deletion path. |
| Delete Regular Folders When They Become Empty | Enabled | Removes an ordinary folder after its final real tab is gone. |
| Show Unload Button on Folder Rows | Disabled | Shows Zen's native minus on eligible hovered ordinary folders. Hiding it does not remove **Unload All Tabs** from the context menu or affect the New Tab button, chevron or live-provider actions. |
| **Dragging** | — | — |
| Drag-to-Expand Delay (ms) | 500 | Type a whole number of milliseconds before a collapsed folder expands during a tab drag. 0 means immediate. |
| Drag Destination Hover Delay (ms) | 300 | Wait at a folder's bottom edge before showing its destination choices. Independent of folder expansion; 0 means immediate. |
| Colour-Code Drag Destinations | Enabled | Show each receiving folder's colour strip and icon. Off removes the strips and uses neutral icons; labels and hover delay stay the same. |
| Re-collapse Drag-Opened Folders After Leaving (ms) | 500 | Wait after leaving a drag-opened branch before closing it again. Re-entering cancels the timer; a confirmed drop keeps it open. Already-expanded folders are untouched. 0 means immediate. |
| **Appearance** | — | — |
| Show … on Folders Without an Icon | Disabled | Enable active dots on iconless folders without changing their contents or Sticky visibility. |
| Folder Name Font Size (px) | 14 | Explicit CSS pixel size for folder labels, not tabs. Decimal values such as 14.5 are supported. |
| Show Folder State Chevron | Only for Folders With Outline Disabled | Choose **Only for Folders With Outline Disabled**, **All Folders**, or **Hidden**. The trailing arrow shows the effective expand/collapse action and leaves space for the folder New Tab control. |
| Show Folder Hierarchy Guide Lines | Enabled | Draws non-layout guide lines: solid, long dashes, short dashes, dots; this four-level cycle repeats with depth. |
| **Menus** | — | — |
| BZF Menu Command Icons | Mod Icons | **Off** removes BZF decorative icons; **Mod Icons** adds artwork to BZF commands; **Context Menu Icons Compatibility** uses CMI for ordinary command icons and checkmarks. Sticky gets separate artwork matching **Sticky Marker**, never in place of its checkmark. Native commands are left to Zen/other mods; the new **Move to Space** submenu uses existing native move commands. |
| Show Icons and Colours in Move Menus | Enabled | Shows destination icons and colour markers in **Move to Folder** and **Move to Space**, for tabs and folders. Space themes may use a gradient. Native current-Space checkmarks remain functional. |
| Outline-Free Icon Size in Move Menus (%) | 120 | Move to Folder only: 100% retains the original copied glyph size, 120% enlarges it by 20%. Requires menu decoration and Zen Icons' outline-free presentation. Sidebar and outlined icons are unchanged. |
| **Folder Colours** | — | — |
| Use Space Colour for Default Folders | Enabled | Turn off for neutral grey default folders, with native light/dark shading. Manual colours are unchanged; Reset to Default follows this choice. |
| Customise Preset Colours | Disabled | Enables the eight editable preset swatches below. Existing saved folder colours remain unchanged until a swatch is applied. |
| Swatch 1 | #e76565 | Sets preset colour 1. Available when **Customise Preset Colours** is enabled. |
| Swatch 2 | #ef8f4b | Sets preset colour 2. Available when **Customise Preset Colours** is enabled. |
| Swatch 3 | #e3bd41 | Sets preset colour 3. Available when **Customise Preset Colours** is enabled. |
| Swatch 4 | #51c67c | Sets preset colour 4. Available when **Customise Preset Colours** is enabled. |
| Swatch 5 | #3ebcd2 | Sets preset colour 5. Available when **Customise Preset Colours** is enabled. |
| Swatch 6 | #5f95eb | Sets preset colour 6. Available when **Customise Preset Colours** is enabled. |
| Swatch 7 | #9b79ea | Sets preset colour 7. Available when **Customise Preset Colours** is enabled. |
| Swatch 8 | #e46da9 | Sets preset colour 8. Available when **Customise Preset Colours** is enabled. |
| **Diagnostics** | — | — |
| Record Drag Diagnostics | Disabled | Opt-in local recording of several drag attempts. Right-click a regular folder and choose **Copy Drag Diagnostics** to share the trace. Records timing and anonymous interaction state, not tab URLs or names. |

Numeric controls accept free entry, not a preset list. Enter saves and Escape discards
the current unfinished edit. Invalid input displays an explanation without saving.
Millisecond delays must be whole numbers from 0 to 2147483647 (the native timer limit).
The two seconds controls accept fractions from 0 to 2147483.647; sizes
must be finite and greater than zero. Seconds, font and icon-scale values are stored as strings
to retain decimals and remain compatible with the live readers. The BZF dialog
is centred, capped at 54rem and wraps within small windows; other mods keep their
own settings layout. Existing title presets migrate to explicit 13/14/15/16px values
respectively; this is a sensible replacement scale, not an exact conversion from
theme-dependent `em` sizes. The old palette-icon boolean migrates to the new
three-way command-icon setting when no new user-branch choice exists, including
when Sine supplies a default-branch value. New user-branch values win. If Sine
itself initializes `Mod Icons` on the user branch before migration, it cannot be
distinguished from a deliberate new choice; that ordering case remains a limit.

For custom colours, enable **Folder Colours → Customise Preset Colours**. Enter
a six-digit hex colour such as `#51c67c`, or click the adjacent preview. Enter or
leaving the text field saves a valid value; Escape abandons unfinished hex edits.
Invalid values leave the previous valid colour in use. The eight settings are
left-to-right picker swatches, not a second store of colours assigned to folders.
A reset button beside a changed swatch restores only that swatch to the built-in
default. Its tooltip identifies the swatch; it is keyboard accessible and disappears
when the default is restored. Resetting a preset does not recolour existing folders.

**Mod ownership:** Better Zen Folders owns folder behaviour, colour presets,
hierarchy guides and its move-menu presentation. Zen Icons owns icon selection,
its catalogue/custom artwork and folder-outline choices. **Outline-Free Icon
Size in Move Menus (%)** affects only BZF's copied menu artwork, so it stays here;
it does not resize Zen Icons' sidebar artwork. No settings were migrated between
the mods, and either can still be installed independently.

**Optional minus button:** it is off by default, and if enabled Zen still decides
which folders are eligible. It is not a collapse control or a reliable loaded-tab
indicator. For regular folders, both it and **Unload All Tabs** now use a pure
unload action: current addresses, saved pin addresses and folder state are retained.

Context Menu Icons compatibility is opt-in. It uses that mod's icon channel and
spacing while supplying fallback artwork for BZF-added commands. Existing native
commands such as New Subfolder remain owned by Zen/CMI. Off never disables icons
owned by other mods. The selected-colour palette dot is part of **Mod Icons**;
Compatibility delegates painting to CMI rather than adding a second palette slot.
Both CMI FluentUI and ZenUI mappings were source-inspected;
live combined acceptance remains manual. BZF also works without CMI. No CMI or
Sine source files are modified.

Sticky Tab and Sticky Folder keep their native checkbox semantics in every mode.
Mod Icons and Compatibility show artwork matching **Sticky Marker** beside the label
whether Sticky is enabled or disabled; Off removes only that artwork. The settings
selector reserves a stable font-relative width for all three labels and wraps on
narrow windows, without changing other Sine controls or saving a preference merely
to measure layout.

### Drag diagnostics

Enable **Record Drag Diagnostics**, try several drags (including leaving and
returning), then right-click a regular folder and choose **Copy Drag Diagnostics**.
Copy before turning recording off or closing the test window: either clears it.
Turning it off and on starts a fresh recording. Nothing is uploaded automatically.

The trace contains separate attempt numbers, relative times, anonymous item/event
tokens, pointer and boundary measurements, capture/post-native delivery observations,
acceptance checks, dwell changes, and chooser state. Several independent reasons
can coexist in an attempt. Missing observations mean **not observed**, not that a
particular native handler caused the failure. No tab URLs, titles, folder names,
profile paths, raw errors or drag payloads are included.
While enabled, cancellation-input events such as clicks are also recorded when
no drag is active. These contain timing/coordinates, not clicked text or contents;
a cancellation-input entry does not itself prove that a drag was cancelled.

Recording is bounded to 8192 entries. Unchanged repeated observations are combined
with counts and first/latest times and event tokens; changes are retained. If the
buffer fills, the report explicitly counts overwritten entries and events by type.
It is not an unlimited per-event recording and does not preserve every intermediate
event pairing. The current delay settings and the
delay used when each destination dwell starts are included. Native drag acceptance
and movement remain authoritative; diagnostics do not retry or repair them.

### Regular folders and live folders

**Move to Folder** moves the existing regular folder, including its entire nested
contents, without rebuilding it. It retains names, icons, colours, Sticky choices,
child order and collapse states. Destinations are regular folders in the current
Space. The folder itself, descendants and destinations exceeding Zen's nesting
limit are excluded. Moving the last child out can remove its now-empty old parent
if automatic empty-folder cleanup is enabled. An unsupported child type causes
the move to be refused, not silently misplaced.

The New Tab controls apply to **regular folders only**. Live folders do not get
the mod's `+` button, do not receive its top/bottom placement behavior, and are
not automatically removed when a provider currently has no results. The empty
folder cleanup option is likewise limited to regular folders. Existing native
live-folder behavior remains Zen's responsibility.

### What the optional minus button does

The row minus unloads the regular folder's tabs. It is **not a
collapse button or a reliable indicator that a folder contains loaded pages**.
Zen shows it using its active/exposed-tab state, which does not cover every
loaded background tab. Sticky adds visibility without making tabs stay loaded;
it does not turn that native state into a memory-usage indicator.

We recommend leaving **Show Unload Button on Folder Rows** off (the default).
**Unload All Tabs** remains available in the folder's right-click menu regardless
of the row button. Both commands target the regular folder and its nested tabs.
They may switch away from a selected tab to unload it, but do not reset addresses,
erase history, remove pin/Sticky metadata, or change expanded/collapsed states.
Native before-unload checks remain in force and can prevent a discard. Overlapping
parent/child requests share work for the same tabs rather than prompting twice.

BZF intentionally makes folder-tab close controls close tabs, rather than serve
as individual unload buttons. It does not add minus buttons to every loaded tab
or folder. The visibility of the optional minus still follows Zen's native
eligibility rules; enabling it does not provide a complete memory-usage indicator.
Live-folder providers and top-level native tab controls retain their own policies.

### URL pins inside folders

With **Separate URL Pins in Folders** enabled, being in a folder no longer means
that a tab has a saved reset destination. Right-click a folder tab and choose
**Pinned URL → Pin URL** to save its current page. A separate pin badge appears beside its
favicon; activating that badge, or **Unpin URL**, removes the URL pin without
navigating, moving or closing the tab. Sticky's coloured underline has a different
purpose and a separate control.

The same submenu contains the other three URL commands.
**Reset to Pinned URL** navigates to the saved destination. **Edit Pinned URL**
and **Use Current Page as Pinned URL** change that destination without resetting
the current page. **Unload Tab** releases a page without resetting it; Close
actually closes it and retains native Undo. Native permission checks still apply.

**Pin URLs for New Folder Tabs** is off by default. Moving a tab keeps its known
choice instead of applying this default. Duplicates start ordinary and do not
inherit Sticky. Undo retains the original saved choice. **Delay Before Unpinning
a URL** defaults to zero; with a delay, click the pending pin again to cancel.
This setting is separate from the Sticky-removal delay.

First activation explains that old folder tabs with unknown intent will start
ordinary, and asks before turning off Zen's automatic startup reset if necessary.
With that accepted rule, all tabs resume their last saved page on startup; manual
Reset remains available. Declining leaves the feature disabled. Turning the
feature off later retains saved choices but returns control to native Zen; it
does not re-enable automatic startup reset or undo native actions performed while
disabled. Explicit root Pin/Unpin choices are recognised on reactivation.

This URL-pin layer supports normal synchronized windows on the verified Zen build.
Private/unsynchronised windows show an unavailable notice and retain native pin
behaviour. Essentials and live-provider folders remain native. Invalid or
conflicting saved records are reported, not silently treated as ordinary tabs.
Root pin placement, folder-only membership and the independent Better Pins
two-zone proposal are not redefined here.

### Sticky Tabs and Sticky Folders

Right-click a folder tab or a folder and toggle **Sticky Tab** or **Sticky Folder**.
Or hover just below its icon in **Icon Underline** mode; a faint underline
appears. **Folded Corner** uses the row's leading gutter instead. Only the
chosen marker has a click target. Click to toggle Sticky without selecting the tab or
expanding/collapsing the folder. Sticky markers remain visible after the pointer
leaves; non-Sticky previews do not appear when hovering the tab body itself.
The button also supports keyboard focus and Enter/Space. If turning Sticky off
hides the focused item, focus returns to a visible ancestor folder header.
The marker shortcut is hidden in the collapsed sidebar; the context command
remains available. Top-level pinned-area items also have a Sticky marker.
Essentials and empty placeholders have no shortcut.
This is not a native pin: it does not reorder, protect, load, or move the item.
**Icon Underline** is the default: a short, round-ended line below the icon,
in the same colour as the previous triangle. Folders use their own colour;
nested tabs inherit their folder colour. Root tabs retain the neutral fallback.
The underline itself also toggles Sticky when clicked; the favicon keeps its
normal action. Choose **Folded Corner** to restore the retained triangle.
In that mode the corner sits at the upper leading corner of the existing row: its
right-angle corner is upper-left in LTR, with the diagonal facing down/right.
Root and nested markers advance with their rows; favicon and text positions are
unchanged. RTL mirrors the corner. This follows the revised Round 3 placement,
replacing the outside-row position which aligned different depths together.
Selected tabs remain visible independently and are not automatically made Sticky.

With five tabs and tabs 3 and 4 Sticky, collapsing the folder shows 3 and 4 in
that order; expanding it returns 1, 2, 3, 4, 5. A Sticky descendant reveals its
real ancestor headers with their names, icons and colours. Those headers are
not themselves Sticky. A Sticky expanded folder shows its ordinary contents;
a Sticky collapsed folder still follows its own child visibility rules.

Clicking a header shown only as a path opens that branch, even if its remembered
state was already expanded. The containing parent stays collapsed. The branch
remains exposed until you collapse that branch, or expand its containing parent
and subsequently collapse that parent again. Child states are preserved.

Tab state is stored in native SessionStore custom values and tied to Zen's
stable tab ID: close/undo and restart preserve it, whereas native duplication
assigns a new ID and does not inherit Sticky. Folder state uses window-local
SessionStore values and the existing folder-restoration snapshots, including
collision-safe folder recreation. Moving a Sticky tab to the ordinary unpinned
tab list leaves the setting stored but inactive. Root pinned items retain active
Sticky behaviour: collapsing the workspace's pinned area hides ordinary items
while preserving Sticky items and paths to Sticky descendants in their existing
order. It never promotes them to Essentials or shares them across workspaces.
Expanding or collapsing the Space resets its temporary branch exposures, not
the remembered open/closed states of its folders or their Sticky settings.
Split rows are exposed when any constituent
is Sticky; their individual flags remain independent. The split row's shared
gutter button turns all its eligible members on, or clears Sticky from them if
any member is already Sticky; per-tab context commands remain independent.
Essentials are excluded.
Private state follows native window/session lifetime; no external store is used.

Sticky branches use a measured accordion: already visible rows keep their height,
and only hidden/revealed rows fold. New gestures interrupt the previous animation
without dropping the final state. This is a window-instance animation adapter,
not a prototype patch; native group events still reach SessionStore. Untouched
branches delegate to native motion. Disabling the mod returns managed branches
to native layout; reduced-motion users receive the final state immediately.

Ordinary URL-bar navigation in the selected regular-folder tab or ordinary
top-level pin stays in that tab, even when Zen's pinned cross-host preference
would open a new one. Explicit new-tab actions, live folders, Essentials and
root split-view members retain native routing. The native preference itself
is not modified.

### Drag-open cleanup

An initially collapsed folder opens only after the configured hover delay.
Moving within its descendants counts as staying inside. Leaving without a
successful drop starts the re-collapse timer; returning cancels it. A successful
same-window native move is confirmed by actual new folder membership before
committing the expanded state. A drop event alone cannot commit it. Cancellation
restores only drag-owned opens, while quick drops retain the collapsed view.
Copy/adoption and cross-window completion currently use conservative cleanup;
the same-object membership proof does not establish their success.

During an eligible same-window single-tab move, hold the pointer near a folder's
last visible row to reveal temporary labeled drop rows: **End of Child**,
**After Child in Parent**, and **After Parent in Pinned Tabs** (using the actual
names). The trigger spans the pinned section's width at that local folder boundary;
ordinary pinned tabs can follow the folder. **Drag Destination Hover Delay (ms)**
controls the wait: 300 by default, or 0 for immediate reveal on entry. It is
independent of the delay for expanding a collapsed folder. Crossing the boundary
or dropping before the wait finishes keeps native handling. Native Zen
still accepts, pins and moves the tab. Copy, multi-tab, external-window, split,
Essential and live-folder drags retain native handling rather than this footer.
The footer disappears on completion/cancellation and does not alter tab order
until a drop. Native drag/autoscroll acceptance remains a live-test requirement.
Choices remain while moving between the trigger and its rows, then hide on leave.
A new entry starts a fresh wait. Internal branch endings work even when later
tabs or folders remain in an outer folder. Every receiving ancestor is listed,
deepest first, using its actual name and icon. **Colour-Code Drag Destinations**
controls each receiving folder's own colour strip and coloured icon. The final
Pinned Tabs choice remains neutral. Internal choices overlay the local boundary
without changing native folder heights; a short viewport scrolls the choices.
The boundary follows the branch's rendered chain, not a hidden/offscreen
nearest-folder guess. A row already under
the pointer is dimmed if its destination becomes stale;
move off it to refresh the choices. A stale drop delegates to native without
replacing its destination or detaching the target during dispatch.
Hovering the chooser preserves an already drag-opened path without starting a
new folder-expansion timer. Ordinary folder-header hover keeps its own delay.

### Deferred Sports scrolling issue

The Sports investigation found a reproducible zero-height ordinary-tab viewport
when external split-scrolling rules meet tall pinned-folder content. At the
user's request, 0.3.1 removes the workaround previously included in 0.3.0.
Better Zen Folders does not change the ordinary section's scrolling layout or
provide a shared-scrolling setting. The external issue can therefore still
occur until the responsible rules are verified and fixed in a separate task.
The diagnosis, measurements and historical workaround tests remain available;
they do not imply that the current candidate fixes Sports.

See `docs/reports/2026-09-20-sports-folder-investigation.md` for the proven CSS
mechanism and the limits of attribution to the real-profile recording, and
`docs/reports/2026-09-20-colour-cancel-investigation.md` for the unresolved
native-picker/paint evidence boundary. No real-profile fix is claimed without
the user's live test.

### Custom folder colours

Right-click any Zen folder and choose **Folder Colour…** to open the mod's
compact, keyboard-accessible colour picker beside the persistent folder icon
rather than the closing context menu. It presents eight circular presets in one
row. The current preset has a checkmark and outer selection ring; choosing a
preset applies it immediately and closes the picker. **Custom Colour…** opens
the native colour control and displays its current value as a full-size round
preview matching the preset swatches, rather than reusing the palette icon.
The native callback code ignores previews. The latest returned Cancel recording
does not reproduce lasting darkening, though earlier causality is not uniquely
established and automated callback tests are not native-dialog acceptance.
Custom-picker events now record colour-only evidence in the window-local
`__betterZenFoldersColourDiagnostics` array and the Browser Console. Records include
the saved/projected colour and computed paint/filter values, not tab contents or
folder identities. They are not uploaded or written to disk by the mod.
After a custom-picker attempt, reopen **Folder Colour…** and choose **Copy Colour
Diagnostic** to copy the latest 200 records. Copying is explicit, confirms success
or failure, and redacts URL-valued paints and unexpected raw text. Paste that
report with the observed Cancel result; the in-memory trace is lost when the
window closes. The diagnostic does not change colour acceptance.
If the privileged native picker is
unavailable, an explicit OK/Cancel **#RRGGBB** prompt is used instead; invalid
values and Cancel do not save. The unsafe HTML colour-input change fallback is
not used. This fallback is functional but intentionally less visual.
**Reset to Default** immediately returns the folder to Zen's theme colour and
is disabled when no custom colour exists. No extra Apply or Cancel footer is
required. The context-menu action uses a recognizable palette icon with one
paint well showing the folder's current colour, or a neutral theme-derived
well at the default; the BZF command-icon setting can hide that icon without removing
the action. The colour applies to the hierarchy line. The coordinated Zen
Icons presentation applies the same canonical colour to the complete native
folder shape, keeping a recolourable selected inner icon black while the
outline is enabled and using the custom colour when the outline is disabled.

The colour is stored by folder identity in a bounded, versioned preference and
is included in the mod's closed-tab restore metadata. A deleted folder that is
recreated by undo therefore receives its recorded colour even when Zen must
assign a collision-safe replacement ID. Open Zen windows observe the same
ledger and update their matching folder presentation.

For icon-mod interoperability, every coloured `zen-folder` exposes
`data-better-zen-folders-color`, `--better-zen-folders-custom-color`, and
`--better-zen-folders-folder-color`. It also emits the bubbling
`BetterZenFolderColorChanged` event with the normalized colour or `null`. Better
Zen Folders owns the colour store; an icon mod may consume this signal when its
folder-outline mode is disabled, without maintaining a second colour database.

### Folder context actions

Zen 1.22b (and the previously inspected 1.21.16b) supplies **New Subfolder…** in the folder context menu.
This mod preserves that single native menu item rather than inserting a
duplicate, but handles its command so the placement setting can choose the
first or last child slot. It retains Zen's ancestor expansion, workspace,
rename, and maximum-depth behavior.

The installed Zen build can create a nested folder whose native icon container
has no SVG. Zen's updater and icon writers then have nothing to update. Better
Zen Folders waits until Zen's synchronous `TabGroupCreate` setup has finished,
then checks only the folder's direct icon container. If the SVG is still
missing, it clones Zen's own `folder.constructor.rawIcon` template into that
container. This avoids racing Zen's own `connectedCallback()` and never
replaces or duplicates an existing icon. Zen Icons can then apply default,
built-in, or custom choices normally.

When **Show Folder Icons and Colours in Move to Folder** is enabled, the mod
decorates Zen's existing submenu items in place. It restores the missing
Firefox iconic class and preserves the original native image for cleanup. The
display source prefers the folder's own direct SVG image, then Zen Icons' live
compatibility source, then a safely owned native icon URL, with Zen's default
folder asset as fallback. Missing parent icons never borrow a nested child's
icon through Zen's unscoped getters.
When the folder's direct native SVG is available, a decorative snapshot carries
its current shape, inner icon, outline visibility and colour into the menu. This
works without an interactive icon-selection marker after restart. Both Gecko
155's direct menu image and the older icon wrapper are supported. It neither
rebuilds nor reorders Zen's menu commands and does not own Zen Icons' icon
state.
The menu snapshot uses a two-em viewport so its smaller inner glyph remains
legible and scales with menu text. Disabling decoration presents all folder
destinations as text-only, including native custom-image slots; command handlers
and original image attributes remain untouched and return on mod teardown.

Default and Reset colours are independent for each nested folder: a child does
not inherit its parent's custom guide colour.

With **Double-Click a Folder Name to Rename It** enabled, only a double-click on
the actual name label invokes Zen's native rename method. A first name click is
held for 300 ms by default; the title-delay setting can shorten, lengthen or
disable that wait. A second click inside the selected window cancels the pending
toggle, so the folder does not visibly expand and collapse before rename. A
single click still toggles after the window. Folder icons, child tabs, and row
controls are excluded. The event boundary follows Zen's retargeted XUL source
as well as the ordinary DOM target, and Zen's right-click **Rename** action
remains available.

### Deleting and undoing a folder

With the middle-click setting enabled, a direct ordinary-folder header calls
Zen's native `folder.delete()` path; Zen's own context-menu **Delete Folder**
uses the same native path. Native group deletion creates a single
closed-group history record for the folder's real tabs, rather than separately
closing every child. The earlier disposable candidate was observed restoring a
four-tab folder as one functional folder in order. The successor candidate in
this checkout adds colour/context behavior and must still repeat that live
check before the result is attributed to this exact package.

For individual folder tabs, the visible X and middle-click use native removal.
The native Close Tab command (`Ctrl+W`) also closes a folder tab instead of
resetting/unloading it. A selection consisting entirely of eligible folder tabs
uses native bulk removal. Essentials, placeholders, ordinary pins, and mixed
selections retain Zen's native command behavior. The mod does not change the
global pinned-tab close preference or bypass native before-unload handling.

Group restoration shares remapped ancestor identities across nested sibling
paths, so an occupied old folder ID does not create multiple replacement parents.
New Tab in Folder selects only a newly opened tab that is selected when Zen
confirms the dialogue, or the initially empty tab Zen reused. Unrelated background
opens are not moved into the folder; switching to an existing tab remains native.

## Automated checks

Run `node --test tests/*.test.mjs` and `python -B -m unittest tests.test_package`.
The three CSS/DOM rendering checks are opt-in: set `BZF_PLAYWRIGHT_MODULE` to an
installed Playwright module path and run `node --test tests/css-rendering.test.mjs`.
They use a fresh headless Chromium fixture with network requests blocked, never
the user's browser/profile. They validate CSS cascade and matching markup, not
Zen's native XUL rendering or real-profile compatibility.

## Release status

This checkout is a local candidate only. Automated checks cover the package and
controller behavior; they do not activate Sine, inspect a profile, or operate
Zen. See [VERIFICATION.md](verification-history.md) for the precise source, automated,
and pending live-evidence boundaries.
