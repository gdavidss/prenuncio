# last-year-nearby

A reference row, not a model. Nothing is fitted. It ranks every cell by how much of its surroundings was cleared in the last PRODES year, and shows what a forecast has to beat. It scores 50.2% on cap5 over 2022 to 2025 and 51.2% on 2026.

## Method

For a forecast of PRODES year T, each 1 km cell gets the mean share cleared in PRODES year T-1 over the 9 km square centred on it. Ties are broken by the same mean over a 25 km square. The 1 km values are repeated onto the 500 m grid. This is the `persistence_9km` baseline that `pipeline/model.py` scores next to every model.

The only input is INPE's PRODES clearing of year T-1, which ends on the forecast date, 31 July of T-1. The 2027 map uses what INPE has published of 2026 so far, the priority scenes.

## How to reproduce

Build the 1 km grid, then run the lines below from the repository root. They need numpy and scipy, and take a few seconds per map on a laptop.

```sh
scripts/fetch.sh
python pipeline/grid.py      # data/grid/counts.npy
python pipeline/layers.py    # data/grid/prodes2026pri.npy
```

```python
import json, numpy as np
from scipy import ndimage as ndi

G = "data/grid/"
counts, g = np.load(G + "counts.npy", mmap_mode="r"), json.load(open(G + "grid.json"))
lat = g["north"] - (np.arange(g["rows"]) + 0.5) * g["cell"]
km2 = ((g["cell"] * 110.57) * (g["cell"] * 111.32 * np.cos(np.radians(lat))))[:, None].astype(np.float32) * np.ones((1, g["cols"]), np.float32)
for T in range(2022, 2028):
    # share of each 1 km cell cleared in PRODES year T-1; 2026 comes from the priority-scene polygons
    d1 = np.asarray(counts[T - 1 - 2007], np.float32) / 1e4 if T - 1 <= 2025 else np.clip(np.load(G + "prodes2026pri.npy") / km2, 0, 1)
    box = lambda km: ndi.uniform_filter(d1, km, mode="constant")
    risk = (box(9) + 1e-6 * box(25)).repeat(2, 0).repeat(2, 1).astype(np.float16)
    np.savez_compressed(f"{T}.npz", risk=risk)
```

The maps are in the [release reference-1](https://github.com/gdavidss/prenuncio/releases/tag/reference-1).

## Agent disclosure

An AI coding agent (Claude Code, from Anthropic) built the maps and wrote this report at the maintainer's request. The agent then rebuilt the six maps with the lines above and they matched the published ones cell for cell.
