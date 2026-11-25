from __future__ import annotations

import asyncio
import os
import json
import re
import time
import zipfile
from pathlib import Path

import httpx
import numpy as np
import pandas as pd

ROOT = Path.home() / "prenuncio-swarm"
REPO = ROOT / "repo"
OUT_DIR = ROOT / "data" / "alpha"
OUT_DIR.mkdir(parents=True, exist_ok=True)
JEV_URL = os.environ["JEV_URL"]

EMBARGO_QUESTIONS = {
    "remote_satellite_embargo": {
        "instructions": "Does this IBAMA embargo description indicate remote satellite detection or preventive remote embargo rather than an on-the-ground field raid?",
        "criteria": {"yes": "Remote sensing, satellite polygon, DETER/PRODES, or remote preventive embargo", "no": "Field inspection, on-site raid, or unspecified"},
    },
    "organized_pasture_grilagem": {
        "instructions": "Does this embargo involve organized large-scale clearing for cattle pasture, agribusiness, or illegal land grabbing (grilagem) in public/undesignated forest?",
        "criteria": {"yes": "Large-scale pasture, cattle ranching, agribusiness, or public forest land grabbing", "no": "Smallholder, urban, sawmill, or minor activity"},
    },
    "fire_driven_degradation": {
        "instructions": "Does this embargo describe illegal burning, use of fire to clear forest, or fire-damaged vegetation?",
        "criteria": {"yes": "Illegal burning or forest fire", "no": "No mention of fire/burning"},
    },
    "mining_or_roads": {
        "instructions": "Does this embargo describe illegal gold mining (garimpo), illegal roads, airstrips, or mineral extraction inside forest?",
        "criteria": {"yes": "Mining, garimpo, illegal roads, or airstrips", "no": "Not mining or road infrastructure"},
    },
    "high_recurrence_frontier": {
        "instructions": "Does the text indicate an active deforestation frontier likely to suffer further clearing nearby within 12 months (heavy machinery, repeated violation, newly opened forest)?",
        "criteria": {"yes": "Active advancing frontier with high recurrence risk", "no": "Isolated, old, or low recurrence risk"},
    },
}


def _extract_yes_prob(res_obj: dict, qname: str) -> float:
    ans = ((res_obj.get("result") or {}).get("answers") or res_obj.get("answers") or {}).get(qname) or {}
    probs = ans.get("probabilities") or ans.get("probs") or {}
    if isinstance(probs, dict) and "yes" in probs:
        return float(probs["yes"])
    val = str(ans.get("answer") or ans.get("value") or "").lower()
    conf = float(ans.get("confidence") or 0.5)
    return conf if val == "yes" else (1.0 - conf if val == "no" else 0.5)


def _clean_text(s: str) -> str:
    s = re.sub(r"\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b", "", str(s or ""))
    s = re.sub(r"\b\d{2}\.?\d{3}\.?\d{3}/?\d{4}-?\d{2}\b", "", s)
    return re.sub(r"\s+", " ", s).strip()[:650]


def _num(s: pd.Series) -> pd.Series:
    return pd.to_numeric(s.astype(str).str.replace(",", ".", regex=False), errors="coerce")


async def classify_texts(unique_texts: list[str], questions: dict, tag: str, concurrency: int = 52) -> dict[str, dict[str, float]]:
    sem = asyncio.Semaphore(concurrency)
    out: dict[str, dict[str, float]] = {}
    done = errs = 0
    t0 = time.time()
    async with httpx.AsyncClient(timeout=httpx.Timeout(connect=5.0, read=40.0, write=15.0, pool=15.0)) as client:
        async def one(txt: str):
            nonlocal done, errs
            async with sem:
                for attempt in range(3):
                    try:
                        r = await client.post(
                            JEV_URL,
                            json={"state": {"description": txt}, "questions": questions, "agent_id": f"prenuncio_jev_{tag}"},
                        )
                        if r.status_code == 200:
                            js = r.json()
                            out[txt] = {qk: _extract_yes_prob(js, qk) for qk in questions}
                            break
                        if r.status_code == 429:
                            await asyncio.sleep(2.0)
                            continue
                    except Exception:
                        await asyncio.sleep(0.5 * (attempt + 1))
                else:
                    errs += 1
                    out[txt] = {qk: 0.5 for qk in questions}
                done += 1
                if done % 1000 == 0 or done == len(unique_texts):
                    print(f"  [JEV:{tag}] {done}/{len(unique_texts)} errs={errs} rate={done/max(time.time()-t0,1):.1f}/s", flush=True)

        await asyncio.gather(*(one(t) for t in unique_texts))
    return out


