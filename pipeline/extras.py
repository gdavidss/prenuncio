"""Candidate inputs for the lab. Each group is computed as full maps per year and stored as extra
columns next to the cached feature tables, so trying it does not mean rebuilding the cache.
A group that proves itself gets moved into model.features().

  AZ_F=50 python extras.py glad2 <glad500wide.npz>   GLAD alerts over 31, 183 and 730 days, their trend, alerts inside forest
  AZ_F=50 python extras.py lags                      older clearing: the neighbourhood five years ago, its growth since, late-mapped clearing
  AZ_F=50 python extras.py aef <folder of emb_<year>.npy>   AlphaEarth satellite embeddings and their yearly change
  AZ_F=50 python extras.py tmf <tmf500.npz>          JRC Tropical Moist Forest first-disturbance year (unet/tmf.py)
"""
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import model as m  # noqa: E402

CACHE = m.OUT.parent / f"cache{m.F}"
NAN = np.full((m.NROW, m.NCOL), np.nan, np.float32)


def save(name, y, maps):
    for kind in ("train", "eval"):
        f = CACHE / f"{kind}_{y}.npz"
        if f.exists():
            idx = np.load(f)["idx"]
            np.save(CACHE / f"extra_{name}_{kind}_{y}.npy", np.column_stack([a.ravel()[idx] for a in maps]).astype(np.float32))
    print(name, y, len(maps), "columns", flush=True)


def glad2(y, src):
    t = y - 1
    if t < 2020:
        return [NAN] * 13
    w, gi, px = np.load(src), t - 2020, (m.C / 0.0001) ** 2
    g = {d: w[f"g{d}"][gi].astype(np.float32) / px for d in (730, 365, 183, 92, 31)}
    forest = m.forest_at(t) > 0.5
    prev = w["g92"][gi - 1].astype(np.float32) / px if gi else None
    return [g[31], m.box(g[31], 3), m.box(g[31], 9), g[183], m.box(g[183], 3), m.box(g[183], 9),
            m.box(g[730], 3), m.box(g[730], 9), m.box(g[92] - prev, 9) if gi else NAN,
            m.box(g[365] * forest, 9), m.box(g[365] * forest, 25), m.box(g[92] * forest, 3), m.dist(g[31] >= 0.005)]


def lags(y):
    t = y - 1
    cleared = lambda s: np.clip(1 - m.forest_at(s) - m.WATER - m.NONFOREST - m.OUTSIDE, 0, 1)
    now, old = cleared(t), cleared(t - 5)
    return [m.box(old, 9), m.box(old, 25), m.box(now - old, 9), m.box(now - old, 25), m.box(m.resid(t), 9),
            m.defo(t - 3), m.defo(t - 4), m.box(m.defo(t - 3) + m.defo(t - 4), 3), m.dist(now - old >= 0.02)]


def aef(y, folder):
    """AlphaEarth embeddings (unet/aef.py): the last full calendar year before the forecast date, and how
    it changed from the year before. 64 numbers each. Calendar year t-1 is the newest one that holds
    nothing from after 31 July of year t."""
    e = y - 2
    load = lambda yr: np.load(Path(folder) / f"emb_{yr}.npy", mmap_mode="r") if (Path(folder) / f"emb_{yr}.npy").exists() else None
    a, b = load(e), load(e - 1)
    now = [np.asarray(a[k], np.float32) if a is not None else NAN for k in range(64)]
    return now + [now[k] - np.asarray(b[k], np.float32) if a is not None and b is not None else NAN for k in range(64)]


def tmf(y, src):
    """JRC TMF first disturbance (logging, fire damage, small openings), calendar years up to y-2, the
    newest that holds nothing from after the forecast date. The last one, three and ten years, near and
    wide, and the part of it that PRODES still calls forest."""
    w, e, px = np.load(src), y - 2, (m.C / 0.00026949459) ** 2
    d = w["dist"]
    span = lambda a, b: d[a - 2001:b - 2000].sum(0, dtype=np.float32) / px
    t1, t3, t10 = span(e, e), span(e - 2, e), span(e - 9, e)
    ever = t10 + (d[:e - 9 - 2001].sum(0, dtype=np.float32) + w["old"]) / px
    forest = m.forest_at(y - 1)
    return [t1, m.box(t1, 3), m.box(t1, 9), t3, m.box(t3, 3), m.box(t3, 9), m.box(t3, 25), m.box(t10, 9), ever, m.box(ever, 9),
            m.dist(t1 >= 0.01), m.dist(t3 >= 0.01), np.minimum(t3, forest), m.box(np.minimum(t3, forest), 3),
            m.box(np.minimum(t10, forest), 9), m.box(t1 - span(e - 1, e - 1), 9)]


if __name__ == "__main__":
    m.load_2026()
    group = {"glad2": glad2, "lags": lambda y, *_: lags(y), "aef": aef, "tmf": tmf}[sys.argv[1]]
    for y in range(2011, 2027):
        save(sys.argv[1], y, group(y, *sys.argv[2:3]))
