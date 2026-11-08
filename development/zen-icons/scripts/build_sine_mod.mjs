import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createSinePreferences } from "../src/zen-icons-sine/picker-defaults.mjs";

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const DEFAULT_PROJECT_ROOT = path.resolve(path.dirname(SCRIPT_PATH), "..");

const MODULE_FILES = [
  "src/zen/common/emojis/ZenIconRegistry.mjs",
  "src/zen/common/emojis/ZenIconCategories.mjs",
  "src/zen/common/emojis/ZenCategoryArtwork.mjs",
  "src/zen/common/emojis/ZenBuiltInIcons.mjs",
  "src/zen/common/emojis/ZenLucideIcons.mjs",
  "src/zen/common/emojis/ZenCustomIconPacks.mjs",
  "src/zen-icons-sine/native-reconciler.mjs",
  "src/zen-icons-sine/picker-model.mjs",
  "src/zen-icons-sine/selection-bridge.mjs",
  "src/zen-icons-sine/tab-default.mjs",
  "src/zen-icons-sine/picker-defaults.mjs",
  "src/zen-icons-sine/settings.mjs",
  "src/zen-icons-sine/icon-gestures.mjs",
  "src/zen-icons-sine/folder-shape-state.mjs",
  "src/zen-icons-sine/custom-image-fallback.mjs",
  "src/zen-icons-sine/folder-icon-source.mjs",
  "src/zen-icons-sine/folder-anchor.mjs",
  "src/zen-icons-sine/folder-icon-writer.mjs",
  "src/zen-icons-sine/folder-presentation.mjs",
  "src/zen-icons-sine/custom-storage.mjs",
];

async function copyFilePreservingPath(
  projectRoot,
  outputDirectory,
  relativePath,
) {
  const destination = path.join(outputDirectory, "modules", relativePath);
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(path.join(projectRoot, relativePath), destination);
}

export async function buildSineMod({
  projectRoot = DEFAULT_PROJECT_ROOT,
  outputDirectory = path.join(projectRoot, "dist", "sine", "zen-icons"),
} = {}) {
  await rm(outputDirectory, { recursive: true, force: true });
  await mkdir(outputDirectory, { recursive: true });

  for (const filename of ["theme.json", "ZenIcons.uc.js", "chrome.css", "blank-tab.svg", "chrome.manifest"]) {
    await cp(
      path.join(projectRoot, "sine", "zen-icons", filename),
      path.join(outputDirectory, filename),
    );
  }
  await writeFile(path.join(outputDirectory, "preferences.json"), JSON.stringify(createSinePreferences(), null, 2));
  await cp(
    path.join(projectRoot, "src", "zen-icons-sine", "runtime.sys.mjs"),
    path.join(outputDirectory, "runtime.sys.mjs"),
  );
  await cp(path.join(projectRoot, 'docs', 'zen-icon-packs.md'), path.join(outputDirectory, 'CUSTOM-ICONS.md'));
  await cp(path.join(projectRoot, 'sine','zen-icons','README.md'), path.join(outputDirectory, 'README.md'));
  await cp(path.join(projectRoot,'LICENSE'),path.join(outputDirectory,'LICENSE-MPL-2.0.txt'));
  await cp(
    path.join(
      projectRoot,
      "src",
      "zen",
      "common",
      "emojis",
      "ZenEmojisData.min.mjs",
    ),
    path.join(outputDirectory, "ZenEmojisData.min.mjs"),
  );

  for (const relativePath of MODULE_FILES) {
    await copyFilePreservingPath(projectRoot, outputDirectory, relativePath);
  }

  const lucideCatalogPath = path.join(
    outputDirectory,
    "modules",
    "src",
    "zen",
    "common",
    "emojis",
    "ZenLucideIcons.mjs",
  );
  const catalog = await readFile(lucideCatalogPath, "utf8");
  await writeFile(
    lucideCatalogPath,
    catalog.replaceAll(
      "chrome://browser/skin/zen-icons/lucide/",
      "chrome://sine/content/zen-icons-local/lucide/",
    ),
  );

  const sourceAssets = path.join(
    projectRoot,
    "src",
    "browser",
    "themes",
    "shared",
    "zen-icons",
    "common",
    "lucide",
  );
  const outputAssets = path.join(outputDirectory, "lucide");
  await cp(sourceAssets, outputAssets, { recursive: true });
  // Native tab/space renderers forward fill but not stroke. Keep the original
  // folder/picker assets and provide self-contained images for those callers.
  const displayAssets = path.join(outputDirectory, "display-lucide");
  await mkdir(displayAssets, { recursive: true });
  await cp(path.join(outputAssets,'LICENSE.md'),path.join(displayAssets,'LICENSE.md'));
  for (const filename of await readdir(outputAssets)) {
    if (!filename.endsWith(".svg")) continue;
    const source = await readFile(path.join(outputAssets, filename), "utf8");
    const display = source
      .replaceAll('stroke="context-stroke"', 'stroke="currentColor"')
      .replaceAll('fill="context-fill"', 'fill="currentColor"')
      .replace(/(<svg\b[^>]*>)/, '$1<style>:root{color:#000000}@media(prefers-color-scheme:dark){:root{color:#ffffff}}</style>');
    await writeFile(path.join(displayAssets, filename), display);
  }
  const lucideCount = (await readdir(outputAssets)).filter((name) =>
    name.endsWith(".svg"),
  ).length;

  const files = {};
  async function inventory(directory, prefix = "") {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const relative = prefix + entry.name;
      if (entry.isDirectory())
        await inventory(path.join(directory, entry.name), relative + "/");
      else {
        const bytes = await readFile(path.join(directory, entry.name));
        files[relative] = {
          size: bytes.length,
          sha256: createHash("sha256").update(bytes).digest("hex"),
        };
      }
    }
  }
  await inventory(outputDirectory);
  await writeFile(
    path.join(outputDirectory, "package-inventory.json"),
    JSON.stringify({ schema: 1, modId: "zen-icons-local", files }, null, 2),
  );

  return { outputDirectory, lucideCount };
}

if (path.resolve(process.argv[1] ?? "") === SCRIPT_PATH) {
  const result = await buildSineMod();
  console.log(
    `Built Sine mod with ${result.lucideCount} Lucide icons at ${result.outputDirectory}`,
  );
}
