"""INPE DETER alerts as bit planes on the 100 m grid, for the convolutional model.
Output data/db.npy: int32, three bits per 31 July from 2017 to 2026: any clearing alert, any degradation
or selective-logging alert, any fire scar, in the 12 months before.
Run: python deter100.py <deter shapefile>
"""
import datetime
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pyogrio
from affine import Affine
from rasterio.features import rasterize

DATA = Path(__file__).resolve().parent.parent / "data"
G = json.load(open(DATA / "grid100.json"))
T = Affine(G["cell"], 0, G["west"], 0, -G["cell"], G["north"])
GROUP = {"DESMATAMENTO_CR": 0, "DESMATAMENTO_VEG": 0, "MINERACAO": 0, "DEGRADACAO": 1, "CS_DESORDENADO": 1,
         "CS_GEOMETRICO": 1, "CORTE_SELETIVO": 1, "CICATRIZ_DE_QUEIMADA": 2}

d = pyogrio.read_dataframe(sys.argv[1], columns=["CLASSNAME", "VIEW_DATE"])
d = d[d.CLASSNAME.isin(GROUP) & d.geometry.notna()]
d["g"], d["date"] = d.CLASSNAME.map(GROUP), pd.to_datetime(d.VIEW_DATE)
db = np.zeros((G["rows"], G["cols"]), np.int32)
for i, y in enumerate(range(2017, 2027)):
    end = pd.Timestamp(datetime.date(y, 7, 31))
    win = d[(d.date > end - pd.Timedelta(days=365)) & (d.date <= end)]
    for g in range(3):
        geoms = win.geometry[win.g == g]
        if len(geoms):
            db |= rasterize(((x, 1) for x in geoms), out_shape=db.shape, transform=T, fill=0, dtype="uint8", all_touched=True).astype(np.int32) << (3 * i + g)
    print(y, len(win), "alerts", flush=True)
np.save(DATA / "db.npy", db)
share = [float(((db >> 3 * i) & 1).mean()) for i in range(10)]
print("share of cells under a clearing alert, by year:", [round(x, 5) for x in share])
assert all(0.0001 < x < 0.05 for x in share)
