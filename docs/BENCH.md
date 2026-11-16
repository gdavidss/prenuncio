# The internal benchmark

This is the yardstick every model change is measured against. It lives in `pipeline/lab.py` and runs on the cloud machine, where the cached feature tables are.

## The task

On 31 July of year T-1, rank every 500 m cell that still holds forest in the Legal Amazon by how much of it will be cleared in the PRODES year T (August T-1 to July T). The model may be fitted only on outcomes from years before T, and may read only inputs that existed on the forecast date.

Benchmark years are 2022, 2023, 2024 and 2025, the four years for which every input exists (the GLAD alerts start in 2019). 2026 is the holdout. It is scored once, for a model that is about to be published, and never used to choose between models.

Scoring uses a fixed random quarter of all forest cells, about 3.5 million per year. Bootstrap resampling of 50 km blocks puts the noise on a single year's score at about half a point, so a difference under one point on the four-year mean should not be believed without `lab.py noise`.

## The scores

| Score | What it asks |
|---|---|
| cap5 | Flag 5% of forest cells. What share of the year's clearing is inside them? The headline. |
| cap1, cap10 | The same at 1% and 10%. |
| capf5 | The same budget counted in forest instead of cells: flag cells, densest risk per km² of forest first, until they hold 5% of the standing forest. Higher than cap5, because the riskiest cells are already partly cleared and so use up little forest. |
| auprc | Precision-recall area for "this cell lost at least a hectare". Falls when clearing falls, so compare within a year. |
| auc | ROC area for the same label. Saturates near 0.95 and moves little. |
| front5 | cap5 among cells with no clearing within 9 km in three years. The new frontier, the hardest part. |
| alarm reliability | Of the N highest-ranked 5 km blocks, how many lost at least 10 ha. Computed on the published map. |

cap5 is strict on purpose. A perfect forecast scores 100% on it, and a quarter of each year's clearing opens two kilometres or more from recent clearing, spread over 87% of the forest.

## Leaderboard

Means over 2022 to 2025. Every row is a real run.

| Model | cap1 | cap5 | cap10 | auc | front5 |
|---|---|---|---|---|---|
| **Published**: tuned trees with the JRC disturbance record, blended 50/50 with the U-Net reading the same record at 100 m | 37.0% | 74.6% | 88.3% | 0.956 | 79.4% |
| U-Net with embeddings and the JRC disturbance record, alone | 35.5% | 72.9% | 87.2% | 0.951 | 75.5% |
| Published for a few hours on 16 Nov: tuned trees with the JRC disturbance record, blended 50/50 with the U-Net with embeddings | 35.6% | 73.5% | 87.8% | 0.954 | 78.1% |
| Tuned trees with embeddings and the JRC disturbance record, alone | 34.1% | 72.8% | 87.6% | 0.954 | 78.6% |
| Tuned trees with embeddings (three fits, richer GLAD), blended with the wider U-Net | 35.3% | 73.0% | 87.6% | 0.953 | 79.5% |
| Published until 15 Nov: production trees with embeddings blended 40/60 with the U-Net with embeddings | 35.1% | 72.6% | 87.2% | 0.953 | 76.7% |
| Trees with satellite embeddings, blended with the wider U-Net | 35.1% | 72.7% | 87.5% | 0.953 | 78.7% |
| Trees blended with the wider U-Net | 34.4% | 72.3% | 87.1% | 0.953 | 77.7% |
| Trees blended with the rolling U-Net (published until 15 Nov) | 33.9% | 71.7% | 86.8% | 0.952 | 74.8% |
| Wider U-Net alone (1.5 times the channels, longer training) | 33.9% | 71.4% | 86.3% | 0.949 | 73.7% |
| Rolling U-Net alone (100 m, Hansen and GLAD planes) | 33.2% | 71.0% | 85.9% | 0.948 | 70.4% |
| Trees with the U-Net forecast as an input (stacking) | 33.1% | 70.9% | 86.2% | 0.953 | 72.6% |
| Tuned trees with embeddings alone | 33.3% | 71.9% | 87.0% | 0.952 | 76.1% |
| U-Net with DETER planes and wide context, blended with trees | 33.9% | 71.5% | 86.4% | 0.952 | 75.5% |
| Trees with AlphaEarth satellite embeddings | 32.9% | 71.0% | 86.2% | 0.952 | 73.9% |
| Trees, richer GLAD windows | 32.4% | 70.1% | 85.4% | 0.951 | 70.6% |
| Trees, flatter loss (Tweedie power 1.1) | 31.7% | 70.0% | 85.4% | 0.950 | 73.0% |
| Trees, three fits averaged | 32.4% | 69.9% | 85.2% | 0.951 | 71.6% |
| Trees, baseline (500 m, Hansen, GLAD) | 32.0% | 69.5% | 85.2% | 0.951 | 70.8% |
| Trees with public-forest tenure (CNFP) | 32.1% | 69.4% | 84.9% | 0.950 | 71.8% |
| Trees, older-clearing lags | 31.7% | 69.4% | 85.1% | 0.951 | 71.0% |
| Trees, recent years weighted up | 31.5% | 69.3% | 84.8% | 0.951 | 71.0% |
| Trees, trained on 2017 onward only | 31.5% | 69.3% | 84.7% | 0.950 | 70.9% |
| Trees without Hansen | 30.7% | 68.0% | 83.7% | 0.948 | 69.3% |
| Trees without GLAD | 29.7% | 67.3% | 82.9% | 0.946 | 65.9% |
| Trees, binary objective | 27.7% | 65.8% | 82.4% | 0.950 | 69.6% |

