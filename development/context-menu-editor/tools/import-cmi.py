"""Regenerate adopted SVG packs/catalogue from the pinned source ZIP."""
import argparse, hashlib, json, re, sys, zipfile
from pathlib import Path
import xml.etree.ElementTree as ET

REVISION = "71750239d6fd114800989d91f2567cd4c47635e9"
ROOT = Path(__file__).resolve().parent.parent

def digest(data):
    return hashlib.sha256(data).hexdigest()

# Local additions, not from CMI. Fluent glyphs are adopted from Microsoft's
# Fluent UI System Icons (MIT, licenses/FluentUI-System-Icons-MIT.txt) by
# tools/adopt-fluent.py: the 20 px regular outline, recoloured like the other
# Fluent assets and drawn at 16 px. ZenUI entries reference artwork the
# installed browser already ships; nothing is copied. A missing browser
# resource falls back to the Fluent file with the same ID.
FLUENT_REVISION = "e15fc0de25fab983e3e42bac8798be69a85c23bf"
FLUENT_GLYPHS = {
    "qr-code": {"label":"QR code", "file":"assets/QR Code/SVG/ic_fluent_qr_code_20_regular.svg",
                "originalSha256":"69f9c0a55a5362e7299af893426f5096156c6ad459f02642a53f5b325284b55a",
                "sha256":"34ced1ba5650d68abd7c022ed0e13e7a856d77e71c35c0836d1d8f3b6d22f790"},
    "comment": {"label":"Comment", "file":"assets/Comment/SVG/ic_fluent_comment_20_regular.svg",
                "originalSha256":"553257ec69c1337652f6627c7901dec1cd263483c9f04ae669f074353c65bccb",
                "sha256":"92f83c395b99f6f8bb2d7beaef78bedc827e568dcafabb59451fdfafc5f972c5"},
    "highlight": {"label":"Highlight", "file":"assets/Highlight/SVG/ic_fluent_highlight_20_regular.svg",
                  "originalSha256":"32a83b8b6ecfc870fd1b633dfaa0a997128f7d3fe168affec723045a29f71d0d",
                  "sha256":"f5131100958ffe9ce8dff44f0222c425cd1639b8050813091b14d6dee0c67a60"},
}
# Zen ships no unload, AI, sort, comment or highlight glyph under these names;
# these are the closest artwork it does ship (moon for a sleeping tab, sparkles
# as Zen uses for its own AI-style actions, the filter bars for sorting).
ZEN_SKIN = "chrome://browser/skin/zen-icons/"
ZEN_REFERENCES = {
    "qr-code": "chrome://browser/content/sharing/qr-code.svg",
    "unloadTab": ZEN_SKIN + "selectable/moon.svg",
    "AI-chat": ZEN_SKIN + "sparkles.svg",
    "AI-summarize": ZEN_SKIN + "sparkles.svg",
    "sort": ZEN_SKIN + "circle-bars-filter.svg",
    "comment": ZEN_SKIN + "selectable/chat.svg",
    "highlight": ZEN_SKIN + "paintbrush.svg",
}
# Exact mappings added to both packs (pack-specific values where they differ).
LOCAL_BY_L10N = {
    # SharingUtils' ID-less Share rows (Gecko 159+ dropped their artwork, Firefox bug 2009747).
    "menu-share-copy-links":"link", "menu-file-share-qrcode3":"qr-code", "menu-share-windows":"share",
    # The ID-less container submenu actions under their current Fluent IDs (CMI maps the older ones).
    "user-context-add-container2":"container-tab", "user-context-manage-containers2":"manage",
}
def both(icon_id): return icon_id
LOCAL_BY_ID = {
    # Zen has these glyphs under another ID, or now through ZEN_REFERENCES.
    **{key:{"zen":"unloadTab"} for key in ("context_unloadTab","context_zenUnloadWorkspace",
        "context_zenFolderUnloadAll","context_zenUnloadAllOtherWorkspace")},
    "context_askChat":{"zen":"AI-chat"}, "context-ask-chat":{"zen":"AI-chat"},
    "toolbar-context-customize":{"zen":"customize"}, "toolbar-context-customize-sidebar":{"zen":"customize"},
    "zen-toolbar-context-tabs-right":{"zen":"sidebar-right"}, "sidebar-reverse-position":{"zen":"sidebar-right"},
    "BMB_viewBookmarksSidebar":{"zen":"sidebar"}, "PanelUI-historyMore":{"zen":"manage"},
    "context_zenSpaceRoutingSettings":{"zen":"settings"},
    # Tab menu.
    "context_moveTabToGroupNewGroup":{"fluent":"TabGroup-add","zen":"plus"},
    "context_moveTabToSavedGroup":both("history"),
    "context_ungroupSplitView":{"fluent":"TabGroup-remove","zen":"remove-tab"},
    "context_askChatSummarize":both("AI-summarize"), "context_createAITab":both("AI-chat"),
    "context_moveToStart":both("arrow-up"), "context_moveToEnd":both("arrow-down"),
    "context_fullscreenAutohide":both("fullscreen"), "context_fullscreenExit":both("fullscreen-exit"),
    # Page menu.
    "context-bookmarkpage":both("bookmark-hollow"), "context-viewsource-goToLine":both("search-page"),
    "spell-undo-add-to-dictionary":both("edit-undo"), "context-viewimagedesc":both("info"),
    "use-relay-mask":both("mail"), "context-pdfjs-comment-selection":both("comment"),
    "context-pdfjs-highlight-selection":both("highlight"), "context-reveal-password":both("passwords"),
    "context-use-mini-window":both("popup"), "context-create-aitab":both("AI-chat"),
    "context-showonlythisframe":both("window"), "context-viewframeinfo":both("info"),
    "context-media-eme-learnmore":both("help"),
    # Bookmarks menu (CMI's selectors escape the colons, which the importer cannot read).
    "placesContext_openBookmarkContainer:tabs":both("tab"), "placesContext_openBookmarkLinks:tabs":both("tab"),
    "placesContext_show_bookmark:info":both("edit"), "placesContext_deleteBookmark":both("edit-delete"),
    "placesContext_sortBy:name":both("sort"), "placesContext_new:folder":{"fluent":"folder-add","zen":"folder"},
    "placesContext_showAllBookmarks":both("library"),
    # Folder and Space menus.
    "context_zenLiveFolderOptions":both("settings"), "better-zen-folders-sticky-folder":both("pin"),
    "context_zenManageWorkspaces":both("manage"),
    # Toolbar menu.
    "toolbar-context-manage-extension":both("extension"), "toolbar-context-report-extension":both("report"),
    "toolbar-context-toggle-vertical-tabs":both("sidebar"), "toolbar-context-move-to-panel":both("pin"),
    "toolbar-context-autohide-downloads-button":both("downloads"),
    "toolbar-context-always-open-downloads-panel":both("downloads"),
    "toolbar-context-always-show-extensions-button":both("extension"), "toolbar-context-pin-to-toolbar":both("pin"),
    "toolbar-context-full-screen-autohide":both("fullscreen"), "toolbar-context-full-screen-exit":both("fullscreen-exit"),
    "zen-context-menu-compact-mode":both("sidebar"), "zen-toolbar-context-set-profile":both("container-tab"),
}

