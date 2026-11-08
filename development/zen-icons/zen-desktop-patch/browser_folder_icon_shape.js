/* Any copyright is dedicated to the Public Domain.
   https://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

add_task(async function test_folder_shape_is_per_folder_and_persisted() {
  const firstTab = BrowserTestUtils.addTab(gBrowser, "about:blank");
  const secondTab = BrowserTestUtils.addTab(gBrowser, "about:blank");
  const first = await gZenFolders.createFolder([firstTab], {
    renameFolder: false,
    label: "outline",
  });
  const second = await gZenFolders.createFolder([secondTab], {
    renameFolder: false,
    label: "icon only",
  });

  ok(first.showFolderShape, "new folders show their shape by default");
  ok(second.showFolderShape, "the default applies independently");

  gZenFolders.setFolderShowFolderShape(second, false);
  ok(first.showFolderShape, "the first folder remains unchanged");
  ok(!second.showFolderShape, "the second folder is icon-only");

  const storedSecond = gZenFolders
    .storeDataForSessionStore()
    .find((folder) => folder.id === second.id);
  Assert.equal(
    storedSecond.showFolderShape,
    false,
    "the per-folder choice is stored",
  );

  await removeFolder(first);
  await removeFolder(second);
});

add_task(
  async function test_folder_keeps_custom_identifier_separate_from_source() {
    const tab = BrowserTestUtils.addTab(gBrowser, "about:blank");
    const folder = await gZenFolders.createFolder([tab], {
      renameFolder: false,
      label: "custom",
    });
    const value = "custom:My%20Icons:Sports/football.png";

    gZenFolders.setFolderUserIcon(folder, value);
    Assert.equal(folder.userIconValue, value, "the portable value is retained");
    Assert.equal(folder.iconURL, "", "a missing local image is not rendered");
    ok(
      folder.hasAttribute("zen-custom-icon-unavailable"),
      "a missing custom image uses the safe folder fallback",
    );

    const packRoot = PathUtils.join(
      PathUtils.profileDir,
      "zen-icon-packs",
      "My Icons",
    );
    const iconDirectory = PathUtils.join(packRoot, "Sports");
    const iconPath = PathUtils.join(iconDirectory, "football.png");
    await IOUtils.makeDirectory(iconDirectory, { ignoreExisting: true });
    await IOUtils.write(iconPath, new Uint8Array([0]));
    gZenFolders.setFolderUserIcon(folder, value);
    ok(folder.iconURL.startsWith("file:"), "the restored file is resolved");
    ok(
      !folder.hasAttribute("zen-custom-icon-unavailable"),
      "the stable identifier recovers when the file returns",
    );
    await IOUtils.remove(packRoot, { recursive: true, ignoreAbsent: true });

    await removeFolder(folder);
  },
);
