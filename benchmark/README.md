# The Prenúncio open benchmark

A public test for models that forecast where the Brazilian Legal Amazon will be cleared in the next PRODES year. Anyone can submit a model. Every submission shows its code, its method and a written report, and a script builds the leaderboard from the scores.

The current table is in [LEADERBOARD.md](LEADERBOARD.md). The benchmark is at version 1.0.

## The task

A PRODES year T runs from 1 August of T-1 to 31 July of T. On 31 July of T-1, give every 500 m cell of the Legal Amazon a number that ranks it by how much of it will be cleared during year T. The outcome is INPE's PRODES map for year T.

The grid has 5180 rows and 6664 columns of 0.0045 degrees, with row 0 in the north. `data/grid.json` holds its corner. A cell is scored when it lies inside the Legal Amazon and at least 1% of it was forest on the forecast date. That leaves about 14 million candidate cells a year.

## Two tracks

**Backtest.** Years 2022, 2023, 2024 and 2025. The leaderboard ranks submissions by the mean over these four. 2026 is scored too and shown apart, because INPE has published it for its priority scenes only (3,439 km² on this grid).

**Live.** A forecast for PRODES year 2027 (August 2026 to July 2027), registered now and scored when INPE publishes the map. Past PRODES years are public, so a backtest score depends on the authors keeping the rules. The 2027 outcome does not exist yet, and nobody can leak it. Treat the live track as the test that counts.

## The rules

1. **Information cutoff.** A forecast for year T may use only information that existed on 31 July of T-1. The PRODES map of year T-1 counts, although INPE releases it some months later, because it records clearing up to that date.
2. **Fitting cutoff.** A model that forecasts year T is fitted and tuned only on outcomes from years before T. One procedure produces every year's map. If anything differs between years, the report says what.
3. **Public, dated inputs.** Every input is public, free to download, and carries dates that let a reader check rule 1. Name each source, its version and the last date you used.
4. **Open code.** The code that made the maps is public under an open-source licence, at a stated commit.
5. **A written report.** Each submission has a `REPORT.md` that follows the template: method, inputs and dates, how leakage was avoided, what was tried and failed, how to reproduce, compute and cost, agent disclosure.
6. **AI agents are welcome.** Building a submission with coding agents or research agents is encouraged. Say which agent and model, what it did and what a person checked. An agent-built submission is ranked like any other.
7. **Pretrained models.** Public pretrained models and embeddings are allowed. Say what they were trained on and through which date. Weights trained on imagery from after the cutoff are a soft leak: allowed, and disclosed.

Leaks we have met or avoided, so you can check for them:

- A calendar-year product (Hansen loss, annual embeddings) for year t includes months after 31 July of t. A forecast dated 31 July of t uses year t-1 and earlier.
- A snapshot of today (OpenStreetMap roads, a property registry, a list of protected areas) shows things built after the clearing it seems to predict. Use dated versions, or creation dates.
- PRODES maps some clearing late, under cloud. Late-mapped clearing belongs to the year INPE first mapped it, and the forest map for a forecast date must still show it as forest.
- DETER dates are detection dates. Alerts detected after 31 July are after the cutoff even when the clearing happened before.
- Choosing a model, a blend weight or a threshold by its 2022 to 2025 score is fitting on the test years. Everyone does some of it on a public benchmark, including us. Say what you chose that way. The live track is the remedy.

## The scores

`score.py` computes them for each year, over every candidate cell.

| Score | What it asks |
|---|---|
| cap5 | Flag the 5% of candidate cells with the highest prediction. What share of the year's clearing, in km², is inside them? The leaderboard sorts by this. |
| cap1, cap10 | The same at 1% and 10%. |
| capf5 | The same budget counted in forest. Take cells in order of prediction per km² of forest until they hold 5% of the candidates' forest. |
| auprc, auc | Precision-recall and ROC area for the label "at least 25 of the cell's 2500 pixels were cleared", a quarter of a hectare. |
| front5 | cap5 among candidates with no clearing within about 9 km in the three years before. This is the new frontier, 5% to 11% of each year's clearing. |

A cell's area is `(cell * 110.57) * (cell * 111.32 * cos(latitude of the row centre))` km². Equal predictions are ordered by a fixed random permutation, so a constant map scores like chance.

