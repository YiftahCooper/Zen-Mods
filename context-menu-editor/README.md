# Context Menu Editor

Arrange Zen's native right-click menus, create submenus and choose icons through
an interactive Sine settings editor. **Version 0.1.3.**

## Install

1. Install [Sine](https://github.com/CosmoCreeper/Sine) and open its mod settings
   in Zen.
2. Paste this complete folder URL into Sine's GitHub installation field:

   ```text
   https://github.com/YiftahCooper/Zen-Mods/tree/main/context-menu-editor
   ```

3. Install the mod and allow its JavaScript when Sine asks. Restart Zen if
   prompted, then open **Configure** for Context Menu Editor.

**Disable Zen Context Menu and Context-Menu-Icons before enabling this editor.**
It replaces their menu ordering, visibility and icon customization. Their CSS
can conflict with the editor. You can keep them installed but disabled while
trying this version, then remove them when satisfied. Supported saved preferences
are imported once when this editor has no saved configuration. Some separate
upstream styling and folding behavior is not included.

Keep other mods that add commands or submenus enabled. This editor discovers
their entries and identifies their source when sufficient evidence is available.
Open the relevant right-click menu once if its owner creates entries lazily.

## Keep your existing preferences

On its first run, the editor checks for saved settings from Zen Context Menu
(`uc.hidecontext.*` and supported `uc.fixcontext.*` values) and
Context-Menu-Icons (`cmi-*`). It imports supported choices only when
`extension.context-menu-editor.settings` is empty. Existing editor data,
including data it cannot read, is preserved.

The import covers supported command visibility groups, icon visibility and
pack, separator visibility and strength, preference for clean links, per-menu
hiding of disabled commands, extension icon monochrome and basic corner/hover
choices. Old preferences are left untouched. Commands that appear later receive
their imported visibility once; re-enabling one here keeps your newer choice.

These choices become your profile's saved configuration. Zen restarts, Sine
reloads and mod updates do not reset it or rerun the import over it. Public
defaults remain Fluent icons, visible separators and visible disabled commands.
A profile with no old preferences starts with those normal defaults.

Legacy pixel offsets, toolbar-only styling, stale options with no corresponding
menu action and arbitrary CSS folding selectors are not imported. The editor's
size, alignment and spacing controls replace the older pack-specific offsets.
Use **Appearance → Spacing and style → Show separators** and
**Menu options → Prefer clean links** to change those imported choices. Clean
links are preferred only when the clean command and its containing submenus
are usable; otherwise ordinary Copy Link remains available.

## Use the editor

Open **Configure** for this mod in Sine. Choose **Page menu**, **Tab menu**,
**Folder menu** or **Bookmarks menu**. A discovered mod-owned menu also appears
in the selector. Open a menu in Zen once if its owner creates entries lazily.

The list follows the shape of a menu. Each row has a drag handle, an enable
checkbox, an icon, a name, a submenu arrow where needed, and **⋯** for actions.
Foreign items show a small source tag.

- Drag to reorder. **⋯ → Move up / Move down / Move to** provides alternatives.
- Clear the checkbox to hide an item and retain its position.
- Click a name to rename it. Enter saves; Escape or leaving the field cancels.
  **Reset name** restores the current label supplied by its owner.
- Click an icon to open **Built-in**, **Image** or **Symbol**. Review the preview
  and choose **Save icon**. Cancel keeps the previous choice. **Automatic**
  clears the custom artwork; **Reset icon** also turns that item's icon on.
- **⋯ → Remove** hides the item from the menu and the normal editor list.
  **Menu options → Restore removed items** brings it back.
- **Add → Submenu** creates a named group. Move supported items inside it or
  back out. Removing a custom submenu returns its children to its position.
- **Add → Separator** creates a draggable divider. Redundant visible dividers
  are hidden automatically. Blank spacers are not added.

The top controls keep occasional settings out of the rows:

| Control | What it does |
| --- | --- |
| Add | Create a submenu or separator at the selected location. |
| Appearance | Choose the icon pack, size, alignment and gap. Open Spacing and style for row spacing, corners, hover shading, separator visibility and strength, and monochrome extension icons. |
| Find an item (⌕) | Highlight a name or source mod, expand its parents and jump between matches. Every row stays in the list. |
| Menu options (⋯) | Enable customization, hide unavailable commands for this menu, prefer clean links in the Page menu, enable Shift bypass, restore removed items, restore order or reset this menu. |
| Undo | Undo the last completed change. |

Each completed edit saves immediately. Opening settings does not save or
normalize the configuration. The dialog is at most 620 CSS pixels wide and
shrinks to fit the window. Panels open beside the relevant control and stay
inside the viewport. Escape closes a panel and returns focus to its button.

## Discovery and source names

New commands **and submenus** with stable IDs are discovered dynamically,
including entries added after startup. Children stay beneath their submenu.
Separate mod-owned native popups can also be discovered, such as Zen Site
Appearance Toggle's toolbar menu. There is no command-owner allowlist.

The editor can also retain an ID-less mod command or submenu when its source,
original label and native ancestry identify it unambiguously. This supports
Better Pins' recreated menu rows. An original-label or locale change creates a
new identity for such a row. Duplicate, unknown anonymous and content-generated
rows remain under their owner's control; selected text and generated bookmark
names are not saved as identities. Recreated stable-ID nodes reuse their saved
edits. Temporarily absent mod items retain their position and customization.

Source tags use the installed Sine catalogue and evidence from creation or
command/popup handler scripts. The browser's own menu markup identifies Zen
Browser rows. Existing and later-created items can both be attributed.
**Source unknown** is shown when the evidence is insufficient. **Icon: Mod name**
identifies an artwork supplier without claiming that it created the command.
Source paths, live labels and provenance metadata stay in memory.

Automatic icons use exact command/localization mappings, existing owner
artwork, a confident action match, or a neutral fallback. The picker has 285
choices across FluentUI and ZenUI, including spare icons. A future action does
not need an editor update to appear, but its meaning cannot always be inferred.
Every suggested icon can be replaced. ZenUI references installed Zen artwork
with a bundled Fluent fallback; copied ZenUI drawings are not distributed.

Zen and the owning mod still determine when a command is valid. A link-only
command stays link-only after moving it. Entries stay in their original menu.
Children with delegated native handlers stay inside their original submenu;
the editor explains these movement restrictions. A foreign submenu can be
renamed, re-iconed and rearranged as a unit. Custom submenus can be created
inside a native submenu where its handlers permit it.

Navigation buttons are independent rows while retaining their original
eligibility. The AI menu and its dependent separator stay together. Native
checkmarks and radio status retain their own slots. The editor keeps original
nodes and handlers, restores owner presentation when a menu closes, and releases
the overlay if another mod continually rewrites the same presentation.

## Which mod's settings win?

Saving here applies the editor's choices. If you then change a relevant setting
in an owning mod and it changes that menu item, the affected choice returns to
that mod. Saving here again takes control back. An icon-only change in the owner
does not discard an unrelated name or arrangement set here. Source-based
handling applies to individual commands, nested submenus and discovered popups.

This uses observable Sine preferences and their material menu effects. Exact
declared properties and unambiguous declared preference families identify the
owner. Setting names identify affected fields: name, icon, visibility and order;
a general menu/configuration setting can affect all four. Routine dynamic
labels or icons without an observed settings change keep editor overrides.
Preference values are not collected.

There are limits to inferring intent across independent mods. While a menu is
closed, a pending owner change waits for its next opening. After that, a
two-second settling window allows asynchronous effects; later routine updates
do not indefinitely revoke editor choices. Pending events are held in memory,
so restarting before an effect appears loses that pending history. Already
yielded choices persist. A mod that uses no observable preferences, ambiguous
ownership, an unusually named setting or a much later effect may need an
explicit reset or edit here. Universal latest-user-intent detection is not
promised.

## Image handling

Files and pasted images are limited to 5 MiB. Direct HTTPS imports are limited
to 256 KiB and eight seconds. Decoded dimensions are limited to 4096 pixels per
side. SVG input rejects scripts and external references. Accepted artwork is
normalized to a transparent 32 × 32 PNG with its aspect ratio preserved, then
stored in settings. It no longer needs its original file or URL. One to eight
Unicode symbols or joined emoji also resize to fit the icon slot.

Network images load only after **Load image** is requested. HTTPS imports omit
credentials and referrers and reject redirects. Pack and imported artwork need
no network request when a menu opens. Existing owner-provided icon URLs remain
controlled by that owner.

## Verification

Version 0.1.3 adds regression tests for one-time import, late command discovery,
per-menu availability, clean-link fallback and retained settings. Its native
legacy-import test uses two separate headless Zen processes with the same newly
created disposable profile. It exercises real Sine reloads, later editor edits,
changed old preferences and exact saved-state readback after restart.

The RC3 baseline also passed a separate headed disposable Zen run with eight
checks through the real Windows file picker, including trusted file delivery,
draft/save behavior and transparent 32 × 32 PNG normalization. This picker
result belongs to RC3; the image-import implementation is unchanged in 0.1.3.

Native coverage includes 15 page contexts, actual bookmark/folder commands,
eight local mods in both load orders, two browser windows, Sine unload/reload,
a complete Zen process restart, 30 repeated menu openings and 24 layout cases
across text direction, zoom and display scale. Define Word's automated dictionary
responses were deterministic fixtures; its selection actor, parser and popup ran.

Tests used Zen 1.23.2b / Gecko 157.0.1, build 20261009073723, and Sine revision
`fb0bd4ca6af888f10648e126947f7d1f82228433`. This is disposable-profile coverage;
it cannot establish every future mod, theme, locale or everyday configuration.
Gecko's trusted helper completes drops after pointer-started drags. Raw Windows
image-clipboard data and physical input remain separate proof limits; native
text, symbol and PNG-data-URL paste were tested without accessing the Windows
system clipboard.

## Credits and license

The menu controller and settings editor are new code, informed by KiKaraage's
Zen Context Menu. Icon assets and mappings were adopted from Starry-AXQG's
Context-Menu-Icons with accompanying notices. ZenUI uses artwork supplied by
the installed browser with a bundled Fluent fallback.

See [THIRD_PARTY.md](THIRD_PARTY.md), [LICENSE](LICENSE) and [licenses](licenses/)
for the source and artwork notices.
