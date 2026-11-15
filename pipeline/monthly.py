"""How much, month by month: km2 that INPE's DETER will detect in each of the next 12 months, for the
whole Legal Amazon and for each state, for four hazards (clearing, fire scars, degradation and logging,
mining). DETER is the only monthly measurement there is; the yearly PRODES figure is larger.

Two candidate models per hazard, and the backtest picks one:
  momentum  the same months a year earlier, scaled by the square root of how the last quarter compares with
            the same quarter a year before. Nothing is fitted.
  trees     gradient boosted trees on log km2, pooled over the nine states plus the Amazon and over horizons
            1..12, reading the series' last 12 months, the same month one and two years before, the recent
            quarter against a year before, the other hazards' recent totals, the calendar month and the
            ocean indices.
Backtest: the last 24 forecast dates, each seeing only months already observed, scored on the Amazon total
over the next 1, 3, 6 and 12 months (median absolute error), next to "the same months a year earlier".
The published ranges are how far off the chosen model was in that backtest, 10th to 90th percentile,
per series, per month ahead and per 3, 6 and 12 month sum. The pick uses the same 24 dates it is scored
on, so read the chosen model's error as slightly flattering.
Writes web/data/monthly.json. Run: .venv/bin/python -I pipeline/monthly.py
"""
import json
import sys
from pathlib import Path

import lightgbm as lgb
import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from az import GRID, ROOT  # noqa: E402
from functools import lru_cache  # noqa: E402

from horizons import climate as _climate  # noqa: E402

climate = lru_cache(None)(_climate)  # it re-reads two text files on every call otherwise

UF = {11: "RO", 12: "AC", 13: "AM", 14: "RR", 15: "PA", 16: "AP", 17: "TO", 21: "MA", 51: "MT"}
HAZ = {"clear": 0, "degr": 1, "scar": 2, "mine": 3}
FIRST = 7  # Aug 2016, in months since 2016-01
label = lambda ym: f"{2016 + ym // 12}-{ym % 12 + 1:02d}"
P = dict(learning_rate=0.05, num_leaves=15, min_data_in_leaf=20, feature_fraction=0.8, bagging_fraction=0.8,
         bagging_freq=1, lambda_l2=1.0, verbose=-1, num_threads=4)


def series():
    """km2 per [hazard, series, month]; series 0 is the whole Amazon, 1..9 the states."""
    d = pd.read_parquet(GRID / "deter.parquet")
    uf = np.load(GRID / "static.npz")["uf"].ravel()[d.cell.to_numpy()]
    last = int(d.ym.max()) - 1  # the newest month in the file is partial
    Y = np.zeros((4, 10, last + 1))
    for g in range(4):
        dg = d[(d.grp == g) & (d.ym <= last)]
        Y[g, 0] = np.bincount(dg.ym, dg.km2, last + 1)
        for k, code in enumerate(UF, 1):
            m = uf[(d.grp == g).to_numpy() & (d.ym <= last).to_numpy()] == code
            Y[g, k] = np.bincount(dg.ym[m], dg.km2[m], last + 1)
    return Y, last


def row(Y, g, s, o, h):
    y, t = Y[g, s], o + h
    lg = lambda v: np.log1p(max(v, 0.0))
    q = lambda a, e: a[e - 2:e + 1].sum()  # the three months ending at e
    oni, tna = climate(o + 192)
    f = [h, t % 12, s, lg(y[t - 12]), lg(y[t - 24]) if t - 24 >= FIRST else np.nan,
         lg(q(y, o)) - lg(q(y, o - 12)), lg(q(Y[g, 0], o)) - lg(q(Y[g, 0], o - 12)), lg(y[o - 11:o + 1].sum()), oni, tna]
    f += [lg(y[o - k]) for k in range(12)]
    f += [lg(Y[k, s, o - 5:o + 1].sum()) for k in range(4) if k != g]
    return f


def table(Y, g, origins, last):
    X, t, key = [], [], []
    for o in origins:
        for h in range(1, 13):
            if o + h > last:
                break
            for s in range(10):
                X.append(row(Y, g, s, o, h)); t.append(np.log1p(Y[g, s, o + h])); key.append((o, h, s))
    return np.array(X, np.float32), np.array(t, np.float32), key


def fit(X, t, objective="regression", alpha=None):
    params = P | {"objective": objective} | ({"alpha": alpha} if alpha else {})
    return lgb.train(params, lgb.Dataset(X, t, categorical_feature=[2]), 300)


