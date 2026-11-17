"""Build the leaderboard from the submission folders. Writes benchmark/leaderboard.json,
benchmark/LEADERBOARD.md and the table between the leaderboard markers in README.md.

  python benchmark/leaderboard.py           rewrite the three files
  python benchmark/leaderboard.py --check   fail if any of them is out of date

Nobody edits the leaderboard by hand. A row comes from a submission's meta.json, its scores.json
(written by score.py) and, once a maintainer has looked at it, its review.json.
"""
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import score  # noqa: E402
import submission  # noqa: E402

REPO = "https://github.com/gdavidss/prenuncio"
README = HERE.parent / "README.md"
BLOCK = re.compile(r"(<!-- leaderboard:start -->\n).*?(<!-- leaderboard:end -->)", re.S)
METRIC = "share of the year's clearing inside the 5% of forest cells a model ranks highest, mean of PRODES years 2022 to 2025"
SAY = "The score is cap5, the share of the year's clearing inside the 5% of forest cells a model ranks highest, averaged over PRODES years 2022 to 2025."
pct = lambda v: "n/a" if v is None else f"{100 * v:.1f}%"


def maps_page(preds):
    """Where a reader finds the maps: the release page for GitHub release assets, else the folder of the first file."""
    if not preds:
        return None
    m = re.match(r"(https://github\.com/[^/]+/[^/]+/releases)/download/([^/]+)/", preds[0]["url"])
    return f"{m[1]}/tag/{m[2]}" if m else preds[0]["url"].rsplit("/", 1)[0]


def build():
    rows, live = [], []
    for name in submission.names():
        d = submission.ROOT / name
        m, sc, rv = submission.load(d, "meta.json"), submission.load(d, "scores.json") or {}, submission.load(d, "review.json") or {}
        years, mean, code = sc.get("years", {}), sc.get("mean_2022_2025"), m["code"]
        row = {"rank": None, "model": name, "kind": m.get("kind", "model"), "note": m["summary"],
               "by": ", ".join(m["authors"]), "date": m["date"],
               "cap5": mean and mean["cap5"], "unseen_2026": (years.get("2026") or {}).get("cap5"),
               "by_year": {str(y): years[str(y)]["cap5"] for y in score.MEAN_YEARS if str(y) in years},
               "status": rv.get("status", "self-reported"), "flag": rv.get("flag"), "superseded_by": m.get("superseded_by"),
               "url": f"{REPO}/blob/main/benchmark/submissions/{name}/REPORT.md",
               "code": code["url"].rstrip("/") + (f"/tree/{code['commit']}" if "github.com" in code["url"] else ""),
               "maps": maps_page(m["predictions"]), "weights": m.get("weights") or None,
               "agents": bool(m["agents"]["used"]), "review_note": rv.get("note"),
               "benchmark_version": sc.get("benchmark_version"), "mean": mean,
               "y2026": {k: years["2026"][k] for k in score.KEYS} if "2026" in years else None}
        rows.append(row)
        for p in m["predictions"]:
            if p["year"] == submission.LIVE_YEAR:
                live.append({"model": name, "year": p["year"], "sha256": p["sha256"], "map": p["url"],
                             "information_cutoff": p["information_cutoff"], "registered": (rv.get("live") or {}).get(str(p["year"]))})
    current = lambda r: r["mean"] and r["benchmark_version"] == score.VERSION and r["flag"] != "withdrawn"
    ranked = sorted((r for r in rows if current(r)), key=lambda r: -r["cap5"])
    for i, r in enumerate(ranked):
        r["rank"] = i + 1
    return {"benchmark_version": score.VERSION, "metric": METRIC, "years": list(score.MEAN_YEARS), "rows": ranked,
            "unranked": [r for r in rows if not current(r)], "live": sorted(live, key=lambda r: (r["registered"] or "9999", r["model"]))}


def mark(r):
    """The last column: what kind of row it is and how far its numbers have been checked."""
    if r["kind"] == "reference":
        return "reference"
    return r["status"] + (", superseded" if r["superseded_by"] else "") + (", disputed" if r["flag"] == "disputed" else "")


