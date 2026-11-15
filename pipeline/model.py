"""Annual allocation model: where the next PRODES year's clearing falls, on the model grid
(about 1 km by default, AZ_F=50 for 500 m).

A PRODES year Y runs 1 Aug Y-1 to 31 Jul Y. Every feature for target year Y uses only what was
known on 31 Jul Y-1. Validation is rolling origin: train on target years < T, test on T.

Run: .venv/bin/python -I pipeline/model.py eval      rolling-origin scores against naive baselines
     .venv/bin/python -I pipeline/model.py forecast  train on everything, write 2026 check + 2027 map
"""
import json
import os
import sys
from pathlib import Path

import lightgbm as lgb
import numpy as np
import pandas as pd
from scipy import ndimage as ndi
from sklearn.metrics import average_precision_score

sys.path.insert(0, str(Path(__file__).resolve().parent))
from az import F, GRID, K, OUT, ROOT, X, load_grid  # noqa: E402,F401

COUNTS, _g = load_grid()
W, N, C, NROW, NCOL = _g["west"], _g["north"], _g["cell"], _g["rows"], _g["cols"]
LAT = (N - (np.arange(NROW) + 0.5) * C)[:, None]
CELL_KM2 = ((C * 110.57) * (C * 111.32 * np.cos(np.radians(LAT)))).astype(np.float32) * np.ones((1, NCOL), np.float32)
LAST = 2025  # last PRODES year in the wall-to-wall raster
# needs three years of history after the 2008 start of annual mapping. AZ_FIRST starts later, for
# experiments with inputs that only exist for recent years
FIRST_TARGET = int(os.environ.get("AZ_FIRST", 2011))

frac = lambda k: np.asarray(COUNTS[k], np.float32) / (F * F)
WATER, NONFOREST, OUTSIDE = frac(35), frac(37), frac(38)
INSIDE = OUTSIDE < 0.5
S = dict(np.load(GRID / "static.npz"))
EXTRA = {}  # year -> cleared fraction, for years after the raster (2026 from the priority scenes)


def defo(y):
    """Fraction of the cell cleared in PRODES year y (official increments)."""
    if y in EXTRA:
        return EXTRA[y]
    return frac(y - 2007) if 2008 <= y <= LAST else np.zeros((NROW, NCOL), np.float32)


def resid(y):
    """Older clearing first mapped in year y (cloud-delayed). Counts as cleared from y on, never as target."""
    return frac(19 + y - 2010) if 2010 <= y <= LAST else np.zeros((NROW, NCOL), np.float32)


def forest_at(t):
    """Forest fraction as mapped at the end of PRODES year t."""
    f = frac(36)
    for y in range(t + 1, LAST + 1):
        f = f + defo(y) + resid(y)
    for y in range(LAST + 1, t + 1):
        f = np.clip(f - defo(y), 0, 1)
    return f


def box(a, km):
    """Mean of a over a square about km wide."""
    return ndi.uniform_filter(a, (km * K) | 1, mode="constant")


def dist(mask):
    """Distance in km to the nearest True cell, capped at 200."""
    if not mask.any():
        return np.full(mask.shape, 200, np.float32)
    return np.minimum(ndi.distance_transform_edt(~mask) / K, 200).astype(np.float32)


_deter = None


def deter(grp, m0, m1):
    """DETER alert area (fraction of cell) for a class group in months [m0, m1], months since 2016-01."""
    global _deter
    if _deter is None:
        _deter = pd.read_parquet(GRID / "deter.parquet")
    d = _deter[(_deter.grp == grp) & (_deter.ym >= m0) & (_deter.ym <= m1)]
    return (np.bincount(d.cell, d.km2, NROW * NCOL).reshape(NROW, NCOL) / CELL_KM2).astype(np.float32)


_events = {}


