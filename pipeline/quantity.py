"""How much: total clearing per state for a PRODES year, as DETER months accumulate.

With k months of DETER observed since 1 Aug (k = 0, 3, 6, 9, 12), pooled over states:
    log P[s,y] - log P[s,y-1] = a_k + b_k * (log D[s,y,k] - log D[s,y-1,k])
P is the PRODES increment, D the DETER clearing-class area over the first k months. k = 0 is
persistence. b_k < 1 is the shrinkage: DETER momentum overstates the change in the final number.
Backtest is rolling origin (fit on years < T). Run: .venv/bin/python -I pipeline/quantity.py
"""
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from az import F, GRID, OUT, load_grid  # noqa: E402

UF = {11: "RO", 12: "AC", 13: "AM", 14: "RR", 15: "PA", 16: "AP", 17: "TO", 21: "MA", 51: "MT"}
KS = (0, 3, 6, 9, 12)
# ponytail: Imazon PrevisIA's published totals vs the official rate, the only public benchmark for
# "how much". Hardcoded from their press releases; see docs/RESEARCH.md for the sources.
PREVISIA = {2022: (15391, 11594), 2023: (11805, 9064), 2024: (8959, 6518), 2025: (6531, 5731), 2026: (5501, 3335)}


def load():
    c, g = load_grid()
    N, C, nrow, ncol = g["north"], g["cell"], g["rows"], g["cols"]
    lat = N - (np.arange(nrow) + 0.5) * C
    cell = ((C * 110.57) * (C * 111.32 * np.cos(np.radians(lat))))[:, None] * np.ones((1, ncol))
    uf = np.load(GRID / "static.npz")["uf"].ravel()
    P = {}
    for y in range(2008, 2026):
        P[y] = np.bincount(uf, (c[y - 2007] / (F * F) * cell).ravel(), 256)
    P[2026] = np.bincount(uf, np.load(GRID / "prodes2026pri.npy").ravel(), 256)  # priority scenes only
    P = pd.DataFrame(P).loc[list(UF)]
    d = pd.read_parquet(GRID / "deter.parquet")
    d = d[d.grp == 0]
    d = d.assign(uf=uf[d.cell.to_numpy()])
    D = d.groupby(["uf", "ym"]).km2.sum().unstack(fill_value=0).reindex(list(UF)).fillna(0)
    return P, D


def deter_k(D, y, k):
    """DETER clearing in the first k months of PRODES year y. NaN if those months are not all in the file."""
    m0 = (y - 1 - 2016) * 12 + 7  # August of y-1, in months since 2016-01
    months = list(range(m0, m0 + k))
    last_full = D.columns.max() - 1  # the newest month in the file is partial
    if m0 < 7 or (k and months[-1] > last_full):
        return pd.Series(np.nan, D.index)
    return D.reindex(columns=months, fill_value=0).sum(axis=1)


def design(P, D, years, k):
    rows = []
    for y in years:
        dy = np.log(P[y] + 1) - np.log(P[y - 1] + 1)
        dx = np.log(deter_k(D, y, k) + 1) - np.log(deter_k(D, y - 1, k) + 1) if k else pd.Series(0.0, P.index)
        rows.append(pd.DataFrame({"y": y, "dy": dy, "dx": dx, "w": np.sqrt(P[y - 1] + 1), "prev": P[y - 1]}))
    return pd.concat(rows).dropna()


def fit(t, k):
    if k == 0:
        return 0.0, 0.0  # persistence
    X = np.column_stack([np.ones(len(t)), t.dx]) * t.w.to_numpy()[:, None]
    a, b = np.linalg.lstsq(X, t.dy * t.w, rcond=None)[0]
    return float(a), float(b)


def predict(P, D, y, k, coef):
    a, b = coef
    dx = np.log(deter_k(D, y, k) + 1) - np.log(deter_k(D, y - 1, k) + 1) if k else 0.0
    return (P[y - 1] + 1) * np.exp(a + b * dx) - 1


def main():
    P, D = load()
    years = list(range(2018, 2027))  # DETER-B starts Aug 2016, so 2018 is the first year with a prior year
    back = {k: {} for k in KS}
    for k in KS:
        for T in range(2021, 2027):
            coef = fit(design(P, D, [y for y in years if y < T], k), k)
            back[k][T] = float(predict(P, D, T, k, coef).sum())
    truth = {T: float(P[T].sum()) for T in range(2021, 2027)}
    err = {k: {T: back[k][T] / truth[T] - 1 for T in truth} for k in KS}
    mape = {k: float(np.mean(np.abs(list(err[k].values())))) for k in KS}
    for k in KS:
        print(f"k={k:2d} months of DETER  mean abs error {mape[k]:.1%}  ",
              " ".join(f"{T}:{e:+.0%}" for T, e in err[k].items()))
    pv = {T: p / o - 1 for T, (p, o) in PREVISIA.items()}
    print("PrevisIA published      mean abs error", f"{np.mean(np.abs(list(pv.values()))):.1%}  ",
          " ".join(f"{T}:{e:+.0%}" for T, e in pv.items()))

    # live forecast for PRODES 2027 with the DETER months available today
    k_now = max(k for k in KS if not deter_k(D, 2027, k).isna().any())
    coef = fit(design(P, D, years, k_now), k_now)
    P27 = predict(P, D, 2027, k_now, coef)
    errs = np.array(list(err[k_now].values()))
    rms = float(np.sqrt(np.mean(np.log1p(errs) ** 2)))
    total = float(P27.sum())
    out = {"target": 2027, "deter_months_used": k_now, "coef": coef, "total_km2": total,
           # ponytail: range = one typical backtest miss either side (RMS of log errors over six
           # years). Not a calibrated interval; it needs the policy variables before it can be.
           "range_km2": [total * np.exp(-rms), total * np.exp(rms)],
           "by_state": {UF[u]: float(v) for u, v in P27.items()},
           "backtest": {"truth": truth, "pred": back, "mape": mape, "previsia_mape": float(np.mean(np.abs(list(pv.values()))))},
           "history": {int(y): float(P[y].sum()) for y in P.columns}}
    OUT.mkdir(parents=True, exist_ok=True)
    json.dump(out, open(OUT / "quantity.json", "w"), indent=1)
    print(f"2027 with {k_now} months of DETER: {total:,.0f} km2  range {out['range_km2'][0]:,.0f} to {out['range_km2'][1]:,.0f}  coef {coef}")
    assert 0 < total < 30000 and all(abs(e) < 3 for e in errs)


if __name__ == "__main__":
    main()
