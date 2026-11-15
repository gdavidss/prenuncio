"""Check, fill and re-score the folders under benchmark/submissions. Standard library, plus score.py.

  python benchmark/submission.py check [name ...]
      validate meta.json, REPORT.md, scores.json and review.json; every submission when no name is given
  python benchmark/submission.py fill <name> <prediction folder> --url-base <https://.../>
      hash and score local prediction maps, write scores.json and the `predictions` list of meta.json
  python benchmark/submission.py rescore <name> [--write]
      download the linked maps, check each sha256, score them and compare with scores.json
  python benchmark/submission.py --root <pr>/benchmark/submissions ci <base>/benchmark/submissions
      what the workflow runs: check and re-score every submission that differs from the base checkout
"""
import argparse
import filecmp
import json
import re
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE / "submissions"
LIVE_YEAR = 2027
YEARS = (2022, 2023, 2024, 2025, 2026, LIVE_YEAR)
SECTIONS = ("Method", "Inputs and their dates", "How leakage was avoided", "What was tried and failed",
            "How to reproduce", "Compute and cost", "Agent disclosure")
STATUSES = ("self-reported", "re-scored", "reproduced")
FLAGS = (None, "disputed", "withdrawn")
ALLOWED = {".json", ".md", ".png", ".jpg", ".svg"}
DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
SHA = re.compile(r"^[0-9a-f]{64}$")


def names(root=ROOT):
    return sorted(d.name for d in Path(root).iterdir() if d.is_dir() and not d.name.startswith("_"))


def load(folder, name):
    f = Path(folder) / name
    return json.load(open(f)) if f.exists() else None


def check(name, root=ROOT):
    """Problems with one submission, as a list of sentences. Empty means it is valid."""
    d, bad = Path(root) / name, []
    say = bad.append
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]{1,48}", name):
        say("the folder name must be lower case letters, digits and hyphens")
    for f in d.rglob("*"):
        if f.is_symlink():
            return bad + [f"{f.relative_to(d)} is a symbolic link; submissions hold plain files"]
        if f.is_file() and (f.suffix not in ALLOWED or f.stat().st_size > 1 << 20):
            say(f"{f.relative_to(d)}: only .json, .md and small images under 1 MB belong here; link everything else")
    try:
        m = load(d, "meta.json")
    except ValueError as e:
        return bad + [f"meta.json is not valid JSON: {e}"]
    if m is None:
        return bad + ["meta.json is missing"]
    text = lambda v: isinstance(v, str) and v.strip() and "TODO" not in v
    if m.get("name") != name:
        say("meta.json `name` must equal the folder name")
    for k in ("title", "summary", "benchmark_version"):
        if not text(m.get(k)):
            say(f"meta.json `{k}` is missing")
    if not (isinstance(m.get("authors"), list) and m["authors"] and all(text(a) for a in m["authors"])):
        say("meta.json `authors` must list at least one name")
    if not DATE.match(str(m.get("date", ""))):
        say("meta.json `date` must be YYYY-MM-DD")
    code = m.get("code") or {}
    if not str(code.get("url", "")).startswith("https://"):
        say("meta.json `code.url` must be a public https link")
    if not re.fullmatch(r"[0-9a-f]{7,40}", str(code.get("commit", ""))):
        say("meta.json `code.commit` must be the commit hash that produced the maps")
    if not text(code.get("license")):
        say("meta.json `code.license` must name an open-source licence")
    preds, seen = m.get("predictions"), set()
    if not isinstance(preds, list):
        say("meta.json `predictions` must be a list (it may be empty)")
        preds = []
    for p in preds:
        y = p.get("year")
        if y not in YEARS or y in seen:
            say(f"predictions: year {y} is not one of {YEARS} or appears twice")
        seen.add(y)
        if not str(p.get("url", "")).startswith("https://"):
            say(f"predictions {y}: `url` must be an https link to the file")
        if not SHA.match(str(p.get("sha256", ""))):
            say(f"predictions {y}: `sha256` must be 64 hex characters")
        if y == LIVE_YEAR and not DATE.match(str(p.get("information_cutoff", ""))):
            say(f"predictions {y}: a live forecast states its `information_cutoff` as YYYY-MM-DD")
    src = m.get("data_sources")
    if not (isinstance(src, list) and src and all(text(s.get("name")) and text(s.get("url")) and text(s.get("dates")) for s in src)):
        say("meta.json `data_sources` must list every input with `name`, `url` and `dates`")
    if not text((m.get("compute") or {}).get("hardware")):
        say("meta.json `compute.hardware` is missing")
    ag = m.get("agents") or {}
    if not isinstance(ag.get("used"), bool):
        say("meta.json `agents.used` must be true or false")
    elif ag["used"] and not (isinstance(ag.get("tools"), list) and ag["tools"] and all(text(t.get("name")) and text(t.get("how")) for t in ag["tools"])):
        say("meta.json `agents.tools` must name each agent and say how it was used")

    rep = d / "REPORT.md"
    if not rep.exists():
        say("REPORT.md is missing")
    else:
        body = re.sub(r"<!--.*?-->", "", rep.read_text(), flags=re.S)
        parts = re.split(r"^## +(.+?)\s*$", body, flags=re.M)
        found = {parts[i].strip(): parts[i + 1] for i in range(1, len(parts) - 1, 2)}
        for s in SECTIONS:
            if len(found.get(s, "").strip()) < 40:
                say(f"REPORT.md: the section `## {s}` is missing or empty")
        if "TODO" in body:
            say("REPORT.md still has TODO in it")

    sc = load(d, "scores.json")
    if sc is not None:
        if sc.get("benchmark_version") != m.get("benchmark_version"):
            say("scores.json and meta.json name different benchmark versions")
        by_year = {str(p.get("year")): p.get("sha256") for p in preds}
        for y, row in (sc.get("years") or {}).items():
            if by_year and by_year.get(y) != row.get("prediction_sha256"):
                say(f"scores.json {y}: scored a file whose sha256 is not the one in meta.json")
    rv = load(d, "review.json")
    if rv is not None:
        if rv.get("status") not in STATUSES:
            say(f"review.json `status` must be one of {STATUSES}")
        if rv.get("flag") not in FLAGS:
            say("review.json `flag` must be absent, disputed or withdrawn")
        if rv.get("status") != "self-reported" and sc is None:
            say("review.json claims a re-score but scores.json is missing")
    return bad


