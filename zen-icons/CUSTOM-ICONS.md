# Custom Icon Packs: A Guide for People and AI Assistants

This is the authoring guide for the current Zen Icons Sine implementation.
No account, online service, build tool or code execution is required to make a
pack. Use images you created or have permission to redistribute if sharing it.

The Zen Icons Sine mod scans its profile-local `zen-icon-packs` directory whenever the icon picker
opens. Use **Filter → Open Custom Icons Folder** in the picker to create and
open the correct location. In the active profile it is:

```text
zen-icon-packs/
```

## 1. Install or Create a Pack

Put each pack in its own folder. The folder immediately inside `zen-icon-packs` is the
**pack**, not a category. Its immediate subfolders become display categories.
Pack, folder and file names become searchable automatically:

```text
zen-icon-packs/
  My Icons/
    Sports/
      AmericanFootball-NFL.jpg
      baseball.png
    Animals/
      red-panda.webp
```

The example football icon is displayed as **American Football NFL**. Searches
for `american`, `football`, `nfl`, `sports`, `my`, or `icons` can find it.

After adding or editing files, close and reopen the icon picker. In Filter,
enable **Custom Icons** if it is hidden. Category visibility defaults are
separate for tabs, folders and spaces, so check the type you are using.

When extracting a ZIP, copy the actual pack directory, not an extra download
wrapper. The manifest must be exactly `zen-icon-packs/Pack Name/icons.json`:

```text
Correct: zen-icon-packs/Round3 Test Pack/icons.json
Wrong:   zen-icon-packs/Zen-Mods-Round-3-Test-Pack/Round3 Test Pack/icons.json
```

The wrong arrangement may still show images, but it makes `Round3 Test Pack`
a category and ignores its nested manifest. This explains missing JSON names,
tags and category decorations even when image selection works.

## 2. Choose Suitable Images

Supported files are PNG, JPG, JPEG, WebP, AVIF, and ICO, up to 5 MiB per file.
Animated GIF and custom SVG files are intentionally not loaded. Linked files
and linked directories are ignored, including a linked custom root or ancestor.
Keep packs inside the profile's Custom Icons Folder, not the installed mod directory. Optional manifests are limited to
1 MiB; skipped entries and scan warnings are logged in the browser console.

Images keep their original proportions. Rectangular images are scaled down to
fit a square icon slot, with unused space around them; they are not stretched
or cropped. Color is preserved.

Choose recognisable shapes with reasonable contrast at roughly favicon size.
Transparent PNG or WebP is useful for cut-out art; JPEG is fine for photos but
does not support transparency. Large source dimensions do not make a larger
displayed icon. Excessive transparent padding inside the source image makes
the visible artwork small; remove that padding yourself if necessary.

## 3. Understand Categories and Search

- `My Pack/Animals/fish.png` displays under **Animals**.
- `My Pack/Animals/Fish/trout.png` also displays under **Animals**; **Fish** and
  **trout** remain searchable. The picker does not create nested category views.
- `My Pack/fish.png`, with no JSON categories, displays under **Other**.
- Two packs with a matching primary category share that section.
  A custom **Animals** section also joins the built-in **Animals** section.
  Provider filters still determine which icons are visible.
- Names ignore capitalisation, leading/trailing spaces and repeated spaces:
  `Animals`, ` animals ` and `ANIMALS` share one section. `Research  Lab` joins
  `research lab`. Spelling and punctuation still matter: `Test-Group` and
  `Test Group` are different; use explicit aliases for related search words.
- Identical images in separate files are separate selectable records. Merging
  categories does not compare image pixels or deduplicate copied files.
- The pinned **Default** section is a separate control, not a catalogue category.
  A custom category called `Default` is displayed as **Default (Custom)**,
  separate from the native reset/default controls. Variants such as ` default `
  join that same custom section.
  If a literal category already uses `Default (Custom)`, a numeric suffix keeps
  the renamed Default category distinguishable; the literal name stays intact.
  A *pack* called Default is harmless and follows the ordinary rules above.

Search accepts **any** matching query keyword, prioritising icons matching more
keywords and stronger name matches. It does not require every word. Therefore
`Round3 Travel` can also find other icons tagged `Round3`. Use a distinctive
single tag when checking that specific metadata works.

Results are relevance-ranked, not permanently alphabetised within a category.
For example, `tra` matches inside `portrait`, temporarily boosting Portrait
Bands; `trav` no longer matches that name. This can change result ordering as
you type. Category headings remain alphabetically ordered.

