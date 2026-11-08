# Development and disposable testing

Runtime installation and user settings are described in [README.md](README.md).
These instructions apply to this source checkout. Personal profile settings and
scratch fixtures are excluded from the runtime package.

## Repository layout

This folder, `development/context-menu-editor/` in `YiftahCooper/Zen-Mods`, is the
source of truth. `npm run build` produces the published Sine folder
`context-menu-editor/` at the repository root: it bundles `src/` into
`context-menu-editor.uc.js` and copies the runtime files (`theme.json`,
`preferences.json`, `style.css`, `README.md`, `LICENSE`, `THIRD_PARTY.md`,
`licenses/`, `assets/packs/`). The icon catalog is bundled without its import
provenance fields; `assets/catalog.json` keeps them here, and
`assets/zen-browser-icons.json` is an importer input only. Never edit
`context-menu-editor/` by hand. The build takes the version from `theme.json`
(the bundle header and the `style.css?v=` cache-buster). Each page keeps one
`<link>` to `style.css` although Sine's `chrome.css` also imports it: Sine adds
that copy as a user sheet, which Zen's author rules outrank. Without the link,
row spacing and decoration layout were lost in the native settings-integrity
stage (0.2.0 development run).
`npm run check` fails unless that folder holds exactly the built files, byte for
byte. Scratch output, dependencies and native-test profiles stay in the ignored
`.backup-scratch/` folder here. Keep every repository path at 100 characters or
fewer: Sine unpacks the whole repository inside the profile on update.

## Try the candidate

Double-click **Open Compatibility Test Browser.cmd** in this folder. It opens
a separate Zen instance with a new disposable profile, Sine, this candidate,
and eight local mods: Define Word, Better Pins, Better Zen Folders, Zen Site
Appearance Toggle, Search Engine Select, Zen Icons, Glance Controls and Even
Better New Tab Button. The editor's Configure dialog opens automatically.
Another tab contains a local sample website. All changes stay in this test
profile. Each launch starts over. Leave the launcher running and close the
test browser when finished. Your usual Zen profile and instance are not used.

**Open Disposable Test Browser.cmd** opens the smaller test with Define Word
only. **Run Disposable Zen Tests.cmd** runs the automated headless suite, closes
its own browsers and prints PASS or the failed stage and report path. It does
not leave a browser open for manual editing.

These launchers use the installed `C:\Program Files\Zen Browser\zen.exe`, Python,
the local mod source folders selected in `tools/native-sine-probe.py`, and the
pinned Sine source under `.backup-scratch/native/upstream/`. They are development
tools in this checkout, not files in the runtime ZIP. Zen's welcome screen and
the local mods' initial consent screens are skipped only in these fresh test
profiles. The compatibility website is served by the launcher on its own
loopback port until that test browser closes.

Optional hands-on checks:

1. Click a name to rename it, press Enter, then drag its handle. Clear its
   checkbox and re-enable it. Its position should stay the same. Check the
   result by right-clicking the sample page or its tab.
2. Open **Add**, create a submenu, name it and move commands inside. Add and
   rearrange a separator. Use a row's **⋯** to remove it, then **Menu options →
   Restore removed items** to recover it. Try Undo.
3. Click an icon. Try both packs, a wide or tall file, an HTTPS image, a pasted
   image and a symbol. Save the preview. In **Appearance**, try the icon switch,
   size, alignment and spacing. Secondary style controls are under **Spacing
   and style**.
4. In **Tab menu**, find the Better Pins and Better Zen Folders rows and expand
   their submenus. Their source tags should name the correct mod. Rename an
   item, change its icon, move it where allowed and run its original command.
   Create a disposable folder and right-click it to discover **Folder menu**.
5. Customize a Better Pins icon here. In Better Pins' own settings, turn its
   menu icons off and reopen the tab menu: the later setting should win.
   Save an icon here again: this editor should take control back. A name or
   arrangement you set here should survive an icon-only change elsewhere.
6. Move Define Word into a custom submenu. Select `browser` on the sample page,
   right-click and run the renamed command. Also try a disposable bookmark,
   Shift while right-clicking, and your preferred theme or display scale.

These checks are optional; the automated native suite covers the corresponding
editing, menu and compatibility behavior. Report the item, menu, source mod and
steps if something behaves wrongly. Physical input and the Windows system
clipboard remain separate from the headless automation described below.

## Development and verification

Use `npm run setup` once, then `npm run build` and `npm test`. Setup uses the
lockfile and puts dependencies under `.backup-scratch/deps`. `npm run check`
verifies generated runtime parity without writing it. Sine loads
`context-menu-editor.uc.js`; the retained source modules reproduce that file.

