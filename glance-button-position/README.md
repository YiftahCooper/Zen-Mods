# Glance Button Position

A [Sine](https://github.com/CosmoCreeper/Sine) mod for Zen Browser. Choose the side, vertical position, size, order, and visibility of Glance's buttons, with an added button to copy the Glance page's URL.

## Install

1. With Sine installed, open **Settings → Sine Mods** and find the option to install from a GitHub repository.
2. Paste this mod folder's URL and click **Install**:

   ```text
   https://github.com/YiftahCooper/Zen-Mods/tree/main/glance-button-position
   ```

3. Disable **Left Side Glance Buttons** or any other mod that moves these buttons, to avoid conflicting styles.
4. Restart Zen once after installation, then open this mod's configuration in Sine.

After initial activation, settings changes apply without restarting.

Enable Sine's option to allow JavaScript mods for the copy button, ordering controls, and precise centring of the visible stack.

**Updating an existing installation:** use the mod's update button in Sine. If the new controls do not appear, restart Zen once and reopen the mod's configuration. Existing side, height, size, and visibility settings are preserved.

## Moving from the standalone repository

Version 0.4.1 moves this mod into the Zen Mods collection. Use the update button on your existing Glance Button Position entry in Sine, then restart Zen once. The transition update changes the update source to the folder above while keeping the same mod ID and preference names. Your side, height, size, order, and visibility settings are preserved.

Future updates are published here. The old repository is retained only as a transition route. If it is unavailable, use the new folder URL when installing through Sine.

[Browse all mods and linked forks](../README.md).

## Settings

| Setting | Choices | Default |
| --- | --- | --- |
| Button Side | Left or Right, independently of Zen's sidebar position | Left |
| Vertical Position (%) | Any number from 0 to 100, including decimals | 0 |
| Button Size Multiplier | 0.25–3; scales buttons, icons, padding, and spacing together | 1.0 |
| Buttons (Top to Bottom) | Each row has a visibility checkbox and ↑ / ↓ buttons | Close, Expand, Split, Copy URL; all enabled |

### Button Order and Visibility

In **Buttons (Top to Bottom)**, click ↑ or ↓ to move that button one place. Tick or untick the checkbox in the same row to show or hide it. Changes apply immediately and are saved automatically. Hidden buttons remain in the list so you can arrange them before enabling them again. The first ↑ and last ↓ are disabled. The controls also work with keyboard focus and Enter or Space.

Hiding buttons removes their gaps, keeping the remaining buttons in a single centred vertical line. You can hide any combination, including all four; restore them from the mod's settings.

### Vertical Position

Enter a number **without the `%` sign**, such as `37.5`. Press **Tab** or click outside the field to apply it.

- `0` places the button group at the top.
- `50` centres the group vertically.
- `100` places the group at the bottom.

These are examples, not presets: `12`, `63.25`, and other values work too. The percentage places the **centre of the visible button stack** at that point along the **Glance panel's height**. For example, `33` centres the stack one-third of the way down. Near either edge, the stack moves inward to maintain a 15px margin.

Values outside 0–100 are clamped to the nearest endpoint. Empty or invalid text falls back to the top; the text field retains what was entered.

### Button Size

For size, `1.0` is normal, `0.7` makes buttons and icons 30% smaller, and `1.2` makes them 20% larger. The multiplier also scales the padding and space between buttons. Values outside 0.25–3 are clamped; empty or invalid text uses `1.0`. Very large buttons may not fit alongside a narrow or short Glance panel; reduce the multiplier or hide some buttons in that case.

## Copy URL

Copy URL uses Zen's native chain-link icon and the same styling as the other Glance controls. Click it to copy the current Glance page's URL, including navigation since Glance opened. Its tooltip briefly changes from **Copy URL** to **Copied** after success.

The mod makes no network requests and writes the URL to the clipboard only when clicked.

## Compatibility

Verified in normal use with **Zen 1.22.2b** and **Sine 2.3.4.1c** on Windows, including copying URLs, positioning, resizing, reordering, and visibility changes. Other versions and platforms have not been verified.

With JavaScript mods disabled, the native buttons still support side, size, visibility, and vertical positioning. They use their native order, show plain visibility checkboxes, and percentages follow the available travel distance instead of the stack's centre.

If settings appear to do nothing immediately after installation, restart Zen once. Conflicting appearance mods and panels too short to fit the button group may affect positioning. Disabling this mod restores Zen's native layout.

## Credits

Inspired by psu's [Left Side Glance Buttons](https://github.com/psu/zen-mods). This standalone mod adds configurable side and percentage-based vertical positioning.

## License

[MIT](LICENSE).
