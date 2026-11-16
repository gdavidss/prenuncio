"""Clearing permits (SINAFLOR authorisations of vegetation suppression) against what was cleared.
Question: on 31 July, does a valid permit say something the forecast does not already know?
For each PRODES year T the permits issued on or before 31 July of T-1 and still valid on 1 August are laid
on the 500 m grid as a disc of the authorised area around the property's centre point. Inside those discs
this compares the cells the published forecast expected to lose a hectare with the cells that did.
The file holds holders' names and tax numbers; only number, dates, state, point and area are read.
Run: .venv/bin/python -I pipeline/permits.py   (data/raw/sinaflor/asv.csv from IBAMA open data)
"""
import json
from pathlib import Path

import numpy as np
import pandas as pd
import rasterio

ROOT = Path(__file__).resolve().parent.parent
G = json.load(open(ROOT / "benchmark/data/grid.json"))
USE = ["NRO_AUTORIZACAO", "DATA_DE_EMISSAO", "DATA_DE_VALIDADE", "UF", "LATITUDE_PONTO_CENTR_EMPREEND", "LONGITUDE_PONTO_CENTR_EMPREEND", "AREA_TOTAL_PROJ"]
num = lambda s: pd.to_numeric(s.str.replace(",", "."), errors="coerce")
d = pd.read_csv(ROOT / "data/raw/sinaflor/asv.csv", sep=";", usecols=USE, dtype=str, encoding="latin-1", on_bad_lines="skip").drop_duplicates("NRO_AUTORIZACAO")
d = d.assign(t0=pd.to_datetime(d.DATA_DE_EMISSAO, format="%d/%m/%Y", errors="coerce"), t1=pd.to_datetime(d.DATA_DE_VALIDADE, format="%d/%m/%Y", errors="coerce"),
             lat=num(d.LATITUDE_PONTO_CENTR_EMPREEND), lon=num(d.LONGITUDE_PONTO_CENTR_EMPREEND), ha=num(d.AREA_TOTAL_PROJ)).dropna(subset=["t0", "lat", "lon", "ha"])
d["r"], d["c"] = (G["north"] - d.lat) / G["cell"], (d.lon - G["west"]) / G["cell"]
d = d[(d.r >= 0) & (d.r < G["rows"]) & (d.c >= 0) & (d.c < G["cols"]) & (d.ha >= 5)]
print(len(d), "permits of 5 ha or more inside the grid box;", d.UF.value_counts().head(6).to_dict(), "| by issue year", d.t0.dt.year.value_counts().sort_index().to_dict())


def discs(sel, scale=1.0):
    """bool map: cells within the radius of a disc of the authorised area around each permit's point"""
    m = np.zeros((G["rows"], G["cols"]), bool)
    for r0, c0, ha in zip(sel.r, sel.c, sel.ha):
        rad = scale * np.sqrt(ha / 100 / np.pi) / 0.5 + 0.7  # in cells of 500 m
        a, b = int(r0), int(c0)
        k = int(np.ceil(rad))
        yy, xx = np.ogrid[max(a - k, 0):min(a + k + 1, G["rows"]), max(b - k, 0):min(b + k + 1, G["cols"])]
        m[max(a - k, 0):min(a + k + 1, G["rows"]), max(b - k, 0):min(b + k + 1, G["cols"])] |= (yy - r0) ** 2 + (xx - c0) ** 2 <= rad ** 2
    return m


print("year | valid permits (authorised km2) | forest cells inside | expected to lose a hectare | did | all cells that did, Amazon | same for the ring around (1x to 2x radius): expected | did")
for T in (2022, 2023, 2024, 2025, 2026):
    cut = pd.Timestamp(T - 1, 7, 31)
    sel = d[(d.t0 <= cut) & (d.t1.isna() | (d.t1 > cut))]
    t = np.load(ROOT / "benchmark/data" / f"truth_{T}.npz")
    cand = (t["inside"] == 1) & (t["forest"] >= 25)
    hit = cand & (t["cleared"] >= 100)
    p = (rasterio.open(ROOT / "web/data" / f"p{T}.png").read(1).astype(np.float32) / 255) ** 2
    inside = discs(sel) & cand
    ring = discs(sel, 2.0) & cand & ~inside
    sel_in = sel[cand[sel.r.astype(int), sel.c.astype(int)]]
    print(f"{T} | {len(sel)} ({sel.ha.sum() / 100:,.0f}), {len(sel_in)} with the point on forest | {inside.sum():,} | {p[inside].sum():,.0f} | {hit[inside].sum():,} | {hit.sum():,} | {p[ring].sum():,.0f} | {hit[ring].sum():,}", flush=True)
    new = sel[sel.t0 > cut - pd.Timedelta(days=365)]
    ins = discs(new) & cand
    print(f"       issued in the last 12 months: {len(new)} permits, {ins.sum():,} forest cells, expected {p[ins].sum():,.0f}, did {hit[ins].sum():,}")
