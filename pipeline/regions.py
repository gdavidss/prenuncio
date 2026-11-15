"""Sectors for the site: shapes and numbers per state, municipality, Indigenous land and conservation unit.

Reads the last export (web/data/meta.json) and the forecast maps it was built from, so run it after
pipeline/export.py, every time. Nothing from data/raw is copied except simplified public boundaries.

Writes into web/data/:
  sectors_uf.json  sectors_mun.json  sectors_ti.json  sectors_uc.json
      one file per kind, loaded lazily by the site. Each item has
        id, n (name), s (state abbreviation, municipalities only), a (km2 of the sector on the grid),
        f (km2 of forest standing at the last forecast date),
        c  km2 cleared per PRODES year, aligned with "cyears" in regions.json (2008..2026)
        e  km2 the forecast map expected per year, aligned with "eyears" (2019..2027)
        h  km2 of that year's clearing that fell inside the flagged 5% of forest, aligned with "hyears"
        L  per shorter-horizon layer: [expected km2, then DETER km2 in the same months of each earlier year]
        m  the last 36 complete months of each monthly series, in the order of "months.names" in regions.json:
           DETER clearing alerts, burn scars, degradation with logging and (once layers.py writes it) mining,
           all in km2, then IBAMA flora infraction notices
        g  shape: polygons > rings > [x0, y0, dx, dy, ...] in thousandths of a degree (lon, lat), ring not closed
  regions.json   the year axes, the same L history for the whole Amazon, the Legal Amazon outline, the
                 forecast total of the export it was built from, and "months": the same monthly
                 series for the whole Amazon since August 2016, plus the ENSO index (ONI) for 36 months
  base.png       the drawn base map on the model grid, each band round(15 * fraction) * 16: R forest now,
                 G water, B natural non-forest (what is left over is cleared land); R = G = 255 outside
                 the Legal Amazon

Run: .venv/bin/python -I pipeline/regions.py
"""
import gc
import glob
import json
import re
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pyogrio
import shapely
from affine import Affine
from rasterio.features import rasterize
from scipy import sparse

sys.path.insert(0, str(Path(__file__).resolve().parent))
import model as m  # noqa: E402
from export import WEB, png  # noqa: E402

RAW = m.ROOT / "data/raw"
Q = 1000  # shape coordinates are stored in 1/Q degree, about 110 m
CYEARS = list(range(2008, 2027))
FIRST_MONTH = 199  # August 2016, when DETER starts, in months since 2000-01
SECTOR_MONTHS = 36
DETER_GROUP = {"clear": 0, "degr": 1, "scar": 2, "mine": 3}  # layer and series names to deter.parquet groups
UF = {11: "RO", 12: "AC", 13: "AM", 14: "RR", 15: "PA", 16: "AP", 17: "TO", 21: "MA", 51: "MT"}
SMALL = {"de", "do", "da", "dos", "das", "e", "em", "no", "na", "d'"}


def shp(sub):
    return pyogrio.read_dataframe(glob.glob(str(RAW / sub / "*.shp"))[0])


def title(s):
    """The conservation-unit file is in capitals with stray lower-case accents."""
    cap = lambda p: p if p in SMALL else p[:1].upper() + p[1:]
    words = re.sub(r"\s+", " ", s.strip()).lower().split(" ")
    return " ".join(w if i and w in SMALL else "-".join(cap(p) for p in w.split("-")) for i, w in enumerate(words))


# ---------- which cells belong to which sector ----------
def from_raster(codes):
    """(flat cell index, sector number, sorted codes) for a raster of sector codes."""
    ok = m.INSIDE & (codes > 0)
    idx = np.flatnonzero(ok)
    ids, fid = np.unique(codes.ravel()[idx], return_inverse=True)
    return idx, fid, ids


