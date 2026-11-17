<!-- For a benchmark submission, keep the checklist. For any other change, delete it and describe the change. -->

## Benchmark submission

Folder: `benchmark/submissions/<name>`

- [ ] `python benchmark/submission.py check <name>` passes
- [ ] The maps are at public https links, and `meta.json` holds the sha256 of each
- [ ] `scores.json` was written by `benchmark/score.py` (through `submission.py fill`) and not edited
- [ ] The code is public at the commit in `meta.json`, under an open-source licence
- [ ] One model made every year's map by the same procedure (an ensemble packaged as one model counts)
- [ ] A forecast of year T uses only information up to 31 July of T-1, and the model for T was fitted only on outcomes before T
- [ ] Every input is public and dated, and `REPORT.md` lists the last date used
- [ ] `REPORT.md` says what was chosen by looking at the 2022 to 2025 scores, and what was tried and failed
- [ ] `REPORT.md` and `meta.json` say which AI agents were used and how, or that none were
- [ ] I did not edit `LEADERBOARD.md` or `leaderboard.json`

Live track (delete if not registering a forecast for PRODES year 2027):

- [ ] `meta.json` lists the 2027 map with its sha256 and `information_cutoff`
- [ ] I understand that the hash cannot change after 31 December 2026, 23:59 UTC

## Anything a reviewer should know
