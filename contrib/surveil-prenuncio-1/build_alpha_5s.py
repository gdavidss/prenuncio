import datetime
import io
import json
import math
import os
import ssl
import subprocess
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
import pandas as pd
import rasterio
from PIL import Image
from rasterio.warp import Resampling, reproject
from affine import Affine

ROOT = Path.home() / "prenuncio-swarm"
DATA = ROOT / "data" / "alpha"
DATA.mkdir(parents=True, exist_ok=True)
G = json.load(open(ROOT / "repo/data/grid100.json"))
W, N, C500 = G["west"], G["north"], G["cell"] * 5
NROW, NCOL = G["rows"] // 5, G["cols"] // 5
S, E = N - NROW * C500, W + NCOL * C500
DST_TF = Affine(C500, 0, W, 0, -C500, N)

EPOCH = datetime.date(2014, 12, 31)
ORIGINS = [(datetime.date(y, 7, 31) - EPOCH).days for y in range(2020, 2027)]
SPANS = (31, 92, 183, 365, 730)


def lonlat_to_xy(lon, lat, z):
    n = 2 ** z
    x = int((lon + 180.0) / 360.0 * n)
    y = int((1.0 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2.0 * n)
    return x, y


def tile_lonlat_bounds(x, y, z):
    n = 2 ** z
    lon_w = x / n * 360.0 - 180.0
    lon_e = (x + 1) / n * 360.0 - 180.0
    lat_n = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * y / n))))
    lat_s = math.degrees(math.atan(math.sinh(math.pi * (1 - 2 * (y + 1) / n))))
    return lon_w, lat_s, lon_e, lat_n


