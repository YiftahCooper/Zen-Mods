# Define Word

Look up selected English and Hebrew words in a compact popup. Select a word, right-click **Define**, or press **Ctrl+Alt+D**. Edit the search field and press Enter to look up another word; the language is detected automatically. Change dictionaries with the top-right selector. Hebrew definitions use right-to-left text.

## Install or update

With [Sine](https://github.com/CosmoCreeper/Sine) installed, paste this folder URL into its GitHub installation field:

```text
https://github.com/YiftahCooper/Zen-Mods/tree/main/define-word
```

Allow JavaScript mods in Sine. Update an existing installation with Sine's update check. For the old standalone repository, update or switch its source to this folder. **Saved settings and dictionary keys survive mod updates.** Keys are stored in Firefox's credential manager, outside the mod files. Saved keys remain visible as masked text. The inline eye button reveals or hides the value. Edits save when you leave the field; clearing it removes that key.

## Dictionaries

| Language | Dictionary | Setup |
| --- | --- | --- |
| English | Wiktionary (default) | No key |
| English | Free Dictionary API | No key |
| English | Merriam-Webster Collegiate | Personal API key |
| English | Merriam-Webster Learner's | Separate personal API key |
| Hebrew | האקדמיה ללשון העברית (default for new settings) | No key |
| Hebrew | מילוג | No key; public-page adapter |
| Hebrew | ויקימילון | No key |
| Hebrew | Lexicala Hebrew (test) | Approved API access and RapidAPI key |

Set defaults in **Sine → Define Word → Configure**. A failed lookup does not switch providers. Dictionary coverage varies, especially for Hebrew inflections. Wiktionary can retry without niqqud; English searches can retry lowercase. The popup labels a different dictionary headword. Requests time out after ten seconds and show an error instead of loading indefinitely.

**Merriam-Webster:** [register for API keys](https://dictionaryapi.com/register/index), request Collegiate Dictionary and Learner’s Dictionary, and complete the required verification. Paste each key into its matching masked field under **Configure → Dictionary API keys**. Then select that dictionary. The two products use separate keys.

**Lexicala test:** obtain access through [Lexicala on RapidAPI](https://rapidapi.com/kdictionaries/api/lexicala1); provider approval may be required. Save its **X-RapidAPI-Key** in the Lexicala field, then select **Lexicala Hebrew (test)**. Try familiar words such as `מדריך`, `הבית`, `מחשב` and `טלפון` and check the displayed headword and meaning. These examples are test inputs, not verified coverage claims.

Lexicala uses its Global Hebrew monolingual resource. Each explicit lookup makes one request; typing makes none. Matching words come from that response, and selecting one costs another request. The candidate examines the first ten returned entries and shows up to eight alternatives. Broad morphology/stem matching may return related words or phrases; the displayed headword identifies the result. Definitions are not cached. [The advertised free plan](https://api.lexicala.com/plans/) allows 200 requests/month; confirm current limits and terms before subscribing. Published terms require prior consent for dictionary-product use or entry display. A free subscription alone does not establish that permission.

The Academy adapter uses its public keyless dictionary interface, preserves vocalized headwords and explicit inflection mappings, and displays alternative entries. It does not silently treat a prefix suggestion as an exact definition. Academy content is based on Milon HaHoveh; its [terms](https://hebrew-academy.org.il/תנאי-שימוש/) permit study/research with attribution and restrict commercial use. The endpoint has no published third-party quota or stability guarantee.

Milog lookups read the requested public word page without executing site scripts. Definitions and examples remain separate; no remote autocomplete requests are made. This adapter depends on the site's HTML structure. Milog's [terms](https://milog.co.il/ראשי/a/תנאי_השימוש_של_מילוג) restrict copying and reorganization without written consent; inclusion of this local test adapter does not claim provider approval. Source attribution and entry links are preserved.

Existing valid default dictionary preferences are preserved on update. Select the Academy or Milog in Configure or in the popup to try them.

## Settings and popup

- **Search:** edit the prefilled word and press Enter or Search. Wiktionary and the Academy offer autocomplete; Merriam-Webster offers spelling suggestions. Milog, Free Dictionary API and this Lexicala test do not request suggestions while typing. Use arrow keys and Enter to select a match.
- **Text size:** choose 12–24 px in Configure. Headings, definitions and controls scale proportionally.
- **Resize:** drag any edge or corner. There is no triangle icon; the resize cursor appears on hover. Width and height are remembered across sessions. With the corner focused, arrow keys resize, Shift makes larger steps, and Home or double-click resets.
- **Position:** opens near the selected word, below or above it as space allows. Drag the header to move it, or focus the header and use arrow keys. Each new selection gets a fresh position. When selection geometry is unavailable for a context-menu lookup, its click location is used. Keyboard invocation without geometry falls back beside the content area.
- **Shortcut:** Record shortcut, press your combination, then Save shortcut. Disable shortcut followed by Save disables it. Some browser or OS shortcuts may conflict.
- **Menu icon:** toggle the outlined open-book icon in Configure.
- **Settings:** open **Sine → Define Word → Configure**. There is no settings link in the popup. Configure is capped at 800 CSS pixels and fits narrower windows.
- **Close:** Escape, Close, changing tabs or navigating cancels pending lookups. Colors follow the browser theme.

Version **0.3.0** has automated provider, credential and simulated UI tests. Native Zen behavior and authenticated dictionary responses still need testing; Lexicala uses documentation-based synthetic response fixtures.

## Privacy

Define and explicit searches send the word to the selected dictionary. Providers with autocomplete also receive edited queries after a short pause. Requests omit cookies and page URL/context, reject redirects, and time out. Password selections are excluded. No persistent lookup history or telemetry is added.

Keys remain in Firefox credential storage. Merriam-Webster keys go only to its API; the Lexicala key goes in a header only to its RapidAPI search endpoint. Clearing a key field in Configure deletes that dictionary's saved credential. Uninstalling the mod does not automatically erase keys.

Definitions render as text. **View dictionary entry** opens the original page when a safe entry URL is available; Lexicala currently provides an attribution link only. Dictionary content and trademarks retain their owners' rights. [Merriam-Webster attribution](assets/README.md). [All mods](../README.md).
