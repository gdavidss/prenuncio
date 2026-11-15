"""Score a U-Net forecast with the tree model's own test: same cells, same truth, same code.
Run on the Mac: AZ_F=50 .venv/bin/python -I unet/score.py <test_year> <pred_year.npy>
Also scores a blend with the tree model when its predictions for that year are saved.
"""
import json
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "pipeline"))
import model as m  # noqa: E402

T = int(sys.argv[1])
cnn = np.load(sys.argv[2]).astype(np.float32)
assert cnn.shape == (m.NROW, m.NCOL), (cnn.shape, m.NROW, m.NCOL)
if T == 2026:
    m.load_2026()
    truth_map = m.EXTRA.pop(2026)
else:
    truth_map = m.defo(T)
forest = m.forest_at(T - 1)
idx = m.eval_pick(m.INSIDE & (forest >= 0.01))
truth = (truth_map * m.CELL_KM2).ravel()[idx]
pred = (cnn * m.CELL_KM2).ravel()[idx]
out = {"unet": m.score(pred, truth, idx)}
f = m.OUT / f"pred{T}.npz"
if f.exists():
    t = np.load(f)
    assert np.array_equal(t["idx"], idx)
    out["trees"] = m.score(t["pred"], truth, idx)
    for w in (0.3, 0.5, 0.7):  # geometric blend of the two expected areas
        out[f"blend_{w}"] = m.score(np.exp(w * np.log(pred + 1e-7) + (1 - w) * np.log(t["pred"] + 1e-7)), truth, idx)
for k, v in out.items():
    print(f"{k:10s}", {a: round(b, 3) for a, b in v.items() if a.startswith("capture") or a == "auprc"})
json.dump(out, open(m.OUT / f"unet_score{T}.json", "w"), indent=1)
