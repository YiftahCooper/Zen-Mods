# Zen Icons — Sine mod

This folder is the source of the Zen Icons mod published at `zen-icons/` in this
repository. It keeps the layout of the Zen browser source tree it was developed in,
so the paths match Zen's own files:

- `src/zen-icons-sine/` and `sine/zen-icons/`: the mod itself.
- `src/zen/common/emojis/`: the icon catalogue modules.
- `src/browser/themes/shared/zen-icons/common/selectable/`: Zen's own picker icons
  (MPL-2.0, from Zen). The tests check that the catalogue covers every one.
- `zen-desktop-patch/`: an earlier version of this work as changes to Zen itself,
  kept for reference. `BASE` is the `zen-browser/desktop` commit the patch applies to.
- `docs/history/`: notes from the September 2026 audit and repair rounds.

You do not need to compile Firefox. To build and test:

```sh
npm ci                  # installs the pinned lucide-static package
npm run generate:icons  # writes the Lucide icon assets (not stored in git)
npm run check:sine      # builds dist/sine/zen-icons and runs the test suite
```

To publish, copy `dist/sine/zen-icons/` (without `package-inventory.json`) over
`zen-icons/` at the repository root, and bump `version` and `updatedAt` in
`sine/zen-icons/theme.json` and the header of `sine/zen-icons/ZenIcons.uc.js`.

- `npm run test:icons` runs helper, runtime lifecycle, catalogue and synthetic
  Windows deployment regressions. Node's experimental VM-modules flag is used
  only by the offline runtime fixture; it is not required by Zen.
- `npm run build:sine` produces `dist/sine/zen-icons`, including a SHA-256 file
  inventory checked by the installer.
- `npm run check:sine` builds and runs the full icon suite.
- `node scripts/generate_zen_icon_catalog.mjs --check` verifies the pinned Lucide
  assets/catalogue without rewriting them.

See [custom packs](docs/zen-icon-packs.md) for supported images, naming, categories
and optional tags. No account or network service is needed. Images retain colour
and aspect ratio; do not add custom SVGs.

## Compatibility and testing

Zen Icons owns icon and outline selection. Better Zen Folders owns folder colour
and the native Move/Add Tab to Folder menu. Zen Icons consumes the shared colour
variable/attribute, never a second colour database. Tab, folder and space picker
targets are kept separate. The native `closeOnSelect` option applies consistently
to all providers.

`scripts/deploy_sine_mod.ps1` requires PowerShell 7, an existing Sine profile and
a complete generated package. `-DryRun` checks inputs without installing.
Installation refuses a locked profile. It stages and verifies a candidate before
swapping directories, retains the previous generation, and updates only this
mod's Sine entry/import. The result returns a specific backup path.

`-Rollback -BackupPath <returned path>` restores that operation's predecessor
code, preserving CURRENT custom images and unrelated mod settings. Legacy and
incomplete backups are not silently selected. An interrupted attempt is retained
with its phase and inventory; further installs refuse to obscure that evidence.
For a verified `ready` attempt, `-Recover -BackupPath <attempt path>` restores
its predecessor without requiring the original package. Earlier incomplete
`preparing` attempts require inspection; the utility refuses to guess.

The optional `tests/live/ZenIconsLiveTest.sys.mjs` harness is a separate, mutating
browser test. Offline success does not claim that harness ran or that the popup's
visual layout was accepted. Do not launch it automatically on the user's desktop.

## Round 1 follow-up (September 2026)

Tab and space Lucide selections use generated `display-lucide/` assets with
their own light/dark paint. Folder selections retain the original recolourable
assets, so Better Zen Folders remains the only owner of folder colours. Existing
saved Lucide choices also receive the missing stroke context in native tab and
space image elements; saved user values are not migrated.

Known folder callers offer emojis as colour-preserving SVG image values. The
same native font availability limits apply as for ordinary Zen emojis. Default
previews distinguish tab squares, space circles and native folder shapes. All
selections go through the callback bridge rather than hidden native buttons.

Round 1 repair evidence is in `artifacts/round1-2026-09-14/REPAIRS.md`.
The earlier broad audit is in `artifacts/audit-2026-09-06/REPAIRS.md`.

## Round 2 candidates (0.2.x)

