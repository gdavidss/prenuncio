"""The facts the site's opening story and its About page quote, gathered from the files that hold them, so
no number on the site is typed by hand. Writes web/data/story.json. Run after calibrate.py, priority.py,
actions.py and benchmark/leaderboard.py: .venv/bin/python -I pipeline/story.py
"""
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from az import ROOT  # noqa: E402

W = ROOT / "web/data"
J = lambda f: json.load(open(f))
prob, prio, act, meta, reg = J(W / "prob.json"), J(W / "priority.json"), J(W / "actions.json"), J(W / "meta.json"), J(W / "regions.json")
sub = ROOT / "benchmark/submissions/prenuncio-3"  # the model the site shows
scores, smeta = J(sub / "scores.json"), J(sub / "meta.json")
lb = J(ROOT / "benchmark/leaderboard.json")
r4 = lambda v: v if v is None else round(v, 4)
rows = [{"rank": r["rank"], "model": r["model"], "url": r["url"], "cap5": r4(r["cap5"]), "unseen_2026": r4(r["unseen_2026"]),
         "by_year": {y: r4(v) for y, v in r["by_year"].items()}, "by": r["by"], "date": r["date"], "kind": r["kind"], "note": r["note"]} for r in lb["rows"]]
ys = scores["years"]
mean = lambda k: sum(ys[str(y)][k] for y in (2022, 2023, 2024, 2025)) / 4
naive = next(r["cap5"] for r in rows if r["kind"] == "reference")  # the leaderboard's reference row
tested = re.search(r"## Tested\n(.*?)\n## ", open(ROOT / "docs/INPUTS.md").read(), re.S).group(1)
ledger = [l for l in tested.split("\n") if l.startswith("| ") and not l.startswith("| Input") and not l.startswith("|---")]
board = re.search(r"## Runs\n(.*?)\n## ", open(ROOT / "docs/LAB.md").read(), re.S).group(1)
runs = [l for l in board.split("\n") if l.startswith("| ") and not l.startswith("| Model") and not l.startswith("|---")]
states = J(W / "sectors_uf.json")["items"]
out = {
    "forest": {"cells": prob["forecast"]["cells"], "cell_m": 500, "forest_km2": round(meta["years"]["2027"]["forest_km2"])},
    "history": {"years": reg["cyears"], "km2": [round(sum(s["c"][k] for s in states)) for k in range(len(reg["cyears"]))]},
    "forecast": {"year": 2027, "made_on": "2026-07-31", "km2": round(reg["total_km2"]), "expected_cells": prob["forecast"]["expected_cells"],
                 "cells_by_chance": prob["forecast"]["cells_by_chance"]},
    "check": {"year": 2024, "expected_cells": prob["years"]["2024"]["expected_cells"], "actual_cells": prob["years"]["2024"]["actual_cells"],
              "reliability": prob["years"]["2024"]["reliability"],
              "priority_blocks_that_lost_10ha": prio["replay"]["2024"]["lost_10ha"], "all_blocks_that_lost_10ha": prio["replay"]["2024"]["base_10ha"]},
    "model": {"what": "two models, blended half and half", "parts": ["gradient boosted trees on a 500 m grid, more than 300 numbers per cell", "a convolutional network (U-Net) reading 25 km tiles at 100 m"],
              "trained_on": {"first_outcome_year": 2015, "last_outcome_year": 2026, "rule": "the model that forecasts a year has never seen that year or any later one"},
              "inputs": [{"en": "clearing history since 2008 (INPE PRODES)", "pt": "histórico de desmate desde 2008 (INPE PRODES)"},
                         {"en": "daily alerts (INPE DETER)", "pt": "alertas diários (INPE DETER)"},
                         {"en": "forest loss at 30 m (Hansen)", "pt": "perda de floresta a 30 m (Hansen)"},
                         {"en": "Sentinel-2 alerts at 10 m (GLAD)", "pt": "alertas Sentinel-2 a 10 m (GLAD)"},
                         {"en": "logging and fire damage at 30 m (JRC)", "pt": "extração e dano de fogo a 30 m (JRC)"},
                         {"en": "satellite embeddings (AlphaEarth)", "pt": "resumo de imagens de satélite (AlphaEarth)"},
                         {"en": "clearing permits (SINAFLOR)", "pt": "licenças de desmate (SINAFLOR)"},
                         {"en": "fire, fines and embargoes (INPE, IBAMA)", "pt": "fogo, autos e embargos (INPE, IBAMA)"},
                         {"en": "who holds the land", "pt": "quem ocupa a terra"}],
              "compute": smeta["compute"]},
    "benchmark": {"question": "flag 5% of the forest: what share of the year's clearing falls inside?", "years": [2022, 2023, 2024, 2025],
                  "today": round(mean("cap5"), 4), "by_year": {y: ys[y]["cap5"] for y in ("2022", "2023", "2024", "2025")}, "unseen_2026": ys["2026"]["cap5"],
                  "naive": naive, "first_version": 0.62, "top1": round(mean("cap1"), 4), "top10": round(mean("cap10"), 4),
                  "models_tried": len(runs), "inputs_tested": len(ledger), "submissions": sum(r["kind"] == "model" for r in rows)},
    "leaderboard": {"metric": lb["metric"], "rows": rows},
    "enforcement": act["summary"],
    "priority": {"blocks": prio["top"], "block_km": prio["block_km"], "replay": prio["replay"]},
    "links": {"repository": "https://github.com/gdavidss/prenuncio", "benchmark": "https://github.com/gdavidss/prenuncio/tree/main/benchmark",
              "leaderboard": "https://github.com/gdavidss/prenuncio/blob/main/benchmark/LEADERBOARD.md", "inputs": "https://github.com/gdavidss/prenuncio/blob/main/docs/INPUTS.md",
              "results": "https://github.com/gdavidss/prenuncio/blob/main/docs/LAB.md", "policy": "https://github.com/gdavidss/prenuncio/blob/main/docs/POLICY.md", "api": "https://prenuncio.com/llms.txt"},
}
json.dump(out, open(W / "story.json", "w"), ensure_ascii=False)
b = out["benchmark"]
print({k: b[k] for k in ("today", "naive", "first_version", "unseen_2026", "models_tried", "inputs_tested", "submissions")}); print(out["history"]["km2"][-6:], out["forest"], out["check"]["expected_cells"], out["check"]["actual_cells"])
assert 0.7 < b["today"] < 0.8 and 0.4 < b["naive"] < 0.6 and b["models_tried"] > 15 and b["inputs_tested"] > 10
assert [r["rank"] for r in rows] == list(range(1, len(rows) + 1)) and rows[0]["cap5"] == max(r["cap5"] for r in rows)
