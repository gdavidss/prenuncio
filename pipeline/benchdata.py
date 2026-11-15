"""Public truth files for the open benchmark (benchmark/README.md), one per test year.

  truth_<year>.npz, arrays [rows, cols] on the 500 m grid:
    cleared  uint16  10 m pixels of the cell (out of 2500) cleared in PRODES year <year>
    forest   uint16  pixels of the cell still forest on 31 July of year-1
    inside   uint8   1 inside the Legal Amazon
    near3    uint8   1 if any clearing within about 9 km in the three years before
  grid.json: west, north, cell (degrees), rows, cols
2026 is INPE's priority scenes only. Run: AZ_F=50 python benchdata.py <output folder>
"""
import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import model as m  # noqa: E402

out = Path(sys.argv[1])
out.mkdir(parents=True, exist_ok=True)
m.load_2026()
px = m.F * m.F
json.dump({"west": m.W, "north": m.N, "cell": m.C, "rows": m.NROW, "cols": m.NCOL}, open(out / "grid.json", "w"))
for y in range(2022, 2027):
    t = y - 1
    cleared = np.round(m.defo(y) * px).astype(np.uint16)
    forest = np.round(m.forest_at(t) * px).astype(np.uint16)
    near3 = (m.box(m.defo(t) + m.defo(t - 1) + m.defo(t - 2), 9) > 0).astype(np.uint8)
    np.savez_compressed(out / f"truth_{y}.npz", cleared=cleared, forest=forest, inside=m.INSIDE.astype(np.uint8), near3=near3)
    km2 = float((cleared / px * m.CELL_KM2)[m.INSIDE & (forest >= px // 100)].sum())
    print(y, "clearing in candidate cells", round(km2), "km2", flush=True)
