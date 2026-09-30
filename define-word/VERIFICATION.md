# Define Word 0.1.2 verification

## Collection migration in 0.1.2

The published 0.1.1 files were copied into `define-word/` after verifying every source blob hash. Runtime logic, mod ID, preference names, credential identifiers and chrome resource paths are unchanged. Version, update timestamp, source links and migration documentation are updated.

The installed Sine source recognizes a repository with multiple `theme.json` files as a collection and extracts the selected folder to the mod ID directory. Folder packaging and resource-resolution checks do not establish actual installation or native acceptance. The existing Glance mod and linked fork repositories are outside this migration's edit scope.

## Proven source/package behavior

- 47 automated tests pass, using Node's test runner and jsdom with Gecko service doubles.
- The generated entry matches the source build. Syntax checks pass for the generated entry, selection service and actor modules.
- An independent source review found three lifecycle defects: accepting results after navigation, restoring old focus on automatic dismissal, and credential-change cancellation limited to one window. Each received a failing regression before its fix; the complete suite then passed. The fixed code was checked by regressions, without a second independent review.
- A further regression verifies that a successful niqqud-free lookup preserves the originally selected Hebrew spelling.
- Package tests execute the generated entry to check reload/unload ownership. A two-window generated-entry test checks shared-key removal and ignores an old transport result after cancellation.

These tests do not establish real XUL geometry, actor loading, native focus behavior, installed-profile compatibility or human acceptance.

## 0.1.1 settings and appearance checks

- Independent review found no Critical or Important defect. A minor missing warning for inactive, conflicting shortcuts was reproduced and fixed with a regression.
- Tests cover Configure controls without a preceding lookup, masked credential actions, cleanup/remount, browser-window shortcut conflicts, menu-icon toggling and provider-specific Hebrew no-result text.
- A component preview was visually checked in simulated light and dark browser palettes. This does not prove actual Zen theme integration or native menu-icon rendering.
- Installed Sine source supports the selected Configure container and navigation route. Native preferences-page key saving and credential interoperability remain unverified.

## Provider evidence

On 2026-09-29, direct Wikimedia Action API responses for English `computer` and Hebrew `שלום` were parsed into five senses each in Node/jsdom. This establishes those examples, not general lexical coverage or native browser network behavior. The full development responses are not distributed in this repository; automated tests use bounded synthetic examples.

Sources: [English Wiktionary](https://en.wiktionary.org/wiki/computer), [ויקימילון](https://he.wiktionary.org/wiki/שלום), [MediaWiki parsing API](https://www.mediawiki.org/wiki/API:Parsing_wikitext). Wikimedia text is generally CC BY-SA 4.0, with third-party excerpts retaining their own attribution.

Free Dictionary API returned HTTP 522 during the development check. Its parser tests use synthetic responses matching its [documented format](https://dictionaryapi.dev/). No successful live Free Dictionary lookup is claimed.

Merriam-Webster tests use synthetic response structures and the documented branding asset. No authenticated request was made. See the [Collegiate API](https://dictionaryapi.com/products/api-collegiate-dictionary) and [Learner's API](https://dictionaryapi.com/products/api-learners-dictionary).

Additional direct Hebrew API checks on 2026-09-29 returned no page for `מדריך`, one parsed sense for `מחשב`, and five for `שלום`. This is a known coverage limitation; 0.1.1 improves the error wording without adding another Hebrew source.

## Native acceptance — unrun for 0.1.1

- [ ] Sine installs and activates the candidate, with exactly one Define menu item.
- [ ] The invoking selection is used in top-level pages and focused cross-origin frames.
- [ ] Empty/password selections are excluded.
- [ ] English and Hebrew cards fit the window with readable RTL layout and attribution.
- [ ] Sine Configure shows both masked key fields and the shortcut recorder without first using Define.
- [ ] Light/dark browser theme changes keep cards and controls readable.
- [ ] The context-menu icon appears and can be toggled off.
- [ ] The shortcut and recorder work with English/Hebrew keyboard layouts.
- [ ] Explicit Close/Escape restores appropriate focus; outside clicks and tab changes preserve the new focus.
- [ ] Same-tab/frame navigation and delayed requests do not display obsolete results.
- [ ] Sine disable/re-enable, reload and multiple windows leave no duplicated or orphaned controls.
- [ ] Real Firefox credential storage saves/removes optional keys and handles locked storage clearly.
- [ ] Changing a key in one window cancels affected work in other windows.
- [ ] Live authenticated Merriam-Webster results and examples work correctly.

Current experience limitation: every card uses the beside-content fallback position; selection-relative geometry remains unimplemented.
