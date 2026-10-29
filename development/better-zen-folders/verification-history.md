> **Historical reference.** This is a sanitised snapshot of the original
> development record. Installation statements and local evidence paths describe
> the state at their recorded dates, not this checkout or a current user profile.
> Raw profiles, recordings and original release directories are not distributed.
> Start with [Current status](CURRENT-STATUS.md) and [Testing](TESTING.md).
> Use `npm test` / `npm run test:python` through the public assembly runner; do not
> run the old direct-project commands below against this directory.

# Better Zen Folders verification record

## 2026-10-25: folder-plus tabs start inside their folder, 0.3.26

The recording shows a newly chosen page briefly below the regular-area separator
before moving into Sports. The retained 0.3.25 package reproduces that sequence in
fresh Zen 1.23.4b / Gecko 158.0.1: TabOpen reports no group, and the first two
sampled animation frames place the selected tab in the regular area. The folder
transaction previously waited for delayed ZenURLBarClosed confirmation to group it.

The owned dialogue now grants its valid destination only to its confirmed native
URL-bar trusted-link call. That synchronous creation supplies pinned/tabGroup to
native addTab. The existing related-creation exemption prevents native workspace
repositioning from ejecting it. Top/Bottom order and the collapsed-path snapshot
are restored before the first frame; the later confirmation avoids duplicate
grouping. Cancellation, session replacement, disconnected or foreign folders,
unrelated background opens and reentrant TabOpen work cannot borrow the request.
Native existing-tab selection and initial-empty-tab reuse retain their fallback.
No Sine, CSS, saved preference or global browser policy changes are needed.

Fifteen new regression cases cover the initial boundary, isolation, cancellation
during native callbacks and error propagation. Positive creation cases fail before
the placement repair; four callback/error cases fail before the review repair.
Preparation failures now use the transaction's error handling without replacing
native results, and genuine native exceptions still propagate unchanged.
The final JavaScript suite passes **1,373**, with zero failures and one existing unavailable historical
screenshot skip; all **16** Python checks and runtime syntax checks pass. Installed
Zen was upgraded since the previous release: a read-only archive check confirms
that the retained moveTabTo replay is still byte-identical, the before/after
receiver's executable bytes still match after removing block comments, and the
tab index getter is unchanged. Its exact whole-entry hash pair is added to the
reviewed-identity registry; unknown pairs still fail closed.

Native tests invoke the actual folder plus command, URL-bar search and result
activation, observing TabOpen and every sampled animation frame. They cover Top
and Bottom, root and nested folders, collapsed state, both new URL-pin defaults,
unrelated background opens while the dialogue waits, cancellation and stock Sine
live reload. All seven creation cases pass with Folders alone, alongside Zen Icons
0.3.0-rc.4, and with URL-pin separation disabled. The previous Sine-homepage native
regression also passes. These are disposable native command-handler and frame
checks, not physical mouse input or everyday-profile acceptance.

The selected five-file package, native reproducer and compact results are retained
in `artifacts/releases/20261025-v0.3.26-initial-folder-placement/`. Everyday and shared
test profiles, Sine source, Zen Icons and other mods are untouched.

## 2026-10-20: Sine Settings homepage links stay in their folder, 0.3.25

The 5.7s recording shows Settings inside the Zen folder, then a Sine mod-homepage
button creating its page in the regular area. This was reproduced using stock
Sine in fresh Zen 1.23.3b. Its unchanged handler calls Settings window.open with
`_blank`. BrowserDOMWindow supplies the actual openerBrowser and matching
openWindowInfo.parent.top, but creates the initial tab with skipLoad=true before
handing off the final navigation. The previous blanket skipLoad exclusion treated
this live creation as restoration in both placement and URL-pin origin tracking.

A small shared predicate recognises only matching native opener-context identity.
That live creation now uses the existing immediate-folder insertion path and new
folder-tab URL-pin default. Native skipLoad, window info, opener, principal and
selection flags are preserved; actual restore/lazy/external/unsupported creations
remain excluded. No Settings-page interception, selected-tab guessing, Sine edit,
global browser preference change or CSS change is needed.

Thirteen focused regressions cover live provisional opens in ordinary/nested
folders, foreground/background behavior, native flag preservation, missing or
mismatched opener info and restoration exclusions, and both URL-pin defaults.
The six positive routing/origin cases failed before the repair; all 51 tests in
the two affected files pass after it. The final project suite passed **1,358
tests**, zero failures, one existing unavailable historical-screenshot skip. All
**16** Python package checks and runtime syntax checks passed.

Native verification invokes the actual stock-Sine home-button handler with an
isolated synthetic mod entry whose homepage is served on loopback. It covers
immediate and nested folders, repeated opens, final loaded URL, both URL-pin
defaults (including saving the final URL rather than about:blank), stock Sine
unload/reload, regular-area Settings and unrelated-tab controls. It also passes
alongside Zen Icons 0.3.0-rc.4 and with folder URL-pin separation disabled. The
same native assertion rejects the retained 0.3.24 build. This is native handler
verification, not a physical mouse-click or everyday-profile acceptance claim.

Selected package, source trace and native reproducer:
`artifacts/releases/20261020-v0.3.25-settings-homepage/`. Daily/shared profiles,
Sine, Zen Icons, saved preferences and the 0.3.24 theme-colour repair are preserved.

## 2026-10-20: theme-aware monochrome controls, 0.3.24

The reported black plus was reproduced in fresh synthetic Zen 1.23.3b / Gecko
158.0, build 20261016101044. Its computed foreground was already light, but the
external `plus.svg` uses Gecko context paint. The owned toolbarbutton did not
export that paint, so its 16px image contained no light glyph pixels on the dark
surface. The same missing handoff affected Space-image, grouped-preview fallback,
drag-destination fallback and compatibility-mode command-image surfaces.

Scoped CSS now exports the local currentColor fill/stroke to those external SVG
surfaces. Existing Mod Icons paint also exports stroke. A floating drag chooser
uses its popup foreground token, matching its popup background rather than
inheriting a potentially different sidebar foreground. No background sampling,
global inversion, new setting, palette rewrite or custom-artwork filter was added.
Existing currentColor controls and explicit folder colours/artwork remain intact.

Two new browser regressions failed before the repair and passed afterward. Native
pixel checks also reject 0.3.23 and pass the selected package through dark → light
→ dark changes: the real plus has 21 foreground pixels in each state; Space,
preview, drag and compatibility-image samples also follow the foreground. A fresh
profile with Zen Icons 0.3.0-rc.4 passes the same checks, and an explicitly coloured
SVG retains all 324 red pixels through every theme change. Gecko does not expose
the internal context-properties value through this computed-style API; the native
verifier checks rendered pixels rather than relying on that unreadable value.

The first full suite detected an unreviewed installed-native source pair after
Zen updated. Read-only archive inspection proved moveTabTo remains byte-identical,
before/after receiver executable code is identical after removing block comments,
and the index getter remains compatible. A bounded 1.23.3b identity fixture was
added; unknown hashes still fail closed. The final complete suite passed **1,345
tests**, zero failures, with one existing unavailable historical-screenshot skip.
All **16** Python package checks and runtime syntax checks passed.

Selected five-file package, baseline/fixed native evidence and reproducer:
`artifacts/releases/20261020-v0.3.24-theme-colours/`. Daily and shared test profiles,
Sine, Zen Icons product files, settings and tab/Sticky behavior were not changed.
This proves the listed rendering paths, not universal compatibility with arbitrary
third-party themes or general accessibility conformance.

## 2026-10-16: empty-icon dots default off, 0.3.23

**Show … on Folders Without an Icon** now defaults to disabled in both Sine's
settings schema and the typed preference service. Artwork requires an explicit
opt-in for an iconless folder; chosen-icon behavior is unchanged. No preference
migration is performed, so explicitly saved true and false choices survive.
The 0.3.22 stale-indicator and selection-exit animation repairs are retained.

Red-first regressions failed for the old default and its artwork fallback, then
passed with the change. The complete JS suite passed **1,343 tests**, with zero
failures and one existing unavailable historical-screenshot skip. All **16**
Python package checks and runtime syntax checks passed. Tests cover fresh startup,
saved true/false choices, live changes and the chosen-icon exception.

In fresh synthetic Zen 1.23.2b with stock Sine, no saved choice yielded no dots
while the selected row stayed 40px high. Explicit true yielded visible dots;
false hid them again. Both choices and row visibility survived actual Sine
controller unload/reload. The first native assertion sampled the final fraction
of Zen's opacity transition; waiting for its exact endpoint fixed the verifier,
without a product workaround. No everyday or shared profile was touched.

Selected package and concise native evidence:
`artifacts/releases/20261016-v0.3.23-dots-default-off/`. Publication is verified
separately against the five-file manifest; CSS and all other mods are unchanged.

## 2026-10-16: stale folder dots and selection-exit motion, 0.3.22

The user's 9.3-second recording was inspected offline. Both reported defects were
then reproduced on the published 0.3.21 package in a fresh synthetic Zen profile:
after selecting a tab, collapsing its blank-icon folder and selecting outside,
the formerly selected row snapped from 40px to zero without intermediate frames;
the native SVG retained `active=true` and visible dots. Native active membership
and current projected row visibility had diverged; TabSelect did not enter the
measured motion path used by explicit collapse/expand gestures.

The repair projects only native folder artwork's active value from currently
visible descendant rows, without changing native active membership or folder
collapse state. An owned instance wrapper reapplies that presentation after native
icon updates. Its restoration baseline advances on actual native updates, fixing
the review-discovered case where selection changes after startup without any row
motion. TabSelect visibility changes snapshot the relevant collapsed boundary and
use the existing measured accordion. Retained Sticky rows remain full-height.

Appearance gains the default-on checkbox **Show … on Folders Without an Icon**.
Turning it off suppresses dots only when no icon is chosen. Settings are now 43
entries in the same ten groups. CSS, Sine and Zen Icons product files are unchanged;
the 0.3.21 related-link/Glance repair is retained.

Primary regressions failed before the repair: ordinary selection-exit motion,
stale SVG activity after native refresh, the empty-icon setting, and current-native
SVG handback without any managed motion. The final JS suite passed **1,340 tests**,
failed zero and skipped one pre-existing unavailable historical screenshot. All
**16 Python package tests** and syntax checks passed. Independent read-only review
identified the handback edge case; its red-first repair received
`NO_MATERIAL_OBJECTION` for runtime SHA256
`8307eb9a9caed3202f7a2da23809c8a428cfe111f514563da84478cf851292d9`.

Native Zen 1.23.2b / Gecko 157.0.1 showed ten intermediate frames for the 40px-to-zero
row fold, and ten for a nested 120px-to-40px path fold. Both indicators cleared
without manual refresh. Sticky siblings stayed full-height, chosen-icon behavior
was preserved, the setting updated live, and rapid TabSelect reversals settled.
Reduced motion used zero intermediate frames with correct endpoints. The final
package passed with Zen Icons RC4, after restart and through stock Sine's actual
unload/reload lifecycle.

Published to `YiftahCooper/Zen-Mods` main as
`a638887411e5b47963e9d229e2c7971756745d45`, tree
`1cb1e451b65dd104c3bfdd408a58a6f81b6fbb18`, parent
`79b5cfbe6a5193d87dcce54b62e8bd3942db0ef4`. Readback matched all five frozen package
blobs. Only runtime, preferences, theme and the short README changed; all 3,575
other repository blobs were preserved.

Actual published GitHub installation through stock Sine passed the native suite
and restart. A separate profile reproduced the old bug using the real 0.3.21
package and its original `2026-10-16T10:07:28.145Z` metadata. Stock `updateMods()`
downloaded and activated 0.3.22, retired the old controller, cleared existing stale
dots, and produced ten intermediate fold frames **without restarting the process**.
The same profile also passed the native suite after restart. Installed runtime,
CSS and preference-file hashes matched the frozen release.

Selected package, manifest, compact receipts and native reproducer:
`artifacts/releases/20261016-v0.3.22-active-folder-visuals/`. Routine video frames,
attempts and synthetic profiles stay in project-local `.backup-scratch/`. No
everyday or shared test profile was opened or modified. Controlled native proof
does not constitute blanket acceptance of every unrelated everyday-profile mod.

## 2026-10-16: related links and Glance stay in their source folder, 0.3.21

The published 0.3.20 behavior was reproduced in fresh synthetic Zen: with native
`zen.folders.owned-tabs-in-folder=false`, a related tab escaped to the regular
area. Inspection of installed Zen 1.23.2b identified two native gates: ordinary
insertion drops a folder destination for an unpinned tab, and workspace fixup
ejects structural pins before TabOpen. Glance's native pin call also resolves a
preview to its parent, rather than pinning the preview being promoted.

The instance-scoped manager supplies folder/structural-pin insertion options for
verified related creations, preserves native opener semantics and insertion
order, and exempts only that synchronous creation from workspace fixup. Nested
declined creations clear the exemption. Glance remains transient until the native
full-open move identifies preview and parent; only that preview bypasses parent
normalisation during structural pinning. Existing creation/move URL-pin policy is
reused. All hooks retire with the controller without changing native preferences
or Sine. Unrelated, restored, foreign, split and live-folder origins stay native.

Red-first regressions cover placement, selection, repeated order, actual opener,
Glance new/moved provenance, unsupported paths, nested creation isolation,
browser-opener identity, thrown-creation cleanup and owned teardown. Independent
review found two bounded edge cases; both were reproduced red and repaired.
The final exact-runtime review returned `NO_MATERIAL_OBJECTION` and independently
reran 26 focused tests. Full JS suite: **1,333 pass, zero fail, one existing
historical-screenshot skip**. Python package checks: **16 pass, zero fail**.

Native Zen 1.23.2b / Gecko 157.0.1 passed real WebDriver middle-clicks on synthetic
HTML, root/nested folder placement and repeated-link order, foreground/background
selection, explicit opener with another tab selected, real Glance full opening,
existing explicit URL-pin retention, and the opt-in new-tab URL-pin default.
New related tabs and promoted previews retained their folders after clean restart.
The same placement/gesture checks passed with Zen Icons RC4 and Folder URL Pins
disabled, before and after restart. The native owned-tabs preference stayed false.

Published to `YiftahCooper/Zen-Mods` main as
`79b5cfbe6a5193d87dcce54b62e8bd3942db0ef4`; parent
`825543b9a85bf1c49dc5fc950cdcf233700aea73`. Remote readback matched all five frozen
package blobs; only runtime, theme and short README changed. All 3,576 other
repository blobs were preserved. Runtime SHA256:
`be869f08ae2f2e96e850f2715cf9c39087407852a0c5ac77ec68bff6e8721568`.
CSS, settings and Zen Icons product files are unchanged.

Actual published GitHub installation through stock Sine passed the same native
checks and clean restart. A separate fresh profile started with the real 0.3.20
package and original `2026-10-15T17:29:15Z` metadata: stock `processModUpdate`
detected and installed 0.3.21, and native feature checks passed after restart.
No fabricated predecessor date, Sine patch, everyday-profile action or shared
test-profile change was used. This proves the requested repair in controlled
native profiles, not blanket acceptance of every everyday-profile mod combination.

Selected package, manifest, native reproducer and compact receipts:
`artifacts/releases/20261016-v0.3.21-related-tabs/`.

## 2026-10-15: ordinary folder animation repair, 0.3.20

The user's snapping-row report was reproduced in the published 0.3.19 package
both immediately after live installation and after process restart, with reduced
motion disabled. Ordinary folders had zero intermediate-height frames; otherwise
equivalent Sticky folders animated. Visibility projection hid ordinary children
before native motion could measure them, while the instance animation adapter
claimed only Sticky/path-only/exposed branches. The repair uses the existing
measured accordion for every regular branch represented by that projection.
Live/unmanaged guards, retained rows, reversal, reduced motion and teardown remain
on the same paths. CSS, settings, README and Icons are unchanged.

The two new ordinary-folder regressions failed against 0.3.19 and passed after
the repair. The final full JS suite passed 1,307 tests, failed zero and skipped
one pre-existing unavailable historical screenshot. All 16 Python package tests
passed. Stale fixed-version assertions were made consistent with the manifest;
the obsolete requirement that an already published mod remain unpublished was
removed. Independent read-only review of the exact script returned
`NO_MATERIAL_OBJECTION`, not a substitute for native verification.

Frozen runtime SHA256:
`edefecb27bae9b57569b7e90f46167c805e8c3604a2ae27f99a1bf815d7e065e`.
Selected package and receipts:
`artifacts/releases/20261015-v0.3.20-folder-motion-local/`.

