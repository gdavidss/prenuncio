# Prenúncio baseline: boosted trees blended with a U-Net

This is the forecast shown on prenuncio.com since 16 November 2026, submitted by the maintainers as the first row of the leaderboard. It replaces two earlier baselines whose maps remain in the releases `baseline-1` (15 November, 72.5% on cap5) and `baseline-2` (16 November, before clearing permits, 74.5%). `docs/RESULTS.md` and `docs/BENCH.md` hold the longer account.

The scores of every year are in [scores.json](scores.json) and in the [leaderboard](../../LEADERBOARD.md). `benchmark/score.py` computed them over every candidate cell. The project's lab scores the same maps on a fixed quarter of the cells and lands within a point of cap5 in every year.

## Method

Two models forecast the same thing, and the published map is their blend.

The first is gradient boosted trees (LightGBM, Tweedie loss with power 1.1, 400 rounds, 127 leaves, three fits averaged) on the 500 m grid. Each row is one forest cell on one forecast date, and the target is the share of the cell cleared in the following PRODES year. The inputs are the clearing history of the cell and of its neighbourhood at 3, 9, 25 and 75 km, distances to recent clearing and to the forest edge, DETER alerts, Hansen forest loss, GLAD Sentinel-2 alerts over five windows, the JRC Tropical Moist Forest first-disturbance year, clearing permits valid on the forecast date, AlphaEarth embeddings, fire detections, IBAMA records, tenure and location. To forecast year T the trees are fitted on target years 2015 to T-1. `pipeline/model.py` builds the features and fits.

The second is a U-Net that reads 25 km tiles at 100 m: the year each cell was cleared, land classes, tenure, Hansen, GLAD and JRC disturbance bit planes, and the embeddings repeated from 500 m. It predicts the cleared share of every 500 m cell. One network is trained on targets up to the year before the first test year, then fine-tuned with one more year of outcomes before each later forecast, so the network that forecasts year T has never seen T or any later year. `unet/train.py roll` does this.

The blend is a geometric mean of the two expected areas with equal weights (`pipeline/blendmaps.py`).

The U-Net was trained in half precision. In float16 the fine-tuning overflowed three times: the weights in front of each batch norm are free to grow, and one overflowing batch wrote itself into the running statistics. The maps for 2019 to 2021 come from the float16 stages, which finished cleanly. The maps for 2022 to 2027 come from a continuation of the 2021 checkpoint in bfloat16, which has the exponent range of full precision and dropped no batch.

## Inputs and their dates

`meta.json` lists every source with its version and licence. For a forecast of year T, dated 31 July of T-1:

- PRODES clearing up to year T-1. Clearing that INPE mapped late counts from the year it was first mapped, and the forest map for the forecast date still shows it as forest.
- DETER alerts, fire detections and IBAMA records dated up to July of T-1.
- Hansen loss up to calendar year T-2, because the loss of calendar year T-1 includes months after the forecast date.
- GLAD alerts in windows of one month to two years before 31 July of T-1, for T-1 from 2020 on. Before that the trees see a missing value.
- Clearing permits (SINAFLOR authorisations of vegetation suppression) issued up to 31 July of T-1 and still valid then, for T-1 from 2020 on. The register gives a property's centre point and the authorised area, so each permit enters as a disc of that area. Only dates, point and area are read; the file also holds holders' names and tax numbers.
- JRC first-disturbance years up to calendar year T-2, for the same reason as Hansen. Only the earlier of the degradation year and the deforestation year is used. Which of the two a disturbance is called depends on how long it lasted, which is knowledge from after the event.
- AlphaEarth embeddings of calendar years T-2 and T-3, for the same reason as Hansen. Google trained the embedding model on imagery of several years, later ones included, so its weights have seen imagery from after our cutoffs. Each year's embedding summarises that year's imagery only.
- Conservation units by creation year. Indigenous lands, municipalities and states as they are today.

The 2027 forecast uses the same code with inputs cut at 31 July 2026, and INPE's priority-scene polygons as the clearing of PRODES year 2026.

## How leakage was avoided

Every feature is a function of the forecast date, and the code that builds a year's table takes that date as its only time argument (`features` in `pipeline/model.py`, `batch` in `unet/train.py`). The trees for year T are fitted on tables of earlier target years only. The U-Net rule is described above.

What we chose by looking at 2019 to 2025: the tree settings, the inputs kept after ablation, the U-Net's width and input planes, and the blend weight (equal weights did best among 0.5, 0.65 and 0.8 on the U-Net). These choices are fitted to the benchmark years. 2026 is the holdout. It has now been scored for five blends on the way here, the first baseline included; none was chosen by it, and it should no longer be read as untouched. The 2027 forecast is registered in the live track.

Soft spots we know of:

