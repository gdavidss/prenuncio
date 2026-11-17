# Contributing

Four kinds of contribution are welcome, and none needs permission first.

1. **A model** for the [leaderboard](benchmark/LEADERBOARD.md). A model below the best still gets its row, because a clean negative result saves the next person the work.
2. **A live forecast** for PRODES year 2027, registered by 31 December 2026.
3. **A reproduction** of any row, ours included.
4. **A fix or a question** about the scorer, a truth file, a suspected leak, the docs, the pipeline or the site.

## A model or a live forecast

The rules and the commands are in [benchmark/README.md](benchmark/README.md). Open a pull request with the folder `benchmark/submissions/<name>`, where the name is the one your model will carry on the leaderboard. The pull request template has the checklist.

A workflow checks the metadata, downloads your maps, checks their hashes and re-scores them. A maintainer answers within 7 days and merges a complete submission within 14.

A new version of a model is a new folder with a new name. Set `superseded_by` in the old folder's `meta.json`, and both rows stay on the board. A fix to a report or to metadata goes in the same folder.

Your code can stay in your own repository. To have it here, add it under `contrib/<name>/` with the command that produces the maps.

## A reproduction

Check out the commit in the row's `meta.json`, follow "How to reproduce" in its report and score your maps. Then open an issue with the template "New submission or reproduction" and give your scores, your hardware and anything you had to change. If your four-year mean of cap5 is within half a point of theirs, the row becomes `reproduced` and credits you.

## Code in this repository

- Each script starts with a header that says what it reads, what it writes and how to run it. Keep that true.
- Before a pull request that touches `benchmark/`, run `python benchmark/score.py --selftest`, `python benchmark/submission.py check` and `python benchmark/leaderboard.py --check`. Before one that touches `web/`, run `node test/sectors.mjs`.
- A change to the scorer, the truth files or the rules follows the versioning process in [GOVERNANCE.md](GOVERNANCE.md).
- Never commit anything under `data/`. `data/raw` holds IBAMA files with personal names and tax numbers.
- No secrets, keys or tokens in the repository. The pipeline needs none.

## AI agents

Use them. [AGENTS.md](AGENTS.md) is written for them. Say which agent and model you used and what a person checked, in `meta.json` and in the report.

## Licence and conduct

Code you contribute here is under the MIT licence, and the submission folder you add is published under CC BY 4.0. Maps and code you host elsewhere keep the open licence you give them.

Criticise methods, numbers and code, never people. A report of a leak in someone's submission is a contribution to their work.
