# Better Zen Folders

Make Zen's folders easier to organise and use. Keep chosen tabs visible when a
folder is collapsed, colour folders, preview their contents, and choose exactly
which folder receives a dragged tab.

## Install

With [Sine](https://github.com/CosmoCreeper/Sine) installed, open **Settings → Sine
Mods** and paste this folder URL into its GitHub installation field:

```text
https://github.com/YiftahCooper/Zen-Mods/tree/main/better-zen-folders
```

Allow JavaScript mods when Sine asks, then restart Zen. Install this folder, not
the repository root. [Zen Icons](../zen-icons/) is optional; the two mods can be
used separately or together.

## Use

- **Sticky:** right-click a tab or folder and turn on Sticky. Its coloured
  underline marks it as Sticky, and it remains visible through collapsed parent
  folders. Click the marker to turn Sticky off. The settings also offer the
  older folded-corner marker.
- **Folder controls:** hover a folder to add a tab. Use its right-click menu to
  rename it, change its colour, add a subfolder or move it into another folder.
- **Links and Glance:** links opened in a new tab from a folder stay in that same
  folder, beside their source tab. Expanding a Glance preview does the same.
  Background tabs stay in the background, including inside subfolders.
- **Preview:** hover a collapsed folder to search its hidden tabs. Child-folder
  headings keep the hierarchy clear and can expand or collapse inside the popup.
- **Dragging:** pause near the end of a folder's contents to choose between the
  available parent folders and the top level. Adjust the delay and colour coding
  in settings.
- **Pinned URLs:** a tab's **Pinned URL** menu saves an address you can return to.
  A URL pin is separate from Sticky. New folder tabs are not URL-pinned by
  default; moving a tab into a folder preserves its previous URL-pin choice.

## Before using it in your main browser

This is an **alpha**. Back up your Zen profile first. The selected build was
tested with Zen 1.23.2b, including recovery and use alongside Zen Icons; that does
not guarantee compatibility with every other sidebar mod. Possible persistent
colour changes and unusual startup/rename behaviour are still being investigated.

If Zen's automatic pinned-tab startup reset conflicts with folder URL pins,
follow the mod's prompt to turn that automatic reset off. Manual Reset to Pinned
URL remains available. This mod does not add a second tab area or move folders
into the regular tab list.

## Settings

Open **Sine Mods → Better Zen Folders → Configure**. The groups below follow the
same order as the settings window. Times marked **ms** are milliseconds:
500 ms is half a second; 0 means no waiting.

<details>
<summary>Show the settings guide</summary>

### Creating and Moving

- **New Tab Position in Folder:** put newly created tabs at the top or bottom.
- **Place Moved Tabs:** choose top or bottom for Move to Folder and drops onto
  a folder header. Dropping between rows or choosing a drag destination keeps
  the position you picked.
- **New Subfolder Position:** put new subfolders at the top or bottom.
- **Place Moved Folders:** the same placement choice for existing folders,
  independently of tabs and newly created subfolders.

### URL Pins in Folders

A URL pin saves an address to return to; Sticky keeps an item visible.

- **Show Pin Badge on Top-Level Pinned Tabs:** show a clickable pin on tabs
  outside folders. Clicking it unpins the tab and moves it to the regular area.
- **Separate URL Pins in Folders:** let you choose which folder tabs have a
  saved reset address, instead of treating them all as URL-pinned. Turning it
  off restores native behaviour without erasing your choices.
- **Pin URLs for New Folder Tabs:** give new folder tabs a saved address
  automatically. Moving or restoring tabs keeps their existing choice.
- **Delay Before Unpinning a URL (seconds):** allow time to click the pin again
  and cancel. The default, 0, unpins immediately.

### Sticky and Collapsing

- **Enable Sticky Tabs:** let chosen tabs stay visible through collapsed
  folders and Spaces. Turning it off keeps your saved Sticky choices.
- **Enable Sticky Folders:** the same switch for folders, separately from tabs.
- **Sticky Marker:** choose an underline below the icon or the older folded
  corner.
- **Delay Before Removing Sticky (seconds):** allow time to click the marker
  again and cancel removing Sticky.
- **Subfolders When Parent Is Collapsed:** hide ordinary subfolders, show only
  expanded ones, or show all. Sticky items and their folder paths stay visible;
  child folders keep their remembered open/closed state.

### Folder Previews

- **Subfolders in Folder Previews:** start every level expanded, expand only
  immediate children, start them collapsed, or exclude child-folder contents.
  This affects the popup, not the sidebar. Click a heading to open or close it.

### Folder Controls

- **Show the New Tab Button:** show the folder's plus button on hover/focus,
  always, or never.
- **Double-Click a Folder Name to Rename It:** enable this shortcut.
- **Folder Title Click Delay (ms):** wait for a possible second click before
  opening or closing the folder. A longer delay makes double-clicking easier.
- **Escape While Renaming a Tab or Folder:** save or cancel the new name when
  you press Escape. Clicking away saves it.
- **Middle-Click a Folder to Delete It:** delete the whole folder with the
  middle mouse button. Turn this off to avoid accidental deletion.
- **Delete Regular Folders When They Become Empty:** remove an ordinary empty
  folder automatically; this does not mean folders can live in the regular tab area.
- **Show Unload Button on Folder Rows:** show Zen's native minus button on
  eligible hovered folders. It unloads rather than deletes tabs and can collapse
  the folder. Off by default; the separate Unload All Tabs menu remains available.

### Dragging

- **Drag-to-Expand Delay (ms):** how long to hover with a dragged tab before a
  collapsed folder opens.
- **Drag Destination Hover Delay (ms):** how long to pause at a folder boundary
  before the destination chooser appears.
- **Colour-Code Drag Destinations:** use each receiving folder's colour in that
  chooser. Turn it off for neutral icons and no colour strips.
- **Re-collapse Drag-Opened Folders After Leaving (ms):** close a temporarily
  opened folder after dragging away without dropping inside it.

### Appearance

- **Show … on Folders Without an Icon:** show the dots when a collapsed folder
  without a chosen icon has visible tabs. Turn this off to keep its folder
  artwork empty; it does not change which tabs are visible.
- **Folder Name Font Size (px):** change folder-title text size; decimals work.
- **Show Folder State Chevron:** show the small expand/collapse arrow on all
  folders, only folders with their outline disabled, or none.
- **Show Folder Hierarchy Guide Lines:** show the coloured lines connecting
  folder contents. Their patterns repeat every four nesting levels.

### Menus

- **BZF Menu Command Icons:** no added icons, icons for this mod's commands,
  or compatibility with Context Menu Icons. Sticky checkmarks remain separate.
- **Show Icons and Colours in Move Menus:** decorate folder and Space destinations.
- **Outline-Free Icon Size in Move Menus (%):** resize icons without folder
  outlines in Move to Folder. 100% is their original size; sidebar icons do not change.

### Folder Colours

- **Use Space Colour for Default Folders:** use the Space's colour for folders
  without a chosen colour. Turn it off for grey; manual colours do not change.
- **Customise Preset Colours:** edit the eight colours offered in Folder Colour.
  Folders assigned a preset follow later edits; custom colours stay independent.
- **Swatch 1–8:** enter a hex colour or click its preview to use the colour
  picker. Each changed swatch gets its own Reset button. To link an older
  folder to a preset, select that swatch once from its Folder Colour menu.

### Diagnostics

- **Record Drag Diagnostics:** temporarily record drag attempts for troubleshooting.
  Reproduce the problem, then right-click an ordinary folder and choose
  Copy Drag Diagnostics. Tab names and URLs are not recorded.

</details>

[All mods](../README.md)
