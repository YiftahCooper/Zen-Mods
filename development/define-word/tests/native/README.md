# Isolated popup probe

`popup_probe.py` uses Python's standard library and the Marionette wire protocol
directly. No geckodriver, package installation, or everyday profile is needed.
It starts **a new headless Zen process only when `--launch` is supplied**. Obtain
explicit authority for that isolated native run before invoking it.

PowerShell example from the Zen workspace (choose a new output name for each run):

```powershell
python .\Zen-Mods\define-word\tests\native\popup_probe.py --source .\Zen-Mods\define-word --output .\Zen-Mods\define-word\tests\native\popup-report.json --launch
```

The executable is `C:\Program Files\Zen Browser\zen.exe`. The runner creates a
unique profile under `.backup-scratch/dw-native/` in the Define Word folder
and uses localhost Marionette port 2831. It refuses to run if that port is already
occupied, checks the active browser profile before injecting the fixture, and
does not overwrite an existing report. It hides the child process window and
requests headless mode. It never changes a normal profile or installs the mod.

The default fixture loads `src/popup.mjs` using an isolated `resource://dw-test/`
substitution, adds the supplied stylesheet, and performs 20 open/close cycles.
The JSON report records panel outer geometry, shell/card geometry, viewport,
source hashes, process/profile identity, and the browser log path. It also probes
drag/resize with Gecko's bundled `Event.synthesizeMouseAtPoint` helper and records received events.
These are generated trusted Gecko events, **not hardware mouse input**; inspect
event delivery and geometry changes before claiming the interaction passed.
Headless results are not everyday-profile or visible native acceptance.

`--script path.js` replaces the default fixture with a UTF-8 async-function body
receiving `ctx`: `{window, Services, popup, fixture, snapshot, pause, mouseDrag, nativeEvent, setSavedSize}`.
Return a JSON-serializable result. The popup and stylesheet are removed on fixture
completion. This option executes privileged chrome code; use only reviewed narrow
fixtures within the authorized isolated test. Dictionary network requests are not
performed by the default fixture; fresh-browser background traffic is not blocked.

Profiles and browser logs are disposable and are regenerated on each run. Preserve
useful JSON reports outside `.backup-scratch` and retain any custom fixture there
as well. Scratch backup exclusion has not been verified; this runner does not
modify backup configuration or automatically delete any profile.

`popup_interactions.js` verifies trusted header drag, all eight resize handles,
stationary initial button-down, mouse text selection, 13.5px computed font sizes,
large saved-size anchor clearance, password-field appearance and a trusted reveal
click. It also exercises the production controller, lookup service, and Free
Dictionary provider with an injected transport that stalls indefinitely and the
real 10-second timeout. This does not establish live provider availability.
`popup_anchor_cases.js` checks short, overflowing, and large saved-size popup bounds
against a supplied synthetic selection rectangle. Reports containing a `checks`
object cause exit status 1 if any check is not true.

The default repeated-open fixture sets a saved width through a synthetic keyboard
event before measuring the 20 cycles. That step is fixture setup, not proof of a
trusted keyboard interaction. Use `popup_interactions.js` for trusted input evidence.

`popup_full_entry.js` and the runner's optional `--content-page`, `--select-text`,
and `--zoom` arguments are an experimental full-entry integration path. The fixture
registers a chrome mapping inside the scratch profile, loads the built entry, and
would exercise its real selection actor and shortcut with deterministic dictionary
HTTP. On the tested Zen 1.22.3b build, three adapter attempts failed before fixture
execution at Marionette navigation with a discarded browsing context. The retained
`dw-031-native-full-entry-zoom125-v1/v2/v3.json` reports are failed setup evidence,
not actor, controller, or zoom verification. Do not describe this fixture as passing.

Protocol reference: <https://firefox-source-docs.mozilla.org/remote/marionette/Protocol.html>.