def events(name, m0, m1, col="n", active=False):
    """Sum of an event layer over months [m0, m1] (months since 2000-01), as a map.
    active=True (embargoes): everything imposed up to m1 and not lifted by then."""
    if name not in _events:
        _events[name] = pd.read_parquet(GRID / f"{name}.parquet")
    d = _events[name]
    d = d[(d.m <= m1) & (d.m_end > m1)] if active else d[(d.m >= m0) & (d.m <= m1)]
    return np.bincount(d.cell, d[col], NROW * NCOL).reshape(NROW, NCOL).astype(np.float32)


_hansen = None


def hansen(y0, y1):
    """Hansen 30 m forest loss, fraction of the cell, summed over calendar years y0..y1."""
    global _hansen
    if _hansen is None:
        _hansen = np.load(GRID / "hansen.npy", mmap_mode="r")  # [2001..2025, rows, cols] pixel counts
    px = (C / 0.00025) ** 2
    out = np.zeros((NROW, NCOL), np.float32)
    for y in range(max(y0, 2001), min(y1, 2025) + 1):
        out += np.asarray(_hansen[y - 2001], np.float32)
    return out / px


_mun = None


def by_mun(a):
    """Sum of a per municipality, broadcast back to the cells."""
    global _mun
    if _mun is None:
        codes, inv = np.unique(S["mun"], return_inverse=True)
        _mun = len(codes), inv.ravel()
    n, inv = _mun
    return np.bincount(inv, a.ravel(), n)[inv].reshape(a.shape).astype(np.float32)


class Cols(dict):
    """A feature map is 35 MB at 1 km and 140 MB at 500 m, and there are about 70. Assigning a map
    here keeps only its values at the sampled cells; the map itself is dropped unless a later
    feature reads it back."""
    KEEP = {"mun_d1", "fire12_n25"}

    def __init__(self, idx):
        super().__init__()
        self.idx, self.cols = idx, {}

    def __setitem__(self, name, a):
        self.cols[name] = a.ravel()[self.idx].astype(np.float32)
        if name in self.KEEP:
            super().__setitem__(name, a)