Sine Mods now exposes **Zen Icons settings**, with separate provider defaults
for tabs, folders and spaces. All providers and categories start enabled.
Category visibility can be changed using the checkboxes beside category names
in Filter. Clicking a category name still jumps to it and reveals that category.
Filter changes last for the current picker opening only; **Save as Defaults**
stores them for that picker type. The settings panel also exposes the hidden
category list as comma-separated names, including custom categories.

The separate tab **Reset Icon** button, with a reset arrow, removes the custom override and restores the
previously remembered native favicon or the browser's local favicon cache.
The tab **Default** section contains only the explicit, persistent no-website
square as an image-only tile, with **Default Tab Icon** as its hover/accessibility
label, using Zen's native theme-aware placeholder styling. The Default section
stays pinned for every query, including `default`; it is not a tagged catalogue
entry and is not duplicated in the search results. Previously selected
blank squares use that same corrected presentation; no reselection is needed.
Reset never reloads the page or guesses a network favicon URL. If neither a
remembered icon nor a local cached favicon exists (for example a previously
customized private tab), it leaves the native no-icon fallback until the page
supplies an icon again. Space Default is Zen's small grey dot.

Optional isolated layout tests use `ZEN_ICONS_PLAYWRIGHT_MODULE` pointing to an
installed Playwright module. They run headless, block network requests, and
never connect to or launch the user's Zen profile. Without the variable those
layout tests report explicit skips; candidate verification runs them enabled.
On Windows set `PLAYWRIGHT_BROWSERS_PATH` to the existing browser cache when
the execution environment redirects Local AppData. Set `ZEN_ICONS_BZF_ROOT`
to a Better Zen Folders checkout to include both-load-order and RTL interaction
fixtures. Test-generated packages and profiles use `.backup-scratch/`.

## Release Candidate 0.3.0-rc.4

RC4 keeps custom artwork in `PathUtils.profileDir/zen-icon-packs`, outside the
directory stock Sine replaces on update. A small `chrome.manifest` maps that
directory for native tab/Space icons; Zen's native tab setter deliberately
rejects plain `file:` icon URLs, so its security allowlist is not overridden.
Folders keep their native local-file rendering. Legacy local-test packs and
saved choices migrate once without deleting originals or overwriting conflicts.
See the custom-pack guide's upgrade warning **before** stock-updating an older
local test installation. Uninstall retains artwork but does not promise native
icon rendering without the mod's resource registration.

RC3 also corrects a version-drift mismatch: the Default tab choice and preview
now use installed Zen 1.23's literal native blank asset and toolbar-element
background, not the older accent-colour/half-opacity approximation. Native
tests compare both against a real no-website tab in the same window. The
neutral-colour option still applies independently when selected.

RC2 fixes Filter popup keyboard focus/return and Default heading overflow at
narrow sidebar widths. Native keyboard checks use trusted WebDriver actions,
not synthetic DOM key events. Further native scenarios cover repeated picker
use, two browser windows, missing-file recovery, corrupt artwork, and actual
PNG/JPEG/WebP/AVIF/ICO decoding. These checks run in newly created headless
profiles only; they never attach to an existing browser or reuse its profile.

Category names now merge across packs regardless of case or repeated/outer
spaces. The reserved native Default controls remain separate; a pack category
named Default appears as **Default (Custom)**. Category images can come from a
`Category Icon` raster file or a local JSON image path, with bounded loading and
fallback decoration. See the included custom-pack guide for exact precedence.

**Use Space Colour for Default Tab Icons** starts enabled. Turn it off for
neutral default squares in both the picker and tab strip. Folder colour policy
continues to belong to Better Zen Folders.

**Double-Click an Icon to Open the Picker** starts disabled. When enabled it
applies to tab, folder and Space icons, including Space switcher icons. Normal
tab selection remains immediate. A single click on Zen's reset-to-pinned-URL
overlay waits 500 ms so a double-click can open the picker without resetting
the page. Modifier clicks retain native behaviour. URL-pin badges and Sticky
controls remain separate. Pending resets cancel on drag, tab movement,
navigation, close, or mod teardown.

Tabs, Folders and Spaces retain independent picker defaults. Settings headings
are larger; Save as Defaults also refreshes open Sine settings controls without
overwriting a focused text-field draft. No website is reloaded to restore a
favicon, and no network icon repository or account is required.
