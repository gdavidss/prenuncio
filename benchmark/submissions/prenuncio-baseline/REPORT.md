# Prenúncio baseline: boosted trees blended with a U-Net

This is the forecast shown on prenuncio.com on 15 November 2026, submitted by the maintainers as the first row of the leaderboard. `docs/RESULTS.md` and `docs/BENCH.md` hold the longer account.

The scores of every year are in [scores.json](scores.json) and in the [leaderboard](../../LEADERBOARD.md). `benchmark/score.py` computed them over every candidate cell. The project's lab scores the same maps on a fixed quarter of the cells and lands within a point of cap5 in every year.

## Method

Two models forecast the same thing, and the published map is their blend.

The first is gradient boosted trees (LightGBM, Tweedie loss with power 1.3, 400 rounds, 127 leaves) on the 500 m grid. Each row is one forest cell on one forecast date, and the target is the share of the cell cleared in the following PRODES year. The inputs are the clearing history of the cell and of its neighbourhood at 3, 9, 25 and 75 km, distances to recent clearing and to the forest edge, DETER alerts, Hansen forest loss, GLAD Sentinel-2 alerts, AlphaEarth embeddings, fire detections, IBAMA records, tenure and location. To forecast year T the trees are fitted on target years 2015 to T-1. `pipeline/model.py` builds the features and fits.

The second is a U-Net that reads 25 km tiles at 100 m: the year each cell was cleared, land classes, tenure, Hansen and GLAD bit planes, and the embeddings repeated from 500 m. It predicts the cleared share of every 500 m cell. One network is trained on targets up to the year before the first test year, then fine-tuned with one more year of outcomes before each later forecast, so the network that forecasts year T has never seen T or any later year. `unet/train.py roll` does this.

The blend is a weighted geometric mean of the two expected areas, with weight 0.4 on the trees and 0.6 on the U-Net (`pipeline/blendmaps.py`).

The U-Net run became numerically unstable at its 2025 step. The maps for 2025, 2026 and 2027 come from a second network trained from scratch on outcomes up to 2024 and fine-tuned a year at a time under the same rule.

## Inputs and their dates

`meta.json` lists every source with its version and licence. For a forecast of year T, dated 31 July of T-1:

- PRODES clearing up to year T-1. Clearing that INPE mapped late counts from the year it was first mapped, and the forest map for the forecast date still shows it as forest.
- DETER alerts, fire detections and IBAMA records dated up to July of T-1.
- Hansen loss up to calendar year T-2, because the loss of calendar year T-1 includes months after the forecast date.
- GLAD alerts in the 12 and 3 months before 31 July of T-1, for T-1 from 2020 on. Before that the trees see a missing value.
- AlphaEarth embeddings of calendar years T-2 and T-3, for the same reason as Hansen. Google trained the embedding model on imagery of several years, later ones included, so its weights have seen imagery from after our cutoffs. Each year's embedding summarises that year's imagery only.
- Conservation units by creation year. Indigenous lands, municipalities and states as they are today.

The 2027 forecast uses the same code with inputs cut at 31 July 2026, and INPE's priority-scene polygons as the clearing of PRODES year 2026.

## How leakage was avoided

Every feature is a function of the forecast date, and the code that builds a year's table takes that date as its only time argument (`features` in `pipeline/model.py`, `batch` in `unet/train.py`). The trees for year T are fitted on tables of earlier target years only. The U-Net rule is described above.

What we chose by looking at 2022 to 2025: the tree settings, the inputs kept after ablation, the U-Net's width and input planes, and the blend weight. These choices are fitted to the benchmark years. 2026 was held out and scored once for this blend, and the 2027 forecast is registered in the live track.

Soft spots we know of:

- The PRODES, Hansen and IBAMA files are current releases. A past year's history is read as INPE, UMD and IBAMA record it today, and later revisions to those records are included.
- The Indigenous lands layer is a snapshot without dates.
- The AlphaEarth weights, as noted above.
- The 2026 outcome covers priority scenes only, so the 2026 scores and the last year of history behind the 2027 forecast are partial.

## What was tried and failed

Numbers are means of cap5 over 2022 to 2025 on the lab's quarter sample, from `docs/BENCH.md`, against a tree baseline of 69.5%.

