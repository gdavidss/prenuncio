"""A probability for every forest cell. The forecast maps rank cells by expected clearing; this turns each
cell's score into the chance that the cell loses at least one hectare in the PRODES year, and checks the
chance against what happened.

The mapping is isotonic (it keeps the ranking) and is fitted on the forecasts of earlier years against their
outcomes, so the probabilities of year T never see year T: for T in 2024..2026 the two years before, for
2027 the years 2024 and 2025 (2026 is mapped for priority scenes only and would pull every chance down).
Reads the published maps and the public truth files, so anyone can rerun it:
  python pipeline/calibrate.py <folder with blend500_<year>.npz>
Writes web/data/p<year>.png (uint8, 255 * sqrt(chance), 0 outside forest) and web/data/prob.json with the
reliability of each tested year.
"""
import json
import sys
from pathlib import Path

import numpy as np
import rasterio
from sklearn.isotonic import IsotonicRegression

ROOT = Path(__file__).resolve().parent.parent
folder = Path(sys.argv[1])
HA = 100  # pixels of 10 m in one hectare
BINS = [0, 0.001, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.4, 1.0001]
rng = np.random.default_rng(0)


def year(y):
    risk = np.load(folder / f"blend500_{y}.npz")["risk"].astype(np.float32)
    f = ROOT / "benchmark/data" / f"truth_{y}.npz"
    if not f.exists():
        return risk, None, None
    t = np.load(f)
    cand = (t["inside"] == 1) & (t["forest"] >= 25)
    return risk, cand, t["cleared"] >= HA


def fit(years):
    xs, ys = [], []
    for y in years:
        risk, cand, hit = year(y)
        idx = rng.choice(np.flatnonzero(cand), 4_000_000, replace=False)
        xs.append(risk.ravel()[idx]); ys.append(hit.ravel()[idx])
    return IsotonicRegression(y_min=0, y_max=1, out_of_bounds="clip").fit(np.concatenate(xs), np.concatenate(ys).astype(np.float32))


def paint(y, p, cand):
    v = np.where(cand, np.maximum(np.round(255 * np.sqrt(p)), 1), 0).astype(np.uint8)  # 1 = forest with a chance under 0.002%
    f = ROOT / "web/data" / f"p{y}.png"
    with rasterio.open(f, "w", driver="PNG", width=v.shape[1], height=v.shape[0], count=1, dtype="uint8") as ds:
        ds.write(v, 1)
    for aux in f.parent.glob(f.name + ".aux.xml"):
        aux.unlink()


out = {"event": "the cell loses at least one hectare in the PRODES year", "scale": "value = 255 * sqrt(chance); 0 = not forest", "years": {}}
for T, train in ((2024, (2022, 2023)), (2025, (2023, 2024)), (2026, (2024, 2025))):
    iso = fit(train)
    risk, cand, hit = year(T)
    p = iso.predict(risk.ravel()).reshape(risk.shape).astype(np.float32)
    pc, hc = p[cand], hit[cand]
    base = hc.mean()
    rel = []
    for lo, hi in zip(BINS[:-1], BINS[1:]):
        m = (pc >= lo) & (pc < hi)
        if m.any():
            rel.append([lo, min(hi, 1), round(float(pc[m].mean()), 5), round(float(hc[m].mean()), 5), int(m.sum()), int(hc[m].sum())])
    brier, ref = float(((pc - hc) ** 2).mean()), float(base * (1 - base))
    out["years"][T] = {"fitted_on": list(train), "cells": int(cand.sum()), "expected_cells": round(float(pc.sum())), "actual_cells": int(hc.sum()),
                       "brier_skill": round(1 - brier / ref, 4), "reliability": rel}
    print(T, "fitted on", train, "| cells expected to lose a hectare", round(float(pc.sum())), "actual", int(hc.sum()), "| Brier skill", round(1 - brier / ref, 3), flush=True)
    for r in rel:
        print(f"    chance {100 * r[0]:5.1f}% to {100 * r[1]:5.1f}%: said {100 * r[2]:6.2f}%, happened {100 * r[3]:6.2f}%  ({r[4]:,} cells, {r[5]:,} cleared)")
    paint(T, p, cand)
# the years before the truth files start, and the forecast: painted with the nearest honest mapping
iso = fit((2024, 2025))
for y in (2022, 2023, 2027):
    risk, cand, _ = year(y)
    if cand is None:  # 2027: forest as of the 2026 truth file, minus what 2026 cleared
        t = np.load(ROOT / "benchmark/data/truth_2026.npz")
        cand = (t["inside"] == 1) & (t["forest"].astype(np.int32) - t["cleared"] >= 25)
    p = iso.predict(risk.ravel()).reshape(risk.shape).astype(np.float32)
    paint(y, p, cand)
    if y == 2027:
        pc = p[cand]
        out["forecast"] = {"year": 2027, "fitted_on": [2024, 2025], "cells": int(cand.sum()), "expected_cells": round(float(pc.sum())),
                           "cells_by_chance": [[lo, min(hi, 1), int(((pc >= lo) & (pc < hi)).sum())] for lo, hi in zip(BINS[:-1], BINS[1:])]}
        print("2027:", out["forecast"])
json.dump(out, open(ROOT / "web/data/prob.json", "w"))
