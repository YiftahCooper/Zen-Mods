"""Adopt local glyphs from Microsoft's Fluent UI System Icons (MIT).

Downloads each 20 px regular SVG listed in import-cmi.py's FLUENT_GLYPHS at the
pinned revision, checks its original SHA-256, and writes the adopted file to
assets/packs/fluent/<id>.svg: the same single-colour outline, drawn at 16 px
and filled with #667b91 like the CMI Fluent files. Run it with --write only to
add or refresh a glyph; tools/import-cmi.py verifies the adopted bytes.
"""
import argparse, hashlib, re, sys, urllib.parse, urllib.request
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
import importlib.util
spec = importlib.util.spec_from_file_location("import_cmi", ROOT / "tools" / "import-cmi.py")
importer = importlib.util.module_from_spec(spec); spec.loader.exec_module(importer)

SVG = "{http://www.w3.org/2000/svg}"

def adopt(original):
    text = original.decode("utf-8")
    if re.search(r"<!DOCTYPE|<!ENTITY|<script\b|<foreignObject\b|\bon\w+\s*=|url\(|href", text, re.I):
        raise ValueError("Unexpected SVG content")
    root = ET.fromstring(text)
    if root.get("viewBox") != "0 0 20 20" or root.tag != SVG + "svg":
        raise ValueError("Unexpected SVG frame")
    paths = []
    for node in root:
        if node.tag != SVG + "path" or set(node.attrib) - {"d", "fill"} or not node.get("d"):
            raise ValueError("Only plain single-colour paths are adopted")
        paths.append(node.get("d"))
    body = "".join(f'  <path d="{d}"/>\n' for d in paths)
    return ('<svg width="16" height="16" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg" '
            f'fill="#667b91" fill-opacity="1">\n{body}</svg>\n').encode("utf-8")

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--write", action="store_true", help="Write adopted files (default: verify only)")
    args = parser.parse_args()
    failures = 0
    for icon_id, glyph in importer.FLUENT_GLYPHS.items():
        url = ("https://raw.githubusercontent.com/microsoft/fluentui-system-icons/"
               f"{importer.FLUENT_REVISION}/{urllib.parse.quote(glyph['file'])}")
        original = urllib.request.urlopen(url, timeout=30).read()
        if hashlib.sha256(original).hexdigest() != glyph["originalSha256"]:
            print(f"{icon_id}: original hash differs ({hashlib.sha256(original).hexdigest()})"); failures += 1; continue
        adopted = adopt(original)
        digest = hashlib.sha256(adopted).hexdigest()
        target = ROOT / "assets" / "packs" / "fluent" / f"{icon_id}.svg"
        if args.write:
            target.write_bytes(adopted)
        state = "ok" if digest == glyph["sha256"] else f"adopted hash {digest}"
        if digest != glyph["sha256"]: failures += 1
        print(f"{icon_id}: {state}")
    return 1 if failures else 0

if __name__ == "__main__":
    raise SystemExit(main())
