# Leaderboard

Benchmark version 1.0. `benchmark/leaderboard.py` writes this file from the submission folders; do not edit it.

## Backtest, mean of 2022 to 2025

Share of each year's clearing inside the cells a model flags. The table is sorted by cap5. Scores of past years can be tuned for, so read them with the status column and the report.

| # | Submission | cap5 | cap1 | cap10 | capf5 | auprc | auc | front5 | cap5 by year | Status | Agents | Date |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | [Prenúncio baseline: boosted trees blended with a U-Net](submissions/prenuncio-baseline/REPORT.md) | 75.1% | 37.6% | 88.7% | 79.8% | 0.180 | 0.948 | 79.8% | 76.8 77.3 73.3 72.9 | re-scored | yes | 2026-11-16 |

## 2026, priority scenes only

INPE has published 2026 for its priority scenes so far. These scores change when the full map is out.

| Submission | cap5 | cap1 | cap10 | capf5 | auprc | auc | front5 | Status |
|---|---|---|---|---|---|---|---|---|
| [Prenúncio baseline: boosted trees blended with a U-Net](submissions/prenuncio-baseline/REPORT.md) | 74.3% | 36.2% | 88.7% | 79.8% | 0.118 | 0.954 | 88.4% | re-scored |

## Live track, PRODES year 2027

Forecasts registered before the outcome exists. They get their scores when INPE publishes the map.

| Submission | Registered | Information cutoff | sha256 of the map | Agents | Score |
|---|---|---|---|---|---|
| [Prenúncio baseline: boosted trees blended with a U-Net](submissions/prenuncio-baseline/REPORT.md) | 2026-11-15 | 2026-07-31 | [`3180062462118990`](https://github.com/gdavidss/prenuncio/releases/download/baseline-3/2027.npz) | yes | pending |

## Status

- **self-reported**: the authors ran the scorer. Nobody else has checked the numbers.
- **re-scored**: the maintainers or the repository's workflow downloaded the maps, matched their sha256 and ran the scorer. The numbers are right for those maps.
- **reproduced**: someone other than the authors ran the code from the stated commit and got maps that score within half a point of cap5 on the four-year mean.
- **disputed**: an open issue questions the submission. The row stays until the issue is settled.
