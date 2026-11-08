"""Regenerate adopted SVG packs/catalogue from the pinned source ZIP."""
import argparse, hashlib, json, re, sys, zipfile
from pathlib import Path
import xml.etree.ElementTree as ET

REVISION = "71750239d6fd114800989d91f2567cd4c47635e9"
ROOT = Path(__file__).resolve().parent.parent

def digest(data):
    return hashlib.sha256(data).hexdigest()

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
            output["packs"].append(pack)
            output["mappings"][pack_id]={"byId":by_id,"byL10n":by_l10n}
    output["transformation"]="Fluent SVG context-fill/context-stroke replaced by #667b91; contextual opacity replaced by 1. Zen artwork referenced from the installed browser, not copied."
    (ROOT/"assets"/"catalog.json").write_text(json.dumps(output,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(f"Catalogued {sum(len(p['icons']) for p in output['packs'])} icons; {sum(len(m['byId']) for m in output['mappings'].values())} ID mappings.")

if __name__=="__main__":
    parser=argparse.ArgumentParser()
    parser.add_argument("archive",nargs="?",default=str(ROOT/".backup-scratch/upstream/cmi-71750239.zip"))
    args=parser.parse_args()
    build(args.archive)
