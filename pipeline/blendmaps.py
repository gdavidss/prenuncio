"""Blend the tree maps and the U-Net maps into the published forecast, year by year.

  python blendmaps.py <unet pattern, e.g. /x/roll_{y}.npy> <weight of the U-Net> <tree map folders...>
Tree maps are expected km2 per 500 m cell (risk<year>.npy); U-Net maps are expected cleared fraction.
The blend is geometric. Writes agg3/risk1km.npz (summed onto the 1 km grid the site paints),
agg3/bench.json (the blend scored at 500 m on every cached year, the holdout 2026 included) and
agg3/flags500.npz: per year a uint8 map on the 500 m grid, bit 0 = cell is in the flagged 5% of forest
cells, bit 1 = cell lost at least 1% of its area that year, so the site can paint the forecast at the
resolution it was scored at. bench.json gets "full" = the share of clearing inside the flagged cells
counted over every cell, not the scoring sample.
Run on the training machine with AZ_F=50.
"""
import glob
import json
import os
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import lab  # noqa: E402
import model as m  # noqa: E402

pattern, w, folders = sys.argv[1], float(sys.argv[2]), sys.argv[3:]
os.makedirs("agg3", exist_ok=True)
maps, bench, flags = {}, {}, {}
m.load_2026()
for y in range(2019, 2028):
    tree = next(np.load(f) for d in folders for f in glob.glob(f"{d}/risk{y}.npy")).astype(np.float32)
    unet = np.load(pattern.format(y=y)).astype(np.float32) * m.CELL_KM2
    blend = np.where(tree > 0, np.exp((1 - w) * np.log(tree + 1e-7) + w * np.log(unet + 1e-7)), 0).astype(np.float32)
    maps[str(y)] = blend.reshape(m.NROW // 2, 2, m.NCOL // 2, 2).sum((1, 3))
    np.savez_compressed(f"agg3/blend500_{y}.npz", risk=blend.astype(np.float16))  # the published forecast, as a benchmark submission
    cand = m.INSIDE & (m.forest_at(y - 1) >= 0.01)
    flag = cand & (blend >= np.sort(blend[cand])[::-1][int(cand.sum() * 0.05)])
    truth = m.defo(y) if y <= 2026 else np.zeros_like(blend)
    flags[str(y)] = (flag + 2 * (cand & (truth >= 0.01))).astype(np.uint8)
    full = float((truth * m.CELL_KM2)[flag].sum() / max(float((truth * m.CELL_KM2)[cand].sum()), 1e-9))
    f = lab.CACHE / f"eval_{y}.npz"
    if f.exists():
        d = np.load(f)
        bench[y] = {k: lab.score(v.ravel()[d["idx"]], d) for k, v in (("blend", blend), ("trees", tree), ("unet", unet))}
        bench[y]["full"] = full
        print(y, {k: round(v["cap5"], 4) for k, v in bench[y].items() if k != "full"}, "top 1%:", round(bench[y]["blend"]["cap1"], 4), "all cells:", round(full, 4), flush=True)
np.savez_compressed("agg3/risk1km.npz", **maps)
np.savez_compressed("agg3/flags500.npz", **flags)
json.dump(bench, open("agg3/bench.json", "w"), indent=1)
