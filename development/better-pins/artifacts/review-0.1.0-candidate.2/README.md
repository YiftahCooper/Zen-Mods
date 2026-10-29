# Better Pins — 0.1.0-candidate.2

An experimental optional Zen/Sine mod that separates **where a tab lives** from **whether it has a saved reset URL**.

## Try the candidate

Double-click **Launch Better Pins Candidate.cmd** in this folder. It verifies the frozen candidate and Sine loader, creates a new disposable profile, and opens a visible Zen window with a local test guide. It never reuses, reads or modifies your everyday profile or `.test-profile-v2`. Each launch creates a new profile under `artifacts/manual/profile-*`; close its window when finished. Internet browsing is enabled in this separate manual-review profile. It opens local synthetic pages to begin with. Automated fixtures remain offline. Its consent/startup settings are preconfigured because it contains no existing user session to migrate.

This launcher demonstrates standalone Better Pins with native Zen folders. The current Folders, Icons and Even Better New Tab Button were also tested together through normal Sine in a separate automated disposable profile. They are not silently installed by the standalone launcher.

The launcher preparation and exact installed hashes were verified. This is the second candidate, addressing your first review. Its visible manual launch and your acceptance are still outstanding.

## What is implemented

- Upper and lower zones use Zen's existing containers and scroll independently. Drag the divider or focus it and use Up/Down, Shift+Up/Down, Home or End.
- **Pin URL**, **Unpin URL**, **Reset to Pinned URL**, **Edit Pinned URL**, **Use Current Page as Pinned URL** and **Unload Tab** appear in tab menus. A separate pin button marks saved URLs. Unpin is immediate and keeps the current page and location. Navigation stays ordinary.
- The native Toggle Pin Tab keyboard command becomes Toggle URL Pin and preserves placement. Toolbar/extension pinning and internal identifiers are untouched.
- Zone menu commands move a whole containing folder tree or a standalone tab/split group. Folder-row menus include **Unload Folder Tabs** and a **Zones** submenu offering the opposite destination. Same-Space root drop handling is included; member-to-root and advanced drag semantics need user acceptance.
- New tabs start without a saved URL. Four independent settings cover upper/lower tabs outside folders and upper/lower tabs inside folders. Defaults affect creation only. Known choices and baselines survive moves; duplicates start ordinary and lose inherited Sticky.
- Tabs show a normal Close × rather than the native minus/reset controls. Close removes an entry; Unload retains organisation/current URL/pin state. The optional folder-row Unload button defaults OFF.
- Creating a native folder around a tab retains its zone and list position. Mixed-zone selections follow the initiating tab when available.
- An optional upper New Tab button sits below the Space banner or above the divider. The usual button creates lower tabs. Each zone independently inserts new tabs at its beginning or end. Button position and insertion order are separate. The second button reuses saved Even Better New Tab Button plus-animation and roundness preferences when enabled; this is not a complete copy of that mod.
- The Space-banner collapse action is configurable. The Zones submenu offers only the opposite destination, plus new-tab actions. All added menu commands have optional icons.
- Better Pins coordinates automatically with the compatible current BZF runtime. It owns URL-pin operations while active; BZF retains Sticky, previews, colours, folder recovery and other features. Settings are retained. No fourth mod is required.

## Candidate limits

This is ready for disposable-profile review, not everyday-profile installation.

- **Clear is hidden and its native action remains guarded** until its cleanup policy is agreed. No bulk-delete default has been invented.
- Clean disable returns affected lower folder trees to the native upper section. Startup reset remains off and metadata is retained. This is not a no-loss guarantee for missing code, downgrade, native actions while disabled, or every re-enable history.
- Zen's pinned-only window sync still excludes loose lower tabs. All-tabs mode mirrored the tested lower roots; folders and their URL choices were checked in both modes. Better Pins does not silently change that native preference.
- Private/unsynchronised windows, Essentials and live-provider folders retain native semantics outside this candidate's URL-pin layer.
- Empty-folder recovery, standalone native folder undo, all split-view/cross-Space combinations, unknown BZF versions, third-party scrolling mods, RTL/compact modes, arbitrary interrupted-write recovery, and physical OS tab/folder drags remain release gates. Combined BZF folder undo and a saved-state abrupt restart passed their specific probes.
- A profile's first-run consent dialog explains adoption and startup-reset compatibility. Automated fixtures preaccept it; its real-user visual acceptance remains open.

## Evidence and development

Settings are grouped into Saved URLs, New Tab buttons, Layout and controls, and Right-click menus. The upper button position appears only when that button is enabled. Labels explain creation-only effects and use accessible control names.

See `VERIFICATION.md`, `artifacts/package-identity.json`, and `docs/pin-engine-provenance.json`. Product source is in `src/`; `scripts/build.mjs` creates the self-contained Sine module. Node's built-in test runner is sufficient: `node --test tests/*.test.mjs`.

The attributed BZF transaction component is a local snapshot, not a runtime dependency on BZF's source checkout. Do not run the maintainer import scripts as routine builds. No changes were made to the Folder, Icons or Even Better New Tab Button source repositories. Nothing was committed or published.

## Local delivery recovery

Source → hashed package → frozen `artifacts/review-0.1.0-candidate.2` → unique prepared profile → user launch request → human acceptance.

The frozen package refuses conflicting replacement bytes. Profile preparation verifies all inputs before copying, records `preparing`, verifies every installed file, then records `prepared`. Repeating preparation creates a new profile. A failed/partial directory is retained and is never reused or launched. The launcher records `launch-requested`; that is not operational or user acceptance. Rollback is closing the isolated test window; existing profiles are never part of this path.