## 4. Add Names, Tags and Category Decorations

File and folder names are enough for normal use. To add a friendlier name or
extra search terms, place an optional `icons.json` at the root of a pack:

```json
{
  "$categories": {
    "Sports": {
      "icon": "🏅",
      "aliases": ["sport", "athletics"]
    }
  },
  "Sports/football.png": {
    "name": "American football",
    "tags": ["NFL", "gridiron", "touchdown"],
    "categories": ["Games"]
  }
}
```

`$categories` is optional. It decorates a plain category name with an emoji or image
and adds alternative names that also participate in icon searches. The picker still stores, sorts, and navigates by
the plain name (`Sports`) while displaying `🏅 Sports`. Categories without
metadata receive a generic category icon.

Paths use forward slashes and are relative to the pack directory. A malformed
or missing manifest does not hide otherwise valid images. The first category
(normally the first subfolder) is the icon's display section; additional
categories remain searchable, so an icon is never shown twice in the picker.

In that example, the entry applies only to a file literally named
`Sports/football.png`. Change the key if your file is instead
`Sports/AmericanFootball-NFL.jpg`. Match spelling, extension and letter case.
Use valid JSON: double quotes, no comments and no trailing commas.

For a new category named Test, the smallest useful manifest is:

```json
{
  "$categories": {
    "Test": { "icon": "🧪", "aliases": ["testing", "experiments"] }
  }
}
```

Place an image inside `My Pack/Test/` as well: metadata alone does not create
an empty category. The emoji is presentation; the plain category name remains
`Test`. The decoration is used in both the picker and its Filter menu.
To use an image, place **Category Icon.png** (or JPG, JPEG, WebP, AVIF or ICO)
directly in the category folder, beside its selectable images:

```text
My Pack/
  icons.json
  Test/
    Category Icon.png
    microscope.png
```

The category artwork appears beside **Test** in both the picker and Filter.
It fits proportionally and is excluded from the selectable icon grid. The
reserved filename is case-insensitive. Place it in the immediate category
folder; a deeper `Test/Subfolder/Category Icon.png` is not category artwork.
Files using that reserved name are never selectable tiles.

JSON `icon` can also be a Unicode character/emoji, a path relative to the pack,
or an absolute local file path. Escape Windows backslashes in JSON, or use
forward slashes:

```json
{
  "$categories": {
    "Test": { "icon": "art/test.png", "aliases": ["testing"] },
    "Research": { "icon": "C:/Users/Example/Pictures/lab.jpg" }
  }
}
```

Artwork precedence is: **Category Icon image → JSON image or Unicode → built-in
category emoji → generic category emoji**. If an image is missing, corrupt or
unsupported, the next available choice is used. An immediate category-folder
image overrides JSON. Remote URLs, `file://` URLs, network paths, SVG/GIF,
parent-directory traversal and linked files/ancestors are refused. The 5 MiB
limit applies to category images too. Prefer relative paths for portable packs;
an external absolute path works only on machines where that file exists.

Category metadata is shared across the merged category. If several packs
define its decoration, the manifest applied last after pack-name sorting wins.
Category-folder image conflicts also use alphabetic pack/path order, with the
last usable image taking priority; a warning identifies conflicting artwork.
Avoid conflicting decorations for a shared name. A custom definition may
override the corresponding built-in decoration.

For a JSON-only category (images directly in the pack), an entry can use
`"categories": ["Test"]`. With a category subfolder already present, JSON
categories add searchable terms; they do not replace that first display group.

Suggested tags should describe useful concepts and synonyms, not merely repeat
the filename. For a football, `NFL`, `gridiron`, `touchdown` and `sports` are
useful. Do not add unrelated popular terms just to make an icon appear often.

## 5. Check Your Pack

1. Reopen the picker and enable Custom Icons. Confirm the intended category.
2. Search a distinctive filename word, then a tag found only in `icons.json`.
3. Check that the category decoration appears in the picker and Filter.
4. Select an image on a disposable tab, folder and space. Confirm its colour,
   transparency and proportions; check the space heading and bottom switcher.
5. Restart manually and confirm the chosen images survive.

If filename search works but JSON-only tags do not, check the manifest depth
first, then JSON syntax and exact relative file paths. An unreadable or
malformed manifest falls back to file/folder inference. Unsupported, empty or
oversized images are skipped. A file that cannot be decoded is not useful art
even if its extension says PNG; valid neighbouring images should still work.