def local_icons(pack_id, existing):
    icons = []
    for icon_id, glyph in FLUENT_GLYPHS.items():
        if icon_id in existing: raise ValueError("Local glyph shadows CMI: " + icon_id)
        words = re.sub(r"([a-z])([A-Z])", r"\1 \2", icon_id).replace("-", " ").lower()
        entry = {"id":icon_id, "label":glyph["label"], "tags":words.split()}
        if pack_id == "zen":
            if icon_id in ZEN_REFERENCES:
                icons.append({**entry, "browserPath":ZEN_REFERENCES[icon_id]})
            continue
        path = f"assets/packs/fluent/{icon_id}.svg"
        if digest((ROOT/path).read_bytes()) != glyph["sha256"]:
            raise ValueError("Unexpected local Fluent asset: " + icon_id)
        icons.append({**entry, "path":path, "sha256":glyph["sha256"], "originalSha256":glyph["originalSha256"],
                      "source":{"repository":"https://github.com/microsoft/fluentui-system-icons",
                                "revision":FLUENT_REVISION, "file":glyph["file"]}})
    for icon_id, uri in ZEN_REFERENCES.items():
        if pack_id == "zen" and icon_id not in FLUENT_GLYPHS:
            if icon_id in existing: raise ValueError("Local reference shadows CMI: " + icon_id)
            icons.append({"id":icon_id, "label":icon_id.replace("-", " ").capitalize(), "tags":icon_id.split("-"), "browserPath":uri})
    for uri in ZEN_REFERENCES.values():
        if not re.fullmatch(r"chrome://browser/(?:skin|content/sharing)/(?:[A-Za-z0-9_-]+/)*[A-Za-z0-9_-]+\.svg", uri):
            raise ValueError("Unexpected browser icon URI")
    return icons

