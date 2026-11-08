import assert from "node:assert/strict";
import { mkdtemp, readFile, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { buildSineMod } from "../../scripts/build_sine_mod.mjs";
import {scratchDirectory} from './scratch.mjs';

test("builds a self-contained Sine mod with Sine-local Lucide sources", async () => {
  const outputDirectory = await scratchDirectory('package-');
  const result = await buildSineMod({
    projectRoot: path.resolve(import.meta.dirname, "../.."),
    outputDirectory,
  });

  assert.equal(result.lucideCount, 1684);
  for (const required of [
    "theme.json",
    "preferences.json",
    "blank-tab.svg",
    "package-inventory.json",
    "ZenIcons.uc.js",
    "chrome.css",
    "runtime.sys.mjs",
    "ZenEmojisData.min.mjs",
    "modules/src/zen/common/emojis/ZenLucideIcons.mjs",
    "modules/src/zen-icons-sine/native-reconciler.mjs",
    "modules/src/zen-icons-sine/folder-icon-writer.mjs",
    "modules/src/zen-icons-sine/folder-presentation.mjs",
    "lucide/activity.svg",
  ]) {
    assert.equal(
      (await stat(path.join(outputDirectory, required))).isFile(),
      true,
    );
  }

  const catalog = await readFile(
    path.join(
      outputDirectory,
      "modules/src/zen/common/emojis/ZenLucideIcons.mjs",
    ),
    "utf8",
  );
  assert.doesNotMatch(catalog, /chrome:\/\/browser\/skin\/zen-icons\/lucide\//);
  assert.match(
    catalog,
    /chrome:\/\/sine\/content\/zen-icons-local\/lucide\/activity\.svg/,
  );

  const chromeCss = await readFile(
    path.join(outputDirectory, "chrome.css"),
    "utf8",
  );
  assert.match(
    chromeCss,
    /:is\(zen-folder, tab-group\)[^{]*\.tab-group-folder-icon[^{]*svg[^{]*\.icon\s+image\s*\{[^}]*-moz-context-properties:[^;}]*stroke[^}]*stroke:\s*color-mix\(/s,
    "folder images must provide context-stroke for Lucide icons on older Zen builds",
  );

  const folderPresentation = await readFile(
    path.join(
      outputDirectory,
      "modules/src/zen-icons-sine/folder-presentation.mjs",
    ),
    "utf8",
  );
  assert.match(folderPresentation, /BetterZenFolderColorChanged/);
  const theme = JSON.parse(await readFile(path.join(outputDirectory, "theme.json"), "utf8"));
  const preferences = JSON.parse(await readFile(path.join(outputDirectory, theme.preferences), "utf8"));
  for (const kind of ["tab", "folder", "space"]) {
    assert.equal(preferences.filter(p => p.property?.startsWith(`zen-icons.${kind}.show-`) && p.type === "checkbox" && p.defaultValue === true).length, 4);
    assert.ok(preferences.some(p => p.property === `zen-icons.${kind}.hidden-categories` && p.type === "string"));
  }
});
