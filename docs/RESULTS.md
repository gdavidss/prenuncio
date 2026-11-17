# Prenúncio results, first version

14 November 2026. Everything here comes from runs on real INPE data, forecast forward in time, never fitted and scored on the same year. The numbers are reproducible with the commands in [PIPELINE.md](PIPELINE.md). The scores of the published model on the open benchmark are in the [leaderboard](../benchmark/LEADERBOARD.md).

## How accuracy is measured

The model ranks every square kilometre of standing forest by expected clearing. The main score is capture at a fixed area budget. If we may flag only 5% of the forest (about 155,000 km²), what share of the clearing that then happens falls inside what we flagged?

Three naive maps are scored on the same question. "Same cell as last year" ranks cells by their own clearing the year before. "Same neighbourhood" ranks them by clearing within about 4 km. "Forest edge" ranks them by distance to cleared land, which is the benchmark Verra uses for carbon projects.

The test is rolling origin. To score 2022 the model is trained only on outcomes up to 2021, with inputs cut at 31 July 2021.

## Where clearing falls, one year ahead

The published model, prenuncio-3, is one model built as an ensemble of two parts. One is gradient boosted trees on a 500 m grid. The other is a U-Net that reads 25 km tiles at 100 m. Both see the clearing history plus four finer records of what the satellites saw: Hansen's 30 m forest loss, the GLAD Sentinel-2 alerts at 10 m (from 2020), the JRC Tropical Moist Forest record of first disturbance at 30 m, and Google's AlphaEarth satellite embeddings (from 2018). The trees also read the clearing permits valid on the forecast date. The U-Net forecast for each year comes from a network that never saw that year or any later one. Figures are the share of the year's clearing inside the top 5% of forest cells.

| Test year | Published blend, 500 m | Trees alone | U-Net alone | Blend as painted on the site, 1 km | First version, 1 km | Best naive map |
|---|---|---|---|---|---|---|
| 2019 | 73% | 72% | 72% | 69% | 65% | 54% |
| 2020 | 74% | 73% | 72% | 70% | 64% | 54% |
| 2021 | 75% | 73% | 75% | 71% | 65% | 53% |
| 2022 | 77% | 74% | 77% | 73% | 65% | 54% |
| 2023 | 77% | 75% | 75% | 73% | 62% | 52% |
| 2024 | 73% | 72% | 70% | 69% | 58% | 47% |
| 2025 | 73% | 73% | 70% | 70% | 60% | 50% |
| 2026 | 74% | 71% | 72% | 73% | 63% | 52% |

Averaged over 2019 to 2025 the published blend captures 74.9% of clearing in the top 5% of forest cells, 35.7% in the top 1% and 89.0% in the top 10%. The first version captured 62.9% and 25.4% at 5% and 1%. The best naive map captures 52% and 18%, and the forest-edge benchmark 27% and 5%. On 2026, which no model saw, the blend captures 73.9%, 36.2% and 88.2%, against 63.1% and 27.1% for the first version.

Counting the budget in forest instead of cells (the 5% of standing forest with the densest risk), the blend holds 80.0% of the clearing, and it separates cells that lost a hectare from those that did not with a ROC-AUC of 0.957.

The site still paints on the 1 km grid, so it sums the 500 m forecast into 1 km cells. Painted that way the same forecast scores 68.5% on average, and that is the number the site quotes, because it describes the cells it actually shows. Painting at 500 m is the next change to the site.

One caveat on the 2025 to 2027 U-Net forecasts. The year-by-year run became numerically unstable at its 2025 step, so those three years come from a second network trained from scratch on outcomes up to 2024 and then fine-tuned a year at a time. It obeys the same rule (never trained on the year it forecasts) and now drops any unstable batch.

The skill holds across the two regime changes inside the test window, the jump of 2019 and the fall of 2023. That is the practical meaning of "where is predictable".

