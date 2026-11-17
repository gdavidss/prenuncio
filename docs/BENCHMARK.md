# The benchmark in detail

The reference for the open benchmark. The short version, with the rules, is [benchmark/README.md](../benchmark/README.md). The benchmark is at version 1.0.

## The grid and the candidates

A PRODES year T runs from 1 August of T-1 to 31 July of T. The grid has 5180 rows and 6664 columns of 0.0045 degrees, about 500 m, with row 0 in the north. `benchmark/data/grid.json` holds its corner. A cell is a candidate, and is scored, when it lies inside the Legal Amazon and at least 1% of it was forest on the forecast date. That leaves about 14 million cells a year.

## The two tracks

**Backtest.** Years 2022, 2023, 2024 and 2025. The leaderboard ranks by the mean over these four. 2026 is scored too and shown apart, because INPE has published it for its priority scenes only (3,439 km² on this grid).

**Live.** A forecast for PRODES year 2027 (August 2026 to July 2027), registered now and scored when INPE publishes the map. Past PRODES years are public, so a backtest score depends on the authors keeping the rules. The 2027 outcome does not exist yet and nobody can leak it.

## Notes on the rules

**One model.** Refitting the same model for each year, on the outcomes before that year, is the same procedure. Picking for each year whichever of several models scored best is not. An ensemble counts as one model when one set of commands builds it and one report describes it. If anything differed between years, such as a run that had to be restarted, the report says what.

**Pretrained models.** Weights trained on imagery from after the cutoff are a soft leak. They are allowed and must be disclosed.

**Leaks we have met or avoided**, so you can check for them.

- A calendar-year product (Hansen loss, annual embeddings) for year t includes months after 31 July of t. A forecast dated 31 July of t uses year t-1 and earlier.
- A snapshot of today (OpenStreetMap roads, a property registry, a list of protected areas) shows things built after the clearing it seems to predict. Use dated versions, or creation dates.
- PRODES maps some clearing late, under cloud. Late-mapped clearing belongs to the year INPE first mapped it, and the forest map for a forecast date must still show it as forest.
- DETER dates are detection dates. Alerts detected after 31 July are after the cutoff even when the clearing happened before.
- Choosing a model, a blend weight or a threshold by its 2022 to 2025 score is fitting on the test years. Everyone does some of it on a public benchmark, including us. Say what you chose that way. The live track is the remedy.

## The scores

`benchmark/score.py` computes them for each year, over every candidate cell.

| Score | What it asks |
|---|---|
| cap5 | Flag the 5% of candidate cells with the highest prediction. What share of the year's clearing, in km², is inside them? The leaderboard sorts by this. |
| cap1, cap10 | The same at 1% and 10%. |
| capf5 | The same budget counted in forest. Take cells in order of prediction per km² of forest until they hold 5% of the candidates' forest. |
| auprc, auc | Precision-recall and ROC area for the label "at least 25 of the cell's 2500 pixels were cleared", a quarter of a hectare. |
| front5 | cap5 among candidates with no clearing within about 9 km in the three years before. This is the new frontier, 5% to 11% of each year's clearing. |

A cell's area is `(cell * 110.57) * (cell * 111.32 * cos(latitude of the row centre))` km². Equal predictions are ordered by a fixed random permutation, so a constant map scores like chance.

A block bootstrap puts the noise on one year's cap5 near half a point. Treat a difference under one point on the four-year mean as unproven until it holds across seeds or resamples, and report the spread if you claim it.

The project's own experiment loop, `pipeline/lab.py`, uses the same definitions with two differences. It scores a fixed random quarter of the cells, and its label for auprc and auc is one hectare, so those two numbers do not compare with the scorer's. On prenuncio-3 the two agree within a point of cap5 in every year and within a tenth of a point on the four-year mean.

## The probability track

`benchmark/score_prob.py` scores maps of the probability that a cell loses at least one hectare in the PRODES year. The chances of year T may use outcomes up to T-1 only, so the scored years are 2024 and 2025, with 2026 reported apart. 2022 and 2023 are there to calibrate on.

| Score | What it asks |
|---|---|
| brier_skill | How much better than giving every cell the year's base rate. 0 is no skill, 1 is perfect. Events are rare (under 1% of cells), so values are small. |
| log_loss | The same question with a heavier penalty for confident misses. Lower is better. |
| count_ratio | Cells expected to lose a hectare over cells that did. 1 is right. |
| ece | The mean gap between the chance given and the share that happened, across ten bands of chance, as a share of the base rate. 0 is perfect. |

The chances of prenuncio-3 come from `pipeline/calibrate.py`, an isotonic map from its ranking score fitted on the two years before. They are the files `p2024.npz` to `p2026.npz` in the release `baseline-3`.

| | brier_skill | log_loss | count_ratio | ece |
|---|---|---|---|---|
| prenuncio-3, mean of 2024 and 2025 | 0.080 | 0.0233 | 0.995 | 0.094 |
| prenuncio-3, 2026 | 0.067 | 0.0172 | 1.056 | 0.075 |

## The files

```sh
python benchmark/score.py --fetch      # grid.json and truth_2022.npz to truth_2026.npz, 42 MB, into benchmark/data
python benchmark/score.py --selftest   # a synthetic case with a known answer
```

Each `truth_<year>.npz` holds four arrays of shape [5180, 6664].