def features(y, mc=None, pick=None, extra=None):
    """Feature table for the cells pick() selects among the candidates (cells that still hold forest).
    Returns (table, flat cell indices, feature names).
    y - 1 is the last PRODES year known; mc is the last month of alerts, fires and enforcement known
    (months since 2000-01). The annual model uses mc = July of y - 1. pipeline/horizons.py moves mc
    and adds its own columns through extra(f, mc)."""
    t = y - 1
    if mc is None:
        mc = (t - 2000) * 12 + 6
    forest = forest_at(t)
    cand = INSIDE & (forest >= 0.01)
    f = Cols(pick(cand) if pick else np.flatnonzero(cand.ravel()))
    d1, d2, d3 = defo(t), defo(t - 1), defo(t - 2)
    d3sum = d1 + d2 + d3
    cleared = np.clip(1 - forest - WATER - NONFOREST - OUTSIDE, 0, 1)
    f["forest"], f["cleared"], f["water"], f["nonforest"] = forest, cleared, WATER, NONFOREST
    f["d1"], f["d2"], f["d3"], f["d5sum"] = d1, d2, d3, d3sum + defo(t - 3) + defo(t - 4)
    for n in (3, 9, 25, 75):  # neighbourhood width in km
        f[f"n{n}_d1"], f[f"n{n}_d3sum"] = box(d1, n), box(d3sum, n)
        f[f"n{n}_cleared"], f[f"n{n}_forest"] = box(cleared, n), box(forest, n)
    f["n9_trend"], f["n25_trend"] = box(d1 - d2, 9), box(d1 - d2, 25)
    f["dist_d1"] = dist(d1 >= 0.01)
    f["dist_d3"] = dist(d3sum >= 0.01)
    f["dist_cleared"] = dist(cleared >= 0.1)  # the forest edge; alone it is the Verra VT0007 benchmark
    f["dist_river"] = dist(WATER >= 0.3)
    f["dist_outside"] = dist(~INSIDE)
    mun_forest = by_mun(forest * CELL_KM2)
    f["mun_d1"] = by_mun(d1 * CELL_KM2)
    f["mun_rate"] = f["mun_d1"] / (mun_forest + 1)
    f["mun_forest_share"] = mun_forest / (by_mun(CELL_KM2 * INSIDE) + 1)
    uc_live = np.where(S["uc_year"] <= t, S["uc_group"], 0)
    f["ti"], f["uc"] = S["ti"], uc_live
    f["dist_protected"] = dist((S["ti"] > 0) | (uc_live == 1) | (uc_live == 2))
    f["uf"] = S["uf"]
    f["lat"] = LAT * np.ones((1, NCOL), np.float32)
    f["lon"] = (W + (np.arange(NCOL) + 0.5) * C)[None, :] * np.ones((NROW, 1), np.float32)
    # DETER-B exists from Aug 2016: degradation, selective logging and fire scars are precursors
    m_end = mc - 192  # DETER months are counted from 2016-01
    for name, grp in (("alert", 0), ("degr", 1), ("scar", 2)):
        if m_end >= 18:  # a full 12 months of DETER-B behind us
            a12, a3 = deter(grp, m_end - 11, m_end), deter(grp, m_end - 2, m_end)
        else:
            a12 = a3 = np.full((NROW, NCOL), np.nan, np.float32)
        f[f"{name}12"], f[f"{name}12_n9"], f[f"{name}12_n25"] = a12, box(a12, 9), box(a12, 25)
        f[f"{name}3_n9"] = box(a3, 9)
    f["month"] = np.full((NROW, NCOL), mc % 12, np.float32)  # season of the forecast date
    # fire detections, IBAMA embargoes and flora infraction notices up to month mc
    fire12 = events("fire", mc - 11, mc)
    f["fire12"], f["fire12_n9"], f["fire12_n25"] = fire12, box(fire12, 9), box(fire12, 25)
    f["fire36_n9"] = box(events("fire", mc - 35, mc), 9)
    f["fire_trend_n25"] = f["fire12_n25"] - box(events("fire", mc - 23, mc - 12), 25)
    emb = events("embargo", 0, mc, "ha", active=True) / (CELL_KM2 * 100)
    f["embargo_n9"], f["embargo_n25"] = box(emb, 9), box(emb, 25)
    f["embargo_new12_n25"] = box(events("embargo", mc - 11, mc, "ha") / (CELL_KM2 * 100), 25)
    f["autos12_n25"], f["autos36_n9"] = box(events("autos", mc - 11, mc), 25), box(events("autos", mc - 35, mc), 9)
    f["mun_autos_per_km2"] = by_mun(events("autos", mc - 11, mc)) / (f["mun_d1"] + 1)
    if K > 1:  # finer than 1 km: what the eight touching cells hold, and the edge at cell scale
        near = lambda a: ndi.uniform_filter(a, 3, mode="constant")
        f["touch_d1"], f["touch_d3sum"], f["touch_cleared"] = near(d1), near(d3sum), near(cleared)
        f["dist_anyclear"] = dist(cleared >= 0.02)
    if "hansen" in X:
        # Hansen sees what PRODES does not call clear-cut: small openings, logging roads, burned forest.
        # A calendar year is published around May of the next one, so by 31 July the newest is last year's.
        hy = mc // 12 + 2000 - (1 if mc % 12 >= 4 else 2)
        h1, h3 = hansen(hy, hy), hansen(hy - 2, hy)
        f["h1"], f["h1_n3"], f["h1_n9"] = h1, box(h1, 3), box(h1, 9)
        f["h3"], f["h3_n3"], f["h3_n9"], f["h3_n25"] = h3, box(h3, 3), box(h3, 9), box(h3, 25)
        f["h10_n9"] = box(hansen(hy - 9, hy), 9)
        f["dist_h1"], f["dist_h3"] = dist(h1 >= 0.01), dist(h3 >= 0.01)
        f["h3_unmapped_n3"] = box(np.clip(h3 - d3sum - defo(t - 3), 0, 1) * (forest > 0.5), 3)  # loss inside what PRODES still calls forest
    if "glad" in X:
        # Sentinel-2 alerts at 10 m, from 2019: openings of a few pixels and logging roads, counted
        # over the 12 and 3 months before 31 July of year t (see unet/glad.py). Annual forecasts only.
        if t >= 2020:
            gl = np.load(GRID / "glad.npz")
            px = (C / 0.0001) ** 2
            g12, g3 = gl["g12"][t - 2020].astype(np.float32) / px, gl["g3"][t - 2020].astype(np.float32) / px
        else:  # before the alerts existed: unknown, which the trees handle as its own case
            g12 = g3 = np.full((NROW, NCOL), np.nan, np.float32)
        f["g12"], f["g12_n3"], f["g12_n9"] = g12, box(g12, 3), box(g12, 9)
        f["g3"], f["g3_n3"], f["g3_n9"] = g3, box(g3, 3), box(g3, 9)
        nan = np.full((NROW, NCOL), np.nan, np.float32)
        f["dist_g12"], f["dist_g3"] = (dist(g12 >= 0.005), dist(g3 >= 0.005)) if t >= 2020 else (nan, nan)
        f["g12_forest_n3"] = box(g12 * (forest > 0.5), 3)  # alerts inside what PRODES still calls forest
    if "glad2" in X:
        # the same alerts over more windows (unet/glad.py wide): the last month, half year and two years,
        # the change in the last quarter against the same quarter a year before, and alerts inside forest
        if t >= 2020:
            gw, gi, px = np.load(GRID / "gladwide.npz"), t - 2020, (C / 0.0001) ** 2
            g = {d: gw[f"g{d}"][gi].astype(np.float32) / px for d in (730, 365, 183, 92, 31)}
            inforest = forest > 0.5
            f["g31"], f["g31_n3"], f["g31_n9"] = g[31], box(g[31], 3), box(g[31], 9)
            f["g183"], f["g183_n3"], f["g183_n9"] = g[183], box(g[183], 3), box(g[183], 9)
            f["g730_n3"], f["g730_n9"] = box(g[730], 3), box(g[730], 9)
            f["g92_trend_n9"] = box(g[92] - gw["g92"][gi - 1].astype(np.float32) / px, 9) if gi else np.full((NROW, NCOL), np.nan, np.float32)
            f["g365_forest_n9"], f["g365_forest_n25"] = box(g[365] * inforest, 9), box(g[365] * inforest, 25)
            f["g92_forest_n3"], f["dist_g31"] = box(g[92] * inforest, 3), dist(g[31] >= 0.005)
        else:
            for name in ("g31", "g31_n3", "g31_n9", "g183", "g183_n3", "g183_n9", "g730_n3", "g730_n9", "g92_trend_n9",
                         "g365_forest_n9", "g365_forest_n25", "g92_forest_n3", "dist_g31"):
                f[name] = np.full((NROW, NCOL), np.nan, np.float32)
    if "aef" in X:
        # AlphaEarth satellite embeddings on this grid (unet/aef.py): the last full calendar year before the
        # forecast date and its change from the year before, 64 numbers each. Year t's own embedding would
        # hold imagery from after 31 July, so the newest one allowed is t-1.
        e = mc // 12 + 2000 - (1 if mc % 12 >= 6 else 2)  # a year's embedding is published some months into the next
        emb = lambda yr: np.load(GRID / "aef" / f"emb_{yr}.npy", mmap_mode="r") if (GRID / "aef" / f"emb_{yr}.npy").exists() else None
        a, b = emb(e), emb(e - 1)
        nan = np.full((NROW, NCOL), np.nan, np.float32)
        for k in range(64):
            now = np.asarray(a[k], np.float32) if a is not None else nan
            f[f"e{k}"] = now
            f[f"de{k}"] = now - np.asarray(b[k], np.float32) if a is not None and b is not None else nan
    if "dir" in X:  # which side the clearing is on: neighbourhood means displaced one width each way
        for km in (3, 9):
            n = (km * K) | 1
            for nm, a in (("d3sum", d3sum), ("cleared", cleared)):
                b = box(a, km)
                for tag, dy, dx in (("N", -n, 0), ("S", n, 0), ("W", 0, -n), ("E", 0, n)):
                    f[f"{tag}{km}_{nm}"] = ndi.shift(b, (dy, dx), order=0, mode="constant")
    if extra:
        extra(f, mc)
    return np.column_stack(list(f.cols.values())), f.idx, list(f.cols)