- The PRODES, Hansen and IBAMA files are current releases. A past year's history is read as INPE, UMD and IBAMA record it today, and later revisions to those records are included.
- The Indigenous lands layer is a snapshot without dates.
- The AlphaEarth weights, as noted above.
- The permit file is today's snapshot of the register. Mato Grosso's permits reach it through an integration with the state agency, and we could not establish that each one was already public on its issue date. A rectified permit replaces the original.
- The JRC record is the 2025 release, reprocessed over the whole series. A pixel's first-disturbance year is read as that release has it.
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

- A second U-Net averaged with the first: no gain over the blend with the newer network alone.
- DETER fire-scar planes in the U-Net: 0.5 points alone, 0.2 blended. A loss weighted toward forest far from recent clearing: nothing.
- Flagging at the U-Net's own 100 m instead of 500 m cells: one point at equal flagged area (2021).
- Flagging the neighbours of flagged cells: worse than the model's own next-ranked cells.
- Correcting a year's forecast with the previous year's errors by distance, forest share, rank and state: 0.1 points, with the sign changing from year to year.
- Re-issuing the forecast with the DETER alerts of the season's first three months: two points, all of it from clearing already detected.

What helped: the 500 m grid, Hansen (removing it costs 1.5 points), GLAD (2.2 points), the embeddings (1.5 points in the trees), the JRC disturbance record (1.2 points in the trees, 2.0 in the U-Net), clearing permits (1.3 points in the trees on the lab, 0.4 to 1.0 in the production trees from 2022 on), and the blend. `docs/BENCH.md` has the anatomy of what is still missed.

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
python unet/glad.py wide                           # writes glad500wide.npz
scripts/fetch_tmf.sh && python unet/tmf.py         # JRC tiles, then tmf500.npz
```

The tree pipeline expects those outputs in `data/grid50`: the `loss` array of `hansen500.npz` saved as `data/grid50/hansen.npy` (uint16, [25, rows, cols]), `glad500.npz` copied to `data/grid50/glad.npz`, `glad500wide.npz` to `data/grid50/gladwide.npz`, `tmf500.npz` to `data/grid50/tmf.npz`, the permit file reduced to the columns issued, valid_until, lat, lon, ha as `data/grid50/asv.csv`, and `data/aef` linked as `data/grid50/aef`.

Trees, fitted on target years from 2015:

```sh
export AZ_F=50 AZ_X=hansen,glad,glad2,aef,tmf,asv AZ_TW=1.1 AZ_SEEDS=3 AZ_FIRST=2015 AZ_MAPS=1
python pipeline/model.py eval       # maps for the test years
python pipeline/model.py forecast   # maps for 2026 and 2027
```

U-Net. `unet/prep.py`, `unet/hansen.py 100`, `unet/glad.py 100` and `unet/tmf.py 100` write its 100 m arrays, `hb.npy`, `gb4.npy` and `tb.npy` among them, into `data/`. Every training command below ran with `UNET_AEF=<folder with emb_<year>.npy> UNET_GB4=1 UNET_TTA=1 UNET_WIDTH=48 UNET_PB=8 UNET_TMF=1`:

```sh
python unet/prep.py && python unet/hansen.py 100 && python unet/glad.py 100 && python unet/tmf.py 100
python unet/train.py roll 2019 2027 20000 4000     # float16; the maps for 2019 to 2021 come from this run
UNET_BF16=1 UNET_INIT=<checkpoint written with the 2021 forecast> python unet/train.py cont 2022 2027 4000   # the maps for 2022 to 2027
```

Starting again today, `UNET_BF16=1` on the first command would give the whole roll in one run.

Blend:

```sh
AZ_F=50 python pipeline/blendmaps.py "<unet folder>/roll_tmf_{y}.npy" 0.5 <tree map folders>
```

The gridding of Hansen, GLAD, the JRC record and the embeddings reads public cloud storage and takes most of the wall-clock time. This is the path the maintainers followed. Nobody has run it end to end on a clean machine yet, so this submission has the status "re-scored" and not "reproduced". A reproduction by someone outside the project would be a welcome first contribution.

## Compute and cost

One cloud machine with 16 vCPU, 64 GB of RAM and one NVIDIA L4 GPU (24 GB).

The published trees took about 4 hours on its CPUs. The published U-Net took about 5 GPU hours: the first stage, two yearly stages in float16, and six in bfloat16. That is about 12 machine hours and 14 US dollars for the published model, counting the tree run that was repeated with permits. Three U-Net runs lost to the float16 overflow cost another 4 hours.

All the experimentation behind `docs/BENCH.md` so far comes to roughly 44 machine hours, about 50 US dollars.

## Agent disclosure

AI coding agents (Claude Code, from Anthropic) wrote most of the pipeline, ran the experiments recorded in `docs/BENCH.md` and drafted this report. The maintainer set the goals, decided what to try and what to publish, and read the results. The scores in this report come from `benchmark/score.py` run on the published maps.
