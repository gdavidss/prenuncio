"""Publish a finer-grid forecast on the 1 km grid the site uses.

The 500 m model is trained and scored on the cloud machine. Its yearly maps arrive already summed
onto the 1 km grid (risk1km.npz, one array per year). This replaces data/model/risk<year>.npy and
rescores every year at 1 km with the same code as the native model, so the cells the site paints and
the percentage it quotes are the same thing.
Run: .venv/bin/python -I pipeline/adopt.py <risk1km.npz>
"""
import json
import shutil
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import model as m  # noqa: E402

assert m.K == 1, "run without AZ_F: this writes the published 1 km maps"
src = np.load(sys.argv[1])
ev_path, c26_path = m.OUT / "eval.json", m.OUT / "check2026.json"
for p in (ev_path, c26_path):  # keep the native 1 km scores once, for the record
    keep = p.with_name(p.stem + "_native1km.json")
    if not keep.exists():
        shutil.copy(p, keep)
ev, c26 = json.load(open(ev_path)), json.load(open(c26_path))
m.load_2026()
truth26 = m.EXTRA.pop(2026)
for y in sorted(src.files):
    Y, risk = int(y), src[y].astype(np.float32)
    assert risk.shape == (m.NROW, m.NCOL), risk.shape
    np.save(m.OUT / f"risk{Y}.npy", risk)
    if Y > 2026:
        continue
    t = Y - 1
    idx = np.flatnonzero((m.INSIDE & (m.forest_at(t) >= 0.01)).ravel())
    truth = ((truth26 if Y == 2026 else m.defo(Y)) * m.CELL_KM2).ravel()[idx]
    pred = risk.ravel()[idx]
    s = m.score(pred, truth, idx, m.box(m.defo(t) + m.defo(t - 1) + m.defo(t - 2), 9).ravel()[idx])
    s["pred_total_km2"], s["true_total_km2"] = float(pred.sum()), float(truth.sum())
    slot = c26 if Y == 2026 else ev[str(Y)]
    print(Y, "top 5%: native 1 km", round(slot["model"]["capture@5"], 3), "-> adopted", round(s["capture@5"], 3),
          "| top 1%:", round(slot["model"]["capture@1"], 3), "->", round(s["capture@1"], 3))
    slot["model"] = s
json.dump(ev, open(ev_path, "w"), indent=1)
json.dump(c26, open(c26_path, "w"), indent=1)