def from_shapes(geoms):
    """Cells whose centre is inside each shape. Shapes may overlap, so each is burnt on its own window.
    A shape smaller than a cell takes the cell under its centre."""
    idx, fid = [], []
    for i, g in enumerate(geoms):
        x0, y0, x1, y1 = g.bounds
        c0, c1 = max(int((x0 - m.W) / m.C), 0), min(int((x1 - m.W) / m.C) + 1, m.NCOL)
        r0, r1 = max(int((m.N - y1) / m.C), 0), min(int((m.N - y0) / m.C) + 1, m.NROW)
        if c1 <= c0 or r1 <= r0:
            continue
        hit = rasterize([g], out_shape=(r1 - r0, c1 - c0), transform=Affine(m.C, 0, m.W + c0 * m.C, 0, -m.C, m.N - r0 * m.C)).astype(bool)
        if not hit.any():
            p = g.representative_point()
            r, c = int((m.N - p.y) / m.C) - r0, int((p.x - m.W) / m.C) - c0
            if 0 <= r < hit.shape[0] and 0 <= c < hit.shape[1]:
                hit[r, c] = True
        rr, cc = np.nonzero(hit & m.INSIDE[r0:r1, c0:c1])
        idx.append((rr + r0) * m.NCOL + cc + c0)
        fid.append(np.full(len(rr), i))
    return np.concatenate(idx), np.concatenate(fid)


# ---------- shapes ----------
def encode(geom, min_area):
    """Polygons > rings > delta-coded integer coordinates. Parts and holes under min_area (square degrees) go,
    except that the largest part always stays."""
    parts = sorted(shapely.get_parts(geom), key=lambda p: -p.area) if geom is not None and not geom.is_empty else []
    out = []
    for k, p in enumerate(parts):
        if p.geom_type != "Polygon" or (k and p.area < min_area):
            continue
        rings = []
        for j, r in enumerate([p.exterior, *p.interiors]):
            if j and shapely.Polygon(r).area < min_area:
                continue
            a = np.round(np.asarray(r.coords)[:-1, :2] * Q).astype(np.int64)
            a = a[np.r_[True, (np.diff(a, axis=0) != 0).any(1)]]
            if len(a) >= 3:
                rings.append(np.diff(a, axis=0, prepend=0).ravel().tolist())
            elif not j:
                break
        if rings:
            out.append(rings)
    return out


