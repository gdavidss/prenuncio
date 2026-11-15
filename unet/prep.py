"""PRODES 10 m raster -> 100 m maps for the convolutional model. Runs on the training machine.

Each 100 m cell takes the majority class of its 10x10 pixels. Output in data/:
  cy.npy   uint8 [rows, cols]  year the cell was cleared minus 2000 (7 = up to 2007, 8..25), 0 if never
  lc.npy   uint8  0 forest domain (forest or cleared forest), 1 water, 2 natural non-forest, 3 outside
  res.npy  uint8  1 where the clearing was mapped late (residual): cleared from that year on, never a target
  ten.npy  uint8  0 none, 1 Indigenous land, 2 strict conservation unit, 3 sustainable use or APA
  d26.npy  uint8  1 where INPE's priority scenes show clearing in PRODES year 2026
The arrays are padded to a multiple of 5 cells so they nest in the 500 m grid of the tree model.
Run: python prep.py
"""
import glob
import json
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np
import rasterio
from rasterio.features import rasterize
from rasterio.windows import Window

DATA = Path(__file__).resolve().parent.parent / "data"
TIF = glob.glob(str(DATA / "raw/*.tif"))[0]
F = 10
CLASSES = list(range(7, 26)) + list(range(50, 66)) + [91, 100, 101, 255]
K = len(CLASSES)
LUT = np.full(256, K - 1, np.int64)
for i, v in enumerate(CLASSES):
    LUT[v] = i


def rows(job):
    r0, r1 = job
    with rasterio.Env(GDAL_CACHEMAX=64), rasterio.open(TIF) as ds:
        ncol = -(-ds.width // F)
        col = (np.arange(ds.width, dtype=np.int64) // F) * K
        out = np.empty((r1 - r0, ncol), np.uint8)
        for r in range(r0, r1):
            h = min(F, ds.height - r * F)
            idx = LUT[ds.read(1, window=Window(0, r * F, ds.width, h))] + col
            out[r - r0] = np.bincount(idx.ravel(), minlength=ncol * K).reshape(ncol, K).argmax(1)
    return r0, out


def main():
    with rasterio.open(TIF) as ds:
        nrow, ncol, tr = -(-ds.height // F), -(-ds.width // F), ds.transform
    R, C = -(-nrow // 5) * 5, -(-ncol // 5) * 5
    cls = np.full((R, C), K - 1, np.uint8)
    step = 100
    with ProcessPoolExecutor(16) as ex:
        for r0, block in ex.map(rows, [(r, min(r + step, nrow)) for r in range(0, nrow, step)]):
            cls[r0:r0 + len(block), :ncol] = block
    cy = np.zeros(K, np.uint8)
    cy[0:19] = np.arange(7, 26)       # 7 = up to 2007, then 2008..2025
    cy[19:35] = np.arange(10, 26)     # residuals 2010..2025
    lc = np.zeros(K, np.uint8)
    lc[35], lc[37], lc[38] = 1, 2, 3  # water, natural non-forest, outside
    res = np.zeros(K, np.uint8)
    res[19:35] = 1
    np.save(DATA / "cy.npy", cy[cls]); np.save(DATA / "lc.npy", lc[cls]); np.save(DATA / "res.npy", res[cls])

    import pyogrio
    from affine import Affine
    cell = tr.a * F
    T = Affine(cell, 0, tr.c, 0, -cell, tr.f)
    shp = lambda pat: pyogrio.read_dataframe(glob.glob(str(DATA / "raw" / pat))[0])
    ti, uc = shp("indigenous*.shp"), shp("conservation*.shp")
    import pandas as pd
    uc = uc[pd.to_numeric(uc.ano_cria, errors="coerce").fillna(1990) <= 2010].sort_values("grupo", ascending=False)  # none newer than the first target year
    shapes = [(g, 3 if grp != "PI" else 2) for g, grp in zip(uc.geometry, uc.grupo)] + [(g, 1) for g in ti.geometry]
    np.save(DATA / "ten.npy", rasterize(shapes, out_shape=(R, C), transform=T, fill=0, dtype="uint8"))
    pri = shp("yearly_deforestation_2026*.shp")
    np.save(DATA / "d26.npy", rasterize([(g, 1) for g in pri.geometry if g is not None], out_shape=(R, C), transform=T, fill=0, dtype="uint8"))
    json.dump({"west": tr.c, "north": tr.f, "cell": cell, "rows": R, "cols": C}, open(DATA / "grid100.json", "w"))

    # self-check: clearing in 2022 must match INPE's own report (12,690 km2) within the majority-rule error
    c = np.load(DATA / "cy.npy", mmap_mode="r")
    lat = tr.f - cell * (np.arange(R) + 0.5)
    km2 = ((np.asarray(c) == 22) & (np.load(DATA / "res.npy", mmap_mode="r") == 0)).sum(1) * (cell * 110.57) * (cell * 111.32 * np.cos(np.radians(lat)))
    print("2022 clearing at 100 m:", round(km2.sum()), "km2 (INPE 12,690)")
    assert abs(km2.sum() / 12690 - 1) < 0.05


if __name__ == "__main__":
    main()
