"""Does last year's miss say how to fix this year's ranking? The published maps are near calibrated on
average but drift by regime: clearing far from recent clearing is under-predicted in falling years.
For each year T this takes the forecast of T-1 (made without T-1's outcome), measures actual over
predicted clearing in coarse groups of cells, and multiplies the forecast of T by those ratios.
Only outcomes up to T-1 are used, the same as the models themselves.

  AZ_F=50 python recal.py <folder with blend500_<year>.npz>
"""
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import model as m  # noqa: E402

folder = Path(sys.argv[1])
m.load_2026()
UF = np.load(m.GRID / "static.npz")["uf"]


def year(y):
    risk = np.load(folder / f"blend500_{y}.npz")["risk"].astype(np.float32)
    forest = m.forest_at(y - 1)
    cand = m.INSIDE & (forest >= 0.01)
    km = np.where(cand, m.defo(y) * m.CELL_KM2, 0).astype(np.float32) if y <= 2026 else None
    recent = (m.defo(y - 1) + m.defo(y - 2) + m.defo(y - 3)) >= 0.01
    d = np.digitize(m.dist(recent), [0.01, 0.75, 1.5, 3, 6]).astype(np.int16)
    f = np.digitize(forest, [0.25, 0.5, 0.9]).astype(np.int16)
    q = np.zeros(risk.shape, np.int16)  # rank band inside the forecast: is the top over- or under-confident?
    order = np.sort(risk[cand])[::-1]
    for cut in (0.01, 0.02, 0.05, 0.1, 0.2):
        q += (risk < order[int(len(order) * cut)])
    return dict(risk=risk * cand, cand=cand, km=km, d=d, f=f, q=q, uf=UF.astype(np.int16))


def cap5(risk, Y):
    order = np.sort(risk[Y["cand"]])[::-1]
    return float(Y["km"][Y["cand"] & (risk >= order[int(len(order) * 0.05)])].sum() / Y["km"].sum())


GROUPS = {"distance": lambda Y: Y["d"], "distance x forest": lambda Y: Y["d"] * 4 + Y["f"],
          "distance x rank": lambda Y: Y["d"] * 6 + Y["q"], "distance x forest x state": lambda Y: (Y["d"] * 4 + Y["f"]) * 64 + Y["uf"],
          "distance x rank x state": lambda Y: (Y["d"] * 6 + Y["q"]) * 64 + Y["uf"]}


def factors(Y, g, prior=20.0):
    """actual / predicted clearing per group in a finished year, shrunk toward the overall ratio"""
    n = int(g.max()) + 1
    pred = np.bincount(g[Y["cand"]], Y["risk"][Y["cand"]].astype(np.float64), n)
    true = np.bincount(g[Y["cand"]], Y["km"][Y["cand"]].astype(np.float64), n)
    overall = true.sum() / pred.sum()
    return (true + prior * overall) / (pred + prior) / overall


prev, gains = None, {}
for y in range(2019, 2027):
    Y = year(y)
    if prev is not None:
        base = cap5(Y["risk"], Y)
        row = {"base": round(base, 4)}
        for name, fn in GROUPS.items():
            fac = factors(prev, fn(prev))
            g = fn(Y)
            fac = np.concatenate([fac, np.ones(max(int(g.max()) + 1 - len(fac), 0))])
            for a in (0.5, 1.0):
                row[f"{name} ^{a}"] = round(cap5(Y["risk"] * (fac[g] ** a).astype(np.float32), Y) - base, 4)
        print(y, row, flush=True)
        for k, v in row.items():
            gains.setdefault(k, []).append(v)
        if y == 2020:
            print("   distance factors from 2019:", np.round(factors(prev, prev["d"]), 2).tolist(), flush=True)
    prev = Y
print("mean 2020-2025:", {k: round(float(np.mean(v[:-1])), 4) for k, v in gains.items()})
print("2022-2025:", {k: round(float(np.mean(v[2:-1])), 4) for k, v in gains.items()})
