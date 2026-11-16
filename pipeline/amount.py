"""How much, by municipality: which inputs make the forecast of the next six months of clearing better?
Outcome: DETER clearing km2 in a municipality over the six months after an origin. Origins every three months;
for each of the last 16 the model (boosted trees on log km2, pooled over municipalities) is fitted on
origins whose six months had fully passed, then scored. Feature groups are added one at a time to the base:
  base      the municipality's own clearing over the last 3, 6, 12 and 24 months, the same six months a year
            before, the calendar month, and the whole Amazon's last six months against a year before
  enforce   IBAMA notices, remote embargoes and field embargoes per km2 alerted, last 6 and 6 to 12 months
  credit    cattle and crop credit, investment and working capital, last 12 months and its change on the year
  permits   authorised clearing area of permits valid at the origin, and of those issued in the last 12 months
Scores: error of the Amazon total, and the summed absolute error over municipalities as a share of the total
(lower is better), next to "the same six months a year before".
Run: .venv/bin/python -I pipeline/amount.py
"""
import sys
from pathlib import Path

import lightgbm as lgb
import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from az import GRID, ROOT  # noqa: E402

munmap = np.load(GRID / "static.npz")["mun"]
mun = munmap.ravel()
det = pd.read_parquet(GRID / "deter.parquet"); det = det[det.grp == 0]
det = det.assign(mun=mun[det.cell.to_numpy()], t=det.ym + 192, v=det.km2)
aut = pd.read_parquet(GRID / "autos.parquet"); aut = aut.assign(mun=mun[aut.cell.to_numpy()], t=aut.m, v=aut.n)
e = pd.read_csv(ROOT / "data/raw/ibama_embargo/termo_de_embargo.csv", sep=";", dtype=str, encoding="utf-8-sig",
                usecols=["DAT_EMBARGO", "COD_MUNICIPIO", "QTD_AREA_EMBARGADA", "OPERACAO_SOL_RECURSO", "DES_TAD", "SIT_CANCELADO"])
dt = pd.to_datetime(e.DAT_EMBARGO.str[:10], errors="coerce", format="mixed", dayfirst=True)
e = e.assign(t=(dt.dt.year - 2000) * 12 + dt.dt.month - 1, mun=pd.to_numeric(e.COD_MUNICIPIO, errors="coerce"),
             v=pd.to_numeric(e.QTD_AREA_EMBARGADA.str.replace(",", "."), errors="coerce") / 100,
             remote=(e.OPERACAO_SOL_RECURSO.fillna("") + " " + e.DES_TAD.fillna("")).str.upper().str.contains("CONTROLE REMOTO"))
e = e[(e.SIT_CANCELADO != "S") & e.t.between(170, 322) & e.mun.notna() & (e.v > 0) & (e.v < 50)].astype({"mun": int, "t": int})
cr = pd.read_parquet(GRID / "credit.parquet")
g = __import__("json").load(open(GRID / "grid.json"))
p = pd.read_csv(ROOT / "data/raw/sinaflor/asv.csv", sep=";", dtype=str, encoding="latin-1", on_bad_lines="skip",
                usecols=["NRO_AUTORIZACAO", "DATA_DE_EMISSAO", "DATA_DE_VALIDADE", "LATITUDE_PONTO_CENTR_EMPREEND", "LONGITUDE_PONTO_CENTR_EMPREEND", "AREA_TOTAL_PROJ"]).drop_duplicates("NRO_AUTORIZACAO")
num = lambda s: pd.to_numeric(s.str.replace(",", "."), errors="coerce")
mon = lambda s: (lambda d: (d.dt.year - 2000) * 12 + d.dt.month - 1)(pd.to_datetime(s, format="%d/%m/%Y", errors="coerce"))
p = pd.DataFrame({"t0": mon(p.DATA_DE_EMISSAO), "t1": mon(p.DATA_DE_VALIDADE).fillna(9999), "r": (g["north"] - num(p.LATITUDE_PONTO_CENTR_EMPREEND)) / g["cell"],
                  "c": (num(p.LONGITUDE_PONTO_CENTR_EMPREEND) - g["west"]) / g["cell"], "km2": num(p.AREA_TOTAL_PROJ) / 100}).dropna()
p = p[(p.r >= 0) & (p.r < g["rows"]) & (p.c >= 0) & (p.c < g["cols"])]
p["mun"] = munmap[p.r.astype(int), p.c.astype(int)]

T0, T1 = 199, 321
ids = np.array(sorted(set(det.mun[det.mun > 0]))); pos = {m: i for i, m in enumerate(ids)}


