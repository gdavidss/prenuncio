"""AlphaEarth Foundations satellite embeddings (Google, annual, 10 m, 64 numbers per pixel) averaged onto
the 500 m model grid. Runs on the training machine. Each number summarises a year of Sentinel-1/2 and
Landsat imagery, so this hands the models what the satellites saw, not only what the maps recorded.

Tiles are read at their 320 m overview (the file's own mean of the pixels underneath) and averaged
into the grid cells. Output data/aef/emb_<year>.npy: float16 [64, rows, cols], NaN where nothing was seen.
A calendar year's embedding covers January to December, so a forecast dated 31 July of year t may use
year t-1 and earlier, never year t.
Run: python aef.py 2018 2019 ...     (needs data/aef_index.parquet from source.coop/tge-labs/aef)
Attribution: The AlphaEarth Foundations Satellite Embedding dataset is produced by Google and Google DeepMind.
"""
import json
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
import pandas as pd
import rasterio
from pyproj import Transformer

DATA = Path(__file__).resolve().parent.parent / "data"
G = json.load(open(DATA / "grid100.json"))
W, N, C = G["west"], G["north"], G["cell"] * 5
NROW, NCOL = G["rows"] // 5, G["cols"] // 5
S, E = N - NROW * C, W + NCOL * C
OV = 256  # 8192 px tiles read as 256 x 256, i.e. 320 m


def tile(row):
    url = "/vsicurl/https://storage.googleapis.com/alphaearth_foundations/satellite_embedding/v1/annual/" + "/".join(row.path.split("/")[-3:])
    for attempt in range(4):
        try:
            with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", GDAL_HTTP_MAX_RETRY=3), rasterio.open(url) as ds:
                a = ds.read(out_shape=(64, OV, OV))
                tr, crs = ds.transform * ds.transform.scale(ds.width / OV, ds.height / OV), ds.crs
            break
        except Exception as e:  # network hiccup: try again, then give up loudly
            if attempt == 3:
                raise RuntimeError(f"{url}: {e}")
    ok = a[0] != -128
    if not ok.any():
        return None
    jj, ii = np.meshgrid(np.arange(OV) + 0.5, np.arange(OV) + 0.5)
    x, y = tr.c + jj * tr.a, tr.f + ii * tr.e
    lon, lat = Transformer.from_crs(crs, "EPSG:4326", always_xy=True).transform(x, y)
    r, c = np.floor((N - lat) / C).astype(np.int64), np.floor((lon - W) / C).astype(np.int64)
    ok &= (r >= 0) & (r < NROW) & (c >= 0) & (c < NCOL)
    if not ok.any():
        return None
    r, c = r[ok], c[ok]
    v = a[:, ok].astype(np.float32) / 127.5
    v = np.sign(v) * v * v  # the published de-quantisation
    r0, c0 = r.min(), c.min()
    h, w = r.max() - r0 + 1, c.max() - c0 + 1
    flat = (r - r0) * w + (c - c0)
    s = np.stack([np.bincount(flat, v[k], h * w) for k in range(64)]).reshape(64, h, w).astype(np.float32)
    return r0, c0, s, np.bincount(flat, minlength=h * w).reshape(h, w).astype(np.float32)


def main():
    idx = pd.read_parquet(DATA / "aef_index.parquet", columns=["path", "year", "wgs84_west", "wgs84_south", "wgs84_east", "wgs84_north"])
    idx = idx[(idx.wgs84_east > W) & (idx.wgs84_west < E) & (idx.wgs84_north > S) & (idx.wgs84_south < N)]
    (DATA / "aef").mkdir(exist_ok=True)
    for year in map(int, sys.argv[1:]):
        rows = list(idx[idx.year == year].itertuples())
        s, n = np.zeros((64, NROW, NCOL), np.float32), np.zeros((NROW, NCOL), np.float32)
        with ThreadPoolExecutor(24) as ex:
            for k, out in enumerate(ex.map(tile, rows)):
                if out is not None:
                    r0, c0, ts, tn = out
                    s[:, r0:r0 + ts.shape[1], c0:c0 + ts.shape[2]] += ts
                    n[r0:r0 + tn.shape[0], c0:c0 + tn.shape[1]] += tn
                if k % 200 == 0:
                    print(year, k, "/", len(rows), flush=True)
        with np.errstate(invalid="ignore", divide="ignore"):
            s /= n
        np.save(DATA / "aef" / f"emb_{year}.npy", s.astype(np.float16))
        seen = float((n > 0).mean())
        print(year, "cells seen", round(seen, 3), "mean vector length", round(float(np.sqrt(np.nansum(s[:, ::50, ::50] ** 2, 0))[n[::50, ::50] > 0].mean()), 3), flush=True)
        assert seen > 0.5, "most of the grid box should be covered"


if __name__ == "__main__":
    main()
