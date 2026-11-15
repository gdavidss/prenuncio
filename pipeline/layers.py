"""Put the vector layers on the model grid.

Outputs in data/grid/:
  static.npz   ti, uc_group (1 strict protection, 2 sustainable use, 3 APA), uc_year, mun, uf  [rows, cols]
  deter.parquet  cell, ym (months since 2016-01), grp (0 clearing, 1 degradation and logging, 2 fire scar, 3 mining alone), km2
  prodes2026pri.npy  km2 of PRODES 2026 priority-scene increments per cell
  fire.parquet     cell, m (months since 2000-01), n   reference-satellite fire detections
  embargo.parquet  cell, m, m_end (month lifted, 9999 if still in force), ha   IBAMA embargoes
  autos.parquet    cell, m, n   IBAMA flora infraction notices
Run: .venv/bin/python -I pipeline/layers.py [static|events]   (one half only; default both)
"""
import glob
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import pyogrio
from affine import Affine
from rasterio.features import rasterize

sys.path.insert(0, str(Path(__file__).resolve().parent))
from az import F, GRID, ROOT, load_grid  # noqa: E402

RAW = ROOT / "data/raw"
_counts, _g = load_grid()
W, N, C, NROW, NCOL = _g["west"], _g["north"], _g["cell"], _g["rows"], _g["cols"]
TR = Affine(C, 0, W, 0, -C, N)

DETER_GROUP = {"DESMATAMENTO_CR": 0, "DESMATAMENTO_VEG": 0, "MINERACAO": 0,
               "DEGRADACAO": 1, "CS_DESORDENADO": 1, "CS_GEOMETRICO": 1, "CORTE_SELETIVO": 1,
               "CICATRIZ_DE_QUEIMADA": 2}


def shp(sub, pat="*.shp"):
    return pyogrio.read_dataframe(glob.glob(str(RAW / sub / pat))[0])


def burn(gdf, values, dtype):
    return rasterize(zip(gdf.geometry, values), out_shape=(NROW, NCOL), transform=TR, fill=0, dtype=dtype)


def to_cells(gdf, km2):
    """Area of each polygon -> (flat cell index, km2). Small polygons go to the cell under their
    centre; polygons larger than a cell are split evenly over the cells they touch."""
    b = gdf.geometry.bounds.to_numpy()
    km2 = np.asarray(km2, float)
    col = ((b[:, 0] + b[:, 2]) / 2 - W) / C
    row = (N - (b[:, 1] + b[:, 3]) / 2) / C
    big = ((b[:, 2] - b[:, 0]) > C) | ((b[:, 3] - b[:, 1]) > C)
    ok = (col >= 0) & (col < NCOL) & (row >= 0) & (row < NROW)
    small = ~big & ok
    cells = [row[small].astype(np.int64) * NCOL + col[small].astype(np.int64)]
    areas, src = [km2[small]], [np.nonzero(small)[0]]
    for i in np.nonzero(big & ok)[0]:
        c0, c1 = int((b[i, 0] - W) / C), int((b[i, 2] - W) / C) + 1
        r0, r1 = int((N - b[i, 3]) / C), int((N - b[i, 1]) / C) + 1
        c0, r0, c1, r1 = max(c0, 0), max(r0, 0), min(c1, NCOL), min(r1, NROW)
        m = rasterize([gdf.geometry.iloc[i]], out_shape=(r1 - r0, c1 - c0),
                      transform=Affine(C, 0, W + c0 * C, 0, -C, N - r0 * C), all_touched=True)
        rr, cc = np.nonzero(m)
        if len(rr):
            cells.append((rr + r0).astype(np.int64) * NCOL + cc + c0)
            areas.append(np.full(len(rr), km2[i] / len(rr)))
            src.append(np.full(len(rr), i))
    return np.concatenate(cells), np.concatenate(areas), np.concatenate(src)


def main():
    ti = shp("aux_ti")
    uc = shp("aux_uc").sort_values("grupo", ascending=False)  # strict protection burned last, wins overlaps
    apa = uc.categoria.str.contains("Proteção Ambiental", na=False)
    grp = np.where(apa, 3, np.where(uc.grupo == "PI", 1, 2))
    mun, uf = shp("aux_mun"), shp("aux_uf")
    np.savez_compressed(
        GRID / "static.npz",
        ti=burn(ti, np.ones(len(ti)), "uint8"),
        uc_group=burn(uc, grp, "uint8"),
        uc_year=burn(uc, pd.to_numeric(uc.ano_cria, errors="coerce").fillna(1990).astype(int), "uint16"),
        mun=burn(mun, mun.geocodigo.astype(int), "int32"),
        uf=burn(uf, uf.geocodigo.astype(int), "uint8"),
    )
    print("static done")

    d = shp("deter")
    d = d[d.CLASSNAME.isin(DETER_GROUP) & d.geometry.notna()].reset_index(drop=True)
    cell, km2, src = to_cells(d, d.AREAMUNKM)
    date = pd.to_datetime(d.VIEW_DATE).to_numpy()[src].astype("datetime64[M]")
    raw = pd.DataFrame({
        "cell": cell.astype(np.int32),
        "ym": (date - np.datetime64("2016-01")).astype(int).astype(np.int16),
        "grp": d.CLASSNAME.map(DETER_GROUP).to_numpy()[src].astype(np.int8),
        "km2": km2.astype(np.float32),
    })
    out = raw.groupby(["cell", "ym", "grp"], as_index=False).km2.sum()
    assert abs(out.km2.sum() - d.AREAMUNKM.sum()) / d.AREAMUNKM.sum() < 0.01  # area conserved
    # mining is part of clearing (group 0) and also kept on its own as group 3, so it can be a hazard of its own
    mining = raw[(d.CLASSNAME == "MINERACAO").to_numpy()[src]].assign(grp=np.int8(3))
    out = pd.concat([out, mining.groupby(["cell", "ym", "grp"], as_index=False).km2.sum()], ignore_index=True)
    out.to_parquet(GRID / "deter.parquet")
    print("deter done", len(out), "rows,", round(out.km2.sum()), "km2")

    p = shp("prodes_2026_pri", "yearly_deforestation*.shp")
    cell, km2, _ = to_cells(p, p.area_km)
    np.save(GRID / "prodes2026pri.npy", np.bincount(cell, km2, NROW * NCOL).astype(np.float32).reshape(NROW, NCOL))
    print("prodes 2026 priority done", round(km2.sum()), "km2")


