"""A ranked list to act on. The forest is cut into 5 km blocks (10 x 10 cells) and each block gets the
number of its cells expected to lose a hectare in the year, which is the sum of the cells' chances. The
blocks are ranked, the top 500 are written with where they are and who holds the land, and the same ranking
is replayed on past years to say how often a priority block really lost forest.
Reads web/data/p<year>.png (pipeline/calibrate.py) and the public truth files.
Run: .venv/bin/python -I pipeline/priority.py   -> web/data/priority.json, web/data/priority.csv
"""
import csv
import json
from pathlib import Path

import numpy as np
import rasterio

ROOT = Path(__file__).resolve().parent.parent
WEB = ROOT / "web/data"
G = json.load(open(ROOT / "benchmark/data/grid.json"))
B, TOP = 10, 500
R, C = G["rows"] // B, G["cols"] // B
blocks = lambda a: a[:R * B, :C * B].reshape(R, B, C, B)
chance = lambda y: (rasterio.open(WEB / f"p{y}.png").read(1).astype(np.float32) / 255) ** 2


def rank(y):
    p = chance(y)
    exp = blocks(p).sum((1, 3))
    order = np.argsort(exp.ravel())[::-1][:TOP]
    return p, exp, order


out = {"block_km": 5, "top": TOP, "replay": {}}
for y in (2024, 2025, 2026):
    p, exp, order = rank(y)
    lost = blocks(np.load(ROOT / "benchmark/data" / f"truth_{y}.npz")["cleared"].astype(np.float32)).sum((1, 3)) / 100  # hectares
    out["replay"][y] = {"lost_10ha": round(float((lost.ravel()[order] >= 10).mean()), 3), "lost_1ha": round(float((lost.ravel()[order] >= 1).mean()), 3),
                        "share_of_clearing": round(float(lost.ravel()[order].sum() / lost.sum()), 3),
                        "expected_cells": round(float(exp.ravel()[order].sum())), "base_10ha": round(float((lost[exp > 0] >= 10).mean()), 4)}
    print(y, out["replay"][y])

p, exp, order = rank(2027)
st = np.load(ROOT / "data/grid/static.npz")
up = lambda a: np.repeat(np.repeat(a, 2, 0), 2, 1)[:R * B, :C * B]
major = lambda a, r, c: np.bincount(a[r * B:(r + 1) * B, c * B:(c + 1) * B].ravel()).argmax()
mun, ti, uc = up(st["mun"]), up(st["ti"]), up(st["uc_group"])
names = {int(s["id"]): (s["n"], s.get("s", "")) for s in json.load(open(WEB / "sectors_mun.json"))["items"]} if (WEB / "sectors_mun.json").exists() else {}
rows = []
for k, i in enumerate(order, 1):
    r, c = divmod(int(i), C)
    cell = p[r * B:(r + 1) * B, c * B:(c + 1) * B]
    code = int(major(np.maximum(mun, 0), r, c))
    n, s = names.get(code, ("", ""))
    land = "ti" if ti[r * B:(r + 1) * B, c * B:(c + 1) * B].mean() > 0.5 else "uc" if (uc[r * B:(r + 1) * B, c * B:(c + 1) * B] > 0).mean() > 0.5 else ""
    rows.append({"rank": k, "lat": round(G["north"] - (r + 0.5) * B * G["cell"], 4), "lon": round(G["west"] + (c + 0.5) * B * G["cell"], 4),
                 "expected_cells": round(float(exp[r, c]), 1), "max_chance": round(float(cell.max()), 3), "forest_cells": int((cell > 0).sum()),
                 "municipality": n, "state": s, "mun_code": code, "land": land})
out["year"], out["blocks"] = 2027, rows
by = {}
for x in rows:
    by[(x["municipality"], x["state"])] = by.get((x["municipality"], x["state"]), 0) + 1
print("2027 top block:", rows[0]); print("municipalities with most priority blocks:", sorted(by.items(), key=lambda kv: -kv[1])[:8])
print("land:", {k: sum(x["land"] == k for x in rows) for k in ("", "ti", "uc")}, "| expected cells in the top 500:", round(sum(x["expected_cells"] for x in rows)))
json.dump(out, open(WEB / "priority.json", "w"))
with open(WEB / "priority.csv", "w", newline="") as f:
    w = csv.DictWriter(f, list(rows[0])); w.writeheader(); w.writerows(rows)