| Array | Type | Meaning |
|---|---|---|
| `cleared` | uint16 | 10 m pixels of the cell, out of 2500, cleared in PRODES year `<year>` |
| `forest` | uint16 | pixels of the cell still forest on 31 July of year-1 |
| `inside` | uint8 | 1 inside the Legal Amazon |
| `near3` | uint8 | 1 if any clearing within about 9 km in the three years before |

`pipeline/benchdata.py` writes these files from INPE's PRODES raster. They are a derived work of PRODES and carry its licence, CC BY-SA 4.0 (see [benchmark/data/README.md](../benchmark/data/README.md)). The files are public, which is why the fitting cutoff exists. You can read the 2025 outcome today, and a model that forecasts 2025 must not.

A prediction is one file per year, `<year>.npy` or `<year>.npz` with the key `risk`, float16 or float32, shape [5180, 6664]. By convention the value is the expected km² cleared in the cell. Only the order matters for the scores. Cells outside the candidates are ignored. NaN in a candidate cell is an error. The maps are about 17 MB each as compressed float16 and do not go into git.

## A submission folder

`benchmark/submissions/<name>/` holds `meta.json`, `REPORT.md` and, once filled, `scores.json`. The folder name is the model's name on the leaderboard.

| Field of `meta.json` | Meaning |
|---|---|
| `kind` | `model`, or `reference` for a row where nothing is fitted |
| `summary` | one line, at most 100 characters |
| `superseded_by` | the folder of a newer version of the same model, when there is one |
| `authors`, `date` | the By and Date columns |
| `code` | repository, commit and licence |
| `weights` | optional link to the trained weights |
| `predictions` | written by `submission.py fill`: the link and sha256 of each map |
| `data_sources`, `compute`, `agents` | every input with its dates, the hardware and cost, and the agents used |

A reference row and a superseded version need three sections in the report: Method, How to reproduce and Agent disclosure. A superseded version links its successor's report for the rest. Every other submission needs all seven sections of the template.

Model code can stay in your repository. If you want it merged here, put it under `contrib/<name>/`.

## The live track

To register a forecast for PRODES year 2027, include `2027.npy` or `2027.npz` among your maps. The `fill` command records its sha256 in `meta.json`, and you add the entry's `information_cutoff`, the last date of any input.

- **Deadline.** The pull request, with the hash in it, must reach GitHub by 31 December 2026, 23:59 UTC. The time GitHub received the last commit that changed the hash is the registration time.
- **Frozen.** The hash in the merged pull request is the forecast. We download the file, check the hash and keep a copy as a release asset of this repository. You may replace your forecast until the deadline, and git keeps the earlier hashes. After the deadline it cannot change.
- **Standard cutoff.** The comparison everyone can join uses information up to 31 July 2026 plus whatever INPE has published of PRODES year 2026. A forecast that uses later information, such as DETER alerts from August 2026 on, is welcome and states its cutoff. Forecasts past the standard cutoff or the deadline are listed apart.
- **Scoring.** We score every registered forecast with this scorer when INPE publishes PRODES year 2027, first on the priority scenes (expected late in 2027) and again on the full map. Nobody can change a forecast in between, including us. Our own forecasts are registered the same way.
- **Next years.** Registration for PRODES year 2028 opens on 1 August 2027 and closes on 31 December 2027, and so on each year.

A live forecast needs the same report and open code as any submission. It does not need backtest years, although a method with both is easier to trust.

## How submissions are verified

On every pull request a workflow runs the scorer's self-test, validates the metadata and the report's sections, downloads the linked maps, checks each sha256 and scores them with the scorer from the main branch. It fails if `scores.json` disagrees. The workflow runs none of your model code and holds no secrets.

A maintainer then reads the report against the rules, above all the dates of the inputs, and sets the row's status. The statuses are defined in [benchmark/README.md](../benchmark/README.md). A submission that links no maps stays self-reported. Whether re-scored maps kept the rules rests on the report and the code.

Anyone can reproduce a submission and say so in an issue. Suspected leakage and disputes follow [GOVERNANCE.md](../GOVERNANCE.md).

## Versions

The version covers the grid, the truth files, the candidate rule and the score definitions. Any change that can move a score raises it. Old scores stay. Each `scores.json` records the version it was computed under, and the leaderboard of every past version is kept under `benchmark/archive/`. When we hold a submission's maps we re-score them under the new version.

Two changes are already expected. INPE will publish the full 2026 map during 2027, which replaces `truth_2026.npz`. PRODES year 2027 will be added when it exists.

## Where the practices come from

- [CASP](https://predictioncenter.org) and the [M competitions](https://en.wikipedia.org/wiki/Makridakis_Competitions): forecasts are filed before the outcome exists. This is the live track.
- [SWE-bench experiments](https://github.com/swe-bench/experiments): a submission is a pull request with a metadata file and a description, the large artifacts live in the submitter's own public storage, and a row gains a mark when the maintainers have checked it.
- [WeatherBench 2](https://weatherbench2.readthedocs.io/en/latest/submit.html): the evaluation code and the truth are public, and you may either send forecasts for the maintainers to score or score them yourself and share the code.
- [modded-nanogpt speedrun](https://github.com/KellerJordan/modded-nanogpt): fixed data, a short rule list, every record with its log, and enough runs to show that a gain is not noise.
- [ARC Prize](https://arcprize.org/policy): separate labels for checked and unchecked results, and open source as the condition for being checked.
- [Open Graph Benchmark](https://ogb.stanford.edu/docs/leader_rules/): written rules on what may be used for fitting and what only for testing.
- [LMArena](https://lmarena.ai/leaderboard): one ranked table, one row per model, a link to each.