- Public-forest tenure from the CNFP registry: 69.4%. Nothing for placement.
- Older-clearing lags: 69.4%. Recent years weighted up: 69.3%. Training on 2017 onward only: 69.3%.
- A flatter Tweedie loss (power 1.1): 70.0%, not distinguishable from the baseline by bootstrap.
- A binary objective: 65.8%, the worst row.
- Feeding the U-Net forecast to the trees as an input: 70.9%, below blending the two.
- Directional context and four times more boosting rounds gave no gain in the earlier 1 km tests (`docs/RESULTS.md`).
- Fire detections and IBAMA enforcement records add nothing to placement beyond clearing history.

What helped: the 500 m grid, Hansen (removing it costs 1.5 points), GLAD (2.2 points), the embeddings (1.5 points in the trees), and the blend (0.5 to 3.9 points over the trees in every year).

## How to reproduce

With Python 3.13 and the packages named in the README, on a machine with a GPU for the U-Net steps.

Inputs on the 500 m grid:

```sh
scripts/fetch.sh                                   # INPE, IBAMA and NOAA inputs
AZ_F=50 python pipeline/grid.py                    # PRODES raster to the 500 m grid
AZ_F=50 python pipeline/layers.py                  # alerts, fire, enforcement and tenure on the grid
python unet/hansen.py                              # writes hansen500.npz
python unet/glad.py                                # writes glad500.npz
python unet/aef.py 2018 2019 2020 2021 2022 2023 2024 2025   # writes data/aef/emb_<year>.npy
```

The tree pipeline expects those three outputs in `data/grid50`: the `loss` array of `hansen500.npz` saved as `data/grid50/hansen.npy` (uint16, [25, rows, cols]), `glad500.npz` copied to `data/grid50/glad.npz`, and `data/aef` linked as `data/grid50/aef`.

Trees, fitted on target years from 2015:

```sh
AZ_F=50 AZ_X=hansen,glad,aef AZ_FIRST=2015 AZ_MAPS=1 python pipeline/model.py eval       # maps for the test years
AZ_F=50 AZ_X=hansen,glad,aef AZ_FIRST=2015 AZ_MAPS=1 python pipeline/model.py forecast   # maps for 2026 and 2027
```

U-Net. `unet/prep.py`, `unet/hansen.py 100` and `unet/glad.py 100` write its 100 m arrays, `hb.npy` and `gb4.npy` among them, into `data/`. Every training command below ran with `UNET_AEF=<folder with emb_<year>.npy> UNET_GB4=1 UNET_TTA=1 UNET_WIDTH=48 UNET_PB=8`:

```sh
python unet/prep.py && python unet/hansen.py 100 && python unet/glad.py 100
python unet/train.py roll 2019 2027 20000 4000     # the maps for 2019 to 2024 come from this run
python unet/train.py roll 2025 2027 16000 3000     # a second network from scratch: the maps for 2025 and 2026
UNET_INIT=<checkpoint written with the 2026 forecast> python unet/train.py ft 2026 2027 2000   # the map for 2027
```

Blend:

```sh
AZ_F=50 python pipeline/blendmaps.py "<unet folder>/roll_aefp_{y}.npy" 0.6 <tree map folders>
```

The gridding of Hansen, GLAD and the embeddings reads public cloud storage and takes most of the wall-clock time. This is the path the maintainers followed. Nobody has run it end to end on a clean machine yet, so this submission has the status "re-scored" and not "reproduced". A reproduction by someone outside the project would be a welcome first contribution.

## Compute and cost

One cloud machine with 16 vCPU, 64 GB of RAM and one NVIDIA L4 GPU (24 GB).

The published trees took about 2 hours on its CPUs, in three processes. The published U-Net took about 7.5 GPU hours in total: the rolling run for 2019 to 2024, then the second network from scratch for 2025 to 2027. That is 9.5 machine hours and about 11 US dollars for the published model.

All the experimentation behind `docs/BENCH.md` so far comes to roughly 30 machine hours, about 35 US dollars.

## Agent disclosure

AI coding agents (Claude Code, from Anthropic) wrote most of the pipeline, ran the experiments recorded in `docs/BENCH.md` and drafted this report. The maintainer set the goals, decided what to try and what to publish, and read the results. The scores in this report come from `benchmark/score.py` run on the published maps.
