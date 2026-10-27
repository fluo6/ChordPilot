# Calibration run 5 — Overjoyed and bounded-pass closeout

Started early at the user's request. Outcome: regression passed, musical accuracy
unresolved. No new inference changes, threshold tuning, promotion or original
session overwrite. This is the fifth and final song; stop the existing automation.

## Overjoyed result

The retained algorithm and frozen weak-self-repeat candidate both produce 12
sections and five coarse content groups: A B C B C D A B C D D E. The intro
remains 0–11.72 seconds. All boundaries, group assignments and pointwise roles
are unchanged. The candidate does not merge the adjacent final Chorus occurrences.

Named-role coverage is 70.2173%; 66.2567 seconds (29.7827%) remain unclassified.
Five coarse unknown spans are 34.84–46.40, 69.52–81.08, 104.19–115.73,
138.87–150.43 and 202.43–222.4667 seconds. These are model abstentions, not
display omissions. The three recurring C spans have native Verse probabilities
0.728, 0.379 and 0.671; lowering acceptance would label them Verse, whereas the
provisional reference calls them Pre-chorus. The instrumental-like passage has
native Instrumental score 0.400; the ending has native Outro score 0.659 followed
by Silence. Propagating Intro to the recurring A passage would confuse content
recurrence with function. No such transfer or forced reference label was applied.

Evaluation after inference still matches all 11 provisional boundaries within
0.5 seconds, with content-group F1 0.999126. Role agreement over the full duration
is 70.1903%, versus 99.9616% on the covered portion. The latter excludes unknown
duration and must not be presented as overall accuracy. This development reference
was inferred from research and a saved grid, not independently annotated by listening.
Its tolerance is not a measured uncertainty bound; exact recording-level accuracy
and generalization remain unestablished. No 100% claim is supported.

## Fresh verification

`tmp/audit-overjoyed-final.py` runs 32 Python structure tests, 20 JavaScript
structure/naming tests, five retained-cache regressions and five frozen candidate
reproductions. All pass. Retained v3 JSONs reproduce byte-for-byte; all candidate
JSONs equal run 4. Inference forbids reference/session reads. Evaluation occurs
after generation. Partitions, source hashes, role evidence and unchanged roles
validate. Prior-run artifacts and all five original sessions are hash-verified
unchanged. This is cached decoder regression, not fresh model inference or a
listening accuracy audit. No weights or decoder logic changed in this run.

Artifacts: `outputs/song-structure/calibration-run-5/`, with raw candidates,
reproduction code, test logs, diagnostics, screenshot and final verification.
The listening comparison retains v3 as default and reports final-pass limitations.
Queue advancement to index 5 is conditional on final verification.

## Five-song disposition and remaining work

| Song | Result of this pass |
|---|---|
| I Love You 3000 | Same-native-role merge rejected; fragmentation and semantics unresolved. |
| Waste of Time | Longer boundary window rejected by cross-song regression; roles/grouping unresolved. |
| Ballad | Weak-self-repeat candidate 17→12 sections, unchanged roles; not musically certified or promoted. |
| Liang Bo | Same frozen candidate 28→25 sections; 151.08 seconds unclassified and harmonic aliasing unresolved. |
| Overjoyed | Unchanged 12 sections; provisional regression passes, 66.26 seconds unclassified. |

The application naming preference was completed in run 1 and is persisted and
tested: roles or letters, mixing opt-in. No alphabet cap was added. No original
session was overwritten during this five-song pass because no new inference
change had sufficient musical validation. The headless SongFormer pipeline remains
experimental; the app's Detect button still uses its existing builtin detector.

Future work, outside this finished schedule: independently annotate the exact
recordings with ambiguity recorded; evaluate melody/vocal-aware recurrence so
shared harmony does not imply identical musical sections; improve and calibrate
functional predictions; then validate/promote a general model and integrate it
into Detect before importing supported results. Keep boundaries, content identity,
functional roles and presentation separate in the data model. No additional runs
or indefinite tuning are authorized by this bounded pass.

Closeout confirmed: queue index 5; automation tool returned deleteStatus=deleted.
No remaining scheduled calibration runs.