These definitions follow `score` in `pipeline/lab.py`, the project's internal lab, with two differences. The lab scores a fixed random quarter of the cells and this scorer uses all of them. The lab's label for auprc and auc is one hectare and here it is a quarter of a hectare, so those two numbers do not compare across the two. On the published model the lab and this scorer agree within a point of cap5 in every year and within a tenth of a point on the four-year mean.

The lab's block bootstrap puts the noise on one year's cap5 near half a point. Treat a difference under one point on the four-year mean as unproven until it holds across seeds or resamples, and report the spread if you claim it.

### The probability track

A ranking says where to look first. A decision needs a number: how likely is this cell to be cleared? `benchmark/score_prob.py` scores maps of that chance, the probability that a cell loses at least one hectare in the PRODES year. The chances of year T may use outcomes up to T-1 only, so the scored years are 2024 and 2025, with 2026 reported apart; 2022 and 2023 are there to calibrate on.

| Score | What it asks |
|---|---|
| brier_skill | How much better than giving every cell the year's base rate. 0 is no skill, 1 is perfect. Events are rare (under 1% of cells), so values are small. |
| log_loss | The same question with a heavier penalty for confident misses. Lower is better. |
| count_ratio | Cells expected to lose a hectare over cells that did. 1 is right. |
| ece | The mean gap between the chance given and the share that happened, across ten bands of chance, as a share of the base rate. 0 is perfect. |

The baseline's chances come from `pipeline/calibrate.py`, an isotonic map from its ranking score fitted on the two years before. They are the files `p2024.npz` to `p2026.npz` in the release `baseline-3`.

| | brier_skill | log_loss | count_ratio | ece |
|---|---|---|---|---|
| Baseline, mean of 2024 and 2025 | 0.080 | 0.0233 | 0.995 | 0.094 |
| Baseline, 2026 | 0.067 | 0.0172 | 1.056 | 0.075 |

This track is not on the leaderboard yet. Report its scores in your submission's REPORT.md if you have them.

## The files

```sh
python benchmark/score.py --fetch      # grid.json and truth_2022.npz to truth_2026.npz, 42 MB, into benchmark/data
python benchmark/score.py --selftest   # a synthetic case with a known answer
```

Each `truth_<year>.npz` holds four arrays of shape [5180, 6664]:

| Array | Type | Meaning |
|---|---|---|
| `cleared` | uint16 | 10 m pixels of the cell, out of 2500, cleared in PRODES year `<year>` |
| `forest` | uint16 | pixels of the cell still forest on 31 July of year-1 |
| `inside` | uint8 | 1 inside the Legal Amazon |
| `near3` | uint8 | 1 if any clearing within about 9 km in the three years before |

`pipeline/benchdata.py` writes these files from INPE's PRODES raster. They are a derived work of PRODES and carry its licence, CC BY-SA 4.0 (see [data/README.md](data/README.md)). The files are public, which is why rule 2 exists: you can read the 2025 outcome today, and a model that forecasts 2025 must not.

A prediction is one file per year, `<year>.npy` or `<year>.npz` with the key `risk`, float16 or float32, shape [5180, 6664]. By convention the value is the expected km² cleared in the cell. Only the order matters for the scores. Cells outside the candidates are ignored. NaN in a candidate cell is an error.

## How to submit

1. Build your model anywhere: a fork of this repository or your own. [AGENTS.md](../AGENTS.md) describes the fast path through this codebase.
2. Write a map for each of 2022, 2023, 2024 and 2025. Add 2026 and 2027 if you can.
3. Score them: `python benchmark/score.py my_maps/`.
4. Upload the maps somewhere public and lasting: a release in your GitHub repository, Zenodo or Hugging Face. They are about 17 MB each as compressed float16 and do not go into git.
5. Copy `benchmark/submissions/_template` to `benchmark/submissions/<your-name>` and fill in `meta.json` and `REPORT.md`.
6. Run `python benchmark/submission.py fill <your-name> my_maps/ --url-base <where the maps are>`. It writes `scores.json` and puts each file's sha256 into `meta.json`. Then run `python benchmark/submission.py check <your-name>`.
7. Open a pull request with that folder. Leave `LEADERBOARD.md` alone; a maintainer rebuilds it.

