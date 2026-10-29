# Third-party source fixtures

These files are small source inputs needed to reproduce regressions without the
original developer's computer. They are not complete applications or profiles.
Existing notices remain in the files. The included [MPL-2.0 text](LICENSE-MPL-2.0.txt)
applies to the covered native/Sine/Zen Icons code; this document does not relicense
unrelated original material.

- **Zen/Gecko native captures:** `fixture-project/artifacts/native-20260915/`,
  `fixture-project/artifacts/round3-review/native/`, the retained native vertical-tab
  CSS and `tests/fixtures/zen-*`. MPL-2.0; upstream
  https://github.com/zen-browser/desktop and https://github.com/mozilla-firefox/firefox.
  Native identities, entry paths, hashes and source/build stamps are retained in
  the fixture comments and JSON. Do not normalise files whose exact bytes are tested.
- **Sine settings implementation:** `fixtures/sine/preferences.sys.mjs` and
  `settings.css`, read from the implementation used by historical UI regressions.
  MPL-2.0; upstream https://github.com/CosmoCreeper/Sine. These are code and stylesheet
  fixtures, not a user's preference values, registry or browser configuration.
- **Zen Icons integration fixtures:** minimal stylesheet, glyphs and folder
  presentation source under `fixtures/zen-icons`. Existing MPL notices apply;
  source project https://github.com/YiftahCooper/Zen-Mods/tree/main/zen-icons.
  Lucide-derived artwork retains its in-file ISC notice where supplied; upstream
  https://github.com/lucide-icons/lucide. No personal custom icon pack is included.
- **Frozen Better Zen Folders baselines:** selected 0.3.6 runtime and 0.3.11 CSS
  under `fixture-project/artifacts/releases`. They support explicit baseline or
  historical geometry comparisons only; current production code is always read
  from `../../better-zen-folders`.

Synthetic test values such as `PRIVATE_*`, `private.invalid`, `example.test`,
`C:/Users/PRIVATE` and made-up folder names intentionally test redaction, invalid
inputs or privacy boundaries. They are not supplied credentials or personal data.
The historical private screenshot and raw diagnostic recordings are excluded.
