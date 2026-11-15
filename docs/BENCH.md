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
| Tuned trees with embeddings (three fits, richer GLAD), blended with the wider U-Net | 35.3% | 73.0% | 87.6% | 0.953 | 79.5% |
| **Published**: production trees with embeddings blended 40/60 with the U-Net with embeddings | 35.1% | 72.6% | 87.2% | 0.953 | 76.7% |
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

With the budget counted in forest, the best blend holds 77.8% of the clearing in 5% of the standing forest (capf5).

The published model is half a point under the best lab row because its trees are a single untuned fit; folding the tuned settings into the production trees is a known, cheap follow-up. On the 2026 holdout the published blend scores 72.5% (cap1 33.7%, cap10 87.5%, capf5 78.6%).

For reference, on the same four years the first version of the product (trees at 1 km, neither Hansen nor GLAD) scored about 62% on cap5, and the best naive map about 50%.

The blend's gain over the trees is real in every year (bootstrap: better in 95% to 100% of resamples, by 0.5 to 3.9 points). The flatter loss is not distinguishable from the baseline.

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
