"""Joins content/peoples.json to the Indigenous lands for the site: web/data/peoples.json, land id -> the
peoples who live there, each with its lines and, when there is one, its photograph and credit.
Run: .venv/bin/python -I pipeline/peoples.py
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
P = json.load(open(ROOT / "content/peoples.json"))
P = P if isinstance(P, dict) and "name" not in P else {x["key"]: x for x in P}
T = json.load(open(ROOT / "content/ti_peoples.json"))
out = {}
for land, keys in T.items():
    rows = []
    for k in keys:
        p = P.get(k)
        if not p or not (p.get("pt") or p.get("en")):
            continue
        ph = p.get("photo")
        if ph:
            assert (ROOT / "web" / ph["file"]).exists(), ph["file"]
            ph = {"file": ph["file"], "author": ph["author"], "license": ph["license"], "source_url": ph["source_url"], "caption": {"pt": ph.get("caption_pt", ""), "en": ph.get("caption_en", "")}}
        rows.append({"name": p["name"], "text": {"pt": p.get("pt", ""), "en": p.get("en", "")}, "photo": ph or None})
    if rows:
        out[str(land)] = sorted(rows, key=lambda r: r["photo"] is None)  # a people with a photograph leads
json.dump(out, open(ROOT / "web/data/peoples.json", "w"), ensure_ascii=False)
print(len(out), "lands,", sum(1 for v in out.values() if v[0]["photo"]), "open on a photograph")