With the budget counted in forest, the published blend holds 79.3% of the clearing in 5% of the standing forest (capf5).

On the 2026 holdout the published blend scores 73.1% (cap1 34.9%, cap10 87.8%, capf5 78.7%). The holdout has been scored for five blends by now, none chosen by it.

For reference, on the same four years the first version of the product (trees at 1 km, neither Hansen nor GLAD) scored about 62% on cap5, and the best naive map about 50%.

The blend's gain over the trees is real in every year (bootstrap: better in 95% to 100% of resamples, by 0.5 to 3.9 points). The flatter loss is not distinguishable from the baseline.

## A probability for every cell

The forecast is a number for every forest cell of the Amazon, about 14 million of them, and the 5% cut used above is only a yardstick for comparing models. `pipeline/calibrate.py` turns each cell's score into the chance that the cell loses at least one hectare in the PRODES year. The mapping keeps the ranking and is fitted on the forecasts of the two years before against their outcomes, so the chances of a year never see that year. It reads the published maps and the public truth files, so anyone can rerun it.

Chance the model gave, and how often it happened (said / happened):

| Chance given | 2024 | 2025 | 2026 |
|---|---|---|---|
| 0% to 0.1% | 0.01% / 0.02% | 0.02% / 0.02% | 0.02% / 0.01% |
| 0.1% to 0.5% | 0.24% / 0.34% | 0.25% / 0.22% | 0.22% / 0.15% |
| 0.5% to 1% | 0.73% / 0.79% | 0.73% / 0.61% | 0.74% / 0.72% |
| 1% to 2% | 1.47% / 1.50% | 1.48% / 1.27% | 1.52% / 1.54% |
| 2% to 5% | 3.20% / 3.11% | 3.23% / 3.07% | 3.30% / 3.36% |
| 5% to 10% | 7.02% / 6.67% | 6.83% / 7.73% | 6.95% / 6.86% |
| 10% to 20% | 13.81% / 13.01% | 13.24% / 15.40% | 13.38% / 12.65% |
| 20% to 40% | 25.15% / 23.75% | 25.04% / 25.28% | 25.55% / 25.26% |
| 40% to 100% | 50.45% / 43.24% | 52.90% / 36.92% | 51.25% / 72.22% |
| Cells expected to lose a hectare / cells that did | 92,918 / 92,111 | 69,141 / 70,011 | 59,153 / 55,717 |

The chances hold. Cells given about 3% lost a hectare about 3% of the time, cells given about 13% about 13% to 15% of the time. The top band holds a few hundred to two thousand cells a year and is the noisiest. 2026 is mapped for priority scenes only, so its "happened" column is a floor.

Most of the risk is thin. For 2027, 10,074,115 of 14,024,403 forest cells have a chance under 0.1%, and 18,632 have a chance over 20%. About 53,136 cells are expected to lose a hectare.

## Where the misses are

On 16 November the maps published that morning (73.3% on this count, before the U-Net read the JRC record) were taken apart to see what the missing quarter is made of (`pipeline/anatomy.py`, means over 2022 to 2025, counted on every cell).

The model knows where clearing can happen. Its top 20% of cells hold 96.6% of the year's clearing, the top 10% hold 87.7%, the top 5% hold 73.3% and the top 1% hold 35.6%. What it cannot do is say which of the cells at risk go this year. Only 11% of flagged cells lose forest in the year they are flagged for, and 18% within two years. Last year's flags, left unchanged, still catch 62% of this year's clearing.

The model also knows how unsure it is. From its own numbers it expects 77% of the clearing inside its flags, and 73% falls there. That four-point gap is the most that any better use of the same inputs can recover. Past it, the inputs have to change.

| Distance from clearing of the last three years | Share of the year's clearing | Caught | Share of forest cells |
|---|---|---|---|
| Same cell | 28% | 94% | 2.5% |
| Next cell | 30% | 87% | 4.2% |
| To 1.5 km | 13% | 72% | 3.8% |
| 1.5 to 3 km | 15% | 56% | 8.3% |
| 3 to 6 km | 9% | 33% | 11.7% |
| Beyond 6 km | 6% | 16% | 69.4% |

Clearing next to recent clearing is close to solved. The 30% that opens 1.5 km or more away is caught four times in ten, and it accounts for 17 of the 27 missing points.

| Who holds the land (CNFP registry) | Share of the year's clearing | Caught | Of which far from recent clearing | Caught |
|---|---|---|---|---|
| Not in the registry (private or unregistered) | 48% | 69% | 17% | 40% |
| Undesignated public land | 23% | 82% | 5% | 52% |
| Settlements | 18% | 84% | 2% | 47% |
| Conservation units | 8% | 72% | 2% | 39% |
| Indigenous lands | 5% | 36% | 3% | 10% |

