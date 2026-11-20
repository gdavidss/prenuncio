"""Write the public benchmark endpoint independently of the other API exports."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCORER = "https://github.com/gdavidss/prenuncio/tree/main/benchmark"


def payload():
    leaderboard = json.loads((ROOT / "benchmark/leaderboard.json").read_text())
    # Keep the original v1 key and name field available to API clients.
    leaderboard["ranked"] = [
        {**row, "name": row["model"], "title": row["note"], "authors": [row["by"]]}
        for row in leaderboard["rows"]
        if row["kind"] == "model"
    ]
    return {"leaderboard": leaderboard, "scorer": SCORER}


if __name__ == "__main__":
    target = ROOT / "web/api/v1/benchmark.json"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(payload(), ensure_ascii=False, separators=(",", ":")))
