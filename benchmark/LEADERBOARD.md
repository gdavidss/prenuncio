# Leaderboard

The score is cap5, the share of the year's clearing inside the 5% of forest cells a model ranks highest, averaged over PRODES years 2022 to 2025.

| # | Model | cap5 | 2026 | By | Date | Links | Status |
|---|---|---:|---:|---|---|---|---|
| 1 | [prenuncio-3](submissions/prenuncio-3/REPORT.md) | 75.1% | 74.3% | Prenúncio | 2026-11-16 | [code](https://github.com/gdavidss/prenuncio/tree/bfead815f2c8b41515230c46d66dd9f2d2204519) [maps](https://github.com/gdavidss/prenuncio/releases/tag/baseline-3) | re-scored |
| 2 | [prenuncio-2](submissions/prenuncio-2/REPORT.md) | 74.5% | 73.5% | Prenúncio | 2026-11-16 | [code](https://github.com/gdavidss/prenuncio/tree/beafc85cb0897b44148987e2ea6db2edf78641f1) [maps](https://github.com/gdavidss/prenuncio/releases/tag/baseline-2) | re-scored, superseded |
| 3 | [prenuncio-1](submissions/prenuncio-1/REPORT.md) | 72.5% | 72.7% | Prenúncio | 2026-11-15 | [code](https://github.com/gdavidss/prenuncio/tree/bb3f7f38e67442a2c3736ec73000a42faf3d58e3) [maps](https://github.com/gdavidss/prenuncio/releases/tag/baseline-1) | re-scored, superseded |
| 4 | [last-year-nearby](submissions/last-year-nearby/REPORT.md) | 50.2% | 51.2% | Prenúncio | 2026-11-17 | [code](https://github.com/gdavidss/prenuncio/tree/0f3d250688c8ae8822dd9286b2b4ad5c86ea75de) [maps](https://github.com/gdavidss/prenuncio/releases/tag/reference-1) | reference |

2026 stays out of the mean because INPE has mapped it for its priority scenes only. A model's name opens its report. What each status means, the rules and how to submit are in [README.md](README.md).

## cap5 by year

| Model | 2022 | 2023 | 2024 | 2025 | 2026 |
|---|---:|---:|---:|---:|---:|
| [prenuncio-3](submissions/prenuncio-3/REPORT.md) | 76.8% | 77.3% | 73.3% | 72.9% | 74.3% |
| [prenuncio-2](submissions/prenuncio-2/REPORT.md) | 76.6% | 76.8% | 72.4% | 72.2% | 73.5% |
| [prenuncio-1](submissions/prenuncio-1/REPORT.md) | 72.6% | 74.1% | 71.1% | 72.2% | 72.7% |
| [last-year-nearby](submissions/last-year-nearby/REPORT.md) | 54.9% | 49.8% | 47.0% | 49.2% | 51.2% |

The other scores (cap1, cap10, capf5, auprc, auc, front5) are in each model's `scores.json` and in [leaderboard.json](leaderboard.json).

## Live track, PRODES year 2027

Forecasts registered before the outcome exists. They get their scores when INPE publishes the map.

| Model | Registered | Information cutoff | Map, sha256 | Score |
|---|---|---|---|---|
| [prenuncio-1](submissions/prenuncio-1/REPORT.md) | 2026-11-15 | 2026-07-31 | [`9a8902961b0ed6e6`](https://github.com/gdavidss/prenuncio/releases/download/baseline-1/2027.npz) | pending |
| [prenuncio-2](submissions/prenuncio-2/REPORT.md) | 2026-11-16 | 2026-07-31 | [`b76070ebd3368c8d`](https://github.com/gdavidss/prenuncio/releases/download/baseline-2/2027.npz) | pending |
| [prenuncio-3](submissions/prenuncio-3/REPORT.md) | 2026-11-16 | 2026-07-31 | [`3180062462118990`](https://github.com/gdavidss/prenuncio/releases/download/baseline-3/2027.npz) | pending |
| [last-year-nearby](submissions/last-year-nearby/REPORT.md) | 2026-11-17 | 2026-07-31 | [`75b18dd9b0175294`](https://github.com/gdavidss/prenuncio/releases/download/reference-1/2027.npz) | pending |

Benchmark version 1.0. `benchmark/leaderboard.py` writes this file from the submission folders. Do not edit it.
