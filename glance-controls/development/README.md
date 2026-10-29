# Developing Glance Controls

The files in the parent folder are the complete mod; there is no build step or package manager. This folder contains the native-browser tests and screenshot capture code. Development does not require the original author's machine or browser profile.

## Where changes go

| File | Responsibility |
| --- | --- |
| `chrome.css` | Side, scaling, visibility, spacing, and the CSS-only position fallback. |
| `copy-url.uc.js` | Copy URL button, current Glance URL, feedback, and precise centring of the visible stack. |
| `button-order.uc.js` | Order, the consolidated settings list, and its visibility checkboxes. |
| `preferences.json` | Sine's declarative settings and defaults. |
| `theme.json` | Stable identity, script registration, version, and update source. |

Keep the internal ID `glance-button-position` and the `glance.position.*` preference names stable. The display name and folder were renamed to **Glance Controls** without resetting installed preferences. The native button container is `.zen-glance-sidebar-container`; avoid selectors based on Sine's displayed mod name.

The percentage positions the centre of the visible stack along the Glance panel, with a 15px edge margin. CSS alone uses the available travel distance. Copy URL must read the currently displayed browser URI, including navigation after opening Glance, and must touch the clipboard only when clicked. Hidden buttons remain in the settings order and leave no gaps in the visible stack.

## Run native tests

Use PowerShell 7 on Windows, Zen, and a **clean disposable profile with Sine installed**. Close that profile before running tests. Pass its `chrome` directory as `-SineChromePath`; the runner copies only `JS` and `utils`, never preferences, cookies, tabs, or passwords. Do not supply an everyday profile: unrelated user scripts in its `JS` directory would also be copied.

The original test baseline was Zen **1.22.2b–1.22.3b**, Sine **2.3.4.1c**. Sine's source is available at [the pinned v2.3.4.1c commit](https://github.com/CosmoCreeper/Sine/tree/b455623296b784c765786d680e69e4b7645f66e9); use its installation instructions to prepare the clean profile. Newer browser or Sine versions may require adapting the tests to their native APIs. The runners depend on Sine's `Sine.init();` entrypoint, `SineAPI`, and userChrome module loader.

From the collection checkout, set these paths to your own clean installation, then run:

```powershell
$sineChrome = 'D:\ZenTestProfile\chrome'
$zen = 'C:\Program Files\Zen Browser\zen.exe'
./glance-controls/development/tests/run.ps1 -SineChromePath $sineChrome -ZenPath $zen
./glance-controls/development/tests/run.ps1 -SineChromePath $sineChrome -ZenPath $zen -TestModule ButtonOrderTest.sys.mjs
```

- `GlancePositionTest.sys.mjs` exercises geometry, scaling, visibility, ordering, and copying. It substitutes the clipboard service so the test does not overwrite the system clipboard. Add `-HotInstall` to exercise initial activation.
- `ButtonOrderTest.sys.mjs` operates Sine's real Configure dialog, including checkboxes, arrows, keyboard interaction, and reopening the settings.
- `GlanceInUse.sys.mjs` opens a neutral local example page in native Glance and captures `left-centred.png` and `right-compact.png`. Select it with `-TestModule GlanceInUse.sys.mjs`. Review images before replacing the published screenshots.

Each run creates a fresh profile under `glance-controls/.backup-scratch/`, disables automatic updates in that profile, and exits only the process it launched. Results and images are inside the run directory. Retain a useful result or accepted image, then delete the disposable run. Scratch is ignored by Git; that does not guarantee exclusion by a backup service.

## Installation and migration tests

`tests/run-migration.ps1` exercises Sine's actual archive extraction and mod registry. By default only the network transport is replaced with local archives. It stages just the catalogue and Glance runtime files, not a whole development checkout.

For `-LegacyPackageRoot`, obtain the seven mod files from the [standalone v0.4.0 commit](https://github.com/YiftahCooper/zen-glance-button-position/tree/852ca128eea67a933a2732a52009b171e3e80f45): `theme.json`, `chrome.css`, `preferences.json`, `copy-url.uc.js`, `button-order.uc.js`, `LICENSE`, and `README.md`. Save them in a scratch folder and pass that folder explicitly.

```powershell
./glance-controls/development/tests/run-migration.ps1 -SineChromePath $sineChrome -ZenPath $zen -LegacyPackageRoot './.backup-scratch/legacy-glance'
```

The checks cover fresh installation, the inert root catalogue, migration without duplicate IDs, preference preservation, update source, and script paths. `-RuntimeTest` selects a runtime module. `-Live` installs the currently published package over the network, so it does **not** verify unpublished edits. `-Live -Bridge` also checks updating the legacy installation through its published compatibility metadata.

## Release checks and known pitfalls

Before publishing a behaviour change, run the affected native test and check the actual UI. Check both sides, top/centre/bottom, a decimal height, small/large sizes, hidden buttons, reordering, reopening Configure, and Copy URL after navigation. Browser geometry and Sine lifecycle behaviour cannot be proved by a text-only test. Document the browser/Sine versions actually tested.

The original Left Side Glance Buttons failure came from an installed Sine entry with empty `style.chrome` and `style.content`: no stylesheet was included. This mod declares `chrome.css` explicitly. A later rename required removing display-name-dependent CSS selectors. Clearing a string preference alone can leave Sine's generated CSS variable behind until rebuilding; tests reset values explicitly.

Keep `theme.json` pointing to the `glance-controls` folder URL, list scripts explicitly, and bump its version and `updatedAt` for runtime releases. The collection's root catalogue files are intentionally inert: preserve their installation guard. Do not publish local profile contents, installation backups, logs, credentials, or generated scratch files. Documentation-only changes do not require a mod version bump.

The original source tests recorded 128 geometry/copy checks and 20 settings checks. Later native migration and screenshot runs used Zen 1.22.3b. Those historical results describe those versions; rerun relevant checks after browser, Sine, or runtime changes.

On 2026-10-29, the portable runners passed on **Zen 1.23.4b / Sine 2.3.4.1c**: 128 geometry/copy checks, 20 Configure checks, and 13 local installation/migration checks followed by the 20 Configure checks. The migration fixture used the original local v0.4.0 package. This checked the local package and native UI; no live network update or everyday-profile changes were part of that run.
