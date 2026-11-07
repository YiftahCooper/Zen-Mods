# Current status and remaining investigation

Baseline: **0.3.26**, runtime commit
`56789780f376021d276634967961252954f5eee6`. Status is alpha, with limited user
testing. Publication, source checks, native checks and user acceptance are distinct.

## Unpublished candidate 0.3.27 (runtime performance)

Not published, not installed in an everyday profile, not user-accepted. It targets
lag with several hundred tabs without changing any behaviour contract. Tab-strip
observers ignore title-text and own-decoration records, restore metadata
re-serialises only retitled tabs, Sticky no longer re-projects on every keystroke
and reads layout once per pass, and unchanged colour/label values are not
rewritten. Inventory, costs and what remains: [PERFORMANCE.md](PERFORMANCE.md).

### Native verification (disposable profiles, 2026-11-07)

Synthetic headless runs of fresh disposable profiles: Zen **1.24.1b**, Gecko
159.0.1, build 20261106124806, with the repository's frozen Sine loader. The same
harness and probes ran against main's 0.3.26 for comparison. Probes and how to run
them are described in TESTING.md (`perf-observers.js`, `checklist.js`, restart pair).

**Regression found and repaired.** Native comparison showed that a URL pin made
from the tab menu left the tab's restore record at `urlPin.explicit: false` (0.3.26
had it current within the same task). The menu command's full pass runs before the
asynchronous intent write, and the badge that used to trigger the next pass is an
owned decoration the 0.3.27 observers now ignore. The restore synchronizer now
re-serialises that tab on the intent store's `BetterZenFoldersUrlPinChanged`
notification (a tab-local pass, no full pass). A unit regression was added; it fails
on the unrepaired runtime. The pin itself survived a restart in both versions, so
the stale record was found as a metadata mismatch, not as a lost pin.

Results on the final candidate (all checks programmatic, not physical input):

| Checklist item | Result |
| --- | --- |
| 1. Title churn, ~300 tabs | Pass. 309 Gecko `_setTabLabel` retitles, 320 real page retitles and 8 reloads: zero Sticky, colour, icon, folder-button, unload, URL-pin and full restore passes (0.3.26: one of each per retitle, 309-320, except timer-coalesced Sticky at 7-155). Only per-tab restore passes run. BZF time about 50 ms per scenario versus about 2,100-2,500 ms for 0.3.26. A structural control still reached every reconciler. |
| 2. Typing in a page | Pass. 40 keys through `nsITextInputProcessor` reached the page and chrome saw 40 keypresses; zero Sticky passes (0.3.26: 40). |
| 3. Underline centring | Pass for default and custom-icon folders, LTR and RTL, after collapse/expand and selection changes (within 0.1 px). See the open item below for Zen Icons' folder-shape switch. |
| 4. Folder decorations | Pass for new, nested-moved, renamed and later-created folders and for folders restored after restart: `+`, unload hiding/showing, colour and native icon repair. |
| 5. Restore metadata | Pass. Folder renames reach records; Undo Close Tab keeps folder and neighbours for a regular tab and folder, slot and renamed label for a synthetic RSS live-folder tab; a tab moved between folders keeps placement and colour after restart. |
| 6. URL-pin and root badges | Pass for pin, unpin (API and real badge click), move, Undo Close Tab, root pin/unpin and move into a folder. A menu URL pin survives restart. |
| 7. Sine disable/re-enable | Pass. No leftover classes, attributes or custom properties; all nine observers disconnected; listener counts return to the same values across two cycles; decorations and colour return. |

The existing native folder-plus probes also pass on 1.24.1b: seven cases with URL
pins, without URL pins and with Zen Icons 0.3.0-rc.4, plus the simple baseline and
six Settings-homepage cases. No console error or warning came from the mod (capture
control confirmed). Final runtime: Node suite 1,373 pass, 0 fail, 3 expected skips
(historical screenshot and two opt-in installed-Zen checks); 16 Python checks pass.

Pre-existing, unchanged by 0.3.27 (identical in 0.3.26):

- With Zen Icons, hiding a custom-icon folder's shape (outline-free icon) leaves the
  underline about 7.6 px off-centre until the next Sticky pass (collapse/expand
  corrects it). It persisted at least 1.5 s.
- Any structural change still runs every reconciler once; native Zen also rewrote
  ~280 artificially retitled tab labels after a folder creation in this session.

Still manual-only or unproven:

- A Firefox Profiler trace of an everyday-sized session, and perceived smoothness.
- Drag chooser re-evaluation while scrolling during a native drag session.
- Physical mouse and keyboard input, the real tab-rename editor UI and the Sine
  Settings toggle UI (the probes call the same native and Sine functions directly).
- Everyday-profile acceptance, other sidebar mods, and live RSS/GitHub providers.

