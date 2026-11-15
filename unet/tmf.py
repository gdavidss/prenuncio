"""JRC Tropical Moist Forest v1 (30 m Landsat, 1982..2025): the year each pixel was first disturbed,
summed onto the 500 m model grid. TMF flags short disturbances that neither PRODES nor Hansen keep:
selective logging, fire damage under the canopy, small openings that close again.

Only the first disturbance year is used: min(DegradationYear, DeforestationYear). TMF's split into
"degraded" and "deforested" depends on how long the disturbance lasted, which is knowledge from
after the event, so the two classes are not used separately.

Tiles are downloaded first (scripts/fetch_tmf.sh). Output data/tmf500.npz:
  dist uint16 [25, rows, cols]  pixels first disturbed in each calendar year 2001..2025
  old  uint16 [rows, cols]      pixels first disturbed before 2001
With the argument "100" it writes data/tb.npy instead, for the convolutional model: int32 on the 100 m
grid, bit y-2001 set when any pixel of the cell was first disturbed in calendar year y, bit 25 for
before 2001.
Run: python tmf.py [100]
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
TILES = [(la, lo) for la in ("N10", "N0", "S10") for lo in ("W80", "W70", "W60", "W50")]


def tile(t):
    """One 10 degree tile -> (first row, first column, counts [26, rows, cols]) on the model grid; plane 0 is
    before 2001. In bit mode the block is int32 [rows, cols] instead."""
    with rasterio.open(DATA / "tmf" / f"DegradationYear_{t[0]}_{t[1]}.tif") as a, rasterio.open(DATA / "tmf" / f"DeforestationYear_{t[0]}_{t[1]}.tif") as b:
        assert a.shape == b.shape and a.transform == b.transform
        tr = a.transform
        col = np.floor((tr.c + (np.arange(a.width) + 0.5) * tr.a - W) / C).astype(np.int64)
        row = np.floor((N - (tr.f + (np.arange(a.height) + 0.5) * tr.e)) / C).astype(np.int64)
        okc, okr = (col >= 0) & (col < NCOL), (row >= 0) & (row < NROW)
        if not okc.any() or not okr.any():
            return 0, 0, np.zeros((0, 0), np.int32) if BITS else np.zeros((26, 0, 0), np.uint16)
        r0, c0 = row[okr].min(), col[okc].min()
        nr, nc = row[okr].max() - r0 + 1, col[okc].max() - c0 + 1
        out = np.zeros((nr, nc), np.int32) if BITS else np.zeros((26, nr, nc), np.uint16)
        step = 2000
        for y in range(0, a.height, step):
            sl = slice(y, min(y + step, a.height))
            if not okr[sl].any():
                continue
            win = Window(0, y, a.width, sl.stop - y)
            dg, df = a.read(1, window=win)[okr[sl]][:, okc], b.read(1, window=win)[okr[sl]][:, okc]
            first = np.where((dg > 0) & ((df == 0) | (dg < df)), dg, df)
            yy, xx = np.nonzero(first)
            rows = row[sl][okr[sl]] - r0
            lo, n = rows.min(), rows.max() - rows.min() + 1  # this strip touches only a few grid rows
            yr = np.clip(first[yy, xx].astype(np.int64) - 2000, 0, 25)
            if BITS:
                cell, flat = rows[yy] * nc + col[okc][xx] - c0, out.reshape(-1)
                for v in np.unique(yr):
                    flat[cell[yr == v]] |= np.int32(1 << ((int(v) - 1) % 26))  # 2001..2025 -> bits 0..24, earlier -> bit 25
                continue
            idx = (yr * n + rows[yy] - lo) * nc + col[okc][xx] - c0
            out[:, lo:lo + n] += np.bincount(idx, minlength=26 * n * nc).reshape(26, n, nc).astype(np.uint16)
    return int(r0), int(c0), out


def main():
    if BITS:
        tb = np.zeros((NROW, NCOL), np.int32)
        with ProcessPoolExecutor(4) as ex:
            for r0, c0, block in ex.map(tile, TILES):
                tb[r0:r0 + block.shape[0], c0:c0 + block.shape[1]] |= block
        np.save(DATA / "tb.npy", tb)
        share = [float((tb[::7, ::7] >> b & 1).mean()) for b in (15, 21, 23)]  # 2016, 2022, 2024
        print("share of 100 m cells first disturbed in 2016, 2022, 2024:", [round(x, 4) for x in share])
        assert all(0.0003 < x < 0.2 for x in share)
        return
    acc = np.zeros((26, NROW, NCOL), np.uint16)
    with ProcessPoolExecutor(4) as ex:
        for (r0, c0, block), t in zip(ex.map(tile, TILES), TILES):
            win = acc[:, r0:r0 + block.shape[1], c0:c0 + block.shape[2]]
            np.maximum(win, block, out=win)  # neighbouring tiles overlap by 0.04 degrees: take the fuller count, not the sum
            print(t, "disturbed pixels", int(block.sum(dtype=np.int64)), flush=True)
    np.savez_compressed(DATA / "tmf500.npz", dist=acc[1:], old=acc[0])
    lat = N - (np.arange(NROW) + 0.5) * C
    px = 0.00026949459
    km2 = (acc[1:].sum(2, dtype=np.int64) * (px * 110.57) * (px * 111.32 * np.cos(np.radians(lat)))).sum(1)
    print("km2 first disturbed in the grid box by year:", {2001 + i: round(float(v)) for i, v in enumerate(km2)})
    assert int(acc.max()) <= 330, int(acc.max())  # a 500 m cell holds about 280 TMF pixels
    assert 5_000 < km2[21] < 150_000  # 2022: PRODES maps 12,690 km2 of clear-cut; TMF adds degradation


if __name__ == "__main__":
    main()
