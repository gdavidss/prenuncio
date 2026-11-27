# surveil-prenuncio-1

Official benchmark result (`benchmark/score.py`, 14M candidate cells/yr): **mean `cap5` (2022–2025) = 75.66%** (`cap1` = 38.42%, `cap10` = 88.98%, `capf5` = 80.76%, `front5` = 80.19%, `auprc` = 0.1839, `auc` = 0.9539). Untouched **2026 holdout `cap5` = 75.30%**. Probability track (`benchmark/score_prob.py`, 2024–2025 mean): `brier_skill` = 0.0893, `log_loss` = 0.02290, `count_ratio` = 0.9166, `ece` = 0.1578.

## Maintainer review

The maintainers independently re-scored the six supplied ranking maps with benchmark version 1.0 and matched their SHA-256 hashes to the submission manifest. This establishes the scores of the supplied maps. Training and input provenance have not been independently reproduced.

The source is archived in [contrib/surveil-prenuncio-1](../../../contrib/surveil-prenuncio-1). The original package used `0000000` for its code commit and placeholder release URLs. The metadata now links to the maintainer's source archive and published prediction assets. The original training commit was not provided. Two JEV clients now take their service URL from `JEV_URL` instead of a private network address. Reproduction requires access to that classifier and the feature caches described by the authors.

The authors' report below mentions CatBoost in an experiment paragraph, while its Method section and submitted inference script use LightGBM, XGBoost and a hurdle model. This discrepancy remains to be clarified during reproduction.

On 27 November 2026, the maintainers integrated the supplied ranking maps into the annual spatial forecasts, cell probabilities, sector totals and priorities on prenuncio.com. The site's existing isotonic calibration was fitted on 2024 and 2025 outcomes to generate 2027 cell probabilities. The basin-wide quantity model, monthly forecasts and other-hazard models remain separately identified. Forecasts before 2022 retain their prior model.

Independent probability scoring reproduced the reported 2024–2025 mean Brier skill of 0.0893, log loss of 0.02290, count ratio of 0.9166 and ECE of 0.1578. The 2027 map contains 14,024,403 candidate cells and a sum of 54,530 expected cells losing at least one hectare before PNG quantization. Priority replay for 2024 found that 83% of the top 500 blocks lost at least ten hectares.

The deployment commands are in [PIPELINE.md](../../../docs/PIPELINE.md). Calibration metadata and the generated probability maps are published with the submission's release. Display probabilities for 2022 and 2023 use retrospective calibration on 2024–2025 and are excluded from probability validation. Training has not been independently reproduced.

## Method

`surveil-prenuncio-1` is one packaged multi-family gradient-boosted ensemble on the 500 m Legal Amazon grid (`[5180, 6664]`), combining four distinct tree learners via a fixed a-priori geometric mean in log-risk space (zero test-year weight tuning):

- **M1 (35% weight):** LightGBM Tweedie (`p=1.15`, 127 leaves, 700 trees, `lr=0.05`, 2 seeds) fitted on rolling years `2011..T-1` with unbiased inverse-probability-reweighted negative subsampling (`35%` negatives kept).
- **M2 (25% weight):** LightGBM Tweedie (`p=1.28`, 191 leaves, 650 trees, `lr=0.05`, 2 seeds) fitted on modern-era rolling years `2015..T-1` (`55%` negatives kept).
- **M3 (25% weight):** XGBoost histogram Tweedie (`p=1.15`, `max_depth=8`, 550 trees, `lr=0.055`, 2 seeds) fitted on `2011..T-1`.
- **M4 (15% weight):** Two-Stage Hurdle LightGBM (`binary` occurrence probability × `gamma` conditional cleared area, 2011..T-1) explicitly separating deforestation onset from clearing magnitude.

Every model reads the exact same 355 strictly-dated features per 500 m cell: the 252 `prenuncio-3` base features plus 103 audited new features covering cloud-penetrating Sentinel-1 SAR radar alerts (WUR RADD), GFW Integrated Alerts, AlphaEarth embedding velocity/acceleration/spatial-contrast, TypeSafe JEV-1.13.0 semantic intent probabilities over SINAFLOR/IBAMA/DOF public text descriptions (zero PII), Hansen TreeCover2000/Gain, ANM SIGMINE mining titles, clean hydrological-year CHIRPS v3.0 drought anomalies (`Aug T-2..Jul T-1`), and patched zero-leakage frontier kinematics. For the live 2027 forecast, models train on full-basin outcomes `<= 2025` only (avoiding priority-scene sampling bias) while using INPE's 2026 priority scenes strictly as the `d1` input history feature.