def cell_of(lon, lat):
    """Flat cell index for points; -1 outside the grid."""
    col, row = np.floor((lon - W) / C), np.floor((N - lat) / C)
    ok = (col >= 0) & (col < NCOL) & (row >= 0) & (row < NROW)
    return np.where(ok, row * NCOL + col, -1).astype(np.int64)


def month(dates):
    """Months since 2000-01. Unparseable or absurd dates (the embargo file has a year 2925) become NaT."""
    d = pd.to_datetime(dates, errors="coerce")
    d = d.where((d.dt.year >= 2000) & (d <= pd.Timestamp.now()))
    return (d.dt.year - 2000) * 12 + d.dt.month - 1


def num(s):
    return pd.to_numeric(s.astype(str).str.replace(",", "."), errors="coerce")


def events():
    inside = (np.asarray(_counts[-1]) < F * F / 2).ravel()

    def keep(df):
        df = df[(df.cell >= 0) & df.m.notna()]
        return df[inside[df.cell.to_numpy()]].astype({"cell": np.int32, "m": np.int16})

    fires = []
    for f in sorted(glob.glob(str(RAW / "fire/**/*.csv"), recursive=True)):  # INPE's 2025 zip unpacks into tmp/
        d = pd.read_csv(f, usecols=["lat", "lon", "data_pas"])
        fires.append(pd.DataFrame({"cell": cell_of(d.lon.to_numpy(), d.lat.to_numpy()), "m": month(d.data_pas)}))
    for f in sorted(glob.glob(str(RAW / "fire_2026/*.csv"))):
        d = pd.read_csv(f, usecols=["lat", "lon", "data_hora_gmt"])
        fires.append(pd.DataFrame({"cell": cell_of(d.lon.to_numpy(), d.lat.to_numpy()), "m": month(d.data_hora_gmt)}))
    fire = keep(pd.concat(fires)).groupby(["cell", "m"], as_index=False).size().rename(columns={"size": "n"})
    fire.to_parquet(GRID / "fire.parquet")
    print("fire done", int(fire.n.sum()), "detections,", fire.m.min(), "to", fire.m.max())
    by_year = fire.groupby(fire.m // 12).n.sum()
    assert by_year.reindex(range(3, int(fire.m.max()) // 12 + 1), fill_value=0).min() > 10_000, "a whole year of fire detections is missing"

    # Only place, date, area and status leave these files. Names and CPF/CNPJ are never read.
    e = pd.read_csv(RAW / "ibama_embargo/termo_de_embargo.csv", sep=";", dtype=str, encoding="utf-8-sig",
                    usecols=["DAT_EMBARGO", "NUM_LONGITUDE_TAD", "NUM_LATITUDE_TAD", "QTD_AREA_EMBARGADA",
                             "DAT_DESEMBARGO", "SIT_CANCELADO"])
    e = e[e.SIT_CANCELADO != "S"]
    emb = keep(pd.DataFrame({"cell": cell_of(num(e.NUM_LONGITUDE_TAD).to_numpy(), num(e.NUM_LATITUDE_TAD).to_numpy()),
                             "m": month(e.DAT_EMBARGO), "m_end": month(e.DAT_DESEMBARGO).fillna(9999),
                             "ha": num(e.QTD_AREA_EMBARGADA).fillna(0).clip(0, 50_000)}))
    emb.astype({"m_end": np.int16, "ha": np.float32}).to_parquet(GRID / "embargo.parquet")
    print("embargo done", len(emb), "in the Legal Amazon,", round(emb.ha.sum() / 100), "km2")

    autos = []
    for f in sorted(glob.glob(str(RAW / "ibama_autos/auto_infracao_*.csv"))):
        if int(f[-8:-4]) < 2000:
            continue
        a = pd.read_csv(f, sep=";", dtype=str, encoding="utf-8-sig", on_bad_lines="skip",
                        usecols=["DAT_HORA_AUTO_INFRACAO", "TIPO_INFRACAO", "SIT_CANCELADO",
                                 "NUM_LONGITUDE_AUTO", "NUM_LATITUDE_AUTO"])
        a = a[(a.TIPO_INFRACAO == "Flora") & (a.SIT_CANCELADO != "S")]
        autos.append(pd.DataFrame({"cell": cell_of(num(a.NUM_LONGITUDE_AUTO).to_numpy(), num(a.NUM_LATITUDE_AUTO).to_numpy()),
                                   "m": month(a.DAT_HORA_AUTO_INFRACAO)}))
    au = keep(pd.concat(autos)).groupby(["cell", "m"], as_index=False).size().rename(columns={"size": "n"})
    au.to_parquet(GRID / "autos.parquet")
    print("autos done", int(au.n.sum()), "flora notices in the Legal Amazon")
    print(au.groupby(au.m // 12 + 2000).n.sum().tail(12).to_dict())


if __name__ == "__main__":
    if sys.argv[1:] != ["events"]:
        main()
    if sys.argv[1:] != ["static"]:
        events()