def fill(name, folder, url_base):
    """Score local maps and record their hashes, so the folder matches the files that get uploaded."""
    import score
    d = ROOT / name
    m = load(d, "meta.json")
    old = {p["year"]: p for p in m.get("predictions", [])}
    has_scored = any(score.find_prediction(folder, y) for y in score.SCORED_YEARS)
    res = score.score_folder(folder) if has_scored else {"benchmark_version": score.VERSION}
    if has_scored:
        json.dump(res, open(d / "scores.json", "w"), indent=1)
    preds = []
    for y in YEARS:
        f = score.find_prediction(folder, y)
        if f is None:
            continue
        p = {"year": y, "url": url_base.rstrip("/") + "/" + f.name, "sha256": score.sha256(f), "bytes": f.stat().st_size}
        if y == LIVE_YEAR:
            p["information_cutoff"] = old.get(y, {}).get("information_cutoff", "TODO")
        preds.append(p)
    m["predictions"], m["benchmark_version"] = preds, res["benchmark_version"]
    json.dump(m, open(d / "meta.json", "w"), indent=1, ensure_ascii=False)
    print(f"wrote {d / 'scores.json'} and the predictions of {d / 'meta.json'}")


def rescore(name, write=False, root=ROOT, keep=None):
    """Download the linked maps, check the hashes, score. Returns problems; empty means scores.json holds."""
    import score
    d = Path(root) / name
    m, mine = load(d, "meta.json"), load(d, "scores.json")
    if not m.get("predictions"):
        print(name, "links no prediction maps: nothing to re-score, the row stays self-reported")
        return []
    tmp = Path(keep or tempfile.mkdtemp(prefix="prenuncio_maps_"))
    for p in m["predictions"]:
        ext = ".npy" if p["url"].split("?")[0].endswith(".npy") else ".npz"
        f = tmp / f"{p['year']}{ext}"
        if not (f.exists() and score.sha256(f) == p["sha256"]):
            print("fetch", p["url"], flush=True)
            score.download(p["url"], f, p["sha256"])
        score.load_prediction(f, json.load(open(score.DATA / "grid.json")))  # shape and dtype, the live year included
    if not any(p["year"] in score.SCORED_YEARS for p in m["predictions"]):
        print(name, "registers a live forecast only: the hash holds, nothing to score yet")
        return []
    res = score.score_folder(tmp)
    if write:
        json.dump(res, open(d / "scores.json", "w"), indent=1)
        print("wrote", d / "scores.json")
        return []
    if mine is None:
        return ["scores.json is missing; add the one this run produced"]
    bad = []
    for y, row in res["years"].items():
        for k in score.KEYS:
            a, b = row[k], (mine.get("years", {}).get(y) or {}).get(k)
            if (a is None) != (b is None) or (a is not None and abs(a - b) > 1e-5):
                bad.append(f"{y} {k}: scores.json says {b}, the re-score gives {a}")
    if mine.get("mean_2022_2025") != res["mean_2022_2025"] and not bad:
        bad.append("scores.json `mean_2022_2025` does not match the re-score")
    return bad


def changed(other, root=ROOT):
    """Submissions under root that are new or differ from the same folder under other."""
    out = []
    for n in names(root):
        a, b = Path(root) / n, Path(other) / n
        files = sorted(f.relative_to(a) for f in a.rglob("*") if f.is_file())
        if not b.is_dir() or files != sorted(f.relative_to(b) for f in b.rglob("*") if f.is_file()) \
                or any(not filecmp.cmp(a / f, b / f, shallow=False) for f in files):
            out.append(n)
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--root", default=ROOT, help="the submissions folder to read (default: benchmark/submissions)")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("check").add_argument("names", nargs="*")
    f = sub.add_parser("fill")
    f.add_argument("name"); f.add_argument("folder"); f.add_argument("--url-base", required=True)
    r = sub.add_parser("rescore")
    r.add_argument("name"); r.add_argument("--write", action="store_true"); r.add_argument("--keep", help="keep the downloaded maps in this folder")
    sub.add_parser("ci").add_argument("other")
    a = ap.parse_args()
    sys.path.insert(0, str(HERE))
    if a.cmd == "fill":
        return fill(a.name, a.folder, a.url_base)
    if a.cmd == "ci":
        todo = changed(a.other, a.root)
        print("submissions that changed:", ", ".join(todo) or "none")
    else:
        todo = (a.names or names(a.root)) if a.cmd == "check" else [a.name]
    failed = 0
    for n in todo:
        bad = check(n, a.root)
        if a.cmd != "check" and not bad:
            try:
                bad = rescore(n, getattr(a, "write", False), a.root, getattr(a, "keep", None))
            except SystemExit as e:  # a download, hash or format failure from score.py
                bad = [str(e)]
        print(f"{n}: {'ok' if not bad else 'FAILED'}")
        for b in bad:
            print("  -", b)
        failed += bool(bad)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
