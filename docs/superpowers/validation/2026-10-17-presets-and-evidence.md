# Preset and spectral-evidence follow-up

The five available UI presets were compared on 83 selected Local Study windows from Gravity, Hero, Overjoyed, September and Virtual Insanity, using the locally prepared recordings and Demucs stems. `scripts/testing/preset-reference-benchmark.py --local-only` holds each fixture's key and other non-preset settings fixed while applying the six preset controls. A separate `--evidence-ablation --local-only` run holds General's timing and stability settings fixed and varies only tail reduction (0 or 20%) and overtone weighting (0 or 50%). Re-run commands and media requirements are in [the reference guide](reference-runs.md). The local JSON reports are under ignored `.chordpilot-data/benchmarks/reference-reports/presets-local-current.json` and `evidence-ablation-current.json`.

The following numbers are **correct root / correct function / exact symbol** on selected windows. Local Study does not apply timeline chord grid or stability, so equal local rows do not show that the presets behave equally across an arrangement.

| Reference | General | Clean Guitar | Piano | Reverb/FX | Fast Changes |
| --- | ---: | ---: | ---: | ---: | ---: |
| Gravity (16) | 12 / 8 / 1 | 12 / 10 / 3 | 12 / 10 / 3 | 12 / 10 / 3 | 12 / 8 / 1 |
| Hero (20) | 17 / 11 / 9 | 17 / 12 / 10 | 17 / 12 / 10 | 16 / 12 / 10 | 17 / 11 / 9 |
| Overjoyed (21) | 19 / 12 / 2 | 19 / 13 / 2 | 19 / 13 / 2 | 19 / 12 / 3 | 19 / 12 / 2 |
| September (13) | 5 / 1 / 0 | 4 / 1 / 0 | 4 / 1 / 0 | 4 / 1 / 0 | 5 / 1 / 0 |
| Virtual Insanity (13) | 7 / 4 / 1 | 8 / 3 / 0 | 8 / 3 / 0 | 8 / 3 / 0 | 7 / 4 / 1 |

In the independent evidence sweep, 20% tail reduction raises selected function matches from 8 to 10 on Gravity and 11 to 12 on Hero, but reduces September root matches from 5 to 4 and Virtual Insanity's exact match from 1 to 0. At zero tail reduction, 50% overtone weighting adds one exact match on Overjoyed and one function/exact match on Virtual Insanity; it leaves the other three references unchanged on these counts. With 20% tail reduction, overtone weighting adds one exact match on Overjoyed and otherwise leaves these aggregate counts unchanged. The per-window JSON reveals which passages changed. These are chord-label comparisons, not a physical measurement that a ringing tone was removed correctly or a partial was distinguished from an independently played note.

No preset wins consistently, and neither spectral control has a safe global increase based on these references. Keep the current General default and the existing selectable presets. Full-timeline comparisons are still needed for grid/stability claims, and song-held-out, independently checked chord and note-onset labels are needed for accuracy claims. The benchmark run used the corrected candidate gate from the second vocabulary batch; its saved `local-study-v27` stamp preceded the cache-only version increment to v28, which did not alter the scores.
