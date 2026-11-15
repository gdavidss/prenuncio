"""The model lab: try a model on the cached feature tables and score it on the internal benchmark.

Benchmark: for each test year T the model is fitted on target years before T only, then ranks a fixed
random quarter of all 500 m forest cells for year T. Scores, averaged over the test years:
  cap1, cap5, cap10  share of the year's clearing inside the top 1, 5, 10% of cells
  capf5              the same with the budget counted in forest, not cells: flag cells, densest risk per
                     km2 of forest first, until they hold 5% of the standing forest
  auprc              area under precision-recall for "lost at least 1 ha"
  auc                ROC area for the same label
  front5             capture in the top 5% among cells with no clearing nearby for three years
2026 is not a benchmark year: it is the holdout, scored once for a model that is about to be published.

Run on the machine holding data/cache50 (built by `AZ_F=50 AZ_X=... model.py cache`):
  python lab.py run <name> [key=value ...]     keys: any LightGBM parameter, rounds=, drop=prefix1+prefix2,
                                              extra=name1+name2, objective=tweedie|binary|regression, first=2011, tests=2022+2023,
                                              halflife=N (a training year N years older counts half), seeds=N (average N fits)
  python lab.py noise <a> <b>                 is run a really better than run b? block bootstrap of the cap5 difference
  python lab.py blend <name> <a> <b> [w]      geometric blend of two saved runs
  python lab.py addmap <name> <pattern>       add a column read from full-grid maps, e.g. /x/pred_{y}.npy
  python lab.py frommap <name> <pattern>      score full-grid forecast maps as a run of their own
  python lab.py board                         the leaderboard
"""
import json
import os
import sys
from pathlib import Path

import numpy as np

CACHE = Path(__file__).resolve().parent.parent / "data" / os.environ.get("AZ_CACHE", "cache50")
TESTS = (2022, 2023, 2024, 2025)
BASE = dict(objective="tweedie", tweedie_variance_power=1.3, learning_rate=0.08, num_leaves=127, min_data_in_leaf=200,
            feature_fraction=0.8, bagging_fraction=0.8, bagging_freq=1, lambda_l2=1.0, verbose=-1,
            num_threads=int(os.environ.get("AZ_THREADS", 8)))


def table(kind, y, extra=(), drop=()):
    d = np.load(CACHE / f"{kind}_{y}.npz")
    names = json.load(open(CACHE / "names.json"))
    X = d["X"]
    for e in extra:
        col = np.load(CACHE / f"extra_{e}_{kind}_{y}.npy")
        X = np.column_stack([X, col])
        names = names + ([e] if col.ndim == 1 else [f"{e}{i}" for i in range(col.shape[1])])
    keep = [i for i, n in enumerate(names) if not any(n.startswith(p) for p in drop)]
    return X[:, keep], [names[i] for i in keep], d


def forest_km2(d):
    """Standing forest per scored cell. Read once from the feature table and kept next to the cache."""
    key = CACHE / f"forestkm2_{len(d['truth'])}_{int(d['idx'][:1000].sum())}.npy"
    if not key.exists():
        np.save(key, d["X"][:, json.load(open(CACHE / "names.json")).index("forest")] * d["area"])
    return np.load(key)


def score(pred, d):
    from sklearn.metrics import average_precision_score, roc_auc_score
    truth, near = d["truth"], d["near"]
    o = np.argsort(-pred)
    cum = np.cumsum(truth[o]) / truth.sum()
    out = {f"cap{k}": float(cum[int(len(pred) * k / 100) - 1]) for k in (1, 5, 10)}
    fk = forest_km2(d)
    of = np.argsort(-pred / np.maximum(fk, 1e-4))
    out["capf5"] = float(truth[of][: np.searchsorted(np.cumsum(fk[of]), 0.05 * fk.sum())].sum() / truth.sum())
    hit = truth >= 0.01
    out["auprc"], out["auc"] = float(average_precision_score(hit, pred)), float(roc_auc_score(hit, pred))
    far = near == 0
    c2 = np.cumsum(truth[far][np.argsort(-pred[far])])
    out["front5"] = float(c2[int(far.sum() * 0.05) - 1] / c2[-1])
    return out


def record(name, per_year, note):
    mean = {k: float(np.mean([r[k] for r in per_year.values()])) for k in next(iter(per_year.values()))}
    with open(CACHE / "board.jsonl", "a") as f:
        f.write(json.dumps({"name": name, "note": note, "mean": mean, "years": per_year}) + "\n")
    print(name, " ".join(f"{k}={v:.4f}" for k, v in mean.items()), "|", " ".join(f"{T}:{r['cap5']:.3f}" for T, r in per_year.items()), flush=True)