Test deliberately malformed files only in a separate disposable pack. Do not
damage your normal pack to test recovery.

## 6. Move, Remove or Share Packs

Custom packs are local to each Zen profile. Tabs and Spaces store a stable profile-local
resource URL. Older Zen releases require folders to store the equivalent local file
URL so their nested SVG can render the image; the picker performs that
conversion automatically. Neither form uploads or synchronizes the image file
itself. If a selected file is missing, tabs and Spaces use a generic image icon and
folders restore their folder shape; putting the file back at the same path
restores it on the next picker scan.

The authoritative `zen-icon-packs` directory is **outside** Sine's replaceable
mod directory. Normal Sine updates and uninstall do not remove it. Rollback
changes mod code only and leaves the current artwork there, including additions
and deletions. Include this directory in your normal profile backup.

### Upgrading an Older Local Test Build

Earlier unpublished test builds used `chrome/sine-mods/zen-icons-local/custom`.
RC4 copies that legacy tree to `zen-icon-packs` once, leaving the originals
untouched. It also updates old selected tab, Space and folder paths. Category
JSON paths inside the old tree are updated in the copy; paths to independent
external images are unchanged. A private migration marker prevents later scans
from bringing back images you intentionally deleted from the new directory.

**Before a stock-Sine update of an old local test build**, use the guarded
offline installer from the separate release ZIP, then run that profile once to complete migration.
The installer preserves the legacy custom directory until the new code can
copy it. Stock Sine replaces the entire old mod folder before new code starts;
new code cannot recover artwork that an earlier update already deleted. Use
your original packs or a backup if that has happened.

The GitHub mod folder does not contain that optional installer. Alternatively,
before updating, back up the old `custom` directory, then copy its **contents**
(the pack folders, not an extra `custom` wrapper) into `zen-icon-packs` directly
inside the profile, alongside `chrome`. Do not overwrite a different file
already there. After updating, RC4 reads that external copy and rewrites old
selected tab, Space and folder URLs to it. If category JSON contains absolute
paths pointing into the old mod directory, change those to the new location
before updating, or use the offline installer route for automatic rewriting.
Pack-relative JSON paths need no edits. Keep the backup until you have confirmed
your images and tags in the new picker.

If the two directories contain different files with the same relative path,
migration stops without overwriting either. Rename or move the conflicting
file yourself, then restart; diagnostics identify its relative path in the
browser console. Keep the hidden migration marker intact after migration.
Interrupted copies use an ignored temporary suffix, never a partly written
selectable icon. The original files remain available for recovery.

The guarded installer returns a specific backup path for code rollback and
refuses locked profiles or incomplete packages. It does not roll back or delete
the external artwork directory. Legacy/incomplete backups require inspection;
they are not silently selected.

Renaming a selected image or its pack changes its stored path. Reselect the
image afterwards, or restore the original path. Before removing a pack, reset
icons that still use it. Disable/re-enable is not uninstall: saved choices are
retained, but presentation requiring the mod may disappear while it is off.
Uninstall also retains the external artwork, but removes the mod's resource
registration: custom tab/Space icons and packaged Lucide choices need the mod
enabled again to render. Retained files do not mean rendering without the mod.
Remove your artwork directory manually only if you actually want to delete it.

For sharing, distribute the pack folder with `icons.json`, its images, a short
README and licence/attribution information. Do not include your browser profile,
absolute local file paths or unrelated personal files. Tell recipients to copy
the actual pack folder directly into their own Custom Icons Folder.

## Authoring Checklist for an AI Assistant

- Produce a self-contained pack folder; do not modify the user's browser profile.
- Use only supported local raster formats and respect the file-size limits.
- Organise by one clear primary category; use tags for overlapping concepts.
- Reuse existing category spelling when intentional merging is desired.
- Keep the manifest directly in the pack root; use exact relative paths.
- Supply concise names, relevant synonyms and Unicode or local-image category
  decorations. Prefer `Category Icon.png` or a pack-relative JSON path.
- Check JSON syntax and that every metadata path names an actual file.
- Include installation, attribution and small, distinctive test-search examples.
- Do not claim a pack was tested in Zen merely because its JSON parsed.
- Do not invent support for SVGs, remote URLs, nested manifests or automatic
  file-path migration. Do not include absolute personal paths in shared packs.
