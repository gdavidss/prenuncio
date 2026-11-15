"""Aggregate the 10 m PRODES raster to the model grid (F x F pixels per cell, see az.py).

Output in the grid folder:
  counts.npy  uint16 [len(CLASSES), rows, cols]  pixels of each PRODES class per cell
  grid.json   west, north, cell size in degrees, rows, cols, classes
Run: .venv/bin/python -I pipeline/grid.py          (AZ_F=50 for the 500 m grid)
"""
import glob
import json
import sys
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np
import rasterio
from rasterio.windows import Window

sys.path.insert(0, str(Path(__file__).resolve().parent))
from az import F, GRID, ROOT  # noqa: E402

# 7 = cleared up to 2007, 8..25 = cleared in PRODES year 2008..2025, 50..65 = residual 2010..2025
# (older clearing mapped late), 91 water, 100 forest, 101 natural non-forest, 255 outside
CLASSES = list(range(7, 26)) + list(range(50, 66)) + [91, 100, 101, 255]
K = len(CLASSES)
LUT = np.full(256, K - 1, np.int64)  # anything unexpected counts as "outside"
for i, v in enumerate(CLASSES):
    LUT[v] = i


def raster_path():
    return glob.glob(str(ROOT / "data/raw/prodes_raster/*.tif"))[0]


def grid_shape():
    with rasterio.open(raster_path()) as ds:
        return -(-ds.height // F), -(-ds.width // F), ds.transform


def _rows(args):
    r0, r1 = args
    out = []
    with rasterio.Env(GDAL_CACHEMAX=32), rasterio.open(raster_path()) as ds:
        ncol = -(-ds.width // F)
        col = (np.arange(ds.width, dtype=np.int64) // F) * K
        # ponytail: buffers are allocated once and reused. On a 16 GB Mac under memory pressure,
        # fresh 50 MB arrays per read made the kernel page-fault the job to a crawl.
        S = 20  # raster rows per read
        buf, idx = np.empty((S, ds.width), np.uint8), np.empty((S, ds.width), np.int64)
        for r in range(r0, r1):
            acc = np.zeros(ncol * K, np.int64)
            end = min((r + 1) * F, ds.height)
            for y in range(r * F, end, S):
                h = min(S, end - y)
                ds.read(1, window=Window(0, y, ds.width, h), out=buf[:h])
                np.take(LUT, buf[:h], out=idx[:h])
                idx[:h] += col  # broadcast over the rows
                acc += np.bincount(idx[:h].ravel(), minlength=ncol * K)
            out.append(acc.astype(np.uint16).reshape(ncol, K))
    return r0, np.stack(out)


def main():
    nrow, ncol, tr = grid_shape()
    GRID.mkdir(parents=True, exist_ok=True)
    # written straight to disk, one class per plane, so later steps can map a single plane
    counts = np.lib.format.open_memmap(GRID / "counts.npy", "w+", np.uint16, (K, nrow, ncol))
    step = 20
    jobs = [(r, min(r + step, nrow)) for r in range(0, nrow, step)]
    with ProcessPoolExecutor(6) as ex:
        for n, (r0, block) in enumerate(ex.map(_rows, jobs)):
            counts[:, r0:r0 + len(block)] = block.transpose(2, 0, 1)
            if n % 20 == 0:
                print(f"{r0}/{nrow}", flush=True)
    counts.flush()
    json.dump({"west": tr.c, "north": tr.f, "cell": tr.a * F, "rows": nrow, "cols": ncol, "classes": CLASSES},
              open(GRID / "grid.json", "w"))
    # self-check against INPE's own category report shipped with the raster (km2 per class)
    lat = tr.f + tr.e * F * (np.arange(nrow) + 0.5)
    px_km2 = (tr.a * 111.32 * np.cos(np.radians(lat))) * (-tr.e * 110.57)  # one 10 m pixel, by row
    for c, ref in [(100, 3_081_400), (7, 718_469), (25, 5_257), (22, 12_690)]:
        km2 = (counts[CLASSES.index(c)].sum(axis=1, dtype=np.int64) * px_km2).sum()
        print(f"class {c}: {km2:,.0f} km2 vs INPE {ref:,}")
        assert abs(km2 / ref - 1) < 0.005, c


if __name__ == "__main__":
    main()
