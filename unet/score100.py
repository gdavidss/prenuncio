"""Score a forecast on the 100 m grid: flag the highest-ranked 5% of the standing forest, by area, and
count the share of the year's clearing inside. The same question as the 500 m benchmark with the
flagging unit set free, so a 500 m map and a 100 m map can be compared on equal flagged area.

  python score100.py <year> <100 m uint16 map> [<500 m blend npz> ...]
Prints capture at 1, 2, 5 and 10% of forest area for: the 100 m map, each 500 m map spread flat over
its cells, and each 500 m map with its mass placed inside each cell the way the 100 m map says.
"""
import sys
from pathlib import Path

import numpy as np

DATA = Path(__file__).resolve().parent.parent / "data"
year, fine = int(sys.argv[1]), np.load(sys.argv[2], mmap_mode="r")
cy, lc, res = (np.load(DATA / f"{n}.npy") for n in ("cy", "lc", "res"))
if year == 2026:
    d26 = np.load(DATA / "d26.npy")
    cy = np.where((d26 == 1) & (cy == 0) & (lc == 0), 26, cy).astype(cy.dtype)
tt = year - 2001
forest = (lc == 0) & ~((cy > 0) & (cy <= tt))
target = forest & (cy == tt + 1) & (res == 0)
R, C = cy.shape
QS = (0.01, 0.02, 0.05, 0.10)


def capture(level, nbins):
    """level: integer rank map (higher = riskier). Ties at the cut are counted in proportion."""
    hf = np.bincount(level[forest], minlength=nbins)[::-1].cumsum()
    ht = np.bincount(level[target], minlength=nbins)[::-1].cumsum()
    out = []
    for q in QS:
        budget = q * hf[-1]
        k = int(np.searchsorted(hf, budget))  # first bin (from the top) where the flagged area reaches the budget
        f0, t0 = (hf[k - 1], ht[k - 1]) if k else (0, 0)
        frac = (budget - f0) / max(hf[k] - f0, 1)
        out.append(round(float((t0 + frac * (ht[k] - t0)) / ht[-1]), 4))
    return out


def quant(a):
    """float map -> uint16 levels on a log scale"""
    la = np.log(np.maximum(a, 1e-12, dtype=np.float32))
    lo, hi = float(la[forest].min()), float(la[forest].max())
    return np.clip((la - lo) / max(hi - lo, 1e-9) * 65535, 0, 65535).astype(np.uint16)


p = np.asarray(fine)
print(year, "forest km2", int(forest.sum()) // 100, "cleared km2", int(target.sum()) // 100, flush=True)
print("100 m map                       ", dict(zip(QS, capture(p, 65536))), flush=True)
mean25 = p.reshape(R // 5, 5, C // 5, 5).mean((1, 3), dtype=np.float64).astype(np.float32)
up = lambda a: np.repeat(np.repeat(a, 5, 0), 5, 1)
f500 = forest.reshape(R // 5, 5, C // 5, 5).sum((1, 3)).astype(np.float32)
print("same map, flat inside 500 m cells", dict(zip(QS, capture(quant(up(mean25 / np.maximum(f500, 1))), 65536))), flush=True)
for f in sys.argv[3:]:
    b = np.load(f)["risk"].astype(np.float32)
    print(f, flush=True)
    print("  500 m blend, flat inside cells ", dict(zip(QS, capture(quant(up(b / np.maximum(f500, 1))), 65536))), flush=True)
    ratio = b / np.maximum(mean25, 1e-3)  # the blend's mass, placed inside each cell the way the 100 m map says
    print("  500 m blend, placed at 100 m   ", dict(zip(QS, capture(quant(up(ratio) * p.astype(np.float32)), 65536))), flush=True)