The largest single miss is clearing on private or unregistered land far from recent clearing, 17% of all clearing, caught 40% of the time. More than half of it is in Mato Grosso (10% of all Amazon clearing, caught 43% of the time). It comes in large blocks, 56% of it in patches over 5 km², on cells that were entirely forest, usually beside farmland cleared more than three years earlier. Nothing in a disturbance record announces it.

Four ideas were measured against this and set aside.

| Idea | Result |
|---|---|
| Flag at the network's own 100 m instead of 500 m cells, same flagged area (`unet/score100.py`, 2021) | 81.9% against 80.9%, one point |
| Flag the neighbours of flagged cells | Worse than the model's own next-ranked cells (84.6% against 88.1% at the same area) |
| Correct this year's forecast with last year's errors by distance, forest share, rank and state (`pipeline/recal.py`) | +0.1 points, the sign changes from year to year |
| Re-issue the forecast in season with the DETER alerts of the first three months (`pipeline/inseason.py`) | 75.4% against 73.3%; on clearing in cells with no alert yet it stays at 70% |

One thing does move the far clearing: the convolutional model reading the JRC disturbance record at 100 m. Over 2019 to 2025 it catches 40.5% of far clearing against 36.0% for the same network without the record, and 72.9% of all clearing against 70.8%. The trees given the same record as 500 m summaries catch 37.6% of far clearing. Logging roads and skid trails are lines, and a line survives as a pattern of 100 m cells but not as a count inside a 500 m cell.

The gain is not even. It is two to five points in 2021 to 2023 and nothing in 2024 and 2025.

| Forecast year | U-Net | U-Net with the JRC record | Trees with the JRC record | The two blended |
|---|---|---|---|---|
| 2019 | 70.1% | 71.6% | 71.3% | 73.1% |
| 2020 | 71.0% | 72.5% | 72.8% | 74.4% |
| 2021 | 70.4% | 74.6% | 72.6% | 75.2% |
| 2022 | 71.3% | 76.7% | 73.7% | 76.6% |
| 2023 | 72.5% | 75.2% | 74.6% | 76.8% |
| 2024 | 69.5% | 69.8% | 71.1% | 72.4% |
| 2025 | 71.2% | 69.6% | 71.0% | 72.2% |

The reason was looked for and found. Among forest cells far from recent clearing that the JRC record marks as freshly disturbed, those that also carry a DETER fire scar used to turn into clearing less often than the rest (1.3% against 3.0% in the 2023 forecast year). From 2024 they turn into clearing more often (3.7% against 2.2% in 2024, 5.6% against 1.7% in 2025), and by 2026 they hold 12% of all far clearing. PRODES now counts forest lost to repeated fire, and the fires of 2023 and 2024 were the largest on record. The convolutional model has no fire input, so it cannot tell a burn from a logging track; the trees do, and they hold up better in those years. Fire-scar planes for the convolutional model were the next experiment, and they did not fix it. Branching from the same 2021 checkpoint, the network with DETER fire-scar planes scores 77.6%, 75.9%, 70.5% and 69.3% for 2022 to 2025 against 76.7%, 75.2%, 69.8% and 69.6% without them, and 71.0% against 72.2% on 2026. Blended with the trees the mean moves from 74.5% to 74.7%. A loss that weights forest far from recent clearing three times more did nothing either (72.8% alone on 2022 to 2025 against 72.8%, far clearing caught 42.3% against 42.4%). Neither was adopted.

What did move the far, planned clearing is a source that carries intent. Clearing permits (SINAFLOR authorisations, dated and public) lift the trees by 1.3 points on the lab, in all four years. `docs/INPUTS.md` keeps the ledger of every input tested.

## Alarm reliability of the published map

Of the 500 five-kilometre blocks ranked highest each year, the share that lost at least 10 hectares:

| 2019 | 2020 | 2021 | 2022 | 2023 | 2024 | 2025 | 2026 |
|---|---|---|---|---|---|---|---|
| 95% | 95% | 93% | 95% | 85% | 78% | 69% | 57% |

Reliability follows the base rate. In 2019, 9% of all blocks lost that much; in 2026, under 4%, and the 2026 outcome so far covers INPE's priority scenes only. The top 500 blocks hold about a tenth of each year's clearing.

## What the leaderboard says

Tree-side changes are worth half a point at most. The trees are at their limit for these inputs.

The inputs that matter are the finer disturbance records. Removing GLAD costs 2.2 points and removing Hansen 1.5.

The U-Net, once it reads those records at 100 m, passes the trees, and the two disagree enough that their blend beats both. Blending beats feeding the U-Net's forecast to the trees.

Tenure from the public forests registry adds nothing to placement.

Satellite embeddings are the newest input that pays. Google's AlphaEarth embeddings (64 numbers per pixel per year, summarising Sentinel and Landsat imagery, openly published for 2018 to 2025) add 1.5 points to the trees with only two to five years of them to learn from. The embedding of a calendar year covers January to December, so a forecast dated 31 July of year t uses year t-1 and earlier.
