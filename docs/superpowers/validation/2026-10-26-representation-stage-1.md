# Representation stage 1 — compact checkpoint

## Outcome

Captured all four native layer-10 MuQ/MusicFM streams for all five recordings.
Artifacts: `outputs/song-structure/representation-stages/features/`.
Each float32 cache has 4096 columns: short MusicFM, short MuQ, long MusicFM,
long MuQ (1024 each), nominal 25 Hz. The author wrapper trims to its shortest
stream; no interpolation, normalization or extrapolation was introduced.

| Recording | Frames | Head logits bit-identical | Uncovered tail seconds |
|---|---:|---|---:|
| overjoyed | 5562 | True | 0.00000 |
| i-love-you-3000 | 5243 | True | 0.00267 |
| waste-of-time | 6307 | True | 0.00000 |
| ballad | 5473 | True | 0.00000 |
| liangbo | 10079 | True | 0.00808 |

The model's decoded native predictions match their previous results on all five
recordings. Feature arrays round-trip exactly. The verifier checks source audio,
code and cache hashes, shapes, values, stream layout and temporal coverage.
All 27 protected files, including five original sessions and the retained fine
predictions, are unchanged. No model weights, boundaries, grouping, roles,
application behavior or listening comparison changed.

## Validation and repaired issue

35 Python structure tests and 20 JavaScript naming tests passed. The initial
capture verifier incorrectly required every head logit to be finite, while the
author masks 120 unsupported labels with negative infinity. Overjoyed's captured
logits were already bit-identical to the prior cache. A regression test exposed
the missing mask-aware comparison; the fix permits identical negative-infinity
masks and rejects NaN, positive infinity and changed masks. Extraction was then
rerun from audio, preserving the first failed log and script for audit.

## Interpretation limits

These are general musical SSL representations, not verified melody embeddings.
Capturing valid features does not establish grouping or role accuracy. Native
25 Hz frame bins describe model timing; no claim of sample-accurate semantic
alignment is made. Independent exact-recording musical evaluation is still absent.

## Next stage (scheduled, not executed here)

Read the queue and the three-stage plan. Compare recurrence on frozen fine
boundaries across all five songs, beginning with Overjoyed. Fix the procedure
before inspecting desired labels; retain separate stream ablations and compare
against chroma/texture. No tuning to provisional reference labels, model-role
agreement, supplied answers, song names or desired section counts. Keep function
separate from recurrence. Promote nothing without supporting evaluation.

The old five-song schedule remains closed. The new automation
`chordpilot-richer-audio-stages` schedules stages 2 and 3 at 150-minute intervals.
Delete it after stage 3 or a terminal blocker. Compact checkpoints substitute
for a forced context-compaction operation, which is unavailable to this agent.

## Reproduction

- `C:/Python39/python.exe tmp/capture-structure-representations.py overjoyed i-love-you-3000 waste-of-time ballad liangbo`
- `C:/Python39/python.exe tmp/verify-representation-capture.py`
- `C:/Python39/python.exe -m unittest discover -s tests/python -p "test_structure*.py"`
- `node --test tests/js/song-structure.test.js`

Use `stage-1-verification.json` and each feature report for full provenance.