def main():
    meta = json.load(open(WEB / "meta.json"))
    fy = meta["forecast"]["year"]
    eyears = sorted(int(y) for y in meta["years"])
    hyears = [y for y in eyears if "actual_km2" in meta["years"][str(y)]]
    m.load_2026()
    flat = lambda a: np.asarray(a, np.float64).ravel()

    # one shapefile in memory at a time: the raw shapes are a few hundred MB each
    kinds = {}
    df = shp("aux_uf")
    idx, fid, ids = from_raster(m.S["uf"])
    by = {int(c): r for c, r in zip(df.geocodigo.astype(int), df.itertuples())}
    kinds["uf"] = dict(idx=idx, fid=fid, id=[UF[int(c)] for c in ids], name=[by[int(c)].nome for c in ids],
                       geom=shapely.coverage_simplify(np.array([by[int(c)].geometry for c in ids]), 0.012), min_area=4e-4)
    df = shp("aux_mun")
    idx, fid, ids = from_raster(m.S["mun"])
    by = {int(c): r.nome for c, r in zip(df.geocodigo.astype(int), df.itertuples())}
    pos = {int(c): i for i, c in enumerate(df.geocodigo.astype(int))}
    cov = shapely.coverage_simplify(shapely.make_valid(df.geometry.values), 0.009)
    kinds["mun"] = dict(idx=idx, fid=fid, id=[int(c) for c in ids], name=[by[int(c)] for c in ids],
                        state=[UF[int(c) // 100000] for c in ids], geom=[cov[pos[int(c)]] for c in ids], min_area=2e-4)
    del cov
    for key, sub, name in (("ti", "aux_ti", lambda d: d.terrai_nom), ("uc", "aux_uc", lambda d: d.nome.map(title))):
        df = shp(sub)
        df = df[df.geometry.notna()].reset_index(drop=True)
        g = shapely.make_valid(df.geometry.values)
        idx, fid = from_shapes(g)
        kinds[key] = dict(idx=idx, fid=fid, id=[int(i) for i in df.id], name=list(name(df)),
                          geom=shapely.simplify(g, 0.006, preserve_topology=True), min_area=1e-4)
        del g
    border = shapely.simplify(shapely.union_all(shapely.make_valid(shp("aux_border").geometry.values)), 0.01)
    del df, by
    gc.collect()
    for k in kinds.values():
        k["n"] = len(k["id"])
        assert len(set(k["id"])) == k["n"], "sector ids must be unique"
        k["sum"] = lambda a, k=k: np.bincount(k["fid"], flat(a)[k["idx"]], k["n"])
        k["c"], k["e"], k["h"], k["L"] = [], [], [], {}

    # ---------- numbers: one map in memory at a time, summed for every kind ----------
    inside = flat(m.INSIDE)
    for k in kinds.values():
        k["a"] = k["sum"](m.CELL_KM2)
    forest_now = m.forest_at(fy - 1)
    for k in kinds.values():
        k["f"] = k["sum"](forest_now * m.CELL_KM2)
    lv = lambda a: np.round(15 * np.clip(a, 0, 1)) * 16  # 16 levels are plenty for a backdrop and compress well
    png(WEB / "base.png", [np.where(m.INSIDE, lv(forest_now), 255), np.where(m.INSIDE, lv(m.WATER), 255),
                           np.where(m.INSIDE, lv(m.NONFOREST), 0)])
    amazon = {"a": float((m.CELL_KM2 * m.INSIDE).sum()), "f": float((forest_now * m.CELL_KM2 * m.INSIDE).sum()), "L": {}}
    del forest_now

    for y in CYEARS:
        km2 = m.defo(y) * m.CELL_KM2
        for k in kinds.values():
            k["c"].append(k["sum"](km2))
    code = lambda x: np.round(255 * np.cbrt(np.clip(x, 0, 1)))  # the PNG code, which is what the site thresholds
    for y in eyears:
        risk, info = np.load(m.OUT / f"risk{y}.npy"), meta["years"][str(y)]
        if y == fy:
            risk = risk * (meta["forecast"]["total_km2"] / risk.sum())
        assert abs(risk.sum() / info["risk_km2"] - 1) < 1e-3, f"risk{y}.npy is not the map in meta.json: run pipeline/export.py first"
        for k in kinds.values():
            k["e"].append(k["sum"](risk))
        if y in hyears:
            hit = m.defo(y) * m.CELL_KM2 * (code(risk) >= max(1, code(info["cut"]["5"])))
            for k in kinds.values():
                k["h"].append(k["sum"](hit))
            print(y, "clearing inside the flagged cells: %.3f, meta says %.3f" % (hit.sum() / info["actual_km2"], info["capture"]["5"]))

    del risk, hit, km2
    gc.collect()

    # shorter horizons: the forecast, and what DETER showed in the same months of each earlier year
    layers = {}
    for name, L_ in meta["layers"].items():
        grp = DETER_GROUP.get(name.rstrip("0123456789"), 0)
        y0, mo = map(int, L_["from"].split("-"))
        start = (y0 - 2016) * 12 + mo - 1  # months since 2016-01, the unit of deter.parquet
        risk = np.load(m.OUT / f"risk_{name}.npy")
        back = list(range(start % 12 + (12 if start % 12 < 7 else 0), start, 12))  # DETER starts Aug 2016
        layers[name] = {"windows": [f"{2016 + s // 12}-{s % 12 + 1:02d}" for s in back]}
        amazon["L"][name] = [float((risk * m.INSIDE).sum())]
        for k in kinds.values():
            k["L"][name] = [k["sum"](risk)]
        for s in back:
            km2 = m.deter(grp, s, s + L_["months"] - 1) * m.CELL_KM2
            amazon["L"][name].append(float(flat(km2) @ inside))
            for k in kinds.values():
                k["L"][name].append(k["sum"](km2))
        print(name, "forecast %.0f km2, same months before:" % amazon["L"][name][0], [round(x) for x in amazon["L"][name][1:]])

    del risk, km2
    m._deter = None  # model.py's copy of the alert table
    gc.collect()

    # ---------- by month: DETER alerts and burn scars, IBAMA notices ----------
    # (fire.parquet is left out on purpose: it has no detections at all for 2025, so it cannot be compared year on year)
    # the last complete month is the one before the shorter-horizon forecasts start
    if meta["layers"]:
        y0, mo = map(int, next(iter(meta["layers"].values()))["from"].split("-"))
        last = (y0 - 2000) * 12 + mo - 2
    else:
        last = int(pd.read_parquet(m.GRID / "deter.parquet", columns=["ym"]).ym.max()) + 192 - 1
    ncell = m.NROW * m.NCOL

    def by_month(df, col):  # sparse [month, cell] from FIRST_MONTH to last
        d = df[(df.m >= FIRST_MONTH) & (df.m <= last)]
        return sparse.csr_matrix((d[col].to_numpy(np.float64), (d.m.to_numpy() - FIRST_MONTH, d.cell.to_numpy())), shape=(last - FIRST_MONTH + 1, ncell))

    deter = pd.read_parquet(m.GRID / "deter.parquet").assign(m=lambda d: d.ym.astype(np.int32) + 192)
    series = {name: by_month(deter[deter.grp == g], "km2") for name, g in (("clear", 0), ("scar", 2), ("degr", 1), ("mine", 3)) if (deter.grp == g).any()}
    series["autos"] = by_month(pd.read_parquet(m.GRID / "autos.parquet"), "n")
    del deter
    ym = lambda i: f"{2000 + i // 12}-{i % 12 + 1:02d}"
    months = {"start": ym(FIRST_MONTH), "end": ym(last), "names": list(series), **{name: [round(float(x), 1) for x in E @ inside] for name, E in series.items()}}
    for k in kinds.values():
        A = sparse.csr_matrix((np.ones(len(k["idx"]), np.float32), (k["idx"], k["fid"])), shape=(ncell, k["n"]))
        k["m"] = [np.asarray((E[-SECTOR_MONTHS:] @ A).todense()).T for E in series.values()]  # [sector, month]
    # ENSO: NOAA's Oceanic Nino Index, a three-month running mean, keyed here by the season's last month
    season, oni = "DJF JFM FMA MAM AMJ MJJ JJA JAS ASO SON OND NDJ".split(), {}
    for line in open(RAW / "climate/oni.txt").read().split("\n")[1:]:
        p = line.split()
        if len(p) == 4:
            oni[(int(p[1]) - 2000) * 12 + season.index(p[0]) + 1] = float(p[3])
    o_last = max(i for i in oni if i <= last)
    months["oni"] = {"end": ym(o_last), "v": [oni[i] for i in range(o_last - SECTOR_MONTHS + 1, o_last + 1)]}
    print("months", months["start"], "to", months["end"], "| clearing alerts, last three months %.0f km2, a year before %.0f | ONI %.2f"
          % (sum(months["clear"][-3:]), sum(months["clear"][-15:-12]), months["oni"]["v"][-1]))

    # ---------- write ----------
    num = lambda x, d: int(x) if round(float(x), d) == int(x) else round(float(x), d)  # 0, not 0.0: the files are mostly zeros
    r2 = lambda v: [num(x, 2) for x in v]
    for key, k in kinds.items():
        items = []
        for i in range(k["n"]):
            g = encode(k["geom"][i], k["min_area"])
            if not g or k["a"][i] <= 0:
                continue
            it = {"id": k["id"][i], "n": k["name"][i], "a": round(float(k["a"][i]), 1), "f": round(float(k["f"][i]), 1),
                  "c": r2(c[i] for c in k["c"]), "e": r2(e[i] for e in k["e"]), "h": r2(h[i] for h in k["h"]),
                  "L": {name: r2(v[i] for v in vs) for name, vs in k["L"].items()},
                  "m": [[num(x, 1) for x in a[i]] for a in k["m"]], "g": g}
            if "state" in k:
                it["s"] = k["state"][i]
            items.append(it)
        out = WEB / f"sectors_{key}.json"
        json.dump({"kind": key, "items": items}, open(out, "w"), ensure_ascii=False, separators=(",", ":"))
        e_fy = sum(it["e"][-1] for it in items)
        print(f"{key}: {len(items)} of {k['n']} sectors, {out.stat().st_size // 1024} KB, forecast year sums to {e_fy:.0f} km2")
    json.dump({"cyears": CYEARS, "eyears": eyears, "hyears": hyears, "q": Q, "layers": layers, "amazon": amazon,
               "total_km2": meta["forecast"]["total_km2"], "months": months,  # the export these sectors were summed from; the site warns if it moved
               "counts": {key: k["n"] for key, k in kinds.items()}, "border": encode(border, 1e-3)},
              open(WEB / "regions.json", "w"), separators=(",", ":"))
    # the states partition the Legal Amazon, so their forecasts must add up to the published total
    total = sum(float(e[-1].sum()) for e in [kinds["uf"]["e"]])
    assert abs(total / meta["forecast"]["total_km2"] - 1) < 0.01, (total, meta["forecast"]["total_km2"])
    print("regions.json", (WEB / "regions.json").stat().st_size // 1024, "KB; states sum to %.0f of %.0f km2" % (total, meta["forecast"]["total_km2"]))


if __name__ == "__main__":
    main()