Published to `YiftahCooper/Zen-Mods` main as
`46c4714565d4ffb7dd3bcb8ba9518157bc26eaa9`, preserving every other blob.
Only the BZF runtime and theme changed. Full frozen-file Git blob readback
passed. Sine compares `updatedAt` timestamps, not version numbers, so the new
theme uses a precise same-day timestamp to make 0.3.20 discoverable.

Fresh synthetic headless Zen 1.23.2b / stock Sine 2.3.4.1c passed ordinary and
Sticky collapse/expand geometry, retained-row stability during rapid reversals,
and restart; reduced motion was separately verified in the candidate. The
actual published GitHub folder was then installed and retested after restart.
A separate profile started from the real 0.3.19 package and its original date:
unchanged Sine `processModUpdate` detected and installed 0.3.20 without fabricating
an older date; the restarted successor again passed all animation checks.

No everyday/shared profile was opened or modified. This is the reproduced
animation fix and release/isolated-native evidence, not full alpha finalisation
or a claim about every unrelated mod in the user's everyday profile.

## 2026-10-15: linked swatches and unloaded-tab dragging, 0.3.19

The user authorised evidence-backed testing and repairs, continued direct Icons
coordination, fresh disposable headless tests and routine guarded updates of the
closed shared test profile. Everyday Zen remains outside that authority.

The unloaded-tab symptom is now reproduced and repaired, rather than merely
suspected. Trusted mousedown restores the pending tab; BZF's restore adapter
previously removed/reinserted even an already correctly positioned tab. That
detached the pressed source before native drag initiation. The repair skips only
redundant placement, preserving genuine reordering and reparenting. The selected
predecessor trace fails the native regression; the exact successor passes loaded
and pending title/favicon gestures plus the HTML control, without source removal.
This establishes the reproduced trusted native initiation boundary, not every
possible drag/drop completion or everyday-profile interaction.

Explicit preset selections now retain their slot in a separate BZF-owned
association preference. The original strict v1 colour ledger remains unchanged;
palette edits update resolved paint without rewriting its fallback hex. Legacy
or custom colours are never inferred to be linked by matching hex. Reselecting
a swatch establishes a link; applying a changed Custom Colour or Reset removes
it. Native unchanged-completion/Cancel protection is retained. Recovery preserves
known links for both original and remapped folder identities. A real 0.3.18
downgrade reads the fallback, and a custom colour chosen there remains custom
after upgrading despite further palette edits.

An independent bounded review found three Important transaction/popup defects.
Each was reproduced red before repair: suppressed reentrant notifications are
now drained; save compensation only restores bytes still owned by that save;
and the active popup refreshes colour, preset selection and Reset state after
external changes, including same-colour/different-slot and null states. Close
and teardown release the folder listener. The focused follow-up independently
ran eight affected cases, found no remaining material objection, and did not
reopen unrelated work or claim native qualification on its own.

Actual Icons RC2 integration also reproduced a folder-menu snapshot freezing
mid-transition opacity. Snapshots now read the final CSS-transition keyframe
for supported properties on the source node, without finishing, cancelling or
mutating the live sidebar animation. The source regression and actual native
outline-selector/menu sequence both pass. Sidebar animations are left intact.

Final source verification: **1,305 passed, zero failed, one historical screenshot
skip** (1,306 total); Python package checks **16/16**; syntax and whitespace checks
pass. Installer safety tests were rerun immediately before staging: **3/3**.
All four packaged files match the reviewed/tested source. Script SHA-256:
`6ea5e8677e358cc16463f84c2dfc67f562d37bf4716fe54778114cc09ba364f0`.

The exact package ran through unchanged Sine in fresh synthetic headless
**Zen 1.23.2b / Gecko 157.0.1, build 20261009073723**, with exact **Icons
0.3.0-rc.2**. Native checks cover actual swatch clicks, live open-panel palette
and external-storage updates, same-colour slot changes, Reset, custom detachment,
recovery, clean restart and actual predecessor downgrade/upgrade. Icons' selected
native receipts additionally cover menu paint, trusted URL-pin/Sticky controls,
both load orders and restart. An intermittent earlier combined-startup timeout
without a JS exception is not silently classified as solved by later green runs.

Selected release: `artifacts/releases/20261015-v0.3.19-preset-drag-local/`.
`receipt.json` records the closed four-file inventory, native inputs and selected
proof hashes. `verification/` retains the meaningful failing/passing drag and
menu traces, swatch restart/downgrade traces, and reproduction probe/driver code;
routine attempts, logs, profiles and extraction copies remain in
`.backup-scratch/round8/` and `.backup-scratch/round8-unloaded/`.

The guarded installer acquired the closed shared profile's native lock and
installed **0.3.19**, retaining the previous **0.3.18** generation for rollback.
Final readback verifies all four installed files and **3,544 protected files
unchanged**, including complete other-mod inventories, Icons RC2/custom artwork,
profile settings/sessions and Sine engine. Other registrations, local enablement
and imports are unchanged. Receipt:
`artifacts/releases/20261015-v0.3.19-preset-drag-local/shared-test-installation.json`.
Shared activation **not-launched**; everyday profile **not accessed**. This is a
verified test candidate, not alpha finalisation or everyday acceptance. No push
was made: this checkout has no configured owned remote.

Subsequent Icons-only update: **Icons 0.3.0-rc.3** is now installed beside this
same BZF 0.3.19 package. Its guarded readback preserved 5,306 protected files;
this BZF task independently rehashed all four installed BZF files and checked
both registered versions afterward. The exact RC3 archive additionally passed
281 native assertions across 14 selected scenarios, including both loading
orders/restarts and the actual outline/menu snapshot repair. Those are separate
successor proofs, not a relabelling of the RC2 swatch/drag evidence above.
Durable Icons record and selected installation/native JSON:
`Zen-Icons/output/releases/Zen-Icons-0.3.0-rc.3-VERIFICATION.md` and adjacent
`Zen-Icons-0.3.0-rc.3-verification/`, relative to the encompassing Zen project.
No shared or everyday browser was launched for this later installation either.

Publication addendum: the five-file public package is now in
`YiftahCooper/Zen-Mods`, `main`, commit
`6bcfedeaf0ec4aecb1fda736489649b01b03cf98`. Script/CSS/preferences are unchanged;
only a brief public README and theme homepage/date metadata were added. A
non-forced leased ref update and remote tree/blob readback preserved other mods
and the inert catalogue. Actual stock **Sine 2.3.4.1c** installed the published
GitHub folder in a fresh synthetic headless profile: only BZF registered, the
child folder flattened correctly, all five installed files matched, URL pins
activated and preset following worked. A second fresh profile exercised stock
`processModUpdate` using an intentionally old fixture metadata date against the
same published version; colour data survived and its folder/preset returned
after restart. This is not a different-version or everyday-profile claim.
Selected evidence is in the encompassing Zen project's
`Zen-Mods/artifacts/publication-20261015/`. Icons publication is held separately
while its confirmed stock-updater custom-artwork deletion fault is repaired.

Still open: possible persistent folder-colour darkening and the earlier native
rename/Enter crash/intermittent loader-attachment anomaly. Collective native
focus fading is deliberately excluded from the colour bug, as instructed. The
separate Sports layout issue remains outside this change; no general
shared-scrolling feature was added. Earlier 0.3.18 unloaded-drag statements below
are historical and superseded by the reproduced repair in this section.

## 2026-10-15: internal drag destinations, 0.3.18

The video `GS0SLJO6vm.mp4` shows a branch ending before a later ordinary tab in
its outer folder. The old chooser searched only each top-level folder's final
rendered chain, missing this internal boundary. The repair retains the local
branch identity while offering every receiving ancestor, deepest first. Each
folder choice uses its own live icon snapshot and colour strip. **Colour-Code
Drag Destinations**, under Dragging, defaults on; off uses neutral icons and no
strips. Existing hover timing and native movement ownership are unchanged.

Final source verification: **1,278 passed, zero failed, one historical-input
skip** (1,279 total); Python package checks **16/16**, syntax and whitespace
checks pass. New tests observed the missing choices, absent setting, incorrect
diagnostic surface classification and scaled-overlay defect fail before their
repairs passed. All five receiving depths use the retained native movement
replay; isolated Chromium checks cover LTR/RTL, translation/scaling, viewport
clipping, unchanged native rows, neutral presentation, unique SVG resources and
snapshot stability. Programmatic scrolling checks reachability after scrolling,
not physical drag-to-scroll behaviour.

One independent bounded reviewer ran 79 focused tests successfully and identified
an Important scale-conversion defect. Both new rendered scale regressions failed
before converting viewport coordinates/dimensions back to local CSS pixels;
they now pass, as does the complete final suite. No second review is implied.
The reviewer set aside the unloaded-tab symptom, Icons changes, publication and
physical/everyday/shared-profile operation; those remain outside this repair's
claims, not silently resolved.

Exact four-file package loaded through unchanged Sine in a fresh synthetic
headless **Zen 1.23.2b / Gecko 157.0.1, build 20261009073723**. Native geometry
checks verify all five real hit targets, saved receiving-folder colours, unique
snapshot IDs, neutral preference and no movement of existing native rows. This
does not establish physical drag-start reliability or everyday-profile acceptance.

Selected release: `artifacts/releases/20261015-v0.3.18-drag-levels-local/`.
Its `receipt.json` contains exact package hashes and the native verification
result/probe. For authorized regeneration, `verification/native-run.mjs` accepts
`BZF_ROUND7_PACKAGE` pointing to the selected `better-zen-folders/` directory;
it uses the retained profile-checked driver and copies only Sine engine code
into a fresh offline synthetic profile. Intermediates remain in
`.backup-scratch/round7/`; this is not authority to launch any user profile.

The guarded installer acquired the closed shared profile's native lock and
installed **0.3.18**. Final readback verifies all four files, the retained 0.3.17
rollback package, and **3,539 protected files unchanged**, including installed
Icons/custom artwork, profile preferences, sessions and Sine engine. Other mod
registrations, local enablement and Sine imports are unchanged.
Receipt: `artifacts/releases/20261015-v0.3.18-drag-levels-local/shared-test-installation.json`.
Shared activation **not-launched**; everyday profile not accessed. No publication
is performed: the folder checkout has no configured owned remote.

The user reports the other requested 0.3.17 checks appear to work; that positive
return is retained rather than reclassifying them as wholly untested. It is not
blanket alpha finalisation. The separate unloaded-tab drag-start observation is
still open: bounded source routing probes found no pending/discarded eligibility
gate in BZF, installed Icons, or native drag-source admission. No trusted failing
gesture proves which boundary is responsible; no speculative gesture fix was
added. Possible persistent colour darkening and the earlier native rename/Enter
crash/loader anomaly also remain open. Native collective focus fading and the
separate Sports layout issue remain outside this repair.

## 2026-10-15: authorised closed shared-test update

Installed receipt:
`artifacts/releases/20261015-v0.3.17-round6-local/shared-test-installation.json`.
BZF's guarded installer acquired the native profile lock, retained its predecessor,
installed 0.3.17 and verified all four file hashes. The Icons installer then used
a narrow package based on the existing installed build: only
`modules/src/zen-icons-sine/tab-default.mjs` changes, plus its inventory metadata.
Seven unrelated Icons development changes in the original full source package
were deliberately excluded. All 3,393 installed code/inventory files match that
narrow package; all 12 current custom files are preserved.

Readback verified 145 protected profile/session/Sine files unchanged, other mod
registrations and imports preserved, both mods' local enablement retained, and
both prior packages intact for rollback. Installer safety regressions 3/3 passed
immediately before use. Two readback-wrapper issues (its own exclusive lock and
case-sensitive hex receipt comparison) were corrected without reinstalling or
changing product bytes. Final guarded readback passed.

State: **installed-hash-verified**, activation **not-launched**, user acceptance
pending. Everyday profile not accessed. The user explicitly clarified that routine
verified updates to the closed shared test profile should proceed without repeated
approval; that does not extend to everyday-profile changes or browser launch.

## 2026-10-15: Round 6 repair candidate 0.3.17

Report: `docs/reports/2026-10-15-round6-alpha-return.md`.
Current full BZF suite: **1,261 passed, zero failed, one historical-input skip**
(1,262 total); Python package checks **16/16**; syntax and whitespace checks pass.
The missing input is an expired Windows Temp screenshot, not a skipped product
regression. Icons suite **148/148**, including layout and isolated installer
rollback checks. The independent review's wrong-adapter SVG-refresh finding was
reproduced, repaired and rechecked. No remaining concrete findings in its bounded
follow-up; that review is not a blanket native or real-profile acceptance.

Fresh disposable native Zen 1.23.2b/Gecko 157.0.1 verifies actual pin commands,
duplication intent, Settings icon reset, individual Sticky Undo, restored collapsed
artwork, child-only preview state, live preview badges, underline centring, actual
Sine settings geometry and string-based saving. Eight actual-menu root Unpin
combinations passed. A Text-node cancellation defect has a red/green regression
and native event-propagation check; intermittent physical gesture reliability and
the reported disappearing root Unpin remain unconfirmed, not blanket fixes.

The local package receipt is separate from installation. No everyday/shared test
profile change, publication, alpha finalisation, or native focus-effect change
is claimed here. Rename/Enter crash, possible persistent darkening and the prior
loader anomaly remain open. The earlier accepted chooser behaviour is retained.

## 2026-09-28: authorised closed-test-profile installation

Following the user's explicit approval, the exact suite-15 candidate was installed
into `.test-profile-v2`. No product bytes or version label were changed for staging.
Receipt: `artifacts/releases/20260928T160447Z-v0.3.16-round2-ac810204/receipt.json`.
Custody: `artifacts/alpha-preview-review/staging-folder-pins-1790611485970/result.json`.

The existing installer passed all three staging regressions immediately before
use, including locked-profile refusal and registry-lock rollback. Fresh package
checks 16/16, syntax and diff checks passed. Every product/test hash still matched
suite-15 before and after the operation. The installer held the exclusive native
profile lock throughout replacement; all four installed files and the backup's
four predecessor files were verified. Registry replacement preserved other mods
and BZF's local flags. The 130 separately hashed profile root/session-backup/Sine
files matched before/after, as did the existing Icons/import/settings custody check.

Installed state: **installed-hash-verified**. Activation: **not-launched**.
Rollback: not needed; the prior complete package is retained at
`.test-profile-v2/.better-zen-folders-rollbacks/20260928T160447Z-v0.3.16-round2-ac810204`,
with the predecessor registry in the release directory. No main-profile changes,
browser launch, commit or publication. The unchanged 0.3.16 label alone does not
identify this build; use the receipt/digests. User runtime acceptance remains open.

## 2026-09-28: integrated folder URL pins, source-complete and unstaged

Current report: `docs/reports/2026-09-28-folder-url-pins-integrated.md`.
This section supersedes the earlier foundation's outstanding-work status, not its
historical evidence. Normal Sine bootstrap now owns activation, compatibility
consent/migration, folder-only commands, creation/move/duplicate/Undo handling,
mirrored state, separate pin UI and grace/error feedback. No Sine engine change
was adopted; the approved resume-last-page/reset-off rule is enforced with an
explicit choice rather than a silent existing-profile preference change.

Final full run `artifacts/alpha-preview-review/suite-15/identity.json`:
**1,236/1,236 Node tests**, 72 files, zero failures/skips/cancellations, unchanged
product/test hashes. **16/16 Python package checks**, product module syntax and
`git -c core.safecrlf=false diff --check` passed after README/plan updates.

Script SHA-256:
`48aeceea5c2b725ad6024ccc2ff8f63cae2dca1e061f6443bb4399d6584f1de1`.
CSS SHA-256:
`43399137d9186abded39c9b517851ab4abbd6814375ec6b96c4c8b8b03379df3`.
Preferences/theme and all test hashes are in the suite receipt.

Final-source disposable native matrix covers normal Sine activation, actual
New Tab in Folder typed-result handoff, mixed Close/Unload, delayed Unpin,
disabled native Pin/Unpin and reimport, moving during Pin, two-window root
reconciliation, Space/synchronized-window moves, asynchronous duplicate,
single/whole-folder multi-entry Undo, normal/lazy/flushed forced-stop recovery,
and current Icons composed before/after BZF with native pointer/XUL checks.
Each final matrix receipt verifies unchanged source and copied Sine engine hashes.
See the report for exact receipt IDs, negative controls and evidence limits.