def run(name, **kw):
    import lightgbm as lgb
    tests = [int(x) for x in str(kw.pop("tests", "+".join(map(str, TESTS)))).split("+")]
    first, rounds = int(kw.pop("first", 2011)), int(kw.pop("rounds", 400))
    halflife, seeds = float(kw.pop("halflife", 0)), int(kw.pop("seeds", 1))
    drop = tuple(filter(None, str(kw.pop("drop", "")).split("+")))
    extra = tuple(filter(None, str(kw.pop("extra", "")).split("+")))
    params = BASE | {k: (float(v) if "." in str(v) or str(v).isdigit() else v) for k, v in kw.items()}
    for k in ("num_leaves", "min_data_in_leaf", "bagging_freq", "max_bin", "max_depth"):
        if k in params:
            params[k] = int(params[k])
    binary = params["objective"] == "binary"
    if params["objective"] != "tweedie":
        params.pop("tweedie_variance_power", None)
    per_year = {}
    for T in tests:
        Xs, ys, ws = [], [], []
        for y in range(first, T):
            X, names, d = table("train", y, extra, drop)
            Xs.append(X); ys.append((d["y"] > 1).astype(np.float32) if binary else d["y"])
            ws.append(d["w"] * (0.5 ** ((T - 1 - y) / halflife) if halflife else 1.0))
        cat = ["uf"] if "uf" in names else []
        ds = lgb.Dataset(Xs, np.concatenate(ys), weight=np.concatenate(ws), feature_name=names, categorical_feature=cat, free_raw_data=False)
        X, _, d = table("eval", T, extra, drop)
        pred = np.mean([lgb.train(params | {"seed": k}, ds, rounds).predict(X) for k in range(seeds)], axis=0) * d["area"]
        np.save(CACHE / f"pred_{name}_{T}.npy", pred.astype(np.float32))
        per_year[T] = score(pred, d)
        print(" ", T, {k: round(v, 4) for k, v in per_year[T].items()}, flush=True)
    record(name, per_year, " ".join(sys.argv[3:]))


def blend(name, a, b, w=0.5):
    w, per_year = float(w), {}
    for T in TESTS:
        pa, pb = np.load(CACHE / f"pred_{a}_{T}.npy"), np.load(CACHE / f"pred_{b}_{T}.npy")
        pred = np.exp(w * np.log(pa + 1e-7) + (1 - w) * np.log(pb + 1e-7))
        np.save(CACHE / f"pred_{name}_{T}.npy", pred)
        per_year[T] = score(pred, np.load(CACHE / f"eval_{T}.npz"))
    record(name, per_year, f"blend {a} {b} {w}")


def noise(a, b, n=200):
    """Resample 50 km blocks of cells with replacement; report how often a beats b on cap5, per year."""
    rng = np.random.default_rng(0)
    for T in TESTS:
        d = np.load(CACHE / f"eval_{T}.npz")
        pa, pb, truth = np.load(CACHE / f"pred_{a}_{T}.npy"), np.load(CACHE / f"pred_{b}_{T}.npy"), d["truth"]
        blk = (d["idx"] // 6664 // 100) * 100 + (d["idx"] % 6664) // 100
        _, blk = np.unique(blk, return_inverse=True)
        order = np.argsort(blk); starts = np.searchsorted(blk[order], np.arange(blk.max() + 2))
        diffs = []
        for _ in range(n):
            pick = rng.integers(0, blk.max() + 1, blk.max() + 1)
            rows = np.concatenate([order[starts[k]:starts[k + 1]] for k in pick])
            cap = lambda p: np.cumsum(truth[rows][np.argsort(-p[rows])])[int(len(rows) * 0.05) - 1] / truth[rows].sum()
            diffs.append(cap(pa) - cap(pb))
        diffs = np.array(diffs)
        print(T, f"cap5 {a} - {b}: {diffs.mean():+.4f}  (90% interval {np.percentile(diffs, 5):+.4f} to {np.percentile(diffs, 95):+.4f}, better in {np.mean(diffs > 0):.0%} of resamples)")


def frommap(name, pattern):
    """Score full-grid forecast maps (expected cleared fraction per cell), e.g. the U-Net's roll_{y}.npy."""
    per_year = {}
    for T in TESTS:
        d = np.load(CACHE / f"eval_{T}.npz")
        pred = np.load(pattern.format(y=T), mmap_mode="r").reshape(-1)[d["idx"]].astype(np.float32) * d["area"]
        np.save(CACHE / f"pred_{name}_{T}.npy", pred)
        per_year[T] = score(pred, d)
    record(name, per_year, f"map {pattern}")


def addmap(name, pattern):
    """A full-grid map per year becomes one extra column for that year's rows. A missing year is NaN."""
    for f in sorted(CACHE.glob("*_20*.npz")):
        kind, y = f.stem.split("_")
        src = Path(pattern.format(y=y))
        idx = np.load(f)["idx"]
        col = np.load(src, mmap_mode="r").reshape(-1)[idx].astype(np.float32) if src.exists() else np.full(len(idx), np.nan, np.float32)
        np.save(CACHE / f"extra_{name}_{kind}_{y}.npy", col)
    print("added", name)


def board():
    rows = [json.loads(l) for l in open(CACHE / "board.jsonl")]
    for r in sorted(rows, key=lambda r: -r["mean"]["cap5"]):
        print(f"{r['name']:28s}", " ".join(f"{k}={v:.3f}" for k, v in r["mean"].items()), "|", r["note"][:70])


if __name__ == "__main__":
    cmd, args = sys.argv[1], sys.argv[2:]
    if cmd == "run":
        run(args[0], **dict(a.split("=", 1) for a in args[1:]))
    else:
        {"blend": blend, "addmap": addmap, "frommap": frommap, "board": board, "noise": noise}[cmd](*args)
