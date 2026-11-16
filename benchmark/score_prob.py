"""Probability track of the Prenúncio benchmark. Needs numpy, nothing from this project.

  python benchmark/score_prob.py <folder> [--data DIR] [--years 2024 2025 2026]
  python benchmark/score_prob.py --selftest

The folder holds one map per year, <year>.npy or <year>.npz (key `p`), float16 or float32 [rows, cols] on
the grid in data/grid.json: the chance, between 0 and 1, that the cell loses at least one hectare (100 of
its 2500 pixels) in PRODES year <year>. The chances of year T may use outcomes up to T-1 only, like every
forecast here, so the scored years start at 2024: 2022 and 2023 are there to calibrate on.

Candidate cells are inside the Legal Amazon and hold at least 1% forest on 31 July of year-1.
Scores for one year:
  brier_skill  1 - Brier score / Brier score of giving every cell the year's base rate. 0 is no skill, 1 is perfect.
  log_loss     mean negative log likelihood, chances clipped to [1e-6, 1 - 1e-6]. Lower is better.
  count_ratio  cells expected to lose a hectare (the sum of the chances) over cells that did. 1 is right.
  ece          expected calibration error: over ten bands of chance, the cell-weighted mean gap between the
               chance given and the share that happened, as a share of the base rate. 0 is perfect.
The mean is taken over 2024 and 2025. 2026 is mapped for priority scenes only and is reported apart.
"""
import argparse
import json
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
BANDS = np.array([0, 0.001, 0.005, 0.01, 0.02, 0.05, 0.1, 0.2, 0.4, 0.7, 1.0001])


def score(p, cand, hit):
    p, y = np.clip(p[cand].astype(np.float64), 0, 1), hit[cand].astype(np.float64)
    base = y.mean()
    q = np.clip(p, 1e-6, 1 - 1e-6)
    band = np.digitize(p, BANDS) - 1
    n, sp, sy = (np.bincount(band, w, len(BANDS)) for w in (None, p, y))
    ece = float(np.abs(sp - sy).sum() / len(p) / base)
    return {"brier_skill": round(float(1 - ((p - y) ** 2).mean() / (base * (1 - base))), 4), "log_loss": round(float(-(y * np.log(q) + (1 - y) * np.log(1 - q)).mean()), 5),
            "count_ratio": round(float(p.sum() / y.sum()), 4), "ece": round(ece, 4), "cells": int(len(p)), "events": int(y.sum())}


def load(folder, y):
    for f in (Path(folder) / f"{y}.npz", Path(folder) / f"{y}.npy"):
        if f.exists():
            a = np.load(f)
            return (a["p"] if f.suffix == ".npz" else a).astype(np.float32)
    raise SystemExit(f"no map for {y} in {folder}")


def selftest():
    rng = np.random.default_rng(0)
    p = rng.beta(0.3, 20, (400, 400)).astype(np.float32)
    hit, cand = rng.random(p.shape) < p, np.ones(p.shape, bool)
    good, flat, off = score(p, cand, hit), score(np.full_like(p, hit.mean()), cand, hit), score(np.clip(p * 2, 0, 1), cand, hit)
    assert good["brier_skill"] > 0.02 and abs(good["count_ratio"] - 1) < 0.05 and good["ece"] < 0.08, good
    assert abs(flat["brier_skill"]) < 1e-3 and flat["log_loss"] > good["log_loss"], flat
    assert off["count_ratio"] > 1.8 and off["ece"] > 0.5 and off["brier_skill"] < good["brier_skill"], off
    print("selftest ok", good)


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("folder", nargs="?"); ap.add_argument("--data", default=HERE / "data"); ap.add_argument("--years", nargs="*", type=int, default=[2024, 2025, 2026])
    ap.add_argument("--out"); ap.add_argument("--selftest", action="store_true")
    a = ap.parse_args()
    if a.selftest:
        return selftest()
    res = {}
    for y in a.years:
        t = np.load(Path(a.data) / f"truth_{y}.npz")
        res[y] = score(load(a.folder, y), (t["inside"] == 1) & (t["forest"] >= 25), t["cleared"] >= 100)
        print(y, " ".join(f"{k}={v}" for k, v in res[y].items()))
    core = [res[y] for y in (2024, 2025) if y in res]
    if core:
        res["mean"] = {k: round(float(np.mean([r[k] for r in core])), 4) for k in ("brier_skill", "log_loss", "count_ratio", "ece")}
        print("mean 2024 to 2025", " ".join(f"{k}={v}" for k, v in res["mean"].items()))
    if a.out:
        json.dump(res, open(a.out, "w"), indent=1)


if __name__ == "__main__":
    main()
