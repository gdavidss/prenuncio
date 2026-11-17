# Governance

Prenúncio is a volunteer project. This page says who decides what.

## Who decides

The maintainers decide in public issues and pull requests, with the reason written down. Today there is one maintainer, the owner of this repository. Anyone with a reproduced submission, or who has reviewed several, can be invited to join.

Anyone can propose a change to the rules, the scores or this page by opening an issue. A proposal stays open for comment for at least 14 days before a decision. Maintainers submit under the same rules, checks and statuses as everyone.

## How a submission is reviewed

1. The workflow runs on the pull request. It validates the metadata and the report, downloads the linked maps, checks each sha256 and re-scores. For pull requests from forks it executes code from the main branch only.
2. A maintainer replies within 7 days and reads the report against the [rules](benchmark/README.md): one model, the dates of every input, the fitting cutoff, the code link and commit, the agent disclosure.
3. A complete submission is merged within 14 days of its last change. At merge the maintainer adds `review.json` with the status and rebuilds the leaderboard with `python benchmark/leaderboard.py`. For a live forecast the maintainer records the registration date and keeps a copy of the map in a release of this repository.

A submission gets a row when the check passes, the code is public at the stated commit under an open-source licence, the inputs are public and dated, and no rule is known to be broken. The score plays no part. A row is refused or removed for a broken rule, for code or maps that are no longer reachable, or for a report that does not let a reader repeat the work.

Reproduction has no deadline. It happens when someone has the time and the hardware.

## Disputes and suspected leakage

Anyone who suspects a leak or an error opens an issue that names the submission and gives the evidence. Our own submissions are fair game.

1. The row is marked `disputed` and links the issue.
2. The authors have 14 days to answer.
3. The maintainers decide in the issue and write why. Either the mark is lifted, or the authors fix the problem and resubmit, or the row is withdrawn.
4. A withdrawn submission leaves the ranking. Its folder stays with the reason, because a documented leak teaches the next person.

An honest mistake costs nothing beyond the correction. When the disputed submission belongs to a maintainer, another maintainer decides. While there is a single maintainer, the issue stays open for public comment for 14 days and the decision cites the thread.

No review can prove that a backtest has no leak. A live forecast, registered before the outcome exists, cannot have seen it.

## How the benchmark changes

The benchmark has a version, now 1.0. It covers the grid, the truth files, the candidate rule and the score definitions.

- A change that can move any score raises the version and follows the 14-day proposal process. A bug fix that moves no score does not.
- Old scores are kept. Every `scores.json` records its version, and the leaderboard of each past version is saved under `benchmark/archive/<version>/`.
- When the maintainers hold a submission's maps they re-score them under the new version. Submissions they cannot re-score are listed apart until their authors do.
- Two changes are planned. The full PRODES 2026 map replaces the priority-scene file when INPE publishes it, and PRODES year 2027 is added when it exists, at which point the live forecasts are scored.

## The model on the site

The forecast on prenuncio.com is the best model the maintainers can run and stand behind. A submission that beats it on the backtest and has been reproduced is a candidate to replace it, with its authors credited on the site. The maintainers decide in a public issue.
