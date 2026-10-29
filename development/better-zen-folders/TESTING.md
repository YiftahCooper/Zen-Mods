# Reproducing development checks

## Requirements

Node.js 24+, Python 3 (original package checks used Python 3.14), and PowerShell 7
for Windows staging checks. Rendering dependencies are Playwright **1.62.1** and
pngjs **7.0.0**. Install them from this directory with `npm install --ignore-scripts`,
then install Chromium with `npx playwright install chromium`. Rendering tests use
isolated Chromium surrogates with requests blocked; they never attach to Zen.

`npm test` creates a fresh scratch project and runs every `*.test.mjs`. It resolves
local Playwright automatically. `BZF_PLAYWRIGHT_MODULE` can point to an external
Playwright installation; `PLAYWRIGHT_BROWSERS_PATH` can select an existing browser
cache. Both are optional machine-local configuration, not repository constants.

`npm run test:python` runs the 16 package/documentation contract checks. Override
`BZF_PYTHON` when the Python executable is not named `python` on Windows or `python3`
elsewhere. `npm run test:prepare` assembles inputs without executing tests.

## Proof boundaries and platform checks

- An absent historical screenshot is an explicit skip. Its original personal
  image is intentionally not public. Setting `BZF_ROUND10_SCREENSHOT` enables that
  historical measurement locally; ordinary product regressions still run without it.
- Installed-archive qualification is opt-in: set `BZF_CHECK_INSTALLED_ZEN=1`
  when intentionally comparing an installed Zen or explicitly supplied archives.
  The normal fixture suite does not require Zen. An opt-in missing archive or
  unreviewed source identity fails; it is not silently skipped.
- Windows-only installed-archive/staging checks are platform guarded. Other
  operating systems cannot claim those results from the reduced suite.
- The installed Zen receiver guard accepts only reviewed whole-entry hash pairs.
  Native `moveTabTo` remains replayed byte-for-byte. If the browser auto-updated,
  inspect the relevant archive methods before adding a new identity fixture.
- PowerShell staging checks use `pwsh` on PATH, or explicit `BZF_PWSH`.
- Native archive paths can be supplied via `BZF_NATIVE_ROOT_OMNI` and
  `BZF_NATIVE_BROWSER_OMNI`; ordinary installation defaults are non-personal paths.
- Frozen native, Sine and small Zen Icons source fixtures are checked in. They are
  implementation inputs, not a saved browser profile. See THIRD-PARTY.md.
- Historical proposal/fault-injection environment switches remain opt-in. Some
  intentionally exercise a rejected baseline or expect failure; they are not the
  normal release command. Frozen 0.3.6/0.3.11 inputs exist for those comparisons.

The suite writes renders, staging profiles and optional evidence under its fresh
scratch project. These outputs are reproducible and must not be committed. A
technical verification summary and changed source/tests are normally sufficient.

## Disposable native Zen probes

`tools/native/run.mjs` retains the 0.3.26 folder-plus and earlier Settings-homepage
reproducers. It requires an installed Zen executable and a clean disposable Sine
bootstrap: install Sine in a new blank test profile, close that instance, and point
`BZF_SINE_BOOTSTRAP` to its `chrome` directory containing `JS` and `utils`. Never use
an everyday browser profile. Only bootstrap code is copied; history, cookies,
session files and user preferences are not copied.

Run `node tools/native/run.mjs folder-plus.js` from this directory. The runner
creates a new owned profile under `.backup-scratch/native`, installs the current
repository package there and serves synthetic pages on loopback. The base driver
checks the returned Marionette profile identity and quits only its own process.
External browser traffic is blocked by a dead proxy with a loopback exception.
Raw local receipts/logs may contain machine paths; keep them private.

Optional controls:

| Variable | Meaning |
| --- | --- |
| `BZF_ZEN_BINARY` | Installed Zen executable; default is the ordinary Windows installation path. |
| `BZF_CANDIDATE` | Another explicit package directory, for a baseline comparison. |
| `BZF_WITH_ICONS=1` | Add the repository's current Zen Icons package to the fresh profile. |
| `BZF_TEST_PINS=0` | Disable optional folder URL-pin separation in that fresh profile. |

`folder-plus-baseline.js` is the simple creation/frame assertion; version 0.3.25
should fail it. `settings-homepage.js` exercises the unchanged Sine homepage
handler against a synthetic disabled mod entry. A clean bootstrap may use a
different Sine version; record it and do not promote old qualification to a new
environment merely because the script starts.

Never turn a successful disposable test into authority to alter an everyday
profile. Saved preferences and real browsing sessions are outside these scripts'
scope. A native engine failure, harness failure and product assertion failure
must be recorded separately.
