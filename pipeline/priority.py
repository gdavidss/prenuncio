"""A ranked list to act on. The forest is cut into 5 km blocks (10 x 10 cells) and each block gets the
number of its cells expected to lose a hectare in the year, which is the sum of the cells' chances. The
blocks are ranked, the top 500 are written with where they are and who holds the land, and the same ranking
is replayed on past years to say how often a priority block really lost forest.
Each priority block also carries what the model was looking at there on the forecast date ("why"): clearing
in and around it over three years, alerts of the last twelve months, valid clearing permits, IBAMA notices.
These are things the model reads, not causes.
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

# ---- what the model saw around each block on 31 July 2026
import pandas as pd  # noqa: E402
from scipy import ndimage as ndi  # noqa: E402

around = lambda a: ndi.uniform_filter(a.astype(np.float64), 3, mode="constant") * 9  # the block and the eight around it
clr = sum(blocks(np.load(ROOT / "benchmark/data" / f"truth_{y}.npz")["cleared"].astype(np.float32)).sum((1, 3)) for y in (2024, 2025, 2026)) / 10000  # km2, three PRODES years
G1 = json.load(open(ROOT / "data/grid/grid.json"))
to_blocks = lambda flat: flat.reshape(G1["rows"], G1["cols"])[:R * 5, :C * 5].reshape(R, 5, C, 5).sum((1, 3))
det = pd.read_parquet(ROOT / "data/grid/deter.parquet")
det = det[(det.ym >= 115) & (det.ym <= 126)]  # August 2025 to July 2026, in months since 2016-01
alert = {k: to_blocks(np.bincount(det.cell[det.grp == g], det.km2[det.grp == g], G1["rows"] * G1["cols"])) for k, g in (("clear", 0), ("degr", 1), ("scar", 2), ("mine", 3))}
aut = pd.read_parquet(ROOT / "data/grid/autos.parquet"); aut = aut[(aut.m >= 307) & (aut.m <= 318)]  # the same twelve months, since 2000-01
notices = to_blocks(np.bincount(aut.cell, aut.n, G1["rows"] * G1["cols"]))
num = lambda s_: pd.to_numeric(s_.str.replace(",", "."), errors="coerce")
asv = pd.read_csv(ROOT / "data/raw/sinaflor/asv.csv", sep=";", dtype=str, encoding="latin-1", on_bad_lines="skip",
                  usecols=["NRO_AUTORIZACAO", "DATA_DE_EMISSAO", "DATA_DE_VALIDADE", "LATITUDE_PONTO_CENTR_EMPREEND", "LONGITUDE_PONTO_CENTR_EMPREEND", "AREA_TOTAL_PROJ"]).drop_duplicates("NRO_AUTORIZACAO")
day = lambda s_: pd.to_datetime(s_, format="%d/%m/%Y", errors="coerce")
cut = pd.Timestamp(2026, 7, 31)
asv = asv[(day(asv.DATA_DE_EMISSAO) <= cut) & (day(asv.DATA_DE_VALIDADE).isna() | (day(asv.DATA_DE_VALIDADE) > cut))]
br, bc = ((G["north"] - num(asv.LATITUDE_PONTO_CENTR_EMPREEND)) / (B * G["cell"])), ((num(asv.LONGITUDE_PONTO_CENTR_EMPREEND) - G["west"]) / (B * G["cell"]))
ok = (br >= 0) & (br < R) & (bc >= 0) & (bc < C)
permit = np.zeros((R, C)); np.add.at(permit, (br[ok].astype(int), bc[ok].astype(int)), num(asv.AREA_TOTAL_PROJ)[ok].fillna(0))
forestb = exp > 0
WHY = {"cleared_3y_km2": clr, "cleared_3y_around_km2": around(clr), "clearing_alerts_12m_km2": around(alert["clear"]), "degradation_12m_km2": around(alert["degr"]),
       "fire_scar_12m_km2": around(alert["scar"]), "mining_12m_km2": around(alert["mine"]), "permit_ha": around(permit), "ibama_notices_12m": around(notices)}
TYPICAL = {k: float(v[forestb].mean()) for k, v in WHY.items()}
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
                 "municipality": n, "state": s, "mun_code": code, "land": land,
                 "why": {**{k: round(max(float(v[r, c]), 0.0), 2 if k != "ibama_notices_12m" else 0) for k, v in WHY.items()},
                         "forest_share": round(float((cell > 0).mean()), 2), "times_typical_clearing": round(float(WHY["cleared_3y_around_km2"][r, c] / max(TYPICAL["cleared_3y_around_km2"], 1e-9)), 1)}})
out["year"], out["blocks"] = 2027, rows
out["why"] = {"about": "What the model was looking at on 31 July 2026. 'around' sums the block and the eight blocks touching it (15 km square). These are things the model reads, not causes.",
              "typical_forest_block": {k: round(v, 3) for k, v in TYPICAL.items()},
              "share_of_blocks_with": {k: round(float(np.mean([x["why"][k] > 0 for x in rows])), 2) for k in WHY}}
by = {}
for x in rows:
    by[(x["municipality"], x["state"])] = by.get((x["municipality"], x["state"]), 0) + 1
print("2027 top block:", rows[0]); print("municipalities with most priority blocks:", sorted(by.items(), key=lambda kv: -kv[1])[:8])
print("land:", {k: sum(x["land"] == k for x in rows) for k in ("", "ti", "uc")}, "| expected cells in the top 500:", round(sum(x["expected_cells"] for x in rows)))
json.dump(out, open(WEB / "priority.json", "w"))
with open(WEB / "priority.csv", "w", newline="") as f:
    flat = [{**{k: v for k, v in x.items() if k != "why"}, **x["why"]} for x in rows]
    w = csv.DictWriter(f, list(flat[0])); w.writeheader(); w.writerows(flat)