One independent whole-plan review found four Important issues and one Minor;
red-first repairs plus bounded independent verification closed all five. The
foreign-document mirrored-root counterexample exposed during repair verification
also has a production-adapter regression and final native two-window proof.

Private/unsynced URL-pin operation is explicitly unavailable, with visible
feedback; no hanging activation or claim of supported native baseline storage.
First-run dialog visual acceptance, real-profile/third-party-mod behaviour,
physical OS drag paths and arbitrary crash atomicity remain separate gates.
Rename/Enter crash, possible persistent colour darkening, and the earlier
unreproduced loader attachment anomaly remain open. Native focus fading stays
excluded. No shared/daily-profile write, staging, commit, publication or alpha
acceptance occurred; the installed test receipt still covers only 0.3.16.

## 2026-09-28: approved normal-Sine pin foundation, not activated

Report: `docs/reports/2026-09-28-folder-pin-command-foundation.md`.
The user accepted resume-last-page startup with automatic native reset off and
manual explicit Reset retained. The compatibility decision below is historical,
not still awaiting an answer. No native preference or Sine change was silently
applied to an existing profile.

Source now contains the intent store, core policy/native adapters, and owned
Reset/Close hooks. Normal bootstrap does not instantiate them. Direct native
commands passed in disposable profiles, as did normal/lazy/flushed-state abrupt
recovery. A red/green native comparison verifies public/private ordinary Reset
protection, capture of the already-bound `cmd_close` path and exact split-tab
close. Two-window commands are temporarily refused without mutation until
cross-window intent and baseline coordination is implemented.

Review defects were reproduced and repaired; the final bounded review closed
its findings. Source SHA256
`6c7d1af3dd58c491dc2657ad19e4d3592271fda85c4a3be1da85e77093c5cff5`
passed the final hook-positive native run and normal restart, engine hashes
unchanged. **1,171/1,171 Node tests**, 66 files, zero failures/skips/cancellations,
unchanged hashes (`artifacts/alpha-preview-review/suite-11/identity.json`).
Python package checks **16/16**; product syntax and `git diff --check` passed.

Migration/compatibility UI, complete command routing, move/duplicate/undo and
cross-window integration, badge/settings/grace and integrated input/Icons checks
remain outstanding. The prior loader anomaly is unreproduced, not resolved.
Daily/shared profiles unchanged; no staging, commit, publication or alpha release.

## 2026-09-28: normal-Sine alternative, compatibility decision pending

Report: `docs/reports/2026-09-28-sine-only-folder-pins.md`.
The user requires normal Sine; the early engine-copy prototype is not adopted.
Fresh native checks with startup reset off preserve current pages/history in
normal, lazy and registry-disabled restart cases without any engine changes.
Selective public Reset works after a deliberately delayed Sine mod attaches.
One forced-stop recovery attempt failed to load the mod; a repeat passed, but
the failure remains unresolved. Native reset-on is an expected history-loss
control. These are narrow prototype results, not complete pin-policy proof.

Requiring native automatic startup reset off is a proposed compatibility
condition awaiting user agreement, not a silently applied global preference.
No production/profile/staging changes. Original full-scope startup gate remains
unpassed; see report for private reset, lifecycle and recovery limits.

## 2026-09-28: authorised early-loader prototype, not adopted

Report: `docs/reports/2026-09-28-early-pin-startup-prototype.md`.
A synchronous import in disposable copies of Sine intercepts native manager
assignment before init. Selective suppression alone exposed an eager root-pin
restore race; optional restore-order coordination then passed eager, actual lazy
activation and flushed-state abrupt restart, preserving ordinary B/history and
resetting explicit/root pins to A. Final cases share early-module hash
`d27623edd34f7489a3d67f560054f74208ac4e1e5f32ba976339fa4cd29d8184`.
Native no-argument API mismatch was reproduced and corrected; active/inactive
calls, explicit Reset, identity/baseline and later-owner cleanup checks pass.

This establishes a prototype route on the installed build, not a release gate.
Early loader ownership, actual Sine disable/update/uninstall and queued reset
lifecycle remain unimplemented. No production files changed; migration off.
Fresh source suite **1132/1132**, 62 files, zero failures/skips/cancellations
(`artifacts/alpha-preview-review/suite-07/identity.json`); package **16/16**.
No existing profiles opened/written; no staging, commit or publication.

## 2026-09-28: folder URL-pin startup gate not passed

User approved inline execution. Task 1's native probes demonstrate selective
startup protection in normal recorded Sine runs, but loss of ordinary current
URL/history when the protection arrives late. Intent metadata survives the loss.
Corrected delayed background attachment was observed and was still too late.
Independent review supports **blocking migration**, not declaring all possible
solutions impossible. Report: `docs/reports/2026-09-28-folder-pin-boundaries.md`.

Native Unpin leaves folder membership; native split close expands to both members.
Final native-action receipt: `tmp/two-area-spike/receipt-52972.json`.
No production changes in this investigation; plan Tasks 2–6 not started.
Source regression rerun: **1132/1132**, zero skips/failures/cancellations, 62 files,
`artifacts/alpha-preview-review/suite-06/identity.json`; same script hash as below.
Daily/shared profiles untouched; fresh disposable synthetic profiles only.
No staging, commit or publication. This is not live acceptance or alpha release.

## 2026-09-28: pure folder unload and disposable rename comparison, not staged

Report: `docs/reports/2026-09-28-pins-handoff-and-folder-unload.md`.
Source-stable full run `artifacts/alpha-preview-review/suite-05/identity.json`:
**1132/1132**, 62 test files, zero failures/skips/cancellations; product/test hashes
unchanged. Package checks **16/16**, syntax and diff checks passed. Script SHA256:
`b9f1cb3f092f20e9281cbc8dd901c18c1938ef98a910aab6e4794741a4bbf05b`.
CSS/preferences/theme hashes remain those in the preceding record below.

Pure regular-folder unload passed two headless native scenarios, each with direct
and nested tabs, opposite parent/child collapse states, current URL distinct from
saved baseline, and native reset-unload policy enabled. Native receipt:
`tmp/two-area-spike/receipt-48336.json`. Strengthened final receipt `receipt-58664.json`
also passes exact baseline and full session-history equality; intervening failed
title-timing assertions and their diagnosis are retained in the report.
Unit/independent review covered refusal,
overlapping requests, retries, moved tabs and cleanup; native live-user acceptance
is separate. Optional minus stays OFF by default and its visibility remains native.

Four fresh-profile rename comparisons passed 12 attempts each: native, current
Folders, current Folders + installed-matching Icons, installed Folders + Icons.
The exact package hashes and harness limitations are in the report. The original
rename crash is **unresolved**, not repaired by negative reproduction. No shared
or everyday profile was opened/modified. No staging, commit or publication occurred.
The Better Pins task is created and parked; the folder-only pin lifecycle plan is
written for review, not implemented or transferred out of BZF.

## 2026-09-28: returned Round 3 bounded repairs, not staged

Scope: `docs/reports/2026-09-28-bounded-repairs.md`.
Final full run: `tmp/2026-09-28-bounded-suite-03.log` — **1123/1123 passed**,
zero failures, skips or cancellations. Package checks: **16/16 passed**.
`node --check scripts/better-zen-folders.uc.mjs` and `git diff --check` passed.
The four product files were hash-checked before and after the full run and
remained unchanged:

| File | SHA-256 |
| --- | --- |
| scripts/better-zen-folders.uc.mjs | 91d7cbb486512753a9ec22c68f3792d991fa24ea2b32104e4634219d7e672e48 |
| chrome.css | fb11872a3ec260f2fa181462b126b1abb9ff118a71f5894e6a4f2399e26fe9c8 |
| preferences.json | 35e81118f9b1f875b5937955b7782e24c6afac75bc6b12848c04649dd4f72848 |
| theme.json | fe3e71ed606849329bb293ce6ac6562e759d4f695a1486081f7aa60307d59dc8 |

The independent source review found a deferred Sticky-save exception bypassing
the click handler and leaving stale pending paint. Failing tests reproduced it
for both tabs and folders; the repair catches/reports the error, refreshes from
saved state and consumes prepared motion. The final suite includes successful
retry and retained-visibility coverage. Reviewer re-inspection closed that source
finding; the final execution results above are the main agent's verification.
Review tests regenerated local derived preview artwork; no user originals were
modified. Earlier full-run logs are retained, not reused as final-source proof.

The preview eligibility, deferred popup grouping, current-marker-only hit area,
0.5-second cancellable removal, last-child/root exit, selected-tab retention,
reduced motion and neutral default folder colour tests are isolated Chromium or
adapter evidence. No live Gecko/profile acceptance is claimed. No staging,
version bump, Zen launch, commit or publication occurred. The installed
disposable 0.3.16 receipt below describes its older bytes only.

The repeated native rename crash remains unresolved. The broader explicit-pin
design is written for review, not implemented. Neither item is closed by these
test results.

## 2026-09-27: 0.3.16 grouped previews and Sticky menu artwork

Scope: `docs/reports/2026-09-25-alpha-preview-and-colour.md`.
Fresh source-stable run `artifacts/alpha-preview-review/suite-03/identity.json`:
**1099/1099 passed**, 60 test files, no failures, skips or cancellations.
Product/test hashes remained unchanged. Python package checks: **16/16**.
Earlier baseline and failed integration runs are retained beside the passing run.

Coverage includes recursive preview ordering, preview-only collapsed state,
search/path restoration, all three policies, keyboard/RTL, long-name layout,
stale tab activation, repeated openings and teardown. Sticky menu artwork follows
the underline/corner preference, with native checked-state and CMI placement
retained. Current eight presets are pixel-equal across the native-art fixture,
selected swatch and Custom Colour chip in light and dark themes.

The screenshot's local shadow overlap is addressed by 16 CSS pixels of picker
clearance. Live Gecko popup placement is **not** established by isolated Chromium
tests. Native focus fading is unchanged and excluded from the alpha bug list;
the possible separate persistent-darkening issue remains open.

The first independent feature-review attempt ended at a usage limit without a
verdict. The replacement review reproduced split-view ancestry leakage, a mixed
mouse/keyboard activation mismatch and search-time teardown inconsistency. Four
new regressions failed before repair; all thirteen focused preview checks passed
afterwards. The reviewer rechecked all three fixes, plus preservation of search
focus while hovering, and found no remaining issue in that bounded scope.

Final source-stable gate: `artifacts/alpha-preview-review/suite-04/identity.json`,
**1103/1103 passed**, zero failures/skips/cancellations, with unchanged product
and test hashes. The guarded staging gate also passed all **16 package checks**,
syntax and diff checks before changing the disposable profile.

Installed-hash-verified release:
`20260926T212940Z-v0.3.16-round2-38f9d7e0`.
Custody: `artifacts/alpha-preview-review/staging/after.json`. All four installed
files match the tested source. Profile preferences/imports/Sine engine, Icons
core files, other mod registrations and BZF local flags are unchanged. The
0.3.15 predecessor and registry are retained for recovery; rollback was not
required. Activation remains **not launched**. No main-profile change,
publication or Zen launch/control occurred. Live acceptance is still pending.

## 2026-09-22: 0.3.15 reversible Sticky underlines

Scope: `docs/reports/2026-09-22-round13-sticky-underlines.md`.
Source-stable `artifacts/round13-review/suite-02/identity.json`: **1070/1070**
passed across 58 files, zero failures/skips/cancellations; product/test hashes
unchanged during the run. Python package checks: **16/16**.
Red-first underline/preference and hover-opacity checks are included, along
with retained triangle rendering and existing interaction regressions. Independent
review's tab-icon centring finding was reproduced red-first and corrected using
native margins; recheck found zero LTR/RTL centre error and no outstanding findings.
Standalone headless rendering is not live Zen, Gecko/XUL or accessibility
acceptance. Installed state is a separate guarded staging receipt.

Installed-hash-verified release: `20260922T115750Z-v0.3.15-round2-d201f898`.
Custody: `artifacts/round13-review/staging/after.json`. Profile preferences,
imports, Sine engine, Icons core, other registrations and local flags unchanged.
0.3.14 rollback package/registry retained. Activation: not launched.

## 2026-09-22: 0.3.14 compact palette and header-drop placement

Scope: `docs/reports/2026-09-22-round12-settings-and-drop-placement.md`.
Source-stable gate `artifacts/round12-review/suite-01/identity.json` records
**1066/1066 passed**, 57 test files, zero failures/skips/cancellations, unchanged
package and test hashes. Includes headless Chromium and isolated staging fixtures;
`BZF_ROUND10_FAULTS=1` enables the existing drag-resume fault cases.
Python package checks **16/16** passed separately.

Red-first regressions covered actual Sine row distribution, conditional per-swatch
reset and stale callbacks, depth-progressing Sticky paint, and explicit circle
pixels under a forced border-radius reset. The latter is a compatibility check,
not identification of the live style that caused the previous square.

Independent drag review found mixed existing/incoming multiselection could bypass
placement. Its native-receiver regression failed before correction and now passes.
RTL ordering, inactive teardown, whole-folder Top/Bottom and a collapsed target
are covered by 25 header tests. Review confirmed the final implementation hash
`93e42e1c17cd2a9e230f752fcf82cf88217e4640f92e1bc24094b114b39896ba`.
The base native drop/receiver replay is not a complete live drag-over or motion
test. Native transition/landing geometry can precede BZF's final reorder; no
visual failure was demonstrated. Real Gecko motion and macOS drag-image landing
remain unverified, as do native settings/colour-dialog and assistive-tech behavior.

Independent palette review passed 7/7 focused checks; independent visual/menu
review passed 70/70 with unchanged reviewed inputs. No remaining blocking findings.
Installed receipt:
`artifacts/releases/20260922T110220Z-v0.3.14-round2-6280a80d/receipt.json`.
All four installed BZF files match the source-stable candidate. Staging gate
package 16/16, syntax and diff checks passed. The predecessor 0.3.13 package and
registry are backed up. `artifacts/round12-review/staging/after.json` verifies
unchanged profile preferences/imports, Sine loader metadata, Zen Icons core,
other mod registrations and local BZF flags. Activation remains `not-launched`.
No everyday profile was changed; no Zen control, commit or publication occurred.

## 2026-09-22: 0.3.13 settings, editable palette and guide cycle

Approved Round 11 scope is recorded in
`docs/reports/2026-09-22-round11-settings-and-guides.md`. The original screenshot
comparison is in `docs/reports/2026-09-22-round11-spacing-measurements.md`:
pinned and ordinary sampled rows both repeat every 80 image pixels. Different
painted icon/text heights explain varying visible whitespace in these samples;
no new row-height override is added.

Initial source-stable full run: **1034/1034 passed, no failures/skips**, 55 test files,
including isolated headless Chromium and Windows staging-failure fixtures.
`artifacts/round11-review/suite-01/identity.json` hashes all four package files
and every test file before/after and confirms unchanged inputs. The optional
drag-resume fault cases were enabled with `BZF_ROUND10_FAULTS=1`.
Palette, Space fallback and four-level ancestry projection tests were red before
their repairs; the guide/triangle tests also caught paint outside the original
hitbox, which was corrected and checked using real headless mouse events.
The 16 Python package checks pass both in the focused run and staging gate.

Adverse independent review: suite-01 is **not a release gate**. Its split-view
moveTabTo replay used an older native receiver and `_tPos` test seam. The current
installed native tab/receiver use `index`, so the production split guard returned
early and left part of a Top-moved block at the bottom. The reviewer reproduced
this with `index` present and `_tPos` absent. The green receipt is preserved;
that source and replay were corrected rather than accepting the green result.

Corrected gate: `artifacts/round11-review/suite-02/identity.json` records
**1036/1036 passed, zero failures/skips**, again with all package/test sources
unchanged during the run. The split path now uses `index`; the replay captures
the installed Zen 1.22.2b `Tabbrowser.sys.mjs::moveTabTo` and index-only fixture
tabs. New regressions exercise both split representations without `_tPos`.

Final gate: `artifacts/round11-review/suite-03/identity.json` records
**1037/1037 passed, zero failures/skips**, source-stable. It adds a read-only
installed-archive identity check after suite-02, asserting the replay method and
both native source hashes. The independent reviewer confirmed the exact frozen
fix, including reproducing the failure when reintroducing `_tPos` in memory.
Palette/settings and guide/triangle cross-reviews found no actionable defects.

