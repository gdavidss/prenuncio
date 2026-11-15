"""Scorer for the Prenúncio open benchmark. Needs numpy and scikit-learn, nothing from this project.

  python benchmark/score.py <prediction folder> [--out scores.json] [--data DIR] [--years 2022 2023]
  python benchmark/score.py --fetch       download grid.json and the truth files named in data/manifest.json
  python benchmark/score.py --selftest    score a tiny synthetic case with a known answer

The prediction folder holds one map per year, <year>.npy or <year>.npz (key `risk`), float16 or float32
[rows, cols] on the grid in data/grid.json. Any score that ranks cells works; by convention it is the
expected km2 cleared in the cell during PRODES year <year>. Missing truth files are downloaded.

Candidate cells are inside the Legal Amazon and hold at least 1% forest on 31 July of year-1.
Scores for one year, over every candidate cell:
  cap1, cap5, cap10  share of the year's clearing (km2) inside the top 1, 5, 10% of candidates by prediction
  capf5              the budget counted in forest: take cells in order of prediction per km2 of forest
                     until they hold 5% of the candidates' forest; share of the clearing inside them
  auprc, auc         precision-recall and ROC area for the label "at least 25 of the cell's 2500 pixels cleared"
  front5             cap5 among candidates with no clearing within about 9 km in the three years before
Equal predictions are ordered by a fixed random permutation, so a constant map scores like chance.
The mean is taken over 2022 to 2025. 2026 is scored and reported apart.
"""
import argparse
import hashlib
import json
import shutil
import sys
import tempfile
import urllib.request
import zipfile
from pathlib import Path

import numpy as np

VERSION = "1.0"
DATA = Path(__file__).resolve().parent / "data"
MEAN_YEARS = (2022, 2023, 2024, 2025)
SCORED_YEARS = MEAN_YEARS + (2026,)
PIXELS = 2500     # 10 m pixels in a cell
MIN_FOREST = 25   # a candidate holds at least this many forest pixels (1% of the cell)
HIT = 25          # the label for auprc and auc: at least this many pixels cleared in the year
KEYS = ("cap1", "cap5", "cap10", "capf5", "auprc", "auc", "front5")
MAX_DOWNLOAD = 400 * 2 ** 20


def sha256(path):
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()


def row_km2(grid):
    """Area of one cell in each row, km2. Row 0 is north."""
    lat = grid["north"] - (np.arange(grid["rows"]) + 0.5) * grid["cell"]
    return (grid["cell"] * 110.57) * (grid["cell"] * 111.32 * np.cos(np.radians(lat)))


def download(url, dest, want_sha=None, limit=MAX_DOWNLOAD):
    """Fetch an https URL to dest, refusing anything too large or with the wrong hash."""
    if not url.startswith("https://"):
        raise SystemExit(f"refusing {url}: only https links are fetched")
    dest = Path(dest)
    dest.parent.mkdir(parents=True, exist_ok=True)
    part = dest.with_name(dest.name + ".part")
    req = urllib.request.Request(url, headers={"User-Agent": "prenuncio-benchmark"})
    try:
        with urllib.request.urlopen(req, timeout=120) as r, open(part, "wb") as f:
            if not r.geturl().startswith("https://"):
                raise SystemExit(f"refusing {url}: redirected away from https")
            size = 0
            for block in iter(lambda: r.read(1 << 20), b""):
                size += len(block)
                if size > limit:
                    raise SystemExit(f"refusing {url}: larger than {limit >> 20} MB")
                f.write(block)
    except OSError as e:  # no such file, no network, timeout
        part.unlink(missing_ok=True)
        raise SystemExit(f"could not download {url}: {e}")
    except SystemExit:
        part.unlink(missing_ok=True)
        raise
    got = sha256(part)
    if want_sha and got != want_sha:
        part.unlink()
        raise SystemExit(f"{url}: sha256 is {got}, expected {want_sha}")
    part.replace(dest)
    return got


def fetch(data=DATA, only=None):
    """Download the files listed in manifest.json that are missing or differ from it."""
    man = json.load(open(Path(data) / "manifest.json"))
    for name, info in man["files"].items():
        f = Path(data) / name
        if only and name not in only:
            continue
        if f.exists() and sha256(f) == info["sha256"]:
            continue
        print("fetch", name, flush=True)
        download(man["base_url"].rstrip("/") + "/" + name, f, info["sha256"])


