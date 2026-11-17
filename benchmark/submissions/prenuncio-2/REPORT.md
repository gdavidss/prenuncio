# prenuncio-2

Superseded by [prenuncio-3](../prenuncio-3/REPORT.md). prenuncio-2 was the forecast on prenuncio.com for part of 16 November 2026. It scores 74.5% on cap5 over 2022 to 2025 and 73.5% on 2026.

## Method

One model, an ensemble of gradient boosted trees on the 500 m grid and a U-Net on 100 m tiles, blended half and half by geometric mean. Both parts read the JRC Tropical Moist Forest first-disturbance year, which [prenuncio-1](../prenuncio-1/REPORT.md) did not have.

What it lacked is clearing permits. prenuncio-3 gives the trees the permits valid on the forecast date, which is worth 0.6 points on the four-year mean and 0.7 on 2026. The U-Net is the same network in both.

The target, the fitting years, the inputs and their cutoffs (without the permit register), the leakage notes and the list of what failed are as in [prenuncio-3's report](../prenuncio-3/REPORT.md).

## How to reproduce

- The code is at [commit beafc85](https://github.com/gdavidss/prenuncio/tree/beafc85cb0897b44148987e2ea6db2edf78641f1).
- The forecast maps for 2022 to 2027 are in the [release baseline-2](https://github.com/gdavidss/prenuncio/releases/tag/baseline-2). The trained weights are not published.
- The commands are those in prenuncio-3's report, without the permit file `asv.csv` and with `AZ_X=hansen,glad,glad2,aef,tmf`. The report as first published, with every section, is [in the history](https://github.com/gdavidss/prenuncio/blob/c2d7ff4/benchmark/submissions/prenuncio-baseline/REPORT.md).
- It took 8 machine hours and about 9 US dollars, on one cloud machine with an NVIDIA L4 GPU.

## Agent disclosure

AI coding agents (Claude Code, from Anthropic) wrote most of the pipeline, ran the experiments and drafted this report. The maintainer set the goals, decided what to try and what to publish, and read the results. The scores come from `benchmark/score.py` run on the published maps.
