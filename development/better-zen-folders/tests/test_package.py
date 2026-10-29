import json
import re
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


class PackageContractTests(unittest.TestCase):
    def test_native_sine_preferences_are_complete_and_intuitive(self):
        manifest = json.loads((ROOT / "theme.json").read_text(encoding="utf-8"))
        preferences = json.loads((ROOT / "preferences.json").read_text(encoding="utf-8"))

        self.assertEqual(manifest["preferences"], "preferences.json")
        sections = []
        for item in preferences:
            if item["type"] == "separator":
                sections.append((item["label"], []))
            else:
                self.assertTrue(sections, "settings must follow a section heading")
                self.assertTrue(item["property"].startswith("better-zen-folders."))
                sections[-1][1].append(item["property"].removeprefix("better-zen-folders."))
        self.assertEqual(sections, [
            ("Creating and Moving", ["new-tab-position", "moved-tab-position",
                                     "subfolder-position", "moved-folder-position"]),
            ("URL Pins in Folders", ["show-root-pin-badge", "folder-url-pins-enabled", "pin-new-folder-tab-urls",
                                     "url-unpin-grace-seconds"]),
            ("Sticky and Collapsing", ["sticky-tabs-enabled", "sticky-folders-enabled",
                                      "sticky-marker", "sticky-removal-delay-seconds", "subfolder-collapse-policy"]),
            ("Folder Previews", ["preview-subfolders"]),
            ("Folder Controls", ["new-tab-button-visibility", "double-click-rename",
                                 "folder-title-click-delay-ms", "rename-escape-action",
                                 "middle-click-delete", "delete-empty-regular-folders",
                                 "show-folder-unload-button"]),
            ("Dragging", ["drag-hover-delay-ms", "drag-destination-delay-ms",
                          "colour-code-drag-destinations", "drag-recollapse-delay-ms"]),
            ("Appearance", ["show-empty-folder-active-indicator", "folder-name-size", "folder-state-chevron", "show-hierarchy-guides"]),
            ("Menus", ["command-icon-mode", "decorate-move-to-folder-menu", "menu-icon-size-percent"]),
            ("Folder Colours", ["use-space-colour", "custom-palette-enabled", "palette-1", "palette-2", "palette-3",
                                "palette-4", "palette-5", "palette-6", "palette-7", "palette-8"]),
            ("Diagnostics", ["drag-diagnostics-enabled"]),
        ])
        rows = {item["property"]: item for item in preferences if "property" in item}
        self.assertEqual(len(rows), 43)
        self.assertEqual(
            [option["value"] for option in rows[
                "better-zen-folders.new-tab-button-visibility"
            ]["options"]],
            ["hover", "always", "hidden"],
        )
        self.assertEqual(
            [option["value"] for option in rows[
                "better-zen-folders.new-tab-position"
            ]["options"]],
            ["top", "bottom"],
        )
        for property_name in ("drag-hover-delay-ms", "drag-destination-delay-ms", "folder-title-click-delay-ms",
                              "folder-name-size", "menu-icon-size-percent", "sticky-removal-delay-seconds"):
            row = rows[f"better-zen-folders.{property_name}"]
            self.assertEqual(row["type"], "string")
            self.assertNotIn("options", row)
        self.assertEqual(
            [option["value"] for option in rows[
                "better-zen-folders.subfolder-position"
            ]["options"]],
            ["top", "bottom"],
        )
        self.assertTrue(
            all(
                item["defaultValue"] is (item["property"] not in {
                    "better-zen-folders.show-folder-unload-button",
                    "better-zen-folders.drag-diagnostics-enabled",
                    "better-zen-folders.custom-palette-enabled",
                    "better-zen-folders.pin-new-folder-tab-urls",
                    "better-zen-folders.show-root-pin-badge",
                    "better-zen-folders.show-empty-folder-active-indicator",
                })
                for item in rows.values()
                if item["type"] == "checkbox"
            )
        )
        self.assertTrue(all(item.get("restart") is not True for item in preferences))
        # The context-menu action still creates folder tabs when the hover + is hidden.
        self.assertNotIn("conditions", rows["better-zen-folders.new-tab-position"])
        self.assertEqual(
            rows["better-zen-folders.folder-name-size"]["defaultValue"],
            "14",
        )

    def test_moved_tabs_setting_has_independent_placement_contract(self):
        preferences = json.loads((ROOT / "preferences.json").read_text(encoding="utf-8"))
        rows = {item["property"]: item for item in preferences if "property" in item}
        self.assertIn("better-zen-folders.moved-tab-position", rows)
        row = rows["better-zen-folders.moved-tab-position"]
        self.assertEqual(row["type"], "dropdown")
        self.assertEqual(row["defaultValue"], "bottom")
        self.assertEqual(row["label"], "Place Moved Tabs\nWhen using Move to Folder or dropping onto a folder header. Dropping between items keeps your chosen position.")
        self.assertEqual(row["options"], [
            {"value": "top", "label": "At the Top"},
            {"value": "bottom", "label": "At the Bottom"},
        ])
        self.assertNotIn("conditions", row)

    def test_custom_palette_fields_are_opt_in_with_approved_defaults(self):
        preferences = json.loads((ROOT / "preferences.json").read_text(encoding="utf-8"))
        rows = {item["property"]: item for item in preferences if "property" in item}
        self.assertIn("better-zen-folders.custom-palette-enabled", rows)
        enabled = rows["better-zen-folders.custom-palette-enabled"]
        self.assertEqual(enabled["type"], "checkbox")
        self.assertEqual(enabled["label"].splitlines()[0], "Customise Preset Colours")
        self.assertIs(enabled["defaultValue"], False)
        for index, colour in enumerate(("#e76565", "#ef8f4b", "#e3bd41", "#51c67c",
                                        "#3ebcd2", "#5f95eb", "#9b79ea", "#e46da9"), 1):
            with self.subTest(swatch=index):
                self.assertIn(f"better-zen-folders.palette-{index}", rows)
                row = rows[f"better-zen-folders.palette-{index}"]
                self.assertEqual(row["type"], "string")
                self.assertEqual(row["label"], f"Swatch {index}")
                self.assertEqual(row["defaultValue"], colour)
                self.assertEqual(row["conditions"], [{"if": {
                    "property": "better-zen-folders.custom-palette-enabled", "value": True,
                }}])

    def test_move_menu_icon_size_label_and_condition(self):
        preferences = json.loads((ROOT / "preferences.json").read_text(encoding="utf-8"))
        rows = {item["property"]: item for item in preferences if "property" in item}
        row = rows["better-zen-folders.menu-icon-size-percent"]
        self.assertEqual(row["label"].split("\n")[0], "Outline-Free Icon Size in Move Menus (%)")
        self.assertEqual(row["defaultValue"], "120")
        self.assertEqual(row["conditions"], [{"if": {
            "property": "better-zen-folders.decorate-move-to-folder-menu", "value": True,
        }}])

    def test_manifest_is_independent_and_restartlessly_unloadable(self):
        manifest = json.loads((ROOT / "theme.json").read_text(encoding="utf-8"))
        self.assertEqual(manifest["id"], "5b0aa51f-cea7-4de5-8344-3e86e77fb88d")
        self.assertRegex(manifest["version"], r"^\d+\.\d+\.\d+$")
        self.assertEqual(manifest["style"]["chrome"], "chrome.css")
        self.assertTrue(manifest["supportsUnload"])
        script = manifest["scripts"]["scripts/better-zen-folders.uc.mjs"]
        self.assertEqual(script["include"], ["chrome://browser/content/browser.xhtml",
            "about:preferences([?#].*)?", "about:settings([?#].*)?"])
        self.assertNotIn("Even Better New Tab Button", json.dumps(manifest))

    def test_collapsed_rule_hides_only_direct_inactive_children(self):
        css = (ROOT / "chrome.css").read_text(encoding="utf-8")
        self.assertIn("zen-folder[collapsed]", css)
        self.assertIn('tab[aria-hidden="true"]', css)
        self.assertIn('tab-split-view-wrapper[aria-hidden="true"]', css)
        self.assertNotRegex(css, r"(?m)^\s*\.tab-group-container\s*\{[^}]*display\s*:\s*none")

    def test_folder_children_use_close_not_reset_control(self):
        css = (ROOT / "chrome.css").read_text(encoding="utf-8")
        self.assertIn(".tab-reset-button", css)
        self.assertIn(".tab-close-button", css)
        self.assertIn(":not([zen-essential]):not([zen-empty-tab])", css)

    def test_regular_folder_button_styles_are_theme_safe_and_live_neutral(self):
        css = (ROOT / "chrome.css").read_text(encoding="utf-8")
        script = (ROOT / "scripts" / "better-zen-folders.uc.mjs").read_text(
            encoding="utf-8"
        )
        self.assertIn(".better-zen-folders-new-tab-button", css)
        self.assertIn('list-style-image: url("chrome://global/skin/icons/plus.svg")', css)
        self.assertIn(":focus-visible", css)
        self.assertIn(":root:not([zen-sidebar-expanded])", css)
        self.assertIn(':root[better-zen-folders-new-tab-visibility="hover"]', css)
        self.assertIn(':root[better-zen-folders-new-tab-visibility="always"]', css)
        button_rules = [
            match.group(2)
            for match in re.finditer(r"([^{}]+)\{([^{}]*)\}", css)
            if ".better-zen-folders-new-tab-button" in match.group(1)
        ]
        self.assertTrue(button_rules)
        for declarations in button_rules:
            self.assertNotRegex(declarations, r"(?i)#[0-9a-f]{3,8}\b|rgba?\s*\(")
            self.assertNotRegex(declarations, r"(?i)position\s*:\s*absolute")
        self.assertNotRegex(
            css, r"(?is)zen-folder[^,{]*(?:is-live|live-folder|isLiveFolder)[^{]*"
            r"better-zen-folders-new-tab-button",
        )
        for selector, declarations in re.findall(r"([^{}]+)\{([^{}]*)\}", css):
            if re.search(r"\bzen-folder(?:\[|:|\s|>|$)", selector):
                self.assertNotRegex(declarations, r"(?i)\bheight\s*:\s*\d")
        self.assertNotRegex(script, r"\.prototype(?:\.\w+|\[[^]]+\])\s*=")
        self.assertIn("host.gBrowser?.tabContainer", script)
        self.assertIn("host.addUnloadListener(controller.boundDestroy)", script)

    def test_folder_hierarchy_guides_use_native_state_and_tokens(self):
        css = (ROOT / "chrome.css").read_text(encoding="utf-8")
        enabled_root = ':root[better-zen-folders-show-guides="true"]'
        for required in (
            enabled_root,
            ':root[zen-sidebar-expanded]',
            '> .tab-group-label-container > .tab-group-label[aria-expanded="true"]',
            '> tab-split-view-wrapper[hasactivetab]',
            '--tab-group-line-thickness',
            '--zen-folder-stroke',
        ):
            self.assertIn(required, css)
        self.assertNotIn(
            '> .tab-group-label-container[aria-expanded="true"]', css
        )
        self.assertRegex(
            css,
            r"(?s)>\s*tab-split-view-wrapper\s*>\s*tab\.tabbrowser-tab:is\("
            r"\s*\[selected=\"true\"\],\s*\[folder-active=\"true\"\]\s*\)",
        )
        self.assertNotRegex(
            css,
            r"(?s)>\s*:is\(tab\.tabbrowser-tab,\s*tab-split-view-wrapper\)"
            r"\[(?:selected|folder-active)=\"true\"\]",
        )
        for forbidden in ('left:', 'right:'):
            self.assertNotIn(forbidden, css)
        # Sidebar rows/guides must not acquire a compensating margin. Allow only
        # measured drag destinations and the separate popup's hierarchy rows.
        uncommented = re.sub(r"/\*.*?\*/", "", css, flags=re.S)
        for selector, declarations in re.findall(r"([^{}]+)\{([^{}]*)\}", uncommented):
            if re.search(r"\bmargin-inline-start\s*:", declarations):
                allowed = {
                    '.better-zen-folders-drop-footer > .better-zen-folders-drop-row':
                        r"margin-inline-start\s*:\s*var\(--bzf-drop-indent,\s*0px\)\s*;",
                    '#zen-folder-tabs-list[data-bzf-grouped-preview] > .folders-tabs-list-item':
                        r"margin-inline-start\s*:\s*calc\(var\(--bzf-preview-depth,\s*0\)\s*\*\s*14px\)\s*;",
                    '.better-zen-folders-preview-pin':
                        r"margin-inline-start\s*:\s*6px\s*;",
                }
                self.assertIn(selector.strip(), allowed)
                self.assertRegex(declarations, allowed[selector.strip()])
        guide_selectors = [
            selector
            for selector, declarations in re.findall(r"([^{}]+)\{([^{}]*)\}", css)
            if "better-zen-folders-guide-color" in declarations
            or "> .tab-group-container::before" in selector
        ]
        self.assertTrue(guide_selectors)
        self.assertTrue(all(':root[zen-sidebar-expanded]' in selector for selector in guide_selectors))
        self.assertIn('opacity: var(--better-zen-folders-guide-opacity, 0)', css)
        self.assertNotRegex(
            css,
            r':root\[better-zen-folders-show-guides="false"\][^{]*'
            r'(?:better-zen-folders-guide-color|tab-group-container::before)',
        )

    def test_folder_hierarchy_guide_colour_is_stable_across_selection_state(self):
        css = (ROOT / "chrome.css").read_text(encoding="utf-8")
        self.assertIn("--better-zen-folders-folder-color", css)
        self.assertRegex(
            css,
            r"--better-zen-folders-folder-color\s*:\s*"
            r"var\(\s*--better-zen-folders-custom-color,\s*"
            r"var\(--zen-folder-stroke\)\s*\)",
        )
        guide_colour_rules = [
            declarations
            for _, declarations in re.findall(r"([^{}]+)\{([^{}]*)\}", css)
            if re.search(r"--better-zen-folders-guide-color\s*:", declarations)
        ]
        self.assertTrue(guide_colour_rules)
        self.assertTrue(
            all("--zen-primary-color" not in declarations for declarations in guide_colour_rules)
        )
        self.assertTrue(
            all(
                "var(--better-zen-folders-folder-color)" in declarations
                for declarations in guide_colour_rules
            )
        )

    def test_folder_colour_and_context_actions_have_owned_runtime_contracts(self):
        css = (ROOT / "chrome.css").read_text(encoding="utf-8")
        script = (ROOT / "scripts" / "better-zen-folders.uc.mjs").read_text(
            encoding="utf-8"
        )
        for required in (
            "FOLDER_COLOR_LEDGER_PREF",
            "MAX_FOLDER_COLOR_ENTRIES = 256",
            "BetterZenFolderColorChanged",
            "data-better-zen-folders-color",
            "--better-zen-folders-custom-color",
            "class FolderColorMenuManager",
            "class MoveToFolderMenuDecorator",
            "MOVE_TO_FOLDER_FALLBACK_ICON",
            "class FolderDoubleClickRenameManager",
            "FOLDER_DOUBLE_CLICK_DELAY_MS = 300",
            "class FolderIconIntegrityManager",
            "class SubfolderCreationManager",
            "context_zenFolderNewSubfolder",
            "folder?.constructor?.rawIcon",
            'folder.rename()',
        ):
            self.assertIn(required, script)
        for required in (
            "zen-folder[data-better-zen-folders-color]",
            "--zen-folder-stroke: var(--better-zen-folders-custom-color)",
            ".better-zen-folders-colour-command:focus-visible",
            ".context-zen-move-to-folder-item.better-zen-folders-decorated-folder-item",
            "--better-zen-folders-menu-folder-color",
        ):
            self.assertIn(required, css)
        self.assertNotRegex(script, r"\.prototype(?:\.\w+|\[[^]]+\])\s*=")

    def test_folder_colour_picker_is_compact_and_menu_marker_is_never_blank(self):
        css = (ROOT / "chrome.css").read_text(encoding="utf-8")
        rules = {
            re.sub(r"\s+", " ", selector.strip()): declarations
            for selector, declarations in re.findall(r"([^{}]+)\{([^{}]*)\}", css)
        }

        panel = rules[".better-zen-folders-colour-panel-content"]
        self.assertIn("display: flex", panel)
        self.assertIn("width: max-content", panel)
        self.assertIn("font: inherit", panel)

        swatches = rules[".better-zen-folders-colour-swatches"]
        self.assertIn("grid-template-columns: repeat(8", swatches)
        self.assertIn("justify-content: start", swatches)

        swatch = rules[".better-zen-folders-colour-swatch"]
        self.assertIn("min-width: 24px", swatch)
        self.assertIn("min-height: 24px", swatch)
        selected = rules['.better-zen-folders-colour-swatch[aria-pressed="true"]']
        self.assertIn("box-shadow:", selected)
        selected_check = rules[
            '.better-zen-folders-colour-swatch[aria-pressed="true"]::after'
        ]
        self.assertIn('content: "✓"', selected_check)

        command = rules[".better-zen-folders-colour-command"]
        self.assertIn("width: 100%", command)
        self.assertIn("min-height: 2.25em", command)
        self.assertNotIn(".better-zen-folders-colour-actions", rules)

        custom_preview = rules[".better-zen-folders-colour-custom-preview"]
        self.assertIn("width: 1.75em", custom_preview)
        self.assertIn("height: 1.75em", custom_preview)
        self.assertIn("min-width: 24px", custom_preview)
        self.assertIn("min-height: 24px", custom_preview)
        self.assertIn("border-radius: 50%", custom_preview)
        self.assertIn(
            "background-color: var(--better-zen-folders-picker-color)",
            custom_preview,
        )
        self.assertNotIn(".better-zen-folders-colour-command-custom::after", rules)

        marker_selector = (
            '#better-zen-folders-folder-colour[data-better-zen-folders-command-icon-mode="mod"] '
            "> .menu-iconic-left "
            "> .menu-iconic-icon"
        )
        marker = next(value for key, value in rules.items()
                      if marker_selector in [part.strip() for part in key.split(",")])
        self.assertIn("zen-icons/selectable/palette.svg", marker)
        self.assertIn("-moz-context-properties: fill", marker)
        self.assertIn("radial-gradient", marker)

        custom_marker = next(
            declarations
            for selector, declarations in rules.items()
            if "data-better-zen-folders-colour-marker=\"custom\"" in selector
            and 'data-better-zen-folders-command-icon-mode="mod"' in selector
            and "> .menu-iconic-icon" in selector
        )
        self.assertIn("--better-zen-folders-menu-folder-color", custom_marker)

        hidden_native_icon = next(value for key, value in rules.items()
                                 if "better-zen-folders-has-live-folder-icon > .menu-icon," in key)
        self.assertIn("display: none", hidden_native_icon)

        live_folder_icon = next(value for key, value in rules.items()
                                if " > .menu-iconic-left > svg.better-zen-folders-menu-live-folder-icon" in key)
        self.assertIn("width: 2em", live_folder_icon)
        self.assertIn("height: 2em", live_folder_icon)

    def test_folder_hierarchy_guides_use_non_layout_pseudo_elements(self):
        css = (ROOT / "chrome.css").read_text(encoding="utf-8")
        rules = [
            (match.group(1), match.group(2))
            for match in re.finditer(r"([^{}]+)\{([^{}]*)\}", css)
        ]
        pseudo_rules = [
            declarations
            for selector, declarations in rules
            if "> .tab-group-container::before" in selector
        ]
        self.assertTrue(pseudo_rules)
        self.assertTrue(
            any(
                'content: ""' in declarations
                and "position: absolute" in declarations
                and "inset-block: 0" in declarations
                and "inset-inline-start: calc(var(--better-zen-folders-native-indent, 14px)" in declarations
                and "pointer-events: none" in declarations
                for declarations in pseudo_rules
            )
        )
        for selector, declarations in rules:
            if "> .tab-group-container" in selector and "::before" not in selector:
                self.assertNotIn("border-inline-start:", declarations)
        fixed_layout = (
            r"(?i)\b(?:width|height|margin|padding|inset-inline-start)\s*:"
            r"\s*-?\d+(?:\.\d+)?(?:px|em|rem)\b"
        )
        for selector, declarations in rules:
            if "better-zen-folders-guide-color" in declarations or "tab-group-container" in selector:
                self.assertNotRegex(declarations, fixed_layout)

    def test_nested_hierarchy_dashes_are_eligible_and_cascade_after_solid_guide(self):
        css = (ROOT / "chrome.css").read_text(encoding="utf-8")
        rules = [
            (match.group(1), match.group(2), match.start())
            for match in re.finditer(r"([^{}]+)\{([^{}]*)\}", css)
        ]
        solid_rules = [
            offset
            for selector, declarations, offset in rules
            if "> .tab-group-container::before" in selector
            and "border-inline-start:" in declarations
            and " solid " in declarations
        ]
        dashed_rules = [
            (selector, offset)
            for selector, declarations, offset in rules
            if "border-inline-start-style: dashed" in declarations
        ]
        self.assertTrue(solid_rules)
        self.assertTrue(dashed_rules)
        for selector, offset in dashed_rules:
            self.assertIn("zen-folder:is(", selector)
            self.assertIn(":has(", selector)
            self.assertIn("> .tab-group-container::before", selector)
            self.assertGreater(offset, max(solid_rules))

    def test_drag_guard_uses_events_without_preference_mutation(self):
        script = (ROOT / "scripts" / "better-zen-folders.uc.mjs").read_text(
            encoding="utf-8"
        )
        self.assertIn("class CollapsedFolderDragGuard", script)
        self.assertIn("DRAG_HOVER_DELAY_MS = 500", script)
        self.assertIn('"TabGroupExpand"', script)
        self.assertNotIn("DragPreferenceTransaction", script)
        self.assertNotIn("DragTrialHarness", script)
        self.assertNotIn("DragHoverDiagnostic", script)
        self.assertNotIn("better-zen-folders.debug.drag", script)
        self.assertNotIn("better-zen-folders.drag-restore", script)
        self.assertNotIn("browser.tabs.dragDrop.expandGroup.delayMS", script)
        self.assertNotIn("setInterval(", script)
        self.assertNotIn("browser.tabs.dragDrop.createGroup.delayMS", script)
        self.assertNotRegex(script, r"\.prototype(?:\.\w+|\[[^]]+\])\s*=")

    def test_documentation_matches_package_settings_and_evidence_boundaries(self):
        """A stale README or release overclaim must fail package completeness."""
        documents = {
            "README.md": ROOT / "README.md",
            "VERIFICATION.md": ROOT / "VERIFICATION.md",
        }
        missing = [name for name, path in documents.items() if not path.is_file()]
        self.assertFalse(missing, f"missing required package documentation: {missing}")
        if missing:
            return

        readme = documents["README.md"].read_text(encoding="utf-8")
        verification = documents["VERIFICATION.md"].read_text(encoding="utf-8")

        preferences = json.loads((ROOT / "preferences.json").read_text(encoding="utf-8"))
        setting_rows = [item for item in preferences if "property" in item]
        readme_rows = {
            match.group("setting"): match
            for match in re.finditer(
                r"(?m)^\| (?P<setting>[^|]+) \| (?P<default>[^|]+) \| "
                r"(?P<description>.+) \|$",
                readme,
            )
        }
        settings_table = readme.split("| Setting | Default | What it does |", 1)[1].split("\n\n", 1)[0]
        self.assertEqual(
            re.findall(r"(?m)^\| ([^|]+) \|", settings_table)[1:],
            [f'**{item["label"]}**' if item["type"] == "separator"
             else item["label"].split("\n")[0] for item in preferences],
        )

        # Publication is a changing release fact, not a permanent requirement
        # that this mod must remain unpublished. Settings parity is checked below.
        for setting in setting_rows:
            readme_row = readme_rows.get(setting["label"].split("\n")[0])
            self.assertIsNotNone(readme_row, setting["label"])
            if setting["type"] == "checkbox":
                expected_default = "Enabled" if setting["defaultValue"] else "Disabled"
            elif setting["type"] == "string":
                expected_default = str(setting["defaultValue"])
            else:
                expected_default = next(
                    option["label"]
                    for option in setting["options"]
                    if option["value"] == setting["defaultValue"]
                )
                for option in setting["options"]:
                    self.assertIn(option["label"], readme_row.group(0))
            self.assertEqual(expected_default, readme_row.group("default"))
        self.assertIn("regular folders only", readme.lower())

        for required in (
            "Historical design baseline",
            "Zen 1.21.15b",
            "Firefox 154.0",
            "20260818101929",
            "cee4147767801299dec330c81318c01e5a39e6ec",
            "Current installed package inspection (read-only)",
            "Zen 1.21.16b",
            "Firefox/Gecko 154.0.1",
            "20260826035956",
            "70ca9ad3bc34170c4525f08dabafca8c69ae6b39",
            "2026-08-27 14:03:15",
            "Sine `engine.json`",
            "Sine 2.3.3.0",
            "Preference defaults",
            "context_zenFolderDelete",
            "context_zenFolderNewSubfolder",
            "createSubfolder()",
            "#initMoveTabToFolder()",
            "menuitem-iconic",
            "nsZenFolder.delete()",
            "gBrowser.removeTabGroup",
            "TabGroupRemoveRequested",
            "closedGroups",
            "skipSessionStore",
            "npm test",
            "python -m unittest tests.test_package -v",
        ):
            self.assertIn(required, verification)

        self.assertRegex(
            verification,
            r"did not activate Sine or show that Zen loaded the\s+mod",
        )

        self.assertRegex(
            verification,
            r"\| Current installed-source contract inspection \| PASS / observed \|",
        )
        pending_layers = (
            "Runtime activation and current-build compatibility",
            "Disposable-profile Sine activation and settings UI",
            "Disposable-profile SessionStore deletion and undo",
            "Disposable compatibility matrix",
            "Real-profile acceptance",
        )
        combined_documents = " ".join(f"{readme}\n{verification}".split())

        def assert_no_positive_claim(document, layer):
            escaped_layer = re.escape(layer)
            positive_status = r"(?:pass(?:ed)?|accepted|complete)"
            self.assertNotRegex(
                document,
                rf"(?i){escaped_layer}.{{0,120}}\b{positive_status}\b",
            )
            self.assertNotRegex(
                document,
                rf"(?i)\b{positive_status}\b.{{0,60}}{escaped_layer}",
            )

        for layer in pending_layers:
            self.assertRegex(
                verification,
                rf"\| {re.escape(layer)} \| PENDING \|",
            )
            assert_no_positive_claim(combined_documents, layer)

            # Keep the guard causal: prose overclaims outside the status table
            # must fail just as table overclaims do.
            for status in ("PASS", "accepted", "complete"):
                poisoned = f"{combined_documents} {layer} is {status}."
                with self.assertRaises(AssertionError):
                    assert_no_positive_claim(poisoned, layer)