def table(board, folder="submissions/"):
    """The one table, as markdown lines. `folder` is the path from the file that holds it to the submissions."""
    name = lambda r: f"[{r['model']}]({folder}{r['model']}/REPORT.md)"
    out = ["| # | Model | cap5 | 2026 | By | Date | Links | Status |", "|---|---|---:|---:|---|---|---|---|"]
    for r in board["rows"]:
        links = " ".join(f"[{k}]({r[k]})" for k in ("code", "maps", "weights") if r[k])
        out.append(f"| {r['rank']} | {name(r)} | {pct(r['cap5'])} | {pct(r['unseen_2026'])} | {r['by'].replace('|', '/')} | {r['date']} | {links} | {mark(r)} |")
    return out


def markdown(board):
    name = lambda r: f"[{r['model']}](submissions/{r['model']}/REPORT.md)"
    out = ["# Leaderboard", "", SAY, ""] + table(board)
    out += ["", "2026 stays out of the mean because INPE has mapped it for its priority scenes only. A model's name opens its report. "
                "What each status means, the rules and how to submit are in [README.md](README.md).", "",
            "## cap5 by year", "",
            "| Model | " + " | ".join(str(y) for y in score.SCORED_YEARS) + " |", "|---|" + "---:|" * len(score.SCORED_YEARS)]
    for r in board["rows"]:
        out.append(f"| {name(r)} | " + " | ".join(pct({**r["by_year"], "2026": r["unseen_2026"]}.get(str(y))) for y in score.SCORED_YEARS) + " |")
    out += ["", "The other scores (cap1, cap10, capf5, auprc, auc, front5) are in each model's `scores.json` and in [leaderboard.json](leaderboard.json).", "",
            f"## Live track, PRODES year {submission.LIVE_YEAR}", "",
            "Forecasts registered before the outcome exists. They get their scores when INPE publishes the map.", "",
            "| Model | Registered | Information cutoff | Map, sha256 | Score |", "|---|---|---|---|---|"]
    for r in board["live"]:
        out.append(f"| {name(r)} | {r['registered'] or 'awaiting review'} | {r['information_cutoff']} | [`{r['sha256'][:16]}`]({r['map']}) | pending |")
    if board["unranked"]:
        out += ["", "## Not ranked", "", "Without all four years, scored under an older benchmark version, or withdrawn.", ""]
        for r in board["unranked"]:
            why = "withdrawn" if r["flag"] == "withdrawn" else "no complete score under this version"
            out.append(f"- {name(r)}, {why}" + (f". {r['review_note']}" if r["flag"] == "withdrawn" and r["review_note"] else ""))
    out += ["", f"Benchmark version {board['benchmark_version']}. `benchmark/leaderboard.py` writes this file from the submission folders. Do not edit it.", ""]
    return "\n".join(out)


def readme(board):
    """README.md with the table between its two markers replaced."""
    text = README.read_text()
    if not BLOCK.search(text):
        sys.exit("README.md has lost its leaderboard markers, <!-- leaderboard:start --> and <!-- leaderboard:end -->")
    block = "\n".join([SAY, ""] + table(board, "benchmark/submissions/")) + "\n"
    return BLOCK.sub(lambda m: m[1] + block + m[2], text)


if __name__ == "__main__":
    board = build()
    files = {HERE / "leaderboard.json": json.dumps(board, indent=1, ensure_ascii=False) + "\n",
             HERE / "LEADERBOARD.md": markdown(board), README: readme(board)}
    if "--check" in sys.argv:
        stale = [f.name for f, text in files.items() if not f.exists() or f.read_text() != text]
        if stale:
            sys.exit(f"out of date: {', '.join(stale)}. Run python benchmark/leaderboard.py and commit the result.")
        print("leaderboard is up to date")
    else:
        for f, text in files.items():
            f.write_text(text)
        print(f"{len(board['rows'])} ranked, {len(board['live'])} live, {len(board['unranked'])} not ranked")