Installed receipt:
`artifacts/releases/20260922T091432Z-v0.3.13-round2-b07596b0/receipt.json`.
All four installed files match the source-stable candidate. The predecessor
0.3.12 package and registry are backed up. Custody verification in
`artifacts/round11-review/staging/after.json` confirms unchanged profile settings,
imports, Sine loader metadata, Zen Icons core files, other mod registrations and
BZF local enablement/update flags. Package 16/16, syntax and diff checks passed.
Activation is explicitly `not-launched`; live acceptance remains pending.

These are source/fixture results, not a native Gecko/XUL, Windows colour-dialog,
assistive-technology, everyday-profile or publication acceptance claim.
Zen was not launched, attached to, closed or controlled.

## 2026-09-22: 0.3.12 Space menus and returned palette/spacing review

Source-stable full local gate: **968/968**, 51 files, no failures/skips/cancellations.
Receipt: `artifacts/round10-review/suite-03/identity.json`. Includes two explicitly
simulated coordinate-mismatch checks (`BZF_ROUND10_FAULTS=1`), not claimed Gecko
reproductions. Package checks **13/13**, syntax and `git diff --check` pass.
Earlier adverse suites and rejected optical resize evidence are retained.

Native classic/alternate menu layout implementations/descriptors are replayed;
original commands, destination generations, extra actions and teardown survive.
Saved theme-colour markers do not invoke native picker calculations. Current-Space
check-slot visibility is checked in modeled DOM/CSS, not live Gecko painting.
Closed-artwork resizing improves the controlled vertical paint gap; open artwork
and native row geometry are unchanged. The reported menu-icon offset remains a
live acceptance item; fixture centring does not identify its full native cause.

Installed receipt:
`artifacts/releases/20260922T081307Z-v0.3.12-round2-c2b94766/receipt.json`.
All four files match the tested candidate. Previous package/registry are backed
up. `artifacts/round10-review/staging/after.json` verifies unchanged settings,
imports, checked Zen Icons companion files, other registrations and local flags.
Activation: **not-launched**. No everyday-profile change, browser control,
commit or publication. See Round 10 record (historical local reference; not distributed).

## 2026-09-22: 0.3.11 folder movement, palette and menu alignment

Source-stable full local gate: **903/903**, 47 files, no failures/skips/cancellations.
Receipt: `artifacts/round9-review/suite-03/identity.json`. Package checks **13/13**,
controller syntax and `git diff --check` pass; retained logs in
`artifacts/round9-review/staging/`. Earlier failed gates are not discarded.

Whole-folder top/bottom moves use installed native receiver bodies in replay.
Additional modeled synchronous grouping/movement events verify temporary holds,
collapse restoration and subsequent empty-parent cleanup. Native split groups at
either insertion edge and conservative unknown-child handling are covered.
Actual Gecko custom-element lifecycle, menus, animations and persistence still
require manual acceptance; modeled events are not a running-Zen receipt.

Menu geometry: 24 LTR/RTL, open/closed, scale and slot combinations pass with both
mods' styles; 240 repeated decoration calls leave no retained measurement nodes,
snapshots or resources after cleanup. Palette swatch/application equality and
preservation of saved colours are covered. Native-layout drag resumption retains
the complete configured delay and rejects invalid/cancelled hover sessions.

Staging receipt:
`artifacts/releases/20260922T055656Z-v0.3.11-round2-6b597aa8/receipt.json`.
All four installed hashes match the tested package. The predecessor and registry
backup are retained. `artifacts/round9-review/staging/after.json` verifies preserved
profile configuration, checked Zen Icons companion files, other registrations,
and BZF local flags. Activation is **not-launched**. No everyday-profile change,
browser control, commit or publication occurred. No sidebar-spacing resize was
made; the unload/spacing report distinguishes evidence from remaining uncertainty.

See Round 9 record (historical local reference; not distributed).

## 2026-09-22: 0.3.10 returned-trace drag repair

The returned 0.3.9 trace and video demonstrated missing source acquisition and
the divider dead zone; earlier passing fixture suites did not prove reliable
live use. User approved the targeted repair. Native-compatible parent-node
source traversal and passive-divider trigger eligibility are implemented.

All 860 tests (44 files) pass without failures/skips, with stable package/test
hashes: `artifacts/round8-review/suite-01/identity.json`. Four real-DOM LTR/RTL
cases include Text targets and actual divider hit testing. Python package checks
13/13, syntax and git diff --check pass. Independent review found no blocker.
Installed four-file hashes match the tested candidate; live acceptance pending.
Staging receipt: `artifacts/releases/20260922T034901Z-v0.3.10-round2-1b3fa61c/receipt.json`.
See Round 8 record (historical local reference; not distributed) for adverse red
logs, the intentionally replaced blanket separator exclusion, and proof limits.

## 2026-09-22: 0.3.9 multi-failure drag diagnostic candidate

Source-stable full local gate: **837/837**, 43 files, zero failures/skips/cancellations.
Receipt: `artifacts/round7-review/suite-01/identity.json`; all four package hashes
are unchanged before/after the run. Python package checks **13/13**, syntax and
`git diff --check` pass. Independent unload/colour and diagnostic reviews found
no staging blocker. This is not live Zen acceptance or a claimed drag repair.

Changes: opt-in multi-attempt/multi-reason drag recording and explicit context-menu
copy, flat custom-colour artwork, and **Show Unload Button on Folder Rows** (off
by default), preserving the plus, chevron, live actions and context-menu unload.
The confirmed Sticky menu layout is untouched. Native drag decisions remain in
place; the user's intermittent chooser activation still needs a live trace.

Guarded staging receipt:
`artifacts/releases/20260922T024533Z-v0.3.9-round2-9422283f/receipt.json`.
Status `installed-hash-verified`, activation `not-launched`, rollback `not-required`.
The predecessor and registry backup are retained. `artifacts/round7-review/staging-after.json`
records matching installed hashes and preserved unrelated settings, imports,
checked companion files, other registrations and BZF local flags. No Zen launch,
desktop control, everyday-profile change, commit or publication occurred.

Detailed evidence, interpretation limits and manual capture instructions:
Round 7 report (historical local reference; not distributed).

## 2026-09-21: 0.3.8 returned Round 6 candidate

The user accepts the current Sticky silhouette as the best iteration and confirms
icon-mode settings width is stable. The supplied colour video shows no measurable
persistent darkening in matched yellow/green interiors after Cancel. The visibly
stronger folder colour is consistent with native 125% SVG contrast and shading;
no compensating colour change is applied. Native minus-button source confirms an
intentional unload/selection-switch/collapse command. Chevron visibility follows
the saved `outline-free` policy at every depth, not a top-level restriction.

Sticky menu decoration now precedes the label and preserves the separate native
checkmark. Independent review passed 51 menu checks plus 12 additional geometry
probes; the old helper/CSS fails 49 of those checks in an in-memory negative
control. Sidebar Sticky artwork is unchanged.

Interim suite-02: **762/762**, zero failures/skips/cancellations, source-stable,
before the subsequent delay setting and drag runtime repair. Its identity is
`artifacts/round6-review/suite-02/identity.json`. The menu worker's separate full
run exposed a transient exact-coordinate alignment-fixture failure; main changed
the test's fixed sleep to actual animation completion without relaxing geometry
assertions. Main suite-01 exposed a stale diagnostic-build expectation. Both
adverse results and their corrections remain recorded.

The user approved making destination dwell configurable. The new free-entry
**Drag Destination Hover Delay (ms)** defaults to 300 and is separate from folder
expansion timing; 0 is immediate on region entry. Preference/UI tests ran red then
**14/14 green**, Python package checks **13/13** after documenting the setting.
Drag probes have identified premature descendant-blur cleanup, asymmetric initial
copy-to-move recovery, immediate reveal and tail-only availability. Runtime repair
is underway; these probes are not repair acceptance.

The current native fixture source entries (drag/drop, pin routing, receiver) were
freshly hashed from installed omni archives and all match retained fixture hashes:
`artifacts/round6-review/native-drop-source-check.json`. Source examined: Zen
1.22.2b, Gecko 156.0, build 20260915091052, stamp
e74571eead515d37edd0914739f744bcb5258c51; disposable Sine 2.3.4.1c.

Final local suite-04: **795/795**, zero failures/skips/cancellations, unchanged
package hashes throughout. Python package checks **13/13**, module syntax and
`git diff --check` pass. Script SHA-256:
`5da6c100dddfcb56a3f1c00855ddfc1d9979eca57634d610bca87b85e74c64a9`.
The earlier suite-03's three missing-session fixture failures are retained;
supplying native session fields left its original visibility assertions intact.
Review additionally required preserving native folder-label hover protection.
That repair is included in the final green suite, alongside pointer cancellation,
multi-tab hover, and chooser/header separation regressions.

Independent final review passed **155/155** checks against the same source,
with all four findings resolved and no outstanding scoped finding.
Guarded staging succeeded as `20260921T172959Z-v0.3.8-round2-42428cad`:
all four installed files match the tested source; predecessor and registry backup
are retained. Post-stage custody verification confirms settings, imports, loader,
Zen Icons core files, other registrations and BZF local flags unchanged.
Receipts are under `artifacts/round6-review/staging-{before,after}.json` and
`artifacts/releases/20260921T172959Z-v0.3.8-round2-42428cad/receipt.json`.
This is installed-on-disk proof, not live acceptance.
No Zen launch, attachment, close, desktop control, everyday-profile modification,
commit or publication. See `docs/reports/2026-09-21-round6-return.md`.

## 2026-09-21: 0.3.7 returned Round 5 repairs

The user confirms ordinary top-level pinned navigation works in 0.3.6 and likes
the bottom-folder drag destinations, but reports difficult activation. They reject
the Sticky gradient, report icon-mode dialog resizing and missing menu artwork,
and confirm Custom Colour Cancel darkness persists after closing popups, moving
the pointer away and waiting. The menu scope was explicitly reconfirmed as only
Better Zen Folders commands. BZF adds no Space-menu commands.

Original media and diagnostic are preserved. The settings recording was decoded
offline using isolated headless Chromium after the existing Python decoder library
was unreadable; no ACL repair or desktop/browser control was attempted. Eleven
half-second samples cover the 5.167-second clip. See
`docs/reports/2026-09-21-round5-return.md` and `artifacts/round5-review/`.

Implemented boundaries under final integration:

- Flat, more-rounded Sticky silhouette; unchanged marker bounds, position and
  gutter hit target. Independent rendering/geometry review found no actionable
  issue, including LTR/RTL and visibility states.
- Full-width footer destination bands cover existing indentation gutters and
  inter-row gaps, remaining inside the measured footer and visible viewport.
  Independent review exercised native-drop replay, stale targets and clipping;
  no actionable defect was found. Live drag feel remains a user check.
- Separate folded-corner menu artwork retains the functional native/CMI checkmark.
  The scoped, font-relative settings width avoids selected-label-driven resizing.
- BZF-created menu SVG snapshots receive isolated IDs and local references before
  insertion. A production-adapter reproduction changed 1,192 sidebar pixels before
  the repair and zero afterward. Original SVGs and saved colours are untouched.

The colour trace's temporary 0.8 toolbar opacity recovers by its settled sample.
It is not an explanation for the user's persistent report. Resource-owner
renderability outside the sampled target chain was demonstrated as a diagnostic
blind spot. Repairing the reproduced clone collision does not yet establish the
native Cancel case is resolved; that remains manual acceptance, not a completed
claim. No broader diagnostic or compensating colour/contrast override was added.

First combined gate: **725/725**, zero failures/skips/cancellations, source stable
(`artifacts/round5-review/suite-01`). Independent resource review then found that
ID-based theme gradient-stop rules could stop matching renamed copies. A new
production-adapter test reproduced white/1 instead of the source's red/0.4.
Adding computed `stop-color` and `stop-opacity` to the existing snapshot closed
that finding; independent recheck confirmed unchanged source and copied paint.
The original adverse result and review finding remain recorded.

Final combined gate after that repair: **726/726 JavaScript tests**, zero failures,
skips or cancellations, all four package files stable throughout
(`artifacts/round5-review/suite-02/identity.json`). Python package checks:
**13/13** (`package-final-02.txt`); syntax and `git diff --check` also succeeded.
These are local package, captured-method and isolated Chromium checks, not live
Gecko or everyday-profile operation. Independent drag, triangle, menu and colour
reviews have no open findings within their respective scopes.

Guarded installation completed at **2026-09-21 16:17:11 UTC**, with receipt
`artifacts/releases/20260921T161711Z-v0.3.7-round2-80c4fd29/receipt.json`:
`installed-hash-verified`, activation `not-launched`, rollback `not-required`.
The disposable profile was exclusively locked during staging; 0.3.6 and its
registry predecessor are recoverable. The final source, frozen package and four
installed file hashes match. Readback also verified unchanged preference files,
Sine engine metadata, checked Zen Icons core files, other mod registrations and
BZF local enablement/update flags. Custody is recorded in
`artifacts/round5-review/staging-before-final.json` and `staging-after.json`.
The earlier `staging-before.json` was a read-only preflight before the review repair,
not an installation receipt, and is preserved with the superseded test gate.

No Zen launch, attachment, close or UI control; no everyday-profile writes, commit
or publication. User acceptance of the new shape, drag ease, menu presentation,
dialog width and native Cancel behaviour remains outstanding. The missing plus
glyph report for New Tab in Folder could not be reproduced independently; no
repair to that glyph is claimed. No general Space-menu icons were added.

## 2026-09-21: 0.3.6 returned Round 4 repairs

The user reports 0.3.5 Sticky animation/quick clicks, independent Sticky switches
and outline-free icon centering working. Root pinned navigation, absent end-drop
targets and colour Cancel darkening remain separate returned failures. Original
media and diagnostic are preserved; frame coverage, hashes and raster-spacing
measurements are in `artifacts/round4-review/evidence/`.

0.3.6 extends same-tab navigation to direct ordinary root pins and replaces four
obsolete drag ownership checks with current `documentGlobal` checks. Modern-node
fixtures now reproduce the missing-footer failure instead of supplying the removed
property. Native destination/movement code and both drag manager bodies are
unchanged. An independent reviewer found no actionable navigation/drag findings
and independently replayed 143 focused tests. See
`artifacts/round4-review/independent-navigation-drag-review.md`.

The accepted triangle keeps its geometry with rounded tips. The new three-way
command-icon setting applies only to BZF-owned commands; native folder fallbacks
are removed. Expanded colour diagnostics capture pre-panel, delayed and fresh
copy-time paint without changing acceptance or persistence. Cancel darkening is
**not claimed fixed**; the supplied trace proves unchanged sampled values only.

First combined integration: 694/699 passed, five failures from obsolete diagnostic
phase and boolean menu-contract expectations. Those were corrected without
weakening zero-colour-write or external-icon preservation checks. Independent
menu review additionally identified direct-slot `src` cleanup hiding an external
icon; the fix retains its native visibility class and adds regression coverage.
All adverse transcripts remain preserved.

Post-integration run: **701/701 JavaScript tests**, zero failures/skips/cancellations,
including every enabled isolated headless Chromium fixture. All four package
files were unchanged across the run:
`artifacts/round4-review/suite-02/identity.json` and `tests.tap`.
Python package checks: **13/13** (`package-integration-green.txt`); the earlier
selector failure remains in `package-integration-red.txt`. Runtime syntax and
`git diff --check` pass. These are package and isolated-fixture checks only.
Zen was not launched; everyday-profile behavior remains untested. Release/staging
outcome is recorded below after the guarded attempt.

Final diagnostic review found one further coverage gap: a gradient node could
be replaced at the same address without changing the URL token. An operation-local
WeakMap now exports an anonymous resolved-node token, tested with same-address
replacement and unchanged colour. Final source-stable gate is **702/702**, no
failures/skips/cancellations (`artifacts/round4-review/suite-03/identity.json`).
Python **13/13**, syntax and whitespace checks were repeated successfully;
`package-final-02.txt` records the package gate. The prior documentation check
matched the word “pass” near a negated acceptance sentence; clearer boundary
wording fixed that false positive without weakening the test (`package-final.txt`
retains the failing output).

Independent diagnostic re-review closed the same-address replacement finding on
the final runtime hash, with 65 focused tests passing. Menu re-review closed the
external `src` finding; triangle review found no blocking defect. Reports are
`artifacts/round4-review/independent-colour-diagnostic-review.md` and
`independent-menu-triangle-review.md`.

