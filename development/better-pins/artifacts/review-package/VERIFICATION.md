# Better Pins candidate verification

Date: 2026-09-28. Candidate: **0.1.0-candidate.1**. State: built, independently reviewed, frozen, and activated in disposable native tests. User acceptance and everyday-profile installation are not claimed.

## Identity

Installed test browser: Zen 1.22.3b / Gecko 156.0.1, build 20260922050124, source ca522d448d3df8a0d264ea0ceafc9c684c36ea6a.

Frozen product script SHA-256: `725bc3a10dd78676a666f6fcc4b7b66db2d529c06ee9e87b54c5eb571971c68f`.

All four product file hashes: `artifacts/package-identity.json`. Exact copies: `artifacts/review-package`. Changing any product byte invalidates the native/package claims that consume that identity.

## Automated evidence

- **75/75 Node tests**, zero failures/skips: model/transaction, UI routing, mirrored-write rollback, wrapper lifetime, state parsing, and fresh-profile preparation. Final output retained at `artifacts/model-tests.log`.
- Final frozen native matrix: `artifacts/final-1790616918173/result.json`, **9 stages / 42 named checks passed**. Six unchanged successful stages are explicitly retained from `artifacts/final-1790616829120`; the original failed attempt remains intact.
- Standalone native operations: ten checks covering root/folder URL intent, normal navigation/reset/unpin, nested tree identity and native stored-tab membership, unload, duplicates, separate scrolling, keyboard divider, Clear refusal, close and teardown.
- BZF before/after: seven checks each, using actual popup/command events for tab and folder actions, creation defaults, BZF undo, same-Space drop handler and saved state. These tests are not physical OS tab-drag proof.
- Separate new processes tested pinned-only and all-tabs window sync. Four checks per mode cover new-window folder projection, mirrored URL choices/baselines, root native/visual membership, and deletion without resurrection. In pinned-only mode the lower loose root correctly ceased to have a peer under native policy; this is an explicit limitation, not equal sync coverage.
- Clean restart retained a lower root's current B and saved A plus lower folder placement, then explicit Reset returned to A.
- Abrupt termination occurred only after explicit successful SessionSaver and preference saves. The subsequent restart passed the same bounded nonempty-tree/current/baseline checks. It does not prove arbitrary power-loss or empty-folder recovery.
- Normal Sine loaded the exact unmodified package and CSS. Real Marionette pointer input changed the divider ratio from 48 to 56; native command events verified Toggle URL Pin preserved placement. Screenshot/receipt: `artifacts/native/receipt-47628-1790616926013.json` and matching PNG.
- Current BZF and current Icons also loaded with Better Pins through normal Sine, with one active URL-pin owner and the same native shortcut/control/pointer checks. Receipt: `artifacts/native/receipt-39116-1790617126259.json`; copied loader/companion identity: `artifacts/native/sine-1790617131292.json`. This is combined activation/input evidence, not full visual or every-feature acceptance.

## Independent review and repairs

A fresh reviewer found persistent-baseline rollback, peer-adoption preflight, cross-window zone transaction, late BZF unload ownership, and context-menu routing defects. They were repaired. Focused tests reproduce failed intent writes, rejected/ignored peer writes, projection rollback, both unload orders, differing native baselines and the post-persistence read boundary. The reviewer independently verified those repairs and added six regressions in `tests/review-regressions.test.mjs`.

## Adverse evidence retained

- Restricted first launch `receipt-8644-1790615731137.json`: Windows `SB::LA::SpawnTarget` failures; invalid page/unload evidence. Subsequent tests used authorised host execution with Zen's own sandbox enabled.
- Lifecycle run `receipt-52904-1790616226506.json`: six checks passed, test-only SessionSaver resource address was wrong. Fixed fixture uses the installed `moz-src` address.
- Original final abrupt-restart oracle was missing because its preference had not been explicitly flushed. `artifacts/final-1790616829120` retains that failure. Corrected test flushes the oracle before forced termination; it does not alter product code or erase the failed receipt.
- Native logs include headless graphics warnings, blocked-network/background messages and some shutdown SessionFile-is-closed errors. They are not labelled universally clean logs.

## Preserved boundaries

BZF product script still hashes to `48aeceea5c2b725ad6024ccc2ff8f63cae2dca1e061f6443bb4399d6584f1de1`, the initial inspected source. The current BZF/Icons working trees and their existing changes were not edited. No everyday/shared profile was opened, read for engine copying, staged or modified. Loader files came only from a previous explicitly synthetic profile and were independently hashed after copying. No commit, remote publication or automation.

See README candidate limits for remaining release gates. The manual launcher uses a frozen standalone candidate and synthetic local pages; preparation was tested without opening a persistent review window.
