# The Prenúncio benchmark

A public test for models that forecast where the Brazilian Legal Amazon will be cleared next. The results are in [LEADERBOARD.md](LEADERBOARD.md).

## The task

On 31 July of year T-1, give every 500 m cell of the Legal Amazon a number that ranks it by how much of it will be cleared in PRODES year T, which runs from 1 August of T-1 to 31 July of T. The outcome is INPE's PRODES map of that year. The scored years are 2022 to 2025. 2026 is scored apart, because INPE has mapped it for its priority scenes only.

A forecast for 2027 can be registered until 31 December 2026 and is scored when the map exists. The main live track uses the July cutoff below. Forecasts using later information or registered after the deadline are listed separately.

## The score

Flag the 5% of candidate cells a model ranks highest. cap5 is the share of the year's clearing, in km², that falls inside them, and the leaderboard sorts by its mean over 2022 to 2025. A candidate cell lies inside the Legal Amazon and was at least 1% forest on the forecast date. There are about 14 million a year.

## The rules

1. **One model.** A submission is one packaged model that produces every year's map by the same procedure. An ensemble is one model when it is packaged and reproduced as one. Choosing different models for different years is not allowed.
2. **Information cutoff.** A forecast for year T uses only information that existed on 31 July of T-1. The PRODES map of year T-1 counts, because it records clearing up to that date.
3. **Fitting cutoff.** The model that forecasts year T is fitted and tuned only on outcomes from years before T.
4. **Public, dated inputs.** Every input is public, free to download and dated, so that a reader can check rule 2. Pretrained models and embeddings are allowed. Say what they were trained on and through which date.
5. **Open code.** The code that made the maps is public under an open-source licence, at a stated commit.
6. **A report.** `REPORT.md` follows the template and covers the method, the inputs and their dates, how leakage was avoided, what failed, how to reproduce, the cost and the agents used.
7. **AI agents are welcome.** Say which agent and model, what it did and what a person checked. An agent-built model is ranked like any other.

## How to submit

```sh
python benchmark/score.py --selftest
python benchmark/score.py my_maps/          # 2022.npz to 2025.npz, optionally 2026 and 2027
cp -r benchmark/submissions/_template benchmark/submissions/my-model
# fill in meta.json and REPORT.md, then upload the maps somewhere public
python benchmark/submission.py fill my-model my_maps/ --url-base https://github.com/you/repo/releases/download/v1
python benchmark/submission.py check my-model
```

A map is `<year>.npy`, or `<year>.npz` with the key `risk`, float16 or float32, shape [5180, 6664]. Open a pull request with the folder and leave the leaderboard files alone, because a maintainer rebuilds them. A `2027` map among the files registers a live forecast. The folder you add is published under CC BY 4.0.

## What the status column says

- **self-reported.** The authors ran the scorer and nobody else has checked the numbers.
- **re-scored.** The maintainers or the repository's workflow downloaded the maps, matched their hashes and ran the scorer. The numbers are right for those maps.
- **reproduced.** Someone other than the authors ran the code from the stated commit and got maps within half a point of cap5 on the four-year mean.
- **superseded.** The authors have a newer version of the same model on the board.
- **disputed.** An open issue questions the row. It stays until the issue is settled.
- **reference.** Not a model. Nothing is fitted, and the row is there for scale.

## The probability track

A ranking says where to look first, and a decision needs a chance. `score_prob.py` scores maps of the probability that a cell loses at least one hectare in the year, on 2024 and 2025, by Brier skill, log loss, count ratio and calibration error. prenuncio-3 has a Brier skill of 0.080. The track is not on the leaderboard yet, so report its scores in your `REPORT.md`.

[docs/BENCHMARK.md](../docs/BENCHMARK.md) has the file formats, every score's definition, the known ways to leak, the live track's deadlines, how submissions are verified and how the benchmark changes.