Guarded staging acquired the exclusive disposable-profile lock and installed
0.3.6 at **2026-09-21 15:24:54 UTC**. Receipt:
`artifacts/releases/20260921T152454Z-v0.3.6-round2-890c0fbf/receipt.json`.
Status: **installed-hash-verified**; activation: **not-launched**; rollback:
**not-required**. All four installed files match the final 702-test source and
frozen package. The previous 0.3.5 package and registry remain recoverable.
`artifacts/round4-review/staging-after.json` independently verifies unchanged
preference files, Sine engine metadata, eight Zen Icons core files, other mod
registrations, and BZF local enablement/update flags. No other mod files were
written. This check is not a full rehash of the companion's icon asset inventory.
No Zen window was launched, attached to, controlled or closed.

## 2026-09-21: 0.3.5 returned Round 3 repairs

The returned fillable worksheet records Pass for checks 1–7; check 8 contains
notes but no selected result. Seven additional videos and the named screenshots
report adverse observations during the same review. These are retained together,
not treated as blanket acceptance. Evidence hashes, decoded timelines, PDF field
readback and the per-report repair inventory are linked from
`docs/reports/2026-09-21-round3-return.md`.

Installed source was rechecked: Zen **1.22.2b**, build **20260915091052**, source
**e74571eead515d37edd0914739f744bcb5258c51**; disposable-profile Sine **2.3.4.1c**.
The current changes cover ordinary current-tab URL-bar routing for folder tabs,
interruptible measured Sticky motion, repeated toggles, inherited indentation,
triangle orientation/depth, separate Sticky Tabs/Folders settings, explicit
nested-folder end-drop destinations, fallback command-menu icons and outline-free
SVG centering. The Cancel-colour defect remains unresolved; its diagnostic now
has an explicit, redacted copy action after a custom-picker attempt.

The first post-author-handoff combined run passes **642/642 JavaScript tests**, zero
failures/skips, with every optional isolated Chromium check enabled. Output:
`artifacts/round3-review/combined-suite-02.tap`. Real native drag-method bodies are
replayed unchanged for all three destinations; UI/telemetry/pinning dependencies
are synthetic. Headless layout tests check unchanged existing row positions,
LTR/RTL hit areas and clipping. Generated marker, glyph-centering and footer
previews were visually inspected. Red logs from the independent motion review,
style/lifecycle checks and drag-boundary work remain alongside green logs.
Independent drag review subsequently found two missing lifecycle cases despite
that pass: capture-time footer removal could unpin a source, and hover expansion
could disable the footer for the rest of the drag. Both repairs now pass new
native-body regressions with the event path frozen before capture. Independent
re-review closed both findings on the final source/CSS hashes, without extending
that scoped verdict to live Zen acceptance. The report is
`artifacts/round3-review/independent-drag-review.json`.

The repaired combined gate is **652/652 JavaScript tests**, zero failures/skips
(`artifacts/round3-review/combined-suite-03.tap`). The four package files were
hashed before and after and were unchanged throughout that run; see the adjacent
`combined-suite-03-identity.json`. The stylesheet package check's old global margin
ban initially failed on the new footer. Its exception is now restricted to the
exact measured footer selector/value; folder/tab/guide offset guards remain.
The failing Python result is preserved and the updated package suite passes
**13/13** (`package-checks-03.txt`). Module syntax and `git diff --check` pass.

Guarded staging succeeded after acquiring the disposable profile's exclusive lock:
`artifacts/releases/20260921T130915Z-v0.3.5-round2-5258754b/receipt.json` reports
`installed-hash-verified` and `activation: not-launched`. All four installed files
match the source-stable test receipt and frozen package. The previous package and
registry have recoverable backups. Before/after custody checks preserve preference
files, Sine engine metadata, eight Zen Icons core files, other mod registrations,
and local BZF enablement/update flags; see `artifacts/round3-review/staging-after.json`.

This is not a live Zen acceptance claim. No user browser was launched, controlled
or closed; no everyday-profile state or global native preference was changed.
The Sports scrolling investigation remains separate, with no safeguard or
shared-scrolling feature introduced here.

## 2026-09-21: roomier checkbox worksheet (document-only revision)

At the user's request, `output/pdf/Better-Zen-Folders-Quick-Check-Roomy.pdf`
replaces the two-page version as the next worksheet. The same eight checks are
spread over four pages. Notes fields are 150 pt high instead of 32 pt and use
12 pt input text. Native square checkboxes replace radio groups: each can be
ticked and unticked independently, without JavaScript. The instruction asks
for one result per check.

QA reopened five document states (blank, all three choices and cleared), checking
32 canonical fields/widgets per copy. Twenty-four checkboxes retain matching
saved values and visible on/off appearances. Eight-line, multi-paragraph notes
fit fully in every field after save/reopen; cleared pages match blank pages
pixel-for-pixel. Main-agent visual review inspected all four blank pages, all
four filled Pass pages and representative Problem/Not Tried pages. No clipping
or layout defects were found. All 448 earlier artifacts remain unchanged.

PDF SHA-256: `8E3BF32B23CEB9D6E6187FCA749FCED8808DC79F80E8EDBF873E602A19CD2AB4`.
QA is in `tmp/pdfs/quick-check-roomy-qa/qa-report.json`. No mod code, installed
profile, settings or browser state was changed. This is form QA, not Zen testing.

## 2026-09-21: 0.3.4 control recovery and workspace Sticky

The user's latest run stopped during setup, **before completing any checklist
item**. It exposed integration defects missed by the 0.3.3 suite: an invalid
typed-preference subscription halted startup, and a generic ownership selector
mistook a Sticky control for an installed new-tab button. Previous passing local
tests remain historical evidence, not proof that those controls worked in Zen.

The repair record is `docs/reports/2026-09-21-control-recovery.md`. It maps every
latest report to the scoped change and records current Zen/Sine versions and
preserved profile preferences. The source candidate now includes root pinned-area
Sticky, Escape save/cancel, native preview-header positioning, checkbox-only
Sticky menu state and both folder New Tab entry points.

Final combined verification after the two review repairs: **522/522 JavaScript tests**, no failures/skips,
including whole-controller DOM startup and native-method replay; **13/13 Python
package checks**, module syntax and `git diff --check` pass. Full JavaScript
output is retained in `artifacts/verification-0.3.4/javascript-suite-03.tap`.
The two stale package expectations (old version and guide offset) were updated
to the intentionally changed contract, after recording their failures.

Independent review found two gaps in the earlier 508-test pass: a silently
dismissed native New Tab dialogue could capture a later ordinary tab, and the
first Space collapse could retain temporarily exposed ordinary children. Native
session tokens and a lifecycle-scoped observer repair the former; a Space-only
exposure reset repairs the latter. New native-session replay went from **6/9
failing to 9/9 passing**. The strengthened root suite went from **4/21 failing
to 21/21 passing**, retaining the separate ordinary-folder exposure rule.
Earlier successful tests and adverse evidence are preserved, not overwritten.

The new Quick Check has **two pages and eight checks**, with 16 canonical fields
and 32 widgets. It covers the reported problems before a broader compatibility
round. Earlier worksheets and returned evidence are unchanged. PDF QA validates
all radio choices, multiline wrapping, saved/reopened values and appearance
streams, plus a cleared copy matching the blank form pixel-for-pixel. This is
document QA, not a browser test result.

Both bounded independent-review findings are cleared. Follow-up exercised
real DOM focus, MutationObserver delivery and browser timers in 14 additional
handoff scenarios, with the previous 0.3.3 snapshot as a failing negative control.
The review attestation is `artifacts/verification-0.3.4/independent-review.json`.

Release `20260921T104653Z-v0.3.4-round2-0fddd8eb` is **installed-hash-verified**
in the closed `.test-profile-v2`. All four tested-source, frozen-package,
installed and receipt hashes agree; the 0.3.3 rollback and registry predecessor
were verified intact. The before/after check covered **49,306 other-mod files
including their existing backups**, other-mod registry data, profile preferences,
stylesheet imports, Sine engine metadata and BZF enablement/no-update settings:
all unchanged. The release directory contains `receipt.json` and
`preservation-check.json`. The historical `round2` release token does not denote
the manual worksheet round. Activation remains **not-launched**.

Final PDF SHA-256:
`54B74F863FAD2825B7980DCDA105236BAA4D6B1F1768ECCAA939E161B64183FC`.
The final instructions explicitly include entering an address and pressing
Enter after the folder New Tab dialogue opens. All earlier artifacts remain.

No Zen window has been launched, attached to or controlled. Native Windows
appearance, runtime activation and user acceptance are still required. The
custom-colour Cancel darkening diagnosis and the deferred external-mod Sports
issue are not resolved by this candidate's local tests.

## 2026-09-21: 0.3.3 Round 3 feedback corrections

The user stopped the second Round 3 attempt after the first check because its
wording was unclear. They reported false-positive Sticky ticks, undesired menu
placement, a folder-opening animation glitch and an undersized dog-ear. No
additional manual tests are claimed. Source and adverse-media evidence, native
animation replay, failed-before/passed-after regressions, and boundaries are in
`docs/reports/2026-09-21-round3-corrections.md`.

Off now removes `checked` instead of setting it to the truthy-by-presence string
`false`; placement follows appearance controls. Native/CMI rendering fixtures
cover the optional unchecked icon without duplicating or hiding the state tick.
Expansion capture updates visibility before Zen measures native animation frames,
and narrowly owns old spacer-offset cleanup. Cancellation, newer style writers,
rapid state changes and unload are covered. The marker is now a larger folded
triangle within the same left-of-guide gutter, with colour and RTL preserved.
Independent follow-up review found no actionable defect in the repaired scope.

Final fresh verification: **448/448 JavaScript tests**, no failures/skips;
**13/13 Python package tests**, runtime syntax, and `git diff --check` pass.
These include headless rendering/native-method replay and synthetic staging
fixtures, not native Zen UI automation or live acceptance.

The revised PDF has **15 pages, 42 checks and 84 fields**. It retains all 38
original test IDs, adds four feedback-specific checks, defines setup explicitly,
and separates DO/EXPECT. All fields passed fill/save/reopen and clear/save/reopen;
rendered appearances, bounds and page layout were inspected. Original PDF/builder
are unchanged. Final SHA-256:
`E22249E15B42581A8D5FFD39F4415DEDB26E780DB63720EF120FC832BD924CA1`.
Detailed QA is in `tmp/pdfs/round3-revised-qa/verification.json`.

Release `20260921T090744Z-v0.3.3-round2-936aba44` is
**installed-hash-verified** in `.test-profile-v2`. Independent comparison matches
all four source, installed, frozen-package and receipt hashes. The 0.3.2 package
and registry predecessor are retained. Before/after preservation checks match
all 3393 Zen Icons files, other-mod registry metadata, profile preferences,
stylesheet imports and BZF enablement. Release evidence includes `receipt.json`
and `preservation-check.json`; the historical `round2` release token is not the
manual checklist round. Activation is **not-launched**. No desktop/Computer Use,
Zen launch/attachment/control, everyday-profile write, commit or publication
occurred. Native/visual acceptance, custom-colour Cancel diagnosis and the
deferred Sports/external-mod work are not resolved by these local gates.

## 2026-09-21: approved 0.3.2 clickable gutter addendum

After approving the hover/click/keyboard design, the user confirmed the test
instance had been closed for a while. The combined source adds an interactive
dog-ear for folder tabs and nested folders without row reindentation or
background-tab selection. Four new interaction regressions failed before the
implementation and passed afterwards. A native-tab-clipping fixture separately
failed and then passed after limiting horizontal unclipping to owned-control
tab rows; vertical clipping and all folder/scrollbox overflow stay unchanged.

The pre-review suite passed 412/412, but review exposed two fixture gaps:
Gecko's second event group could activate a retained folder ARIA target, and
native `tab.splitview` could retain constituent gutter buttons. Strengthened
tests failed before their repairs. System-group capture now isolates the owned
button's activation keys without cancelling its default action; split refresh
removes constituent decorations while retaining split-managed accessibility.
The independent follow-up review found no remaining actionable defect.

Final verification: **413/413 JavaScript tests**, including **26/26 Sticky browser
tests**, no failures/skips; **13/13 Python package tests**, runtime syntax and
diff checks pass. Off/hover/on fixture images were inspected. These are isolated
fixture results, not native Zen acceptance.

Guarded release `20260921T082153Z-v0.3.2-round2-f9937be2` is
**installed-hash-verified** in `.test-profile-v2`. All four installed files match
source, frozen package and receipt. The 0.3.1 predecessor and registry backup
are retained. Before/after preservation checks match all 3393 Zen Icons files,
other-mod registry metadata, preferences, stylesheet imports and BZF enablement.
The release contains `receipt.json` and `preservation-check.json`.
Activation is **not-launched**; no browser has been launched or controlled.
Native menu/gutter acceptance awaits the user's next manual run.

## 2026-09-21: 0.3.2 source-only Sticky menu repair

The user opened the disposable instance and stopped Round 3 immediately: neither
Sticky Tab nor Sticky Folder was visible in the relevant context menu. This is
adverse live evidence against installed 0.3.1, not an incomplete user procedure.
The earlier isolated passing results do not establish native menu acceptance.

Installed Zen source proves that native tab context is initialised at the popup
target; BZF previously read it in window capture, before native initialisation.
A new dispatch-order regression reproduced a hidden first command and subsequent
wrong-tab targeting. A separate retargeted-folder-popup fixture reproduced the
missing trigger fallback. Both failed before the repair and pass afterwards.
The final complete JavaScript suite passes **406/406**, with zero failures/skips.
The 13 Python package tests, runtime syntax and `git diff --check` also pass
(Git reports existing LF-to-CRLF normalization warnings, not diff errors).
Independent bounded review found no blocking repair defect; two nonblocking
coverage observations were addressed with native-context-only keyboard popup
and later folder-target fallback tests.

The new code attaches to the native popups after their existing handlers and
resolves actual trigger elements before falling back to event/native context.
No profile files have been changed and no Zen window has been controlled.
**Source-only / not staged / native retest pending.** The exact folder-menu
failure in the user's running window has not been observed or proven; the
targeting gap is reproduced in an isolated fixture. Full investigation and
remaining boundaries: `docs/reports/2026-09-21-sticky-menu-repair.md`.

## 2026-09-21: 0.3.1 — remove the Sports scrolling workaround

At the user's agreement, removed only the overflow shared-scroll rule from
production CSS. No safeguard toggle or general shared-scrolling feature was
added. The runtime and preferences are byte-identical to 0.3.0, preserving the
Sticky/dog-ear/chevron/drag candidate for manual Round 3. Sports repair is deferred
to a separate task about the implicated external mods after finalisation.

The new native/external scroll-ownership regression failed with the old rule:
ordinary section height changed from 0 to 1636 px in the SuperPins fixture.
It passed after removal across 24 mode/size/load-order combinations and collapse.
The old remedy now exists only as an explicitly historical test fixture; its
reachability/tradeoff evidence and the original report/artifacts remain retained.
Current production does **not** claim to fix the Sports incident.

Fresh verification: **402/402 JavaScript tests, no failures or skips**, **13/13
Python package tests**, runtime syntax, and `git diff --check` passed. These
include isolated headless Chromium and synthetic installer checks, not native
Zen control or live acceptance.

Guarded staging release `20260921T052352Z-v0.3.1-round2-c58526e4` completed with
status **installed-hash-verified** in `.test-profile-v2`. All four files were
independently compared with source, frozen package and receipt. The previous
0.3.0 package and registry are backed up. Pre/post comparison covered all 3393
Zen Icons files, its full registry entry, profile `prefs.js` / `user.js`, Sine
stylesheet imports and existing BZF enablement; all were unchanged.
Evidence is retained in the release directory's `receipt.json` and
`preservation-check.json`. The installer retains its historical `round2` release
name token; this does not label or replace the user's Round 3 acceptance checklist.

Activation remains **not-launched**. No everyday-profile writes, Zen launch or
control, commit or publication occurred. Native Round 3 and later real-profile
acceptance remain pending; custom-colour Cancel darkening remains unresolved.

## 2026-09-20: 0.3.0 Sticky and overflow candidate

Current installed source inspected read-only: **Zen 1.22.2b / Gecko 156.0**,
build `20260915091052`, stamp `e74571eead515d37edd0914739f744bcb5258c51`.
Disposable profile Sine `engine.json`: **2.3.4.1c**. Zen was not launched,
controlled or closed; the everyday profile was read-only.

New source implementation includes Sticky Tabs/Folders, ordered nested visibility,
three ordinary-subfolder policies, branch-exposure intent, ID-bound SessionStore
persistence and folder recreation, a dog-ear outside the hierarchy line, optional
trailing state chevrons, and owned drag-open/re-collapse lifecycle. Existing close,
restore, New Tab, subfolder, colour and numeric-settings features remain in the
full regression suite. See `docs/reports/2026-09-20-candidate-coverage.md` for the
per-request implementation and live evidence boundary.

