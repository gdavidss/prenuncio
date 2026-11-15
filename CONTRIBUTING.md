# Contributing

Four kinds of contribution are welcome, and none needs permission first.

1. **A model.** Submit its scores and report to the benchmark. A model below the current best still earns its row: a clean negative result saves the next person the work.
2. **A live forecast** for PRODES year 2027, registered before 31 December 2026.
3. **A reproduction.** Run someone's code from their stated commit, ours included, and say what you got.
4. **A fix or a question**: a bug in the scorer, a doubt about a truth file, a suspected leak, an error in the docs, a change to the pipeline or the site.

## Submitting a model

The rules are in [benchmark/README.md](benchmark/README.md). In short: forecast year T from information up to 31 July of T-1, fit only on earlier years, use public dated inputs, open the code, write the report, say which AI agents you used.

```sh
python benchmark/score.py --selftest
python benchmark/score.py my_maps/                       # 2022.npy ... 2025.npy, optionally 2026 and 2027
cp -r benchmark/submissions/_template benchmark/submissions/my-model
# fill in meta.json and REPORT.md, upload the maps somewhere public
python benchmark/submission.py fill my-model my_maps/ --url-base https://github.com/you/repo/releases/download/v1
python benchmark/submission.py check my-model
```

Open a pull request with the folder `benchmark/submissions/my-model`. The pull request template has the checklist. Do not edit `LEADERBOARD.md` or `leaderboard.json`; a maintainer rebuilds them at merge.

Your code can live in your own repository or fork. If you want it in this one, add it under `contrib/my-model/` with a short README and the command that produces the maps. We merge contributed code that runs and that a reader can follow. We may ask you to split a large pull request.

To update a submission, change its folder in a new pull request. Git keeps the earlier version.

## What happens after you open the pull request

A workflow checks the metadata, downloads your maps, checks their hashes and re-scores them. A maintainer answers within 7 days and reads the report against the rules. A complete submission is merged within 14 days with the status `re-scored`, or `self-reported` if it links no maps. [GOVERNANCE.md](GOVERNANCE.md) has the details, and what happens when someone questions a row.

## Reproducing a submission

Pick a row, check out the commit in its `meta.json`, follow its "How to reproduce" section, and score your maps. Then open an issue with the template "New submission or reproduction": your scores, your hardware, and anything you had to change. If your four-year mean of cap5 is within half a point of theirs, the row becomes `reproduced` and the issue credits you.

## Changing code in this repository

- Each script starts with a header that says what it reads, what it writes and how to run it. Keep that true.
- Run `python benchmark/score.py --selftest` and `python benchmark/submission.py check` before a pull request that touches `benchmark/`. Run `node test/sectors.mjs` before one that touches `web/`.
- A change to the scorer, the truth files or the rules follows the versioning process in GOVERNANCE.md.
- Never commit anything under `data/`. `data/raw` holds IBAMA files with personal names and tax numbers.
- No secrets, keys or tokens in the repository. The pipeline needs none.

## Using AI agents

Do. [AGENTS.md](AGENTS.md) is written for them. Disclose the agent, the model and what a person checked, in `meta.json` and in the report.

## Licence of contributions

Code you contribute here is under the MIT licence. The submission folder you add is published under CC BY 4.0. Maps and code you host elsewhere keep the open licence you give them.

## Conduct

Criticise methods, numbers and code, never people. A report of a leak in someone's submission is a contribution to their work.
