from __future__ import annotations

import argparse
import gc
import json
import math
import os
import sys
import time
from pathlib import Path

import lightgbm as lgb
import numpy as np
import pandas as pd
import xgboost as xgb
from scipy import ndimage as ndi

os.environ.setdefault("AZ_F", "50")
os.environ.setdefault("AZ_X", "hansen,glad,glad2,aef,tmf,asv")
os.environ.setdefault("OMP_WAIT_POLICY", "PASSIVE")
os.environ.setdefault("KMP_BLOCKTIME", "0")

ROOT = Path.home() / "prenuncio-swarm"
REPO = ROOT / "repo"
DATA = REPO / "data"
GRID50 = DATA / "grid50"
ALPHA = ROOT / "data" / "alpha"
sys.path.insert(0, str(REPO / "pipeline"))

import model as m

NROW, NCOL = m.NROW, m.NCOL
NAN = np.full((NROW, NCOL), np.nan, np.float32)


class CleanAlphaBuilder:
    def __init__(self):
        self.radd = np.load(ALPHA / "radd500.npz")
        self.gfw = np.load(ALPHA / "gfw_int500.npz")
        self.glad = np.load(GRID50 / "gladwide.npz")
        self.hansen = np.load(GRID50 / "hansen.npy", mmap_mode="r")
        self.tmf_z = np.load(GRID50 / "tmf.npz")
        self.tmf_d = self.tmf_z["dist"]
        self.tmf_old = self.tmf_z["old"]
        self.hc = np.cumsum(self.hansen, axis=0, dtype=np.uint32)
        self.tc_cum = np.cumsum(self.tmf_d, axis=0, dtype=np.uint32) + self.tmf_old[None]
        tc_z = np.load(ALPHA / "hansen_tc_gain500.npz")
        self.tc2000 = tc_z["treecover2000"].astype(np.float32)
        self.gain = tc_z["gain"].astype(np.float32)
        self.tc_n3 = m.box(self.tc2000, 3)
        self.tc_n9 = m.box(self.tc2000, 9)
        self.tc_def3 = self.tc_n3 - self.tc2000
        self.gain_n3 = m.box(np.log1p(self.gain), 3)
        self.ti_dist = m.dist(m.S["ti"] > 0)
        self.sdf = pd.read_parquet(ALPHA / "jev_sinaflor_scored.parquet") if (ALPHA / "jev_sinaflor_scored.parquet").exists() else pd.DataFrame()
        self.idf = pd.read_parquet(ALPHA / "jev_ibama_scored.parquet") if (ALPHA / "jev_ibama_scored.parquet").exists() else pd.DataFrame()
        self.edf = pd.read_parquet(ALPHA / "jev_embargo_scored.parquet") if (ALPHA / "jev_embargo_scored.parquet").exists() else pd.DataFrame()
        self.ddf = pd.read_parquet(ALPHA / "dof_logging_auth.parquet") if (ALPHA / "dof_logging_auth.parquet").exists() else pd.DataFrame()
        anm_fp = ALPHA / "anm/sigmine_legal_amazon.parquet"
        if anm_fp.exists():
            a = pd.read_parquet(anm_fp)
            a["ANO"] = pd.to_numeric(a["ANO"], errors="coerce")
            a["r"] = np.floor((m.N - a["lat"].to_numpy()) / m.C).astype(np.int64)
            a["c"] = np.floor((a["lon"].to_numpy() - m.W) / m.C).astype(np.int64)
            self.anm = a[(a["r"] >= 0) & (a["r"] < NROW) & (a["c"] >= 0) & (a["c"] < NCOL) & a["ANO"].notna()].copy()
        else:
            self.anm = pd.DataFrame()
        if (ALPHA / "chirps_monthly_lowres.npz").exists():
            ch = np.load(ALPHA / "chirps_monthly_lowres.npz", allow_pickle=True)
            self.ch_rain = ch["rain"].astype(np.float32)
            self.ch_yrs = ch["years"]
            self.ch_mos = ch["months"]
            cmeta = json.loads(str(ch["meta"]))
            lr_c, lr_r, lr_nc, lr_w, lr_n = cmeta["cell"], cmeta["rows"], cmeta["cols"], cmeta["west"], cmeta["north"]
            self.ch_r0 = np.clip((lr_n - (m.N - (np.arange(NROW) + 0.5) * m.C)) / lr_c, 0, lr_r - 1.001).astype(np.int32)[:, None]
            self.ch_c0 = np.clip(((m.W + (np.arange(NCOL) + 0.5) * m.C) - lr_w) / lr_c, 0, lr_nc - 1.001).astype(np.int32)[None, :]
            self.ch_ym = {(int(yr), int(mo)): idx for idx, (yr, mo) in enumerate(zip(self.ch_yrs, self.ch_mos))}
        else:
            self.ch_rain = None
        self.aef_cache: dict[int, np.ndarray | None] = {}
        self.col_names = self._make_col_names()

    def _make_col_names(self) -> list[str]:
        return [
            "radd31", "radd31_n3", "radd92", "radd92_n3", "radd92_n9", "radd92_n25",
            "radd183", "radd183_n3", "radd183_n9", "radd365", "radd365_n3", "radd365_n9", "radd365_n25",
            "radd730_n3", "radd730_n9", "radd_hi365", "radd_hi365_n3", "radd_hi365_n9", "radd_hi365_n25",
            "radd_forest_n3", "radd_forest_n9", "dist_radd92", "dist_radd365", "radd_minus_glad_n3",
            "gfw31", "gfw31_n9", "gfw92_n3", "gfw92_n9", "gfw92_n25",
            "gfw183_n9", "gfw365", "gfw365_n3", "gfw365_n9", "gfw365_n25",
            "gfw730_n9", "gfw_hi365_n3", "gfw_hi365_n9", "dist_gfw365",
            "aef_vel1", "aef_vel1_n3", "aef_vel1_n9", "aef_vel1_ratio3",
            "aef_cos1", "aef_vel2", "aef_vel2_n3", "aef_accel",
            "aef_contrast_3km", "aef_contrast_9km", "aef_contrast_ratio", "aef_norm_now",
            "jev_perm_uas", "jev_perm_pmfs", "jev_perm_ag", "jev_perm_pasture",
            "jev_perm_exec", "jev_perm_exec_n9", "dist_jev_perm_hi",
            "jev_ib_clearcut_12_n9", "jev_ib_logging_12_n9", "jev_ib_mining_36_n9",
            "jev_ib_fire_pasture_12_n9", "jev_ib_severe_12_n25",
            "jev_emb_remote_12_n9", "jev_emb_grilagem_36_n9", "jev_emb_recur_12_n9",
            "dof_log_12_n9", "dof_log_36_n9", "dist_dof_log",
            "hansen_tc2000", "hansen_tc_n3", "hansen_tc_n9", "hansen_tc_def3", "hansen_gain_n3", "ti_dist_km",
            "anm_all_n9", "anm_gold_n9", "dist_anm_gold",
            "edge_density_n3", "forest_lap", "edge_contrast_3_9", "clr_ratio_3_25", "midband_pressure",
            "frontier_advance", "dist_edge_x_midband", "ti_x_pressure", "mun_rate_x_forest", "mun_accel",
            "ratio_n3d1_n9d3", "ratio_touch_d1", "forest_x_n3d1", "forest_x_n9d3",
            "ratio_dist_d1_edge", "deter_mining_12_n9", "deter_degr_36_n9",
            "fk_vel_clean", "fk_tmf_vel_clean", "fk_aniso_mag_clean", "fk_trend5_clean", "fk_cohort_age_clean",
            "chirps_12m_aug_jul_z", "chirps_3m_may_jul_z", "chirps_dry_x_fire", "chirps_dry_x_scar",
        ]

    def _get_aef(self, yr: int):
        if yr not in self.aef_cache:
            fp = GRID50 / "aef" / f"emb_{yr}.npy"
            if not fp.exists():
                fp = DATA / "aef" / f"emb_{yr}.npy"
            self.aef_cache[yr] = np.nan_to_num(np.load(fp, mmap_mode="r").astype(np.float32), nan=0.0) if fp.exists() else None
        return self.aef_cache[yr]

    def _discs(self, rows, wcol: str | None = None):
        out = np.zeros((NROW, NCOL), np.float32)
        if len(rows) == 0:
            return out
        km = m.C * 111.0
        rs, cs, has = rows["r"].to_numpy(), rows["c"].to_numpy(), rows["ha"].to_numpy()
        ws = rows[wcol].to_numpy() if wcol else np.ones(len(rows), np.float32)
        for r0, c0, ha, wv in zip(rs, cs, has, ws):
            rad = min(20.0, math.sqrt(max(ha, 1.0) / 100.0 / math.pi) / km + 0.7)
            n = int(math.ceil(rad))
            ys = slice(max(int(r0) - n, 0), min(int(r0) + n + 1, NROW))
            xs = slice(max(int(c0) - n, 0), min(int(c0) + n + 1, NCOL))
            yy, xx = np.ogrid[ys, xs]
            out[ys, xs] = np.maximum(out[ys, xs], ((yy - r0) ** 2 + (xx - c0) ** 2 <= rad ** 2) * float(wv))
        return out

    def _pt_grid(self, df_sub, wcol: str | None = None):
        if len(df_sub) == 0:
            return np.zeros((NROW, NCOL), np.float32)
        flat = df_sub["r"].to_numpy(np.int64) * NCOL + df_sub["c"].to_numpy(np.int64)
        w = df_sub[wcol].to_numpy(np.float32) if wcol else np.ones(len(df_sub), np.float32)
        return np.bincount(flat, weights=w, minlength=NROW * NCOL).reshape(NROW, NCOL).astype(np.float32)

    def build_year_maps(self, y: int) -> list[np.ndarray]:
        t = y - 1
        mc = (t - 2000) * 12 + 6
        forest = m.forest_at(t)
        d1, d2, d3 = m.defo(t), m.defo(t - 1), m.defo(t - 2)
        d3sum = d1 + d2 + d3
        cleared = np.clip(1.0 - forest - m.WATER - m.NONFOREST - m.OUTSIDE, 0.0, 1.0)
        inf = (forest > 0.5).astype(np.float32)

        if t >= 2020 and (t - 2020) < self.radd["d365"].shape[0]:
            i = t - 2020
            r31 = np.log1p(self.radd["d31"][i].astype(np.float32))
            r92 = np.log1p(self.radd["d92"][i].astype(np.float32))
            r183 = np.log1p(self.radd["d183"][i].astype(np.float32))
            r365 = np.log1p(self.radd["d365"][i].astype(np.float32))
            r730 = np.log1p(self.radd["d730"][i].astype(np.float32))
            rh = np.log1p(self.radd["high365"][i].astype(np.float32))
            gl365 = np.log1p(self.glad["g365"][i].astype(np.float32))
            r_only = np.clip(r365 - 0.5 * gl365, 0.0, None)
            g31 = np.log1p(self.gfw["d31"][i].astype(np.float32))
            g92 = np.log1p(self.gfw["d92"][i].astype(np.float32))
            g183 = np.log1p(self.gfw["d183"][i].astype(np.float32))
            g365 = np.log1p(self.gfw["d365"][i].astype(np.float32))
            g730 = np.log1p(self.gfw["d730"][i].astype(np.float32))
            gh = np.log1p(self.gfw["high365"][i].astype(np.float32))
            radd_feats = [
                r31, m.box(r31, 3), r92, m.box(r92, 3), m.box(r92, 9), m.box(r92, 25),
                r183, m.box(r183, 3), m.box(r183, 9), r365, m.box(r365, 3), m.box(r365, 9), m.box(r365, 25),
                m.box(r730, 3), m.box(r730, 9), rh, m.box(rh, 3), m.box(rh, 9), m.box(rh, 25),
                m.box(r365 * inf, 3), m.box(r365 * inf, 9), m.dist(self.radd["d92"][i] > 0), m.dist(self.radd["d365"][i] > 0), m.box(r_only, 3),
                g31, m.box(g31, 9), m.box(g92, 3), m.box(g92, 9), m.box(g92, 25),
                m.box(g183, 9), g365, m.box(g365, 3), m.box(g365, 9), m.box(g365, 25),
                m.box(g730, 9), m.box(gh, 3), m.box(gh, 9), m.dist(self.gfw["d365"][i] > 0),
            ]
        else:
            radd_feats = [NAN] * 38

        e = y - 2
        a = self._get_aef(e)
        if a is not None:
            b = self._get_aef(e - 1)
            c = self._get_aef(e - 2)
            na = np.sqrt((a * a).sum(axis=0)) + 1e-6
            if b is not None:
                d1a = a - b
                v1 = np.sqrt((d1a * d1a).sum(axis=0))
                nb = np.sqrt((b * b).sum(axis=0)) + 1e-6
                cos1 = 1.0 - (a * b).sum(axis=0) / (na * nb)
                v1n3, v1n9 = m.box(v1, 3), m.box(v1, 9)
                v1r3 = v1 / (v1n3 + 1e-4)
            else:
                v1 = v1n3 = v1n9 = v1r3 = cos1 = NAN
            if c is not None and b is not None:
                d2a = a - c
                v2 = np.sqrt((d2a * d2a).sum(axis=0))
                v2n3 = m.box(v2, 3)
                ac = a - 2.0 * b + c
                acc = np.sqrt((ac * ac).sum(axis=0))
            else:
                v2 = v2n3 = acc = NAN
            c3a = np.zeros((NROW, NCOL), np.float32)
            c9a = np.zeros((NROW, NCOL), np.float32)
            for ch in range(0, 64, 2):
                band = a[ch]
                x3, x9 = band - m.box(band, 3), band - m.box(band, 9)
                c3a += x3 * x3
                c9a += x9 * x9
            c3, c9 = np.sqrt(c3a * 2.0), np.sqrt(c9a * 2.0)
            aef_feats = [v1, v1n3, v1n9, v1r3, cos1, v2, v2n3, acc, c3, c9, c3 / (c9 + 1e-4), na]
        else:
            aef_feats = [NAN] * 12

        cut = pd.Timestamp(t, 7, 31)
        cut12, cut36 = cut - pd.Timedelta(days=365), cut - pd.Timedelta(days=1095)
        if len(self.sdf) and t >= 2020:
            sv = self.sdf[(self.sdf["issued"] <= cut) & (self.sdf["valid"].isna() | (self.sdf["valid"] > cut))]
            p_ex = self._discs(sv, "p_high_exec_intent")
            jev_p = [self._discs(sv[sv["kind"] == "UAS"]), self._discs(sv[sv["kind"] == "PMFS"]), self._discs(sv, "p_commercial_ag"), self._discs(sv, "p_pasture_cattle"), p_ex, m.box(p_ex, 9), m.dist(p_ex >= 0.65)]
        else:
            jev_p = [NAN] * 7
        if len(self.idf):
            i12 = self.idf[(self.idf["dt"] > cut12) & (self.idf["dt"] <= cut)]
            i36 = self.idf[(self.idf["dt"] > cut36) & (self.idf["dt"] <= cut)]
            jev_i = [m.box(self._pt_grid(i12, "p_active_clearcut_front"), 9), m.box(self._pt_grid(i12, "p_illegal_logging_road"), 9), m.box(self._pt_grid(i36, "p_illegal_mining"), 9), m.box(self._pt_grid(i12, "p_fire_pasture_grilagem"), 9), m.box(self._pt_grid(i12, "p_repeat_high_severity"), 25)]
        else:
            jev_i = [NAN] * 5
        if len(self.edf):
            e12 = self.edf[(self.edf["dt"] > cut12) & (self.edf["dt"] <= cut)]
            e36 = self.edf[(self.edf["dt"] > cut36) & (self.edf["dt"] <= cut)]
            jev_e = [m.box(self._pt_grid(e12, "p_remote_satellite_embargo"), 9), m.box(self._pt_grid(e36, "p_organized_pasture_grilagem"), 9), m.box(self._pt_grid(e12, "p_high_recurrence_frontier"), 9)]
        else:
            jev_e = [NAN] * 3
        if len(self.ddf):
            d12 = self.ddf[(self.ddf["dt"] > cut12) & (self.ddf["dt"] <= cut)]
            d36 = self.ddf[(self.ddf["dt"] > cut36) & (self.ddf["dt"] <= cut)]
            g36 = self._pt_grid(d36)
            dof_f = [m.box(self._pt_grid(d12), 9), m.box(g36, 9), m.dist(g36 > 0)]
        else:
            dof_f = [NAN] * 3

        if len(self.anm):
            sa = self.anm[self.anm["ANO"] <= t - 1]
            ga = self._pt_grid(sa)
            sg = sa[sa["SUBS"].astype(str).str.upper().str.contains("OURO", na=False)]
            gg = self._pt_grid(sg)
            anm_f = [m.box(ga, 9), m.box(gg, 9), m.dist(gg > 0)]
        else:
            anm_f = [NAN] * 3

        n3_d1, n9_d3, n25_clr = m.box(d1, 3), m.box(d3sum, 9), m.box(cleared, 25)
        n3_clr, n9_clr, n3_for = m.box(cleared, 3), m.box(cleared, 9), m.box(forest, 3)
        dist_ed = m.dist(cleared >= 0.1)
        dist_d1 = m.dist(d1 >= 0.01)
        edge_d = m.box((forest >= 0.05) & (cleared >= 0.05), 3)
        for_lap = forest - n3_for
        mid_p = m.box(d3sum, 9) - m.box(d3sum, 3)
        front_adv = n3_d1 - m.box(d2, 3)
        mun_for = m.by_mun(forest * m.CELL_KM2)
        mun_d1 = m.by_mun(d1 * m.CELL_KM2)
        mun_d2 = m.by_mun(d2 * m.CELL_KM2)
        mun_r = mun_d1 / (mun_for + 1.0)
        touch_d1 = ndi.uniform_filter(d1, 3, mode="constant")
        m_end = mc - 192
        det_mn = m.box(m.deter(3, m_end - 11, m_end), 9) if m_end >= 18 else NAN
        det_dg36 = m.box(m.deter(1, m_end - 35, m_end), 9) if m_end >= 36 else NAN
        morph_f = [
            self.tc2000, self.tc_n3, self.tc_n9, self.tc_def3, self.gain_n3, self.ti_dist,
            *anm_f,
            edge_d, for_lap, n3_clr - n9_clr, n3_clr / (n25_clr + 1e-4), mid_p,
            front_adv, dist_ed * mid_p, (m.S["ti"] > 0).astype(np.float32) * mid_p, mun_r * forest, (mun_d1 - mun_d2) / (mun_for + 1.0),
            n3_d1 / (n9_d3 + 1e-4), touch_d1 / (d1 + 1e-4), forest * n3_d1, forest * n9_d3,
            dist_d1 / (dist_ed + 0.2), det_mn, det_dg36,
        ]

        k = y - 2003
        if 8 <= k < self.hc.shape[0]:
            d_new = m.dist(self.hc[k] > 48)
            d_old = m.dist(self.hc[k - 4] > 48)
            fk_vel = np.clip((d_old - d_new) / 4.0, -15.0, 15.0)
            dt_new = m.dist(self.tc_cum[k] > 48)
            dt_old = m.dist(self.tc_cum[k - 4] > 48)
            fk_tvel = np.clip((dt_old - dt_new) / 4.0, -15.0, 15.0)
            h_rec = (self.hc[k] - self.hc[k - 3]).astype(np.float32) / 324.0
            sm = ndi.uniform_filter(h_rec, 9, mode="constant")
            gE = np.roll(sm, -4, axis=1) - np.roll(sm, 4, axis=1)
            gS = np.roll(sm, -4, axis=0) - np.roll(sm, 4, axis=0)
            fk_aniso = np.sqrt(gE * gE + gS * gS)
            w = np.array([-2, -1, 0, 1, 2], np.float32)
            fk_tr = (w[0] * self.hc[k - 4] + w[1] * self.hc[k - 3] + w[2] * self.hc[k - 2] + w[3] * self.hc[k - 1] + w[4] * self.hc[k]).astype(np.float32) / 3240.0
            fh = np.full((NROW, NCOL), 25, np.uint8)
            for li in range(k + 1):
                fh[(self.hansen[li] > 0) & (fh == 25)] = li
            fk_coh = np.where(fh < 25, (k - fh).astype(np.float32), 27.0)
            fk_f = [fk_vel, fk_tvel, fk_aniso, fk_tr, fk_coh]
        else:
            fk_f = [NAN] * 5

        if self.ch_rain is not None:
            def wsum(ey, em, nm):
                acc = np.zeros(self.ch_rain.shape[1:], np.float32)
                cy, cm, okc = ey, em, 0
                for _ in range(nm):
                    ix = self.ch_ym.get((cy, cm))
                    if ix is not None:
                        acc += np.nan_to_num(self.ch_rain[ix], nan=0.0)
                        okc += 1
                    cm -= 1
                    if cm == 0:
                        cm, cy = 12, cy - 1
                return acc if okc == nm else np.full(self.ch_rain.shape[1:], np.nan, np.float32)

            r12 = wsum(t, 7, 12)
            r3 = wsum(t, 7, 3)
            h12 = [wsum(ky, 7, 12) for ky in range(max(2006, t - 10), t)]
            h3 = [wsum(ky, 7, 3) for ky in range(max(2006, t - 10), t)]
            if len(h12) >= 3:
                s12 = np.stack(h12)
                z12 = ((r12 - np.nanmean(s12, 0)) / (np.nanstd(s12, 0) + 10.0))[self.ch_r0, self.ch_c0].astype(np.float32)
                s3 = np.stack(h3)
                z3 = ((r3 - np.nanmean(s3, 0)) / (np.nanstd(s3, 0) + 5.0))[self.ch_r0, self.ch_c0].astype(np.float32)
            else:
                z12 = np.zeros((NROW, NCOL), np.float32)
                z3 = np.zeros((NROW, NCOL), np.float32)
            fire9 = m.box(m.events("fire", mc - 11, mc), 9)
            scar9 = m.box(m.deter(2, m_end - 11, m_end), 9) if m_end >= 18 else np.zeros((NROW, NCOL), np.float32)
            ch_f = [z12, z3, -z12 * np.log1p(fire9), -z12 * scar9]
        else:
            ch_f = [NAN] * 4

        out = radd_feats + aef_feats + jev_p + jev_i + jev_e + dof_f + morph_f + fk_f + ch_f
        assert len(out) == len(self.col_names), (len(out), len(self.col_names))
        self.aef_cache.clear()
        gc.collect()
        return out