## Recent completed repairs

- 0.3.26: folder-plus creation starts in its target folder and applies Top/Bottom
  before the first rendered frame. Native confirmation, cancellation, request
  replacement, teardown and error handling remain separately tested.
- 0.3.25: Sine Settings mod-homepage `window.open` follows the Settings tab's
  immediate folder. Live provisional `skipLoad` opens are distinguished from restore.
- 0.3.24: external monochrome SVG controls receive local Gecko context paint on
  dark and light themes. This includes folder plus and relevant preview, move and
  drag images; multicolour artwork and explicit folder colours remain intact.
- 0.3.23: iconless-folder activity dots default off without overwriting saved choices.
- 0.3.22: stale activity dots clear and rows animate when selection leaves collapsed
  folders. Visible projected descendants drive the artwork, not stale native membership.
- Earlier fixes include related-link/Glance placement, unloaded-tab drag admission,
  ancestor drag destinations with optional colour coding, separate folder URL-pin
  intent, grouped previews, folder moves, settings organisation and palette editing.

## Recorded proof for 0.3.26

The original developer run passed **1,373 JavaScript checks**, zero failures and
one unavailable historical-screenshot skip, plus **16 Python package checks**.
Native boundary verification used fresh synthetic Zen **1.23.4b / Gecko 158.0.1**,
build **20261020090730**, source stamp
`541ee55196395ee8082862b83c84c90ab41d9f6d`.

The prior package exposes the new tab in the regular area at TabOpen and for two
sampled frames. The repaired package has folder membership at TabOpen and correct
order/collapse state in every sampled frame across seven creation cases. These
cover root/nested folders, Top/Bottom, collapsed state, both URL-pin defaults,
unrelated background opens and stock Sine reload. They passed with Folders alone,
with Zen Icons 0.3.0-rc.4, and with folder URL-pin separation disabled. The earlier
Settings-homepage regression also passed. Review found two lifecycle/error issues;
regressions were added and the reviewer confirmed their repair.

Those native commands were invoked programmatically, not by physical mouse input.
They do not establish everyday-profile acceptance, every possible creation route,
or compatibility with later Zen versions. Requalify the affected native source
when it changes; do not update identity hashes merely to silence a failing check.

## Still open or not exhaustively accepted

1. **Possible persistent custom-colour darkening / swatch mismatch.** Several
   revisions improved this and exercised gradient-ID isolation and paint. User
   reports were not conclusively closed across themes/configurations. The collective
   colour change caused by native window focus is intentionally excluded from the
   bug list; leave Zen's focus effect alone. Reproduce and compare matching rendered
   artwork before claiming any remaining colour discrepancy fixed.
2. **Intermittent startup/rename crash or loader attachment anomaly.** Previous
   synthetic rename comparisons did not reproduce the reported xul.dll crash.
   Negative reproduction is not a repair or attribution. Preserve Sine-only
   compatibility; isolate versions, startup order and synthetic inputs if revisiting.
3. **Perceived pinned/regular spacing.** Source/isolated measurements and artwork
   sizing informed prior fixes. The user still perceived a difference. Do not claim
   that source measurements settle the appearance in every live configuration.
4. **Drag chooser usability.** The user regarded an earlier iteration as roughly
   95% satisfactory; later fixes improved unloaded-tab initiation and intermediate
   ancestor choices. Final everyday-profile acceptance is limited. Distinguish
   native drag admission, source restoration, chooser eligibility and delay when
   diagnosing; multi-reason diagnostics are intentional.
5. **Broader persistence, recovery and compatibility acceptance.** Several concrete
   recovery defects were repaired and tested; an exhaustive final user checklist
   has not been returned. Do not mark the whole mod finalised. Compatibility with
   arbitrary sidebar mods remains unproven.

The folder preview's anchor beside the reported example was later accepted as
working. The default marker and reorganised settings were also liked; they are
not outstanding defects merely because older historical notes asked for checks.

## Separate projects and deferred scope

**Better Pins** owns the proposed independent URL pinning plus upper/lower tab-zone
redesign and folders in either zone. Its feasibility experiments are not shipped
folder-mod features. Keep folder-specific pin/navigation/close/recovery fixes here.
Do not delay the folder release for the larger redesign or silently introduce it.

**Sports sidebar scrolling** concerns external split-scrolling rules. Expanding a
tall folder made ordinary tabs inaccessible; collapse restored them. The supported
CSS mechanism can drive the regular-tab viewport to zero height while content
remains present. Early attribution was inferential; later separate native and
temporary everyday-window evidence superseded that limitation. See the
[Sports investigation recovery summary](../sports-sidebar/README.md) and its
public SuperPins repair links. This is not a fixed Better Zen Folders bug, and
shared scrolling must not be added here as its workaround.
