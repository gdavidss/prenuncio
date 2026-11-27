"""Prepare a scored submission for the site's existing annual export pipeline.

Run before adopt.py and export.py:
  python pipeline/adopt_submission.py surveil-prenuncio-1 /path/to/maps
  python pipeline/adopt.py data/adopted/surveil-prenuncio-1/risk1km.npz

The supplied scores are expected clearing in km² per 500 m cell. The current
quantity model sets the 2027 basin total when export.py runs. Cell probabilities
are calibrated independently by calibrate.py.
"""
import argparse
import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "benchmark"))
import score


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("model")
    parser.add_argument("maps", type=Path)
    args = parser.parse_args()
    submission = ROOT / "benchmark/submissions" / args.model
    meta = json.loads((submission / "meta.json").read_text())
    scores = json.loads((submission / "scores.json").read_text())
    grid = json.loads((score.DATA / "grid.json").read_text())
    out = ROOT / "data/adopted" / args.model
    out.mkdir(parents=True, exist_ok=True)
    published = ROOT / "data/model"
    flags = dict(np.load(published / "flags500.npz", allow_pickle=False))
    bench = json.loads((published / "bench500.json").read_text())
    maps, provenance = {}, {}
    manifest = {p["year"]: p for p in meta["predictions"]}
    for year in range(2022, 2028):
        source = args.maps / f"{year}.npz"
        assert score.sha256(source) == manifest[year]["sha256"], source
        risk = score.load_prediction(source, grid)
        truth = np.load(score.DATA / f"truth_{min(year, 2026)}.npz", allow_pickle=False)
        forest = truth["forest"].astype(np.int32)
        if year == 2027:
            forest -= truth["cleared"]
        candidate = (truth["inside"] == 1) & (forest >= score.MIN_FOREST)
        assert np.isfinite(risk[candidate]).all() and (risk[candidate] >= 0).all()
        cells = np.flatnonzero(candidate)
        tie = np.random.default_rng(0).permutation(len(cells))
        order = tie[np.argsort(-risk.ravel()[cells[tie]], kind="stable")]
        flagged = np.zeros(risk.shape, dtype=bool)
        flagged.ravel()[cells[order[:int(len(cells) * 0.05)]]] = True
        cleared = (truth["cleared"] >= score.HIT) & candidate if year < 2027 else np.zeros_like(candidate)
        flags[str(year)] = flagged.astype(np.uint8) + 2 * cleared.astype(np.uint8)
        if year < 2027:
            area = score.row_km2(grid)[:, None]
            actual = truth["cleared"] / score.PIXELS * area
            capture = float(actual[flagged].sum() / actual[candidate].sum())
            assert abs(capture - scores["years"][str(year)]["cap5"]) < 1e-6
            bench[str(year)] = {"full": capture}
        risk = np.where(candidate, risk, 0)
        maps[str(year)] = risk.reshape(grid["rows"] // 2, 2, grid["cols"] // 2, 2).sum((1, 3))
        provenance[str(year)] = {"model": args.model, "prediction_sha256": manifest[year]["sha256"]}
        print(year, "candidate cells", len(cells), "flagged", int(flagged.sum()), flush=True)
    np.savez_compressed(out / "risk1km.npz", **maps)
    np.savez_compressed(published / "flags500.npz", **flags)
    (published / "bench500.json").write_text(json.dumps(bench, indent=1) + "\n")
    (published / "adopted.json").write_text(json.dumps({"model": args.model, "years": provenance}, indent=1) + "\n")


if __name__ == "__main__":
    main()
