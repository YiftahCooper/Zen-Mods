# Better Pins candidate design

Status: local experimental candidate authorised 2026-09-28. Working name: Better Pins.

## Contract

READY WITH DECLARED OPEN ITEMS. Build a working optional Zen/Sine mod that separates saved URL intent from placement in two equal-capability zones. Keep native-recognised containers and whole folder trees. Preserve normal navigation; unpin is immediate by default and preserves location/current page. Reset, close and unload have separate actions. Sticky belongs to Better Zen Folders (BZF).

New root and folder tabs in either zone default ordinary. Four independent creation settings cover upper/lower roots and upper/lower folder tabs. Moves retain known choices/baselines, duplicates become ordinary and do not inherit Sticky. Existing ambiguous native folder tabs require explicit first-run acknowledgement before initialising ordinary intent. Known BZF choices are preserved.

## Architecture

Use a small attributed snapshot of BZF's pin transaction, origin and native-hook code. This avoids reimplementing its identity, mirrored-write, cancellation and rollback checks. Adapt its scope to ordinary root/folder tabs. Keep the existing BZF intent schema for interoperability; persist reset baselines independently for lower root tabs. Never use a tab's native pinned flag as its URL-pin indicator after adoption.

A Better Pins controller owns URL actions and native entry points. Detect the compatible BZF runtime automatically and suspend only that runtime with reversible instance hooks; leave all BZF settings and other managers intact. Unknown/incompatible BZF capability must refuse takeover. Reconcile load order. No mandatory shared/core mod. The source BZF checkout remains unchanged.

Store a per-window SessionStore zone map keyed by Space and root native identity; only project existing objects, never resurrect deleted identities from the map. Tab URL intent and independent baseline travel in SessionStore tab metadata. Folder trees remain native folders. Tab roots retain native structural pinning appropriate for their zone; a lower folder remains natively pinned internally. Native collector membership is a verification invariant. Area updates propagate explicitly to participating windows, with later explicit local moves winning; deleted IDs are never materialised by projection.

Scroll existing native sections independently. Use a focusable horizontal separator with pointer capture, arrow keys, Home/End, and ARIA values. Clamp each zone to a sensible minimum where space permits. Persist the preferred ratio. Menu commands move whole trees and offer keyboard alternatives to drag. Drag support is restricted to known same-window, same-Space native tab/folder payloads; unsupported payloads keep native handling.

## Safety and unresolved choices

- Open item: cleanup policy. Resolve by owner before ordinary release. Until then intercept Clear while Better Pins is active with a visible explanation; no candidate-wide bulk destructive default is invented.
- Open item: existing-profile migration and disable/missing-code/downgrade semantics. Resolve by owner plus recovery evidence. Until then first-run notice explains experimental status and no-loss fallback is not promised. Clean disable returns only affected projected folder trees to native upper placement; retains metadata and last-page startup preference, and does not move unrelated tabs. Candidate testing uses new synthetic profiles only.
- Startup reset must be OFF before activation. Ask in first-run UI before changing it; no automatic restoration on disable because that could reset current pages. If turned on externally, deactivate semantic commands visibly.
- Private/unsynchronised windows, Essentials and provider-managed live folders are outside this candidate's semantic scope and must retain native handling.
- Empty-folder persistence, arbitrary interrupted-write recovery, physical OS drags, third-party scrolling mods, and everyday visual acceptance remain distinct gates; report failures honestly. Experimental code is not release proof.

## Proof

Automated model tests: URL-state parsing, moves/defaults/duplicates, no navigation on unpin, cancellation, wrappers/teardown, area/order validation and divider sizing.

Disposable native tests (authorised for this development cycle): actual candidate import/bootstrap; root/folder URL operations in both areas, nested reparenting and collector membership, pure unload/close, duplicate, independently scrolling sections and divider keyboard/pointer handlers, restart and BZF load-order coordination. Include adverse output. Source/model passes are not native passes.

Human proof unavailable until user reviews the candidate: visual feel, real pointer drags, ordinary-profile acceptance. No shared/daily profile modifications, commits or publication authorised.

## Approved revision — 2026-09-30

Native folder creation inherits source zone and position. Existing URL choices survive. Hide guarded Clear; use normal tab Close controls with Unload kept separate. Add an optional upper New Tab button, top/bottom placement and independent per-zone insertion order. Reuse saved plus-animation and roundness preferences without requiring another mod. Make banner collapse configurable. Put area actions in a Zones submenu with only the opposite destination; add toggleable icons to all added menu commands. Manual review profiles allow Internet; automated fixtures stay offline. Group settings in simple language, with dependent options hidden and accessible labels. This is local candidate work only.

## Technical qualification — 2026-10-15

Clear remains hidden as explicitly directed. The approved interaction model is unchanged. Candidate 3 repairs native text-node drag starts, reversible BZF ownership, actual restored ordering, and presentation/unload scope transitions. The bounded technical matrix now includes empty-folder restart, selected Space/split operations, RTL layout and first-run state tests. Detailed proof and remaining limits are in VERIFICATION.md; product acceptance is not inferred from automated checks.

## Drag boundary follow-up — 2026-10-15

The follow-up audit found useful independent work beyond candidate 3's matrix. Candidate 4 enforces the existing supported native-payload boundary, clears stale drag state and preserves native handling of multiselection. Basic compact variants and private-window refusal have native coverage. These are technical corrections within the approved behavior; Clear remains hidden and no new owner choice is inferred.