Run the current source, harness and native suites before selecting a release:
`npm test`, `npm run test:harness` and `npm run test:native` (add
`-- --keep-going` to run every stage, `--only a,b` for some, `--source DIR` to
test another runtime folder). `python -B
tests/native-harness.test.py` checks profile identity, foreign runtime copy/load
order, shutdown boundaries and rejection of incomplete or failed reports.
`python -B tools/run-native-tests.py` runs the complete native suite. Each stage
starts with its own fresh profile; the restart stage deliberately reuses only
its own newly created profile across two processes. The harness verifies exact
profile identity before mutating it and only closes its own Zen.

Version 0.2.0 was qualified with Zen 1.24.1b / Gecko 159 and Sine revision
`fb0bd4ca6af888f10648e126947f7d1f82228433`. Development uses Node 24.18.0,
Python 3.14.3, jsdom 26.1.0 and esbuild 0.25.10. Native stages use Marionette
ports 2875-2879 and need `MOZ_REMOTE_ALLOW_SYSTEM_ACCESS=1` on Gecko 159 (the
tools set it). Reports stay under `.backup-scratch/native/`; they are not kept
in the repository.

A fresh Zen 1.24 profile starts on a hidden placeholder tab (`zen-empty-tab`,
`display: none`) that has no bounds to right-click. The menu-behavior, restart
and legacy-import stages failed on 0.1.6 for that reason only; their scripts now
open a real tab first. Headless runs cannot prove physical input, the OS file
picker, the Windows clipboard or popup placement on a real display: use the
headed checks below for those.

The local-mod test copies unchanged runtime files from explicit local candidates
and verifies their bytes. It tests page, tab, folder and standalone mod menus,
source tags, ID-less recreated commands/submenus, icon precedence and reclaim,
native status, original node handling, and actual Better Pins, Better Zen
Folders and SAT commands. Mods without menu additions are loaded for coexistence,
not described as having editable context-menu items.

Define Word's separate tests use its actual selection actor, provider/parser and
popup from an editor-created submenu. Only dictionary HTTP responses are replaced
by a deterministic fixture; the hands-on launcher uses the real network.

The expanded native suite also checks:

- Fifteen actual page contexts: plain page, selection, link, mail link, phone
  link, image, linked image, canvas, text input, textarea, read-only input,
  password input, editable content, audio and video. Original command
  availability and handlers remain intact after customization.
- Actual bookmark and folder menus, including Open in New Tab, Open All,
  Copy and Delete on disposable bookmarks.
- Pointer-started dragging, hit-tested before/after/inside drops, held and
  continuously moving edge autoscroll, keyboard editing and movement, nested
  submenus, separators, removal/restoration, reset and Undo.
- All 285 gallery images, real HTTPS image retrieval, disk-backed file imports,
  aspect-fit transparent PNGs, oversized/invalid image rejection, pending and
  cancelled imports, symbols and error recovery. Native paste events and the
  Paste button use Gecko's isolated headless clipboard. Pasting into the URL
  field waits for Load image; image drafts wait for Save icon.
- Two browser windows, Sine unload/reload, corrupt-state recovery, and a complete
  Zen process restart. The second process reads the exact saved preference
  bytes and verifies custom names, Unicode/PNG icons, submenu structure, order,
  disabled/removed items, appearance and original native commands.
- Thirty repeated native menu openings with all eight compatibility mods,
  checking for duplicate decorations, leaked containers and lost edits.
- Dark appearance and 24 layout cases combining left/right direction, four
  browser zoom levels and three profile-only display scales. These include a
  223 CSS-pixel-wide viewport at 200% zoom and display scale 2.

The separate `tools/native-file-picker-test.py` check runs a fresh disposable
headed Zen instance because headless Zen has no OS file picker. It opens the
real Windows dialog, selects the retained SVG fixture through controls verified
to belong to that process, and checks trusted browser delivery, draft/save
behavior and the resulting transparent 32 × 32 PNG. It uses neither assigned
file lists nor global keyboard/mouse input. The browser and picker close at the
end. To reproduce this additional check, run:

```powershell
python -B tools/native-file-picker-test.py --launch --headed-hidden --script tests/native/file-picker-behavior.js --output .backup-scratch/native/new-file-picker-report.json
```

Use a new report filename for each run; existing reports are preserved.

