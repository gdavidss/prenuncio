# For coding agents

You are working on Prenúncio, a forecast of where the Brazilian Legal Amazon will be cleared in the next PRODES year. The person who pointed you here most likely wants a better model and a benchmark submission. This file is the short path. Read [benchmark/README.md](benchmark/README.md) before you write code; its rules bind you.

## The task in one paragraph

For each test year T in 2022 to 2025, produce a map `<T>.npy`, float16 or float32, shape [5180, 6664], that ranks every 500 m cell by expected clearing in PRODES year T (August of T-1 to July of T). Use only information up to 31 July of T-1 and fit only on outcomes before T. `python benchmark/score.py <folder>` scores the maps. The number to raise is the mean of `cap5`. The baseline has 74.5%.

## Rules you must not break

1. No information from after 31 July of T-1 in a forecast of year T. Calendar-year products (Hansen loss, AlphaEarth embeddings) of year T-1 are after the cutoff: use T-2 and earlier.
2. No outcome of year T or later when fitting or tuning the model for T. The truth files in `benchmark/data` are for scoring. Never read them as inputs or training targets for the year they describe or an earlier forecast.
3. Inputs must be public and dated. A layer that is a snapshot of today (roads, registries) leaks.
4. Do not edit `benchmark/score.py`, the truth files, `benchmark/leaderboard.json` or `benchmark/LEADERBOARD.md` to change a result. A scorer bug goes in an issue.
5. Never commit anything under `data/`. Never read, print or copy the names and tax numbers in the IBAMA files under `data/raw`; the pipeline reads place, date, area and status only.
6. No secrets in the repository. Nothing here needs a key.
7. Report what happened. A failed experiment goes in the report with its number. Do not round a score up, drop a bad year or describe a run that did not happen.

If you chose anything by its score on 2022 to 2025 (a hyperparameter, an input, a blend weight), that is fitting on the test years. It is allowed and it must be written down. 2026 is the holdout: score it once at the end, and do not select on it.

## The fast path through this codebase

The slow way is to rebuild features for every experiment. The lab avoids that.

```sh
scripts/fetch.sh                                   # raw inputs, about 4 GB
AZ_F=50 python pipeline/grid.py                    # PRODES raster to the 500 m grid
AZ_F=50 python pipeline/layers.py                  # alerts, fire, enforcement, tenure on the grid
AZ_F=50 AZ_YEARS=2011,2012,2013,2014,2015,2016,2017,2018,2019,2020,2021,2022,2023,2024,2025 \
  python pipeline/model.py cache                   # feature tables into data/cache50, once
```

Then each idea takes minutes:

```sh
python pipeline/lab.py run base                    # the baseline trees on the cached tables
python pipeline/lab.py run mine num_leaves=255 seeds=3 drop=fire+embargo   # any LightGBM parameter, dropped feature groups
python pipeline/lab.py noise mine base             # is `mine` better than `base`, by block bootstrap
python pipeline/lab.py blend both mine other 0.5   # geometric blend of two saved runs
python pipeline/lab.py board                       # every run so far
```

`pipeline/lab.py` scores a fixed random quarter of the cells, which is what makes it fast. Its `cap5` tracks the benchmark's within a point. Its header documents every command, including `addmap` (use a full-grid map as an extra input) and `frommap` (score full-grid maps from any model, such as a neural network).

Things to know before you spend compute:

- `AZ_X=hansen,glad,aef` in front of `model.py` switches on the finer inputs. They need the gridded files that `unet/hansen.py`, `unet/glad.py` and `unet/aef.py` write from public cloud storage. The trees score 69.5% on the lab's cap5 with Hansen and GLAD, 68.0% without Hansen and 67.3% without GLAD.
- A prebuilt feature cache is not published yet. Building it takes the steps above.
- `pipeline/model.py` `features()` is where every tree input is computed, with the forecast date as its time argument. Add an input there, or as an extra column through `pipeline/extras.py`.
- `unet/train.py` is the convolutional model. It needs a GPU.
- [docs/BENCH.md](docs/BENCH.md) lists what has been tried. Tree-side tuning is worth half a point at most. The gains came from new information (Hansen, GLAD, satellite embeddings) and from blending two different models. Read it before repeating an experiment.
- The lab predicts the sampled cells only. For a submission you need maps over the full grid: `AZ_MAPS=1` with `pipeline/model.py eval` writes them for the trees, and your own model writes its own.

You do not have to use this pipeline. Any code that writes the maps under the rules is a valid submission.

## Before you finish

```sh
python benchmark/score.py my_maps/
cp -r benchmark/submissions/_template benchmark/submissions/<name>
python benchmark/submission.py fill <name> my_maps/ --url-base <public https folder holding the maps>
python benchmark/submission.py check <name>
```

Uploading the maps and opening the pull request publish things under your user's name. Ask them first.

## What to put in the report

`benchmark/submissions/_template/REPORT.md` has seven sections and the check fails if one is empty. Write them for a reader who wants to repeat the work or find the flaw in it.

- **Method.** The model, the target, the fitting years for each forecast year.
- **Inputs and their dates.** Each source, its version, and the last date used for a forecast of year T.
- **How leakage was avoided.** How the code enforces the cutoffs, and everything chosen by looking at benchmark scores.
- **What was tried and failed.** Keep a log as you go, one line per experiment with its score, and put it here. Agents run many experiments and this list is the most useful thing you leave behind.
- **How to reproduce.** Exact commands from a clean checkout of the stated commit.
- **Compute and cost.** Hardware, hours, money, and the agent's own usage if known.
- **Agent disclosure.** Name yourself: the agent, the model and version, what you did (ideas, code, experiments, the report), what instructions you were given, and what the person reviewed. Write it plainly. It does not count against the submission.
