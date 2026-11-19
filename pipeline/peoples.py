"""Joins content/peoples.json to the Indigenous lands for the site, one file a language: web/data/peoples/<lang>.json,
land id -> the peoples who live there, each with its lines and, when there is one, its photograph and credit, the
lines and the caption in that language. Portuguese and English come from content/peoples.json, the others from
content/peoples_i18n/<lang>.json ({people key: {text, caption}}). Where a translation is missing the English stands
in, entry by entry, marked "fallback" so the page can set it left to right; the count is printed per language.
Every language the site has (web/i18n/<lang>.json) gets a file, so the page never has to guess.
Run: .venv/bin/python -I pipeline/peoples.py
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
P = json.load(open(ROOT / "content/peoples.json"))
P = P if isinstance(P, dict) and "name" not in P else {x["key"]: x for x in P}
T = json.load(open(ROOT / "content/ti_peoples.json"))
I18N = {f.stem: json.load(open(f)) for f in sorted((ROOT / "content/peoples_i18n").glob("*.json"))} if (ROOT / "content/peoples_i18n").is_dir() else {}
LANGS = sorted({f.stem for f in (ROOT / "web/i18n").glob("*.json")} | set(I18N) | {"pt", "en"})
OUT = ROOT / "web/data/peoples"
OUT.mkdir(parents=True, exist_ok=True)
for old in OUT.glob("*.json"):
    if old.stem not in LANGS:
        old.unlink()
for lang in LANGS:
    tr, out, missing = I18N.get(lang, {}), {}, set()
    for land, keys in T.items():
        rows = []
        for k in keys:
            p = P.get(k)
            if not p or not (p.get("pt") or p.get("en")):
                continue
            own = lang in ("pt", "en")
            text = (p.get(lang) if own else (tr.get(k) or {}).get("text")) or ""
            ph = p.get("photo")
            caption = ((ph or {}).get("caption_" + lang) if own else (tr.get(k) or {}).get("caption")) or ""
            row = {"name": p["name"], "text": text or p.get("en") or p.get("pt") or ""}
            if not text:
                row["fallback"] = True  # these lines are English (or, failing that, Portuguese)
                missing.add(k)
            if ph:
                assert (ROOT / "web" / ph["file"]).exists(), ph["file"]
                if not caption:
                    missing.add(k)
                ph = {"file": ph["file"], "author": ph["author"], "license": ph["license"], "source_url": ph["source_url"], "caption": caption or ph.get("caption_en") or ph.get("caption_pt") or "", "place": ph.get("kind") == "place"}
                if not caption:
                    ph["fallback"] = True
            row["photo"] = ph or None
            rows.append(row)
        if rows:
            out[str(land)] = sorted(rows, key=lambda r: r["photo"] is None)  # a people with a photograph leads
    json.dump(out, open(OUT / f"{lang}.json", "w"), ensure_ascii=False)
    print(f"{lang}: {len(out)} lands, {sum(1 for v in out.values() if v[0]['photo'])} open on a photograph, {len(missing)} peoples fall back to English")
old = ROOT / "web/data/peoples.json"
if old.exists():
    old.unlink()  # the single file of two languages is no longer read
