# Representation stage 3 — final compact checkpoint

## Decision and delivered result

The authorized three-stage pass is finished. **No inference change is promoted.**
Richer representations produce reproducible recurrence evidence, but independent
exact-recording musical accuracy has not been established. The saved algorithm,
boundaries, roles, groups, original sessions and raw model provenance remain
unchanged. In particular, this is not a claim of 100% recognition.

The listening comparison now has an expandable **Experimental audio matches**
panel for each recording. It provides:

- Separate playback of either frozen fine passage, stopping at its end.
- All eight feature views plus the retained chroma/texture baseline, with pair
  distances and neighbor ranks. Distances are not calibrated across views.
- Filters for raw/centered cross-stream matches, baseline-group pairs with
  different retained roles, and every passage pair.
- Full evidence/provenance downloads. Matches remain research evidence, never
  new ABC labels. Unknown roles and existing section layouts are preserved.
- Per-song naming preferences saved across reloads on the review page. Product
  naming persistence already existed and its regression tests still pass.

URL: http://127.0.0.1:3318/overjoyed-benchmark/review/#liangbo

The original `review/manifest.json` remains byte-identical. Expanded presentation
data live in `review/representation-manifest.json`; `index.html` embeds those
data. This separation preserves the stage-1/2 integrity baseline and allows the
published historical verification commands to remain runnable.

## Verification and review

- 40 Python structure tests and 23 JavaScript naming/review tests passed.
- The retained v3 algorithm reproduced across all five cached recordings with
  reference/session reads blocked during inference. Its source hashes and
  retained prediction bytes are unchanged.
- All five representation comparisons recomputed exactly after the final page
  build. The capture verifier also passes after the refresh.
- All 27 protected files remain unchanged, including all five original sessions
  and the historical review manifest. All existing review variants are equal
  to the pre-stage-3 manifest; only separate evidence data were added.
- Browser checks cover all five recordings (1,299 pairs total), the empty-filter
  state, four visible evidence columns, nine feature rows, persistent naming and
  restoration to Named roles. Liang Bo playback visibly sought to 200.87 and
  286.22 seconds, and paused at 215.12 and 300.46 respectively. Browser media
  events are not a sample-accurate transport guarantee.
- No browser warnings/errors were observed. Screenshot and check record:
  `outputs/song-structure/representation-stages/stage-3-review.png` and
  `stage-3-browser-verification.json`. `git diff --check` passed with pre-existing
  line-ending warnings.
- Fresh-context whole-scope review: `/root/representation_final_review` found
  no Critical issues and one Important issue. The first refresh changed the
  protected manifest, breaking historical reproducibility. A new verifier
  reproduced the failure; splitting the expanded manifest fixed it. The new
  verifier and both historical verification commands then passed (RED → GREEN).
  Unrelated dirty files and earlier calibration algorithms were outside scope.

Deferred minor verifier hardening from review:

1. The capture verifier checks stream widths but trusts recorded stream names,
   column positions and timing summaries; capture tests/author-wrapper inspection
   establish the present layout, not a fully independent reconstruction there.
2. The capture verifier reports model weights unchanged based on the capture's
   pinned provenance rather than rehashing weights on every verification run.
   The actual capture pinned and hashed the checkpoint. No current corruption
   was found. These are limitations of the verifier, not accuracy evidence.

## Remaining work, not scheduled

- Establish independently annotated recurrence and function benchmarks for
  exact recordings, plus held-out songs. Annotations must remain evaluation-only;
  they must never become session corrections or inference inputs.
- Measure melody-sensitive recurrence versus shared harmony, including vocal
  versus instrumental versions, key changes, adjacent fragments and silence.
- Validate any hierarchy cut or replacement grouping rule on independent data
  before applying it. Cross-stream agreement and fewer labels alone are not
  acceptance criteria. The features do not resolve the remaining unknown roles.
- Promote only after that evidence supports a general improvement and cross-song
  regression checks pass. There is currently no supported original-session write.

Ruling: retain the current algorithm and expose evidence separately, as the
approved plan requires when independent support is absent. Cost: the user's
musical-recognition problems remain unresolved rather than receiving an
unsupported rewrite. No alphabet cap, fixed form, reference timestamps or
song-title inference branches were introduced.

## Handoff and schedule

Stage 3 started at 2026-10-26 17:26:48 UTC, more than 150 minutes after stage 2.
The queue is finalized by `tmp/finish-representation-stage3.py` after verification.
Delete `chordpilot-richer-audio-stages` at completion; record the tool-confirmed
deletion in the queue. Do not add a fourth stage or reopen the old calibration
schedule. Context compaction remains app-managed; this checkpoint is the saved
handoff. The local review server remains available for listening.

## Files and reproduction

- Generic review module: `scripts/testing/structure-representation-review.js`.
- Tests: `tests/js/structure-representation-review.test.js`.
- Generator: `tmp/build-overjoyed-review.py`.
- Presentation verifier: `tmp/verify-representation-review.py`.
- Reports/logs: `outputs/song-structure/representation-stages/stage-3-*`.

```powershell
$env:PYTHONPATH="$PWD/tmp/structure-neural-deps"
$env:OPENBLAS_NUM_THREADS='1'
$env:OMP_NUM_THREADS='1'
C:/Python39/python.exe -m unittest discover -s tests/python -p 'test_structure*.py'
node --test tests/js/song-structure.test.js tests/js/structure-representation-review.test.js
C:/Python39/python.exe tmp/verify-representation-capture.py
C:/Python39/python.exe tmp/evaluate-structure-representations.py --verify
C:/Python39/python.exe tmp/verify-representation-review.py
```

Schedule closure: the app tool confirmed `deleteStatus: deleted` for
`chordpilot-richer-audio-stages`; the confirmation time is recorded in the queue.
