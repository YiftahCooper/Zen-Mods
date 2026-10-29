# Better Pins candidate 3 verification

Verified on 2026-10-15 for **0.1.0-candidate.3**. The selected package identity and compact results are retained in `evidence/candidate-3.json`; routine working profiles, attempts and logs are in `.backup-scratch/`.

## Result

- **101/101 model tests**, zero failures or skips. Twenty-two checks were added since candidate 2.
- **86 named native checks across 23 stages**, all passed on the exact final product hashes. The qualification entry point runs fifteen groups: the original nine-stage matrix, revision controls, native drag sessions, layout/recovery, empty-folder restart, activation failures/consent, Space/split operations, extended URL lifecycle, direct HTTPS, combined Sine/settings, pre-existing-session adoption and a four-stage missing-code/downgrade roundtrip.
- Zen **1.23.2b**, Gecko **157.0.1**, build **20261009073723**; Node **24.19.0**.
- Final independent source review identified two further ownership defects. Both were reproduced with failing regressions, repaired and included in the complete rerun. No finding from that review remains unfixed.
- Frozen candidate inventory, ZIP contents and prepared disposable-profile product/runtime hashes were checked. Every recorded launcher/browser process ID from this technical pass was absent at the final cleanup check; the compact evidence records the count.

## Repairs and behavior covered

Trusted folder drag-start can target a text node inside the native folder label. The previous handler ignored that node. It now resolves the parent element. The line and native drop dispatch were checked for expanded folders, collapsed folders and collapsed folders displaying a selected child, moving both upwards and downwards.

BZF coordination now checks unsupported controller descriptors before suspending its runtime, safely unwinds partial startup, retains property flags and later owners, and permits delegation through an inactive retained wrapper. Existing accessor-backed controller ownership is refused before mutation rather than being replaced with incompatible semantics.

Actual saved-zone projection now places recognized saved roots in their saved order before unrecorded newcomers. Missing identities are not resurrected and unsupported roots are not moved.

Tab Close/reset presentation is released when a tab becomes an Essential, disconnects or leaves the supported collection. Tab/folder menus have one Unload action, restoring the native entry's previous visibility afterward. Multiselection retains native bulk unload. Folder Unload wrappers are released, or delegate to native handling through a later wrapper, when the folder leaves supported scope.

The native probes also cover:

- Pin, navigation, Update, cancelled/accepted Edit, Reset, pinned Unload, Unpin and ordinary Unload in all four supported placements: upper/lower roots and upper/lower folder tabs.
- Refusal of seven policy actions after externally enabling startup reset, and seven actions on invalid intent metadata, retaining history, placement and exact saved bytes.
- First-run decline/accept state transitions, repeat activation and corrupt-zone activation cleanup.
- Empty native folder movement and restart; disable/native activity/re-enable; no resurrection of a closed child.
- Synthetic pre-existing native root/folder adoption, preservation of known BZF pin/ordinary choices, and blocking unknown records without rewriting them.
- Candidate 3 save, restart with no mod, native Close/new-tab activity, candidate 2 activation and candidate 3 reactivation: current pages and recoverable URL/zone state survive; the closed child remains absent and the native newcomer survives.
- Basic RTL/LTR layout with the upper New Tab button at either end; new Space controls/banner setting; native Space transfers; whole native split groups moving in both directions.
- Both window-sync modes, mirrored URL choices, BZF load orders, native folder Undo, saved-state forced termination/restart and Clear refusal/hidden presentation.
- Normal Sine loading with Folders, Icons and Even Better New Tab Button; the actual 12-control settings dialog, conditional controls, labels, width, scrolling and divider pointer input.
- A credential-free HTTPS request to example.com returned HTTP 200 with direct-network configuration in a fresh profile. Most fixtures deliberately retain the offline proxy; the manual launcher uses direct Internet access.

## Proof limits and adverse evidence

WebDriver-only folder pointer actions in both headless and headed profiles produced trusted drag-start and an accepted move session with a visible insertion line, but release emitted no observed drop. The passing drag-session probe uses Gecko's shipped EventUtils: trusted mouse start followed by native PresShell dragover/drop dispatch. This is stronger than directly calling the mod's handlers, but it is not physical OS drop acceptance. The source regression and the failed pointer-only attempts are not interchangeable evidence.

Consent and Edit tests supply only the prompt response boundary; they do not claim human visual acceptance. The current settings screenshots are retained as `evidence/settings-candidate-3-top.png` and `evidence/settings-candidate-3-bottom.png`.

An initial Essentials test used native Zen Reset on a data URL. SessionStore changed to the single saved entry, but live navigation did not complete. The native-delegation test uses an offline about:blank baseline; Better Pins itself passed data-page Reset in all four supported placements. This native synthetic-URL case was not presented as a Better Pins repair.

The copied Sine engine still raises a `categoryModule` navigation warning. The actual Configure dialog rendered and passed its checks; Sine itself was not patched. An early recovery oracle captured a new native tab ID before Zen assigned it; the corrected fixture waits for identity/history readiness and explicitly saves the session. Early adoption setup also needed to await history before capturing a native baseline. Early consent fixtures attempted to override nonconfigurable XPConnect methods and were rejected; corrected fixtures use a temporary window service facade and restore it afterward.

Everyday-profile migration, missing-code/downgrade cases beyond the tested roundtrip, arbitrary interrupted-write recovery and all combinations of split/Space/compact/third-party behavior remain outside the proved matrix. Clear stays hidden. No everyday/shared profile or companion source repository was modified. No established Git publication destination exists for this candidate directory, and nothing was published.

## Reproduction and preservation

README lists the build/model/native entry points. Canonical source, regression fixtures, the selected frozen package, the verified local Sine runtime, companion identities, browser/tool versions and compact results remain outside scratch. Existing earlier candidate packages were preserved. New generated working material uses `.backup-scratch/`; backup exclusion for this scope has not been audited.
