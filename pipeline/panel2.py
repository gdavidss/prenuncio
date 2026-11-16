"""Municipality by semester panel, second pass: which kind of enforcement is followed by less clearing?
Splits IBAMA embargoes into remote ones (operation "Controle Remoto": a polygon seen by satellite is
embargoed by post, no visit), collective ones (a single term over 5,000 ha, mostly whole Indigenous lands)
and the rest, and adds a distributed lag: the answer in the last 6 months and in the 6 before. Same design
as panel.py (fixed effects by municipality and semester, municipalities resampled for the intervals).
An association: inspectors go where clearing is, which pulls every coefficient toward zero.
Only date, municipality code, area and operation tag are read from the embargo file.
Run: .venv/bin/python -I pipeline/panel2.py
"""
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from az import GRID, ROOT  # noqa: E402

mun = np.load(GRID / "static.npz")["mun"].ravel()
det = pd.read_parquet(GRID / "deter.parquet"); det = det[det.grp == 0]
det = det.assign(mun=mun[det.cell.to_numpy()], t=det.ym + 192, v=det.km2)
aut = pd.read_parquet(GRID / "autos.parquet"); aut = aut.assign(mun=mun[aut.cell.to_numpy()], t=aut.m, v=aut.n)
e = pd.read_csv(ROOT / "data/raw/ibama_embargo/termo_de_embargo.csv", sep=";", dtype=str, encoding="utf-8-sig",
                usecols=["DAT_EMBARGO", "COD_MUNICIPIO", "QTD_AREA_EMBARGADA", "OPERACAO_SOL_RECURSO", "DES_TAD", "SIT_CANCELADO"])
d = pd.to_datetime(e.DAT_EMBARGO.str[:10], errors="coerce", format="mixed", dayfirst=True)
e = e.assign(t=(d.dt.year - 2000) * 12 + d.dt.month - 1, mun=pd.to_numeric(e.COD_MUNICIPIO, errors="coerce"),
             v=pd.to_numeric(e.QTD_AREA_EMBARGADA.str.replace(",", "."), errors="coerce") / 100,
             remote=(e.OPERACAO_SOL_RECURSO.fillna("") + " " + e.DES_TAD.fillna("")).str.upper().str.contains("CONTROLE REMOTO"))
e = e[(e.SIT_CANCELADO != "S") & e.t.between(170, 322) & e.mun.notna() & (e.v > 0)].astype({"mun": int, "t": int})
print("embargo terms 2023 on: remote", int((e.remote & (e.t >= 276)).sum()), "collective", int(((e.v >= 50) & ~e.remote & (e.t >= 276)).sum()), "other", int((~e.remote & (e.v < 50) & (e.t >= 276)).sum()),
      "| km2:", round(e[e.remote & (e.t >= 276)].v.sum()), round(e[(e.v >= 50) & ~e.remote & (e.t >= 276)].v.sum()), round(e[~e.remote & (e.v < 50) & (e.t >= 276)].v.sum()))
T0, T1 = 199, 321
ids = np.array(sorted(set(det.mun[det.mun > 0]))); pos = {m: i for i, m in enumerate(ids)}


def cube(x):
    x = x[x.mun.isin(pos) & (x.t >= T0 - 24) & (x.t <= T1)]
    a = np.zeros((len(ids), T1 + 1))
    np.add.at(a, (x.mun.map(pos).to_numpy(), x.t.to_numpy().astype(int)), x.v.to_numpy(float))
    return a


D, A = cube(det), cube(aut)
ER, EC, EO = cube(e[e.remote]), cube(e[~e.remote & (e.v >= 50)]), cube(e[~e.remote & (e.v < 50)])
rows = []
for s in range(T0 + 12, T1 - 4, 6):
    d12, r = D[:, s - 12:s].sum(1), {}
    for name, a in (("notice", A), ("remote", ER), ("collective", EC), ("field", EO)):
        for tag, lo, hi in (("0_6", s - 6, s), ("6_12", s - 12, s - 6)):
            r[f"{name}_{tag}"] = np.log((a[:, lo:hi].sum(1) + 0.25) / (d12 / 2 + 1))
    rows.append(pd.DataFrame({"mun": ids, "s": s, "y": np.log1p(D[:, s:s + 6].sum(1)), "d12": np.log1p(d12), "d6": np.log1p(D[:, s - 6:s].sum(1)), "w": d12, **r}))
P = pd.concat(rows); P = P[P.groupby("mun").w.transform("sum") > 20]
X = [c for c in P.columns if c not in ("mun", "s", "y", "w")]


def within(df):
    Z = df[["y"] + X].to_numpy(float).copy()
    g1, g2 = pd.factorize(df.mun)[0], pd.factorize(df.s)[0]
    for _ in range(30):
        for g in (g1, g2):
            Z -= (np.stack([np.bincount(g, Z[:, k]) for k in range(Z.shape[1])], 1) / np.bincount(g)[:, None])[g]
    return np.linalg.lstsq(Z[:, 1:], Z[:, 0], rcond=None)[0]


b = within(P)
rng, groups = np.random.default_rng(0), {m: g for m, g in P.groupby("mun")}
keys, boots = list(groups), []
for _ in range(200):
    boots.append(within(pd.concat([groups[keys[k]].assign(mun=j) for j, k in enumerate(rng.choice(len(keys), len(keys)))])))
lo, hi = np.percentile(boots, [5, 95], 0)
print(len(P), "rows,", P.mun.nunique(), "municipalities")
for k, name in enumerate(X):
    print(f"  {name:16s} {b[k]:+.3f}  ({lo[k]:+.3f} to {hi[k]:+.3f}){'  *' if lo[k] * hi[k] > 0 else ''}")
