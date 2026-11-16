"""Candidate inputs for the lab. Each group is computed as full maps per year and stored as extra
columns next to the cached feature tables, so trying it does not mean rebuilding the cache.
A group that proves itself gets moved into model.features().

  AZ_F=50 python extras.py glad2 <glad500wide.npz>   GLAD alerts over 31, 183 and 730 days, their trend, alerts inside forest
  AZ_F=50 python extras.py lags                      older clearing: the neighbourhood five years ago, its growth since, late-mapped clearing
  AZ_F=50 python extras.py aef <folder of emb_<year>.npy>   AlphaEarth satellite embeddings and their yearly change
  AZ_F=50 python extras.py tmf <tmf500.npz>          JRC Tropical Moist Forest first-disturbance year (unet/tmf.py)
  AZ_F=50 python extras.py asv <permits.csv>         clearing permits valid on the forecast date (SINAFLOR; columns issued, valid_until, lat, lon, ha)
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


_asv = None


def asv(y, src):
    """Clearing permits (SINAFLOR authorisations of vegetation suppression) issued on or before 31 July of
    y-1 and still valid then. The file gives a property's centre point and the authorised area, so each permit
    is a disc of that area: authorised share of the cell, the same for permits of the last 12 months, the
    neighbourhood, the distance to the nearest valid permit and months since the newest one. The register
    is thin before 2020, so earlier forecast dates are unknown, not zero."""
    global _asv
    import pandas as pd
    if _asv is None:
        d = pd.read_csv(src, dtype=str)
        num = lambda c: pd.to_numeric(d[c].str.replace(",", "."), errors="coerce")
        d = d.assign(t0=pd.to_datetime(d.issued, format="%d/%m/%Y", errors="coerce"), t1=pd.to_datetime(d.valid_until, format="%d/%m/%Y", errors="coerce"),
                     r=(m.N - num("lat")) / m.C, c=(num("lon") - m.W) / m.C, ha=num("ha")).dropna(subset=["t0", "r", "c", "ha"])
        _asv = d[(d.r >= 0) & (d.r < m.NROW) & (d.c >= 0) & (d.c < m.NCOL) & (d.ha >= 5)]
    if y - 1 < 2020:
        return [NAN] * 7
    cut = pd.Timestamp(y - 1, 7, 31)
    sel = _asv[(_asv.t0 <= cut) & (_asv.t1.isna() | (_asv.t1 > cut))]
    km = m.C * 111.0

    def discs(rows, value=None):
        out = np.zeros((m.NROW, m.NCOL), np.float32)
        for k, (r0, c0, ha) in enumerate(zip(rows.r, rows.c, rows.ha)):
            rad = np.sqrt(ha / 100 / np.pi) / km + 0.7
            n, a, b = int(np.ceil(rad)), int(r0), int(c0)
            ys, xs = slice(max(a - n, 0), min(a + n + 1, m.NROW)), slice(max(b - n, 0), min(b + n + 1, m.NCOL))
            yy, xx = np.ogrid[ys, xs]
            hit = (yy - r0) ** 2 + (xx - c0) ** 2 <= rad ** 2
            out[ys, xs] = np.maximum(out[ys, xs], hit * (1.0 if value is None else value[k]))
        return out

    valid, new = discs(sel), discs(sel[sel.t0 > cut - pd.Timedelta(days=365)])
    months = ((cut - sel.t0).dt.days / 30.4).to_numpy()
    recency = discs(sel, 1 / (1 + months / 12))  # 1 for a permit issued today, 0.5 after a year
    size = discs(sel, np.log10(sel.ha.to_numpy()))
    return [valid, new, recency, size, m.box(valid, 3), m.box(new, 9), m.dist(valid > 0)]


if __name__ == "__main__":
    m.load_2026()
    group = {"glad2": glad2, "lags": lambda y, *_: lags(y), "aef": aef, "tmf": tmf, "asv": asv}[sys.argv[1]]
    for y in range(2011, 2027):
        save(sys.argv[1], y, group(y, *sys.argv[2:3]))