def grid_gfw_tiles(dataset_slug, version, out_npz, z=10, workers=40):
    if out_npz.exists():
        print(f"SKIP {out_npz.name} (exists)", flush=True)
        return
    x0, y0 = lonlat_to_xy(W, N, z)
    x1, y1 = lonlat_to_xy(E, S, z)
    coords = [(x, y) for y in range(y0, y1 + 1) for x in range(x0, x1 + 1)]
    print(f"[{dataset_slug}] z={z} tiles={len(coords)} ({x0}..{x1}, {y0}..{y1})", flush=True)

    def fetch_tile(xy):
        x, y = xy
        url = f"https://tiles.globalforestwatch.org/{dataset_slug}/{version}/default/{z}/{x}/{y}.png"
        for attempt in range(3):
            try:
                req = urllib.request.Request(url, headers={"User-Agent": "prenuncio-swarm/1.0"})
                with urllib.request.urlopen(req, timeout=15) as r:
                    raw = r.read()
                break
            except urllib.error.HTTPError as e:
                if e.code in (404, 204):
                    return None
                if attempt == 2:
                    return None
                time.sleep(0.4 * (attempt + 1))
            except Exception:
                if attempt == 2:
                    return None
                time.sleep(0.4 * (attempt + 1))
        im = np.asarray(Image.open(io.BytesIO(raw)))
        if im.ndim != 3 or im.shape[2] < 3:
            return None
        r_ch = im[..., 0].astype(np.int32)
        g_ch = im[..., 1].astype(np.int32)
        b_ch = im[..., 2].astype(np.int32)
        days = r_ch * 255 + g_ch
        nz = days > 0
        if not nz.any():
            return None
        yy, xx = np.nonzero(nz)
        lon_w, lat_s, lon_e, lat_n = tile_lonlat_bounds(x, y, z)
        px_lon = lon_w + (xx + 0.5) / 256.0 * (lon_e - lon_w)
        n_m = 2 ** z
        ty_f = y + (yy + 0.5) / 256.0
        px_lat = np.degrees(np.arctan(np.sinh(math.pi * (1.0 - 2.0 * ty_f / n_m))))
        rr = np.floor((N - px_lat) / C500).astype(np.int64)
        cc = np.floor((px_lon - W) / C500).astype(np.int64)
        ok = (rr >= 0) & (rr < NROW) & (cc >= 0) & (cc < NCOL)
        if not ok.any():
            return None
        rr, cc = rr[ok], cc[ok]
        d_ok = days[yy[ok], xx[ok]]
        hi_ok = (b_ch[yy[ok], xx[ok]] // 100) >= 2
        rmin, rmax = int(rr.min()), int(rr.max())
        cmin, cmax = int(cc.min()), int(cc.max())
        nr, nc = rmax - rmin + 1, cmax - cmin + 1
        cell = (rr - rmin) * nc + (cc - cmin)
        n_cells = nr * nc
        out = np.zeros((len(SPANS) + 1, len(ORIGINS), nr, nc), np.uint16)
        for oi, od in enumerate(ORIGINS):
            for si, sp in enumerate(SPANS):
                m = (d_ok > od - sp) & (d_ok <= od)
                if m.any():
                    out[si, oi] = np.bincount(cell[m], minlength=n_cells).reshape(nr, nc).astype(np.uint16)
            mh = (d_ok > od - 365) & (d_ok <= od) & hi_ok
            if mh.any():
                out[len(SPANS), oi] = np.bincount(cell[mh], minlength=n_cells).reshape(nr, nc).astype(np.uint16)
        return rmin, cmin, out

    acc = np.zeros((len(SPANS) + 1, len(ORIGINS), NROW, NCOL), np.uint16)
    done = hits = 0
    t0 = time.time()
    with ThreadPoolExecutor(workers) as ex:
        for res in ex.map(fetch_tile, coords):
            done += 1
            if res is not None:
                hits += 1
                rmin, cmin, blk = res
                acc[:, :, rmin:rmin + blk.shape[2], cmin:cmin + blk.shape[3]] += blk
            if done % 500 == 0 or done == len(coords):
                print(f"  [{dataset_slug}] {done}/{len(coords)} hits={hits} s={time.time()-t0:.0f}", flush=True)
    payload = {f"d{sp}": acc[si] for si, sp in enumerate(SPANS)}
    payload["high365"] = acc[len(SPANS)]
    np.savez_compressed(out_npz, **payload)
    print(f"WROTE {out_npz} totals_365={[int(acc[3, i].sum()) for i in range(len(ORIGINS))]}", flush=True)


def grid_hansen_tc_gain():
    out_npz = DATA / "hansen_tc_gain500.npz"
    if out_npz.exists():
        print("SKIP hansen_tc_gain500.npz", flush=True)
        return
    tiles = [(la, lo) for la in ("10N", "00N", "10S") for lo in ("080W", "070W", "060W", "050W")]
    tc_acc = np.zeros((NROW, NCOL), np.float32)
    tc_cnt = np.zeros((NROW, NCOL), np.float32)
    gn_acc = np.zeros((NROW, NCOL), np.uint16)
    px = 0.00025

    def proc_tile(t):
        la, lo = t
        top = int(la[:2]) * (1 if la[2] == "N" else -1)
        left = -int(lo[:3])
        r0, r1 = max(0, int((N - top) / C500)), min(NROW, int((N - (top - 10)) / C500) + 1)
        c0, c1 = max(0, int((left - W) / C500)), min(NCOL, int((left + 10 - W) / C500) + 1)
        if r1 <= r0 or c1 <= c0:
            return None
        nr, nc = r1 - r0, c1 - c0
        tc_s = np.zeros((nr, nc), np.float32)
        tc_n = np.zeros((nr, nc), np.float32)
        gn_s = np.zeros((nr, nc), np.uint16)
        u_tc = f"/vsicurl/https://storage.googleapis.com/earthenginepartners-hansen/GFC-2025-v1.13/Hansen_GFC-2025-v1.13_treecover2000_{la}_{lo}.tif"
        u_gn = f"/vsicurl/https://storage.googleapis.com/earthenginepartners-hansen/GFC-2025-v1.13/Hansen_GFC-2025-v1.13_gain_{la}_{lo}.tif"
        with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR"):
            with rasterio.open(u_tc) as ds:
                a = ds.read(1, out_shape=(ds.height // 4, ds.width // 4), resampling=Resampling.average)
                px4 = px * 4
                col = np.floor((left + (np.arange(a.shape[1]) + 0.5) * px4 - W) / C500).astype(np.int64) - c0
                row = np.floor((N - (top - (np.arange(a.shape[0]) + 0.5) * px4)) / C500).astype(np.int64) - r0
                okc, okr = (col >= 0) & (col < nc), (row >= 0) & (row < nr)
                sub = a[okr][:, okc].astype(np.float32)
                rr, cc = np.meshgrid(row[okr], col[okc], indexing="ij")
                flat = (rr * nc + cc).ravel()
                tc_s = np.bincount(flat, weights=sub.ravel(), minlength=nr * nc).reshape(nr, nc).astype(np.float32)
                tc_n = np.bincount(flat, minlength=nr * nc).reshape(nr, nc).astype(np.float32)
            with rasterio.open(u_gn) as ds:
                a = ds.read(1, out_shape=(ds.height // 2, ds.width // 2), resampling=Resampling.average)
                px2 = px * 2
                col = np.floor((left + (np.arange(a.shape[1]) + 0.5) * px2 - W) / C500).astype(np.int64) - c0
                row = np.floor((N - (top - (np.arange(a.shape[0]) + 0.5) * px2)) / C500).astype(np.int64) - r0
                okc, okr = (col >= 0) & (col < nc), (row >= 0) & (row < nr)
                sub = a[okr][:, okc]
                yy, xx = np.nonzero(sub > 0)
                if len(yy):
                    flat = row[okr][yy] * nc + col[okc][xx]
                    gn_s = np.bincount(flat, weights=sub[yy, xx], minlength=nr * nc).reshape(nr, nc).astype(np.uint16)
        return r0, c0, tc_s, tc_n, gn_s

    with ThreadPoolExecutor(6) as ex:
        for res in ex.map(proc_tile, tiles):
            if res is None:
                continue
            r0, c0, ts, tn, gs = res
            h, w = ts.shape
            tc_acc[r0:r0 + h, c0:c0 + w] += ts
            tc_cnt[r0:r0 + h, c0:c0 + w] += tn
            gn_acc[r0:r0 + h, c0:c0 + w] += gs
    tc = np.where(tc_cnt > 0, tc_acc / np.maximum(tc_cnt, 1), 0).astype(np.float16)
    np.savez_compressed(out_npz, treecover2000=tc, gain=gn_acc)
    print(f"WROTE {out_npz} mean_tc={float(tc.mean()):.1f} gain_sum={int(gn_acc.sum())}", flush=True)


def grid_chirps_monthly():
    out_npz = DATA / "chirps_monthly_lowres.npz"
    if out_npz.exists():
        print("SKIP chirps_monthly_lowres.npz", flush=True)
        return
    c_lr = 0.05
    c0 = int(math.floor((W - (-180.0)) / c_lr))
    r0 = int(math.floor((60.0 - N) / c_lr))
    lr_rows = int(math.ceil((N - S) / c_lr))
    lr_cols = int(math.ceil((E - W) / c_lr))
    win = rasterio.windows.Window(c0, r0, lr_cols, lr_rows)
    w_west = -180.0 + c0 * c_lr
    w_north = 60.0 - r0 * c_lr
    months = [(y, m) for y in range(2005, 2027) for m in range(1, 13) if (y < 2026 or m <= 7)]
    print(f"[CHIRPS v3] fast window read {len(months)} months ({lr_rows}x{lr_cols})...", flush=True)

    def fetch_m(ym):
        y, m = ym
        url = f"/vsicurl/https://data.chc.ucsb.edu/products/CHIRPS/v3.0/monthly/global/tifs/chirps-v3.0.{y}.{m:02d}.tif"
        for attempt in range(3):
            try:
                with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", GDAL_HTTP_MAX_RETRY=3), rasterio.open(url) as src:
                    arr = src.read(1, window=win).astype(np.float32)
                arr = np.where(arr < -100.0, np.nan, arr)
                return ym, arr.astype(np.float16)
            except Exception:
                time.sleep(0.8 * (attempt + 1))
        return ym, np.full((lr_rows, lr_cols), np.nan, np.float16)

    cube = np.full((len(months), lr_rows, lr_cols), np.nan, np.float16)
    with ThreadPoolExecutor(24) as ex:
        for i, (ym, arr) in enumerate(ex.map(fetch_m, months)):
            cube[i] = arr
            if (i + 1) % 36 == 0 or i + 1 == len(months):
                print(f"  [CHIRPS] {i+1}/{len(months)} {ym}", flush=True)
    np.savez_compressed(out_npz, rain=cube, years=np.array([y for y, _ in months], np.int16), months=np.array([m for _, m in months], np.int8), meta=json.dumps({"west": w_west, "north": w_north, "cell": c_lr, "rows": lr_rows, "cols": lr_cols}))
    print(f"WROTE {out_npz} shape={cube.shape}", flush=True)


def fetch_sicor_and_anm():
    sic_dir = DATA / "sicor"
    sic_dir.mkdir(exist_ok=True)
    for y in range(2013, 2027):
        f = sic_dir / f"SICOR_CONTRATOS_MUNICIPIO_{y}.gz"
        if not f.exists():
            u = f"https://www.bcb.gov.br/htms/sicor/DadosBrutos/SICOR_CONTRATOS_MUNICIPIO_{y}.gz"
            subprocess.run(["curl", "-fsSL", "--retry", "4", "-o", str(f) + ".part", u], check=False)
            if Path(str(f) + ".part").exists():
                Path(str(f) + ".part").rename(f)
    print("SICOR contracts downloaded:", len(list(sic_dir.glob("*.gz"))), flush=True)

    anm_dir = DATA / "anm"
    anm_dir.mkdir(exist_ok=True)
    anm_out = anm_dir / "sigmine_legal_amazon.parquet"
    if not anm_out.exists():
        ctx = ssl._create_unverified_context()
        rows = []
        for uf in ("AC", "AM", "AP", "MA", "MT", "PA", "RO", "RR", "TO"):
            offset = 0
            while True:
                u = (
                    f"https://geo.anm.gov.br/arcgis/rest/services/SIGMINE/dados_anm/MapServer/0/query"
                    f"?where=UF%3D%27{uf}%27&outFields=PROCESSO,ANO,FASE,SUBS,USO,AREA_HA,UF&returnGeometry=true"
                    f"&outSR=4326&resultOffset={offset}&resultRecordCount=1000&f=json"
                )
                try:
                    data = json.loads(urllib.request.urlopen(u, timeout=30, context=ctx).read().decode())
                except Exception as e:
                    print(f"  ANM {uf} offset={offset} err={e}", flush=True)
                    break
                feats = data.get("features") or []
                if not feats:
                    break
                for ft in feats:
                    at = ft.get("attributes") or {}
                    geom = ft.get("geometry") or {}
                    rings = geom.get("rings") or []
                    if rings and rings[0]:
                        pts = np.asarray(rings[0], np.float64)
                        lon, lat = float(pts[:, 0].mean()), float(pts[:, 1].mean())
                        at["lon"], at["lat"] = lon, lat
                        rows.append(at)
                offset += len(feats)
                if len(feats) < 1000:
                    break
            print(f"  ANM {uf}: total_rows={len(rows)}", flush=True)
        if rows:
            pd.DataFrame(rows).to_parquet(anm_out)
            print("WROTE", anm_out, len(rows), flush=True)


if __name__ == "__main__":
    print("=== START PHASE-0 ALPHA BUILDER ON c3ru-5s ===", flush=True)
    grid_gfw_tiles("wur_radd_alerts", "v20261115", DATA / "radd500.npz", z=10, workers=40)
    grid_gfw_tiles("gfw_integrated_alerts", "v20261122", DATA / "gfw_int500.npz", z=10, workers=40)
    grid_hansen_tc_gain()
    fetch_sicor_and_anm()
    print("=== PHASE0_5S_DONE ===", flush=True)