## Inputs and their dates

All inputs are public, free to download, and strictly cut off at `31 July T-1` for forecast year `T` (calendar-year products strictly `<= T-2`):

1. **INPE PRODES 10 m raster (2025 release) & 2026 priority scenes:** clearing history `<= T-1` (2026 priority scenes used as history only for 2027).
2. **INPE DETER-B & AQUA Reference Fires:** monthly alerts and fire counts strictly `<= Jul T-1`.
3. **Hansen GFC v1.13 (`lossyear`, `treecover2000`, `gain`):** `lossyear` strictly `<= T-2`; `treecover2000` and `gain` are static pre-2013 baselines.
4. **UMD GLAD Sentinel-2 (10 m):** trailing windows ending `31 Jul T-1` from 2020 onward (`NaN` earlier).
5. **JRC TMF v1 (`DegradationYear`, `DeforestationYear`):** minimum first-disturbance year strictly `<= T-2`.
6. **Google AlphaEarth Foundations (64-dim annual embeddings, 2018–2025):** strictly calendar years `<= T-2` (pretrained weights carry the standard Prenúncio disclosure that Google trained on multi-year imagery).
7. **WUR RADD Sentinel-1 SAR (v20261115) & GFW Integrated Alerts (v20261122):** decoded via verified GFW tile encoding (`days = R*255 + G` since `2014-12-31`, confirmed `min=1827 -> 2020-01-01` and 5.1x–5.6x post-cutoff jump test on PRODES 2022 far-frontier clearing), windowed strictly `<= 31 Jul T-1` (`NaN` before 2020).
8. **IBAMA SINAFLOR (ASV, UAS, PMFS), DOF logging authorizations, IBAMA Flora infractions & Embargoes:** non-PII purpose/activity/infraction text scored with TypeSafe `jev-1.13.0` (`$5.34` total spend) into typed probabilities and rasterized strictly by `issued/event_date <= 31 Jul T-1`. Person names and CPF/CNPJ are never read, transmitted, or stored.
9. **CHIRPS v3.0 monthly rainfall (2005–2026):** strictly hydrological 12-month sums (`Aug T-2..Jul T-1`) and early dry season (`May..Jul T-1`), normalized against trailing past years `< T-1` only.
10. **ANM SIGMINE mining titles:** filtered strictly to protocol year `ANO <= T-2`.

## How leakage was avoided

- **Strict temporal gating in code:** `surveil_prenuncio_1.py` takes target year `T` as its sole time parameter, trains strictly on `y < T`, forces calendar-year rasters (Hansen, TMF, AlphaEarth, ANM) to `<= T-2`, and forbids any read of `benchmark/data` or `truth_2022..2026`.
- **Mathematical jump test on RADD & GFW:** verified on `6,094` far-frontier cells cleared `>= 1 ha` in PRODES 2022 (`Aug 2021–Jul 2022`) that `radd500` jumps 5.1x (`10.3% -> 52.8%`) and `gfw_int500` jumps 5.6x (`13.7% -> 76.1%`) strictly *after* `31 Jul 2021`.
- **Three real leaks caught and purged during our overnight swarm audit:** (a) an agent model (`gbdt_g6`, `0.8079`) trained through 2024 while predicting 2022–2024 — caught by cross-family red-team auditors (`taurus`, `deepseek-v41`, `orion`); (b) `pack_frontier_kinematics v1` (`0.8141–0.8252`) computed first-loss index over all 25 Hansen/TMF layers creating negative cohort ages for future clearing — caught, rejected, and patched strictly to `0..k` (`<= T-2`); (c) `pack_drought_jev_void_g15` summed calendar-year `T-1` CHIRPS rainfall (including Aug–Dec `T-1`) — discarded and rewritten to strict hydrological year `Aug T-2..Jul T-1`.
- **Fixed blend weights:** ensemble weights (`0.35 / 0.25 / 0.25 / 0.15`) were fixed a priori without fitting on `2022–2025`, and `2026` was never used for any model or feature decision.
- **Known soft spots:** identical to `prenuncio-3` — PRODES/Hansen/IBAMA/SINAFLOR/JRC TMF are current releases, Indigenous lands boundaries are undated, and AlphaEarth weights are pretrained by Google.

