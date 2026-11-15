# Governance

Prenúncio is a volunteer project. This page says who decides what, in the open, so that nobody has to guess.

## Who decides

The maintainers decide, in public issues and pull requests, with the reason written down. Today the project has one maintainer, the owner of this repository. We want more: anyone with a reproduced submission, or who has reviewed several, can be invited by the existing maintainers.

Anyone can propose a change to the rules, the scores or this page by opening an issue. A proposal stays open for comment for at least 14 days before a decision. The maintainers follow the agreement in the thread when there is one, and explain themselves when they do not.

Maintainers submit under the same rules as everyone. Their submissions go through a pull request, the same checks and the same status labels.

## How a submission is reviewed

1. The workflow runs on the pull request: scorer self-test, metadata and report check, download of the linked maps, sha256 check, re-score. For pull requests from forks it executes code from the main branch only.
2. A maintainer replies within 7 days.
3. The maintainer reads the report against the rules in [benchmark/README.md](benchmark/README.md): the dates of every input, the fitting cutoff, the code link and commit, the agent disclosure. Questions go in the pull request.
4. A complete submission is merged within 14 days of its last change. At merge the maintainer adds `review.json` with the status, rebuilds the leaderboard with `python benchmark/leaderboard.py`, and for a live forecast records the registration date and attaches a copy of the map to a release of this repository.

Reproduction has no deadline. It happens when a maintainer or a volunteer has the time and the hardware.

## What gets a row

A submission gets a row when the check passes, the report has every section, the code is public at the stated commit under an open-source licence, the inputs are public and dated, and no rule is known to be broken. The score plays no part. Rows below the baseline are welcome.

A row is refused or removed for a broken rule, for code or maps that are no longer reachable, or for a report that does not let a reader repeat the work.

## Disputes and suspected leakage

Anyone who suspects a leak or an error in a submission opens an issue that names the submission and gives the evidence. Our own submissions are fair game.

1. The row gets the flag `disputed` and a link to the issue.
2. The authors have 14 days to answer.
3. The maintainers decide in the issue and write why. The possible outcomes are that the flag is lifted, that the authors fix the problem and resubmit, or that the row is withdrawn.
4. A withdrawn submission leaves the ranking. Its folder stays in the repository with the reason, because a documented leak teaches the next person.

An honest mistake costs nothing beyond the correction. When the disputed submission belongs to a maintainer, another maintainer decides. While the project has a single maintainer, the issue stays open for public comment for 14 days and the decision cites the thread.

For past years no review can prove the absence of a leak. The live track exists for that: a forecast registered before the outcome cannot have seen it.

## How the benchmark changes

The benchmark has a version, now 1.0. It covers the grid, the truth files, the candidate rule and the score definitions.

- A change that can move any score raises the version and follows the 14-day proposal process. A bug fix that moves no score does not.
- Old scores are kept. Every `scores.json` records its version, and the leaderboard of each past version is saved under `benchmark/archive/<version>/`.
- When the maintainers hold a submission's maps they re-score them under the new version. Submissions they cannot re-score are listed apart until their authors do.
- Planned changes: the full PRODES 2026 map replaces the priority-scene file when INPE publishes it, and PRODES year 2027 is added when it exists, at which point the registered live forecasts are scored.

## The model on the site

The forecast on prenuncio.com is the best model the maintainers can run and stand behind. A submission that beats it on the backtest and has been reproduced is a candidate to replace it, and its authors are credited on the site. The maintainers decide in a public issue.