def write_manifest(base_url, data=DATA):
    """For maintainers: record the hashes of the truth files that are about to be published."""
    files = {f.name: {"sha256": sha256(f), "bytes": f.stat().st_size}
             for f in sorted(Path(data).glob("truth_*.npz")) + [Path(data) / "grid.json"]}
    json.dump({"benchmark_version": VERSION, "base_url": base_url, "files": files}, open(Path(data) / "manifest.json", "w"), indent=1)
    print("wrote", Path(data) / "manifest.json", len(files), "files")


def find_prediction(folder, year):
    hits = [f for f in (Path(folder) / f"{year}.npy", Path(folder) / f"{year}.npz") if f.exists()]
    if len(hits) > 1:
        raise SystemExit(f"{folder} has both {year}.npy and {year}.npz; keep one")
    return hits[0] if hits else None


def load_prediction(path, grid):
    """A prediction map as float32 [rows, cols]. Pickles are never loaded and oversized files are refused."""
    shape, most = (grid["rows"], grid["cols"]), grid["rows"] * grid["cols"] * 4 + 4096
    if path.suffix == ".npz":
        with zipfile.ZipFile(path) as z:
            if "risk.npy" not in z.namelist():
                raise SystemExit(f"{path}: an .npz prediction needs the key `risk`")
            if z.getinfo("risk.npy").file_size > most:
                raise SystemExit(f"{path}: `risk` is larger than a float32 map of the grid")
        a = np.load(path, allow_pickle=False)["risk"]
    else:
        if path.stat().st_size > most:
            raise SystemExit(f"{path}: larger than a float32 map of the grid")
        a = np.load(path, mmap_mode="r", allow_pickle=False)
    if a.shape != shape:
        raise SystemExit(f"{path}: shape is {a.shape}, the grid is {shape}")
    if a.dtype not in (np.float16, np.float32):
        raise SystemExit(f"{path}: dtype is {a.dtype}, expected float16 or float32")
    return np.asarray(a, np.float32)


def score_year(pred, truth, grid):
    """Scores of one prediction map against one truth file (a dict with cleared, forest, inside, near3)."""
    from sklearn.metrics import average_precision_score, roc_auc_score
    cand = (np.asarray(truth["inside"]) == 1) & (np.asarray(truth["forest"]) >= MIN_FOREST)
    n = int(cand.sum())
    if n == 0:
        raise SystemExit("no candidate cells in the truth file")
    area = np.repeat(row_km2(grid)[:, None], grid["cols"], axis=1)[cand]
    p = pred[cand].astype(np.float64)
    if not np.isfinite(p).all():
        raise SystemExit(f"{int((~np.isfinite(p)).sum())} candidate cells have a prediction that is NaN or infinite")
    pixels = np.asarray(truth["cleared"])[cand]
    clearing = pixels / PIXELS * area                          # km2 cleared in the year
    forest = np.asarray(truth["forest"])[cand] / PIXELS * area  # km2 of forest at the forecast date
    far = np.asarray(truth["near3"])[cand] == 0
    total = float(clearing.sum())
    out = {k: None for k in KEYS}
    out.update(cells=n, clearing_km2=round(total, 3), forest_km2=round(float(forest.sum()), 3),
               frontier_share=None, positive_share=round(float((pixels >= HIT).mean()), 6))
    if total == 0:
        return out
    tie = np.random.default_rng(0).permutation(n)

    def ranking(s):  # highest first, equal values in the fixed random order
        return tie[np.argsort(-s[tie], kind="stable")]

    order = ranking(p)
    cum = np.cumsum(clearing[order])
    for k in (1, 5, 10):
        out[f"cap{k}"] = float(cum[max(int(n * k / 100), 1) - 1] / total)
    by_forest = ranking(p / np.maximum(forest, 1e-4))
    taken = np.searchsorted(np.cumsum(forest[by_forest]), 0.05 * forest.sum())
    out["capf5"] = float(clearing[by_forest][:taken].sum() / total)
    hit = pixels >= HIT
    if hit.any() and not hit.all():
        out["auprc"], out["auc"] = float(average_precision_score(hit, p)), float(roc_auc_score(hit, p))
    far_order = order[far[order]]
    if len(far_order) and clearing[far_order].sum() > 0:
        c2 = np.cumsum(clearing[far_order])
        out["front5"] = float(c2[max(int(len(far_order) * 0.05), 1) - 1] / c2[-1])
        out["frontier_share"] = round(float(c2[-1] / total), 6)
    return {k: (round(v, 6) if isinstance(v, float) else v) for k, v in out.items()}


