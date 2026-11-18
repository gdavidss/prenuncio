"""Half-resolution copies of the big 500 m rasters, for phones. A 5180 x 6664 image is 34 megapixels, more than
a phone browser will decode without killing the page (iOS caps a canvas near 16.7). For each web/data/p<year>.png
and f<year>.png this writes <name>_h.png at 2590 x 3332 (1 km):
  p: the mean chance of the four cells, in the same coding (255 * sqrt(chance), 0 = no forest in any of them)
  f: the same codes as the full file (85 * (flag + 2 * cleared)), a bit set when any of the four cells has it
Run after calibrate.py and export.py: .venv/bin/python -I pipeline/lowres.py
"""
from pathlib import Path

import numpy as np
import rasterio

W = Path(__file__).resolve().parent.parent / "web/data"


def save(a, f):
    with rasterio.open(f, "w", driver="PNG", width=a.shape[1], height=a.shape[0], count=1, dtype="uint8") as ds:
        ds.write(a, 1)
    for aux in f.parent.glob(f.name + ".aux.xml"):
        aux.unlink()


for f in sorted(W.glob("[pf]20[0-9][0-9].png")):
    a = rasterio.open(f).read(1)
    q = a.reshape(a.shape[0] // 2, 2, a.shape[1] // 2, 2)
    if f.name[0] == "p":
        forest = (q > 0)
        mean = ((q.astype(np.float32) / 255) ** 2).sum((1, 3)) / np.maximum(forest.sum((1, 3)), 1)
        out = np.where(forest.any((1, 3)), np.maximum(np.round(255 * np.sqrt(mean)), 1), 0).astype(np.uint8)
    else:
        code = (q // 85).astype(np.uint8)
        out = (85 * ((code & 1).max((1, 3)) + 2 * ((code >> 1) & 1).max((1, 3)))).astype(np.uint8)
    save(out, f.with_name(f.stem + "_h.png"))
    print(f.name, "->", out.shape, f.with_name(f.stem + "_h.png").stat().st_size // 1024, "KB")
