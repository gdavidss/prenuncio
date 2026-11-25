from __future__ import annotations

import asyncio
import os
import glob
import json
import re
import time
from pathlib import Path

import httpx
import numpy as np
import pandas as pd
from scipy import ndimage as ndi

ROOT = Path.home() / "prenuncio-swarm"
REPO = ROOT / "repo"
ALPHA_RAW = ROOT / "data" / "alpha_raw" / "sinaflor"
OUT_DIR = ROOT / "data" / "alpha"
OUT_DIR.mkdir(parents=True, exist_ok=True)
JEV_URL = os.environ["JEV_URL"]

PERMIT_QUESTIONS = {
    "commercial_ag": {
        "instructions": "Does this Brazilian land-clearing permit describe large-scale commercial agriculture, soybean, mechanized farming, or agribusiness land conversion?",
        "criteria": {"yes": "Commercial crop/soy/agribusiness clearing", "no": "Smallholder, infrastructure, maintenance, or other"},
    },
    "pasture_cattle": {
        "instructions": "Does this permit describe conversion to cattle pasture, livestock grazing, or ranching expansion?",
        "criteria": {"yes": "Cattle pasture or livestock land conversion", "no": "Not pasture/cattle conversion"},
    },
    "logging_timber": {
        "instructions": "Does this permit describe selective timber harvesting, sustainable forest management (PMFS), or wood extraction?",
        "criteria": {"yes": "Logging or forest management timber extraction", "no": "Clear-cut for non-timber use or other"},
    },
    "infra_mining": {
        "instructions": "Does this permit describe mining, roads, transmission lines, hydro/dams, or industrial infrastructure?",
        "criteria": {"yes": "Mining, road, energy, or infrastructure project", "no": "Agricultural or rural farming use"},
    },
    "high_exec_intent": {
        "instructions": "Given the purpose and area size, is this permit likely to result in rapid, full execution of clear-cutting within 12 months?",
        "criteria": {"yes": "Direct mechanized clearing or urgent conversion likely executed quickly", "no": "Long-horizon, partial, or low-intensity permit"},
    },
}

