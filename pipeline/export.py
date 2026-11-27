"""Write the files the site reads into web/data/. Nothing from data/raw is copied.

Per year Y one RGB PNG on the model grid:
  R  forecast clearing for Y, km2 per cell, as round(255 * cbrt(km2))
  G  clearing actually mapped in Y, fraction of cell, as round(255 * sqrt(frac))   (0 when not yet known)
  B  forest fraction at the forecast date, as round(255 * frac)
tenure.png: 0 none, 1 Indigenous land, 2 strict conservation unit, 3 sustainable use, 4 APA, 255 outside.
Run: .venv/bin/python -I pipeline/export.py
"""
import datetime
import json
import sys
from pathlib import Path

import numpy as np
import rasterio

sys.path.insert(0, str(Path(__file__).resolve().parent))
import model as m  # noqa: E402

WEB = m.ROOT / "web/data"


def png(path, bands):
    a = np.stack(bands).astype(np.uint8)
    with rasterio.open(path, "w", driver="PNG", width=m.NCOL, height=m.NROW, count=len(a), dtype="uint8") as ds:
        ds.write(a)
    for aux in Path(path).parent.glob(Path(path).name + ".aux.xml"):
        aux.unlink()


def main():
    WEB.mkdir(parents=True, exist_ok=True)
    q = json.load(open(m.OUT / "quantity.json"))
    adopted_path = m.OUT / "adopted.json"
    adopted = json.load(open(adopted_path)) if adopted_path.exists() else {"model": "prenuncio-3", "years": {}}
    ev = json.load(open(m.OUT / "eval.json"))
    ev["2026"] = json.load(open(m.OUT / "check2026.json"))
    m.load_2026()
    years = {}
    for y in range(2019, 2028):
        f = m.OUT / f"risk{y}.npy"
        if not f.exists():
            continue
        risk = np.load(f)
        forest = m.forest_at(y - 1)
        cand = m.INSIDE & (forest >= 0.01)
        if y == q["target"]:
            risk = risk * (q["total_km2"] / risk.sum())  # where from the map model, how much from the quantity model
        actual = m.defo(y) if y <= 2026 else np.zeros_like(risk)
        png(WEB / f"{y}.png", [np.round(255 * np.cbrt(np.clip(risk, 0, 1))),
                                np.round(255 * np.sqrt(np.clip(actual, 0, 1))),
                                np.round(255 * np.clip(forest, 0, 1))])
        v = np.sort(risk[cand])[::-1]
        cut = lambda p: float(v[int(len(v) * p / 100)])
        info = {"origin": f"{y - 1}-07-31", "forest_km2": float((forest * m.CELL_KM2)[cand].sum()),
                "risk_km2": float(risk.sum()), "cut": {p: cut(p) for p in (5, 1, 0.2)},
                "share_in_top5": float(v[: int(len(v) * 0.05)].sum() / v.sum())}
        if str(y) in ev:
            e = ev[str(y)]
            info.update(actual_km2=e["model"]["true_total_km2"],
                        capture={k: e["model"][f"capture@{k}"] for k in ("1", "5")},
                        capture5km={k: e["model"][f"capture5km@{k}"] for k in ("1", "5")},
                        naive={k: max(e[b][f"capture@{k}"] for b in ("persistence_cell", "persistence_9km", "edge_distance"))
                               for k in ("1", "5")})
        years[y] = info
        info.update(adopted["years"].get(str(y), {"model": "prenuncio-3"}))
        print(y, {k: (round(x, 3) if isinstance(x, float) else x) for k, x in info.items() if k != "cut"})
    # the yearly forecast at the 500 m it is scored at: which cells are flagged, which were cleared
    # (pipeline/blendmaps.py). One grey PNG per year, value 85 * (flagged + 2 * cleared).
    if (m.OUT / "flags500.npz").exists():
        fl, b5 = np.load(m.OUT / "flags500.npz"), json.load(open(m.OUT / "bench500.json"))
        # the best naive map at 500 m, from the tree run's own baselines (persistence and forest edge)
        naive500 = {}
        if (m.OUT / "naive500.json").exists():
            for y, e in json.load(open(m.OUT / "naive500.json")).items():
                naive500[y] = max(e[k]["capture@5"] for k in ("persistence_cell", "persistence_9km", "edge_distance"))
        for y in fl.files:
            a = fl[y]
            with rasterio.open(WEB / f"f{y}.png", "w", driver="PNG", width=a.shape[1], height=a.shape[0], count=1, dtype="uint8") as ds:
                ds.write(a * 85, 1)
            for aux in WEB.glob(f"f{y}.png.aux.xml"):
                aux.unlink()
            if int(y) in years:
                flagged = int((a & 1).sum())
                years[int(y)]["flags500"] = {"rows": int(a.shape[0]), "cols": int(a.shape[1]), "cell": float(m.C) / 2,
                                             "capture5": b5.get(y, {}).get("full"), "flagged_cells": flagged,
                                             "forest_cells": round(flagged / 0.05),  # flagged = the top 5% of forest cells
                                             "naive5": naive500.get(y)}
    # shorter horizons and fire scars: live forecast only, with their backtest summary
    layers = {}
    hz = m.OUT / "horizons_eval.json"
    for name, months in (("clear3", 3), ("clear6", 6), ("scar12", 12), ("degr12", 12), ("mine12", 12)):
        f = m.OUT / f"risk_{name}.npy"
        if not (f.exists() and hz.exists()):
            continue
        risk, forest = np.load(f), m.forest_at(2026)
        cand = m.INSIDE & (forest >= 0.01)
        png(WEB / f"{name}.png", [np.round(255 * np.cbrt(np.clip(risk, 0, 1))), np.zeros_like(risk), np.round(255 * np.clip(forest, 0, 1))])
        v = np.sort(risk[cand])[::-1]
        ev_ = json.load(open(hz))[name]
        mean = lambda who, k: float(np.mean([e[who][k] for e in ev_.values()]))
        layers[name] = {"months": months, "from": "2026-11", "forest_km2": float((forest * m.CELL_KM2)[cand].sum()),
                        "risk_km2": float(risk.sum()), "cut": {p: float(v[int(len(v) * p / 100)]) for p in (5, 1, 0.2)},
                        "share_in_top5": float(v[: int(len(v) * 0.05)].sum() / v.sum()), "tests": len(ev_),
                        "capture": {"1": mean("model", "capture@1"), "5": mean("model", "capture@5")},
                        "naive": {"1": mean("naive", "capture@1"), "5": mean("naive", "capture@5")}}
        print(name, {k: (round(x, 3) if isinstance(x, float) else x) for k, x in layers[name].items() if k != "cut"})
    S = m.S
    ten = np.where(S["ti"] > 0, 1, np.where(S["uc_group"] == 1, 2, np.where(S["uc_group"] == 2, 3, np.where(S["uc_group"] == 3, 4, 0))))
    png(WEB / "tenure.png", [np.where(m.INSIDE, ten, 255)])
    meta = {"west": float(m.W), "north": float(m.N), "cell": float(m.C), "rows": m.NROW, "cols": m.NCOL,
            "years": years, "layers": layers, "history": q["history"],
            "forecast": {"year": q["target"], "model": adopted["model"], "quantity_model": "prenuncio-quantity", "total_km2": q["total_km2"], "range_km2": q["range_km2"],
                         "deter_months": q["deter_months_used"], "by_state": q["by_state"],
                         "mape": q["backtest"]["mape"][str(q["deter_months_used"])] if isinstance(next(iter(q["backtest"]["mape"])), str) else q["backtest"]["mape"][q["deter_months_used"]],
                         "previsia_mape": q["backtest"]["previsia_mape"]},
            "built": datetime.date.today().isoformat()}
    json.dump(meta, open(WEB / "meta.json", "w"))
    sizes = {p.name: p.stat().st_size // 1024 for p in sorted(WEB.iterdir())}
    print(sizes)
    # round trip: the PNG must give back the forecast total within quantisation error
    y = max(years)
    with rasterio.open(WEB / f"{y}.png") as ds:
        back = ((ds.read(1).astype(np.float64) / 255) ** 3).sum()
    assert abs(back / years[y]["risk_km2"] - 1) < 0.03, (back, years[y]["risk_km2"])
    print("next: .venv/bin/python -I pipeline/regions.py   (the sector numbers are summed from this export)")


if __name__ == "__main__":
    main()
