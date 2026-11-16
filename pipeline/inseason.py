"""What is later information worth? The yearly forecast is dated 31 July and covers August to July.
This takes the published map and adds the DETER clearing alerts of the first k months of that same
PRODES year, crudely: an alerted cell gets its alert area as expected clearing, and its neighbours a
share of it. No model is refitted, so this is a floor for what a forecast re-issued in season would do.
The second number is the capture counted only on clearing in cells with no alert yet, which is the
part that is still a forecast.

  AZ_F=50 python inseason.py <folder with blend500_<year>.npz>
"""
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import scipy.ndimage as ndi

sys.path.insert(0, str(Path(__file__).resolve().parent))
import model as m  # noqa: E402

folder = Path(sys.argv[1])
m.load_2026()
D = pd.read_parquet(m.GRID / "deter.parquet")
D = D[D.grp == 0]


def cap5(score, cand, km):
    order = np.sort(score[cand])[::-1]
    flag = cand & (score >= order[int(len(order) * 0.05)])
    return float(km[flag].sum() / km.sum()), flag


rows = {}
for y in (2022, 2023, 2024, 2025):
    risk = np.load(folder / f"blend500_{y}.npz")["risk"].astype(np.float32)
    cand = m.INSIDE & (m.forest_at(y - 1) >= 0.01)
    km = np.where(cand, m.defo(y) * m.CELL_KM2, 0).astype(np.float64)
    risk = risk * cand * float(km.sum() / (risk * cand).sum(dtype=np.float64))  # the yearly total is another model's job
    aug = (y - 1 - 2016) * 12 + 7
    row = {"31 July": round(cap5(risk, cand, km)[0], 4)}
    for k in (1, 2, 3, 6, 9):
        d = D[(D.ym >= aug) & (D.ym < aug + k)]
        alert = np.bincount(d.cell.to_numpy(), d.km2.to_numpy(), risk.size).reshape(risk.shape).astype(np.float32)
        near = ndi.uniform_filter(alert, 3, mode="constant")
        cap, flag = cap5(risk + alert + near, cand, km)
        rest = np.where(alert > 0, 0, km)  # clearing in cells with no alert yet
        row[f"+{k} months"] = [round(cap, 4), round(float(rest[flag].sum() / rest.sum()), 4), round(float(1 - rest.sum() / km.sum()), 3)]
    rows[y] = row
    print(y, row, flush=True)
print("mean", {k: (np.round(np.mean([rows[y][k] for y in rows], 0), 3).tolist()) for k in rows[2022]})
