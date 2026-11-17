"""Clearing permits (SINAFLOR authorisations of vegetation suppression) as bit planes on the 100 m grid, for
the convolutional model. Reads data/asv_slim.csv (columns issued, valid_until, lat, lon, ha: no names).
Output data/pb.npy: int16, two bits per 31 July from 2020 to 2026: the cell lies inside a permit valid on
that date (a disc of the authorised area around the property's centre point), and inside one issued in the
12 months before it.
Run: python permits100.py
"""
import json
from pathlib import Path

import numpy as np
import pandas as pd

DATA = Path(__file__).resolve().parent.parent / "data"
G = json.load(open(DATA / "grid100.json"))
d = pd.read_csv(DATA / "asv_slim.csv", dtype=str)
num = lambda c: pd.to_numeric(d[c].str.replace(",", "."), errors="coerce")
d = d.assign(t0=pd.to_datetime(d.issued, format="%d/%m/%Y", errors="coerce"), t1=pd.to_datetime(d.valid_until, format="%d/%m/%Y", errors="coerce"),
             r=(G["north"] - num("lat")) / G["cell"], c=(num("lon") - G["west"]) / G["cell"], ha=num("ha")).dropna(subset=["t0", "r", "c", "ha"])
d = d[(d.r >= 0) & (d.r < G["rows"]) & (d.c >= 0) & (d.c < G["cols"]) & (d.ha >= 5)]
pb = np.zeros((G["rows"], G["cols"]), np.int16)
km = G["cell"] * 111.0
for k, y in enumerate(range(2020, 2027)):
    cut = pd.Timestamp(y, 7, 31)
    valid = d[(d.t0 <= cut) & (d.t1.isna() | (d.t1 > cut))]
    for bit, rows in ((2 * k, valid), (2 * k + 1, valid[valid.t0 > cut - pd.Timedelta(days=365)])):
        for r0, c0, ha in zip(rows.r, rows.c, rows.ha):
            rad = np.sqrt(ha / 100 / np.pi) / km + 0.7
            n, a, b = int(np.ceil(rad)), int(r0), int(c0)
            ys, xs = slice(max(a - n, 0), min(a + n + 1, G["rows"])), slice(max(b - n, 0), min(b + n + 1, G["cols"]))
            yy, xx = np.ogrid[ys, xs]
            pb[ys, xs] |= (((yy - r0) ** 2 + (xx - c0) ** 2 <= rad ** 2) << bit).astype(np.int16)
    print(y, len(valid), "valid permits,", int((pb >> (2 * k) & 1).sum()) // 100, "km2 inside them", flush=True)
np.save(DATA / "pb.npy", pb)
assert 500 < int((pb >> 12 & 1).sum()) // 100 < 20000  # 2026: a few thousand km2 of authorised area on the grid
