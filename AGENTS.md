# For coding agents

You are working on Prenúncio, a forecast of where the Brazilian Legal Amazon will be cleared in the next PRODES year. The person who pointed you here most likely wants a better model on the [leaderboard](benchmark/LEADERBOARD.md). Read [benchmark/README.md](benchmark/README.md) before you write code. Its rules bind you.

## The task

For each year T in 2022 to 2025, write a map `<T>.npy`, float16 or float32, shape [5180, 6664], that ranks every 500 m cell by expected clearing in PRODES year T (August of T-1 to July of T). `python benchmark/score.py <folder>` scores the maps. The number to raise is the mean of `cap5`, and the leaderboard shows what to beat.

## Rules you must not break

1. One model. The same procedure writes every year's map. An ensemble is fine when it is built and reported as one model. Do not pick a different model for each year.
2. No information from after 31 July of T-1 in a forecast of year T. Calendar-year products (Hansen loss, AlphaEarth embeddings) of year T-1 are after the cutoff, so use T-2 and earlier.
3. No outcome of year T or later when fitting or tuning the model for T. The truth files in `benchmark/data` are for scoring. Never read them as inputs or training targets for the year they describe or an earlier forecast.
4. Inputs must be public and dated. A layer that is a snapshot of today (roads, registries) leaks.
5. Do not edit `benchmark/score.py`, the truth files, `benchmark/leaderboard.json` or `benchmark/LEADERBOARD.md` to change a result. A scorer bug goes in an issue.
6. Never commit anything under `data/`. Never read, print or copy the names and tax numbers in the IBAMA files under `data/raw`. The pipeline reads place, date, area and status only.
7. No secrets in the repository. Nothing here needs a key.
8. Report what happened. A failed experiment goes in the report with its number. Do not round a score up, drop a bad year or describe a run that did not happen.

Anything you chose by its score on 2022 to 2025 (a hyperparameter, an input, a blend weight) is fitted on the test years. That is allowed and must be written down. 2026 is the holdout. Score it once at the end and do not select on it.

## The fast path

You do not have to use this codebase. Any code that writes the maps under the rules is a valid submission. If you do use it, `pipeline/lab.py` scores an idea in minutes on cached feature tables.

```sh
python pipeline/lab.py run base                    # the tree baseline
python pipeline/lab.py run mine num_leaves=255 seeds=3 drop=fire+embargo
python pipeline/lab.py noise mine base             # is `mine` better than `base`, by block bootstrap
```

[docs/PIPELINE.md](docs/PIPELINE.md) has the setup, every command and where each input is computed. [docs/LAB.md](docs/LAB.md) lists what has been tried, so read it before repeating an experiment. Tuning the trees is worth half a point at most. The gains came from new inputs and from the ensemble.

## Before you finish

```sh
python benchmark/score.py my_maps/
cp -r benchmark/submissions/_template benchmark/submissions/<name>
python benchmark/submission.py fill <name> my_maps/ --url-base <public https folder holding the maps>
python benchmark/submission.py check <name>
```

Uploading the maps and opening the pull request publish things under your user's name. Ask them first.

## The report

`benchmark/submissions/_template/REPORT.md` has seven sections and the check fails if one is empty. Write them for a reader who wants to repeat the work or find the flaw in it.

- **Method.** The model, the target, the fitting years for each forecast year. If it is an ensemble, how its parts become one map.
- **Inputs and their dates.** Each source, its version, and the last date used for a forecast of year T.
- **How leakage was avoided.** How the code enforces the cutoffs, and everything chosen by looking at benchmark scores.
- **What was tried and failed.** Keep a log as you go, one line per experiment with its score, and put it here. This list is the most useful thing you leave behind.
- **How to reproduce.** Exact commands from a clean checkout of the stated commit, and links to the weights if you publish them.
- **Compute and cost.** Hardware, hours, money, and your own usage if known.
- **Agent disclosure.** Name yourself: the agent, the model and version, what you did, what instructions you were given, and what the person reviewed. It does not count against the submission.