IBAMA_QUESTIONS = {
    "active_clearcut_front": {
        "instructions": "Does this Brazilian IBAMA environmental infraction describe active illegal clear-cutting deforestation of native Amazon forest?",
        "criteria": {"yes": "Direct illegal deforestation or clear-cutting of forest", "no": "Transport, paperwork, sawmills, or minor violation"},
    },
    "illegal_logging_road": {
        "instructions": "Does this infraction describe illegal selective logging, unauthorized wood transport/extraction, or opening illegal logging roads?",
        "criteria": {"yes": "Illegal logging, chainsaw/tractor timber extraction, or road opening", "no": "Not logging-related"},
    },
    "illegal_mining": {
        "instructions": "Does this infraction describe illegal gold mining (garimpo), dredging, or mineral extraction in forest?",
        "criteria": {"yes": "Illegal mining or garimpo", "no": "Not mining"},
    },
    "fire_pasture_grilagem": {
        "instructions": "Does this infraction describe illegal burning, forest fire setting, cattle grazing in embargoed forest, or land grabbing (grilagem)?",
        "criteria": {"yes": "Illegal fire, pasture invasion, or land grabbing", "no": "Not fire/pasture/grilagem"},
    },
    "repeat_high_severity": {
        "instructions": "Does this infraction indicate severe organized illegal clearing (heavy machinery, breaking prior embargo, large area, or named enforcement operation)?",
        "criteria": {"yes": "Heavy machinery, broken embargo, large scale, or special operation", "no": "Routine or small-scale infraction"},
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


async def classify_texts(unique_texts: list[str], questions: dict, tag: str, concurrency: int = 48) -> dict[str, dict[str, float]]:
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
                            json={"state": {"description": txt[:1200]}, "questions": questions, "agent_id": f"prenuncio_jev_{tag}"},
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


def _clean_text(s: str) -> str:
    s = re.sub(r"\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b", "", str(s or ""))
    s = re.sub(r"\b\d{2}\.?\d{3}\.?\d{3}/?\d{4}-?\d{2}\b", "", s)
    s = re.sub(r"\s+", " ", s).strip()
    return s[:600]


def _num(s: pd.Series) -> pd.Series:
    return pd.to_numeric(s.astype(str).str.replace(",", ".", regex=False), errors="coerce")


async def run_all():
    g = json.load(open(REPO / "benchmark/data/grid.json"))
    W, N, C, NROW, NCOL = g["west"], g["north"], g["cell"], g["rows"], g["cols"]

    def cell_xy(lat, lon):
        r = np.floor((N - lat) / C).astype(np.int64)
        c = np.floor((lon - W) / C).astype(np.int64)
        ok = (r >= 0) & (r < NROW) & (c >= 0) & (c < NCOL)
        return r, c, ok

    permit_rows = []
    for fn, src_kind in [("asv_raw.csv", "ASV"), ("uas_raw.csv", "UAS"), ("pmfs_raw.csv", "PMFS")]:
        fp = ALPHA_RAW / fn
        if not fp.exists():
            continue
        try:
            df = pd.read_csv(fp, sep=";", dtype=str, encoding="utf-8-sig", on_bad_lines="skip")
        except Exception:
            continue
        cols = {c.upper(): c for c in df.columns}
        c_iss = cols.get("DATA_DE_EMISSAO") or cols.get("DAT_EMISSAO")
        c_val = cols.get("DATA_DE_VALIDADE") or cols.get("DAT_VALIDADE")
        c_lat = cols.get("LATITUDE_PONTO_CENTR_EMPREEND") or cols.get("LATITUDE")
        c_lon = cols.get("LONGITUDE_PONTO_CENTR_EMPREEND") or cols.get("LONGITUDE")
        c_ha = cols.get("AREA_TOTAL_PROJ") or cols.get("AREA_AUTORIZADA") or cols.get("AREA")
        c_fin = cols.get("FINALIDADE_SUPRESSAO") or cols.get("FINALIDADE") or cols.get("TIPO_AUTORIZACAO")
        c_org = cols.get("ORGAO_AMBIENTAL_RESP_ANALISE") or cols.get("COMPETENCIA_DA_AVALIACAO")
        c_uf = cols.get("UF")
        if not (c_iss and c_lat and c_lon):
            continue
        sub = pd.DataFrame({
            "kind": src_kind,
            "issued": pd.to_datetime(df[c_iss], format="%d/%m/%Y", errors="coerce"),
            "valid": pd.to_datetime(df[c_val], format="%d/%m/%Y", errors="coerce") if c_val else pd.NaT,
            "lat": _num(df[c_lat]),
            "lon": _num(df[c_lon]),
            "ha": _num(df[c_ha]).fillna(10.0).clip(1.0, 50000.0) if c_ha else 50.0,
            "uf": df[c_uf].fillna("") if c_uf else "",
            "fin": df[c_fin].fillna("") if c_fin else "",
            "org": df[c_org].fillna("") if c_org else "",
        }).dropna(subset=["issued", "lat", "lon"])
        r, c, ok = cell_xy(sub["lat"].to_numpy(), sub["lon"].to_numpy())
        sub = sub[ok].copy()
        sub["r"] = r[ok]
        sub["c"] = c[ok]
        sub = sub.drop_duplicates(subset=["kind", "issued", "r", "c", "ha"])
        sub["desc"] = [
            _clean_text(f"type={k} uf={u} area_ha={h:.0f} purpose={f} agency={o}")
            for k, u, h, f, o in zip(sub["kind"], sub["uf"], sub["ha"], sub["fin"], sub["org"])
        ]
        permit_rows.append(sub)

    if permit_rows:
        pdf = pd.concat(permit_rows, ignore_index=True)
        uniq = sorted(set(pdf["desc"]))
        print(f"[JEV] SINAFLOR permits in Legal Amazon: rows={len(pdf)} unique_descs={len(uniq)}", flush=True)
        scores = await classify_texts(uniq, PERMIT_QUESTIONS, "sinaflor", concurrency=48)
        for qk in PERMIT_QUESTIONS:
            pdf[f"p_{qk}"] = [scores[d][qk] for d in pdf["desc"]]
        pdf.drop(columns=["desc"]).to_parquet(OUT_DIR / "jev_sinaflor_scored.parquet", index=False)
        print(f"WROTE jev_sinaflor_scored.parquet rows={len(pdf)}", flush=True)

    ibama_rows = []
    for f in sorted(glob.glob(str(REPO / "data/raw/ibama_autos/auto_infracao_*.csv"))):
        try:
            yr = int(f[-8:-4])
            if yr < 2012:
                continue
        except Exception:
            continue
        try:
            df = pd.read_csv(f, sep=";", dtype=str, encoding="utf-8-sig", on_bad_lines="skip")
        except Exception:
            continue
        cols = {c.upper(): c for c in df.columns}
        if "TIPO_INFRACAO" in cols:
            df = df[df[cols["TIPO_INFRACAO"]] == "Flora"]
        if "SIT_CANCELADO" in cols:
            df = df[df[cols["SIT_CANCELADO"]] != "S"]
        c_dt = cols.get("DAT_HORA_AUTO_INFRACAO")
        c_lat = cols.get("NUM_LATITUDE_AUTO")
        c_lon = cols.get("NUM_LONGITUDE_AUTO")
        c_des = cols.get("DES_INFRACAO")
        c_op = cols.get("OPERACAO")
        c_act = cols.get("TIPO_ACAO")
        if not (c_dt and c_lat and c_lon and c_des):
            continue
        sub = pd.DataFrame({
            "dt": pd.to_datetime(df[c_dt], errors="coerce"),
            "lat": _num(df[c_lat]),
            "lon": _num(df[c_lon]),
            "des": df[c_des].fillna(""),
            "op": df[c_op].fillna("") if c_op else "",
            "act": df[c_act].fillna("") if c_act else "",
        }).dropna(subset=["dt", "lat", "lon"])
        r, c, ok = cell_xy(sub["lat"].to_numpy(), sub["lon"].to_numpy())
        sub = sub[ok].copy()
        sub["r"] = r[ok]
        sub["c"] = c[ok]
        sub["desc"] = [
            _clean_text(f"op={o[:60]} act={a[:40]} infrac={d[:400]}")
            for o, a, d in zip(sub["op"], sub["act"], sub["des"])
        ]
        ibama_rows.append(sub[["dt", "r", "c", "desc"]])

    if ibama_rows:
        idf = pd.concat(ibama_rows, ignore_index=True)
        uniq_i = sorted(set(idf["desc"]))
        print(f"[JEV] IBAMA Flora narratives in Legal Amazon: rows={len(idf)} unique_descs={len(uniq_i)}", flush=True)
        scores_i = await classify_texts(uniq_i, IBAMA_QUESTIONS, "ibama", concurrency=48)
        for qk in IBAMA_QUESTIONS:
            idf[f"p_{qk}"] = [scores_i[d][qk] for d in idf["desc"]]
        idf.drop(columns=["desc"]).to_parquet(OUT_DIR / "jev_ibama_scored.parquet", index=False)
        print(f"WROTE jev_ibama_scored.parquet rows={len(idf)}", flush=True)

    health = httpx.get("http://100.93.75.104:18811/health", timeout=10).json()
    print("JEV_DONE_HEALTH:", json.dumps(health), flush=True)


if __name__ == "__main__":
    asyncio.run(run_all())