Fresh final source gates: **401/401 JavaScript tests, zero skips/failures**,
**13/13 Python package tests**, runtime syntax, and `git diff --check` passed.
The JavaScript run includes isolated headless Chromium layout/input fixtures and
synthetic Windows installer fixtures, not native Zen automation. Dog-ear geometry
was checked in light, dark and RTL fixtures; screenshots are retained under
`artifacts/sticky-visual/`. These are CSS fixtures, not Zen screenshots.

Independent review found and reproduced a native select-all-active expansion
interaction, split-wrapper departure cleanup, path-only drag exposure, and clipped
pinned-section focus-list eligibility. Each received a failing regression followed
by a repair and passing recheck. The final bounded review found no remaining P1/P2
within its inspected scope; it is not a live-browser acceptance claim. Controller
SHA-256 at final review/source gates:
`7CF7B529FBE63CBF042BD1F72D85CEE7C1BB0A73A42CBB6F13AED8A0BEED1958`.

Sports: a zero-height ordinary-tab section was reproduced with the installed
SuperPins and sticky New Tab layout mechanisms. The new scoped overflow fallback
passed 18 affected size/mode/load-order combinations. Its shared-outer-scroll
tradeoff is documented. This is a proven CSS mechanism and high-confidence
attribution, **not a live Gecko diagnosis or real-profile resolution**.

Custom-colour Cancel darkening remains **unresolved**. 36 focused colour tests
validate accepted/cancelled callback sequences and improved raw/outcome/paint
diagnostics. A user-observed failing Windows trace is still needed. No guessed
filter compensation or colour-store change was introduced.

Guarded disposable-profile staging completed with status **installed-hash-verified**,
release `20260920T174419Z-v0.3.0-round2-1fe26948`. All four installed files match
the frozen candidate and source. The previous 0.2.7 package and registry are
retained under the release's rollback directory. Post-install comparison confirms
the Zen Icons 0.2.3 files and complete registry metadata are unchanged, as are
`prefs.js`, `user.js`, and BZF's existing enabled state. The receipt is retained at
`artifacts/releases/20260920T174419Z-v0.3.0-round2-1fe26948/receipt.json`.

Activation is **not-launched**. Native drag timing, native restart/undo, private
windows, Essentials and the full real-profile/theme compatibility matrix remain
user-driven. Copy/adoption/cross-window drag completion currently receives
conservative cleanup rather than an unproved commit. No everyday-profile write,
Zen launch/control, commit, or publication was performed.

The local ADR history query found no upward workspace marker; no unrelated archive
was substituted or initialised for that read-only query. Accepted user requirements
remain captured in this task's scoped plan and coverage record.

---

This record separates static/package evidence, installed-source inspection,
and browser/profile acceptance. One layer does not prove another.

## Historical design baseline

The following baseline is historical design evidence, not the current installed
package: Zen 1.21.15b / Firefox 154.0 / build `20260818101929` / source stamp
`cee4147767801299dec330c81318c01e5a39e6ec`. It informed the original Task 5
design, but must never be represented as the current build or package contract.

## Earlier installed package inspection (2026-08-27, read-only)

On 2026-08-27, a read-only inspection without launching Zen observed the
then-installed package as Zen 1.21.16b / Firefox/Gecko 154.0.1 / build
`20260826035956` / source stamp `70ca9ad3bc34170c4525f08dabafca8c69ae6b39`.
`browser/omni.ja` had timestamp `2026-08-27 14:03:15`. The Sine `engine.json`
in the disposable profile remained version 2.3.3.0.

That archive inspection observed the following source contract:

| Source path | Observed behavior |
| --- | --- |
| `chrome/browser/content/browser/zen-components/ZenFolders.mjs` | `context_zenFolderDelete` resolves the selected folder and calls `folder.delete()`. |
| `chrome/browser/content/browser/zen-components/ZenFolders.mjs` | `context_zenFolderNewSubfolder` calls the selected folder's native `createSubfolder()` and is disabled only at Zen's configured maximum nesting depth. |
| `chrome/browser/content/browser/zen-components/ZenFolders.mjs` | `#initMoveTabToFolder()` creates native destination items, preserves each `group.iconURL` in `image`, and adds `context-zen-move-to-folder-item`, but does not add Firefox's `menuitem-iconic` rendering class. |
| `chrome/browser/content/browser/zen-components/ZenFolder.mjs` | `nsZenFolder.delete()` removes recursive `zen-empty-tab` placeholders, then awaits `gBrowser.removeTabGroup` for the real group. |
| `chrome/browser/content/browser/zen-components/ZenFolder.mjs` | `createSubfolder()` expands the parent chain and delegates creation to `gZenFolders.createFolder()` with `insertAfter` hardcoded to the final element in the parent container. |
| `chrome/browser/content/browser/zen-components/ZenFolder.mjs` | `connectedCallback()` normally clones `nsZenFolder.rawIcon` into `.tab-group-folder-icon`. |
| `chrome/browser/content/browser/zen-components/ZenFolders.mjs` | `updateFolderIcon()` returns immediately when a folder has no SVG, and `setFolderUserIcon()` returns immediately when the SVG's nested image is absent. |
| `chrome/browser/content/browser/tabbrowser/tabbrowser.js` | `removeTabGroup` runs before-unload, emits `TabGroupRemoveRequested` before child removal, and marks the child closes `skipSessionStore`. |
| `modules/sessionstore/SessionStore.sys.mjs` | SessionStore records the group in `closedGroups` and skips the child tab history when `skipSessionStore` is set. |

That source inspection also observed that `zen-folders.css` clips only
`zen-folder[collapsed] > .tab-group-container`; native drag-and-drop reads
`browser.tabs.dragDrop.expandGroup.delayMS` (default 350), expands a collapsed
group at that threshold, and can drop tabs into it. No native regular-folder
New Tab action was found in the inspected ZenFolder/ZenFolders sources, though
`nsZenFolder.addTabs` remains available.

Because the installed package already owns **New Subfolder…**, this mod does
not insert a second item or replace a Zen prototype. It intercepts only that
native menu item's command in capture phase, recreates Zen's ancestor-expansion
and folder-creation call, and supplies the configured first or last insertion
anchor. A separate integrity manager repairs only icon containers that lack an
SVG by cloning the folder class's own `rawIcon` template. The mod decorates the
native Move to Folder items only after Zen has populated them, and removes only
the class, fallback image, and colour presentation that it added. Its resolver
now prefers the direct folder SVG's image, then Zen Icons'
`data-zen-icons-icon-source`, then a safely owned native `folder.iconURL`, and finally Zen's
default folder asset; none of those sources becomes BZF-owned state.

This read-only inspection did not activate Sine or show that Zen loaded the
mod. It proves the installed-source contract was observed, not runtime
activation or compatibility.

## Sine preference evidence

The package declares Sine 2.3.3.0 dropdown and checkbox preferences in
`preferences.json`. The historical design observation was that Sine rebuilds
mods for dropdown changes but not checkbox changes; the controller observes the
preference branch so settings can update open windows. This is package/source
evidence, not a settings-panel activation check.

### Preference defaults

| Property | Default |
| --- | --- |
| `better-zen-folders.new-tab-button-visibility` | `hover` |
| `better-zen-folders.new-tab-position` | `bottom` |
| `better-zen-folders.drag-hover-delay-ms` | `500` |
| `better-zen-folders.subfolder-position` | `bottom` |
| `better-zen-folders.middle-click-delete` | `true` |
| `better-zen-folders.delete-empty-regular-folders` | `true` |
| `better-zen-folders.decorate-move-to-folder-menu` | `true` |
| `better-zen-folders.show-folder-colour-menu-icon` | `true` |
| `better-zen-folders.double-click-rename` | `true` |
| `better-zen-folders.show-hierarchy-guides` | `true` |
| `better-zen-folders.folder-name-size` | `slightly-larger` |

## Automated evidence

The predecessor candidate originally recorded 254/254 JavaScript tests and
10/10 Python package tests. The 0.2.0 successor reruns the complete JavaScript
and Python suites plus `git diff --check`; no predecessor result is reused as
proof for the new colour or context-action code.

```powershell
python -m unittest tests.test_package.PackageContractTests.test_documentation_matches_package_settings_and_evidence_boundaries -v
npm test
python -m unittest tests.test_package -v
git diff --check
```

Fresh verification at package commit `357c4e8` on 2026-08-27 produced 278/278
passing JavaScript tests, 12/12 passing Python package tests, and no
`git diff --check` errors. The branch was clean before file-only staging.

The 0.2.1 correction candidate adds tests for a flicker-free 300 ms rename
decision window, a persistent-folder colour-panel anchor, native SVG repair,
top/bottom subfolder placement, and Zen Icons' live menu-icon compatibility
source. Fresh verification at package commit `c3d0a37` produced 283/283 passing
JavaScript tests, 12/12 passing Python package tests, and no `git diff --check`
errors. The branch was clean before file-only staging.

The 0.2.2 successor adds a compact 4-by-2 colour picker, native XHTML action
buttons, a labelled custom-colour control, and a deliberate circular
default/custom swatch on the folder context-menu action. It retains the prior
rename, subfolder, icon-repair, colour, restore, and interaction corrections.
Fresh working-tree verification on 2026-09-03 produced 288/288 passing
JavaScript tests, 13/13 passing Python package tests, and no `git diff --check`
errors. This proves source and package contracts only; a separate staging
receipt is recorded after the disposable-profile transaction.

The 0.2.3 successor replaces that provisional picker with the user-approved
Chrome-style interaction: eight presets in one horizontal row, an explicit
selected checkmark and ring, immediate preset application, full-width native
custom-colour and reset commands, and no Apply/Cancel footer. Its folder menu
entry now uses Zen's recognizable artist-palette asset with a projected colour
well. The rename adapter also follows Zen's `explicitOriginalTarget`, ordinary
target, and composed event path, and reads the first non-empty XUL label value
before applying the painted-text boundary. Fresh working-tree verification on
2026-09-03 produced 290/290 passing JavaScript tests, 13/13 passing Python
package tests, a successful JavaScript syntax check, and no `git diff --check`
errors. No runtime result is inferred from these source checks.

The 0.2.4 successor responds to the user's 0.2.3 runtime evidence. The folder
icon integrity handler now defers its `TabGroupCreate` decision until Zen's
synchronous `connectedCallback()` has finished, preventing both writers from
inserting a native SVG while still repairing an icon that remains genuinely
absent. The Custom colour command now carries a full-size circular current-
colour preview instead of a palette glyph with a tiny dot. A new default-on
preference can hide only the **Folder colour…** context-menu icon while
retaining the command. The coordinated Zen Icons successor consumes BZF's
existing canonical colour and projects it onto all three native folder-shape
paint variables without adding another colour store. Fresh working-tree
verification on 2026-09-04 produced 294/294 passing JavaScript tests, 13/13
passing Python package tests, a successful JavaScript syntax check, and no
`git diff --check` errors. The coordinated Zen Icons source produced 76/76
passing icon tests and 54/54 passing Sine checks while building 1,684 icons;
its source and built folder-presentation modules matched SHA-256
`2BCDA2D054074873179B61745252F00BFF12EAE7C246C08279DAF31075E661F4`.
None of these source results is claimed as live until the user tests the
combined staged candidate.

## Current upstream comparison (read-only)

