"""The public API: every number behind the site as plain JSON files under web/api/v1, served as static files.
No server and no key. Run after export.py, regions.py, calibrate.py, priority.py and actions.py:
  .venv/bin/python -I pipeline/api.py
Personal data never leaves data/raw: from the permit and embargo files only dates, places, areas and the
authorisation number are read.
"""
import datetime
import json
import shutil
import sys
from pathlib import Path

import numpy as np
import pandas as pd
import rasterio

sys.path.insert(0, str(Path(__file__).resolve().parent))
from az import GRID, ROOT  # noqa: E402

WEB, OUT, BASE = ROOT / "web/data", ROOT / "web/api/v1", "https://prenuncio.com/api/v1"
MIRROR = "https://raw.githubusercontent.com/gdavidss/prenuncio/api/v1"  # the same files, pushed by scripts/publish_api.sh
if OUT.exists():
    shutil.rmtree(OUT)
(OUT / "municipality").mkdir(parents=True); (OUT / "cells/2027").mkdir(parents=True)
J = lambda f: json.load(open(WEB / f))
R, META, MONTHLY, PROB, PRIO, ACT = J("regions.json"), J("meta.json"), J("monthly.json"), J("prob.json"), J("priority.json"), J("actions.json")
G = json.load(open(ROOT / "benchmark/data/grid.json"))
FILES = {}
r1 = lambda v: round(float(v), 1)


def put(path, obj, about, fields=None):
    f = OUT / path
    f.parent.mkdir(parents=True, exist_ok=True)
    f.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")))
    if "/" not in path or path.startswith("cells/grid"):
        FILES[path] = {"url": f"{BASE}/{path}", "about": about, **({"fields": fields} if fields else {})}


def geometry(g):
    """the site's delta-coded rings -> GeoJSON MultiPolygon, plus centre and bounding box"""
    polys, xs, ys = [], [], []
    for poly in g:
        rings = []
        for ring in poly:
            a = np.array(ring, float).reshape(-1, 2).cumsum(0) / R["q"]
            xs += a[:, 0].tolist(); ys += a[:, 1].tolist()
            rings.append([[round(x, 3), round(y, 3)] for x, y in a] + [[round(a[0, 0], 3), round(a[0, 1], 3)]])
        polys.append(rings)
    return {"type": "MultiPolygon", "coordinates": polys}, [round(min(xs), 3), round(min(ys), 3), round(max(xs), 3), round(max(ys), 3)]


# ---- per-cell chances for 2027, summed by municipality, and cut into tiles
chance = (rasterio.open(WEB / "p2027.png").read(1).astype(np.float32) / 255) ** 2
raw = rasterio.open(WEB / "p2027.png").read(1)
st = np.load(GRID / "static.npz")
mun500 = np.repeat(np.repeat(st["mun"], 2, 0), 2, 1)[:G["rows"], :G["cols"]]
codes, inv = np.unique(mun500, return_inverse=True)
inv = inv.ravel()
agg = lambda w: dict(zip(codes.tolist(), np.bincount(inv, w.ravel(), len(codes))))
EXP, FOR, C5, C20 = agg(chance), agg(chance > 0), agg(chance >= 0.05), agg(chance >= 0.2)
MAXC = dict(zip(codes.tolist(), np.maximum.reduceat(chance.ravel()[np.argsort(inv, kind="stable")], np.r_[0, np.cumsum(np.bincount(inv))[:-1]])))
TILE, tiles = 100, 0
for tr in range(0, G["rows"], TILE):
    for tc in range(0, G["cols"], TILE):
        t = raw[tr:tr + TILE, tc:tc + TILE]
        if t.any():
            (OUT / f"cells/2027/{tr // TILE}_{tc // TILE}.bin").write_bytes(np.ascontiguousarray(t).tobytes()); tiles += 1