def build_train_table(y: int, ab: CleanAlphaBuilder, rng: np.random.Generator, n_neg: int = 300_000):
    target = (m.defo(y) * 100.0).ravel()
    w_box = []

    def pick(cand):
        ci = np.flatnonzero(cand.ravel())
        pos, neg = ci[target[ci] > 0], ci[target[ci] == 0]
        take = rng.choice(neg, min(n_neg, len(neg)), replace=False)
        w_box.append(np.concatenate([np.ones(len(pos)), np.full(len(take), len(neg) / len(take))]).astype(np.float32))
        return np.concatenate([pos, take])

    Xb, idx, bnames = m.features(y, pick=pick)
    amaps = ab.build_year_maps(y)
    Xa = np.column_stack([np.asarray(a, np.float32).ravel()[idx] for a in amaps]).astype(np.float32)
    return np.hstack([Xb, Xa]), target[idx].astype(np.float32), w_box[0], bnames + ab.col_names


def fit_and_predict_year(T: int, train_cache: dict, ab: CleanAlphaBuilder, out_dir: Path, threads: int = 12):
    t0 = time.time()
    print(f"\n=== SURVEIL-PRENUNCIO-1: TARGET YEAR {T} (STRICT TRAINING YEARS < {T}) ===", flush=True)
    names = train_cache[2015][3]

    def stack_years(y0: int, y1: int, keep_zero_frac: float = 0.35):
        Xs, ys, ws = [], [], []
        rng = np.random.default_rng(1000 + T)
        for y in range(y0, y1):
            X, yy, ww, _ = train_cache[y]
            pos = yy > 0
            neg_idx = np.flatnonzero(~pos)
            keep_n = neg_idx[rng.random(len(neg_idx)) < keep_zero_frac]
            keep = np.concatenate([np.flatnonzero(pos), keep_n])
            w = ww[keep].copy()
            w[len(np.flatnonzero(pos)):] /= keep_zero_frac
            Xs.append(X[keep]); ys.append(yy[keep]); ws.append(w)
        return np.vstack(Xs), np.concatenate(ys), np.concatenate(ws)

    train_end = min(T, 2026)
    X11, y11, w11 = stack_years(2011, train_end, keep_zero_frac=0.35)
    X15, y15, w15 = stack_years(2015, train_end, keep_zero_frac=0.55)
    print(f"  [T={T}] X11={X11.shape} X15={X15.shape} s={time.time()-t0:.1f}", flush=True)

    m1_list = []
    for s in range(2):
        mdl = lgb.LGBMRegressor(
            objective="tweedie", tweedie_variance_power=1.15, n_estimators=700, learning_rate=0.05,
            num_leaves=127, min_child_samples=120, feature_fraction=0.75, bagging_fraction=0.8,
            bagging_freq=1, lambda_l2=2.0, n_jobs=threads, random_state=42 + s, verbosity=-1,
        )
        mdl.fit(X11, y11, sample_weight=w11)
        m1_list.append(mdl)
    print(f"  [T={T}] M1 LGBM-1.15 (2011..{T-1}) done s={time.time()-t0:.1f}", flush=True)

    m2_list = []
    for s in range(2):
        mdl = lgb.LGBMRegressor(
            objective="tweedie", tweedie_variance_power=1.28, n_estimators=650, learning_rate=0.05,
            num_leaves=191, min_child_samples=150, feature_fraction=0.65, bagging_fraction=0.8,
            bagging_freq=1, lambda_l2=3.0, n_jobs=threads, random_state=142 + s, verbosity=-1,
        )
        mdl.fit(X15, y15, sample_weight=w15)
        m2_list.append(mdl)
    print(f"  [T={T}] M2 LGBM-1.28 (2015..{T-1}) done s={time.time()-t0:.1f}", flush=True)

    m3_list = []
    for s in range(2):
        mdl = xgb.XGBRegressor(
            objective="reg:tweedie", tweedie_variance_loss_parameter=1.15, n_estimators=550, learning_rate=0.055,
            max_depth=8, min_child_weight=10, subsample=0.8, colsample_bytree=0.75,
            tree_method="hist", n_jobs=threads, random_state=242 + s, verbosity=0,
        )
        mdl.fit(X11, y11, sample_weight=w11)
        m3_list.append(mdl)
    print(f"  [T={T}] M3 XGB-1.15 (2011..{T-1}) done s={time.time()-t0:.1f}", flush=True)

    m4_clf = lgb.LGBMClassifier(
        objective="binary", n_estimators=550, learning_rate=0.05, num_leaves=127,
        min_child_samples=120, feature_fraction=0.75, bagging_fraction=0.8,
        bagging_freq=1, lambda_l2=2.0, n_jobs=threads, random_state=342, verbosity=-1,
    )
    m4_clf.fit(X11, (y11 > 0).astype(np.int32), sample_weight=w11)
    pos_m = y11 > 0
    m4_reg = lgb.LGBMRegressor(
        objective="gamma", n_estimators=450, learning_rate=0.05, num_leaves=95,
        min_child_samples=60, feature_fraction=0.75, bagging_fraction=0.8,
        bagging_freq=1, lambda_l2=2.0, n_jobs=threads, random_state=442, verbosity=-1,
    )
    m4_reg.fit(X11[pos_m], np.clip(y11[pos_m], 1e-3, None), sample_weight=w11[pos_m])
    print(f"  [T={T}] M4 Hurdle-LGBM (binary x gamma, 2011..{train_end-1}) done s={time.time()-t0:.1f}", flush=True)

    del X11, y11, w11, X15, y15, w15
    gc.collect()

    print(f"  [T={T}] Computing full 500m alpha maps & predicting ALL ~14M candidate cells in 4 passes...", flush=True)
    amaps = ab.build_year_maps(T)
    p_m1 = np.zeros(NROW * NCOL, np.float32)
    p_m2 = np.zeros(NROW * NCOL, np.float32)
    p_m3 = np.zeros(NROW * NCOL, np.float32)
    p_m4 = np.zeros(NROW * NCOL, np.float32)
    area_flat = m.CELL_KM2.ravel()

    for j in range(4):
        Xb, idx, _ = m.features(T, pick=lambda cand, jj=j: np.flatnonzero(cand.ravel())[jj::4])
        Xa = np.column_stack([np.asarray(a, np.float32).ravel()[idx] for a in amaps]).astype(np.float32)
        Xf = np.hstack([Xb, Xa])
        sc = area_flat[idx] / 100.0
        p_m1[idx] = np.clip(np.mean([mdl.predict(Xf) for mdl in m1_list], axis=0), 0.0, None) * sc
        p_m2[idx] = np.clip(np.mean([mdl.predict(Xf) for mdl in m2_list], axis=0), 0.0, None) * sc
        p_m3[idx] = np.clip(np.mean([mdl.predict(Xf) for mdl in m3_list], axis=0), 0.0, None) * sc
        p_prob = np.clip(m4_clf.predict_proba(Xf)[:, 1], 1e-6, 1.0)
        p_mag = np.clip(m4_reg.predict(Xf), 0.0, None)
        p_m4[idx] = (p_prob * p_mag) * sc
        del Xb, Xa, Xf
        gc.collect()
        print(f"    pass {j+1}/4 done s={time.time()-t0:.1f}", flush=True)

    del amaps
    gc.collect()

    blend = np.exp(
        0.35 * np.log(p_m1 + 1e-7)
        + 0.25 * np.log(p_m2 + 1e-7)
        + 0.25 * np.log(p_m3 + 1e-7)
        + 0.15 * np.log(p_m4 + 1e-7)
    ).reshape(NROW, NCOL)

    for tag, arr in [("blend", blend), ("m1_lgbm115", p_m1.reshape(NROW, NCOL)), ("m2_lgbm128", p_m2.reshape(NROW, NCOL)), ("m3_xgb115", p_m3.reshape(NROW, NCOL)), ("m4_hurdle", p_m4.reshape(NROW, NCOL))]:
        sub = out_dir if tag == "blend" else out_dir / tag
        sub.mkdir(parents=True, exist_ok=True)
        np.savez_compressed(sub / f"{T}.npz", risk=arr.astype(np.float16))
    print(f"  [T={T}] SAVED full [5180,6664] maps to {out_dir}/{T}.npz | raw_km2={float(blend.sum()):.0f} s={time.time()-t0:.1f}", flush=True)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--years", nargs="+", type=int, default=[2022, 2023, 2024, 2025, 2026, 2027])
    ap.add_argument("--out", default=str(ROOT / "submission_surveil_1/maps"))
    ap.add_argument("--threads", type=int, default=14)
    a = ap.parse_args()

    out_dir = Path(a.out)
    out_dir.mkdir(parents=True, exist_ok=True)
    if (GRID50 / "prodes2026pri.npy").exists():
        m.load_2026()
    ab = CleanAlphaBuilder()
    max_t = max(a.years)
    tcache_dir = out_dir.parent / "train_cache_355"
    tcache_dir.mkdir(parents=True, exist_ok=True)
    for T in a.years:
        if (out_dir / f"{T}.npz").exists() and (out_dir / f"m4_hurdle/{T}.npz").exists():
            print(f"  SKIP T={T} (already complete)", flush=True)
            continue
        train_end = min(T, 2026)
        train_cache = {}
        for y in range(2011, train_end):
            cf = tcache_dir / f"train_{y}.npz"
            if cf.exists():
                z = np.load(cf)
                train_cache[y] = (z["X"], z["y"], z["w"], json.loads(str(z["names"])))
            else:
                X, yy, ww, nms = build_train_table(y, ab, np.random.default_rng(y))
                np.savez(cf, X=X, y=yy, w=ww, names=json.dumps(nms))
                train_cache[y] = (X, yy, ww, nms)
        fit_and_predict_year(T, train_cache, ab, out_dir, threads=a.threads)
        train_cache.clear()
        gc.collect()
    print("=== SURVEIL-PRENUNCIO-1 ALL YEARS COMPLETE ===", flush=True)


if __name__ == "__main__":
    main()