def train_rows(y, rng, n_neg=300_000):
    """All cells that lost forest in y, plus a weighted random sample of those that did not."""
    target = (defo(y) * 100).ravel()  # percent of cell
    w = []

    def pick(cand):
        ci = np.flatnonzero(cand.ravel())
        pos, neg = ci[target[ci] > 0], ci[target[ci] == 0]
        if os.environ.get("AZ_NEG") == "hard":
            # three in four negatives from where the model has to discriminate: within 9 km of recent
            # clearing. Each stratum keeps its own weight, so the fit stays unbiased.
            t = y - 1
            near = (box(defo(t) + defo(t - 1) + defo(t - 2), 9) > 0).ravel()[neg]
            parts, ws = [pos], [np.ones(len(pos))]
            for stratum, n in ((neg[near], 600_000), (neg[~near], 200_000)):
                take = rng.choice(stratum, min(n, len(stratum)), replace=False)
                parts.append(take); ws.append(np.full(len(take), len(stratum) / len(take)))
            w.append(np.concatenate(ws).astype(np.float32))
            return np.concatenate(parts)
        take = rng.choice(neg, min(n_neg, len(neg)), replace=False)
        w.append(np.concatenate([np.ones(len(pos)), np.full(len(take), len(neg) / len(take))]).astype(np.float32))
        return np.concatenate([pos, take])

    X, idx, names = features(y, pick=pick)
    return X, target[idx], w[0], names, idx