def score_folder(folder, data=DATA, years=None):
    """Score every year that has a prediction map in folder. Returns the dict that scores.json holds."""
    data, man = Path(data), None
    if (data / "manifest.json").exists():
        man = json.load(open(data / "manifest.json"))
        if not (data / "grid.json").exists():
            fetch(data, only=["grid.json"])
    grid = json.load(open(data / "grid.json"))
    res = {"benchmark_version": man["benchmark_version"] if man else VERSION, "years": {}, "mean_2022_2025": None}
    for y in years or SCORED_YEARS:
        f = find_prediction(folder, y)
        if f is None:
            continue
        name = f"truth_{y}.npz"
        if man and name in man["files"]:
            fetch(data, only=[name])
        elif not (data / name).exists():
            raise SystemExit(f"no truth file for {y} in {data}")
        with np.load(data / name, allow_pickle=False) as t:
            s = score_year(load_prediction(f, grid), t, grid)
        s["prediction_sha256"], s["truth_sha256"] = sha256(f), sha256(data / name)
        res["years"][str(y)] = s
        print(y, " ".join(f"{k}={s[k]:.4f}" if s[k] is not None else f"{k}=n/a" for k in KEYS),
              f"| {s['cells']} cells, {s['clearing_km2']:.0f} km2 cleared", flush=True)
    if not res["years"]:
        raise SystemExit(f"no prediction maps named <year>.npy or <year>.npz in {folder}")
    if all(str(y) in res["years"] for y in MEAN_YEARS):
        rows = [res["years"][str(y)] for y in MEAN_YEARS]
        if all(r[k] is not None for r in rows for k in KEYS):
            res["mean_2022_2025"] = {k: round(float(np.mean([r[k] for r in rows])), 6) for k in KEYS}
            print("mean 2022 to 2025", " ".join(f"{k}={v:.4f}" for k, v in res["mean_2022_2025"].items()))
    else:
        print("no mean: it needs all of", MEAN_YEARS)
    return res