The installed Gecko test helper starts a real pointer drag, then completes the
drop through trusted native test events; physical mouse release is a separate
proof boundary. Headless Zen does not provide an OS file picker, and its PNG
clipboard flavor is unavailable: the native clipboard image test uses PNG data
URL text. The source suite separately covers image-flavor paste with modeled
clipboard items and image Blob normalization. Windows system clipboard contents
are never accessed by these tests.

This is broad isolated-native coverage, not a guarantee for every future mod,
locale, external theme, input device or everyday-profile configuration. Native
test launchers never modify an everyday profile. Routine profiles and logs stay
under `.backup-scratch`.

RC3 fixes native HTTPS imports from Sine settings, ordinary text-field paste,
dedicated image-area paste, stale validation feedback, insertion-line and
continuous-drag autoscroll, and row overflow at extreme zoom/display scale.

The pinned Sine scratch input can be regenerated from its exact source commit
ZIP. Automatic updates are disabled in every disposable profile. No foreign mod
source is vendored into this package.

`npm run package` checks generated parity and atomically zips the built runtime
folder under `.backup-scratch/releases`. State uses
`extension.context-menu-editor.settings`. Invalid saved data disables
customization and offers an explicit reset with recovery. Unload restores
original nodes and removes the editor's owned containers and styles.

## Behavior rules that 0.2.0 settled

- **Owner settings (B1).** A mod owns only the exact preference names in its own
  `preferences.json`, each observed with its own observer (no `''` observer).
  Browser namespaces (`zen.`, `browser.`, `layout.`, `extensions.`, `ui.`,
  `widget.`, `network.`, `privacy.`, `toolkit.`, `devtools.` and the others in
  `src/owner-settings.mjs`) are never a mod's. No preference families are
  inferred. Field hints come only from explicit words (icon, name/label, order,
  hidden/visible).
- **Provenance (B2).** A created row names a mod only when that mod's file is the
  innermost frame outside this editor and Sine's helpers. One creation hook per
  document survives Sine reloads and is reused, never stacked.
- **Share (B3).** Share is identified by its class, root and localization ID. If
  two exist, the one directly after SharingUtils' anchor (`context_moveTabOptions`
  or `context_shareSelectedTabs`) keeps the edits. Both icon packs map
  `tab-context-share-url` to `share`. The cause of the reported Share loss was not
  reproduced in disposable profiles; `tests/native/submenu-geometry.js` records a
  diagnostic for each case.
- **Share rows (0.2.1).** Gecko 159 dropped the artwork of SharingUtils' Copy
  Link and QR rows (Firefox bug 2009747). Those rows, and More Options, have no
  ID and are rebuilt on every Share opening, so they get no editor identity. The
  controller decorates only the exact class plus localization ID pairs in
  `SHARE_SERVICE_ROWS` (`src/registry.mjs`) inside the identified native Share
  menu, with exact `byL10n` mappings only. It does this in the normal pass and in
  the owner-only submenu path, paused and recorded so closing restores the rows.
  `tools/import-cmi.py` adds these mappings and the local `qr-code` entries.
- **Saved-state size (B4).** Settings up to 1 MiB / 40,000 records load. Saves aim
  for 512 KiB / 10,000 records: unedited remembered `mod:` rows go first, oldest
  first; edits are never dropped. Absent remembered rows are saved only once
  edited or moved, and each menu remembers at most 200 absent ID-less mod rows.
  Rows that are present but natively hidden keep their records, so native order
  is kept.
- **Owner writes across windows (B5).** A window announces the exact settings
  value it saves for an owner change (`context-menu-editor-owner-write`). Other
  windows treat that write as an owner change, not a user edit.
- **Browser popups (B6).** A popup from `browser.xhtml` is adopted only for rows a
  mod added to it; listeners do not count. Decisions wait until that markup has
  loaded. Popups the browser markup does not contain keep the earlier rule.

The runtime is published to `YiftahCooper/Zen-Mods` under `context-menu-editor`.
The repository keeps normal defaults. User preferences belong to each Zen profile. See
[THIRD_PARTY.md](THIRD_PARTY.md) for artwork provenance and notices.

The native launcher marks the installed Zen build/version seen only in each
fresh profile. This prevents Zen's update sweep from covering the tab hit target
in a hidden Windows test window; it does not disable ordinary animations.
`tests/native/menu-layout.js` checks full normal and Essential tab menus at the
OS display scale, actual icon decoding, empty side space, duplicate icon slots,
and native submenu adjacency before and after Sine reload. Use
`--headed-hidden` with `tools/native-sine-probe.py` for Windows popup checks.
`tests/native/appearance-slots.js` separately measures small/large icons,
alignment and gap changes, icons off, owner-controlled artwork, and the native
checkbox/radio slot's display and bounds.
