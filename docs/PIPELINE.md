# Rebuilding the forecast and the site

The commands that take the public raw data to the maps on prenuncio.com, and the faster loop used to try a new idea. Nothing here needs an account or a key.

## Requirements

Python 3.13 with numpy, pandas, pyarrow, lightgbm, scikit-learn, rasterio, geopandas, pyogrio, shapely and scipy. The U-Net needs PyTorch and a GPU. The scorer in `benchmark/` needs numpy and scikit-learn only.

## The whole pipeline

```sh
scripts/fetch.sh                        # about 4 GB of INPE, IBAMA and NOAA data into data/raw
python pipeline/grid.py                 # PRODES 10 m raster to the 1 km grid
python pipeline/layers.py               # tenure, DETER, fire and IBAMA records onto the grid
python pipeline/quantity.py             # how much: the yearly total, with its backtest
python pipeline/model.py eval           # where: rolling-origin backtest
python pipeline/model.py forecast       # final model, the 2026 check, the 2027 map
python pipeline/horizons.py eval        # 3 and 6 month clearing, 12 month fire scars
python pipeline/horizons.py forecast
python pipeline/export.py               # writes web/data
python pipeline/regions.py              # sector shapes and numbers; run after every export
python pipeline/monthly.py              # the next 12 months of each hazard, with its backtest
python3 -m http.server 8878 -d web      # open http://localhost:8878
node test/sectors.mjs                   # drives the site with real mouse events
```

`AZ_F=50` in front of a pipeline step runs it on the 500 m grid, with its own folders `data/grid50` and `data/model50`. `AZ_X=hansen,glad,aef` adds the finer inputs, which need the gridded files that `unet/hansen.py`, `unet/glad.py` and `unet/aef.py` write from public cloud storage. The published annual map now uses surveil-prenuncio-1. Its source, inputs and scores are described in [its report](../benchmark/submissions/surveil-prenuncio-1/REPORT.md).

## Deploying the SURVEIL maps

Download the six ranking maps from the `surveil-prenuncio-1` release into a local folder, then run these commands from the repository root. The adoption step verifies each submitted hash and the flagged cells against the published cap5 scores. The national annual amount continues to come from the quantity model. Forecasts before 2022 retain their earlier model, recorded per year in `meta.json`.

```sh
python pipeline/adopt_submission.py surveil-prenuncio-1 /path/to/maps
python pipeline/adopt.py data/adopted/surveil-prenuncio-1/risk1km.npz
python pipeline/export.py
python pipeline/regions.py
python pipeline/calibrate.py /path/to/maps --model surveil-prenuncio-1 --prob-output data/adopted/surveil-prenuncio-1/prob
python pipeline/priority.py
python pipeline/lowres.py
python pipeline/story.py
python pipeline/api.py
cp web/api/v1/llms.txt web/llms.txt
python test/forecast.py /path/to/maps
```

The 2027 isotonic calibration uses 2024 and 2025 outcomes. Validation probabilities for 2024–2026 each use earlier outcomes. Display probabilities for 2022 and 2023 are retrospectively calibrated on 2024–2025 and are excluded from probability validation. `prob.json` records the fitting years, thresholds and probability-file hashes. Publish the generated API mirror and deploy `web/` together with its regenerated data.

## The fast loop

Rebuilding features for every experiment is slow. `pipeline/lab.py` caches the feature tables once and then scores an idea in minutes, on a fixed random quarter of the cells. Its cap5 tracks the benchmark's within a point.

```sh
AZ_F=50 python pipeline/grid.py
AZ_F=50 python pipeline/layers.py
AZ_F=50 AZ_YEARS=2011,2012,2013,2014,2015,2016,2017,2018,2019,2020,2021,2022,2023,2024,2025 \
  python pipeline/model.py cache                   # feature tables into data/cache50, once

python pipeline/lab.py run base                    # the tree baseline on the cached tables
python pipeline/lab.py run mine num_leaves=255 seeds=3 drop=fire+embargo   # any LightGBM parameter, dropped feature groups
python pipeline/lab.py noise mine base             # is `mine` better than `base`, by block bootstrap
python pipeline/lab.py blend both mine other 0.5   # geometric blend of two saved runs
python pipeline/lab.py board                       # every run so far
```

The header of `pipeline/lab.py` documents every command, including `addmap` (use a full-grid map as an extra input) and `frommap` (score full-grid maps from any model, such as a neural network).

- `features()` in `pipeline/model.py` computes every tree input, with the forecast date as its time argument. Add an input there, or as an extra column through `pipeline/extras.py`.
- `unet/train.py` is the convolutional model.
- The lab predicts the sampled cells only. A submission needs maps over the full grid. `AZ_MAPS=1` with `pipeline/model.py eval` writes them for the trees.
- A prebuilt feature cache is not published yet.
- [LAB.md](LAB.md) lists what has been tried, so read it before repeating an experiment.

## What each folder does

- `pipeline/` holds the yearly map (`model.py`), the yearly total (`quantity.py`), the shorter windows and the other hazards (`horizons.py`), the monthly totals (`monthly.py`), the calibrated chance of every cell (`calibrate.py`) and the benchmark's truth files (`benchdata.py`). `extras.py` and `tenure.py` build candidate inputs for the lab.
- `pipeline/api.py` writes the public API, static JSON under `web/api/v1`. It is generated and not in git.
- `unet/` holds the convolutional model and the scripts that grid Hansen forest loss, GLAD alerts, the JRC disturbance record, AlphaEarth embeddings and DETER for both parts of the model.
- `web/` is the site. `web/data` is generated and not in git. Only this folder is ever deployed.
- `scripts/fetch.sh` downloads the raw inputs.

`data/` is not in git. `data/raw` holds IBAMA files with the names and tax numbers of people fined. The pipeline reads place, date, area and status from them and nothing else. Never commit or upload that folder.

## Links into the site

Links carry state. `#y=2023` replays a year. `#k=clear3` or `clear6` is the monthly clearing view with that window ahead, `#k=scar12` is fire, and any other hazard uses its own layer name (add `t=months` for the monthly view). `#m=cells` paints cells instead of sectors. `#s=uf` (or `mun`, `ti`, `uc`) picks the kind of sector and `#r=<id>` selects one. `#l=pt` sets the language and `#about` opens the About text.
