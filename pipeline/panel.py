"""Municipality by semester panel: does enforcement move the clearing that follows?
Outcome: log(1 + DETER clearing km2) in a municipality in a semester. Regressors, all from the 12 months
before the semester starts: IBAMA flora notices and newly embargoed area, each per km2 of DETER clearing
alerts in the same municipality (how hard clearing was answered), and the clearing itself. Municipality and
semester fixed effects, so the national swing of each semester is removed and what is left is this: among
municipalities with the same history, did the ones answered harder clear less afterwards? Standard errors
by resampling municipalities. This is an association, not yet a causal estimate: IBAMA goes where clearing
is, which pulls the coefficient toward zero or above it.
Run: .venv/bin/python -I pipeline/panel.py
"""
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from az import GRID  # noqa: E402

mun = np.load(GRID / "static.npz")["mun"].ravel()
load = lambda f, mcol, val, off=0: (lambda d: d.assign(mun=mun[d.cell.to_numpy()], t=d[mcol] + off, v=d[val] if val else 1))(pd.read_parquet(GRID / f))
det = load("deter.parquet", "ym", "km2", 192); det = det[det.grp == 0]          # months since 2000-01
aut, emb = load("autos.parquet", "m", "n"), load("embargo.parquet", "m", "ha")
T0, T1 = 199, 321  # Aug 2016 .. Oct 2026
ids = np.array(sorted(set(det.mun[det.mun > 0])))
pos = {m: i for i, m in enumerate(ids)}


def cube(d):
    d = d[d.mun.isin(pos) & (d.t >= T0 - 24) & (d.t <= T1)]
    a = np.zeros((len(ids), T1 + 1))
    np.add.at(a, (d.mun.map(pos).to_numpy(), d.t.to_numpy().astype(int)), d.v.to_numpy(float))
    return a


D, A, E = cube(det), cube(aut), cube(emb) / 100  # km2, notices, km2
rows = []
for s in range(T0 + 12, T1 - 4, 6):  # semester starts
    y = D[:, s:s + 6].sum(1)
    d12, a12, e12 = D[:, s - 12:s].sum(1), A[:, s - 12:s].sum(1), E[:, s - 12:s].sum(1)
    rows.append(pd.DataFrame({"mun": ids, "s": s, "y": np.log1p(y), "d12": np.log1p(d12), "d6": np.log1p(D[:, s - 6:s].sum(1)),
                              "notice": np.log((a12 + 0.5) / (d12 + 2)), "embargo": np.log((e12 + 0.5) / (d12 + 2)), "w": d12}))
P = pd.concat(rows)
P = P[P.groupby("mun").w.transform("sum") > 20]  # municipalities with real clearing
X = ["d12", "d6", "notice", "embargo"]


def within(df):
    """two-way fixed effects by alternating demeaning"""
    Z = df[["y"] + X].to_numpy(float).copy()
    g1, g2 = pd.factorize(df.mun)[0], pd.factorize(df.s)[0]
    for _ in range(30):
        for g in (g1, g2):
            Z -= (np.stack([np.bincount(g, Z[:, k]) for k in range(Z.shape[1])], 1) / np.bincount(g)[:, None])[g]
    return np.linalg.lstsq(Z[:, 1:], Z[:, 0], rcond=None)[0]


b = within(P)
rng, boots, groups = np.random.default_rng(0), [], {m: g for m, g in P.groupby("mun")}
keys = list(groups)
for _ in range(200):
    pick = rng.choice(len(keys), len(keys))
    boots.append(within(pd.concat([groups[keys[k]].assign(mun=j) for j, k in enumerate(pick)])))
lo, hi = np.percentile(boots, [5, 95], 0)
print(len(P), "rows,", P.mun.nunique(), "municipalities,", P.s.nunique(), "semesters")
for k, name in enumerate(X):
    print(f"  {name:8s} {b[k]:+.3f}  (90% interval {lo[k]:+.3f} to {hi[k]:+.3f})")
# what the estimate implies: clearing with enforcement as observed against enforcement held at its 2021-2022 level
base = P[(P.s >= 259) & (P.s < 271)].groupby("mun")[["notice", "embargo"]].mean()
print("semester | observed km2 | implied km2 had the answer per km2 stayed at the Aug 2021 to Jul 2022 level | difference (90% interval)")
for s, g in P[P.s >= 271].groupby("s"):
    g = g.merge(base, left_on="mun", right_index=True, suffixes=("", "_0")).dropna()
    dz = np.stack([g.notice - g.notice_0, g.embargo - g.embargo_0], 1)
    obs = np.expm1(g.y).to_numpy()
    cf = lambda coef: float((np.expm1(g.y.to_numpy() - dz @ coef[2:4])).sum())
    alt = [cf(c) for c in boots]
    print(f"  {2000 + s // 12}-{s % 12 + 1:02d} | {obs.sum():6.0f} | {cf(b):6.0f} | {cf(b) - obs.sum():+6.0f} ({np.percentile(alt, 5) - obs.sum():+.0f} to {np.percentile(alt, 95) - obs.sum():+.0f})")
