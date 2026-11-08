import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, writeFile,unlink as fsDelete } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { createHash } from "node:crypto";
import { buildSineMod } from "../../scripts/build_sine_mod.mjs";
import {scratchDirectory} from './scratch.mjs';

const SCRIPT = path.resolve("scripts/deploy_sine_mod.ps1");

function run(args) {
  const result = spawnSync(
    "C:\\Program Files\\PowerShell\\7\\pwsh.exe",
    ["-NoLogo", "-NoProfile", "-File", SCRIPT, ...args],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

test("deployment preserves custom icons, updates Sine once, and rolls back", async () => {
  const root = await scratchDirectory('deploy-');
  const profile = path.join(root, "profile");
  const modsRoot = path.join(profile, "chrome", "sine-mods");
  const packageRoot = path.join(root, "package");
  await mkdir(modsRoot, { recursive: true });
  await buildSineMod({ outputDirectory: packageRoot });
  await writeFile(
    path.join(modsRoot, "mods.json"),
    JSON.stringify({ old: { enabled: true } }),
  );
  await writeFile(path.join(modsRoot, "chrome.css"), "/* existing */\n");
  async function updateCss(value) {
    await writeFile(path.join(packageRoot, "chrome.css"), value);
    const inventoryPath = path.join(packageRoot, "package-inventory.json");
    let inventory;
    try {
      inventory = JSON.parse(await readFile(inventoryPath, "utf8"));
    } catch {
      return;
    }
    inventory.files["chrome.css"] = {
      sha256: createHash("sha256").update(value).digest("hex"),
      size: Buffer.byteLength(value),
    };
    await writeFile(inventoryPath, JSON.stringify(inventory));
  }
  await updateCss("/* v1 */\n");

  run(["-ProfilePath", profile, "-PackagePath", packageRoot]);
  const custom = path.join(modsRoot, "zen-icons-local", "custom", "Mine");
  await mkdir(custom, { recursive: true });
  await writeFile(path.join(custom, "ball.png"), "image");
  await updateCss("/* v2 */\n");
  const deployment = run([
    "-ProfilePath",
    profile,
    "-PackagePath",
    packageRoot,
  ]);

  // The successor's authoritative user data is not part of any code generation.
  const persistent=path.join(profile,'zen-icon-packs','User Pack');
  await mkdir(persistent,{recursive:true});
  await writeFile(path.join(persistent,'keep.png'),'external-current');
  await writeFile(path.join(persistent,'deleted.png'),'delete-me');
  await fsDelete(path.join(persistent,'deleted.png'));

  assert.equal(await readFile(path.join(custom, "ball.png"), "utf8"), "image");
  const mods = JSON.parse(
    await readFile(path.join(modsRoot, "mods.json"), "utf8"),
  );
  assert.equal(mods.old.enabled, true);
  assert.equal(mods["zen-icons-local"].enabled, true);
  assert.equal(mods["zen-icons-local"].origin, "local");
  assert.equal(mods["zen-icons-local"].preferences, "preferences.json");
  assert.ok(JSON.parse(await readFile(path.join(modsRoot, "zen-icons-local", mods["zen-icons-local"].preferences), "utf8")).length > 0);
  const imports = (
    await readFile(path.join(modsRoot, "chrome.css"), "utf8")
  ).match(/zen-icons-local/g);
  assert.equal(imports?.length, 1);

  mods.old.version = "after-update";
  await writeFile(path.join(modsRoot, "mods.json"), JSON.stringify(mods));
  await writeFile(
    path.join(modsRoot, "chrome.css"),
    (await readFile(path.join(modsRoot, "chrome.css"), "utf8")) +
      "/* unrelated later css */\n",
  );
  await writeFile(path.join(custom, "new.png"), "later-image");
  run([
    "-ProfilePath",
    profile,
    "-PackagePath",
    packageRoot,
    "-Rollback",
    "-BackupPath",
    deployment.backup,
  ]);
  assert.equal(await readFile(path.join(persistent,'keep.png'),'utf8'),'external-current');
  await assert.rejects(readFile(path.join(persistent,'deleted.png')),/ENOENT/);
  assert.equal(
    await readFile(path.join(custom, "new.png"), "utf8"),
    "later-image",
  );
  assert.equal(
    JSON.parse(await readFile(path.join(modsRoot, "mods.json"), "utf8")).old
      .version,
    "after-update",
  );
  assert.match(
    await readFile(path.join(modsRoot, "chrome.css"), "utf8"),
    /unrelated later css/,
  );
  assert.match(
    await readFile(
      path.join(modsRoot, "zen-icons-local", "chrome.css"),
      "utf8",
    ),
    /v1/,
  );

  const baseline = await readFile(path.join(modsRoot, "mods.json"), "utf8");
  const runtimePath = path.join(packageRoot, "runtime.sys.mjs");
  const goodRuntime = await readFile(runtimePath);
  await writeFile(runtimePath, "truncated package");
  const damaged = spawnSync(
    "C:\\Program Files\\PowerShell\\7\\pwsh.exe",
    [
      "-NoProfile",
      "-File",
      SCRIPT,
      "-ProfilePath",
      profile,
      "-PackagePath",
      packageRoot,
    ],
    { encoding: "utf8" },
  );
  assert.notEqual(damaged.status, 0);
  assert.match(damaged.stderr, /Inventory mismatch/);
  assert.equal(
    await readFile(path.join(modsRoot, "mods.json"), "utf8"),
    baseline,
  );
  await writeFile(runtimePath, goodRuntime);

  const lock = path.join(profile, "parent.lock");
  const locked = spawnSync(
    "C:\\Program Files\\PowerShell\\7\\pwsh.exe",
    [
      "-NoProfile",
      "-Command",
      `$handle=[IO.File]::Open('${lock}',[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None); try { & '${SCRIPT}' -ProfilePath '${profile}' -PackagePath '${packageRoot}' } finally { $handle.Dispose() }`,
    ],
    { encoding: "utf8" },
  );
  assert.notEqual(locked.status, 0);
  assert.match(locked.stderr, /another process/);
  assert.equal(
    await readFile(path.join(modsRoot, "mods.json"), "utf8"),
    baseline,
  );

  const interrupted = path.join(
    modsRoot,
    ".zen-icons-backups",
    "interrupted-fixture",
  );
  await mkdir(interrupted);
  await writeFile(
    path.join(interrupted, "metadata.json"),
    JSON.stringify({ schema: 2, status: "ready", profile }),
  );
  const interruptedResult = spawnSync(
    "C:\\Program Files\\PowerShell\\7\\pwsh.exe",
    [
      "-NoProfile",
      "-File",
      SCRIPT,
      "-ProfilePath",
      profile,
      "-PackagePath",
      packageRoot,
    ],
    { encoding: "utf8" },
  );
  assert.notEqual(interruptedResult.status, 0);
  assert.match(interruptedResult.stderr, /Interrupted deployment/);
  assert.equal(
    await readFile(path.join(modsRoot, "mods.json"), "utf8"),
    baseline,
  );
  await writeFile(
    path.join(interrupted, "metadata.json"),
    JSON.stringify({ schema: 2, status: "failed-recovered", profile }),
  );
  const readyPath = path.join(deployment.backup, "metadata.json");
  const ready = JSON.parse(await readFile(readyPath, "utf8"));
  ready.status = "ready";
  await writeFile(readyPath, JSON.stringify(ready));
  run(["-ProfilePath", profile, "-Recover", "-BackupPath", deployment.backup]);
  assert.equal(
    await readFile(path.join(custom, "new.png"), "utf8"),
    "later-image",
  );
  assert.equal(
    JSON.parse(await readFile(readyPath, "utf8")).status,
    "recovered",
  );
});
