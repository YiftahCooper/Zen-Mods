# Continuing Better Pins development

Better Pins separates where a tab lives from whether it has a saved URL. Both zones support ordinary tabs and native folders. Browsing remains normal; Reset explicitly returns to a saved URL. Unpin preserves the current page and position. Close removes an entry; Unload keeps the entry and organisation while releasing the page from memory.

## Current state

The retained product is **0.1.0-candidate.4**. It is an experimental development candidate, not an everyday-profile release. The last complete native qualification was on 2026-10-15: 105 model tests and 91 named native checks across 26 stages, using Zen 1.23.2b / Gecko 157.0.1, build 20261009073723, and Node 24.19.0. See [VERIFICATION.md](../VERIFICATION.md) and [candidate-4.json](../evidence/candidate-4.json) for the recorded coverage and adverse evidence.

The public archive is `development/better-pins/` in `YiftahCooper/Zen-Mods`. Publishing that archive does not promote the candidate into the installable mod catalogue. Product source and frozen product bytes are preserved; native-test paths and the convenience launcher are adapted to a checkout's location. Those portability edits do not constitute a new native qualification.

## What to read

- [design.md](design.md) records the interaction contract, ownership boundaries and approved revisions.
- [OPEN-DESIGN-QUESTIONS.md](OPEN-DESIGN-QUESTIONS.md) distinguishes unresolved release policies from implemented settings and defects.
- [plan.md](plan.md) is historical implementation context. Its original candidate-only publication restriction describes that earlier phase, rather than the later development archive.
- [pin-engine-provenance.json](pin-engine-provenance.json) identifies the attributed Better Zen Folders extraction.
- [README.md](../README.md) describes candidate behaviour; [VERIFICATION.md](../VERIFICATION.md) describes its proof limits.

## Source and ownership

`src/state.mjs` validates saved intent and baselines. `src/pin-engine.mjs` contains the attributed transaction component. `src/controller.mjs` coordinates activation, saved URLs and compatible BZF ownership. `src/zones.mjs` owns placement, order and independent scrolling. `src/controls.mjs`, `src/presentation.mjs` and `src/settings.mjs` implement controls, native entry points, drag boundaries and settings presentation.

Better Pins owns URL-pin operations and the two zones while active. Better Zen Folders retains Sticky, previews, colours, recovery and unrelated folder behaviour. Native structural pinning is not evidence of URL-pin intent. Do not replace the native containers with arbitrary wrappers, infer intent from `tab.pinned`, resurrect missing identities, overwrite unknown metadata, or introduce a second active URL-pin owner.

## Build and model tests

Use Node 24 or newer. No npm dependencies are required. Run commands from this development directory. `node scripts/build.mjs` builds the self-contained Sine module and updates `artifacts/package-identity.json`. `node --test tests/*.test.mjs` runs the model/regression suite. The existing generated module and frozen candidate inventories provide comparison targets; do not overwrite frozen candidates with different bytes.

The import helpers are historical maintainer tools, not prerequisites. The extracted engine, imported regression tests and maintained native transport are already included. Re-importing requires a separately reviewed upstream checkout and changes the provenance boundary.

## Native tests and disposable review

Native tests require Windows and an installed Zen Browser. The archived harness accepts `BP_ZEN_BINARY` for a nonstandard executable location. Its default is the standard Program Files installation. The archived convenience CMD launcher uses `node` on PATH. All test and review profiles are created under this checkout's `.backup-scratch/`; never substitute an everyday or shared profile.

`artifacts/review-runtime/` preserves the exact Sine loader files used by the recorded qualification, with their hashes and MPL notice. `tests/fixtures/companions.zip` preserves the exact BZF 0.3.19, Zen Icons 0.3.0-rc.4 and Even Better New Tab Button 1.0.4 packages used for compatibility tests. The fixture ZIP contains mod files only, not browser profiles or user session data. Its hash is recorded in `tests/fixtures/companions.json`.

Before running a native test that uses companions, extract that ZIP to `.backup-scratch/companions/`. The first-level directories must be `better-zen-folders`, `zen-icons-local` and `even-better-new-tab`. On Windows, `Expand-Archive -LiteralPath tests/fixtures/companions.zip -DestinationPath .backup-scratch/companions` performs that extraction. The native harness uses those fixtures, not machine-specific sibling worktrees. Archive contents and hashes can be checked with the standard ZIP and SHA-256 tools before extraction.

`node scripts/launch-review.mjs --prepare-only` verifies the frozen candidate and runtime and prepares a fresh synthetic review profile without launching Zen. `node scripts/launch-review.mjs` launches a new disposable review window. That launcher preconfigures consent because it is not adopting an existing session. Manual-review profiles allow Internet access; most automated fixtures deliberately use an offline proxy.

`node tests/native/qualify.mjs` runs the native qualification groups. It creates many browser profiles and can consume gigabytes. Run affected groups when a change requires them; use full qualification for a changed candidate before making a new native-readiness claim. A different Zen version, companion revision or harness change needs new evidence. The retained 2026-10-15 results must not be relabelled as a pass on a later environment.

## Recovery inputs and boundaries

The archive retains all four original candidate ZIPs, the unpacked frozen candidates, source, tests, the loader, companion fixtures, compact candidate evidence and public-safe documentation. Original product hashes remain unchanged. Sanitised evidence removes machine-specific paths while retaining check names, outcomes, versions, hashes and limitations. It is a summary of historical results, not a replay of deleted sessions.

Old automated profiles, repeated screenshots and routine logs are working material. The selected evidence and the known failure mechanisms are retained in the normal project documents. After test instances close and useful results have been captured, generated profiles can be discarded. Never classify browser session data as disposable solely because its directory name contains `profile` or `scratch`.

Clear remains hidden. Existing-profile adoption and disable/remove behaviour remain policy gates. Physical OS drag completion, human visual acceptance, everyday-profile use, arbitrary interrupted-write recovery and broad third-party combinations are not proved by the recorded suite.

Keep credentials, actual browsing/session data, personal filesystem paths and raw private diagnostics out of the public repository. Public Git history has no private-file area. GitHub Actions secrets are for automation values, not a recoverable document archive.
