"""GLAD Sentinel-2 forest disturbance alerts (10 m, from 2019) counted onto the 500 m model grid.
Runs on the training machine. These alerts catch openings of a few pixels, logging roads included,
weeks after they happen, long before a clear-cut large enough for PRODES exists.

Each pixel holds the day of its alert, counted from 31 Dec 2018. For every 31 July from 2020 to 2026
this writes how many pixels of each cell alerted in the 12 months and in the 3 months before it.
Output data/glad500.npz: g12, g3 uint16 [7, rows, cols] (a 500 m cell holds 45 x 45 = 2025 pixels).
With the argument "100" it writes data/gb4.npy for the convolutional model instead: int32 on the 100 m
grid, four bits per 31 July (2020 first): two for how many of the cell's 100 pixels alerted in the
12 months before (0, 1-5, 6-30, more), one for any alert in the last 3 months, one for the last month.
(The first U-Net runs used an older three-bit file, gb.npy, without the last-month bit.)
Run: python glad.py [100 | wide]   ("wide" writes glad500wide.npz with windows of 730, 365, 183, 92 and 31 days)
"""
import datetime
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
URL = "/vsicurl/https://storage.googleapis.com/earthenginepartners-hansen/S2alert/alertDate/{}.tif"
TILES = [f"{lo:03d}W_{s}_{lo - 10:03d}W_{n}" for lo in (80, 70, 60, 50) for s, n in (("00N", "10N"), ("10S", "00N"), ("20S", "10S"))]
PX = 0.0001
ORIGINS = [(datetime.date(y, 7, 31) - datetime.date(2018, 12, 31)).days for y in range(2020, 2027)]
SPANS = {"wide": (730, 365, 183, 92, 31), "100": (365, 92, 31)}.get(sys.argv[1] if len(sys.argv) > 1 else "", (365, 92))  # days before each 31 July


def tile(name):
    left, top = -int(name[:3]), {"10N": 10, "00N": 0, "10S": -10}[name.split("_")[3]]
    r0, r1 = max(0, int((N - top) / C)), min(NROW, int((N - (top - 10)) / C) + 1)
    c0, c1 = max(0, int((left - W) / C)), min(NCOL, int((left + 10 - W) / C) + 1)
    out = np.zeros((len(SPANS), len(ORIGINS), r1 - r0, c1 - c0), np.uint8 if BITS else np.uint16)
    if r1 <= r0 or c1 <= c0:
        return r0, c0, pack(out) if BITS else out
    n = (r1 - r0) * (c1 - c0)
    with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR"), rasterio.open(URL.format(name)) as ds:
        col = np.floor((left + (np.arange(ds.width) + 0.5) * PX - W) / C).astype(np.int64) - c0
        okc = (col >= 0) & (col < c1 - c0)
        step = 1000
        for y in range(0, ds.height, step):
            row = np.floor((N - (top - (y + np.arange(step) + 0.5) * PX)) / C).astype(np.int64) - r0
            okr = (row >= 0) & (row < r1 - r0)
            if not okr.any():
                continue
            a = ds.read(1, window=Window(0, y, ds.width, step))[okr][:, okc]
            yy, xx = np.nonzero(a)
            if not len(yy):
                continue
            cell, day = row[okr][yy] * (c1 - c0) + col[okc][xx], a[yy, xx].astype(np.int64)
            for i, d in enumerate(ORIGINS):
                for k, span in enumerate(SPANS):
                    m = (day > d - span) & (day <= d)
                    if BITS:  # a strip of rows touches few cell rows: count inside that band only
                        lo = int(row[okr].min())
                        band = np.bincount(cell[m] - lo * (c1 - c0), minlength=(int(row[okr].max()) - lo + 1) * (c1 - c0))
                        out[k, i, lo:lo + len(band) // (c1 - c0)] += band.reshape(-1, c1 - c0).astype(np.uint8)
                    else:
                        out[k, i] += np.bincount(cell[m], minlength=n).reshape(r1 - r0, c1 - c0).astype(np.uint16)
    return r0, c0, pack(out) if BITS else out


def pack(out):
    g = np.zeros(out.shape[2:], np.int32)
    for i in range(out.shape[1]):
        lvl = (out[0, i] >= 1).astype(np.int32) + (out[0, i] >= 6) + (out[0, i] >= 31)
        g |= (lvl | ((out[1, i] > 0).astype(np.int32) << 2) | ((out[2, i] > 0).astype(np.int32) << 3)) << (4 * i)
    return g


def main():
    if BITS:
        gb = np.zeros((NROW, NCOL), np.int32)
        with ProcessPoolExecutor(5) as ex:
            for r0, c0, block in ex.map(tile, TILES):
                gb[r0:r0 + block.shape[0], c0:c0 + block.shape[1]] |= block
        np.save(DATA / "gb4.npy", gb)
        share = [float(((gb >> 4 * i) & 3 > 0).mean()) for i in range(len(ORIGINS))]
        print("share of 100 m cells with an alert in the 12 months before each 31 July:", [round(x, 4) for x in share])
        assert all(0.0005 < x < 0.2 for x in share[1:])
        return
    g = np.zeros((len(SPANS), len(ORIGINS), NROW, NCOL), np.uint16)
    with ProcessPoolExecutor(6) as ex:
        for (r0, c0, block), name in zip(ex.map(tile, TILES), TILES):
            g[:, :, r0:r0 + block.shape[2], c0:c0 + block.shape[3]] += block
            print(name, "alert pixels in the 12-month windows", int(block[0].sum(dtype=np.int64)), flush=True)
    if len(SPANS) > 2:
        np.savez_compressed(DATA / "glad500wide.npz", **{f"g{d}": g[k] for k, d in enumerate(SPANS)})
        return
    np.savez_compressed(DATA / "glad500.npz", g12=g[0], g3=g[1])
    lat = N - (np.arange(NROW) + 0.5) * C
    km2 = (g[0].sum(2, dtype=np.int64) * (PX * 110.57) * (PX * 111.32 * np.cos(np.radians(lat)))).sum(1)
    print("km2 alerted in the 12 months before each 31 July, 2020..2026:", [round(float(v)) for v in km2])
    assert all(2_000 < v < 200_000 for v in km2[1:])


if __name__ == "__main__":
    main()