Model code can stay in your repository. If you want it merged here, put it under `contrib/<your-name>/` in the same pull request or a later one. See [CONTRIBUTING.md](../CONTRIBUTING.md).

By submitting you agree that the folder you add is published here under CC BY 4.0.

## The live track

To register a forecast for PRODES year 2027, include `2027.npy` or `2027.npz` among your maps. The `fill` command records its sha256 in `meta.json`, and you add the entry's `information_cutoff`, the last date of any input.

- **Deadline.** The pull request, with the hash in it, must reach GitHub by 31 December 2026, 23:59 UTC. The time GitHub received the last commit that changed the hash is the registration time.
- **Frozen.** The hash in the merged pull request is the forecast. We download the file, check the hash and keep a copy as a release asset of this repository. You may replace your forecast until the deadline, and git keeps the earlier hashes. After the deadline it cannot change.
- **Standard cutoff.** The comparison everyone can join uses information up to 31 July 2026 plus whatever INPE has published of PRODES year 2026. A forecast that uses later information, such as DETER alerts from August 2026 on, is welcome and states its cutoff. The table shows the cutoff and the registration date of every forecast, and forecasts past the standard cutoff or the deadline are listed apart.
- **Scoring.** We score every registered forecast with this scorer when INPE publishes PRODES year 2027, first on the priority scenes (expected late in 2027) and again on the full map. Nobody can change a forecast in between, including us. Our own forecast is registered the same way.
- **Next years.** Registration for PRODES year 2028 opens on 1 August 2027 and closes on 31 December 2027, and so on each year.

A live forecast needs the same report and open code as any submission. It does not need backtest years, although a method with both is easier to trust.

## How submissions are verified

On every pull request a workflow runs the scorer's self-test, validates the metadata and the report's sections, downloads the linked maps, checks each sha256 and scores them with the scorer from the main branch. It fails if `scores.json` disagrees. The workflow runs none of your model code and holds no secrets.

A maintainer then reads the report against the rules, above all the dates of the inputs. Each row carries a status:

- **self-reported**: the authors ran the scorer and nobody else has checked the numbers. A submission that links no maps stays here.
- **re-scored**: the maintainers or the workflow downloaded the maps, matched the hashes and ran the scorer. The numbers are right for those maps. Whether the maps kept the rules rests on the report and the code.
- **reproduced**: someone other than the authors ran the code from the stated commit and got maps that score within half a point of cap5 on the four-year mean.

Anyone can reproduce a submission and say so in an issue. Suspected leakage and disputes follow [GOVERNANCE.md](../GOVERNANCE.md).

## Versions

The version covers the grid, the truth files, the candidate rule and the score definitions. Any change that can move a score raises it. Old scores stay: each `scores.json` records the version it was computed under, and the leaderboard of every past version is kept under `benchmark/archive/`. When we hold a submission's maps we re-score them under the new version.

Two changes are already expected. INPE will publish the full 2026 map during 2027, which replaces `truth_2026.npz`. PRODES year 2027 will be added when it exists.

## Where the practices come from

- [CASP](https://predictioncenter.org) and the [M competitions](https://en.wikipedia.org/wiki/Makridakis_Competitions): forecasts are filed before the outcome exists. This is the live track.
- [SWE-bench experiments](https://github.com/swe-bench/experiments): a submission is a pull request with a metadata file and a description, the large artifacts live in the submitter's own public storage, and a row gains a mark when the maintainers have checked it.
- [WeatherBench 2](https://weatherbench2.readthedocs.io/en/latest/submit.html): the evaluation code and the truth are public, and you may either send forecasts for the maintainers to score or score them yourself and share the code.
- [modded-nanogpt speedrun](https://github.com/KellerJordan/modded-nanogpt): fixed data, a short rule list, every record with its log, and enough runs to show that a gain is not noise.
- [ARC Prize](https://arcprize.org/policy): separate labels for checked and unchecked results, and open source as the condition for being checked.
- [Open Graph Benchmark](https://ogb.stanford.edu/docs/leader_rules/): written rules on what may be used for fitting and what only for testing.