async def main():
    g = json.load(open(REPO / "benchmark/data/grid.json"))
    W, N, C, NROW, NCOL = g["west"], g["north"], g["cell"], g["rows"], g["cols"]

    emb_fp = REPO / "data/raw/ibama_embargo/termo_de_embargo.csv"
    if emb_fp.exists() and not (OUT_DIR / "jev_embargo_scored.parquet").exists():
        df = pd.read_csv(emb_fp, sep=";", dtype=str, encoding="utf-8-sig", on_bad_lines="skip")
        cols = {c.upper(): c for c in df.columns}
        if "SIT_CANCELADO" in cols:
            df = df[df[cols["SIT_CANCELADO"]] != "S"]
        c_dt = cols.get("DAT_EMBARGO")
        c_lat = cols.get("NUM_LATITUDE_TAD")
        c_lon = cols.get("NUM_LONGITUDE_TAD")
        c_ha = cols.get("QTD_AREA_EMBARGADA")
        c_des = cols.get("DES_INFRACAO") or cols.get("DES_TAD")
        c_op = cols.get("OPERACAO")
        c_tp = cols.get("TIPO_AREA") or cols.get("DESC_LOCALIZACAO")
        sub = pd.DataFrame({
            "dt": pd.to_datetime(df[c_dt], errors="coerce"),
            "lat": _num(df[c_lat]),
            "lon": _num(df[c_lon]),
            "ha": _num(df[c_ha]).fillna(10.0).clip(0.1, 50000.0) if c_ha else 10.0,
            "des": df[c_des].fillna("") if c_des else "",
            "op": df[c_op].fillna("") if c_op else "",
            "tp": df[c_tp].fillna("") if c_tp else "",
        }).dropna(subset=["dt", "lat", "lon"])
        r = np.floor((N - sub["lat"].to_numpy()) / C).astype(np.int64)
        c = np.floor((sub["lon"].to_numpy() - W) / C).astype(np.int64)
        ok = (r >= 0) & (r < NROW) & (c >= 0) & (c < NCOL) & (sub["dt"].dt.year >= 2008) & (sub["dt"].dt.year <= 2026)
        sub = sub[ok].copy()
        sub["r"] = r[ok]
        sub["c"] = c[ok]
        sub["desc"] = [
            _clean_text(f"op={o[:60]} area_ha={h:.0f} loc={t[:60]} desc={d[:420]}")
            for o, h, t, d in zip(sub["op"], sub["ha"], sub["tp"], sub["des"])
        ]
        uniq = sorted(set(sub["desc"]))
        print(f"[JEV] IBAMA Embargos in Legal Amazon: rows={len(sub)} unique={len(uniq)}", flush=True)
        scores = await classify_texts(uniq, EMBARGO_QUESTIONS, "embargo", concurrency=52)
        for qk in EMBARGO_QUESTIONS:
            sub[f"p_{qk}"] = [scores[d][qk] for d in sub["desc"]]
        sub[["dt", "r", "c", "ha"] + [f"p_{qk}" for qk in EMBARGO_QUESTIONS]].to_parquet(OUT_DIR / "jev_embargo_scored.parquet", index=False)
        print(f"WROTE jev_embargo_scored.parquet rows={len(sub)}", flush=True)

    dof_zip = ROOT / "data/alpha_raw/sinaflor/dof_auth.zip"
    if dof_zip.exists() and not (OUT_DIR / "dof_logging_auth.parquet").exists():
        dfs = []
        with zipfile.ZipFile(dof_zip) as zf:
            for nm in zf.namelist():
                if not nm.lower().endswith(".csv"):
                    continue
                with zf.open(nm) as raw:
                    try:
                        d = pd.read_csv(raw, sep=";", dtype=str, encoding="latin-1", on_bad_lines="skip")
                        dfs.append(d)
                    except Exception:
                        pass
        if dfs:
            ddf = pd.concat(dfs, ignore_index=True)
            print("DOF cols:", list(ddf.columns)[:16], "rows:", len(ddf), flush=True)
            cols = {c.upper(): c for c in ddf.columns}
            c_dt = next((cols[k] for k in cols if "EMISS" in k or "CADAST" in k or "DATA" in k), None)
            c_lat = next((cols[k] for k in cols if "LAT" in k), None)
            c_lon = next((cols[k] for k in cols if "LON" in k), None)
            c_vol = next((cols[k] for k in cols if "VOL" in k or "AREA" in k), None)
            c_uf = cols.get("UF") or cols.get("SIGLA_UF")
            if c_dt and c_lat and c_lon:
                out = pd.DataFrame({
                    "dt": pd.to_datetime(ddf[c_dt], errors="coerce"),
                    "lat": _num(ddf[c_lat]),
                    "lon": _num(ddf[c_lon]),
                    "vol": _num(ddf[c_vol]).fillna(1.0) if c_vol else 1.0,
                    "uf": ddf[c_uf].fillna("") if c_uf else "",
                }).dropna(subset=["dt", "lat", "lon"])
                r = np.floor((N - out["lat"].to_numpy()) / C).astype(np.int64)
                c = np.floor((out["lon"].to_numpy() - W) / C).astype(np.int64)
                ok = (r >= 0) & (r < NROW) & (c >= 0) & (c < NCOL)
                out = out[ok].copy()
                out["r"] = r[ok]
                out["c"] = c[ok]
                out.to_parquet(OUT_DIR / "dof_logging_auth.parquet", index=False)
                print(f"WROTE dof_logging_auth.parquet rows={len(out)}", flush=True)

    print("JEV_DEEP_DONE", flush=True)


if __name__ == "__main__":
    asyncio.run(main())
