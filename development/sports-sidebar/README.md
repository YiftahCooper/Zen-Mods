# Sports sidebar investigation: recovery summary

This is a technical summary of a separate sidebar-scrolling investigation, not a
Better Zen Folders feature or a saved user profile. No personal recordings, tab
lists, screenshots of the everyday browser, cookies, preferences or raw captures
are distributed here. Local original records may remain for private diagnostic
custody; disposable browsers and tool caches are not required to retain the result.

## Symptom and established cause

Expanding a tall native folder made ordinary tabs below the pinned area impossible
to reach. Collapsing it made them accessible again. The tabs were still present;
their viewport was being squeezed to **zero height**.

Initial source/Chromium investigations on 20/25 September 2026 implicated both
SuperPins 1.7.2's stay-at-top rule and Even Better New Tab Button 1.0.3's sticky
rule. At that stage everyday Gecko attribution was an inference. **Later evidence
superseded that ceiling:** the 27 September investigation reproduced the problem
in native Zen 1.22.3b / Gecko 156.0.1, demonstrated it separately with either mod,
and recorded a visibly accepted temporary everyday-window repair. It did not
establish permanent installation. Do not keep citing the early inference as the
latest known result, or treat a memory-only trial as an installed release.

The native matrix used synthetic blank tabs and native folders. With neither mod,
ordinary tabs remained reachable. Each mod independently caused the zero-height
ordinary section, so disabling only one while the other remains enabled can fail.

## Repair mechanism

- Allow the pinned section to shrink with `flex: 0 1 auto`, `min-height: 0` and
  its own overflow; short content keeps its natural height.
- Reserve two native row pitches for the ordinary section (80 px at the tested
  density), accounting for the New Tab row where it belongs to that section.
- Allow Gecko's shadow `items-wrapper` slot to shrink. In the tested build,
  Sine's USER_SHEET `::part(items-wrapper)` attempt was ineffective; an author-origin
  style supplied by a small Sine module applied the needed minimum.
- Preserve selected/focused-item reveal and edge scrolling during dragging. The
  native outer-scrollbox reveal path does not cover the new inner scrollers.
- Share reference-counted support when both mods are enabled; unload styles and
  listeners cleanly. Preserve existing scrollbar, layout, keyboard and button behavior.

CSS-only reductions failed geometry or input/reveal checks. The shipped candidate
does not add an arbitrary half-window pane split, rewrite native methods, move
tabs, change preferences or add an Essentials-size workaround.

## Retained public implementation

The SuperPins repair, source, generated module, tests and explanatory screenshots
are preserved in the public fork:

- [SuperPins package](https://github.com/YiftahCooper/Zen-Themes/tree/main/SuperPins)
- [Scrolling verification](https://github.com/YiftahCooper/Zen-Themes/blob/5c4121f9f58552e3426bfe4da18ead3d061619e1/SuperPins/SCROLLING-VERIFICATION.md)
- Source repair commit: `03c0e001bec37684f0bbeacbe732a6bccdd315b0`.
- Documentation/synthetic screenshots commit: `5c4121f9f58552e3426bfe4da18ead3d061619e1`.
- Later fork-install metadata recorded commit: `0d11266ed96f17e30c8757efd7e92131c313c838`.

The corresponding Even Better New Tab Button correction was recorded as version
1.0.4, commit `77812a7f73394c94c23a60f6bd5437cb2519c2ca`. This summary does not
assert its current installation or current upstream acceptance. The archived
local candidate generators and source files are retained where their independent
recovery has not been verified. A public SuperPins fork is not evidence that its
upstream pull request was created: the recorded integration attempt was rejected.

## What was tested, and remaining limits

Native source-matrix checks covered each mod, both load orders, several window
heights, both sidebar states, positive ordinary viewports and reachable endpoints.
Further checks covered wheel scrolling, keyboard reveal, New Tab short/long press,
existing scrollbar settings, preference gating, workspace switching, Sine
disable/re-enable and cold start. Visible user gestures supplied native reordering
evidence after an automated pointer harness failed to deliver drops even in its
unmodified control. That automated failure was a harness limitation, not a pass.

The everyday temporary trial preserved the checked tab/folder identities and
preferences while changing the ordinary viewport from zero to positive height.
It was accepted for the original practical window-size scope. This is historical
evidence, not a statement about a currently running browser in October 2026.

An extremely cramped window with many Essentials can still exhaust the sidebar.
An Essentials-height experiment was rejected and removed from the repair. Another
reported title reset was reproduced without the repair: synthetic lazy blank-tab
labels had been assigned incompletely. Native rename state fixed that fixture;
no title-persistence workaround was added to the mods.

Future work should start from the current versions of the two implicated mods,
verify their active CSS and source identities, and reproduce with synthetic data
before proposing changes. Keep this separate from Better Zen Folders; it deliberately
does not contain a shared-scrolling workaround for this external-mod issue.