def cube(x, col="v"):
    x = x[x.mun.isin(pos) & (x.t >= T0) & (x.t <= T1)]
    a = np.zeros((len(ids), T1 + 1))
    np.add.at(a, (x.mun.map(pos).to_numpy(), x.t.to_numpy().astype(int)), x[col].to_numpy(float))
    return a


D, A, ER, EF = cube(det), cube(aut), cube(e[e.remote]), cube(e[~e.remote])
C = {k: cube(cr, k) for k in ("cattle_inv", "cattle_work", "crop_inv", "crop_work")}
p = p[p.mun.isin(pos)]
pm = p.mun.map(pos).to_numpy()
L = np.log1p
GROUPS = {"base": [], "enforce": [], "credit": [], "permits": []}


def rows(o):
    """features known at the end of month o"""
    w = lambda a, lo, hi: a[:, o - lo + 1:o - hi + 1].sum(1)  # months o-lo+1 .. o-hi
    d6, d12 = w(D, 6, 0), w(D, 12, 0)
    f = {"d3": L(w(D, 3, 0)), "d6": L(d6), "d12": L(d12), "d24": L(w(D, 24, 0)), "same": L(D[:, o - 11:o - 5].sum(1)), "month": np.full(len(ids), o % 12),
         "amazon": np.full(len(ids), np.log((d6.sum() + 1) / (w(D, 18, 12).sum() + 1)))}
    GROUPS["base"] = list(f)
    for name, a in (("notice", A), ("remote", ER), ("field", EF)):
        f[f"{name}_6"], f[f"{name}_12"] = np.log((w(a, 6, 0) + 0.25) / (d12 / 2 + 1)), np.log((w(a, 12, 6) + 0.25) / (d12 / 2 + 1))
    GROUPS["enforce"] = [k for k in f if k not in GROUPS["base"]]
    for k, a in C.items():
        f[k], f[k + "_chg"] = np.log(w(a, 12, 0) + 1e4), np.log((w(a, 12, 0) + 1e4) / (w(a, 24, 12) + 1e4))
    GROUPS["credit"] = [k for k in f if k not in GROUPS["base"] + GROUPS["enforce"]]
    valid = (p.t0 <= o) & (p.t1 > o)
    f["asv"] = L(np.bincount(pm[valid], p.km2[valid], len(ids)))
    f["asv_new"] = L(np.bincount(pm[valid & (p.t0 > o - 12)], p.km2[valid & (p.t0 > o - 12)], len(ids)))
    GROUPS["permits"] = ["asv", "asv_new"]
    return pd.DataFrame(f).assign(o=o, y=D[:, o + 1:o + 7].sum(1) if o + 6 <= T1 else np.nan)


origins = list(range(T0 + 24, T1 + 1, 3))
T = pd.concat([rows(o) for o in origins])
tests = [o for o in origins if o + 6 <= T1][-16:]
P = dict(objective="regression", learning_rate=0.05, num_leaves=15, min_data_in_leaf=30, feature_fraction=0.8, bagging_fraction=0.8, bagging_freq=1, lambda_l2=1.0, verbose=-1, num_threads=4)
sets = {"base": ["base"], "+ enforce": ["base", "enforce"], "+ credit": ["base", "credit"], "+ permits": ["base", "permits"], "all": ["base", "enforce", "credit", "permits"]}
res = {k: [] for k in list(sets) + ["a year before"]}
for o in tests:
    tr, te = T[(T.o + 6 <= o)], T[T.o == o]
    truth = te.y.to_numpy()
    res["a year before"].append((np.expm1(te.same).sum() / truth.sum() - 1, np.abs(np.expm1(te.same) - truth).sum() / truth.sum()))
    for name, gs in sets.items():
        cols = [c for gname in gs for c in GROUPS[gname]]
        pred = np.mean([np.expm1(lgb.train(P | {"seed": sd}, lgb.Dataset(tr[cols], L(tr.y), categorical_feature=["month"]), 250).predict(te[cols])) for sd in range(3)], 0).clip(0)
        res[name].append((pred.sum() / truth.sum() - 1, np.abs(pred - truth).sum() / truth.sum()))
print(len(ids), "municipalities,", len(tests), "test origins from", f"{2000 + tests[0] // 12}-{tests[0] % 12 + 1:02d}", "to", f"{2000 + tests[-1] // 12}-{tests[-1] % 12 + 1:02d}")
print("feature set      | Amazon total, median abs error | mean abs error | summed municipal error / total (mean)")
for k, v in res.items():
    v = np.array(v)
    print(f"  {k:14s} | {np.median(np.abs(v[:, 0])):.1%} | {np.mean(np.abs(v[:, 0])):.1%} | {v[:, 1].mean():.1%}")
