"""Public forests registry (SFB CNFP 2025) on the model grid: who holds the land.

Writes into the grid folder, each [rows, cols]:
  cnfp_class.npy        uint8  0 not in the registry (mostly private or unregistered), 1 undesignated public
                               land (glebas, "sem destinacao"), 2 settlement, 3 conservation unit,
                               4 Indigenous land, 5 military or other
  cnfp_dist_undes.npy   km to the nearest undesignated public land      cnfp_n9_undes.npy   its share within 9 km
  cnfp_dist_settle.npy  km to the nearest settlement                     cnfp_n9_settle.npy  its share within 9 km
The registry is a 2025 snapshot. Settlements and glebas are old, but a few were created inside the test
years; treat a gain from this input as an upper bound until the creation year is used.
Run: AZ_F=50 python tenure.py <CNFP_2025.shp>
"""
import sys
from pathlib import Path

import numpy as np
import pyogrio
from affine import Affine
from rasterio.features import rasterize
from scipy import ndimage as ndi

sys.path.insert(0, str(Path(__file__).resolve().parent))
from az import GRID, K, load_grid  # noqa: E402

_, g = load_grid()
W, N, C, R, Cn = g["west"], g["north"], g["cell"], g["rows"], g["cols"]
df = pyogrio.read_dataframe(sys.argv[1], bbox=(W, N - R * C, W + Cn * C, N))
cls = np.where(df.protecao == "SEM DESTINACAO", 1, np.where(df.classe.str.contains("ASSENT", na=False), 2,
      np.where(df.classe.str.contains("UC", na=False), 3, np.where(df.classe.str.contains("TI", na=False), 4, 5))))
order = np.argsort(-cls)  # burn undesignated last so it wins overlaps, settlements next
m = rasterize(((geom, int(c)) for geom, c in zip(df.geometry.iloc[order], cls[order]) if geom is not None),
              out_shape=(R, Cn), transform=Affine(C, 0, W, 0, -C, N), fill=0, dtype="uint8")
np.save(GRID / "cnfp_class.npy", m)
for name, v in (("undes", 1), ("settle", 2)):
    hit = m == v
    np.save(GRID / f"cnfp_dist_{name}.npy", np.minimum(ndi.distance_transform_edt(~hit) / K, 200).astype(np.float32))
    np.save(GRID / f"cnfp_n9_{name}.npy", ndi.uniform_filter(hit.astype(np.float32), (9 * K) | 1, mode="constant"))
share = np.bincount(m.ravel(), minlength=6) / m.size
print("share of the grid box by class 0..5:", share.round(3))
assert share[1] > 0.02 and share[2] > 0.01