# ---- enforcement, credit and permits by municipality
mun1 = st["mun"].ravel()
yr = lambda t: 2000 + t // 12
aut = pd.read_parquet(GRID / "autos.parquet"); aut = aut.assign(mun=mun1[aut.cell.to_numpy()], y=yr(aut.m))
NOTICES = aut[aut.y >= 2017].groupby(["mun", "y"]).n.sum()
e = pd.read_csv(ROOT / "data/raw/ibama_embargo/termo_de_embargo.csv", sep=";", dtype=str, encoding="utf-8-sig",
                usecols=["DAT_EMBARGO", "COD_MUNICIPIO", "QTD_AREA_EMBARGADA", "OPERACAO_SOL_RECURSO", "DES_TAD", "SIT_CANCELADO"])
e = e.assign(y=pd.to_datetime(e.DAT_EMBARGO.str[:10], errors="coerce", format="mixed", dayfirst=True).dt.year, mun=pd.to_numeric(e.COD_MUNICIPIO, errors="coerce"),
             km2=pd.to_numeric(e.QTD_AREA_EMBARGADA.str.replace(",", "."), errors="coerce") / 100,
             remote=(e.OPERACAO_SOL_RECURSO.fillna("") + " " + e.DES_TAD.fillna("")).str.upper().str.contains("CONTROLE REMOTO"))
e = e[(e.SIT_CANCELADO != "S") & e.y.between(2017, 2026) & e.mun.notna() & (e.km2 > 0)]
EMB = e.assign(kind=np.where(e.remote, "remote", np.where(e.km2 >= 50, "collective", "field"))).groupby(["mun", "y", "kind"]).km2.sum()
cr = pd.read_parquet(GRID / "credit.parquet"); cr = cr.assign(y=yr(cr.t))
CREDIT = cr.groupby(["mun", "y"])[["cattle_inv", "cattle_work", "crop_inv", "crop_work"]].sum()
p = pd.read_csv(ROOT / "data/raw/sinaflor/asv.csv", sep=";", dtype=str, encoding="latin-1", on_bad_lines="skip",
                usecols=["NRO_AUTORIZACAO", "DATA_DE_EMISSAO", "DATA_DE_VALIDADE", "UF", "LATITUDE_PONTO_CENTR_EMPREEND", "LONGITUDE_PONTO_CENTR_EMPREEND", "AREA_TOTAL_PROJ", "FINALIDADE_SUPRESSAO"]).drop_duplicates("NRO_AUTORIZACAO")
num = lambda s: pd.to_numeric(s.str.replace(",", "."), errors="coerce")
iso = lambda s: pd.to_datetime(s, format="%d/%m/%Y", errors="coerce")
p = pd.DataFrame({"id": p.NRO_AUTORIZACAO, "issued": iso(p.DATA_DE_EMISSAO), "valid_until": iso(p.DATA_DE_VALIDADE), "state": p.UF, "lat": num(p.LATITUDE_PONTO_CENTR_EMPREEND),
                  "lon": num(p.LONGITUDE_PONTO_CENTR_EMPREEND), "hectares": num(p.AREA_TOTAL_PROJ), "purpose": p.FINALIDADE_SUPRESSAO.str.encode("latin-1", "ignore").str.decode("utf-8", "ignore")}).dropna(subset=["issued", "lat", "lon", "hectares"])
rr, cc = ((G["north"] - p.lat) / (2 * G["cell"])).astype(int), ((p.lon - G["west"]) / (2 * G["cell"])).astype(int)
p = p[(rr >= 0) & (rr < st["mun"].shape[0]) & (cc >= 0) & (cc < st["mun"].shape[1])]
p["municipality_code"] = st["mun"][((G["north"] - p.lat) / (2 * G["cell"])).astype(int), ((p.lon - G["west"]) / (2 * G["cell"])).astype(int)]
CUT = pd.Timestamp(2026, 7, 31)
p["valid_on_forecast_date"] = (p.issued <= CUT) & (p.valid_until.isna() | (p.valid_until > CUT))
permit = lambda r: {"id": r.id, "issued": r.issued.date().isoformat(), "valid_until": None if pd.isna(r.valid_until) else r.valid_until.date().isoformat(), "state": r.state,
                    "lat": round(r.lat, 5), "lon": round(r.lon, 5), "hectares": r1(r.hectares), "purpose": r.purpose, "municipality_code": int(r.municipality_code), "valid_on_forecast_date": bool(r.valid_on_forecast_date)}
