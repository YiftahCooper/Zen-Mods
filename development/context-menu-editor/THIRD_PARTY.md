# Sources and notices

The controller and settings are new code. The older Zen Context Menu mod by
KiKaraage informed the feature design; no source from its fixed CSS ordering
implementation is included.

The icon assets and command mappings come from
[Context-Menu-Icons](https://github.com/Starry-AXQG/Context-Menu-Icons/tree/71750239d6fd114800989d91f2567cd4c47635e9),
revision `71750239d6fd114800989d91f2567cd4c47635e9` (manifest version 2.7.5.2).
Its repository MIT notice is preserved in
`licenses/Context-Menu-Icons-MIT.txt`.

The library contains 138 copied FluentUI SVGs and 147 references to artwork
already bundled with the installed Zen browser, plus the QR glyphs described
below. The upstream
CSS supplies the exact command/localization mappings. Broken upstream references
to `sidebars-right`, `edit-theme` and `new-tab` use existing `sidebar-right`,
`color` and `plus` artwork, respectively. The full upstream styling, settings and
folding script are not included.
Local mappings assign Back, Forward, Reload and Stop to existing artwork in
both packs. Move to Folder uses a folder glyph, and Better Zen Folders' Move
to Space uses the move-tab glyph instead of a generic menu fallback. These
overrides are local to Context Menu Editor.

The Share submenu rows map by localization ID: Copy Link to `link`, Create QR
Code to a new `qr-code` entry and More Options to `share`. CMI has no QR
glyph. The FluentUI pack's `assets/packs/fluent/qr-code.svg` is Microsoft's
[Fluent UI System Icons](https://github.com/microsoft/fluentui-system-icons/tree/e15fc0de25fab983e3e42bac8798be69a85c23bf)
`ic_fluent_qr_code_20_regular.svg` at revision
`e15fc0de25fab983e3e42bac8798be69a85c23bf`, recoloured to `#667b91` like the
other Fluent files and sized to 16 px. Its MIT notice is in
`licenses/FluentUI-System-Icons-MIT.txt`; `assets/catalog.json` records its
source, original and adopted SHA-256 values. The ZenUI pack references the
browser's own share-panel artwork, `chrome://browser/content/sharing/qr-code.svg`,
which is not copied; a missing resource uses the local Fluent QR glyph.

Fluent SVG context paint is replaced with `#667b91`, and contextual opacity with
`1`, so it can render in the HTML gallery and native menu decorations.
`assets/catalog.json` records the source archive checksum, original and adopted
Fluent asset SHA-256 values, mappings and substitutions.

Representative CMI ZenUI bodies match historical Zen files in its Nucleo
directory. That directory's
[Nucleo notice](https://github.com/zen-browser/desktop/blob/adbc7876b1b3fa26961701626319fbb65fb62fd8/src/browser/themes/shared/zen-icons/nucleo/nucleo-copyright-notice.html)
restricts redistribution. The mod therefore includes no copied ZenUI drawings;
it uses `chrome://browser/skin/` resource URLs inside Zen. This does not apply the
collection's MIT license to the browser's artwork. `assets/zen-browser-icons.json`
records 120 matching filenames and 27 semantic aliases verified in Zen 1.23.2b,
build 20261009073723. These are the installed browser's current drawings, which
may differ from the older CMI bodies. A missing resource uses a local Fluent
fallback. Browser artwork remains part of Zen's existing distribution.

The CMI repository provides one MIT notice for its mixed collection. Independent
per-drawing ownership for its FluentUI folder remains unresolved; the pack name
alone does not establish that every drawing is from Microsoft. The collection's
notice is preserved without asserting a separately verified Microsoft lineage.
