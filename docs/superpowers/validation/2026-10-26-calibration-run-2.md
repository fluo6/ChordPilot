# Calibration run 2 — Waste of Time

Outcome: reviewed, unresolved. No inference change promoted and no original
session overwritten. Advance queue index 1 to 2; Ballad is next. This run targets
Waste of Time only; the other four recordings are cached regression checks.

## Diagnosis

The retained v3 result has 16 occurrences, 13 content groups and 45.83% named-role
coverage. Coverage is not accuracy. Its intro already spans 0–19.10 seconds;
the comparison's saved-grid display puts the following verse near bar 9.
Neither that grid nor the user's expected intro length entered inference.

Later fine intervals at 141.47–150.87 and 150.87–160.29 have native Verse labels
but maximum role scores only 0.450 and 0.442. The native Bridge at 188.52–200.28
has score 0.467. These are model/segmentation uncertainties, not convincing
semantic labels suppressed by a display bug. The accepted-role merge deliberately
leaves them separate. Re-estimating content families on different interval lengths
then changes the letter inventory. A/B/C is not stable evidence of melody here.

The same content group B occurs at 19.10–37.93 with strong Verse evidence and
122.62–141.47 with Instrumental evidence. Recurrence and function must remain
distinct; transferring a role solely because these share harmony is unjustified.

## Single-variable experiment

Hypothesis: use the author's 12-second peak window instead of the previous
6-second window, then run the unchanged downbeat refinement, content grouping,
occurrence-preserving role consensus and merge rules. Unlike run 1, this selects
boundaries from model activations; it does not merge adjacent equal native labels.

`tmp/calibrate-boundary-scale.py` uses cached author-native predictions and cached
audio-derived features/logits. It snapshots the exact experimental script and
blocks reference/session reads during inference. All five partitions, source
hashes and evidence coverage pass; retained v3 artifacts are unchanged. Frozen
Overjoyed annotation is read only after candidate generation for evaluation.

| Recording | Sections, before → candidate | Named duration, before → candidate |
|---|---:|---:|
| Waste of Time | 16 → 11 | 45.83% → 45.83% |
| I Love You 3000 | 14 → 9 | 55.95% → 55.91% |
| Ballad | 17 → 16 | 67.34% → 58.51% |
| Liang Bo | 28 → 25 | 62.53% → 64.29% |
| Overjoyed | 12 → 8 | 70.22% → 44.24% |

Waste's group inventory falls from 13 to 8 without an alphabet cap. Every
previously accepted role remains accepted over the same time span, but the
remaining 54.17% stays unknown. Fewer letters alone cannot establish improvement.
On the provisional Overjoyed reference, four of eleven boundaries disappear:
boundary F1 at 0.5 seconds falls from 1 to 0.7778; content-group F1 from 0.9991
to 0.5653. Full-duration role agreement falls from 0.7019 to 0.3904.

Rejected as a general replacement. Selecting this window for Waste by title
would be overfitting; it was not implemented. No additional threshold sweep,
manual answer, forced form, or unsupported label assignment was attempted.

## Research and remaining work

A focused search again found [section-tagged lyrics on Shazam](https://www.shazam.com/song/1669885342/waste-of-time),
but no independently verified full-recording timestamp map. Existing source
limitations in `docs/research/2026-10-25-waste-of-time-structure.md` still apply.
No retrieved text entered inference, and this run does not claim listening-based
musical certification or a new accuracy benchmark.

The evidence now argues against simply replacing one global boundary window
with another. Future work should investigate boundary decisions at multiple
scales with independent content evidence, and melody/vocal-aware recurrence.
Those are open research directions, not implemented fixes or reasons to extend
this five-song schedule. Repetition of the same rejected window/merge experiments
is not useful. App Detect remains the existing builtin detector.

## Verification and handoff

- 25 structure Python tests pass; no production code changed in this run.
- Retained v3 reproduces on all five cached songs with reference/session reads
  blocked; Overjoyed provisional metrics remain unchanged.
- Original hashes are checked against the last import manifests before advancing
  the queue; final evidence is `calibration-run-2/final-verification.json`.
- Listening comparison includes an explicitly rejected 12-second variant only
  for Waste; default stays v3. Browser verified 11 rows, Named roles convention,
  unchanged intro and clear rejection text. No new naming logic was added.
- The old review server was no longer running. Restarted the existing Express
  server on loopback 3318 outside network isolation; exec session 88272.
- Artifacts: `outputs/song-structure/calibration-run-2/`, including
  `boundary-scale-report.json`, `ablation.log`, `cached-regression.log`,
  `structure-tests.log`, candidate JSONs and `comparison.jpg`.
- Current browser tab 3 shows the rejected candidate for inspection. Reloading
  restores default v3. Queue continues on its existing schedule; no extension.
