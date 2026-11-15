"""Build benchmark/leaderboard.json and benchmark/LEADERBOARD.md from the submission folders.

  python benchmark/leaderboard.py           rewrite both files
  python benchmark/leaderboard.py --check   fail if the files in the repository are out of date

Nobody edits the leaderboard by hand. A row comes from a submission's meta.json, its scores.json
(written by score.py) and, once a maintainer has looked at it, its review.json.
"""
import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import score  # noqa: E402
import submission  # noqa: E402

KEYS = ("cap5", "cap1", "cap10", "capf5", "auprc", "auc", "front5")
pct = lambda v: "n/a" if v is None else f"{100 * v:.1f}%"
num = lambda v: "n/a" if v is None else f"{v:.3f}"
show = lambda k, v: num(v) if k in ("auprc", "auc") else pct(v)


def build():
    rows, live = [], []
    for name in submission.names():
        d = submission.ROOT / name
        m, sc, rv = submission.load(d, "meta.json"), submission.load(d, "scores.json") or {}, submission.load(d, "review.json") or {}
        years = sc.get("years", {})
        row = {"name": name, "title": m["title"], "authors": m["authors"], "date": m["date"],
               "status": rv.get("status", "self-reported"), "flag": rv.get("flag"), "note": rv.get("note"),
               "agents": bool(m["agents"]["used"]), "code": m["code"]["url"],
               "benchmark_version": sc.get("benchmark_version"), "mean": sc.get("mean_2022_2025"),
               "cap5_by_year": {y: r["cap5"] for y, r in years.items()},
               "y2026": {k: years["2026"][k] for k in KEYS} if "2026" in years else None}
        rows.append(row)
        for p in m["predictions"]:
            if p["year"] == submission.LIVE_YEAR:
                live.append({"name": name, "title": m["title"], "year": p["year"], "sha256": p["sha256"], "url": p["url"],
                             "information_cutoff": p["information_cutoff"], "registered": (rv.get("live") or {}).get(str(p["year"])),
                             "agents": row["agents"]})
    current = lambda r: r["mean"] and r["benchmark_version"] == score.VERSION and r["flag"] != "withdrawn"
    ranked = sorted((r for r in rows if current(r)), key=lambda r: -r["mean"]["cap5"])
    for i, r in enumerate(ranked):
        r["rank"] = i + 1
    return {"benchmark_version": score.VERSION, "ranked": ranked, "unranked": [r for r in rows if not current(r)],
            "live": sorted(live, key=lambda r: (r["registered"] or "9999", r["name"]))}


def markdown(board):
    link = lambda r: f"[{r['title']}](submissions/{r['name']}/REPORT.md)"
    mark = lambda r: r["status"] + (", disputed" if r["flag"] == "disputed" else "")
    out = ["# Leaderboard", "",
           f"Benchmark version {board['benchmark_version']}. `benchmark/leaderboard.py` writes this file from the submission folders; do not edit it.", "",
           "## Backtest, mean of 2022 to 2025", "",
           "Share of each year's clearing inside the cells a model flags. The table is sorted by cap5. Scores of past years can be tuned for, so read them with the status column and the report.", "",
           "| # | Submission | cap5 | cap1 | cap10 | capf5 | auprc | auc | front5 | cap5 by year | Status | Agents | Date |",
           "|---|---|---|---|---|---|---|---|---|---|---|---|---|"]
    for r in board["ranked"]:
        by_year = " ".join(f"{100 * r['cap5_by_year'][str(y)]:.1f}" for y in score.MEAN_YEARS)
        out.append(f"| {r['rank']} | {link(r)} | " + " | ".join(show(k, r["mean"][k]) for k in KEYS)
                   + f" | {by_year} | {mark(r)} | {'yes' if r['agents'] else 'no'} | {r['date']} |")
    out += ["", "## 2026, priority scenes only", "",
            "INPE has published 2026 for its priority scenes so far. These scores change when the full map is out.", "",
            "| Submission | cap5 | cap1 | cap10 | capf5 | auprc | auc | front5 | Status |", "|---|---|---|---|---|---|---|---|---|"]
    for r in sorted((r for r in board["ranked"] if r["y2026"]), key=lambda r: -r["y2026"]["cap5"]):
        out.append(f"| {link(r)} | " + " | ".join(show(k, r["y2026"][k]) for k in KEYS) + f" | {mark(r)} |")
    out += ["", f"## Live track, PRODES year {submission.LIVE_YEAR}", "",
            "Forecasts registered before the outcome exists. They get their scores when INPE publishes the map.", "",
            "| Submission | Registered | Information cutoff | sha256 of the map | Agents | Score |", "|---|---|---|---|---|---|"]
    for r in board["live"]:
        out.append(f"| {link(r)} | {r['registered'] or 'awaiting review'} | {r['information_cutoff']} | [`{r['sha256'][:16]}`]({r['url']}) | "
                   f"{'yes' if r['agents'] else 'no'} | pending |")
    if board["unranked"]:
        out += ["", "## Not ranked", "",
                "Submissions without all four benchmark years, scored under an older benchmark version, or withdrawn.", ""]
        for r in board["unranked"]:
            why = "withdrawn" if r["flag"] == "withdrawn" else "no complete score under this version"
            out.append(f"- {link(r)}, {why}" + (f". {r['note']}" if r["flag"] == "withdrawn" and r["note"] else ""))
    out += ["", "## Status", "",
            "- **self-reported**: the authors ran the scorer. Nobody else has checked the numbers.",
            "- **re-scored**: the maintainers or the repository's workflow downloaded the maps, matched their sha256 and ran the scorer. The numbers are right for those maps.",
            "- **reproduced**: someone other than the authors ran the code from the stated commit and got maps that score within half a point of cap5 on the four-year mean.",
            "- **disputed**: an open issue questions the submission. The row stays until the issue is settled.", ""]
    return "\n".join(out)


if __name__ == "__main__":
    board = build()
    files = {HERE / "leaderboard.json": json.dumps(board, indent=1, ensure_ascii=False) + "\n", HERE / "LEADERBOARD.md": markdown(board)}
    if "--check" in sys.argv:
        stale = [f.name for f, text in files.items() if not f.exists() or f.read_text() != text]
        if stale:
            sys.exit(f"out of date: {', '.join(stale)}. Run python benchmark/leaderboard.py and commit the result.")
        print("leaderboard is up to date")
    else:
        for f, text in files.items():
            f.write_text(text)
        print(f"{len(board['ranked'])} ranked, {len(board['live'])} live, {len(board['unranked'])} not ranked")
