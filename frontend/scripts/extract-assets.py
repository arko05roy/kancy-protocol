"""Cut the artwork out of the brand boards into transparent PNGs (white ink, alpha = brightness).

Run from frontend/:  python3 scripts/extract-assets.py   (needs Pillow)
"""
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "frontend/public/art"

# name: (board, box, [regions to erase, in board coordinates])
CROPS = {
    "logo": ("k3", (52, 26, 322, 218), []),
    "globe": ("k3", (165, 242, 645, 522), []),
    "acropolis": ("k3", (28, 495, 672, 744), []),
    "mountains": ("k2", (26, 632, 850, 746), [(405, 695, 450, 730)]),
    "column": ("k3", (1178, 556, 1360, 729), []),
    "clouds": ("k3", (1410, 515, 1631, 731), []),
    "torii": ("k1", (1064, 743, 1431, 906), []),
    "pillar": ("k1", (1478, 575, 1672, 941), [(1478, 640, 1496, 676)]),
    "planet": ("k1", (1458, 434, 1672, 568), []),
    "orbit": ("k3", (715, 556, 1068, 724), []),
    "galaxy": ("k2", (1142, 816, 1252, 972), []),
}
BLACK, WHITE = 22, 225  # levels: board background -> transparent, ink -> opaque

OUT.mkdir(parents=True, exist_ok=True)
for name, (board, box, erase) in CROPS.items():
    img = Image.open(ROOT / f"brand-assets/{board}.png").convert("L")
    draw = ImageDraw.Draw(img)
    for r in erase:
        draw.rectangle(r, fill=0)
    alpha = img.crop(box).point(lambda v: max(0, min(255, (v - BLACK) * 255 // (WHITE - BLACK))))
    art = Image.new("RGBA", alpha.size, (244, 244, 242, 0))
    art.putalpha(alpha)
    art.save(OUT / f"{name}.png", optimize=True)
    print(name, art.size)
