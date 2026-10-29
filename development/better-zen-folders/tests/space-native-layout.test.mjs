import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';

const modulePath = process.env.BZF_PLAYWRIGHT_MODULE;
const archive = process.env.BZF_NATIVE_BROWSER_OMNI
  ?? 'C:/Program Files/Zen Browser/browser/omni.ja';

// Read the installed sources without extracting files or touching a Zen profile.
// Native source drift or a missing archive is a failure when this test is enabled.
function installedSources() {
  const script = `
    $ProgressPreference = 'SilentlyContinue'
    $ErrorActionPreference = 'Stop'
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [IO.Compression.ZipFile]::OpenRead($env:BZF_LAYOUT_TEST_ARCHIVE)
    try {
      $result = @{}
      foreach ($pair in @(
        @('layout', 'modules/MenuSectionLayout.sys.mjs'),
        @('context', 'chrome/browser/content/browser/tabbrowser/tab-context-menu.js')
      )) {
        $entry = $zip.GetEntry($pair[1])
        if (!$entry) { throw "Missing native entry: $($pair[1])" }
        $reader = [IO.StreamReader]::new($entry.Open())
        try { $result[$pair[0]] = $reader.ReadToEnd() } finally { $reader.Dispose() }
      }
      $result | ConvertTo-Json -Compress
    } finally { $zip.Dispose() }
  `;
  return JSON.parse(execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive',
    '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')], {
    encoding: 'utf8', maxBuffer: 4 * 1024 * 1024,
    env: {...process.env, BZF_LAYOUT_TEST_ARCHIVE: archive},
  }));
}