PERMITS = [permit(r) for r in p.sort_values("issued").itertuples()]

# ---- sectors
ends = pd.Period(R["months"]["end"], "M")
months36 = [str(ends - k) for k in range(35, -1, -1)]
series = lambda it: {"clearing_km2_by_year": dict(zip(map(str, R["cyears"]), it["c"])), "forecast_km2_by_year": dict(zip(map(str, R["eyears"]), it["e"])),
                     "months": months36, "monthly": dict(zip(R["months"]["names"], it["m"])),
                     "next_months": {k: {"expected_km2": v[0], "months": META["layers"][k]["months"], "from": META["layers"][k]["from"]} for k, v in it["L"].items()}}


def sector(it, kind):
    geo, bbox = geometry(it["g"])
    d = {"id": it["id"], "name": it["n"], **({"state": it["s"]} if "s" in it else {}), "kind": kind, "area_km2": it["a"], "forest_km2": it["f"],
         "expected_clearing_2027_km2": it["e"][-1], "cleared_2026_km2": it["c"][-1], "bbox": bbox}
    return d, {**d, **series(it), "geometry": geo}


lists = {}
for kind, name in (("uf", "states"), ("mun", "municipalities"), ("ti", "indigenous-lands"), ("uc", "conservation-units")):
    items = J(f"sectors_{kind}.json")["items"]
    order = sorted(items, key=lambda it: -it["e"][-1])
    rank = {it["id"]: k for k, it in enumerate(order, 1)}
    short, full = [], []
    for it in items:
        s, f = sector(it, name)
        s["rank"] = f["rank"] = rank[it["id"]]
        if kind == "mun":
            c = it["id"]
            extra = {"cells_expected_to_lose_a_hectare_2027": r1(EXP.get(c, 0)), "forest_cells": int(FOR.get(c, 0)), "cells_with_chance_over_5pct": int(C5.get(c, 0)),
                     "cells_with_chance_over_20pct": int(C20.get(c, 0)), "highest_cell_chance": round(float(MAXC.get(c, 0)), 3)}
            s.update(extra); f.update(extra)
            ys = range(2017, 2027)
            f["enforcement_by_year"] = {str(y): {"ibama_flora_notices": int(NOTICES.get((c, y), 0)), **{f"embargoed_km2_{k}": r1(EMB.get((c, y, k), 0)) for k in ("remote", "field", "collective")}} for y in ys}
            f["rural_credit_brl_by_year"] = {str(y): {k: round(float(CREDIT.loc[(c, y), k])) for k in CREDIT.columns} for y in range(2013, 2027) if (c, y) in CREDIT.index}
            mine = p[p.municipality_code == c]
            f["clearing_permits"] = [permit(r) for r in mine.sort_values("issued").itertuples()]
            f["priority_blocks"] = [b for b in PRIO["blocks"] if b["mun_code"] == c]
            s["clearing_permits_valid"] = int(mine.valid_on_forecast_date.sum())
            put(f"municipality/{c}.json", f, "")
        short.append(s); full.append(f)
    lists[name] = short
    put(f"{name}.json", sorted(short if kind == "mun" else full, key=lambda d: d["rank"]),
        {"states": "The nine states, full detail each.", "municipalities": "Every municipality with forest, one summary row each. Full detail in municipality/<id>.json.",
         "indigenous-lands": "Indigenous lands, full detail each.", "conservation-units": "Conservation units, full detail each."}[name])

months = R["months"]
put("amazon.json", {"forecast_year": 2027, "forecast_date": "2026-07-31", "expected_clearing_km2": round(R["total_km2"]), "forest_cells": PROB["forecast"]["cells"],
                    "cells_expected_to_lose_a_hectare": PROB["forecast"]["expected_cells"], "cells_by_chance": [{"from": a, "to": b, "cells": n} for a, b, n in PROB["forecast"]["cells_by_chance"]],
                    "clearing_km2_by_year": {str(y): r1(sum(it["c"][k] for it in J("sectors_uf.json")["items"])) for k, y in enumerate(R["cyears"])},
                    "monthly": {"start": months["start"], "end": months["end"], **{k: months[k] for k in ("clear", "scar", "degr", "mine", "autos", "oni")}},
                    "monthly_names": {"clear": "DETER clearing km2", "scar": "DETER fire scar km2", "degr": "DETER degradation and logging km2", "mine": "DETER mining km2", "autos": "IBAMA flora infraction notices", "oni": "Oceanic Nino Index, last 36 months"}},
    "The whole Amazon: the 2027 forecast, the distribution of cell chances, yearly and monthly history.")
