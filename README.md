# Zen Mods

A collection of mods for [Zen Browser](https://zen-browser.app/), installed through [Sine](https://github.com/CosmoCreeper/Sine).

Each mod has its own settings, version, README, and license. Install only the mods you want, using the individual links below.

## Mods in this repository

| Mod | What it does | Install source |
| --- | --- | --- |
| [Glance Controls](glance-button-position/) | Choose the side, vertical position, size, order, and visibility of Glance buttons, with a Copy URL button. | [Glance Controls folder](https://github.com/YiftahCooper/Zen-Mods/tree/main/glance-button-position) |

## Other mods

These currently live in separate repositories. Follow each repository's installation instructions.

| Mod | Repository |
| --- | --- |
| Define Word | [YiftahCooper/zen-Define-Word](https://github.com/YiftahCooper/zen-Define-Word) |

## Forks

These stay in their existing fork repositories so upstream history and contributions remain connected. They are linked here for discovery; installing a mod from this collection does not install them.

| Fork | Upstream project |
| --- | --- |
| [Search Engine Select](https://github.com/YiftahCooper/Search-Engine-Select) | [Vertex-Mods/Search-Engine-Select](https://github.com/Vertex-Mods/Search-Engine-Select) |
| [Even Better New Tab Button](https://github.com/YiftahCooper/zen-even-better-new-tab-button) | [themaster5209/zen-better-new-tab-button](https://github.com/themaster5209/zen-better-new-tab-button) |
| [Zen Themes](https://github.com/YiftahCooper/Zen-Themes), including [SuperPins](https://github.com/YiftahCooper/Zen-Themes/tree/main/SuperPins) | [CosmoCreeper/Zen-Themes](https://github.com/CosmoCreeper/Zen-Themes) |

## Installation

1. Install Sine, then open **Settings → Sine Mods** in Zen.
2. Open the mod's README and copy its **folder URL** into Sine's GitHub installation field. For example:

   ```text
   https://github.com/YiftahCooper/Zen-Mods/tree/main/glance-button-position
   ```

3. Follow that mod's instructions, including any JavaScript permission or restart requirement.

The repository root is a catalogue, not an install-all bundle. If you accidentally install **Zen Mods Catalogue**, remove that empty entry and install the individual mod instead.

## Repository layout

Each mod lives in an ordinary folder; there are no Git submodules. Its `theme.json` points to that folder's GitHub URL, and its files and license are self-contained. Updates are released independently through each mod's version and `updatedAt` fields. Keep existing mod IDs and preference names when moving a mod here so installed settings can be preserved.

The root `theme.json`, `catalogue.css`, and `catalogue-preferences.json` are intentionally inert compatibility files. Sine 2.3.4.1c identifies a collection by finding more than one theme manifest; these files let the first mod install with the same layout as later mods. They also prevent installing the root URL from accidentally selecting a child's stylesheet or settings. Do not add a `modules` list to the catalogue unless intentionally changing it into an install-all bundle.

## Licenses and credits

See each mod's README and license. Linked forks retain their own licenses and upstream attribution.