def selftest():
    """Two synthetic cases worked out by hand, written to disk and scored through the same code path."""
    tmp = Path(tempfile.mkdtemp(prefix="prenuncio_selftest_"))
    try:
        # Case A. Two rows either side of the equator, so every cell has the same area. 200 cells:
        # 160 candidates, 20 outside the region and 20 with too little forest. The excluded cells carry
        # the highest predictions and heavy clearing, and must not count.
        grid = {"west": -60.0, "north": 0.0045, "cell": 0.0045, "rows": 2, "cols": 100}
        n = 160
        pred = np.arange(n, 0, -1, dtype=np.float32)            # rank r has prediction 160 - r
        cleared = np.zeros(n, np.uint16)
        cleared[0] = 100                                         # top 1% is one cell: 100 of 1000 pixels
        cleared[1:8] = (60, 60, 60, 60, 60, 50, 50)              # top 5% is 8 cells: 500 of 1000
        cleared[8:16] = 40                                       # top 10% is 16 cells: 820 of 1000
        cleared[[20, 50]] = 30
        cleared[[80, 82, 100, 159]] = (30, 15, 45, 30)           # the frontier half; 15 is below the label
        forest = np.full(n, 2000, np.uint16)
        forest[:4] = 500                                         # 5% of the forest is 15700 pixels: ranks 0 to 9
        near = (np.arange(n) < 80).astype(np.uint8)              # ranks 80 to 159 are the frontier
        full = lambda cand_values, other, dtype: np.concatenate([cand_values, np.full(40, other)]).astype(dtype).reshape(2, 100)
        truth = dict(cleared=full(cleared, 2000, np.uint16), forest=full(forest, 2400, np.uint16), near3=full(near, 0, np.uint8),
                     inside=full(np.ones(n), 0, np.uint8))
        truth["inside"].ravel()[180:] = 1                        # the last 20 are inside but hold too little forest
        truth["forest"].ravel()[180:] = 24
        risk = full(pred, 999, np.float32)
        (tmp / "data").mkdir()
        (tmp / "pred").mkdir()
        json.dump(grid, open(tmp / "data" / "grid.json", "w"))
        for y in MEAN_YEARS:
            np.savez_compressed(tmp / "data" / f"truth_{y}.npz", **truth)
        np.save(tmp / "pred" / "2022.npy", risk)
        np.save(tmp / "pred" / "2023.npy", risk.astype(np.float16))
        np.savez_compressed(tmp / "pred" / "2024.npz", risk=risk)
        np.savez_compressed(tmp / "pred" / "2025.npz", risk=risk * 3)  # only the order matters
        res = score_folder(tmp / "pred", tmp / "data")
        pos = [1 + r for r in list(range(16)) + [20, 50, 80, 100, 159]]  # positions of the 21 positive cells
        want = dict(cap1=0.1, cap5=0.5, cap10=0.82, capf5=0.58, front5=45 / 120, auc=1 - 319 / (21 * 139),
                    auprc=sum((i + 1) / p for i, p in enumerate(pos)) / 21)
        for y in MEAN_YEARS:
            got = res["years"][str(y)]
            assert got["cells"] == n, got
            for k, v in want.items():
                assert abs(got[k] - v) < 1e-5, (y, k, got[k], v)
        assert all(abs(res["mean_2022_2025"][k] - v) < 1e-5 for k, v in want.items())
        assert abs(res["years"]["2022"]["clearing_km2"] - 1000 / PIXELS * row_km2(grid)[0]) < 1e-3

        # Case B. Cells weigh by their area. Rows centred on 30 and 10 degrees: the five flagged cells sit in
        # the smaller northern cells and an equal count of cleared pixels sits in the south.
        gridb = {"west": 0.0, "north": 40.0, "cell": 20.0, "rows": 2, "cols": 50}
        cl, pr = np.zeros((2, 50), np.uint16), np.zeros((2, 50), np.float32)
        cl[0, :5], cl[1, :5], pr[0, :5] = 100, 100, 1.0
        tb = dict(cleared=cl, forest=np.full((2, 50), 2500, np.uint16), inside=np.ones((2, 50), np.uint8), near3=np.ones((2, 50), np.uint8))
        got = score_year(pr, tb, gridb)
        c30, c10 = np.cos(np.radians(30)), np.cos(np.radians(10))
        assert abs(got["cap5"] - c30 / (c30 + c10)) < 1e-5, got
        assert got["front5"] is None  # no frontier cells in this case
        assert abs(row_km2(gridb)[0] - 20 * 110.57 * 20 * 111.32 * c30) < 1e-6

        # A constant map carries no information: ties fall in the fixed random order, never in grid order.
        chance = score_year(np.zeros((2, 50), np.float32), tb, gridb)
        assert chance["cap10"] < 0.6, chance

        # Bad inputs are refused.
        for bad in (np.zeros((3, 100), np.float32), np.zeros((2, 100), np.float64)):
            np.save(tmp / "bad.npy", bad)
            try:
                load_prediction(tmp / "bad.npy", grid)
            except SystemExit:
                continue
            raise AssertionError("a wrong shape or dtype was accepted")
        try:
            score_year(np.full((2, 50), np.nan, np.float32), tb, gridb)
            raise AssertionError("NaN predictions were accepted")
        except SystemExit:
            pass
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
    print("selftest ok")


def main():
    ap = argparse.ArgumentParser(description="Score prediction maps on the Prenúncio open benchmark.")
    ap.add_argument("folder", nargs="?", help="folder with <year>.npy or <year>.npz prediction maps")
    ap.add_argument("--data", default=DATA, help="folder with grid.json and truth_<year>.npz (default: benchmark/data)")
    ap.add_argument("--out", help="write the scores to this JSON file")
    ap.add_argument("--years", nargs="+", type=int, help="score only these years")
    ap.add_argument("--fetch", action="store_true", help="download the truth files and stop")
    ap.add_argument("--selftest", action="store_true", help="run the synthetic check and stop")
    ap.add_argument("--write-manifest", metavar="BASE_URL", help="maintainers: hash the truth files into manifest.json")
    a = ap.parse_args()
    if a.selftest:
        return selftest()
    if a.write_manifest:
        return write_manifest(a.write_manifest, a.data)
    if a.fetch:
        return fetch(a.data)
    if not a.folder:
        ap.error("give a prediction folder, or --fetch, or --selftest")
    res = score_folder(a.folder, a.data, a.years)
    if a.out:
        json.dump(res, open(a.out, "w"), indent=1)
        print("wrote", a.out)


if __name__ == "__main__":
    sys.exit(main())