put("monthly-forecast.json", MONTHLY, "km2 per month for the next 12 months, by hazard, for the Amazon and each state, with ranges and the backtest of the model chosen. Fire has no usable forecast (see backtest).")
put("calibration.json", PROB, "How the cell chances were checked: for 2024 to 2026, the chance given against the share of cells that lost a hectare.")
put("priority.json", PRIO, "The 500 blocks of 5 km ranked highest for 2027, with centre, municipality, land type and the replay of the same ranking on past years. Also priority.csv.")
shutil.copy(WEB / "priority.csv", OUT / "priority.csv")
put("enforcement-effect.json", ACT, "Clearing observed against clearing implied had IBAMA enforcement stayed at its 2021 to 2022 level, by semester, with the action series. A floor, not a causal estimate.")
put("permits.json", PERMITS, "Clearing permits (SINAFLOR authorisations of vegetation suppression, IBAMA open data) inside the grid: dates, point, hectares, purpose, municipality. No holder names or tax numbers.")
put("benchmark.json", {"leaderboard": json.load(open(ROOT / "benchmark/leaderboard.json")), "scorer": "https://github.com/gdavidss/prenuncio/tree/main/benchmark"}, "The open benchmark's leaderboard.")
put("cells/grid.json", {"west": G["west"], "north": G["north"], "cell_degrees": G["cell"], "rows": G["rows"], "cols": G["cols"], "tile": TILE, "tiles": tiles,
                        "decode": "chance = (byte / 255) ** 2; byte 0 = not forest; row = floor((north - lat) / cell_degrees), col = floor((lon - west) / cell_degrees)",
                        "tile_url": f"{BASE}/cells/2027/{{floor(row/100)}}_{{floor(col/100)}}.bin", "tile_layout": "row-major uint8, 100 columns per row (fewer in the last column and row of tiles); a missing tile means no forest",
                        "rasters": {str(y): f"https://prenuncio.com/data/p{y}.png" for y in range(2022, 2028)}},
    "The 500 m grid and how to read a cell's chance: whole-basin 8-bit PNGs per year, and 2027 cut into small binary tiles.")

index = {"name": "Prenúncio API", "version": 1, "built": datetime.date.today().isoformat(), "base": BASE, "mirror": MIRROR, "mirror_note": "The same files on GitHub. Use it if prenuncio.com answers 403 with a browser check, which its host does to some clients that are not browsers.", "instructions": f"{BASE}/llms.txt",
         "what": "Forecast of deforestation in the Brazilian Amazon: for every 500 m forest cell, the chance it loses at least one hectare in the PRODES year 2027 (August 2026 to July 2027), with sums by municipality, state, Indigenous land and conservation unit.",
         "access": "Static JSON over HTTPS. No key, no rate limit beyond the host's, CORS open. GET only.",
         "licence": "CC BY-SA 4.0 for the data (derived from INPE PRODES and DETER); code MIT. Credit INPE and Prenúncio.", "source": "https://github.com/gdavidss/prenuncio",
         "endpoints": {**FILES, "municipality/{id}.json": {"url": f"{BASE}/municipality/{{id}}.json", "about": "Full detail for one municipality by IBGE code (7 digits): yearly clearing since 2008, past and current forecasts, 36 months of alerts, enforcement and rural credit by year, clearing permits, priority blocks, cell chance counts, GeoJSON outline."},
                       "cells/2027/{r}_{c}.bin": {"url": f"{BASE}/cells/2027/{{r}}_{{c}}.bin", "about": "One tile of cell chances, see cells/grid.json."}, "priority.csv": {"url": f"{BASE}/priority.csv", "about": "The priority blocks as CSV."}}}
