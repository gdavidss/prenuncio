"""Check that the published rasters, metadata and API derive from the adopted maps.

Run after rebuilding the site:
  python test/forecast.py /path/to/submitted/maps
"""
import json
import sys
from pathlib import Path

import numpy as np
import rasterio

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "benchmark"))
import score

maps = Path(sys.argv[1])
web = ROOT / "web/data"
api = ROOT / "web/api/v1"
read = lambda path: json.loads(path.read_text())
prob = read(web / "prob.json")
meta = read(web / "meta.json")
story = read(web / "story.json")
model = prob["model"]
submission = ROOT / "benchmark/submissions" / model
manifest = read(submission / "meta.json")
scores = read(submission / "scores.json")
grid = read(ROOT / "benchmark/data/grid.json")
assert meta["forecast"]["model"] == story["model"]["name"] == model
assert read(api / "amazon.json")["model"] == read(api / "cells/grid.json")["model"] == model
assert story["benchmark"]["today"] == round(scores["mean_2022_2025"]["cap5"], 4)
assert prob["forecast"]["fitted_on"] == [2024, 2025]
for year, record in prob["years"].items():
    assert max(record["fitted_on"]) < int(year)

for prediction in manifest["predictions"]:
    year = prediction["year"]
    source = maps / f"{year}.npz"
    assert score.sha256(source) == prediction["sha256"]
    assert meta["years"][str(year)]["prediction_sha256"] == prediction["sha256"]
    assert meta["years"][str(year)]["model"] == model
    if year < 2027:
        truth = np.load(ROOT / f"benchmark/data/truth_{year}.npz")
        candidate = (truth["inside"] == 1) & (truth["forest"] >= score.MIN_FOREST)
        with rasterio.open(web / f"f{year}.png") as raster:
            flags = raster.read(1) // 85
        flagged = (flags & 1) != 0
        assert not flagged[~candidate].any()
        assert flagged.sum() == int(candidate.sum() * 0.05)
        actual = truth["cleared"] / score.PIXELS * score.row_km2(grid)[:, None]
        assert abs(actual[flagged].sum() / actual[candidate].sum() - scores["years"][str(year)]["cap5"]) < 1e-6

risk = score.load_prediction(maps / "2027.npz", grid)
truth = np.load(ROOT / "benchmark/data/truth_2026.npz")
candidate = (truth["inside"] == 1) & (truth["forest"].astype(np.int32) - truth["cleared"] >= score.MIN_FOREST)
curve = prob["calibration"]["forecast_thresholds"]
expected = np.interp(risk, curve["risk"], curve["probability"]).astype(np.float32)
expected = np.where(candidate, np.maximum(np.round(255 * np.sqrt(expected)), 1), 0).astype(np.uint8)
with rasterio.open(web / "p2027.png") as raster:
    actual = raster.read(1)
assert np.array_equal(actual, expected), "the displayed probabilities must derive from the adopted ranking map"
assert (actual > 0).sum() == prob["forecast"]["cells"]
quantized_total = ((actual.astype(np.float64) / 255) ** 2).sum()
assert abs(quantized_total / prob["forecast"]["expected_cells"] - 1) < 0.01

for row in range(0, grid["rows"], 100):
    for col in range(0, grid["cols"], 100):
        tile = actual[row:row + 100, col:col + 100]
        path = api / f"cells/2027/{row // 100}_{col // 100}.bin"
        if tile.any():
            assert path.read_bytes() == tile.tobytes(), path
        else:
            assert not path.exists(), path

assert read(api / "priority.json") == read(web / "priority.json")
assert read(api / "calibration.json") == prob
regions = read(web / "regions.json")
states = read(web / "sectors_uf.json")["items"]
assert abs(sum(state["e"][-1] for state in states) / regions["total_km2"] - 1) < 0.01
assert abs(read(api / "amazon.json")["expected_clearing_km2"] - regions["total_km2"]) < 1
print(model, "verified against submitted maps: flags, calibration, cell tiles, sector totals and metadata")
