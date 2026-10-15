# Zen Icons

Find more icons in Zen's normal icon picker: built-in icons, Lucide, emoji and
your own images. Search by name or tags, browse categories, and choose separate
picker defaults for tabs, folders and Spaces.

## Install

With [Sine](https://github.com/CosmoCreeper/Sine) installed, open **Settings → Sine
Mods** and paste this folder URL into its GitHub installation field:

```text
https://github.com/YiftahCooper/Zen-Mods/tree/main/zen-icons
```

Allow JavaScript mods when Sine asks, then restart Zen. Install this folder, not
the repository root. [Better Zen Folders](../better-zen-folders/) is optional;
neither mod installs the other.

**Updating an older local build?** Follow the [custom-icons migration
instructions](CUSTOM-ICONS.md) before using Sine's updater, so images kept inside
the old mod folder are preserved first. New installations use separate storage.

## Use

- Open **Change Icon** for a tab or folder, or choose a Space's icon in its
  editor. The enhanced picker appears in the usual place.
- Search, click a category heading to jump to it, or open **Filter** to choose
  which icon sources and categories appear. **Save as Defaults** remembers those
  choices for that picker type; tabs, folders and Spaces keep separate defaults.
- A tab's **Default Tab Icon** tile deliberately gives it Zen's plain placeholder.
  **Reset Icon** removes your override and returns to its website/native icon
  when available. Space Default is the small grey circle.
- Folder icon options can show or hide the folder outline. Folder colours and
  Sticky behaviour are provided by Better Zen Folders, not this mod.

No account or online icon service is required.

## Settings

Open **Sine Mods → Zen Icons → Configure**.

### Icon Behaviour

- **Double-Click an Icon to Open the Picker:** use a double-click on a tab,
  folder or Space icon as a shortcut to Change Icon.
- **Use Space Colour for Default Tab Icons:** colour the plain default-tab
  placeholder using its Space. Turn it off for a neutral icon; website icons
  and your chosen artwork are unchanged.

### Picker Defaults

**Tabs: Picker Defaults**, **Folders: Picker Defaults** and **Spaces: Picker
Defaults** each have their own copy of these settings:

- **Show Emojis by Default:** include emoji when that picker opens.
- **Show Zen Icons by Default:** include Zen's built-in icons.
- **Show Lucide by Default:** include the Lucide icon library.
- **Show Custom Icons by Default:** include your locally stored images.
- **Hidden Categories:** hide named categories. Separate names with commas,
  such as `Animals, Flags`, or choose them in Filter and use Save as Defaults.

These settings change what the picker shows, not icons you have already chosen.
Changing Filter without saving it applies only to that opening of the picker.

## Add your own images

In the picker, use **Filter → Open Custom Icons Folder**. Put your images there,
optionally organised into pack and category folders, then close and reopen the
picker. PNG, JPG/JPEG, WebP, AVIF and ICO are supported; custom SVG and animated
GIF are not. Images keep their proportions and colours.

Custom artwork is stored separately from the replaceable mod files. See the
[custom-icons guide](CUSTOM-ICONS.md) for folders, searchable names, tags and
safe migration from older local builds. Back up your Zen profile before trying
an alpha in your main browser.

## Credits

Zen-derived code retains its [Mozilla Public License 2.0](LICENSE-MPL-2.0.txt).
Lucide and its Feather-derived artwork retain the complete
[ISC and MIT notices](lucide/LICENSE.md), covering both included SVG variants.

[All mods](../README.md)
