# Better Pins Implementation Plan

> Execute inline with superpowers:executing-plans and test-driven-development; request a fresh final code review. User explicitly requested continuous candidate development. Do not insert routine approval stops or commit steps.

**Goal:** Produce a runnable, verified experimental Better Pins candidate.
**Architecture:** Native containers plus separate persisted URL/area state; small attributed BZF transaction component; reversible capability coordination.
**Tech Stack:** privileged ES modules, XUL/HTML controls, CSS, SessionStore, Node test runner, disposable Marionette/Gecko.
**Spec:** [design.md](design.md).

## Global constraints

Preserve BZF source and accepted behaviour; no everyday/shared profile access. Native tests use fresh synthetic profiles under this project only. No commit/publish. Pin unpin delay 0; folder minus OFF; lower creation has no auto-pin default.

## Review focus

Malformed/future metadata must not be overwritten; vanished IDs must not resurrect; late BZF loading must not install two active pin owners; lower root baseline must survive restart; failed activation/teardown must restore owned hooks.

## Tasks and interfaces

1. [x] `src/state.mjs`, `tests/state.test.mjs`: schema/default/area helpers; invalid records refuse mutation.
2. [x] `src/pin-engine.mjs`, `src/controller.mjs`, `tests/controller.test.mjs`: attributed transactions, browser adapters, consent, adoption, command routing, persisted baselines and automatic BZF coordination.
3. [x] `src/zones.mjs`, `src/presentation.mjs`, `chrome.css`, `preferences.json`, `theme.json`: existing-container layout, move menus, pointer/keyboard divider, badges, pure unload and Clear explanation.
4. [x] `scripts/build.mjs`, `scripts/better-pins.uc.mjs`, `tests/native/`: self-contained package, disposable harness, native/restart/combined proof with frozen hashes and retained adverse receipts.
5. [x] Independent review and repair regressions, final verification, README/VERIFICATION, frozen package and fresh-profile review launcher.

## Execution ledger

- Initial inspection: BZF source is newer than parked brief; integrated pin runtime is present. Installed Zen remains 1.22.3b / Gecko 156.0.1, source ca522d448d3df8a0d264ea0ceafc9c684c36ea6a.
- Ruling: new sibling Better Pins directory provides isolation because the current Zen directory is not a Git checkout; no BZF worktree edits required.
- Ruling: use current BZF pin schema and attributed transaction snapshot, with candidate-owned extensions, to preserve existing choices and avoid competing handlers.
- Ruling: Clear refuses action in this experimental candidate because the owner has not chosen a cleanup policy. Cost: no bulk Clear during testing.
- Ruling: native pinned-only window sync remains unchanged. Cost: lower loose roots are not mirrored in that mode; all-tabs mode was separately verified.
- Review repairs: coupled native/independent baseline rollback; preflight every mirror including native-only first adoption; atomic window zone writes/projections; inert retained unload wrappers; separate tab/folder menu targets; exact native pin shortcut command.
- Completion evidence: 75/75 Node checks; nine frozen native stages with 42 named checks; separate combined BZF+Icons normal-Sine activation/control/pointer receipt. Profile preparation hash/unique-path test passed. Product/source and release/user acceptance remain separate.
- Preserved adverse evidence: restricted content-process failure, incorrect test resource URL, and unflushed abrupt-test oracle. Corrected probes do not erase failed receipts.
- No commits/publication. No BZF/Icons source edits or everyday/shared profile access. Manual launcher preparation only; human acceptance pending.