On 2026-09-03, the current public sources were rechecked without launching
Zen. [Zen Nebula's current folder module](https://github.com/JustAdumbPrsn/Zen-Nebula/blob/31ba4a3bde77391e173a6a3460d9fb0ab9bca8a0/nebula/modules/tab-folders.css)
remains a visual theme: its useful active-folder background and content-guide
concepts are already represented by BZF's independently implemented,
theme-token-based hierarchy guides. Its fixed offsets, fixed margins, literal
theme colours, and broad container styling were not copied.

[Advanced Tab Groups](https://github.com/Vertex-Mods/Advanced-Tab-Groups)
still targets Firefox `tab-group` nodes and explicitly skips Zen folders. Its
current implementation also replaces native menus and patches shared Zen
methods/prototypes. Those runtime techniques conflict with BZF's native-folder
scope and unload ownership, so they were not adopted. Its useful conceptual
signals—centred row controls, persisted presentation metadata, and a content
guide—are already covered more narrowly by BZF and the coordinated Zen Icons
contract.

Zen PR [#14213](https://github.com/zen-browser/desktop/pull/14213) is closed
without merge; PR [#13700](https://github.com/zen-browser/desktop/pull/13700)
remains open and unmerged. Neither implementation is present in the inspected
Zen 1.21.16b package. PR #14213's short-lived pending-folder handoff
corroborates BZF's existing New Tab transaction, but BZF additionally owns
cancellation, exact top/bottom placement, nested collapse restoration,
workspace checks, and teardown. No upstream patch was copied.

## Historical 0.2.0 disposable-profile file staging (no launch)

The disposable profile lock accepted an exclusive read immediately before the
transaction, indicating that the profile was idle. Release
`20260827T132718194Z-357c4e8` then copied only the four packaged mod files into
the Sine UUID directory. The predecessor `d7df441` candidate was moved intact
to a rollback directory outside `chrome/sine-mods`, so Sine cannot scan both
copies.

- Source commit: `357c4e8e81be124ab68080164b29c3bc9cde0cb1`
- Candidate target: `.test-profile-v2/chrome/sine-mods/5b0aa51f-cea7-4de5-8344-3e86e77fb88d`
- Preserved predecessor: `.test-profile-v2/.better-zen-folders-rollbacks/20260827T132718194Z-357c4e8-predecessor-d7df441`
- Earlier rollback retained: `.test-profile-v2/.better-zen-folders-rollbacks/20260827T121625944Z-d7df441-pre-d7df441`
- Closed inventory: `chrome.css`, `preferences.json`,
  `scripts/better-zen-folders.uc.mjs`, and `theme.json`

| File | Source and staged SHA-256 |
| --- | --- |
| `chrome.css` | `052C708CBA21F84E06A0128954BF78DEF6318F7C154C41A835DA1AF0500FE12B` |
| `preferences.json` | `B747E2A2FEB276849AA780CC844173B98F3A0E7AEB9241D8B6C7990D1013AA74` |
| `scripts/better-zen-folders.uc.mjs` | `C12799F4EE62A5CDD14C9D2721E4DAE912EF656498A9A32ABE4B45A258B30ABE` |
| `theme.json` | `E9902109218D878E9638A0FC0F70716DECD51659D72C151274AEE1D935B62B40` |

This transaction changed candidate files only. It did not launch Zen, activate
Sine, edit browser preferences, or exercise SessionStore. Therefore it proves
source-to-profile file identity and rollback availability, not runtime loading.

The transaction emitted a non-terminating shell syntax warning only after its
success object and matching hashes had been produced. It was not retried. A
read-only postcondition check then confirmed the final target, preserved
rollback, absent staging directory, and successful reacquisition and release of
the exclusive profile lock.

## 0.2.1 disposable-profile file staging (no launch)

Release `20260827T140714409Z-c3d0a37` was built first in a fresh directory
outside Sine's scan path. Its closed four-file inventory, SHA-256 values, and
manifest version were checked against clean source commit
`c3d0a3746a1d3184df1ee05ab831d989ee3e8c7d`. The disposable profile lock then
remained exclusively held while the complete 0.2.0 target moved to rollback
and the verified 0.2.1 directory moved into its place.

- Candidate target: `.test-profile-v2/chrome/sine-mods/5b0aa51f-cea7-4de5-8344-3e86e77fb88d`
- Preserved 0.2.0 predecessor: `.test-profile-v2/.better-zen-folders-rollbacks/20260827T140714409Z-c3d0a37-predecessor-357c4e8`
- Both earlier Better Zen Folders rollback generations remain present.
- Closed inventory: `chrome.css`, `preferences.json`,
  `scripts/better-zen-folders.uc.mjs`, and `theme.json`

| File | Source and staged SHA-256 |
| --- | --- |
| `chrome.css` | `052C708CBA21F84E06A0128954BF78DEF6318F7C154C41A835DA1AF0500FE12B` |
| `preferences.json` | `4EFD245BCC56554527FD5095E45AC2A52BCF3A67F4C81BFF766CC67B10E63E6E` |
| `scripts/better-zen-folders.uc.mjs` | `FE0D84C1D01B5C7E944D736AD828175CB176DDC3B3411E341DE4D274E7222733` |
| `theme.json` | `E5E8886A00DF4F94CC29E66B611D2C5B310EF85EA7A6C902E70AC87D7DE58AC6` |

Postconditions confirmed version `0.2.1`, matching target and predecessor
hashes, no remaining release staging directory, and successful exclusive-lock
reacquisition. A separate Zen Icons task staged its accepted compatibility
half in the same profile and preserved backup `20260827-170701-334`. This task
then observed `data-zen-icons-icon-source` in its installed folder writer and
`--better-zen-folders-custom-color` in its installed presentation module. That
is co-installation evidence only; neither mod has been launched or accepted.

## 0.2.2 disposable-profile file staging (no launch)

Release `20260903T111645297Z-v0.2.2-b9676b5` was built outside Sine's scan path
from the reviewed working tree based on commit `b9676b5`. Its closed inventory,
manifest version, and source-to-stage hashes were verified before mutation. The
disposable profile lock remained exclusively held while the installed 0.2.1
directory moved intact to rollback, the verified 0.2.2 directory moved into
its place, and the installed inventory and hashes were checked again.

- Candidate target: `.test-profile-v2/chrome/sine-mods/5b0aa51f-cea7-4de5-8344-3e86e77fb88d`
- Preserved 0.2.1 predecessor: `.test-profile-v2/.better-zen-folders-rollbacks/20260903T111645297Z-v0.2.2-b9676b5-predecessor-v0.2.1`
- Every earlier Better Zen Folders rollback generation remains present.
- Closed inventory: `chrome.css`, `preferences.json`,
  `scripts/better-zen-folders.uc.mjs`, and `theme.json`

| File | Source and installed SHA-256 |
| --- | --- |
| `chrome.css` | `A23EE77016AE0289DA85DFB420788F88968F8B3A702F267DA85137C3F451C166` |
| `preferences.json` | `4EFD245BCC56554527FD5095E45AC2A52BCF3A67F4C81BFF766CC67B10E63E6E` |
| `scripts/better-zen-folders.uc.mjs` | `B0EC6F33B36ACCABC769AF5CA43DC1E4EFED6BDECB389C34399BBB87E079E489` |
| `theme.json` | `8A21C69EF6F2C8B195B451F1EC2DE163247C5506F0AF3DA632465C05361F38F8` |

Postconditions confirmed installed version `0.2.2`, no remaining candidate
staging directory, and an intact rollback. The coordinated Zen Icons successor
remained byte-for-byte unchanged during this transaction: installed
`chrome.css` SHA-256
`DB072D61A1A8927EB3B4F75433C4F71C7C739254721AC771F892D84C6230ECC6`
and `folder-presentation.mjs` SHA-256
`4B3F10EE1F671DF5FEAD82F4942603A321665E6DD120F901A2ABDCA8E004A3FF`.
That Zen Icons transaction preserved backup `20260903-141151-110`. No browser
process was launched or controlled, so this is combined file-installation and
recovery evidence rather than runtime acceptance.

## 0.2.3 disposable-profile file staging (no launch)

Release `20260903T122431817Z-v0.2.3-b9676b5` was built outside Sine's scan path
from the reviewed working tree based on commit `b9676b5`. Its exact four-file
inventory, manifest version, and source-to-stage hashes were verified before
mutation. The disposable profile lock was acquired exclusively while the
installed 0.2.2 directory moved intact to rollback and the verified 0.2.3
directory moved into its place.

- Candidate target: `.test-profile-v2/chrome/sine-mods/5b0aa51f-cea7-4de5-8344-3e86e77fb88d`
- Preserved 0.2.2 predecessor: `.test-profile-v2/.better-zen-folders-rollbacks/20260903T122431817Z-v0.2.3-b9676b5-predecessor-v0.2.2`
- Every earlier Better Zen Folders rollback generation remains present.
- Closed inventory: `chrome.css`, `preferences.json`,
  `scripts/better-zen-folders.uc.mjs`, and `theme.json`

| File | Source and installed SHA-256 |
| --- | --- |
| `chrome.css` | `7B62DDE0E6CC868500B4B1E29EB23F8D3371739B8A4763B7E605414986FA363B` |
| `preferences.json` | `4EFD245BCC56554527FD5095E45AC2A52BCF3A67F4C81BFF766CC67B10E63E6E` |
| `scripts/better-zen-folders.uc.mjs` | `AFCBFC16CB955E8392C0F6CCEBB2560ECC6E6BDA363780F22D0C3B8EB4D13593` |
| `theme.json` | `F457A5214C31E8D46161861F2DAD12AFAD5C116599FC5593D4C2E6C0661F3848` |

After both directory moves reported success, PowerShell rejected the
`$lock?.Dispose()` cleanup shorthand and returned a nonzero status. The
transaction was not retried. A separate read-only postcondition check proved
installed version `0.2.3`, rollback version `0.2.2`, the exact four-file
inventory and hashes above, absence of the release staging directory, and
successful reacquisition and release of the profile lock. This establishes
that the error occurred after the completed swap and did not leave the profile
locked or the package transaction partial.

The coordinated Zen Icons package remained byte-for-byte unchanged:
`chrome.css` SHA-256
`DB072D61A1A8927EB3B4F75433C4F71C7C739254721AC771F892D84C6230ECC6`
and `modules/src/zen-icons-sine/folder-presentation.mjs` SHA-256
`4B3F10EE1F671DF5FEAD82F4942603A321665E6DD120F901A2ABDCA8E004A3FF`.
No browser process was launched or controlled, so this is file-installation
and recovery evidence rather than runtime acceptance.

## 0.2.4 disposable-profile file staging (no launch)

Release `20260904T052031926Z-v0.2.4-b9676b5` was built outside Sine's scan
path from the independently reviewed working tree based on commit `b9676b5`.
Its exact four-file inventory, manifest version, and source-to-stage hashes
were verified before mutation. The disposable profile lock remained
exclusively held while the installed 0.2.3 directory moved intact to rollback,
the verified 0.2.4 directory moved into its place, and all installed hashes
and versions were checked again.

- Candidate target: `.test-profile-v2/chrome/sine-mods/5b0aa51f-cea7-4de5-8344-3e86e77fb88d`
- Preserved 0.2.3 predecessor: `.test-profile-v2/.better-zen-folders-rollbacks/20260904T052031926Z-v0.2.4-b9676b5-predecessor-v0.2.3`
- Every earlier Better Zen Folders rollback generation remains present.
- Closed inventory: `chrome.css`, `preferences.json`,
  `scripts/better-zen-folders.uc.mjs`, and `theme.json`

| File | Source and installed SHA-256 |
| --- | --- |
| `chrome.css` | `D5A2854ED32204ED6FA21BF037D6C1A30A881D4B5222378DE49EC59BA2D598D4` |
| `preferences.json` | `A758605D822559DB6C0CF87E81AB9E37B0657A781DA6C6BDBD53854B8F2634ED` |
| `scripts/better-zen-folders.uc.mjs` | `E04CE77720AD8BE61C0D421C9F3838500D9273DADE601C95055D60CE01FEFD06` |
| `theme.json` | `10CF780B6371BF56F8F0C3002F1C4564FE0D3C3AEAFFDA531EE55CE8480594D3` |

Postconditions confirmed installed version `0.2.4`, rollback version `0.2.3`,
absence of the release staging directory, and successful exclusive-lock
reacquisition after the transaction.

The coordinated Zen Icons task then rebuilt and staged its accepted
folder-presentation successor under the same exclusive profile-lock boundary.
Its 1,704-file installed package matched the rebuilt package with no missing or
extra files; the full relative-path-plus-SHA-256 manifest digest is
`88F88415171D8DA14994B42233D9575D5A6A898B6F86EF626DB5F0E79B93CD7D`.
The installed `modules/src/zen-icons-sine/folder-presentation.mjs` hash is
`2BCDA2D054074873179B61745252F00BFF12EAE7C246C08279DAF31075E661F4`.
Its predecessor is preserved at
`.test-profile-v2/chrome/sine-mods/.zen-icons-backups/20260904-082332-131`
with manifest digest
`D383585D0B8DF5A15AA6BF588A6B35F39C972A715FCA387BF96B600B76429E18`
and prior folder-presentation hash
`4B3F10EE1F671DF5FEAD82F4942603A321665E6DD120F901A2ABDCA8E004A3FF`.
The rebuild passed 54/54 Sine checks and 76/76 icon tests. Zen Icons' source
repository could not supply a trustworthy commit identity because a Git
object was missing, so this record deliberately relies on rebuilt package and
content-hash identity instead.

No browser process was launched or controlled during either transaction, so
this proves combined file installation and recovery rather than live
behavior.

## User-observed 0.2.0 candidate results

The user manually reported that the earlier core checks and corrected
whole-folder restore path continued to work. In the 0.2.0 candidate, the user
also supplied two videos showing three residual failures: the double-click
rename gesture visibly toggled the folder before restoring it; **Folder
colour…** closed the menu without opening a picker; and native subfolders kept
icon spacing but displayed no outline or selected icon. The user observed that
the native subfolder command itself created nested folders successfully and
deferred settings-panel, Essentials, and broader compatibility checks. These
are runtime failure observations for 0.2.0, not acceptance evidence for a
successor.

The user later supplied a screenshot showing a direct subfolder icon sitting
slightly above its text and a video showing an outlined folder icon sometimes
losing its selected inner icon. The coordinated Zen Icons successor addresses
those presentation paths and is installed beside BZF 0.2.2, but those fixes
remain pending the user's live disposable-profile confirmation.

The user then tested the staged 0.2.3 pair and supplied a 21.7-second video plus
screenshots. The evidence shows hierarchy guides changing from green to pink
and yellow while the dominant native folder shape remains cyan. It also shows
multiple folder SVGs stacking and overflowing from nested rows from startup.
The user accepted the one-row colour picker and its folder-menu palette icon,
but rejected the tiny custom-colour indicator and requested a setting to hide
the context-menu icon. These are runtime failure and design-correction records
for 0.2.3, not acceptance evidence for 0.2.4.

## Earlier candidate evidence and release boundary

| Layer | Status | Required evidence |
| --- | --- | --- |
| Package/static verification | PASS | Automated tests validate the checked-in package contract only. |
| Current installed-source contract inspection | PASS / observed | The current `omni.ja` archive and Sine `engine.json` were inspected read-only without starting Zen. |
| Disposable-profile candidate files | 0.2.4 + coordinated Zen Icons STAGED / hashes matched | The exact reviewed BZF four-file successor and rebuilt Zen Icons package are installed; each predecessor is preserved outside Sine's active scan path. |
| Runtime activation and current-build compatibility | PENDING | Load the candidate in a disposable profile and observe Sine activation and behavior on this current build. |
| Disposable-profile Sine activation and settings UI | PENDING | Activate the 0.2.4 candidate after staging, edit all eleven Sine settings (three additional rows are section headings), exercise immediate presets, Custom colour…, and Reset to default, check every open window, restart, and confirm persistence. |
| Disposable-profile SessionStore deletion and undo | PENDING | For middle-click and context-menu deletion, inspect one four-real-tab `closedGroups` record with no matching four-tab `_closedTabs` record, then undo once and verify one functional folder in order. |
| Disposable compatibility matrix | PENDING | Check nested and live deletion boundaries, cancellation, sidebar states, themes, private windows, SuperPins, and Advanced Tab Groups. |
| Real-profile acceptance | PENDING | A user must test the candidate in the real profile after the disposable evidence is satisfactory. |

No GUI or live matrix was run by Codex for this successor because the user
explicitly forbade computer-control and application launches. This task changed
only Better Zen Folders' four packaged files in `.test-profile-v2`; the
coordinated Zen Icons task changed only its own package. Zen and the profile's
runtime state were not opened or operated by Codex.

## 2026-09-06 audit remediation (reviewed candidate staged)

### Current installed package inspection (read-only)

The installed browser has updated to **Zen 1.22b / Gecko 155.0.1**, build
`20260904060728`, source stamp `c2a638b7f735c7e7d4ee22e0182c8f6a16da93e5`.
These values and the following native contracts were read from the installed
application INI files and `omni.ja` archives without starting Zen. The disposable
profile's `chrome/JS/engine.json` now reports Sine **2.3.4.1c**; that file value
does not prove runtime activation.

- Toolkit `elements/menu.js` now creates a direct HTML `img.menu-icon` with
  `srcset=image`. The old `.menu-iconic-left` wrapper does not exist there.
- `ZenUIManager.mjs` dispatches `ZenURLBarClosed` after the chosen tab's
  selection/navigation. `onElementPicked` identifies confirmation, not the
  first `TabOpen` emitted while the dialogue was open.
- `ZenPinnedTabManager.mjs` registers a target-phase `cmd_close` listener;
  installed defaults set the pinned close policy to `reset-unload-switch`.
  BZF now intercepts the native command at window capture only for selections
  consisting entirely of eligible folder tabs. Native `gBrowser.removeTabs`
  retains before-unload and group-history handling. Mixed selections, ordinary
  pins, Essentials and placeholders remain native; no global preference changes.

### Changes and regression evidence

| Audited defect | Correction | Evidence |
| --- | --- | --- |
| Sibling restore paths created duplicate ancestors after an ID collision | Share one original-ID-to-folder map within the native-group transaction, publish successful paths, and roll back only owned creations | Red: two parents and four rollback targets. Green: one shared parent, two ordered leaves, consistent rewritten records and three unique rollback targets. |
| Menu clones could not use current markup or cold-restored icons | Insert a snapshot before the direct native image, retaining legacy-wrapper support; inspect the direct folder SVG rather than requiring a transient selection marker | Red: zero clones on current markup. Green: default and cold-restored custom SVGs; current image hidden; repeated decoration and external-image-preserving cleanup. |
| Background opens were mistaken for the dialogue's choice | Collect eligible opens and require the selected tab at confirmation, retaining initial-empty-tab reuse | Red: three scenarios stole background tabs. Green: chosen new tab, existing-tab switch exclusion and empty-tab reuse; cancellation tests retained. |
| Default/reset nested guides inherited parent custom colours | Reset the canonical custom property at every folder boundary; own inline colour still overrides | Headless CSS red: child and grandchild inherited red. Green: each default stays native; independent child colour and Reset verified. |
| Ctrl+W reset/unloaded folder tabs | Folder-scoped capture handler using native bulk removal | Window-capture ordering, real command identity, eligible selection, error containment, teardown and protected/mixed-selection boundaries tested. |

One low-risk optimization shares folder metadata snapshots only within a single
synchronous metadata pass. A 41-tab fixture reduced folder-data reads from 123
to **3** while writing all 41 distinct placement records; a subsequent pass
observes renamed folders. No cross-event cache or second persistence store was
introduced. Broader event filtering and direct-item indexing remain deferred
until profiling justifies the extra invalidation logic.

Three opt-in tests use a fresh **headless Chromium** DOM/CSS fixture with network
requests blocked. They exercise the actual BZF stylesheet and menu adapter,
including SVG fill/transform, decorative ARIA state, 16px fixture geometry,
native-image hiding, and cleanup. They never launch/connect to Zen or use the
user's profile. They are not proof of Gecko XUL layout, native menu activation,
screen-reader operation, or theme/private-window compatibility.

The Zen Icons task's read-only cross-review found no blocker in the principal
menu snapshot/colour contract. It identified an additional fallback-ownership
edge: Zen's `icon` and `iconURL` getters can select a nested child's image when
the parent's icon is missing. Three added red-to-green tests cover both unsafe
getters and direct-source precedence over stale compatibility metadata. The
resolver now uses the direct SVG first and will not invoke an unscoped getter
when the parent SVG is absent.

Fresh full suite: **313 JavaScript tests passed, zero skipped** with
`BZF_PLAYWRIGHT_MODULE` supplied; **13/13 Python package checks passed**;
`git diff --check` passed (existing LF/CRLF notices only). Each audited regression
was observed failing before its implementation; previous tests were retained
and their obsolete DOM/listener assumptions corrected.

### Staging and acceptance

**Staged at 2026-09-06T14:04:40Z** after the Zen Icons task authorized the
coordinated profile slot. Release `20260906T140326Z-v0.2.4-audit-fixes` copied
only the four reviewed package files. An exclusive `parent.lock` handle was
held through the directory swap and complete successor/predecessor hash checks.
The installed script SHA-256 matches the corrected worktree:
`B946F703008217CB6E2314E1712529B17A47F29A183A0483CA66D852BBDE1D15`;
its `chrome.css` is
`DF4DF1543FCE33CE7BA82F2F892E1B26A81B3D2E44172493B7793B3AD109EC70`.
The complete predecessor is preserved outside Sine's active scan path at
`.test-profile-v2/.better-zen-folders-rollbacks/20260906T140326Z-v0.2.4-audit-fixes-predecessor`;
its script SHA-256 remains
`1290D832A42B5F458537C913B0EE221A92A658F85CC4F811C348A8C12807B331`.
The frozen successor and machine-readable receipt are in
`artifacts/releases/20260906T140326Z-v0.2.4-audit-fixes/`.
Shared Sine `mods.json`, `chrome.css`, `content.css`, Sine `engine.json`,
`prefs.js` and `user.js` hashes were unchanged during the BZF transaction.
The profile lock was released and the Zen Icons task notified that it could
deploy its matching package; that subsequent deployment is a separate receipt.
No real-profile modification, Zen launch, desktop
control, commit or publication was performed. Combined disposable runtime,
Essentials, compatibility and real-profile acceptance remain pending.
# Round 1 repair candidate 0.2.5 — 2026-09-14

Scope: BZF only. No launch/control of Zen or the desktop, no real-profile edits,
no history rewriting, no publishing. Existing dirty implementation preserved.
Companion Zen Icons changes remain owned and deployed by its separate task.

Installed source rechecked: Zen 1.22.1b, Gecko 155.0.1,
build 20260911034930, source d7441097171a1a9d47ee40a3e6fcd71bd01784a4;
Sine engine 2.3.4.1c. Read the annotated seven-page Round 1 PDF, settings/menu
screenshots and sampled the custom-colour-cancellation recording directly in
an isolated, network-blocked headless media decoder. No desktop capture/control.

Repairs and proof boundaries:

- Sine settings registration: installed BZF metadata was 0.1.0 with no
  `preferences`, while installed theme.json was 0.2.4. The new guarded staging
  script merges current theme metadata into BZF's existing registry entry only,
  preserving enablement/unknown local fields, other entries and imports.
- Default child colour: the old rendering fixture incorrectly declared a
  separate native default stroke on each folder. Native Zen defines its three
  default paints on :root. A corrected test failed with inherited red on both
  child/grandchild; root-resolved theme aliases and per-folder default paints
  fix inheritance without overriding Zen Icons' inline custom paints.
- Menu glyphs: snapshot known local native/Lucide SVG sources with explicit
  computed context paints into inert image data URIs. Canonical sidebar sources
  remain unchanged. Both chrome and local file pack routes are covered; full
  colour/emoji data URIs are preserved, never fetched/recoloured. Actual Gecko
  native-menu painting remains a manual acceptance gate.
- Custom colour: use nsIColorPicker when available, ignore sampled preview
  updates, commit only a changed nonempty completion. Cancel/unchanged values
  and callbacks after unload cannot write colour. Keep the existing input
  fallback for runtimes without the native component. API source checked in
  Mozilla's nsIColorPicker.idl and widget/windows/nsColorPicker.cpp; Windows
  returns initial colour on Cancel. This is current upstream corroboration,
  not a new live native-dialog execution.
- Rename delay remains 300 ms and is confined to measured title text, not
  icon padding, trailing blank label space or the vertical blank parts of the
  full-height native XUL label. Computed font components replace the inaccurate
  fixed-font fallback.
- Empty cleanup no longer calls folder.delete(), which records another empty
  closed group with the same ID and can shadow the populated closed group.
  It rechecks real children, removes only placeholders and requests native
  removal with skipSessionStore. Explicit occupied-folder deletion is unchanged.
  Native closed history is left intact; no replay/deletion of existing entries.
  This addresses a demonstrated history-boundary defect, but does not prove
  all reported Ctrl+Shift+T failures share that cause. Last-child, nested and
  whole-folder restore acceptance remains pending the user's manual run.

Verification: red→green regressions for inheritance, menu paint (including file
pack route), native custom completion, text hitboxes, empty-group history and
registry metadata. Windows synthetic staging checks exercise successful install,
profile-lock refusal, and prior-package/registry rollback when registry replace
is blocked. Final pre-stage checks: **321/321 JavaScript tests** (no skips),
including four isolated headless rendering tests and three real Windows
synthetic staging checks; **13/13 Python package checks**; `git diff --check`
passed. The version assertion was updated for candidate 0.2.5 after its initial
expected mismatch with the predecessor's 0.2.4 assertion. Independent review and
actual installation are separate gates; the install receipt follows below.

Independent bounded review found no critical or important Round 1 defects and
approved disposable-profile staging only. Actual staging completed on
2026-09-14 at 17:14:32 UTC, release
`20260914T171432Z-v0.2.5-round1-b164877d`, with status
`installed-hash-verified` and activation `not-launched`.
Receipt: `artifacts/releases/20260914T171432Z-v0.2.5-round1-b164877d/receipt.json`.
The four installed files match the frozen candidate; the predecessor package
is retained under `.test-profile-v2/.better-zen-folders-rollbacks/` with the
same release ID, and the predecessor registry is retained beside the receipt.
BZF's registry now reports 0.2.5, preferences.json and enabled=true.
Post-install comparison confirms all non-BZF registry entries are unchanged.
Shared chrome.css/content.css imports, Zen Icons runtime, prefs.js and user.js
also retain their pre-install SHA-256 hashes. No Zen launch, desktop control,
real-profile changes, session-history edits, commit or publication occurred.
Native menu appearance, picker cancellation, title hitboxes and end-to-end
restoration remain manual acceptance gates, not inferred from installation.

## Round 2 repairs — 2026-09-20 — candidate 0.2.6

Evidence: returned `<LOCAL_HOME>/Downloads/Zen-Mods-Test-Checklist-Round-2.pdf`
(all three pages and canonical form values read; page 2 rendered and inspected),
plus all five PNGs in `<LOCAL_HOME>/Programming/Zen/Testing Screenshots/Round 2`.
User-accepted R04A/R04B/R04C/R04D restoration, S02/S03 empty-folder settings,
C09 child-colour isolation are preserved. R06 was marked untested in the PDF,
then explicitly passed in the coordinating task's later user clarification.
No restore ledger, grouping, empty-cleanup or colour-store code changes this round.

Installed source rechecked: Zen 1.22.2b, Gecko 156.0,
build 20260915091052, source stamp e74571eead515d37edd0914739f744bcb5258c51.
Read the packaged ZenFolder/ZenFolders/tabgroup/ZenUIManager and folder/menu CSS;
read installed Sine's checkbox, module-loader and observer paths without running
the browser or inspecting personal session/history content.

- C04: removed the unsafe HTML colour-input `change` commit fallback. Native
  picker callbacks still ignore preview updates and unchanged/empty completion;
  component aliases and docshell context now resolve too. When unavailable or
  initialization fails, a native explicit OK/Cancel hex prompt is used instead.
  Only accepted, valid six-digit values can save. Regression tests reproduce
  missing aliases and reject stale HTML change writes; native Cancel remains
  a live acceptance gate. This closes a demonstrated unsafe fallback, not proof
  that the user's previous run actually selected that route.
- M03: doubled menu SVG viewport from 1em to 2em, preserving canonical sidebar
  sources and matching outline/inner-image composition. Rendering check now
  observes 32px at 16px menu font. No pixel-sized sidebar/folder dimensions added.
- M06: native Zen adds [image] only to custom-icon destinations; restoring it
  reserves a blank slot. Disabled decoration now applies a scoped, owned
  text-only class; commands, order, folder references and image attributes stay
  intact. Red/green DOM test verifies equal 8px text offsets and native restoration
  on teardown (previous custom offset 32px).
- D01/D02: new title-only delay setting: Immediate/200/300/400/500ms, default300.
  Actual text Range rectangles take priority over estimated row-centre canvas
  bounds. Fake-clock tests cover immediate and500ms paths; real DOM event/geometry
  test proves title rename avoids a native intermediate toggle while blank row
  clicks stay immediate. Native XUL acceptance remains manual.
- M11: independent read-only investigation exercised actual Sine checkbox code
  against BZF bootstrap with notifying fixtures; stored preference and projected
  root attribute recover repeatedly. No observer fault was demonstrated. The
  CSS repair candidate retains eligible pseudo-element geometry and toggles only
  opacity via an inherited root variable, avoiding reconstruction behind complex
  :has selectors. Repeated on/off rendering and projection tests pass; the user's
  actual Gecko failure is NOT reproduced and the root cause remains unconfirmed.

Source references for native colour callback semantics (current upstream, not
an assertion that the exact installed compiled backend was executed):
[nsIColorPicker.idl](https://github.com/mozilla-firefox/firefox/blob/main/widget/nsIColorPicker.idl),
[Windows nsColorPicker.cpp](https://github.com/mozilla-firefox/firefox/blob/main/widget/windows/nsColorPicker.cpp).
Windows source returns initial colour on Cancel; HTML input change is not an
acceptance signal. No Zen/window/native picker was launched for this work.

Final source verification: **328/328 JavaScript tests, zero skips**, including
seven isolated headless DOM/CSS tests and three real Windows synthetic staging
tests; **13/13 package tests**; `git diff --check` passed. Independent read-only
review found no critical/important issues and additionally ran 318 non-browser,
non-staging JS tests,13 package tests and16 in-memory edge cases. No edits came
from the reviewer. Native runtime acceptance is not implied by these checks.

Staged under exclusive profile lock on 2026-09-20 at14:21:04UTC:
`20260920T142104Z-v0.2.6-round2-b2839629`, status `installed-hash-verified`,
activation `not-launched`, rollback `not-required`.
Receipt: `artifacts/releases/20260920T142104Z-v0.2.6-round2-b2839629/receipt.json`.
The four reviewed source hashes match installed and frozen package hashes;
the predecessor0.2.5 package is retained under the matching release ID in
`.test-profile-v2/.better-zen-folders-rollbacks/`, and the predecessor registry
is retained beside the receipt. BZF registry version is0.2.6 with preferences.json;
enablement preserved. All non-BZF registry entries compare unchanged, as do
shared CSS imports, Zen Icons runtime, prefs.js and user.js hashes. Shared
registry slot was released to the Zen Icons task after verification; this receipt
does not claim that task's subsequent installation or combined live acceptance.
No Zen launch/desktop control, real-profile/session-history changes, commits or
publication. Existing accepted worktree changes remain preserved.

## 2026-09-20 — Approved numeric settings and CMI integration (0.2.7)

Latest user evidence supersedes the earlier candidate's C04 expectations:
custom-colour Cancel still appears to darken the colour. Menu indentation and
title-delay behaviour are user-accepted; Move to Folder presentation is improved.
No new native colour-picker fix is claimed. A window-local, non-uploaded diagnostic
trace records initial/returned/stored/projected colours and computed paint/filter
values. It does not record folder identities/names, URLs or tab/session data. No
actual failing native callback trace has been collected yet.

Approved implementation:

- Replaced timing dropdowns with direct number inputs: title300ms, drag500ms,
  arbitrary integer values0..2147483647. Both the preference validator and the
  drag handler formerly enforced a preset whitelist; red/green tests caught both.
- Folder title size now14 CSS px, with decimal input. Legacy preset choices map
  to13/14/15/16px (replacement defaults, not exact theme-relative conversions).
- Outline-free Move to Folder glyph size defaults to120%;100% is the former size.
  Only copied glyphs flagged by Zen Icons' `zen-icons-enlarge-inner-icon` receive
  the additional scale. Sidebar/outlined glyphs and menu viewport sizes stay fixed.
- Sine-owned controls are enhanced only on about:preferences/settings, without
  patching Sine. Invalid changes are blocked before its save listener, with text
  errors and accessible associations; Enter commits and Escape discards an edit.
  Decimal sizes use string-backed prefs. Existing numeric values survive; invalid
  subsequent numeric edits preserve the last accepted value. Owned attributes,
  error elements, listeners and observers are removed on unload/rebuild.
- BZF command-icon checkbox replaces the palette-specific label but keeps its
  storage key to preserve existing off choices. It affects BZF-added commands
  (currently Folder Colour), not existing native commands handled by CMI. The
  common icon helper uses native iconic slots and resets inherited --menu-image
  only on BZF-owned commands; the palette consumes CMI's optional size token.
- Folder Colour command and picker heading now use title case. Destination-folder
  decoration remains independently controllable.

Source-inspected CMI references (both packs use background images for non-iconic
and sine-moved rows, while native iconic slots are excluded from the ordinary
background route):
[FluentUI](https://github.com/Starry-AXQG/Context-Menu-Icons/blob/main/CMI/FluentUI/Fluent-icons.css),
[ZenUI](https://github.com/Starry-AXQG/Context-Menu-Icons/blob/main/CMI/ZenUI/Zen-icons.css),
[shared layout](https://github.com/Starry-AXQG/Context-Menu-Icons/blob/main/CMI/global.css).
An isolated DOM test exercises those extracted selector/variable mechanisms,
not the full installed CMI mod or native Gecko menus. Live integration is unproven.

Installed identity rechecked read-only: Zen1.22.2b / Gecko156.0,
Build20260915091052, source e74571eead515d37edd0914739f744bcb5258c51;
Sine engine2.3.4.1c. No Zen launch or desktop interaction.
Final source checks: **335/335 JS tests, zero skips**, including11 isolated
headless Chromium DOM/CSS tests and3 Windows synthetic staging tests;
**13/13 package checks** and `git diff --check` passed. Independent read-only
review against the frozen0.2.6 package found no actionable issues. It separately
ran111 targeted checks, then41 overlapping checks plus64 numeric-parser assertions
after the notation refinement; these are not additional full-suite totals.
Reviewed script SHA256: B4C6A5ABEF58DF6668C35035E6153B91EF94516B7AD5D4EDC28CF93A91E7B344.

**Staging attempt: blocked before preparation/writes.** The guarded installer
could not exclusively open `.test-profile-v2/parent.lock` because another process
held it. No release ID or installed receipt was created for this disposable-profile
attempt; no rollback was required. Do not confuse synthetic staging-test releases
under artifacts with installation into the actual disposable profile.

Read-only verification after refusal confirms installed BZF remains0.2.6, with
all4 files matching the frozen `20260920T142104Z-v0.2.6-round2-b2839629` package.
All non-BZF registry entries, Zen Icons core files, prefs.js and user.js are unchanged
from the immediate pre-attempt snapshot. Zen Icons0.2.2 runtimeSHA256 remains
192254440A3BEA8A721C92117674A4C10BACB72CF355DF9AFBD6E3D283325CCF.
The shared registry slot was released to the companion task. Next safe action:
user closes the disposable test window, then request the shared slot and run the
same guarded staging script once. Never close or control the user's browser.
No real-profile changes, browser launch, desktop control, commit or publication.

### Follow-up: user closed the test window; staging succeeded

The user confirmed closure. After receiving a fresh shared-registry slot from
the Zen Icons task, the same guarded script succeeded at15:21:28UTC:
`20260920T152128Z-v0.2.7-round2-56e208a8`, `installed-hash-verified`,
activation `not-launched`, rollback `not-required`. Receipt:
`artifacts/releases/20260920T152128Z-v0.2.7-round2-56e208a8/receipt.json`.
All4 installed files independently match the source and frozen package; enabled
state preserved. The previous0.2.6 package and registry remain in the receipt's
backup paths. The blocked attempt above remains historical evidence, not current
installation status. Non-BZF registry entries, Zen Icons0.2.2 core files,
prefs.js and user.js match the fresh pre-retry snapshot.

The forwarded user request for title-case consistency was also applied before
staging: built-in setting labels/options, section headings, New Tab in Folder,
Folder Colour, Custom Colour, Reset to Default, and the prompt/panel captions.
Explanatory sentences, preference keys and user-provided folder/tab names are
unchanged. This cosmetic follow-up came after the independent functional review;
the full335JS/13package suite and diff check were rerun successfully afterward.
Final script SHA256: BCC7B82826B7CF9A652C08D43BE08C0F4449271EB9BA0A9C30DD0232ADF6C8C3.
The shared slot was released for Zen Icons0.2.3. This BZF receipt does not itself
establish that subsequent companion installation or any combined live acceptance.

The Zen Icons task subsequently reported successful 0.2.3 staging, with all
3392 payload files checked and BZF's registration and files preserved. This
task independently rechecked all four installed BZF files after that report:
each still matches the tested 0.2.7 source hashes above. The combined candidate
is available for manual testing; neither task launched Zen. Companion staging
and BZF hash verification are not combined live acceptance.