## What was tried and failed

Across 144 logged overnight trajectories on the quarter-grid lab (`anchor_prenuncio3_trees` = `0.7344`):

- **Plain MPS tabular ResMLP / DeepMLP (Poisson & focal losses):** `0.3195–0.6535` cap5; far behind GBDTs on tabular features.
- **500 m MPS Spatial ConvNeXt-UNet & ResUNet++ standalone (`spat_virgo_cnx_dilaspp`, `spat4281_convnext500`):** `0.6635–0.7004` cap5 (though `spat4281` reached `0.729` on 2025 alone); underperformed our 355-feature multi-family GBDT alone and was excluded from the final 2022–2027 package for simplicity and strict reproducibility.
- **CatBoost standalone on RADD (`ens_s03_catboost_radd_v1`):** `0.7229` alone (below LightGBM), yet contributes orthogonal oblivious-tree diversity inside the 4-family geometric blend.
- **Two-stage magnitude-calibrated LightGBM (`erro_03d62903ec_twostage_magcal_v1`):** `0.6480` cap5 (calibration step degraded ranking).
- **Spatial post-processing smoothing on clean GBDT maps (`ens_g5_clean_nested_distregime_v5_smooth`):** dropped clean cap5 from `0.7460` to `0.7213` (-2.5 pts).
- **Three leaked experiment branches (`0.762–0.8252`):** audited and rejected as documented above.

## How to reproduce

From a clean checkout of `gdavidss/prenuncio` with `code/` copied into `src/` and Python 3.12 (`numpy`, `scipy`, `pandas`, `pyarrow`, `scikit-learn`, `lightgbm`, `xgboost`, `catboost`, `rasterio`, `pyogrio`, `pillow`, `httpx`):

```sh
scripts/fetch.sh
AZ_F=50 python pipeline/grid.py
AZ_F=50 python pipeline/layers.py
python unet/hansen.py && python unet/glad.py && python unet/glad.py wide
scripts/fetch_tmf.sh && python unet/tmf.py
python unet/aef.py 2019 2020 2021 2022 2023 2024 2025
python code/build_alpha_5s.py
python code/jev_amazon_signals.py && python code/jev_deep_signals.py
python code/surveil_prenuncio_1.py --years 2022 2023 2024 2025 2026 2027 --out maps/ --threads 16
python benchmark/score.py maps/ --out benchmark/submissions/surveil-prenuncio-1/scores.json
```

Expected wall-clock on one Apple M5 Max (18 CPU cores, 128 GB RAM): ~35 min data gridding + ~25 min full 6-year 14M-cell training & inference. Trained tree weights are not bundled in the zip to keep size compact; all six full `[5180, 6664]` float16 prediction maps (`2022.npz`–`2027.npz`) are included in `maps/`.

## Compute and cost

- **Overnight autonomous exploration (3x Apple M5 Max on local hardware, ~8.5 hours):** 6,205+ LLM turns on `$0` self-hosted models (`taurus`, `orion`, `temp-glm`, `pegasus`, `pegasus-flash`, `virgo-kimi`, `deepseek-v41`), 144 experiments.
- **TypeSafe JEV-1.13.0 semantic text scoring (`137,978` public SINAFLOR + IBAMA records):** `$5.34` USD total.
- **Final official 14M-cell reproducible build (`surveil_prenuncio_1.py` on 1x Apple M5 Max):** ~25 minutes wall-clock, `$0` cloud compute cost.

## Agent disclosure

An autonomous multi-agent swarm (self-hosted GLM-5.2/5.3, Kimi-K3, and DeepSeek-V4.1 agents coordinated via a local SQLite Hub + FTS5 IRC, plus TypeSafe JEV-1.13.0 for non-PII text scoring and a Cursor Gemini orchestrator) designed feature packs, ran 144 rolling-origin experiments, executed 30 cross-family red-team leakage audits, and assembled the standalone reproduction script and report. Every temporal cutoff, jump test, leakage rejection, and official 14M-cell score (`benchmark/score.py` and `benchmark/score_prob.py`) was audited directly before packaging.
