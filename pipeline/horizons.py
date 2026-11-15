"""Shorter horizons and fire: the same grid and features as the annual model, forecast date moved
to any quarter end.

Targets, all from INPE DETER (daily alerts since Aug 2016):
  clear3, clear6  clearing-class alert area in the next 3 and 6 months
  scar12          forest burn scar area in the next 12 months (DETER maps fire scars inside forest,
                  which is the fire that threatens standing forest; most satellite fire detections
                  are pasture burning)
Test: forecast dates from Oct 2024 on, model trained only on targets fully observed before that.
Run: .venv/bin/python -I pipeline/horizons.py eval|forecast
"""
import json
import sys
from pathlib import Path

import lightgbm as lgb
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import model as m  # noqa: E402

# name -> (DETER group, months ahead). Beyond clear-cutting and fire, two more ways the forest is lost:
# degr12 is degradation and selective logging (the forest stays on the map but is hollowed out),
# mine12 is mining, mostly wildcat gold (small in area, severe for rivers and Indigenous lands)
TARGETS = {"clear3": (0, 3), "clear6": (0, 6), "scar12": (2, 12), "degr12": (1, 12), "mine12": (3, 12)}
LAST_MC = 321  # Oct 2026, the last complete DETER month (months since 2000-01)
ORIGINS = list(range(210, LAST_MC + 1, 3))  # quarter ends from Jul 2017
TEST_FROM = 297  # Oct 2024
NAIVE = {"clear3": "alert12_n9", "clear6": "alert12_n9", "scar12": "scar12_n9", "degr12": "degr12_n9", "mine12": "mine12_n9"}


def climate(mc):
    """ENSO and tropical North Atlantic state known at the end of month mc."""
    raw = m.ROOT / "data/raw/climate"
    season = "DJF JFM FMA MAM AMJ MJJ JJA JAS ASO SON OND NDJ".split()
    oni = {}
    for line in open(raw / "oni.txt").read().split("\n")[1:]:
        p = line.split()
        if len(p) == 4:
            oni[(int(p[1]) - 2000) * 12 + season.index(p[0]) + 1] = float(p[3])  # keyed by the season's last month
    tna = {}
    for line in open(raw / "tna.txt").read().split("\n")[1:]:
        p = line.split()
        if len(p) == 13 and p[0].isdigit():
            for k, v in enumerate(p[1:]):
                if float(v) > -90:
                    tna[(int(p[0]) - 2000) * 12 + k] = float(v)
    last = lambda d: d[max(k for k in d if k <= mc)]
    return last(oni), last(tna)


def prodes_known(mc):
    """Latest PRODES year whose map is out by the end of month mc (INPE publishes around October)."""
    return min(2026, (mc - 9) // 12 + 2000)


def _extra(f, mc):
    years = (mc - 36 + 1) / 12  # fire record starts Jan 2003
    clim = m.events("fire", 36, mc) / years
    f["fire_clim"], f["fire_clim_n9"] = clim, m.box(clim, 9)
    mine = m.deter(3, mc - 192 - 11, mc - 192)
    f["mine12"], f["mine12_n9"], f["dist_mine"] = mine, m.box(mine, 9), m.dist(m.deter(3, 7, mc - 192) > 0)
    oni, tna = climate(mc)
    f["oni"], f["tna"] = np.full(clim.shape, oni, np.float32), np.full(clim.shape, tna, np.float32)


def feats(mc, pick=None):
    return m.features(prodes_known(mc) + 1, mc, pick, _extra)


def target(name, mc):
    grp, h = TARGETS[name]
    if mc + h > LAST_MC:
        return None
    return m.deter(grp, mc - 192 + 1, mc - 192 + h) * 100  # percent of cell


def rows(mc, rng, n_neg=60_000):
    ys = {k: target(k, mc) for k in TARGETS}
    w = []

    def pick(cand):
        ci = np.flatnonzero(cand.ravel())
        anyp = np.zeros(len(ci), bool)
        for y in ys.values():
            if y is not None:
                anyp |= y.ravel()[ci] > 0
        pos, neg = ci[anyp], ci[~anyp]
        w.append(np.concatenate([np.ones(len(pos)), np.full(n_neg, len(neg) / n_neg)]).astype(np.float32))
        return np.concatenate([pos, rng.choice(neg, n_neg, replace=False)])

    X, idx, names = feats(mc, pick)
    t = {k: (np.full(len(idx), np.nan, np.float32) if y is None else y.ravel()[idx]) for k, y in ys.items()}
    return X, t, w[0], names


def fit(name, cache, origins):
    y = np.concatenate([cache[o][1][name] for o in origins])
    w = np.concatenate([cache[o][2] for o in origins])
    ds = lgb.Dataset([cache[o][0] for o in origins], y, weight=w, feature_name=cache[origins[0]][3], categorical_feature=["uf"])
    return lgb.train(m.PARAMS, ds, 300)


def main(mode):
    m.load_2026()
    m.OUT.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(1)
    cache = {}
    for o in ORIGINS:
        cache[o] = rows(o, rng)
        print("rows", o, len(cache[o][2]), flush=True)
    res = {}
    for name, (grp, h) in TARGETS.items():
        usable = [o for o in ORIGINS if o + h <= LAST_MC]
        if mode == "eval":
            model = fit(name, cache, [o for o in usable if o + h <= TEST_FROM])
            res[name] = {}
            for o in [o for o in usable if o >= TEST_FROM]:
                X, idx, names = feats(o, m.eval_pick)
                area = m.CELL_KM2.ravel()[idx]
                truth = target(name, o).ravel()[idx] * area / 100
                if truth.sum() == 0:
                    continue
                col = {n: i for i, n in enumerate(names)}
                r = {"model": m.score(model.predict(X) * area / 100, truth, idx),
                     "naive": m.score(X[:, col[NAIVE[name]]] + 1e-6 * X[:, col["n25_d1"]], truth, idx),
                     "true_km2": float(truth.sum())}
                res[name][o] = r
                print(name, o, {k: round(v, 3) for k, v in r["model"].items()}, "| naive@1",
                      round(r["naive"]["capture@1"], 3), "@5", round(r["naive"]["capture@5"], 3), flush=True)
            json.dump(res, open(m.OUT / "horizons_eval.json", "w"), indent=1)
        else:
            model = fit(name, cache, usable)
            risk = m.predict_map(model, lambda pick: feats(LAST_MC, pick))
            np.save(m.OUT / f"risk_{name}.npy", risk)
            imp = dict(zip(model.feature_name(), model.feature_importance("gain").round().tolist()))
            json.dump(dict(sorted(imp.items(), key=lambda kv: -kv[1])), open(m.OUT / f"importance_{name}.json", "w"), indent=1)
            print(name, "forecast written, total km2", round(float(risk.sum())), flush=True)


if __name__ == "__main__":
    main(sys.argv[1])
