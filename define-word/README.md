# Define Word

A Sine mod for Zen Browser that shows compact definitions for selected English and Hebrew words.

Select a word, right-click **Define**, or press **Ctrl+Alt+D**. The card includes definitions, examples when supplied, a dictionary selector and source attribution. Hebrew definitions use right-to-left layout. Configure the shortcut, optional API keys and menu icon in **Sine → Define Word → Configure**. The card's Settings button opens that same page.

**Version 0.1.2 moves the mod into the Zen Mods collection.** The settings and definition behavior are unchanged from 0.1.1. It passes 47 automated source/DOM/package tests, including migration and resource-path checks. Independent source review found no Critical or Important defect; its minor shortcut-status finding received a regression-tested fix. Native Zen/Sine behavior still needs user testing; publication is not a claim of native acceptance. See [verification](VERIFICATION.md).

## Install with Sine

In Sine's GitHub installation field, enter:

```text
https://github.com/YiftahCooper/Zen-Mods/tree/main/define-word
```

Install the mod and test it by selecting `computer` or `שלום` on a webpage. Sine has a live mod-loading path; this mod registers an unload handler so Sine can disable or reload it. A mandatory browser restart is not part of the installation instructions. If Define does not appear, report the Zen/Sine versions and the observed behavior rather than assuming installation succeeded.

This is a custom JavaScript mod. It uses Sine's existing permission for JavaScript from outside its marketplace. If your Sine configuration blocks such scripts, the UI must permit them before this mod can load.

To remove the mod, use Sine's normal disable/remove controls. Optional dictionary keys and mod preferences are not erased automatically.

## Moving from the standalone repository

Use the update check on your existing Define Word entry in Sine. The transition manifest changes the source to this folder while keeping the `define-word` mod ID, `extension.define-word.*` preferences and existing credential-storage identifiers. Future updates are published here.

If the old source is unavailable, paste the folder URL above into Sine's GitHub installation field. Install this individual folder, not the Zen-Mods repository root. The migration does not require deleting your existing settings or dictionary keys. Actual installation and activation still need checking in Zen.

[Browse all mods and linked forks](../README.md).

## Dictionaries

| Language | Dictionary | Setup |
|---|---|---|
| English | Wiktionary (default) | No key |
| English | Free Dictionary API | No key |
| English | Merriam-Webster's Collegiate® Dictionary | Personal API key |
| English | Merriam-Webster's Learner's Dictionary | Separate personal API key |
| Hebrew | ויקימילון | No key |

Wiktionary's English and Hebrew endpoints returned usable responses during development. Free Dictionary API returned HTTP 522 during that check, so it remains selectable but is not the initial default. There is no automatic switch to a different dictionary when a lookup fails.

Obtain optional Merriam-Webster keys from [the official developer site](https://dictionaryapi.com/) and enter them in **Sine → Define Word → Configure → Dictionary API keys**. Each dictionary has a masked field and Save key / Remove key buttons. Its API terms and quotas apply. Authenticated Merriam-Webster requests have not yet been verified with a user key.

Hebrew coverage is currently limited to ויקימילון. Even common words and inflected forms may have no entry. On 2026-09-29, the provider returned no entry for `מדריך`, while `מחשב` and `שלום` returned definitions. The mod does not invent a definition or substitute a different word. A failed pointed-Hebrew lookup can retry once without niqqud; the card labels that result and keeps the originally selected spelling. Milog, Rav-Milim, Cambridge and Oxford are not listed as supported because a suitable compact-card integration has not been established.

## Settings and behavior

- Choose a preferred dictionary per language in Sine's mod settings or in the card.
- In **Sine → Define Word → Configure**, choose **Record shortcut**, press the desired key combination, then choose **Save shortcut**. To disable it, choose **Disable shortcut**, then **Save shortcut**.
- Optional API keys are entered in that same Configure dialog. Keys use Firefox's credential storage, not ordinary mod preferences.
- **Show a dictionary icon next to Define** toggles the right-click menu icon.
- The popup inherits browser popup colors and color scheme; Configure controls inherit the preferences-page theme.
- Shortcut matching uses the physical key so it can work across English/Hebrew layouts. Known native browser-key conflicts leave the shortcut inactive. OS shortcuts and dynamically registered extension shortcuts cannot all be detected.
- The card opens at a fixed inset beside the content area, approximately 440 CSS pixels wide. Positioning beside the selected word is not implemented yet.
- Closing the card, changing tabs, navigating, starting another lookup or unloading cancels outstanding work and rejects stale results. Changing a key in the mod's Settings also cancels that dictionary's work in other active windows.
- Translation and embedded dictionary websites are outside this mod's scope.

## Privacy

Only an explicit Define action sends the selected text to the chosen dictionary. Requests omit cookies and page URL/context, reject redirects and time out after ten seconds. No persistent lookup history, telemetry or background lookups are added. Password selections are excluded.

Definitions render as text. Wikimedia HTML is parsed separately and never inserted into browser chrome. **Open source** opens a normal HTTPS tab; that website then operates as an ordinary website. API keys, when needed, are sent to the relevant Merriam-Webster API.

## Development

```sh
npm ci --ignore-scripts
npm run build
npm test
npm run check
```

The window entry is bundled with esbuild. Edit `src/`, then regenerate `define-word.uc.js`. Selection-service and actor modules stay external because Firefox loads them as system modules. The mod registers only the generated window entry; tests and development files are not executable mod entries.

The Merriam-Webster logo is an unmodified official attribution asset; see [its provenance](assets/README.md). Dictionary content and trademarks retain their respective owners' rights.

## Initial native test

Use an ordinary webpage or [the included test page](tests/native/words.html). Check one menu entry, English and Hebrew results, the shortcut in both keyboard layouts, Close/Escape, and disabling/re-enabling through Sine. More detailed unchecked cases are in [VERIFICATION.md](VERIFICATION.md).
