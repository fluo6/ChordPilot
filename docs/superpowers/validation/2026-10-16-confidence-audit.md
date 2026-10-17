# Initial confidence audit

`scripts/testing/chord-reference-benchmark.py` now saves each Local Study chord score and a descriptive four-band audit. The 83 selected reference windows from Hero, Virtual Insanity, Gravity, Overjoyed and September retain the previous root/function/exact counts. The windows are manually sampled and often approximately aligned, so these figures diagnose high-scored mistakes; they do not calibrate a probability of correctness.

| Displayed heuristic score | Windows | Wrong roots | Correct function | Exact symbol |
| --- | ---: | ---: | ---: | ---: |
| Below 50% | 3 | 0 | 1 | 0 |
| 50–74% | 30 | 11 | 11 | 1 |
| 75–89% | 44 | 10 | 24 | 12 |
| 90% or more | 6 | 2 | 3 | 2 |

Of the 50 windows scored at least 75%, **12 have the wrong root** against the selected labels. This is strong evidence that the badge should not be read as a 75%+ chance of a correct chord. High-scored wrong roots occur in every reference song (Gravity 3, Hero 2, Overjoyed 1, September 2, Virtual Insanity 4). A genuine calibration change needs more independently verified labels, preferably split by song and including boundaries, attacks and distinct instruments. Do not rescale to a probability using these same curated windows.

Reports and per-window evidence are in ignored `.chordpilot-data/benchmarks/reference-reports/*-v27-confidence.json`; the [reference guide](reference-runs.md) gives the command and required media. The product should continue to call the number a heuristic confidence/score, retain alternatives, and avoid treating a high number as verification.
