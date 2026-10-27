# Representation stage 2 — compact checkpoint

## Outcome

Compared all five recordings on their frozen fine boundaries, starting with
Overjoyed. Eight feature views (four streams, each raw and recording-centered)
were compared with the retained chroma/texture baseline. Every view includes a
distance matrix, neighbor ranks, reciprocal-neighbor pairs and a complete-link
hierarchy. No hierarchy was cut into a chosen number of sections. No new roles,
boundaries, ABC partition or original-session writes were introduced.

The procedure was written before computing comparisons in
`2026-10-26-representation-stage-2-protocol.md`; its hash is in every report.
No provisional reference or independently annotated answer was read. An audit
hook blocks reference/session reads during the calculation. Existing group and
role metadata are joined only after feature distances have been computed.

| Recording | Fine occurrences | Baseline fine groups | Nearest-match changes versus baseline, across eight views | Unanimous reciprocal pairs, raw / centered |
|---|---:|---:|---:|---:|
| Overjoyed | 19 | 9 | 5–9 / 19 | 3 / 4 |
| I Love You 3000 | 17 | 13 | 8–12 / 17 | 3 / 3 |
| Waste of Time | 20 | 16 | 9–12 / 20 | 4 / 4 |
| Ballad | 17 | 9 | 2–4 / 17 | 5 / 5 |
| Liang Bo | 37 | 17 | 20–22 / 37 | 5 / 5 |

These are changes in representation and agreement, **not accuracy scores**.
Fine groups are not the coarser groups displayed in the existing review.

## Findings and unresolved musical questions

- **Overjoyed:** all four centered streams reciprocally match the opening
  0–11.72 seconds with 104.19–115.73, the 11.72–23.28 verse fragment with
  46.40–57.95, the unclassified 34.84–46.40 passage with 69.52–81.08, and the
  81.08–92.64 chorus fragment with 150.43–161.98. These agree with retained
  fine groups. The verse-fragment match is not unanimous in the raw views,
  so normalization matters. This supports inspecting recurrence; it does not
  resolve unknown functions or certify the full form.
- **I Love You 3000:** the chorus fragments at 66.33–87.71 and 130.33–151.69
  agree across all views. The verse occurrence at 23.69 and chorus occurrence
  at 66.33 remain close despite different retained roles: ranks 1/2 in all
  four centered streams. Richer features have not removed all suspected
  shared-material ambiguity. Different roles do not themselves prove an error.
- **Waste of Time:** the retained same-group verse/instrumental pairs at
  19.10/122.62 and 28.50/132.04 are mutual nearest neighbors in the baseline;
  feature views generally rank them farther apart. The 59.09–77.92 and
  160.29–179.11 chorus fragments are reciprocal across all streams. The intro
  and all other boundaries were frozen, so this experiment cannot validate
  or repair boundary lengths.
- **Ballad:** the baseline puts the verse fragment at 25.76 and chorus fragment
  at 76.96 in one fine group. The centered views rank that pair 5th–8th from
  either direction, versus 3rd in the baseline. However, all five unanimous
  reciprocal pairs are adjacent fragments. Nearest-neighbor agreement is
  therefore insufficient to recover non-adjacent repeated families.
- **Liang Bo:** 20–22 of 37 nearest-match choices differ from the baseline.
  The 200.87–215.12 and 286.22–300.46 chorus fragments reciprocally match in
  all streams despite different baseline groups. Conversely, an intro/verse
  pair at 1.78/58.71 remains close in several streams. Opening/ending padding
  also match across all streams. Neither raw similarity nor cross-stream
  agreement is a safe musical-section rule by itself.

All 1,299 occurrence pairs are retained in the JSON reports. Of 85 baseline
same-group pairs, 27 have different accepted roles. Those flags are evaluation
questions only; a role difference must never veto real recurrence by itself.
The four streams are correlated outputs, not four independent annotations.

## Verification

- Five-song recomputation reproduced every report and distance matrix exactly.
- All 27 protected files are unchanged, including five original sessions,
  retained predictions, audio, logits, the old queue and the listening manifest.
- 40 Python structure tests and 20 JavaScript naming tests passed. New tests
  cover fractional frame weighting, tail coverage, sequence order, zero bins,
  mean subtraction, duration penalty, ties, hierarchy and invalid inputs.
- The initial new-test run failed because the helper did not exist (RED).
  After implementation, system SciPy could not access its `.libs` directory.
  The existing workspace dependency copy resolved the import; no installation
  or permission change was needed. GREEN uses the documented PYTHONPATH below.
- `git diff --check` passed with existing line-ending warnings.
- Features cover at least 99.866% of every I Love You 3000 occurrence and
  99.568% of every Liang Bo occurrence; other recordings have full coverage
  within floating-point tolerance. Only already-recorded sub-frame tails are
  absent. Feature coverage is not musical accuracy.

## Artifacts and reproduction

- `outputs/song-structure/representation-stages/recurrence/<slug>.json`: every
  pair, eight ablations and baseline, hierarchy, source hashes and limitations.
- Corresponding `.npz`: nine distance matrices.
- `stage-2-comparison.json`, `stage-2-verification.json`: all-song manifests.
- `stage-2-{comparison,recompute,structure-tests,naming-tests}.log`: run evidence.
- `scripts/testing/structure-representation-recurrence.py`: generic calculation.
- `tmp/evaluate-structure-representations.py`: input checks, evaluation-only
  metadata join and exact-recomputation mode.

PowerShell reproduction:

```powershell
$env:OPENBLAS_NUM_THREADS='1'
$env:OMP_NUM_THREADS='1'
C:/Python39/python.exe tmp/evaluate-structure-representations.py --verify
$env:PYTHONPATH="$PWD/tmp/structure-neural-deps"
C:/Python39/python.exe -m unittest discover -s tests/python -p 'test_structure*.py'
node --test tests/js/song-structure.test.js
```

## Stage 3 handoff

Independent exact-recording musical labels are still missing, so no supported
promotion candidate has been established. Do not convert the neighbor pairs
into asserted ABC labels or choose a threshold from these five songs. Preserve
the existing inference and sessions unless new independent evidence justifies
a general change. Refresh the listening review with clearly experimental pair
and distance evidence, retaining one naming convention per song and the current
persisted preference. Keep unknown roles explicit.

Stage 3 is the final scheduled stage. Read the queue's `next_not_before`; if a
wake is slightly early, wait for that time before starting, in waits no longer
than 60 seconds. Stage 2 began with the first measured tool time at 14:56:33 UTC;
the running ledger was written at 15:00:16 UTC after protocol/test setup.
The minimum next start is 17:26:33 UTC (04:26:33 Sydney on October 27).
Do not extend the schedule. Perform the final whole-scope review, save a compact
checkpoint and delete `chordpilot-richer-audio-stages` after stage 3.

Ruling: a full hierarchy and pair evidence are the stage-2 deliverable, rather
than an arbitrary learned-feature grouping cutoff. Cost: no new deployable
partition yet. This was specified before comparison, not selected afterward.
Actual context compaction remains host-managed.
