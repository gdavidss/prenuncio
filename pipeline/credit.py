"""Rural credit (Banco Central, SICOR) by municipality and month, and a first test against clearing.
Reads data/raw/sicor/m<year>.gz (SICOR_CONTRATOS_MUNICIPIO_<year>.gz from bcb.gov.br/htms/sicor/DadosBrutos)
and writes data/grid/credit.parquet: mun (IBGE code), t (months since 2000-01), cattle_inv, cattle_work,
crop_inv, crop_work in reais. Atividade 2 is livestock, 1 is crops; investment and working capital apart.
Then the same panel as panel.py (municipality and semester fixed effects) with credit of the 12 months
before each semester, in logs. Semester effects absorb inflation and the national credit cycle.
Run: .venv/bin/python -I pipeline/credit.py
"""
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from az import GRID, ROOT  # noqa: E402

UF = {11, 12, 13, 14, 15, 16, 17, 21, 51}
out = GRID / "credit.parquet"
if not out.exists():
    parts = []
    for f in sorted((ROOT / "data/raw/sicor").glob("m*.gz")):
        d = pd.read_csv(f, sep=";", encoding="latin-1", dtype=str, usecols=["#cdEstado", "codMunicIbge", "MesEmissao", "AnoEmissao", "Atividade", "VlCusteio", "VlInvestimento"])
        d = d[d["#cdEstado"].astype(int).isin(UF)]
        val = lambda c: pd.to_numeric(d[c].str.replace(",", "."), errors="coerce").fillna(0)
        d = pd.DataFrame({"mun": d.codMunicIbge.astype(int), "t": (d.AnoEmissao.astype(int) - 2000) * 12 + d.MesEmissao.astype(int) - 1,
                          "act": d.Atividade.astype(int), "inv": val("VlInvestimento"), "work": val("VlCusteio")})
        parts.append(d.groupby(["mun", "t", "act"])[["inv", "work"]].sum().reset_index())
        print(f.name, len(d), flush=True)
    d = pd.concat(parts)
    w = d.pivot_table(index=["mun", "t"], columns="act", values=["inv", "work"], aggfunc="sum", fill_value=0)
    pd.DataFrame({"cattle_inv": w[("inv", 2)], "cattle_work": w[("work", 2)], "crop_inv": w[("inv", 1)], "crop_work": w[("work", 1)]}).reset_index().to_parquet(out)
cr = pd.read_parquet(out)
yr = cr.assign(y=2000 + cr.t // 12).groupby("y")[["cattle_inv", "cattle_work", "crop_inv", "crop_work"]].sum() / 1e9
print("Legal Amazon states, R$ billion a year:"); print(yr.round(1).T.to_string())

mun = np.load(GRID / "static.npz")["mun"].ravel()
det = pd.read_parquet(GRID / "deter.parquet"); det = det[det.grp == 0]
det = det.assign(mun=mun[det.cell.to_numpy()], t=det.ym + 192, v=det.km2)
T0, T1 = 199, 321
ids = np.array(sorted(set(det.mun[det.mun > 0]))); pos = {m: i for i, m in enumerate(ids)}


def cube(x, col="v"):
    x = x[x.mun.isin(pos) & (x.t >= T0 - 24) & (x.t <= T1)]
    a = np.zeros((len(ids), T1 + 1))
    np.add.at(a, (x.mun.map(pos).to_numpy(), x.t.to_numpy().astype(int)), x[col].to_numpy(float))
    return a


D = cube(det)
C = {k: cube(cr, k) for k in ("cattle_inv", "cattle_work", "crop_inv", "crop_work")}
rows = []
for s in range(T0 + 12, T1 - 4, 6):
    d12 = D[:, s - 12:s].sum(1)
    r = {k: np.log(v[:, s - 12:s].sum(1) + 1e4) for k, v in C.items()}
    rows.append(pd.DataFrame({"mun": ids, "s": s, "y": np.log1p(D[:, s:s + 6].sum(1)), "d12": np.log1p(d12), "d6": np.log1p(D[:, s - 6:s].sum(1)), "w": d12, **r}))
P = pd.concat(rows); P = P[P.groupby("mun").w.transform("sum") > 20]
P["cattle_inv_x2024"] = P.cattle_inv * (P.s >= 288)  # after CMN 5.081 took full effect (2 Jan 2024)
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
    print(f"  {name:18s} {b[k]:+.3f}  ({lo[k]:+.3f} to {hi[k]:+.3f}){'  *' if lo[k] * hi[k] > 0 else ''}")
