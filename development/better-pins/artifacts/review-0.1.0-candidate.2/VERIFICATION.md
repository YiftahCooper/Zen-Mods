# Better Pins candidate 2 verification

Date: 2026-09-30. Version: **0.1.0-candidate.2**. Built and verified in disposable profiles; everyday-profile installation and user acceptance remain unclaimed.

## Current evidence

- **79/79 Node tests**, no failures or skips: `artifacts/revision-model-tests.log`.
- **42 named checks in nine native stages**, all passed for the final exact product identity: `artifacts/final-1790767494296/result.json`. Includes standalone behaviour, BZF both load orders, clean restart, both window-sync modes, bounded saved-state forced termination/restart, and normal Sine/pointer-divider operation.
- **11 targeted native revision checks** passed: `artifacts/native/receipt-56928-1790767457420.json`. Covers independent creation defaults; native folder zone and order preservation; upper-button placement, visibility and activation; actual native lower-button click routing; per-zone insertion; banner toggle; menu structure/icons; Close/Clear presentation; insertion marker and resulting sibling order for expanded, collapsed and collapsed-selected-child trees; exact native method/command restoration over two enable/disable cycles.
- Normal Sine with current **Folders + Icons + Even Better New Tab Button** passed the control/pin/shortcut/divider probe: `artifacts/native/sine-1790767480115.json`, receipt `artifacts/native/receipt-11444-1790767475178.json`. Companion files are separately hashed. This is bounded coexistence proof, not every-feature compatibility.
- Actual Sine settings dialog rendered and inspected: `artifacts/native/receipt-64608-1790767372768.json`. All four sections and 12 controls were present; conditional visibility, width and accessible labels passed. Top/bottom screenshots: `artifacts/native/settings-top-64608-1790767372768.png` and `settings-bottom-64608-1790767372768.png`. Visual inspection confirmed readable wrapping, separate headings, visible Close, and internal scrolling. No screen-reader or full accessibility-conformance claim.
- Browser: Zen 1.22.3b / Gecko 156.0.1, build 20260922050124. Product hashes: `artifacts/package-identity.json`. Frozen candidate 1 remains separately preserved in `artifacts/review-package` and its original ZIP.

## Independent review

Reviewer found native toolbarbutton command retargeting, wrapper teardown order and native folder insertion-order defects. They were reproduced and repaired. Regressions cover actual button activation, both folder source areas and exact method identity after repeated disable/re-enable. Final bounded source review reported no remaining blocking finding. Settings styling is injected only in the settings document and scoped to this mod's own dialog. Sine itself is unchanged.

## Adverse and limited evidence

- Early native revision runs caught the Close control losing the CSS specificity contest and the native button bypassing a synthetic command-event test. Their logs remain under `artifacts/revision-native-first.log` and `revision-native-second.log`.
- A test attempted to pin an empty new tab before it had a history entry. The policy refused it. The explicit-pin test now navigates to and flushes a synthetic page first. Earlier failure receipts are retained.
- The copied Sine engine's settings category raises a native navigation warning (`categoryModule` is undefined). The fixture records it, verifies that native routing made the pane visible, and opens Sine's actual configure dialog. No Sine patch was made; general Sine/Zen navigation compatibility is not claimed repaired.
- Initial settings screenshots exposed an invisible/unusable presentation despite passing DOM geometry. The mod now supplies its scoped settings stylesheet in the actual settings document. The final screenshots above show the corrected rendered dialog.
- Physical Marionette pointer attempts did not successfully move the folder: `artifacts/native/receipt-23016-1790767266107.json`. They are **not** passing physical-drag evidence. The targeted native event-handler/geometry/drop-order tests pass all three reported tree states, but the user's real mouse drag acceptance remains open.
- Automated tests use fresh synthetic profiles and a dead proxy. Manual review preparation now explicitly uses direct Internet access. A prepared profile proves installed files/preferences, not visible launch success or remote-site reachability.

## Remaining boundaries

Clear is hidden pending policy. Everyday-profile migration, missing-mod/downgrade recovery, arbitrary interrupted-write recovery, empty-folder recovery, broader split-view/Space/RTL/compact combinations, and unknown third-party versions remain release gates. Native pinned-only window sync still excludes loose lower roots; this native setting is not silently changed. See README for full candidate limits.

No everyday/shared profile, companion source repository, commit or publication was modified. Candidate 1's original verification is retained at `artifacts/review-package/VERIFICATION.md`.
