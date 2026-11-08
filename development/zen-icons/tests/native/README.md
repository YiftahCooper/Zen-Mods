# Disposable Native Checks

`probe.py` always creates a new synthetic profile under project-local
`.backup-scratch/native/`. Its `--sine-source` input supplies only the Sine
bootstrap (`JS` and `utils`); no browsing/session/profile data is copied.
`--package` defaults to `dist/sine/zen-icons` and its complete inventory is
verified before use. `--bzf-source` must identify a frozen BZF package/source
with `theme.json`, `preferences.json`, `chrome.css`, and its script.

The driver launches only headless Zen with a dead loopback network proxy.
It never attaches to an existing process. `--restart-script` restarts only
the profile created by that invocation. `--pointer-check` and
`--keyboard-check` issue trusted WebDriver actions into that headless browser,
not desktop input. Explicit authorization for these disposable browser tests
is required; it does not authorize any everyday-profile access.

Scenarios:

- `candidate.js`: standalone tab/folder/default/gesture selection.
- `integration.js` and `restart.js`: BZF colour/outline, custom packs, Space
  selection, native SessionStore persistence and restart.
- `settings.js`: real Sine settings, saved picker defaults, disable/re-enable.
- `keyboard.js` with `--keyboard-check`: native Tab, Enter, Space and Escape,
  Filter focus hand-off and focus return, search and selection.
- `robustness.js`: 25 repeated picker cycles, callback isolation, missing-file
  fallback/recovery, malformed JSON, two windows and shared preferences.
- `layout.js`: native 200/250/500px sidebar geometry in LTR and RTL.
  `--ui-scale 2` additionally tests profile-local 200% chrome UI scale; this
  does not change the desktop's display settings or prove page zoom behaviour.
- `formats.js` with `--custom-fixtures .backup-scratch/native-image-fixtures`:
  real decoder, containment and selection tests for PNG, JPG/JPEG, WebP,
  AVIF and ICO, plus malformed artwork. Generate these deterministic synthetic
  fixtures with `images.py`, using Pillow 12.3.0. No remote assets are used.
- `controls.js` with `--controls-check`: trusted URL-pin and Sticky pointer
  actions remain separate from icon gestures, including Sticky cancellation.
- `compatibility.js`: native Move to Folder composite icon geometry, outline
  and colour. It deliberately opens soon after an outline change to detect
  a BZF snapshot freezing a transient animation value.
- `private.js`: private-window activation and tab-choice isolation inside the
  same disposable process. It waits for the final browser document, not the
  new window's transient `about:blank` document.
- `defaults.js`: Default preview/selection paint against a real native blank
  tab, neutral-colour equality, and Reset restoring the actual Settings icon.
- `folder-recovery.js`: deleting/restoring chosen folder artwork temporarily
  reveals the safe outline without erasing identity or the outline preference.
- `persistent.js`: one-time legacy migration, late-restored native choices,
  real IOUtils retry, deletion with retained legacy originals, and an uncached
  external-only resource after the old custom directory is removed.
- `stock-update.js` with `--stock-update-fixture` and
  `--restart-script tests/native/stock-update-restart.js`: unchanged native
  Sine syncModData, ZIP extraction, monorepo normalization, rebuild, restart and
  uninstall. Only archive transport is replaced with the exact local package
  in a synthetic monorepo ZIP. This is not a real GitHub install proof; the
  publisher must separately qualify the published GitHub folder/archive.

Result JSON and routine browser logs stay in each scratch run. Selected release
results and the exact package identity belong in the release verification
record, not every attempt. Headless native tests do not establish subjective
visual acceptance, screen-reader compatibility, unknown future Zen versions,
or absence of all possible defects.
