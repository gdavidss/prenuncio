"""Hansen Global Forest Change loss year (30 m, calendar years 2001..2025) summed onto the 500 m
model grid. Runs on the training machine, next to Google's bucket. It sees small openings, logging
roads and burned forest that PRODES does not map as clear-cut, which is the point of adding it.

Output data/hansen500.npz: loss uint16 [25, rows, cols], pixels lost per cell in each year 2001..2025
(a 500 m cell holds 18 x 18 = 324 Hansen pixels).
With the argument "100" it writes data/hb.npy instead, for the convolutional model: int32 on the
100 m grid, bit y-2001 set when any pixel of the cell was lost in calendar year y.
Run: python hansen.py [100]
"""
import json
import sys
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np
import rasterio
from rasterio.windows import Window

DATA = Path(__file__).resolve().parent.parent / "data"
G = json.load(open(DATA / "grid100.json"))
BITS = sys.argv[1:] == ["100"]
W, N, C = G["west"], G["north"], G["cell"] * (1 if BITS else 5)
NROW, NCOL = (G["rows"], G["cols"]) if BITS else (G["rows"] // 5, G["cols"] // 5)
URL = "/vsicurl/https://storage.googleapis.com/earthenginepartners-hansen/GFC-2025-v1.13/Hansen_GFC-2025-v1.13_lossyear_{}_{}.tif"
TILES = [(la, lo) for la in ("10N", "00N", "10S") for lo in ("080W", "070W", "060W", "050W")]
PX = 0.00025


def tile(t):
    la, lo = t
    top = int(la[:2]) * (1 if la[2] == "N" else -1)
    left = -int(lo[:3])
    r0, r1 = max(0, int((N - top) / C)), min(NROW, int((N - (top - 10)) / C) + 1)
    c0, c1 = max(0, int((left - W) / C)), min(NCOL, int((left + 10 - W) / C) + 1)
    out = np.zeros((r1 - r0, c1 - c0), np.int32) if BITS else np.zeros((26, r1 - r0, c1 - c0), np.uint16)
    if r1 <= r0 or c1 <= c0:
        return r0, c0, out if BITS else out[1:]
    with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR"), rasterio.open(URL.format(la, lo)) as ds:
        col = np.floor((left + (np.arange(ds.width) + 0.5) * PX - W) / C).astype(np.int64) - c0
        okc = (col >= 0) & (col < c1 - c0)
        step = 2000
        for y in range(0, ds.height, step):
            a = ds.read(1, window=Window(0, y, ds.width, min(step, ds.height - y)))
            row = np.floor((N - (top - (y + np.arange(a.shape[0]) + 0.5) * PX)) / C).astype(np.int64) - r0
            okr = (row >= 0) & (row < r1 - r0)
            if not okr.any() or not a.any():
                continue
            a, row = a[okr][:, okc], row[okr]
            yy, xx = np.nonzero(a)  # loss pixels only, a small share of the tile
            if BITS:
                cell, yr = row[yy] * (c1 - c0) + col[okc][xx], a[yy, xx]
                flat = out.reshape(-1)
                for y in np.unique(yr):
                    flat[cell[yr == y]] |= np.int32(1 << (int(y) - 1))
                continue
            idx = (a[yy, xx].astype(np.int64) * (r1 - r0) + row[yy]) * (c1 - c0) + col[okc][xx]
            out += np.bincount(idx, minlength=out.size).reshape(out.shape).astype(np.uint16)
    return r0, c0, out if BITS else out[1:]


def main():
    if BITS:
        hb = np.zeros((NROW, NCOL), np.int32)
        with ProcessPoolExecutor(6) as ex:
            for r0, c0, block in ex.map(tile, TILES):
                hb[r0:r0 + block.shape[0], c0:c0 + block.shape[1]] |= block
        np.save(DATA / "hb.npy", hb)
        share = [(hb >> b & 1).mean() for b in (15, 21, 23)]  # 2016, 2022, 2024
        print("share of 100 m cells with loss in 2016, 2022, 2024:", [round(float(x), 4) for x in share])
        assert all(0.0005 < x < 0.2 for x in share)
        return
    loss = np.zeros((25, NROW, NCOL), np.uint16)
    with ProcessPoolExecutor(12) as ex:
        for (r0, c0, block), t in zip(ex.map(tile, TILES), TILES):
            loss[:, r0:r0 + block.shape[1], c0:c0 + block.shape[2]] += block
            print(t, "loss pixels", int(block.sum(dtype=np.int64)), flush=True)
    np.savez_compressed(DATA / "hansen500.npz", loss=loss)
    lat = N - (np.arange(NROW) + 0.5) * C
    km2 = (loss.sum(2, dtype=np.int64) * (PX * 110.57) * (PX * 111.32 * np.cos(np.radians(lat)))).sum(1)
    print("km2 of Hansen loss in the grid box by year:", {2001 + i: round(float(v)) for i, v in enumerate(km2)})
    assert 5_000 < km2[21] < 80_000  # 2022: PRODES alone maps 12,690 km2 in the Legal Amazon; Hansen sees more


if __name__ == "__main__":
    main()