# AZ_TW and AZ_SEEDS carry the two tree settings the lab found worth having (docs/BENCH.md):
# a flatter Tweedie loss (1.1) and the average of three fits
PARAMS = dict(objective="tweedie", tweedie_variance_power=float(os.environ.get("AZ_TW", 1.3)), learning_rate=0.08, num_leaves=127,
              min_data_in_leaf=200, feature_fraction=0.8, bagging_fraction=0.8, bagging_freq=1,
              lambda_l2=1.0, verbose=-1, num_threads=int(os.environ.get("AZ_THREADS", 6)))


def fit(years, cache):
    t = np.concatenate([cache[y][1] for y in years])
    w = np.concatenate([cache[y][2] for y in years])
    # a list of per-year tables: LightGBM bins them without first making one joined copy
    ds = lgb.Dataset([cache[y][0] for y in years], t, weight=w, feature_name=cache[years[0]][3],
                     categorical_feature=["uf"], free_raw_data=False)
    params = PARAMS | ({"learning_rate": 0.04} if "long" in X else {})
    return Fits([lgb.train(params | {"seed": k}, ds, 1500 if "long" in X else 400) for k in range(int(os.environ.get("AZ_SEEDS", 1)))])


class Fits:
    """One or more fits of the same model, averaged."""

    def __init__(self, models):
        self.models = models

    def predict(self, X):
        return np.mean([m.predict(X) for m in self.models], axis=0)

    def save_model(self, path):
        for k, m in enumerate(self.models):
            m.save_model(str(path) if k == 0 else f"{path}.{k}")

    def feature_name(self):
        return self.models[0].feature_name()

    def feature_importance(self, kind):
        return np.mean([m.feature_importance(kind) for m in self.models], axis=0)


