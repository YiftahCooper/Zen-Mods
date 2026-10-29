# Better Pins — 0.1.0-candidate.1

An experimental optional Zen/Sine mod that separates **where a tab lives** from **whether it has a saved reset URL**.

## Try the candidate

Double-click **Launch Better Pins Candidate.cmd** in this folder. It verifies the frozen candidate and Sine loader, creates a new disposable profile, and opens a visible Zen window with a local test guide. It never reuses, reads or modifies your everyday profile or `.test-profile-v2`. Each launch creates a new profile under `artifacts/manual/profile-*`; close its window when finished. The fixture blocks Internet browsing and contains local synthetic pages only. Its consent/startup settings are preconfigured because it contains no existing user session to migrate.

This launcher demonstrates standalone Better Pins with native Zen folders. The current Folders and Icons were also tested together through normal Sine in a separate automated disposable profile. They are not silently installed by the standalone launcher.

The launcher preparation and exact installed hashes were verified. The visible manual launch and your visual acceptance are the next user test; they are not reported as already accepted.

## What is implemented

- Upper and lower zones use Zen's existing containers and scroll independently. Drag the divider or focus it and use Up/Down, Shift+Up/Down, Home or End.
- **Pin URL**, **Unpin URL**, **Reset to Pinned URL**, **Edit Pinned URL**, **Use Current Page as Pinned URL** and **Unload Tab** appear in tab menus. A separate pin button marks saved URLs. Unpin is immediate and keeps the current page and location. Navigation stays ordinary.
- The native Toggle Pin Tab keyboard command becomes Toggle URL Pin and preserves placement. Toolbar/extension pinning and internal identifiers are untouched.
- Zone menu commands move a whole containing folder tree or a standalone tab/split group. Folder-row menus include **Unload Folder Tabs** and both zone commands. Same-Space root drop handling is included; member-to-root and advanced drag semantics need user acceptance.
- New upper root tabs default URL-pinned; upper folder creations default ordinary. Both defaults have settings. Lower creations are ordinary. Known choices and baselines survive moves; duplicates start ordinary and lose inherited Sticky.
- Close removes an entry; unload retains organisation/current URL/pin state. The optional folder minus button defaults OFF.
- Better Pins coordinates automatically with the compatible current BZF runtime. It owns URL-pin operations while active; BZF retains Sticky, previews, colours, folder recovery and other features. Settings are retained. No fourth mod is required.

## Candidate limits

This is ready for disposable-profile review, not everyday-profile installation.

- **Clear is intentionally unavailable** with a visible explanation until its cleanup policy is agreed. No bulk-delete default has been invented.
- Clean disable returns affected lower folder trees to the native upper section. Startup reset remains off and metadata is retained. This is not a no-loss guarantee for missing code, downgrade, native actions while disabled, or every re-enable history.
- Zen's pinned-only window sync still excludes loose lower tabs. All-tabs mode mirrored the tested lower roots; folders and their URL choices were checked in both modes. Better Pins does not silently change that native preference.
- Private/unsynchronised windows, Essentials and live-provider folders retain native semantics outside this candidate's URL-pin layer.
- Empty-folder recovery, standalone native folder undo, all split-view/cross-Space combinations, unknown BZF versions, third-party scrolling mods, RTL/compact modes, arbitrary interrupted-write recovery, and physical OS tab/folder drags remain release gates. Combined BZF folder undo and a saved-state abrupt restart passed their specific probes.
- A profile's first-run consent dialog explains adoption and startup-reset compatibility. Automated fixtures preaccept it; its real-user visual acceptance remains open.

## Evidence and development

See `VERIFICATION.md`, `artifacts/package-identity.json`, and `docs/pin-engine-provenance.json`. Product source is in `src/`; `scripts/build.mjs` creates the self-contained Sine module. Node's built-in test runner is sufficient: `node --test tests/*.test.mjs`.

The attributed BZF transaction component is a local snapshot, not a runtime dependency on BZF's source checkout. Do not run the maintainer import scripts as routine builds. No changes were made to the Folder or Icons source repositories. Nothing was committed or published.

## Local delivery recovery

Source → hashed package → frozen `artifacts/review-package` → unique prepared profile → user launch request → human acceptance.

The frozen package refuses conflicting replacement bytes. Profile preparation verifies all inputs before copying, records `preparing`, verifies every installed file, then records `prepared`. Repeating preparation creates a new profile. A failed/partial directory is retained and is never reused or launched. The launcher records `launch-requested`; that is not operational or user acceptance. Rollback is closing the isolated test window; existing profiles are never part of this path.