(OUT / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=1))
top = lists["municipalities"]; top = sorted(top, key=lambda d: d["rank"])[0]
(OUT / "llms.txt").write_text(f"""# Prenúncio API, instructions for agents

Prenúncio forecasts deforestation in the Brazilian Amazon. Every 500 m forest cell (about 14 million) gets the
chance that it loses at least one hectare in the PRODES year 2027 (1 August 2026 to 31 July 2027). The forecast
was made with information up to 31 July 2026. Sums are given by municipality, state, Indigenous land and
conservation unit.

## How to connect
Plain HTTPS GET, static JSON, no key, no login, CORS open. Base: {BASE}
Start with {BASE}/index.json, which lists every endpoint with a description.
If prenuncio.com answers 403 with a browser check (its host does that to some clients that are not browsers),
use the mirror, which holds the same files: {MIRROR}
for example {MIRROR}/index.json

## Endpoints
- amazon.json             the whole Amazon: forecast total, distribution of cell chances, yearly and monthly history
- states.json             the nine states, full detail
- municipalities.json     one summary row per municipality (id is the 7 digit IBGE code), sorted by rank
- municipality/<id>.json  full detail for one municipality, for example municipality/{top["id"]}.json ({top["name"]}, rank 1)
- indigenous-lands.json, conservation-units.json   the same for protected areas
- priority.json, priority.csv   the 500 blocks of 5 km ranked highest, where to look first
- permits.json            clearing permits (SINAFLOR), with dates, point and hectares
- monthly-forecast.json   km2 per month for the next 12 months, by hazard, Amazon and states, with ranges
- enforcement-effect.json clearing observed against clearing implied with enforcement held at its 2021 to 2022 level
- calibration.json        the check of the chances against what happened in 2024 to 2026
- benchmark.json          the open benchmark's leaderboard
- cells/grid.json         the grid, and how to read the chance of any cell

## The chance of one place
row = floor((north - lat) / cell_degrees), col = floor((lon - west) / cell_degrees), from cells/grid.json.
GET cells/2027/<floor(row/100)>_<floor(col/100)>.bin, a row-major array of bytes, 100 per row.
byte = bytes[(row % 100) * width + (col % 100)], where width is 100 except in the last column of tiles.
chance = (byte / 255) ** 2. Byte 0 means not forest. A 404 means no forest in that tile.

## Reading the numbers
- km2 figures by year are PRODES years (August to July), named by the year they end in.
- Monthly figures are what INPE's DETER detects; the yearly PRODES count is larger.
- "expected" values are forecasts. "cleared" and "observed" values are measurements by INPE.
- The chances were checked: in 2024, cells given about 3% lost a hectare 3% of the time (calibration.json).
- A chance is not a verdict. Most cells with a 10% chance are not cleared.
- Fire amounts are not forecast; they depend on a drought that has not happened yet.
- enforcement-effect.json is an association and a floor, not a causal estimate.
- Permit points are property centres, not the clearing itself. Mato Grosso permits may have entered the federal
  register after their issue date.

## Licence and credit
Data CC BY-SA 4.0, derived from INPE PRODES and DETER, IBAMA and Banco Central open data. Credit INPE and Prenúncio.
Code and the open benchmark: https://github.com/gdavidss/prenuncio
""")
# checks
blob = json.dumps(PERMITS).lower()
assert not any(k in blob for k in ("cpf", "cnpj", "nome_detentor", "detentor")), "personal fields leaked into permits"
assert abs(sum(d["expected_clearing_2027_km2"] for d in lists["states"]) - R["total_km2"]) < 0.02 * R["total_km2"]
assert all((OUT / k).exists() for k in FILES) and tiles > 500
t = raw[2000:2100, 3000:3100]; assert (OUT / "cells/2027/20_30.bin").read_bytes() == t.tobytes() or not t.any()
n = sum(1 for _ in OUT.rglob("*")); size = sum(f.stat().st_size for f in OUT.rglob("*") if f.is_file()) / 1e6
print(len(FILES), "listed endpoints,", n, "files,", round(size, 1), "MB;", len(PERMITS), "permits,", tiles, "tiles;", "top municipality", top["name"], top["expected_clearing_2027_km2"])