def score(pred, truth_km2, shape_idx, near=None):
    """Ranking skill of pred over the candidate cells.
    capture@k: share of the clearing that fell inside the top k% of forest cells by predicted risk."""
    order = np.argsort(-pred)
    cum = np.cumsum(truth_km2[order])
    total = cum[-1]
    out = {f"capture@{k}": float(cum[int(len(pred) * k / 100) - 1] / total) for k in (0.5, 1, 2, 5)}
    out["auprc"] = float(average_precision_score(truth_km2 >= 0.01, pred))
    if K > 1:  # finer grids are scored on a sample of cells, so there are no whole blocks to sum
        return _frontier(out, pred, truth_km2, total, near)
    # the same question at 5 km: sum forecast and outcome over 5x5 blocks, rank the blocks.
    # Area-controlled, unlike "share within X km of a flagged cell", which rewards scattered flags.
    def blocks(v):
        a = np.zeros(NROW * NCOL, np.float32)
        a[shape_idx] = v
        a = a.reshape(NROW, NCOL)[: NROW // 5 * 5, : NCOL // 5 * 5]
        return a.reshape(NROW // 5, 5, NCOL // 5, 5).sum(axis=(1, 3)).ravel()
    bp, bt, bn = blocks(pred - pred.min() + 1e-9), blocks(truth_km2), blocks(np.ones(len(pred)))
    live = bn > 0
    bo = np.argsort(-(bp[live] / bn[live]))
    bc = np.cumsum(bt[live][bo])
    for k in (1, 5):
        out[f"capture5km@{k}"] = float(bc[int(live.sum() * k / 100) - 1] / bc[-1])
    return _frontier(out, pred, truth_km2, total, near)


def _frontier(out, pred, truth_km2, total, near):
    if near is not None:  # skill on the new frontier: cells with no clearing nearby in three years
        far = near == 0
        o2 = np.argsort(-pred[far])
        c2 = np.cumsum(truth_km2[far][o2])
        out["frontier_share"] = float(c2[-1] / total)
        out["frontier_capture@5"] = float(c2[int(far.sum() * 0.05) - 1] / c2[-1])
    return out


def eval_pick(cand):
    """Every forest cell at 1 km. On finer grids a fixed random 1 in K*K, which keeps the table the
    same size and leaves the capture scores unbiased."""
    ci = np.flatnonzero(cand.ravel())
    return ci if K == 1 else ci[np.random.default_rng(7).random(len(ci)) < 1 / K ** 2]


def predict_map(model, feat):
    """Expected km2 for every forest cell. feat(pick) builds the feature table; finer grids are
    scored in K*K passes so the table never exceeds what 1 km needs."""
    risk = np.zeros(NROW * NCOL, np.float32)
    for j in range(K * K):
        X, idx, _ = feat(lambda cand: np.flatnonzero(cand.ravel())[j::K * K])
        risk[idx] = model.predict(X) * CELL_KM2.ravel()[idx] / 100
    return risk.reshape(NROW, NCOL)


def evaluate(model, y, truth=None):
    X, idx, names = features(y, pick=eval_pick)
    truth_km2 = ((defo(y) if truth is None else truth) * CELL_KM2).ravel()[idx]
    area = CELL_KM2.ravel()[idx]
    col = {n: i for i, n in enumerate(names)}
    pred = model.predict(X) * area / 100  # expected km2
    res = {"model": score(pred, truth_km2, idx, X[:, col["n9_d3sum"]])}
    res["model"]["pred_total_km2"], res["model"]["true_total_km2"] = float(pred.sum()), float(truth_km2.sum())
    for name, s in (("persistence_cell", X[:, col["d1"]] + 1e-6 * X[:, col["n9_d1"]]),
                    ("persistence_9km", X[:, col["n9_d1"]] + 1e-6 * X[:, col["n25_d1"]]),
                    ("edge_distance", -X[:, col["dist_cleared"]] + 0.5 * X[:, col["forest"]])):
        res[name] = score(s, truth_km2, idx, X[:, col["n9_d3sum"]])
    return res, pred, idx


def load_2026():
    """PRODES 2026 exists only for INPE's priority scenes; use it as year 2026 so 2027 can be forecast."""
    EXTRA[2026] = np.clip(np.load(GRID / "prodes2026pri.npy") / CELL_KM2, 0, 1)


def main(mode):
    OUT.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(0)
    cache = {}
    if mode == "cache":
        # Feature tables for pipeline/lab.py: build them once, then try a model in minutes.
        # AZ_YEARS=2011,2012,... ; each year gets its training rows and its scoring sample.
        cdir = OUT.parent / f"cache{F}{os.environ.get('AZ_NEG', '')}"
        cdir.mkdir(exist_ok=True)
        load_2026()
        for y in [int(x) for x in os.environ["AZ_YEARS"].split(",")]:
            X, t, w, names, idx = train_rows(y, np.random.default_rng(y))
            np.savez(cdir / f"train_{y}.npz", X=X, y=t, w=w, idx=idx)
            if "AZ_NEG" in os.environ:  # the scoring sample does not change: share the first cache's
                (cdir / f"eval_{y}.npz").symlink_to(OUT.parent / f"cache{F}" / f"eval_{y}.npz")
                json.dump(names, open(cdir / "names.json", "w"))
                print("cached", y, X.shape, flush=True)
                continue
            X, idx, names = features(y, pick=eval_pick)
            col = names.index("n9_d3sum")
            np.savez(cdir / f"eval_{y}.npz", X=X, idx=idx, truth=(defo(y) * CELL_KM2).ravel()[idx],
                     area=CELL_KM2.ravel()[idx], near=X[:, col])
            json.dump(names, open(cdir / "names.json", "w"))
            print("cached", y, X.shape, flush=True)
        return
    if mode == "eval":
        tests = [int(x) for x in os.environ["AZ_TESTS"].split(",")] if "AZ_TESTS" in os.environ else list(range(2019, LAST + 1))
        results = {}
        for y in range(FIRST_TARGET, max(tests)):
            cache[y] = train_rows(y, rng)
            print("rows", y, len(cache[y][1]), flush=True)
        for T in tests:
            model = fit(list(range(FIRST_TARGET, T)), cache)
            results[T], pred, idx = evaluate(model, T)
            np.savez(OUT / f"pred{T}.npz", idx=idx, pred=pred)  # for blending with other models
            if K == 1:  # the site replays these
                r = np.zeros(NROW * NCOL, np.float32)
                r[idx] = pred
                np.save(OUT / f"risk{T}.npy", r.reshape(NROW, NCOL))
            elif "AZ_MAPS" in os.environ:  # finer grids were scored on a sample; the full map costs K*K more passes
                np.save(OUT / f"risk{T}.npy", predict_map(model, lambda pick: features(T, pick=pick)).astype(np.float16))
            m, b = results[T]["model"], results[T]["persistence_9km"]
            print(T, {k: round(v, 3) for k, v in m.items()}, "| persistence@1", round(b["capture@1"], 3),
                  "edge@1", round(results[T]["edge_distance"]["capture@1"], 3), flush=True)
        json.dump(results, open(OUT / "eval.json", "w"), indent=1)
    else:
        for y in range(FIRST_TARGET, LAST + 1):
            cache[y] = train_rows(y, rng)
        model = fit(list(range(FIRST_TARGET, LAST + 1)), cache)
        model.save_model(OUT / "annual.txt")
        imp = dict(zip(model.feature_name(), model.feature_importance("gain").round().tolist()))
        json.dump(dict(sorted(imp.items(), key=lambda kv: -kv[1])), open(OUT / "importance.json", "w"), indent=1)
        # 2026: true out-of-sample. The model has never seen a 2026 label; truth is the priority-scene PRODES.
        load_2026()
        truth26 = EXTRA.pop(2026)
        res, pred, idx = evaluate(model, 2026, truth26)
        json.dump(res, open(OUT / "check2026.json", "w"), indent=1)
        np.save(OUT / "risk2026.npy", predict_map(model, lambda pick: features(2026, pick=pick)))
        print("2026", {k: round(v, 3) for k, v in res["model"].items()}, "| persistence@1",
              round(res["persistence_9km"]["capture@1"], 3))
        # 2027: the live forecast, features cut at 31 Jul 2026
        EXTRA[2026] = truth26
        risk = predict_map(model, lambda pick: features(2027, pick=pick))
        np.save(OUT / "risk2027.npy", risk)
        print("2027 forecast written, raw total km2", round(float(risk.sum())))


if __name__ == "__main__":
    main(sys.argv[1])