2026 is the strictest test. The final model saw no 2026 outcome, and the outcome is the set of polygons INPE published in October 2026 for its priority scenes (3,456 km² on our grid). When the full 2026 map is published in 2027 this row should be recomputed.

About 5% to 11% of each year's clearing opens in places with no clearing nearby in the previous three years. This is the new frontier, the part a history-driven model should find hardest. The first version's top 5% of those cells caught between 57% and 70% in every year except 2025, when it caught 38%. Adding Hansen at 500 m raised 2025 to 48%.

### What the model leans on

By share of total gain in the first version: clearing history 87%, location 4%, DETER alerts 3%, IBAMA enforcement records 2%, fire detections 2%, tenure 1%. The two strongest single inputs are the amount of clearing within 4 km over the last three years, and the distance to the nearest clearing in that period.

A first run used only history, tenure and DETER. Adding fire detections and IBAMA embargoes and infraction notices moved the averages from 25.5% and 62.7% to 25.4% and 62.9%. In other words they added nothing to placement. This agrees with the literature and it matters for the design: enforcement and fire do not tell you where next year's clearing goes beyond what past clearing already says. Their job is in the total.

## How much, one year ahead

This is the weak part, and the numbers say so.

| Method | Mean absolute error on the yearly total, 2021 to 2026 |
|---|---|
| Last year's total, repeated | 29% |
| Our model with 3 months of DETER | 27% |
| Our model with 12 months of DETER (the year already over) | 22% |
| Imazon PrevisIA as published, 2022 to 2026 | 36% |

Year by year, with three months of alerts in hand, the model missed by −9%, +9%, +76%, +24%, +11% and +35%. The +76% is 2023, the year the federal government changed and enforcement returned. Nothing in the model could see that coming, and nothing in it responded once it had.

For the PRODES year 2027 (August 2026 to July 2027) the model gives 3,200 km², with a range of 2,400 to 4,200 that is one typical backtest miss either side. Read it with two cautions. The model carries a downward drift learned from four falling years. And the early signals point the other way: DETER is up 24% for August to October, fire is up about 70% on last year, and a very strong El Niño is under way. The upper half of the range deserves more weight than the lower.

A longer test asked whether anything known on 31 July beats repeating last year's total. Twelve forecast years (2014 to 2025), state by state, with fourteen combinations of the previous year's change, the basin-wide trend, the level against its three-year mean, IBAMA notices, embargoed area and fire detections. Repeating last year missed by 17% on average. Every combination missed by 18% to 26%. The yearly total turns on decisions in Brasília that none of these series carries in advance, and the honest forecast a year out is last year's number with a wide range. The total gets sharper only as the year's own months come in, which is what the monthly forecast below is for.

These totals are in PRODES mapped increments on our grid, with 2026 taken from the priority scenes. The official rate that INPE announces includes a cloud correction and has differed from the mapped increments by between −9% and +13% in recent years.

## Shorter horizons and the other hazards

Clear-cutting is not the only way the forest is lost. Since August 2016 INPE's DETER has flagged 63,500 km² of clearing, 58,700 km² of degradation and selective logging (the forest stays on the map but is hollowed out), 146,000 km² of fire scars inside forest, and 840 km² of mining. Each has its own model now, on the 1 km grid, with clearing history, DETER, Hansen, fire, enforcement and the AlphaEarth satellite embeddings as inputs, and the forecast date moved to any quarter end. The test covers forecast dates from October 2024 to mid 2026, with each model trained only on alerts observed before October 2024.

| Target | Test dates | Model, top 5% | Naive, top 5% | Model, top 1% | Naive, top 1% |
|---|---|---|---|---|---|
| Clearing alerts, next 3 months | 8 | 73% | 56% | 39% | 25% |
| Clearing alerts, next 6 months | 7 | 69% | 53% | 33% | 23% |
| Degradation and selective logging, next 12 months | 5 | 73% | 61% | 42% | 39% |
| Mining, next 12 months | 5 | 95% | 60% | 77% | 57% |
| Forest burn scars, next 12 months | 5 | 54% | 41% | 19% | 7% |