def momentum(Y, g, s, o):
    """The same twelve months a year earlier, scaled by the square root of how the last quarter compares
    with the same quarter a year before. No fitting at all."""
    y = Y[g, s]
    ratio = (y[o - 2:o + 1].sum() + 1) / (y[o - 14:o - 11].sum() + 1)
    return y[o + 1 - 12:o + 13 - 12] * ratio ** 0.5


def main():
    Y, last = series()
    start = FIRST + 24  # needs two years behind it
    tests = list(range(last - 12 - 23, last - 11))
    out = {"last_month": label(last), "hazards": {}}
    for name, g in HAZ.items():
        # Backtest two candidates on every series: boosted trees, and seasonal momentum. Each forecast date
        # sees only months already observed. logerr[method][series] = log(actual / forecast) per horizon and sum.
        paths = {"trees": {s: [] for s in range(10)}, "momentum": {s: [] for s in range(10)}}
        for o in tests:
            X, t, _ = table(Y, g, range(start, o), o)
            mdl = fit(X, t)
            for s in range(10):
                paths["trees"][s].append(np.expm1(mdl.predict(np.array([row(Y, g, s, o, h) for h in range(1, 13)], np.float32))))
                paths["momentum"][s].append(momentum(Y, g, s, o))
        actual = {s: np.array([Y[g, s, o + 1:o + 13] for o in tests]) for s in range(10)}
        naive = np.array([Y[g, 0, o + 1 - 12:o + 13 - 12] for o in tests])
        mape = lambda p, s, k: float(np.median(np.abs(np.asarray(p)[:, :k].sum(1) - actual[s][:, :k].sum(1)) / np.maximum(actual[s][:, :k].sum(1), 1e-9)))
        pick = min(paths, key=lambda mth: np.mean([mape(paths[mth][0], 0, k) for k in (3, 6, 12)]))
        bt = {"method": pick, "origins": len(tests)}
        for k in (1, 3, 6, 12):
            tag = f"h{k}{'sum' if k > 1 else ''}_mape"
            bt[tag], bt["naive_" + tag] = mape(paths[pick][0], 0, k), mape(naive, 0, k)
            bt["other_" + tag] = mape(paths[[m_ for m_ in paths if m_ != pick][0]][0], 0, k)

        X, t, _ = table(Y, g, range(start, last + 1), last)
        live = fit(X, t) if pick == "trees" else None

        def fc(s):
            p50 = np.maximum(np.expm1(live.predict(np.array([row(Y, g, s, last, h) for h in range(1, 13)], np.float32))) if live else momentum(Y, g, s, last), 0)
            past, act = np.asarray(paths[pick][s]), actual[s]
            band = lambda a, f: np.percentile(np.log((a + 1) / (f + 1)), [10, 90])  # how wrong this method was here, in the backtest
            months = []
            for h in range(12):
                lo, hi = band(act[:, h], past[:, h])
                months.append({"month": label(last + h + 1), "p50": round(float(p50[h]), 1),
                               "p10": round(float(max((p50[h] + 1) * np.exp(min(lo, 0)) - 1, 0)), 1),
                               "p90": round(float((p50[h] + 1) * np.exp(max(hi, 0)) - 1), 1)})
            sums = {}
            for k in (3, 6, 12):
                lo, hi = band(act[:, :k].sum(1), past[:, :k].sum(1))
                tot = float(p50[:k].sum())
                sums[str(k)] = {"p50": round(tot, 1), "p10": round(max((tot + 1) * np.exp(min(lo, 0)) - 1, 0), 1), "p90": round((tot + 1) * np.exp(max(hi, 0)) - 1, 1)}
            return months, sums

        hist = lambda s: {label(m): round(float(Y[g, s, m]), 1) for m in range(FIRST, last + 1)}
        months, sums = fc(0)
        entry = {"history": hist(0), "forecast": months, "sums": sums, "backtest": bt, "states": {}}
        for k, sig in enumerate(UF.values(), 1):
            ms, ss = fc(k)
            entry["states"][sig] = {"history": hist(k), "forecast": ms, "sums": ss}
        out["hazards"][name] = entry
        print(name, {k: (round(v, 3) if isinstance(v, float) else v) for k, v in bt.items() if not k.startswith("other")},
              "| next 3 months", sums["3"], "| same months a year before", round(float(Y[g, 0, last + 1 - 12:last + 4 - 12].sum())), flush=True)
        assert all(x["p10"] <= x["p50"] <= x["p90"] for x in months)
    json.dump(out, open(ROOT / "web/data/monthly.json", "w"))


if __name__ == "__main__":
    main()
