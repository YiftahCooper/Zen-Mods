"""Generate reproducible raster fixtures with Pillow; never download artwork."""
from pathlib import Path
from PIL import Image
import json

target = Path(__file__).resolve().parents[2] / ".backup-scratch/native-image-fixtures/Format Pack"
images = target / "Formats"
images.mkdir(parents=True, exist_ok=True)
for extension in ["png", "jpg", "jpeg", "webp", "avif", "ico"]:
    size = (32, 32) if extension == "ico" else (60, 20)
    image = Image.new("RGB", size, "#ff9000")
    image.save(images / ("format-test." + extension))
(images / "corrupt.png").write_bytes(b"not a real PNG")
(images / "Category Icon.png").write_bytes(b"not a real PNG")
(target / "icons.json").write_text(json.dumps({"$categories": {"Formats": {"icon": "🎨"}}}), encoding="utf-8")
print(target.parent)