### How much, month by month

The site's monthly chart shows square kilometres per month as DETER detects them, and the bars after the present are a forecast of that same quantity for the Amazon and for each state. `pipeline/monthly.py` backtests four candidates on every forecast date since mid 2020 (63 dates), each seeing only months already observed, and publishes the one with the lowest error for each hazard. The ranges on the site are the 10th to 90th percentile of that candidate's own backtest misses.

| Hazard | Chosen model | Next month | Next 3 months | Next 6 months | Next 12 months |
|---|---|---|---|---|---|
| Clearing | level times season, with trend | 29% (40%) | 21% (28%) | 14% (18%) | 12% (15%) |
| Degradation and logging | level times season | 30% (45%) | 24% (25%) | 19% (22%) | 18% (18%) |
| Mining | level times season | 46% (55%) | 40% (50%) | 32% (36%) | 30% (30%) |
| Fire scars | boosted trees | 80% (92%) | 74% (88%) | 76% (92%) | 80% (82%) |

Each cell is the median miss on the Amazon total, and in brackets the miss of "the same months a year earlier". The winning idea is plain. Take the last twelve months' total as the level, nudge it by the fourth root of how the last half year compares with the same half a year before, and spread it over the calendar using each month's average share of its year over three years. Averaging the season over three years is what pays, because a single freak month (May 2025, for one) otherwise comes back as next year's forecast.

An earlier version scored these models on the last 24 dates only and reported 23% for three months of clearing. Scored on all 63 dates that model was no better than last year's months (28% against 28%), so it was replaced. Boosted trees on the same series lose to the simple rule for every hazard but fire, and fire is not forecastable from these inputs at all. Its amount depends on a drought that has not happened yet.

Mining is the most predictable hazard because it recurs at and around known sites. Fire is the least. The fire model has five test dates, no weather input beyond two ocean indices, and does not simulate spread. It is also untested on a year like 2024, when burn scars were several times any other year, because that year sits inside its training data.

DETER dates are detection dates, so cloud cover shifts some alerts between windows, and these scores include that noise. The hazard maps say where. The monthly totals above say how much.

Still outside any model: drought mortality and edge effects in standing forest, which no alert system maps, and the pressure variables (roads, credit, prices, enforcement) that act through the yearly total.

## Pushing the map model further

The 63% above is a strict test, and it was worth finding out how far it can be pushed. Every row below is a measured run on the same two test years, 2022 and 2025, scored as the share of clearing inside the top 5% of forest cells.

| Change | 2022 | 2025 | Verdict |
|---|---|---|---|
| Starting point: trees, 1 km | 65.4% | 60.4% | |
| Grid at 500 m instead of 1 km | 68.3% | 62.1% | helps, 2 to 3 points |
| Hansen 30 m loss history as an input, at 1 km | 66.3% | 63.2% | helps, 1 to 3 points, most on the new frontier |
| Both: 500 m with Hansen | 68.9% | 66.4% | helps, 3.5 to 6 points |
| GLAD Sentinel-2 alerts at 10 m on top of that | 71.0% | 68.4% | **adopted**, 1.5 to 2 more points (2 to 3 in a like-for-like test on 2024 and 2025) |
| Directional context (which side the clearing is on) | 65.1% | 59.9% | no gain |
| Four times more boosting rounds | 64.9% | not run | no gain |
| U-Net on 100 m clearing history alone | 65.7% | not run | level with trees, blending adds nothing |
| U-Net with Hansen planes | 67.8% | 68.1% | level with trees in 2022, ahead in 2025 |
| U-Net with Hansen blended with trees with Hansen | 69.5% | 68.6% | best so far, 4 to 8 points over the start |

At the 1% budget the adopted model catches 31% (2022) and 35% (2025), up from 27% and 28%. The U-Net rows used Hansen but not GLAD, so the blend with the adopted trees has not been measured yet.

Three things follow.