test('Space layout exemption against installed native arranger and both real layouts', {
  skip: process.platform !== 'win32' || process.env.BZF_CHECK_INSTALLED_ZEN !== '1'
    || (!modulePath && 'set BZF_PLAYWRIGHT_MODULE for isolated native layout replay'),
}, async t => {
  const native = installedSources();
  const source = await readFile(new URL('../scripts/better-zen-folders.uc.mjs', import.meta.url), 'utf8');
  const {chromium} = createRequire(import.meta.url)(modulePath);
  const browser = await chromium.launch({headless: true});
  try {
    for (const mode of ['classic', 'altstructure']) {
      for (const scenario of ['spaces', 'unknown', 'throw']) {
        await t.test(`${mode}: ${scenario}`, async () => {
          const page = await browser.newPage();
          try {
            await page.route('**/*', route => route.abort());
            const result = await page.evaluate(async ({native, source, mode, scenario}) => {
              const load = async text => {
                const url = URL.createObjectURL(new Blob([text], {type: 'text/javascript'}));
                try { return await import(url); } finally { URL.revokeObjectURL(url); }
              };
              const {MenuSectionLayout} = await load(native.layout);
              const {SpaceMoveMenuManager} = await load(source);
              // Evaluate the actual native object, including _ensureMenuArranged,
              // _hideUnusedSectionItems and _updateL10nIds. Only omit registration
              // of Firefox's external lazy services after the object declaration.
              const boundary = native.context.indexOf('\nXPCOMUtils.defineLazyPreferenceGetter(');
              if (boundary < 0) throw Error('Native context source boundary changed');
              const errors = [];
              const context = new Function('document', 'console',
                native.context.slice(0, boundary) + '\nreturn TabContextMenu;')(
                document, {error: error => errors.push(error.message)});
              context.MenuSectionLayout = MenuSectionLayout;
              context._altTabContextMenuPrefObserved = true;
              context._altTabContextMenu = false;
              document.createXULElement = name => document.createElement(name);

              // Build the complete declared classic skeleton, then let the real
              // native engine relocate its nodes into classic/alternate structure.
              const classic = context.MENU_SECTIONS.classic;
              const root = document.createElement('menupopup');
              root.id = 'tabContextMenu';
              document.body.append(root);
              const popups = new Map([[root.id, root]]);
              for (const id of Object.keys(classic)) {
                if (popups.has(id)) continue;
                const popup = document.createElement('menupopup');
                popup.id = id;
                popups.set(id, popup);
              }
              for (const [id, sections] of Object.entries(classic)) {
                for (const {selector, optional} of MenuSectionLayout.placementsFor(sections)) {
                  if (optional) continue;
                  if (!/^#[\w-]+$/.test(selector)) throw Error(`Unhandled native selector ${selector}`);
                  const item = document.createElement('menuitem');
                  item.id = selector.slice(1);
                  popups.get(id).append(item);
                }
              }
              const parents = {
                moveTabOptionsMenu: 'context_moveTabOptions',
                context_moveTabToGroupPopupMenu: 'context_moveTabToGroup',
                closeTabOptions: 'context_closeTabOptions',
              };
              for (const [id, popup] of popups) {
                if (popup === root) continue;
                const parent = root.querySelector(`#${parents[id]}`);
                if (!parent) throw Error(`Missing native popup parent for ${id}`);
                parent.append(popup);
              }
              context._ensureMenuArranged(root);
              if (errors.length) throw Error(`Invalid baseline fixture: ${errors.join('; ')}`);
              const nativePopup = document.getElementById('moveTabOptionsMenu');
              const row = document.createElement('menuitem');
              row.className = 'zen-workspace-context-menu-item';
              row.setAttribute('zen-workspace-id', 'destination');
              row.setAttribute('command', 'cmd_zenChangeWorkspaceTab');
              const separator = document.createElement('menuseparator');
              separator.className = 'zen-workspace-context-menu-item';
              nativePopup.prepend(row, separator);
              // Existing exemptions must survive unchanged as well.
              for (const attribute of ['tab-group-id', 'profileid']) {
                const item = document.createElement('menuitem');
                item.setAttribute(attribute, 'fixture');
                nativePopup.append(item);
              }
              if (scenario === 'unknown') {
                const unknown = document.createElement('menuitem');
                unknown.id = 'unexpected-extension-node';
                nativePopup.append(unknown);
              }
              const originalSelectors = context.DYNAMIC_MENU_ITEM_SELECTORS;
              const originalContents = [...originalSelectors];
              const nativeEnsure = context._ensureMenuArranged;
              const manager = new SpaceMoveMenuManager({document, TabContextMenu: context}, {
                get: () => false, subscribe: () => () => {},
              });
              manager.start();
              let during;
              const sentinel = new Error('native-layout-pref-read-failed');
              // A native method dependency throws before its internal catch.
              // The method and real layout engine themselves are never mocked.
              Object.defineProperty(context, '_altTabContextMenu', {configurable: true,
                get() {
                  during = [...context.DYNAMIC_MENU_ITEM_SELECTORS];
                  if (scenario === 'throw') throw sentinel;
                  return mode === 'altstructure';
                },
              });
              context._tabContextMenuArranged = false;
              let thrown;
              try { context._ensureMenuArranged(root); } catch (error) { thrown = error; }
              const identityRestored = context.DYNAMIC_MENU_ITEM_SELECTORS === originalSelectors;
              const contentsAfter = [...originalSelectors];
              let outsideError;
              try {
                new MenuSectionLayout(context.MENU_SECTIONS[mode], {
                  dynamicItemSelectors: context.DYNAMIC_MENU_ITEM_SELECTORS,
                }).arrange(root);
              } catch (error) { outsideError = error.message; }
              const rowPreserved = row.parentNode === nativePopup
                && row.getAttribute('command') === 'cmd_zenChangeWorkspaceTab';
              const alternateGroupMoved = document.getElementById('context_moveTabToGroupNewGroup')
                .parentNode === nativePopup;
              manager.destroy();
              return {errors, during, originalContents, identityRestored, contentsAfter,
                threwSentinel: thrown === sentinel, thrown: thrown?.message, outsideError,
                rowPreserved, alternateGroupMoved, wrapperRestored: context._ensureMenuArranged === nativeEnsure};
            }, {native, source, mode, scenario});
            assert.deepEqual(result.during, [...result.originalContents, '.zen-workspace-context-menu-item'],
              'only the exact native Space class is added during the native call');
            assert.equal(result.identityRestored, true, 'restore the original selector array identity');
            assert.deepEqual(result.contentsAfter, result.originalContents, 'do not mutate the original array');
            assert.equal(result.wrapperRestored, true, 'unload restores the native method');
            assert.equal(result.rowPreserved, true, 'retain original destination object and native command');
            assert.match(result.outsideError ?? '', /not placed by any section/,
              'Space exemption must not leak outside the wrapped call');
            if (scenario === 'throw') {
              assert.equal(result.threwSentinel, true, 'propagate the same native exception');
              assert.deepEqual(result.errors, []);
            } else if (scenario === 'unknown') {
              assert.equal(result.thrown, undefined, 'native coverage errors retain native catch behavior');
              assert.equal(result.errors.length, 1);
              assert.match(result.errors[0], /1 child\(ren\).*#unexpected-extension-node/,
                'coverage still rejects the unknown item, without rejecting native Space rows');
            } else {
              assert.equal(result.thrown, undefined);
              assert.deepEqual(result.errors, [], 'real native layout accepts Space rows and separator');
              assert.equal(result.alternateGroupMoved, mode === 'altstructure',
                'actual native arrangement must relocate the alternate-layout group action');
            }
          } finally { await page.close(); }
        });
      }
    }
  } finally { await browser.close(); }
});
