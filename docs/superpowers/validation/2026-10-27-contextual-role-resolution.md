# Contextual role candidate checkpoint

Status: complete as a development experiment and listening-page update. Waste of Time now matches the user's supplied 13-role sequence through general audio-derived inference. This is development-sequence agreement, not independent musical accuracy. Production detector and original sessions remain unchanged. No new automation, branch, commit or annotation UI.

## User's clarified criterion

Section identity should primarily reflect lead-vocal melody and rhythmic pattern, supported by chord progression and conventional functional interpretation. Raw harmonic or texture similarity alone is insufficient. This candidate uses full-mix MuQ/MusicFM embeddings, so it does not explicitly isolate or validate vocal melody or chord identity. Do not describe it as a vocal-melody detector. Further representation work must address that gap.

## Implemented change

scripts/testing/structure-contextual-roles.py preserves native boundaries and original evidence. It keeps targets with a posterior majority unchanged. Weak vocal targets may borrow role evidence from a majority-supported donor when all eight views agree on a unique reciprocal match. A second route compares two-occurrence sequences and requires a separately repeated, strongly classified successor, non-overlapping windows, and better ordered than swapped similarity. No fixed Verse/Chorus order is imposed. Both routes use equal original posterior pooling; conflicting roles abstain. No cascading or manually supplied sequence enters inference.

The earlier cross-class margin veto was removed. Comparing the winning margin before versus after changing classes was an unvalidated requirement, not a calibrated correctness test. The new model still reports its scores and limitations; it does not turn its pooled winner into a calibrated probability.

## Results

Waste of Time changes relative to native:

- 141.36565462618503–160.20640825633026: Verse → Pre-chorus, via occurrence 3 and the repeated following chorus. All eight two-occurrence views and successor matches agree. Pooled pre-chorus score 0.44791794, margin 0.09447662.
- 199.56798271930876–222.48889955598224: Chorus → Verse, via native verse occurrence 6. All eight direct reciprocal views agree. Pooled verse score 0.49225990, margin 0.22978640.

Displayed sequence:

Intro → Verse → Pre-chorus → Chorus → Chorus → Verse → Instrumental → Pre-chorus → Chorus → Chorus → Verse → Outro → Unclassified

No changes to other native role sequences: Overjoyed 9 occurrences, I Love You 3000 10, Ballad 16, Liang Bo 29. Waste of Time retains all 13 native intervals. These counts are not accuracy scores; fragmentation and semantic issues in other songs remain unresolved. Existing v3, native output, and previous conservative candidate remain available unchanged.

## Provenance and evaluation separation

- Old native feature/posterior caches reproduced exactly before hashing into outputs/song-structure/contextual-role-candidate/inputs.json.
- tmp/evaluate-contextual-roles.py checks pinned cache/native/model provenance and all 27 historical protected files. During inference, filesystem audit rejects docs, reference annotations, feedback, review snapshots and original sessions.
- Expected role sequence appears only in tmp/verify-contextual-review.py, which evaluates completed outputs. Result stored as development-feedback-evaluation.json with independent_accuracy_established=false.
- The development song and user feedback informed this hypothesis; this is not held-out validation.
- Original SongFormer, v3 and v1 candidate artifacts remain untouched. Separate v2 JSON records donors, proposals, scores and exact native labels.

## Verification

- 13 new synthetic tests passed, including direct/context disambiguation, uncertain/conflicting/non-repeating anchors, route disagreement, swapped order, ties, confident/non-vocal preservation, no cascading, no overlapping/wrapped context, invalid inputs and singleton silence.
- Full relevant suite: 62 Python structure tests + 23 JavaScript naming/review tests = 85 passed.
- Exact contextual recomputation passed for all five songs. All native timings and majority-supported original roles are asserted unchanged.
- All three presentation verifiers passed. Old variants and historical manifests preserved. Current page shows the v2 candidate through `method=contextual-recurrence`.
- Browser checked all five candidates and row counts, Waste of Time's full expected display, no console warnings/errors. Final tab is Waste of Time with Named roles and new candidate selected; screenshot and browser-verification.json saved beside reports.
- Fresh read-only reviewer found no blocking correctness, leakage or provenance issues. It confirmed full-mix similarity is not independent melody/chord verification. No required fixes.
- git diff --check passed with existing CRLF warnings. Unrelated workspace changes preserved.

## Reproduce and inspect

```powershell
$env:PYTHONPATH="$PWD/tmp/structure-neural-deps"
C:/Python39/python.exe -m unittest discover -s tests/python -p 'test_structure*.py'
node --test tests/js/song-structure.test.js tests/js/structure-representation-review.test.js
C:/Python39/python.exe tmp/evaluate-contextual-roles.py --verify
C:/Python39/python.exe tmp/verify-contextual-review.py
C:/Python39/python.exe tmp/verify-native-recurrence-review.py
C:/Python39/python.exe tmp/verify-representation-review.py
```

Do not rerun `--pin`; pins already exist and are intentionally protected against silent replacement.

Review: http://127.0.0.1:3318/overjoyed-benchmark/review/?method=contextual-recurrence#waste-of-time

Research consulted for context: [SongFormer](https://arxiv.org/abs/2510.02797) and [structural function analysis](https://arxiv.org/abs/2205.14700). These papers do not validate this particular transfer heuristic; its evidence here is the recorded experiment and synthetic invariants.
