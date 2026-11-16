"""What enforcement was worth, as far as the panel can say. Takes the second panel (pipeline/panel2.py) and
asks: had IBAMA's answer per km2 alerted (notices, remote, collective and field embargoes) stayed at each
municipality's level of August 2021 to July 2022, how much clearing does the model imply for each semester
since? That is the part of the fall that measured enforcement accounts for. The rest of the fall is common to
all municipalities and the panel cannot say what caused it. Direct effect only (no carry-over through later
semesters), and an association: inspectors go where clearing is, which makes this a floor.
Writes web/data/actions.json. Run: .venv/bin/python -I pipeline/actions.py
"""
import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))  # -I leaves the script's folder off the path
import panel2 as q  # noqa: E402

P, X, b, boots = q.P, q.X, q.b, np.array(q.boots)
ENF = [i for i, n in enumerate(X) if n.split("_")[0] in ("notice", "remote", "collective", "field")]
cols = [X[i] for i in ENF]
base = P[(P.s >= 259) & (P.s < 271)].groupby("mun")[cols].mean()
lab = lambda s: f"{2000 + s // 12}-{s % 12 + 1:02d}"
UF = {11: "RO", 12: "AC", 13: "AM", 14: "RR", 15: "PA", 16: "AP", 17: "TO", 21: "MA", 51: "MT"}
km = lambda y: np.expm1(y)
ref = float(km(P[(P.s >= 259) & (P.s < 271)].y).sum() / 2)  # mean semester of the reference year
out = {"reference": "2021-08 to 2022-07", "reference_km2": round(ref), "municipalities": int(P.mun.nunique()), "semesters": [], "states": {}}
for s, g in P[P.s >= 271].groupby("s"):
    g = g.merge(base, left_on="mun", right_index=True, suffixes=("", "_0"))
    dz = np.stack([g[c] - g[c + "_0"] for c in cols], 1)
    held = lambda coef, sel=slice(None): float(km(g.y.to_numpy()[sel] - dz[sel] @ coef[ENF]).sum())
    obs, alt = float(km(g.y).sum()), [held(c) for c in boots]
    out["semesters"].append({"start": lab(s), "observed": round(obs), "held": round(held(b)), "held_lo": round(float(np.percentile(alt, 5))), "held_hi": round(float(np.percentile(alt, 95)))})
    for code, sig in UF.items():
        m = (g.mun // 100000 == code).to_numpy()
        if m.any():
            out["states"].setdefault(sig, []).append({"start": lab(s), "observed": round(float(km(g.y.to_numpy()[m]).sum())), "held": round(held(b, m))})
# the actions themselves, whole panel, by semester
ser = {"start": [], "clearing_km2": [], "notices_per_100km2": [], "remote_km2": [], "field_km2": [], "collective_km2": []}
for s in range(q.T0 + 6, q.T1 - 4, 6):
    d = q.D[:, s:s + 6].sum()
    ser["start"].append(lab(s)); ser["clearing_km2"].append(round(float(d)))
    ser["notices_per_100km2"].append(round(float(100 * q.A[:, s:s + 6].sum() / max(d, 1)), 1))
    for k, a in (("remote_km2", q.ER), ("field_km2", q.EO), ("collective_km2", q.EC)):
        ser[k].append(round(float(a[:, s:s + 6].sum())))
out["actions"] = ser
tot_obs, tot_held = sum(x["observed"] for x in out["semesters"]), sum(x["held"] for x in out["semesters"])
n = len(out["semesters"])
out["summary"] = {"observed": tot_obs, "held": tot_held, "avoided": tot_held - tot_obs, "avoided_share": round((tot_held - tot_obs) / tot_held, 3),
                  "fall_from_reference": round(ref * n - tot_obs), "fall_accounted_share": round((tot_held - tot_obs) / max(ref * n - tot_obs, 1), 3)}
json.dump(out, open(q.ROOT / "web/data/actions.json", "w"))
print(json.dumps(out["summary"])); print(out["semesters"][:2], "...", out["semesters"][-1]); print({k: v[-6:] for k, v in ser.items()})
