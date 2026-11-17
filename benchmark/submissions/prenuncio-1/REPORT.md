# prenuncio-1

Superseded by [prenuncio-3](../prenuncio-3/REPORT.md). prenuncio-1 was the first public version, the forecast on prenuncio.com on 15 November 2026. It scores 72.5% on cap5 over 2022 to 2025 and 72.7% on 2026.

## Method

One model, an ensemble of gradient boosted trees on the 500 m grid (Tweedie loss with power 1.3, one fit) and a U-Net on 100 m tiles, blended by weighted geometric mean with 0.4 on the trees and 0.6 on the U-Net. Both parts read AlphaEarth satellite embeddings next to the clearing history, Hansen forest loss and GLAD alerts.

Against prenuncio-3 it lacked the JRC Tropical Moist Forest disturbance record in both parts, clearing permits in the trees, the longer GLAD windows, the flatter tree loss and the average of three tree fits.

It also falls short of the rule that one procedure produces every year's map. The U-Net run became numerically unstable at its 2025 step, so the U-Net maps for 2025, 2026 and 2027 come from a second network, trained from scratch on outcomes up to 2024 with a shorter schedule and then fine-tuned a year at a time. The failure forced the change. No score chose it.

The target, the fitting rule, the input cutoffs and the leakage notes are as in [prenuncio-3's report](../prenuncio-3/REPORT.md).

## How to reproduce

- The code is at [commit bb3f7f3](https://github.com/gdavidss/prenuncio/tree/bb3f7f38e67442a2c3736ec73000a42faf3d58e3).
- The forecast maps for 2022 to 2027 are in the [release baseline-1](https://github.com/gdavidss/prenuncio/releases/tag/baseline-1). The trained weights are not published.
- The exact commands are in the report as first published, which has every section and is [in the history](https://github.com/gdavidss/prenuncio/blob/a7e6eaa/benchmark/submissions/prenuncio-baseline/REPORT.md).
- It took 9.5 machine hours and about 11 US dollars, on one cloud machine with an NVIDIA L4 GPU.

## Agent disclosure

AI coding agents (Claude Code, from Anthropic) wrote most of the pipeline, ran the experiments and drafted this report. The maintainer set the goals, decided what to try and what to publish, and read the results. The scores come from `benchmark/score.py` run on the published maps.
