"""Where the misses are. Takes the published 500 m forecast maps and splits the clearing that fell
outside the flagged 5% by every cut that could say what to build next: how far down the ranking it
sits, whether the model knew it was unsure, how near a flagged cell it was, whether it was only early
or late, how big the patch was, how far from recent clearing, and how much of the cell went.

  AZ_F=50 python anatomy.py <folder with blend500_<year>.npz> [years...]   -> prints, and writes anatomy.json there
"""
import json
import sys
from pathlib import Path

import numpy as np
import scipy.ndimage as ndi

sys.path.insert(0, str(Path(__file__).resolve().parent))
import model as m  # noqa: E402

folder = Path(sys.argv[1])
years = [int(a) for a in sys.argv[2:]] or [2022, 2023, 2024, 2025]
m.load_2026()
ONES = np.ones((3, 3), bool)


def top(risk, cand, q):
    order = np.sort(risk[cand])[::-1]
    return cand & (risk >= order[min(int(len(order) * q), len(order) - 1)])


def split(km, flag, cls, names, weight=None):
    """share of the clearing in each class, and the capture inside it"""
    out = {}
    for i, n in enumerate(names):
        k = km[cls == i].sum()
        out[n] = {"share": round(float(k / km.sum()), 4), "capture": round(float(km[(cls == i) & flag].sum() / max(k, 1e-9)), 4)}
        if weight is not None:
            out[n]["cells"] = round(float(weight[cls == i].sum() / weight.sum()), 4)
            out[n]["flagged"] = round(float((flag & (cls == i)).sum() / max(flag.sum(), 1)), 4)
    return out


res = {}
for y in years:
    risk = np.load(folder / f"blend500_{y}.npz")["risk"].astype(np.float32)
    forest = m.forest_at(y - 1)
    cand = m.INSIDE & (forest >= 0.01)
    frac = np.where(cand, m.defo(y), 0)
    km = (frac * m.CELL_KM2).astype(np.float64)
    total, flag, r = km.sum(), top(risk, cand, 0.05), {}
    r["curve"] = {q: round(float(km[top(risk, cand, q)].sum() / total), 4) for q in (0.01, 0.02, 0.05, 0.1, 0.2, 0.3, 0.5)}
    # does the model know how unsure it is? what it expects inside its own flag, against what fell there
    rs = risk.astype(np.float64) * cand
    r["implied_cap5"] = round(float(rs[flag].sum() / rs.sum()), 4)
    r["pred_over_true_total"] = round(float(rs.sum() / total), 3)
    edges, bands = (0, 0.01, 0.02, 0.05, 0.1, 0.2, 0.5, 1.0), {}
    for a, b in zip(edges[:-1], edges[1:]):
        mask = top(risk, cand, b) & ~(top(risk, cand, a) if a else np.zeros_like(cand))
        bands[f"{a}-{b}"] = [round(float(rs[mask].sum() / rs.sum()), 4), round(float(km[mask].sum() / total), 4)]
    r["rank_bands_pred_true"] = bands
    # near misses: clearing in cells that touch a flagged cell
    missed = km * ~flag
    for k in (1, 2, 4):
        dil = ndi.binary_dilation(flag, ONES, iterations=k) & cand
        x = dil.sum() / flag.sum()
        r[f"within_{k}_cells"] = {"of_missed": round(float(missed[dil].sum() / missed.sum()), 4), "area_x": round(float(x), 2),
                                  "capture": round(float(km[dil].sum() / total), 4),
                                  "model_at_same_area": round(float(km[top(risk, cand, 0.05 * x)].sum() / total), 4)}
    # timing: right place, wrong year?
    lost = frac >= 0.01
    r["flagged_cells_that_lost_forest"] = round(float((flag & lost).sum() / flag.sum()), 4)
    if y < 2026:
        f1 = np.where(cand, m.defo(y + 1), 0)
        km1 = f1 * m.CELL_KM2
        r["flagged_cells_that_lost_forest_within_2y"] = round(float((flag & (lost | (f1 >= 0.01))).sum() / flag.sum()), 4)
        r["this_flag_on_next_years_clearing"] = round(float(km1[flag].sum() / km1.sum()), 4)
        r["this_flag_on_two_years_clearing"] = round(float((km + km1)[flag].sum() / (km + km1).sum()), 4)
    prev = folder / f"blend500_{y - 1}.npz"
    if prev.exists():
        fp = top(np.load(prev)["risk"].astype(np.float32), m.INSIDE & (m.forest_at(y - 2) >= 0.01), 0.05)
        r["missed_but_flagged_the_year_before"] = round(float(missed[fp].sum() / missed.sum()), 4)
    # patch size, in connected 500 m cells that lost at least 1%
    lab, _ = ndi.label(lost, ONES)
    size = np.bincount(lab.ravel())
    size[0] = 0
    cls = np.where(lost, np.digitize(size[lab], [2, 5, 21, 101]), 5)
    cls = np.where(km > 0, cls, 6)
    r["patch_cells"] = split(km, flag, cls, ["1", "2-4", "5-20", "21-100", ">100", "under 1% of the cell"])
    # distance to clearing of the last three years
    recent = (m.defo(y - 1) + m.defo(y - 2) + m.defo(y - 3)) >= 0.01
    cls = np.where(cand, np.digitize(m.dist(recent), [0.01, 0.75, 1.5, 3, 6]), 9)
    r["km_from_recent_clearing"] = split(km, flag, cls, ["same cell", "next cell", "to 1.5", "to 3", "to 6", "beyond 6"], cand.astype(np.float64))
    cls = np.where(cand, np.digitize(forest, [0.25, 0.5, 0.9]), 9)
    r["forest_share_of_cell"] = split(km, flag, cls, ["under 25%", "25-50%", "50-90%", "over 90%"], cand.astype(np.float64))
    cls = np.where(km > 0, np.digitize(frac / np.maximum(forest, 1e-6), [0.05, 0.25, 0.5]), 9)
    r["share_of_cells_forest_lost"] = split(km, flag, cls, ["under 5%", "5-25%", "25-50%", "over 50%"])
    res[y] = r
    print(y, json.dumps(r), flush=True)
json.dump(res, open(folder / "anatomy.json", "w"), indent=1)