The model family is not the limit. A convolutional network trained on a GPU with the full 100 m history lands within a point of gradient boosted trees on neighbourhood summaries, and the two agree so closely that averaging them barely helps. Both have extracted what clearing history holds.

New information is what moves the number. The one new source tried, Hansen's finer record of small openings, logging roads and burned forest, raised the catch of new-frontier clearing in 2025 from 40% to 48% at 500 m.

There is a ceiling that history cannot cross, and it can be measured. Sorting each year's clearing by its distance from anything cleared in the previous three years:

| Where the clearing happened | Share of the year's clearing | Share of the forest it is spread over | Caught by the 1 km model |
|---|---|---|---|
| In a cell that already had recent clearing | 39% to 43% | 4% to 5% | 91% to 93% |
| In the next cell, about 1 km away | 29% to 33% | 8% | 66% to 68% |
| 2 to 3 km away | 14% to 15% | 10% | 26% to 33% |
| 4 to 10 km away | 10% to 13% | 23% | 6% |
| Beyond 10 km | 1% to 4% | 54% | 0% |

About a quarter of every year's clearing opens two kilometres or more from recent clearing, scattered across 87% of the forest. No arrangement of past clearing points at it. Catching it needs signals of intent: roads being opened, selective logging seen at 10 m by Sentinel-based alerts, property registrations and clearing permits. Those are the inputs to bring next.

It also helps to read the model on more than one number. Averaged over 2019 to 2026 the 1 km model catches 26% of clearing in its top 1% of forest cells, 40% in the top 2%, 63% in the top 5%, 80% in the top 10% and 93% in the top 20%. Counted the way Imazon reports PrevisIA, 81% of clearing falls within 2 km of a flagged cell and 87% within 4 km, against their published 68% to 80% within 4 km. Its ROC-AUC is 0.94. Of the cells in its top 0.5%, 28% to 42% lost at least a hectare within the year, against a base rate of 1% to 2%.

## What this version cannot do

1. It cannot tell you the yearly total within better than about a quarter, and it cannot yet respond to a policy change. The enforcement and legislative variables are collected and gridded but they do not drive anything. Building the municipality panel described in the research notes is the single most valuable next step.
2. The model works at 500 m but the site paints at 1 km, and the shorter-horizon and fire models are still the 1 km first version.
3. It has no roads, no rural property registry and no undesignated public forest layer. The first is blocked by the lack of dated road maps, the other two are a matter of download and processing.
4. Its ranges are rules of thumb from six backtest years, not calibrated intervals.
5. It has not been compared with Imazon or WWF on identical terms. Their published hit rates use different definitions (distance buffers, alert labels), so the honest comparison is each system against the same naive baselines, which only we report.
6. The sub-annual models assume the yearly PRODES map is available from late October, which held in 2026 and is roughly right for earlier years.

## What to build next, and on what

**The quantity model.** A municipality by month panel of DETER alerts against IBAMA embargoes and notices, rural credit, cattle, soy and gold prices, and the ocean indices, with cloud cover as the instrument for enforcement. This yields elasticities measured on Brazilian data and turns legislation into scenario switches with defensible sizes. It needs no special hardware.

**More early-disturbance signal.** Each finer disturbance record added so far bought 2 to 3 points. RADD radar alerts and DETER at full polygon detail are the same kind of input. The U-Net should get GLAD planes too, and the published forecast should become the blend of trees and U-Net, which gained up to 2 points over trees alone when both had Hansen. All of this runs on the cloud machine in a few hours.

**Paint at 500 m.** The site needs tiled images to show the finer grid on phones.

**Tenure.** Undesignated public forests (20% of recent clearing happens there), the rural property registry and settlements.

**Fire.** Monthly rainfall and vapour pressure deficit as inputs, an ignition model per month, then a spread model in the style of FISC.

**Operations.** DETER updates daily. A weekly job that refetches alerts, re-scores the 3 and 6 month maps and republishes is a small script once the site is deployed.