def local_mapping(table, pack_id):
    """Exact local mappings for one pack; a dict value names per-pack choices."""
    return {key:(value.get(pack_id) if isinstance(value, dict) else value) for key, value in table.items()
            if not isinstance(value, dict) or pack_id in value}

def adopt_svg(data):
    text = data.decode("utf-8")
    if re.search(r"<!DOCTYPE|<!ENTITY|<script\b|<foreignObject\b|\bon\w+\s*=", text, re.I):
        raise ValueError("Active SVG content")
    element = ET.fromstring(text)
    for node in element.iter():
        for attribute, value in node.attrib.items():
            if attribute.rsplit("}",1)[-1] in {"href", "src"} and not value.startswith("#"):
                raise ValueError("External SVG reference")
            if re.search(r"url\(\s*['\"]?(?!#)", value, re.I):
                raise ValueError("External CSS reference")
    # Native context paint cannot be inherited by the HTML gallery. A neutral
    # fallback also supplies the alpha mask used for theme-colored menu icons.
    text = text.replace("context-fill-opacity", "1").replace("context-stroke-opacity", "1")
    text = text.replace("context-fill", "#667b91").replace("context-stroke", "#667b91")
    return text.encode("utf-8")

def build(archive):
    archive = Path(archive).resolve()
    output = {"revision":REVISION, "archiveSha256":digest(archive.read_bytes()), "packs":[], "mappings":{}, "unresolvedReferences":[]}
    browser_icons=json.loads((ROOT/"assets/zen-browser-icons.json").read_text(encoding="utf-8"))
    output["zenBrowserReference"]=browser_icons["verifiedBrowser"]
    with zipfile.ZipFile(archive) as z:
        prefix = f"Context-Menu-Icons-{REVISION}/"
        if prefix+"LICENSE" not in z.namelist():
            raise ValueError("Wrong source archive identity")
        license_bytes=z.read(prefix+"LICENSE")
        license_path=ROOT/"licenses"/"Context-Menu-Icons-MIT.txt"
        license_path.parent.mkdir(parents=True,exist_ok=True)
        license_path.write_bytes(license_bytes)
        for pack_id, source_dir, label in [("fluent","FluentUI","FluentUI"),("zen","ZenUI","ZenUI")]:
            source_prefix=prefix+f"CMI/{source_dir}/"
            pack={"id":pack_id,"label":label,"icons":[]}
            for path in sorted(n for n in z.namelist() if n.startswith(source_prefix) and n.endswith(".svg")):
                relative=path[len(source_prefix):]
                if "/" in relative or not re.fullmatch(r"[A-Za-z0-9_.-]+\.svg",relative):
                    raise ValueError("Unexpected asset path")
                original=z.read(path)
                target=f"assets/packs/{pack_id}/{relative}"
                icon_id=relative[:-4]
                words=re.sub(r"([a-z])([A-Z])",r"\1 \2",icon_id).replace("-"," ").replace("_"," ").lower()
                entry={"id":icon_id,"label":words.capitalize(),"tags":words.split()}
                if pack_id=="zen":
                    uri=browser_icons["icons"][icon_id]
                    if not uri.startswith("chrome://browser/skin/") or not uri.endswith(".svg") or ".." in uri:
                        raise ValueError("Unexpected browser icon URI")
                    entry.update(browserPath=uri)
                else:
                    adopted=adopt_svg(original)
                    destination=ROOT/target
                    destination.parent.mkdir(parents=True,exist_ok=True)
                    destination.write_bytes(adopted)
                    entry.update(path=target,sha256=digest(adopted),originalSha256=digest(original))
                pack["icons"].append(entry)
            ids={icon["id"] for icon in pack["icons"]}
            css=z.read(source_prefix+f"{source_dir.split('UI')[0]}-icons.css").decode("utf-8")
            css=re.sub(r"/\*.*?\*/","",css,flags=re.S)
            by_id,by_l10n={},{}
            aliases={"sidebars-right":"sidebar-right","edit-theme":"color"} if pack_id=="fluent" else {"new-tab":"plus"}
            for block in re.finditer(r"([^{}]+)\{([^{}]*)\}",css,re.S):
                selectors,body=block.groups()
                image=re.search(r"--menu-image\s*:\s*url\(\s*['\"]?([^)'\"]+)['\"]?\s*\)",body)
                if not image or "/" in image.group(1) or not image.group(1).endswith(".svg"):
                    continue
                icon_id=image.group(1)[:-4]
                if icon_id not in ids:
                    replacement=aliases.get(icon_id)
                    output["unresolvedReferences"].append({"pack":pack_id,"requested":icon_id,"replacement":replacement})
                    if replacement not in ids:continue
                    icon_id=replacement
                # Exact first ID selectors only: do not accidentally use an ID
                # from :not(), an ancestor or a descendant of another widget.
                for selector in selectors.split(","):
                    selector=selector.strip()
                    match=re.match(r"^#([A-Za-z0-9_-]+)(?=\s*$|[:\[])",selector)
                    if match and not re.search(r"[>+~]|\s+#",selector):
                        by_id[match.group(1)]=icon_id
                    for match in re.finditer(r"\[data-l10n-id=['\"]([^'\"]+)['\"]\]",selector):
                        by_l10n[match.group(1)]=icon_id
            # Flattened navigation keeps its own semantic icons in either pack.
            by_id.update({"context-back":"arrow-left","context-forward":"arrow-right",
                          "context-reload":"reload","context-stop":"close",
                          "context_zenMoveToFolder":"folder-open" if pack_id=="fluent" else "folder",
                          "better-zen-folders-move-space":"move-tab"})
            # SharingUtils' Share submenu has no ID; its localization ID is stable.
            by_l10n.setdefault("tab-context-share-url","share")
            # Local glyphs and exact mappings for rows CMI does not cover.
            pack["icons"].extend(local_icons(pack_id, ids))
            by_id.update(local_mapping(LOCAL_BY_ID, pack_id))
            by_l10n.update(local_mapping(LOCAL_BY_L10N, pack_id))
            output["packs"].append(pack)
            output["mappings"][pack_id]={"byId":by_id,"byL10n":by_l10n}
    output["localAdditions"]={"fluentGlyphs":sorted(FLUENT_GLYPHS),"zenReferences":sorted(ZEN_REFERENCES)}
    output["transformation"]="Fluent SVG context-fill/context-stroke replaced by #667b91; contextual opacity replaced by 1. Zen artwork referenced from the installed browser, not copied."
    (ROOT/"assets"/"catalog.json").write_text(json.dumps(output,ensure_ascii=False,indent=2)+"\n",encoding="utf-8",newline="\n")
    print(f"Catalogued {sum(len(p['icons']) for p in output['packs'])} icons; {sum(len(m['byId']) for m in output['mappings'].values())} ID mappings.")

if __name__=="__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("archive",nargs="?",default=str(ROOT/".backup-scratch/upstream/cmi-71750239.zip"))
    args=parser.parse_args()
    build(args.archive)
